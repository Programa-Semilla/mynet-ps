import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T021 — one row per signed-in device (FR-029).
 *
 * Named `auth_sessions`, **never** `sessions`. In MyNet's domain language a *session* is a
 * conference talk (clarification 1), and a table called `sessions` holding authentication
 * records would collide with the product's own vocabulary in every future query.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /**
     * The **hash** of the opaque token, never the token (FR-026). Same reasoning as password
     * hashing, applied to sessions: a database read does not yield anything that can be
     * replayed as a credential.
     */
    tokenHash: text('token_hash').notNull().unique(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Advanced on every authenticated request — the sliding half of FR-028a. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Recomputed as `now() + idle window` on each authenticated request (FR-028a, D17 — 14
     * days). Evaluated server-side on every request (FR-028b); the client's belief about its
     * own validity is never consulted.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /**
     * Set by sign-out (FR-027). Sign-out revokes server-side; clearing the cookie alone would
     * leave a token that still works if it was captured.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // Revoking every session for one attendee, and the isolation queries.
    index('auth_sessions_attendee_id_idx').on(table.attendeeId),
    // Pruning expired rows.
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

/**
 * **Deliberately absent**: user agent, device name, IP address.
 *
 * FR-029 requires sessions to be *independent*, which separate rows already provide. A device
 * label would be a product feature ("your active devices") that no requirement asks for, and
 * it is additional personal data (FR-042, data-model.md).
 */
export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  attendee: one(attendees, {
    fields: [authSessions.attendeeId],
    references: [attendees.id],
  }),
}))

export type AuthSession = typeof authSessions.$inferSelect
export type NewAuthSession = typeof authSessions.$inferInsert
