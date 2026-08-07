import type { FastifyInstance } from 'fastify'

import { listRegisteredEvents } from '../db/queries/events.js'
import { notAuthenticated } from '../errors.js'

/**
 * T055 — `GET /events`. Events the signed-in attendee is registered for.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS ROUTE TAKES NO ATTENDEE IDENTIFIER, AND MUST NEVER TAKE ONE.**
 *
 * No path parameter, no query parameter, no header, no body. The attendee comes from
 * `request.attendee`, which the auth-context plugin resolved from the sign-in session cookie.
 *
 * That absence is not a simplification — it is the mechanism. The endpoint has no way to
 * *express* another attendee's events, so FR-036 holds regardless of what a client sends, and
 * the isolation test's attempts to smuggle an id through a query parameter or header succeed
 * only in being ignored (FR-035, FR-036, contracts/README.md).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const eventRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/events',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['workspace'],
        summary: 'Events the signed-in attendee is registered for',
        description:
          'Scoped through registrations for the authenticated attendee. There is no attendee_id parameter, on purpose. An attendee registered for no events receives an empty collection, not an error (FR-040).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'location', 'startsOn', 'endsOn', 'timezone'],
              additionalProperties: false,
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                location: { type: 'string' },
                startsOn: { type: 'string' },
                endsOn: { type: 'string' },
                // T011 (002) — the venue's IANA zone. Present on every event, not only the
                // active one: day context is computed against the venue's clock (FR-120), and
                // the client carries one `Event` shape.
                //
                // `dayNumber` and `totalDays` are **absent by design and must stay absent**
                // (FR-121). They go stale the moment the clock moves, which is why the
                // timezone is sent and the count is not.
                timezone: { type: 'string' },
              },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      // FR-040 — an attendee with no registrations gets `[]`. That is a valid answer, not an
      // error and not an empty failure; the client renders an explicit empty state from it.
      return listRegisteredEvents(attendee.id)
    },
  )
}
