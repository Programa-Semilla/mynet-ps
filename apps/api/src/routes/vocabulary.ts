import type { FastifyInstance } from 'fastify'

import { readChoosableVocabulary } from '../db/queries/vocabulary.js'

/**
 * T172 (014 tranche 2) — `GET /vocabulary`, the choosable taxonomy (FR-1085, FR-1086, FR-1094a,
 * R18).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **ATTENDEE-AUTHENTICATED AND DELIBERATELY NOT EVENT-SCOPED.** The vocabulary is cross-event
 * reference data — a profile describes the person, not their presence at one conference
 * (FR-1085) — so nesting this under `/events/:eventId` would make the option list a function of
 * the conference, which FR-1096 forbids, and would demand an `EventScope` for data that names no
 * attendee. It carries no personal data, so `event-scope-audit` walking past a route that names
 * no conference — the gap 007, 008 and 013 each had to close — is **correct here rather than a
 * hole**: there is nothing behind this address that any scope could protect (R18).
 *
 * Only unretired values are offered (FR-1094a). An attendee's HELD values — retained free text
 * and retired choices alike — come from their own profile read, never from here: held and
 * choosable are different sets and FR-1095b is about their union at the write.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const vocabularyRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/vocabulary',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: 'The controlled vocabulary currently on offer: sectors, subsectors, interests',
        description:
          'Cross-event reference data, identical for every signed-in attendee — which is what ' +
          'makes offering the whole list not a disclosure: a closed vocabulary the product ' +
          'publishes is not population data (FR-1096). Retired values are absent; values the ' +
          'caller already holds come from their own profile read (FR-1095b). No value carries ' +
          'any figure about who holds it (FR-1099b).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            type: 'object',
            required: ['sectors', 'subsectors', 'interests'],
            additionalProperties: false,
            properties: {
              sectors: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'label'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    label: { type: 'string' },
                  },
                },
              },
              subsectors: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'sectorId', 'label'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    sectorId: {
                      type: 'string',
                      format: 'uuid',
                      description:
                        'The sector this refines (FR-1087). The editor filters the subsector ' +
                        'chooser by the selected sector; the server re-checks at the write.',
                    },
                    label: { type: 'string' },
                  },
                },
              },
              interests: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'label'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    label: { type: 'string' },
                  },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async () => readChoosableVocabulary(),
  )
}
