import { useReportRepository } from '@mynet/platform'
import { useId, useState, type RefObject } from 'react'

import { ConfirmDialog } from '../profile/ConfirmDialog.js'

/** The reason field's bound, matching the route's. Stated once so the two cannot disagree. */
const REASON_MAX_LENGTH = 2_000

/**
 * T083 (007) — the report dialog (FR-543, FR-546, FR-548, FR-583).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFIRMATION IS DISABLED WHILE THE REASON IS EMPTY — NEVER AN ERROR AFTERWARDS**
 * (FR-546).
 *
 * `requirements.md` names "invalid empty meeting topic" among the required states and specifies
 * the treatment, and a report's reason is the same shape of field: an attendee who submits an
 * empty report and is told off has been handed a failure they could have been prevented from
 * reaching, at a moment when they are already upset.
 *
 * The server refuses an empty reason too, and the column's `CHECK` refuses it again — because
 * client-side presentation of a rule is never the enforcement of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **REPORTING ALSO BLOCKS, AND THE DIALOG SAYS SO BEFORE THE ATTENDEE COMMITS** (FR-544).
 *
 * That is a real consequence and a surprising one — the attendee asked to report, and they will
 * also stop being reachable. Telling them afterwards would be telling them about something they
 * did not choose. Told beforehand, it is the reassurance they actually wanted.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFIRMATION PROMISES NOTHING IT CANNOT KEEP** (FR-548).
 *
 * No case identifier, no status, nothing to check back on — because there is no route that would
 * answer any of them, and there never will be: a report-reading surface needs a moderator, and a
 * moderator is an organizer, the actor Principle III excludes by construction.
 *
 * So the wording says a person will look at it, which is true — the report leaves the product as
 * mail to an operator who acts out-of-band. Promising a review *inside* the product would be
 * promising the surface the requirement forbids building, in copy.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const ReportDialog = ({
  attendeeId,
  displayName,
  messageIds = [],
  questionIds = [],
  returnFocusTo,
  onReported,
  onDismiss,
}: {
  attendeeId: string
  displayName: string
  /** The messages being reported, if any. Conduct can be reported without citing one. */
  messageIds?: readonly string[]
  /**
   * 009 (FR-781, FR-783) — the questions being reported, if any.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Its props were already destination-agnostic, which is what made the move cheap.** A
   * reported attendee and an optional list of item identifiers describe a report from anywhere;
   * nothing about this component was ever specific to a thread. This adds a second list beside
   * the first rather than generalising both into one, because the route stores them in two
   * columns and collapsing them here would mean re-deriving which was which.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  questionIds?: readonly string[]
  returnFocusTo: RefObject<HTMLElement | null>
  onReported: () => void
  onDismiss: () => void
}) => {
  const reports = useReportRepository()
  const reasonId = useId()

  const [reason, setReason] = useState('')
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = (): void => {
    const trimmed = reason.trim()
    if (trimmed.length === 0) return

    setWorking(true)
    setFailed(false)

    reports
      .submit({ attendeeId, reason: trimmed, messageIds, questionIds })
      .then(() => onReported())
      .catch(() => setFailed(true))
      .finally(() => setWorking(false))
  }

  return (
    <ConfirmDialog
      title={`Report ${displayName}?`}
      confirmLabel="Report and block"
      confirming={working}
      // Trimmed, so whitespace is not a reason — the server trims before storing for the same
      // reason, which is what makes the lower bound structural rather than a rule two layers
      // both have to remember.
      confirmDisabled={reason.trim().length === 0}
      onConfirm={submit}
      onDismiss={onDismiss}
      returnFocusTo={returnFocusTo}
    >
      <p className="mb-3">
        Reporting {displayName} also <strong className="font-medium">blocks them</strong>, so they
        cannot reach you while this is looked at.
      </p>

      <label htmlFor={reasonId} className="mb-1 block text-sm font-medium text-text-primary">
        What happened?
      </label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={4}
        maxLength={REASON_MAX_LENGTH}
        className="focus-ring min-h-11 w-full rounded-sm border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
      />

      <p className="mt-2 text-xs text-text-muted">
        A person will read this. There is nothing to check back on here — we will not be able to
        tell you what happens next.
      </p>

      {failed && (
        <p role="alert" className="mt-2 text-danger-700">
          That report could not be sent. Nothing has changed — try again.
        </p>
      )}
    </ConfirmDialog>
  )
}
