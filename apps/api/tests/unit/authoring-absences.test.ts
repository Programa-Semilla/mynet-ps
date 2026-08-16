import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T066 (014) — **the server half: the count exists in exactly one place, and no route offers a
 * change list** (FR-1031, SC-1009, constitution v5.2.0 N2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A CLIENT CANNOT RENDER A COUNT IT IS NEVER SENT, AND THAT IS THE POINT OF ASSERTING IT
 * HERE AS WELL AS THERE.**
 *
 * `apps/web/tests/unit/authoring-absences.test.tsx` asserts that no **view** presents an
 * aggregate. That guard is about restraint: the data would be available and nobody renders it.
 * This one is about supply — a route that answered `GET /events/:id/changes` with
 * `{ count, sessions }` would make the client-side absence one commit away from ending, and the
 * commit that ended it would look like plumbing rather than like a governance change.
 *
 * **v5.2.0 N2 permits the count in the payload and forbids it everywhere else.** The payload is
 * `payloadFor` in `routes/admin/catalog.ts`, guarded by `coalesced-payload.test.ts`. Everywhere
 * else means: not in an HTTP response, not in a route address, not as a stored column somebody
 * could later read cheaply.
 *
 * The stored-column rule is the one worth spelling out, because it is the plausible optimisation.
 * The marker is computed as `logistics_changed_at > viewed_at` at read time — two timestamps the
 * schema already carries. A `changed_count` column on `attendees` or `registrations` would be
 * faster, would satisfy FR-1030 exactly, and would be an inbox with no screen yet: 009 records
 * the same reasoning for vote counts (*"a denormalised counter is a second source of truth for a
 * number the rows already answer"*), and here the second source of truth is also a prohibited
 * aggregate.
 *
 * Comments are stripped before matching, as 009's guards do — every word below appears in the
 * prose above and in the implementation's own headers.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(apiSrc)
const label = (path: string): string => path.slice(apiSrc.length)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const labelsOf = (route: RouteOptions): string[] =>
  methodsOf(route).map((method) => `${method} ${route.url}`)

describe('014 — the count lives only in the payload (FR-1031, SC-1009)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes and source to audit', () => {
    expect(routes.length).toBeGreaterThan(5)
    expect(files.length).toBeGreaterThan(30)
  })

  /**
   * **No address is about changes.** A path is a promise: `/changes` is an inbox whatever its
   * handler returns today, and it is the address a "just show them what changed" commit reaches
   * for first.
   */
  it('registers no route addressing changes or updates (FR-1031, FR-1034b)', () => {
    const offering = routes
      .filter((route) => /\b(changes|updates|activity|whats-new|feed|inbox)\b/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      offering,
      'A route addresses "what changed". Activating a coalesced notification must land on the ' +
        'destination carrying the per-row markers and never on a list of changes (FR-1034b) — ' +
        'and a route offering that list is the surface v5.2.0 N2 forbids, whether or not a ' +
        'notification points at it.',
    ).toEqual([])
  })

  /**
   * **No response carries a count of changes.**
   *
   * Matched over the route modules' response schemas rather than over handlers: this codebase
   * declares what every route returns, so the schema is where a new field appears first and is
   * the one place it cannot be added implicitly.
   */
  it('declares no change-count field in any route response schema (FR-1031)', () => {
    const routeFiles = files.filter((path) => path.startsWith(join(apiSrc, 'routes')))
    const declaring = routeFiles
      .filter((path) =>
        /\b(changedCount|changeCount|unviewedCount|changedSessions|pendingChanges)\b/.test(
          codeOnly(path),
        ),
      )
      .map(label)

    expect(
      declaring,
      'A route response carries a count of changes. The count is permitted in the NOTIFICATION ' +
        'payload alone (FR-1034a) — an interruption is a single event and the count is what ' +
        'makes it legible. In a response body it is a number for a screen to render.',
    ).toEqual([])
  })

  /**
   * **The agenda payload carries a per-session boolean and no total**, stated positively.
   *
   * This is the response the marker actually travels on (research R7), so it is the one that
   * would gain a total if anybody added one.
   */
  it('carries the marker as a per-session boolean on the agenda payload (FR-1030)', () => {
    const agenda = codeOnly(join(apiSrc, 'routes', 'events', 'agenda.ts'))

    expect(
      /changedSinceViewed/.test(agenda),
      'The agenda payload no longer carries the marker. R7 puts it on the EXISTING payload ' +
        'precisely so this feature declares no new cached read and adds no repository member.',
    ).toBe(true)

    expect(
      /changedSinceViewed\s*:\s*\{\s*type:\s*'boolean'/.test(agenda) ||
        /changedSinceViewed:\s*\{\s*type:\s*'boolean'/.test(agenda),
      'The marker is not declared as a boolean in the agenda response schema. Per-row state ' +
        'about ONE session is a boolean; a number is an aggregate wherever it is rendered ' +
        '(FR-1031).',
    ).toBe(true)
  })

  /**
   * **No stored aggregate**, which is the plausible optimisation rather than the obvious breach.
   *
   * Derived from the schema modules, so a column added anywhere is caught rather than a column
   * added to the table somebody thought of.
   */
  it('stores no change count on any table (FR-1031)', () => {
    const schemas = sourceFiles(join(apiSrc, 'db', 'schema'))
    const storing = schemas
      .filter((path) =>
        /\b(changedCount|changeCount|unviewedCount|unreadChanges|pendingChanges)\b/i.test(
          codeOnly(path),
        ),
      )
      .map(label)

    expect(
      storing,
      'A table stores a count of changes. The marker is computed as ' +
        '`logistics_changed_at > viewed_at` from two timestamps the schema already carries — a ' +
        'counter column would be a second source of truth (009’s reasoning for vote counts) AND ' +
        'a prohibited aggregate waiting for a screen.',
    ).toEqual([])
  })

  /**
   * **The count appears in exactly one function**, which pins N2's permission to the one place it
   * was granted.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS GUARD USED TO END WITH A FILTER THAT THREW AWAY MOST OF WHAT IT HAD FOUND.**
   *
   * The last step was `.filter((path) => /session-changes|agenda|notifications/.test(path))` —
   * applied *after* the exemptions, so a file building a `count:` anywhere outside those three
   * substrings was **discarded rather than reported**. `db/queries/change-summary.ts`,
   * `routes/events/whats-new.ts`, a helper in `src/notify/` — every one would have passed a guard
   * whose stated job is to find exactly that.
   *
   * It was a narrowing written to make the guard green against the files that existed, and it is
   * the shape this project has already shipped twice: 010's precache assertion that skipped on
   * every CI run, and 009's absence guards that matched the prose explaining the absence. The
   * repair is always the same — turn the narrowing into an **allow-list with reasons**, so a new
   * file fails by existing and the "no" has to be written down.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  /**
   * The files permitted to build a `count:`, each with what the count is *of*.
   *
   * **DO NOT ADD A FILE HERE TO MAKE A FAILURE GO AWAY.** The question is whether the number
   * counts *changed saved sessions* — the aggregate v5.2.0 N2 permits in a notification payload
   * and forbids everywhere it could become something to look at. Any other aggregate needs its
   * own line here saying what it counts, and one that does count changes needs an amendment.
   *
   * Two of these were **found by broadening the guard**, and neither was known to it before: the
   * old trailing filter discarded anything outside three path substrings, so `auth/throttle.ts`
   * and `db/seed/operators.ts` had never been examined at all.
   */
  const PERMITTED: Record<string, string> = {
    'routes/admin/catalog.ts':
      'payloadFor — the one place v5.2.0 N2 grants the count, guarded by coalesced-payload.test.ts',
    'db/queries/directory.ts':
      "006's shared-interest count and its keyset cursor. Counts interests on a card the reader " +
      'can already see, and ranks by it (FR-411, FR-412)',
    'auth/throttle.ts':
      "010's FailureStreak — how many consecutive failures an identifier has, which is the " +
      'delay function itself. Never leaves the server and names no session',
    // `db/seed/operators.ts` held a permission here for its table-wide credential self-check.
    // 012's T003 narrowed that check to the rows a call inserts — `returning` inspected in
    // memory, no `count:` built — so the permission is removed rather than left to describe a
    // count that no longer exists. This guard is what noticed, which is it working as designed.
  }

  /** Every file that builds a `count:`, with comments stripped and separators normalised. */
  const buildingACount = (): string[] =>
    files
      .filter((path) => /\bcount\s*:/.test(codeOnly(path)))
      .map(label)
      .map((path) => path.split(/[\\/]/).join('/'))

  it('builds a count only where a reason is written down (FR-1034a)', () => {
    expect(
      buildingACount().filter((path) => !(path in PERMITTED)),
      'A count is built outside the files permitted to build one. v5.2.0 N2 permits the count of ' +
        'changed saved sessions in the notification payload and forbids it everywhere it could ' +
        'become something to look at. If this is a different aggregate entirely, add it to ' +
        'PERMITTED in this test WITH what it counts — do not narrow the search until it passes, ' +
        'which is what this guard used to do and why it saw nothing outside three substrings.',
    ).toEqual([])
  })

  it('records no permission for a file that no longer builds a count', () => {
    // The mirror. A permission for a file that has stopped building one is a reason nobody will
    // re-check, and it makes the list look more considered than it is.
    const building = new Set(buildingACount())

    expect(
      Object.keys(PERMITTED).filter((path) => !building.has(path)),
      'A file is permitted to build a count and no longer builds one.',
    ).toEqual([])
  })

  /**
   * **A session starting still dispatches nothing**, re-asserted where the trigger set widened.
   *
   * T091 asserts this over the whole source; here it is stated against the material set itself,
   * because v5.2.0's distinction is the load-bearing one: a reminder is something an attendee can
   * set themselves, and a change is information only the product holds.
   */
  it('keeps the material set to exactly three changes (v5.2.0 N1, FR-1026)', () => {
    const changes = codeOnly(join(apiSrc, 'db', 'queries', 'session-changes.ts'))
    const union = /MaterialChange\s*=\s*([^\n]+)/.exec(changes)?.[1] ?? ''

    expect(union, 'the MaterialChange union could not be located').toMatch(/cancelled/)
    expect(union).toMatch(/'time'/)
    expect(union).toMatch(/'room'/)
    expect(
      /'start(ing|ed)?'|'begins?'|'soon'|'reminder'/.test(union),
      'The material set gained a session-starting trigger. v5.2.0 forbids it explicitly and the ' +
        'distinction is load-bearing: a session STARTING is a reminder an attendee could set ' +
        'themselves; a session MOVING is information only the product holds (FR-1033).',
    ).toBe(false)
  })
})

/**
 * T110 (014 tranche 2) — **format is a descriptive label with no behavioural consequence, and
 * that is asserted as an absence rather than trusted** (FR-1047).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A LABEL THAT QUIETLY ACQUIRES BEHAVIOUR IS A SECOND MODALITY NOBODY DECLARED.**
 *
 * Modality governs what a session must carry and is allowed to refuse writes; format may do
 * neither — no filter, no ordering, no ranking, no validation rule, no notification, no
 * visibility condition. The guard has three prongs, because "nothing branches on it" is a claim
 * about three different populations:
 *
 *   1. **Source**: no module outside the write path that carries the value may reference the
 *      conference format at all. A `WHERE`, an `ORDER BY`, a dispatch condition or a validation
 *      rule would each have to name the column to exist.
 *   2. **The wire**: no attendee-reachable contract path declares a `format` property, so the
 *      attendee client cannot branch on a value it is never sent. This is structural in the
 *      same way `deletion-coverage` is — a new attendee route that serialised it would fail
 *      here by existing.
 *   3. **The clients**: asserted beside the other client absences in
 *      `apps/web/tests/unit/authoring-absences.test.tsx`, over both products' sources.
 *
 * The pattern needs calibration because `format` is two other things in this codebase: a JSON
 * schema KEYWORD (`format: 'uuid'`, always a string literal) and the `Intl` FORMATTER CALL
 * (`.format(instant)`, always invoked). Both are excluded by lookahead, and the exclusions are
 * themselves tested below — a guard exercised only by the code that happens to exist stops
 * guarding when it changes (009's rule for the audit predicate).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('014 tranche 2 — nothing branches on the conference format (FR-1047)', () => {
  const CONFERENCE_FORMAT_REFERENCE = /\bformat\b(?!\s*\()(?!\s*:\s*['"])/

  /** The write path that legitimately carries the value, and nothing else. */
  const FORMAT_CARRIERS = [
    'db/schema/events.ts',
    'routes/admin/catalog.ts',
    'db/queries/admin-catalog.ts',
  ]

  /**
   * Files where `format` is a DIFFERENT word that happens to collide: sharp's image metadata
   * calls the file type `format` (004's EXIF pipeline, `images/avatar.ts:112`), which predates
   * the conference column by two constitution majors. Exempted by name with the reason stated,
   * per D14's rule — an exemption without a reason is indistinguishable from a weakening.
   */
  const UNRELATED_FORMAT = ['images/avatar.ts']

  const normalised = (path: string): string => label(path).split(/[\\/]/).join('/')

  it('recognises the shapes it exists to catch, and ignores the two legitimate ones', () => {
    // Must catch: a schema PROPERTY named format, a column read, an assignment, a select.
    expect(CONFERENCE_FORMAT_REFERENCE.test("format: { type: 'string' }")).toBe(true)
    expect(CONFERENCE_FORMAT_REFERENCE.test('conference.format === null')).toBe(true)
    expect(CONFERENCE_FORMAT_REFERENCE.test('format: events.format,')).toBe(true)
    expect(CONFERENCE_FORMAT_REFERENCE.test('.orderBy(events.format)')).toBe(true)

    // Must ignore: the JSON-schema keyword and the Intl formatter call.
    expect(CONFERENCE_FORMAT_REFERENCE.test("id: { type: 'string', format: 'uuid' }")).toBe(false)
    expect(CONFERENCE_FORMAT_REFERENCE.test('formatter.format(new Date())')).toBe(false)
  })

  it('lets no module outside the write path reference the conference format', () => {
    const referencing = files
      .filter((path) => CONFERENCE_FORMAT_REFERENCE.test(codeOnly(path)))
      .map(normalised)

    const offenders = referencing.filter(
      (name) => !FORMAT_CARRIERS.includes(name) && !UNRELATED_FORMAT.includes(name),
    )
    expect(
      offenders,
      'A module outside the write path references the conference format. FR-1047 forbids ' +
        'anything branching on it — no filter, no ordering, no validation rule, no ' +
        'notification, no visibility condition. If this is a new legitimate carrier of the ' +
        'value, adding it to FORMAT_CARRIERS is the conversation.',
    ).toEqual([])

    // Non-vacuity: the carriers themselves must match, or the pattern has rotted.
    for (const carrier of FORMAT_CARRIERS) {
      expect(
        referencing,
        `${carrier} no longer references format — the pattern is stale`,
      ).toContain(carrier)
    }
  })

  it('declares a format property on administrative contract paths alone', () => {
    const contract = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../contracts/openapi.json', import.meta.url)),
        'utf8',
      ),
    ) as { paths: Record<string, unknown> }

    const declaresFormatProperty = (node: unknown): boolean => {
      if (node === null || typeof node !== 'object') return false
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (
          key === 'properties' &&
          value !== null &&
          typeof value === 'object' &&
          'format' in (value as Record<string, unknown>)
        ) {
          return true
        }
        if (declaresFormatProperty(value)) return true
      }
      return false
    }

    const carriers = Object.entries(contract.paths)
      .filter(([, definition]) => declaresFormatProperty(definition))
      .map(([path]) => path)

    expect(
      carriers.filter((path) => !path.startsWith('/admin')),
      'An attendee-reachable path serialises the conference format. The attendee client cannot ' +
        'branch on a value it is never sent, and that is the structural half of FR-1047.',
    ).toEqual([])

    // Non-vacuity: the administrative surface does carry it, or this walk found nothing.
    expect(
      carriers.length,
      'no contract path carries format at all — the walk is stale',
    ).toBeGreaterThan(0)
  })
})
