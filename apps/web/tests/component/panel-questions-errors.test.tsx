import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OfflineError } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { aQuestion, openQuestionPanel, READER_ID, refusal } from '../support/questions.js'

/**
 * T043b (009) — **five distinct refusals, five distinct messages** (FR-744, FR-745).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE IS 008'S DEFECT WRITTEN AS A TEST.**
 *
 * `ApiError extends RequestRefusedError`, and **every** non-2xx throws `ApiError` — so an
 * `instanceof` check catches 400, 404, 429 and 500 alike. In 008 that rendered the deliberately
 * reasonless refusal for all of them and **swallowed every message the routes were written to
 * deliver**, which nothing noticed because each refusal still produced *a* message.
 *
 * The only assertion that catches it is one that requires the outcomes to be **different from
 * each other**. A test asserting "an error appears" passes against the broken implementation;
 * so does one asserting each message individually, if the shared fallback happens to match. So
 * the last case here compares the whole set for distinctness, which is the property that fails.
 *
 * This feature has two refusals that exist to be read — withdrawal refused because a vote
 * arrived (FR-714), and a vote refused because the caller is the author (FR-722). Under 008's
 * bug both would be invisible.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('question refusals', () => {
  const MINE = aQuestion({
    id: 'question-mine',
    body: 'A question I asked and might withdraw.',
    authorId: READER_ID,
    authorDisplayName: 'Ada Lovelace',
    canWithdraw: true,
  })

  const THEIRS = aQuestion({ id: 'question-theirs', body: "Somebody else's question." })

  /**
   * Drives a failed upvote and returns what the attendee is told.
   *
   * `cleanup()` first, because the distinctness case below calls this five times inside **one**
   * test. Without it each render is added to the same document and every query matches five
   * elements — which fails as a timeout rather than as anything that names the cause.
   */
  const upvoteFailingWith = async (error: Error): Promise<string> => {
    cleanup()
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([THEIRS])

    await user.click(screen.getByRole('button', { name: /upvote/i }))
    await waitFor(() => expect(questions.writes).toHaveLength(1))
    questions.rejectWrite(0, error)

    const alert = await screen.findByRole('alert')
    return alert.textContent ?? ''
  }

  it('renders the withdrawal refusal with its own reason (FR-714, FR-744)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([MINE])

    await user.click(screen.getByRole('button', { name: /withdraw/i }))

    // Scoped to the dialog: its confirmation carries the same word as the control that opened
    // it, so an unscoped query matches both and cannot say which one it clicked.
    const dialog = await screen.findByRole('dialog', { name: /withdraw this question/i })
    await user.click(within(dialog).getByRole('button', { name: /^withdraw$/i }))

    await waitFor(() => expect(questions.writes).toHaveLength(1))
    questions.rejectWrite(
      0,
      refusal(
        'question_has_votes',
        'This question cannot be withdrawn now that somebody has upvoted it.',
      ),
    )

    // The server's own sentence, reaching the attendee intact. Under an `instanceof` check this
    // is where the generic refusal would appear instead.
    expect(await screen.findByRole('alert')).toHaveTextContent(/somebody has upvoted it/i)
  })

  it('renders the own-question refusal with its own reason (FR-722, FR-744)', async () => {
    const told = await upvoteFailingWith(
      refusal('own_question', 'You cannot upvote your own question.'),
    )
    expect(told).toMatch(/cannot upvote your own question/i)
  })

  it('renders the indistinguishable 404 without inventing a cause (FR-743)', async () => {
    const told = await upvoteFailingWith(refusal('not_found', 'That is not available.'))

    expect(told).toMatch(/not available/i)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The server refuses "not registered", "another conference" and "does not exist"
    // identically **on purpose**. A client that helpfully explained which had happened would
    // leak exactly what the server refused to, so the absence is asserted rather than assumed.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(told).not.toMatch(/conference|registered|deleted|withdrawn/i)
  })

  it('renders the throttle with its own wait, not a generic failure (FR-746)', async () => {
    const told = await upvoteFailingWith(
      refusal('too_many_attempts', 'Too many upvotes. Try again in 30 seconds.'),
    )

    expect(told).toMatch(/too many upvotes/i)
    expect(told, 'the wait is what makes a throttle actionable').toMatch(/30 seconds/i)
  })

  it('renders a server fault as ours rather than the attendee’s', async () => {
    const told = await upvoteFailingWith(new Error('boom'))
    expect(told).toMatch(/problem on our side/i)
  })

  it('renders the offline refusal, saying nothing was queued (FR-759)', async () => {
    const told = await upvoteFailingWith(new OfflineError('Upvoting'))

    expect(told).toMatch(/connection/i)
    // FR-757, FR-759 — writes are refused, never queued, and the attendee is told so. "We'll
    // send this later" would be a promise no mechanism in this product keeps.
    expect(told).toMatch(/not been queued|nothing has been queued/i)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **The assertion that actually fails against 008's bug.**
   *
   * Each case above passes individually if every refusal renders the *same* generic sentence —
   * `toMatch` on a substring the fallback happens to contain would go green. Distinctness is
   * the property `instanceof` classification destroys, and it can only be checked across the
   * whole set at once.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('keeps all five outcomes distinguishable from one another (FR-745)', async () => {
    const told = [
      await upvoteFailingWith(refusal('own_question', 'You cannot upvote your own question.')),
      await upvoteFailingWith(refusal('not_found', 'That is not available.')),
      await upvoteFailingWith(
        refusal('too_many_attempts', 'Too many upvotes. Try again in 30 seconds.'),
      ),
      await upvoteFailingWith(new Error('boom')),
      await upvoteFailingWith(new OfflineError('Upvoting')),
    ]

    expect(
      new Set(told).size,
      'Two or more refusals rendered the same message. That is what classifying on the error ' +
        'CLASS rather than on `error.code` does: `ApiError extends RequestRefusedError` and ' +
        'every non-2xx throws `ApiError`, so one `instanceof` branch catches 400, 404, 429 and ' +
        '500 alike — which in 008 swallowed every message the routes were written to deliver.',
    ).toBe(5)
  })

  it('leaves the list on screen when a write fails', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The read succeeded; only the action failed. Dropping the whole section to its failure
    // state would replace a perfectly good list of other people's questions because the
    // reader's own upvote was refused — Home's composed-card rule, one level down (SC-715).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await upvoteFailingWith(refusal('not_found', 'That is not available.'))

    expect(screen.getByText("Somebody else's question.")).toBeInTheDocument()
  })
})
