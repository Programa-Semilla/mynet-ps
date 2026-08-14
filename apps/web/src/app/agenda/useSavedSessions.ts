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
  /**
   * T076 (014) — the saved sessions that have materially changed since this attendee last looked
   * (FR-1030).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **A SET OF IDS, AND DELIBERATELY NOT A COUNT.**
   *
   * Every consumer asks `changed.has(id)` about **one row**. Nothing exposes `changed.size`, and
   * `apps/web/tests/unit/authoring-absences.test.tsx` asserts that no component reads it — the
   * moment a screen answers *how many things changed*, constitution v5.2.0's N2 is broken
   * regardless of what the notification payload does (FR-1031, FR-1034a).
   *
   * A `Set` rather than an array for the same reason `ids` is one: the question is always
   * membership, and a list invites rendering.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  readonly changed: ReadonlySet<string>
  readonly error: Error | null
  readonly refusal: SaveRefusal | null
  readonly toggle: (sessionId: string) => void
  /**
   * T075 (014) — records that the attendee has looked at this session, clearing its marker.
   *
   * **Fire-and-forget, and failure is silent.** Nothing an attendee can see depends on it
   * succeeding: the marker stays until the next successful read, which is the honest outcome of
   * a write that did not land. Surfacing an error for "we could not record that you looked at
   * this" would be a failure message about a thing the attendee never asked for.
   */
  readonly markViewed: (sessionId: string) => void
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
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<Error | null>(null)
  const [refusal, setRefusal] = useState<SaveRefusal | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    repository
      .listSaved(eventId)
      .then((saved) => {
        if (cancelled) return
        setIds(new Set(saved.map((entry) => entry.sessionId)))
        setChanged(
          new Set(
            saved.filter((entry) => entry.changedSinceViewed).map((entry) => entry.sessionId),
          ),
        )
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

          // ───────────────────────────────────────────────────────────────────────────────
          // **UNSAVING CLEARS THE MARKER, AND FORGETTING THAT LEFT A CHIP ON A DISOWNED ROW.**
          //
          // FR-1030 scopes the marker to a materially changed **saved** session. `changed` was
          // maintained only by the initial read, so removing a marked session from the agenda —
          // which the attendee does from that very row — dropped it from `ids` and left it in
          // `changed`. In the "All" view the row kept rendering "Changed", because `Agenda.tsx`
          // asks `changed.has(id)` without consulting `ids`, and it persisted until the next
          // successful `listSaved` on remount.
          //
          // The server was already consistent: the `saved_sessions` row is gone, so the marker
          // cannot come back. This was purely the local set drifting from it.
          // ───────────────────────────────────────────────────────────────────────────────
          if (!saving) {
            setChanged((current) => {
              if (!current.has(sessionId)) return current
              const next = new Set(current)
              next.delete(sessionId)
              return next
            })
          }
        })
        .catch((cause: unknown) => {
          setRefusal(refusalFor(cause, saving))
        })
    },
    [repository, eventId, ids],
  )

  const markViewed = useCallback(
    (sessionId: string) => {
      // ───────────────────────────────────────────────────────────────────────────────────────
      // **The marker clears locally on dispatch rather than on the response, and this is the one
      // place in this hook that is not strictly non-optimistic.**
      //
      // The distinction is what the state claims. `toggle` awaits its write because the saved
      // set is a claim about the server — telling somebody a session is saved when it is not is
      // the failure FR-217 forbids. This claims only *the attendee has now looked at this*,
      // which is true the moment they opened it, and is a fact about the reader rather than
      // about the server.
      //
      // Waiting would leave the marker on screen while somebody reads the very session it is
      // about, which reads as broken. A failed write means it comes back on the next read, which
      // is the correct outcome rather than a rollback.
      // ───────────────────────────────────────────────────────────────────────────────────────
      // ═════════════════════════════════════════════════════════════════════════════════════
      // **NOTHING IS WRITTEN FOR A SESSION THAT CARRIES NO MARKER, AND THAT GUARD IS THE POINT.**
      //
      // The panel calls this on **every** open, and almost every open is ordinary browsing. Each
      // call was a request plus — because `markViewed` is a write to a decorated repository — a
      // purge of the whole conference cache prefix: the programme, the saved set, the notes and
      // the appointments, all of it. An attendee browsing ten sessions issued ten writes and ten
      // full purges of their offline cache, nine or ten of them for sessions that never changed.
      //
      // The header on `services.ts` justifies the purge with *"the programme it purges alongside
      // is the one that just changed — the attendee is opening a session precisely because it
      // moved"*. That is true for the marker case and false for browsing, which is the
      // overwhelming majority. This is 008's `slots` defect from the other side: a legitimate
      // write firing far more often than the state it invalidates changes.
      //
      // Gated here rather than in the panel because this hook owns the marker; asking the panel
      // to know would be a second reader of the same fact.
      // ═════════════════════════════════════════════════════════════════════════════════════
      if (!changed.has(sessionId)) return

      setChanged((current) => {
        if (!current.has(sessionId)) return current
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })

      void repository.markViewed(eventId, sessionId).catch(() => {
        // Deliberately silent — see the interface. Offline is the ordinary case here, and the
        // write is refused rather than queued like every other write in this product.
      })
    },
    [repository, eventId, changed],
  )

  const retry = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { status, ids, changed, error, refusal, toggle, markViewed, retry }
}
