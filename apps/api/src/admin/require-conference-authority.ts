import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { getDb } from '../db/client.js'
import { events } from '../db/schema/events.js'
import { organizerAssignments } from '../db/schema/organizer-assignments.js'
import { notFound } from '../errors.js'
import { operatorScopeOf } from './require-operator.js'
import type { OperatorTier } from './scope.js'

/**
 * T008, T009 (014) — **the fifth branded scope: may this principal write to this conference?**
 * (FR-1035, FR-1036, research R2, contracts).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **READ `plugins/event-access.ts` FIRST. IT CARRIES THE ARGUMENT FOR ALL FIVE OF THESE, AND
 * NEITHER `participation.ts`, `card-access.ts`, `admin/scope.ts` NOR THIS FILE RE-DERIVES IT.**
 *
 * The short version: a guard `preHandler` alone is enforced only at test time, so the guard
 * produces a **branded value** and every protected operation takes that value instead of a bare
 * identifier. A handler that skipped the guard cannot obtain one, so it does not compile.
 *
 * The history that produced that design was paid for once and is recorded there in full: a symbol
 * brand defeated by a spread, then a private-field class defeated five separate ways by
 * `Object.assign` in both directions, `structuredClone`, `Object.create`, and reconstruction
 * through the prototype's own constructor. Every one compiled cleanly and passed lint. This scope
 * inherits both the fix and the obligation to keep proving it —
 * `tests/unit/conference-authority-brand.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THIS IS A FIFTH GUARD RATHER THAN A WIDENED FOURTH, AND WHY 013 DID NOT NEED IT.**
 *
 * 013 shipped two administrative guards and neither answers this question:
 *
 *   - `requireOperator` asks **who is calling** — an authenticated principal of either tier.
 *   - `requirePlatformOperator` asks **which tier** — product-wide authority, or refusal.
 *
 * Authoring asks a third thing: *may **this** principal write to **this** conference?* That is
 * genuinely a join between an operator and a conference, and neither existing guard has a second
 * operand to join on. It is also not `requireEventAccess`, which mints an `EventScope` from an
 * **attendee's registration** — an organizer authoring a conference has no registration and needs
 * none, and a platform operator has no `attendees` row at all.
 *
 * **This is the largest single piece of new construction in 014**, and it is unavoidable.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE CLASS AND THE GUARD SHARE THIS FILE, WHICH IS THE OPPOSITE OF 013's CHOICE.**
 *
 * `admin/scope.ts` splits its two classes from their two guards and pays for the split with a
 * **sole-importer assertion**, because the minting functions have to be exported to cross the file
 * boundary — and an exported mint is a way to fabricate an administrator. That split earned its
 * cost there: two guards over two brands plus a database query is a lot for one file.
 *
 * There is one brand and one guard here, so the cheaper and stronger arrangement is available:
 * **nothing mints this scope but the function below, because there is no exported way to.** The
 * constructor is module-private in the sense that matters — the class is not exported and neither
 * is any factory. `tests/unit/conference-authority-sole-importer.test.ts` asserts that over `src/`
 * anyway, because "no export exists today" and "no export may exist" are different claims.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Proof that this administrative principal may author **this** conference (FR-1035).
 *
 * Nominal, not structural, for the reasons `event-access.ts` records. `#authorised` is a genuine
 * private field, so `{ ...scope }` produces a plain object that does not satisfy the type, and
 * `Object.freeze` makes the `readonly` annotations real at runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **IT CARRIES THE TIER, AND THE TIER IS DATA HERE RATHER THAN A REFINEMENT.**
 *
 * `VerifiedPlatformScope` refines `VerifiedOperatorScope` at the type level precisely because
 * FR-906 needs a **capability** difference: an organizer must not reach the report queue, and a
 * handler declaring the stronger type must fail to compile when handed the weaker one.
 *
 * Nothing like that applies to authoring. FR-1002 says a platform operator holds **the same
 * authoring capability** as an assigned organizer — same routes, same writes, same refusals — so
 * there is no operation to make unreachable by type. What the tier is needed for is the audit
 * entry, which records *which* principal acted (FR-1038), and that is a value rather than a
 * permission. A subclass here would be a distinction with no operation behind it, which is the
 * "subclass adding nothing" mistake `scope.ts` warns about, arrived at from the other direction.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
class VerifiedConferenceAuthority {
  readonly #authorised = true

  constructor(
    /** Non-null for the platform tier; null for an organizer, who is an attendee. */
    readonly operatorId: string | null,
    /** Non-null for an organizer; null for a platform operator, who has no attendee row. */
    readonly attendeeId: string | null,
    readonly tier: OperatorTier,
    /** The conference this authority is over. **Never a value the handler supplies separately.** */
    readonly eventId: string,
  ) {
    Object.freeze(this)
  }

  /** Referenced so the field is not elided as unused; never called. */
  get authorised(): boolean {
    return this.#authorised
  }
}

/**
 * Membership is the actual guarantee — the private field makes the *type* unforgeable, and this
 * makes the *value* trustworthy. `event-access.ts` lists the five compiling probes that defeat a
 * private-field class on its own; every one of them applies here unchanged.
 */
const AUTHORISED = new WeakSet<VerifiedConferenceAuthority>()

/** The type consumers see. The class is deliberately not exported. */
export type ConferenceAuthorityScope = VerifiedConferenceAuthority

/**
 * Establishes that the caller may author the conference named in the path (FR-1035, FR-1036).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY REFUSAL IS THE SAME 404, FROM THE SAME FACTORY EVERY OTHER ADMINISTRATIVE REFUSAL
 * USES, AND THAT INDISTINGUISHABILITY IS FR-1036 RATHER THAN A STYLE.**
 *
 * Four situations produce it and a caller cannot tell them apart: the conference does not exist;
 * the caller is an organizer with no live assignment to it; the caller's assignment was revoked
 * while they were signed in; the path names something that is not a conference at all.
 *
 * A 403 would tell an organizer that a conference exists and that somebody else runs it — an
 * **enumeration oracle over the conference list**, reachable by anybody holding a promoted
 * account and a UUID. It is the same reasoning that put a 404 on the report queue for the wrong
 * tier (`require-operator.ts`), and the same reasoning 008 had to apply to meeting proposals
 * after making one an oracle for another attendee's presence.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TWO TIERS TAKE TWO DIFFERENT QUERIES, AND THE PLATFORM ONE IS NOT A SHORTCUT.**
 *
 * A platform operator may author every conference (FR-1002), so there is no assignment to check —
 * but the conference still has to **exist**. Skipping that check would push the failure down to a
 * foreign key inside the write transaction, which surfaces as a 500 rather than a 404 and tells a
 * caller, by the shape of the error, that they had named something real or unreal.
 *
 * An organizer's authority is re-read **on every request** rather than captured at sign-in, which
 * is `require-operator.ts`'s rule and decision 39's requirement: authority must not outlive the
 * access it depends on. A revoked assignment stops working immediately, not at the next sign-in.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Composed after `requireOperator`, never instead of it.** Every authoring route declares
 * `preHandler: [requireOperator, requireConferenceAuthority]`, the same ordering discipline
 * `[requireAttendee, requireEventAccess]` established — this guard reads the operator scope that
 * one produced, so a route listing them the other way round would be verifying against nobody.
 * `tests/unit/operator-audit.test.ts` asserts the order by reference rather than by count.
 */
export const requireConferenceAuthority = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  // Throws the same 404 if `requireOperator` did not run — a handler cannot reach this guard
  // without an established principal, and a missing one is not a distinguishable outcome.
  const operator = operatorScopeOf(request)

  const { eventId } = (request.params ?? {}) as { eventId?: string }
  // A route carrying this guard without an `:eventId` is a programming error, and it refuses
  // rather than authorising over `undefined`. `operator-audit.test.ts` catches it at build time;
  // this is what happens if it ever does not.
  if (!eventId) throw notFound()

  if (operator.tier === 'platform' && operator.operatorId !== null) {
    const rows = await getDb()
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (rows.length === 0) throw notFound()

    request.conferenceAuthority = mint(operator.operatorId, null, 'platform', eventId)
    return
  }

  const attendeeId = operator.attendeeId
  if (attendeeId === null) throw notFound()

  // The join that IS the predicate. A revoked row does not match, so demotion takes effect on the
  // next request; and because this reads the assignment rather than the event, a conference that
  // does not exist and one this organizer does not run are the same empty result.
  const assigned = await getDb()
    .select({ id: organizerAssignments.id })
    .from(organizerAssignments)
    .where(
      and(
        eq(organizerAssignments.attendeeId, attendeeId),
        eq(organizerAssignments.eventId, eventId),
        isNull(organizerAssignments.revokedAt),
      ),
    )
    .limit(1)

  if (assigned.length === 0) throw notFound()

  request.conferenceAuthority = mint(null, attendeeId, 'organizer', eventId)
}

/**
 * The only construction site. Not exported, so there is no import anybody could add.
 *
 * `tests/unit/conference-authority-sole-importer.test.ts` asserts that the class name appears in
 * no other module under `src/`, which is what makes "not exported" a rule rather than a
 * coincidence of today's file layout.
 */
const mint = (
  operatorId: string | null,
  attendeeId: string | null,
  tier: OperatorTier,
  eventId: string,
): ConferenceAuthorityScope => {
  const scope = new VerifiedConferenceAuthority(operatorId, attendeeId, tier, eventId)
  AUTHORISED.add(scope)
  return scope
}

/**
 * Confirms this scope was issued by the guard rather than assembled by something that merely
 * satisfies its shape.
 *
 * Called at the **query layer**, not only at the route — the same placement, and the same
 * one-`WeakSet`-lookup cost, as `assertVerifiedScope`, `assertVerifiedParticipation` and
 * `assertVerifiedOperator`. That is the boundary where data is actually written, and a route-only
 * check protects the declaration rather than the write.
 */
export const assertVerifiedConferenceAuthority = (
  scope: ConferenceAuthorityScope,
): ConferenceAuthorityScope => {
  if (!AUTHORISED.has(scope)) throw notFound()
  return scope
}

/**
 * Reads the verified scope, or refuses.
 *
 * Handlers call this rather than reaching for `request.conferenceAuthority`, so "the preHandler
 * definitely ran" is asserted in one place instead of being a non-null assertion in every handler
 * — `plugins/participation.ts`'s reasoning, unchanged.
 */
export const conferenceAuthorityOf = (request: FastifyRequest): ConferenceAuthorityScope => {
  const scope = request.conferenceAuthority
  if (!scope) throw notFound()
  return scope
}

/**
 * The principal an audit entry records for an act performed under this scope (FR-1038).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Exactly one of the two is non-null, by construction above, and `AuditEntryDraft` requires
 * exactly one. Deriving it here rather than at each call site is what stops eight write paths
 * each deciding for themselves which column an organizer's act belongs in — the shape of mistake
 * 013's review found four times over, where a header described a call relationship nothing
 * enforced.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const auditPrincipalOf = (
  scope: ConferenceAuthorityScope,
): { operatorId: string } | { actorAttendeeId: string } =>
  scope.operatorId !== null
    ? { operatorId: scope.operatorId }
    : { actorAttendeeId: scope.attendeeId as string }

const requireConferenceAuthorityPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('requireConferenceAuthority', requireConferenceAuthority)
}

export default fp(requireConferenceAuthorityPlugin, {
  name: 'require-conference-authority',
  dependencies: ['require-operator'],
})
