import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import {
  operatorScopeOf,
  platformScopeOf,
  requireOperator,
  requirePlatformOperator,
} from '../../admin/require-operator.js'
import { appendAuditEntry } from '../../db/queries/admin-audit.js'
import {
  demoteOrganizer,
  listConferences,
  promoteToOrganizer,
} from '../../db/queries/admin-assignments.js'
import { normaliseEmail } from '../../db/queries/attendees.js'
import { getDb } from '../../db/client.js'
import { attendees } from '../../db/schema/attendees.js'
import { notFound } from '../../errors.js'

/**
 * T122–T124 (013) — conferences and the tier boundary (FR-926, FR-930–FR-936).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`POST /admin/conferences/:eventId/organizers` IS THE ONE PATH IN THIS PRODUCT WHERE TWO
 * ROUTE AUDITS DISAGREE, AND BOTH ARE RIGHT.**
 *
 * It **declares an event parameter**, so `event-scope-audit.test.ts` examines it and demands
 * `requireEventAccess`. It must not have one: the caller is a platform operator who is not
 * registered for that conference and would fail that guard entirely correctly — the guard is
 * about an *attendee's* registration, and a platform operator has no `attendees` row at all.
 *
 * So it carries an explicit entry in the event audit's allow-list with the reason written down
 * (T028), and `operator-audit.test.ts` separately asserts that **no administrative route carries
 * an attendee-shaped guard**. Without that second assertion, somebody satisfying the event audit
 * by adding `requireEventAccess` would produce a route that typechecks, passes three audits, and
 * can never be called by the only principal entitled to call it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const refusal = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

export const adminConferenceRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/admin/conferences',
    {
      // `requireOperator`, not `requirePlatformOperator` — **both tiers read this**, and the
      // query decides the population (FR-926). An organizer sees the conferences they are
      // assigned and no others.
      preHandler: [requireOperator],
      schema: {
        tags: ['admin'],
        summary: 'Conferences this principal may act on',
        description:
          'Every conference for a platform operator; only assigned ones for a conference organizer (FR-926). `unassigned` is **derived** from the absence of a live assignment and stored nowhere (FR-936) — a stored flag would need four write paths to keep it true, three of which belong to other features, and the one that drifted would be the one displayed.',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'organizers', 'unassigned'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                organizers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      attendeeId: { type: 'string' },
                      displayName: { type: 'string' },
                    },
                  },
                },
                unassigned: { type: 'boolean' },
              },
            },
          },
          401: refusal,
        },
      },
    },
    async (request) => {
      // The scope goes to the query whole. It used to be unpacked into a `{ tier, attendeeId }`
      // parameter here, which cost an `as string` on a genuinely nullable field and left the
      // query taking a shape anything could construct.
      return listConferences(operatorScopeOf(request))
    },
  )

  app.post(
    '/admin/conferences/:eventId/organizers',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'Promote a registered attendee to organizer of this conference',
        description:
          'The only way a conference organizer comes into being — **neither tier is reachable by self sign-up** (decision 32, FR-902). Requires the attendee to be registered for the conference (FR-930). Records the acting operator and the instant (FR-933). **Dispatches nothing** (FR-935): the trigger set stays at a received message. Note this route deliberately does NOT carry `requireEventAccess` despite naming an event — see the file header.',
        params: {
          type: 'object',
          required: ['eventId'],
          properties: { eventId: { type: 'string', format: 'uuid' } },
        },
        // ─────────────────────────────────────────────────────────────────────────────────
        // **Either identifier form, exactly one** (012 walk step A4). The UUID-only body made
        // promotion unusable in practice: no administrative surface can ever show an operator
        // a UUID — the admin product deliberately has no attendee directory (FR-973) — so the
        // identifier a real promotion request carries is the person's email address. Email
        // resolution is blind: an unknown address takes the same indistinguishable-404 path as
        // an unregistered attendee, so this widens no disclosure (the enumeration-oracle
        // reasoning in the handler is unchanged and covers it).
        // ─────────────────────────────────────────────────────────────────────────────────
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            attendeeId: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email', maxLength: 320 },
          },
          oneOf: [{ required: ['attendeeId'] }, { required: ['email'] }],
        },
        response: {
          204: { type: 'null' },
          401: refusal,
          404: {
            description:
              'The conference does not exist, the attendee is not registered for it, or the caller is a conference organizer — one indistinguishable answer, so this route is not an enumeration oracle for another attendee’s presence (008’s defect, not repeated).',
            ...refusal,
          },
          409: {
            description: 'That attendee already holds a live assignment for this conference.',
            ...refusal,
          },
        },
      },
    },
    async (request, reply) => {
      const scope = platformScopeOf(request)
      const { eventId } = request.params as { eventId: string }
      const body = request.body as { attendeeId?: string; email?: string }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The assignment and the entry that accounts for it commit together, or neither does**
      // (FR-994). An unrecorded promotion is an authority nobody can explain; a recorded one
      // that did not happen is an accusation. The HTTP outcome is decided outside, because a
      // `reply.send` inside a transaction callback ties the wire to the commit.
      //
      // **Email resolution happens INSIDE the same transaction** (012, walk A4) and its miss is
      // `not-registered` — deliberately the same outcome an unregistered attendee produces, so
      // the wire stays one indistinguishable 404 and an unknown address discloses exactly as
      // much as an unknown UUID always has: nothing.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const outcome = await getDb().transaction(async (tx) => {
        let attendeeId = body.attendeeId ?? null
        if (attendeeId === null) {
          const resolved = await tx
            .select({ id: attendees.id })
            .from(attendees)
            .where(eq(attendees.email, normaliseEmail(body.email ?? '')))
            .limit(1)
          if (resolved.length === 0) return 'not-registered' as const
          attendeeId = resolved[0]!.id
        }

        const result = await promoteToOrganizer(scope, { eventId, attendeeId }, tx)
        if (result !== 'promoted') return result

        await appendAuditEntry(
          {
            operatorId: scope.operatorId,
            action: 'promote',
            subjectAttendeeId: attendeeId,
            subjectResourceId: eventId,
            subjectKind: 'conference',
          },
          tx,
        )

        return result
      })

      // `not-registered` and `not-found` collapse to the same 404 on the wire. See
      // `promoteToOrganizer` for why: the caller controls the conference, so the attendee is the
      // only variable, and a distinguishable answer reports another attendee's presence.
      if (outcome === 'not-found' || outcome === 'not-registered') throw notFound()

      // A 409 here is safe where the 404 above is not: reaching it means the caller already
      // knows this attendee organizes this conference, because that is what the queue they are
      // looking at says. It describes their own duplicate action.
      if (outcome === 'already-assigned') {
        return reply
          .status(409)
          .send({ code: 'refused', message: 'That attendee already organizes this conference.' })
      }

      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/conferences/:eventId/organizers/:attendeeId',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'End an organizer’s authority over this conference',
        description:
          'Ends administrative access and **leaves the account untouched** (FR-934) — no profile field, no registration, nothing an attendee can observe in MyNet (FR-904). The row is revoked rather than deleted, because a revoked assignment is history and an audit entry explaining the promotion has to stay coherent against it. If this was the last organizer, the conference enters the derived `unassigned` state, which platform operators can see (decision 39).',
        params: {
          type: 'object',
          required: ['eventId', 'attendeeId'],
          properties: {
            eventId: { type: 'string', format: 'uuid' },
            attendeeId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: { type: 'null' },
          401: refusal,
          404: refusal,
        },
      },
    },
    async (request, reply) => {
      const scope = platformScopeOf(request)
      const { eventId, attendeeId } = request.params as { eventId: string; attendeeId: string }

      const demoted = await getDb().transaction(async (tx) => {
        const ended = await demoteOrganizer(scope, eventId, attendeeId, tx)
        if (!ended) return false

        await appendAuditEntry(
          {
            operatorId: scope.operatorId,
            action: 'demote',
            subjectAttendeeId: attendeeId,
            subjectResourceId: eventId,
            subjectKind: 'conference',
          },
          tx,
        )

        return true
      })

      // No live assignment: already demoted, never promoted, or a conference that does not
      // exist. One answer for all three.
      if (!demoted) throw notFound()

      return reply.status(204).send()
    },
  )
}
