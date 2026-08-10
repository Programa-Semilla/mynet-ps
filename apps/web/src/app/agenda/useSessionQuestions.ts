import { OfflineError, type QuestionListItem } from '@mynet/data'
import { useQuestionsRepository } from '@mynet/platform'
import { useCallback, useEffect, useState } from 'react'

/**
 * T033, T043a (009) — a session's audience questions, and the four acts on them
 * (FR-727–FR-731, FR-745, FR-748, FR-759).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **STATE IS REPLACED WHOLESALE FROM EACH WRITE'S RESPONSE, NEVER PATCHED LOCALLY**
 * (research R5).
 *
 * Every write resolves to the full re-ordered list, so this hook never computes a count, never
 * re-sorts, and never inserts a row of its own. That is what makes three requirements true at
 * once and none of them by accident:
 *
 *   - **FR-730** — the reader's own action appears immediately, because the response *is* the new
 *     state. There is no second request and no window in which the count is wrong.
 *   - **FR-726** — the order is the server's. A local re-sort would have to reimplement the
 *     `votes DESC, asked_at ASC` tiebreak and could drift from it silently.
 *   - **FR-780** — the list arrives whole and the renderer keys rows on the question id, so a row
 *     that moves is *moved* rather than unmounted, and the control the reader just activated
 *     keeps focus.
 *
 * **There is no optimistic update here**, and that is a constitutional constraint rather than a
 * preference: an optimistic update is a separately recorded decision this feature does not take.
 * A vote is shown as cast only once the server has said so.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE POLLS** (FR-731).
 *
 * No interval, no timer, and no `VisibilityService`. 007's thread poller is one import away and
 * this is deliberately not it: a question list is not a conversation, and a page that refreshed
 * itself under a reader mid-sentence would move the row they were reading. The list refreshes
 * when the reader acts, and `apps/web/tests/unit/qa-absences.test.ts` fails the build if a
 * timer ever appears in this feature's files.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * A refusal the interface can render, reduced to what presentation actually needs.
 *
 * `code` is what the caller branches on; `message` is the server's own sentence, shown as-is
 * because the two refusals that explain themselves were worded to be read.
 */
export interface QuestionFailure {
  readonly code: string
  readonly message: string
}

export interface SessionQuestions {
  readonly status: 'loading' | 'ready' | 'failed'
  /**
   * Whether the failure was an absence of connection rather than a fault on our side (FR-748).
   *
   * Carried rather than re-derived by the components below it, which is 005's rule: a second
   * guess about the cause is exactly the invented information the refusals are careful not to
   * produce.
   */
  readonly offline: boolean
  readonly questions: readonly QuestionListItem[]
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE WRITES RESOLVE TO WHETHER THE SERVER ACCEPTED, AND THAT RETURN VALUE IS LOAD-BEARING
   * FOR FR-707.**
   *
   * `tasks.md` sketched these as `Promise<void>`, on the reasonable-looking assumption that a
   * caller could read `error` afterwards. **It cannot**, and the composer's own test found it:
   * a handler that calls `ask(...)` closes over the `error` value from the render it was
   * created in — which is `null`, because the write had not failed yet. So `if (!error) clear()`
   * clears the field on *every* outcome, including the refusal, and the attendee loses the
   * question they typed with a message on screen saying nothing was sent (SC-712, FR-759).
   *
   * Resolving with the outcome removes the race rather than working around it: the caller learns
   * what happened from the call it made, not from state that has not re-rendered yet. The method
   * names and arguments are unchanged from the sketch; only the fulfilment value narrows.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly ask: (body: string) => Promise<boolean>
  readonly withdraw: (questionId: string) => Promise<boolean>
  readonly toggleVote: (questionId: string, voted: boolean) => Promise<boolean>
  readonly error: QuestionFailure | null
  readonly retry: () => void
  /**
   * Re-read the list **without** dropping to the loading state (FR-785, SC-711a).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * Distinct from `retry`, which is for a failed read and correctly shows a loading state
   * because there is nothing on screen to preserve. This is for a successful action taken
   * *elsewhere* whose effect is server-side only — today, reporting, which blocks the author
   * and therefore removes every question they asked from this reader's list.
   *
   * Without it the reported question stays on screen until the panel is closed and reopened:
   * the block is applied and invisible, which is the half of SC-711a that turns a report into
   * paperwork. Blanking the list to a spinner to achieve that would be a worse answer, since
   * nothing about the other questions changed.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly refresh: () => Promise<void>
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T043a — EVERY REFUSAL IS CLASSIFIED ON `error.code`, NEVER ON THE ERROR CLASS** (FR-745).
 *
 * This is 008's defect, written down so it cannot be repeated by inheritance. `ApiError extends
 * RequestRefusedError` and **every** non-2xx throws `ApiError` — so an `instanceof` check catches
 * 400, 404, 429 and 500 alike. In 008 that rendered the deliberately reasonless refusal for all
 * of them and **swallowed every message the routes were written to deliver.**
 *
 * This feature has *two* refusals that exist to be read — withdrawal refused because a vote
 * arrived (FR-714), and a vote refused because the caller is the author (FR-722) — so the same
 * mistake here would make both invisible, and the attendee would be told nothing while the
 * control silently failed.
 *
 * `OfflineError` is the one thing checked by class, and legitimately: it carries no code because
 * it never reached a server. Everything else is read from `code`, with the server's own sentence
 * passed through. The generic fallback is deliberately the last branch rather than the first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const classify = (cause: unknown): { failure: QuestionFailure; offline: boolean } => {
  if (cause instanceof OfflineError) {
    return {
      offline: true,
      failure: {
        code: 'offline',
        // FR-759 — says plainly that nothing was queued, because the composer keeps the typed
        // text and an attendee who believed it had been sent would not try again.
        message:
          'That needs a connection, and there is not one right now. Nothing has been sent, and nothing has been queued — your question is still here.',
      },
    }
  }

  // Read the code without asking what class carried it. `RequestRefusedError` declares `code`,
  // and anything else reaching here is a fault rather than a refusal.
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : null

  if (code !== null) {
    const message =
      cause instanceof Error && cause.message.length > 0
        ? cause.message
        : 'That could not be done right now.'

    return { offline: false, failure: { code, message } }
  }

  return {
    offline: false,
    failure: {
      code: 'internal_error',
      // Distinguished from the offline sentence above, and from the two explained refusals: this
      // is the one that says the fault is ours rather than the attendee's or their connection's.
      message:
        'Questions could not be loaded. This is a problem on our side, not with your account.',
    },
  }
}

export const useSessionQuestions = (eventId: string, sessionId: string): SessionQuestions => {
  const repository = useQuestionsRepository()

  const [status, setStatus] = useState<SessionQuestions['status']>('loading')
  const [questions, setQuestions] = useState<readonly QuestionListItem[]>([])
  const [error, setError] = useState<QuestionFailure | null>(null)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    repository
      .list(eventId, sessionId)
      .then((listed) => {
        if (cancelled) return
        setQuestions(listed)
        setError(null)
        setOffline(false)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // Never an empty list presented as success: a reader shown "no questions yet" where a
        // room has been asking them would ask a duplicate.
        const { failure, offline: wasOffline } = classify(cause)
        setError(failure)
        setOffline(wasOffline)
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, sessionId, attempt])

  /**
   * Every write takes this path, so there is one place a response replaces the list and one place
   * a refusal is classified.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A failed write leaves `status` at `ready` and the previous list on screen.** The read
   * succeeded; only the action failed. Dropping to `failed` would replace a perfectly good list
   * of other people's questions with an error because the reader's own upvote was refused —
   * which is the shape of failure Home's composed cards exist to avoid, applied one level down.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const act = useCallback(async (write: () => Promise<QuestionListItem[]>): Promise<boolean> => {
    setError(null)

    try {
      setQuestions(await write())
      setOffline(false)
      return true
    } catch (cause: unknown) {
      const { failure, offline: wasOffline } = classify(cause)
      setError(failure)
      setOffline(wasOffline)
      return false
    }
  }, [])

  const ask = useCallback(
    async (body: string) => act(() => repository.ask(eventId, sessionId, body)),
    [act, repository, eventId, sessionId],
  )

  const withdraw = useCallback(
    async (questionId: string) => act(() => repository.withdraw(eventId, questionId)),
    [act, repository, eventId],
  )

  /**
   * One control, two directions — the caller passes what the question's state **is**, and this
   * chooses the opposite.
   *
   * Taking the current state rather than the desired one keeps the decision with the row that
   * rendered it: a caller computing `voted ? unvote : vote` at three call sites is three places
   * for the sense to be inverted, and an inverted vote is invisible until somebody counts.
   */
  const toggleVote = useCallback(
    async (questionId: string, voted: boolean) =>
      act(() =>
        voted ? repository.unvote(eventId, questionId) : repository.vote(eventId, questionId),
      ),
    [act, repository, eventId],
  )

  const retry = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(async () => {
    // Deliberately silent about failure: this is a re-read after an action that already
    // succeeded, so telling the attendee their report failed because the *refresh* did would
    // be inventing a failure that did not happen. The list simply stays as it was.
    try {
      setQuestions(await repository.list(eventId, sessionId))
    } catch {
      /* keep what is on screen */
    }
  }, [repository, eventId, sessionId])

  return { status, offline, questions, ask, withdraw, toggleVote, error, retry, refresh }
}
