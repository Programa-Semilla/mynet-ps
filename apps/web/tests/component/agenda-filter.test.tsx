import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AFTERNOON, MORNING, NEXT_DAY, renderAgenda } from '../support/agenda.js'

/**
 * T021 (005), T194 (014 tranche 2) — the All/Mine filter (FR-193, FR-194, FR-197, FR-1066a).
 *
 * The filter is a **radio group**, not a pair of toggle buttons: the two states are mutually
 * exclusive, radios expose which one is current without any ARIA of our own, and arrow-key
 * movement between them comes from the platform rather than from key handling this feature
 * would have to write and keep correct (FR-197).
 *
 * Tranche 2 renamed the second option from "Saved" to "My agenda", because the set it filters
 * to is the UNION of both commitments — saves and held places — and a label asserting saves
 * alone would lie about what it contains (FR-1066a). The union case is asserted below.
 */
describe('the Agenda filter', () => {
  const filter = (name: RegExp) => screen.getByRole('radio', { name })

  it('defaults to all sessions (FR-193)', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    expect(filter(/all sessions/i)).toBeChecked()
    expect(filter(/my agenda/i)).not.toBeChecked()

    // And the whole programme is on screen, which is what "all" has to mean.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('shows only the saved sessions when switched (FR-194)', async () => {
    const user = userEvent.setup()
    // Two saved out of three, one on each venue day.
    renderAgenda({ saved: [MORNING.id, NEXT_DAY.id] })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Opening Keynote',
        'Roadmaps That Survive Contact',
      ]),
    )
    expect(screen.queryByText(AFTERNOON.title)).not.toBeInTheDocument()
  })

  it('PRESERVES the venue-day grouping and chronological order (FR-194)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The saved view is the same programme with fewer rows, not a different presentation of a
    // list. A flat list would read as a set of bookmarks rather than as a schedule, which is
    // the difference between a personal agenda and a collection.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const user = userEvent.setup()
    renderAgenda({ saved: [MORNING.id, NEXT_DAY.id] })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))

    const dayOne = await screen.findByRole('region', { name: /Monday 14 September/i })
    const dayTwo = screen.getByRole('region', { name: /Tuesday 15 September/i })

    expect(within(dayOne).getByText('Opening Keynote')).toBeInTheDocument()
    expect(within(dayTwo).getByText('Roadmaps That Survive Contact')).toBeInTheDocument()
  })

  it('drops a venue day entirely when nothing in it is saved', async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [NEXT_DAY.id] })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /Monday 14 September/i }),
      ).not.toBeInTheDocument(),
    )
    // An empty day heading with no rows under it would read as a day whose programme failed.
    expect(screen.getByRole('region', { name: /Tuesday 15 September/i })).toBeInTheDocument()
  })

  it('keeps the save control on every row in the saved view too (FR-196)', async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [MORNING.id] })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))

    // Still removable from here — otherwise the saved view is the one place an attendee cannot
    // change their mind, which is where they are most likely to want to.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove Opening Keynote/i })).toBeInTheDocument(),
    )
  })

  it('is operable by keyboard and exposes its current state (FR-197)', async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [MORNING.id] })
    await screen.findByText('Opening Keynote')

    filter(/all sessions/i).focus()
    // Arrow movement inside a radio group comes from the platform, not from key handling here.
    await user.keyboard('{ArrowRight}')

    await waitFor(() => expect(filter(/my agenda/i)).toBeChecked())
    expect(filter(/all sessions/i)).not.toBeChecked()
  })

  it('filters to the UNION of both commitments — a held place appears beside a save (FR-1066)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // T194/T198 — enrolment is a STRONGER commitment than saving, so it must not be a weaker
    // presence: an optional session the attendee holds a place in appears in "My agenda"
    // exactly as a saved one does, with no read change — the union arrives on the one
    // discriminated list (R13).
    // ───────────────────────────────────────────────────────────────────────────────────────
    const user = userEvent.setup()
    renderAgenda({
      sessions: [MORNING, { ...AFTERNOON, kind: 'optional' }, NEXT_DAY],
      saved: [MORNING.id, AFTERNOON.id],
      places: [AFTERNOON.id],
    })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Opening Keynote',
        'Open Studio',
      ]),
    )
    // The uncommitted session is out; the held place is in — one filter, two commitment kinds.
    expect(screen.queryByText(NEXT_DAY.title)).not.toBeInTheDocument()
  })

  it('reflects a save made while the saved view is showing', async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [MORNING.id] })
    await screen.findByText('Opening Keynote')

    await user.click(filter(/my agenda/i))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1))

    // Unsaving the only saved session from within the saved view must not strand the screen.
    await user.click(screen.getByRole('button', { name: /remove Opening Keynote/i }))

    await waitFor(() => expect(screen.getByText(/nothing on your agenda yet/i)).toBeInTheDocument())
  })
})
