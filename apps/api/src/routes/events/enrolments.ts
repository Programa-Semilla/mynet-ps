import type { FastifyInstance, FastifyRequest } from 'fastify'

import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../../auth/throttle.js'
import { releasePlace, remainingPlaces, takePlace } from '../../db/queries/enrolments.js'
import { AppError, notAuthenticated, notFound, tooManyAttempts } from '../../errors.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T137, T140 (014 tranche 2) — taking and releasing a place, and the live places figure
 * (FR-1063, FR-1067, FR-1069, FR-1070).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY REFUSAL TO ENROL CARRIES ITS OWN CODE, AND THE FOUR ARE MUTUALLY DIFFERENT**
 * (FR-1069, FR-1069a). "This session is full" and "enrolment has closed" are different facts
 * about the reader's own action and lead to different next steps; this feature has already
 * shipped six refusals rendered as two sentences once, and the mutual-difference assertion in
 * `enrolment-refusals.test.ts` is what a per-code check would have missed.
 *
 * **A lock-wait timeout is NOT here and must never be**: the outcomes below are the settled
 * ones, and a `55P03` propagates to the generic 500 with its correlation id (research R12).
 * Adding a branch that folds it into `session_full` would tell somebody the session is full
 * when the server never decided anything.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The uniform 404 keeps 005's rule: not registered, no such conference, no such session and a
 * session of another conference are indistinguishable — as is the places read of a session
 * that is not optional, because a mandatory session has no places and the refusal discloses
 * nothing about why.
 */

const refusalBody = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

/**
 * The throttle, keyed on the acting attendee's own authenticated identity — `questions.ts`'s
 * shape, for `questions.ts`'s reason: keyed on the actor, a denial can only ever fall on the
 * person doing the thing. Every request counts, successful ones included: the hundredth
 * enrolment attempt queuing on the session-row lock is precisely the thing `session_enrol`
 * exists to bound (T139, research R12).
 */
const throttle = async (request: FastifyRequest, what: string): Promise<void> => {
  const attendee = request.attendee
  if (!attendee) throw notAuthenticated()

  const key = {
    identifierHash: hashAttemptValue(attendee.id),
    sourceHash: hashAttemptValue(request.ip),
    action: 'session_enrol' as const,
  }

  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))

  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

export const enrolmentRoutes = async (app: FastifyInstance): Promise<void> => {
  const sessionIdParam = {
    type: 'object',
    required: ['eventId', 'sessionId'],
    properties: { eventId: { type: 'string' }, sessionId: { type: 'string' } },
  } as const

  const refusals = {
    404: {
      description:
        'Not registered, no such conference, no such session, or a session that is not part of this conference — deliberately indistinguishable (FR-204’s rule, inherited).',
      ...refusalBody,
    },
    401: refusalBody,
  } as const

  interface SessionParams extends EventParams {
    readonly sessionId: string
  }

  app.put<{ Params: SessionParams }>(
    '/events/:eventId/agenda/places/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Take a place in an optional session',
        description:
          'The optional-session commitment (FR-1063): enrolment REPLACES saving there, so this is the counterpart of `PUT …/agenda/saved/:sessionId` for the other kind. Capacity is enforced under an exclusive session-row lock — in no ordering can more attendees hold places than the capacity admits (FR-1068) — and each refusal carries its own code: `session_full`, `enrolment_closed`, `already_enrolled`, `not_optional` (FR-1069a). Before taking a place the attendee is told their name becomes visible to this conference’s organizers (FR-1074) — the client’s obligation, stated here so the contract records it.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null', description: 'The place is held.' },
          409: {
            description:
              'Refused, with a code naming which fact refused it — full, closed, already held, or not an optional session. The four are mutually distinguishable (FR-1069a).',
            ...refusalBody,
          },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'places')
      const outcome = await takePlace(eventScopeOf(request), request.params.sessionId)

      switch (outcome) {
        case 'enrolled':
          return reply.code(204).send()
        case 'not-found':
          throw notFound()
        case 'already-enrolled':
          // Resolved BEFORE fullness (R12): a double-tap on a full session is told about the
          // place they hold, never about a fullness that does not apply to them.
          throw new AppError(
            'already_enrolled',
            409,
            'You already hold a place in this session. It is yours until you release it.',
          )
        case 'session-full':
          throw new AppError(
            'session_full',
            409,
            'This session is full — every place is taken. If somebody releases one, it becomes available immediately.',
          )
        case 'enrolment-closed':
          throw new AppError(
            'enrolment_closed',
            409,
            'Enrolment for this session has closed. Places are settled ahead of time so the organizer can prepare for the people attending.',
          )
        case 'not-optional':
          throw new AppError(
            'not_optional',
            409,
            'This session does not take enrolment — save it to your agenda instead.',
          )
      }
    },
  )

  app.delete<{ Params: SessionParams }>(
    '/events/:eventId/agenda/places/:sessionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Release a held place. Idempotent',
        description:
          'The place returns to the session’s availability immediately (FR-1067). Available after enrolment closes too — the deadline governs taking a place, not holding one (FR-1071b) — though a place released after closing stays untakeable, which is the honest state rather than a seat quietly reserved for nobody.',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const known = await releasePlace(eventScopeOf(request), request.params.sessionId)
      if (!known) throw notFound()
      return reply.code(204).send()
    },
  )

  app.get<{ Params: SessionParams }>(
    '/events/:eventId/sessions/:sessionId/places',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['agenda'],
        summary: 'Remaining places in an optional session, live',
        description:
          'Derived at read time — capacity minus a live count, and whether enrolment is open against the server’s own clock (FR-1070, FR-1071a). **Never served from cache** (FR-1070b): a stale number reads as a promise of a place, so the client declares this read `passThrough` and omits the figure entirely where it cannot be read live. A fact about ONE session at the moment of deciding — not the count of changes N2 forbids, and no read aggregates it across sessions (FR-1070a).',
        security: [{ sessionCookie: [] }],
        params: sessionIdParam,
        response: {
          200: {
            type: 'object',
            required: ['remaining', 'open'],
            additionalProperties: false,
            properties: {
              remaining: { type: 'integer', minimum: 0 },
              open: { type: 'boolean' },
            },
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      const places = await remainingPlaces(eventScopeOf(request), request.params.sessionId)
      if (!places) throw notFound()
      return places
    },
  )
}
