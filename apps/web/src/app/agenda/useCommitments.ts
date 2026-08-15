import { OfflineError, type SessionKind } from '@mynet/data'
import { useCommitmentRepository } from '@mynet/platform'
import { useCallback, useEffect, useState } from 'react'

/**
 * T025 (005), T208 (014 tranche 2) — the attendee's commitment set for one conference
 * (FR-184–FR-188, FR-217, FR-218, FR-1063, FR-1066).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T208 — THIS WAS `useSavedSessions`, AND FROM TRANCHE 2 IT SERVES BOTH COMMITMENTS.**
 *
 * `ids` is the union — saves on mandatory sessions and held places in optional ones — because
 * that is what the server sends: one list with a `saved | place` discriminator, which makes the
 * saved-optional state FR-1064 forbids unrepresentable rather than merely absent (research
 * R13). Consumers asking "is this session on my agenda" need no second set, and none exists.
 *
 * **`toggle` takes the session's KIND, and membership no longer decides which write to call**
 * (FR-1063): the control's identity is determined by the session's own kind, never by the
 * reader, the surface or a preference. A mandatory session saves and unsaves; an optional one
 * enrols and releases. The hook never calls `save` for an optional session — that route does
 * not exist (FR-1064), and `commitment-exclusivity.test.tsx` asserts the absence.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Reads and writes go through the repository and never the network** (Principle V). This
 * hook does not know that HTTP exists and does not know that a cache exists — the cache is a
 * decorator at the repository boundary, which is the whole reason it is placed there.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE IS OPTIMISTIC** (FR-217).
 *
 * `toggle` awaits the write and updates the set only once the server has confirmed it. A
 * refused write therefore leaves the displayed state exactly as it was — which is what
 * "MUST NOT change displayed state, and MUST NOT be queued" actually requires. An attendee
 * whose commitment was refused sees a control that still offers it, because that is the truth.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** What `toggle` needs to know about the session — its identity and its kind, nothing else. */
export interface CommitmentSubject {
  readonly id: string
  readonly kind: SessionKind
}

/** Why a write was refused, in terms the screen can render (FR-217, FR-218, FR-1069). */
export interface CommitmentRefusal {
  readonly offline: boolean
  /**
   * The refusal's own code. Server codes — `session_full`, `enrolment_closed`,
   * `already_enrolled`, `not_optional`, `not_saveable` — pass through untouched; `offline` and
   * `internal_error` are the two locally-classified outcomes. Carried so a test can assert the
   * outcomes are **mutually different**, which is the property `instanceof` classification
   * destroys (FR-1069a).
   */
  readonly code: string
  readonly message: string
}

export interface Commitments {
  readonly status: 'loading' | 'ready' | 'failed'
  /**
   * The committed session ids — the UNION of saves and held places (T208, FR-1066). Empty while
   * loading — callers key off `status`, not size.
   */
  readonly ids: ReadonlySet<string>
  /**
   * T076 (014) — the committed sessions that have materially changed since this attendee last
   * looked (FR-1030).
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
  readonly refusal: CommitmentRefusal | null
  /**
   * T208 — commit to, or withdraw from, one session. Which WRITE runs is decided by the
   * session's kind (FR-1063), and whether it is the committing or the withdrawing half by
   * current membership. See the header: the hook never calls `save` for an optional session.
   *
   * **The FR-1074 notice is the CALLER's obligation**: before this enrols somebody in an
   * optional session, the surface presenting the control must have told them their name becomes
   * visible to that conference's organizers. The control component owns that dialog; this hook
   * only ever runs after it was confirmed.
   */
  readonly toggle: (session: CommitmentSubject) => void
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

/** What the attendee was doing, for wording the refusal (FR-218, FR-1069). */
type CommitmentAction = 'save' | 'unsave' | 'enrol' | 'release'

const ACTION_WORDING: Record<CommitmentAction, string> = {
  save: 'Saving that session',
  unsave: 'Removing that session',
  enrol: 'Taking a place in that session',
  release: 'Releasing your place',
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY REFUSAL IS CLASSIFIED ON `error.code`, NEVER ON THE ERROR CLASS — AND THE CODE'S
 * MESSAGE PASSES THROUGH** (FR-1069, FR-1069a; 008's defect and 014 tranche 1's).
 *
 * 008 classified on the class and swallowed every message its routes wrote to be read. 014's
 * tranche 1 obeyed the rule that came out of it — classify on `error.code` — and reproduced
 * the outcome anyway, because four distinct 409s all carried `refused`: classifying on the
 * code is worth nothing unless the code says WHICH refusal it is. This feature's five refusals
 * each carry their own code — `session_full`, `enrolment_closed`, `already_enrolled`,
 * `not_optional`, `not_saveable` — and each renders the server's own sentence, so "this
 * session is full" and "enrolment has closed" stay the different facts they are, leading to
 * the different next steps they do (FR-1069).
 *
 * `OfflineError` is the one thing checked by class, legitimately: it carries no code because
 * it never reached a server. The generic fallback is the last branch, never the first.
 * `error-classification.test.ts` asserts all outcomes are **mutually different** — the
 * property a per-code check would pass while checking nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Exported for the unit test, which drives it directly with each code: the subject is the
 * classification itself, not the screen around it.
 */
export const classifyRefusal = (cause: unknown, action: CommitmentAction): CommitmentRefusal => {
  if (cause instanceof OfflineError) {
    return {
      offline: true,
      code: 'offline',
      // FR-217/FR-1070b — says plainly that nothing was queued. Worded to be true of BOTH
      // commitments (FR-1066a): the old sentence said "nothing has been saved", which a
      // refused enrolment would falsify.
      message: `${ACTION_WORDING[action]} needs a connection, and there is not one right now. Nothing on your agenda has changed, and nothing has been queued for later.`,
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
    return { offline: false, code, message }
  }

  return {
    offline: false,
    code: 'internal_error',
    message: `${ACTION_WORDING[action]} did not work. This is a problem on our side, not with your account — try again.`,
  }
}

export const useCommitments = (eventId: string): Commitments => {
  const repository = useCommitmentRepository()

  const [status, setStatus] = useState<Commitments['status']>('loading')
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<Error | null>(null)
  const [refusal, setRefusal] = useState<CommitmentRefusal | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    repository
      .listSaved(eventId)
      .then((committed) => {
        if (cancelled) return
        // The union arrives as one list — both commitments, one row each (R13). Nothing here
        // asks which kind a row is: membership is the only question `ids` answers, and the
        // control's identity comes from the session's own kind, never from the row.
        setIds(new Set(committed.map((entry) => entry.sessionId)))
        setChanged(
          new Set(
            committed.filter((entry) => entry.changedSinceViewed).map((entry) => entry.sessionId),
          ),
        )
        setError(null)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // A failure must never render as an empty success: an attendee told they have committed
        // to nothing, when the truth is that we do not know, would go and commit to it all again.
        setError(cause instanceof Error ? cause : new Error('Your agenda could not be read.'))
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, attempt])

  const toggle = useCallback(
    (session: CommitmentSubject) => {
      const committing = !ids.has(session.id)
      // A new attempt clears the previous explanation, so an old refusal cannot sit on screen
      // beside a control the attendee has since operated successfully.
      setRefusal(null)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The KIND picks the write; membership picks the direction** (FR-1063, R13). This is
      // the four-way fork FR-1064 makes safe: there is no branch in which an optional session
      // reaches `save`, so the saved-optional state has no route here — asserted, not argued,
      // in `commitment-exclusivity.test.tsx`.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const action: CommitmentAction =
        session.kind === 'optional'
          ? committing
            ? 'enrol'
            : 'release'
          : committing
            ? 'save'
            : 'unsave'

      const write =
        action === 'enrol'
          ? repository.enrol(eventId, session.id)
          : action === 'release'
            ? repository.release(eventId, session.id)
            : action === 'save'
              ? repository.save(eventId, session.id)
              : repository.unsave(eventId, session.id)

      void write
        .then(() => {
          // Only now — the server has confirmed it. See the header.
          setIds((current) => {
            const next = new Set(current)
            if (committing) next.add(session.id)
            else next.delete(session.id)
            return next
          })

          // ───────────────────────────────────────────────────────────────────────────────
          // **WITHDRAWING CLEARS THE MARKER, AND FORGETTING THAT LEFT A CHIP ON A DISOWNED
          // ROW.**
          //
          // FR-1030 scopes the marker to a materially changed **committed** session. `changed`
          // was maintained only by the initial read, so removing a marked session from the
          // agenda — which the attendee does from that very row — dropped it from `ids` and
          // left it in `changed`. In the "All" view the row kept rendering "Changed", because
          // `Agenda.tsx` asks `changed.has(id)` without consulting `ids`, and it persisted
          // until the next successful `listSaved` on remount.
          //
          // The server was already consistent: the commitment row is gone, so the marker
          // cannot come back. This was purely the local set drifting from it.
          // ───────────────────────────────────────────────────────────────────────────────
          if (!committing) {
            setChanged((current) => {
              if (!current.has(session.id)) return current
              const next = new Set(current)
              next.delete(session.id)
              return next
            })
          }
        })
        .catch((cause: unknown) => {
          setRefusal(classifyRefusal(cause, action))
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
      // The distinction is what the state claims. `toggle` awaits its write because the
      // commitment set is a claim about the server — telling somebody a session is on their
      // agenda when it is not is the failure FR-217 forbids. This claims only *the attendee has
      // now looked at this*, which is true the moment they opened it, and is a fact about the
      // reader rather than about the server.
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
      // purge of the whole conference cache prefix: the programme, the commitment set, the notes
      // and the appointments, all of it. An attendee browsing ten sessions issued ten writes and
      // ten full purges of their offline cache, nine or ten of them for sessions that never
      // changed.
      //
      // The header on `services.ts` justifies the purge with *"the commitment set it purges is
      // the one that just changed"*. That is true for the marker case and false for browsing,
      // which is the overwhelming majority. This is 008's `slots` defect from the other side: a
      // legitimate write firing far more often than the state it invalidates changes.
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
