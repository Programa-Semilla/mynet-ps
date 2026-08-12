import type { AdminReportSummary } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { ReportDetail } from './ReportDetail.js'

/**
 * T093, T097 (013) — the abuse-report queue (FR-940, FR-943, FR-946).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SURFACE THAT MAKES A PROMISE TRUE. SINCE 007 SHIPPED, THE REPORTING DIALOG HAS TOLD
 * ATTENDEES THAT A PERSON WILL READ THEIR REPORT — AND UNTIL THIS SCREEN, NOBODY COULD.**
 *
 * Register entry 21 is still open (nobody has been *made* that person), and this does not close
 * it. What it does is remove the impossibility.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The list carries no reported content**, which is why reading it writes no audit entry
 * (FR-995). Opening one does — that is the disclosure decision 38 had to permit, and an operator
 * scrolling a queue has disclosed nothing.
 *
 * **An empty open queue is a deliberate state, not a loading gap.** It is also the state this
 * screen will be in most of the time, and the wording says so rather than leaving somebody to
 * wonder whether the list failed to load.
 *
 * Layout: side by side at desktop, stacked at tablet and mobile (T097). The detail panel is a
 * region rather than a dialog — an operator reads it for minutes and acts from it, which is the
 * opposite of the modal interaction 005's session panel is built for.
 */
export const ReportQueue = () => {
  const { services } = useAdminSession()
  const { reportId } = useParams<{ reportId?: string }>()
  const navigate = useNavigate()

  const [reports, setReports] = useState<readonly AdminReportSummary[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailure(null)
    try {
      setReports(await services.reports.list())
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }, [services])

  useEffect(() => {
    // The initial read. See `session.tsx` for why this rule is disabled rather than worked
    // around: it is synchronisation with an external system, which the rule permits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // Separated by the client, from one response (FR-943). Two requests would let the halves
  // disagree about a report resolved between them.
  const open = reports?.filter((report) => report.resolution === null) ?? []
  const resolved = reports?.filter((report) => report.resolution !== null) ?? []

  return (
    <div className="lg:flex lg:gap-8">
      <section aria-labelledby="queue-heading" className="min-w-0 lg:w-96 lg:shrink-0">
        <h1 id="queue-heading" className="text-2xl font-semibold text-text-primary">
          Reports
        </h1>

        {failure ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"
          >
            {failure}{' '}
            <button type="button" onClick={() => void load()} className="underline">
              Try again
            </button>
          </p>
        ) : null}

        {reports === null && failure === null ? (
          <p className="mt-4 text-sm text-text-muted">Loading the queue…</p>
        ) : null}

        {reports !== null ? (
          <>
            <h2 className="mt-6 text-sm font-semibold tracking-wide text-text-muted uppercase">
              Open ({open.length})
            </h2>
            {open.length === 0 ? (
              // A deliberate state. See the file header — this is the normal one.
              <p className="mt-2 rounded-lg bg-mint-100 px-3 py-3 text-sm text-mint-800">
                Nothing is waiting. Reports appear here when an attendee files one; nobody is
                notified and nothing is queued elsewhere.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {open.map((report) => (
                  <QueueRow key={report.id} report={report} selected={report.id === reportId} />
                ))}
              </ul>
            )}

            <h2 className="mt-8 text-sm font-semibold tracking-wide text-text-muted uppercase">
              Resolved ({resolved.length})
            </h2>
            {resolved.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">Nothing has been resolved yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {resolved.map((report) => (
                  <QueueRow key={report.id} report={report} selected={report.id === reportId} />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

      <section className="mt-8 min-w-0 flex-1 lg:mt-0">
        {reportId ? (
          <ReportDetail
            reportId={reportId}
            onResolved={() => {
              // Reload the list so open/resolved reflects what every other operator now sees,
              // and clear the selection — the work on this report is done.
              void load()
              void navigate('/reports')
            }}
          />
        ) : (
          <p className="text-sm text-text-muted">Select a report to read what was reported.</p>
        )}
      </section>
    </div>
  )
}

const QueueRow = ({
  report,
  selected,
}: {
  readonly report: AdminReportSummary
  readonly selected: boolean
}) => (
  <li>
    <a
      href={`/reports/${report.id}`}
      aria-current={selected ? 'true' : undefined}
      className={[
        'block min-h-11 rounded-lg border px-3 py-2 text-sm',
        selected
          ? 'border-coral-500 bg-coral-50'
          : 'border-border-subtle bg-surface-card hover:border-border-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500',
      ].join(' ')}
    >
      <span className="block font-medium text-text-primary">
        {report.reporterName} reported {report.reportedName}
      </span>
      <span className="mt-0.5 block text-xs text-text-muted">
        {report.kind === 'questions' ? 'Audience question' : 'Messages'} ·{' '}
        {new Date(report.reportedAt).toLocaleString()}
      </span>
    </a>
  </li>
)
