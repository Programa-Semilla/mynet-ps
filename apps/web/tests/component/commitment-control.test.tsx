import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AFTERNOON, MORNING, NEXT_DAY, renderAgenda } from '../support/agenda.js'

/**
 * T208, T147 (014 tranche 2) — the ONE commitment control, its identity decided by the
 * session's kind, and the pre-enrolment notice in front of taking a place
 * (FR-1063, FR-1067, FR-1074, SC-1013).
 */

/** The programme with one optional session, so both control identities render side by side. */
const OPTIONAL = { ...AFTERNOON, kind: 'optional' as const }
const MIXED = [MORNING, OPTIONAL, NEXT_DAY]

describe('the commitment control (FR-1063)', () => {
  it('offers save on a mandatory session and take-a-place on an optional one — one control each', async () => {
    renderAgenda({ sessions: MIXED })
    await screen.findByText('Opening Keynote')

    // The mandatory session's control is the save control, exactly as 005 shipped it.
    expect(
      screen.getByRole('button', { name: 'Save Opening Keynote to your agenda' }),
    ).toBeInTheDocument()

    // The optional session's control is enrolment — and there is NO save control for it, which
    // is FR-1064's absence at the surface: no route to a saved optional session.
    expect(screen.getByRole('button', { name: 'Take a place in Open Studio' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save Open Studio/i }),
      'An optional session offers a save control. Enrolment REPLACES saving there (FR-1063); ' +
        'a bookmark beside a reservation is read as a reservation, and the person who reads it ' +
        'that way finds out by arriving at a full room (FR-1064).',
    ).not.toBeInTheDocument()
  })

  it('shows the FR-1074 notice BEFORE enrolling, and enrols only on confirmation', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ sessions: MIXED })
    await screen.findByText('Open Studio')

    await user.click(screen.getByRole('button', { name: 'Take a place in Open Studio' }))

    // The notice is a real modal dialog, and it tells the attendee WHO will see WHAT: their
    // name, the organizers of this conference. Nothing has been written yet.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/your name/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/organizers of this conference/i)).toBeInTheDocument()
    expect(saved.calls.map((call) => call.op)).not.toContain('enrol')

    await user.click(within(dialog).getByRole('button', { name: 'Take a place' }))

    await waitFor(() => expect(saved.calls.map((call) => call.op)).toContain('enrol'))
    // The write is the enrolment write, never the save write (FR-1063, FR-1064).
    expect(saved.calls.map((call) => call.op)).not.toContain('save')
  })

  it('cancelling the notice enrols nobody and keeps the displayed state', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ sessions: MIXED })
    await screen.findByText('Open Studio')

    await user.click(screen.getByRole('button', { name: 'Take a place in Open Studio' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    // Declining by not acting is the whole point of the notice (v5.3.0 O1): nothing written,
    // nothing queued, and the control still offers the place.
    expect(saved.calls).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Take a place in Open Studio' })).toBeInTheDocument()
  })

  it('Escape dismisses the notice and focus returns to the control that opened it', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ sessions: MIXED })
    await screen.findByText('Open Studio')

    const opener = screen.getByRole('button', { name: 'Take a place in Open Studio' })
    await user.click(opener)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(opener).toHaveFocus())
    expect(saved.calls).toHaveLength(0)
  })

  it('releasing a held place asks nothing — the notice is about DISCLOSURE, not withdrawal', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({
      sessions: MIXED,
      saved: [OPTIONAL.id],
      places: [OPTIONAL.id],
    })
    await screen.findByText('Open Studio')

    // Held: the control offers release, directly. Withdrawing REDUCES what is shared, so a
    // confirmation gate here would be friction in front of the attendee's own exit (FR-1067).
    await user.click(screen.getByRole('button', { name: 'Release your place in Open Studio' }))

    await waitFor(() => expect(saved.calls.map((call) => call.op)).toContain('release'))
    expect(saved.calls.map((call) => call.op)).not.toContain('unsave')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a refused enrolment renders the server’s own sentence, and the state does not change', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ sessions: MIXED })
    await screen.findByText('Open Studio')

    const { RequestRefusedError } = await import('@mynet/data')
    saved.failWrites(
      new RequestRefusedError(
        'session_full',
        'This session is full — every place is taken. If somebody releases one, it becomes available immediately.',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Take a place in Open Studio' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Take a place' }),
    )

    // The server's sentence, verbatim — classified on `error.code`, never the class (FR-1069).
    expect(await screen.findByRole('alert')).toHaveTextContent(/this session is full/i)
    // Non-optimistic (FR-217): the control still offers the place, because that is the truth.
    expect(screen.getByRole('button', { name: 'Take a place in Open Studio' })).toBeInTheDocument()
  })

  it('presents a cancelled optional session exactly as a cancelled mandatory one (FR-1022)', async () => {
    renderAgenda({
      sessions: [MORNING, { ...OPTIONAL, cancelled: true }, NEXT_DAY],
      saved: [OPTIONAL.id],
      places: [OPTIONAL.id],
    })
    await screen.findByText('Open Studio')

    // The cancelled presentation is the kind-independent one: the word, in text, on the row —
    // and the commitment control still present so the attendee can withdraw from it.
    const row = screen.getByText('Open Studio').closest('li') as HTMLElement
    expect(within(row).getByText('Cancelled')).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Release your place in Open Studio' }),
    ).toBeInTheDocument()
  })
})
