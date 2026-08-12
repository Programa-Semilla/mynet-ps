import type { FastifyInstance } from 'fastify'

import { platformScopeOf, requirePlatformOperator } from '../../admin/require-operator.js'
import { appendAuditEntry } from '../../db/queries/admin-audit.js'
import { findReport, listReports, resolveReport } from '../../db/queries/admin-reports.js'
import { getDb } from '../../db/client.js'
import { notFound, reportAlreadyResolved } from '../../errors.js'

/**
 * T086–T090 (011) — the abuse-report queue (FR-940–FR-947, decision 38).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FEATURE THAT MAKES AN EXISTING PROMISE TRUE, AND IT IS WHY MODERATION SHIPS IN
 * THE FOUNDATION FEATURE RATHER THAN AFTER IT.**
 *
 * Since 007 shipped, the reporting dialog has told attendees that a person will read their
 * report. Reports have been arriving from Messages and, since 009, from Q&A — and leaving the
 * product as mail to an address nobody has decided on (register entry 21, still open). This is
 * the first surface in the product's history where somebody can read one.
 *
 * Every route here is `requirePlatformOperator`. **A conference organizer may not read reports at
 * all** — decision 35's first condition, decision 38's first bound, and the reason
 * `operator-audit.test.ts` keeps a *positive* table of platform-tier routes rather than a
 * deny-list: a new route in this area must fail until somebody decides which tier it belongs to.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const refusal = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

const resolutionSchema = {
  type: 'object',
  nullable: true,
  properties: {
    outcome: { type: 'string', enum: ['actioned', 'dismissed'] },
    note: { type: 'string' },
    resolvedAt: { type: 'string' },
    resolvedBy: { type: 'string' },
  },
} as const

export const adminReportRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/admin/reports',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'The abuse-report queue',
        description:
          'Open and resolved reports, newest first. **Carries no reported content** — which is why reading this list writes no audit entry (FR-995). Both report origins appear here: `abuse_reports` is one cross-event table, because conduct is not a conference.',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'reporterName', 'reportedName', 'reportedAt', 'kind'],
              properties: {
                id: { type: 'string' },
                reporterName: { type: 'string' },
                reportedName: { type: 'string' },
                reportedAt: { type: 'string' },
                kind: { type: 'string', enum: ['messages', 'questions'] },
                resolution: resolutionSchema,
              },
            },
          },
          401: refusal,
          404: {
            description:
              'A conference organizer, refused indistinguishably from a route that does not exist (FR-906).',
            ...refusal,
          },
        },
      },
    },
    async (request) => listReports(platformScopeOf(request)),
  )

  app.get(
    '/admin/reports/:reportId',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'One report, with the reported content and the reporter’s stated reason',
        description:
          'The **third recorded exception to Principle VIII** (constitution v4.1.0, decision 38) and the only route in the product that carries one. Returns exactly what was reported and nothing adjacent — never the surrounding thread, the pair’s other conversations, or any third party (FR-942). `contentAvailable: false` is a first-class state, not an error: the reported rows are usually gone before anybody looks (FR-941). **Reading this writes an audit entry** (FR-995).',
        params: {
          type: 'object',
          required: ['reportId'],
          properties: { reportId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            required: ['id', 'reason', 'contentAvailable', 'content'],
            properties: {
              id: { type: 'string' },
              reporterName: { type: 'string' },
              reportedName: { type: 'string' },
              reportedAt: { type: 'string' },
              kind: { type: 'string', enum: ['messages', 'questions'] },
              reason: { type: 'string' },
              contentAvailable: { type: 'boolean' },
              content: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' }, body: { type: 'string' } },
                },
              },
              resolution: resolutionSchema,
            },
          },
          401: refusal,
          404: refusal,
        },
      },
    },
    async (request) => {
      const scope = platformScopeOf(request)
      const { reportId } = request.params as { reportId: string }

      const report = await findReport(scope, reportId)
      if (!report) throw notFound()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **THE ONLY READ IN THIS PRODUCT THAT WRITES AN AUDIT ENTRY** (FR-995).
      //
      // It writes one because it is the only read the constitution needed an exception to
      // permit. `GET /admin/reports` above writes nothing, because the list carries no content —
      // an operator scrolling a queue has disclosed nothing and an audit trail recording that
      // would be a record of scrolling rather than of disclosure.
      //
      // **Written after the report is found, and only on success.** An entry for a 404 would
      // record a disclosure that did not happen, and would make the trail a log of guessed
      // identifiers.
      //
      // The entry names the **reported attendee**, not the reporter: this records that an
      // operator saw content *about* somebody. The reporter's stated reason is disclosed too,
      // and deliberately does not create a second entry — one act, one record.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await appendAuditEntry({
        operatorId: scope.operatorId,
        action: 'disclose_report_content',
        subjectResourceId: report.id,
        subjectKind: 'report',
      })

      return report
    },
  )

  app.post(
    '/admin/reports/:reportId/resolution',
    {
      preHandler: [requirePlatformOperator],
      schema: {
        tags: ['admin'],
        summary: 'Record what was done about a report',
        description:
          'Two outcomes and deliberately no third — there is no `pending` or `escalated`, because a status meaning "somebody is still thinking about it" would be a workflow visible to the reporter through timing. A second resolution is refused with **409 and an explanation** (FR-945), produced by a unique constraint rather than a read-then-write check. **Discloses nothing to the reporter, the reported attendee, or any MyNet surface** (FR-946).',
        params: {
          type: 'object',
          required: ['reportId'],
          properties: { reportId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['outcome', 'note'],
          additionalProperties: false,
          properties: {
            outcome: { type: 'string', enum: ['actioned', 'dismissed'] },
            // Non-empty at the schema, at the route, and at the column. The column uses
            // `btrim` with the whitespace set spelled out, because PostgreSQL's one-argument
            // `trim()` strips spaces only — 009's defect, not repeated here.
            note: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
        response: {
          204: { type: 'null' },
          401: refusal,
          404: refusal,
          409: {
            description: 'Already resolved by another operator (FR-945).',
            ...refusal,
          },
        },
      },
    },
    async (request, reply) => {
      const scope = platformScopeOf(request)
      const { reportId } = request.params as { reportId: string }
      const { outcome, note } = request.body as {
        outcome: 'actioned' | 'dismissed'
        note: string
      }

      // JavaScript's Unicode-aware trim, matching the column's `btrim` character set. The two
      // layers agreeing is what 009 found they had not been doing.
      const trimmed = note.trim()
      if (trimmed.length === 0) throw notFound()

      // The resolution and its audit entry commit together or not at all (FR-994). A resolution
      // that lands unrecorded is an outcome nobody can attribute — and this is the one act in the
      // feature that closes a safety report, which is exactly where attribution matters most.
      const result = await getDb().transaction(async (tx) => {
        const outcomeOf = await resolveReport(scope, { reportId, outcome, note: trimmed }, tx)
        if (outcomeOf !== 'resolved') return outcomeOf

        await appendAuditEntry(
          {
            operatorId: scope.operatorId,
            action: 'resolve_report',
            subjectResourceId: reportId,
            subjectKind: 'report',
          },
          tx,
        )

        return outcomeOf
      })

      if (result === 'not_found') throw notFound()
      if (result === 'already_resolved') throw reportAlreadyResolved()

      // 204 with no body. **Nothing is dispatched** — no notification to the reporter, none to
      // the reported attendee, nothing on any MyNet surface (FR-946, FR-935). The trigger set
      // for notifications stays at a received message, and the source-level audit that enforces
      // that is not edited by this feature.
      return reply.status(204).send()
    },
  )
}
