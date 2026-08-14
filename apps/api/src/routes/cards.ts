import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  serveDelay,
  type ThrottleAction,
} from '../auth/throttle.js'
import { resolveActiveEvent } from '../db/queries/active-event.js'
// 010 T023 — FR-806. The one permitted second use of verification state, and it applies to the
// ACTOR at write time only; see the call site for why it must never reach card resolution.
import { isEmailVerified } from '../db/queries/attendees.js'
import {
  listHeldCards,
  listSharedCards,
  readHeldCard,
  shareCard,
  type HeldCardRow,
} from '../db/queries/cards.js'
import { contactRefused, notAuthenticated, notFound, tooManyAttempts } from '../errors.js'
import { cardScopeOf, type CardParams } from '../plugins/card-access.js'
import { cardKeyFor } from '../storage/service.js'

/**
 * T056, T057 (008) — digital business cards and the contacts they create (FR-601–FR-618).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT ONE ROUTE IN THIS FILE NESTS UNDER `/events/:eventId`, AND THAT ABSENCE IS THE MOST
 * IMPORTANT THING ABOUT IT** (FR-614, research R1).
 *
 * A held card is cross-event: it outlives the conference it was shared at, the conference
 * ending, and the sharer turning discoverability off. There is no conference to scope by — and
 * the consequence is subtler than "the event guard does not apply".
 * `tests/unit/event-scope-audit.test.ts` matches routes by `:eventId`, so it would **walk past
 * these routes and report success**, leaving them looking protected while nothing checked
 * anything. That is exactly the hole 007 found for conversations, met a second time.
 *
 * Two things replace it, and both are load-bearing:
 *
 *   - **`requireHeldCard`** produces the branded `CardScope` the query layer is the only
 *     consumer of. A handler that dropped it would have nothing to pass and would not compile.
 *   - **`tests/unit/card-audit.test.ts`** walks the real route table and fails the build for any
 *     route naming a card without that guard, in the right order.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`POST /cards` is the exception, and it is the narrowing one 004, 006 and 007 each recorded.**
 *
 * It takes an attendee identifier in its body. That identifier names the **recipient**, never
 * the actor — the actor is fixed by the sign-in session (FR-640) — and there is no card for the
 * guard to verify, because the whole point of the route is that one does not exist yet.
 *
 * The audit does not demand the guard here because the route names no card. What protects it
 * instead is the directory's own visibility triple, folded into the insert, and the fact that
 * every refusal it can produce is byte-identical (FR-607).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO `DELETE` IN THIS FILE, AND THERE IS NO ADDRESS TO ADD ONE AT** (FR-618).
 *
 * A card cannot be recalled. You cannot un-give what somebody already holds, and a product that
 * pretended otherwise would be lying about what it had done with the data. Blocking is the
 * mechanism for ending contact — read-side, reversible, destroying nothing.
 * `card-audit.test.ts` fails the build if a mutating card route is ever registered.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Shared by every route here: refusals that disclose nothing about existence (FR-642). */
const refusals = {
  404: {
    description:
      'No such card, **or** one the caller does not hold — deliberately indistinguishable, with an identical status and an identical body (FR-616, FR-642). A 403 would confirm that two specific people exchanged cards, to somebody holding nothing but an attendee identifier.',
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
  401: {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
} as const

const avatarSchema = {
  type: 'object',
  nullable: true,
  required: ['contentType', 'base64'],
  additionalProperties: false,
  properties: { contentType: { type: 'string' }, base64: { type: 'string' } },
} as const

const heldCardSchema = {
  type: 'object',
  required: [
    'attendeeId',
    'displayName',
    'company',
    'role',
    'headline',
    'interests',
    'avatar',
    'eventId',
    'eventName',
    'sharedAt',
    'atActiveEvent',
  ],
  additionalProperties: false,
  properties: {
    attendeeId: { type: 'string', format: 'uuid' },
    displayName: { type: 'string' },
    company: { type: 'string', nullable: true },
    role: { type: 'string', nullable: true },
    headline: { type: 'string', nullable: true },
    interests: { type: 'array', items: { type: 'string' } },
    avatar: avatarSchema,
    eventId: { type: 'string', format: 'uuid' },
    eventName: {
      type: 'string',
      description:
        'Where the exchange happened (FR-615). A historical fact, **not** a filter — the contacts list is never scoped to the active conference.',
    },
    sharedAt: { type: 'string', format: 'date-time' },
    atActiveEvent: {
      type: 'boolean',
      description:
        "Whether this contact is registered for the reader's active conference. Not a visibility condition — the contact resolves either way (FR-614) — it exists so the client can omit the scheduling action entirely rather than offer it and refuse afterwards (FR-639a).",
    },
  },
} as const

const sharedCardSchema = {
  type: 'object',
  required: ['attendeeId', 'displayName', 'eventId', 'eventName', 'sharedAt'],
  additionalProperties: false,
  properties: {
    attendeeId: { type: 'string', format: 'uuid' },
    displayName: { type: 'string' },
    eventId: { type: 'string', format: 'uuid' },
    eventName: { type: 'string' },
    sharedAt: { type: 'string', format: 'date-time' },
  },
} as const

/**
 * The throttle, keyed on the **acting attendee's own authenticated identity** (FR-609, FR-638a).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Keying on the actor rather than on a target is what makes a denial safe to represent at all:
 * it can only ever fall on the person doing the thing. `reset_request` is keyed on a *victim's*
 * address, which is why it is configured to delay and never deny — and `card_share` is the
 * opposite, because what it bounds is one account pushing its card at a whole conference, and
 * every share leaves a durable entry in a stranger's Network that they cannot delete (FR-618).
 *
 * Every request counts, not only refused ones. A *successful* share with a fiftieth stranger is
 * precisely the thing being bounded; a counter that reset on success would not bound it at all.
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

  // 010 T017 — recorded BEFORE it is judged, so concurrent shares count each other (FR-804).
  // `failureDelayMs` excludes this row, which is what keeps the observable allowance identical
  // to what it was when the order was the other way round (FR-805).
  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))

  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

export const cardRoutes = async (app: FastifyInstance): Promise<void> => {
  const attendeeIdParam = {
    type: 'object',
    required: ['attendeeId'],
    // No `format: uuid`, matching every other identifier-bearing route in this product: Fastify
    // would answer a malformed identifier with a 400 and a validation body *before* the guard
    // ran, separating "not a uuid" from "not yours".
    properties: { attendeeId: { type: 'string' } },
  } as const

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **Avatars for a whole list in ONE storage read**, the lesson 006's directory route records
   * and 007's conversation list repeats: reading storage per row is 1 + N statements against a
   * pool of ten connections, on the landing view of a destination.
   *
   * There is deliberately **no repair path** here, unlike the directory's. That path exists for a
   * developer whose database predates the card rendition and is explicitly not a backfill;
   * reproducing it would put an image pipeline on a request whose fallback — the contact's
   * initials — is a perfectly good answer already.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const withAvatars = async (rows: readonly HeldCardRow[]) => {
    const stored = await app.storage.getMany(
      rows
        .map((row) => row.avatarObjectKey)
        .filter((key): key is string => key !== null)
        .map(cardKeyFor),
    )

    return rows.map((row) => {
      const object = row.avatarObjectKey ? stored.get(cardKeyFor(row.avatarObjectKey)) : undefined
      const { avatarObjectKey: _ignored, ...rest } = row
      return {
        ...rest,
        avatar: object
          ? { contentType: object.contentType, base64: object.bytes.toString('base64') }
          : null,
      }
    })
  }

  app.post<{ Body: { attendeeId: string } }>(
    '/cards',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['network'],
        summary: 'Exchange cards with another attendee',
        description:
          "**Mutual (FR-1021): one act, and both parties hold the other's card.** The recipient is not asked and need do nothing — there is no pending state and no acceptance step. Both records are written in one transaction or neither is (FR-1022), so contacts are mutual or absent and never one-sided.\n\n**This reverses FR-602, which said the sharer gained nothing**, and the reversal is ratified rather than inferred: constitution v5.0.0 (C1) retracts v3.2.0 (N2). The exchange completes only where the recipient is discoverable, verified and registered for the conference (FR-1053) — that condition is what keeps C1's licence true, not a convention inherited from the previous model.\n\n`attendeeId` names the OTHER attendee, never the caller. Answers **201** when it created the exchange and **200** when one already existed, with the original `sharedAt` unchanged — a repeat must not refresh the timestamp, or re-sharing becomes a way to signal somebody repeatedly (FR-1025). The conference recorded is the caller's active one, carried on both records as a historical fact rather than a scoping predicate (FR-1024). No notification is dispatched (FR-1029).",
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['attendeeId'],
          additionalProperties: false,
          properties: {
            attendeeId: {
              type: 'string',
              maxLength: 64,
              description:
                'The recipient. Not validated as a uuid at the schema, so a malformed identifier produces the same 404 as a real attendee who is not discoverable (FR-607).',
            },
          },
        },
        response: {
          201: sharedCardSchema,
          200: {
            description: 'The card had already been shared; nothing changed, including `sharedAt`.',
            ...sharedCardSchema,
          },
          400: {
            description: 'The recipient is the caller (FR-606).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description:
              'No such attendee, no conference in common, the recipient is not discoverable, a malformed identifier, **or the caller has joined no conference** — all with an IDENTICAL body. Distinguishing them would turn this route into an oracle for "is this identifier a real attendee", against a world-readable repository and public self sign-up (FR-607).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          401: refusals[401],
          409: {
            description:
              'Either party has blocked the other. **Reasonless, deliberately** (FR-608): a reason would confirm the block, and the shape is identical to any other conflict on this route.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              "Throttled on the `card_share` counter, which **may deny** (FR-638a). Keyed on the caller's own authenticated identity, so a refusal can only inconvenience the person sharing — and what it bounds is one account pushing its card at an entire conference.",
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
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      await throttle(request, 'card_share', 'card shares')

      // ═════════════════════════════════════════════════════════════════════════════════════
      // **T023 (010) — THE SHARER'S OWN ADDRESS MUST BE VERIFIED** (FR-806, FR-807, FR-808).
      //
      // The finding, in one sentence: an account created against an address its holder does not
      // control can install a **live-resolving** profile, bearing a chosen name and face,
      // **permanently** into a verified attendee's Network. Every clause is load-bearing — a
      // held card resolves the sharer's *current* profile by design (v3.2.0 N2), a card cannot
      // be recalled and the recipient cannot delete it (FR-618), and avatars are unmoderated
      // (register entry 19, escalated by v3.4.0 and explicitly still open).
      //
      // Before this, sharing consulted verification for the **recipient** and not for the
      // sharer. So the party being checked was the one *receiving* something, and the party
      // writing into somebody else's Network was not checked at all.
      //
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **THIS GOVERNS THE ACTOR AT WRITE TIME AND MUST NEVER MIGRATE INTO CARD RESOLUTION**
      // (FR-807). `queries/cards.ts` reads a held card with **no** discoverability condition,
      // **no** verification condition and **no** registration join, and all three absences are
      // the feature rather than an oversight — that is what a standing consent outliving the
      // conference means. A reader who arrives here and then finds those absences will be
      // tempted to "finish the job". Do not.
      //
      // **The refusal is `notFound()`** — the same factory the `unreachable` branch below
      // throws, deliberately, so the two are byte-identical (FR-808). This route already answers
      // one identical 404 for five different causes precisely so it cannot become an oracle for
      // "is this identifier a real attendee", and a sixth cause with its own helpful message
      // would undo that in one line.
      //
      // **No backfill** (FR-806a): a card already shared is not removed or repaired. None
      // exists — no environment has ever been deployed — and a rule that removed one would
      // contradict FR-618, which is a shipped guarantee.
      // ═════════════════════════════════════════════════════════════════════════════════════
      if (!(await isEmailVerified(attendee.id))) throw notFound()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The conference is resolved from the caller, never accepted from them.**
      //
      // FR-605 records *where the exchange happened*, and the honest answer is the conference the
      // sharer is actually at. Taking it from the body would let a caller attribute an exchange
      // to a conference they were not attending — harmless-looking, and it would put a false fact
      // on the recipient's contact entry, which is the one thing on it the sharer cannot later
      // edit.
      //
      // No active conference is a 404 like every other refusal on this route: an attendee who has
      // joined nothing shares no conference with anybody, so the outcome is the same and must
      // look the same (FR-607).
      // ─────────────────────────────────────────────────────────────────────────────────────
      const event = await resolveActiveEvent(attendee.id)
      if (!event) throw notFound()

      const result = await shareCard(attendee.id, request.body.attendeeId, event.id)

      if (result.outcome === 'unreachable') throw notFound()
      if (result.outcome === 'refused') throw contactRefused('That card could not be shared.')
      if (result.outcome === 'self') {
        return reply.code(400).send({
          code: 'validation_failed',
          message: 'You cannot share your card with yourself.',
        })
      }

      return reply.code(result.outcome === 'created' ? 201 : 200).send(result.card)
    },
  )

  app.get(
    '/cards/held',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['network'],
        summary: 'The contacts list — every card the attendee holds',
        description:
          "Cross-event, and **never filtered by the active conference** (FR-614). Also never filtered by the sharer's discoverability (FR-612) or verification state (FR-613): sharing a card places the sharer under a standing consent that outlives both. Each entry resolves the sharer's LIVE profile (FR-611) — there is no stored copy, so an edit they make is visible here with the holder doing nothing. Pairs with a block in either direction are excluded read-side, so lifting a block restores the contact with no write. Not paginated: the list is bounded by deliberate human acts.",
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['cards'],
            additionalProperties: false,
            properties: { cards: { type: 'array', items: heldCardSchema } },
          },
          401: refusals[401],
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      // Null when the attendee has joined nothing, or is between conferences. They still have
      // contacts (FR-614); nobody is merely schedulable.
      const event = await resolveActiveEvent(attendee.id)
      const rows = await listHeldCards(attendee.id, event?.id ?? null)

      return { cards: await withAvatars(rows) }
    },
  )

  app.get(
    '/cards/shared',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['network'],
        summary: 'People who hold your card',
        description:
          'Read-only. **There is no `DELETE` here and there will not be one** (FR-618): a card cannot be recalled, because you cannot un-give what somebody already holds. Deliberately thinner than the held list — it answers *who holds my card*, not *what may I read about them*, and the held list is where the second question is answered.\n\n**Renamed in 016, and the query is unchanged** (FR-1051). Since constitution v5.0.0 (C1) an exchange is mutual, so these rows are no longer only the ones the reader consciously gave away — half of them arise from somebody else sharing first. "Cards you have given away" stopped being true of the same rows; the rows themselves did not move.',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['cards'],
            additionalProperties: false,
            properties: { cards: { type: 'array', items: sharedCardSchema } },
          },
          401: refusals[401],
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()
      return { cards: await listSharedCards(attendee.id) }
    },
  )

  app.get<{ Params: CardParams }>(
    '/cards/held/:attendeeId',
    {
      // Identity first, then the held-card check — the audit compares the actual function
      // references rather than counting handlers, because `[unrelatedHook, requireHeldCard]`
      // satisfies a length check while proving nothing. `requireHeldCard` looks for a row whose
      // recipient is `request.attendee`, so without the first guard it verifies against nobody.
      preHandler: [app.requireAttendee, app.requireHeldCard],
      schema: {
        tags: ['network'],
        summary: 'One held card',
        description:
          "Behind the held-card guard, so the caller demonstrably holds a card FROM this attendee — never the reverse (FR-616). **This is the route the third route audit exists for**: it names no conference, so `event-scope-audit` would walk past it reporting success. Resolves the sharer's live profile under the same standing consent as the list.",
        security: [{ sessionCookie: [] }],
        params: attendeeIdParam,
        response: {
          200: heldCardSchema,
          ...refusals,
        },
      },
    },
    async (request) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const event = await resolveActiveEvent(attendee.id)
      const row = await readHeldCard(cardScopeOf(request), event?.id ?? null)

      // The guard already found a card, so this is the block arriving between the two reads —
      // refused identically to a card that never existed.
      if (!row) throw notFound()

      const [card] = await withAvatars([row])
      if (!card) throw notFound()
      return card
    },
  )
}
