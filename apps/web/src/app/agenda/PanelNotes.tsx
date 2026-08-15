import type { SessionNote } from '@mynet/data'
import { useId } from 'react'

import { useNoteAutosave, type NoteStatus } from './useNoteAutosave.js'

/**
 * T052–T054 (005) — the note editor, as the panel's **third** section
 * (FR-207, FR-210–FR-213).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T054 — noting and saving are independent** (FR-207).
 *
 * This section renders on every session, saved or not. It takes no interest in whether the
 * session is in the attendee's agenda, and there is no expression here that could consult it.
 * Requiring a save first would add a rule the attendee has to discover, and the prototype's
 * panel offers notes on any session.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * A third section beside Overview and Speakers, so 009 can add audience questions as a fourth
 * without editing any of them (FR-206).
 */

/** The 10,000-character limit, and the point at which the attendee starts being told about it. */
const NOTE_MAX_LENGTH = 10_000

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-213 requires the attendee to learn of the limit BEFORE a rejected write**, so the
 * remaining count appears while there is still room to act on it rather than at the last
 * character. 500 is roughly a paragraph of warning — enough to finish a thought and stop.
 *
 * This is presentation. The limit is enforced by the route schema and again by the column's
 * CHECK, because client-side presentation of a limit is never its enforcement (Principle VIII).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const REMAINING_VISIBLE_AT = 500

export const PanelNotes = ({
  eventId,
  sessionId,
  note,
}: {
  eventId: string
  sessionId: string
  /** The note already stored for this session, or `null` when there is none. */
  note: SessionNote | null
}) => {
  const autosave = useNoteAutosave(eventId, sessionId, note)
  const fieldId = useId()
  const statusId = useId()

  const remaining = NOTE_MAX_LENGTH - autosave.text.length

  return (
    <section aria-labelledby="session-panel-notes">
      <h3
        id="session-panel-notes"
        className="mb-2 font-display text-sm font-medium text-text-primary"
      >
        Your notes
      </h3>

      <label htmlFor={fieldId} className="sr-only">
        Your private notes on this session
      </label>
      <textarea
        id={fieldId}
        value={autosave.text}
        onChange={(event) => autosave.change(event.target.value)}
        rows={5}
        maxLength={NOTE_MAX_LENGTH}
        // The status is bound to the field, so a screen reader reaching the editor is told
        // where the note stands without having to go looking for the message.
        aria-describedby={statusId}
        placeholder="Only you can see these."
        className="w-full rounded-sm border border-border-subtle bg-surface px-3 py-2 text-sm text-text-body"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <NoteStatusLine id={statusId} autosave={autosave} />

        {/* FR-213 — the limit, communicated as it is approached rather than by a rejection. */}
        {remaining <= REMAINING_VISIBLE_AT && (
          <p className="text-xs text-text-muted">
            {remaining} character{remaining === 1 ? '' : 's'} left
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * What the note's persistence status says (FR-210, FR-211).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Announced, and never conveyed by colour alone** (Principle IV, Feature Declarations).
 *
 * `role="status"` with `aria-live="polite"` means the change is spoken when it happens — an
 * attendee who cannot see the line still learns that their note was saved, or was not. A
 * coloured dot would tell a sighted reader and nobody else, which is the class of defect the
 * prototype shipped throughout.
 *
 * The failure is announced **assertively and as an alert**, because "your note is not saved" is
 * the one thing here that must interrupt: it is the difference between the attendee closing
 * the panel believing their work is safe and knowing it is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const NoteStatusLine = ({
  id,
  autosave,
}: {
  id: string
  autosave: ReturnType<typeof useNoteAutosave>
}) => {
  if (autosave.status === 'failed' && autosave.failure) {
    return (
      <div id={id} role="alert" className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-danger-700">{autosave.failure.message}</p>
        <button
          type="button"
          onClick={autosave.retry}
          className="rounded-sm border border-danger-500 px-2 py-1 text-xs font-medium text-danger-700"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <p id={id} role="status" aria-live="polite" className="text-xs text-text-muted">
      {/*
        `failed` without a `failure` cannot occur — they are set together — but the fallback is
        the honest one rather than an empty string: if it ever did, the attendee is told the
        note is not saved rather than shown a blank line they would read as reassurance.
      */}
      {autosave.status === 'failed' ? 'Not saved.' : LABELS[autosave.status]}
    </p>
  )
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`saved` is the only one of these that makes a claim about the server**, and it is reachable
 * only from a resolved write (research D5). `idle` deliberately says nothing reassuring: the
 * text on screen has not been confirmed, and wording it as anything other than a prompt would
 * be the optimistic report FR-210 forbids.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const LABELS: Record<Exclude<NoteStatus, 'failed'>, string> = {
  idle: 'Notes save automatically when you pause.',
  saving: 'Saving…',
  saved: 'Saved.',
}
