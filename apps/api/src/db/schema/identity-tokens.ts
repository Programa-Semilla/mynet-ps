import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { IndexColumn } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T009 (004) — email verification and password reset material (FR-320–FR-333, research D4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TWO TABLES WITH THE SAME SHAPE, DELIBERATELY NOT ONE TABLE WITH A `purpose` COLUMN.**
 *
 * The shapes are identical and the temptation to merge them is real, so the reasoning is
 * recorded where the next reader will find it.
 *
 * They differ in every way that matters. Different lifetimes — 24 hours for verification
 * (FR-320), one hour for a reset (FR-328), because a reset link *is* a live credential.
 * Different invalidation rules — FR-329 makes a new reset link invalidate the outstanding one,
 * and nothing of the sort applies to verification. Different consequences on use.
 *
 * Merging them would put a discriminator on the security-sensitive path, where **a missing
 * `WHERE` clause lets a verification link complete a password reset**. Two tables make that
 * particular mistake unwriteable: there is no query that could confuse them, because they are
 * not the same relation.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: CROSS-EVENT.** Both are properties of the account — of the address and of the
 * credential — and neither has any relationship to a conference.
 *
 * **Deletion**: `ON DELETE CASCADE` from `attendees` (FR-366).
 * **Retention**: swept once expired or consumed (FR-384), as a *second* line rather than the
 * only one. They are cascade-reachable, unlike `sign_in_attempts`, so the sweep is defence in
 * depth against accumulation rather than the mechanism that makes deletion complete.
 */

/**
 * Columns shared by both tables. A factory rather than a spread of a shared object, because
 * each call must produce its own column instances — Drizzle binds them to their table.
 *
 * This shares the *shape* while leaving the two relations distinct, which is exactly the line
 * the header above draws: the duplication being avoided here is transcription, not identity.
 */
const identityTokenColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),

  attendeeId: uuid('attendee_id')
    .notNull()
    .references(() => attendees.id, { onDelete: 'cascade' }),

  /**
   * SHA-256 of an opaque 256-bit token. **The plaintext is never stored** (FR-323, FR-333).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * This is 001's session-token pattern reused unchanged rather than a second scheme invented
   * for this feature (research D4), and `auth/token.ts` already records why SHA-256 is the
   * right hash here where Argon2id is right for a password: a 256-bit random value is not
   * guessable, so there is nothing for a slow hash to defend against.
   *
   * The requirement it satisfies — database access alone must not permit a link to be
   * reconstructed — therefore holds by the same argument that already holds for sign-in
   * sessions, rather than by a new one nobody has reviewed.
   * ───────────────────────────────────────────────────────────────────────────────────────
   *
   * `UNIQUE` so a hash collision or a repeated insert cannot produce two live rows for one
   * link, and so the lookup is an index seek.
   */
  tokenHash: text('token_hash').notNull().unique(),

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

  /**
   * When the link was used, or null. **Single use** (FR-320, FR-328).
   *
   * A timestamp rather than a boolean, for the same reason `email_verified_at` is: it answers
   * "was it used" and "when" with one column that cannot contradict itself. A consumed link
   * and an expired one are refused **identically** — the caller learns only that the link no
   * longer works, which is all they are owed.
   */
  consumedAt: timestamp('consumed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * T016 (006) — **the index PostgreSQL does not create for a foreign key** (FR-498, SC-415).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * A 004 review finding, left deliberately unclaimed because the fix needs the Drizzle snapshot
 * regenerated — which the migration README warns a feature not to do casually. 006 owns the
 * next migration number, so it is the feature that does it deliberately rather than
 * incidentally.
 *
 * **PostgreSQL indexes a `PRIMARY KEY` and a `UNIQUE` constraint, and nothing else.** A
 * `REFERENCES` clause creates no index on the *referencing* side. So `ON DELETE CASCADE` from
 * `attendees` has to find this table's matching rows by **sequential scan**, and every account
 * deletion therefore scans both token tables in full — work that grows with the number of
 * accounts that have ever verified an address or asked for a reset, on a path an attendee is
 * waiting on. SC-415 is the assertion that it stops growing.
 *
 * Expressed here in the shared factory, once, so the two tables cannot acquire it separately
 * and then drift — the same argument the column factory itself makes. The **name** has to
 * differ per table (index names are database-wide), so the table name is a parameter.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const identityTokenIndexes = (tableName: string) => (table: { attendeeId: IndexColumn }) => [
  index(`${tableName}_attendee_id_idx`).on(table.attendeeId),
]

/** FR-318, FR-319, FR-320, FR-321 — proof the address can receive mail. */
export const attendeeVerifications = pgTable(
  'attendee_verifications',
  identityTokenColumns(),
  identityTokenIndexes('attendee_verifications'),
)

/**
 * FR-326–FR-330 — the recovery path self sign-up made mandatory.
 *
 * Outstanding rows are **deleted** inside the transaction that issues a new link, not marked
 * superseded by a flag (FR-329, research D4). A flag would leave the old row usable by any
 * read that forgot to check it; a deleted row is unusable by every read there will ever be.
 */
export const attendeePasswordResets = pgTable(
  'attendee_password_resets',
  identityTokenColumns(),
  identityTokenIndexes('attendee_password_resets'),
)

export type AttendeeVerification = typeof attendeeVerifications.$inferSelect
export type AttendeePasswordReset = typeof attendeePasswordResets.$inferSelect
