import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { changedInRange, fileAt, TRANCHE_2 } from '../support/feature-range.js'

/**
 * T077 (014) — **research R7's structural claims, asserted rather than trusted** (FR-1030,
 * FR-1031, Principle V, Principle VI).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **R7 SAYS THE MARKER COSTS NOTHING ARCHITECTURALLY. THIS IS WHERE THAT STOPS BEING A CLAIM.**
 *
 * The marker could have been built four ways, and three of them are mistakes this project has
 * already made once:
 *
 *   1. **A new cached read.** 008 shipped the defect: the caching decorator treats every method
 *      not named in `reads` as a **write**, and a write purges the whole conference prefix — so
 *      an undeclared read silently wiped the cached programme, saved sessions and notes each
 *      time it ran. A `listChangedSessions` would meet that trap on day one.
 *   2. **A new device capability.** 007 added `VisibilityService` because a poll must stop
 *      when the tab hides and only the browser can say. That needed a constitution amendment
 *      (v3.1.0 ratified it into Principle V), and it is the precedent for how expensive one is —
 *      016 paid it again for `InstallService` at v5.1.0. The marker needs none: it is
 *      server-computed state on a payload the attendee already reads.
 *   3. **A read whose subject is "things that happened".** Which is the notification centre N2
 *      forbids, arrived at through the data layer rather than through a screen.
 *
 * The fourth way is the one taken: the marker rides on `listSaved`, which already existed and is
 * already declared. **What 014 tranche 1 added was exactly one member and it was a WRITE** —
 * `markViewed`, because clearing the marker is an act the attendee performs. tasks.md worded
 * T077 as "no repository member is added"; the accurate invariant, and the one the interface's
 * own header states, is **no new READ whose subject is change history**. Recorded in
 * `deviations.md` rather than left as a discrepancy between a task and the code.
 *
 * A write needs no `passThrough` and cannot meet 008's trap — purging the conference prefix after
 * `markViewed` is **correct rather than tolerated**, because the programme being purged is the
 * one that just changed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **RE-SCOPED BY TRANCHE 2 (T196/T197, research R13 finding 3), DELIBERATELY AND IN WRITING.**
 *
 * This file used to pin the repository to exactly `['listSaved','save','unsave','markViewed']`
 * and its reads to exactly `['listSaved']`. That was the correct property for R7's marker and it
 * is NOT the property tranche 2 owes: enrolment adds two writes (`enrol`, `release`) and one
 * **live single-session read** (`places`), none of which is a change list. The guard's stated
 * subject was always R7's marker claim — *no read whose subject is "things that happened", no
 * aggregate, no new cached entry* — and that subject survives the amendment intact:
 *
 *   - the member set is pinned again, exactly, at its new seven — never "anything goes";
 *   - `places` is asserted `passThrough` at the composition root, NOT cached (FR-1070b): a
 *     seat count is a live fact about one session at the moment of deciding, and 008's trap
 *     is met by declaration rather than by omission;
 *   - no member name may match a change-history shape (`change|history|inbox`), which is the
 *     original prohibition stated as the property it always was instead of via a frozen list.
 *
 * The old exact-list assertion would have been "fixed" by the first person to hit it — the
 * failure mode this project records for the brand-audit ceiling and the frozen capability
 * count — so the re-scope is written here, where the diff shows it, rather than negotiated in
 * a review thread.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const REPO = join(import.meta.dirname, '../../../..')
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8')

const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('R7 — the marker adds no read, no capability and no cache entry', () => {
  /**
   * **This feature adds no device capability.**
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS ASSERTION USED TO FREEZE THE COUNT AT SEVEN, AND THAT WAS THE WRONG PROPERTY.**
   *
   * It read `expect(members.length).toBe(7)` with the seven names spelled out, and it was correct
   * for as long as seven was the answer. On 2026-08-14 this branch merged `develop` and the test
   * failed — not because 014 had added a capability, but because **016 had**: `InstallService`,
   * ratified as the eighth in constitution v5.1.0, on a branch authored in parallel that this one
   * could not see.
   *
   * A guard asserting a **product-wide** fact fails when any feature legitimately changes that
   * fact, and the tempting repair — edit the literal to eight — buys one more amendment of life
   * and hides who changed what. The property 014 actually owes is narrower and does not expire:
   * **the capability set is whatever it was at the branch point.**
   *
   * **PINNED AT BOTH ENDS since fix/post-merge-verification (2026-08-15).** The branch-relative
   * form read one end from the checkout, and after the squash merged, every checkout context
   * gave it a different wrong answer (`tests/support/feature-range.ts` records them). 014's diff
   * is fixed history now — `63bfd977..8b775e17` — so both ends are read from history and the
   * assertion is deterministic everywhere, and still what it always was: this feature changed
   * nothing about the set. The old form also NAMED the seven against the working tree; that half
   * is gone deliberately, because it re-froze a product-wide fact (a later amendment renaming or
   * retiring a capability would fail 014's guard), and the exact, order-sensitive equality below
   * already catches a removal paired with an addition within the feature.
   *
   * **Stated plainly: this file no longer examines the working tree, and can never again fail on
   * a future edit** — it is a sealed proof about history. That is not where the live protection
   * went missing: a present-day change to `DeviceServices` fails the typecheck against
   * `packages/platform/tests/substitution.test.ts`, which constructs a typed double for every
   * capability — so the set cannot change without editing that file, and editing it is the
   * conversation (`DISPATCH_CALLERS`' rule, applied to Principle V). The lint boundary
   * (`mynet/no-direct-platform-access`) guards the other side: nothing reaches a platform API
   * around the set.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves the device-capability set exactly as the branch point had it (Principle V)', () => {
    const membersOf = (source: string): string[] => {
      const block = /interface DeviceServices\s*\{([\s\S]*?)\n\}/.exec(codeOf(source))?.[1] ?? ''
      expect(block, 'the DeviceServices interface could not be located').not.toBe('')
      return [...block.matchAll(/^\s*readonly\s+(\w+)\s*:/gm)].map((match) => match[1] ?? '')
    }

    const PATH = 'packages/platform/src/interfaces/index.ts'
    const before = membersOf(fileAt(REPO, TRANCHE_2.base, PATH))
    const after = membersOf(fileAt(REPO, TRANCHE_2.head, PATH))

    // Non-vacuity first: an extractor that silently returns nothing would make the comparison
    // below `[] === []` and pass forever. This is the 010 precache defect in miniature.
    expect(
      before.length,
      'no capabilities extracted at the branch point — the comparison would be vacuous',
    ).toBeGreaterThan(5)

    expect(
      after,
      'The device-capability set changed within this feature. An addition is a constitution ' +
        'amendment rather than an implementation detail — `VisibilityService` (v3.1.0) and ' +
        '`InstallService` (v5.1.0) are both precedents for how expensive one is, and both were ' +
        'ratified before the code landed. If this feature genuinely needs one, amend first.',
    ).toEqual(before)
  })

  /**
   * **`substitution.test.ts` is untouched**, which is the cheapest possible proof of the above.
   *
   * That file constructs a double for **every** capability. An eighth would not compile against
   * it, so an unchanged file is a stronger statement than any assertion about names: if 014 had
   * added a capability, this file would have had to change, and `git` is what knows whether it
   * did.
   */
  it('required no change to the platform substitution test (Principle V)', () => {
    // The whole feature's diff, pinned at both ends (`63bfd977..8b775e17`) — this feature is many
    // commits long, and "unchanged since the last commit" is a claim about the last commit rather
    // than about the feature. The range lives in `tests/support/feature-range.ts`, shared with
    // `no-admin-surface.test.ts`; its header records why the branch-relative predecessor had a
    // different wrong answer in every post-merge context, and why this throws rather than
    // degrading to an empty diff, which would make this guard pass forever.
    const changed = changedInRange(REPO, TRANCHE_2)

    expect(
      changed.filter((path) => path === 'packages/platform/tests/substitution.test.ts'),
      'The platform substitution test changed during 014. It constructs a double for every ' +
        'device capability, so it changes when the capability set does — which is a ' +
        'constitution amendment, not a feature decision (research R7).',
    ).toEqual([])

    // The guard is only meaningful if the diff is real: an empty comparison would pass forever.
    expect(
      changed.length,
      'no changes found in the pinned range — the range in `feature-range.ts` is wrong',
    ).toBeGreaterThan(5)
  })

  /**
   * **The commitment repository holds exactly its seven members, and none of them is a change
   * list** (re-scoped by tranche 2 — see the header).
   *
   * Read from the interface rather than from the HTTP implementation, because the interface is
   * what the caching decorator is configured against and what a later implementation must honour.
   */
  it('pins the commitment repository to its seven members, none a change-history read (R7, R13)', () => {
    const agenda = codeOf(read('packages/data/src/interfaces/agenda.ts'))
    const block = /interface CommitmentRepository\s*\{([\s\S]*?)\n\}/.exec(agenda)?.[1] ?? ''

    expect(block, 'the CommitmentRepository interface could not be located').not.toBe('')

    const members = [...block.matchAll(/^\s{2}(\w+)\s*\(/gm)].map((match) => match[1])
    // Exact, not a floor: the next member must edit this file, and editing it is the
    // conversation — the same rule the notification-trigger guard states for DISPATCH_CALLERS.
    expect(members).toEqual([
      'listSaved',
      'save',
      'unsave',
      'markViewed',
      'enrol',
      'release',
      'places',
    ])

    // R7's original prohibition, stated as the property it always was: no read whose subject is
    // *things that happened*. `places` is a live read about ONE session's availability at the
    // moment of deciding (FR-1070) — not a change list, not an aggregate. A `listChanged…`,
    // `history…` or `inbox…` member is the notification centre N2 forbids, reached through the
    // data layer, whatever it is called on screen.
    for (const name of members) {
      expect(
        /change|history|inbox/i.test(name ?? ''),
        `Repository member "${name}" is shaped like a change-history read. R7's whole claim is ` +
          'that the marker travels on the EXISTING read, and once a "things that happened" read ' +
          'exists, rendering it is a small ask (FR-1031, v5.2.0 N2).',
      ).toBe(false)
    }
  })

  /**
   * **`places` is a live `passThrough` read at the composition root — never cached, never a
   * write** (FR-1070b, T197).
   *
   * Both misclassifications are silently destructive: cached, a stale seat count reads as a
   * promise of a place (and the decorator's `args[0]` key would collide every session onto one
   * entry); unnamed, the write branch purges the attendee's whole cached conference every time
   * a session panel opens — 008's `slots` defect re-shipped.
   */
  it('declares places as passThrough, and not as a cached read (FR-1070b)', () => {
    const services = codeOf(read('apps/web/src/app/services.ts'))
    const block =
      /commitments\s*=\s*cached\([\s\S]{0,1200}?\n {2}\)/.exec(services)?.[0] ?? services

    expect(
      /passThrough\s*:\s*\[[^\]]*['"]places['"]/.test(block),
      '`places` is not declared in `passThrough`. Undeclared, the decorator classifies it as a ' +
        'WRITE and purges the whole conference prefix on every panel open (008’s slots defect); ' +
        'declared as a cached read instead, it would publish a stale seat count that reads as a ' +
        'promise of a place (FR-1070b).',
    ).toBe(true)

    expect(
      /reads[^)]*places|['"]places['"]\s*:/.test(/\{\s*listSaved[^}]*\}/.exec(block)?.[0] ?? ''),
      '`places` appears in the `reads` map. It must never be cached: a remaining-places figure ' +
        'presented from cache is FR-1070b’s named violation.',
    ).toBe(false)
  })

  /**
   * **The marker declares no cached read**, which is 008's trap stated as a configuration fact.
   *
   * `markViewed` must be absent from the decorator's `reads` map — it is a write, and being
   * treated as one is correct here. `passThrough` must not appear for it either: that escape
   * hatch exists for a **live read**, and reaching for it would mean somebody had classified the
   * write as a read and then patched around the consequence.
   */
  it('declares markViewed as a write, and reaches for no passThrough (008’s trap)', () => {
    const services = codeOf(read('apps/web/src/app/services.ts'))

    const savedBlock =
      /commitments\s*=\s*cached\([\s\S]{0,1200}?\n {2}\)/.exec(services)?.[0] ?? services

    expect(
      /reads\s*:\s*\[[^\]]*markViewed/.test(savedBlock),
      'markViewed is declared as a cached READ. It is a write — clearing the marker is an act ' +
        'the attendee performs — and a write purging the conference prefix is CORRECT here, ' +
        'because the programme being purged is the one that just changed.',
    ).toBe(false)

    expect(
      /passThrough[^\n]{0,80}markViewed|markViewed[^\n]{0,80}passThrough/.test(savedBlock),
      'markViewed reaches for `passThrough`. That declaration exists for a live READ (008’s ' +
        '`slots`); using it on a write means the write was misclassified and then patched ' +
        'around.',
    ).toBe(false)
  })

  /**
   * **No new repository**, which is the other thing R7 rules out.
   *
   * `Repositories` in `packages/platform` is an append-only extension point, so adding one is a
   * single line — cheap enough that it is worth asserting it did not happen.
   */
  it('registers no new repository for the marker (R7)', () => {
    // `Repositories` is `@mynet/data`'s own aggregate — `packages/platform` takes a **type-only**
    // dependency on it rather than re-declaring the members, so this is where a new one appears.
    const registry = codeOf(read('packages/data/src/interfaces/index.ts'))
    const block = /interface Repositories\s*\{([\s\S]*?)\n\}/.exec(registry)?.[1] ?? ''

    expect(block, 'the Repositories registry could not be located').not.toBe('')
    expect(
      /changes|markers|updates|activity/i.test(block),
      'A repository was added for the marker. It is a property of a saved session and belongs ' +
        'on the saved-session repository; a repository of its own would be the "things that ' +
        'happened" read FR-1031 forbids, one indirection further away.',
    ).toBe(false)
  })
})
