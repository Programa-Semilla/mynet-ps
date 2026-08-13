import type { FastifyInstance } from 'fastify'

import {
  deleteNote,
  listNotes,
  listSavedSessions,
  markSessionViewed,
  saveSession,
  unsaveSession,
  upsertNote,
} from '../../db/queries/agenda.js'
import { notFound } from '../../errors.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T013 (005) — the attendee's own agenda: saved sessions and personal notes
 * (FR-184–FR-214, FR-227–FR-232).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ROUTE HERE NESTS UNDER `:eventId`, CARRIES BOTH GUARDS, AND DECLARES A `schema`.**
 * All three are load-bearing and none is decoration:
 *
 *   - **`requireAttendee`** binds identity from the sign-in session, never from the request
 *     (FR-227). It must come first, because the second guard verifies a registration *for*
 *     that attendee — the route audit compares the actual function references to prove the
 *     ordering rather than counting handlers.
 *   - **`requireEventAccess`** verifies the registration and constructs the `EventScope` the
 *     query layer demands (FR-228, FR-229). A handler that dropped it would have nothing to
 *     pass and would not compile.
 *   - **`schema`** is how the route reaches `contracts/openapi.json` at all: Swagger builds
 *     the contract by observing routes as they register, so a route without one is *silently
 *     absent* from the contract rather than merely undocumented.
 *
 * A route added here without the guard **fails the build** via the route audit (FR-230) — the
 * audit this feature also repaired, because a gate that cannot execute is not a gate.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The refusals are uniform, and that uniformity is the requirement** (FR-204, FR-231).
 *
 * Not registered for the conference, no such conference, and a session that belongs to some
 * other conference all produce the **same 404 with the same body**. So does a malformed
 * identifier. The client cannot tell them apart, which is the point: an attendee must not be
 * able to enumerate conferences or sessions by watching which refusal comes back, and a note
 * must not be discoverable by the shape of the answer to a request for it.
 *
 * That is achieved by construction rather than by four careful call sites. The query layer
 * folds the belongs-to-this-conference check into each statement and reports one boolean; this
 * file turns every falsy answer into the single `notFound()` factory 001 established.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The maximum length of a note, at the route (research D9, FR-213). */
const NOTE_MAX_LENGTH = 10_000

export const agendaRoutes = async (app: FastifyInstance): Promise<void> => {
  const eventIdParam = {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: { type: 'string' } },
  } as const

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * `sessionId` is declared as a plain string, **deliberately without `format: uuid`**.
   *
   * Fastify would validate the format before the handler ran and answer a malformed
   * identifier with a 400 carrying a validation body — separating "not a uuid" from "not in
   * this conference". That is a smaller disclosure than existence, but it is still a
   * difference an attacker can read, and it is the same reason `requireEventAccess` matches
   * the event id with a regular expression rather than parsing it.
   *
   * The shape is checked in the query layer instead, where it produces the one uniform
   * refusal and cannot be forgotten by a route added later.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const sessionIdParam = {
    type: 'object',
    required: ['eventId', 'sessionId'],
    properties: { eventId: { type: 'string' }, sessionId: { type: 'string' } },
  } as const

  /** Shared by every route below: refusals that disclose nothing about existence. */
  const refusals = {
    404: {
      description:
        'Not registered for that conference, **or** no such conference, **or** the session is not part of it. All three are deliberately indistinguishable — identical status and identical body — so that an attendee cannot enumerate conferences or sessions by watching which refusal comes back (FR-204, FR-231).',
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
    401: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  } as const

  interface SessionParams extends EventParams {
    readonly sessionId: string
  }

  app.get<{ Params: EventParams }>(
    '/events/:eventId/agenda/saved',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: "The attendee's saved sessions for this conference",
        description:
          'Identifiers only, not whole sessions (FR-188). The programme is fetched separately and already carries the session data; returning it again here would be a second source of truth that could disagree with the first. An attendee who has saved nothing gets an empty array — a valid answer, not a 404 (FR-195).\n\n**014 adds `changedSinceViewed` to each entry** (FR-1030): true while the session has materially changed — cancelled, start time, or room — since this attendee last viewed it. It is **per-row state about one saved session** and never an aggregate: no surface in either product may present a count of them (FR-1031, v4.2.0 N2).',
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'object',
            required: ['sessions'],
            additionalProperties: false,
            properties: {
              sessions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['sessionId', 'changedSinceViewed'],
                  additionalProperties: false,
                  properties: {
                    sessionId: { type: 'string', format: 'uuid' },
                    changedSinceViewed: {
                      type: 'boolean',
                      description:
                        'Computed server-side as `sessions.logistics_changed_at > saved_sessions.viewed_at` — two timestamps and a comparison, with nothing stored per change. That is what keeps FR-1031 structural: there is no per-change record to list and no counter to sum.',
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
    // `eventScopeOf` is the only way in: `request.params.eventId` is deliberately not used, so
    // there is no second value that could disagree with what was verified.
    async (request) => ({ sessions: await listSavedSessions(eventScopeOf(request)) }),
  )

  app.post<{ Params: SessionParams }>(
    '/events/:eventId/agenda/saved/:sessionId/viewed',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Record that the attendee has looked at this session, clearing its marker',
        description:
          'T075 (014), FR-1030. **Carries no body**: the instant is the server’s. A timestamp on the wire would let a client clear a marker for a change it has not seen, and would put the marker’s correctness on the device’s clock.\n\nIdempotent, and a no-op for a session the attendee has not saved — there is no row to stamp, and refusing would make opening a session in Agenda’s "All" view an error.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const known = await markSessionViewed(eventScopeOf(request), request.params.sessionId)
      if (!known) throw notFound()
      return reply.code(204).send()
    },
  )

  app.put<{ Params: SessionParams }>(
    '/events/:eventId/agenda/saved/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Save a session. Idempotent',
        description:
          'Saving an already-saved session succeeds with the same 204 (FR-187). The address IS the pairing, which is where the idempotency comes from — rather than from a uniqueness constraint doing double duty as business logic, though that constraint exists too as defence in depth (research D6). A double-tap on a slow connection is simply the same request twice.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null', description: 'Saved, or already saved. The same either way.' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const saved = await saveSession(eventScopeOf(request), request.params.sessionId)
      // The one refusal, whatever the cause. See the file header.
      if (!saved) throw notFound()
      return reply.code(204).send()
    },
  )

  app.delete<{ Params: SessionParams }>(
    '/events/:eventId/agenda/saved/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Unsave a session. Idempotent',
        description:
          'Succeeds with 204 whether or not the session was saved. The caller does not need to know which, and telling them would leak nothing useful.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const known = await unsaveSession(eventScopeOf(request), request.params.sessionId)
      if (!known) throw notFound()
      return reply.code(204).send()
    },
  )

  app.get<{ Params: EventParams }>(
    '/events/:eventId/agenda/notes',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Every note the attendee has written in this conference',
        description:
          'Returned as a set rather than per session, so opening the detail panel needs no additional request and the whole set caches as one entry. Nothing here can read a note the requester did not write — the attendee comes from the sign-in session and there is no parameter in which to name anyone else (FR-208).',
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'object',
            required: ['notes'],
            additionalProperties: false,
            properties: {
              notes: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['sessionId', 'body', 'updatedAt'],
                  additionalProperties: false,
                  properties: {
                    sessionId: { type: 'string', format: 'uuid' },
                    body: { type: 'string' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          ...refusals,
        },
      },
    },
    async (request) => ({ notes: await listNotes(eventScopeOf(request)) }),
  )

  app.put<{ Params: SessionParams; Body: { body: string } }>(
    '/events/:eventId/agenda/notes/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: "Write or replace the attendee's note against a session",
        description:
          "The last confirmed write wins (FR-214); no merge is attempted and no conflict is detected. Returning `updatedAt` is what lets the client enter its saved status FROM A CONFIRMED RESPONSE rather than from the keystroke — the property that keeps the autosave non-optimistic and therefore outside the constitution's optimistic-update clause (FR-210, research D5).",
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        body: {
          type: 'object',
          required: ['body'],
          additionalProperties: false,
          properties: {
            body: {
              type: 'string',
              minLength: 1,
              maxLength: NOTE_MAX_LENGTH,
              description:
                'The note. Bounded here AND by a CHECK on the column, because client-side presentation of a limit is never its enforcement (Principle VIII, research D9). The editor surfaces the limit as it is approached, so a 400 from this route is defence rather than the designed path (FR-213).',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['updatedAt'],
            additionalProperties: false,
            properties: { updatedAt: { type: 'string', format: 'date-time' } },
          },
          400: {
            description:
              'The note was empty or over length. Reachable only by a client that bypassed the editor.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      const written = await upsertNote(
        eventScopeOf(request),
        request.params.sessionId,
        request.body.body,
      )
      if (!written) throw notFound()
      return written
    },
  )

  app.delete<{ Params: SessionParams }>(
    '/events/:eventId/agenda/notes/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: "Remove the attendee's note against a session. Idempotent",
        description:
          'This is the path clearing the text takes (FR-212): an emptied note is deleted rather than stored blank. Combined with the `length(body) > 0` constraint on the column, "no note" has exactly one representation in the database.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const known = await deleteNote(eventScopeOf(request), request.params.sessionId)
      if (!known) throw notFound()
      return reply.code(204).send()
    },
  )
}
