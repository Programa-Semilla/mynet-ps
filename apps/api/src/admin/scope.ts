import { notFound } from '../errors.js'

/**
 * T029 (013) — **the fourth branded scope, and the first that is a two-level refinement**
 * (FR-905, FR-906, contracts).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **READ `plugins/event-access.ts` FIRST. IT CARRIES THE ARGUMENT FOR ALL FOUR OF THESE, AND
 * NEITHER `participation.ts`, `card-access.ts` NOR THIS FILE RE-DERIVES IT.**
 *
 * The short version: a guard `preHandler` alone is enforced only at test time, so the guard
 * produces a **branded value** and every protected operation takes that value instead of a bare
 * identifier. A handler that skipped the guard cannot obtain one, so it does not compile. Four
 * mechanisms cover four surfaces — the nominal type (compile time), the `VERIFIED` set (run
 * time), a route audit (CI), and a lint rule closing the type-assertion escape hatch.
 *
 * The history that produced that design is recorded there in full and was paid for once: a
 * symbol brand defeated by a spread, then a private-field class defeated five separate ways by
 * `Object.assign` in both directions, `structuredClone`, `Object.create`, and reconstruction
 * through the prototype's own constructor. Every one compiled cleanly and passed lint.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT IS GENUINELY NEW HERE, AND WHY IT IS A FOURTH MODULE RATHER THAN A WIDENED THIRD.**
 *
 * The three existing scopes all answer a question about **an attendee's relationship to a
 * record**: are you registered for this conference, do you participate in this conversation, do
 * you hold this card. Every one of them is a two-party or attendee-to-content predicate, and
 * every one of them presupposes an `attendees` row.
 *
 * This one answers **which principal is calling at all**, and the principal may not be an
 * attendee: a platform operator has no `attendees` row and never will (FR-901). There is no
 * relationship to verify — there is an identity to establish and a tier to establish with it.
 * Parameterising `card-access.ts` to cover that would mean a predicate with no second operand.
 *
 * **And the tier is a refinement, not a field.** `PlatformScope` extends `OperatorScope`
 * nominally, so a handler declaring `PlatformScope` **fails to typecheck** when handed the
 * output of `requireOperator`. The rejected alternative — one guard returning `{ tier }` and
 * handlers writing `if (tier === 'platform')` — makes FR-906 a convention every new route can
 * forget, in a codebase where three prior features each had to build a structural guard after
 * discovering exactly that. The stake is decision 35's central condition: **a conference
 * organizer must not read the report queue.**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THE CLASSES LIVE HERE AND THE GUARDS LIVE IN `require-operator.ts`.**
 *
 * This is a deviation from the three modules above, where the class and its guard share a file
 * so that "the only place that can construct one" is literally true of one module. plan.md's
 * structure names the split, and it is worth being honest about what it costs and what replaces
 * it.
 *
 * The two minting functions below are exported, so in principle any module could call one. What
 * stops that is a **sole-importer assertion** in `tests/unit/admin-scope-brand.test.ts`:
 * `require-operator.ts` is the only file in `apps/api/src` permitted to import them, and the
 * test fails naming any other. That is the same mechanism 007 used to make
 * `NotificationPrompt.tsx` the only caller of `requestPermission` in the client, and it is
 * weaker than a module-private constructor by exactly one reviewable test.
 *
 * The split earns that cost because there are **two** guards over **two** brands, and putting
 * four things plus a database query in one file is how the guard that matters gets skimmed.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** The two tiers, as a closed union. There is no third and adding one is a governance change. */
export type OperatorTier = 'platform' | 'organizer'

/**
 * Proof that an administrative principal is authenticated — of either tier.
 *
 * Nominal, not structural, for the reasons `event-access.ts` records. `#verified` is a genuine
 * private field, so `{ ...scope }` produces a plain object that does not satisfy the type, and
 * `Object.freeze` makes the `readonly` annotations real at runtime.
 */
class VerifiedOperatorScope {
  readonly #verified = true

  constructor(
    /** Non-null for the platform tier; null for an organizer, who is an attendee. */
    readonly operatorId: string | null,
    /** Non-null for an organizer; null for a platform operator, who has no attendee row. */
    readonly attendeeId: string | null,
    readonly tier: OperatorTier,
  ) {
    Object.freeze(this)
  }

  /** Referenced so the field is not elided as unused; never called. */
  get verified(): boolean {
    return this.#verified
  }
}

/**
 * Proof that the caller is a **platform operator** (FR-906).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A SUBCLASS THAT ADDS A SECOND PRIVATE FIELD. BOTH HALVES OF THAT ARE LOAD-BEARING, AND
 * GETTING EITHER WRONG COLLAPSES THE TIER BOUNDARY IN A DIFFERENT DIRECTION.**
 *
 * The requirement is a **one-way** relationship: a `PlatformScope` must be usable anywhere an
 * `OperatorScope` is wanted (a platform operator may do anything an organizer may do), and an
 * `OperatorScope` must be refused where a `PlatformScope` is required (FR-906). Three spellings
 * were available and two of them are wrong:
 *
 *   - **Two sibling classes**, each with its own `#verified`. Private fields are nominal *per
 *     declaration*, so the two types are incompatible in **both** directions — `requireOperator`
 *     cannot even hand its result to a handler expecting the weaker type. This was written first
 *     and `pnpm typecheck` rejected it immediately, which is the useful kind of wrong.
 *
 *   - **A subclass adding nothing.** Assignable in both directions, so a handler declaring
 *     `PlatformScope` would silently accept an `OperatorScope` and the distinction would
 *     evaporate with every test still green. This is the dangerous one.
 *
 *   - **A subclass adding `#platform`** — this. The inherited `#verified` is the *same
 *     declaration*, so a platform scope satisfies `OperatorScope`; the extra private field is
 *     one the base does not have, so an operator scope does not satisfy `PlatformScope`.
 *
 * Both directions are asserted in `tests/unit/admin-scope-brand.test.ts`, one of them with
 * `@ts-expect-error` so it fails the **typecheck** rather than the test run. This is a property
 * of the type system that a refactor could remove without any behavioural test noticing, and the
 * thing it would let through is a conference organizer reading the abuse-report queue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
class VerifiedPlatformScope extends VerifiedOperatorScope {
  /** The extra marker. Its absence from the base is what makes the refinement one-way. */
  readonly #platform = true

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE THREE NARROWED DECLARATIONS BELOW ARE TYPES ONLY — `declare` EMITS NOTHING.**
   *
   * The base carries `operatorId: string | null` because it describes both tiers: a platform
   * operator has an `operators` row and no attendee row, an organizer the reverse. A
   * `PlatformScope` is only ever the first, so on this type the union is not merely unnecessary
   * — it is **wrong**, and it was costing every platform-only handler a non-null assertion.
   *
   * Eight of them, before this existed. Each was a place somebody could later write `as string`
   * out of habit on a value that genuinely could be null, and the compiler would have stopped
   * caring. Narrowing here removes the assertions rather than teaching people to write them.
   *
   * `declare` is load-bearing: without it these would emit as real field definitions that run
   * **after** `super()` and overwrite the frozen base's values with `undefined` — silently, in
   * a class whose whole purpose is to be trustworthy.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  declare readonly operatorId: string
  declare readonly attendeeId: null
  declare readonly tier: 'platform'

  constructor(operatorId: string) {
    super(operatorId, null, 'platform')
    // `super` already froze `this`; freezing again is a no-op and is not repeated.
  }

  /** Referenced so the field is not elided as unused; never called. */
  get platform(): boolean {
    return this.#platform
  }
}

/**
 * Membership is the actual guarantee — the private field makes the *type* unforgeable, and this
 * makes the *value* trustworthy. `event-access.ts` lists the five compiling probes that defeat a
 * private-field class on its own; every one of them applies here unchanged.
 */
const VERIFIED = new WeakSet<VerifiedOperatorScope>()

/** The types consumers see. The classes are deliberately not exported. */
export type OperatorScope = VerifiedOperatorScope
export type PlatformScope = VerifiedPlatformScope

/**
 * Mints an operator scope. **Callable only from `require-operator.ts`** — see the header, and
 * `tests/unit/admin-scope-brand.test.ts`, which is what enforces that rather than a comment.
 */
export const mintOperatorScope = (
  operatorId: string | null,
  attendeeId: string | null,
  tier: OperatorTier,
): OperatorScope => {
  const scope = new VerifiedOperatorScope(operatorId, attendeeId, tier)
  VERIFIED.add(scope)
  return scope
}

/** Mints a platform scope. Same restriction, same enforcement. */
export const mintPlatformScope = (operatorId: string): PlatformScope => {
  const scope = new VerifiedPlatformScope(operatorId)
  VERIFIED.add(scope)
  return scope
}

/**
 * Confirms this scope was issued by a guard rather than assembled by something that merely
 * satisfies its shape.
 *
 * Called at the **query layer**, not only at the route — the same placement, and the same
 * one-`WeakSet`-lookup cost, as `assertVerifiedScope` and `assertVerifiedParticipation`. That is
 * the boundary where data is actually read, and a route-only check protects the declaration
 * rather than the read.
 *
 * **Refused as 404, never 403.** An administrative address must disclose nothing about what
 * exists to a caller who cannot prove they belong there (FR-917), and a forged scope must be
 * indistinguishable from every other refusal.
 */
export const assertVerifiedOperator = <T extends OperatorScope>(scope: T): T => {
  if (!VERIFIED.has(scope)) throw notFound()
  return scope
}
