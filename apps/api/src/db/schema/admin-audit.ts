import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { operators } from './operators.js'

/**
 * T021 (011) — **the append-only record of administrative acts** (FR-994–FR-999, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`subject_attendee_id` IS A PLAIN NULLABLE COLUMN WITH NO FOREIGN KEY, AND THAT IS THE MOST
 * IMPORTANT LINE IN THIS FILE.**
 *
 * It is the same shape and the same reasoning as `abuse_reports.message_ids`. A real foreign key
 * leaves only bad options:
 *
 *   - `CASCADE` destroys the operator's accountability record the moment the attendee it
 *     concerns exercises erasure — so the act of promoting somebody would be erasable by the
 *     person promoted.
 *   - `RESTRICT` blocks a deletion the erasure right requires, which decision 12 forbids
 *     absolutely.
 *   - `SET NULL` would produce the right *outcome*, and is still wrong: it couples a **retention
 *     decision** to a database constraint rather than to a written rule, so the reasoning would
 *     live in a migration nobody reads instead of here.
 *
 * **Pseudonymisation is therefore an explicit statement in the account-deletion transaction**
 * (T138), not a database behaviour:
 *
 *     UPDATE admin_audit_entries SET subject_attendee_id = NULL WHERE subject_attendee_id = $1
 *
 * FR-997b forbids a soft-delete flag or a sentinel row, and a cleared nullable column is
 * neither — there is **no row meaning "deleted attendee"** and nothing is reconstructible.
 *
 * **Hashing was rejected**, and the reason generalises: a hash of a UUID drawn from a known set
 * is reversible by enumeration. Anybody holding the attendee table could recover the mapping in
 * one pass, which makes a hash a tombstone in disguise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **APPEND-ONLY (FR-996)** is enforced by there being **no update and no delete path** in
 * `db/queries/admin-audit.ts`, asserted by name-shape over its exports in
 * `tests/unit/audit-append-only.test.ts` — the mechanism `catalog-read-only.test.ts` already uses
 * for FR-191. The retention sweep is the single exception and lives outside that module.
 *
 * **SCOPING: NEITHER.** An entry belongs to the product's accountability record, not to a
 * conference and not to a relationship.
 *
 * **DELETION / RETENTION: pseudonymise-plus-clock. No cascade reaches this table, by design.**
 *
 * Pseudonymised entries are personal data about nobody identifiable, in exactly the sense
 * `sign_in_attempts` is — pseudonymous rather than anonymous — so Principle VIII's third rule
 * applies and a **retention window in `RETENTION_SWEEPS`** is the only thing that can clear them
 * (FR-998). That window **must not be shorter than the retention of the records it explains**:
 * an audit trail that expires before the report resolution it accounts for leaves the act
 * unexplained.
 */
export const adminAuditEntries = pgTable(
  'admin_audit_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * `SET NULL` — the one place in this table a foreign key is right.
     *
     * An operator is deactivated rather than deleted (FR-909), so this is very nearly never
     * exercised; it exists for the retention sweep that eventually clears an unreferenced
     * deactivated operator. Losing *which operator* is acceptable there in a way losing *which
     * attendee* never is, because by then the record has outlived every window that explains it.
     */
    operatorId: uuid('operator_id').references(() => operators.id, { onDelete: 'set null' }),

    /**
     * **Six actions, and the set is closed by a check constraint** (FR-994, FR-995).
     *
     * Five are writes. The sixth, `disclose_report_content`, is **the only read in the entire
     * product that writes an audit entry** — because it is the only read the constitution needed
     * an exception to permit (v4.1.0, decision 38, the third recorded Principle VIII exception).
     * `GET /admin/reports` writes nothing, because the list carries no content.
     *
     * A closed set rather than free text, so that `admin-audit-completeness.test.ts` can derive
     * its expectations from the route table and a new administrative write fails by existing.
     */
    action: text('action').notNull(),

    /** See the header. **No foreign key**, cleared on erasure (FR-997a). */
    subjectAttendeeId: uuid('subject_attendee_id'),

    /**
     * The non-attendee subject: a report, a question, a conference, an operator.
     *
     * Also no foreign key, and for a plainer reason than the column above: these rows outlive
     * what they name. A removed question is gone by definition — removing it is the act being
     * recorded — so a reference to it could only ever be dangling or blocking.
     */
    subjectResourceId: uuid('subject_resource_id'),

    /** What kind of thing `subject_resource_id` names, since it has no constraint to say. */
    subjectKind: text('subject_kind'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'admin_audit_entries_action_valid',
      sql`${table.action} in ('promote', 'demote', 'resolve_report', 'remove_question', 'deactivate_operator', 'disclose_report_content')`,
    ),

    // The retention sweep's predicate, and the only ordering anybody would read this table by.
    index('admin_audit_entries_occurred_at_idx').on(table.occurredAt),
    // Pseudonymisation is `WHERE subject_attendee_id = $1` inside a deletion transaction that is
    // already holding locks; without this it scans the whole table on every account deletion.
    index('admin_audit_entries_subject_attendee_idx').on(table.subjectAttendeeId),
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **The covering index for `operator_id`'s foreign key.** Postgres creates one for a primary
    // key and for a unique constraint, and **none for a foreign key** — the repository already
    // carries this as a recorded unclaimed defect on 004's two token tables.
    //
    // It bites hardest here. `pruneDeactivatedOperators` runs hourly and anti-joins this table,
    // the fastest-growing one this feature adds, to find operators nothing still names; and the
    // `ON DELETE SET NULL` back-reference has to find these rows whenever an operator row is
    // finally swept. Both are sequential scans without it.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    index('admin_audit_entries_operator_idx').on(table.operatorId),
  ],
)

/**
 * **Deliberately absent**: any column that could carry disclosed content (FR-999).
 *
 * No body, no reason, no message text, no excerpt. The entry records **that** a disclosure
 * happened — which operator, about whom, when — and nothing about what was seen. A content
 * column here would turn the accountability record into a second, unbounded copy of exactly what
 * v4.1.0's third exception carefully bounded, living outside every retention rule that governs
 * the original. `admin-forbidden-surfaces.test.ts` asserts this over the source.
 */
export type AdminAuditEntry = typeof adminAuditEntries.$inferSelect
export type NewAdminAuditEntry = typeof adminAuditEntries.$inferInsert

/**
 * The closed action set, exported so the repository, the routes and the completeness test all
 * name the same six things. A seventh action must be added here, in the check constraint, and in
 * a migration — three deliberate edits rather than one string typed at a call site.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'promote',
  'demote',
  'resolve_report',
  'remove_question',
  'deactivate_operator',
  'disclose_report_content',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]
