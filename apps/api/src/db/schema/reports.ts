import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T008 (007) — an attendee's report of another attendee's conduct (FR-542–FR-549).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING IN MYNET MAY READ THIS TABLE** (FR-548, and now FR-972).
 *
 * No route, no repository method, no screen, no role, on the attendee product's whole surface.
 * `tests/unit/no-report-read-surface.test.ts` fails the build if one appears there, because the
 * requirement is an absence and an absence erodes without a test.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T022 (011) — THIS HEADER IS AMENDED, NOT DELETED, AND BOTH HALVES OF THAT MATTER.**
 *
 * It used to say *"nothing in this product may read this table"* and explain at length that a
 * report-reading surface needs a moderator, and a moderator is an organizer — the actor
 * Principle III excludes by construction.
 *
 * **That reasoning was correct and its premise is gone.** Constitution v4.0.0 reversed the
 * administration exclusion, and this table is one of the two obligations that *forced* the
 * reversal: register entry 21 records that the reporting dialog promises a human reader, and
 * for the whole life of this project no such human existed. An exclusion whose cost is an
 * unkeepable safety promise must be paid for or reversed.
 *
 * So there is now exactly one read surface, and it is bounded on four sides (v4.1.0, decision
 * 38 — **the third recorded Principle VIII exception**):
 *
 *   1. It exists **only in the administrative product**, never in MyNet (FR-972).
 *   2. It is reachable **only by the platform tier**. A conference organizer may not read
 *      reports at all — the queue is `requirePlatformOperator`, and the route audit asserts it.
 *   3. It discloses **only what was reported** — the specific messages or question the reporter
 *      identified, and their stated reason. Never the surrounding thread, never the pair's other
 *      conversations, never a third party (FR-942).
 *   4. **The reporter is still told nothing.** No status, no case identifier, nothing to poll
 *      (FR-946). What FR-548 protected on their side is unchanged.
 *
 * **Deleting this comment would have lost the reasoning that still governs MyNet**; leaving it
 * unamended would make the next reader believe the guard is stronger than it is. Both failures
 * were available and neither is acceptable, which is why the instruction in tasks.md is
 * "amend, do not delete".
 *
 * **The dispatched mail is unchanged** (FR-947). It still carries identifiers and a timestamp
 * only — never message text and never the reason — because it was written that way to stop that
 * text living in an inbox outside every retention rule this project controls. A queue reading
 * this row is not that, and the two must not be conflated.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: CROSS-EVENT.** A report concerns conduct, not a conference. Someone's behaviour
 * does not become acceptable because the attendee switched events.
 */
export const abuseReports = pgTable(
  'abuse_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    reportedId: uuid('reported_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /**
     * The reporter's own words. Non-empty (FR-546), enforced below and surfaced as a disabled
     * submit rather than a post-submit error, per the required-states constraint.
     *
     * **This never appears in the dispatched mail** (research R11). The mail carries
     * identifiers and a timestamp only; a reason string is free text written by one attendee
     * about another, and putting it in an email widens where that text lives from one row a
     * sweep deletes to an inbox nobody in this project controls.
     */
    reason: text('reason').notNull(),

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **An array of identifiers, deliberately NOT a foreign key or a join table.**
     *
     * The reported messages will frequently be gone before anyone looks at the report — either
     * by M3's cascade when the reported attendee deletes their account, or by the reporter's
     * own departure. A real foreign key leaves only bad options: `RESTRICT` blocks a deletion
     * the erasure right requires, and `CASCADE` silently empties the report while leaving the
     * row, which reads as "they reported nothing".
     *
     * An array degrades honestly instead: it stays a list of things that no longer exist, which
     * is the truth.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    messageIds: uuid('message_ids').array().notNull(),

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **T011 (009) — the reported questions, mirroring `message_ids` EXACTLY, including its
     * deliberate absence of a foreign key** (FR-783).
     *
     * The reasoning above transfers without modification and is if anything stronger here: a
     * reported question will frequently be gone before anyone looks at the report, because its
     * author can **withdraw it themselves** while it has no votes (FR-712) — a route no message
     * has. `RESTRICT` would block a deletion the erasure right requires; `CASCADE` would
     * silently empty the report while leaving the row, which reads as "they reported nothing".
     *
     * **No new retention rule.** `abuse_reports` is already swept at 90 days and cascades from
     * both attendees, so this column inherits all of it rather than needing one of its own.
     *
     * It ships in migration `0008` with the rest of 009's schema even though **PR-B is what
     * uses it** — schema ahead of code is the safe direction for a rollback, and the reverse
     * would put a route in production writing to a column that does not exist.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    questionIds: uuid('question_ids').array().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('abuse_reports_reason_present', sql`length(trim(${table.reason})) > 0`),

    /**
     * **Cascades from both attendees, and is additionally swept at 90 days** (research R3) —
     * see `RETENTION_SWEEPS` in `maintenance.ts`, which states the reason in place.
     *
     * The sweep is what makes this table need no retention allow-list entry despite outliving
     * the thing it describes. Discarding it is safe precisely because the operator's mail, not
     * this row, is the durable record.
     *
     * The accepted consequence is recorded rather than hidden: **a report can be lost.** If
     * dispatch fails *and* the reported attendee then deletes their account, the row cascades
     * away with nothing retained. The erasure right was chosen over the evidence; dispatch
     * failure is logged and visible.
     */
    index('abuse_reports_created_at_idx').on(table.createdAt),

    /** Both cascade paths need their own index; Postgres creates neither. */
    index('abuse_reports_reporter_id_idx').on(table.reporterId),
    index('abuse_reports_reported_id_idx').on(table.reportedId),
  ],
)

export type AbuseReport = typeof abuseReports.$inferSelect
