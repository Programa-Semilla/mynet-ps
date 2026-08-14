import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { nextSavedSessionCard } from '../../src/app/home/cards/NextSavedSession.js'
import { restOfDayCard } from '../../src/app/home/cards/RestOfDay.js'
import { upNextCard } from '../../src/app/home/cards/UpNext.js'
import { renderAgenda } from '../support/agenda.js'
import { questionsDouble } from '../support/questions.js'
import { aSession, SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T058 (014) — a cancelled session, wherever an attendee meets one (SC-1002, FR-1022, FR-1022a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASYMMETRY IS THE SUBJECT, AND IT IS ONE CONDITION WIDE.**
 *
 * FR-1022 marks a cancelled session everywhere: the programme, the Agenda row, the detail panel,
 * the rest-of-day timeline. FR-1022a **omits** it from exactly one surface — "Up next" — because
 * that card answers *where do I go now*, and naming a cancelled session in the most prominent
 * position in the first viewport sends somebody across a venue to an empty room.
 *
 * `sessions.test.ts` asserts the asymmetry at the unit layer, where `nextSession` and
 * `restOfVenueDay` sit six lines apart. This file asserts it at the layer an attendee actually
 * meets: two Home cards reading the same programme and disagreeing about it **on purpose**. A
 * later edit that "tidies" the two functions into agreement passes every unit test about the
 * function it keeps and fails here.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **CANCELLATION IS ASSERTED AS TEXT, NEVER AS A CLASS NAME OR A STYLE.**
 *
 * The natural rendering — grey the row, strike the title through — is invisible to a screen
 * reader and invisible in high contrast, and this is the single piece of information whose loss
 * has a physical cost. Every assertion below reads the accessible text, so a rendering that
 * satisfies it visually and not otherwise fails.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const CANCELLED = aSession({
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Cancelled Keynote',
  // Later "today" against the pinned clock below, so it is a genuine candidate for "up next"
  // rather than being filtered for the ordinary reason of being in the past.
  startsAt: '2026-09-14T19:00:00.000Z', // 21:00 Madrid, day one
  endsAt: '2026-09-14T20:00:00.000Z',
  room: { id: 'room-9', name: 'Gaudí Hall' },
  cancelled: true,
})

const LATER = aSession({
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Closing Remarks',
  startsAt: '2026-09-14T20:30:00.000Z', // 22:30 Madrid, day one — after the cancelled one
  endsAt: '2026-09-14T21:00:00.000Z',
  room: { id: 'room-10', name: 'Miró Room' },
})

describe('a cancelled session in Agenda and its panel', () => {
  it('marks the row in text (FR-1022)', async () => {
    renderAgenda({ sessions: [CANCELLED, LATER] })

    const row = (await screen.findByRole('link', { name: 'Cancelled Keynote' })).closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Cancelled')).toBeInTheDocument()

    // The session is still listed. Cancellation is information, not removal — an attendee who
    // planned around it needs to see that it will not happen, and a missing row reads as a
    // programme that never had it.
    expect(screen.getByRole('link', { name: 'Closing Remarks' })).toBeInTheDocument()
    const other = screen.getByRole('link', { name: 'Closing Remarks' }).closest('li')
    expect(within(other as HTMLElement).queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('marks the detail panel, and closes the Q&A composer while leaving questions readable', async () => {
    const user = userEvent.setup()
    const questions = questionsDouble()

    renderAgenda({
      sessions: [CANCELLED, LATER],
      overrides: { questions: questions.repository },
    })

    await user.click(await screen.findByRole('link', { name: 'Cancelled Keynote' }))
    const panel = await screen.findByRole('dialog')

    expect(
      await within(panel).findByRole('heading', { level: 2, name: 'Cancelled Keynote' }),
    ).toBeInTheDocument()
    expect(within(panel).getByText('Cancelled')).toBeInTheDocument()

    // FR-1021's other half, said on screen: nothing anybody wrote is destroyed, and the composer
    // is closed rather than the section hidden. A hidden section would read as "there were never
    // any questions" to somebody who asked one.
    expect(await within(panel).findByText(/no new questions can be asked/i)).toBeInTheDocument()
    expect(within(panel).getByText(/stay where they are/i)).toBeInTheDocument()
    expect(
      within(panel).queryByRole('button', { name: /post|ask/i }),
      'the composer is still on a cancelled session',
    ).not.toBeInTheDocument()

    // The section itself remains, so existing questions are still reachable.
    expect(within(panel).getByRole('heading', { name: /audience questions/i })).toBeInTheDocument()
  })

  it('leaves the session removable from the saved list (FR-1023)', async () => {
    const user = userEvent.setup()
    const rendered = renderAgenda({ sessions: [CANCELLED, LATER], saved: [CANCELLED.id] })

    await user.click(
      await screen.findByRole('button', { name: /remove cancelled keynote from your agenda/i }),
    )

    // An attendee must be able to tidy their own agenda after somebody else cancelled something.
    // Locking the row would leave them with a permanent entry they cannot act on.
    expect(rendered.saved.calls).toContainEqual({ op: 'unsave', sessionId: CANCELLED.id })
  })
})

describe('a cancelled session on Home', () => {
  /**
   * Pinned for the reason `next-saved-session-card.test.tsx` records at length: `nextSession`
   * compares **venue dates**, so a session built from a real clock lands on the next Madrid day
   * for roughly one hour in twenty-four and the card correctly renders "nothing left today"
   * while the test demands a title. 18:00Z is 20:00 Madrid on day one, before both fixtures.
   */
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-14T18:00:00.000Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  const renderHome = (cards: readonly (typeof upNextCard)[], { saved = [] as string[] } = {}) =>
    render(
      <WithServices
        services={testServices({
          catalog: {
            listSessions: async () => [CANCELLED, LATER],
            listTracks: async () => [],
          },
          savedSessions: {
            listSaved: async () =>
              saved.map((sessionId) => ({ sessionId, changedSinceViewed: false })),
            save: async () => {},
            unsave: async () => {},
            markViewed: async () => {},
          },
        })}
      >
        <ActiveEventProvider>
          <MemoryRouter>
            <HomeShell cards={[...cards]} activeEvent={{ status: 'ready', event: SUMMIT }} />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

  it('SKIPS it in Up next, naming the session after it instead (FR-1022a, SC-1002)', async () => {
    renderHome([upNextCard])

    // The cancelled session is chronologically next and is deliberately not the answer.
    expect(await screen.findByText('Closing Remarks')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled Keynote')).not.toBeInTheDocument()
  })

  it('SKIPS it in the next-saved-session card, which shares the one change point (R8)', async () => {
    renderHome([nextSavedSessionCard], { saved: [CANCELLED.id, LATER.id] })

    // Both cards call `nextSession`. Asserting only one of them would leave the other free to
    // grow its own filter, which is the duplication research R8 exists to prevent.
    expect(await screen.findByText('Closing Remarks')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled Keynote')).not.toBeInTheDocument()
  })

  it('STILL LISTS it in the rest-of-day timeline, marked (FR-1022, T055)', async () => {
    renderHome([restOfDayCard])

    // The opposite of the two above, from the same data. An attendee whose evening was cancelled
    // needs to see that in the timeline they are reading; omitting it would make the evening look
    // like it always had a gap.
    const cancelled = await screen.findByText('Cancelled Keynote')
    const row = cancelled.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Cancelled')).toBeInTheDocument()
  })
})
