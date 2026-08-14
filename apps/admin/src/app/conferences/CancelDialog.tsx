import type { AdminSession } from '@mynet/data'

import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T052 (014) — **delete or cancel, and the counts are what decide it** (FR-1018, FR-1019,
 * FR-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS DIALOG EXISTS BECAUSE THE DATABASE WILL HAPPILY DO THE WRONG THING.**
 *
 * `saved_sessions`, `session_notes`, `session_questions` and `question_votes` all cascade from
 * `sessions.id`. One `DELETE` and four kinds of other people's writing are gone — silently, with
 * no confirmation and no record. v5.2.0's N5 calls that a **correction of a live hazard rather
 * than a preference**, and the server refuses it (FR-1019); this is the surface that makes the
 * refusal comprehensible **before** the organizer meets it.
 *
 * So the dialog leads with what is attached and offers the safe act first. Deletion is offered
 * only when nothing is attached at all, which is exactly when the server will permit it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **COUNTS, AND NOBODY NAMED** (FR-1025, FR-1042).
 *
 * There is no name here, no avatar and no link to one, because the server does not send any and
 * has no route that would. The spec records that the aggregate is thin at small scale — with
 * three registrants, "1 attendee wrote a note" is close to a name — and names the mitigation
 * available without an owner decision: a **threshold** rather than a count. That change is this
 * component and the type it reads, and nothing else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Centring, focus restoration and Escape all come from `AdminDialog`**, which fixes the three
 * mistakes this product has already made once each. Repeating `m-auto` here is how four features
 * ended up with four copies of the same fix and two dialogs without it.
 */
export interface CancelDialogProps {
  readonly open: boolean
  readonly session: AdminSession | null
  readonly busy: boolean
  readonly failure: string | null
  readonly onCancelSession: () => void
  readonly onDeleteSession: () => void
  readonly onClose: () => void
}

const total = (session: AdminSession): number =>
  session.engagement.saved +
  session.engagement.notes +
  session.engagement.questions +
  session.engagement.votes

export const CancelDialog = ({
  open,
  session,
  busy,
  failure,
  onCancelSession,
  onDeleteSession,
  onClose,
}: CancelDialogProps) => {
  if (!session) return null

  const engaged = total(session) > 0

  return (
    <AdminDialog open={open} title={`Remove “${session.title}”?`} onClose={onClose}>
      {failure ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      {engaged ? (
        <>
          <p className="text-sm">
            Attendees have already engaged with this session. Cancelling keeps everything they
            wrote; deleting is not available while any of it exists.
          </p>

          {/*
            A list rather than a sentence, so a screen reader announces four separate facts.
            Zeroes are included: "0 notes" is information — it tells the organizer which kind of
            engagement is in the way.
          */}
          <ul className="mt-3 space-y-1 text-sm text-text-body">
            <li>{session.engagement.saved} saved this session</li>
            <li>{session.engagement.notes} wrote a private note</li>
            <li>{session.engagement.questions} asked a question</li>
            <li>{session.engagement.votes} upvoted a question</li>
          </ul>
        </>
      ) : (
        <p className="text-sm">
          Nobody has saved this session, written a note on it, asked a question or voted. It can be
          deleted outright — or cancelled, which keeps it on the programme marked as not happening.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancelSession}
          className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
        >
          Cancel the session
        </button>

        {/*
          Offered only when nothing is attached — which is exactly when the server will permit it
          (FR-1018). Rendering it otherwise would offer a control that answers 409, and the
          organizer would learn the rule from a refusal rather than from the screen.

          The server refuses it regardless, under a `FOR UPDATE` lock taken inside the deleting
          transaction, so a save arriving between this render and the request blocks rather than
          being destroyed (FR-1019a). This is presentation; that is the guarantee.
        */}
        {engaged ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={onDeleteSession}
            className="min-h-11 rounded-lg border border-danger-700 px-3 text-sm font-medium text-danger-700 hover:bg-danger-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
          >
            Delete it permanently
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-text-body hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Keep it as it is
        </button>
      </div>
    </AdminDialog>
  )
}
