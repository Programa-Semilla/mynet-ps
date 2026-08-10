import type { FastifyInstance } from 'fastify'

import { blockAttendee, listBlocks, unblockAttendee } from '../db/queries/blocks.js'
import { notAuthenticated } from '../errors.js'
import { cardKeyFor } from '../storage/service.js'

/**
 * T077 (007) — refusing contact (FR-534–FR-541a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE BLOCKER IS ALWAYS THE SESSION'S ATTENDEE, AND NO ADDRESS HERE NAMES THEM** (FR-525).
 *
 * `POST /blocks` takes the **target** in its body rather than putting both parties in a path,
 * which is the shape that leaves the actor implicit — an address naming both would be an address
 * in which somebody could name themselves as the blocker.
 *
 * **Every route is idempotent**, so a double-tap on a confirmation cannot produce an error the
 * attendee has to interpret. Blocking somebody already blocked succeeds and changes nothing;
 * unblocking somebody who is not blocked does the same.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These routes name no conversation, so the participation audit does not examine them — and
 * correctly.** A block is between two *attendees*, not inside a conversation: it refuses contact
 * that has not happened yet as well as contact that has. Scoping it to a conversation would make
 * it impossible to block somebody before they message you.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const blockRoutes = async (app: FastifyInstance): Promise<void> => {
  const refusals = {
    401: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  } as const

  app.get(
    '/blocks',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['safety'],
        summary: 'Everyone this attendee has blocked',
        description:
          'The management surface FR-541 requires, served to the block\'s owner only. **This is the one place the feature discloses a profile detail outside a conversation**, and the disclosure is bounded rather than incidental: the caller already knows exactly who these people are, having blocked them by hand, and a list of opaque identifiers would be unusable for the single action it exists to support. An empty array is not an error — it is the "you have not blocked anyone" state FR-541a declares. There is no route, and no field anywhere, by which a blocked attendee learns they were blocked (FR-537).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['blocks'],
            additionalProperties: false,
            properties: {
              blocks: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['attendeeId', 'displayName', 'avatar', 'blockedAt'],
                  additionalProperties: false,
                  properties: {
                    attendeeId: { type: 'string', format: 'uuid' },
                    displayName: { type: 'string' },
                    avatar: {
                      type: 'object',
                      nullable: true,
                      required: ['contentType', 'base64'],
                      additionalProperties: false,
                      properties: {
                        contentType: { type: 'string' },
                        base64: { type: 'string' },
                      },
                    },
                    blockedAt: { type: 'string', format: 'date-time' },
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
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const rows = await listBlocks(attendee.id)

      // One statement for every face, the lesson 006's directory route records: reading storage
      // per row is 1 + N statements. A blocked attendee's card rendition is served here because
      // the caller blocked them by hand and already knows who they are.
      const cards = await app.storage.getMany(
        rows
          .map((row) => row.avatarObjectKey)
          .filter((key): key is string => key !== null)
          .map(cardKeyFor),
      )

      return {
        blocks: rows.map((row) => {
          const stored = row.avatarObjectKey
            ? cards.get(cardKeyFor(row.avatarObjectKey))
            : undefined

          return {
            attendeeId: row.attendeeId,
            displayName: row.displayName,
            avatar: stored
              ? { contentType: stored.contentType, base64: stored.bytes.toString('base64') }
              : null,
            blockedAt: row.blockedAt,
          }
        }),
      }
    },
  )

  app.post<{ Body: { attendeeId: string } }>(
    '/blocks',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['safety'],
        summary: 'Block an attendee. Idempotent',
        description:
          'Takes effect immediately (SC-506): the next send by the blocked attendee is refused whether or not they have the thread open, because the block is read on the send path itself and cached nowhere. **Blocking deletes nothing** (FR-538) — the blocker keeps every message either of them wrote, and unblocking restores sending with nothing lost.',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['attendeeId'],
          additionalProperties: false,
          properties: { attendeeId: { type: 'string', maxLength: 64 } },
        },
        response: {
          204: { type: 'null', description: 'Blocked, or already blocked. The same either way.' },
          400: {
            description: 'Attempting to block yourself.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description: 'No such attendee.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const outcome = await blockAttendee(attendee.id, request.body.attendeeId)

      // **No 404 here any more.** An unreachable or nonexistent target takes the same 204 a
      // successful block does — see `blockAttendee`: the 404/204 split was an attendee-existence
      // oracle, and a block that wrote nothing is indistinguishable from one that had nothing to
      // write. The caller learns only that their request was accepted, which is all a block ever
      // told them.
      if (outcome === 'unreachable') return reply.code(204).send()
      if (outcome === 'self') {
        // Named rather than absorbed as a no-op: a client that reached here has a defect, and a
        // silent 204 would hide it. There is no privacy cost — the caller is asking about
        // themselves.
        return reply
          .code(400)
          .send({ code: 'validation_failed', message: 'You cannot block yourself.' })
      }

      return reply.code(204).send()
    },
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE TARGET IS IN THE BODY, NOT THE PATH — AND THE CONTRACT SAYS OTHERWISE.**
   *
   * `contracts/safety-and-notifications-api.md` writes this as `DELETE /blocks/{attendeeId}`.
   * That shape **fails `tests/unit/event-scope-audit.test.ts`**, which forbids outright any route
   * naming an attendee identifier in its URL with a write method: *"a write route naming an
   * attendee is a route that can act on somebody else"*.
   *
   * The audit is right and the contract was written before it was consulted. 004 narrowed 001's
   * rule to permit a **read** naming an attendee, under the event guard and behind three
   * server-side conditions, and explicitly kept writes forbidden. A block is a write.
   *
   * The body form satisfies it and is the shape the two neighbouring routes already use: `POST
   * /blocks` takes its target in the body for the same reason, and the contract's own `DELETE
   * /push/subscriptions` takes an endpoint in a body rather than a path. So this is a deviation
   * from the written contract toward consistency with everything around it, recorded here and in
   * tasks.md rather than made quietly.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  app.delete<{ Body: { attendeeId: string } }>(
    '/blocks',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['safety'],
        summary: 'Unblock an attendee. Idempotent',
        description:
          "**Directional** (FR-540): this releases only the caller's block. If the other attendee also blocks the caller, that row is untouched and the caller is not told it exists. Succeeds whether or not a block was in force, so a stale management list cannot produce an error. The target is in the body rather than the path because a write route naming an attendee in its URL is forbidden outright by the route audit (FR-385) — the same shape `POST /blocks` uses.",
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['attendeeId'],
          additionalProperties: false,
          properties: { attendeeId: { type: 'string', maxLength: 64 } },
        },
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      await unblockAttendee(attendee.id, request.body.attendeeId)
      return reply.code(204).send()
    },
  )
}
