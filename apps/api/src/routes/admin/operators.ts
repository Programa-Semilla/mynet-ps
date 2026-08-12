import type { FastifyInstance } from 'fastify'

import { platformScopeOf, requirePlatformOperator } from '../../admin/require-operator.js'
import { appendAuditEntry } from '../../db/queries/admin-audit.js'
import { deactivateOperator } from '../../db/queries/operators.js'
import { getDb } from '../../db/client.js'
import { notFound } from '../../errors.js'

/**
 * T140, T141 (011) — `POST /admin/operators/:operatorId/deactivation` (FR-908, FR-909).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DEACTIVATION, NOT DELETION — AND THE ROUTE IS NAMED FOR WHAT IT DOES.**
 *
 * `POST …/deactivation` rather than `DELETE /admin/operators/:id`, because the second would be a
 * lie about the outcome. An operator's row **survives**, and has to: FR-909 requires the identity
 * to keep resolving on records that name it — an audit entry, a report resolution — long after
 * the person has stopped working here. A resolution attributed to nobody is an accountability
 * record with the accountability removed.
 *
 * There is **no operator deletion route at all**, and that is not an omission. Principle VIII's
 * erasure right is an *attendee's*, and an operator is not one (FR-901): they have no `attendees`
 * row, no profile, and no self-service surface anywhere in this product. The only thing that ever
 * removes a row here is the retention sweep, once the operator is long deactivated **and**
 * referenced by nothing (`db/queries/operators.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The last-operator edge case is deliberately unguarded**, per the spec's Assumptions: nothing
 * here stops a platform operator deactivating the last remaining one, including themselves.
 *
 * A guard would have to answer "who is allowed to be last", which is a governance question
 * nobody has decided — and the failure it would prevent is recoverable by re-seeding, which
 * `deploy/vm/README.md` documents. A guard that refuses an action in an undecided case is a
 * decision taken by inference, which is the thing register entries exist to prevent.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const adminOperatorRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/admin/operators/:operatorId/deactivation',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'End a platform operator’s access permanently',
        description:
          'Immediate: `requireOperator` re-reads the operator row on every request, so live sessions stop working at once rather than at next sign-in. The row survives, because the identity must keep resolving on records that name it (FR-909). There is deliberately no deletion route — an operator is not an attendee and has no erasure right here (FR-901).',
        params: {
          type: 'object',
          required: ['operatorId'],
          properties: { operatorId: { type: 'string', format: 'uuid' } },
        },
        response: {
          204: { type: 'null' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description:
              'No such operator, or already deactivated — one answer for both, so the route reports nothing about who exists.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const scope = platformScopeOf(request)
      const { operatorId } = request.params as { operatorId: string }

      const deactivated = await getDb().transaction(async (tx) => {
        const ended = await deactivateOperator(scope, operatorId, tx)
        if (!ended) return false

        // ───────────────────────────────────────────────────────────────────────────────────
        // Names the operator as the **resource**, not as `subject_attendee_id` — an operator has
        // no attendee row, and putting an operator id in a column that erasure clears would make
        // the pseudonymisation rule ambiguous about what kind of identifier it holds.
        // ───────────────────────────────────────────────────────────────────────────────────
        await appendAuditEntry(
          {
            operatorId: scope.operatorId,
            action: 'deactivate_operator',
            subjectResourceId: operatorId,
            subjectKind: 'operator',
          },
          tx,
        )

        return true
      })

      // Already deactivated, or no such operator. Idempotent in effect but refused rather than
      // silently succeeding, because "it was already done" and "there is nobody by that name"
      // are both facts the caller should reconcile against their own list.
      if (!deactivated) throw notFound()

      return reply.status(204).send()
    },
  )
}
