import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CancelDialog } from '../../src/app/conferences/CancelDialog.js'
import { adminSession } from '../support/services.js'

/**
 * T-review (014) — **the dialog that decides between cancelling and deleting** (FR-1018,
 * FR-1019, FR-1025, constitution v5.2.0 N5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS COMPONENT HAD NO TEST OF ANY KIND, AND IT CARRIES THE ONE RULE THIS FEATURE WAS
 * AMENDED TO ADD.**
 *
 * v5.2.0's N5 is a correction of a live hazard rather than a preference: `saved_sessions`,
 * `session_notes`, `session_questions` and `question_votes` each cascade from `sessions.id`, so
 * before 014 a single `DELETE` destroyed four kinds of other people's private writing with no
 * confirmation and no record. The server refuses it under a `FOR UPDATE` lock — that is the
 * guarantee. **This dialog is what makes the refusal comprehensible before an organizer meets
 * it**, and its load-bearing rule is that "Delete it permanently" renders *only* when engagement
 * is zero, so nobody is ever offered a control that answers 409.
 *
 * A deep review found nothing asserted it. `e2e/authoring.spec.ts` writes the rule out as a
 * **comment** and then only clicks "Cancel the session"; it never checks that the delete button
 * is absent, and the un-engaged branch was never rendered by any test at all. Inverting
 * `engaged`, or rendering the button unconditionally, shipped green.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **BOTH BRANCHES, AND THE ABSENCE IS THE ASSERTION.**
 *
 * A test that only rendered the engaged branch and found the counts would pass against a dialog
 * that offered deletion beside them. The pairing is what pins the rule: the button is present in
 * exactly one branch and absent in the other, and neither half means anything alone.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const DELETE_LABEL = /delete it permanently/i
const CANCEL_LABEL = /cancel the session/i

const renderDialog = (over: Parameters<typeof adminSession>[0] = {}, props = {}) => {
  const onCancelSession = vi.fn()
  const onDeleteSession = vi.fn()
  const onClose = vi.fn()

  render(
    <CancelDialog
      open
      session={adminSession(over)}
      busy={false}
      failure={null}
      onCancelSession={onCancelSession}
      onDeleteSession={onDeleteSession}
      onClose={onClose}
      {...props}
    />,
  )

  return { onCancelSession, onDeleteSession, onClose }
}

describe('a session nobody has engaged with', () => {
  it('offers deletion, because that is exactly when the server permits it (FR-1018)', () => {
    renderDialog({ engagement: { saved: 0, notes: 0, questions: 0, votes: 0 } })

    expect(screen.getByRole('button', { name: DELETE_LABEL })).toBeVisible()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeVisible()
  })

  it('says so in words rather than by showing four zeroes', () => {
    renderDialog()

    // The empty state is a sentence, not a list of noughts. An organizer reading "0 saved this
    // session" four times has to do the arithmetic themselves to learn that deletion is safe.
    expect(screen.getByText(/nobody has saved this session/i)).toBeVisible()
  })

  it('reports the delete to its caller', async () => {
    const { onDeleteSession } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: DELETE_LABEL }))
    expect(onDeleteSession).toHaveBeenCalledOnce()
  })
})

describe('a session attendees have engaged with', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE ASSERTION THE FEATURE WAS AMENDED FOR.**
   *
   * Four separate cases, one per kind of engagement, because the rule is that **any** of them is
   * enough. A single fixture with all four set would pass against a dialog that summed only
   * `saved` — and `saved` is the one an organizer would most often see, so the three that broke
   * would break quietly.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it.each([
    ['a saved session', { saved: 1, notes: 0, questions: 0, votes: 0 }],
    ['a private note', { saved: 0, notes: 1, questions: 0, votes: 0 }],
    ['a question', { saved: 0, notes: 0, questions: 1, votes: 0 }],
    ['a vote', { saved: 0, notes: 0, questions: 0, votes: 1 }],
  ])('withholds deletion when the only engagement is %s', (_what, engagement) => {
    renderDialog({ engagement })

    expect(
      screen.queryByRole('button', { name: DELETE_LABEL }),
      'The dialog offered deletion for a session somebody has engaged with. The server refuses ' +
        'it (FR-1019), so this is a control that can only ever answer 409 — and the organizer ' +
        'would learn v5.2.0 N5’s rule from a refusal rather than from the screen.',
    ).toBeNull()

    // Cancelling is always available, and is the act the dialog leads with.
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeVisible()
  })

  it('states what is attached, as four separate facts (FR-1025)', () => {
    renderDialog({ engagement: { saved: 12, notes: 4, questions: 3, votes: 9 } })

    // A list rather than a sentence, so a screen reader announces four facts. Zeroes are included
    // deliberately elsewhere — here every number is non-zero and each must appear.
    expect(screen.getByText(/12 saved this session/i)).toBeVisible()
    expect(screen.getByText(/4 wrote a private note/i)).toBeVisible()
    expect(screen.getByText(/3 asked a question/i)).toBeVisible()
    expect(screen.getByText(/9 upvoted a question/i)).toBeVisible()
  })

  it('names nobody, and has no field that could (FR-1025, FR-1042)', () => {
    const { container } = render(
      <CancelDialog
        open
        session={adminSession({ engagement: { saved: 12, notes: 4, questions: 3, votes: 9 } })}
        busy={false}
        failure={null}
        onCancelSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Counts only. The server sends no identity and has no route that would, and this is the
    // surface where one would first be tempting — "who saved it" is the obvious next question.
    expect(container.textContent).not.toMatch(/@|attendee-|[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  it('explains that cancelling keeps what they wrote', () => {
    renderDialog({ engagement: { saved: 1, notes: 0, questions: 0, votes: 0 } })

    // Decision 44's whole rule, at the moment an organizer meets it. Without this sentence the
    // dialog says only "no", and the safe act reads as a lesser version of the one refused.
    expect(screen.getByText(/cancelling keeps everything they wrote/i)).toBeVisible()
  })

  it('reports the cancel to its caller', async () => {
    const { onCancelSession, onDeleteSession } = renderDialog({
      engagement: { saved: 1, notes: 0, questions: 0, votes: 0 },
    })

    await userEvent.click(screen.getByRole('button', { name: CANCEL_LABEL }))
    expect(onCancelSession).toHaveBeenCalledOnce()
    expect(onDeleteSession).not.toHaveBeenCalled()
  })
})

describe('the dialog’s other required states', () => {
  it('renders the server’s refusal as an alert', () => {
    render(
      <CancelDialog
        open
        session={adminSession()}
        busy={false}
        failure="Attendees have engaged with this session — cancel it instead."
        onCancelSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // `role="alert"` rather than plain text: the refusal arrives after the organizer has pressed
    // something, so it has to be announced rather than merely appear.
    expect(screen.getByRole('alert')).toHaveTextContent(/cancel it instead/i)
  })

  it('disables both acts while a write is in flight', () => {
    render(
      <CancelDialog
        open
        session={adminSession()}
        busy
        failure={null}
        onCancelSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeDisabled()
    expect(screen.getByRole('button', { name: DELETE_LABEL })).toBeDisabled()
  })

  it('offers a way out that does neither', async () => {
    const { onClose, onCancelSession, onDeleteSession } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: /keep it as it is/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onCancelSession).not.toHaveBeenCalled()
    expect(onDeleteSession).not.toHaveBeenCalled()
  })

  it('renders nothing at all with no session', () => {
    // `ProgrammeEditor` keeps this mounted and passes `session={removing}`, which is null until a
    // row's control is pressed. A dialog that rendered a heading for a null session would put
    // “Remove “undefined”?” on screen.
    const { container } = render(
      <CancelDialog
        open={false}
        session={null}
        busy={false}
        failure={null}
        onCancelSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
