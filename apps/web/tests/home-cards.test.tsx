import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomeShell } from '../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../src/app/home/registry.js'
import { aSession, EMPTY_PROFILE, SUMMIT, testServices, WithServices } from './support/services.js'

/**
 * 006 — the profile double, and a reader who has set interests.
 *
 * The People to meet card reads the reader's own profile for exactly one reason: FR-449 needs
 * "you have set no interests" told apart from "nobody to suggest", and the listing alone cannot
 * distinguish them. Every scenario below therefore has to say which of the two it means.
 */
const PROFILE_DOUBLE = testServices().repositories.profile
const PROFILE_WITH_INTERESTS = { ...EMPTY_PROFILE, interests: ['Design systems'] }

/**
 * 008 — the appointments double, and the two rows the card treats differently.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A **confirmed** meeting and a **proposal awaiting the reader** are not the same content:
 * FR-645 requires the second to be visibly distinct and to offer a route to answer it, because
 * this feature dispatches no notification (FR-643) and Home is the only place an attendee
 * learns a proposal exists. The populated scenario carries both, so the card cannot pass by
 * rendering only its quieter half.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const APPOINTMENTS_DOUBLE = testServices().repositories.appointments

const A_COUNTERPART = {
  attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222',
  displayName: 'Grace Hopper',
} as const

const AN_APPOINTMENT = {
  appointmentId: 'cccccccc-3333-4333-8333-333333333333',
  role: 'proposer' as const,
  counterpart: A_COUNTERPART,
  slot: {
    slotId: 'dddddddd-4444-4444-8444-444444444444',
    startsAt: '2026-09-14T12:00:00.000Z',
    endsAt: '2026-09-14T12:30:00.000Z',
  },
  topic: 'Design systems, briefly.',
  status: 'confirmed' as const,
  createdAt: '2026-09-13T09:00:00.000Z',
  answeredAt: '2026-09-13T10:00:00.000Z',
}

const A_PROPOSAL_AWAITING_THE_READER = {
  ...AN_APPOINTMENT,
  appointmentId: 'eeeeeeee-5555-4555-8555-555555555555',
  // The invitee is the reader, which is the only combination that demands anything of them.
  role: 'invitee' as const,
  slot: { ...AN_APPOINTMENT.slot, slotId: 'ffffffff-6666-4666-8666-666666666666' },
  status: 'pending' as const,
  answeredAt: null,
}

const SUGGESTION = {
  attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111',
  displayName: 'Trina Three',
  company: 'Overlap Maximal',
  role: 'Principal Engineer',
  headline: null,
  networkingIntent: null,
  availability: null,
  interests: ['Design systems'],
  sharedInterestCount: 1,
  avatar: null,
} as const

/**
 * T078 (002) — **every registered card renders a visible, meaningful state in all four of
 * loading, populated, empty and failed** (SC-109).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `home-composition.test.tsx` proves the *mechanism* — the shell contains failures, keeps empty
 * cards visible, and splits event- from attendee-scoped. This proves each card actually **uses**
 * it, which is a different claim and the one that rots first: a card added in feature 006 will
 * inherit the mechanism automatically and can still forget to render an empty state.
 *
 * It iterates `HOME_CARDS` rather than naming cards, so a card contributed later is covered the
 * moment it is registered — by the author who registered it, whether or not they read this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Repository behaviours that put every card into the same state at once. */
const SCENARIOS = {
  loading: () => ({
    events: { listRegistered: () => new Promise<never[]>(() => {}) },
    catalog: {
      listSessions: () => new Promise<never[]>(() => {}),
      listTracks: () => new Promise<never[]>(() => {}),
    },
    // 005 — driven too, or a card reading it would sit in whatever state the default double
    // produces and the matrix would record that as its answer for every scenario.
    savedSessions: {
      listSaved: () => new Promise<{ sessionId: string; changedSinceViewed: boolean }[]>(() => {}),
      save: async () => {},
      unsave: async () => {},

      markViewed: async () => {},
    },
    // 006 — driven for the same reason 005's is, and this file's own header predicted it: "a
    // card added in feature 006 will inherit the mechanism automatically and can still forget to
    // render an empty state." It cannot forget, but it *can* be left reading a default double
    // that never changes — in which case the matrix records one state four times and reports
    // green.
    directory: {
      list: () => new Promise<never>(() => {}),
      get: () => new Promise<never>(() => {}),
      readAvatar: () => new Promise<never>(() => {}),
    },
    profile: { ...PROFILE_DOUBLE, getOwn: () => new Promise<never>(() => {}) },
    // 008 — driven for the reason 005's and 006's are, and this file's own header predicted a
    // third time: a card left reading an undriven default double sits in one state through all
    // four scenarios, and the matrix records that as its answer. 008's card actually FAILED
    // here rather than passing green, because its empty state renders text — which is the
    // guard working better than it did for either predecessor.
    appointments: { ...APPOINTMENTS_DOUBLE, list: () => new Promise<never>(() => {}) },
  }),
  populated: () => ({
    events: { listRegistered: async () => [SUMMIT] },
    catalog: {
      // TWO future sessions on the venue's today, so `rest-of-day` genuinely renders a list.
      // With a single session it was excluded as the up-next one and the card rendered its
      // EMPTY message — which the matrix then recorded as its "populated" state.
      listSessions: async () => [
        aSession({
          id: 's1',
          startsAt: '2026-09-14T12:00:00.000Z',
          endsAt: '2026-09-14T13:00:00.000Z',
        }),
        aSession({
          id: 's2',
          title: 'Later Session',
          startsAt: '2026-09-14T14:00:00.000Z',
          endsAt: '2026-09-14T15:00:00.000Z',
        }),
      ],
      listTracks: async () => [],
    },
    // Both fixture sessions are saved, so a card about the attendee's own agenda has something
    // to name rather than falling into its empty state and recording that as "populated".
    savedSessions: {
      listSaved: async () => [
        { sessionId: 's1', changedSinceViewed: false },
        { sessionId: 's2', changedSinceViewed: false },
      ],
      save: async () => {},
      unsave: async () => {},

      markViewed: async () => {},
    },
    // A reader with interests and somebody to meet, so 006's card renders its populated body
    // rather than either of its two empty ones.
    directory: {
      list: async () => ({ attendees: [SUGGESTION], nextCursor: null }),
      get: async () => null,
      readAvatar: async () => null,
    },
    profile: { ...PROFILE_DOUBLE, getOwn: async () => PROFILE_WITH_INTERESTS },
    // A confirmed meeting AND one awaiting an answer, so 008's card renders both of its
    // populated halves rather than only the quieter one (FR-644, FR-645).
    appointments: {
      ...APPOINTMENTS_DOUBLE,
      list: async () => [AN_APPOINTMENT, A_PROPOSAL_AWAITING_THE_READER],
    },
  }),
  empty: () => ({
    events: { listRegistered: async () => [] },
    catalog: { listSessions: async () => [], listTracks: async () => [] },
    savedSessions: {
      listSaved: async () => [],
      save: async () => {},
      unsave: async () => {},
      markViewed: async () => {},
    },
    // Nobody to suggest — and the reader still has interests, so this is the *directory* empty
    // state rather than the no-interests one. Both are 006's, and they are different facts.
    directory: {
      list: async () => ({ attendees: [], nextCursor: null }),
      get: async () => null,
      readAvatar: async () => null,
    },
    profile: { ...PROFILE_DOUBLE, getOwn: async () => PROFILE_WITH_INTERESTS },
    appointments: { ...APPOINTMENTS_DOUBLE, list: async () => [] },
  }),
  failed: () => ({
    events: {
      listRegistered: async () => {
        throw new Error('server fault')
      },
    },
    catalog: {
      listSessions: async () => {
        throw new Error('server fault')
      },
      listTracks: async () => {
        throw new Error('server fault')
      },
    },
    savedSessions: {
      listSaved: async () => {
        throw new Error('server fault')
      },
      save: async () => {},
      unsave: async () => {},

      markViewed: async () => {},
    },
    directory: {
      list: async () => {
        throw new Error('server fault')
      },
      get: async () => null,
      readAvatar: async () => null,
    },
    profile: { ...PROFILE_DOUBLE, getOwn: async () => PROFILE_WITH_INTERESTS },
    appointments: {
      ...APPOINTMENTS_DOUBLE,
      list: async () => {
        throw new Error('server fault')
      },
    },
  }),
} as const

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Cards whose content is a pure function of props, not of a repository.**
 *
 * `GreetingDayContext` reads no repository — it renders the resolved conference and the
 * signed-in attendee — so varying repository behaviour cannot change it. Its states come from
 * the props the shell passes, and it gets its own matrix below.
 *
 * **The default is the strict repository matrix**: a card added by a later feature is treated
 * as data-backed unless it is deliberately named here, so an exemption has to be a decision
 * rather than an omission.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const PROP_DRIVEN = new Set(['greeting-day-context'])

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **CARDS THAT RENDER NOTHING WHEN THERE IS NOTHING TO SAY — A DECLARED EXCEPTION TO SC-109,
 * AND THE ONLY ONE.**
 *
 * The strict matrix above requires four distinguishable, non-empty bodies. 007's unread
 * indicator cannot satisfy it, and the reason is a requirement rather than an oversight:
 * **FR-531 says it renders nothing at zero.** An indicator is a thing that appears when there is
 * something to indicate, and a permanent "no unread messages" card is noise in the first
 * viewport on the overwhelming majority of loads — a viewport Principle III makes a success
 * criterion.
 *
 * Its loading state is silent for the same reason: a skeleton that resolves to nothing would be
 * a flicker on every single load, which is worse than the wait it reports.
 *
 * **This is not an exemption from the composition contract**, and the block at the bottom of this
 * file is what makes that true: these cards still get a matrix, a narrower one. They must render
 * **nothing** when loading and when empty, **something** when populated, and — the half that
 * actually matters — a real, retryable failure state (FR-533, SC-517), because a dot that
 * silently stops appearing would let an attendee conclude nobody had messaged them.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const ABSENT_WHEN_NOTHING_TO_SAY = new Set(['unread-messages'])

describe('every Home card in all four states (SC-109)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // 09:00 in Barcelona on day one, so the seeded fixture above is genuinely upcoming.
    vi.setSystemTime(new Date('2026-09-14T07:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('the registry is not empty, or this file proves nothing', () => {
    expect(HOME_CARDS.length).toBeGreaterThan(0)
  })

  const states = Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **Cards whose content is a pure function of props, not of a repository.**
   *
   * `GreetingDayContext` reads no repository — it renders the resolved conference and the
   * signed-in attendee — so varying repository behaviour cannot change it, and asserting that
   * it does would be asserting a fiction. Its four states come from the *shell's*
   * active-conference resolution, which the block at the bottom of this file walks.
   *
   * **The default is the strict matrix**: a card added by a later feature is treated as
   * data-backed unless it is deliberately added here, so the exemption has to be a decision
   * rather than an omission. The classification test below makes the two lists cover the
   * registry exactly.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const dataBacked = HOME_CARDS.filter(
    (card) => !PROP_DRIVEN.has(card.id) && !ABSENT_WHEN_NOTHING_TO_SAY.has(card.id),
  )

  it('no card is exempted that no longer exists', () => {
    // The sum of two complementary filters over one array is a tautology and was asserted as
    // one. What can actually go wrong is a STALE exemption: rename a card and `PROP_DRIVEN`
    // silently holds a dead id while the renamed card quietly enters the strict matrix — or,
    // worse, a future edit adds an id here that never existed and exempts nothing visibly.
    expect(
      [...PROP_DRIVEN, ...ABSENT_WHEN_NOTHING_TO_SAY].filter(
        (id) => !HOME_CARDS.some((card) => card.id === id),
      ),
      'these ids are exempted from the strict matrix but are not registered cards',
    ).toEqual([])
    expect(dataBacked.length, 'the strict matrix must cover something').toBeGreaterThan(0)
  })

  describe.each(dataBacked.map((card) => [card.id, card] as const))('%s', (_id, card) => {
    it.each(states)('renders something visible and meaningful when %s', async (state) => {
      render(
        <WithServices services={testServices(SCENARIOS[state]())}>
          {/*
            005 — a router, because a Home card may legitimately link to a destination: this
            feature's card offers "Browse the programme" from its empty state and links its
            session to the detail panel. Without one the card throws, the shell contains it, and
            the matrix would record a *containment region* as the card's rendering — passing
            while checking nothing.
          */}
          <MemoryRouter>
            <HomeShell cards={[card]} activeEvent={{ status: 'ready', event: SUMMIT }} />
          </MemoryRouter>
        </WithServices>,
      )

      // Settle any resolved promise the card kicked off.
      await vi.advanceTimersByTimeAsync(0)

      const region = screen.getByRole('region', { name: card.title })

      // ─────────────────────────────────────────────────────────────────────────────────────
      // "Visible and meaningful" is the requirement, so an empty box is a failure. Every state
      // must put readable text on screen beyond the card's own heading — that is what stops a
      // card from silently rendering nothing and passing as "handled".
      // ─────────────────────────────────────────────────────────────────────────────────────
      const body = (region.textContent ?? '').replace(card.title, '').trim()
      expect(
        body.length,
        `The "${card.title}" card renders nothing but its heading when ${state}. Every card owns ` +
          'its loading, empty and failure states (constitution: Home is composed, not aggregated).',
      ).toBeGreaterThan(0)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **State-specific markers, not merely "some text".**
      //
      // The assertion above alone was satisfied by a card that rendered the identical string in
      // all four conditions — which is exactly what `rest-of-day` was doing, because the
      // "populated" fixture left it with nothing to list. SC-109 says a *meaningful* state in
      // each of the four; these are what make the four distinguishable.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (state === 'loading') {
        expect(within(region).getByRole('status')).toBeInTheDocument()
      }
      if (state === 'failed') {
        expect(within(region).getByRole('alert')).toBeInTheDocument()
        expect(within(region).getByRole('button', { name: /try again/i })).toBeInTheDocument()
      }
    })

    it('renders a DIFFERENT body in each of the four states', async () => {
      const bodies = new Map<string, string>()

      for (const state of states) {
        const { unmount } = render(
          <WithServices services={testServices(SCENARIOS[state]())}>
            {/* 005 — see the note on the matrix above: a card may link to a destination. */}
            <MemoryRouter>
              <HomeShell cards={[card]} activeEvent={{ status: 'ready', event: SUMMIT }} />
            </MemoryRouter>
          </WithServices>,
        )
        await vi.advanceTimersByTimeAsync(0)
        const region = screen.getByRole('region', { name: card.title })
        bodies.set(state, (region.textContent ?? '').replace(card.title, '').trim())
        unmount()
      }

      // Loading, populated, empty and failed must not read identically. A card that showed the
      // same words in all four would satisfy "renders something" and tell the attendee nothing.
      expect(
        new Set(bodies.values()).size,
        `"${card.title}" renders indistinguishable bodies across states: ` +
          JSON.stringify(Object.fromEntries(bodies)),
      ).toBe(states.length)
    })
  })
})

/**
 * The other half of SC-109, for the cards whose states do not come from a repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The matrix above varies the **repositories**, which is where Up next, Rest of your day and
 * Your conferences get their four states. `GreetingDayContext` reads none: its content is a
 * function of the resolved conference and the session, so all four scenarios above render it
 * identically and assert nothing about its states.
 *
 * For an event-scoped card, "loading", "no conference" and "unresolvable" are states of the
 * **shell's** active-conference resolution, not of the card's own data. This walks those, so
 * SC-109 is exercised for every card rather than merely asserted for some of them.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('event-scoped cards in every active-conference state (SC-109)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const EVENT_SCOPED = HOME_CARDS.filter((card) => card.scope === 'event')

  const ACTIVE_EVENT_STATES = {
    loading: { status: 'loading' },
    'no conference': { status: 'none' },
    unresolvable: {
      status: 'failed',
      message: 'We could not tell which conference you are in.',
      retry: () => {},
    },
  } as const

  it('there are event-scoped cards to exercise', () => {
    expect(EVENT_SCOPED.length).toBeGreaterThan(0)
  })

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **The states below never invoke `card.Component`** — `HomeShell` returns `CardPending` for
   * loading, none and failed without rendering the card at all. So this block alone proved
   * nothing about a prop-driven card: a mutation replacing `GreetingDayContext`'s body with an
   * unconditional throw passed all 30 cases, because `CardUnavailable`'s "unavailable right
   * now" satisfies "renders something".
   *
   * This is the matrix that actually renders the exempt cards, varying the **props** they are a
   * function of — the analogue of the repository matrix above.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  describe.each(
    HOME_CARDS.filter((card) => PROP_DRIVEN.has(card.id)).map((card) => [card.id, card] as const),
  )('%s (prop-driven)', (_id, card) => {
    const WINDOWS = {
      before: '2026-09-11T10:00:00Z',
      during: '2026-09-15T10:00:00Z',
      after: '2026-09-25T10:00:00Z',
    } as const

    it('renders a distinct body in each of before, during and after', async () => {
      const bodies = new Map<string, string>()

      for (const [label, instant] of Object.entries(WINDOWS)) {
        vi.setSystemTime(new Date(instant))
        const { unmount } = render(
          <WithServices services={testServices(SCENARIOS.populated())}>
            <HomeShell cards={[card]} activeEvent={{ status: 'ready', event: SUMMIT }} />
          </WithServices>,
        )
        await vi.advanceTimersByTimeAsync(0)

        const region = screen.getByRole('region', { name: card.title })
        // A thrown card renders the shell's contained failure instead — catch that explicitly
        // rather than letting its text satisfy a length check.
        expect(
          within(region).queryByRole('alert'),
          `"${card.title}" failed to render (${label}); the shell contained it`,
        ).toBeNull()

        bodies.set(label, (region.textContent ?? '').replace(card.title, '').trim())
        unmount()
      }

      expect(
        new Set(bodies.values()).size,
        `"${card.title}" reads the same before, during and after: ` +
          JSON.stringify(Object.fromEntries(bodies)),
      ).toBe(3)
    })
  })

  describe.each(EVENT_SCOPED.map((card) => [card.id, card] as const))('%s', (_id, card) => {
    it.each(Object.keys(ACTIVE_EVENT_STATES) as Array<keyof typeof ACTIVE_EVENT_STATES>)(
      'stays visible and says why when the conference is %s',
      (state) => {
        render(
          <WithServices services={testServices(SCENARIOS.populated())}>
            <HomeShell cards={[card]} activeEvent={ACTIVE_EVENT_STATES[state]} />
          </WithServices>,
        )

        // Present, named, and carrying an explanation — never a hole in the layout (FR-161).
        const region = screen.getByRole('region', { name: card.title })
        const body = (region.textContent ?? '').replace(card.title, '').trim()
        expect(
          body.length,
          `"${card.title}" renders nothing but its heading when the conference is ${state}.`,
        ).toBeGreaterThan(0)
      },
    )
  })
})

/**
 * T079 — **at most one card claims the `lead` slot** (FR-157, research D8).
 *
 * Not a compile-time guarantee, deliberately. Expressing "at most one element of this array has
 * slot 'lead'" in types would mean a tuple or a builder that narrows on each append, and either
 * makes the registry hostile to the single-line append it exists for. The trade is recorded here
 * rather than glossed, alongside the development-mode assertion in `registry.ts`.
 */
describe('the lead slot (FR-157)', () => {
  it('is claimed by at most one registered card', () => {
    const leads = HOME_CARDS.filter((card) => card.slot === 'lead')

    expect(
      leads.map((card) => card.id),
      'More than one card claims the lead slot. The lead card introduces the screen; two of ' +
        'them is a layout question nobody decided, and the grid would silently render both ' +
        'full-width and look plausible.',
    ).toHaveLength(leads.length > 0 ? 1 : 0)
    expect(leads.length).toBeLessThanOrEqual(1)
  })

  it('has a development-mode assertion that actually rejects a second lead', async () => {
    // The assertion is only useful if it fires. A registry with two leads must throw.
    const { assertAtMostOneLead } = await import('../src/app/home/registry.js')
    const lead = HOME_CARDS.find((card) => card.slot === 'lead')
    if (!lead) throw new Error('Expected a lead card to duplicate.')

    expect(() => assertAtMostOneLead([lead, { ...lead, id: 'second-lead' }])).toThrow(/lead/i)
    expect(() => assertAtMostOneLead(HOME_CARDS)).not.toThrow()
  })

  it('gives every card a unique id, since the shell keys regions by it', () => {
    const ids = HOME_CARDS.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE NARROWER MATRIX, for cards that are absent when there is nothing to say** (FR-531,
 * FR-533, SC-517).
 *
 * These are not exempt from the composition contract — they are held to a *different* contract,
 * and it is spelled out here so that "renders nothing" cannot quietly become "renders nothing,
 * ever, including when it broke".
 *
 * The failure assertion is the load-bearing one. An indicator that vanished on failure would let
 * an attendee conclude nobody had messaged them, which is worse than the failure it is hiding.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('cards that are absent when there is nothing to say', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-14T07:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const absent = HOME_CARDS.filter((card) => ABSENT_WHEN_NOTHING_TO_SAY.has(card.id))

  it('covers the declared set, or the exemption above is asserting nothing', () => {
    expect(absent.length).toBe(ABSENT_WHEN_NOTHING_TO_SAY.size)
  })

  const renderCard = (
    overrides: Parameters<typeof testServices>[0],
    card: (typeof absent)[number],
  ) =>
    render(
      <WithServices services={testServices(overrides)}>
        <MemoryRouter>
          <HomeShell cards={[card]} activeEvent={{ status: 'ready', event: SUMMIT }} />
        </MemoryRouter>
      </WithServices>,
    )

  describe.each(absent.map((card) => [card.id, card] as const))('%s', (_id, card) => {
    it('renders NOTHING at all when there is nothing to say (FR-531)', async () => {
      renderCard({ conversations: { ...quietConversations, hasUnread: async () => false } }, card)
      await vi.advanceTimersByTimeAsync(0)

      expect(
        screen.queryByRole('region', { name: card.title }),
        'An indicator appears when there is something to indicate. A permanent "nothing here" ' +
          'card is noise in a first viewport Principle III makes a success criterion.',
      ).not.toBeInTheDocument()
    })

    it('renders nothing WHILE LOADING either, so it cannot flicker', async () => {
      renderCard(
        {
          conversations: { ...quietConversations, hasUnread: () => new Promise<boolean>(() => {}) },
        },
        card,
      )

      expect(screen.queryByRole('region', { name: card.title })).not.toBeInTheDocument()
    })

    it('renders something when there IS something to say', async () => {
      renderCard({ conversations: { ...quietConversations, hasUnread: async () => true } }, card)
      await vi.advanceTimersByTimeAsync(0)

      const region = await screen.findByRole('region', { name: card.title })
      expect((region.textContent ?? '').trim().length).toBeGreaterThan(0)
    })

    it('RENDERS A RETRYABLE FAILURE rather than vanishing (FR-533, SC-517)', async () => {
      renderCard(
        {
          conversations: {
            ...quietConversations,
            hasUnread: async () => {
              throw new Error('server fault')
            },
          },
        },
        card,
      )
      await vi.advanceTimersByTimeAsync(0)

      const region = await screen.findByRole('region', { name: card.title })
      expect(within(region).getByRole('alert')).toBeInTheDocument()
      expect(within(region).getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})

/** The rest of the conversation repository, so each scenario varies one method and no more. */
const quietConversations = {
  list: async () => [],
  hasUnread: async () => false,
  openWith: async () => ({ conversationId: '', messageId: '', sentAt: '' }),
  markRead: async () => {},
}
