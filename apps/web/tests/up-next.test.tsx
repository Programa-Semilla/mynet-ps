import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomeShell } from '../src/app/home/HomeShell.js'
import { upNextCard } from '../src/app/home/cards/UpNext.js'
import {
  aSession,
  SUMMIT,
  testServices,
  WithServices,
  type TestSession,
} from './support/services.js'

/**
 * T031 (002) — the Up next card (FR-138, FR-140).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Rendered **through the shell**, not in isolation, because the card's contract is with the
 * shell: the shell is what resolves the conference and supplies the containment boundary. A
 * test that rendered the component directly would be testing something the product never does.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The clock is fixed with fake timers, since every assertion here is about what "next" means at
 * a particular moment.
 */
describe('Up next', () => {
  const renderWith = (sessions: TestSession[]) =>
    render(
      <WithServices
        services={testServices({
          catalog: { listSessions: async () => sessions, listTracks: async () => [] },
        })}
      >
        <HomeShell cards={[upNextCard]} activeEvent={{ status: 'ready', event: SUMMIT }} />
      </WithServices>,
    )

  beforeEach(() => {
    // `shouldAdvanceTime` is not optional here: Testing Library's `findBy*` polls on a timer,
    // so fully frozen timers make every asynchronous query hang until the test times out. This
    // mocks the clock — which is what these assertions are about — while letting the polling
    // that observes the result still run.
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Madrid is UTC+2 in September, so 08:00Z is 10:00 at the venue. */
  const atVenue = (utc: string) => vi.setSystemTime(new Date(utc))

  it('names the next session with its time, room, track and speakers', async () => {
    atVenue('2026-09-14T07:00:00Z') // 09:00 in Barcelona
    renderWith([aSession()])

    expect(await screen.findByText('Tokens Beyond Colour')).toBeInTheDocument()
    expect(screen.getByText('Miró Room')).toBeInTheDocument()
    // The track is named in TEXT, not only coded by colour (Principle IV).
    expect(screen.getByText('Design Systems')).toBeInTheDocument()
    expect(screen.getByText(/Ingrid Halvorsen/)).toBeInTheDocument()
    // 08:30Z is 10:30 at the venue — the venue's clock, not the reader's.
    expect(screen.getByText('10:30')).toBeInTheDocument()
  })

  it('says nothing remains rather than showing a session that already happened (FR-140)', async () => {
    // Past the last session of the day.
    atVenue('2026-09-14T20:00:00Z')
    renderWith([aSession()])

    expect(await screen.findByText(/Nothing further scheduled today/i)).toBeInTheDocument()
    // The crucial half: the morning's session must not be presented as "up next".
    expect(screen.queryByText('Tokens Beyond Colour')).not.toBeInTheDocument()
  })

  it('does NOT show tomorrow’s session once today’s programme is over (FR-140)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A one-session fixture cannot express this: with only one day of programme, "nothing left
    // today" and "nothing left at all" are the same condition, and a card that searched the
    // whole conference would pass. Two days separate them.
    //
    // At 22:00 in Barcelona on day one, the next session in the *conference* is tomorrow's
    // 09:30 — and it would render as a bare "09:30" with no date, reading as later tonight.
    // ───────────────────────────────────────────────────────────────────────────────────────
    atVenue('2026-09-14T20:00:00Z') // 22:00 at the venue, after day one has finished
    renderWith([
      aSession({ id: 'today', title: 'Today Morning Session' }),
      aSession({
        id: 'tomorrow',
        title: 'Tomorrow Morning Session',
        startsAt: '2026-09-15T07:30:00.000Z', // 09:30 on day two
        endsAt: '2026-09-15T08:30:00.000Z',
      }),
    ])

    expect(await screen.findByText(/Nothing further scheduled today/i)).toBeInTheDocument()
    expect(screen.queryByText('Tomorrow Morning Session')).not.toBeInTheDocument()
    expect(screen.queryByText('09:30')).not.toBeInTheDocument()
  })

  it('says the programme is unpublished when there is none at all (FR-139)', async () => {
    atVenue('2026-09-14T07:00:00Z')
    renderWith([])

    expect(await screen.findByText(/no published programme/i)).toBeInTheDocument()
  })

  it('resolves simultaneous starts deterministically', async () => {
    atVenue('2026-09-14T07:00:00Z')

    const first = aSession({ id: 'session-a', title: 'Alpha Session' })
    const second = aSession({ id: 'session-b', title: 'Beta Session' })

    // Same instant, offered in one order…
    const { unmount } = renderWith([first, second])
    const chosen = await screen.findByRole('heading', { level: 3 })
    const chosenTitle = chosen.textContent
    unmount()

    // …and in the other. The answer must not depend on which the server happened to list first.
    renderWith([second, first])
    const again = await screen.findByRole('heading', { level: 3 })

    expect(again.textContent).toBe(chosenTitle)
    expect(chosenTitle).toBe('Alpha Session') // lowest id wins, matching the server's order
  })

  it('renders a session with no speaker completely, with no placeholder (FR-138)', async () => {
    atVenue('2026-09-14T07:00:00Z')
    renderWith([aSession({ title: 'Open Studio: Critique Hour', speakers: [] })])

    expect(await screen.findByText('Open Studio: Critique Hour')).toBeInTheDocument()
    // No invented stand-in for the missing speaker, and no empty region announcing one.
    expect(screen.queryByText(/^(TBA|TBC|Unknown|—|-)$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/speaker/i)).not.toBeInTheDocument()
  })

  it('shows its own failure state without taking down the card region', async () => {
    atVenue('2026-09-14T07:00:00Z')
    render(
      <WithServices
        services={testServices({
          catalog: {
            listSessions: async () => {
              throw new Error('server fault')
            },
            listTracks: async () => [],
          },
        })}
      >
        <HomeShell cards={[upNextCard]} activeEvent={{ status: 'ready', event: SUMMIT }} />
      </WithServices>,
    )

    // A failure, with a way forward — never a silent empty state (FR-058).
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows a loading state while the programme is in flight', () => {
    atVenue('2026-09-14T07:00:00Z')
    render(
      <WithServices
        services={testServices({
          catalog: { listSessions: () => new Promise(() => {}), listTracks: async () => [] },
        })}
      >
        <HomeShell cards={[upNextCard]} activeEvent={{ status: 'ready', event: SUMMIT }} />
      </WithServices>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
