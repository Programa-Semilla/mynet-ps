import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { changedSinceBranchPoint, fileAtBranchPoint } from '../support/branch-point.js'

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
 * already declared. **What 014 adds is exactly one member and it is a WRITE** — `markViewed`,
 * because clearing the marker is an act the attendee performs. tasks.md words T077 as "no
 * repository member is added"; the accurate invariant, and the one the interface's own header
 * states, is **no new READ**. Recorded in `deviations.md` rather than left as a discrepancy
 * between a task and the code.
 *
 * A write needs no `passThrough` and cannot meet 008's trap — purging the conference prefix after
 * `markViewed` is **correct rather than tolerated**, because the programme being purged is the
 * one that just changed.
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
   * **the capability set is whatever it was at the branch point.** A feature that adds one has to
   * change this file to pass, which is the conversation the guard exists to force; a feature that
   * does not, never touches it, however many other features add capabilities in the meantime.
   *
   * Counted **and** compared, because the two catch different mistakes: comparing catches an
   * addition, and counting non-vacuity catches a regex that stopped matching.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves the device-capability set exactly as the branch point had it (Principle V)', () => {
    const membersOf = (source: string): string[] => {
      const block = /interface DeviceServices\s*\{([\s\S]*?)\n\}/.exec(codeOf(source))?.[1] ?? ''
      expect(block, 'the DeviceServices interface could not be located').not.toBe('')
      return [...block.matchAll(/^\s*readonly\s+(\w+)\s*:/gm)].map((match) => match[1] ?? '')
    }

    const PATH = 'packages/platform/src/interfaces/index.ts'
    const now = membersOf(read(PATH))
    const before = membersOf(fileAtBranchPoint(REPO, PATH))

    // Non-vacuity first: an extractor that silently returns nothing would make the comparison
    // below `[] === []` and pass forever. This is the 010 precache defect in miniature.
    expect(
      before.length,
      'no capabilities extracted at the branch point — the comparison would be vacuous',
    ).toBeGreaterThan(5)

    // The seven that predate this feature must all still be there. Named rather than counted, so
    // that a *removal* paired with an addition cannot cancel out.
    expect(now).toEqual(
      expect.arrayContaining([
        'notifications',
        'calendar',
        'camera',
        'contactShare',
        'secureStorage',
        'connectivity',
        'visibility',
      ]),
    )

    expect(
      now,
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
    // Compared against the branch point rather than against HEAD~1: this feature is many commits
    // long, and "unchanged since the last commit" is a claim about the last commit rather than
    // about the feature.
    //
    // The resolution lives in `tests/support/branch-point.ts`, shared with
    // `no-admin-surface.test.ts`. Both had their own copy and **neither could run in CI**, where a
    // depth-1 checkout has no `develop` ref; that file explains both failure modes and why it
    // throws rather than degrading to an empty diff, which would make this guard pass forever.
    const changed = changedSinceBranchPoint(REPO)

    expect(
      changed.filter((path) => path === 'packages/platform/tests/substitution.test.ts'),
      'The platform substitution test changed during 014. It constructs a double for every ' +
        'device capability, so it changes when the capability set does — which is a ' +
        'constitution amendment, not a feature decision (research R7).',
    ).toEqual([])

    // The guard is only meaningful if the diff is real: an empty comparison would pass forever.
    expect(
      changed.length,
      'no changes found against the branch point — the guard is vacuous',
    ).toBeGreaterThan(5)
  })

  /**
   * **The saved-session repository gained exactly one member, and it is a write.**
   *
   * Read from the interface rather than from the HTTP implementation, because the interface is
   * what the caching decorator is configured against and what a later implementation must honour.
   */
  it('adds one member to the saved-session repository, and it is a write (R7)', () => {
    const agenda = codeOf(read('packages/data/src/interfaces/agenda.ts'))
    const block = /interface SavedSessionRepository\s*\{([\s\S]*?)\n\}/.exec(agenda)?.[1] ?? ''

    expect(block, 'the SavedSessionRepository interface could not be located').not.toBe('')

    const members = [...block.matchAll(/^\s{2}(\w+)\s*\(/gm)].map((match) => match[1])
    expect(members).toEqual(['listSaved', 'save', 'unsave', 'markViewed'])

    // The one read is the one that existed. A second read would be the surface FR-1031 forbids
    // — "things that happened" — reached through the data layer.
    const reads = members.filter((name) => /^list|^get|^read/.test(name ?? ''))
    expect(
      reads,
      'The saved-session repository gained a read. R7’s whole claim is that the marker travels ' +
        'on the EXISTING read: a `listChangedSessions` would be a read whose subject is things ' +
        'that happened, and once the read exists rendering it is a small ask (FR-1031).',
    ).toEqual(['listSaved'])
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

    const savedBlock = /savedSessions\s*:[\s\S]{0,600}?\}\s*\)/.exec(services)?.[0] ?? services

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
