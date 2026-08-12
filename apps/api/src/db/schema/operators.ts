import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { citext } from '../types.js'

/**
 * T017 (011) — **a platform-operator identity: the product's second actor** (FR-900, FR-901,
 * FR-908, FR-990, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS NOT AN ATTENDEE, AND THE ABSENCE OF A FOREIGN KEY TO `attendees` IS THE POINT.**
 *
 * Constitution v4.0.0 admitted a second actor in two tiers, and the two tiers are stored
 * differently on purpose:
 *
 *   - A **platform operator** is a row *here*. They hold product-wide authority, are **seeded**
 *     as committed reviewed data, hold no profile, appear in no attendee surface (FR-903), and
 *     have no `attendees` row at all.
 *   - A **conference organizer** is an attendee with a live `organizer_assignments` row. They
 *     are not represented here, and giving them a row would be the change that collapses two
 *     tiers into one table with a flag.
 *
 * That asymmetry is what makes FR-904 achievable: a promoted attendee's MyNet experience is
 * unchanged because *nothing about their attendee record changes*.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: NEITHER PER-EVENT NOR CROSS-EVENT.**
 *
 * Standing decision 7 requires every new table to declare which rule applies and why, and offers
 * two. This is the third case it did not anticipate: an operator belongs to the **product**, not
 * to a conference and not to a relationship between conferences. "Neither, because the subject is
 * not conference-related" is a statement rather than a gap, and it is recorded here so that a
 * later reader does not conclude the declaration was forgotten. `organizer_assignments` is the
 * per-event table in this feature, and it says so.
 *
 * **DELETION / RETENTION: deactivate-plus-clock, and there is no self-serve deletion.**
 *
 * No attendee cascade reaches this table because an operator has no `attendees` row. Principle
 * VIII's erasure right is an *attendee's*, and an operator is not one — so `deactivated_at` is
 * the terminal state (FR-908), and a deactivated record is **retained while any
 * `admin_audit_entries` or `report_resolutions` row names it** (FR-909), then cleared by the
 * sweep in `RETENTION_SWEEPS`. `deletion-coverage.test.ts` fails by existing when this table
 * appears, and its allow-list entry records that rule rather than asserting a bare exemption.
 */
export const operators = pgTable('operators', {
  id: uuid('id').primaryKey().defaultRandom(),

  /**
   * Unique here, **and unique against `attendees.email` by application code** (FR-918).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────
   * **THE CROSS-TABLE HALF IS A GENUINE WEAKNESS, AND IT IS RECORDED RATHER THAN HIDDEN.**
   *
   * Postgres cannot express uniqueness across two tables with a constraint, and every other
   * uniqueness rule in this product is database-enforced. This one is enforced by *both* insert
   * paths checking the other table inside their transaction, plus an integration test that drives
   * the two concurrently (T049).
   *
   * It is worth the cost because FR-915 depends on it: one address must identify at most one
   * principal product-wide, which is what makes administrative sign-in **a single lookup** with
   * no branch for an observer to time. If an address could name both an attendee and an
   * operator, the resolution step would have to choose between them, and the choice would be
   * observable.
   * ───────────────────────────────────────────────────────────────────────────────────────────
   */
  email: citext('email').notNull().unique(),

  /** Shown in the administrative shell so an operator can see who they are signed in as. */
  displayName: text('display_name').notNull(),

  /**
   * **Nullable, and null is the state the seed leaves it in** (FR-990, FR-991).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * The seed is committed, reviewed, **world-readable** data — this repository is public — so it
   * cannot carry an administrative credential the way it carries throwaway attendee passwords.
   * A seeded operator therefore has *no usable credential*, and the consequence is exact:
   * **sign-in is impossible rather than defaulted.** There is no well-known password to find,
   * and no account to guess into.
   *
   * A credential arrives only through `pnpm admin:bootstrap`, which reads two values from the
   * environment (`config.admin.bootstrapEmail`/`bootstrapPassword`) that no route can reach.
   *
   * **Nullable rather than a sentinel hash.** A hash of some agreed placeholder would be a value
   * somebody could compute and submit; `null` cannot be submitted at all, because the
   * verification path has nothing to compare against and refuses before it starts.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  passwordHash: text('password_hash'),

  /**
   * True until the operator replaces the bootstrapped credential themselves (FR-992).
   *
   * While true, the session that a sign-in produces reaches **only** the credential-replacement
   * route; every other administrative address refuses with 403 and an explanation. That refusal
   * is one of the few in this product that explains itself, and it passes the test every explained
   * refusal has to pass: *the follow-up question is about the reader* — they can fix it.
   *
   * `pnpm admin:bootstrap` never resets an operator for whom this is already false (FR-993).
   * Idempotent upsert is the natural wrong implementation, which is why T058 asserts it.
   */
  credentialIsInitial: boolean('credential_is_initial').notNull().default(true),

  /**
   * Non-null ends access **permanently and immediately** (FR-908).
   *
   * Not a deletion, for the reason FR-909 gives: the identity must still resolve on records that
   * name it — an audit entry, a report resolution — long after the person has stopped working
   * here. A resolution attributed to nobody is an accountability record with the accountability
   * removed.
   */
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * **Deliberately absent**: any profile column.
 *
 * No avatar, no company, no role, no interests, no availability, no discoverability. An operator
 * is a principal, not a person in the directory (FR-903) — and there is no route through which
 * an attendee could ever see one of these rows.
 */
export type Operator = typeof operators.$inferSelect
export type NewOperator = typeof operators.$inferInsert
