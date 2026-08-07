import { OfflineError } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openNotePanel } from '../support/notes.js'

/**
 * T046 (005) — a failed note write **leaves the attendee's text on screen**, says it is not
 * saved, tells offline from a server fault, and offers a retry (FR-211, FR-218).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"The attendee is never told it is safe when it is not"** — the spec's own Edge Case, and
 * the thing this file exists to hold.
 *
 * The text is the part people lose. A failure that cleared the field, or that reverted it to
 * the last saved version, would destroy exactly what the attendee was in the middle of writing
 * — and would do it at the moment they are least able to recover it, since it was never sent
 * anywhere.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a failed note write', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const typeAndFail = async (error: Error) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { notes } = await openNotePanel()

    const field = screen.getByRole('textbox', { name: /private notes/i })
    await user.type(field, 'Something worth keeping.')

    await vi.advanceTimersByTimeAsync(1300)
    await waitFor(() => expect(notes.writes).toHaveLength(1))

    notes.rejectWrite(0, error)
    await screen.findByRole('alert')

    return { user, notes, field }
  }

  it('LEAVES THE TEXT ON SCREEN (FR-211)', async () => {
    const { field } = await typeAndFail(new Error('server fault'))

    expect(
      field,
      'A failure must not discard what the attendee wrote. It was never sent anywhere, so ' +
        'clearing the field destroys the only copy.',
    ).toHaveValue('Something worth keeping.')
  })

  it('states plainly that the note is not saved', async () => {
    await typeAndFail(new Error('server fault'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/not saved/i)
    // And it does not simultaneously claim success anywhere.
    expect(screen.queryByText(/^Saved\.$/)).not.toBeInTheDocument()
  })

  it('DISTINGUISHES no connection from a server fault (FR-218)', async () => {
    await typeAndFail(new OfflineError('Saving your note'))

    const offline = await screen.findByRole('alert')
    expect(offline).toHaveTextContent(/no connection/i)
    expect(
      offline,
      'Reporting a connection problem as a server fault, or the reverse, sends the attendee to ' +
        'fix the wrong thing.',
    ).not.toHaveTextContent(/our side/i)
  })

  it('words a server fault as ours, not theirs', async () => {
    await typeAndFail(new Error('server fault'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/our side/i)
    expect(alert).toHaveTextContent(/not with your account/i)
  })

  it('offers a retry that writes again immediately (FR-211)', async () => {
    const { user, notes } = await typeAndFail(new Error('server fault'))

    await user.click(screen.getByRole('button', { name: /try again/i }))

    // Immediately — not after another debounce. The attendee has already decided.
    await waitFor(() => expect(notes.writes).toHaveLength(2))
    expect(notes.writes[1]?.body).toBe('Something worth keeping.')

    notes.resolveWrite(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved\.$/))
  })

  it('keeps saying it is unsaved when a retry fails again', async () => {
    const { user, notes } = await typeAndFail(new Error('server fault'))

    await user.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(notes.writes).toHaveLength(2))
    notes.rejectWrite(1, new Error('server fault again'))

    // The spec's Edge Case: "a note whose write fails repeatedly. The text stays on screen and
    // the status keeps saying it is unsaved."
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/not saved/i)
    expect(screen.getByRole('textbox', { name: /private notes/i })).toHaveValue(
      'Something worth keeping.',
    )
  })

  it('announces the failure assertively, because it must interrupt', async () => {
    await typeAndFail(new Error('server fault'))

    // `role="alert"` rather than the polite status line: "your note is not saved" is the one
    // thing here that must reach the attendee before they close the panel.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
