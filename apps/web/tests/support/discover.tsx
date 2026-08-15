import type { DirectoryEntry, DirectoryPage, DirectoryQuery, VisibleProfile } from '@mynet/data'
import type { PlatformServices } from '@mynet/platform'
import { render } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { ActiveEventProvider, useActiveEventContext } from '../../src/app/active-event.js'
import { DESTINATIONS } from '../../src/app/navigation.js'
import { testServices, WithServices } from './services.js'

/**
 * A rendered Discover, for the 006 component tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The routes are built from `DESTINATIONS`, not restated here.** A harness that hand-wrote
 * `<Route path="/discover" element={<Discover />}>` could silently stop matching the
 * application — the destination could declare a child route the tests never render, or render
 * one the router does not. Reading the real declaration means these tests exercise the same
 * element and the same nesting `routes.tsx` produces, so FR-233's "a destination owns its
 * element and its nested addresses" is under test here too. `support/agenda.tsx` records the
 * same reasoning for the same reason.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export const anAttendee = (overrides: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  attendeeId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Sofía Muñoz',
  company: 'Peña & Asociados',
  role: 'Designer',
  headline: 'Design systems for large teams.',
  productiveActivity: null,
  networkingIntent: 'open_to_meetings',
  availability: 'available',
  interests: ['Design systems', 'Accessibility'],
  sharedInterestCount: 2,
  avatar: null,
  ...overrides,
})

/**
 * A directory repository over in-memory pages, recording every query it was asked.
 *
 * Real enough that the screen's behaviour is the screen's rather than the double's: the query
 * actually reaches it, so a component that narrows on the client instead of asking the server
 * is caught rather than accommodated (FR-409).
 */
export type DirectorySource = DirectoryPage[] | ((query: DirectoryQuery) => DirectoryPage)

export const directoryDouble = (
  source: DirectorySource = [{ attendees: [], nextCursor: null }],
) => {
  const queries: DirectoryQuery[] = []
  let pageIndex = 0
  let failWith: Error | null = null
  let hold: (() => void) | null = null

  return {
    queries,
    /** Makes every read fail, for the offline and failure paths. */
    failWith: (error: Error | null) => {
      failWith = error
    },
    /** Holds the next read open indefinitely, for the loading state. */
    holdNext: () => {
      hold = () => {}
    },
    repository: {
      list: async (_eventId: string, query: DirectoryQuery): Promise<DirectoryPage> => {
        queries.push(query)
        if (failWith) throw failWith
        if (hold) return new Promise<DirectoryPage>(() => {})

        // A function source is how a test says "the server actually narrows" — which is the
        // only way to exercise a no-match state honestly, since the narrowing is server-side
        // (FR-409) and a double that ignored the query would let a client-side filter pass.
        if (typeof source === 'function') return source(query)

        // Cursor-driven: the first read has none, each subsequent one carries the previous
        // page's cursor. Indexing by presence-of-cursor rather than by call count keeps a
        // re-read of page one (a retry, a query change) from walking past it.
        const index = query.cursor ? pageIndex + 1 : 0
        pageIndex = index
        return source[index] ?? { attendees: [], nextCursor: null }
      },
      get: async (): Promise<VisibleProfile | null> => null,
      readAvatar: async (): Promise<string | null> => null,
    },
  }
}

export interface DiscoverHarness {
  readonly attendees?: DirectoryEntry[]
  /**
   * Full pages, when a test needs paging rather than one page — or a function of the query,
   * when a test needs the server to actually narrow. Wins over `attendees`.
   */
  readonly pages?: DirectorySource
  readonly overrides?: Partial<PlatformServices['repositories']>
  readonly services?: Partial<PlatformServices>
  /** The address to start at — `/discover` or `/discover/<attendeeId>`. */
  readonly at?: string
  /**
   * Conference identifiers a test may switch to, rendered as controls beside the destination.
   *
   * **The switch goes through `useActiveEventContext().switchTo`**, which is the path the real
   * conference switcher takes. Mutating the repository double instead would change what a
   * *later* read answers without ever telling the provider anything happened — so a test would
   * be asserting against a switch that never occurred.
   */
  readonly switchTargets?: readonly string[]
}

export interface RenderedDiscover {
  readonly directory: ReturnType<typeof directoryDouble>
  readonly services: PlatformServices
  readonly unmount: () => void
}

/** Test-only controls that drive a real conference switch. */
const SwitchControls = ({ targets }: { targets: readonly string[] }) => {
  const { switchTo } = useActiveEventContext()

  return (
    <>
      {targets.map((eventId) => (
        <button key={eventId} type="button" onClick={() => void switchTo(eventId)}>
          {`switch to ${eventId}`}
        </button>
      ))}
    </>
  )
}

export const renderDiscover = ({
  attendees = [anAttendee()],
  pages,
  overrides = {},
  services: extraServices = {},
  at = '/discover',
  switchTargets = [],
}: DiscoverHarness = {}): RenderedDiscover => {
  const double = directoryDouble(pages ?? [{ attendees, nextCursor: null }])

  const services = testServices({ directory: double.repository, ...overrides }, extraServices)

  const view = render(
    <WithServices services={services}>
      <ActiveEventProvider>
        <MemoryRouter initialEntries={[at]}>
          {switchTargets.length > 0 && <SwitchControls targets={switchTargets} />}
          <DiscoverRoutes />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

  return { directory: double, services, unmount: view.unmount }
}

const DISCOVER = DESTINATIONS.find((destination) => destination.path === '/discover')

const DiscoverRoutes = () => {
  if (!DISCOVER?.element) {
    throw new Error(
      'The Discover destination declares no element. `navigation.ts` is what the router reads, ' +
        'so if this is missing the destination renders a placeholder in the real application too.',
    )
  }

  return (
    <Routes>
      <Route
        path="/discover"
        // Wrapped as `routes.tsx` wraps it: the destination is code-split (T130), so React
        // needs somewhere to suspend while its chunk arrives.
        element={<Suspense fallback={<p role="status">Loading…</p>}>{DISCOVER.element}</Suspense>}
      >
        {DISCOVER.children?.map((child) => (
          <Route
            key={child.path}
            path={child.path}
            // Wrapped exactly as `routes.tsx` wraps it: the profile view is code-split (the
            // asset budget, T130), so React needs somewhere to suspend while its chunk arrives.
            // A harness without the boundary would throw where the application does not.
            element={<Suspense fallback={<p role="status">Loading…</p>}>{child.element}</Suspense>}
          />
        ))}
      </Route>
    </Routes>
  )
}
