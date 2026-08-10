import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { getDb } from '../db/client.js'
import { conversationParticipants } from '../db/schema/conversations.js'
import { notAuthenticated, notFound } from '../errors.js'

/**
 * T014 (007) — the participation predicate, made impossible to forget (FR-523, FR-524,
 * research R9).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE ONLY PLACE IN THE CODEBASE THAT CAN CONSTRUCT A `ConversationScope`.**
 *
 * It is `plugins/event-access.ts` in a different predicate, deliberately, down to the shape of
 * its four mechanisms — and that file's header is the argument for all of this. Read it first;
 * this one records only what is *different*, because the differences are the reason a second
 * module exists at all rather than a widened first one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY EVENT SCOPE CANNOT COVER THESE ROUTES, AND WHY IT SILENTLY APPEARS TO.**
 *
 * Every per-attendee read in this product before 007 was reachable by exactly one identity and
 * guarded by `EventScope`. Conversations are not: they have **two** owners who are not
 * interchangeable, and FR-507 makes them cross-event, so there is no event identifier to scope
 * by and `requireEventAccess` has nothing to verify.
 *
 * The dangerous part is what that does to the *existing* audit. `tests/unit/
 * event-scope-audit.test.ts` matches routes by `:eventId` in the path or an event-naming
 * property in the schema. Conversation routes name no event — correctly — so **the audit walks
 * straight past them and reports success**. A future feature adding
 * `/conversations/:conversationId/anything` without a guard would fail no test and look
 * protected.
 *
 * That is why research R9 called this the most important structural finding in the feature, and
 * why `tests/unit/participation-audit.test.ts` exists as a second audit rather than as a
 * widening of the first. Two predicates, two audits, two failure messages that each name the
 * right thing.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T023 (008) — A CORRECTION. This paragraph used to end "008's appointments are the first
 * feature that will inherit this", and that prediction was wrong.**
 *
 * **Appointments are per-event.** Standing decision 7 puts them on the per-event side and
 * constitution v3.2.0 reinforces it, so 008 registers them beneath `/events/:eventId` where
 * `requireEventAccess` and the *existing* event audit already cover them. Nothing about them
 * needs this module.
 *
 * What did inherit the pattern is **cards**, which are cross-event and two-party — a held card
 * outlives the event it was shared at (FR-614) — so a card route names no conference and the
 * event audit walks past it exactly as described above. 008 therefore adds a **third** branded
 * scope in `plugins/card-access.ts` and a **third** audit in `tests/unit/card-audit.test.ts`.
 *
 * The one thing that is genuinely different there, and the reason it is a third module rather
 * than a widened second: **participation is symmetric and holding a card is directional.** Either
 * owner of a conversation may read it; a card is held by exactly one side.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Proof that the signed-in attendee participates in this conversation.
 *
 * **Nominal, not structural**, for exactly the reasons `VerifiedEventScope` records: a symbol
 * brand is copied by a spread, so `{ ...scope, conversationId: attackerSupplied }` would
 * type-check and pass lint while carrying an identifier nobody verified. A `#` private field is
 * absent from spreads and object literals, and the class is not exported, so `new` is
 * unavailable outside this module.
 *
 * That history is not re-derived here. It was paid for once in `event-access.ts` with compiling
 * probes, and the whole point of mirroring the shape is that it does not have to be paid for
 * again per predicate.
 */
class VerifiedConversationScope {
  /** The nominal marker. See `event-access.ts` for why this is not sufficient alone. */
  readonly #verified = true

  constructor(
    readonly attendeeId: string,
    readonly conversationId: string,
  ) {
    // `readonly` is erased at emit, so without this the own properties are writable and
    // `Object.assign(scope, { conversationId })` repoints a verified scope at someone else's
    // conversation with the brand intact.
    Object.freeze(this)
  }

  /** Referenced so the field is not elided as unused; never called. */
  get verified(): boolean {
    return this.#verified
  }
}

/**
 * The actual guarantee: a scope must have been *issued* by `requireParticipation`.
 *
 * The private field makes the type unforgeable; membership of this set makes the value
 * trustworthy. `event-access.ts` lists the five compiling probes that defeat the class alone —
 * `Object.assign` in both directions, `structuredClone`, `Object.create`, and reconstruction
 * through the prototype's own constructor. Every one of them applies here unchanged.
 */
const VERIFIED = new WeakSet<VerifiedConversationScope>()

/**
 * The type consumers see. The class is deliberately not exported.
 */
export type ConversationScope = VerifiedConversationScope

/**
 * Confirms this scope was issued by the guard rather than assembled by something that merely
 * satisfies its shape.
 *
 * Called at the **query layer**, not only at the route, because that is the boundary where data
 * is actually read — the same placement, and the same one-`WeakSet`-lookup cost, as
 * `assertVerifiedScope`.
 */
export const assertVerifiedParticipation = (scope: ConversationScope): ConversationScope => {
  if (!VERIFIED.has(scope)) {
    // Refused identically to a nonexistent conversation. A forged scope must not be
    // distinguishable from any other refusal.
    throw notFound()
  }
  return scope
}

/** Route params for any route carrying a conversation identifier. */
export interface ConversationParams {
  readonly conversationId: string
}

/**
 * Verifies participation and attaches the resulting `ConversationScope` (FR-523).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **404, NEVER 403 — and this is a stronger requirement here than it was for events** (FR-524).
 *
 * `requireEventAccess` returns 404 for "exists but not yours" so an attendee cannot enumerate
 * the product's conferences. The stake here is higher: a 403 would confirm that a *specific
 * conversation between two specific people* exists. Conversation identifiers appear in URLs,
 * get shared, and end up in logs and browser history, so "does conversation X exist" is a
 * question an outsider can ask repeatedly — and a distinguishable answer tells them who is
 * talking to whom, which is the metadata Messages exists to keep private.
 *
 * As with events, the indistinguishability is **by construction rather than by two careful call
 * sites**: there is one query against `conversation_participants`, and a conversation that
 * exists but is not the caller's produces no row exactly as a conversation that does not exist
 * produces no row. No code path could later make the two differ without adding a second query
 * that nobody makes.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const requireParticipation = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const attendee = request.attendee
  // Ordering matters: an unauthenticated caller must not be able to probe conversation
  // existence at all. `requireAttendee` runs first in every route's preHandler list; this is
  // the backstop if one were ever registered without it.
  if (!attendee) throw notAuthenticated()

  const { conversationId } = request.params as Partial<ConversationParams>

  // A malformed identifier is refused exactly like a well-formed one that is not the
  // caller's. Letting a 400 escape here would separate "not a uuid" from "not yours".
  if (!conversationId || !UUID.test(conversationId)) throw notFound()

  const rows = await getDb()
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.attendeeId, attendee.id),
        eq(conversationParticipants.conversationId, conversationId),
      ),
    )
    .limit(1)

  if (rows.length === 0) throw notFound()

  // The single construction site, and the single place membership is granted.
  const scope = new VerifiedConversationScope(attendee.id, conversationId)
  VERIFIED.add(scope)
  request.conversationScope = scope
}

/**
 * Matched rather than parsed, because Fastify's `format: uuid` validation would produce a 400
 * with a distinguishable body before this guard ever ran.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads the verified scope, or refuses.
 *
 * Handlers call this rather than reaching for `request.conversationScope`, so the "the
 * preHandler definitely ran" assumption is asserted in one place instead of being a non-null
 * assertion in every handler.
 */
export const conversationScopeOf = (request: FastifyRequest): ConversationScope => {
  const scope = request.conversationScope
  if (!scope) throw notFound()
  return scope
}

const participationPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('requireParticipation', requireParticipation)
}

export default fp(participationPlugin, { name: 'participation', dependencies: ['auth-context'] })
