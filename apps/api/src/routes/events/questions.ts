import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  serveDelay,
  type ThrottleAction,
} from '../../auth/throttle.js'
import {
  askQuestion,
  listQuestions,
  unvoteQuestion,
  voteOnQuestion,
  withdrawQuestion,
} from '../../db/queries/questions.js'
import {
  notAuthenticated,
  notFound,
  ownQuestion,
  questionHasVotes,
  tooManyAttempts,
} from '../../errors.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T020, T026 (009) — audience questions on a session (FR-701–FR-732, FR-741–FR-746).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ROUTE HERE NAMES ITS CONFERENCE, INCLUDING THE THREE THAT DO NOT NEED IT TO FIND THE
 * ROW — AND THAT NAMING IS THE WHOLE SECURITY DESIGN** (FR-742, research R12).
 *
 * `/events/:eventId/questions/:questionId` could locate the question from `:questionId` alone.
 * **Do not "tidy" it to `/questions/:questionId`.** `tests/unit/event-scope-audit.test.ts`
 * examines a route only if it declares an event parameter and **reports success otherwise** — so
 * the tidied version would ship unguarded with a green gate. That is precisely the hole 007 found
 * for conversations and 008 found again for cards, each of which had to build a whole second
 * audit to close it. Here it costs one path segment and **no fourth branded scope and no fourth
 * audit are needed**, which is an outcome rather than a saving.
 *
 * The event in the path is also *checked*, not decorative: every query in
 * `db/queries/questions.ts` reaches the session through `sessions.event_id = scope.eventId`, so a
 * question from another conference is refused exactly like one that does not exist.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THREE THINGS ON EVERY ROUTE, NONE OF THEM DECORATION** — 005's rule, unchanged:
 *
 *   - **`requireAttendee`** binds identity from the sign-in session, never from the request. It
 *     must come first, because the second guard verifies a registration *for* that attendee —
 *     the audit compares actual function references to prove the ordering rather than counting
 *     handlers.
 *   - **`requireEventAccess`** verifies the registration and constructs the `EventScope` the
 *     query layer demands. A handler that dropped it would have nothing to pass and would not
 *     compile.
 *   - **`schema`** is how the route reaches `contracts/openapi.json` at all: Swagger builds the
 *     contract by observing routes as they register, so a route without one is *silently absent*
 *     from the contract and `pnpm contract:check` cannot notice something it was never offered.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DEFAULT REFUSAL IS 404 AND IT IS INDISTINGUISHABLE BY CONSTRUCTION** (FR-743). Not
 * registered, no such conference, a session or question in another conference, a malformed
 * identifier, and a question that does not exist all answer identically.
 *
 * **Exactly two refusals carry a reason** (FR-744), and both pass the same test — *the follow-up
 * question is about the reader, not about anybody else*: withdrawal refused because a vote
 * exists, and a vote refused because the caller is the author. Each describes the reader's own
 * question to the reader. Nothing here branches on a fact about another attendee, which is the
 * enumeration oracle 008 shipped and had to remove.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **No route here dispatches a notification** (FR-747), and that absence is enforced by
 * `tests/unit/notification-triggers.test.ts` over `apps/api/src` — which must keep passing
 * **unmodified**. Editing it to admit a Q&A trigger is a constitution amendment, not an
 * implementation detail.
 */

/** The question limit, at the route. Stated once so this and the column cannot disagree. */
const QUESTION_MAX_LENGTH = 500

/**
 * The throttle, keyed on the **acting attendee's own authenticated identity** (FR-746).
 *
 * Keying on the actor rather than on a target is what makes a denial safe to represent at all: it
 * can only ever fall on the person doing the thing. `reset_request` is keyed on a *victim's*
 * address, which is why it is configured to delay and never deny; nothing in this feature is.
 *
 * Every request counts, not only refused ones — a *successful* hundredth question is precisely
 * the thing being bounded, and a counter that reset on success would not bound it at all.
 */
const throttle = async (
  request: FastifyRequest,
  action: ThrottleAction,
  what: string,
): Promise<void> => {
  const attendee = request.attendee
  if (!attendee) throw notAuthenticated()

  const key = {
    identifierHash: hashAttemptValue(attendee.id),
    sourceHash: hashAttemptValue(request.ip),
    action,
  }

  // 010 T017 — recorded before it is judged (FR-804); excluded from its own count (FR-805).
  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))

  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

export const questionRoutes = async (app: FastifyInstance): Promise<void> => {
  /**
   * Neither identifier declares `format: uuid`, matching every other identifier-bearing route in
   * this product: Fastify would answer a malformed identifier with a 400 and a validation body
   * *before* the handler ran, separating "not a uuid" from "not in this conference". The shape is
   * checked in the query layer instead, where it produces the one uniform refusal.
   */
  const sessionParams = {
    type: 'object',
    required: ['eventId', 'sessionId'],
    properties: { eventId: { type: 'string' }, sessionId: { type: 'string' } },
  } as const

  const questionParams = {
    type: 'object',
    required: ['eventId', 'questionId'],
    properties: { eventId: { type: 'string' }, questionId: { type: 'string' } },
  } as const

  const errorBody = {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  } as const

  /** Shared by every route below: refusals that disclose nothing about existence (FR-743). */
  const refusals = {
    404: {
      description:
        'Not registered for that conference, **or** no such conference, **or** the session or question is not part of it, **or** it does not exist, **or** the identifier is malformed. All of them are deliberately indistinguishable — identical status and identical body — so an attendee cannot enumerate conferences, sessions or questions by watching which refusal comes back (FR-743).',
      ...errorBody,
    },
    401: errorBody,
  } as const

  const throttled = {
    429: {
      description:
        "Throttled, keyed on the caller's own authenticated identity so a refusal can only inconvenience the person acting (FR-746).",
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        retryAfterSeconds: { type: 'number' },
      },
    },
  } as const

  const questionSchema = {
    type: 'object',
    required: [
      'id',
      'body',
      'askedAt',
      'authorId',
      'authorDisplayName',
      'votes',
      'votedByMe',
      'canWithdraw',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      body: { type: 'string' },
      askedAt: { type: 'string', format: 'date-time' },
      authorId: { type: 'string', format: 'uuid' },
      authorDisplayName: {
        type: 'string',
        description:
          "The author's display name, present for **every** question — including one asked by an attendee who has turned discoverability off (FR-734). Attribution has no opt-out; that is the exception constitution v3.3.0 records. Opening that author's profile still refuses, from the existing profile route, unchanged (FR-736).",
      },
      votes: {
        type: 'integer',
        description:
          'Computed at read time. Never stored — a counter column would be a second source of truth for a number the rows already answer.',
      },
      votedByMe: {
        type: 'boolean',
        description:
          "The reader's own state. **No field anywhere names any other voter**, and no route returns one (FR-721, FR-769).",
      },
      canWithdraw: {
        type: 'boolean',
        description:
          "`authorId === reader && votes === 0`. Sent rather than derived on the client so the control's absence and the server's refusal cannot disagree — but it is **not** the enforcement, which lives in the DELETE handler and is checked inside the deleting transaction (FR-714, FR-715).",
      },
    },
  } as const

  const listResponse = {
    type: 'object',
    required: ['questions'],
    additionalProperties: false,
    properties: { questions: { type: 'array', items: questionSchema } },
  } as const

  interface SessionParams extends EventParams {
    readonly sessionId: string
  }

  interface QuestionParams extends EventParams {
    readonly questionId: string
  }

  app.get<{ Params: SessionParams }>(
    '/events/:eventId/sessions/:sessionId/questions',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['questions'],
        summary: "A session's audience questions, ranked",
        description:
          "Ordered by vote count descending, then by ask time ascending — deterministic, so two readers with the same data see the same list and never the count alone (FR-725, FR-726). Unpaginated, permissively (FR-732): a session's questions are bounded by its audience. A session nobody has asked about answers with an empty array, which is a valid answer rendered as an invitation rather than a failure (FR-727).",
        security: [{ sessionCookie: [] }],
        params: sessionParams,
        response: { 200: listResponse, ...refusals },
      },
    },
    async (request) => {
      const questions = await listQuestions(eventScopeOf(request), request.params.sessionId)
      if (!questions) throw notFound()
      return { questions }
    },
  )

  app.post<{ Params: SessionParams; Body: { body: string } }>(
    '/events/:eventId/sessions/:sessionId/questions',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['questions'],
        summary: 'Ask a question on a session',
        description:
          "Answers with the session's **whole re-ordered list** rather than the created question, which is what makes the asker's own action appear immediately without a second round trip in which the count could change again (FR-730, research R5). The question is attributed to the caller under their display name, visible to every attendee registered for the conference, **with no opt-out** — the interface tells them so before they publish (FR-739).",
        security: [{ sessionCookie: [] }],
        params: sessionParams,
        body: {
          type: 'object',
          required: ['body'],
          additionalProperties: false,
          properties: {
            body: {
              type: 'string',
              minLength: 1,
              maxLength: QUESTION_MAX_LENGTH,
              description:
                'The question, 1–500 characters after trimming. Bounded here **and** by a CHECK on the column, because client-side presentation of a limit is never its enforcement (Principle VIII). The composer disables its post control while the field is empty or whitespace and shows the remaining allowance before the limit is reached (FR-704, FR-706), so a 400 here means the form was bypassed.',
            },
          },
        },
        response: {
          201: listResponse,
          400: {
            description:
              'Empty, whitespace-only or over-length. Reachable only by a client that bypassed the composer.',
            ...errorBody,
          },
          ...refusals,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'question_ask', 'questions')

      const body = request.body.body.trim()
      // The route schema bounds the raw string; this bounds the *trimmed* one, which is what the
      // column's CHECK will see. Without it, 500 spaces plus one character passes the schema and
      // is then refused by the database as a 500 rather than a 400 (FR-703, FR-705).
      if (body.length === 0 || body.length > QUESTION_MAX_LENGTH) {
        return reply
          .code(400)
          .send({ code: 'validation_failed', message: 'A question needs 1 to 500 characters.' })
      }

      const questions = await askQuestion(eventScopeOf(request), request.params.sessionId, body)
      if (!questions) throw notFound()

      return reply.code(201).send({ questions })
    },
  )

  app.delete<{ Params: QuestionParams }>(
    '/events/:eventId/questions/:questionId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['questions'],
        summary: 'Withdraw your own question, while nobody has upvoted it',
        description:
          "Authorship is checked **server-side regardless of what any interface offered** (FR-715), and the no-votes condition is re-checked inside the same transaction as the delete with the question row locked — checking before the transaction is the race FR-714 exists to close. Answers with the session's re-ordered list, for the same reason every write here does. **There is no edit route and no PATCH** (FR-709): withdrawal is the only retraction.",
        security: [{ sessionCookie: [] }],
        params: questionParams,
        response: {
          200: listResponse,
          403: {
            description:
              "Somebody has upvoted this question, so it can no longer be withdrawn (FR-714). **This refusal explains itself**, unlike the 404 — it describes the reader's own question to the reader, and the vote count is already on their screen. It names no voter and no count.",
            ...errorBody,
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      const result = await withdrawQuestion(eventScopeOf(request), request.params.questionId)

      if (result.outcome === 'has-votes') throw questionHasVotes()
      if (result.outcome === 'not-found') throw notFound()

      return { questions: result.questions }
    },
  )

  app.post<{ Params: QuestionParams }>(
    '/events/:eventId/questions/:questionId/vote',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['questions'],
        summary: "Upvote somebody else's question",
        description:
          '**Idempotent by the composite primary key** (FR-718), so a double-tap on a slow connection is the same request twice and no repetition can inflate a count. Answers with the re-ordered list, which is what lets the reader see their vote land and the question move without a second request (FR-730). Throttled an order of magnitude more loosely than asking: a reader working down a long list is the normal case, and this bounds a script rather than a person.',
        security: [{ sessionCookie: [] }],
        params: questionParams,
        response: {
          200: listResponse,
          403: {
            description:
              "The caller wrote this question (FR-722). Explained for the same reason withdrawal is: it describes the reader's own authorship, which they already know. The interface omits the control on the reader's own question, so reaching this means it was bypassed.",
            ...errorBody,
          },
          ...refusals,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request, 'question_vote', 'upvotes')

      const result = await voteOnQuestion(eventScopeOf(request), request.params.questionId)

      if (result.outcome === 'own-question') throw ownQuestion()
      if (result.outcome === 'not-found') throw notFound()

      return { questions: result.questions }
    },
  )

  app.delete<{ Params: QuestionParams }>(
    '/events/:eventId/questions/:questionId/vote',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['questions'],
        summary: 'Take your upvote back',
        description:
          "Idempotent in the other direction — succeeds whether or not a vote existed (FR-719). A question that loses its last vote becomes withdrawable by its author again, which falls out of the schema rather than being noticed by any code here. **There is no downvote and no reaction** (FR-723): this removes the caller's own upvote and cannot express anything else.",
        security: [{ sessionCookie: [] }],
        params: questionParams,
        response: { 200: listResponse, ...refusals, ...throttled },
      },
    },
    async (request) => {
      await throttle(request, 'question_vote', 'upvotes')

      const result = await unvoteQuestion(eventScopeOf(request), request.params.questionId)
      if (result.outcome === 'not-found') throw notFound()

      return { questions: result.questions }
    },
  )
}
