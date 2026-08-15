import type { FastifyInstance } from 'fastify'

import { readCoAttendeeProfile, readVisibleAvatarKey } from '../../db/queries/profiles.js'
import { AVAILABILITIES, NETWORKING_INTENTS } from '../../db/schema/profiles.js'
import { notFound } from '../../errors.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'

/**
 * T090 (004) — reading another attendee's profile (FR-357–FR-361, FR-390, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THREE CONDITIONS, ALL SERVER-SIDE, AND ALL IN ONE `WHERE`.**
 *
 *   1. the **reader** is registered for this conference — proven by the branded `EventScope`,
 *      which only `requireEventAccess` can construct and which the route audit fails the build
 *      for omitting;
 *   2. the **target** is registered for the same conference (FR-357);
 *   3. the target is **discoverable and verified** (FR-359).
 *
 * Because they are one predicate over one join, *not registered*, *does not exist*, *not
 * discoverable* and *not verified* all produce **no row**. There is no branch that knows which
 * one failed, so there is no branch a later edit could make report differently — FR-361's "the
 * requesting attendee MUST NOT be able to learn another attendee's verification state" holds
 * because nothing in this process ever computed it.
 *
 * That is FR-148's property obtained the way 002 obtained it for events: **by construction
 * rather than by four careful call sites**.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is the product's first route naming an attendee identifier**, and 001's rule that no
 * route may name one is narrowed rather than abandoned. The rule's purpose was that nothing may
 * *act on* somebody else, and nothing here does: both verbs are reads, the identifier can only
 * narrow a set the three conditions have already bounded, and
 * `tests/integration/profile-ownership.test.ts` asserts structurally that no **write** route
 * ever names one.
 *
 * 006 is what consumes this. It arrives with a directory; this feature ships the read it needs
 * and no listing — a list of co-attendees is 006's to design.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const attendeeProfileRoutes = async (app: FastifyInstance): Promise<void> => {
  interface AttendeeParams extends EventParams {
    readonly attendeeId: string
  }

  const params = {
    type: 'object',
    required: ['eventId', 'attendeeId'],
    properties: {
      eventId: { type: 'string' },
      /**
       * Declared as a plain string, **deliberately without `format: uuid`** — the same choice
       * `agenda.ts` records. Fastify would answer a malformed identifier with a 400 and a
       * validation body before the handler ran, separating "not a uuid" from "not visible to
       * you". Smaller than an existence leak, still a difference an attacker can read.
       */
      attendeeId: { type: 'string' },
    },
  } as const

  /** One refusal for every cause, so none of the four is distinguishable (FR-361). */
  const refusals = {
    404: {
      description:
        'No conference in common, **or** no such attendee, **or** discoverability off, **or** the address unverified. All four are deliberately indistinguishable — identical status and identical body — so a requester cannot learn who exists, who is hiding, or whose address is verified (FR-361).',
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
    401: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  } as const

  app.get<{ Params: AttendeeParams }>(
    '/events/:eventId/attendees/:attendeeId',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['profile'],
        summary: "Another attendee's profile, within a conference you share",
        description:
          "Carries both guards. The READER's registration is proven by the branded EventScope the route audit guarantees is present; the TARGET must additionally be registered for the same conference, be discoverable, and have a verified address — all three evaluated server-side before any field is returned (FR-390).",
        security: [{ sessionCookie: [] }],
        params,
        response: {
          200: {
            type: 'object',
            required: ['attendeeId', 'displayName', 'interests', 'hasAvatar'],
            additionalProperties: false,
            properties: {
              attendeeId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              company: { type: ['string', 'null'] },
              role: { type: ['string', 'null'] },
              headline: { type: ['string', 'null'] },
              // 014 T2 (FR-1090, FR-1092) — the taxonomy fields, nullable like company: an
              // unset field arrives as null and the card shows NO line for it — no placeholder,
              // no dash. Governed by the one visibility decision this whole response already
              // answers to (FR-1097): there is no per-field audience and none may be added.
              sector: { type: ['string', 'null'] },
              subsector: { type: ['string', 'null'] },
              productiveActivity: { type: ['string', 'null'] },
              networkingIntent: { type: ['string', 'null'], enum: [...NETWORKING_INTENTS, null] },
              availability: { type: ['string', 'null'], enum: [...AVAILABILITIES, null] },
              interests: { type: 'array', items: { type: 'string' } },
              hasAvatar: { type: 'boolean' },
            },
            /**
             * ─────────────────────────────────────────────────────────────────────────────
             * **`email` and `emailVerified` are absent, and `additionalProperties: false` is
             * what keeps them absent.**
             *
             * FR-361 forbids a requester learning another attendee's verification state, and
             * FR-391 forbids returning credential, verification or reset material at all. The
             * query does not select them; the schema would strip them if it did. Two mechanisms
             * for one property, because this is the response where getting it wrong is silent.
             * ─────────────────────────────────────────────────────────────────────────────
             */
          },
          ...refusals,
        },
      },
    },
    async (request) => {
      const visible = await readCoAttendeeProfile(eventScopeOf(request), request.params.attendeeId)

      // The one refusal, whatever the cause. See the file header.
      if (!visible) throw notFound()
      return visible
    },
  )

  app.get<{ Params: AttendeeParams }>(
    '/events/:eventId/attendees/:attendeeId/avatar',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['profile'],
        summary: "Another attendee's avatar, under the same conditions as their profile",
        description:
          "THE SAME THREE CONDITIONS as the profile, reusing the same query rather than repeating the predicate — serving a hidden attendee's photograph would be the profile withheld and the face given away. 204 when they have none, so the client renders the fallback (FR-351).",
        security: [{ sessionCookie: [] }],
        params,
        response: {
          200: {
            type: 'object',
            required: ['contentType', 'base64'],
            additionalProperties: false,
            properties: { contentType: { type: 'string' }, base64: { type: 'string' } },
          },
          204: { type: 'null', description: 'No avatar. The fallback renders.' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      // ───────────────────────────────────────────────────────────────────────────────────
      // **This is why T083 depended on US5.** The visibility rule had to exist before avatar
      // bytes could be served to anybody but their owner: shipping the serving half first would
      // have made every photograph readable by anyone who could guess an identifier, for
      // however long it took the rule to arrive.
      //
      // `readVisibleAvatarKey` delegates to `readCoAttendeeProfile`, so the two cannot drift —
      // a change to the visibility rule reaches both by construction.
      // ───────────────────────────────────────────────────────────────────────────────────
      const key = await readVisibleAvatarKey(eventScopeOf(request), request.params.attendeeId)

      // Indistinguishable from "not visible to you": a 404 for the profile and a 204 for the
      // avatar would let a requester tell a hidden attendee from one with no photograph.
      if (!key) {
        const visible = await readCoAttendeeProfile(
          eventScopeOf(request),
          request.params.attendeeId,
        )
        if (!visible) throw notFound()
        return reply.status(204).send()
      }

      const stored = await app.storage.get(key)
      if (!stored) return reply.status(204).send()

      return { contentType: stored.contentType, base64: stored.bytes.toString('base64') }
    },
  )
}
