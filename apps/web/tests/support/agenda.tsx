import type { PlatformServices } from '@mynet/platform'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactNode } from 'react'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { DESTINATIONS } from '../../src/app/navigation.js'
import { aSession, testServices, WithServices, type TestSession } from './services.js'

/**
 * A rendered Agenda, for the 005 component tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Wrapped in a real router and the real active-conference provider**, not stubbed context.
 * Agenda's contract is with the one active-conference source above the router (FR-113), and
 * from 005 it also owns a nested child route for the session detail panel (FR-198). A harness
 * that bypassed either would not notice if that wiring broke — which is the whole reason the
 * 002 test made the same choice.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Two sessions on day one and one on day two, so "today" and "the whole programme" differ. */
export const MORNING = aSession({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Opening Keynote',
  summary: 'How the conference thinks about the year ahead.',
  startsAt: '2026-09-14T07:00:00.000Z', // 09:00 Madrid
  endsAt: '2026-09-14T08:00:00.000Z',
  track: { id: 't1', name: 'Keynote', colorToken: 'track-keynote' },
})

export const AFTERNOON = aSession({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Open Studio',
  startsAt: '2026-09-14T12:00:00.000Z', // 14:00 Madrid
  endsAt: '2026-09-14T13:00:00.000Z',
  // A session with no listed speaker — FR-201's case, and it must not be a fixture accident.
  speakers: [],
})

export const NEXT_DAY = aSession({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Roadmaps That Survive Contact',
  startsAt: '2026-09-15T07:30:00.000Z', // 09:30 Madrid, day two
  endsAt: '2026-09-15T08:30:00.000Z',
})

export const PROGRAMME = [MORNING, AFTERNOON, NEXT_DAY]

export interface AgendaHarness {
  readonly sessions?: TestSession[]
  /** Session ids already committed to when the screen loads (saves, unless listed in `places`). */
  readonly saved?: string[]
  /**
   * T196 (014 tranche 2) — the subset of `saved` that are held PLACES rather than saves: those
   * rows carry `commitment: 'place'` on the one discriminated list (R13). Ids here must also be
   * in `saved`, because the union is one set.
   */
  readonly places?: string[]
  /**
   * T076 (014) — session ids the attendee has committed to and **not yet looked at since they
   * changed** (FR-1030). A subset of `saved` in practice: the marker is per commitment, and
   * there is no marker on a session nobody committed to.
   */
  readonly changed?: string[]
  /**
   * T209 (014 tranche 2) — what the live `places` read answers. An `Error` makes it fail, which
   * the panel renders as the figure being OMITTED (FR-1070b). Defaults to failing, so a test
   * that never mentions places renders no figure rather than an invented one.
   */
  readonly placesAvailability?: { remaining: number; open: boolean } | Error
  readonly overrides?: Partial<PlatformServices['repositories']>
  readonly devices?: Partial<PlatformServices['devices']>
  /**
   * Registry members outside `repositories` — today, `freshness`, which is how a test says
   * "this content came from the cache, retrieved at…" without standing up a real cache.
   */
  readonly services?: Partial<PlatformServices>
  /** The address to start at — `/agenda` or `/agenda/<sessionId>`. */
  readonly at?: string
}

/**
 * A commitment repository over an in-memory set, recording what it was asked to do.
 *
 * Real enough that the screen's behaviour is the screen's rather than the double's: the four
 * writes actually change what `listSaved` returns, so a component that never re-reads is
 * caught rather than accommodated. T196 renamed it from `savedSessionsDouble` with the
 * repository it doubles: the set carries held places as well as saves.
 */
export const commitmentsDouble = (
  initial: string[] = [],
  /**
   * T076 (014) — the committed sessions this attendee has not yet looked at since they changed
   * (FR-1030). Empty by default, so every existing test renders the rows it always did.
   */
  changed: string[] = [],
  /** T196 — the subset of `initial` held as PLACES; their rows carry `commitment: 'place'`. */
  places: string[] = [],
  /** T209 — what the live `places` read answers; an Error means the figure is omitted. */
  placesAvailability: { remaining: number; open: boolean } | Error = new Error(
    'no places availability configured in this test',
  ),
) => {
  const set = new Set(initial)
  const held = new Set(places)
  const unviewed = new Set(changed)
  const calls: Array<{
    op: 'save' | 'unsave' | 'viewed' | 'enrol' | 'release' | 'places'
    sessionId: string
  }> = []
  let failWith: Error | null = null

  return {
    calls,
    set,
    held,
    unviewed,
    /** Makes the next and every subsequent write fail, for the refusal paths. */
    failWrites: (error: Error | null) => {
      failWith = error
    },
    repository: {
      listSaved: async () =>
        [...set].map((sessionId) => ({
          sessionId,
          changedSinceViewed: unviewed.has(sessionId),
          // One list, discriminated (R13): a held place is a row of this same read, which is
          // exactly how the union reaches every consumer with no second request.
          commitment: (held.has(sessionId) ? 'place' : 'saved') as 'saved' | 'place',
        })),
      save: async (_eventId: string, sessionId: string) => {
        if (failWith) throw failWith
        calls.push({ op: 'save', sessionId })
        set.add(sessionId)
      },
      unsave: async (_eventId: string, sessionId: string) => {
        if (failWith) throw failWith
        calls.push({ op: 'unsave', sessionId })
        set.delete(sessionId)
      },
      /**
       * Real enough to be caught: it actually clears the marker, so a component that renders a
       * marker for a session the attendee has just opened fails rather than being accommodated.
       *
       * **Deliberately not affected by `failWrites`.** A failed `markViewed` is silent by design
       * (`useCommitments`), so making it fail here would assert nothing — the tests that care
       * about refusal wording are about the four commitment writes.
       */
      markViewed: async (_eventId: string, sessionId: string) => {
        calls.push({ op: 'viewed', sessionId })
        unviewed.delete(sessionId)
      },
      // T196 (014 tranche 2) — the enrolment writes, as real as `save`/`unsave` above: they
      // change what `listSaved` returns, so the exclusivity property — an optional session is
      // committed to by enrolling, never by saving — is observable in `calls` rather than
      // assumed.
      enrol: async (_eventId: string, sessionId: string) => {
        if (failWith) throw failWith
        calls.push({ op: 'enrol', sessionId })
        set.add(sessionId)
        held.add(sessionId)
      },
      release: async (_eventId: string, sessionId: string) => {
        if (failWith) throw failWith
        calls.push({ op: 'release', sessionId })
        set.delete(sessionId)
        held.delete(sessionId)
      },
      places: async (_eventId: string, sessionId: string) => {
        calls.push({ op: 'places', sessionId })
        if (placesAvailability instanceof Error) throw placesAvailability
        return placesAvailability
      },
    },
  }
}

export interface RenderedAgenda {
  /**
   * The commitment double, so a test can inspect what the screen actually asked for. Keyed
   * `saved` since 005; kept to spare thirty call sites a rename that changes no meaning a test
   * relies on — the double itself carries the honest name.
   */
  readonly saved: ReturnType<typeof commitmentsDouble>
  readonly services: PlatformServices
  readonly unmount: () => void
}

/**
 * Returned explicitly rather than by spreading React Testing Library's result.
 *
 * Spreading it makes the inferred type reach into `pretty-format`'s internals, which
 * `tsc --noEmit` rejects as unnameable under this project's settings. Queries go through
 * `screen` in every test here anyway, so nothing is lost.
 */
export const renderAgenda = ({
  sessions = PROGRAMME,
  saved = [],
  places = [],
  changed = [],
  placesAvailability,
  overrides = {},
  devices = {},
  services: extraServices = {},
  at = '/agenda',
}: AgendaHarness = {}): RenderedAgenda => {
  const savedDouble = commitmentsDouble(
    saved,
    changed,
    places,
    placesAvailability ?? new Error('no places availability configured in this test'),
  )

  const services = testServices(
    {
      catalog: { listSessions: async () => sessions, listTracks: async () => [] },
      commitments: savedDouble.repository,
      ...overrides,
    },
    Object.keys(devices).length === 0
      ? extraServices
      : { ...extraServices, devices: { ...testServices().devices, ...devices } },
  )

  const view = render(
    <WithServices services={services}>
      <ActiveEventProvider>
        <MemoryRouter initialEntries={[at]}>
          <AgendaRoutes />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

  return { saved: savedDouble, services, unmount: view.unmount }
}

/**
 * The Agenda route and its nested children, **built from `DESTINATIONS` rather than restated**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * This used to hand-write `<Route path="/agenda" element={<Agenda />}>` with a stub child, and
 * that is a harness that can silently stop matching the application: the destination could
 * declare a child route the tests never render, or render one the router does not. Reading the
 * real declaration means these tests exercise the same element and the same nesting that
 * `routes.tsx` produces, so FR-233's "a destination owns its element" is under test here too.
 *
 * Nested rather than sibling, because that is the shape the panel depends on: the programme
 * stays mounted behind the dialog, so closing is a navigation rather than a refetch (research
 * D4).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const AGENDA = DESTINATIONS.find((destination) => destination.path === '/agenda')

const AgendaRoutes = () => {
  if (!AGENDA?.element) {
    throw new Error(
      'The Agenda destination declares no element. `navigation.ts` is what the router reads, ' +
        'so if this is missing the destination renders a placeholder in the real application too.',
    )
  }

  return (
    <Routes>
      <Route path="/agenda" element={AGENDA.element}>
        {AGENDA.children?.map((child) => (
          <Route key={child.path} path={child.path} element={child.element} />
        ))}
      </Route>
    </Routes>
  )
}

/** For tests that render something other than Agenda inside the same providers. */
export const WithAgendaProviders = ({
  children,
  // Defaulted rather than optional-and-forwarded: `exactOptionalPropertyTypes` makes passing an
  // explicit `undefined` through to `WithServices` a type error, which is the point of the flag.
  services = testServices(),
  at = '/agenda',
}: {
  children: ReactNode
  services?: PlatformServices
  at?: string
}) => (
  <WithServices services={services}>
    <ActiveEventProvider>
      <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>
    </ActiveEventProvider>
  </WithServices>
)
