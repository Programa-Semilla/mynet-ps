import { useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T110 (013) — confirming the removal of a reported question (FR-950–FR-953).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS A NESTED DIALOG, AND THAT IS THE ENTIRE REASON IT NEEDS ITS OWN NOTE.**
 *
 * 009 found that **React delivers a nested dialog's `cancel` to ancestor handlers** even though
 * the DOM event does not bubble — and research R2 had predicted the opposite, reasoning that the
 * platform sends `cancel` to the topmost dialog alone. R2 said the point was worth asserting
 * rather than assuming, and the assertion found the reasoning wrong: one Escape on an inner
 * confirmation closed the confirmation **and** the panel, changing the address.
 *
 * `AdminDialog` compares `event.target` against its own element, so this cannot happen here — but
 * it is invisible to every component test, because jsdom has no top layer. The guarantee lives in
 * `e2e/admin-moderation.spec.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The removal is irreversible and the copy says so.** The question and every vote on it go
 * (FR-950, FR-951) — constitution v3.3.0 decision 28 settled the equivalent question for a
 * departing attendee, and the same answer applies: nothing survives de-attributed, and other
 * attendees lose a question they backed. The cost is stated rather than hidden.
 */
export const RemoveQuestionDialog = ({
  open,
  reportId,
  questionId,
  onClose,
  onRemoved,
}: {
  readonly open: boolean
  readonly reportId: string
  readonly questionId: string | null
  readonly onClose: () => void
  readonly onRemoved: () => void
}) => {
  const { services } = useAdminSession()
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const remove = async () => {
    if (!questionId || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await services.reports.removeQuestion({ reportId, questionId })
      onRemoved()
    } catch (error) {
      setFailure(describe(classify(error)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminDialog open={open} title="Remove this question?" onClose={onClose}>
      <p className="text-sm">
        The question disappears for every attendee, and every upvote on it goes with it. Other
        people lose a question they backed, and nothing is left in its place — no placeholder and no
        note that it was removed.
      </p>
      <p className="mt-3 text-sm">
        The author is not told who removed it or why. This cannot be undone.
      </p>

      {failure ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={submitting}
          className="min-h-11 flex-1 rounded-lg bg-danger-500 px-4 text-sm font-medium text-text-inverse disabled:opacity-50 hover:bg-danger-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          {submitting ? 'Removing…' : 'Remove'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Keep it
        </button>
      </div>
    </AdminDialog>
  )
}
