import { OfflineError } from '@mynet/data'
import { useSavedSessionRepository } from '@mynet/platform'
import { useCallback, useEffect, useState } from 'react'

/**
 * T025 (005) — the attendee's saved set for one conference (FR-184–FR-188, FR-217, FR-218).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Reads and writes go through the repository and never the network** (Principle V). This
 * hook does not know that HTTP exists, does not know that a cache exists, and will not learn
 * either when the cache decorator lands in Phase 6 — that is the whole reason the cache is
 * placed at the repository boundary rather than here.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE IS OPTIMISTIC** (FR-217).
 *
 * `toggle` awaits the write and updates the set only once the server has confirmed it. A
 * refused write therefore leaves the displayed state exactly as it was — which is what
 * "MUST NOT change displayed state, and MUST NOT be queued" actually requires, and what an
 * optimistic update followed by a rollback would only approximate. An attendee whose save was
 * refused sees a control that still offers to save, because that is the truth.
 *
 * It also keeps this feature outside the constitution's optimistic-update clause, which would
 * otherwise require its own recorded decision.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Why a write was refused, in terms the screen can render (FR-217, FR-218). */
export interface SaveRefusal {
  readonly offline: boolean
  readonly message: string
}

export interface SavedSessions {
  readonly status: 'loading' | 'ready' | 'failed'
  /** The saved session ids. Empty while loading — callers key off `status`, not size. */
  readonly ids: ReadonlySet<string>
  readonly error: Error | null
  readonly refusal: SaveRefusal | null
  readonly toggle: (sessionId: string) => void
  readonly retry: () => void
}

/**
 * **The two refusals are worded differently because they are different facts** (FR-218).
 *
 * "You are offline" tells the attendee to wait for a connection; "this is a problem on our
 * side" tells them it is not theirs to fix. Reporting a server fault as a connection problem
 * sends them to fix a network that is working — the same defect 001 recorded when a wrong
 * password surfaced as "check your connection".
 */
const refusalFor = (error: unknown, saving: boolean): SaveRefusal => {
  const action = saving ? 'Saving that session' : 'Removing that session'

  return error instanceof OfflineError
    ? {
        offline: true,
        message: `${action} needs a connection, and there is not one right now. Nothing has been saved, and nothing has been queued for later.`,
      }
    : {
        offline: false,
        message: `${action} did not work. This is a problem on our side, not with your account — try again.`,
      }
}

export const useSavedSessions = (eventId: string): SavedSessions => {
  const repository = useSavedSessionRepository()

  const [status, setStatus] = useState<SavedSessions['status']>('loading')
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<Error | null>(null)
  const [refusal, setRefusal] = useState<SaveRefusal | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    repository
      .listSaved(eventId)
      .then((saved) => {
        if (cancelled) return
        setIds(new Set(saved))
        setError(null)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // A failure must never render as an empty success: an attendee told they have saved
        // nothing, when the truth is that we do not know, would go and save it all again.
        setError(
          cause instanceof Error ? cause : new Error('The saved sessions could not be read.'),
        )
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, attempt])

  const toggle = useCallback(
    (sessionId: string) => {
      const saving = !ids.has(sessionId)
      // A new attempt clears the previous explanation, so an old refusal cannot sit on screen
      // beside a control the attendee has since operated successfully.
      setRefusal(null)

      const write = saving
        ? repository.save(eventId, sessionId)
        : repository.unsave(eventId, sessionId)

      void write
        .then(() => {
          // Only now — the server has confirmed it. See the header.
          setIds((current) => {
            const next = new Set(current)
            if (saving) next.add(sessionId)
            else next.delete(sessionId)
            return next
          })
        })
        .catch((cause: unknown) => {
          setRefusal(refusalFor(cause, saving))
        })
    },
    [repository, eventId, ids],
  )

  const retry = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { status, ids, error, refusal, toggle, retry }
}
