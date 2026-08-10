import { useBlockRepository } from '@mynet/platform'
import { useState, type RefObject } from 'react'

import { ConfirmDialog } from '../profile/ConfirmDialog.js'

/**
 * T082 (007) — the block confirmation (FR-534, FR-535, FR-538, FR-583).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **BUILT ON 004'S `ConfirmDialog` RATHER THAN ON A SECOND `<dialog>`.**
 *
 * The task describes a native `<dialog>` with `showModal()`, Escape dismissal and explicit focus
 * restoration — which is precisely what `ConfirmDialog` already is, and it carries the reasoning
 * for the part that is easy to get wrong: **the order**. Restoring focus before closing silently
 * does nothing, because everything behind a modal dialog is inert and an inert element cannot
 * take focus, so a keyboard reader is returned to the top of the document instead of to the
 * control they came from.
 *
 * A second dialog implementing the same three mechanics would be a second place for that ordering
 * to drift, on a surface where the reader has just done something deliberate and irreversible-
 * feeling. Reuse is the correct call and it is recorded rather than assumed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The copy says what blocking does AND what it does not do** (FR-535, FR-538).
 *
 * A confirmation that only asks "are you sure?" leaves the attendee to guess whether they are
 * about to delete a conversation. They are not: blocking removes nothing, the history stays
 * readable, and unblocking restores sending with nothing lost. Saying so is what makes the
 * confirmation a decision rather than a leap.
 *
 * It is **not styled as destructive**, deliberately, for the same reason: it destroys nothing and
 * is fully reversible. The red treatment belongs to account deletion.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const BlockConfirm = ({
  attendeeId,
  displayName,
  returnFocusTo,
  onBlocked,
  onDismiss,
}: {
  attendeeId: string
  /** Who, in words. The attendee is choosing about a person, not an identifier. */
  displayName: string
  returnFocusTo: RefObject<HTMLElement | null>
  onBlocked: () => void
  onDismiss: () => void
}) => {
  const blocks = useBlockRepository()
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  const confirm = (): void => {
    setWorking(true)
    setFailed(false)

    blocks
      .block(attendeeId)
      .then(() => onBlocked())
      .catch(() => setFailed(true))
      .finally(() => setWorking(false))
  }

  return (
    <ConfirmDialog
      title={`Block ${displayName}?`}
      confirmLabel="Block"
      confirming={working}
      onConfirm={confirm}
      onDismiss={onDismiss}
      returnFocusTo={returnFocusTo}
    >
      <p className="mb-2">
        They will not be able to send you messages, and you will not be able to send them any. They
        are not told that you have blocked them.
      </p>
      <p className="mb-2">
        <strong className="font-medium">Nothing is deleted.</strong> Your conversation stays exactly
        as it is, and unblocking restores sending with nothing lost.
      </p>
      {failed && (
        <p role="alert" className="text-danger-700">
          That did not work. Nothing has changed — try again.
        </p>
      )}
    </ConfirmDialog>
  )
}
