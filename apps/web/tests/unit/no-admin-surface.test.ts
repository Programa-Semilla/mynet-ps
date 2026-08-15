import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { changedInRange, fileAt, TRANCHE_2 } from '../support/feature-range.js'

/**
 * T089 (014) — **FR-1003 and SC-1008, re-proved rather than assumed still true.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **014 IS THE FIRST FEATURE TO CHANGE MyNet SINCE THE SECOND ACTOR EXISTED, WHICH IS WHY THIS
 * FILE IS NOT A DUPLICATE OF 013's.**
 *
 * `admin-absences.test.ts` asserts FR-970–FR-973 categorically over the whole attendee client,
 * and it was written the day the absence was created — when `apps/web` had not been touched
 * since. An absence proved once is a fact about that day.
 *
 * plan.md flags this explicitly in the Constitution Check: Principle III passes *"with one thing
 * to watch — 014 is the first feature since 013 to change MyNet, so FR-1003's absence must be
 * re-asserted rather than assumed still true."* Three directories in `apps/web` change here, and
 * the change is a **notification about an act performed by an organizer** — which is precisely
 * the shape that invites a tier to leak across: a "changed by the organizer" line, a link to who
 * did it, a different rendering for an attendee who happens to be one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **SO THIS GUARD IS DIFF-AWARE, AND THAT IS THE PART 013's CANNOT DO.**
 *
 * The categorical assertions are re-run, and then every file 014 actually changed in `apps/web`
 * is examined on its own. A categorical scan passing tells you the product is clean; it does not
 * tell you the feature under review changed nothing it should not have — those are different
 * questions, and the second is the one a reviewer of *this* feature is asking.
 *
 * **The promoted organizer is the case that makes it concrete.** Decision 33 requires their
 * attendee experience to be unchanged *in every observable way*. They save sessions, get markers
 * and receive notifications exactly as anybody else does — including, per FR-1028a, **not** being
 * notified about their own act, which is a fact about the actor of a change rather than about
 * the tier of a reader, and is enforced server-side where it cannot become a rendering rule.
 *
 * Comments are stripped before matching (009's rule): every word searched for appears in the
 * prose above and in the components' own headers.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const stripped = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const codeOnly = (path: string): string => stripped(readFileSync(path, 'utf8'))

/** A changed file's code as 014 SHIPPED it — read at the pinned head, not from the checkout. */
const codeAtHead = (path: string): string => stripped(fileAt(REPO, TRANCHE_2.head, path))

const label = (path: string): string => path.slice(webSrc.length)

/**
 * Every `apps/web/src` file this feature touched — the pinned range `63bfd977..8b775e17`, which
 * is 014 tranche 2 exactly as it landed (PR #24).
 *
 * The resolution lives in `tests/support/feature-range.ts`, shared with
 * `marker-not-cached.test.ts`. Its predecessor (`branch-point.ts`) re-derived the branch point
 * from the checkout context, which was correct on the feature branch and false in every context
 * after the merge — that file's replacement header records the full trajectory. Deleted paths
 * (tranche 2's FR-1066a renames) are excluded by the helper itself: a file the feature removed
 * cannot carry an administrative surface, and has no content at the head to read.
 */
const changedByThisFeature = (): string[] => changedInRange(REPO, TRANCHE_2, 'apps/web/src')

const all = sourceFiles(webSrc)

describe('014 — MyNet still has no administrative surface (FR-1003, SC-1008)', () => {
  it('found the source and the feature’s own diff — neither assertion may be vacuous', () => {
    expect(all.length).toBeGreaterThan(40)
    expect(
      changedByThisFeature().length,
      '014 changed no file in `apps/web/src`, so the diff-aware assertions below check nothing. ' +
        'This feature changed three directories there (research R7, R8), and its diff is pinned ' +
        'history now — an empty result means the range in `feature-range.ts` is wrong, never ' +
        'that the feature was clean.',
    ).toBeGreaterThan(3)
  })

  /**
   * **The categorical half**, re-run over the whole client rather than delegated.
   *
   * Deliberately overlapping with `admin-absences.test.ts`. The overlap costs milliseconds and
   * buys the property that this feature's own gate fails on this feature's own breach, rather
   * than depending on a file written for another one.
   */
  it.each([
    ['an administrative address', /['"`]\/admin(\/|['"`])/],
    ['an administrative tier', /\btier\s*===|\btier\s*\?|['"]platform['"]\s*:|\bisOperator\b/],
    ['an operator or organizer identity', /\bisOrganizer\b|\boperatorId\b|\borganizerId\b/],
    [
      'an authoring capability',
      /\bcreateSession\b|\bupdateSession\b|\bcancelSession\b|\bdeleteSession\b|\bcreateConference\b|\bpatchConference\b/,
    ],
    ['an engagement readout', /\bengagement\s*\.\s*(saved|notes|questions|votes)\b/],
  ])('contains no %s (FR-1003, SC-1008)', (_label, pattern) => {
    const offending = all.filter((path) => pattern.test(codeOnly(path))).map(label)

    expect(
      offending,
      'The attendee product gained an administrative capability or a tier-dependent rendering. ' +
        'Decision 33 makes that absence what keeps Principle III’s attendee-workspace framing ' +
        'true while its actor clause changes — and "the organizer is already signed in, why ' +
        'make them switch sites?" is a reasonable-sounding question with a governance answer.',
    ).toEqual([])
  })

  /**
   * **The diff-aware half.** Every file 014 touched, examined for the leak it could plausibly
   * have introduced rather than for administration in general.
   */
  it('changed no file in MyNet that branches on who is reading (FR-1003)', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **ONE exemption, one file, and it is a REQUIREMENT rather than a leak** (T147, FR-1074).
    // The pre-enrolment notice must tell the attendee, before they take a place, that their
    // name becomes visible to "the organizers of this conference" — constitution v5.3.0 O1's
    // fourth binding condition, and the only privacy exception its subject can decline by not
    // acting. That sentence is disclosure COPY an attendee reads; it names the other actor
    // without branching on who is reading, which is this test's actual subject. The categorical
    // suite above still scans this file, unexempted, for every real branching pattern
    // (`tier ===`, `isOperator`, an `/admin` address, an authoring capability) — this narrows
    // one heuristic word-match, not the guarantee.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const FR_1074_DISCLOSURE = new Set(['apps/web/src/app/SessionPresentation.tsx'])

    const changed = changedByThisFeature()
      .filter((path) => !FR_1074_DISCLOSURE.has(path))
      .filter((path) => /\.tsx?$/.test(path))

    const branching = changed.filter((path) =>
      /\btier\b|\boperator\b|\borganiz(er|ed|es)\b|\badmin\b/i.test(codeAtHead(path)),
    )

    expect(
      branching,
      'A file 014 changed in MyNet names a tier, an operator or an organizer. The marker and the ' +
        'cancelled presentation are visible to EVERY attendee identically — a promoted ' +
        'organizer’s attendee experience must be unchanged in every observable way ' +
        '(decision 33).',
    ).toEqual([])
  })

  it('changed nothing in MyNet that names who made the change (FR-1003)', () => {
    // The specific leak this feature invites: "changed by …" beside the marker. The act has an
    // actor and the audit trail records them; the attendee is told WHAT changed, never WHO — and
    // an organizer is an ordinary attendee to everybody else in this product.
    const naming = changedByThisFeature()
      .filter((path) => /\.tsx?$/.test(path))
      .filter((path) => /changedBy|actor|\bactId\b|lastChangeAct/i.test(codeAtHead(path)))

    expect(
      naming,
      'MyNet names the actor behind a change. The marker says a saved session changed; who ' +
        'changed it is administrative accountability, recorded in the audit trail and readable ' +
        'from nowhere (FR-999).',
    ).toEqual([])
  })

  /**
   * **The marker is not conditioned on anything about the reader**, stated positively over the
   * component that renders it.
   *
   * The categorical patterns above would miss a rendering keyed on something derived — a role
   * read from a profile field, say. This reads the prop instead: one boolean, supplied by the
   * server-computed payload, with no second input.
   */
  it('renders the marker from server state alone, with no reader-dependent input (FR-1030)', () => {
    const presentation = codeOnly(join(webSrc, 'app/SessionPresentation.tsx'))

    expect(presentation).toMatch(/changed\s*&&/)
    expect(
      /changed\s*&&[^\n]{0,120}\b(tier|role|isOperator|isOrganizer)\b/.test(presentation),
      'The marker’s rendering consults something about the reader. It is computed server-side ' +
        'as `logistics_changed_at > viewed_at` for THIS attendee and arrives as a boolean; any ' +
        'second input is a rendering rule about who is looking (FR-1003).',
    ).toBe(false)
  })

  it('imports nothing from the administrative client (SC-1008)', () => {
    const importing = all
      .filter((path) => /from\s+['"][^'"]*apps\/admin|@mynet\/admin/.test(codeOnly(path)))
      .map(label)

    expect(
      importing,
      'MyNet imports from the administrative client. They are two applications on two origins ' +
        'precisely so there is nothing to exclude — a shared import is the first step back to ' +
        'one product with two faces.',
    ).toEqual([])
  })
})
