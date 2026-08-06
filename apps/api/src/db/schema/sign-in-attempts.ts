import { bigserial, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * T023 — throttling and attack detection (FR-031a, FR-031c).
 *
 * **No foreign key to `attendees`, deliberately.** An attempt must be recorded even when the
 * identifier belongs to nobody — an attacker enumerating addresses is invisible otherwise, and
 * those are the attempts that matter most (data-model.md).
 *
 * **Hashes, not values.** Storing raw email addresses that were merely *typed at* the service
 * would accumulate personal data about people who may not even be attendees. A keyed hash
 * preserves the ability to count per identifier while holding no readable address. The same
 * applies to the request source. This is FR-042 and Principle VIII applied to a table that
 * exists purely for defence.
 *
 * **No credential material, ever** (FR-031c). There is no column here that could hold one, so
 * this is not a rule anyone has to remember.
 */
export const signInAttempts = pgTable(
  'sign_in_attempts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),

    /** Keyed hash of the normalised email. Never the address itself. */
    identifierHash: text('identifier_hash').notNull(),

    /**
     * Keyed hash of the request source. Source thresholds are set an order of magnitude above
     * identifier thresholds, because a conference venue puts hundreds of legitimate attendees
     * behind one public address — the edge case the spec names explicitly (research.md D9).
     */
    sourceHash: text('source_hash').notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    succeeded: boolean('succeeded').notNull(),
  },
  (table) => [
    // Counted over a rolling window, separately by each dimension (FR-031a).
    index('sign_in_attempts_identifier_idx').on(table.identifierHash, table.occurredAt),
    index('sign_in_attempts_source_idx').on(table.sourceHash, table.occurredAt),
  ],
)

export type SignInAttempt = typeof signInAttempts.$inferSelect
export type NewSignInAttempt = typeof signInAttempts.$inferInsert
