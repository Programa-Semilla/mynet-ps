import { OfflineError, type SessionNote } from '@mynet/data'
import { useSessionNotesRepository } from '@mynet/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * T050, T051 (005) — the note autosave controller (FR-209–FR-214, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`saved` IS ENTERED ONLY FROM A RESOLVED WRITE. NEVER FROM A KEYSTROKE.**
 *
 * That single rule is what makes this feature non-optimistic, and it is why the route returns
 * `updatedAt` at all. Entering `saved` when the attendee stops typing would be an optimistic
 * update, which the constitution requires be decided and recorded separately — and it would
 * also be a lie the attendee has no way to detect until they reload and find their note gone.
 *
 * FR-210 states it as a prohibition — "MUST NOT report a note saved before the server has
 * confirmed the write" — and `apps/web/tests/component/note-status.test.tsx` is the test that
 * keeps it true.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How long to wait after the attendee stops typing (FR-209, research D5).
 *
 * FR-209 fixes the band — no shorter than 500ms, no longer than three seconds — and this value
 * sits inside it. Long enough that ordinary prose does not write per word; short enough that a
 * note survives an unexpected loss of the page.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1200

/** The four states, and there are exactly four (SC-209). */
export type NoteStatus = 'idle' | 'saving' | 'saved' | 'failed'

export interface NoteFailure {
  /** Distinguishes "you are offline" from "a problem on our side" (FR-211, FR-218). */
  readonly offline: boolean
  readonly message: string
}

export interface NoteAutosave {
  readonly status: NoteStatus
  readonly failure: NoteFailure | null
  /** The text as the attendee has it. **Never replaced by a server response** — see below. */
  readonly text: string
  readonly change: (next: string) => void
  /** Retries the last write immediately, without waiting out the debounce (FR-211). */
  readonly retry: () => void
}

const failureFor = (error: unknown): NoteFailure =>
  error instanceof OfflineError
    ? {
        offline: true,
        message:
          'Not saved — there is no connection right now. Your note is still here, and nothing has been queued.',
      }
    : {
        offline: false,
        message:
          'Not saved — this is a problem on our side, not with your account. Your note is still here.',
      }

export const useNoteAutosave = (
  eventId: string,
  sessionId: string,
  /** The note already stored for this session, or `null` when there is none. */
  initial: SessionNote | null,
): NoteAutosave => {
  const repository = useSessionNotesRepository()

  const [text, setText] = useState(initial?.body ?? '')
  const [status, setStatus] = useState<NoteStatus>('idle')
  const [failure, setFailure] = useState<NoteFailure | null>(null)

  /**
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Sequence numbers, so an out-of-order response cannot resurrect an older status.**
   *
   * Two writes in flight can resolve in either order. Without this, a slow first write
   * resolving after a fast second one would report `saved` for text the attendee has already
   * replaced — or, worse, report `failed` for a write that has since succeeded, telling them
   * their note is lost when it is not.
   *
   * This is **ordering hygiene, not conflict resolution.** No merge is attempted and no
   * concurrent edit is detected: the last confirmed write wins, exactly as FR-214 says, and
   * that disclaimer stays honest because nothing here tries to be cleverer.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const sequence = useRef(0)
  const latestResolved = useRef(0)

  /**
   * The timer, and the text it is waiting to write.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **T051 — an in-flight write is NOT cancelled when the panel closes** (FR-211, US3 scenario
   * 6). The request is started outside React's lifecycle and is never aborted, so a note is
   * not lost because the attendee dismissed the panel a moment after typing. Only the pending
   * *timer* is flushed on unmount — and flushed rather than dropped, so the last keystrokes
   * before a close are written instead of discarded.
   *
   * That is the whole reason this is a ref and not state: state would be gone by the time the
   * cleanup ran.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)

  const write = useCallback(
    (body: string) => {
      pending.current = null

      const ticket = (sequence.current += 1)
      setStatus('saving')
      setFailure(null)

      // Clearing the text removes the note (FR-212). An emptied note is deleted rather than
      // stored blank, so "no note" has exactly one representation.
      const request =
        body.length === 0
          ? repository.deleteNote(eventId, sessionId)
          : repository.writeNote(eventId, sessionId, body)

      void request
        .then(() => {
          // A stale response must not overwrite a newer one's verdict.
          if (ticket < latestResolved.current) return
          latestResolved.current = ticket
          setStatus('saved')
          setFailure(null)
        })
        .catch((error: unknown) => {
          if (ticket < latestResolved.current) return
          latestResolved.current = ticket
          // ───────────────────────────────────────────────────────────────────────────────
          // **The attendee's text is not touched here** (FR-211). It stays exactly as they
          // typed it, so nothing they wrote is lost by a failure — and the status says plainly
          // that it is not saved, so they are never told it is safe when it is not.
          // ───────────────────────────────────────────────────────────────────────────────
          setStatus('failed')
          setFailure(failureFor(error))
        })
    },
    [repository, eventId, sessionId],
  )

  const change = useCallback(
    (next: string) => {
      setText(next)
      pending.current = next

      // The status returns to `idle` while typing rather than staying on `saved`: the text on
      // screen is no longer the text the server confirmed, and saying `saved` would be wrong
      // in exactly the way FR-210 forbids.
      setStatus('idle')
      setFailure(null)

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined
        write(next)
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [write],
  )

  const retry = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    write(text)
  }, [write, text])

  useEffect(
    () => () => {
      // T051 — flush, do not cancel. A pending keystroke at the moment the panel closes is
      // written; an already-dispatched request is left alone to finish.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = undefined
      }
      if (pending.current !== null) write(pending.current)
    },
    [write],
  )

  return { status, failure, text, change, retry }
}
