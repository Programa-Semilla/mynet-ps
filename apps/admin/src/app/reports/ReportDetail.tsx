import type { AdminReportDetail } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { RemoveQuestionDialog } from './RemoveQuestionDialog.js'
import { ResolveDialog } from './ResolveDialog.js'

/**
 * T094, T109 (013) — one report, with what was reported and why (FR-940–FR-942, FR-953).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **OPENING THIS SCREEN IS A DISCLOSURE, AND IT IS RECORDED AS ONE.**
 *
 * `GET /admin/reports/:reportId` writes a `disclose_report_content` audit entry — the only read
 * in the product that does, because it is the only read the constitution needed an exception to
 * permit (v4.1.0, decision 38, the **third** recorded Principle VIII exception).
 *
 * The client cannot see that and must not try to: it is not a header, not a field, and not
 * something the interface exposes. Mentioning it on screen would also be wrong — an operator
 * reading a report is doing their job, and a warning implying otherwise would discourage the act
 * the amendment exists to enable.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **`contentAvailable: false` renders as a state, not a failure** (FR-941). Reported message and
 * question ids are stored as plain arrays rather than foreign keys *precisely because* the
 * content is usually gone before anybody looks — deleted with an account, or withdrawn by its
 * author. This is the expected case, and the operator still needs who, when and why.
 */
export const ReportDetail = ({
  reportId,
  onResolved,
}: {
  readonly reportId: string
  readonly onResolved: () => void
}) => {
  const { services } = useAdminSession()

  const [report, setReport] = useState<AdminReportDetail | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailure(null)
    setReport(null)
    try {
      setReport(await services.reports.detail(reportId))
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }, [services, reportId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (failure) {
    return (
      <p role="alert" className="rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
        {failure}
      </p>
    )
  }

  if (!report) return <p className="text-sm text-text-muted">Loading the report…</p>

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-text-primary">
        {report.reporterName} reported {report.reportedName}
      </h2>
      <p className="mt-1 text-xs text-text-muted">{new Date(report.reportedAt).toLocaleString()}</p>

      <h3 className="mt-5 text-sm font-semibold text-text-primary">Their stated reason</h3>
      {/*
        The reporter's own words (FR-940). **Never in the operator mail** — that carries
        identifiers and a timestamp only, and was written that way to stop this text living in an
        inbox outside every retention rule this project controls (FR-947). A queue reading the row
        is not that.

        `whitespace-pre-wrap` because it is somebody's free text and paragraph breaks are meaning.
      */}
      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-cream-200 px-3 py-2 text-sm">
        {report.reason}
      </p>

      <h3 className="mt-5 text-sm font-semibold text-text-primary">What was reported</h3>
      {report.contentAvailable ? (
        <ul className="mt-1 space-y-2">
          {report.content.map((item) => (
            <li
              key={item.id}
              className="whitespace-pre-wrap rounded-lg border border-border-subtle px-3 py-2 text-sm"
            >
              {item.body}
              {/*
                Only what was reported. **No surrounding thread, no other conversation between
                the pair, nothing about a third party** (FR-942) — enforced in the query rather
                than by what this component chooses to render, so a client that wanted the rest
                could not obtain it by asking differently.
              */}
              {report.kind === 'questions' ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setRemoving(item.id)}
                    className="min-h-11 rounded-lg border border-danger-500 px-3 text-sm font-medium text-danger-700 hover:bg-danger-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                  >
                    Remove this question
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        // ─────────────────────────────────────────────────────────────────────────────────────
        // **A state, not an error** (FR-941). Neutral styling deliberately: rendering this in the
        // danger palette would tell an operator something had gone wrong, and nothing has.
        // ─────────────────────────────────────────────────────────────────────────────────────
        <p className="mt-1 rounded-lg bg-cream-200 px-3 py-2 text-sm text-text-body">
          The reported {report.kind === 'questions' ? 'question is' : 'messages are'} no longer
          here. That is usual — content is often deleted or withdrawn before a report is read, and
          it does not mean the report was empty.
        </p>
      )}

      {/*
        **The removal control is offered only for a question report** (FR-953). A message report
        has no removal action anywhere: 007's block at report time is the protective act there,
        and a message removal route would be a second, unreviewed decision about somebody else's
        correspondence. `admin-remove-question.test.ts` asserts the server half.
      */}

      {report.resolution ? (
        <div className="mt-6 rounded-lg bg-mint-100 px-3 py-3 text-sm text-mint-800">
          <p className="font-medium">
            Resolved as {report.resolution.outcome} by {report.resolution.resolvedBy}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{report.resolution.note}</p>
        </div>
      ) : (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setResolving(true)}
            className="min-h-11 rounded-lg bg-coral-600 px-4 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          >
            Record a resolution
          </button>
        </div>
      )}

      <ResolveDialog
        open={resolving}
        reportId={report.id}
        onClose={() => setResolving(false)}
        onResolved={() => {
          setResolving(false)
          onResolved()
        }}
      />

      <RemoveQuestionDialog
        open={removing !== null}
        reportId={report.id}
        questionId={removing}
        onClose={() => setRemoving(null)}
        onRemoved={() => {
          setRemoving(null)
          void load()
        }}
      />

      {/*
        **Nothing here tells the reporter anything** (FR-946). There is no status to show them, no
        case identifier, and nothing to poll — decision 35 conditions the whole read on it: the
        reporter is still promised nothing, so a queue must not become a status they can see.
      */}
    </article>
  )
}
