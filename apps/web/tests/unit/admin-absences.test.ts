import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T012 (011) — **MyNet gains nothing, and this is where that stops being a promise** (FR-970,
 * FR-971, FR-972, FR-973, SC-907).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ABSENCE OF AN ADMINISTRATIVE SURFACE IN THE ATTENDEE PRODUCT IS WHAT KEEPS PRINCIPLE
 * III TRUE WHILE ITS ACTOR CLAUSE CHANGES.**
 *
 * Constitution v4.0.0 reversed the oldest prohibition in this project and admitted a second
 * actor. It is a MAJOR amendment, and the reason it is nonetheless *smaller* than the
 * prohibition it reverses is decision 33: administration is a **separate website**, and MyNet
 * itself gains no admin surface, no privileged view, and no role-dependent rendering.
 *
 * The amendment says that must be **testable as an absence rather than asserted in prose**.
 * This file is that test.
 *
 * Every one of these absences looks like an omission to a later reader, and each would be filled
 * in perfectly good faith by somebody trying to help — "the organizer is already signed in, why
 * make them switch sites?" is a reasonable-sounding question with a governance answer. A tier
 * check in `apps/web` would be one line, would pass every other gate, and would quietly convert
 * two products into one product with two faces.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Comments are stripped before matching**, which is 009's rule and is load-bearing here for
 * the same reason: the words this file searches for — `operator`, `organizer`, `admin` — appear
 * throughout the attendee client's *prose*, including in comments explaining these very
 * absences and in `mail.operatorAddress`'s lineage. Matching raw text would fail on a correct
 * implementation, and the natural repair is to weaken the pattern until it checks nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** 009's stripper, unchanged. See `apps/api/tests/unit/qa-absences.test.ts` for why. */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(webSrc)

const offenders = (pattern: RegExp): string[] =>
  files
    .filter((path) => pattern.test(codeOnly(path)))
    .map((path) => path.slice(webSrc.length))
    .sort()

describe('011 — MyNet gains no administrative surface', () => {
  it('found source files to scan', () => {
    // A gate that cannot fail is not a gate. If the walker ever returned nothing, every
    // assertion below would pass vacuously — 010's review found exactly that shape of defect.
    expect(files.length).toBeGreaterThan(50)
  })

  /**
   * **FR-970 — no administrative route or screen.**
   *
   * Matched on the *address*, not on the word: a string like `/admin` in a `path`, a `to`, or a
   * `navigate()` call is what would actually put an administrative screen in this product. The
   * word "administration" in a sentence is not, which is why comments are stripped first.
   */
  it('registers no administrative address (FR-970)', () => {
    expect(
      offenders(/['"`]\/admin(\/|['"`])/),
      'The attendee client names an administrative address. Administration is a separate ' +
        'website on `admin.<host>` (decision 37) — its own origin, its own session, its own ' +
        'service-worker scope. An address here would be the first step back to one product ' +
        'with two faces.',
    ).toEqual([])
  })

  /**
   * **FR-971 — no navigation entry.**
   *
   * `navigation.ts` is an append-only extension point: a destination declares its own element
   * and nested addresses, and `routes.tsx` names no address literally. That design makes adding
   * a sixth destination a one-line change, which is exactly why this assertion is worth having.
   */
  it('declares no administrative destination (FR-971)', () => {
    const navigation = readFileSync(join(webSrc, 'app/navigation.ts'), 'utf8')
    expect(
      /admin|operator|organiz/i.test(
        navigation.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '),
      ),
      'The attendee navigation contract names an administrative destination. There are five ' +
        'destinations and there is no sixth (FR-971).',
    ).toBe(false)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-973 — nothing in MyNet renders differently for a promoted attendee.**
   *
   * This is the subtlest of the four and the one most likely to arrive by accident. Decision 33
   * says *"a promoted organizer's attendee experience must be unchanged in every observable
   * way"* — not merely that they see no admin controls, but that nothing at all branches on
   * tier. A badge saying "Organizer" beside their name in Discover would satisfy a naive
   * reading of "no admin surface" and break this one.
   *
   * Matched by looking for the *identifiers* a tier check would need. The attendee client has no
   * legitimate reason to name any of them: it never learns that operators exist, and the API
   * never tells it (FR-903, asserted separately in `admin-forbidden-surfaces.test.ts`).
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('branches on no administrative tier (FR-973)', () => {
    expect(
      offenders(/\b(isOperator|isOrganizer|isAdmin|operatorTier|adminTier|organizerFor)\b/),
      "The attendee client branches on an administrative tier. A promoted attendee's MyNet " +
        'experience must be unchanged in every observable way (decision 33, FR-973) — including ' +
        'no badge, no extra control, and no reordered list.',
    ).toEqual([])
  })

  /**
   * **FR-972 — FR-548 survives here.**
   *
   * v4.1.0's decision 38 grants platform operators a read of reported content, and grants it in
   * **the administrative product only**. The attendee product's guarantee is unchanged: nothing
   * in MyNet reads a report, and the reporter is still told nothing at all.
   *
   * `apps/api/tests/unit/no-report-read-surface.test.ts` covers the API's attendee surface and
   * is narrowed by T151 to say so. This covers the client.
   */
  it('reads no report anywhere (FR-972, FR-548)', () => {
    const reading = files
      .filter((path) => {
        const code = codeOnly(path)
        // A report is *filed* from `app/safety/`, which is correct and must keep working. What
        // must not exist is a read: a list, a detail, a status, a queue.
        return (
          /\breports\b/.test(code) &&
          /\b(listReports|getReport|reportQueue|reportDetail)\b/.test(code)
        )
      })
      .map((path) => path.slice(webSrc.length))

    expect(
      reading,
      'The attendee client reads reports. FR-548 survives for MyNet (FR-972): the queue exists ' +
        'only in the administrative product, only for the platform tier, and the reporter is ' +
        'still promised nothing they can observe.',
    ).toEqual([])
  })

  /**
   * **The attendee client takes no dependency on the administrative one**, in either direction.
   *
   * Not a numbered requirement, and the reason it is here anyway: every requirement above is a
   * statement about *what MyNet contains*, and the cheapest way to violate all four at once
   * would be an import. `apps/admin` deliberately imports nothing from `apps/web` either — its
   * `main.tsx` header records that a shared bootstrap is the shortest route back to one
   * application with two faces.
   */
  it('imports nothing from the administrative client', () => {
    expect(
      offenders(/from\s+['"][^'"]*apps\/admin/),
      'The attendee client imports from `apps/admin`. The two products share design tokens and ' +
        'brand assets, and nothing else.',
    ).toEqual([])
  })
})
