import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { operators } from './operators.js'

/**
 * T021 (013) — **the append-only record of administrative acts** (FR-994–FR-999, research R6).
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
     * T002 (014) — **the acting principal when that principal is a conference ORGANIZER, who
     * has no `operators` row at all** (FR-1037, FR-1038).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════════
     * **THIS COLUMN EXISTS BECAUSE 013's TWO AUDITED ACTS WERE BOTH PLATFORM-TIER, AND 014's ARE
     * NOT.**
     *
     * 013 audited promotion, demotion, report resolution, question removal, operator
     * deactivation and content disclosure — every one of them platform-only, so `operator_id`
     * was always non-null and the question never arose. 014 audits **authoring**, whose ordinary
     * actor is a conference organizer: an attendee holding a live `organizer_assignments` row,
     * with no `operators` row by design (see `schema/operators.ts` — that asymmetry is what
     * makes FR-904 achievable).
     *
     * Without this column, FR-1037 would be unimplementable for the tier that does most of the
     * authoring. Three alternatives were available and all are worse:
     *
     *   - **Write `operator_id = NULL` for organizer acts.** `appendAuditEntry`'s own header
     *     already rules this out: *"an entry written with no operator would be an accountability
     *     record accounting for nobody."*
     *   - **Give organizers an `operators` row.** That is exactly the change `schema/operators.ts`
     *     names as collapsing two tiers into one table with a flag.
     *   - **Reuse `subject_attendee_id`.** It means *whom the act was done to*, and conflating
     *     actor with subject would make the pseudonymisation rule below incoherent.
     *
     * **No foreign key, and the reason is `subject_attendee_id`'s exactly** — see the file
     * header, which applies to this column word for word. It is **cleared on the actor's own
     * erasure** by `pseudonymiseAuditEntriesFor`, which now clears both references in one
     * statement: an organizer who deletes their account must not be reconstructible from the
     * trail of what they authored.
     *
     * **No check constraint pinning "exactly one of the two".** It would be right on every write
     * and wrong afterwards: `operator_id` is `ON DELETE SET NULL`, so an entry legitimately
     * reaches a state with neither populated, and the constraint would block the operator sweep
     * it was never meant to govern. The invariant is enforced where it can be — in
     * `AuditEntryDraft`, whose union type makes an entry naming neither principal unwritable.
     * ═════════════════════════════════════════════════════════════════════════════════════════
     */
    actorAttendeeId: uuid('actor_attendee_id'),

    /**
     * **Fourteen actions, and the set is closed by a check constraint** (FR-994, FR-995).
     *
     * Thirteen are writes. The one read, `disclose_report_content`, is **the only read in the
     * entire product that writes an audit entry** — because it is the only read the constitution
     * needed an exception to permit (v4.1.0, decision 38, the third recorded Principle VIII
     * exception). `GET /admin/reports` writes nothing, because the list carries no content.
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

    /**
     * T-review (014) — **the conference this act was performed in** (FR-1038).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────────
     * FR-1038 requires an entry to record "the principal, **the conference**, the act, the entity
     * acted on and the instant", and this column was missing. Six of 014's eight authoring actions
     * left the conference recoverable only by joining `subject_resource_id` back to the content
     * table — and for `delete_catalog` and `delete_session` that row is gone, so those entries were
     * permanently unattributable.
     *
     * **Nullable and with no foreign key**, for two reasons rather than one. 013's six platform-tier
     * acts (promotion, demotion, report resolution, question removal, operator deactivation, content
     * disclosure) are product-wide and have no conference, so null is a real state rather than a
     * gap. And the trail outlives what it describes: `abuse_reports.message_ids` and
     * `sessions.last_change_act_id` both take the same shape, because an accountability record that
     * a cascade could delete is not one.
     * ─────────────────────────────────────────────────────────────────────────────────────────
     */
    subjectEventId: uuid('subject_event_id'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Derived from ADMIN_AUDIT_ACTIONS rather than restated: tranche 2 found this constraint
    // carrying its own hand-copy of the list, which is how an action gets declared, used, and
    // refused by the database that was never told about it. One source, two readers.
    check(
      'admin_audit_entries_action_valid',
      sql`${table.action} in (${sql.raw(ADMIN_AUDIT_ACTIONS.map((a) => `'${a}'`).join(', '))})`,
    ),

    // The retention sweep's predicate, and the only ordering anybody would read this table by.
    index('admin_audit_entries_occurred_at_idx').on(table.occurredAt),
    // Pseudonymisation is `WHERE subject_attendee_id = $1` inside a deletion transaction that is
    // already holding locks; without this it scans the whole table on every account deletion.
    index('admin_audit_entries_subject_attendee_idx').on(table.subjectAttendeeId),
    // T004 (014) — pseudonymisation now clears two columns, in **two** statements, and the
    // retention sweep's predicate reads both.
    //
    // "One statement" is what this said, and `pseudonymiseAuditEntriesFor` explains at length why
    // one would be wrong: a single `SET` under `WHERE (subject_attendee_id = $1 OR
    // actor_attendee_id = $1)` clears the *subject* on an entry where only the *actor* matched —
    // data loss wearing the costume of a simplification. Corrected here because two comments on
    // one mechanism asserting opposite things is how somebody comes to "tidy" it back.
    //
    // Same reasoning as the index above it: an account deletion holds locks while it runs, and an
    // unindexed `WHERE actor_attendee_id = $1` would scan the fastest-growing table this product
    // has.
    index('admin_audit_entries_actor_attendee_idx').on(table.actorAttendeeId),
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
 * name the same fourteen things. A fifteenth must be added here, in the check constraint, and in
 * a migration — three deliberate edits rather than one string typed at a call site.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'promote',
  'demote',
  'resolve_report',
  'remove_question',
  'deactivate_operator',
  'disclose_report_content',

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 014 — **authoring, and it is the first act category either tier may perform** (FR-1037,
  // FR-1038). Everything above is platform-tier only; everything below is ordinarily performed
  // by a conference organizer, which is why `actor_attendee_id` exists.
  //
  // Eight rather than one generic `author` action, for the reason the six above are six: the
  // completeness test requires every declared action to be *used*, so a coarse action would let
  // three genuinely different acts hide behind one name — and the trail exists to answer "who
  // removed this, and when" about a specific thing.
  //
  // The split follows what each act does to attendee state rather than which HTTP verb produced
  // it. `cancel_session` and `delete_session` are the two that matter and are deliberately not
  // one entry: cancellation preserves every note, question and vote (FR-1021) while deletion is
  // permitted only where none exists (FR-1018), so an entry that could not tell them apart would
  // be unable to answer the only question anybody would ask of it.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'create_conference',
  'update_conference',
  'write_catalog',
  'delete_catalog',
  'write_session',
  'cancel_session',
  'reinstate_session',
  'delete_session',

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 014 tranche 2 — **vocabulary authoring, platform tier only** (FR-1089, FR-1089a). Three
  // rather than one, on the same reasoning as the catalog's split above: retiring a value and
  // deleting one are the acts the trail exists to tell apart — retirement is reversible and
  // writes to no attendee record, deletion is permitted only while nobody holds the value — so
  // an entry that could not distinguish them would be unable to answer the only question
  // anybody would ask of it. `retire_vocabulary_value` covers un-retiring too: same subject,
  // same reversibility, direction recorded in the entry's detail.
  //
  // Adding these REDEFINES `admin_audit_entries_action_valid` — the same named CHECK `0011`
  // drops and re-adds — which is why tranche 2's migration is `0012` and depends on `0011`
  // (R19), and why `0010` stays permanently empty.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'write_vocabulary',
  'retire_vocabulary_value',
  'delete_vocabulary_value',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]
