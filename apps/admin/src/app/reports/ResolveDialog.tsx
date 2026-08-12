import { useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T095, T096 (011) — recording what was done about a report (FR-943, FR-944, FR-945).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO OUTCOMES AND DELIBERATELY NO THIRD.** There is no `escalated` and no `pending`: a status
 * meaning "somebody is still thinking about it" would be a workflow, and a workflow needs an
 * owner, a queue position and a notion of staleness — none of which any requirement asks for, and
 * all of which would be visible to the reporter through timing if they existed.
 *
 * **A second resolution is refused with 409 and an explanation** (FR-945), produced by a unique
 * constraint rather than a read-then-write check. That refusal is one of only two in this feature
 * that explain themselves, and it passes the test they must: it describes a conflict in the
 * reader's own work, which they can act on by reloading, and discloses nothing about any attendee.
 *
 * Centring, focus restoration and Escape all come from `AdminDialog`. See that file for the three
 * mistakes this product has already made with each.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const ResolveDialog = ({
  open,
  reportId,
  onClose,
  onResolved,
}: {
  readonly open: boolean
  readonly reportId: string
  readonly onClose: () => void
  readonly onResolved: () => void
}) => {
  const { services } = useAdminSession()
  const [outcome, setOutcome] = useState<'actioned' | 'dismissed'>('dismissed')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Disabled, never a post-submit error. Trimmed with JavaScript's Unicode-aware `trim`, which
  // is what the route uses — and the column's `btrim` names the same characters, because
  // PostgreSQL's one-argument `trim()` strips spaces only and 009 found the two layers
  // disagreeing.
  const ready = note.trim().length > 0

  const submit = async () => {
    if (!ready || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await services.reports.resolve(reportId, { outcome, note: note.trim() })
      onResolved()
    } catch (error) {
      setFailure(describe(classify(error)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminDialog open={open} title="Record a resolution" onClose={onClose}>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-text-primary">Outcome</legend>
        {(['actioned', 'dismissed'] as const).map((value) => (
          <label key={value} className="mb-1 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
              className="h-4 w-4"
            />
            {value === 'actioned'
              ? 'Actioned — I did something about it'
              : 'Dismissed — nothing was warranted'}
          </label>
        ))}
      </fieldset>

      <label htmlFor="resolution-note" className="block text-sm font-medium text-text-primary">
        Why
      </label>
      {/*
        Required, and the reason it is required rather than optional: what was decided is less
        useful later than why. A resolution with no note is an act nobody can review, which is the
        whole reason this is a table rather than a boolean.
      */}
      <textarea
        id="resolution-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        maxLength={2000}
        className="mt-1 mb-4 block w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
      />

      {failure ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || submitting}
          className="min-h-11 flex-1 rounded-lg bg-coral-600 px-4 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50 hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          {submitting ? 'Saving…' : 'Record'}
        </button>
        {/* A clear close action as well as Escape — the constitution's modal constraint. */}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Cancel
        </button>
      </div>

      {/*
        **Nothing is dispatched.** No notification to the reporter, none to the reported attendee,
        nothing on any MyNet surface (FR-946, FR-935). The notification trigger set stays at a
        received message, and the source-level audit enforcing that is not edited by this feature.
      */}
    </AdminDialog>
  )
}
