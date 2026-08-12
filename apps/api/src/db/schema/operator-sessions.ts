import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { operators } from './operators.js'

/**
 * T018 (011) — **an administrative session, deliberately NOT `auth_sessions`** (FR-911, FR-912,
 * FR-919a, FR-919b, research R3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A SEPARATE TABLE IS WHAT MAKES "TWO INDEPENDENT SESSIONS" TRUE RATHER THAN CLAIMED.**
 *
 * Decision 37 says one person signed into both products holds **two independent sessions**, and
 * that signing out of one does not sign out of the other. There are two halves to delivering
 * that, and both are structural:
 *
 *   - **A host-only cookie** (`apps/api/src/admin/cookie.ts`) — no `Domain` attribute, so the
 *     browser scopes it to `admin.<host>` and never sends it to the apex. That is the transport
 *     half.
 *   - **This table** — the storage half. Reusing `auth_sessions` with a `kind` column would mean
 *     one revocation query, one sweep and one expiry policy governing both, and the day somebody
 *     wrote `DELETE FROM auth_sessions WHERE attendee_id = $1` for a sign-out-everywhere feature,
 *     the two products' sessions would end together. Research R3 rejected the shared table for
 *     exactly that reason.
 *
 * The attendee session's fourteen-day idle window is also wrong here by two orders of magnitude,
 * and a shared table would have made that a per-row policy rather than a per-table one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: NEITHER.** A session belongs to a principal, not to a conference.
 *
 * **DELETION / RETENTION**: cascades from whichever subject it names, and expired rows are
 * cleared by the session sweep. Both halves matter — the cascade is what makes a departing
 * attendee's organizer session vanish with their account, and the sweep is what clears an
 * operator's rows, since an operator is never deleted.
 */
export const operatorSessions = pgTable(
  'operator_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **EXACTLY ONE OF THESE TWO IS NON-NULL, AND THE PAIR IS THE TWO TIERS.**
     *
     * A platform operator signs in as an `operators` row. A conference organizer signs in with
     * their **attendee credentials** (FR-914) — they have no separate administrative password —
     * but still receives an *administrative* session, which is precisely what makes FR-912's
     * independence from `auth_sessions` true for them as well.
     *
     * That second case is the one worth pausing on. An organizer holds two live sessions for the
     * same credential: an `auth_sessions` row for MyNet and an `operator_sessions` row for the
     * administrative site. Signing out of MyNet revokes the first and leaves the second, which
     * is the observable behaviour decision 37 asks for.
     *
     * The check constraint is what stops a third state existing. A row naming both would be a
     * principal that is two people; a row naming neither would be a session belonging to nobody
     * that `requireOperator` would have to guess about.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    operatorId: uuid('operator_id').references(() => operators.id, { onDelete: 'cascade' }),

    attendeeId: uuid('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),

    /** The **hash** of the opaque token, never the token — `auth_sessions`' reasoning exactly. */
    tokenHash: text('token_hash').notNull().unique(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),

    /** Advanced on every authenticated request — the sliding half (FR-919a). */
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **FIXED AT ESTABLISHMENT AND NEVER ADVANCED** (FR-919b, research R8).
     *
     * The idle window asks "has this person stopped working?"; this asks "how long may one
     * sign-in last, no matter how busy?" A session used every four minutes would never expire
     * under an idle rule alone, and an unattended administrative browser is a different exposure
     * from an unattended attendee one.
     *
     * **Stored rather than derived from `created_at`, and that is a design decision** the plan
     * tracks under Complexity. Deriving is simpler and would make the governing value *mutable
     * after the fact*: an operator lengthening `ADMIN_SESSION_ABSOLUTE_HOURS` would silently
     * extend every session already open, including one nobody is sitting at. The value that
     * applied when the session opened governs it.
     *
     * This is the deliberate **opposite** of 008's `lapsed`, which is derived precisely because
     * it must track the *current* slot grid. Neither choice is a default; each is argued.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),

    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'operator_sessions_exactly_one_subject',
      sql`(${table.operatorId} is null) <> (${table.attendeeId} is null)`,
    ),

    // Both cascade paths need their own index; Postgres creates neither.
    index('operator_sessions_operator_id_idx').on(table.operatorId),
    index('operator_sessions_attendee_id_idx').on(table.attendeeId),
    // The sweep reads both bounds, and the earlier of the two is what actually ends a session.
    index('operator_sessions_absolute_expires_at_idx').on(table.absoluteExpiresAt),
  ],
)

/**
 * **Deliberately absent**: user agent, device name, IP address — `auth_sessions`' reasoning,
 * unchanged. Separate rows already provide independence, and a device label would be additional
 * personal data no requirement asks for.
 */
export type OperatorSession = typeof operatorSessions.$inferSelect
export type NewOperatorSession = typeof operatorSessions.$inferInsert
