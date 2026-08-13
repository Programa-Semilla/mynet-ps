import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T011 (014) — **nothing but the guard may produce a conference authority** (FR-1035, research
 * R2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS SCANS `src/` ONLY, AND THAT BOUNDARY IS THE ASSERTION RATHER THAN A CONVENIENCE.**
 *
 * 013's equivalent records the reason and it applies unchanged: **a test fabricating a scope
 * proves nothing about what a request can reach.** The population that matters is the code a
 * request executes. Including `tests/` would fail this file on its own neighbour —
 * `conference-authority-brand.test.ts` names the type deliberately, in order to prove a forged
 * one is refused.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT THIS ASSERTS IS DIFFERENT FROM 013's, BECAUSE THE FILE LAYOUT IS DIFFERENT.**
 *
 * `admin/scope.ts` splits its classes from its guards, so its minting functions **must** be
 * exported and `admin-scope-brand.test.ts` names the two modules permitted to import them. That
 * is a sole-**importer** assertion, and it is weaker than a module-private constructor by exactly
 * one reviewable test.
 *
 * 014 keeps its class and its guard in one file, so there is no export to police: the stronger
 * guarantee is available for free. This asserts that the arrangement **stays** that way, which is
 * a different claim from "no export exists today" — the natural way to break it is somebody
 * needing a scope in a script or a job and exporting the constructor to get one, at which point
 * every write in `admin-catalog.ts` becomes reachable without authority.
 *
 * If you are here because this failed: the answer is not to export a mint. It is to obtain a
 * scope through a real request, or to explain in review why the write is not administrative.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const GUARD = 'admin/require-conference-authority.ts'

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

/** 009's stripper: every name below appears in the prose explaining this rule. */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(apiSrc)

describe('only the guard module may produce a conference authority', () => {
  it('found source files to scan', () => {
    // A gate that cannot fail is not a gate.
    expect(files.length).toBeGreaterThan(30)
  })

  it('names the scope class in exactly one module', () => {
    const naming = files
      .filter((path) => /\bVerifiedConferenceAuthority\b/.test(codeOnly(path)))
      .map((path) => path.slice(apiSrc.length))
      .sort()

    expect(
      naming,
      'A module other than the guard names the conference-authority class. The class is not ' +
        'exported precisely so that `new` is unavailable elsewhere — which is the guarantee ' +
        "013's split had to replace with a sole-importer test. Constructing one outside the " +
        'guard fabricates authority over a conference (FR-1035).',
    ).toEqual([GUARD])
  })

  it('exports no way to mint one', () => {
    const guard = codeOnly(join(apiSrc, GUARD))

    // The class itself, and the private factory beside it. Both must stay unexported: an exported
    // `mint` is the shape 013 was forced into, and it costs the guarantee this file protects.
    expect(
      guard,
      'The scope class is exported. That makes `new VerifiedConferenceAuthority(...)` available ' +
        'to any module, and the WeakSet membership check is the only thing left standing — ' +
        'which a caller can satisfy by never asking.',
    ).not.toMatch(/export\s+(abstract\s+)?class\s+VerifiedConferenceAuthority/)

    expect(
      guard,
      'The minting function is exported. Nothing outside this module has a legitimate reason to ' +
        'produce a scope: a write that has no request behind it has no authority behind it ' +
        'either.',
    ).not.toMatch(/export\s+const\s+mint\b/)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE OTHER WAY THE PREDICATE ESCAPES: NOT BY MINTING A SCOPE, BUT BY RE-DERIVING THE CHECK
   * SOMEWHERE ELSE AND BRANCHING ON A BOOLEAN.**
   *
   * Research R2 rejected exactly that shape — *"check assignment inside each query function"* —
   * on the ground that every call site can forget, and a forgotten one is invisible to every
   * route audit. A sole-importer assertion over the class does not catch it, because the second
   * implementation never names the class.
   *
   * So the **table** gets a reader list too. Every entry below reads `organizer_assignments` for
   * a question that is not "may this principal author this conference", and each one says which:
   * a second module answering *that* question is a second authority model, and the one that
   * drifts is the one somebody calls.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const LEGITIMATE_READERS = new Map<string, string>([
    [GUARD, 'Authority over one named conference. This is the question; everything else is not.'],
    [
      'admin/require-operator.ts',
      'Whether this attendee holds ANY live assignment, which is what makes them an ' +
        'administrative principal at all (FR-905). Deliberately says nothing about which ' +
        'conference — an organizer with one assignment may sign in, and reaches nothing until ' +
        'this guard runs.',
    ],
    [
      'admin/identity.ts',
      'Resolving an administrative sign-in to a principal. Same question as the guard above, at ' +
        'the moment a session is created rather than on each request.',
    ],
    [
      'db/queries/admin-assignments.ts',
      'Promotion, demotion and the conference list — the module that OWNS these rows. It writes ' +
        'them under a `PlatformScope`, which is a different predicate from authoring under this ' +
        'one (FR-930, decision 32).',
    ],
    [
      'db/queries/account.ts',
      'Revoking assignments inside account deletion and conference withdrawal (FR-960, FR-961, ' +
        'decision 39). Authority must not outlive the access it depends on.',
    ],
    [
      'db/queries/admin-catalog.ts',
      'Writing the self-assignment a creating organizer receives, in the same transaction as the ' +
        'conference (FR-1008). It **writes** a row and never reads one to decide anything: the ' +
        'authority question for every other function in that module is answered by the ' +
        '`ConferenceAuthorityScope` they demand.',
    ],
    [
      'db/queries/operators.ts',
      'The retention sweep, which may not clear a deactivated operator while an assignment ' +
        'still names them as the grantor (FR-909).',
    ],
    [
      'db/schema/organizer-assignments.ts',
      'The table definition itself, which cannot read anything and is matched only because it ' +
        'declares the name every reader imports.',
    ],
    [
      'db/seed/operators.ts',
      'The fixture, which clears these rows so `DELETE FROM events` can proceed (FR-937).',
    ],
  ])

  it('is the only module that reads an organizer assignment to decide conference authority', () => {
    const readers = files
      .filter((path) => /\borganizerAssignments\b/.test(codeOnly(path)))
      .map((path) => path.slice(apiSrc.length))
      .sort()

    expect(
      readers,
      'A module reads `organizer_assignments` and is not one of the readers declared above. If ' +
        'it is deciding whether somebody may act on a conference, that decision belongs in ' +
        '`requireConferenceAuthority` and must produce a scope — a boolean check at a call site ' +
        'is invisible to the route audits and can be forgotten one write path at a time ' +
        '(research R2). If it is answering a different question, add it above and say which.',
    ).toEqual([...LEGITIMATE_READERS.keys()].sort())

    for (const [module, reason] of LEGITIMATE_READERS) {
      expect(reason.length, `${module} is declared without a written reason`).toBeGreaterThan(60)
    }
  })
})
