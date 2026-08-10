import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  failureDelayMs,
  hashAttemptValue,
  recordRequest,
  serveDelay,
  type ThrottleAction,
} from '../auth/throttle.js'
import { getDb } from '../db/client.js'
import { blockExistsBetween, blockExistsInConversation } from '../db/queries/blocks.js'
import {
  conversationAcceptsMessages,
  conversationExistsBetween,
  createConversationWithFirstMessage,
  hasUnreadConversations,
  listConversations,
  markRead,
} from '../db/queries/conversations.js'
import {
  appendMessage,
  InvalidCursorError,
  listMessages,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MAX_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
} from '../db/queries/messages.js'
import {
  contactRefused,
  conversationClosed,
  notAuthenticated,
  notFound,
  tooManyAttempts,
} from '../errors.js'
import { conversationScopeOf, type ConversationParams } from '../plugins/participation.js'
import {
  discardSubscriptions,
  recordDelivery,
  subscriptionsFor,
} from '../db/queries/push-subscriptions.js'
import { dispatchToDevices, truncateForPush } from '../notifications/dispatch.js'
import { cardKeyFor } from '../storage/service.js'

/**
 * T039, T042 (007) — conversations and the messages inside them (FR-501–FR-525).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT ONE ROUTE IN THIS FILE NESTS UNDER `/events/:eventId`, AND THAT ABSENCE IS THE MOST
 * IMPORTANT THING ABOUT IT** (FR-507, plan Structure Decision 1).
 *
 * Every per-attendee route before 007 sits under a conference and acquires `requireEventAccess`
 * by doing so. Conversations are cross-event and permanent, so there is no conference to scope
 * by — and the consequence is subtler than "the guard does not apply". `tests/unit/
 * event-scope-audit.test.ts` matches routes by `:eventId`, so it would **walk past these routes
 * and report success**, leaving them looking protected while nothing checked anything
 * (research R9).
 *
 * Two things replace it, and both are load-bearing:
 *
 *   - **`requireParticipation`** produces the branded `ConversationScope` the query layer is the
 *     only consumer of. A handler that dropped it would have nothing to pass and would not
 *     compile.
 *   - **`tests/unit/participation-audit.test.ts`** walks the real route table and fails the build
 *     for any route naming a conversation without that guard, in the right order.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`POST /conversations` is the exception, and it is the narrowing one 004 and 006 recorded.**
 *
 * It takes an attendee identifier in its body. That identifier names the **recipient**, never the
 * actor — the actor is fixed by the sign-in session (FR-525) — and the conversation it resolves
 * to is *derived* from the ordered pair rather than accepted from the caller. There is no
 * conversation for the guard to verify, because the whole point of the route is that one may not
 * exist yet (FR-503a).
 *
 * The audit does not demand the guard here because the route names no conversation. What protects
 * it instead is co-attendance (FR-504), and the fact that every refusal it can produce is
 * byte-identical.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Shared by every route here: refusals that disclose nothing about existence (FR-524). */
const refusals = {
  404: {
    description:
      'No such conversation, **or** one the caller does not participate in — deliberately indistinguishable, with an identical status and an identical body (FR-524). A 403 would confirm that a conversation between two specific people exists, and a conversation identifier is guessable.',
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
  401: {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
} as const

const throttled = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    retryAfterSeconds: { type: 'number' },
  },
} as const

const badBody = {
  description:
    'The body was empty, whitespace-only, or over the limit once trimmed. The composer disables send below the lower bound (FR-512) and shows a counter approaching the upper one (FR-517), so this is a backstop rather than the designed path.',
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

const messageBody = {
  type: 'object',
  required: ['body'],
  additionalProperties: false,
  properties: {
    body: {
      type: 'string',
      minLength: 1,
      // Deliberately larger than `MESSAGE_MAX_LENGTH`: the limit applies to the **trimmed** body,
      // and refusing an over-long-with-padding request at the schema would refuse a message the
      // attendee actually typed at exactly the limit. The query layer trims and then measures.
      maxLength: MESSAGE_MAX_LENGTH * 2,
      description: `1–${MESSAGE_MAX_LENGTH} characters after trimming. Plain text only — attachments, images and rich formatting are out of scope (FR-513).`,
    },
  },
} as const

/**
 * The throttle, applied identically to both write routes and keyed on the **acting attendee's own
 * authenticated identity** (FR-504a, FR-511a, research R5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Keying on the actor rather than on a target is what makes a denial safe to represent at all:
 * it can only ever fall on the person doing the thing. `reset_request` is keyed on a *victim's*
 * address, which is why it is configured to delay and never deny — and `message_send` is
 * configured the same way for a different reason entirely, recorded in `auth/throttle.ts`.
 *
 * Every request counts, not only refused ones. The harm `conversation_create` bounds is breadth
 * of contact, and a successful first message to a fiftieth stranger is precisely the thing being
 * bounded — a counter that reset on success would not bound it at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────
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

  const outstanding = await serveDelay(await failureDelayMs(key))
  await recordRequest(key)

  // `message_send` can never reach here: `failureDelayMs` clamps a delay-only action's result to
  // what `serveDelay` will actually sleep, so there is no remainder to refuse on. That clamp
  // lives in the throttle module precisely so no call site can forget it.
  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

/**
 * T113 (007) — **notify the recipient, after the message is safely stored** (FR-550, FR-553,
 * FR-558, M7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE BLOCK IS EVALUATED AT DISPATCH TIME, NOT AT SEND TIME, AND FR-558 SAYS SO EXPLICITLY.**
 *
 * The send path already refuses a blocked sender, so it is tempting to treat "the message was
 * accepted" as proof that a notification is wanted. It is not, and the gap is real: this runs
 * *after* the write, and a recipient can block in between. More importantly the two questions are
 * different — a message may be legitimately stored and still not be something to interrupt
 * somebody about.
 *
 * Re-asking here is one indexed `EXISTS`, and it is what makes FR-542 true at the moment that
 * matters rather than at the moment before it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE MAY FAIL THE SEND.** The attendee is waiting on the send, and the notification is
 * a courtesy to somebody else. `dispatchToDevices` bounds every attempt and never rejects; this
 * wrapper catches anything the *database* work might throw, because a failure to discard a dead
 * subscription must not turn a delivered message into a 500.
 *
 * Awaited rather than left floating, deliberately. A detached promise would make SC-503's latency
 * unmeasurable, would let an error escape as an unhandled rejection, and would race the test
 * harness — and the cost is bounded by the per-device timeout that already exists.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const notifyRecipient = async (
  app: FastifyInstance,
  request: FastifyRequest,
  conversationId: string,
  senderId: string,
  senderName: string,
  body: string,
): Promise<void> => {
  try {
    const recipientId = await counterpartIn(conversationId, senderId)
    // A one-sided conversation has nobody to notify. The send path refuses those anyway, so this
    // is the belt to that braces.
    if (!recipientId) return

    // FR-542, FR-558 — asked again, here, for the reason in the header.
    if (await blockExistsBetween(senderId, recipientId)) return

    const subscriptions = await subscriptionsFor(recipientId)
    if (subscriptions.length === 0) return

    const { deliveredEndpoints, failedEndpoints, goneEndpoints } = await dispatchToDevices(
      app.push,
      subscriptions,
      {
        // FR-553 — the sender is identified. Their display name, not their identifier: a
        // notification is read by a person.
        title: senderName,
        body: truncateForPush(body),
        conversationId,
      },
      request.log,
    )

    // FR-557 — a permanently dead subscription is discarded rather than retried forever.
    await discardSubscriptions(goneEndpoints)

    // **Only the endpoints that actually took delivery.** This used to be "everything that was
    // not gone", which swept in every `'failed'` device and stamped them as freshly delivered —
    // see `dispatchToDevices` for why that made the column useless for the one job it has.
    await recordDelivery(deliveredEndpoints)

    // One line an operator can find, at `info`, which is the production level. Counts only: the
    // endpoint is a bearer value and the body is content, so neither belongs in a deployed log.
    request.log.info(
      {
        conversationId,
        delivered: deliveredEndpoints.length,
        failed: failedEndpoints.length,
        gone: goneEndpoints.length,
      },
      'push fan-out complete',
    )
  } catch (error) {
    // Logged rather than swallowed, so a persistently failing dispatch is visible — and never
    // rethrown, because the message is already stored and the sender is owed their 201.
    request.log.error({ err: error, conversationId }, 'push dispatch failed after a message send')
  }
}

/** Who else is in this conversation. `null` for a one-sided one, which has nobody to notify. */
const counterpartIn = async (conversationId: string, senderId: string): Promise<string | null> => {
  const rows = await getDb().execute<{ attendee_id: string }>(sql`
    SELECT attendee_id FROM conversation_participants
    WHERE conversation_id = ${conversationId}::uuid AND attendee_id <> ${senderId}::uuid
    LIMIT 1
  `)
  return rows[0]?.attendee_id ?? null
}

export const conversationRoutes = async (app: FastifyInstance): Promise<void> => {
  const conversationIdParam = {
    type: 'object',
    required: ['conversationId'],
    // No `format: uuid`, matching every other identifier-bearing route in this product: Fastify
    // would answer a malformed identifier with a 400 and a validation body *before* the guard
    // ran, separating "not a uuid" from "not yours".
    properties: { conversationId: { type: 'string' } },
  } as const

  const avatarSchema = {
    type: 'object',
    nullable: true,
    required: ['contentType', 'base64'],
    additionalProperties: false,
    properties: { contentType: { type: 'string' }, base64: { type: 'string' } },
  } as const

  app.get(
    '/conversations',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['messages'],
        summary: 'Every conversation the attendee participates in, most recent first',
        description:
          "Not paginated: an attendee holds tens of these and FR-508's ordering is over the whole set. `counterpart` is **null** when the other participant has deleted their account (FR-573) — there is no name, no avatar and no identifier, because nothing was retained; the client renders the closed treatment from `state`, never from a missing field. `state` is derived from the participant count and the caller's own blocks and is stored nowhere. `blocked` means THIS attendee blocks the counterpart — the reverse is invisible here, deliberately (FR-537). `unread` is a boolean rather than a count (FR-531), derived from the reader's own read position and never from who spoke last (FR-527).",
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['conversations'],
            additionalProperties: false,
            properties: {
              conversations: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['conversationId', 'counterpart', 'lastMessage', 'unread', 'state'],
                  additionalProperties: false,
                  properties: {
                    conversationId: { type: 'string', format: 'uuid' },
                    counterpart: {
                      type: 'object',
                      nullable: true,
                      required: ['attendeeId', 'displayName', 'avatar'],
                      additionalProperties: false,
                      properties: {
                        attendeeId: { type: 'string', format: 'uuid' },
                        displayName: { type: 'string' },
                        avatar: avatarSchema,
                      },
                    },
                    lastMessage: {
                      type: 'object',
                      nullable: true,
                      required: ['body', 'sentAt', 'mine'],
                      additionalProperties: false,
                      properties: {
                        body: { type: 'string' },
                        sentAt: { type: 'string', format: 'date-time' },
                        mine: { type: 'boolean' },
                      },
                    },
                    unread: { type: 'boolean' },
                    state: { type: 'string', enum: ['open', 'one_sided', 'blocked'] },
                  },
                },
              },
            },
          },
          401: refusals[401],
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const rows = await listConversations(attendee.id)

      // ───────────────────────────────────────────────────────────────────────────────────
      // **Every face in one statement**, the lesson 006's directory route records: reading
      // storage per row is 1 + N statements against a pool of ten connections, on the landing
      // view of the destination.
      //
      // There is deliberately **no repair path** here, unlike the directory's. That path exists
      // for a developer whose database predates the card rendition and is explicitly not a
      // backfill; reproducing it would put an image pipeline on a request whose fallback — the
      // counterpart's initials — is a perfectly good answer already.
      // ───────────────────────────────────────────────────────────────────────────────────
      const cards = await app.storage.getMany(
        rows
          .map((row) => row.avatarObjectKey)
          .filter((key): key is string => key !== null)
          .map(cardKeyFor),
      )

      return {
        conversations: rows.map((row) => {
          const stored = row.avatarObjectKey
            ? cards.get(cardKeyFor(row.avatarObjectKey))
            : undefined

          return {
            conversationId: row.conversationId,
            // Null together, and only ever null together. A departed participant leaves nothing
            // to send (FR-573), which is why this is one branch rather than three nullable fields
            // a client would have to reconcile.
            counterpart:
              row.counterpartId === null || row.displayName === null
                ? null
                : {
                    attendeeId: row.counterpartId,
                    displayName: row.displayName,
                    avatar: stored
                      ? { contentType: stored.contentType, base64: stored.bytes.toString('base64') }
                      : null,
                  },
            lastMessage:
              row.lastBody === null || row.lastSentAt === null
                ? null
                : { body: row.lastBody, sentAt: row.lastSentAt, mine: row.lastMine === true },
            unread: row.unread,
            state: row.state,
          }
        }),
      }
    },
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **`/conversations/unread` is a static segment and there is no `/conversations/:id` route for
   * it to be shadowed by** — checked rather than assumed, because the address reads like a
   * conversation identifier and is not one.
   *
   * Its own address rather than a field on the list, because Home's card must not transfer every
   * counterpart's name and face to render a dot, and standing decision 9 requires the card to own
   * its loading and failure states independently of any other surface (FR-531, FR-533).
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  app.get(
    '/conversations/unread',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['messages'],
        summary: 'Whether anything at all is unread',
        description:
          'A boolean, not a count. FR-531 needs existence and nothing in the product needs more — and a count is a more precise disclosure of reading behaviour than any requirement asks for.',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['hasUnread'],
            additionalProperties: false,
            properties: { hasUnread: { type: 'boolean' } },
          },
          401: refusals[401],
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()
      return { hasUnread: await hasUnreadConversations(attendee.id) }
    },
  )

  app.get<{
    Params: ConversationParams
    Querystring: { cursor?: string; limit?: number; counterpart?: boolean }
  }>(
    '/conversations/:conversationId/messages',
    {
      preHandler: [app.requireAttendee, app.requireParticipation],
      schema: {
        tags: ['messages'],
        summary: 'A page of history, newest first',
        description:
          "Behind the participation guard (FR-520, FR-523). **No author identifier is projected — only `mine`**: the counterpart is already established by the conversation, so an identifier per message would add nothing and widen the surface. Unlike 006's directory cursor this one guarantees no duplicates AND no omissions, because `sent_at` is immutable (FR-516) and the ordering total. The client reverses the page for display, since a thread opens at its most recent message.",
        security: [{ sessionCookie: [] }],
        params: conversationIdParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cursor: {
              type: 'string',
              maxLength: 200,
              description:
                "Opaque. Encodes the previous page's last (sentAt, id). It is a position, never a scope — the conversation comes from the path and its guard.",
            },
            counterpart: {
              type: 'boolean',
              default: true,
              description:
                'Whether to include the counterpart, whose avatar bytes are the bulk of this response. The open thread polls every three seconds and the face never changes, so a poll asks for `false` and keeps the one it already has.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MESSAGE_MAX_PAGE_SIZE,
              default: MESSAGE_PAGE_SIZE,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['messages', 'nextCursor', 'state', 'counterpart'],
            additionalProperties: false,
            properties: {
              counterpart: {
                type: 'object',
                nullable: true,
                description:
                  "Who the conversation is with, or **null** when they have deleted their account (FR-573) — no name, no avatar and no identifier, because nothing was retained. Carried on the page rather than fetched separately so that the header, the composer's availability and the safety dialogs are all satisfied by one request.",
                required: ['attendeeId', 'displayName', 'avatar'],
                additionalProperties: false,
                properties: {
                  attendeeId: { type: 'string', format: 'uuid' },
                  displayName: { type: 'string' },
                  avatar: {
                    type: 'object',
                    nullable: true,
                    required: ['contentType', 'base64'],
                    additionalProperties: false,
                    properties: { contentType: { type: 'string' }, base64: { type: 'string' } },
                  },
                },
              },
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['messageId', 'body', 'sentAt', 'mine'],
                  additionalProperties: false,
                  properties: {
                    messageId: { type: 'string', format: 'uuid' },
                    body: { type: 'string' },
                    sentAt: { type: 'string', format: 'date-time' },
                    mine: { type: 'boolean' },
                  },
                },
              },
              nextCursor: { type: 'string', nullable: true },
              state: { type: 'string', enum: ['open', 'one_sided', 'blocked'] },
            },
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      try {
        const page = await listMessages(conversationScopeOf(request), request.query)

        // ═══════════════════════════════════════════════════════════════════════════════════
        // **THE AVATAR IS THE BULK OF THIS RESPONSE, AND THE POLL ASKED FOR IT TWENTY TIMES A
        // MINUTE.**
        //
        // The card rendition is a ~96px image, so roughly 2–4 KB of already-compressed bytes and
        // ~3–5.5 KB once base64-encoded. Caddy's `encode` cannot recover any of it: base64 of
        // compressed image data is near-incompressible. At a three-second poll that was ~60–110 KB
        // per minute per attendee of cellular data, at a venue, for a picture that never changes —
        // plus a `stored_objects` read and a base64 encode per tick, on the same small box as the
        // database.
        //
        // The counterpart is genuinely needed on the **first** read: the header, the composer's
        // availability, and the safety dialogs all name them. It is not needed on the twentieth
        // read of the same minute, so the client asks once and keeps it. Defaulting to `true`
        // keeps every existing caller — and the contract — unchanged.
        // ═══════════════════════════════════════════════════════════════════════════════════
        const wantsCounterpart = request.query.counterpart !== false

        const key = wantsCounterpart ? page.counterpart?.avatarObjectKey : undefined
        const cards = key ? await app.storage.getMany([cardKeyFor(key)]) : undefined
        const stored = key ? cards?.get(cardKeyFor(key)) : undefined

        return {
          messages: page.messages,
          nextCursor: page.nextCursor,
          state: page.state,
          counterpart:
            wantsCounterpart && page.counterpart
              ? {
                  attendeeId: page.counterpart.attendeeId,
                  displayName: page.counterpart.displayName,
                  avatar: stored
                    ? { contentType: stored.contentType, base64: stored.bytes.toString('base64') }
                    : null,
                }
              : null,
        }
      } catch (error) {
        // A cursor this server did not issue is refused the way every other unusable input here
        // is refused. A 400 with a validation body would make a hand-edited cursor
        // distinguishable from a conversation that is not yours — a small difference, and the
        // kind an attacker reads.
        if (error instanceof InvalidCursorError) throw notFound()
        throw error
      }
    },
  )

  app.put<{ Params: ConversationParams; Body: { throughMessageId: string } }>(
    '/conversations/:conversationId/read',
    {
      preHandler: [app.requireAttendee, app.requireParticipation],
      schema: {
        tags: ['messages'],
        summary: "Advance the caller's own read position",
        description:
          "Idempotent and **monotonic**: a request naming an older message than the current position is accepted and changes nothing. Without that, an out-of-order arrival could silently mark a conversation unread again. Writes only the caller's own participant row — there is no route, and no field on any response, by which one attendee learns another's read position (FR-530).",
        security: [{ sessionCookie: [] }],
        params: conversationIdParam,
        body: {
          type: 'object',
          required: ['throughMessageId'],
          additionalProperties: false,
          properties: { throughMessageId: { type: 'string', maxLength: 64 } },
        },
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      await markRead(conversationScopeOf(request), request.body.throughMessageId)
      return reply.code(204).send()
    },
  )

  app.post<{ Body: { attendeeId: string; body: string } }>(
    '/conversations',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['messages'],
        summary: 'Open a conversation by sending its first message',
        description:
          'The ONLY route that creates a conversation, and it does so in one transaction with the first message — there is no route that creates an empty one, because FR-503a says none exists until something is said (opening a thread from a profile writes nothing). `attendeeId` names the RECIPIENT, never the caller. Answers 201 when it created the conversation and 200 when it appended to one that already existed (FR-510), with an identical body either way: a pair never has two conversations, and the caller has no reason to know which happened.',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['attendeeId', 'body'],
          additionalProperties: false,
          properties: {
            attendeeId: {
              type: 'string',
              maxLength: 64,
              description:
                'The recipient. Not validated as a uuid at the schema, so a malformed identifier produces the same 404 as a real attendee with no conference in common (FR-504).',
            },
            body: messageBody.properties.body,
          },
        },
        response: {
          201: {
            type: 'object',
            required: ['conversationId', 'messageId', 'sentAt'],
            additionalProperties: false,
            properties: {
              conversationId: { type: 'string', format: 'uuid' },
              messageId: { type: 'string', format: 'uuid' },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
          200: {
            description: 'The conversation already existed; the message was appended to it.',
            type: 'object',
            required: ['conversationId', 'messageId', 'sentAt'],
            additionalProperties: false,
            properties: {
              conversationId: { type: 'string', format: 'uuid' },
              messageId: { type: 'string', format: 'uuid' },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
          400: badBody,
          404: {
            description:
              'No such attendee, no conference in common, a malformed identifier, or the caller themselves — all four with an IDENTICAL body. Distinguishing them would turn this route into an oracle for "is this identifier a real attendee", against a world-readable repository and public self sign-up (FR-504, FR-506).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          401: refusals[401],
          429: {
            description:
              "Throttled on the `conversation_create` counter. **This is the one throttle in the feature that genuinely refuses** (FR-504a): it is keyed on the caller's own authenticated identity, so a denial can only inconvenience the person doing it, and bounding how many distinct people one account opens conversations with is the whole point.",
            ...throttled,
          },
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      // ═════════════════════════════════════════════════════════════════════════════════════
      // **THE COUNTER IS CHOSEN BY WHAT THIS REQUEST ACTUALLY IS.**
      //
      // This route serves two outcomes, and only one of them is "reaching a new person". Charging
      // `conversation_create` for both — which is what it used to do, before the query had even
      // run — meant an append was billed to the one throttle in this feature allowed to **deny**.
      //
      // Discover's Message action always routes here, including for somebody you already have a
      // thread with (FR-510 reopens the same conversation). So an attendee who had opened five
      // conversations that hour was answered 429 when writing to an existing contact from their
      // profile: a legitimate send, refused, which FR-511a forbids outright.
      //
      // An existing pair therefore takes `message_send`, which may delay and can never deny.
      // ═════════════════════════════════════════════════════════════════════════════════════
      const alreadyTalking = await conversationExistsBetween(attendee.id, request.body.attendeeId)

      await throttle(
        request,
        alreadyTalking ? 'message_send' : 'conversation_create',
        alreadyTalking ? 'messages' : 'new conversations',
      )

      // ─────────────────────────────────────────────────────────────────────────────────────
      // T076 — **the block check, before anything is created** (FR-536, FR-537).
      //
      // Bidirectional, though the rows are not: a send is refused when either attendee blocks
      // the other. The recipient blocking the caller is FR-536; the caller having blocked the
      // recipient is FR-539's incoherence, and their own client already knows because
      // `state: 'blocked'` arrives on the conversation. Both take the same reasonless 409, so
      // the server never has to decide which story to tell.
      //
      // Ordered before creation rather than folded into it, because a refused attempt must
      // write nothing at all — not a conversation, not a pair row, not a participation.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (await blockExistsBetween(attendee.id, request.body.attendeeId)) {
        throw contactRefused()
      }

      const result = await createConversationWithFirstMessage(
        attendee.id,
        request.body.attendeeId,
        request.body.body,
      )

      if (result.outcome === 'unreachable') throw notFound()
      if (result.outcome === 'invalid-body') {
        return reply.code(400).send({
          code: 'validation_failed',
          message: 'A message needs some text, and must be within the length limit.',
        })
      }

      // T113 — after the write, never before. See `notifyRecipient`.
      await notifyRecipient(
        app,
        request,
        result.conversationId,
        attendee.id,
        attendee.displayName,
        request.body.body,
      )

      return reply.code(result.outcome === 'created' ? 201 : 200).send({
        conversationId: result.conversationId,
        messageId: result.messageId,
        sentAt: result.sentAt,
      })
    },
  )

  app.post<{ Params: ConversationParams; Body: { body: string } }>(
    '/conversations/:conversationId/messages',
    {
      // Identity first, then participation — the audit compares the actual function references
      // rather than counting handlers, because `[unrelatedHook, requireParticipation]` satisfies
      // a length check while proving nothing. `requireParticipation` looks for a row belonging to
      // `request.attendee`, so without the first guard it verifies against nobody.
      preHandler: [app.requireAttendee, app.requireParticipation],
      schema: {
        tags: ['messages'],
        summary: 'Send a message into a conversation',
        description:
          "Behind the participation guard, so the caller demonstrably has a `conversation_participants` row (FR-521, FR-523). The author is the sign-in session's attendee and there is no parameter in which to name anybody else (FR-525). `sentAt` in the response is the SERVER's instant: a device with a wrong clock must not be able to place its own message out of order in a thread.",
        security: [{ sessionCookie: [] }],
        params: conversationIdParam,
        body: messageBody,
        response: {
          201: {
            type: 'object',
            required: ['messageId', 'sentAt'],
            additionalProperties: false,
            properties: {
              messageId: { type: 'string', format: 'uuid' },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
          400: badBody,
          ...refusals,
          429: {
            description:
              "`message_send` is configured **`mayDeny: false`** (FR-511a, research R5), so this always carries `retry-after` and always clears. A send is delayed, never denied — a networking product's value is a timely reply, and an attendee whose message is refused at a conference has been handed a failure they cannot act on.",
            ...throttled,
          },
        },
      },
    },
    async (request, reply) => {
      await throttle(request, 'message_send', 'messages')

      const scope = conversationScopeOf(request)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // T133 — **closed before blocked, and the two refusals are deliberately different**
      // (FR-574, contract).
      //
      // A one-sided conversation answers **403 with an explanation**; a block answers a
      // reasonless 409. That is not an inconsistency: a closed conversation is a fact about a
      // thread the caller can already see every message of, so explaining it discloses nothing
      // about another attendee — and leaving them to guess would make a permanent state look
      // like a transient failure worth retrying.
      //
      // First, because a departed counterpart cannot be blocked by anybody: `blockExists…`
      // resolves the counterpart from the participant rows and correctly finds none, so the
      // block check would answer "no block" and let the send through.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (!(await conversationAcceptsMessages(scope))) throw conversationClosed()

      // T076 — the same check on the other send path, resolving the counterpart from the
      // participant rows because this route has a conversation rather than an attendee. See
      // `POST /conversations` above for why it is bidirectional.
      if (await blockExistsInConversation(scope.attendeeId, scope.conversationId)) {
        throw contactRefused()
      }

      const stored = await appendMessage(scope, request.body.body)

      if (!stored) {
        return reply.code(400).send({
          code: 'validation_failed',
          message: 'A message needs some text, and must be within the length limit.',
        })
      }

      const attendee = request.attendee
      if (attendee) {
        await notifyRecipient(
          app,
          request,
          scope.conversationId,
          attendee.id,
          attendee.displayName,
          request.body.body,
        )
      }

      return reply.code(201).send(stored)
    },
  )
}
