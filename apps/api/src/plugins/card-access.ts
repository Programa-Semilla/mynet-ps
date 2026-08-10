import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { getDb } from '../db/client.js'
import { sharedCards } from '../db/schema/cards.js'
import { notAuthenticated, notFound } from '../errors.js'

/**
 * T016–T019 (008) — the held-card predicate, made impossible to forget (FR-616, FR-641,
 * FR-642, research R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE ONLY PLACE IN THE CODEBASE THAT CAN CONSTRUCT A `CardScope`.**
 *
 * It is `plugins/participation.ts` in a different predicate, which is itself
 * `plugins/event-access.ts` in a different predicate. Read `event-access.ts` first: it carries
 * the argument for all three, and neither of the later two re-derives it. This file records
 * only what is **different**, because the differences are the reason a third module exists at
 * all rather than a widened second one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T019 — WHY A THIRD MODULE, AND NOT A WIDER `participation.ts`.**
 *
 * "We already have two route guards" is the obvious objection, and there are two answers.
 *
 * The first was written down one level up and following it is cheaper than re-litigating it:
 * `participation.ts` records that widening `event-access.ts` was rejected because it would
 * *"conflate two different predicates in one test and make the failure message name the wrong
 * requirement"*. That argument applies again, unchanged, one level further out.
 *
 * The second is specific to cards and is the stronger one. **Participation is symmetric;
 * holding a card is directional.** Either owner of a conversation may read it, so
 * `requireParticipation` asks a question with no sides. A card is held by exactly one party:
 * `requireHeldCard` asks *"does the reader hold a card FROM this attendee"*, and never the
 * reverse. Generalising the two into one parameterised two-party relation scope would mean
 * carrying a direction flag — which is precisely the conflation the original refusal was about,
 * arriving as a boolean argument instead of as a second module.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY NEITHER EXISTING AUDIT COVERS THESE ROUTES, AND WHY BOTH SILENTLY APPEAR TO** (FR-641).
 *
 * `tests/unit/event-scope-audit.test.ts` matches a route by `:eventId` in the path or an
 * event-naming property in its schema. **Card routes name no conference** — correctly, because
 * cards are cross-event (standing decision 7, constitution v3.2.0 N1) — so they match nothing
 * it looks for. They are not *failed* by it; they are never *examined* by it, and it reports
 * success either way. That is the exact hole 007 found for conversations.
 *
 * `tests/unit/participation-audit.test.ts` does not cover them either, and its own header
 * predicted the wrong feature would inherit it: it says *"008's appointments — which are also
 * cross-event and also two-party"*. **Appointments are per-event.** It is *cards* that are
 * cross-event and two-party. 008 corrects that prediction where it was written, in both files,
 * because leaving it would send the next reader to the wrong guard.
 *
 * So `tests/unit/card-audit.test.ts` is a **third** audit. Three predicates, three audits, three
 * failure messages that each name the right requirement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Proof that the signed-in attendee holds a card from a specific other attendee.
 *
 * **Nominal, not structural**, for exactly the reasons `VerifiedEventScope` records: a symbol
 * brand is copied by a spread, so `{ ...scope, sharerId: attackerSupplied }` would type-check
 * and pass lint while carrying an identifier nobody verified. A `#` private field is absent from
 * spreads and object literals, and the class is not exported, so `new` is unavailable outside
 * this module.
 *
 * That history is not re-derived here. It was paid for once in `event-access.ts` with compiling
 * probes, and the whole point of mirroring the shape a third time is that it does not have to be
 * paid for again per predicate.
 */
class VerifiedCardScope {
  /** The nominal marker. See `event-access.ts` for why this is not sufficient alone. */
  readonly #verified = true

  constructor(
    /** The reader — the attendee who **holds** the card. Always the sign-in session's. */
    readonly attendeeId: string,
    /** Whose card it is. The direction is the whole predicate; see `requireHeldCard`. */
    readonly sharerId: string,
  ) {
    // `readonly` is erased at emit, so without this the own properties are writable and
    // `Object.assign(scope, { sharerId })` repoints a verified scope at somebody whose card the
    // reader does not hold, with the brand intact.
    Object.freeze(this)
  }

  /** Referenced so the field is not elided as unused; never called. */
  get verified(): boolean {
    return this.#verified
  }
}

/**
 * The actual guarantee: a scope must have been *issued* by `requireHeldCard`.
 *
 * The private field makes the type unforgeable; membership of this set makes the value
 * trustworthy. `event-access.ts` lists the five compiling probes that defeat the class alone —
 * `Object.assign` in both directions, `structuredClone`, `Object.create`, and reconstruction
 * through the prototype's own constructor. Every one of them applies here unchanged.
 */
const VERIFIED = new WeakSet<VerifiedCardScope>()

/** The type consumers see. The class is deliberately not exported. */
export type CardScope = VerifiedCardScope

/**
 * Confirms this scope was issued by the guard rather than assembled by something that merely
 * satisfies its shape.
 *
 * Called at the **query layer**, not only at the route, because that is the boundary where data
 * is actually read — the same placement, and the same one-`WeakSet`-lookup cost, as
 * `assertVerifiedScope` and `assertVerifiedParticipation`.
 */
export const assertVerifiedCard = (scope: CardScope): CardScope => {
  if (!VERIFIED.has(scope)) {
    // Refused identically to a card that does not exist. A forged scope must not be
    // distinguishable from any other refusal.
    throw notFound()
  }
  return scope
}

/** Route params for any route carrying the identifier of a card's **sharer**. */
export interface CardParams {
  readonly attendeeId: string
}

/**
 * Verifies that the caller holds a card from the named attendee, and attaches the resulting
 * `CardScope` (FR-616, FR-641).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T017 — DIRECTIONAL. IT ASKS WHETHER THE READER HOLDS A CARD *FROM* THE NAMED ATTENDEE,
 * NEVER THE REVERSE.**
 *
 * `sharer_id = the named attendee AND recipient_id = the reader`, in that arrangement and no
 * other. Reversing the two columns would answer a different question — "have I shared with
 * them" — and would let somebody read the profile of a person who has never given them anything,
 * simply by having shared their own card first. Sharing gives; it does not take (FR-602), and
 * this is where that becomes enforceable rather than merely intended.
 *
 * A symmetric `OR` would be worse still: it would make every share reciprocal by side effect,
 * silently reversing the one-directional model constitution v3.2.0 (N2) settled.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T018 — 404, NEVER 403, AND THE STAKE HERE IS THE SAME ONE 007 WEIGHED** (FR-616, FR-642).
 *
 * A 403 for "exists but you do not hold it" would confirm that **two specific people exchanged
 * cards**, to somebody holding nothing but an attendee identifier — and attendee identifiers
 * appear in Discover, in URLs, and in browser history, so "did A share with B" is a question an
 * outsider can ask repeatedly.
 *
 * As with events and conversations, the indistinguishability is **by construction rather than by
 * two careful call sites**: there is one query, and a card that exists but is not the caller's
 * produces no row exactly as a card that does not exist produces no row. No code path could
 * later make the two differ without adding a second query that nobody makes.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **This guard does NOT consult blocks, discoverability or verification, and that is
 * deliberate.** It answers one question: is there a card. The standing-consent conditions
 * (FR-612–FR-614) and the block join (FR-608) live in `queries/cards.ts`, where the profile is
 * actually resolved — see that file's header for why discoverability must not be consulted, and
 * why blocking is read-side so that lifting one restores the contact with no write.
 */
export const requireHeldCard = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const attendee = request.attendee
  // Ordering matters: an unauthenticated caller must not be able to probe whether a card exists
  // at all. `requireAttendee` runs first in every route's preHandler list; this is the backstop
  // if one were ever registered without it, and the audit asserts the ordering by reference.
  if (!attendee) throw notAuthenticated()

  const { attendeeId } = request.params as Partial<CardParams>

  // A malformed identifier is refused exactly like a well-formed one naming somebody whose card
  // the reader does not hold. Letting a 400 escape here would separate "not a uuid" from "not
  // yours" — smaller than existence, and still a difference an attacker can read.
  if (!attendeeId || !UUID.test(attendeeId)) throw notFound()

  const rows = await getDb()
    .select({ id: sharedCards.id })
    .from(sharedCards)
    .where(
      and(
        // The named attendee is the SHARER; the reader is the RECIPIENT. See the header.
        eq(sharedCards.sharerId, attendeeId),
        eq(sharedCards.recipientId, attendee.id),
      ),
    )
    .limit(1)

  if (rows.length === 0) throw notFound()

  // The single construction site, and the single place membership is granted.
  const scope = new VerifiedCardScope(attendee.id, attendeeId)
  VERIFIED.add(scope)
  request.cardScope = scope
}

/**
 * Matched rather than parsed, because Fastify's `format: uuid` validation would produce a 400
 * with a distinguishable body before this guard ever ran.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads the verified scope, or refuses.
 *
 * Handlers call this rather than reaching for `request.cardScope`, so the "the preHandler
 * definitely ran" assumption is asserted in one place instead of being a non-null assertion in
 * every handler.
 */
export const cardScopeOf = (request: FastifyRequest): CardScope => {
  const scope = request.cardScope
  if (!scope) throw notFound()
  return scope
}

const cardAccessPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('requireHeldCard', requireHeldCard)
}

export default fp(cardAccessPlugin, { name: 'card-access', dependencies: ['auth-context'] })
