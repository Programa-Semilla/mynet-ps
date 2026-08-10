import { lt, sql } from 'drizzle-orm'

import { getDb } from '../client.js'
import { abuseReports } from '../schema/reports.js'

/**
 * T008, T019, T078 (007) — abuse reports (FR-542–FR-549, research R3, R11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS WRITE-AND-SWEEP ONLY. THERE IS DELIBERATELY NO READ FUNCTION, AND ADDING
 * ONE IS THE THING FR-548 FORBIDS.**
 *
 * No `getReport`, no `listReports`, no `countReportsAgainst`. Not because nobody has needed one
 * yet — because a read function here is the first half of a moderation screen, and a moderation
 * screen needs a moderator, who is an organizer: the actor Principle III excludes from this
 * product by construction.
 *
 * The report leaves the product **as mail** (FR-547) and the operator acts out-of-band. That is
 * the entire disposal path. `tests/unit/no-report-read-surface.test.ts` (T073) fails the build
 * if a read surface appears here or on any route, because the requirement is an absence and an
 * absence erodes without a test.
 *
 * `pruneExpiredReports` below is not a read: it selects nothing and returns nothing but a count
 * of rows it removed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How long a report row survives (research R3).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **90 days, and the row is not the record.** The durable artifact is the operator's mail,
 * which is what makes discarding this safe rather than a loss — the row exists so that a report
 * is not lost in the window between writing it and dispatching it, and so a dispatch failure is
 * recoverable by someone reading the database directly.
 *
 * Kept as a stated constant rather than configuration, because lengthening a retention window
 * for personal data is a decision that belongs in a review, not in an environment variable.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const REPORT_RETENTION_DAYS = 90

/**
 * Removes reports past their window.
 *
 * The second line, not the first: `abuse_reports` cascades from **both** `reporter_id` and
 * `reported_id`, so either party deleting their account already takes the row with them. This
 * covers the case neither does — a report about conduct between two attendees who both stay.
 *
 * The accepted consequence is recorded in the schema file rather than hidden: a report can be
 * lost if dispatch fails and the reported attendee then deletes. The erasure right was chosen
 * over the evidence.
 */
/**
 * T078 (007) — write a report (FR-545).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONLY FUNCTION IN THIS FILE THAT TOUCHES A ROW, AND IT IS A WRITE.** See the header: no
 * `getReport`, no `listReports`, no `countReportsAgainst`, ever.
 *
 * `messageIds` is stored as an array with **no foreign key**, deliberately (schema/reports.ts):
 * the reported messages will frequently be gone before anyone looks, and an array degrades
 * honestly into a list of things that no longer exist rather than blocking a deletion the
 * erasure right requires or silently emptying the report.
 *
 * Returns the identifier **for the mail dispatch only**. It is not returned to the caller — the
 * contract is explicit that a report answers 204 with no body, because a case identifier would
 * promise a review surface FR-548 forbids building.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const writeReport = async (report: {
  readonly reporterId: string
  readonly reportedId: string
  readonly reason: string
  readonly messageIds: readonly string[]
}): Promise<{ reportId: string; reportedAt: string } | null> => {
  const messageIds = report.messageIds.filter((id) => UUID.test(id))

  // ───────────────────────────────────────────────────────────────────────────────────────
  // The identifiers reach the statement as **one bound JSON parameter**, expanded by the
  // database, rather than being interpolated into an array literal. The regex above already
  // rejects anything that is not a uuid, so a literal would be safe today — and it would be one
  // edit away from not being, in a statement built from client input. `coalesce` covers the
  // empty case, because the column is `NOT NULL` and `array_agg` over nothing is `NULL`.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const rows = await getDb().execute<{ id: string; created_at: string }>(sql`
    INSERT INTO abuse_reports (reporter_id, reported_id, reason, message_ids)
    SELECT ${report.reporterId}::uuid, ${report.reportedId}::uuid, ${report.reason.trim()},
           coalesce(
             (SELECT array_agg(value::uuid)
              FROM json_array_elements_text(${JSON.stringify(messageIds)}::json) AS value),
             '{}'::uuid[]
           )
    WHERE EXISTS (SELECT 1 FROM attendees WHERE id = ${report.reportedId}::uuid)
    RETURNING id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  `)

  const row = rows[0]
  return row ? { reportId: row.id, reportedAt: row.created_at } : null
}

/**
 * Matched rather than cast. The identifiers arrive from a client, and a failed `::uuid` cast
 * inside the array literal would produce a 500 rather than a report that simply records fewer
 * messages than were claimed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const pruneExpiredReports = async (): Promise<void> => {
  await getDb()
    .delete(abuseReports)
    .where(
      lt(
        abuseReports.createdAt,
        sql`now() - interval '${sql.raw(`${REPORT_RETENTION_DAYS}`)} days'`,
      ),
    )
}
