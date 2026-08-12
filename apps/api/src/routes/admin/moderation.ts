import type { FastifyInstance } from 'fastify'

import { platformScopeOf, requirePlatformOperator } from '../../admin/require-operator.js'
import { appendAuditEntry } from '../../db/queries/admin-audit.js'
import { removeQuestion } from '../../db/queries/admin-moderation.js'
import { reportedQuestionIds } from '../../db/queries/admin-reports.js'
import { getDb } from '../../db/client.js'
import { notFound } from '../../errors.js'

/**
 * T106, T107 (011) — `DELETE /admin/questions/:questionId` (FR-950–FR-953).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE PRODUCT'S ONLY UNMODERATED MANY-TO-MANY SURFACE GETS A MODERATOR, AND THE ROUTE IS
 * DELIBERATELY REACHABLE ONLY FROM A REPORT.**
 *
 * 009 shipped audience Q&A recording, in its own artifacts, that a public question list *"needs a
 * moderator, and a moderator is an organizer — the actor Principle III excludes by
 * construction."* That sentence is one of the two obligations v4.0.0 cited when it reversed the
 * exclusion. This route is the answer to it.
 *
 * **`requiresReport` below is the bound that keeps this from becoming general moderation.** An
 * operator cannot browse questions and remove ones they dislike: they can act on what somebody
 * reported. That is not merely a client-side flow — it is checked here, because FR-980 puts
 * authorisation on the server and "the interface only offers it from a report" is not a control.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const adminModerationRoutes = async (app: FastifyInstance): Promise<void> => {
  app.delete(
    '/admin/questions/:questionId',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'Remove a reported audience question',
        description:
          'The only enforcement action in this feature. The question and **all** its votes go (FR-950, FR-951); no other question’s count moves. The author is not told who removed it or why (FR-952), and nothing is dispatched. Reachable only for a question named by the report given in `reportId` — an operator cannot browse and remove. A message report offers no removal at all (FR-953).',
        params: {
          type: 'object',
          required: ['questionId'],
          properties: { questionId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          required: ['reportId'],
          properties: { reportId: { type: 'string', format: 'uuid' } },
        },
        response: {
          204: { type: 'null' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description:
              'The question is gone, the report does not name it, or the caller is a conference organizer — one indistinguishable answer for all three.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const scope = platformScopeOf(request)
      const { questionId } = request.params as { questionId: string }
      const { reportId } = request.query as { reportId: string }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The report must actually name this question.** Without it, `reportId` would be
      // decoration and any question in the product could be removed by anybody holding a report
      // identifier — which every operator holds.
      //
      // Refused as 404, identical to a question that no longer exists. A distinguishable answer
      // would tell an operator that the question exists but is not covered by their report,
      // which is a fact about content they have not been shown.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const named = await reportedQuestionIds(scope, reportId)
      if (!named.includes(questionId)) throw notFound()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The audit entry names the QUESTION, not its author** (FR-994).
      //
      // `subject_attendee_id` is deliberately left unset here. The act being recorded is the
      // removal of a piece of content; recording whose content it was would put an attendee
      // identifier into the accountability record for every removal, and the trail would then
      // need pseudonymising on a great many more erasures for no gain in accountability.
      //
      // The reported attendee is already named on the report, which is where that question
      // belongs — and the disclosure entry written when the operator read it records that they
      // saw it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      // One transaction holds both the `FOR UPDATE` lock described in `removeQuestion` and the
      // audit entry, so the removal cannot commit unrecorded (FR-994).
      const outcome = await getDb().transaction(async (tx) => {
        const result = await removeQuestion(scope, questionId, tx)
        if (result === 'not-found') return result

        await appendAuditEntry(
          {
            operatorId: scope.operatorId,
            action: 'remove_question',
            subjectResourceId: questionId,
            subjectKind: 'question',
          },
          tx,
        )

        return result
      })

      // Already gone — withdrawn by its author, or removed by another operator. Indistinguishable
      // from never having existed, which is 009's rule for every question refusal.
      if (outcome === 'not-found') throw notFound()

      return reply.status(204).send()
    },
  )
}
