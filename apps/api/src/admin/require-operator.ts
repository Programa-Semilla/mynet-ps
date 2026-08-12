import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { getDb } from '../db/client.js'
import { organizerAssignments } from '../db/schema/organizer-assignments.js'
import { operators } from '../db/schema/operators.js'
import { AppError, credentialNotReplaced, notFound } from '../errors.js'
import { ADMIN_SESSION_COOKIE } from './cookie.js'
import {
  mintOperatorScope,
  mintPlatformScope,
  type OperatorScope,
  type PlatformScope,
} from './scope.js'
import { refreshAdminSessionCookie, resolveAdminSession } from './session.js'

/**
 * T030, T031 (013) — **the administrative principal, and the tier boundary** (FR-905, FR-906,
 * FR-907, FR-917, FR-992).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE ONLY PLACE PERMITTED TO CALL `mintOperatorScope` OR `mintPlatformScope`.**
 *
 * `scope.ts` explains why the classes live there and the guards live here, and what replaces the
 * module-private constructor the other three branded scopes enjoy: a sole-importer assertion in
 * `tests/unit/admin-scope-brand.test.ts`.
 *
 * Read `plugins/event-access.ts` for the argument behind branded scopes generally. What follows
 * records only what is different.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY REFUSAL FROM THIS MODULE IS A 401 OR A 404, AND NEVER A 403 THAT EXPLAINS ITSELF —
 * WITH EXACTLY ONE DELIBERATE EXCEPTION.**
 *
 *   - **No session, expired session, unknown token** → `401`, no detail (FR-917). An
 *     unauthenticated caller learns nothing about what exists at any administrative address.
 *   - **A conference organizer on a platform-tier route** → `404`, identical to a route that
 *     does not exist. A `403` would confirm both that the surface exists and that they are not
 *     on it, which tells somebody exactly what to go looking for.
 *   - **An unreplaced initial credential** → `403` **with an explanation**, and this is the
 *     exception. It passes the test every explained refusal in this product must pass: *the
 *     follow-up question is about the reader.* They can fix it, in one step, and the route that
 *     fixes it is the one route this state may reach. Produced by `credentialNotReplaced` in
 *     `errors.ts`, beside every other refusal shape in this product.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The routes reachable while `credential_is_initial` is true (FR-992).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **SIGNING OUT IS ONE OF THEM, AND LEAVING IT OUT MADE THE FORCED-REPLACEMENT SCREEN A TRAP.**
 *
 * This was the replacement route alone, so `DELETE /admin/session` — which carries this very
 * guard — answered `credential_not_replaced` for exactly the operators who are forced onto that
 * screen. The "Sign out instead" control therefore never reached `revokeAdminSession`: the
 * session row stayed live and the cookie stayed set, while the client (which clears its own
 * state in a `finally`) showed the sign-in form. Reloading returned straight to the replacement
 * screen, still authenticated, for the rest of the idle window.
 *
 * It is safe to admit because **ending a session discloses nothing and grants no capability** —
 * the reasoning FR-992 rests on is that an initial credential must not reach a surface that
 * *acts*, and sign-out is the one request that only ever takes access away. Every other
 * administrative address stays refused.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const CREDENTIAL_ROUTE = '/admin/session/credential'
const SIGN_OUT_ROUTE = '/admin/session'

const reachableWithInitialCredential = (request: FastifyRequest): boolean => {
  const url = request.routeOptions.url
  if (url === CREDENTIAL_ROUTE) return true
  // Matched on method as well: `POST /admin/session` is sign-IN and is unauthenticated, so it
  // never reaches this guard, but pinning the method keeps the exemption to the one verb that
  // ends a session rather than to the address.
  return url === SIGN_OUT_ROUTE && request.method === 'DELETE'
}

/**
 * Establishes **which administrative principal is calling**, of either tier (FR-905).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TIER IS DERIVED FROM WHAT THE SESSION NAMES, NOT FROM A COLUMN ON THE SESSION.**
 *
 * `operator_sessions` carries exactly one of `operator_id` / `attendee_id` — a check constraint
 * makes the third state impossible — so the tier is a *fact about which column is populated*
 * rather than a value somebody wrote down. There is no `tier` column that could disagree with
 * the identity beside it, which is the same reasoning 009 records for vote counts and 008 for
 * `lapsed`: a denormalised copy of something the rows already answer is a second source of
 * truth, and the one that drifts is the one that gets read.
 *
 * **An organizer's authority is re-checked on every request**, not captured at sign-in. Decision
 * 39 requires authority not to outlive the access it depends on, and a promotion revoked while
 * somebody is signed in must take effect immediately rather than at their next sign-in. That is
 * why this reads `organizer_assignments` here rather than trusting the session row.
 *
 * **Neither verification state nor discoverability is consulted** (FR-907), and
 * `tests/unit/admin-tier-signals.test.ts` asserts that over this file's source. Verification
 * gates exactly one thing in this product — discoverability — and a second consumer of it is a
 * governance change rather than a refactor. An operator's authority must not be undone by a mail
 * server, nor by an unrelated privacy preference.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const requireOperator = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  request.operatorScope = await resolveScope(request, reply)
}

/**
 * Establishes that the caller is a **platform operator** (FR-906, decision 35).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **A conference organizer is refused with 404, and the 404 is produced by the same factory
 * every other refusal here uses.**
 *
 * That indistinguishability is by construction rather than by two careful call sites: there is
 * one `notFound()` and every path reaches it. A reader of this function can see that an
 * organizer, an expired session and a route that does not exist are the same answer.
 *
 * The 404 matters most for the report queue. Decision 38 grants the platform tier a read of
 * reported content as the **third recorded Principle VIII exception**, and conditions it first
 * on tier: a conference organizer may not read reports *at all*. A 403 here would tell an
 * organizer that a queue exists and that there is something in it they are not allowed to see.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const requirePlatformOperator = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const scope = await resolveScope(request, reply)

  // Not `scope.tier !== 'platform'` on the scope alone: `operatorId` is what the platform brand
  // needs and the two cannot disagree, because `resolveScope` sets them together.
  if (scope.tier !== 'platform' || scope.operatorId === null) throw notFound()

  const platform = mintPlatformScope(scope.operatorId)
  request.operatorScope = platform
  request.platformScope = platform
}

/**
 * The single resolution path, shared by both guards.
 *
 * Sharing it is what makes the refusal shapes consistent — and it is why the tier check lives in
 * `requirePlatformOperator` rather than here: this function's job is *who is calling*, and
 * *whether they may* is the caller's question.
 */
const resolveScope = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<OperatorScope> => {
  const token = request.cookies[ADMIN_SESSION_COOKIE]
  // 401 rather than 404 for a missing session: the caller has not told us who they are, and
  // there is nothing about existence to protect yet (FR-917).
  if (!token) throw notAuthenticatedAdmin()

  const session = await resolveAdminSession(token)
  // Expired, revoked, or unknown — one answer for all three. A caller must not be able to tell
  // "your session ran out" from "that token was never valid".
  if (!session) throw notAuthenticatedAdmin()

  // The database's idle window has just been advanced by `resolveAdminSession`; the browser's
  // copy has to move with it or the session dies at the cookie's original expiry regardless.
  // Issued here rather than per route so no administrative route can forget it.
  refreshAdminSessionCookie(reply, token, session.absoluteExpiresAt)

  // Recorded so `DELETE /admin/session` revokes **exactly this device** rather than every
  // administrative session the principal holds. The attendee product makes the same distinction:
  // `revokeAllSessions` exists separately and is used for password reset and account deletion,
  // where ending every session is the point.
  request.adminSessionId = session.id

  if (session.operatorId !== null) {
    const rows = await getDb()
      .select({ id: operators.id, credentialIsInitial: operators.credentialIsInitial })
      .from(operators)
      .where(and(eq(operators.id, session.operatorId), isNull(operators.deactivatedAt)))
      .limit(1)

    const operator = rows[0]
    // Deactivation ends access **immediately**, not at next sign-in (FR-908). Re-reading the row
    // on every request is what delivers that, and is why `deactivateOperator` performs no
    // session revocation: a revocation loop can miss a row and a guard cannot.
    if (!operator) throw notAuthenticatedAdmin()

    // FR-992 — the one state that reaches almost nothing. Checked here rather than per route so
    // a new administrative route cannot forget it.
    if (operator.credentialIsInitial && !reachableWithInitialCredential(request)) {
      throw credentialNotReplaced()
    }

    return mintOperatorScope(operator.id, null, 'platform')
  }

  // An organizer. `attendee_id` is non-null by the check constraint, so this is the other half.
  const attendeeId = session.attendeeId
  if (attendeeId === null) throw notAuthenticatedAdmin()

  const live = await getDb()
    .select({ id: organizerAssignments.id })
    .from(organizerAssignments)
    .where(
      and(eq(organizerAssignments.attendeeId, attendeeId), isNull(organizerAssignments.revokedAt)),
    )
    .limit(1)

  // Demoted from every conference while signed in: the session is live and the authority is
  // gone, so administrative access ends here (decision 39). Refused as unauthenticated rather
  // than as forbidden — from the administrative product's point of view they are nobody.
  if (live.length === 0) throw notAuthenticatedAdmin()

  return mintOperatorScope(null, attendeeId, 'organizer')
}

/**
 * The unauthenticated refusal, produced from one factory so no two paths can drift (FR-917).
 *
 * Deliberately does **not** reuse `notAuthenticated()` from `errors.ts`: that one says "Sign in
 * to continue" and is worded for an attendee who knows what MyNet is. This one says as little as
 * possible, because the caller may be somebody who guessed an address.
 */
const notAuthenticatedAdmin = (): AppError =>
  new AppError('not_authenticated', 401, 'Sign in to continue.')

const requireOperatorPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('requireOperator', requireOperator)
  app.decorate('requirePlatformOperator', requirePlatformOperator)
}

export default fp(requireOperatorPlugin, { name: 'require-operator' })

/**
 * Reads the verified scope, or refuses.
 *
 * Handlers call these rather than reaching for `request.operatorScope`, so "the preHandler
 * definitely ran" is asserted in one place instead of being a non-null assertion in every
 * handler — `plugins/participation.ts`'s reasoning, unchanged.
 */
export const operatorScopeOf = (request: FastifyRequest): OperatorScope => {
  const scope = request.operatorScope
  if (!scope) throw notFound()
  return scope
}

export const platformScopeOf = (request: FastifyRequest): PlatformScope => {
  const scope = request.platformScope
  if (!scope) throw notFound()
  return scope
}
