import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { FastifyReply } from 'fastify'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { operatorSessions, type OperatorSession } from '../db/schema/operator-sessions.js'
import { hashToken, issueToken } from '../auth/token.js'
import {
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE,
  clearedAdminSessionCookieOptions,
} from './cookie.js'

/**
 * T037 (013) — establishing, resolving and revoking administrative sessions (FR-911, FR-919,
 * FR-919a, FR-919b, research R8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ABSOLUTE CAP IS RESOLVED TO AN INSTANT ONCE, HERE, AND NOTHING EVER MOVES IT.**
 *
 * This module reuses `auth/token.ts` — the opaque-token-and-store-only-the-hash design is
 * identical and duplicating it would be two chances to store the token instead of the hash. What
 * it does **not** reuse is `auth/session.ts`, and the reason is structural rather than stylistic:
 * that module writes `auth_sessions`, and research R3 records why a shared table would eventually
 * let one product's sign-out end the other's session.
 *
 * The two bounds are the substantive difference from the attendee session, which has one:
 *
 *   - `idle_expires_at` is recomputed on every authenticated request. It asks *"has this person
 *     stopped working?"*
 *   - `absolute_expires_at` is computed **at establishment** and is never touched again. It asks
 *     *"how long may one sign-in last, no matter how busy?"* A session used every four minutes
 *     would never expire under an idle rule alone.
 *
 * Storing the second rather than deriving it from `created_at` is the decision plan.md tracks
 * under Complexity: **a configuration change must not retroactively alter a live session.** An
 * operator lengthening `ADMIN_SESSION_ABSOLUTE_HOURS` must not silently extend every session
 * already open, including one nobody is sitting at.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Which principal a session belongs to. Exactly one, mirroring the check constraint. */
export type AdminSubject = { readonly operatorId: string } | { readonly attendeeId: string }

/**
 * Signs an administrative principal in: one new row, one host-only cookie, **no token in any
 * response body**.
 *
 * The cookie's `maxAge` is the **idle** window rather than the absolute one, deliberately. The
 * browser's copy expiring at the idle bound means an abandoned tab stops sending a cookie the
 * server would refuse anyway; setting it to the absolute cap would leave the browser presenting
 * a dead token for hours. Neither is the authority — the server evaluates both bounds on every
 * request (FR-919a, FR-919b) and never consults the client's belief about its own validity.
 */
export const startAdminSession = async (
  reply: FastifyReply,
  subject: AdminSubject,
): Promise<void> => {
  const config = loadConfig()
  const { token, tokenHash } = issueToken()
  const now = Date.now()

  await getDb()
    .insert(operatorSessions)
    .values({
      operatorId: 'operatorId' in subject ? subject.operatorId : null,
      attendeeId: 'attendeeId' in subject ? subject.attendeeId : null,
      tokenHash,
      idleExpiresAt: new Date(now + config.admin.sessionIdleMs),
      // Fixed here and never advanced. See the header.
      absoluteExpiresAt: new Date(now + config.admin.sessionAbsoluteMs),
    })

  void reply.setCookie(
    ADMIN_SESSION_COOKIE,
    token,
    adminSessionCookieOptions(config.admin.sessionIdleMs),
  )
}

/**
 * Resolves a live session from its token and **advances the idle window** (FR-919a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **BOTH BOUNDS ARE IN THE `WHERE`, SO THERE IS NO CODE PATH THAT COULD CHECK ONE AND NOT THE
 * OTHER.**
 *
 * The alternative — select the row, then compare two timestamps in application code — is one
 * `if` away from a session that outlives its absolute cap, and the `if` that goes missing would
 * be invisible in review because the other one is right there next to it. Expressing both as
 * conditions on the update means a row that fails either is simply not returned, exactly as
 * `requireEventAccess` makes "exists but not yours" indistinguishable from "does not exist" by
 * having one query rather than two.
 *
 * The idle window is advanced in the **same statement** that reads the row, so a request cannot
 * be authorised against a window it then fails to extend. `absolute_expires_at` is deliberately
 * absent from the `set` clause.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const resolveAdminSession = async (token: string): Promise<OperatorSession | undefined> => {
  const config = loadConfig()
  const tokenHash = hashToken(token)
  const nextIdle = new Date(Date.now() + config.admin.sessionIdleMs)

  const rows = await getDb()
    .update(operatorSessions)
    .set({ idleExpiresAt: nextIdle, lastUsedAt: sql`now()` })
    .where(
      and(
        eq(operatorSessions.tokenHash, tokenHash),
        isNull(operatorSessions.revokedAt),
        sql`${operatorSessions.idleExpiresAt} > now()`,
        sql`${operatorSessions.absoluteExpiresAt} > now()`,
      ),
    )
    .returning()

  return rows[0]
}

/**
 * Re-issues the session cookie on an authenticated request, so the browser's copy tracks the
 * server's idle window (FR-919a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WITHOUT THIS THE IDLE WINDOW DID NOT SLIDE, AND THE ABSOLUTE CAP COULD NEVER BE REACHED.**
 *
 * The cookie was issued once, at sign-in, with `maxAge = sessionIdleMs`, and never again —
 * while `resolveAdminSession` advanced `idle_expires_at` in the database on every request. So
 * the server believed in a sliding window and the browser did not: it discarded the cookie 30
 * minutes after sign-in however continuously the operator worked, which made the *idle* bound
 * behave as a fixed cap from establishment and made the *absolute* bound — the one FR-919b
 * exists for, and the whole reason there are two — unreachable in practice.
 *
 * `plugins/auth-context.ts` does exactly this for the attendee cookie and says why: the
 * browser's copy must expire with the server's "rather than disappearing first and looking like
 * an unexplained sign-out". The administrative product needs it more, not less, because it is
 * the product with a second bound behind the first.
 *
 * **Clamped to whatever remains of the absolute cap**, so the browser never holds a cookie the
 * server would refuse. That is not merely tidy: it is what stops a re-issued idle window from
 * silently extending the browser's belief past the bound the session was established under.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const refreshAdminSessionCookie = (
  reply: FastifyReply,
  token: string,
  absoluteExpiresAt: Date,
): void => {
  const config = loadConfig()
  const remainingMs = absoluteExpiresAt.getTime() - Date.now()
  const maxAgeMs = Math.max(0, Math.min(config.admin.sessionIdleMs, remainingMs))

  void reply.setCookie(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions(maxAgeMs))
}

/**
 * Revokes one session (FR-919) and clears the cookie.
 *
 * `revoked_at` rather than a delete, for the reason `auth/session.ts` gives: the resolve query
 * filters on it, so a revoked row cannot authenticate anything from the next request onward, and
 * the row is swept later. Only unrevoked rows are touched, so an earlier revocation keeps its own
 * timestamp — the record of *when* a session ended is not overwritten.
 */
export const revokeAdminSession = async (reply: FastifyReply, sessionId: string): Promise<void> => {
  await getDb()
    .update(operatorSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(operatorSessions.id, sessionId), isNull(operatorSessions.revokedAt)))

  void reply.setCookie(ADMIN_SESSION_COOKIE, '', clearedAdminSessionCookieOptions())
}

/**
 * The retention sweep for expired administrative sessions. Removes rows past **either** bound,
 * plus revoked ones, after a short grace.
 *
 * **Registered in `RETENTION_SWEEPS` in `maintenance.ts`, and the previous version of this
 * comment was wrong to say it need not be.** It claimed the table was "classified by its
 * cascades — from `operators` and from `attendees` — so the coverage guard is satisfied without
 * it", and called this "a second line against accumulation". It was no line at all: nothing
 * called this function, so nothing ever removed a row.
 *
 * The cascades are real and reach almost nothing. An operator is never deleted in normal
 * operation — deactivation is terminal, and `pruneDeactivatedOperators` removes the row only
 * once no audit entry names it, which takes a year — so an operator's sessions had no clock,
 * and an organizer's only had one if that attendee erased their whole account.
 */
export const pruneAdminSessions = async (): Promise<void> => {
  await getDb()
    .delete(operatorSessions)
    .where(
      or(
        lt(operatorSessions.absoluteExpiresAt, sql`now() - interval '7 days'`),
        lt(operatorSessions.idleExpiresAt, sql`now() - interval '7 days'`),
        lt(operatorSessions.revokedAt, sql`now() - interval '7 days'`),
      ),
    )
}
