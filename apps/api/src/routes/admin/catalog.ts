import { randomUUID } from 'node:crypto'

import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify'

import {
  conferenceAuthorityOf,
  requireConferenceAuthority,
} from '../../admin/require-conference-authority.js'
import { operatorScopeOf, requireOperator } from '../../admin/require-operator.js'
import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  serveDelay,
  type ThrottleAction,
} from '../../auth/throttle.js'
import { getDb } from '../../db/client.js'
import {
  cancelSession,
  createConference,
  createRoom,
  createSession,
  createSpeaker,
  createTrack,
  deleteRoom,
  deleteSession,
  deleteSpeaker,
  deleteTrack,
  isTrackColorToken,
  overlappingInRoom,
  patchConference,
  readProgramme,
  reinstateSession,
  TRACK_COLOR_TOKENS,
  updateRoom,
  updateSession,
  updateSpeaker,
  updateTrack,
  type SessionAct,
  type SessionInput,
  type WriteResult,
} from '../../db/queries/admin-catalog.js'
import {
  subscriptionsForMany,
  discardSubscriptions,
  recordDelivery,
} from '../../db/queries/push-subscriptions.js'
import { attendeesToNotify, type MaterialChange } from '../../db/queries/session-changes.js'
import { AppError, notFound, tooManyAttempts } from '../../errors.js'
import { dispatchToDevices, truncateForPush } from '../../notifications/dispatch.js'
import type { StoredSubscription } from '../../notifications/service.js'

/**
 * T033, T051, T071, T085 (014) — **conference content authoring** (FR-1001–FR-1039).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE SECOND ENTRY IN `DISPATCH_CALLERS`, AND ITS PLACEMENT IS A REQUIREMENT
 * RATHER THAN A CONVENIENCE** (research R3, constitution v5.2.0 N1).
 *
 * `tests/unit/notification-triggers.test.ts` excludes `notifications/**` from its scan entirely,
 * because that directory *is* the dispatcher. So a second trigger implemented as
 * `notifications/session-change.ts` would have passed **the very test written to catch it** —
 * silently, with a green suite. The obvious tidy placement is the one that defeats the gate, and
 * that is why the fan-out lives in a route module.
 *
 * Two rules travel with it and are requirements rather than style:
 *
 *   - **Dispatch happens AFTER the transaction commits, never inside it.** `dispatchPush` bounds
 *     each delivery with a timeout because a hang is the common failure of an HTTP push service;
 *     holding a transaction open across a fan-out to N attendees would put that hang on a row
 *     lock. FR-1037's one-transaction rule covers **the act and its audit entry**, not the
 *     notification.
 *   - **A failed dispatch must not fail the act.** 007's precedent, stated there for report mail:
 *     an organizer's cancellation must not be rolled back because a push service was down.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY ROUTE NAMES ITS CONFERENCE, AND THAT IS WHY 014 NEEDS NO SIXTH ROUTE AUDIT.**
 *
 * `event-scope-audit.test.ts` examines a route only if it declares an event parameter and
 * **reports success otherwise** — the hole 007, 008 and 013 each had to build an audit around.
 * 009 was the exception that proved the rule: it needed none because every one of its routes
 * names its conference, and it pinned that with an assertion rather than a comment.
 *
 * 014 is in the same position and takes the same measure. `operator-audit.test.ts` — which
 * already covers `/admin/*` by prefix and cannot be evaded by naming — gained two assertions:
 * every administrative route naming a conference carries `requireConferenceAuthority`, and every
 * route carrying it binds `requireOperator` first. Tidying `…/conferences/:eventId/sessions/:id`
 * to `…/sessions/:id` would fail both.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE CLIENT MUST CLASSIFY ON `error.code`, NEVER ON THE CLASS.** `ApiError extends
 * RequestRefusedError` and every non-2xx throws `ApiError`, so `instanceof` catches 400, 404, 409
 * and 429 alike — which is how 008 swallowed every message its routes wrote to be read. Each
 * refusal below carries a distinct code for that reason, and
 * `apps/admin/tests/unit/error-classification.test.ts` requires them to render differently from
 * each other.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const refusal = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

/**
 * The two refusals that carry structured detail alongside their message.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DECLARED IN THE SCHEMA, BECAUSE FASTIFY STRIPS WHAT A RESPONSE SCHEMA DOES NOT NAME.**
 *
 * `AppError.details` is merged into the body by `plugins/errors.ts`, and then serialised against
 * whatever the route declared — so a 409 schema listing only `code` and `message` silently
 * removes the counts an organizer needs to choose cancellation, and the session titles that make
 * a date-range refusal actionable. The route would look correct, the integration test would read
 * `undefined`, and the client would render a bare refusal.
 *
 * This is the same shape as `tooManyAttempts`, whose `retryAfterSeconds` is declared on every
 * throttled route for exactly this reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const detailedRefusal = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    engagement: {
      type: 'object',
      description:
        'Counts only, with nobody identified (FR-1025). Present when a deletion is refused ' +
        'because attendees have engaged with the session — it is what turns "no" into "cancel ' +
        'instead". No attendee identity accompanies it, at any tier (FR-1042).',
      properties: {
        saved: { type: 'integer' },
        notes: { type: 'integer' },
        questions: { type: 'integer' },
        votes: { type: 'integer' },
      },
    },
    sessions: {
      type: 'array',
      description:
        "The sessions a date-range change would orphan, named (FR-1014). They are the caller's " +
        'own content, and an organizer told only "no" would have to guess which of forty ' +
        'sessions is in the way.',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
      },
    },
  },
} as const

const throttled = {
  429: {
    description:
      "Throttled, keyed on the acting operator's own authenticated identity so a refusal can " +
      'only inconvenience the person authoring (FR-1039).',
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      retryAfterSeconds: { type: 'number' },
    },
  },
} as const

/**
 * Charges one authoring action against the acting principal (FR-1039).
 *
 * **Keyed on the operator's own identity**, which is what makes `mayDeny: true` legitimate for
 * all five actions: a refusal can only inconvenience the person authoring. `admin_sign_in` is
 * `mayDeny: false` for the opposite reason — it is keyed on a submitted address somebody else may
 * own.
 *
 * The identifier is `operatorId ?? attendeeId`, so an organizer and a platform operator are
 * counted as themselves rather than sharing a bucket.
 */
type ThrottleKey = {
  identifierHash: string
  sourceHash: string
  action: ThrottleAction
}

/**
 * The throttle key for the acting principal.
 *
 * Extracted so the notify bound (`fanOut`) and the act bounds (`throttle`) key on the same
 * identity by construction rather than by two copies agreeing. `operatorId ?? attendeeId` so an
 * organizer and a platform operator are counted as themselves rather than sharing a bucket.
 */
const throttleKeyFor = (
  request: FastifyRequest,
  action: ThrottleAction,
  /**
   * Narrows the bucket to one subject as well as one principal.
   *
   * Only `session_notify` uses it, and only because the thing being bounded there is repeated
   * interruption **about one session** rather than the principal's rate of work. Every act bound
   * stays keyed on the principal alone, which is what makes `mayDeny: true` legitimate for them:
   * a refusal can only inconvenience the person authoring.
   */
  subject?: string,
): ThrottleKey => {
  const operator = operatorScopeOf(request)
  const principal = operator.operatorId ?? operator.attendeeId
  if (!principal) throw notFound()

  return {
    identifierHash: hashAttemptValue(subject ? `${principal}:${subject}` : principal),
    sourceHash: hashAttemptValue(request.ip),
    action,
  }
}

const throttle = async (
  request: FastifyRequest,
  action: ThrottleAction,
  what: string,
): Promise<void> => {
  const key = throttleKeyFor(request, action)

  // 010 T017 — recorded before it is judged (FR-804); excluded from its own count (FR-805).
  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))

  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

/**
 * Turns a refused write into the response the contract declares.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Every explained refusal here describes the CALLER'S OWN CONFERENCE**, which is the test 008
 * failed and 009 restated: *the follow-up question must be about the reader.* `not-found` is the
 * one that carries nothing, and it is the answer to everything the caller has no authority over
 * — indistinguishable from a conference or a session that does not exist (FR-1036).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY EXPLAINED REFUSAL CARRIES ITS OWN CODE, AND THEY DID NOT UNTIL T094 ASKED.**
 *
 * These six were written as four `refused` 409s and two `validation_failed` 400s, each with a
 * different `publicMessage`. The administrative client classifies on the **code** — which is the
 * rule 008's defect produced — so four distinct explanations rendered *"That could not be
 * completed."* and two rendered *"Something went wrong."* The routes were right and the client
 * could not tell them apart.
 *
 * `contracts/authoring.md` requires all of them to render **differently from each other**, and
 * `apps/admin/tests/unit/error-classification.test.ts` is where that is enforced. Distinct codes
 * are what make it satisfiable: *"classify on `error.code`"* is worth nothing unless the code
 * says which refusal it is. `question_has_votes` and `own_question` are 009's precedent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const refuse = (result: Extract<WriteResult<unknown>, { ok: false }>): AppError => {
  switch (result.refusal) {
    case 'not-found':
      return notFound()
    case 'still-referenced':
      return new AppError(
        'still_referenced',
        409,
        'A session still uses this. Move those sessions to another one first, then remove it.',
      )
    case 'has-engagement':
      return new AppError(
        'session_has_engagement',
        409,
        'Attendees have already saved, noted, questioned or voted on this session, so it cannot ' +
          'be deleted. Cancel it instead — everything they wrote stays where it is.',
        { engagement: result.engagement },
      )
    case 'outside-conference-days':
      return new AppError(
        'outside_conference_days',
        400,
        "That time falls outside the conference's dates, in the venue's own timezone.",
      )
    case 'ends-before-start':
      return new AppError('ends_before_start', 400, 'The end must be after the start.')
    case 'would-orphan-sessions':
      return new AppError(
        'would_orphan_sessions',
        409,
        'Those dates would leave sessions outside the conference. Move or cancel them first.',
        { sessions: result.sessions },
      )
    case 'timezone-frozen':
      return new AppError(
        'timezone_frozen',
        409,
        'The timezone can only be changed while the conference has no sessions. Every session ' +
          'time is stored as an absolute instant, so changing it now would move what everybody ' +
          'sees without moving anything.',
      )
    case 'unknown-timezone':
      return new AppError(
        'unknown_timezone',
        400,
        'That is not a timezone this server recognises. Use an IANA name such as ' +
          '`America/Costa_Rica` or `Europe/Madrid`.',
      )
    case 'conference-ends-before-start':
      return new AppError(
        'conference_ends_before_start',
        400,
        'The last day cannot be before the first. A one-day conference has the same date for ' +
          'both.',
      )
    case 'malformed-time':
      return new AppError('malformed_time', 400, 'That is not a time this server can read.')
  }
}

const authoringGuards = [requireOperator, requireConferenceAuthority]

export const adminCatalogRoutes = async (app: FastifyInstance): Promise<void> => {
  const eventParams = {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: { type: 'string', format: 'uuid' } },
  } as const

  const eventAndId = {
    type: 'object',
    required: ['eventId', 'id'],
    properties: {
      eventId: { type: 'string', format: 'uuid' },
      id: { type: 'string', format: 'uuid' },
    },
  } as const

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // The programme (T033).
  // ─────────────────────────────────────────────────────────────────────────────────────────

  app.get(
    '/admin/conferences/:eventId/programme',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'The whole programme of one conference, for the editor',
        description:
          'Sessions, tracks, rooms and speakers, plus **engagement counts per session** so the ' +
          'delete-versus-cancel decision needs no second request (FR-1025). Counts only — no ' +
          'attendee is identified and no note, question or vote content is disclosed to any ' +
          'administrative tier (FR-1042).',
        params: eventParams,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
        },
      },
    },
    async (request) => {
      const programme = await readProgramme(conferenceAuthorityOf(request))
      if (!programme) throw notFound()
      return programme
    },
  )

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Tracks, rooms and speakers (T033, T035).
  // ─────────────────────────────────────────────────────────────────────────────────────────

  const trackBody = {
    type: 'object',
    required: ['name', 'colorToken'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 },
      colorToken: {
        type: 'string',
        // T035 (014) — **the token set, enumerated in the schema as well as in the query layer**
        // (FR-1004). Two layers that must agree, 009's `trim()` lesson applied: the route refuses
        // with a 400 naming the permitted set, and `isTrackColorToken` refuses again if a second
        // write path ever appears. The product offers **no free colour input anywhere**.
        enum: [...TRACK_COLOR_TOKENS],
        description:
          'A theme token name, never a colour value (FR-1004, FR-136). The palette lives in ' +
          '`apps/web/src/theme/tokens.css` and nowhere else; a colour here would put it in two ' +
          'places and let an organizer alter the design system without touching it.',
      },
    },
  } as const

  const nameBody = {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
  } as const

  const speakerBody = {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      title: { type: ['string', 'null'], maxLength: 120 },
      company: { type: ['string', 'null'], maxLength: 120 },
    },
  } as const

  app.post(
    '/admin/conferences/:eventId/tracks',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Add a track',
        params: eventParams,
        body: trackBody,
        response: {
          201: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const scope = conferenceAuthorityOf(request)
      const body = request.body as { name: string; colorToken: string }
      // T035 (014) — the second layer, and it is not redundant with the schema `enum` above.
      // 009 found PostgreSQL's `trim()` accepting what the route refused, in exactly this shape:
      // two layers that were assumed to agree and did not. This one narrows the type, so the
      // query layer cannot be handed a string at all.
      // Bound to a local because the call below happens inside a closure, and TypeScript discards
      // property narrowing across one — the value would arrive as a bare `string`.
      const colorToken = body.colorToken
      if (!isTrackColorToken(colorToken)) throw notFound()

      const result = await getDb().transaction((tx) =>
        createTrack(scope, { name: body.name, colorToken }, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/conferences/:eventId/tracks/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Edit a track',
        params: eventAndId,
        body: trackBody,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'catalog_write', 'changes')
      const scope = conferenceAuthorityOf(request)
      const { id } = request.params as { id: string }
      const body = request.body as { name: string; colorToken: string }
      const colorToken = body.colorToken
      if (!isTrackColorToken(colorToken)) throw notFound()

      const result = await getDb().transaction((tx) =>
        updateTrack(scope, id, { name: body.name, colorToken }, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.delete(
    '/admin/conferences/:eventId/tracks/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Remove a track',
        description:
          'Refused with 409 and a reason while any session references it (FR-1017). The reason ' +
          "is permitted because it describes the caller's own conference — they can see the " +
          'sessions, and the fix is to move them.',
        params: eventAndId,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, 409: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const scope = conferenceAuthorityOf(request)
      const { id } = request.params as { id: string }

      const result = await getDb().transaction((tx) => deleteTrack(scope, id, tx))
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.post(
    '/admin/conferences/:eventId/rooms',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Add a room',
        params: eventParams,
        body: nameBody,
        response: {
          201: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const result = await getDb().transaction((tx) =>
        createRoom(conferenceAuthorityOf(request), request.body as { name: string }, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/conferences/:eventId/rooms/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Edit a room',
        params: eventAndId,
        body: nameBody,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'catalog_write', 'changes')
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        updateRoom(conferenceAuthorityOf(request), id, request.body as { name: string }, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.delete(
    '/admin/conferences/:eventId/rooms/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Remove a room',
        description: 'Refused while any session references it (FR-1017).',
        params: eventAndId,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, 409: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteRoom(conferenceAuthorityOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.post(
    '/admin/conferences/:eventId/speakers',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Add a speaker',
        description:
          'Conference content describing a real person who may or may not hold an attendee ' +
          'account. **No route leads from here to a profile, at any tier** (FR-1006): ' +
          'conference content is authorable, a person is not (decision 33). register entry 30 ' +
          'records the open question — a speaker is personal data about somebody who never ' +
          'signed up, and 014 moves responsibility for it from a reviewed commit to a form.',
        params: eventParams,
        body: speakerBody,
        response: {
          201: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const body = request.body as { name: string; title?: string | null; company?: string | null }
      const result = await getDb().transaction((tx) =>
        createSpeaker(
          conferenceAuthorityOf(request),
          { name: body.name, title: body.title ?? null, company: body.company ?? null },
          tx,
        ),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/conferences/:eventId/speakers/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Edit a speaker',
        params: eventAndId,
        body: speakerBody,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'catalog_write', 'changes')
      const { id } = request.params as { id: string }
      const body = request.body as { name: string; title?: string | null; company?: string | null }
      const result = await getDb().transaction((tx) =>
        updateSpeaker(
          conferenceAuthorityOf(request),
          id,
          { name: body.name, title: body.title ?? null, company: body.company ?? null },
          tx,
        ),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.delete(
    '/admin/conferences/:eventId/speakers/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Remove a speaker',
        description:
          'Unlike a track or a room, this carries **no reference check**: speakers are optional ' +
          'on a session (FR-138), so removing one leaves a legitimate programme. A session with ' +
          'no track or no room cannot exist at all, which is why those two refuse.',
        params: eventAndId,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request, 'catalog_write', 'changes')
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteSpeaker(conferenceAuthorityOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Sessions (T033 for create/edit; T051 adds cancel, reinstate and DELETE).
  // ─────────────────────────────────────────────────────────────────────────────────────────

  const sessionBody = {
    type: 'object',
    required: ['title', 'startsAt', 'endsAt', 'trackId', 'roomId'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      summary: { type: ['string', 'null'], maxLength: 2000 },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
      trackId: { type: 'string', format: 'uuid' },
      roomId: { type: 'string', format: 'uuid' },
      speakerIds: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 20 },
    },
  } as const

  const sessionInputOf = (body: unknown): SessionInput => {
    const raw = body as {
      title: string
      summary?: string | null
      startsAt: string
      endsAt: string
      trackId: string
      roomId: string
      speakerIds?: string[]
    }
    return {
      title: raw.title,
      summary: raw.summary ?? null,
      startsAt: raw.startsAt,
      endsAt: raw.endsAt,
      trackId: raw.trackId,
      roomId: raw.roomId,
      speakerIds: raw.speakerIds ?? [],
    }
  }

  app.post(
    '/admin/conferences/:eventId/sessions',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Add a session',
        description:
          "Validated against the conference's date range **in the venue's timezone** (FR-1012) " +
          'and for end-after-start (FR-1013). Two sessions in the same room at overlapping ' +
          'times are **permitted**, and the response carries a warning (FR-1016) — conferences ' +
          'genuinely overlap during changeover, and refusing would be a rule the product ' +
          'invented.',
        params: eventParams,
        body: sessionBody,
        response: {
          201: { type: 'object', additionalProperties: true },
          400: refusal,
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'session_write', 'changes')
      const scope = conferenceAuthorityOf(request)
      const input = sessionInputOf(request.body)

      const result = await getDb().transaction((tx) => createSession(scope, input, tx))
      if (!result.ok) throw refuse(result)

      // T041 — the warning is computed after the write and never blocks it. Read outside the
      // transaction deliberately: it is advisory, and holding a transaction open for advice
      // would make a warning cost what a lock costs.
      const overlaps = await overlappingInRoom(scope, {
        roomId: input.roomId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        excludeSessionId: result.value.id,
      })

      return reply.status(201).send({ ...result.value, warnings: warningsFor(overlaps) })
    },
  )

  app.patch(
    '/admin/conferences/:eventId/sessions/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Edit a session',
        description:
          'A **material** change — the start time or the room — dispatches one notification to ' +
          'every attendee who saved it (FR-1026), coalesced to one per attendee per act ' +
          '(FR-1034). A title, summary, track or speaker edit dispatches nothing (FR-1027): ' +
          'content does not strand anybody in the wrong corridor.',
        params: eventAndId,
        body: sessionBody,
        response: {
          200: { type: 'object', additionalProperties: true },
          400: refusal,
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'session_write', 'changes')
      const scope = conferenceAuthorityOf(request)
      const { id } = request.params as { id: string }
      const input = sessionInputOf(request.body)

      const result = await getDb().transaction((tx) => updateSession(scope, id, input, tx))
      if (!result.ok) throw refuse(result)

      notifySavers(app, request, result.value)

      const overlaps = await overlappingInRoom(scope, {
        roomId: input.roomId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        excludeSessionId: id,
      })

      return { ...result.value.session, warnings: warningsFor(overlaps) }
    },
  )

  app.post(
    '/admin/conferences/:eventId/sessions/:id/cancel',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Cancel a session',
        description:
          '**The one authoring act that reaches attendees’ phones.** Stored state, not a ' +
          'deletion (FR-1020): every saved-session row, private note, question and vote stays ' +
          'exactly where it is (FR-1021). Reversible, and reinstating dispatches nothing ' +
          '(FR-1024).',
        params: eventAndId,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'session_cancel', 'changes')
      const scope = conferenceAuthorityOf(request)
      const { id } = request.params as { id: string }

      const result = await getDb().transaction((tx) => cancelSession(scope, id, tx))
      if (!result.ok) throw refuse(result)

      notifySavers(app, request, result.value)

      return result.value.session
    },
  )

  app.post(
    '/admin/conferences/:eventId/sessions/:id/reinstate',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Reinstate a cancelled session',
        description:
          '**Dispatches nothing** (FR-1024). The notification rule names cancellation and not ' +
          'its reversal, and an attendee whose session comes back has lost nothing by not being ' +
          'told. No marker is set either — there is nothing they need to do.',
        params: eventAndId,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'session_write', 'changes')
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        reinstateSession(conferenceAuthorityOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  /**
   * T051 (014) — **deliberately withheld from the first phase until its guard existed.**
   *
   * `tasks.md` registers create and edit in US1 and this route in US2, and the ordering is a
   * safety property rather than a schedule: `saved_sessions`, `session_notes`,
   * `session_questions` and `question_votes` all cascade from `sessions.id`, so a `DELETE`
   * registered before `hasEngagement` and the `FOR UPDATE` lock existed would have been an
   * unguarded route that destroys other people's private writing.
   */
  app.delete(
    '/admin/conferences/:eventId/sessions/:id',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Delete a session',
        description:
          'Permitted only while **zero** attendees have engaged with it (FR-1018), checked under ' +
          '`SELECT … FOR UPDATE` **inside** the deleting transaction so a save arriving mid-delete ' +
          'blocks rather than being destroyed (FR-1019a). Otherwise 409 with counts and an offer ' +
          'to cancel instead (FR-1019, FR-1025).',
        params: eventAndId,
        response: {
          204: { type: 'null' },
          401: refusal,
          404: refusal,
          409: detailedRefusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'session_delete', 'changes')
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteSession(conferenceAuthorityOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // The conference itself (T051 for PATCH, T085 for POST).
  // ─────────────────────────────────────────────────────────────────────────────────────────

  app.patch(
    '/admin/conferences/:eventId',
    {
      preHandler: authoringGuards,
      schema: {
        tags: ['admin'],
        summary: 'Edit a conference',
        description:
          'Refuses a date range that would orphan an existing session, **naming them** ' +
          '(FR-1014), and refuses a timezone change once any session exists (FR-1015). There is ' +
          'no draft or published state and no lifecycle gate (FR-1040, v5.2.0 N4): a conference ' +
          'is reachable only by its join code, so an unfinished one is already private to ' +
          'whoever holds it.',
        params: eventParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            location: { type: 'string', minLength: 1, maxLength: 200 },
            startsOn: { type: 'string', format: 'date' },
            endsOn: { type: 'string', format: 'date' },
            timezone: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: refusal,
          404: refusal,
          409: detailedRefusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      // `conference_write`, not `catalog_write` — that bucket is named for tracks, rooms and
      // speakers, and this act moves the date range and gates the timezone freeze. See the
      // threshold's own header.
      await throttle(request, 'conference_write', 'changes')
      const result = await getDb().transaction((tx) =>
        patchConference(conferenceAuthorityOf(request), request.body as never, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  /**
   * T085 (014) — **`requireOperator`, not `requireConferenceAuthority`** (FR-1007, FR-1008).
   *
   * There is no conference to hold authority over yet, which is the one place in this module the
   * authoring guard cannot apply. That makes this route the exception `operator-audit.test.ts`
   * has to know about: it is administrative, it writes, and it names no conference — so the
   * conference-authority assertion excludes it by name rather than by shape.
   */
  app.post(
    '/admin/conferences',
    {
      preHandler: [requireOperator],
      schema: {
        tags: ['admin'],
        summary: 'Create a conference',
        description:
          '**Both tiers** (FR-1007, FR-1008). An organizer is assigned to what they create, in ' +
          'the same transaction — and creating grants no authority over any other conference ' +
          'and no platform capability (FR-1010): it is not a promotion path. A join code is ' +
          'minted and returned so the organizer can distribute it (FR-1009). There is **no ' +
          'delete** at any tier (FR-1011).',
        body: {
          type: 'object',
          required: ['name', 'location', 'startsOn', 'endsOn', 'timezone'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            location: { type: 'string', minLength: 1, maxLength: 200 },
            startsOn: { type: 'string', format: 'date' },
            endsOn: { type: 'string', format: 'date' },
            timezone: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
        response: {
          201: {
            type: 'object',
            required: ['id', 'joinCode'],
            properties: { id: { type: 'string' }, joinCode: { type: 'string' } },
          },
          400: refusal,
          401: refusal,
          404: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'conference_create', 'conferences')
      const result = await getDb().transaction((tx) =>
        createConference(operatorScopeOf(request), request.body as never, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )
}

/** FR-1016 — advisory, never a refusal. Named sessions, because they are the caller's own. */
const warningsFor = (
  overlaps: readonly { id: string; title: string }[],
): readonly { code: string; sessions: readonly { id: string; title: string }[] }[] =>
  overlaps.length === 0 ? [] : [{ code: 'room_overlap', sessions: overlaps }]

/**
 * T071, T072 (014) — **the second notification trigger, and the only dispatch in this module**
 * (FR-1026, FR-1028, FR-1028a, FR-1029, FR-1034, research R3, R4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **RUNS AFTER THE TRANSACTION HAS COMMITTED, AND SWALLOWS ITS OWN FAILURE.**
 *
 * Both halves are requirements. The audit entry has to be committed before this reads what points
 * at it, or a dispatch could notify about an act that then rolled back (research R4). And a
 * failure here must leave the act and its entry standing — 007's precedent for report mail, and
 * the same reasoning: an organizer's cancellation must not be undone because a push service was
 * down.
 *
 * **One notification per attendee per act, whatever it touched** (FR-1034). The grouping happens
 * in `attendeesToNotify`, keyed on the audit entry id, so this function cannot produce twelve by
 * accident — and the acting principal is excluded there rather than filtered here (FR-1028a),
 * which is what keeps the marker and the notification consistent for an organizer who saved the
 * session they just changed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const notifySavers = (app: FastifyInstance, request: FastifyRequest, act: SessionAct): void => {
  // FR-1027 — a title, summary, track or speaker edit reaches nobody. The one branch, and it is
  // decided by `materialChangeOf` rather than restated here.
  if (act.change === null) return

  // The scope is read **now**, on the request, rather than inside the task: `request` is being
  // handed to a function that outlives the response, and reaching for request state after the
  // reply has been sent is how a background task comes to read something that has been recycled.
  const scope = conferenceAuthorityOf(request)
  const log = request.log

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **KEYED ON THE PRINCIPAL *AND THE SESSION*, WHICH IS THE SHAPE THE ABUSE ACTUALLY HAS.**
  //
  // Keyed on the principal alone this bound was wrong in both directions at once. Ten material
  // changes an hour is nothing for legitimate authoring — moving a room across a forty-session
  // programme is forty of them — and the integration suite proved it immediately by exhausting the
  // bucket across a run and silently dropping dispatches the dispatch tests were asserting.
  //
  // The amplification it exists to stop is **one session toggled repeatedly**: that is what puts a
  // dozen notifications about the same thing on the same saver's lock screen. Per session, ten an
  // hour is generous for a real correction and tight against a loop — and an organizer legitimately
  // editing forty different sessions is never touched, because each has its own bucket.
  //
  // Built on the request, for the same reason the scope is: `request.ip` must be read before the
  // reply is sent, not from inside a task that outlives it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const notifyKey = throttleKeyFor(request, 'session_notify', act.session.id)

  app.background.run('saved-session-fan-out', () =>
    fanOut(app, log, act, scope.eventId, scope.attendeeId, notifyKey),
  )
}

/**
 * How many recipients are dispatched to at once.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Sequential was the original shape and it made the fan-out `recipients × push RTT`: a thousand
 * savers against a *healthy* push service is several minutes. Unbounded `Promise.all` is the
 * other extreme and is worse in a different way — a thousand simultaneous outbound HTTPS requests
 * from a two-vCPU VM that also runs PostgreSQL, and a thousand sockets against one push host,
 * which is the shape that gets an origin rate-limited.
 *
 * Twenty keeps the worst case bounded by the per-delivery timeout rather than by the recipient
 * count: with `dispatchPush` capping each attempt, a wholly unreachable push service costs
 * `ceil(recipients / 20) × timeout` instead of `recipients × timeout`.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
const FAN_OUT_CONCURRENCY = 20

/**
 * The fan-out proper (FR-1026, FR-1028, FR-1028a, FR-1034).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FAILURE BOUNDARY HERE IS PER RECIPIENT, AND IT USED TO BE PER FAN-OUT.**
 *
 * One `try` wrapped the whole loop, so a transient pool error on the first recipient silently
 * abandoned every remaining one — at a keynote, 999 attendees never told their session was
 * cancelled, recorded as a single log line. `dispatch.ts` holds the same invariant one level down
 * in capitals (*"ONE DEVICE'S FAILURE MUST NOT AFFECT ANOTHER'S"*); this is that property for the
 * boundary 014 introduced, where the failing operations are database calls that genuinely throw.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The two subscription writes are batched once at the end**, not per recipient. They are keyed
 * on endpoints and neither is scoped to an attendee, so N calls were N round trips computing the
 * same two statements.
 */
const fanOut = async (
  app: FastifyInstance,
  log: FastifyBaseLogger,
  act: SessionAct,
  eventId: string,
  actorAttendeeId: string | null,
  notifyKey: ThrottleKey,
): Promise<void> => {
  // =========================================================================================
  // **THE INTERRUPTION IS THROTTLED SEPARATELY FROM THE ACT, AND EXHAUSTING IT SKIPS THE PUSH
  // RATHER THAN FAILING ANYTHING** (FR-1039; see `session_notify` in `auth/throttle.ts`).
  //
  // A session edit dispatches exactly as a cancellation does, and it was charged `session_write`
  // at 120 an hour against `session_cancel`'s 10 — so an organizer toggling a room could put 120
  // notifications on every saver's lock screen, each titled with the session's own name.
  // Coalescing does not help: it bounds one act to one notification per attendee, and there were
  // 120 acts.
  //
  // Consulted here rather than at the route because materiality is only knowable after the write,
  // and charged **without serving the delay**: the act is already committed, so there is nothing
  // to refuse. Past the bound the attendees still get the in-app marker and lose only the
  // interruption, which is the degradation FR-1032 already describes for a denied permission.
  // =========================================================================================
  const attemptId = await beginAttempt(notifyKey)
  const throttledFor = await failureDelayMs(notifyKey, attemptId)

  if (throttledFor > 0) {
    log.warn(
      { actId: act.actId, eventId, sessionId: act.session.id, throttledForMs: throttledFor },
      'saved-session change not dispatched: the notify bound for this principal is exhausted. ' +
        'The act stands and the in-app marker is unaffected.',
    )
    return
  }

  const recipients = await attendeesToNotify(act.actId, actorAttendeeId, eventId)
  const devices = await subscriptionsForMany(recipients.map((one) => one.attendeeId))

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **ONE OPAQUE IDENTIFIER PER FAN-OUT, AND IT IS DELIBERATELY NOT `act.actId`** (FR-1028b,
  // FR-999, FR-1003).
  //
  // The service worker uses a notification `tag` to decide whether a new notification **replaces**
  // one already on screen. A coalesced payload names no session, so it was tagged
  // `agenda-<eventId>` — which meant **two coalesced acts at one conference replaced each other**.
  // The delivery layer was correct throughout (two notifications were sent, and
  // `dispatch-coalescing.test.ts` asserts it); the collapse happened in the browser, below where
  // anything was looking. FR-1028b names that failure as its own reason for existing: *"a
  // time-window rule would suppress a cancellation because a room moved earlier"*, and a shared
  // tag is a time-window rule whose window never closes.
  //
  // **`act.actId` is the obvious identifier and it must not leave the server.** It is a primary
  // key of `admin_audit_entries`, and FR-999 forbids a read path over the trail in either product
  // — M7 removed exactly this leak from `readProgramme`, and `no-admin-surface.test.ts` fails any
  // file in MyNet that so much as names it (FR-1003). Sending it in a push payload would put an
  // audit key on every attendee's device.
  //
  // So the tag needs only to be **distinct per act**, which a nonce satisfies exactly. It is
  // minted here, used once, and stored nowhere: it identifies nothing, survives nothing, and
  // cannot be correlated with anything an operator did.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const dispatchId = randomUUID()

  const gone: string[] = []
  const delivered: string[] = []
  let failed = 0
  let reached = 0

  // An attendee absent from the map has no registration — they get the in-app marker and nothing
  // else, which is FR-1032 rather than a failure.
  const withDevices = recipients.filter((one) => (devices.get(one.attendeeId)?.length ?? 0) > 0)

  for (let from = 0; from < withDevices.length; from += FAN_OUT_CONCURRENCY) {
    const batch = withDevices.slice(from, from + FAN_OUT_CONCURRENCY)

    await Promise.all(
      batch.map(async (recipient) => {
        try {
          const results = await dispatchToDevices(
            app.push,
            devices.get(recipient.attendeeId) as StoredSubscription[],
            payloadFor(act, recipient.sessionIds, eventId, dispatchId),
            log,
          )

          gone.push(...results.goneEndpoints)
          delivered.push(...results.deliveredEndpoints)
          failed += results.failedEndpoints.length
          if (results.deliveredEndpoints.length > 0) reached += 1
        } catch (error) {
          // This recipient only. Nothing above rethrows, so the batch and every later batch
          // continue — which is the requirement the file name of
          // `dispatch-failure-isolation.test.ts` claims and did not previously pin.
          log.error(
            { err: error, actId: act.actId, attendeeId: recipient.attendeeId },
            'push dispatch failed for one recipient; the fan-out continues',
          )
        }
      }),
    )
  }

  await discardSubscriptions(gone)
  await recordDelivery(delivered)

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **ONE LINE PER ACT, INCLUDING THE ACT THAT REACHED NOBODY.**
  //
  // This used to log inside the loop, once per recipient, each line saying the fan-out was
  // "complete" — so a thousand savers wrote a thousand claims that the whole thing had finished,
  // and an act with no savers wrote nothing at all. That made the correct case (FR-1028: nobody
  // saved it, so nobody is owed anything) **indistinguishable in the logs** from the broken one
  // where the stamp was missing or the fan-out never ran.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  log.info(
    {
      actId: act.actId,
      eventId,
      sessionId: act.session.id,
      change: act.change,
      recipients: recipients.length,
      withDevices: withDevices.length,
      reached,
      delivered: delivered.length,
      failed,
      gone: gone.length,
    },
    'saved-session change fan-out complete',
  )
}

/**
 * The two payload shapes, and which one an attendee gets (FR-1029, FR-1034, FR-1034b).
 *
 * **Exported for `tests/unit/coalesced-payload.test.ts` and for nothing else.** The coalesced
 * branch is unreachable through any route 014 registers — there is no bulk edit, and the two
 * conference-level acts that could touch many sessions are both refused while sessions exist — so
 * the only honest way to assert the shape somebody's phone will show is to call the function that
 * builds it. `THRESHOLDS` in `auth/throttle.ts` carries the same note for the same reason.
 *
 * One changed session names it, and activating it opens that session. Several name a **count**
 * and no session, and activating it opens Agenda — never a list of changes, which is the surface
 * FR-1031 forbids. The count is the only aggregate over changes this feature produces and is
 * permitted **only** here (FR-1034a).
 */
export const payloadFor = (
  act: SessionAct,
  sessionIds: readonly string[],
  eventId: string,
  dispatchId: string,
): {
  kind: 'session-change'
  title: string
  body: string
  eventId: string
  dispatchId: string
  sessionId?: string
  count?: number
} => {
  if (sessionIds.length === 1) {
    return {
      kind: 'session-change',
      title: truncateForPush(act.session.title),
      body: bodyFor(act.change),
      eventId,
      dispatchId,
      sessionId: sessionIds[0] as string,
    }
  }

  return {
    kind: 'session-change',
    title: 'Your agenda changed',
    body: `${sessionIds.length} of your saved sessions changed.`,
    eventId,
    dispatchId,
    count: sessionIds.length,
  }
}

const bodyFor = (change: MaterialChange): string => {
  switch (change) {
    case 'cancelled':
      return 'This session has been cancelled.'
    case 'time':
      return 'This session has moved to a new time.'
    case 'room':
      return 'This session has moved to a different room.'
    default:
      return 'This session changed.'
  }
}
