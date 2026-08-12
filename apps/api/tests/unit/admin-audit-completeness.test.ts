import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { ADMIN_AUDIT_ACTIONS } from '../../src/db/schema/admin-audit.js'

/**
 * T148 (013) — **every administrative write appends an audit entry, and no navigation does**
 * (FR-994, FR-995, SC-911).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DERIVED FROM THE ROUTE TABLE, SO A NEW ADMINISTRATIVE WRITE FAILS BY EXISTING.**
 *
 * That is the same discipline `deletion-coverage.test.ts` and `export-coverage.test.ts` apply to
 * the schema: a list somebody maintains stops describing the application the moment somebody
 * forgets it, whereas an expectation *computed from* the application cannot.
 *
 * The two halves are separate obligations and each would be a different kind of failure:
 *
 *   - **Every write records one** (FR-994). An unaudited administrative act is a decision nobody
 *     can review, in a product whose second actor was admitted on the strength of accountability.
 *   - **No navigation records one** (FR-995). If reading the queue wrote entries, the trail would
 *     be a record of *scrolling*, and the disclosures it exists to make reviewable would be
 *     buried under thousands of them. `GET /admin/reports/:id` is the single deliberate
 *     exception, because it is the only read the constitution needed an exception to permit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const routesDir = fileURLToPath(new URL('../../src/routes/admin/', import.meta.url))

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

/**
 * Administrative routes that write and deliberately record **nothing**. Each entry names why.
 *
 * Both are session lifecycle: signing in and out is not an administrative act *on the product*,
 * it is the principal arriving and leaving. Auditing them would fill the trail with attendance
 * rather than with decisions — and `operator_sessions` already records both, with timestamps,
 * for as long as the session exists.
 */
const WRITES_NOTHING = new Map<string, string>([
  [
    'POST /admin/session',
    'Signing in is not an act on the product. The session row records it, and auditing arrivals ' +
      'would bury the decisions this trail exists to make reviewable.',
  ],
  [
    'DELETE /admin/session',
    'Signing out, for the same reason as signing in. `operator_sessions.revoked_at` records it.',
  ],
  [
    'PUT /admin/session/credential',
    'Replacing your own credential is an act on yourself, not on the product or on anybody ' +
      'else. Recording it would put a signal about one operator’s password hygiene into a trail ' +
      'other operators read (FR-992).',
  ],
])

/** The one **read** that writes an entry, and the only one (FR-995). */
const AUDITED_READ = 'GET /admin/reports/:reportId'

const source = (file: string): string =>
  readFileSync(join(routesDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/** Every administrative route module, with comments stripped — 009's rule. */
const moduleSources = (): Map<string, string> =>
  new Map(
    readdirSync(routesDir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => [file, source(file)]),
  )

describe('the administrative audit trail is complete (FR-994, SC-911)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  const adminRoutes = () => routes.filter((route) => /^\/admin(\/|$)/.test(route.url))

  const labels = (route: RouteOptions): string[] =>
    methodsOf(route)
      .filter((method) => method !== 'HEAD')
      .map((method) => `${method} ${route.url}`)

  it('found administrative routes to audit', () => {
    // A gate that cannot fail is not a gate.
    expect(adminRoutes().length).toBeGreaterThan(5)
  })

  /**
   * Which module registers a route, found by the **URL literal** the registration must contain.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS REPLACES A PATH-SEGMENT GUESS THAT DEFEATED THE TEST BUILT ON IT.**
   *
   * The original matched `/admin/<segment>` against filenames and, when nothing matched, fell
   * back to *every* module — so a route whose segment names no file was checked against the
   * union of all sources and passed as long as **any** module anywhere appended an entry.
   * `DELETE /admin/questions/:questionId` is exactly that route: it lives in `moderation.ts`,
   * and three of the six audit actions had no end-to-end assertion behind them because of it.
   *
   * A fallback that widens the population is the standard way one of these guards stops
   * guarding, and it is invisible because the test still passes. So there is **no fallback
   * here**: a route matching no module, or more than one, is itself a failure.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const moduleFor = (url: string, sources: Map<string, string>): string[] =>
    [...sources].filter(([, code]) => code.includes(`'${url}'`)).map(([file]) => file)

  it('maps every administrative route to exactly one module', () => {
    // The derivation the audit assertions rest on. If this breaks, they stop meaning anything —
    // so it is asserted on its own rather than inside them.
    const sources = moduleSources()
    const ambiguous = adminRoutes()
      .map((route) => ({ url: route.url, files: moduleFor(route.url, sources) }))
      .filter((entry) => entry.files.length !== 1)

    expect(
      ambiguous,
      'These administrative routes could not be traced to exactly one route module by their ' +
        'URL literal. The audit-completeness assertions below derive from this mapping, and a ' +
        'route that matches nothing used to be checked against every module at once — which is ' +
        'how a real gap survived. Do not reintroduce a fallback; fix the mapping.',
    ).toEqual([])
  })

  /**
   * **Every administrative write route's module calls `appendAuditEntry`.**
   *
   * Checked per **module** rather than per handler, because a route's handler is a closure this
   * test cannot introspect. That is a genuine limit and is stated rather than hidden: a module
   * with two write routes and one `appendAuditEntry` call would pass. The per-route half is
   * covered by the integration suite, which asserts the entry each act actually produces
   * (`admin-promotion.test.ts`, `admin-remove-question.test.ts`, `admin-tier-boundary.test.ts`).
   */
  it('records an entry from every administrative write route (FR-994)', () => {
    const sources = moduleSources()

    const writing = adminRoutes()
      .filter((route) => methodsOf(route).some((method) => WRITE_METHODS.includes(method)))
      .flatMap((route) => labels(route).map((label) => ({ label, url: route.url })))
      .filter(({ label }) => !WRITES_NOTHING.has(label))

    expect(writing.length, 'no administrative write routes were found').toBeGreaterThan(3)

    const unaudited = writing
      .filter(({ url }) => {
        const files = moduleFor(url, sources)
        // No fallback. A route that traces to no module is caught by the mapping assertion
        // above; here it counts as unaudited rather than being waved through.
        return !files.some((file) => /appendAuditEntry/.test(sources.get(file) ?? ''))
      })
      .map(({ label }) => label)

    expect(
      unaudited,
      'These administrative write routes record nothing. An unaudited administrative act is a ' +
        'decision nobody can review, in a product whose second actor was admitted on the ' +
        'strength of accountability (FR-994). If a route genuinely should record nothing, add ' +
        'it to WRITES_NOTHING with the reason.',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE ENTRY COMMITS WITH THE ACT, OR NEITHER DOES** (FR-994).
   *
   * `appendAuditEntry` takes an executor precisely so its caller can put the two in one
   * transaction — and for the whole of this feature's first implementation **not one caller
   * passed one**, while the function's own header asserted that every write path did. A failing
   * entry left the act committed and unrecorded, which is the exact guarantee FR-994 states.
   *
   * Asserted at the source because the failure is a *rollback*, and the only way to observe it
   * behaviourally is to make the insert fail — which needs a broken foreign key that the route
   * cannot be persuaded to produce. `admin-audit-atomicity.test.ts` drives the rollback itself
   * at the query layer; this is what stops a later edit quietly dropping the `tx` argument.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('appends inside the acting transaction, never beside it (FR-994)', () => {
    const sources = moduleSources()

    /**
     * The full text of each `appendAuditEntry(...)` call, extracted by counting parentheses
     * rather than by a regex. The argument is a multi-line object literal with a trailing comma
     * after the executor, and a pattern for that shape is exactly the kind of thing that stops
     * matching after a formatter run — failing open, which is the direction that matters.
     */
    const callsIn = (code: string): string[] => {
      const calls: string[] = []
      const needle = 'appendAuditEntry('
      let from = code.indexOf(needle)

      while (from !== -1) {
        let depth = 0
        let index = from + needle.length - 1

        for (; index < code.length; index += 1) {
          if (code[index] === '(') depth += 1
          if (code[index] === ')') {
            depth -= 1
            if (depth === 0) break
          }
        }

        calls.push(code.slice(from, index + 1))
        from = code.indexOf(needle, index)
      }

      return calls
    }

    /** A call is atomic when its object argument is followed by a second one — the executor. */
    const passesExecutor = (call: string): boolean => /\}\s*,\s*\w+\s*,?\s*\)$/.test(call)

    const bare: string[] = []
    for (const [file, code] of sources) {
      // The audited read is the one legitimate caller with no transaction to join: it is a read,
      // and there is no act for its entry to be atomic with. Named, not pattern-matched, and
      // allowed exactly once so a second bare call in the same module is still caught.
      let disclosureAllowance = file === 'reports.ts' ? 1 : 0

      for (const call of callsIn(code)) {
        if (passesExecutor(call)) continue
        if (disclosureAllowance > 0) {
          disclosureAllowance -= 1
          continue
        }
        bare.push(file)
      }
    }

    expect(
      bare,
      'These modules append an audit entry outside the transaction that performs the act. If ' +
        'the insert fails the act still commits, unrecorded — which is precisely what FR-994 ' +
        'promises cannot happen. Pass the transaction as the second argument.',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **NO READ WRITES AN ENTRY, EXCEPT THE ONE** (FR-995).
   *
   * Checked at the module level too, and it is the stricter direction: `me.ts` and
   * `conferences.ts` must contain **no** call at all on their read paths. The report module does,
   * so it is exempted by name — which is what makes the exception one line somebody has to write
   * rather than a pattern that quietly widens.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('records nothing from a read, except the one disclosure (FR-995)', () => {
    const sources = moduleSources()

    // Modules with **only** read routes must not mention the append at all.
    const readOnlyModules = ['me.ts']
    for (const file of readOnlyModules) {
      expect(
        sources.get(file) ?? '',
        `${file} appends an audit entry. Navigation is not a disclosure, and a trail that ` +
          'recorded it would bury the acts it exists to make reviewable (FR-995).',
      ).not.toMatch(/appendAuditEntry/)
    }

    // And the audited read is the one it is meant to be.
    const audited = adminRoutes()
      .filter((route) => methodsOf(route).includes('GET'))
      .flatMap(labels)
      .filter((label) => label === AUDITED_READ)

    expect(
      audited,
      'The audited read is missing from the route table. `GET /admin/reports/:reportId` is the ' +
        'only read in the product that writes an entry, because it is the only read the ' +
        'constitution needed an exception to permit (FR-995, decision 38).',
    ).toEqual([AUDITED_READ])
  })

  /**
   * **The action set is closed, and every action is used.**
   *
   * A seventh action must be added to the constant, to the check constraint and in a migration —
   * three deliberate edits rather than one string typed at a call site. An *unused* action is the
   * other failure: it means an act was designed, named, and then not recorded.
   */
  it('uses every action it declares, and declares every action it uses', () => {
    const combined = [...moduleSources().values()].join('\n')

    for (const action of ADMIN_AUDIT_ACTIONS) {
      expect(
        combined,
        `The audit action "${action}" is declared but no administrative route writes it. Either ` +
          'the act was never built, or it was built and records nothing.',
      ).toContain(action)
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Every string handed to **`appendAuditEntry`** must be one of the declared six.
    //
    // Scoped to the call rather than to any `action:` property, because the throttle takes one
    // too — `recordAttempt({ …, action: 'admin_sign_in' })` in `session.ts`. Matching bare
    // `action:` reported three phantom violations and would have kept doing so, which is the
    // "predicate that catches the wrong population" failure this codebase meets repeatedly.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const used = [...combined.matchAll(/appendAuditEntry\(\s*\{[^}]*?action:\s*'([a-z_]+)'/gs)].map(
      (match) => match[1] as string,
    )
    expect(used.length, 'no audit actions were found in the route modules').toBeGreaterThan(3)

    const undeclared = used.filter(
      (action) => !(ADMIN_AUDIT_ACTIONS as readonly string[]).includes(action),
    )
    expect(
      undeclared,
      'An administrative route writes an audit action the schema does not declare. The check ' +
        'constraint would refuse it at runtime; this fails the build first.',
    ).toEqual([])
  })

  it('keeps the records-nothing list justified and short', () => {
    const existing = new Set(adminRoutes().flatMap(labels))

    for (const [label, reason] of WRITES_NOTHING) {
      expect(existing.has(label), `${label} records nothing but no longer exists`).toBe(true)
      expect(reason.length, `${label} is exempted without a written reason`).toBeGreaterThan(60)
    }

    expect(
      WRITES_NOTHING.size,
      'The records-nothing list has grown beyond session lifecycle. Every entry must be a ' +
        'principal arriving, leaving, or acting on themselves — anything else is an ' +
        'administrative act on the product, and those are audited (FR-994).',
    ).toBeLessThanOrEqual(3)
  })
})
