import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { RETENTION_SWEEPS } from '../../src/maintenance.js'

/**
 * T014 (004) — **the deletion structural guard** (FR-370).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TEST EXISTS TO FAIL A FUTURE FEATURE'S BUILD, NOT THIS ONE'S.**
 *
 * Constitution v2.3.0 makes deletion coverage a per-feature duty: every feature storing
 * attendee data declares how its records are reached, in the change that introduces them.
 * FR-370 turns that from a review habit into a build failure — *no personal-data table may
 * exist that is neither reached by the deletion cascade nor covered by a retention rule.*
 *
 * **It is placed in Phase 2 deliberately, not with US7 where deletion is implemented.** A guard
 * written after the tables it protects cannot have protected them, and phases 3–9 of this
 * feature alone add six. 006 through 009 will add more, each written by someone who has not
 * read this file — which is the entire point.
 *
 * **A new table fails this test by existing.** There is no "unclassified" outcome: a table is
 * cascade-covered, or swept, or explicitly deleted with a named proof, or declared not to hold
 * attendee data with a reason. Adding a fifth category is a decision; forgetting to classify is
 * not possible.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const schemaDir = fileURLToPath(new URL('../../src/db/schema/', import.meta.url))
const apiRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * The table every cascade points at. Deleting this row **is** the deletion (FR-364, D10), so it
 * is neither covered by a cascade nor swept — it is the thing doing the covering.
 */
const ROOT_TABLE = 'attendees'

/**
 * Tables holding no attendee data. **Each entry states why**, because an allow-list whose
 * entries carry no reasoning is how a personal-data table eventually joins one.
 */
const NOT_ATTENDEE_DATA: Record<string, string> = {
  events: 'Seeded conference content. `join_code` is not attendee data (FR-311, FR-317a).',
  tracks: 'Seeded conference content (002).',
  rooms: 'Seeded conference content (002).',
  speakers:
    'Seeded conference content. A speaker is data the attendee reads, not a user of the system ' +
    '— 002 records that the same human at two conferences is two unrelated rows.',
  sessions: 'Seeded conference content (002).',
  session_speakers: 'A join between two pieces of seeded conference content (002).',
}

/**
 * Tables the **application** deletes explicitly, because no foreign key can reach them.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This category has exactly one member, and it is the reason FR-370 is a requirement rather
 * than a note** (research D3, D10).
 *
 * `stored_objects` deliberately holds no foreign key to `attendees`: it is the backing table of
 * one `StorageService` adapter, and a key-value store must not know what its callers put in it
 * — the production adapter is a bucket and *cannot* have one, so enforcing a relationship here
 * would make the abstraction a lie.
 *
 * The consequence is that avatar bytes are the one piece of attendee personal data the cascade
 * cannot reach, and the delete path removes them explicitly and **first**, so a mid-operation
 * failure orphans a row pointing at missing bytes rather than bytes no row references.
 *
 * `provenBy` is not decoration. A declaration in this file is a claim; the named integration
 * test is what checks it against a real database. Deleting that test breaks this one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const EXPLICITLY_DELETED: Record<string, { reason: string; provenBy: string }> = {
  stored_objects: {
    reason:
      'No foreign key by design (research D3): the adapter is a key-value store and the ' +
      'production adapter cannot have one. `deleteAccount` removes the object explicitly, and ' +
      'before the attendee row, so a failure cannot leave unreachable bytes (research D10).',
    provenBy: 'tests/integration/account-deletion-storage.test.ts',
  },
}

interface TableFacts {
  readonly name: string
  readonly columns: readonly string[]
  readonly cascadesFromAttendees: boolean
  readonly referencesAttendees: boolean
}

/**
 * Every table the schema declares, read from the **files on disk** rather than from the barrel.
 *
 * A table added in a new file but not exported from `schema/index.ts` would be invisible to a
 * barrel-based scan — and invisible is exactly what this guard must not permit. The dynamic
 * import is also what keeps `stored_objects` reachable here without a static import, which the
 * storage-boundary lint rule forbids everywhere outside `src/storage/`.
 */
const readSchemaTables = async (): Promise<TableFacts[]> => {
  const files = readdirSync(schemaDir).filter((file) => file.endsWith('.ts') && file !== 'index.ts')

  const facts: TableFacts[] = []

  for (const file of files) {
    const module: Record<string, unknown> = await import(join(schemaDir, file))

    for (const value of Object.values(module)) {
      if (!is(value, PgTable)) continue

      const config = getTableConfig(value)
      const toAttendees = config.foreignKeys.filter(
        (key) => getTableConfig(key.reference().foreignTable).name === ROOT_TABLE,
      )

      facts.push({
        name: config.name,
        columns: config.columns.map((column) => column.name),
        referencesAttendees: toAttendees.length > 0,
        cascadesFromAttendees: toAttendees.some((key) => key.onDelete === 'cascade'),
      })
    }
  }

  return facts
}

const sweptTables = new Set(RETENTION_SWEEPS.map((sweep) => sweep.table))

describe('deletion coverage (T014, FR-370)', () => {
  let tables: TableFacts[]

  it('found the schema to audit', async () => {
    tables = await readSchemaTables()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A gate that cannot fail is not a gate. If the schema directory were renamed, or Drizzle
    // stopped answering `getTableConfig`, every assertion below would pass vacuously while
    // checking nothing at all. This is what notices — the same reasoning the route audit
    // records for its own "found routes" case.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(tables.length).toBeGreaterThan(10)
    expect(tables.map((table) => table.name)).toContain(ROOT_TABLE)
  })

  it('classifies EVERY table — an unclassified table is a failure, not a default', async () => {
    tables ??= await readSchemaTables()

    const unclassified = tables
      .filter((table) => table.name !== ROOT_TABLE)
      .filter((table) => !table.cascadesFromAttendees)
      .filter((table) => !sweptTables.has(table.name))
      .filter((table) => !(table.name in EXPLICITLY_DELETED))
      .filter((table) => !(table.name in NOT_ATTENDEE_DATA))
      .map((table) => table.name)

    expect(
      unclassified,
      'These tables are reached by NOTHING when an attendee deletes their account, and no ' +
        'retention rule removes them either (FR-370, constitution v2.3.0).\n\n' +
        'Pick one, in the change that introduced the table:\n' +
        '  1. Add `.references(() => attendees.id, { onDelete: "cascade" })` — the default, and ' +
        'right for anything attributable to one attendee.\n' +
        '  2. Add it to RETENTION_SWEEPS in src/maintenance.ts with a stated window (FR-383).\n' +
        '  3. Add it to EXPLICITLY_DELETED here, with the reason no foreign key can reach it AND ' +
        'an integration test that proves the deletion against a real database.\n' +
        '  4. Add it to NOT_ATTENDEE_DATA here, with the reason it holds no attendee data.\n\n' +
        'Do not pick 4 to make this pass.',
    ).toEqual([])
  })

  it('never lets a reference to attendees exist without a cascade', async () => {
    tables ??= await readSchemaTables()

    // A foreign key to `attendees` with `ON DELETE NO ACTION` is worse than no key at all: it
    // makes the row attendee-attributable *and* makes deleting the attendee fail outright.
    const weak = tables
      .filter((table) => table.referencesAttendees && !table.cascadesFromAttendees)
      .map((table) => table.name)

    expect(
      weak,
      'These tables reference `attendees` without ON DELETE CASCADE. Deleting an account would ' +
        'fail on the constraint rather than removing them (FR-365, FR-366).',
    ).toEqual([])
  })

  it('catches an attendee_id column that is not a real foreign key', async () => {
    tables ??= await readSchemaTables()

    // The shape of a table that *looks* covered and is not: it carries an attendee identifier,
    // so it is unmistakably personal data, but the identifier is a bare column no cascade
    // follows. `sign_in_attempts` is the deliberate exception and is swept instead.
    const orphaned = tables
      .filter((table) => table.columns.includes('attendee_id'))
      .filter((table) => !table.referencesAttendees)
      .filter((table) => !sweptTables.has(table.name))
      .filter((table) => !(table.name in EXPLICITLY_DELETED))
      .map((table) => table.name)

    expect(
      orphaned,
      'These tables hold an `attendee_id` that is not a foreign key, so nothing follows it when ' +
        'the attendee is deleted. If the missing key is deliberate, say so — and cover the rows ' +
        'by a sweep or an explicit delete (FR-370, FR-383).',
    ).toEqual([])
  })

  it('keeps every explicit-deletion claim backed by a test that actually exists', () => {
    for (const [table, { provenBy }] of Object.entries(EXPLICITLY_DELETED)) {
      expect(
        existsSync(join(apiRoot, provenBy)),
        `${table} is declared as explicitly deleted, and ${provenBy} is named as the proof — but ` +
          'that file does not exist. A declaration without a check is a claim, and this category ' +
          'is the one FR-370 exists to catch.',
      ).toBe(true)
    }
  })

  it('keeps every allow-list entry pointing at a table that still exists', async () => {
    tables ??= await readSchemaTables()
    const known = new Set(tables.map((table) => table.name))

    // An allow-list that outlives its tables is how a *new* table quietly inherits an old
    // exemption by sharing a name. The route audit makes the same assertion for the same reason.
    for (const name of [...Object.keys(NOT_ATTENDEE_DATA), ...Object.keys(EXPLICITLY_DELETED)]) {
      expect(known, `${name} is allow-listed here but no longer exists in the schema`).toContain(
        name,
      )
    }
  })

  it('keeps every retention sweep pointing at a table that still exists', async () => {
    tables ??= await readSchemaTables()
    const known = new Set(tables.map((table) => table.name))

    for (const sweep of RETENTION_SWEEPS) {
      expect(
        known,
        `RETENTION_SWEEPS names ${sweep.table}, which is not in the schema. A sweep of a table ` +
          'that no longer exists is a retention rule covering nothing.',
      ).toContain(sweep.table)
    }
  })

  it('requires every retention sweep to state its window and its reason (FR-381)', () => {
    // FR-381 asks for a *stated* schedule. An entry with an empty reason is a table whose
    // retention nobody has justified, which is the state this whole guard exists to prevent.
    for (const sweep of RETENTION_SWEEPS) {
      expect(
        sweep.window.trim().length,
        `${sweep.table} states no retention window`,
      ).toBeGreaterThan(0)
      expect(sweep.reason.trim().length, `${sweep.table} states no reason`).toBeGreaterThan(20)
    }
  })

  /**
   * The same demand made of `RETENTION_SWEEPS` above, made of the two allow-lists that let a
   * table out of the deletion requirement entirely (FR-370).
   *
   * The guard's own escape-hatch message tells a future author to add their table "with the
   * reason it holds no attendee data" and then says *"Do not pick 4 to make this pass."* Until
   * now nothing checked that a reason was given at all — `new_attendee_table: ''` went green.
   * The export guard has asserted this for both of its allow-lists since it was written; this
   * closes the asymmetry, on the guard where the consequence is larger.
   */
  it('states a reason for every allow-list entry, not merely a key (FR-370)', () => {
    for (const [table, reason] of Object.entries(NOT_ATTENDEE_DATA)) {
      expect(
        reason.trim().length,
        `${table} is excluded from the deletion requirement with no reason stated`,
      ).toBeGreaterThan(20)
    }

    for (const [table, entry] of Object.entries(EXPLICITLY_DELETED)) {
      expect(
        entry.reason.trim().length,
        `${table} claims explicit deletion with no reason stated`,
      ).toBeGreaterThan(20)
    }
  })

  it('holds sign_in_attempts to its two-hour window, which FR-382 forbids lengthening', () => {
    // Named explicitly rather than left to the generic assertions above, because this is the
    // one the 004 specification got wrong before planning caught it: an earlier draft assumed
    // 90 days and assumed nothing swept, which would have lengthened retention of pseudonymous
    // personal data forty-fold — a regression dressed as a requirement (research D1).
    const attempts = RETENTION_SWEEPS.find((sweep) => sweep.table === 'sign_in_attempts')

    expect(attempts, '`sign_in_attempts` must be swept — no cascade reaches it').toBeDefined()
    expect(
      attempts?.window,
      "FR-382 forbids lengthening this window. Two hours is the throttle's one-hour counting " +
        'window plus margin, and the shortest correct window is the right one for a table of ' +
        'keyed hashes of every address ever typed at this service.',
    ).toBe('2 hours')
  })
})
