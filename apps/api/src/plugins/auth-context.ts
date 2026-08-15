import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { SESSION_COOKIE, sessionCookieOptions } from '../auth/cookie.js'
import { hashToken } from '../auth/token.js'
import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { attendees } from '../db/schema/attendees.js'
import { authSessions } from '../db/schema/auth-sessions.js'
import { notAuthenticated, sessionExpired } from '../errors.js'

/**
 * T034, T053, T054 — identity is bound at the request boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This plugin is the mechanism that makes FR-036 structural.**
 *
 * A handler downstream of `requireAttendee` receives `request.attendee` and nothing else that
 * identifies anybody. There is no attendee id in any route's params, query, or body — so a
 * handler *cannot express* another attendee's data, regardless of what the client sends.
 * FR-035 (every read path scoped by identity) then holds by construction rather than by a
 * filter someone has to remember to write, and FR-069's isolation test asserts it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
/**
 * Exported by reference so the route audit can assert **identity and ordering** rather than
 * counting preHandlers (002).
 *
 * The audit previously checked `preHandlers.length >= 2`, which a route declaring
 * `[someUnrelatedHook, requireEventAccess]` satisfied — so "binds identity first", the property
 * that stops `requireEventAccess` verifying against nobody, was not actually asserted. It could
 * not be, while this lived inside the plugin closure and had no name to compare against.
 *
 * `loadConfig()` is memoised, so reading it per request rather than per registration costs
 * nothing and removes the only reason this was closure-scoped.
 */
export const requireAttendee = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const config = loadConfig()
  const token = request.cookies[SESSION_COOKIE]

  // FR-028c — "never signed in" is a different message from "signed out for inactivity",
  // because the client explains them differently to the attendee.
  if (!token) throw notAuthenticated()

  // Only the hash was ever stored, so the lookup hashes what arrived. A tampered or
  // fabricated token simply fails to match — there is nothing to forge (FR-026).
  const tokenHash = hashToken(token)

  const rows = await getDb()
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      attendeeId: attendees.id,
      email: attendees.email,
      displayName: attendees.displayName,
    })
    .from(authSessions)
    .innerJoin(attendees, eq(attendees.id, authSessions.attendeeId))
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)))
    .limit(1)

  const session = rows[0]

  // Revoked (sign-out set `revoked_at`, so the row is filtered out above) or never existed.
  // Both are "not authenticated" — a revoked session must not report as *expired*, or
  // sign-out would be described to the attendee as inactivity.
  if (!session) throw notAuthenticated()

  // FR-028b — validity is evaluated server-side on every request. The client's belief about
  // its own session is never consulted.
  const now = Date.now()
  if (session.expiresAt.getTime() <= now) {
    throw sessionExpired()
  }

  // FR-028a — sliding expiry. Each authenticated request advances both timestamps, which is
  // what keeps an attendee signed in through a multi-day conference (D17).
  //
  // Recorded tension, spec Open Question 18: with no absolute ceiling, a regularly-used
  // session never expires on its own. Revocation and sign-out are the only ways to end it.
  const nextExpiry = new Date(now + config.auth.sessionIdleMs)
  await getDb()
    .update(authSessions)
    .set({ lastUsedAt: new Date(now), expiresAt: nextExpiry })
    .where(eq(authSessions.id, session.sessionId))

  // Refresh the cookie lifetime too, so the browser's copy expires with the server's rather
  // than disappearing first and looking like an unexplained sign-out.
  void reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.auth.sessionIdleMs))

  request.attendee = {
    id: session.attendeeId,
    email: session.email,
    displayName: session.displayName,
  }
  request.authSessionId = session.sessionId
}

const authContextPlugin = async (app: FastifyInstance): Promise<void> => {
  // The same function reference the audit imports, so `preHandler[0] === requireAttendee` is a
  // meaningful assertion rather than a name comparison.
  app.decorate('requireAttendee', requireAttendee)
}

export default fp(authContextPlugin, { name: 'auth-context', dependencies: ['errors'] })
