import type { FastifyInstance } from 'fastify'

import { listSessions, listTracks } from '../../db/queries/catalog.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T038, T039 (002) — the conference programme (FR-137–FR-140).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Both routes name their event in the path, and both are guarded.**
 *
 * This is the deliberate departure from 001's "no endpoint accepts any identifier" doctrine,
 * recorded in plan.md's Complexity Tracking. An event identifier says *which conference*, never
 * *which person* — identity still comes from the session cookie and no route accepts an
 * attendee identifier.
 *
 * The cost of that trade is that every handler must remember to verify. `requireEventAccess`
 * and the branded `EventScope` are what pay it down: the guard below produces the scope, and
 * the query layer accepts nothing else, so a handler that dropped the guard would not compile.
 * A route added here *without* the guard fails the route audit (T068, FR-149).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const catalogRoutes = async (app: FastifyInstance): Promise<void> => {
  const eventIdParam = {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: { type: 'string' } },
  } as const

  /** Shared by both routes: a refusal that discloses nothing about existence (FR-148). */
  const refusals = {
    404: {
      description:
        'Not registered for that conference, **or** no such conference. The two are deliberately indistinguishable — identical status and identical body — so that an attendee cannot enumerate conferences by watching which refusal comes back (FR-148).',
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
    401: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  } as const

  app.get<{ Params: EventParams }>(
    '/events/:eventId/sessions',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['catalog'],
        summary: "The conference's programme, chronological",
        description:
          'Every session for the named conference in start order, each with its track, its room and its speakers. An event with no programme returns an empty array — a valid answer, not a failure (FR-139). Times are absolute instants; no relative wording is sent, because "starts in 15 minutes" is only true at the moment it is computed (FR-124).',
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'id',
                'title',
                'summary',
                'startsAt',
                'endsAt',
                'cancelled',
                'track',
                'room',
                'speakers',
              ],
              additionalProperties: false,
              properties: {
                id: { type: 'string', format: 'uuid' },
                title: { type: 'string' },
                summary: { type: ['string', 'null'] },
                startsAt: { type: 'string', format: 'date-time' },
                endsAt: { type: 'string', format: 'date-time' },
                cancelled: {
                  type: 'boolean',
                  description:
                    'T053 (014), FR-1020 and FR-1022. A cancelled session is **presented, not withheld**: it stays in the programme, in Agenda, in the detail panel and in Home’s rest-of-day timeline, marked. An attendee who saved it needs to see that it will not happen, and a session that simply vanished would be indistinguishable from one they misremembered. Home’s "Up next" is the single exception and skips it (FR-1022a), because that card answers *where do I go now*.',
                },
                track: {
                  type: 'object',
                  required: ['id', 'name', 'colorToken'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    colorToken: {
                      type: 'string',
                      description:
                        'A theme token NAME, e.g. track-design. Never a colour value — the palette lives in the client theme and nowhere else (FR-136).',
                    },
                  },
                },
                room: {
                  type: 'object',
                  required: ['id', 'name'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                  },
                },
                speakers: {
                  type: 'array',
                  description:
                    'Empty when the session has none (FR-138). An empty list rather than null, so a client cannot confuse "no speaker" with "not loaded".',
                  items: {
                    type: 'object',
                    required: ['id', 'name', 'title', 'company'],
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      title: { type: ['string', 'null'] },
                      company: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
          },
          ...refusals,
        },
      },
    },
    // `eventScopeOf` is the only way in: the bare `request.params.eventId` is deliberately not
    // used here, so there is no second value that could disagree with what was verified.
    async (request) => listSessions(eventScopeOf(request)),
  )

  app.get<{ Params: EventParams }>(
    '/events/:eventId/tracks',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['catalog'],
        summary: "The conference's tracks, for coding and legends",
        description:
          'Each track with its name and its theme token name. Never a colour value (FR-136, research D7). The name is what makes colour never the sole carrier of meaning — a track is always rendered in text as well.',
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'colorToken'],
              additionalProperties: false,
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                colorToken: { type: 'string' },
              },
            },
          },
          ...refusals,
        },
      },
    },
    async (request) => listTracks(eventScopeOf(request)),
  )
}
