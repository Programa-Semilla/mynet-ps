import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import type { AccountExport } from '../../src/db/queries/account.js'
// The claim this guard checks against the schema, and `tests/integration/export.test.ts` checks
// against a real document. Shared so the two halves cannot describe different mappings.
import { EXPORTED_COLUMNS } from '../support/export-columns.js'

/**
 * T095 (004) — **the export structural guard** (FR-377).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A FIELD COLLECTED BUT ABSENT FROM THE EXPORT IS A DEFECT, AND THIS IS WHAT SAYS SO.**
 *
 * FR-377 states it outright, and SC-305 measures it: *an export contains 100% of the fields the
 * product stores about the requesting attendee, verified by a test that fails when a field is
 * added without export coverage.*
 *
 * Like its sibling in `deletion-coverage.test.ts`, this exists to fail a **future** feature's
 * build rather than this one's. 006 through 009 each add tables and columns holding attendee
 * data, and each will be written by somebody who has not read this file — which is the entire
 * point. The expected field set is derived from the Drizzle schema, so **a new column fails this
 * test by existing**.
 *
 * The two guards are deliberately separate. Deletion asks "can anything reach this row"; export
 * asks "does anything reproduce this column". A table can satisfy one and fail the other —
 * `auth_sessions` cascades cleanly and would be trivially easy to forget in an export, and
 * `attendee_credentials` must be in neither answer for the same reason it exists at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const schemaDir = fileURLToPath(new URL('../../src/db/schema/', import.meta.url))

/**
 * Tables whose columns the export need not reproduce. **Each entry states why**, because an
 * allow-list whose entries carry no reasoning is how a personal-data table joins one.
 */
const NOT_EXPORTED: Record<string, string> = {
  attendee_credentials:
    'Credential material (FR-376). The password hash is the one thing an export must never ' +
    'contain — a file the attendee downloads and keeps is the worst possible home for it.',
  attendee_verifications:
    'Verification material (FR-391). Short-lived, single-use, and deleted with the account. A ' +
    'live token in a downloaded file is a link somebody else could use.',
  attendee_password_resets:
    'Reset material (FR-391), and worse than the above: a reset link IS the account. Exporting ' +
    "one would put account takeover in the attendee's downloads folder.",
  sign_in_attempts:
    'Holds keyed hashes rather than identities and has no foreign key by design (research D10), ' +
    'so no row in it is attributable to the requester. Including it would require re-deriving ' +
    'the hash of their address, which would turn an export into a lookup tool.',
  stored_objects:
    'The internal backing table of one StorageService adapter, not a domain table (research D3). ' +
    'Its content IS exported — as `avatar`, embedded as base64 — but through the port rather ' +
    "than by reproducing this table's columns, which the production adapter will not have.",
  events: 'Seeded conference content, not attendee data. Exported by name inside `registrations`.',
  tracks: 'Seeded conference content (002).',
  rooms: 'Seeded conference content (002).',
  speakers: 'Seeded conference content (002).',
  sessions: 'Seeded conference content. Exported by title inside `savedSessions`.',
  session_speakers: 'A join between two pieces of seeded conference content (002).',
}

/**
 * Columns the export deliberately omits from a table it otherwise covers.
 *
 * Keyed `table.column`, and each states why. This is the narrow list — a column belongs here
 * only when reproducing it would be actively wrong, never because it was inconvenient.
 */
const NOT_EXPORTED_COLUMNS: Record<string, string> = {
  'auth_sessions.id': 'A surrogate key with no meaning outside this database.',
  'auth_sessions.attendee_id': 'The requester, who is the subject of the whole document.',
  'auth_sessions.token_hash':
    'Credential material (FR-376). The timestamps around it ARE exported, because when somebody ' +
    'was using MyNet is data about them; the hash is what authenticates, and never leaves.',
  'attendees.avatar_object_key':
    'Replaced by the bytes themselves (research D11). A key is a pointer into a system the ' +
    'attendee may be about to delete themselves from; the bytes stand alone.',
  'attendee_profiles.attendee_id': 'The requester.',
  'attendee_interests.attendee_id': 'The requester.',
  'registrations.id': 'A surrogate key with no meaning outside this database.',
  'registrations.attendee_id': 'The requester.',
  'active_event_selections.attendee_id': 'The requester.',
  'saved_sessions.attendee_id': 'The requester.',
  'session_notes.attendee_id': 'The requester.',
}

interface Column {
  readonly table: string
  readonly column: string
  readonly qualified: string
}

/** Every column the schema declares, read from the files rather than from the barrel. */
const readSchemaColumns = async (): Promise<Column[]> => {
  const files = readdirSync(schemaDir).filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  const columns: Column[] = []

  for (const file of files) {
    const module: Record<string, unknown> = await import(join(schemaDir, file))

    for (const value of Object.values(module)) {
      if (!is(value, PgTable)) continue
      const config = getTableConfig(value)
      for (const column of config.columns) {
        columns.push({
          table: config.name,
          column: column.name,
          qualified: `${config.name}.${column.name}`,
        })
      }
    }
  }

  return columns
}

describe('export coverage (T095, FR-377)', () => {
  let columns: Column[]

  it('found the schema to audit', async () => {
    columns = await readSchemaColumns()

    // A gate that cannot fail is not a gate — if the schema directory moved, every assertion
    // below would pass over an empty list while checking nothing.
    expect(columns.length).toBeGreaterThan(40)
    expect(columns.map((c) => c.qualified)).toContain('attendees.email')
  })

  it('covers EVERY column of every table holding attendee data', async () => {
    columns ??= await readSchemaColumns()

    const uncovered = columns
      .filter((column) => !(column.table in NOT_EXPORTED))
      .filter((column) => !(column.qualified in NOT_EXPORTED_COLUMNS))
      .filter((column) => !(column.qualified in EXPORTED_COLUMNS))
      .map((column) => column.qualified)

    expect(
      uncovered,
      'These columns hold data about an attendee and the export does not reproduce them. ' +
        '**A field collected but absent from the export is a defect** (FR-377, SC-305).\n\n' +
        'Pick one, in the change that introduced the column:\n' +
        '  1. Add it to the export in `db/queries/account.ts`, and map it in EXPORTED_COLUMNS here.\n' +
        '  2. Add it to NOT_EXPORTED_COLUMNS here, with the reason reproducing it would be wrong.\n' +
        '  3. Add its whole table to NOT_EXPORTED here, if the table holds no attendee data.\n\n' +
        'Do not pick 2 or 3 to make this pass.',
    ).toEqual([])
  })

  it('never lets credential material into the mapping', async () => {
    // The one exclusion that is not a judgement call. If a future edit moved `password_hash` or
    // a `token_hash` into `EXPORTED_COLUMNS`, the generic assertion above would go green — this
    // is what would not.
    const CREDENTIAL = /password|token_hash|secret|pepper/i

    const leaked = Object.keys(EXPORTED_COLUMNS).filter((qualified) => CREDENTIAL.test(qualified))

    expect(
      leaked,
      'FR-376: the export MUST contain no credential material. A password hash or a live token ' +
        'in a file the attendee downloads and keeps is the worst possible home for it.',
    ).toEqual([])
  })

  it('keeps every allow-list entry pointing at something that still exists', async () => {
    columns ??= await readSchemaColumns()
    const tables = new Set(columns.map((column) => column.table))
    const qualified = new Set(columns.map((column) => column.qualified))

    // An allow-list that outlives its schema is how a NEW column quietly inherits an old
    // exemption by sharing a name.
    for (const table of Object.keys(NOT_EXPORTED)) {
      expect(tables, `${table} is allow-listed but no longer exists`).toContain(table)
    }
    for (const column of Object.keys(NOT_EXPORTED_COLUMNS)) {
      expect(qualified, `${column} is allow-listed but no longer exists`).toContain(column)
    }
    for (const column of Object.keys(EXPORTED_COLUMNS)) {
      expect(qualified, `${column} is mapped but no longer exists`).toContain(column)
    }
  })

  it('states a reason for every exclusion (FR-377)', () => {
    // An exclusion without reasoning is an omission with a comment character in front of it.
    for (const [table, reason] of Object.entries(NOT_EXPORTED)) {
      expect(reason.trim().length, `${table} states no reason`).toBeGreaterThan(20)
    }
    for (const [column, reason] of Object.entries(NOT_EXPORTED_COLUMNS)) {
      expect(reason.trim().length, `${column} states no reason`).toBeGreaterThan(10)
    }
  })

  it('names the avatar explicitly, since no column can carry it', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The avatar is the one piece of exported personal data that is not a column of anything:
    // the bytes live outside the database, and `attendees.avatar_object_key` is deliberately
    // excluded because a key is a pointer rather than the thing (research D11).
    //
    // A column-derived guard therefore cannot see it, so it is asserted by name — otherwise the
    // one field FR-353 singles out would be the one field no guard covers.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const shape: Record<keyof AccountExport, true> = {
      exportedAt: true,
      account: true,
      profile: true,
      interests: true,
      registrations: true,
      activeConference: true,
      savedSessions: true,
      sessionNotes: true,
      signInSessions: true,
      avatar: true,
    }

    expect(Object.keys(shape)).toContain('avatar')
  })
})
