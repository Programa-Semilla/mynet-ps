import type { FastifyInstance, FastifyRequest } from 'fastify'

import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../auth/throttle.js'
import { loadConfig } from '../config.js'
import { blockAttendee } from '../db/queries/blocks.js'
import { writeReport } from '../db/queries/reports.js'
import { notAuthenticated, notFound, tooManyAttempts } from '../errors.js'
import { dispatchMail } from '../mail/dispatch.js'

/**
 * T081 (007) — reporting conduct **out of** the product (FR-543–FR-549).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE ROUTE, AND THE MISSING ONE IS A REQUIREMENT.**
 *
 * There is no `GET /reports`, no `GET /reports/{id}`, and no administrative surface of any kind
 * — not because nobody has needed one yet, but because FR-548 forbids any interface, role or
 * route by which a report can be read from within this product. A report-reading screen needs a
 * moderator, and a moderator is an organizer: the actor Principle III excludes by construction.
 *
 * A reviewer looking for the missing half of this feature should find nothing, and **finding
 * nothing is the pass condition** (SC-508). `tests/unit/no-report-read-surface.test.ts` fails the
 * build if one ever appears.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THREE THINGS HAPPEN, IN THIS ORDER, AND THE ORDER IS THE REQUIREMENT** (contract):
 *
 *   1. **The reported attendee is blocked** (FR-544). The attendee's protection lands first, so
 *      a failure anywhere below still leaves them protected.
 *   2. **The report row is written.**
 *   3. **Operator mail is dispatched** (FR-547) — and **its failure does not fail the request**
 *      (FR-549). Safety must not depend on an external service succeeding, and an unprovisioned
 *      provider is the expected state rather than an exceptional one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
/**
 * T071 (009) — **the throttle 007 did not have** (FR-746, research R8).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Keyed on the reporter's own authenticated identity, so a refusal can only ever inconvenience
 * the person reporting. What it bounds is the one thing this route does that no other does:
 * **it sends mail out of the product**, to the single address a human is supposed to read. An
 * unthrottled report route is an unthrottled mail relay pointed at the product's only safety
 * channel.
 *
 * Every request counts, not only refused ones — a *successful* fiftieth report is precisely the
 * thing being bounded, and a counter that reset on success would not bound it at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const throttleReport = async (request: FastifyRequest): Promise<void> => {
  const attendee = request.attendee
  if (!attendee) throw notAuthenticated()

  const key = {
    identifierHash: hashAttemptValue(attendee.id),
    sourceHash: hashAttemptValue(request.ip),
    action: 'report_submit' as const,
  }

  // 010 T017 — recorded before it is judged (FR-804); excluded from its own count (FR-805).
  // FR-863: this action still MAY deny, and `throttle-thresholds.test.ts` asserts it.
  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))

  if (outstanding > 0) throw tooManyAttempts(outstanding, 'reports')
}

export const reportRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post<{
    Body: { attendeeId: string; reason: string; messageIds?: string[]; questionIds?: string[] }
  }>(
    '/reports',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['safety'],
        summary: 'Report an attendee, which also blocks them',
        description:
          "Blocks the reported attendee, writes the report, and dispatches operator mail — in that order, because the attendee's protection lands first (FR-544). **The response says nothing about what happens next**: there is no case identifier to quote and no status to poll, because there is no route that would answer either, and inventing one would promise the review surface FR-548 forbids building. The operator mail carries identifiers and a timestamp only — never the message text and never the reason string (research R11).",
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['attendeeId', 'reason'],
          additionalProperties: false,
          properties: {
            attendeeId: { type: 'string', maxLength: 64 },
            reason: {
              type: 'string',
              minLength: 1,
              maxLength: 2_000,
              description:
                "In the reporter's own words. The dialog disables its confirmation while this is blank (FR-546), so a 400 here means the form was bypassed. It is stored and swept after 90 days, and it never leaves the database.",
            },
            messageIds: {
              type: 'array',
              maxItems: 100,
              items: { type: 'string', maxLength: 64 },
              description:
                'The reported messages, if any. Stored as an array with no foreign key, so it degrades honestly into a list of things that no longer exist once M3 removes them.',
            },
            questionIds: {
              type: 'array',
              maxItems: 100,
              items: { type: 'string', maxLength: 64 },
              description:
                '009 (FR-783) — the reported audience questions, if any. Mirrors `messageIds` exactly, **including having no foreign key**: a reported question will frequently be gone before anyone looks, because its author can withdraw it themselves while it has no votes (FR-712) — a route no message has. Reporting from a question is what makes conduct on this feature reportable **without opening a conversation first** (FR-781).',
            },
          },
        },
        response: {
          204: { type: 'null' },
          400: {
            description: 'Empty reason, or reporting yourself.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description: 'No such attendee.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              "009 (FR-746) — throttled on `report_submit`, keyed on the reporter's own authenticated identity so a refusal can only inconvenience the person reporting. **This closes a gap 007 left**: reporting is the only action in this product that sends mail out of it, so an unthrottled route is an unthrottled relay pointed at the single address a human is supposed to read. Deliberately generous enough that somebody reporting two or three accounts in quick succession is never refused.",
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
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      // Ordered before anything is read from the body, so a flood costs the attacker the delay
      // rather than the server the work.
      await throttleReport(request)

      const { attendeeId, reason, messageIds = [], questionIds = [] } = request.body

      if (reason.trim().length === 0) {
        return reply
          .code(400)
          .send({ code: 'validation_failed', message: 'A report needs a reason.' })
      }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Step 1 — the block, first.** FR-544 makes reporting *include* blocking rather than
      // suggesting it afterwards: somebody reporting conduct wants it to stop now, and a report
      // that only files paperwork leaves them reachable by the person they just reported.
      //
      // It also doubles as the existence check, so a report against a nonexistent attendee is
      // refused before anything is written.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const blocked = await blockAttendee(attendee.id, attendeeId)
      // A report against somebody the reporter cannot reach writes nothing and says nothing —
      // same reasoning as the block route: the answer must not double as an existence check.
      if (blocked === 'unreachable') return reply.code(204).send()
      if (blocked === 'self') {
        return reply
          .code(400)
          .send({ code: 'validation_failed', message: 'You cannot report yourself.' })
      }

      // Step 2 — the record. It exists so a report is not lost between being written and being
      // dispatched; the durable artifact is the mail (research R3).
      const written = await writeReport({
        reporterId: attendee.id,
        reportedId: attendeeId,
        reason,
        messageIds,
        // 009 (FR-783) — alongside the messages, in the same foreign-key-free shape.
        questionIds,
      })
      if (!written) throw notFound()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Step 3 — the mail, and its failure is isolated exactly as verification mail's is**
      // (FR-549). `dispatchMail` bounds it with a timeout, because a `try/catch` handles a
      // rejection and does nothing for a *hang* — which is the common failure mode of an HTTP
      // mail API, and which would hold this response open past the client's own abort.
      //
      // **The operator address is configuration, and its absence is the expected state**
      // (register entry 18, spec open question 3). With none configured the report is still
      // blocked and still written; only the notification is skipped, and it is logged as
      // skipped rather than silently dropped.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const operator = loadConfig().mail.operatorAddress

      if (!operator) {
        request.log.warn(
          { reportId: written.reportId },
          'abuse report written but not dispatched: no operator address is configured ' +
            '(MAIL_OPERATOR_ADDRESS, register entry 18)',
        )
      } else {
        await dispatchMail(
          () =>
            app.mail.sendAbuseReport(operator, {
              reportId: written.reportId,
              reportedAt: written.reportedAt,
              // ─────────────────────────────────────────────────────────────────────────
              // **Identifiers only, and BOTH kinds of them** (FR-783, FR-784).
              //
              // The reason string, the message bodies and the question *text* are deliberately
              // absent from this call's signature, so none of them can reach a provider by
              // accident. A question is published to a whole conference, which makes it feel
              // quotable — and quoting it here would move an attendee's words into an inbox
              // nobody in this project controls.
              //
              // The question **identifiers** are a different thing and they must be here. This
              // mail is the only artifact a human can act on: no route reads a report back
              // (FR-548), and the row is swept after 90 days. Sending the identifiers of the
              // messages but not of the questions left a Q&A report saying "somebody reported
              // this person" on a surface where that person may have asked twenty questions —
              // which is the exact uselessness FR-783 exists to prevent.
              // ─────────────────────────────────────────────────────────────────────────
              messageIds,
              questionIds,
            }),
          request.log,
          'abuse report mail failed to send',
        )
      }

      // 204, with nothing to say about what happens next. See the route description.
      return reply.code(204).send()
    },
  )
}
