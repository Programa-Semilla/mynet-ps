import { aliasedTable, and, desc, eq, inArray } from 'drizzle-orm'

import { assertVerifiedOperator, type PlatformScope } from '../../admin/scope.js'
import { getDb } from '../client.js'
import { attendees } from '../schema/attendees.js'
import { messages } from '../schema/messages.js'
import { operators } from '../schema/operators.js'
import { sessionQuestions } from '../schema/questions.js'
import { reportResolutions } from '../schema/report-resolutions.js'
import { abuseReports } from '../schema/reports.js'

/**
 * T085 (013) — **reading the abuse-report queue** (FR-940–FR-946, decision 38).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE THIRD RECORDED EXCEPTION TO "PRIVATE CONTENT STAYS PRIVATE", AND IT IS
 * THE ONLY PLACE IN THE PRODUCT THAT READS `abuse_reports`.**
 *
 * `db/queries/reports.ts` — 007's module — is write-and-sweep only, and its header says a read
 * function there is the first half of a moderation screen. That was correct under Principle III's
 * old actor clause and its premise is gone: v4.0.0 admitted the actor, and **this table is one of
 * the two obligations that forced the reversal.** Register entry 21 records that the reporting
 * dialog has promised a human reader since 007 shipped, and no such human existed.
 *
 * v4.1.0's decision 38 grants the read, bounded on four sides, and every bound is visible here:
 *
 *   1. **Platform tier only.** Enforced at the route by `requirePlatformOperator`, and asserted
 *      by `operator-audit.test.ts`'s positive table. A conference organizer may not read reports
 *      *at all*.
 *   2. **Only what was reported.** See the content queries below — they select the specific rows
 *      the reporter named and nothing adjacent. Never the surrounding thread, never the pair's
 *      other conversations, never a third party (FR-942).
 *   3. **Only in the queue.** There is no other read path, and FR-999 forbids re-disclosing
 *      through the audit trail.
 *   4. **The reporter is still told nothing** (FR-946). Nothing here writes anything they can
 *      observe, and the resolution carries no reporter-facing status.
 *
 * **The operator mail is unchanged** (FR-947) — identifiers and a timestamp only, never message
 * text and never the reason. It was written that way to stop the text living in an inbox outside
 * every retention rule this project controls, and a queue reading the row is not that.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** One row of the queue. **No content** — see `listReports` for why. */
export interface ReportSummary {
  readonly id: string
  readonly reporterName: string
  readonly reportedName: string
  readonly reportedAt: string
  readonly kind: 'messages' | 'questions'
  readonly resolution: {
    readonly outcome: string
    readonly note: string
    readonly resolvedAt: string
    readonly resolvedBy: string
  } | null
}

/** The detail view. This is the disclosure decision 38 grants. */
export interface ReportDetail extends ReportSummary {
  /** The reporter's own words (FR-940). Never in the mail; only here. */
  readonly reason: string
  /**
   * **A first-class state, not an error** (FR-941).
   *
   * Reported message and question ids are stored as plain arrays rather than foreign keys
   * *precisely because* the content is usually gone before anyone looks — deleted with an
   * account, or withdrawn by its author. A client rendering this as a failure has misread the
   * contract, and `report-detail.test.tsx` asserts the opposite.
   */
  readonly contentAvailable: boolean
  readonly content: readonly { readonly id: string; readonly body: string }[]
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

/**
 * The queue, open and resolved separated by the caller (FR-943).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **NO CONTENT IN THE LIST, AND THAT IS WHY READING THE LIST WRITES NO AUDIT ENTRY** (FR-995).
 *
 * The disclosure the constitution had to permit is *reported content*. A list of who reported
 * whom and when is metadata an operator needs to do the work at all, and putting bodies in it
 * would mean an operator scrolling a queue discloses fifty conversations without deciding to
 * read any of them — which would make the audit trail a record of scrolling rather than of
 * disclosure.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Both report origins appear in one list** because `abuse_reports` is one cross-event table:
 * 007's rule that conduct is not a conference. A message report and a question report differ only
 * in which array is populated, and `kind` says which.
 */
export const listReports = async (unverified: PlatformScope): Promise<readonly ReportSummary[]> => {
  // The queue is the third Principle VIII exception's surface. Asserting the scope at the query
  // rather than only at the route is what makes "platform tier only" a property of the read
  // itself — a `requirePlatformOperator` that a later refactor forgets to register would
  // otherwise leave this callable with an unbranded object.
  assertVerifiedOperator(unverified)

  const reporter = aliasedTable(attendees, 'reporter')
  const reported = aliasedTable(attendees, 'reported')

  const rows = await getDb()
    .select({
      id: abuseReports.id,
      reporterName: reporter.displayName,
      reportedName: reported.displayName,
      reportedAt: abuseReports.createdAt,
      questionIds: abuseReports.questionIds,
      outcome: reportResolutions.outcome,
      note: reportResolutions.note,
      resolvedAt: reportResolutions.resolvedAt,
      resolvedBy: operators.displayName,
    })
    .from(abuseReports)
    .innerJoin(reporter, eq(reporter.id, abuseReports.reporterId))
    .innerJoin(reported, eq(reported.id, abuseReports.reportedId))
    // Left joins: an unresolved report is the normal case and must appear.
    .leftJoin(reportResolutions, eq(reportResolutions.reportId, abuseReports.id))
    .leftJoin(operators, eq(operators.id, reportResolutions.resolvedBy))
    // Newest first. An operator works the top of the queue, and the oldest unresolved report is
    // not more urgent than the newest — conduct is time-sensitive in the other direction.
    .orderBy(desc(abuseReports.createdAt))

  return rows.map((row) => ({
    id: row.id,
    reporterName: row.reporterName,
    reportedName: row.reportedName,
    reportedAt: iso(row.reportedAt),
    kind: row.questionIds.length > 0 ? ('questions' as const) : ('messages' as const),
    resolution:
      row.outcome === null || row.note === null || row.resolvedAt === null
        ? null
        : {
            outcome: row.outcome,
            note: row.note,
            resolvedAt: iso(row.resolvedAt),
            // An operator deactivated since resolving still resolves here — FR-909's whole
            // point. `NO ACTION` on `resolved_by` is what keeps this join finding a row.
            resolvedBy: row.resolvedBy ?? 'a former operator',
          },
  }))
}

/**
 * One report, **with the reported content and the reporter's stated reason** (FR-940, FR-941).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONTENT QUERIES ARE BOUNDED IN TWO DIRECTIONS, AND ONLY ONE OF THEM WAS HERE.**
 *
 * FR-942 expressed as a query rather than as a rule the client is trusted to follow. There is no
 * conversation join, no "surrounding messages" window, no sibling-question lookup — so an
 * operator cannot obtain the rest of the thread by asking differently. The alternative (fetch the
 * conversation, highlight the flagged parts) is the natural implementation and would disclose the
 * whole thread to somebody granted exactly the reported part of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE SECOND BOUND IS PROVENANCE, AND WITHOUT IT THE DISCLOSURE WAS ATTACKER-CHOSEN.**
 *
 * `message_ids` and `question_ids` are written **verbatim from the reporter's request body**.
 * `POST /reports` checks only that each entry is a well-formed UUID; nothing checks that the
 * content is the reported attendee's. Selecting purely by id therefore let a reporter decide
 * what the operator was shown: file a report naming **Bob**, list message ids from a
 * conversation with **Carol**, and the platform tier is shown Carol's private words under a
 * report about Bob — with Carol a party to nothing, and no way for the operator to tell.
 *
 * That is the third recorded Principle VIII exception (decision 38) being pointed at somebody it
 * was never granted over. The `WHERE` now requires the content to have been **authored by the
 * reported attendee**, so the bound is a fact about the data rather than a claim in the request.
 * Ids that fail it simply do not appear, which lands in the `contentAvailable: false` state that
 * already exists for content deleted before anyone looked (FR-941) — no new state, no new shape.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const findReport = async (
  unverified: PlatformScope,
  reportId: string,
): Promise<ReportDetail | undefined> => {
  assertVerifiedOperator(unverified)

  const reporter = aliasedTable(attendees, 'reporter')
  const reported = aliasedTable(attendees, 'reported')

  const rows = await getDb()
    .select({
      id: abuseReports.id,
      reason: abuseReports.reason,
      messageIds: abuseReports.messageIds,
      questionIds: abuseReports.questionIds,
      // Selected so the content queries below can bound on authorship. See the header.
      reportedId: abuseReports.reportedId,
      reporterName: reporter.displayName,
      reportedName: reported.displayName,
      reportedAt: abuseReports.createdAt,
      outcome: reportResolutions.outcome,
      note: reportResolutions.note,
      resolvedAt: reportResolutions.resolvedAt,
      resolvedBy: operators.displayName,
    })
    .from(abuseReports)
    .innerJoin(reporter, eq(reporter.id, abuseReports.reporterId))
    .innerJoin(reported, eq(reported.id, abuseReports.reportedId))
    .leftJoin(reportResolutions, eq(reportResolutions.reportId, abuseReports.id))
    .leftJoin(operators, eq(operators.id, reportResolutions.resolvedBy))
    .where(eq(abuseReports.id, reportId))
    .limit(1)

  const report = rows[0]
  if (!report) return undefined

  const isQuestionReport = report.questionIds.length > 0

  // Selected by id from the stored array, **and by authorship** — no adjacency, no thread, no
  // sibling questions, and nothing the reported attendee did not write. See the header.
  const content = isQuestionReport
    ? await getDb()
        .select({ id: sessionQuestions.id, body: sessionQuestions.body })
        .from(sessionQuestions)
        .where(
          and(
            inArray(sessionQuestions.id, report.questionIds),
            eq(sessionQuestions.attendeeId, report.reportedId),
          ),
        )
    : report.messageIds.length === 0
      ? []
      : await getDb()
          .select({ id: messages.id, body: messages.body })
          .from(messages)
          .where(
            and(inArray(messages.id, report.messageIds), eq(messages.authorId, report.reportedId)),
          )

  return {
    id: report.id,
    reason: report.reason,
    reporterName: report.reporterName,
    reportedName: report.reportedName,
    reportedAt: iso(report.reportedAt),
    kind: isQuestionReport ? 'questions' : 'messages',
    // **Expected, not exceptional.** The reported rows are usually gone by the time anybody
    // looks — see the interface.
    contentAvailable: content.length > 0,
    content,
    resolution:
      report.outcome === null || report.note === null || report.resolvedAt === null
        ? null
        : {
            outcome: report.outcome,
            note: report.note,
            resolvedAt: iso(report.resolvedAt),
            resolvedBy: report.resolvedBy ?? 'a former operator',
          },
  }
}

/**
 * Records what an operator did (FR-943, FR-944, FR-945).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **CONCURRENCY IS THE UNIQUE CONSTRAINT, NOT A CHECK.**
 *
 * `report_resolutions.report_id` is unique, so a second resolution is a duplicate-key violation
 * rather than a read-then-write race. This function does not ask whether the report is already
 * resolved — there is deliberately no such query — so no code path exists that could overwrite
 * the first operator's outcome by forgetting to check.
 *
 * The caller catches the violation and returns a **409 with an explanation** (FR-945): it
 * describes a conflict in the reader's own work, which they can act on by reloading, and it
 * discloses nothing about any attendee. Same reasoning as 009's composite primary key on
 * `question_votes`.
 *
 * Returns `false` on conflict rather than throwing a driver error upward, so the route's error
 * handling is about the domain rather than about Postgres error codes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const resolveReport = async (
  unverified: PlatformScope,
  input: {
    reportId: string
    outcome: 'actioned' | 'dismissed'
    note: string
  },
  db: Pick<ReturnType<typeof getDb>, 'select' | 'insert'> = getDb(),
): Promise<'resolved' | 'already_resolved' | 'not_found'> => {
  const scope = assertVerifiedOperator(unverified)

  const exists = await db
    .select({ id: abuseReports.id })
    .from(abuseReports)
    .where(eq(abuseReports.id, input.reportId))
    .limit(1)

  // A report that does not exist is a 404, indistinguishable from any other missing resource.
  // Checked *before* the insert only because a foreign-key violation and a unique violation
  // would otherwise be indistinguishable to the caller — and they mean different things to the
  // operator: "reload the queue" versus "that is gone".
  if (exists.length === 0) return 'not_found'

  const inserted = await db
    .insert(reportResolutions)
    .values({
      reportId: input.reportId,
      resolvedBy: scope.operatorId,
      outcome: input.outcome,
      note: input.note,
    })
    // The constraint decides. `DO NOTHING` turns the violation into zero rows rather than a
    // thrown driver error, which keeps the conflict a domain outcome.
    .onConflictDoNothing({ target: reportResolutions.reportId })
    .returning({ id: reportResolutions.id })

  return inserted.length > 0 ? 'resolved' : 'already_resolved'
}

/**
 * Whether a report names a question at all — the precondition for offering removal (FR-953).
 *
 * Kept here rather than derived on the client, because "this report offers a removal control" is
 * an authorisation-shaped question and FR-980 puts those on the server. The client hides the
 * control; this is what makes hiding it true rather than cosmetic.
 */
export const reportedQuestionIds = async (
  unverified: PlatformScope,
  reportId: string,
): Promise<readonly string[]> => {
  assertVerifiedOperator(unverified)

  const rows = await getDb()
    .select({ questionIds: abuseReports.questionIds })
    .from(abuseReports)
    .where(eq(abuseReports.id, reportId))
    .limit(1)

  return rows[0]?.questionIds ?? []
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Deliberately absent from this module: anything the reporter could observe.**
 *
 * There is no `reportStatusFor(attendeeId)`, no case identifier, no lookup keyed on a reporter.
 * FR-946 keeps the reporter told nothing, and decision 35 conditions the entire read on it:
 * *"the reporter is still promised nothing, so a queue must not become a status they can see."*
 *
 * Every function above is keyed on a report id an operator already holds, or takes no key at all.
 * There is no argument any of them accepts that an attendee could supply about themselves, which
 * is the same shape that makes FR-036 structural elsewhere in this product.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
