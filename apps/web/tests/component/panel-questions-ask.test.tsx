import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { aQuestion, openQuestionPanel, refusal } from '../support/questions.js'

/**
 * T038, T039 (009) — the composer, and the empty state
 * (FR-704, FR-706, FR-707, FR-727, FR-739, FR-759).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE POST CONTROL IS DISABLED, NEVER A POST-SUBMIT ERROR** (FR-704).
 *
 * `requirements.md` names this treatment among the required states, for the empty message and
 * the empty meeting topic; a question is the same shape of field. Asserting it here matters
 * because the *server* also refuses an empty body and the column refuses it a third time — so an
 * implementation that dropped the disabled attribute would still be safe, still pass every
 * integration test, and be wrong in exactly the way the requirement names.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the question composer', () => {
  const post = () => screen.getByRole('button', { name: /post question/i })
  const field = () => screen.getByRole('textbox', { name: /ask a question/i })

  it('disables the post control while the field is empty (FR-704)', async () => {
    await openQuestionPanel()
    expect(post()).toBeDisabled()
  })

  it('keeps it disabled for whitespace, which the server also refuses (FR-704, FR-705)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel()

    await user.type(field(), '   ')
    expect(
      post(),
      'Whitespace is not a question. Enabling here would send a body the route and the column ' +
        'both refuse, turning a preventable state into a rejection the attendee has to read.',
    ).toBeDisabled()

    // And nothing was attempted, which is the half a disabled attribute alone does not prove.
    expect(questions.writes).toHaveLength(0)
  })

  it('enables it as soon as there is something to ask', async () => {
    const user = userEvent.setup()
    await openQuestionPanel()

    await user.type(field(), 'What broke first?')
    expect(post()).toBeEnabled()
  })

  it('shows the remaining allowance BEFORE the limit is reached (FR-706)', async () => {
    const user = userEvent.setup()
    await openQuestionPanel()

    /**
     * Pasted rather than typed, for the long values.
     *
     * `user.type` dispatches one event per character, so 450 of them took seconds and timed the
     * test out under full-suite load — a flake in the test rather than in the product, and one
     * that took a neighbouring file down with it. Pasting is also the truer gesture: nobody
     * types 450 characters into a question field, they paste a quotation or a URL.
     */
    const fill = async (value: string) => {
      await user.clear(field())
      await user.click(field())
      await user.paste(value)
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // FR-706 requires the attendee to learn of the limit while there is still room to act on
    // it. A counter that appeared at the last character would be an announcement rather than a
    // warning — so the assertion is about the *absence* first.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await fill('x'.repeat(200))
    expect(screen.queryByText(/characters? left/i)).not.toBeInTheDocument()

    await fill('x'.repeat(450))
    expect(screen.getByText(/50 characters left/i)).toBeInTheDocument()
  })

  it('clears the field on success and NOT on failure (FR-707, FR-759, SC-712)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel()

    await user.click(field())
    await user.paste('Does this survive a refusal?')
    await user.click(post())

    await waitFor(() => expect(questions.writes).toHaveLength(1))
    expect(questions.writes[0]).toEqual({ kind: 'ask', value: 'Does this survive a refusal?' })

    // ── The refusal path first, because it is the one that loses work if it is wrong ────────
    questions.rejectWrite(
      0,
      refusal('offline', 'That needs a connection. Nothing has been sent, and nothing queued.'),
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(
      field(),
      'A failed post cleared the field. The attendee has lost the thing they wrote, and the ' +
        'message says nothing was sent — so there is nothing to recover it from (SC-712).',
    ).toHaveValue('Does this survive a refusal?')

    // ── And the success path does clear it ──────────────────────────────────────────────────
    await user.click(post())
    await waitFor(() => expect(questions.writes).toHaveLength(2))
    questions.resolveWrite(1, [aQuestion({ body: 'Does this survive a refusal?' })])

    await waitFor(() => expect(field()).toHaveValue(''))
  })

  it('does NOT wipe a question typed while the previous one is in flight (FR-707, SC-712)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **Found end-to-end, fixed here, and pinned so it cannot come back.**
    //
    // The clear lands whenever the response does, which may be a second later. An attendee who
    // starts typing their next question while the first is still in flight — entirely ordinary
    // at a keynote — had that text wiped by the *previous* request's success, with nothing on
    // screen to say where it went. The symptom was a permanently disabled post control sitting
    // above an empty field the attendee had just typed into.
    //
    // The write is held open here on purpose, so the interval between submitting and the server
    // answering is a real window the assertions can sit inside.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel()

    await user.click(field())
    await user.paste('The first question.')
    await user.click(post())
    await waitFor(() => expect(questions.writes).toHaveLength(1))

    // The response has NOT arrived, and the attendee is already typing the next one.
    await user.clear(field())
    await user.click(field())
    await user.paste('The second question, typed while the first was in flight.')

    // Now the first one lands.
    questions.resolveWrite(0, [aQuestion({ body: 'The first question.' })])

    await waitFor(() => expect(screen.getByText('The first question.')).toBeInTheDocument())

    expect(
      field(),
      "the previous request's success cleared a question the attendee was still typing",
    ).toHaveValue('The second question, typed while the first was in flight.')

    // …and the control is usable, which is the symptom that made this findable at all.
    expect(post()).toBeEnabled()
  })

  it('trims before sending, so the stored question is the one on screen (FR-705)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel()

    await user.click(field())
    await user.paste('   Why this order?   ')
    await user.click(post())

    await waitFor(() => expect(questions.writes).toHaveLength(1))
    expect(questions.writes[0]?.value).toBe('Why this order?')
  })

  it('tells the attendee their name goes with it, BEFORE they post (FR-739)', async () => {
    await openQuestionPanel()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The one consequence of this feature an attendee cannot take back once a vote arrives.**
    // It is stated at the point of asking rather than afterwards, because afterwards it is a
    // fact they discover by seeing their own name on a public list.
    //
    // Bound to the field with `aria-describedby`, so a screen reader meets it on reaching the
    // textarea rather than having to go looking — asserted rather than assumed, since a notice
    // rendered nearby but unassociated reads as decoration to assistive technology.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const notice = screen.getByText(/shown to everyone at this conference with your name/i)
    expect(notice).toBeInTheDocument()
    expect(field().getAttribute('aria-describedby')).toBe(notice.getAttribute('id'))
  })
})

describe('the empty state', () => {
  it('invites the first question rather than rendering a blank area (FR-727)', async () => {
    await openQuestionPanel()

    // A blank region and "nobody has asked anything" are the same pixels to somebody who does
    // not already know the feature exists. The empty state has to say what to do.
    expect(screen.getByText(/no questions yet/i)).toBeInTheDocument()
    expect(screen.getByText(/ask the first one/i)).toBeInTheDocument()
  })

  it('is replaced by the list once a question exists', async () => {
    await openQuestionPanel([aQuestion()])

    expect(screen.queryByText(/no questions yet/i)).not.toBeInTheDocument()
    expect(screen.getByText('How did you decide what to migrate first?')).toBeInTheDocument()
  })
})
