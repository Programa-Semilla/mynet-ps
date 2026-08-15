import type { PlaceAvailability, Session } from '@mynet/data'
import { useCommitmentRepository } from '@mynet/platform'
import { useEffect, useState } from 'react'

import { CommitmentControl } from '../SessionPresentation.js'
import type { Commitments } from './useCommitments.js'

/**
 * T208, T209 (014 tranche 2) — the panel's fifth section: the commitment control, and — on an
 * optional session — the live remaining-places figure beside it (FR-1063, FR-1070, SC-1013).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PLACES FIGURE IS TEXT, LIVE, AND OMITTED RATHER THAN STALE** (FR-1070, FR-1070b).
 *
 * - **Text, never colour or a bar alone**: "4 places left" is information that, missed, sends
 *   somebody to decide against a seat that was theirs — a colour-coded meter is exactly the
 *   signal a screen reader cannot report, and Principle IV forbids colour as sole carrier.
 * - **Read through `places`, the repository's one `passThrough` member**: never served from
 *   cache, because a stale number reads as a promise of a place. Where it cannot be read live
 *   — offline, or any failure — the figure is **omitted entirely**. No error state renders for
 *   it: a failure message about a number nobody asked for would outweigh the number.
 * - **One session's figure, never an aggregate** (FR-1070a): this section reads exactly the
 *   session it presents, and no surface sums remaining places across sessions or answers "how
 *   many of my sessions have places". That is the boundary that keeps this the fact v5.3.0 O3
 *   ratified and not the count N2 forbids.
 *
 * Re-read when the attendee's own commitment changes: taking or releasing a place is the one
 * client-visible act that moves the number, and showing the pre-enrolment figure beside a
 * just-taken place would contradict the control one line away.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const PanelCommitment = ({
  session,
  eventId,
  commitments,
}: {
  session: Session
  eventId: string
  commitments: Commitments
}) => {
  const committed = commitments.ids.has(session.id)

  return (
    <section aria-labelledby="session-panel-commitment" className="mb-6">
      <h3 id="session-panel-commitment" className="sr-only">
        Your commitment
      </h3>

      <div className="flex items-center gap-3">
        <CommitmentControl
          session={session}
          commitment={{ committed, onToggle: () => commitments.toggle(session) }}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {session.kind === 'optional'
              ? committed
                ? 'You hold a place in this session'
                : 'This session takes enrolment'
              : committed
                ? 'On your agenda'
                : 'Save this session to add it to your agenda'}
          </p>
          {/*
            FR-1064a — the cost, presented rather than worked around: an optional session has
            no bookmark. An attendee who wants it in view takes a place or takes none, and this
            sentence is where they learn that from the product instead of from a refused save.
          */}
          {session.kind === 'optional' && !committed && (
            <p className="text-sm text-text-body">
              Taking a place is the only way to keep this session on your agenda — there is no
              bookmark without one.
            </p>
          )}
          {session.kind === 'optional' && (
            <PlacesText eventId={eventId} sessionId={session.id} committed={committed} />
          )}
        </div>
      </div>

      {/*
        FR-217, FR-1069 — a refused commitment is explained beside the control that met it, in
        the server's own sentence where one was written to be read. The displayed commitment
        state did not change, because nothing was written.
      */}
      {commitments.refusal && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-warning-500 bg-warning-100 px-3 py-2 text-sm text-warning-700"
        >
          {commitments.refusal.message}
        </p>
      )}
    </section>
  )
}

/**
 * T209 — the live figure, in words. Three states plus a deliberate absence:
 * "N places left" / "Session full" / "Enrolment closed" / nothing at all where the figure
 * could not be read live (FR-1070b). The absence is not an error state on purpose — see the
 * section header.
 */
const PlacesText = ({
  eventId,
  sessionId,
  committed,
}: {
  eventId: string
  sessionId: string
  committed: boolean
}) => {
  const repository = useCommitmentRepository()
  // The answer is stored WITH the question it answered. A figure from before the attendee's
  // own enrolment is exactly the stale number FR-1070b forbids, so rather than clearing state
  // synchronously in the effect (which the lint rule rightly refuses), a read is rendered only
  // while its key still matches the current inputs — an out-of-date answer invalidates itself.
  const [read, setRead] = useState<{ key: string; availability: PlaceAvailability } | null>(null)
  const key = `${eventId}|${sessionId}|${String(committed)}`

  useEffect(() => {
    let cancelled = false

    repository
      .places(eventId, sessionId)
      .then((availability) => {
        if (cancelled) return
        setRead({ key: `${eventId}|${sessionId}|${String(committed)}`, availability })
      })
      .catch(() => {
        // Omitted, deliberately (FR-1070b): offline and failure render NO figure rather than a
        // stale or invented one. The enrol write still explains itself if attempted.
      })

    return () => {
      cancelled = true
    }
    // `committed` is a dependency on purpose: the attendee's own take/release is the one
    // client-visible act that moves this number, so it re-reads live rather than displaying
    // the pre-enrolment figure beside a just-taken place.
  }, [repository, eventId, sessionId, committed])

  const places = read !== null && read.key === key ? read.availability : null
  if (!places) return null

  return (
    <p className="text-sm text-text-muted">
      {!places.open
        ? 'Enrolment closed'
        : places.remaining === 0
          ? 'Session full'
          : places.remaining === 1
            ? '1 place left'
            : `${places.remaining} places left`}
    </p>
  )
}
