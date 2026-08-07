import type { FastifyInstance } from 'fastify'

import { failureDelayMs, hashAttemptValue, recordAttempt, serveDelay } from '../../auth/throttle.js'
import { findEventById, joinConference } from '../../db/queries/identity.js'
import { notFound, tooManyAttempts } from '../../errors.js'

/**
 * T044 (004) — `POST /events/join` (FR-310–FR-315, research D7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **DELIBERATELY NOT UNDER `/events/:eventId`, AND THAT IS NOT A STYLE CHOICE.**
 *
 * The caller does not yet know the conference's identifier — resolving it is the entire point
 * of the request. A route declaring `:eventId` would trip 002's route audit into demanding
 * `requireEventAccess`, which verifies a registration that by definition does not exist yet, so
 * the guard could never pass. The audit is right and the route shape has to be the thing that
 * changes.
 *
 * The code therefore goes in the **body**. That also keeps it out of browser history, shared
 * links and intermediaries' access logs — which is hygiene rather than protection, since
 * FR-317a settles that the code is not a secret.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This route grants nothing beyond registration** (FR-316, FR-317b). It confers no capability
 * over the conference's content, none over its other attendees, and none over any other
 * conference — and a registration is evidence of **presence, not of vetting**. Nothing here or
 * later may read holding one as identity assurance.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const joinRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/events/join',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['events'],
        summary: 'Register for a conference by entering its join code',
        description:
          'The code resolves the conference; the attendee comes from the session. Entering the code of a conference already registered is IDEMPOTENT and is not an error (FR-312) — it answers 200 saying so. An unrecognised code answers 404 in one wording that does not distinguish between causes of rejection (FR-313), and the route is rate-limited on its own counter so it cannot be used to enumerate codes (FR-314).',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['joinCode'],
          additionalProperties: false,
          properties: {
            joinCode: {
              type: 'string',
              minLength: 1,
              maxLength: 120,
              description:
                'Compared after trimming and lower-casing, because a code read off a badge or a slide arrives with arbitrary case and stray whitespace (research D7).',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['event', 'alreadyRegistered'],
            additionalProperties: false,
            properties: {
              event: {
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
              alreadyRegistered: {
                type: 'boolean',
                description:
                  'True when the attendee was already registered. Not an error (FR-312) — a person who taps twice on a slow connection has done nothing wrong.',
              },
            },
          },
          404: {
            description:
              'Unrecognised code. One wording for every cause of rejection (FR-313), including a conference seeded with no code, which is unjoinable by design (FR-317).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              'Throttled on the `join_code` counter, so the surface cannot enumerate codes (FR-314).',
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              retryAfterSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { joinCode } = request.body as { joinCode: string }
      const attendee = request.attendee!

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The identifier dimension is the signed-in attendee, not an address** (FR-314).
      //
      // This route is authenticated, so a denial here can only ever inconvenience the person
      // doing the guessing — which is what makes `mayDeny` safe for this action where it is not
      // safe for reset-request. Nobody can attack somebody else's join allowance without first
      // being them.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const identifierHash = hashAttemptValue(attendee.id)
      const sourceHash = hashAttemptValue(request.ip)
      const action = 'join_code' as const

      const outstanding = await serveDelay(
        await failureDelayMs({ identifierHash, sourceHash, action }),
      )
      if (outstanding > 0) {
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        throw tooManyAttempts(outstanding, 'join-code attempts')
      }

      const outcome = await joinConference(attendee.id, joinCode)

      if (outcome.status === 'unrecognised') {
        // Counts as a failure, which is the whole of FR-314: guessing costs escalating time.
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        // One refusal for every cause — no such code, a conference with no code seeded, a
        // malformed value. The caller cannot tell them apart (FR-313).
        throw notFound()
      }

      // A correct code ends the streak, so an attendee who mistyped twice and then got it right
      // is not carrying those failures into their next conference.
      await recordAttempt({ identifierHash, sourceHash, action, succeeded: true })

      const event = await findEventById(outcome.eventId)
      // Only reachable if the conference was deleted between the two statements. Refused rather
      // than answered with a half-populated body.
      if (!event) throw notFound()

      // ───────────────────────────────────────────────────────────────────────────────────────
      // **FR-315 needs no write here.** `resolveActiveEvent` derives the active conference from
      // the attendee's registrations whenever no explicit selection exists, so an attendee whose
      // only registration is this one resolves to it on the next request. Recording an explicit
      // selection instead would pin them permanently (FR-104) — see `queries/identity.ts`.
      // ───────────────────────────────────────────────────────────────────────────────────────
      return reply.status(200).send({
        event,
        alreadyRegistered: outcome.status === 'already-registered',
      })
    },
  )
}
