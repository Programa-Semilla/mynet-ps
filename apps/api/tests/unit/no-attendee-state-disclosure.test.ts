import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T059 (014) — **an organizer authors the programme and reads nobody's writing** (FR-1042).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ABSENCE THAT MAKES CANCELLATION SAFE TO OFFER.**
 *
 * FR-1025 hands an organizer four integers — how many attendees saved this, noted it, questioned
 * it, voted on it — because they need them to choose between deleting a session and cancelling
 * it. Every one of those integers is derived from a table of **private attendee writing**:
 * `session_notes` holds notes that are private to their author by Principle VIII, and
 * `saved_sessions`, `session_questions` and `question_votes` each name the attendee who acted.
 *
 * The distance between "four counts" and "the names behind them" is one `SELECT` list. Nothing
 * about the schema stops it, no scope prevents it, and the organizer already holds authority
 * over the conference — so the only thing standing between an authoring surface and a readout of
 * who is going to what is this assertion.
 *
 * **The four rules, each failing differently:**
 *
 *   1. No administrative route returns a note body or a message body. Both are private content
 *      under Principle VIII, and neither has an exception. v4.1.0's third exception covers the
 *      **report queue** and nothing else — it is bounded to *what was reported*, in the queue,
 *      to the platform tier. An organizer reading a note would need a fourth.
 *   2. No administrative query names the attendee behind an engagement. `count(*)` is the whole
 *      interface (FR-1025), and `attendee_id` appearing in an administrative `SELECT` list over
 *      these four tables is the shape that breaks it.
 *   3. The fan-out **does** need those identifiers and lives somewhere else on purpose.
 *      `session-changes.ts` resolves who saved a changed session, because a notification cannot
 *      be addressed without knowing who to address — and nothing administrative reads it. That
 *      separation is the design; this test is what keeps it from being undone by a convenient
 *      import.
 *   4. No route addresses attendee state at all. A path naming notes, saves or votes under
 *      `/admin` is a readout even if today's handler happens to aggregate.
 *
 * Comments are stripped before matching, as 009's guards do — every table name and every column
 * name below appears in the prose above, so matching raw text would fail on a correct
 * implementation, and the natural repair is to weaken the pattern until it checks nothing.
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

/**
 * The administrative surface, as source.
 *
 * `routes/admin/**` and the `admin-*` query modules — the files a request carrying an operator
 * session can reach. Deliberately **not** all of `src`: the attendee routes read notes and
 * questions constantly and correctly, and a guard that flagged them would be turned off.
 */
const administrativeFiles = [
  ...sourceFiles(join(apiSrc, 'routes', 'admin')),
  ...sourceFiles(join(apiSrc, 'admin')),
  ...sourceFiles(join(apiSrc, 'db', 'queries')).filter((path) => /\badmin-[a-z-]+\.ts$/.test(path)),
]

/**
 * The **authoring** surface specifically — 014's own two modules.
 *
 * Narrower than `administrativeFiles` on purpose. 013's report queue reads reported content and
 * names the reporter and the reported, under v4.1.0's third Principle VIII exception, which is
 * recorded, bounded and guarded by its own tests. Auditing it here would either fail on correct
 * code or force an exemption broad enough to cover the thing this file exists to catch.
 */
const authoringFiles = [
  join(apiSrc, 'db', 'queries', 'admin-catalog.ts'),
  join(apiSrc, 'routes', 'admin', 'catalog.ts'),
]

/**
 * T122 (014 tranche 2, R16) — **the roster module: a THIRD file list, with the narrowest rule
 * of the three.** `admin-enrolments.ts` legitimately projects a display name — that is the
 * fourth Principle VIII exception (v5.3.0 O1) doing exactly what it was ratified for — so it
 * cannot join `authoringFiles`, whose invariant is "no identity, ever". It is audited harder
 * instead: its projection may contain `display_name` and NOTHING ELSE identity-shaped — no
 * attendee id, no email, no avatar column — asserted below as an allowlist over one named
 * module rather than an unscanned one.
 */
const disclosureFiles = [join(apiSrc, 'db', 'queries', 'admin-enrolments.ts')]

/**
 * T122 (014 tranche 2) — **the one exempted administrative address, keyed on the full
 * `METHOD url` label** (never a path prefix: a prefix would exempt every later subresource of
 * a session along with it). GET and HEAD are one read — Fastify registers HEAD alongside — and
 * both labels are listed so neither is exempted by accident of the other.
 *
 * Three anti-vacuity assertions below keep this honest: every label here must still exist in
 * the route table, every reason must be substantial, and — the one that is new — every label
 * must actually MATCH the widened noun regex, so an exemption for a path the detector never
 * catches fails as stale rather than sitting decorative beside a check that never fires.
 */
const ENROLMENT_DISCLOSURE = new Map<string, string>([
  [
    'GET /admin/conferences/:eventId/sessions/:id/enrolments',
    'The enrolment roster — the FOURTH recorded Principle VIII exception (constitution v5.3.0 ' +
      'O1, FR-1073): an organizer preparing materials cannot prepare them for people they ' +
      'cannot name. Bounded to enrolment alone, an assigned organizer, that conference’s ' +
      'sessions, and names only; the attendee is told before they enrol (FR-1074). Every ' +
      'other administrative read of who saved, noted, questioned or voted must still fail.',
  ],
  [
    'HEAD /admin/conferences/:eventId/sessions/:id/enrolments',
    'The same read: Fastify auto-registers HEAD beside GET, and an exemption naming only GET ' +
      'would report the HEAD variant as a new disclosure on every run.',
  ],
])

const label = (path: string): string => path.slice(apiSrc.length)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

describe('014 — no administrative surface reads attendee state (FR-1042)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found an administrative surface to audit', () => {
    // A guard that silently audits nothing is the 010 defect in a different costume: the
    // assertion runs, passes, and covers zero files.
    expect(administrativeFiles.length).toBeGreaterThan(8)
    expect(routes.filter((route) => /^\/admin(\/|$)/.test(route.url)).length).toBeGreaterThan(5)
  })

  /**
   * **Rule 1 — no note body and no message body, anywhere administrative.**
   *
   * Matched on the schema modules being imported rather than on column names, because that is
   * the dependency a readout actually requires: the note body lives in `schema/agenda.ts` and
   * message bodies in `schema/messages.ts`, and reaching either from an administrative module is
   * the step that has to be deliberate.
   *
   * `admin-catalog.ts` legitimately imports `agenda.ts` — `count(*)` over `saved_sessions` and
   * `session_notes` is FR-1025 — so the note-body column itself is asserted separately below.
   */
  it('imports no message schema into any administrative module (FR-1042)', () => {
    const reaching = administrativeFiles
      .filter((path) => /schema\/messages\.js/.test(codeOnly(path)))
      // 013's report queue resolves reported message ids under v4.1.0's third Principle VIII
      // exception, which is bounded to exactly that: the queue, the platform tier, what was
      // reported. It is the one administrative reader of a message and it is recorded.
      .filter((path) => !/admin-reports\.ts$/.test(path))
      .map(label)

    expect(
      reaching,
      'An administrative module reaches the message schema. Message content is the most ' +
        'sensitive data in the product; the ONLY administrative reader is the report queue, ' +
        'bounded by v4.1.0’s third Principle VIII exception to what was reported. An authoring ' +
        'surface reading one would need a fourth exception (FR-1042).',
    ).toEqual([])
  })

  it('selects no note body in any administrative module (FR-1042)', () => {
    const reading = administrativeFiles
      .filter((path) => /sessionNotes\.body|session_notes\.body|notes\.body/.test(codeOnly(path)))
      .map(label)

    expect(
      reading,
      'An administrative module reads a note body. A private note is the attendee’s own writing ' +
        'about a session — FR-1025 gives an organizer HOW MANY, never WHAT (FR-1042).',
    ).toEqual([])
  })

  /**
   * **Rule 2 — the engagement tables are counted, never attributed.**
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────
   * **THE RULE IS ABOUT PROJECTING AN IDENTITY, NOT ABOUT MENTIONING ONE.**
   *
   * The first draft of this assertion flagged any occurrence of `attendeeId` on the four
   * engagement tables and caught two *correct* pieces of code, which is worth recording because
   * the distinction is the requirement rather than an exemption from it:
   *
   *   - `admin-catalog.ts` filters `saved_sessions` by the **acting principal's own** attendee id
   *     to bump their `viewed_at` (FR-1028a). That is a write, keyed on an identity the caller
   *     already is, and it discloses nothing to anybody.
   *   - `admin-reports.ts` filters reported questions by the **reported** attendee's id — a
   *     person the report already names, under v4.1.0's third Principle VIII exception.
   *
   * Both use the column in a `WHERE`. A disclosure needs it in a `SELECT`, so that is what this
   * matches: identity columns appearing inside a projection over the authoring surface.
   * ───────────────────────────────────────────────────────────────────────────────────────────
   */
  it('projects no attendee identity in the authoring surface (FR-1025, FR-1042)', () => {
    const projections = authoringFiles.flatMap((path) => {
      const code = codeOnly(path)
      // Every `.select({ … })` projection in the file, plus every object literal returned to a
      // route — the two shapes a column reaches a caller through.
      return [...code.matchAll(/\.select\(\{[\s\S]*?\}\)/g)].map((match) => ({
        path: label(path),
        projection: match[0],
      }))
    })

    expect(projections.length, 'no projections found to audit').toBeGreaterThan(0)

    const attributing = projections
      .filter(({ projection }) =>
        /\battendeeId\b|\bdisplay_name\b|\bdisplayName\b|\bemail\b/.test(projection),
      )
      .map(({ path }) => path)

    expect(
      attributing,
      'The authoring surface projects an attendee identity. `count(*)` is the whole interface ' +
        '(FR-1025): an organizer chooses between deleting and cancelling, and needs a number to ' +
        'do it — never a name (FR-1042).',
    ).toEqual([])
  })

  /**
   * **The one permitted use of an engagement identity in the authoring query layer**, pinned to
   * the statement that is allowed to have it.
   *
   * FR-1028a clears the marker for an organizer who saved the session they just changed, which
   * needs their own attendee id. Pinning it to an `update` is what stops the same column
   * migrating into a read later on the strength of "it was already imported".
   */
  it('uses a saved-session identity only to clear the actor’s own marker (FR-1028a)', () => {
    const code = codeOnly(join(apiSrc, 'db', 'queries', 'admin-catalog.ts'))
    const uses = [...code.matchAll(/savedSessions\.attendeeId/g)]

    expect(uses.length, 'the FR-1028a marker clear is gone from the authoring query layer').toBe(1)

    // The single use sits inside an `update(savedSessions)` statement, keyed on the caller.
    const statement = /\.update\(savedSessions\)[\s\S]{0,400}?savedSessions\.attendeeId/.exec(code)
    expect(
      statement,
      'A saved-session attendee id is used outside the FR-1028a marker clear. That column names ' +
        'somebody who saved a session, and the authoring surface may count them and nothing ' +
        'else (FR-1042).',
    ).not.toBeNull()
  })

  /**
   * T164 (014 tranche 2) — **the enrolment twin of the pin above**, written because R16 found
   * the shipped assertion is spelled with the table name and would walk straight past a held
   * place's marker clear. FR-1080 stamps whichever commitment the actor holds, so
   * `session_enrolments.attendee_id` now legitimately appears in the authoring query layer —
   * exactly once, inside an `update`, keyed on the caller — and nowhere shaped like a read.
   */
  it('uses an enrolment identity only to clear the actor’s own marker (FR-1080)', () => {
    const code = codeOnly(join(apiSrc, 'db', 'queries', 'admin-catalog.ts'))
    const uses = [...code.matchAll(/sessionEnrolments\.attendeeId/g)]

    expect(uses.length, 'the FR-1080 marker clear is gone from the authoring query layer').toBe(1)

    const statement =
      /\.update\(sessionEnrolments\)[\s\S]{0,400}?sessionEnrolments\.attendeeId/.exec(code)
    expect(
      statement,
      'An enrolment attendee id is used outside the FR-1080 marker clear. That column names ' +
        'somebody holding a place; the roster route is the ONE reader of those names, under ' +
        'O1’s bounds, and it does not live in this file (FR-1042, FR-1075).',
    ).not.toBeNull()
  })

  /**
   * **Rule 3 — the fan-out holds the identifiers, and administration does not import it.**
   *
   * `attendeesToNotify` genuinely resolves who saved a changed session: a notification cannot be
   * addressed otherwise. It lives in `session-changes.ts`, outside the administrative modules,
   * and the authoring route calls it **after** the transaction to dispatch — never to render.
   *
   * So the assertion is not "nothing may know who saved this" but "nothing administrative may
   * **return** it", and the route is where those two meet.
   */
  it('returns nothing from the fan-out to the caller (FR-1042)', () => {
    const catalogRoute = codeOnly(join(apiSrc, 'routes', 'admin', 'catalog.ts'))

    // The route dispatches from the fan-out. That is R3's requirement and must stay true.
    expect(
      /attendeesToNotify/.test(catalogRoute),
      'The authoring route no longer calls the fan-out. If dispatch moved, it must not have ' +
        'moved into `notifications/**` — that directory is excluded from ' +
        '`notification-triggers.test.ts`, so a trigger placed there passes the gate written to ' +
        'catch it (research R3).',
    ).toBe(true)

    // …and the functions holding the fan-out must answer with NOTHING. A return type that cannot
    // carry a recipient list is the guarantee, and this reads it — rather than trying to prove a
    // negative about every `send` in the file.
    //
    // **Two functions rather than one, because the fan-out now outlives the response.** A
    // saved-session change reaches every saver, so awaiting it in the organizer's request was
    // `recipients × push RTT` against a 10s `connectionTimeout`; `notifySavers` therefore starts
    // the work and returns immediately, and `fanOut` performs it. Both are audited here: the
    // starter answers `void` and the worker answers `Promise<void>`, so **neither** has a return
    // value an organizer could ever be handed. Auditing only the first would have left the
    // function that actually reads attendee identifiers unchecked.
    const starter = /const notifySavers[\s\S]{0,400}?\):\s*(void|Promise<[^>]+>)/.exec(catalogRoute)
    expect(starter?.[1], 'the dispatch starter could not be located to audit').toBe('void')

    const worker = /const fanOut[\s\S]{0,400}?\):\s*(Promise<[^>]+>)/.exec(catalogRoute)
    expect(worker?.[1], 'the fan-out worker could not be located to audit').toBe('Promise<void>')

    // And nothing sent to a caller mentions the fan-out's result. `notifySavers` binds it to
    // `recipients`; a reply naming that is the one edit turning a delivery list into a payload.
    const sends = [...catalogRoute.matchAll(/\.send\(([\s\S]{0,200}?)\)/g)].map((match) => match[1])
    const leaking = sends.filter((argument) =>
      /\brecipients\b|attendeesToNotify|\bsavers\b|\battendeeIds\b/.test(argument ?? ''),
    )

    expect(
      leaking,
      'The authoring route returns the notification fan-out to its caller. Those identifiers ' +
        'exist to ADDRESS a notification; returning them tells an organizer exactly who saved ' +
        'the session they just changed (FR-1042).',
    ).toEqual([])
  })

  /**
   * **Rule 4 — no administrative address is about attendee state.**
   *
   * Asserted at the route table rather than in source, because this one is about what the API
   * *offers*. A path is a promise, and `/admin/…/sessions/:id/attendees` is a readout whatever
   * its handler currently does.
   */
  it('exposes no administrative route addressing attendee state (FR-1042)', () => {
    const disclosing = routes
      .filter((route) => /^\/admin(\/|$)/.test(route.url))
      // T121 (014 tranche 2, R16): `enrolments?|enrolled|roster|places?` were ADDED to this
      // set, and the widening precedes the exemption deliberately. As shipped, a roster route
      // named `enrolments` matched none of the seven nouns and would have shipped green with
      // no exemption and no record — a pass by omission, indistinguishable from no coverage.
      // The four original nouns are untouched; the pattern is widened, never relaxed.
      .filter((route) =>
        /\b(notes?|saves?|saved|votes?|voters?|attendees|questions|enrolments?|enrolled|roster|places?)\b/i.test(
          route.url,
        ),
      )
      // 013's moderation route removes ONE reported question, which is an act on content under
      // the report queue's bounds — not a read of who engaged with a session. Both its addresses
      // are excluded, and both are **writes**: this rule is about what may be READ.
      .filter((route) => !/^\/admin\/reports\//.test(route.url))
      .filter((route) => !/^\/admin\/questions\/[:{][^/]+$/.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))
      // T122 — the named exemption, applied AFTER the flatMap so it exempts exactly the
      // METHOD+url labels it lists and never every verb on an address (R16).
      .filter((label) => !ENROLMENT_DISCLOSURE.has(label))

    expect(
      disclosing,
      'An administrative route addresses attendee state. An organizer authors CONTENT; who ' +
        'saved, noted, questioned or voted on it is the attendees’ own, and the counts they ' +
        'need for FR-1025 travel on the programme they already read (FR-1042). The ONE ' +
        'exemption is the enrolment roster, named in ENROLMENT_DISCLOSURE with v5.3.0 O1 as ' +
        'its licence — a second entry there needs a fifth privacy exception, i.e. an amendment.',
    ).toEqual([])
  })

  /**
   * T122 — the exemption's own guards, so it cannot rot into a decorative constant.
   */
  it('keeps the enrolment exemption honest — live, reasoned, and actually caught (R16)', () => {
    const labels = routes
      .filter((route) => /^\/admin(\/|$)/.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))

    for (const [exempted, reason] of ENROLMENT_DISCLOSURE) {
      // Stale entries: an exemption for a route that no longer exists is a hole waiting for a
      // new route to fall into it.
      expect(labels, `exempted label no longer exists: ${exempted}`).toContain(exempted)
      // A reason has to argue, not gesture.
      expect(reason.length, `the reason for ${exempted} is too thin to be one`).toBeGreaterThan(80)
      // And the label must MATCH the widened detector — an exemption for a path the noun regex
      // never catches has not narrowed anything: the rule was always blind there, and the
      // "exemption" would be prose beside a check that never fires (016's finding, R16).
      expect(
        /\b(notes?|saves?|saved|votes?|voters?|attendees|questions|enrolments?|enrolled|roster|places?)\b/i.test(
          exempted,
        ),
        `${exempted} is not caught by the detector it claims to be exempted from`,
      ).toBe(true)
    }
  })

  /**
   * T122 — the roster module's projection allowlist: `display_name` and NOTHING else
   * identity-shaped (R16). Strictly more coverage than before the module existed, when a new
   * `admin-*` query file was scanned by rule 1 alone and its projections by nothing.
   */
  it('projects the display name and no other identity from the roster module (O1, FR-1073a)', () => {
    for (const path of disclosureFiles) {
      const code = codeOnly(path)

      expect(/display_name/.test(code), 'the roster module no longer projects a name').toBe(true)
      expect(
        /\battendeeId\b|\bemail\b|\bavatar/i.test(code),
        `${label(path)} reaches an identity column beyond the display name — O1 licenses the ` +
          'NAME, and the name is all there is',
      ).toBe(false)
    }
  })

  /**
   * **The counts are `count(*)` and nothing else**, which is rule 2 stated positively.
   *
   * A rule expressed only as an absence stops being checked the moment somebody rewrites the
   * query in a shape the pattern does not recognise. This reads the query that exists.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **IT NOW READS THE `engagementCountsFor` FRAGMENT, BECAUSE THAT IS WHERE THE COUNTS MOVED.**
   *
   * The aggregate used to be written twice in `admin-catalog.ts` — once inside `countEngagement`
   * and once correlated inside `readProgramme` — and this guard read the first. Only one of the
   * two was ever covered, which is what let them diverge in table coverage (FR-1018a); they are
   * now composed from a single fragment, and **both** call sites are audited by auditing it.
   *
   * The direction is the safe one: one expression serving two readers is strictly more coverage
   * than one of two expressions. The extraction is asserted non-empty below for the usual reason —
   * a renamed fragment would otherwise make every assertion here pass over an empty string.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('computes engagement as counts alone (FR-1025)', () => {
    const code = codeOnly(join(apiSrc, 'db', 'queries', 'admin-catalog.ts'))
    const query = /engagementCountsFor = \(session: SQL\) => sql`[\s\S]*?`/.exec(code)?.[0] ?? ''

    expect(query, 'the engagement query could not be located to audit').toMatch(/count\(\*\)/)

    // Both readers must go through it, or auditing it proves less than it appears to.
    expect(
      /countEngagement[\s\S]{0,400}?engagementCountsFor/.test(code),
      'the delete refusal no longer composes its counts from the audited fragment',
    ).toBe(true)
    expect(
      /session_id, \$\{engagementCountsFor|AS session_id, \$\{engagementCountsFor/.test(code) ||
        /engagementCountsFor\(sql`s\.id`\)/.test(code),
      'the programme read no longer composes its counts from the audited fragment',
    ).toBe(true)

    // Four aggregates, no columns. `displayName` or `attendeeId` appearing between them is the
    // failure this whole file exists for.
    expect(
      /display_name|displayName|attendee_id|attendeeId|\bemail\b/.test(query),
      'The engagement query selects an attendee column. It must return four integers and ' +
        'nothing that could name anybody (FR-1025, FR-1042).',
    ).toBe(false)
  })
})
