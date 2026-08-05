import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { clearedSessionCookieOptions, SESSION_COOKIE } from '../../auth/cookie.js'
import { getDb } from '../../db/client.js'
import { authSessions } from '../../db/schema/auth-sessions.js'

/**
 * T051 — `POST /auth/sign-out`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-027: revocation is server-side. Clearing the cookie is the lesser half.**
 *
 * Setting `revoked_at` is what ends the session. A token that was captured before sign-out
 * still exists in the attacker's hands; if sign-out only cleared the browser's copy, that
 * captured token would keep working — and the attendee would have been told they were signed
 * out. The integration test replays the captured token after sign-out for exactly this
 * reason.
 *
 * Revokes **only this device's** session (FR-029). Signing out of the conference-hall phone
 * must not sign the attendee out of the hotel laptop.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const signOutRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/auth/sign-out',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['auth'],
        summary: 'Revoke the current sign-in session server-side',
        description:
          "Sets revoked_at on this device's session row and clears the cookie. Other devices are unaffected (FR-027, FR-029).",
        security: [{ sessionCookie: [] }],
        response: {
          204: { type: 'null', description: 'Signed out.' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.authSessionId

      if (sessionId) {
        await getDb()
          .update(authSessions)
          .set({ revokedAt: new Date() })
          .where(eq(authSessions.id, sessionId))
      }

      void reply.setCookie(SESSION_COOKIE, '', clearedSessionCookieOptions())
      return reply.status(204).send()
    },
  )
}
