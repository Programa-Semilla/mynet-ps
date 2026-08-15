import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openNotePanel } from '../support/notes.js'

/**
 * T045 (005) — **the status never reads Saved before the write resolves** (FR-210, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE TEST THAT KEEPS THIS FEATURE NON-OPTIMISTIC.**
 *
 * `saved` may be entered only from a resolved write. Entering it when the attendee stops
 * typing would be an optimistic update — which the constitution requires be decided and
 * recorded separately, and which this feature deliberately does not do — and it would also be
 * a lie the attendee cannot detect until they reload and find their note gone.
 *
 * The write is held open here on purpose, so the window between "the attendee stopped typing"
 * and "the server confirmed" is a real interval the assertions can sit inside. An
 * implementation that reported `saved` on the keystroke would pass every other test in this
 * feature and fail only this one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the note status', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('goes idle → saving → saved, and reaches Saved ONLY on the response', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()

    const field = screen.getByRole('textbox', { name: /private notes/i })

    // Before anything is typed: nothing is claimed about the server.
    expect(screen.getByRole('status')).toHaveTextContent(/save automatically/i)

    await user.type(field, 'Ask about the migration path.')

    // ── Still within the debounce: no write has been attempted yet ─────────────────────────
    expect(notes.writes).toHaveLength(0)
    expect(
      screen.getByRole('status'),
      'Typing must not report the note as saved — nothing has been sent, let alone confirmed.',
    ).not.toHaveTextContent(/^Saved\.$/)

    // ── The pause elapses, and the write goes out and is HELD ──────────────────────────────
    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saving/i))

    // The window that matters. The attendee has stopped typing, the request is in flight, and
    // the server has said nothing. The status must not claim success here.
    expect(
      screen.getByRole('status'),
      'Saved must be entered from a resolved write, never from the keystroke (FR-210).',
    ).not.toHaveTextContent(/^Saved\.$/)

    // ── The server confirms ────────────────────────────────────────────────────────────────
    notes.resolveWrite(0)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))
  })

  it('returns to a non-committal status when typing resumes after a save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()
    const field = screen.getByRole('textbox', { name: /private notes/i })

    await user.type(field, 'First.')
    await vi.advanceTimersByTimeAsync(1300)
    notes.resolveWrite(0)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))

    await user.type(field, ' More.')

    // The text on screen is no longer the text the server confirmed, so `Saved.` would now be
    // wrong in exactly the way FR-210 forbids.
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent(/^Saved\.$/))
  })

  it('does not write on every keystroke (FR-209)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()

    await user.type(screen.getByRole('textbox', { name: /private notes/i }), 'A whole sentence.')

    // Seventeen characters, no writes yet — the debounce is what stops a note costing one
    // request per character.
    expect(notes.writes).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))
    expect(notes.writes[0]?.body).toBe('A whole sentence.')
  })

  it('waits inside FR-209’s 500ms–3s band', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()

    await user.type(screen.getByRole('textbox', { name: /private notes/i }), 'x')

    // Below the floor: too eager, and the note would be written mid-word.
    await vi.advanceTimersByTimeAsync(499)
    expect(notes.writes).toHaveLength(0)

    // Above the ceiling: too lazy, and FR-209's "survives an unexpected loss of the page"
    // stops being true in practice.
    await vi.advanceTimersByTimeAsync(3_000 - 499 + 50)
    await waitFor(() => expect(notes.writes).toHaveLength(1))
  })

  it('IGNORES a stale response that arrives after a newer one (FR-214, T048)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The companion to the pure-logic test in `tests/unit/note-autosave.test.ts`. That one
    // pins the rule; this one drives the **real hook** through a genuine interleaving, so the
    // rule cannot be correct in isolation while the code that applies it has drifted.
    //
    // The dangerous direction is asserted: an *older* write failing after a *newer* one
    // succeeded must not tell the attendee their note is lost when it is safely stored.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()
    const field = screen.getByRole('textbox', { name: /private notes/i })

    await user.type(field, 'First version.')
    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))

    await user.type(field, ' Second version.')
    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(2))

    // The newer write lands first and is honoured.
    notes.resolveWrite(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))

    // The older one finally answers — with a failure. It must be ignored entirely.
    notes.rejectWrite(0, new Error('the slow one, answering last'))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))
    expect(
      screen.queryByRole('alert'),
      'A stale failure must not tell the attendee their note is lost when a later write has ' +
        'already stored it.',
    ).not.toBeInTheDocument()
    expect(field).toHaveValue('First version. Second version.')
  })

  it('announces the status politely rather than conveying it by colour alone', async () => {
    await openNotePanel()

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')

    // And it is bound to the field, so a screen reader reaching the editor is told where the
    // note stands without having to go looking for the message.
    const field = screen.getByRole('textbox', { name: /private notes/i })
    expect(field.getAttribute('aria-describedby')).toBe(status.getAttribute('id'))
  })
})
