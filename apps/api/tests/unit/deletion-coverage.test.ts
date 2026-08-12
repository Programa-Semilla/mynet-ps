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

  /**
   * T017 (007) — **the only one of 007's seven tables that needs an entry here, and the
   * emptiness that earns it is deliberate rather than incidental** (FR-575, FR-576,
   * data-model.md).
   *
   * FR-576 requires every table this feature introduces to be classified. Six of the seven are
   * classified by *cascading from `attendees`*, which this gate reads out of the schema — so
   * they need no line here and gain one only by losing their cascade, which would fail the
   * build. This is the seventh.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * `conversations` carries an id, a creation timestamp and a denormalised `last_message_at`.
   * **No participant identifier, no title, no topic, no membership list.** After both
   * participants delete their accounts, a row here would name nobody — which is what makes
   * FR-573 true of this table by construction instead of by a deletion routine remembering to
   * visit it.
   *
   * That emptiness is exactly why `conversation_pairs` exists as a separate table (research
   * R10): the obvious way to enforce one-conversation-per-pair puts both identifiers in a
   * column *here*, and would have retained a departed attendee's identifier forever in the very
   * thing enforcing uniqueness.
   *
   * **It is still removed rather than retained** (FR-575) — an unreferenced conversation is
   * litter, not a record — but that removal is `deleteAccount`'s empty-conversation sweep
   * (T131), not a cascade, and it is proven by
   * `tests/integration/conversation-empty-removal.test.ts` (T127). It is listed here rather
   * than in EXPLICITLY_DELETED because the classification question this guard asks is "does it
   * hold attendee data", and the answer is no.
   *
   * The other six tables need no entry: every one cascades from `attendees` through a real
   * foreign key, which is the outcome M3 was chosen to produce.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  conversations:
    'Holds no attendee identifier at all — no participant column, by design (FR-573, research ' +
    'R10). Participation lives in `conversation_participants`, which cascades; the pair ' +
    'constraint lives in `conversation_pairs`, which cascades. An empty conversation is removed ' +
    'by `deleteAccount` (FR-575), proven in tests/integration/conversation-empty-removal.test.ts.',

  /**
   * T025 (008) — **the only one of this feature's three tables that needs an entry here**
   * (FR-654, data-model.md).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * `shared_cards` and `appointments` are classified by *cascading from `attendees`*, which this
   * gate reads straight out of the schema — four attendee references between them, every one
   * `ON DELETE CASCADE`. They need no line here and could only gain one by losing a cascade,
   * which would fail the build. T026 proves that by running this test rather than by assuming it.
   *
   * This is the third table, and it holds nothing about anybody. A slot is `(event_id,
   * starts_at, ends_at)` — seeded conference content, in exactly the sense `sessions` and `rooms`
   * above are, and produced by the same mechanism: a committed seed module with **no write path
   * at any privilege** (FR-623, Principle III).
   *
   * It is worth saying why it is *not* attendee data even though attendees choose slots. The
   * choosing is recorded in `appointments`, which cascades. A slot is the grid, not the booking —
   * removing an attendee must not remove a conference's 09:30 from everybody else's dialog.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  meeting_slots:
    'Seeded conference content (008, FR-623). `(event_id, starts_at, ends_at)` and nothing else ' +
    '— no attendee identifier, and no route at any privilege creates, edits or deletes one. The ' +
    'attendee-attributable half of scheduling lives in `appointments`, whose two participant ' +
    'references both cascade. A slot is the grid, not the booking: removing an attendee must not ' +
    "remove a conference's 09:30 from everybody else's scheduling dialog.",

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T025 (011) — TWO OF THIS FEATURE'S FIVE TABLES ARE NOT ATTENDEE DATA, AND SAYING WHY IS
   * HARDER HERE THAN ANYWHERE ABOVE, BECAUSE BOTH CONCERN PEOPLE.**
   *
   * Every other entry in this category is *conference content*: a session, a room, a slot. The
   * question "does it hold attendee data" answers itself. These two hold identifiers of humans,
   * and are still not attendee data — so the reasoning has to be explicit rather than obvious.
   *
   * The distinction Principle VIII actually draws is not "is a person mentioned" but **"is this
   * a record about an attendee, attributable to one identity, that their erasure right
   * reaches"**. An operator is not an attendee: they have no `attendees` row, no profile, no
   * discoverability, and they appear on no attendee surface (FR-903). An audit entry is a record
   * of an **operator's act**, not of the attendee it concerns — and the attendee half of it is
   * removed on erasure, which is the whole of FR-997a.
   *
   * `operator_sessions` needs no entry at all, and the reason is worth noting because it looks
   * like an omission: it carries a real `attendee_id` foreign key with `ON DELETE CASCADE` for
   * the organizer tier, so this guard classifies it out of the schema without help. That is the
   * outcome, not a gap — a conference organizer's administrative session must die with their
   * account exactly as their MyNet session does.
   *
   * `organizer_assignments` likewise: it cascades from `attendees` and **is** attendee data, so
   * it is deliberately absent from this list and present in `export-coverage` instead (FR-981).
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  operators:
    'The second actor is NOT an attendee (011, FR-901). No `attendees` row, no profile, no ' +
    "discoverability, and no attendee surface names one (FR-903) — so Principle VIII's erasure " +
    "right, which is an ATTENDEE's, does not reach it and no cascade can. The lifecycle is " +
    '**deactivate-plus-clock**: deactivation (FR-908) is the terminal state, there is no ' +
    'self-serve deletion, and the row is retained while any `admin_audit_entries` or ' +
    '`report_resolutions` row names it (FR-909) — a resolution attributed to nobody is an ' +
    'accountability record with the accountability removed. The sweep in RETENTION_SWEEPS ' +
    'removes it once both conditions hold. Note this table IS therefore also swept, so this ' +
    'entry is belt and braces: it records WHY no cascade exists, which the sweep alone does not.',

  admin_audit_entries:
    "A record of an OPERATOR'S ACT, not of the attendee it concerns (011, FR-994–FR-999). The " +
    'attendee half is a plain nullable column with **no foreign key**, deliberately: CASCADE ' +
    'would let the person an act indicts erase the record of it, RESTRICT would block a ' +
    'deletion the erasure right requires, and SET NULL would produce the right outcome while ' +
    'coupling a retention DECISION to a constraint rather than to a written rule (research R6). ' +
    'The rule is **pseudonymise-plus-clock**: `deleteAccount` clears `subject_attendee_id` in ' +
    'the same transaction (FR-997a) — no flag, no sentinel row, nothing reconstructible ' +
    '(FR-997b) — and only then does the RETENTION_SWEEPS window start (FR-998). That window ' +
    'must not be shorter than the retention of the records it explains.',
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
  /**
   * T025 (011) — every table this one cascades **from**, whatever that table is.
   *
   * Recorded so transitive reachability can be **computed** rather than declared. See
   * `reachedByCascade` below for why that distinction matters.
   */
  readonly cascadeParents: readonly string[]
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **T025 (011) — CASCADE COVERAGE IS A REACHABILITY QUESTION, NOT A ONE-HOP ONE.**
 *
 * This guard used to ask "does this table cascade directly from `attendees`". That was true of
 * every table for four features, and 011 produced the first counter-example: `report_resolutions`
 * has **no attendee column at all**. It cascades from `abuse_reports`, which cascades from both
 * the reporter and the reported attendee — so an attendee's erasure does reach it, in two hops.
 *
 * The available responses were an allow-list entry or this. An allow-list entry would have been
 * a *claim* that the chain exists, sitting next to entries that are claims about tables holding
 * no attendee data — and the two would have looked alike while being completely different kinds
 * of statement. Worse, the claim would not notice if somebody later changed
 * `report_resolutions.report_id` to `ON DELETE NO ACTION`: the comment would still read
 * correctly and the coverage would be gone.
 *
 * Computing it means the chain is checked on every run, against the schema, and a broken link
 * anywhere along it fails the build naming the table that lost its cascade. That is the same
 * standard every other assertion in this file already meets.
 *
 * The walk is depth-first over cascade edges only — a `NO ACTION` or `SET NULL` reference is not
 * a path, because deleting the parent would fail or would leave the child behind.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const reachedByCascade = (name: string, byName: Map<string, TableFacts>): boolean => {
  const seen = new Set<string>()

  const walk = (current: string): boolean => {
    if (current === ROOT_TABLE) return true
    if (seen.has(current)) return false
    seen.add(current)

    const facts = byName.get(current)
    if (!facts) return false

    return facts.cascadeParents.some((parent) => walk(parent))
  }

  return byName.get(name)?.cascadeParents.some((parent) => walk(parent)) ?? false
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
        // Cascade edges only. A `NO ACTION` or `SET NULL` reference is not a path — deleting
        // the parent would fail, or would leave this row behind with a null.
        cascadeParents: config.foreignKeys
          .filter((key) => key.onDelete === 'cascade')
          .map((key) => getTableConfig(key.reference().foreignTable).name),
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

    const byName = new Map(tables.map((table) => [table.name, table]))

    const unclassified = tables
      .filter((table) => table.name !== ROOT_TABLE)
      .filter((table) => !table.cascadesFromAttendees)
      // T025 (011) — and reached by no *chain* of cascades either. See `reachedByCascade`.
      .filter((table) => !reachedByCascade(table.name, byName))
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
        'right for anything attributable to one attendee. A cascade from a table that is ' +
        'itself cascade-reachable also counts, and is COMPUTED rather than declared.\n' +
        '  2. Add it to RETENTION_SWEEPS in src/maintenance.ts with a stated window (FR-383).\n' +
        '  3. Add it to EXPLICITLY_DELETED here, with the reason no foreign key can reach it AND ' +
        'an integration test that proves the deletion against a real database.\n' +
        '  4. Add it to NOT_ATTENDEE_DATA here, with the reason it holds no attendee data.\n\n' +
        'Do not pick 4 to make this pass.',
    ).toEqual([])
  })

  /**
   * T025 (011) — **the transitive walk is asserted, not assumed.**
   *
   * `reachedByCascade` is the newest and least obvious mechanism in this file, and the failure
   * mode it introduces is the one every audit in this codebase has had to guard against: a
   * predicate that quietly stops matching makes every table look classified. If the walk ever
   * returned `true` for everything, the "classifies EVERY table" assertion above would pass
   * vacuously while checking nothing at all.
   *
   * So both directions are pinned against known cases. `report_resolutions` is the reason the
   * walk exists — it holds no attendee column and is reached in two hops through
   * `abuse_reports`. `operators` must stay unreachable, because it is genuinely not attendee
   * data and its classification comes from the allow-list plus a retention sweep.
   */
  it('computes transitive cascade reachability in both directions', async () => {
    tables ??= await readSchemaTables()
    const byName = new Map(tables.map((table) => [table.name, table]))

    expect(
      reachedByCascade('report_resolutions', byName),
      '`report_resolutions` is no longer reached by a cascade chain. It holds no attendee ' +
        'column, so its only coverage is `report_id` → `abuse_reports` → both attendees. If ' +
        "that reference has been weakened to NO ACTION, an operator's resolution now survives " +
        'the erasure of everybody it concerns.',
    ).toBe(true)

    expect(
      reachedByCascade('operators', byName),
      '`operators` is now reachable by a cascade from `attendees`, which would mean the second ' +
        'actor has acquired an attendee row. That is a governance change, not a schema tidy ' +
        '(FR-901).',
    ).toBe(false)
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
