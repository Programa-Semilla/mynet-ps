import type { FastifyInstance } from 'fastify'

import { notAuthenticated } from '../../errors.js'

/**
 * T052 — `GET /auth/me`. The signed-in attendee's identity (FR-032).
 *
 * Returns identifier and display name **only**. Never the credential hash — which it could
 * not return by accident even if the response schema allowed it, because the hash lives in a
 * separate table that identity queries do not join (data-model.md).
 *
 * The response schema is not documentation. Fastify serialises responses through it, so a
 * field not declared here is stripped from the payload — making the schema an active defence
 * against over-serialisation rather than a description of one.
 */
export const meRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/auth/me',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['auth'],
        summary: "The signed-in attendee's identity",
        description:
          'Resolved from the sign-in session cookie server-side. Takes no attendee identifier and has no way to return another attendee (FR-032, FR-035, FR-036).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['id', 'email', 'displayName'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string' },
              displayName: { type: 'string' },
            },
          },
          401: {
            description:
              'Distinguishes an expired session from never having signed in, so the client can explain inactivity (FR-028c).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      // `requireAttendee` guarantees this, but an unguarded non-null assertion here would be
      // the single point at which the whole identity-scoping argument rests on a `!`.
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      return { id: attendee.id, email: attendee.email, displayName: attendee.displayName }
    },
  )
}
