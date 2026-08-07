import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MORNING } from '../support/agenda.js'
import { openNotePanel } from '../support/notes.js'

/**
 * T047 (005) — clearing the text **removes** the note, and reopening shows an empty one
 * (FR-212, FR-213, US3 scenarios 5 and 7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **An emptied note is DELETED, never stored blank.**
 *
 * That is why the column carries `length(body) > 0`: "no note" then has exactly one
 * representation in the database, and no future write path can invent a second by storing `''`.
 * The client half is here — the editor must take the delete path rather than writing an empty
 * body, which the route would refuse anyway.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('clearing a note', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const EXISTING = {
    sessionId: MORNING.id,
    body: 'Notes from the keynote.',
    updatedAt: '2026-09-14T10:22:31.000Z',
  }

  it('shows a stored note when the panel opens (US3 scenario 4)', async () => {
    await openNotePanel([EXISTING])

    expect(screen.getByRole('textbox', { name: /private notes/i })).toHaveValue(
      'Notes from the keynote.',
    )
  })

  it('DELETES rather than writing an empty body (FR-212)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel([EXISTING])

    await user.clear(screen.getByRole('textbox', { name: /private notes/i }))
    await vi.advanceTimersByTimeAsync(1300)

    await waitFor(() => expect(notes.writes).toHaveLength(1))
    expect(
      notes.writes[0]?.body,
      'An empty body must take the delete path. Writing `""` would be refused by the route and ' +
        'by the column, and would mean "no note" had two representations if it ever were not.',
    ).toBeNull()
  })

  it('reports the removal as saved once the server confirms it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel([EXISTING])

    await user.clear(screen.getByRole('textbox', { name: /private notes/i }))
    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))

    // Still not `Saved.` until the server has answered — a deletion is a write like any other.
    expect(screen.getByRole('status')).not.toHaveTextContent(/^Saved\.$/)

    notes.resolveWrite(0)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))
  })

  it('leaves the field empty rather than restoring the old text', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel([EXISTING])

    const field = screen.getByRole('textbox', { name: /private notes/i })
    await user.clear(field)
    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))
    notes.resolveWrite(0)

    // Reopening shows an empty note rather than the old text (US3 scenario 5). Here that is the
    // same assertion: the response must not be allowed to write anything back into the field.
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('offers the editor on a session that is NOT saved (FR-207)', async () => {
    // The harness saves nothing, so this session is unsaved — and the editor is present anyway.
    await openNotePanel()

    expect(screen.getByRole('textbox', { name: /private notes/i })).toBeInTheDocument()
    // Noting and saving are independent: the save control still offers to save.
    expect(
      screen.getByRole('button', { name: /save Opening Keynote to your agenda/i }),
    ).toBeInTheDocument()
  })

  it('tells the attendee they are approaching the limit BEFORE they hit it (FR-213)', async () => {
    const nearLimit = {
      ...EXISTING,
      // Inside the warning band, but well short of the 10,000 limit.
      body: 'x'.repeat(9_800),
    }
    await openNotePanel([nearLimit])

    // The count appears while there is still room to act on it, rather than at the last
    // character — and never as a rejected write.
    expect(screen.getByText(/200 characters left/i)).toBeInTheDocument()
  })

  it('says nothing about the limit while it is far away', async () => {
    await openNotePanel([EXISTING])

    // A permanent counter on a note nobody is close to filling is noise that trains the
    // attendee to ignore it — so it would not be read at the moment it matters.
    expect(screen.queryByText(/characters left/i)).not.toBeInTheDocument()
  })
})
