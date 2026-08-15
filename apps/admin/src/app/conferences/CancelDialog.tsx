import type { AdminSession } from '@mynet/data'

import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T052 (014), T149/T212 (014 tranche 2) — **delete or cancel, and the counts are what decide
 * it** (FR-1018, FR-1019, FR-1025, FR-1077, FR-1077b, FR-1077c).
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
 * only when no **engagement** is attached at all, which is exactly when the server will permit
 * it — and since tranche 2, "no engagement" and "nothing attached" are no longer the same
 * sentence. See below.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **HELD PLACES ARE NOT ENGAGEMENT, AND THIS DIALOG IS THE ONLY WARNING ANYBODY GETS**
 * (constitution v5.3.0 O2, FR-1077, FR-1077a, FR-1077c).
 *
 * An enrolment sits deliberately OUTSIDE the four engagement counts, so an optional session
 * with places held **stays deletable** — and because enrolling replaces saving, the attendees
 * holding those places have no saved row: no notification reaches them (register entry 31 is
 * open on exactly that), no marker will ever appear on anything of theirs, and nothing survives
 * to explain the session's absence. They find out by arriving.
 *
 * That is why FR-1077c forbids the one sentence this dialog used to be proudest of: with places
 * held it MUST NOT claim nothing is attached, and the shipped copy — decided from the four
 * engagement counts alone — said exactly that at the one moment it mattered most. The
 * places-held branch below states the number, states the silence, and names cancellation as the
 * preserving alternative. `cancel-dialog-copy.test.tsx` reads the rendered prose (016's
 * card-model-record precedent), because prose is the subject.
 *
 * **The figure shown is the figure sent.** `onDeleteSession` carries `placesHeld` back as
 * `placesSeen`, the server re-reads the count inside the deleting transaction under the same
 * lock FR-1019a takes, and a count that has RISEN refuses with `places_changed` — at which
 * point the caller re-presents this dialog with the new figure rather than acting on the old
 * one (FR-1077b).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **COUNTS, AND NOBODY NAMED — WITH ONE NAMED EXEMPTION THAT LIVES ELSEWHERE** (FR-1025,
 * FR-1075a).
 *
 * There is no name here, no avatar and no link to one. Shipped FR-1025 survives **narrowed by
 * name, not contradicted**: saves, notes, questions and votes stay counts-only with nobody
 * identified, at every tier, and this component still has no field that could hold a name for
 * any of them. What changed is enrolment alone — FR-1073 (v5.3.0 O1, the fourth recorded
 * Principle VIII exception) gives an assigned organizer a roster route that names who holds a
 * place, so a comment here once claiming the product *"has no route that would"* identify
 * anybody became false and was rewritten (FR-1049's obligation). **This confirmation shows the
 * count and not the roster**: the act being confirmed is about the session, not about who is in
 * it, and the roster is one deliberate control away in the programme editor.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Centring, focus restoration and Escape all come from `AdminDialog`**, which fixes the three
 * mistakes this product has already made once each. Repeating `m-auto` here is how four features
 * ended up with four copies of the same fix and two dialogs without it.
 */
export interface CancelDialogProps {
  readonly open: boolean
  readonly session: AdminSession | null
  /**
   * The held-places figure currently being SHOWN, controlled by the caller rather than read
   * off the session row: on a `places_changed` refusal the caller re-presents with the
   * server's new figure (FR-1077b), and the session object in hand still carries the old one.
   */
  readonly placesHeld: number
  readonly busy: boolean
  readonly failure: string | null
  readonly onCancelSession: () => void
  /** Receives the figure shown, to travel as `placesSeen` (FR-1077b). */
  readonly onDeleteSession: (placesSeen: number) => void
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
  placesHeld,
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
      ) : placesHeld > 0 ? (
        /*
          T149 (FR-1077c) — the branch that must NEVER claim nothing is attached. Held places
          are outside the engagement counts by decision (O2), so the server will permit this
          delete — and this paragraph is the only warning anybody in the product receives,
          which is exactly why it cannot soften any of its four facts: the number, the silence
          (no notification, no marker), the tracelessness, and the preserving alternative.
        */
        <>
          <p className="text-sm">
            {placesHeld === 1 ? '1 attendee holds a place' : `${placesHeld} attendees hold places`}{' '}
            in this session. Deleting it destroys every held place: those attendees{' '}
            <strong>will not be notified and their rows will carry no marker</strong> — nothing
            survives to explain the session’s absence, and they find out by arriving.
          </p>
          <p className="mt-3 text-sm">
            Cancelling instead preserves everything: the session stays on the programme marked as
            not happening, and everyone holding a place is told.
          </p>
        </>
      ) : (
        <p className="text-sm">
          Nobody has saved this session, written a note on it, asked a question or voted — and no
          places are held. It can be deleted outright — or cancelled, which keeps it on the
          programme marked as not happening.
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
          Offered exactly when the server will permit it (FR-1018): withheld while any of the
          four ENGAGEMENT counts is non-zero, and offered — beside the warning above — while
          only places are held, because O2 keeps such a session deletable. Rendering it under
          engagement would offer a control that answers 409, and the organizer would learn the
          rule from a refusal rather than from the screen.

          The server refuses regardless, under a `FOR UPDATE` lock taken inside the deleting
          transaction, so a save arriving between this render and the request blocks rather
          than being destroyed (FR-1019a) — and the held count is re-read under the same lock,
          refusing with `places_changed` when it has risen past the figure this dialog showed
          (FR-1077b). This is presentation; those are the guarantees.
        */}
        {engaged ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeleteSession(placesHeld)}
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
