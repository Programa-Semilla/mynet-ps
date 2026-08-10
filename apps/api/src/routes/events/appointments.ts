import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  failureDelayMs,
  hashAttemptValue,
  recordRequest,
  serveDelay,
  type ThrottleAction,
} from '../../auth/throttle.js'
import {
  acceptAppointment,
  cancelAppointment,
  declineAppointment,
  listAppointments,
  listOfferableSlots,
  proposeAppointment,
  TOPIC_MAX_LENGTH,
  type AppointmentRow,
} from '../../db/queries/appointments.js'
import { contactRefused, notAuthenticated, notFound, tooManyAttempts } from '../../errors.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T084, T085, T104 (008) — proposing meetings and answering them (FR-625–FR-639a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T085 — EVERY ROUTE HERE NESTS UNDER `:eventId`, AND THAT IS A SECURITY DECISION RATHER THAN
 * AN ORGANISING ONE** (research R2, contracts/network.md).
 *
 * It is the exact opposite of `routes/cards.ts`, and the two together are this feature's central
 * structural choice.
 *
 * Appointments are **per-event** (standing decision 7): a meeting is a time and a place at a
 * specific conference. Naming the conference in the path is what puts these routes **inside the
 * guarantee that already exists** — `tests/unit/event-scope-audit.test.ts` *examines* a route
 * that names an event and fails the build if it lacks `requireEventAccess`.
 *
 * **Registering them as `/appointments/:appointmentId` instead would name no conference, and the
 * event audit would silently pass them** — the exact hole `routes/cards.ts` needs a third audit
 * to close. The nesting is the protection. Do not "tidy" these paths shorter.
 *
 * 007 predicted the opposite in its own comments — that appointments would inherit the
 * participation guard — and 008 corrects that prediction where it was written.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`requireEventAccess` ALONE IS NOT SUFFICIENT, AND THE SECOND HALF IS IN THE QUERY.**
 *
 * The guard proves the caller is registered for the conference — which every attendee there is.
 * It does not prove they are party to *this* appointment. That condition lives in
 * `appointmentSelect`, as a `WHERE`, and produces **404 rather than 403** (FR-636): an
 * appointment that exists but is not the caller's yields no row exactly as one that does not
 * exist yields no row.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const refusals = {
  404: {
    description:
      'No such appointment, **or** one the caller is not party to, **or** a conference they are not registered for — deliberately indistinguishable, with an identical status and an identical body (FR-636). A 403 would confirm that two specific people have a meeting.',
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
  401: {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  },
} as const

const appointmentSchema = {
  type: 'object',
  required: [
    'appointmentId',
    'role',
    'counterpart',
    'slot',
    'topic',
    'status',
    'createdAt',
    'answeredAt',
  ],
  additionalProperties: false,
  properties: {
    appointmentId: { type: 'string', format: 'uuid' },
    role: {
      type: 'string',
      enum: ['proposer', 'invitee'],
      description:
        'Which side the reader is on. It decides which actions exist, not merely how the entry reads: only the invitee may accept or decline (FR-635), while either party may cancel a confirmed appointment (FR-632).',
    },
    counterpart: {
      type: 'object',
      required: ['attendeeId', 'displayName'],
      additionalProperties: false,
      description:
        "Always present, unlike a conversation counterpart. Deleting an account removes the appointment for both (FR-652), so there is no one-sided survivor to render. **No avatar**: nothing renders one, and this list is read on Home's first viewport by every attendee on every load — 007 built `/conversations/unread` as its own address for exactly that reason.",
      properties: {
        attendeeId: { type: 'string', format: 'uuid' },
        displayName: { type: 'string' },
      },
    },
    slot: {
      type: 'object',
      required: ['slotId', 'startsAt', 'endsAt'],
      additionalProperties: false,
      properties: {
        slotId: { type: 'string', format: 'uuid' },
        startsAt: { type: 'string', format: 'date-time' },
        endsAt: { type: 'string', format: 'date-time' },
      },
    },
    topic: { type: 'string' },
    status: {
      type: 'string',
      enum: ['pending', 'confirmed', 'declined', 'cancelled', 'lapsed'],
      description:
        '**`lapsed` is DERIVED from the slot instant at read time and is stored nowhere** (FR-634). The four stored statuses are the others; a stored fifth would need a scheduled sweep, and this feature introduces no background job.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    answeredAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const

/** Keyed on the acting attendee's own identity, so a denial can only fall on them (FR-638a). */
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

  if (outstanding > 0) throw tooManyAttempts(outstanding, what)
}

export const appointmentRoutes = async (app: FastifyInstance): Promise<void> => {
  const eventIdParam = {
    type: 'object',
    required: ['eventId'],
    properties: { eventId: { type: 'string' } },
  } as const

  const appointmentIdParam = {
    type: 'object',
    required: ['eventId', 'appointmentId'],
    // No `format: uuid`, matching every other identifier-bearing route: Fastify would answer a
    // malformed identifier with a 400 and a validation body before the participant condition ran,
    // separating "not a uuid" from "not yours".
    properties: { eventId: { type: 'string' }, appointmentId: { type: 'string' } },
  } as const

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **NO AVATAR IS RESOLVED HERE, AND THE ABSENCE IS THE POINT** (007's `/conversations/unread`
   * reasoning, applied one card over).
   *
   * This route originally embedded the counterpart's base64 card rendition per appointment,
   * batched into one `storage.getMany` — correct batching for a payload nothing rendered.
   * Neither `network/Appointments.tsx` nor `home/cards/Appointments.tsx` draws a face; both show
   * a name, a time, a topic and a status.
   *
   * The cost was paid on **Home's first viewport, for every attendee, on every load**, because
   * the appointment card is event-scoped and calls `list` unconditionally: an extra
   * `stored_objects` read plus several KB of incompressible base64 per row, thrown away. 007
   * built `GET /conversations/unread` as a separate address precisely so "Home's card must not
   * transfer every counterpart's name and face to render a dot", and this had reintroduced the
   * pattern.
   *
   * If a face is ever wanted on the Network pane, add it **there** and leave Home on a payload
   * that carries no bytes.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const shape = (row: AppointmentRow) => ({
    appointmentId: row.appointmentId,
    role: row.role,
    counterpart: {
      attendeeId: row.counterpartId,
      displayName: row.counterpartName,
    },
    slot: row.slot,
    topic: row.topic,
    status: row.status,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
  })

  app.get<{ Params: EventParams }>(
    '/events/:eventId/appointments/slots',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['network'],
        summary: 'Slots the reader may offer',
        description:
          "Computed from the **reader's own commitments alone** — their saved sessions, the pending proposals they sent, and their confirmed appointments (FR-625). **The invitee is not a parameter of this route at all** (FR-626): filtering out times the invitee is busy would disclose their Agenda by omission, and the strongest form of that guarantee is having no way to name them here. A **received** proposal consumes nothing either, so no attendee's availability can be reduced by another attendee's action (SC-608a); double-booking is caught at acceptance instead (FR-633a). An empty array is a legitimate answer and drives the no-slots state (FR-627).",
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'object',
            required: ['slots'],
            additionalProperties: false,
            properties: {
              slots: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['slotId', 'startsAt', 'endsAt'],
                  additionalProperties: false,
                  properties: {
                    slotId: { type: 'string', format: 'uuid' },
                    startsAt: { type: 'string', format: 'date-time' },
                    endsAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      // ═══════════════════════════════════════════════════════════════════════════════════
      // **THE INVITEE IS NOT NAMED ON THIS ROUTE AT ALL, AND THAT IS STRONGER THAN NOT READING
      // THEM** (FR-626, SC-605).
      //
      // This used to accept an `attendeeId` query parameter, documented as "so the client can
      // title the dialog" — which the client does not do: it titles itself from a prop it
      // already has. The parameter had no consumer at either end, and it cost two things.
      //
      // It put an attendee identifier in a **query string**, so Caddy's access log, any
      // intermediary and browser history accumulated a record of "A opened a scheduling dialog
      // for B" — a relationship trail this feature otherwise goes to some length not to create.
      // And it left a plausible-looking hook for a future author to wire into the availability
      // computation, which is precisely the leak-by-omission three comments here exist to
      // prevent. The strongest form of "this must not enter the computation" is not having the
      // value on the server.
      // ═══════════════════════════════════════════════════════════════════════════════════
      return { slots: await listOfferableSlots(eventScopeOf(request)) }
    },
  )

  app.get<{ Params: EventParams }>(
    '/events/:eventId/appointments',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['network'],
        summary: 'Every meeting the reader is party to at this conference',
        description:
          'Both roles. `lapsed` is **derived** from the slot instant on every read rather than stored (FR-634) — a stored fifth status would need a scheduled sweep, and this feature introduces no background job.',
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        response: {
          200: {
            type: 'object',
            required: ['appointments'],
            additionalProperties: false,
            properties: { appointments: { type: 'array', items: appointmentSchema } },
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      const rows = await listAppointments(eventScopeOf(request))
      return { appointments: rows.map(shape) }
    },
  )

  app.post<{
    Params: EventParams
    Body: { inviteeId: string; slotId: string; topic: string }
  }>(
    '/events/:eventId/appointments',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['network'],
        summary: 'Propose a meeting',
        description:
          "Creates a **pending** proposal; the invitee accepts or declines it (FR-628, FR-630). Deliberately unlike sharing a card, which needs no answer — an appointment claims a slot of somebody else's time. `inviteeId` names the OTHER party; the proposer is the sign-in session (FR-640).",
        security: [{ sessionCookie: [] }],
        params: eventIdParam,
        body: {
          type: 'object',
          required: ['inviteeId', 'slotId', 'topic'],
          additionalProperties: false,
          properties: {
            inviteeId: { type: 'string', maxLength: 64 },
            slotId: { type: 'string', maxLength: 64 },
            topic: {
              type: 'string',
              minLength: 1,
              // Deliberately larger than the stored limit: the limit applies to the **trimmed**
              // topic, and refusing an over-long-with-padding request at the schema would refuse a
              // topic the attendee actually typed at exactly the limit. Same shape as 007's body.
              maxLength: TOPIC_MAX_LENGTH * 2,
              description: `1–${TOPIC_MAX_LENGTH} characters after trimming. The client keeps its confirm control **disabled** until a slot and a non-blank topic are present (FR-629), so a refusal here is a backstop rather than the mechanism.`,
            },
          },
        },
        response: {
          201: appointmentSchema,
          400: {
            description:
              'An empty or whitespace-only topic, or a slot no longer available **to the caller** — a fact about their own schedule, so saying so discloses nothing (FR-629).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description:
              'The invitee is not registered for this conference, does not exist, or the identifier is malformed — indistinguishably. This is also why the client offers no scheduling action at all for a contact absent from the active event (FR-639a).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          401: refusals[401],
          409: {
            description:
              'Either party has blocked the other. **Reasonless, deliberately** (FR-637) — a reason would confirm the block. Contrast the 409 on `/accept`, which carries an explanation because it describes the reader to themselves.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              "Throttled on the `appointment_propose` counter, which **may deny** (FR-638a): keyed on the proposer's own authenticated identity, so a refusal falls only on them.",
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
      await throttle(request, 'appointment_propose', 'meeting proposals')

      const result = await proposeAppointment(
        eventScopeOf(request),
        request.body.inviteeId,
        request.body.slotId,
        request.body.topic,
      )

      if (result.outcome === 'unreachable') throw notFound()
      if (result.outcome === 'refused') throw contactRefused('That meeting could not be proposed.')
      if (result.outcome === 'invalid') {
        return reply.code(400).send({
          code: 'validation_failed',
          message: 'A meeting needs a topic, and it must be within the length limit.',
        })
      }
      if (result.outcome === 'slot-unavailable') {
        return reply.code(400).send({
          code: 'validation_failed',
          // Describes the reader's own diary and nothing else — the same principle as the
          // acceptance conflict below.
          message: 'That time is no longer free in your schedule. Choose another slot.',
        })
      }

      return reply.code(201).send(shape(result.appointment))
    },
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T104 — the three answers, each a `POST` to a named sub-address rather than a `PATCH`
   * carrying a status.
   *
   * A `PATCH …/:appointmentId` with `{ status }` would make the transitions look
   * interchangeable, and they are not: **only the invitee may accept or decline** (FR-635) while
   * **either party may cancel** (FR-632), and declining frees the slot for one person where
   * cancelling frees it for two (FR-633). Naming each act gives the server three separate
   * authorization decisions to make rather than one branch on a value the client chose.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const answerRoute = (
    action: 'accept' | 'decline' | 'cancel',
    summary: string,
    description: string,
    run: typeof acceptAppointment,
    /** The 409 shape, for `accept` only. */
    conflict?: { description: string; message: string },
  ) => {
    app.post<{ Params: EventParams & { appointmentId: string } }>(
      `/events/:eventId/appointments/:appointmentId/${action}`,
      {
        preHandler: [app.requireAttendee, app.requireEventAccess],
        schema: {
          tags: ['network'],
          summary,
          description,
          security: [{ sessionCookie: [] }],
          params: appointmentIdParam,
          response: {
            200: appointmentSchema,
            403: {
              description:
                'The caller is a participant but not the one who may take this action — a proposer trying to accept or decline (FR-635), or an appointment already answered or lapsed (FR-634). **Distinguishable from a 404 deliberately**: the caller can already see this appointment and its state, so concealing why would make a legible situation look broken.',
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' } },
            },
            ...(conflict
              ? {
                  409: {
                    description: conflict.description,
                    type: 'object',
                    properties: { code: { type: 'string' }, message: { type: 'string' } },
                  },
                }
              : {}),
            ...refusals,
          },
        },
      },
      async (request, reply) => {
        const result = await run(eventScopeOf(request), request.params.appointmentId)

        if (result.outcome === 'not-found') throw notFound()
        if (result.outcome === 'not-allowed') {
          return reply.code(403).send({
            code: 'validation_failed',
            message: 'That is not an action you can take on this meeting.',
          })
        }
        if (result.outcome === 'conflict') {
          return reply.code(409).send({
            code: 'validation_failed',
            // ─────────────────────────────────────────────────────────────────────────────
            // T102 — **this 409 carries a reason and the block 409s do not**, and the
            // difference is deliberate (contract).
            //
            // It is a fact about the **reader's own schedule, told to the reader**: they can
            // already see the clashing commitment in their Agenda and their own appointments
            // list, so explaining discloses nothing. It **never mentions the proposer's**
            // schedule, which would be a fact about somebody else.
            // ─────────────────────────────────────────────────────────────────────────────
            message: conflict?.message ?? 'That is not an action you can take on this meeting.',
          })
        }

        return reply.code(200).send(shape(result.appointment))
      },
    )
  }

  answerRoute(
    'accept',
    'Accept a proposal',
    '**Invitee only** (FR-635); a proposer attempting it is refused with 403. Confirms the meeting for both parties (FR-631).',
    acceptAppointment,
    {
      description:
        "The invitee has since acquired a conflicting commitment (FR-633a). **This 409 carries a reason, deliberately** — it describes the reader's own schedule to the reader, so it discloses nothing. Contrast the reasonless 409s on sharing and proposing, which would confirm a fact about somebody else.",
      message: 'You already have something else booked at that time. Nothing has been confirmed.',
    },
  )

  answerRoute(
    'decline',
    'Decline a proposal',
    "**Invitee only** (FR-635). Frees the slot **for the proposer**, who was the only party it was ever unavailable to — a received proposal consumes none of the invitee's availability (FR-633, SC-608a).",
    declineAppointment,
  )

  answerRoute(
    'cancel',
    'Cancel a confirmed meeting',
    "**Either party** (FR-632), and it frees the slot **for both** (FR-633) — the asymmetry with decline is the point: a declined proposal was never on the invitee's calendar to free.",
    cancelAppointment,
  )
}
