import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { operators } from './operators.js'
import { abuseReports } from './reports.js'

/**
 * T020 (011) — **what an operator did about a report** (FR-943, FR-944, FR-945, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`report_id` IS UNIQUE, AND THAT CONSTRAINT *IS* FR-945'S CONCURRENCY GUARANTEE.**
 *
 * Two operators opening the same report and both resolving it is not a hypothetical: the queue
 * is a shared work list, and nothing stops two people reading it at once. The obvious
 * implementation — read whether it is resolved, then insert — is a read-then-write race in which
 * the second write silently overwrites the first operator's outcome and note.
 *
 * A unique constraint removes the race rather than narrowing it. The second resolution is a
 * duplicate-key violation, caught and returned as a **409 with an explanation**, so no code path
 * exists that could overwrite the first by forgetting to check. This is the same reasoning as
 * 009's composite primary key on `question_votes`: the schema enforces the rule, so a double-tap
 * is the same request twice rather than a bug waiting for the right timing.
 *
 * The 409 is one of the few refusals in this product that carries a reason, and it passes the
 * test all of them must: **the follow-up question is about the reader.** It describes a conflict
 * the reader can act on — somebody has already dealt with this — and discloses nothing about any
 * attendee.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: follows `abuse_reports`, which is CROSS-EVENT.** 007's rule that conduct is not a
 * conference: someone's behaviour does not become acceptable because they switched events.
 *
 * **DELETION / RETENTION: cascades with its report, and needs NO retention clock.**
 *
 * `abuse_reports` cascades from **both** the reporter and the reported attendee, so an attendee's
 * erasure already reaches this table transitively. That is the deliberate contrast with
 * `admin_audit_entries`, which needs a clock — and the difference is the point: **a resolution is
 * about a report about attendees, while an audit entry is about an operator's act.** One is
 * attendee data reached by an existing cascade; the other is not attendee data at all and no
 * cascade can reach it.
 */
export const reportResolutions = pgTable(
  'report_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Unique — see the header. This single word is the concurrency design. */
    reportId: uuid('report_id')
      .notNull()
      .unique()
      .references(() => abuseReports.id, { onDelete: 'cascade' }),

    /**
     * `NO ACTION` (FR-944). A resolution must keep naming the operator who made it, which is
     * exactly why `operators` is deactivated rather than deleted (FR-909). A resolution
     * attributed to nobody is an accountability record with the accountability removed.
     */
    resolvedBy: uuid('resolved_by')
      .notNull()
      .references(() => operators.id),

    /**
     * **Two outcomes, and there is deliberately no third.**
     *
     * `actioned` — the operator did something about it, which in this feature means exactly one
     * thing: they removed a reported question (FR-950). `dismissed` — they judged that nothing
     * was warranted.
     *
     * There is no `escalated`, no `pending`, no `needs_review`. A status meaning "somebody is
     * still thinking about it" would be a workflow, and a workflow would need an owner, a queue
     * position and a notion of staleness — none of which any requirement asks for, and all of
     * which would be visible to the reporter through timing if they existed. The queue's own
     * open/resolved split (FR-943) already carries "not dealt with yet"; a report either has a
     * resolution row or it does not.
     */
    outcome: text('outcome').notNull(),

    /**
     * The operator's own record of why (FR-944).
     *
     * Required and non-empty. A resolution with no note is an act nobody can review later, and
     * the whole reason this table exists rather than a boolean is that *what was decided* is
     * less useful than *why*.
     */
    note: text('note').notNull(),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('report_resolutions_outcome_valid', sql`${table.outcome} in ('actioned', 'dismissed')`),

    /**
     * Non-empty, and **`btrim` with the whitespace set spelled out** — 009's defect, met again.
     *
     * PostgreSQL's one-argument `trim()` strips **spaces only**, so `length(trim(note)) > 0`
     * accepts `"\n\t \n"` while the route — using JavaScript's Unicode-aware
     * `String.prototype.trim` — refuses it. The two layers disagree and the weaker one is the
     * last line of defence. 009 found this in `abuse_reports.reason`'s neighbour and fixed it by
     * naming the characters; this constraint is written correctly from the start rather than
     * inheriting the older spelling one file over.
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **THE DOUBLE BACKSLASHES ARE LOAD-BEARING, AND WRITING THEM SINGLY IS A SILENT DEFECT.**
     *
     * This is a JavaScript template literal, so `\t` is consumed by *JavaScript* and an actual
     * tab character is interpolated into the SQL string — which then reaches the migration file
     * as a raw control character inside a string literal, spanning lines. Postgres accepts it
     * and the constraint happens to work, so nothing fails; but the emitted SQL contains an
     * invisible newline and carriage return that any editor, formatter or `git` autocrlf
     * setting is free to rewrite, at which point the constraint quietly stops covering the
     * characters it names.
     *
     * `\\t` reaches Postgres as the two characters `\` and `t`, which the `E''` prefix then
     * interprets — the escaping happens where the `E` says it does. 009 spells it this way in
     * `session_questions_body_length`, and this file initially did not: it was caught by reading
     * the generated migration, which is exactly what T024's by-hand review is for.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    check('report_resolutions_note_present', sql`length(btrim(${table.note}, E' \\t\\n\\r')) > 0`),

    // "Which operator has resolved what" — the only read that is not by report id.
    index('report_resolutions_resolved_by_idx').on(table.resolvedBy),
  ],
)

export type ReportResolution = typeof reportResolutions.$inferSelect
export type NewReportResolution = typeof reportResolutions.$inferInsert
