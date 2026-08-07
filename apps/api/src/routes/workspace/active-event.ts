import type { FastifyInstance } from 'fastify'

import { recordActiveEvent, resolveActiveEvent } from '../../db/queries/active-event.js'
import { notAuthenticated, notFound } from '../../errors.js'

/**
 * T020 (002) — `GET /workspace/active-event`. Which conference the attendee is working in
 * (FR-102, FR-105, research D3).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS ROUTE TAKES NO ATTENDEE IDENTIFIER, AND MUST NEVER TAKE ONE.**
 *
 * It sits on `workspace` rather than carrying an `:eventId` precisely because the question it
 * answers is *which conference is mine* — a property of the attendee, resolved from the sign-in
 * session cookie. That is the split research D3 draws: this endpoint needs no identifier, while
 * *give me this conference's content* carries an explicit, verified one.
 *
 * Folding this into `GET /auth/me` was rejected: it would couple the authentication response to
 * workspace state and grow the sign-in payload with every future workspace preference.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **`dayNumber` and `totalDays` are absent by design and must stay absent** (FR-121). The
 * response carries `timezone` instead, which is what lets the client compute day context
 * against the venue's clock — and stay correct as that clock moves, which a transported counter
 * would not.
 */
export const activeEventRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/workspace/active-event',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['workspace'],
        summary: "The attendee's active conference, recorded or derived",
        description:
          'Returns the attendee\'s explicitly chosen conference, or — while they have never chosen — the one derived from their registrations: in progress at the venue today, else next to start, else most recently ended (FR-102, FR-103). An attendee registered for no conferences receives 204 with no body, which is a valid answer and not an error (FR-105). Carries the venue timezone so the client can compute "day N of M" itself; that counter is never stored and never sent (FR-121).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['id', 'name', 'location', 'startsOn', 'endsOn', 'timezone'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              location: { type: 'string' },
              startsOn: { type: 'string' },
              endsOn: { type: 'string' },
              timezone: {
                type: 'string',
                description: 'IANA zone of the venue, e.g. Europe/Madrid (FR-120).',
              },
            },
          },
          204: {
            description:
              'Registered for no conferences (FR-105). An empty body, not an error and not a fabricated event — the client renders an explicit empty state.',
            type: 'null',
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const active = await resolveActiveEvent(attendee.id)

      // FR-105 — "you are registered for nothing" is a valid answer. A 404 would say the
      // endpoint was wrong; a fabricated event would be a lie; an empty object would make the
      // client guess. 204 says exactly what is true.
      if (!active) return reply.code(204).send()

      return active
    },
  )

  /**
   * T056 — `PUT /workspace/active-event`. Records an explicit choice (FR-104).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The response echoes the recorded conference in full**, and that is not decoration
   * (research D9). A client that issued two switches in quick succession compares this against
   * its own latest selection to notice requests that settled out of order, and re-reads when
   * they disagree. Without the echo it would need a second request to find out what it had just
   * done.
   *
   * The endpoint itself carries **no ordering logic** — it is an idempotent set. Sequencing is
   * the client's, which keeps this simple and puts the ordering knowledge where the ordering
   * actually happens.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  app.put<{ Body: { eventId: string } }>(
    '/workspace/active-event',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['workspace'],
        summary: "Record the attendee's chosen conference",
        description:
          'Records an explicit choice, which is then honoured indefinitely — it is never re-derived when the chosen conference ends (FR-104). Idempotent: selecting the already-active conference succeeds and changes nothing observable. Refuses a conference the attendee is not registered for identically to one that does not exist (FR-148).',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['eventId'],
          additionalProperties: false,
          properties: { eventId: { type: 'string' } },
        },
        response: {
          200: {
            description:
              'The newly active conference, echoed in full so the client can reconcile a concurrent switch without a second request (research D9).',
            type: 'object',
            required: ['id', 'name', 'location', 'startsOn', 'endsOn', 'timezone'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              location: { type: 'string' },
              startsOn: { type: 'string' },
              endsOn: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          404: {
            description:
              'Not registered for that conference, **or** no such conference. Deliberately indistinguishable (FR-148).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
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

      const recorded = await recordActiveEvent(attendee.id, request.body.eventId)

      // One refusal for both causes, produced from one place, so no future edit can make the
      // two distinguishable by accident.
      if (!recorded) throw notFound()

      return recorded
    },
  )
}
