import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T016 (011) — **the administrative guards consult neither verification nor discoverability**
 * (FR-907).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **"VERIFICATION GATES EXACTLY ONE THING" IS A PROJECT INVARIANT, AND A SECOND CONSUMER OF IT
 * IS A GOVERNANCE CHANGE RATHER THAN A REFACTOR.**
 *
 * The invariant, stated in CLAUDE.md under Architectural invariants and inherited from 004: *an
 * unverified attendee uses the product fully and appears to nobody* — so any profile that can be
 * read already carries a verified address, and **no feature may use verification state for
 * anything else.**
 *
 * This feature is the first with a plausible-sounding reason to break it. "Surely we shouldn't
 * promote somebody who hasn't verified their email" is an entirely reasonable sentence, and it
 * is wrong here for two reasons:
 *
 *   1. It would make verification gate a **second** thing, quietly, in the feature that
 *      introduces a second actor — exactly the shape of change the invariant exists to catch.
 *      009 recorded the same refusal for its author join: consulting verification there "would
 *      be a second use of a signal the constitution reserves for discoverability alone".
 *
 *   2. It would make administrative authority depend on a signal an *attendee* controls. An
 *      operator promoting somebody has decided they hold authority over a conference; that
 *      decision must not be silently undone by a mail server.
 *
 * **Discoverability is the same argument from the other side.** It governs being *found* in the
 * directory, and 008 already recorded that a held card resolves a profile with no discoverability
 * condition because discoverability governs being found, not being remembered. An organizer who
 * has turned discoverability off is still an organizer, and a promotion dialog that could not
 * find them would make administrative authority depend on an unrelated privacy preference.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Scoped to `src/admin/**` — the guards and the session — rather than to every administrative
 * file. `routes/admin/conferences.ts` legitimately reads attendee rows to promote somebody, and
 * a blanket ban would be a rule nobody could satisfy. What must never happen is a *guard*
 * deciding whether a principal is authorised by looking at either signal.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const adminSrc = fileURLToPath(new URL('../../src/admin/', import.meta.url))

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * 009's stripper, and it is doing real work here: the words `verified` and `discoverab` appear
 * repeatedly in the comments of these very files, explaining why they are not consulted.
 * Matching raw text would fail on a correct implementation.
 */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(adminSrc)

const offenders = (pattern: RegExp): string[] =>
  files
    .filter((path) => pattern.test(codeOnly(path)))
    .map((path) => path.slice(adminSrc.length))
    .sort()

describe('011 — administrative authority reads no attendee-privacy signal', () => {
  it('found administrative guard sources to scan', () => {
    expect(files.length).toBeGreaterThan(2)
  })

  it('consults no verification state (FR-907)', () => {
    expect(
      offenders(/\b(emailVerifiedAt|email_verified_at|verifiedAt|isVerified)\b/),
      'An administrative guard consults verification state. Verification gates EXACTLY ONE ' +
        'thing in this product — discoverability — and a second consumer of it is a governance ' +
        "change, not a refactor (FR-907). An operator's authority must not be undone by a mail " +
        'server.',
    ).toEqual([])
  })

  it('consults no discoverability setting (FR-907)', () => {
    expect(
      offenders(/\bdiscoverab/i),
      'An administrative guard consults discoverability. It governs being FOUND in the ' +
        "directory, not being remembered (008's card-resolution reasoning) and certainly not " +
        'whether somebody holds authority over a conference (FR-907).',
    ).toEqual([])
  })

  /**
   * **The positive half**: an organizer's authority comes from a live assignment and nothing
   * else. Asserted so this file does not read as a pure prohibition — the guard has to consult
   * *something*, and naming what keeps a later reader from concluding the check is missing.
   */
  it("derives an organizer's authority from a live assignment", () => {
    const guard = codeOnly(join(adminSrc, 'require-operator.ts'))
    expect(
      /organizerAssignments/.test(guard),
      "The operator guard does not consult `organizer_assignments`. A conference organizer's " +
        'authority IS a live assignment (FR-931) — there is no other source for it.',
    ).toBe(true)
    expect(
      /revokedAt/.test(guard),
      'The operator guard does not exclude revoked assignments. A revoked assignment is ' +
        'history, and authority must not outlive the access it depends on (decision 39).',
    ).toBe(true)
  })
})
