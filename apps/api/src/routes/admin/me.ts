import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { operatorScopeOf, requireOperator } from '../../admin/require-operator.js'
import { getDb } from '../../db/client.js'
import { attendees } from '../../db/schema/attendees.js'
import { operators } from '../../db/schema/operators.js'
import { notFound } from '../../errors.js'

/**
 * T063 (011) — `GET /admin/me`: who is signed in, and at which tier (FR-900, FR-924).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TIER IS RETURNED HERE AND NOWHERE ELSE, AND THAT IS DELIBERATE.**
 *
 * Sign-in answers 204 with no body: "did these credentials work" and "what may I do" are
 * different questions, and answering the second before a session exists would let an unsuccessful
 * caller learn something.
 *
 * FR-924 requires the administrative shell to show which tier the operator holds, at all times —
 * because an organizer and a platform operator see different surfaces, and somebody who cannot
 * tell which one they are cannot tell whether a missing control is a permission or a bug.
 *
 * **This is presentation, not authorisation.** Every route enforces its own tier server-side
 * through `requirePlatformOperator` (FR-980), so a client that lied to itself about this value
 * would render controls that refuse. `tier-controls.test.tsx` asserts the rendering half and
 * `admin-tier-boundary.test.ts` asserts the server half by **direct address entry**, which is the
 * only way to prove the two are independent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const adminMeRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/admin/me',
    {
      preHandler: [requireOperator],
      schema: {
        tags: ['admin'],
        summary: 'The signed-in administrative principal and their tier',
        response: {
          200: {
            type: 'object',
            required: ['displayName', 'tier'],
            properties: {
              displayName: { type: 'string' },
              tier: { type: 'string', enum: ['platform', 'organizer'] },
              /**
               * FR-992 — true while the bootstrapped credential has not been replaced.
               *
               * Present so the client can route straight to the replacement screen rather than
               * discovering the state by receiving a 403 from wherever it tried to go first.
               * The server refuses either way; this makes the refusal something the interface
               * never has to show.
               */
              credentialIsInitial: { type: 'boolean' },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      const scope = operatorScopeOf(request)

      if (scope.operatorId !== null) {
        const rows = await getDb()
          .select({
            displayName: operators.displayName,
            credentialIsInitial: operators.credentialIsInitial,
          })
          .from(operators)
          .where(eq(operators.id, scope.operatorId))
          .limit(1)

        const operator = rows[0]
        if (!operator) throw notFound()

        return {
          displayName: operator.displayName,
          tier: 'platform' as const,
          credentialIsInitial: operator.credentialIsInitial,
        }
      }

      // An organizer. Their display name is their **attendee** display name — there is no
      // separate administrative profile, and FR-973 forbids any tier from reading or writing a
      // profile. Reading one's own name is not that: the caller is the subject.
      const rows = await getDb()
        .select({ displayName: attendees.displayName })
        .from(attendees)
        .where(eq(attendees.id, scope.attendeeId as string))
        .limit(1)

      const attendee = rows[0]
      if (!attendee) throw notFound()

      return {
        displayName: attendee.displayName,
        tier: 'organizer' as const,
        // Never true for an organizer: they sign in with a password they chose (FR-914), so
        // there is no initial credential to force the replacement of.
        credentialIsInitial: false,
      }
    },
  )
}
