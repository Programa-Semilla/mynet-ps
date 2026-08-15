import type { FastifyInstance } from 'fastify'

import {
  conferenceAuthorityOf,
  requireConferenceAuthority,
} from '../../admin/require-conference-authority.js'
import { requireOperator } from '../../admin/require-operator.js'
import { listEnrolmentRoster } from '../../db/queries/admin-enrolments.js'
import { notFound } from '../../errors.js'

/**
 * T144 (014 tranche 2) — the roster route (FR-1073, FR-1073a, v5.3.0 O1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **ITS OWN MODULE, DELIBERATELY** (R16): `routes/admin/catalog.ts` is scanned for reply
 * identifiers shaped like recipient lists, and a roster handler there would trip that scan on
 * correct code — the exemption would then have to weaken the file whose absence guarantees
 * matter most. Here the disclosure guard audits this route BY NAME instead: the widened noun
 * regex catches `enrolments`, and `ENROLMENT_DISCLOSURE` exempts exactly this `METHOD url`
 * label with O1's reason, so every other administrative read of attendee state still fails.
 *
 * The path names `:eventId` because `requireConferenceAuthority` demands it — a roster is a
 * read over one conference's session, addressed as one. The refusal for an unassigned
 * organizer is the same 404 a nonexistent conference produces, byte for byte.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const adminEnrolmentRoutes = async (app: FastifyInstance): Promise<void> => {
  const refusal = {
    type: 'object',
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  } as const

  app.get(
    '/admin/conferences/:eventId/sessions/:id/enrolments',
    {
      preHandler: [requireOperator, requireConferenceAuthority],
      schema: {
        tags: ['admin'],
        summary: 'The names of the attendees holding places in one optional session',
        description:
          '**The fourth recorded Principle VIII exception** (constitution v5.3.0, O1), and the ' +
          'first administrative read of attendee state this project has ever permitted. Four ' +
          'bounds, each structural: only enrolment (no saved sessions, notes, questions or ' +
          'votes at any tier — FR-1042 survives unnarrowed for all four); only an assigned ' +
          'organizer, or a platform operator by the authority they already hold; only this ' +
          'conference’s sessions; and names only — no identifier, no email, no route into a ' +
          'profile. The attendee was told before they enrolled (FR-1074). An empty roster is ' +
          '200 with an empty list — “nobody yet” is a state, not a failure.',
        params: {
          type: 'object',
          required: ['eventId', 'id'],
          properties: {
            eventId: { type: 'string', format: 'uuid' },
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['attendees'],
            additionalProperties: false,
            properties: {
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['displayName'],
                  additionalProperties: false,
                  properties: { displayName: { type: 'string' } },
                },
              },
            },
          },
          401: refusal,
          404: refusal,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string }
      const roster = await listEnrolmentRoster(conferenceAuthorityOf(request), id)
      if (roster === null) throw notFound()
      return { attendees: roster }
    },
  )
}
