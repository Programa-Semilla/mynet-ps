import { eq, isNull, and } from 'drizzle-orm'
import type { FastifyReply } from 'fastify'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { authSessions } from '../db/schema/auth-sessions.js'
import { clearedSessionCookieOptions, SESSION_COOKIE, sessionCookieOptions } from './cookie.js'
import { issueToken } from './token.js'

/**
 * 004 — establishing and revoking sign-in sessions, extracted so three routes cannot disagree.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 001 wrote this inline in `sign-in.ts`, correctly, because there was one route that needed it.
 * This feature adds a second (`sign-up`, FR-306) and two that must revoke every session at once
 * (`reset`, FR-330; `DELETE /account`, FR-369). Four copies of "issue an opaque token, store
 * only its hash, set the cookie with the right lifetime" is four chances for one of them to
 * store the token instead of the hash.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Signs the attendee in: one new session row, one cookie, and **no token in any response body**
 * (FR-026, FR-306).
 *
 * One row per sign-in, which is what makes devices independent (FR-029). No attempt is made to
 * reuse or replace an existing session — that is the property `revokeAllSessions` relies on.
 */
export const startSession = async (reply: FastifyReply, attendeeId: string): Promise<void> => {
  const config = loadConfig()

  const { token, tokenHash } = issueToken()
  const expiresAt = new Date(Date.now() + config.auth.sessionIdleMs)

  await getDb().insert(authSessions).values({ attendeeId, tokenHash, expiresAt })

  void reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.auth.sessionIdleMs))
}

/**
 * Revokes **every** sign-in session for an attendee, on every device (FR-330, FR-369).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`revoked_at` rather than a delete, and the difference matters for one requirement.**
 *
 * `requireAttendee` filters on `revoked_at IS NULL`, so a revoked row cannot authenticate
 * anything from the next request onward — which is what "immediately, on every device" means
 * here (FR-369). The rows are then swept 30 days later by the existing retention sweep.
 *
 * For **account deletion** this is belt and braces: the cascade removes the rows outright a
 * moment later. It runs first anyway, because the cascade is the thing being relied on and a
 * revocation that has already happened costs nothing if it turns out to be redundant.
 *
 * Only unrevoked rows are touched, so an earlier revocation keeps its own timestamp — the
 * record of *when* a session ended is not overwritten by a later, unrelated event.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const revokeAllSessions = async (attendeeId: string): Promise<void> => {
  await getDb()
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.attendeeId, attendeeId), isNull(authSessions.revokedAt)))
}

/**
 * Clears the cookie, so the browser stops sending a session the server has already revoked.
 *
 * The **lesser** half of ending a session, as `sign-out.ts` records: revocation is what ends it,
 * and a captured token that is merely forgotten by the browser would otherwise keep working.
 * Every attribute must match the set options except lifetime, or the browser keeps the original
 * cookie alongside the cleared one.
 */
export const clearSessionCookie = (reply: FastifyReply): void => {
  void reply.setCookie(SESSION_COOKIE, '', clearedSessionCookieOptions())
}
