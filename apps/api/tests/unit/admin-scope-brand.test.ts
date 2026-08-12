import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  assertVerifiedOperator,
  mintOperatorScope,
  mintPlatformScope,
  type OperatorScope,
  type PlatformScope,
} from '../../src/admin/scope.js'

/**
 * T033 (011) — **the fourth branded scope, and the compensating control its file split costs**
 * (FR-905, FR-906).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Three things are asserted here, and they are three different kinds of claim:
 *
 *   1. **A forged scope is refused at runtime.** The event guard's brand was defeated five ways
 *      by a security review — `Object.assign` both to forge and to mutate in place,
 *      `structuredClone`, `Object.create`, and reconstruction through the prototype's own
 *      constructor — each compiling clean and passing lint. These brands are the same
 *      construction and inherit both the fix and the obligation to keep proving it.
 *
 *   2. **`PlatformScope` is not assignable from `OperatorScope`, and IS assignable to it.** That
 *      one-way relationship is the whole of FR-906's type-level enforcement, and it is a
 *      property of the type system that a refactor could remove without any behavioural test
 *      noticing. Asserted with `@ts-expect-error`, which fails the *typecheck* if the error it
 *      expects stops occurring — so this assertion runs at build time, not at test time.
 *
 *   3. **Only `require-operator.ts` imports the minting functions.** This is the control that
 *      replaces the module-private constructor the other three scopes have. `scope.ts` records
 *      why the split exists; this is what makes it safe.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('an administrative scope must have been issued by a guard', () => {
  const forged = [
    ['a plain object of the right shape', { operatorId: 'o', attendeeId: null, tier: 'platform' }],
    [
      'a frozen object of the right shape',
      Object.freeze({ operatorId: 'o', attendeeId: null, tier: 'platform' }),
    ],
    ['an object with a null prototype', Object.assign(Object.create(null), { tier: 'platform' })],
  ] as const

  it.each(forged)('refuses %s', (_label, candidate) => {
    expect(() => assertVerifiedOperator(candidate as never)).toThrow()
  })

  it('refuses a structured clone of a real scope', () => {
    const real = mintOperatorScope('o', null, 'platform')
    const clone = structuredClone({
      operatorId: real.operatorId,
      attendeeId: real.attendeeId,
      tier: real.tier,
    })
    expect(() => assertVerifiedOperator(clone as never)).toThrow()
  })

  it('refuses a spread of a real scope', () => {
    // The failure that defeated the first version of the event brand: a spread copies a symbol
    // brand. It does **not** copy a `#private` field, so the result is a plain object — which
    // the type rejects at compile time and the WeakSet rejects here.
    const real = mintPlatformScope('o')
    expect(() => assertVerifiedOperator({ ...real } as never)).toThrow()
  })

  it('refuses a scope rebuilt through the prototype constructor', () => {
    const real = mintOperatorScope('o', null, 'platform')
    const Ctor = Object.getPrototypeOf(real).constructor as new (
      a: string | null,
      b: string | null,
      c: string,
    ) => OperatorScope
    const impostor = new Ctor('someone-else', null, 'platform')
    expect(() => assertVerifiedOperator(impostor)).toThrow()
  })

  it('refuses a platform scope rebuilt through ITS prototype constructor', () => {
    // The subclass has its own reachable constructor, so the probe has to be run against both.
    // A `PlatformScope` fabricated this way is the single most dangerous forged value in this
    // feature: it is the abuse-report queue.
    const real = mintPlatformScope('o')
    const Ctor = Object.getPrototypeOf(real).constructor as new (a: string) => PlatformScope
    expect(() => assertVerifiedOperator(new Ctor('someone-else'))).toThrow()
  })

  it('refuses an in-place mutation of a real scope', () => {
    // `readonly` is erased at emit, so without `Object.freeze` in the constructor this would
    // silently repoint a verified scope at another principal with the brand intact. In ESM —
    // always strict — the assignment now throws.
    const real = mintOperatorScope('o', null, 'platform')
    expect(() => Object.assign(real, { operatorId: 'someone-else' })).toThrow()
    expect(real.operatorId).toBe('o')
  })

  it('accepts a scope the guard minted', () => {
    // The positive case. Without it, a broken `assertVerifiedOperator` that threw on everything
    // would pass every assertion above while refusing every real request.
    const operator = mintOperatorScope(null, 'a', 'organizer')
    const platform = mintPlatformScope('o')
    expect(assertVerifiedOperator(operator)).toBe(operator)
    expect(assertVerifiedOperator(platform)).toBe(platform)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TIER REFINEMENT IS A TYPECHECK ASSERTION, NOT A RUNTIME ONE.**
 *
 * `@ts-expect-error` fails the build when the error it expects does *not* occur — so if
 * `PlatformScope` ever became structurally assignable from `OperatorScope`, `pnpm typecheck`
 * goes red here rather than this test going green while checking nothing.
 *
 * That failure mode is real and quiet: writing `class Platform extends VerifiedOperatorScope`
 * with no additional private field would make the two mutually assignable, every handler would
 * keep compiling, and a conference organizer would reach the report queue. `scope.ts` records
 * why the second `#platform` field exists; this is what notices if it is removed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the platform tier is a type-level refinement (FR-906)', () => {
  it('does not accept an OperatorScope where a PlatformScope is required', () => {
    const operator: OperatorScope = mintOperatorScope('o', null, 'platform')

    const platformOnly = (_scope: PlatformScope): void => {}

    // @ts-expect-error — an OperatorScope is not a PlatformScope. If this line ever stops
    // erroring, the tier boundary has become a convention and FR-906 is enforced by nothing but
    // the route audit.
    platformOnly(operator)

    expect(operator.tier).toBe('platform')
  })

  it('does accept a PlatformScope where an OperatorScope is required', () => {
    // The one direction that SHOULD be allowed: a platform operator may do anything an
    // organizer may do. Asserted so a future over-correction that breaks it is caught.
    const platform: PlatformScope = mintPlatformScope('o')
    const eitherTier = (scope: OperatorScope): string | null => scope.operatorId
    expect(eitherTier(platform)).toBe('o')
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SOLE-IMPORTER ASSERTION — the control that replaces a module-private constructor.**
 *
 * `plugins/event-access.ts`, `participation.ts` and `card-access.ts` each hold their class and
 * their guard in one file, so `new` is simply unavailable elsewhere. plan.md splits this
 * feature's across `admin/scope.ts` and `admin/require-operator.ts`, which means the minting
 * functions have to be exported — and an exported mint is a way to fabricate an administrator.
 *
 * This closes it, using the mechanism 007 used to make `NotificationPrompt.tsx` the only caller
 * of `requestPermission` in the client. It is weaker than a private constructor by exactly one
 * reviewable test, and the trade is recorded in `scope.ts` rather than hidden.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('only the guard module may mint a scope', () => {
  const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

  const sourceFiles = (directory: string): string[] => {
    const entries = readdirSync(directory, { withFileTypes: true })
    return entries.flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return /\.tsx?$/.test(entry.name) ? [path] : []
    })
  }

  /** 009's stripper: `mintPlatformScope` appears in the prose explaining this rule. */
  const codeOnly = (path: string): string =>
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')

  const files = sourceFiles(apiSrc)

  it('found source files to scan', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('names mintOperatorScope and mintPlatformScope in exactly one module', () => {
    const importers = files
      .filter((path) => /\bmint(Operator|Platform)Scope\b/.test(codeOnly(path)))
      .map((path) => path.slice(apiSrc.length))
      .sort()

    expect(
      importers,
      'A module other than the guard mints an administrative scope. The classes live in ' +
        '`scope.ts` and the guards in `require-operator.ts` (plan.md), so unlike the other ' +
        'three branded scopes the constructor cannot be module-private — this assertion is what ' +
        'replaces it. Minting a scope outside the guard fabricates an administrator (FR-905) ' +
        'or, worse, a platform operator (FR-906).',
    ).toEqual(['admin/require-operator.ts', 'admin/scope.ts'])
  })
})
