import { useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T142, T144 (011) — ending a platform operator's access (FR-908, FR-909).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO LIST OF OPERATORS TO READ, AND THAT IS NOT AN OVERSIGHT.**
 *
 * The obvious screen here is a table of operators with a control beside each. This feature builds
 * no route that returns one — `admin-forbidden-surfaces.test.ts` forbids a route returning an
 * operator in any attendee-facing payload (FR-903), and no administrative read route was
 * specified either.
 *
 * The reason it was not specified is worth stating rather than treating as an omission to fix:
 * operators are **seeded as committed, reviewed data** (decision 32). Who they are is answered by
 * reading `db/seed/operators.ts`, in the repository, under review — which is the same place the
 * decision to create one is made. A screen listing them would be a convenience over a file that
 * is already the source of truth, and it would put the set of principals who can read the
 * abuse-report queue behind a route rather than behind a pull request.
 *
 * So this screen does one thing: it ends an access whose identifier the operator brings with them.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The last-operator case is deliberately unguarded**, per the spec's Assumptions — including
 * deactivating yourself. A guard would have to answer "who is allowed to be last", which nobody
 * has decided, and the failure it would prevent is recoverable by re-seeding
 * (`deploy/vm/README.md`). A guard that refuses an action in an undecided case is a decision
 * taken by inference, which is what register entries exist to prevent. The copy says so.
 */
export const OperatorList = () => {
  const { services } = useAdminSession()
  const [operatorId, setOperatorId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const ready = operatorId.trim().length > 0

  const deactivate = async () => {
    if (!ready || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await services.conferences.deactivateOperator(operatorId.trim())
      setDone(operatorId.trim())
      setOperatorId('')
      setConfirming(false)
    } catch (error) {
      setFailure(describe(classify(error)))
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-text-primary">Operators</h1>

      <p className="mt-3 text-text-body">
        Platform operators are created by a reviewed change to the seed, not from this screen —
        nobody can sign themselves up as an administrator. What you can do here is end an operator’s
        access.
      </p>

      <div className="mt-6 rounded-2xl border border-border-subtle bg-surface-card p-5">
        <label htmlFor="operator-id" className="block text-sm font-medium text-text-primary">
          Operator identifier
        </label>
        <input
          id="operator-id"
          value={operatorId}
          onChange={(event) => setOperatorId(event.target.value)}
          className="mt-1 mb-4 block min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        />

        {failure ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"
          >
            {failure}
          </p>
        ) : null}

        {done ? (
          <p role="status" className="mb-4 rounded-lg bg-mint-100 px-3 py-2 text-sm text-mint-800">
            That operator’s access has ended. Their record survives, because the decisions they made
            still name them.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!ready}
          className="min-h-11 rounded-lg border border-danger-500 px-4 text-sm font-medium text-danger-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-danger-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          End their access
        </button>
      </div>

      <AdminDialog
        open={confirming}
        title="End this operator’s access?"
        onClose={() => setConfirming(false)}
      >
        <p className="text-sm">
          Their live sessions stop working immediately, not at their next sign-in. Their record
          stays, because the reports they resolved and the decisions they took still name them — an
          act attributed to nobody is an accountability record with the accountability removed.
        </p>
        <p className="mt-3 text-sm">
          Nothing stops you ending the last operator’s access, including your own. If that happens,
          recovery is a re-seed — see the deployment runbook.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void deactivate()}
            disabled={submitting}
            className="min-h-11 flex-1 rounded-lg bg-danger-500 px-4 text-sm font-medium text-text-inverse disabled:opacity-50 hover:bg-danger-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          >
            {submitting ? 'Ending…' : 'End access'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          >
            Cancel
          </button>
        </div>
      </AdminDialog>
    </div>
  )
}
