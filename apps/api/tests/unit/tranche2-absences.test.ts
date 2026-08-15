import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T211 (014 tranche 2) — **the access link is visible from the moment it exists, to everyone
 * holding the join code, and nothing watches anybody use it** (FR-1055, FR-1056, FR-1057,
 * FR-1053's no-fetch clause).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE ABSENCES, EACH ASSERTED OVER THE SOURCE RATHER THAN BY OBSERVING THAT NOTHING
 * HAPPENED.**
 *
 * 1. **No timed release, no per-attendee gating, no reveal condition** (FR-1056). Withholding a
 *    link until a session starts needs either a lifecycle state — which N4 forbids on
 *    conference content — or a scheduler, which this feature does not add and which nothing
 *    time-driven may dispatch from. So no line of source that touches the access link may also
 *    consult a clock or a reader's identity: the moment one does, the link's presence has
 *    become a function of when or of whom, which is the absence this file exists to keep.
 *
 * 2. **No record of use** (FR-1057). No attendance record, no join event, no click log — that
 *    would be new attendee data collected by a surface nobody asked for, and the enrolment
 *    roster (O1) is the ONLY thing this feature makes visible about who is going to a session.
 *    Enforced structurally: the link lives in exactly one schema column, no schema declares a
 *    column shaped like a use-record for it, and the only module that WRITES it is the
 *    authoring write path.
 *
 * 3. **The product never fetches the link** (FR-1053). A reachability probe is a server-side
 *    request to a URL a promoted attendee typed — an SSRF primitive wearing a validation's
 *    name. The module that validates the link must be unable to make a request at all.
 *
 * Comments are stripped before matching, as 009's guards prescribe: every pattern below also
 * appears in the prose explaining the absence, and matching raw text would fail on a correct
 * implementation — whose natural repair is weakening the pattern until it checks nothing.
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
    // SQL comments inside template literals survive the two above and carry prose too — the
    // gap R14 documented in the trigger guard's own stripper is closed here rather than
    // inherited.
    .replace(/^\s*--.*$/gm, ' ')

const files = sourceFiles(apiSrc)
const label = (path: string): string => path.slice(apiSrc.length)

/** Both spellings of the identifier: the Drizzle field and the column. */
const LINK = /accessLink|access_link/

describe('T211 — no timed release, per-attendee gating or reveal condition (FR-1056)', () => {
  it('found source to audit, including the module that owns the field', () => {
    expect(files.length).toBeGreaterThan(30)
    expect(files.some((path) => codeOnly(path).match(LINK))).toBe(true)
  })

  it('no line touching the access link also consults a clock', () => {
    // The tokens that would make the link's presence a function of TIME. `startsAt` is among
    // them deliberately: a reveal condition would be written against the session's start.
    const clock = /\bnow\s*\(|Date\.now|new Date\(|setTimeout|setInterval|startsAt|starts_at/

    const offending = files.flatMap((path) =>
      codeOnly(path)
        .split('\n')
        .filter((line) => LINK.test(line) && clock.test(line))
        .map((line) => `${label(path)}: ${line.trim()}`),
    )

    expect(
      offending,
      'A line of source reads the access link AND a clock. FR-1056 forbids any timed release ' +
        'or reveal condition: the link is visible from the moment it exists (FR-1055), because ' +
        'withholding it needs a lifecycle N4 forbids or a scheduler this feature does not add.',
    ).toEqual([])
  })

  it('no line touching the access link also consults the reader', () => {
    // The tokens that would make the link's presence a function of WHO is asking. A read path
    // may filter rows by the caller's registration (a WHERE is not a reveal condition), but
    // the LINK itself must never be projected conditionally on an attendee identity.
    //
    // `enrolments` (the commitment table), not `enrol`: the bare stem also matches the
    // session's own `enrolment_closing_offset_hours` on ordinary column lists, which is
    // conference content, not a reader. Narrowed to the population the requirement is about —
    // D14's correction class, recorded here because "scoped deliberately" and "weakened until
    // it passed" are indistinguishable in a diff.
    const reader = /attendeeId|attendee_id|viewedAt|viewed_at|enrolments/i

    const offending = files.flatMap((path) =>
      codeOnly(path)
        .split('\n')
        .filter((line) => LINK.test(line) && reader.test(line))
        .map((line) => `${label(path)}: ${line.trim()}`),
    )

    expect(
      offending,
      'A line of source reads the access link AND an attendee identity or commitment. FR-1056 ' +
        'forbids per-attendee gating: every attendee holding the join code reads the same link.',
    ).toEqual([])
  })
})

describe('T211 — nothing records whether, when or from where a link was used (FR-1057)', () => {
  const schemaDir = join(apiSrc, 'db/schema')
  const schemaFiles = sourceFiles(schemaDir)

  it('the access link lives in exactly one schema column, on sessions', () => {
    const declaring = schemaFiles.filter((path) => LINK.test(codeOnly(path)))
    expect(
      declaring.map(label),
      'A second schema file names the access link. One column on `sessions` is the whole of ' +
        'its storage; anything more is a use-record arriving.',
    ).toEqual(['db/schema/catalog.ts'])
  })

  it('no schema declares a column shaped like a use-record', () => {
    // The names a click/attendance record would take. Asserted over every schema file, not
    // just the one with the link: a `link_opened_at` on `registrations` is the same surface.
    const useRecord = /link_(?:used|opened|clicked|followed)|clicked_at|attended_at|join_event/i

    const offending = schemaFiles.filter((path) => useRecord.test(codeOnly(path)))
    expect(
      offending.map(label),
      'A schema column records access-link use. FR-1057: no attendance record, no join event, ' +
        'no click record — the roster (O1) is the only visibility this feature grants.',
    ).toEqual([])
  })

  it('only the authoring write path and the seed WRITE the link', () => {
    const writers = files.filter((path) => {
      const source = codeOnly(path)
      if (!LINK.test(source)) return false
      // A file that both names the link and performs inserts/updates is a writer candidate.
      // `UPDATE <identifier>`, not bare `UPDATE\s` — a read path taking `FOR UPDATE` (the
      // locked before-reads this feature is built on) is not a writer, and matching it would
      // drag every locking read into this list the day it projects the link.
      return /\.insert\(|\.update\(|INSERT INTO|UPDATE\s+[a-z_"$]/i.test(source)
    })

    const permitted = new Set([
      // The authoring write path (FR-1052's dedicated field) — and the schema file, whose
      // `.update` matches belong to unrelated tables in the same module.
      'db/queries/admin-catalog.ts',
      'db/schema/catalog.ts',
      // The dev/test fixture is a reviewed commit, not a surface (decision 34).
      'db/seed/catalog.ts',
    ])

    expect(
      writers.map(label).filter((name) => !permitted.has(name)),
      'A module outside the authoring write path writes the access link. FR-1052 makes the ' +
        'dedicated field the ONLY route by which a link reaches an attendee, and a second ' +
        'writer is where a use-record or a per-reader copy would begin.',
    ).toEqual([])
  })
})

describe('FR-1053 — the product never fetches the link to check it', () => {
  it('no module that touches the access link can make an outbound request', () => {
    const request = /\bfetch\s*\(|undici|node:https?\b|require\(['"]https?['"]\)|axios|\bgot\s*\(/

    const offending = files.filter((path) => {
      const source = codeOnly(path)
      return LINK.test(source) && request.test(source)
    })

    expect(
      offending.map(label),
      'A module that handles the access link can also make an HTTP request. Validation is ' +
        'well-formedness and scheme ONLY — fetching the URL a promoted attendee typed is a ' +
        'server-side request an attacker chooses the destination of.',
    ).toEqual([])
  })
})

/**
 * T200 (014 tranche 2) — **the enrolment absences, each one a feature somebody will ask for**
 * (FR-1076, FR-1082, FR-1083, FR-1084).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Every one of these is the natural next request after enrolment ships, and every one was
 * refused in the specification with a reason — so each is asserted as an absence rather than
 * left as restraint:
 *
 *   - **No waitlist** (FR-1082): a queue has to notify somebody when it moves, and that is a
 *     third notification trigger — an amendment, not a table.
 *   - **No automatic enrolment** (FR-1083): a place is taken by an explicit act or not taken.
 *     Nothing may take one from a saved session, a recommendation, an interest or a profile.
 *   - **No attendance, check-in or no-show record** (FR-1084): holding a place is a claim on
 *     capacity, not a statement that somebody turned up — a different disclosure about a
 *     person than the one v5.3.0 ratified.
 *   - **No administrative enrolling on anybody's behalf** (FR-1076): an administrative tier
 *     acts on content and on authority, never on a person (013's rule), and enrolling
 *     somebody is acting on a person.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('T200 — the enrolment absences (FR-1076, FR-1082–FR-1084)', () => {
  const schemaFiles = sourceFiles(join(apiSrc, 'db', 'schema'))

  it('declares no waitlist anywhere in the schema (FR-1082)', () => {
    const declaring = schemaFiles
      .filter((path) => /\bwaitlist|wait_list|queue_position|\bwaiting\b/i.test(codeOnly(path)))
      .map(label)

    expect(
      declaring,
      'A schema declares a waitlist shape. A full session refuses and says so; it does not ' +
        'record who wanted in, because a queue that moves has to notify somebody, and that is ' +
        'a third trigger (FR-1082).',
    ).toEqual([])
  })

  it('declares no attendance, check-in or no-show column (FR-1084)', () => {
    const declaring = schemaFiles
      .filter((path) =>
        /\battended|attendance|check_?in|checkedIn|no_?show|noShow|turnout/i.test(codeOnly(path)),
      )
      .map(label)

    expect(
      declaring,
      'A schema records attendance. Holding a place is a claim on capacity, not a statement ' +
        'that somebody turned up (FR-1084) — a record of who attended is a different ' +
        'disclosure about a person than the one this amendment ratified.',
    ).toEqual([])
  })

  it('inserts into session_enrolments from exactly the two ATTENDEE paths (FR-1076, FR-1083)', () => {
    // The write inventory is the assertion: FR-1076 forbids an administrative insert and
    // FR-1083 forbids an automatic one, and both would have to be an INSERT somewhere. The
    // only permitted writers are the attendee's own enrol path (queries/enrolments.ts) and —
    // nothing else: not the seed (a fabricated place is fabricated personal data, the
    // agenda-seed rule), not the admin query layer, not a route module directly.
    const inserting = files
      .filter((path) => {
        const source = codeOnly(path)
        return /insert(\s*\(\s*|\s+INTO\s+)[^;]{0,120}?(session_?[eE]nrolments)/i.test(
          source.replace(/\n/g, ' '),
        )
      })
      .map(label)

    expect(
      inserting,
      'A module other than the attendee enrolment path inserts a held place. A place is taken ' +
        'by the attendee’s own explicit act or it is not taken (FR-1083); an administrative ' +
        'tier acts on content and authority, never on a person (FR-1076).',
    ).toEqual(['db/queries/enrolments.ts'])
  })

  it('registers no administrative route that writes a place (FR-1076)', () => {
    // The route-table half, beside the source half above: no /admin address whose subject is
    // enrolment accepts a write verb. The roster GET is the one admin enrolment surface (O1),
    // and it is a read.
    const adminRoutes = sourceFiles(join(apiSrc, 'routes', 'admin'))
    const writing = adminRoutes
      .filter((path) => {
        const source = codeOnly(path)
        return /app\.(post|put|patch|delete)[^;]{0,200}enrolments/i.test(source.replace(/\n/g, ' '))
      })
      .map(label)

    expect(
      writing,
      'An administrative route writes enrolment state. O1 licenses the roster READ and ' +
        'nothing else; taking, releasing or moving a place on an attendee’s behalf is acting ' +
        'on a person (FR-1076).',
    ).toEqual([])
  })
})

/**
 * T201 (014 tranche 2) — **no view in either product presents a count of CHANGES, and the
 * permitted remaining-places count stays a different thing** (SC-1024, FR-1070a, FR-1031, N2).
 *
 * Tranche 2 puts both numbers on the same rows, which is exactly why the distinction is
 * verified rather than assumed: remaining places is a fact about ONE session's availability at
 * the moment of deciding (v5.3.0 O3); a count of changes is an inbox wearing a number, and N2
 * is untouched and unweakened.
 */
describe('T201 — the two counts stay apart (SC-1024, FR-1070a)', () => {
  const clientRoots = [
    fileURLToPath(new URL('../../../web/src/', import.meta.url)),
    fileURLToPath(new URL('../../../admin/src/', import.meta.url)),
  ]

  it('derives no aggregate of changed sessions in either client', () => {
    // The shape a change count would take: filtering or counting the commitment set by its
    // marker. `changedSinceViewed` may gate a row's own presentation and nothing wider.
    const aggregating = clientRoots
      .flatMap((root) => sourceFiles(root))
      .filter((path) => {
        const source = codeOnly(path)
        return /changedSinceViewed[^\n]{0,80}(\.length|\.size|count|reduce|filter\s*\()|((\.filter\s*\([^)]{0,60})changedSinceViewed[^\n]{0,40}\.length)/.test(
          source,
        )
      })
      .map((path) => path)

    expect(
      aggregating,
      'A client aggregates the change markers. The marker is per-row state about one session ' +
        '(N2); the moment a screen answers "how many things changed", FR-1031 is broken ' +
        'regardless of what the payload does (SC-1024).',
    ).toEqual([])
  })

  it('aggregates remaining places across no set of sessions (FR-1070a)', () => {
    // The places figure is read per session through a single-session member. An aggregate —
    // "how many of my sessions have places" — would need the figure mapped over a collection.
    const aggregating = clientRoots
      .flatMap((root) => sourceFiles(root))
      .filter((path) => {
        const source = codeOnly(path)
        return /(map|reduce|filter)\s*\([^)]{0,80}(remaining|places)\b[^\n]{0,60}(sum|total|reduce|\+)/i.test(
          source,
        )
      })
      .map((path) => path)

    expect(
      aggregating,
      'A client aggregates remaining places across sessions. The figure is a fact about ONE ' +
        'session at the moment of deciding (FR-1070a) — an aggregate is one `.reduce` away ' +
        'from a surface N2 forbids, which is why the bound holds in both directions.',
    ).toEqual([])
  })
})

/**
 * SC-1025 — **deleting a session dispatches nothing, asserted as an absence over the SOURCE**
 * (v5.3.0 O2, decision 51, register entry 31).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * The silence is ratified, not overlooked: an enrolment is not engagement, so a session with
 * places held may be deleted, and the held places are destroyed with no notification, no marker
 * and no trace — the person finds out by arriving. What ratifies it also bounds it, and the
 * bound had no guard: `trigger-set-pinned.test.ts` pins caller MODULES, and
 * `routes/admin/catalog.ts` is a permitted caller — its cancel and update handlers legitimately
 * dispatch. So a dispatch added to the DELETE handler would fail no existing test: the module
 * is allowed to fan out, and only the handler is not. This test scopes the absence to the
 * handler itself, which no module-granularity guard can do.
 *
 * The remedy for the silence is a THIRD notification trigger and therefore another amendment
 * (register entry 31, opened rather than solved) — which is exactly why a dispatch quietly
 * appearing here must fail a build instead of closing the entry by inference.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('SC-1025 — the session DELETE handler dispatches nothing', () => {
  const catalogModule = codeOnly(join(apiSrc, 'routes', 'admin', 'catalog.ts'))

  // Slice the module at route registrations: each piece starts with its own `app.<verb>(` and
  // runs to the next one, so the piece IS the registration — schema, handler and all.
  const registrations = catalogModule.split(/(?=\bapp\.(?:get|post|put|patch|delete)\s*\()/)
  const deleteHandler = registrations.find(
    (slice) => slice.startsWith('app.delete(') && slice.includes('/sessions/:id'),
  )

  // The shapes a dispatch takes in this module: the fan-out entry point, the fan-out itself,
  // the recipient query, and anything dispatch-named (leading word boundary, so
  // `dispatchToDevices` and `dispatchId` are caught too).
  const dispatchShapes = [/\bnotifySavers\b/, /\bfanOut\b/, /\battendeesToNotify\b/, /\bdispatch/i]

  it('found the DELETE registration, non-vacuously', () => {
    // An extraction that silently matched nothing would assert an absence over an empty
    // string. The slice must exist, be non-trivial, and contain the one call that makes it
    // the delete handler and not some other route's.
    expect(deleteHandler, 'the sessions DELETE registration was not found').toBeDefined()
    expect((deleteHandler as string).length).toBeGreaterThan(0)
    expect(deleteHandler).toContain('deleteSession')
  })

  it('the DELETE handler contains no dispatch call', () => {
    const offending = dispatchShapes.filter((shape) => shape.test(deleteHandler as string))

    expect(
      offending.map(String),
      'The session DELETE handler reaches the dispatch machinery. SC-1025: deletion is silent ' +
        'by ratified decision (v5.3.0 O2), and notifying on it is a THIRD trigger — an ' +
        'amendment (register entry 31), never an edit here.',
    ).toEqual([])
  })

  it('every pattern matches elsewhere in the module, so the guard is scoped rather than vacuous', () => {
    // The cancel and update handlers legitimately dispatch, so each shape must be found in the
    // module as a whole — a pattern set that matched nothing anywhere would "pass" over a file
    // that renamed its fan-out, checking nothing.
    const unmatched = dispatchShapes.filter((shape) => !shape.test(catalogModule))

    expect(
      unmatched.map(String),
      'A dispatch shape matches nowhere in routes/admin/catalog.ts. The module DOES dispatch ' +
        '(cancel and material edits), so an unmatched pattern means the fan-out was renamed ' +
        'and this guard is asserting an absence it can no longer see.',
    ).toEqual([])
  })
})
