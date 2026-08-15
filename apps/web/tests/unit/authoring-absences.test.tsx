import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T066 (014) — **the count is permitted in the payload and forbidden everywhere it could become
 * something to look at** (FR-1031, SC-1009, constitution v5.2.0 N2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE ABSENCE 014 CAN BREACH BY SATISFYING ITS OWN REQUIREMENTS.**
 *
 * plan.md tracks it as a risk rather than waiving it: *"the marker is one design decision away
 * from being the notification centre v3.1.0 forbids"*. An "**3 changed**" badge in the top bar
 * would satisfy every functional requirement in this feature — the marker is per-row (FR-1030),
 * the coalesced payload carries a count (FR-1034a), and a badge is neither a bell nor a list. It
 * would still be exactly the surface N2 forbids.
 *
 * v5.2.0 draws the line in one sentence and this file is where it is enforced: **no view in
 * either product may present that count.** The moment a screen answers *"how many things
 * changed"*, this is broken regardless of what the payload does.
 *
 * Three shapes are forbidden, and they are different failures rather than three spellings of one:
 *
 *   1. **An aggregate.** Counting the markers — `.filter(…).length`, a `changedCount`, a badge
 *      number. The payload's count exists to make one interruption legible; on a screen it is a
 *      score to clear.
 *   2. **A list.** A view whose subject is "what changed" — a changes screen, a feed, a
 *      `changedSessions` collection rendered as its own thing. FR-1034b already forbids a
 *      *notification* landing on one; this forbids the destination existing to land on.
 *   3. **A bell.** Carried forward from 007 unchanged, and re-asserted here because 014 is the
 *      first feature since to give a bell something to hold.
 *
 * **Both clients**, because "either product" is the requirement. `apps/admin` has no marker and
 * no notification of any kind, and the cheapest way for that to stop being true is an organizer
 * screen summarising what they just changed.
 *
 * Comments are stripped before matching, as 009's guards do — every word below appears in the
 * prose above and in the components' own headers, so matching raw text would fail on a correct
 * implementation, and the natural repair is to weaken the pattern until it checks nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const WEB = join(import.meta.dirname, '../../src')
const ADMIN = join(import.meta.dirname, '../../../admin/src')

interface Source {
  readonly name: string
  readonly text: string
}

const sourcesUnder = (directory: string, prefix: string): Source[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const name = `${prefix}/${entry.name}`
    if (entry.isDirectory()) return sourcesUnder(path, name)
    return /\.tsx?$/.test(entry.name) ? [{ name, text: readFileSync(path, 'utf8') }] : []
  })

const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const BOTH_CLIENTS: Source[] = [...sourcesUnder(WEB, 'web'), ...sourcesUnder(ADMIN, 'admin')]

const offenders = (pattern: RegExp, sources: Source[] = BOTH_CLIENTS): string[] =>
  sources.filter(({ text }) => pattern.test(codeOf(text))).map(({ name }) => name)

describe('014 — no aggregate and no change list in either client (FR-1031, SC-1009)', () => {
  it('finds both clients’ source — a gate that cannot fail is not a gate', () => {
    expect(offenders(/./).length).toBeGreaterThan(60)
    expect(BOTH_CLIENTS.filter(({ name }) => name.startsWith('admin/')).length).toBeGreaterThan(10)
    expect(BOTH_CLIENTS.filter(({ name }) => name.startsWith('web/')).length).toBeGreaterThan(40)
  })

  /**
   * **The aggregate**, in the spellings somebody would actually reach for.
   *
   * The patterns are asserted against synthetic samples first, because 007's bell guard shipped
   * with its regex written backwards — requiring the identifier to appear *after* the module
   * string — and caught the two unlikely spellings while missing the obvious one. A guard whose
   * direction can invert silently reads as protection and is not.
   */
  const COUNT =
    /\bchangedCount\b|\bchangeCount\b|\bunviewedCount\b|\bchangedSessions\s*\.\s*length\b|\bchanged\s*\.\s*length\b/i

  it('the aggregate pattern matches an aggregate', () => {
    expect(COUNT.test('const changedCount = saved.filter(s => s.changedSinceViewed).length')).toBe(
      true,
    )
    expect(COUNT.test('<Badge>{changedSessions.length}</Badge>')).toBe(true)
    expect(COUNT.test('const unviewedCount = 3')).toBe(true)
    // And not on the neighbours it must not fire on: a per-row boolean is the requirement.
    expect(COUNT.test('const changed = saved.has(session.id)')).toBe(false)
    expect(COUNT.test('sessions.length')).toBe(false)
  })

  it('presents no count of changed sessions anywhere (FR-1031)', () => {
    expect(
      offenders(COUNT),
      'A view counts changed sessions. The count is permitted in the notification payload ' +
        '(FR-1034a) and forbidden everywhere it could become something to look at — the moment a ' +
        'screen answers "how many things changed", v5.2.0 N2 is broken however the payload ' +
        'behaves.',
    ).toEqual([])
  })

  it('derives no count from the marker, whatever it is called (FR-1031)', () => {
    // The shape rather than the name: filtering the saved set by the marker and taking a length
    // is the aggregate, and calling the result `n` would slip past the pattern above.
    const derived = offenders(/changedSinceViewed[^\n]{0,80}\)\s*\.\s*length\b/)

    expect(
      derived,
      'A count is derived from the change markers. `useSavedSessions` projects them into a SET ' +
        'of session ids for per-row lookup, deliberately — a set has no meaningful length to ' +
        'render, which is the shape that makes FR-1031 hard to breach by accident.',
    ).toEqual([])
  })

  /**
   * **The list**, which is the destination FR-1034b forbids a notification from landing on.
   *
   * A notification that opened a changes screen would breach N2; so would a changes screen nobody
   * navigates to from a notification. The rule is about the surface existing.
   */
  it.each([
    ['a changes destination', /['"`]\/changes\b|['"`]\/updates\b|['"`]\/whats-new\b/i],
    ['a changes screen component', /\b(Changes|ChangeList|ChangeFeed|WhatsChanged)\s*[:=(]/],
    ['a stored collection of changes', /\bsetChanges\b|\bchanges\s*\.\s*map\b|\bChange\[\]/],
  ])('renders no %s (FR-1031, FR-1034b)', (_label, pattern) => {
    expect(
      offenders(pattern),
      'A surface whose subject is "what changed" exists. Activating a coalesced notification ' +
        'must land on Agenda — the destination carrying the per-row markers — and never on a ' +
        'list of changes (FR-1034b). This forbids the list existing to land on.',
    ).toEqual([])
  })

  /**
   * **The bell**, re-asserted rather than delegated to 007's guard.
   *
   * `no-notification-surface.test.ts` covers `apps/web` and was written when there was nothing to
   * put in a bell. 014 is the first feature since to add a second reason for one, and it also
   * covers the administrative client, which 007's guard does not scan at all.
   */
  it('renders no bell in either client, including the administrative one (FR-1031)', () => {
    const BELL =
      /import\s*\{[^}]*\bBell(Icon|Ring|Dot|Off)?\b[^}]*\}\s*from\s*'lucide-react'|<\s*Bell(Icon|Ring|Dot)?\b/

    expect(BELL.test("import { Bell } from 'lucide-react'")).toBe(true)
    expect(BELL.test("import { Ban, Flag } from 'lucide-react'")).toBe(false)

    expect(
      offenders(BELL),
      'A bell exists. v5.2.0 widened the trigger set and left this prohibition untouched: the ' +
        'bell and the in-app notification centre remain forbidden, unchanged.',
    ).toEqual([])
  })

  it('gives the administrative client no notification surface of any kind (FR-1031)', () => {
    const admin = BOTH_CLIENTS.filter(({ name }) => name.startsWith('admin/'))
    const notifying = offenders(
      /\bNotification\b|\brequestPermission\b|\bpushManager\b|\bserviceWorker\b/,
      admin,
    )

    expect(
      notifying,
      'The administrative client grew a notification surface. An organizer acts and is told the ' +
        'outcome synchronously; there is nothing to interrupt them about, and the cheapest way ' +
        'to breach N2 is a screen summarising what they just changed.',
    ).toEqual([])
  })

  /**
   * **The marker is per-row and stays that way**, stated positively.
   *
   * A rule expressed only as an absence stops being checked when somebody rewrites the code in a
   * shape the patterns do not recognise. This reads the mechanism that exists: one boolean prop
   * on one row component.
   */
  it('carries the marker as a per-row boolean and nothing else (FR-1030)', () => {
    const presentation = BOTH_CLIENTS.find(({ name }) =>
      name.endsWith('web/app/SessionPresentation.tsx'),
    )
    expect(presentation, 'the shared session presentation could not be located').toBeDefined()

    const code = codeOf(presentation?.text ?? '')
    expect(code).toMatch(/changed\s*\?:\s*boolean|changed\s*=\s*false/)
    expect(
      /changed\s*:\s*number/.test(code),
      'The marker became a number. It is per-row state about ONE session; a number is an ' +
        'aggregate wherever it is rendered (FR-1031).',
    ).toBe(false)
  })
})

/**
 * T110 (014 tranche 2) — **the client half of FR-1047: nothing in either product branches on
 * the conference format.** The server half — the write-path allow-list and the contract walk
 * proving no attendee route serialises it — is in `apps/api/tests/unit/authoring-absences.test.ts`.
 *
 * The attendee client cannot reference a value its contract never carries, so for `apps/web`
 * this asserts a total absence. The administrative client legitimately COLLECTS and DISPLAYS
 * the label — that is what a descriptive label is for — so its three carrying surfaces are
 * named, and anything beyond them (a filter, an ordering, a conditional render keyed on it)
 * fails here by existing.
 *
 * The pattern excludes the three unrelated meanings of the word this codebase already has: the
 * `Intl` formatter CALL (`.format(instant)`), the JSON-schema KEYWORD (`format: 'uuid'`), and
 * hyphenated flags (`--path-format`). The exclusions are self-tested, per 009's rule that a
 * guard exercised only by the code that happens to exist stops guarding when it changes.
 */
describe('014 tranche 2 — no client branches on the conference format (FR-1047)', () => {
  const CONFERENCE_FORMAT_REFERENCE = /(?<!-)\bformat\b(?!\s*\()(?!\s*:\s*['"])/

  const ADMIN_FORMAT_SURFACES = [
    'admin/app/conferences/CreateConferenceDialog.tsx',
    'admin/app/conferences/ConferenceEditor.tsx',
    'admin/app/conferences/ProgrammeEditor.tsx',
  ]

  it('recognises the shapes it exists to catch, and ignores the three legitimate ones', () => {
    expect(CONFERENCE_FORMAT_REFERENCE.test('conference.format ?? null')).toBe(true)
    expect(CONFERENCE_FORMAT_REFERENCE.test("format === 'hackathon'")).toBe(true)
    expect(CONFERENCE_FORMAT_REFERENCE.test('sessions.filter((s) => s.format)')).toBe(true)

    expect(CONFERENCE_FORMAT_REFERENCE.test('formatter.format(instant)')).toBe(false)
    expect(CONFERENCE_FORMAT_REFERENCE.test("id: { type: 'string', format: 'uuid' }")).toBe(false)
    expect(CONFERENCE_FORMAT_REFERENCE.test("['--path-format=absolute']")).toBe(false)
  })

  it('keeps the attendee client entirely free of the conference format', () => {
    const web = BOTH_CLIENTS.filter(({ name }) => name.startsWith('web/'))
    expect(
      offenders(CONFERENCE_FORMAT_REFERENCE, web),
      'The attendee client references the conference format — a value its contract never ' +
        'carries. FR-1047 forbids anything branching on it, and the attendee product has no ' +
        'legitimate use for the label at all.',
    ).toEqual([])
  })

  it('confines the administrative client to its three carrying surfaces', () => {
    const admin = BOTH_CLIENTS.filter(({ name }) => name.startsWith('admin/'))
    const referencing = offenders(CONFERENCE_FORMAT_REFERENCE, admin)

    expect(
      referencing.filter((name) => !ADMIN_FORMAT_SURFACES.includes(name)),
      'A new administrative surface references the conference format. Collecting and ' +
        'displaying the label is its purpose; a filter, an ordering or a conditional keyed on ' +
        'it is the second modality FR-1047 forbids. If this is a new display surface, adding ' +
        'it to ADMIN_FORMAT_SURFACES is the conversation.',
    ).toEqual([])

    // Non-vacuity: the named surfaces do carry it, or the pattern has rotted.
    for (const surface of ADMIN_FORMAT_SURFACES) {
      expect(referencing, `${surface} no longer references format — the list is stale`).toContain(
        surface,
      )
    }
  })
})
