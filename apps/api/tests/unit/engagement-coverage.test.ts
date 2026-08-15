import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { ENGAGEMENT_TABLES } from '../../src/db/queries/session-changes.js'

/**
 * T017 (014) — **the engagement structural guard, and the third of its kind** (FR-1018a,
 * research R5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TEST EXISTS TO FAIL A FUTURE FEATURE'S BUILD, NOT THIS ONE'S.**
 *
 * `deletion-coverage.test.ts` fails when a table holding attendee data is reached by neither a
 * cascade nor a retention rule. `export-coverage.test.ts` fails when a collected column appears in
 * no export. Both derive their expectations from the Drizzle schema, so **a new table or column
 * fails by existing**. This is the third, and FR-1018a asks for it in those words.
 *
 * What it protects is narrower and sharper than either. A session may be deleted only while
 * **nobody** has engaged with it (FR-1018), because every table holding attendee state about a
 * session cascades from `sessions.id` — one `DELETE` and the database silently destroys other
 * people's private writing, with no confirmation and no record.
 *
 * Two enumerated expressions decide that — `ENGAGEMENT_TABLES` in `session-changes.ts` (the
 * table set of record, feeding the fan-out) and `engagementCountsFor`/`countEngagement` in
 * `admin-catalog.ts` (the delete refusal's live predicate) — and an **enumerated** list is a
 * list that ages. Its failure mode is the worst available: a later feature adds
 * `session_reactions`, nobody remembers either expression, and deletions resume destroying
 * attendee data **with every existing test still green**. Nothing about adding a table makes
 * anybody open `session-changes.ts` or `admin-catalog.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE ONE-HOP CASE IS ENUMERATED RATHER THAN COMPUTED BY CLOSURE, AND THAT IS A DECISION.**
 *
 * `question_votes` references `attendees` directly and `sessions` only through
 * `session_questions`. Transitive closure over cascade edges would find it — and would also find
 * every table that merely *happens* to be reachable from a session through some chain, which is a
 * much larger and much less meaningful set. `deletion-coverage.test.ts` computes reachability
 * because its question genuinely is *"does erasure reach this row"*; this question is *"is this
 * row attendee state about a session"*, and those differ.
 *
 * So the hop is declared, with the chain it travels, and a second one has to be declared too.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const schemaDir = fileURLToPath(new URL('../../src/db/schema/', import.meta.url))

const SESSIONS = 'sessions'
const ATTENDEES = 'attendees'

/**
 * Tables that reach `sessions` through exactly one intermediate table, with the table they travel
 * through. **Each entry is a claim the assertions below check against the schema**, not a
 * declaration that is trusted.
 */
const ONE_HOP: Record<string, string> = {
  question_votes: 'session_questions',
}

/**
 * Tables referencing both `sessions` and `attendees` that are nevertheless **not** engagement.
 *
 * One entry, and it is the category that most needs to stay that way: an entry here is a table
 * whose rows may be destroyed by an organizer's delete. Any addition must say whose data it is
 * and why losing it silently is acceptable — which is a hard sentence to write, deliberately.
 */
const NOT_ENGAGEMENT: Record<string, string> = {
  // T123 (014 tranche 2, FR-1077/FR-1078). The keeper of this list wrote the paragraph below to
  // be copied badly: the second entry will be modelled on this one, and the second entry is the
  // one this list exists to make hard.
  session_enrolments:
    "A held place in an optional session. It is the ATTENDEE'S data — their claim on a seat, " +
    'taken by their own act — and deleting such a session destroys every held place with no ' +
    'notification, no marker and no trace: the person who reserved one finds out by arriving. ' +
    'That silence is acceptable only because the OWNER ratified it, in constitution v5.3.0 (O2, ' +
    'standing decision 51), after it was put to them with the cost stated: an enrolled attendee ' +
    'holds no saved row (enrolling REPLACES saving, FR-1064), so no marker and no push can ' +
    "reach them, and the organizer's delete confirmation is the only warning anybody receives " +
    '(FR-1077b/c). The engagement set stays at exactly four — a saved session, a private note, ' +
    'a question, a vote — and this entry is NOT precedent for a second one: O2 declares this ' +
    'one attachment type outside the set and nothing else, and narrowing the four is forbidden. ' +
    'Register entry 31 is OPEN against this entry — whether deleting a session should notify ' +
    'the enrolled — and its remedy would be a third notification trigger, i.e. another ' +
    'amendment; until then the deletion is silent by ratified decision, not by oversight.',
}

interface TableFacts {
  readonly name: string
  readonly references: readonly string[]
}

const readSchemaTables = async (): Promise<TableFacts[]> => {
  const files = readdirSync(schemaDir).filter((file) => file.endsWith('.ts') && file !== 'index.ts')

  const facts: TableFacts[] = []

  for (const file of files) {
    const module: Record<string, unknown> = await import(join(schemaDir, file))

    for (const value of Object.values(module)) {
      if (!is(value, PgTable)) continue
      const config = getTableConfig(value)

      facts.push({
        name: config.name,
        references: config.foreignKeys.map(
          (key) => getTableConfig(key.reference().foreignTable).name,
        ),
      })
    }
  }

  return facts
}

describe('engagement coverage (T017, FR-1018a)', () => {
  let tables: TableFacts[]

  const load = async (): Promise<TableFacts[]> => (tables ??= await readSchemaTables())

  it('found the schema to audit', async () => {
    // A gate that cannot fail is not a gate. If the schema directory were renamed, or Drizzle
    // stopped answering `getTableConfig`, every assertion below would pass vacuously.
    const found = await load()
    expect(found.length).toBeGreaterThan(10)
    expect(found.map((table) => table.name)).toContain(SESSIONS)
    expect(found.map((table) => table.name)).toContain(ATTENDEES)
  })

  it('covers every table that is attendee state about a session', async () => {
    const found = await load()

    const direct = found
      .filter((table) => table.references.includes(SESSIONS))
      .filter((table) => table.references.includes(ATTENDEES))
      .map((table) => table.name)

    const uncovered = direct
      .filter((name) => !(ENGAGEMENT_TABLES as readonly string[]).includes(name))
      .filter((name) => !(name in NOT_ENGAGEMENT))

    expect(
      uncovered,
      'These tables reference both `sessions` and `attendees`, so they hold attendee state ' +
        'about a session — and the engagement expressions do not consult them. Every one of ' +
        'them cascades from `sessions.id`, which means an organizer deleting a session would ' +
        'silently destroy what they contain (FR-1018, FR-1019). Add the table to ' +
        '`ENGAGEMENT_TABLES` in `session-changes.ts` AND to `engagementCountsFor` in ' +
        '`admin-catalog.ts` (the live delete predicate), or add it to NOT_ENGAGEMENT with a ' +
        'written reason for why losing those rows without warning is acceptable.',
    ).toEqual([])
  })

  it('covers the one-hop tables it declares, and each hop is real', async () => {
    const found = await load()
    const byName = new Map(found.map((table) => [table.name, table]))

    for (const [name, through] of Object.entries(ONE_HOP)) {
      const table = byName.get(name)
      expect(
        table,
        `${name} is declared as one hop from a session but is not in the schema`,
      ).toBeDefined()

      // The declared chain is checked rather than believed: `question_votes` → `session_questions`
      // → `sessions`, and `question_votes` → `attendees`. A schema change breaking either link
      // makes the entry a claim about a relationship that no longer exists.
      expect(
        table?.references,
        `${name} is declared as reaching a session through ${through}, but does not reference it`,
      ).toContain(through)
      expect(
        byName.get(through)?.references,
        `${through} is declared as the hop from ${name} to a session, but does not reference one`,
      ).toContain(SESSIONS)
      expect(
        table?.references,
        `${name} is declared as engagement but references no attendee, so it is not attendee state`,
      ).toContain(ATTENDEES)

      expect(
        ENGAGEMENT_TABLES as readonly string[],
        `${name} reaches a session through ${through} and holds attendee data, so deleting the ` +
          'session destroys it. `ENGAGEMENT_TABLES` and `engagementCountsFor` must consult ' +
          'it (FR-1018a).',
      ).toContain(name)
    }
  })

  it('declares no table it does not cover, and covers nothing that has vanished', async () => {
    const found = await load()
    const names = new Set(found.map((table) => table.name))

    // The inverse failure: an entry naming a table that has been renamed or removed is a
    // predicate branch that can never fire, sitting in a function that reads as complete.
    for (const table of ENGAGEMENT_TABLES) {
      expect(
        names.has(table),
        `${table} is in the engagement predicate but not in the schema`,
      ).toBe(true)
    }

    for (const [name, reason] of Object.entries(NOT_ENGAGEMENT)) {
      expect(names.has(name), `${name} is excluded from engagement but no longer exists`).toBe(true)

      // FR-1078's floor, not style: each mandated element of the written reason is checked for,
      // because a length check verifies that A sentence exists rather than that the required
      // claims do — an 81-character reason omitting every one of them would have passed.
      expect(reason, `${name}'s reason must say WHOSE data it is`).toMatch(/attendee|their/i)
      expect(
        reason,
        `${name}'s reason must cite the decision that ratified the silent loss`,
      ).toMatch(/v5\.\d+\.\d+|O\d|decision \d+|ratified/)
      expect(reason, `${name}'s reason must state it is not precedent`).toMatch(/not precedent/i)
      expect(
        reason,
        `${name}'s reason must say why losing the rows silently is acceptable`,
      ).toMatch(/acceptable|accepted/i)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE COUNTS MUST COVER THE SAME TABLES AS THE BOOLEAN, AND THIS GUARD USED TO CHECK ONLY
   * THE BOOLEAN.**
   *
   * Added by the deep review. `hasEngagement` in `session-changes.ts` was one expression of the
   * table set (since deleted — `ENGAGEMENT_TABLES` survives there on its own); `admin-catalog.ts`
   * had **two more** — a count keyed to a literal id for the delete
   * refusal, and a correlated one for the programme read — and neither was covered here. So a
   * later feature adding an attendee-state table would get a correctly-refusing delete and two
   * count queries that silently under-report.
   *
   * That is not cosmetic. `CancelDialog` decides whether to offer "Delete it permanently" from
   * these counts: a count reading zero for a session the server refuses to delete is a control
   * that exists only to produce a 409, which is the precise outcome FR-1019's *"the refusal MUST
   * explain why and MUST offer cancellation"* was written to avoid.
   *
   * The counts are now composed from **one** `engagementCountsFor` fragment in `admin-catalog.ts`,
   * so this reads that source and requires every table in `ENGAGEMENT_TABLES` to appear in it.
   * Reading the file rather than importing the fragment is deliberate: the fragment is a private
   * SQL builder, and exporting it to be asserted would widen the surface to satisfy a test.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('counts the same tables the predicate does (FR-1018a)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/db/queries/admin-catalog.ts', import.meta.url)),
      'utf8',
    )

    const fragment = /const engagementCountsFor = \(session: SQL\) => sql`([\s\S]*?)`/.exec(source)

    expect(
      fragment?.[1],
      'the engagement count fragment could not be located in `admin-catalog.ts`. If it was ' +
        'renamed or inlined, this guard stopped checking anything — which is the failure mode ' +
        'FR-1018a exists to prevent, arriving in the guard rather than in the predicate.',
    ).toBeTruthy()

    const counted = fragment?.[1] ?? ''

    for (const table of ENGAGEMENT_TABLES) {
      expect(
        // The fragment references Drizzle table objects, whose variable names are camelCase
        // versions of the table names. Both spellings are accepted so this does not depend on
        // which one the query happens to use.
        new RegExp(`${table}|${table.replace(/_(.)/g, (_, c: string) => c.toUpperCase())}`).test(
          counted,
        ),
        `${table} is in the engagement predicate but not in the engagement COUNTS. The delete ` +
          'refusal and the programme read would both under-report it, so an organizer would be ' +
          'offered a delete the server refuses (FR-1019).',
      ).toBe(true)
    }
  })

  it('names exactly the four tables 014 shipped with, so a fifth is a decision', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The assertions above fail when a NEW table is missed. This one fails when the predicate
    // is **narrowed** — somebody deleting a branch to make a delete succeed, which is the
    // natural repair when a guard fires on something you want to remove.
    //
    // Extending it is a one-line edit with a failing test to explain it. Shrinking it is the
    // same edit, and this is what makes the two look different.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect([...ENGAGEMENT_TABLES].sort()).toEqual([
      'question_votes',
      'saved_sessions',
      'session_notes',
      'session_questions',
    ])
  })
})
