import type { FastifyInstance } from 'fastify'

import { clearSessionCookie, revokeAllSessions } from '../auth/session.js'
import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../auth/throttle.js'
import { assembleExport, deleteAccount, withdrawFromConference } from '../db/queries/account.js'
import { notFound, tooManyAttempts } from '../errors.js'
import { eventScopeOf, type EventParams } from '../plugins/event-access.js'

/**
 * T097 (004) — personal-data export (FR-373–FR-379, research D11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ADDRESS CARRIES NO IDENTIFIER, AND THAT IS WHAT MAKES FR-375 AND FR-378 STRUCTURAL.**
 *
 * `GET /profile/export` means *the signed-in attendee's* export, because there is no other
 * export it could refer to. FR-378 requires the route to refuse a request naming another
 * identifier; the strongest form of that is a route with nowhere to put one, which is what this
 * is. FR-375's "no data belonging to any other attendee" then follows from the query being
 * keyed on `request.attendee.id` and on nothing else.
 *
 * **Generated synchronously, in one request** (research D11). At conference scale an
 * attendee's data is a profile, a handful of registrations, some saved sessions and notes, and
 * one image. An asynchronous job would add a store for the result, a delivery path and an
 * expiry policy — **a new personal-data surface created to avoid a query that takes
 * milliseconds**, holding every piece of personal data the product has about one person.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const accountRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/profile/export',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: 'Everything the product holds about the signed-in attendee',
        description:
          'One machine-readable document, with the avatar embedded as base64 rather than referenced by URL — so it stands alone rather than pointing into a system the attendee may be about to delete themselves from (research D11). Contains no credential, verification or reset material (FR-376, FR-391). Rate-limited (FR-379).',
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            /**
             * ─────────────────────────────────────────────────────────────────────────────
             * **Deliberately loose, and this is the one route where that is right.**
             *
             * Every other response in this API declares `additionalProperties: false`, because
             * a narrow schema is what stops a field leaking into a body by accident. Here the
             * requirement runs the other way: FR-377 makes **a field collected but absent from
             * the export a defect**, and a strict schema would silently *strip* any field a
             * later feature added — turning a structural guarantee into a serialiser's
             * omission, invisibly.
             *
             * The completeness guarantee is enforced by `tests/unit/export-coverage.test.ts`,
             * which derives the expected field set from the Drizzle schema, and by
             * `tests/integration/export.test.ts`, which asserts what must NOT appear. A schema
             * that could quietly drop a field would defeat the first of those.
             * ─────────────────────────────────────────────────────────────────────────────
             */
            type: 'object',
            additionalProperties: true,
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
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
      const attendeeId = request.attendee!.id

      // FR-379. The identifier is the attendee themselves, so a denial can only inconvenience
      // the person asking — which is what makes `mayDeny` safe here.
      const key = {
        identifierHash: hashAttemptValue(attendeeId),
        sourceHash: hashAttemptValue(request.ip),
        action: 'export' as const,
      }
      // 010 T017 — recorded BEFORE it is judged, so concurrent exports count each other
      // (FR-804), and excluded from its own count so the allowance is unchanged (FR-805).
      //
      // Never settled, and that is the policy `beginAttempt` used to carry as a name: an export
      // reads every table holding anything about one person and embeds the avatar, so the cost is
      // paid regardless of the outcome. Settling on success would reset the streak and make the
      // limit unreachable.
      const attemptId = await beginAttempt(key)
      const outstanding = await serveDelay(await failureDelayMs(key, attemptId))
      if (outstanding > 0) throw tooManyAttempts(outstanding, 'export requests')

      const exported = await assembleExport(attendeeId, app.storage)
      // Only reachable if the account was deleted between the session check and this read.
      if (!exported) throw notFound()

      // `content-disposition` so a browser offers to save it rather than rendering a wall of
      // JSON. Machine-readable is the requirement (FR-373); usable is what makes it worth
      // having.
      void reply.header('content-disposition', 'attachment; filename="mynet-personal-data.json"')

      return exported
    },
  )

  /**
   * T107 (004) — `DELETE /account` (FR-364–FR-369, research D10).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **HARD, CASCADING, IRREVERSIBLE, AND WITH NO INTERMEDIARY** (FR-364, FR-365, FR-368).
   *
   * There is no soft delete, no `deleted_at`, no anonymised shell, and no retained address —
   * *a record marked deleted is a record still held*. Deleting frees the address for
   * re-registration, which is a consequence rather than a feature: retaining it to prevent
   * reuse would be a tombstone by another name.
   *
   * **This is the route 005's cascade has been waiting for.** `saved_sessions` and
   * `session_notes` have declared `ON DELETE CASCADE` since 005 shipped, on a retention
   * commitment that has been *operationally unreachable* ever since — because no route could
   * delete an account. This is what finally gives it something to fire.
   *
   * There is deliberately **no undo, no grace period and no confirmation token**. The
   * confirmation is the client's (FR-367), and it must state that this cannot be undone,
   * because it cannot.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  app.delete(
    '/account',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: 'Delete the account and everything attributable to it',
        description:
          'HARD deletion with no tombstone (FR-365). Removes the avatar bytes first and then the attendee row, letting the cascade take the profile, interests, registrations, active-conference selection, saved sessions, notes, verification and reset material, and sign-in sessions. Every session on every device stops working immediately (FR-369). Irreversible by any surface in the product (FR-368).',
        security: [{ sessionCookie: [] }],
        response: {
          204: { type: 'null', description: 'Gone. The client is signed out.' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const attendeeId = request.attendee!.id

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Revoked **before** the delete rather than relying on the cascade alone (FR-369).
      //
      // The cascade removes these rows a moment later and would satisfy the requirement on its
      // own. Doing it first costs one statement and makes the ordering safe under failure: if
      // the delete were to fail after this point, the account still exists but every session is
      // already dead — which is recoverable by signing in, and is the right way round. The
      // reverse would leave live sessions for an account the attendee believes is gone.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await revokeAllSessions(attendeeId)

      const deleted = await deleteAccount(attendeeId, app.storage)
      // Only reachable if two deletes raced. The account is gone either way, which is what the
      // caller asked for.
      if (!deleted) request.log.warn({ attendeeId }, 'account already deleted')

      clearSessionCookie(reply)

      return reply.status(204).send()
    },
  )

  /**
   * T108 (004) — `DELETE /events/:eventId/registration` (FR-317c, FR-317d, research D7).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Leaving a conference is not leaving the product.** A registration that can be created by
   * entering a public code and never removed would be the one piece of attendee state with no
   * exit, which sits badly beside self-serve deletion.
   *
   * Carries `requireEventAccess`, so **you can only leave what you joined** — and the route
   * audit fails the build if the guard is ever dropped. The profile is untouched: it is
   * cross-event, and describes the person rather than their presence at one conference.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  app.delete<{ Params: EventParams }>(
    '/events/:eventId/registration',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['events'],
        summary: 'Withdraw from a conference, without deleting the account',
        description:
          "Removes the registration AND that conference's saved sessions and notes — which do NOT cascade from `registrations`, because they reference `sessions` (research D7). The active-conference selection goes with it through the composite foreign key 002 declared, so the attendee falls back to derivation and is left coherent (FR-317d). The profile is untouched: it is cross-event.",
        security: [{ sessionCookie: [] }],
        params: {
          type: 'object',
          required: ['eventId'],
          properties: { eventId: { type: 'string' } },
        },
        response: {
          204: { type: 'null', description: "Withdrawn. Idempotent from the attendee's side." },
          404: {
            description:
              'Not registered for that conference, or no such conference — indistinguishable (FR-148).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      await withdrawFromConference(eventScopeOf(request))
      return reply.status(204).send()
    },
  )
}
