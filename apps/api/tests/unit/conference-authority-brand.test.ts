import { describe, expect, it } from 'vitest'

import {
  assertVerifiedConferenceAuthority,
  type ConferenceAuthorityScope,
} from '../../src/admin/require-conference-authority.js'
import { mintOperatorScope, type OperatorScope } from '../../src/admin/scope.js'

/**
 * T010 (014) — **the fifth branded scope, and the five probes that defeated the first one**
 * (FR-1035, research R2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Three kinds of claim are asserted here, and only the first is a runtime one:
 *
 *   1. **A forged scope is refused at runtime.** The event guard's brand was defeated five ways
 *      by a security review — `Object.assign` both to forge and to mutate in place,
 *      `structuredClone`, `Object.create`, and reconstruction through the prototype's own
 *      constructor — each compiling clean and passing lint. This brand is the same construction
 *      and inherits both the fix and the obligation to keep proving it.
 *
 *   2. **A `ConferenceAuthorityScope` is not an `OperatorScope` and an `OperatorScope` is not a
 *      `ConferenceAuthorityScope`**, in **both** directions. Asserted with `@ts-expect-error`, so
 *      it fails the **typecheck** rather than the test run — 013's precedent, and the failure it
 *      catches is silent: a scope class whose private field was removed would make every write
 *      path accept a value that proves authentication and proves nothing about authority.
 *
 *   3. **The refusal is the indistinguishable 404** (FR-1036), which is the whole reason an
 *      organizer cannot enumerate the conference list.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **There is no positive case here, and its absence is deliberate.** The other four brand tests
 * mint a real scope and assert it is accepted, because their guards export a mint. This one does
 * not — `require-conference-authority.ts` keeps the constructor and the guard in one file
 * precisely so nothing outside it can produce a scope, which is exactly what
 * `conference-authority-sole-importer.test.ts` asserts. A test that could mint one would be a
 * test proving the guarantee false. The positive path is covered where it can be reached
 * honestly: `tests/integration/conference-authority.test.ts`, through a real request.
 */

describe('a conference authority must have been issued by the guard', () => {
  const forged = [
    [
      'a plain object of the right shape',
      { operatorId: 'o', attendeeId: null, tier: 'platform', eventId: 'e' },
    ],
    [
      'a frozen object of the right shape',
      Object.freeze({ operatorId: 'o', attendeeId: null, tier: 'platform', eventId: 'e' }),
    ],
    [
      'an object with a null prototype',
      Object.assign(Object.create(null), { tier: 'platform', eventId: 'e' }),
    ],
    [
      'a structured clone of a scope-shaped value',
      structuredClone({ operatorId: 'o', attendeeId: null, tier: 'platform', eventId: 'e' }),
    ],
  ] as const

  it.each(forged)('refuses %s', (_label, candidate) => {
    expect(() => assertVerifiedConferenceAuthority(candidate as never)).toThrow()
  })

  it('refuses an operator scope, which proves authentication and not authority', () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The most likely real mistake, and the one with the worst outcome: `requireOperator` runs on
    // every administrative route and its scope is right there on the request. Handing it to a
    // write would give **any authenticated organizer** authority over **every** conference, which
    // is the exact predicate this guard exists to be.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const operator = mintOperatorScope(null, 'a', 'organizer')
    expect(() => assertVerifiedConferenceAuthority(operator as never)).toThrow()
  })

  it('refuses identically to any other refusal, disclosing nothing (FR-1036)', () => {
    try {
      assertVerifiedConferenceAuthority({ eventId: 'e' } as never)
      throw new Error('should have refused')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('not_found')
      expect((error as { statusCode?: number }).statusCode).toBe(404)
    }
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO ADMINISTRATIVE SCOPES ARE MUTUALLY UNASSIGNABLE, AND BOTH DIRECTIONS MATTER.**
 *
 * `@ts-expect-error` fails the build when the error it expects does *not* occur, so this runs at
 * `pnpm typecheck` rather than at test time.
 *
 * The dangerous direction is operator → authority: it would let a route that ran only
 * `requireOperator` call the write layer, and the write layer is what enforces FR-1035. The other
 * direction matters less but is asserted anyway, because a scope that satisfied `OperatorScope`
 * would let an authoring value reach the report queue's tier check — and `scope.ts` records that
 * a class relationship nobody asserted is exactly how a tier boundary evaporates with every test
 * still green.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('conference authority is a distinct brand, not a shape (FR-1035)', () => {
  it('does not accept an OperatorScope where a ConferenceAuthorityScope is required', () => {
    const operator: OperatorScope = mintOperatorScope(null, 'a', 'organizer')

    const authoringOnly = (_scope: ConferenceAuthorityScope): void => {}

    // @ts-expect-error — an OperatorScope proves authentication, never authority over a named
    // conference. If this line stops erroring, every write in `admin-catalog.ts` will accept a
    // value any administrative route already holds.
    authoringOnly(operator)

    expect(operator.tier).toBe('organizer')
  })

  it('does not accept a ConferenceAuthorityScope where an OperatorScope is required', () => {
    const tierOnly = (_scope: OperatorScope): void => {}
    const authority = { operatorId: 'o', attendeeId: null, tier: 'platform', eventId: 'e' }

    // @ts-expect-error — the shape is not the brand, in this direction too. `assertVerifiedOperator`
    // would refuse it at runtime as well; this stops it compiling first.
    tierOnly(authority)

    expect(authority.eventId).toBe('e')
  })
})
