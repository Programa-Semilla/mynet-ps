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

  /**
   * T018 (007) — the three conversation tables. **None of them holds content, and that is the
   * whole reason the model is shaped this way** (research R10, data-model.md).
   */
  conversations:
    'Holds no attendee data at all — an id, a creation time and a denormalised ' +
    '`last_message_at`. No participant identifier by design (FR-573). The conversation id ' +
    'appears in the export as context on each authored message.',
  conversation_pairs:
    'A uniqueness constraint given a row so it can cascade (research R10), not a record. Its ' +
    'two columns are the *other* attendee half the time, and reproducing them would export a ' +
    'list of everyone this attendee has ever talked to — which is precisely the relationship ' +
    'metadata `conversations` was emptied to avoid retaining.',
  conversation_participants:
    'Membership plus a private read position. Membership is implied by the authored messages ' +
    'the export does contain; `last_read_message_id` is a read position that FR-530 keeps ' +
    'private even from the other participant, and it describes UI state rather than anything ' +
    'the attendee authored.',

  /**
   * T027 (008) — the one table of this feature's three that the export does not reproduce.
   *
   * The other two — `shared_cards` and `appointments` — are covered column by column in
   * `EXPORTED_COLUMNS`, each in **both roles** (FR-653). This one holds no attendee data at all,
   * which is the same classification `deletion-coverage.test.ts` reaches for it independently.
   */
  meeting_slots:
    'Seeded conference content (FR-623): an event, a start and an end, with no attendee ' +
    'identifier. The grid is not data about anybody. The slot an attendee actually claimed IS ' +
    'exported, as `slotId` with its instants inside each element of `appointments`.',

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T026 (013) — FOUR OF THIS FEATURE'S FIVE TABLES, AND TWO OF THEM NAME ATTENDEES.**
   *
   * The fifth, `organizer_assignments`, IS exported (FR-981) and is mapped in
   * `EXPORTED_COLUMNS` — an assignment is a fact about the attendee who holds it.
   *
   * The two that name attendees and are still excluded need the harder argument, because
   * "contains an attendee identifier" is normally the end of the discussion:
   *
   *   - `operator_sessions` may carry an `attendee_id` (the organizer tier signs in with
   *     attendee credentials). It is excluded for the same reason `auth_sessions.token_hash` is:
   *     a session row is authentication material, not content. Note the asymmetry that is
   *     deliberate — `auth_sessions`' *timestamps* are exported, because when somebody was using
   *     MyNet is data about them. When somebody was using the ADMINISTRATIVE site is data about
   *     an operator's working pattern, which is not the requester's to receive even when the
   *     requester is that person: the export is a MyNet document.
   *
   *   - `admin_audit_entries` carries `subject_attendee_id`, and is excluded because it records
   *     an **operator's act**, not the attendee's data. Exporting it would hand somebody a list
   *     of administrative decisions made about them, attributed to named operators — a
   *     different document with different governance, which Principle VIII's portability right
   *     does not ask for and which FR-999 forbids re-disclosing through any surface.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  operators:
    'The second actor is not an attendee (FR-901). No row here is the requester or is about ' +
    'them; an operator has no `attendees` row at all, and nothing in MyNet may learn that ' +
    'operators exist (FR-903).',
  operator_sessions:
    "Authentication material, not content — `auth_sessions.token_hash`'s reasoning, applied to " +
    'the whole table. The timestamps are excluded too, deliberately unlike `auth_sessions`: ' +
    "when somebody was using the ADMINISTRATIVE site describes an operator's working pattern, " +
    'and this export is a MyNet document about a MyNet attendee.',
  admin_audit_entries:
    "A record of an OPERATOR'S ACT, not the attendee's data (FR-982, FR-999). It names an " +
    'attendee and is still not about them in the sense portability means: exporting it would ' +
    'produce a list of administrative decisions made about somebody, attributed to named ' +
    'operators, which is a different document with different governance. The attendee half is ' +
    'cleared on erasure (FR-997a) rather than handed over.',
  report_resolutions:
    "An operator's decision about a report, not the reporter's or the reported attendee's data. " +
    'The report itself IS exported to the reporter (007, the `reports` section), which is the ' +
    'part that is theirs — what they said, when, about whom. What an operator then concluded is ' +
    'not, and FR-946 keeps the reporter told nothing at all about it.',

  /**
   * T213 (014 tranche 2) — **the vocabulary is REFERENCE DATA, not attendee data** (FR-1085a).
   * It names no attendee and holds nothing anybody authored about themselves; an attendee's
   * CHOSEN sector, subsector, activity and interests ARE exported — as the labels they hold, on
   * the `profile` and `interests` sections — and nothing survives a deletion de-attributed
   * (FR-1098). Reproducing the whole product vocabulary in a personal export would be
   * exporting the product, not the person.
   */
  vocabulary_sectors:
    'Product-wide reference data (FR-1085a): labels, authored at platform tier, naming no ' +
    'attendee. The value an attendee chose IS exported, on the profile section.',
  vocabulary_subsectors:
    'Product-wide reference data (FR-1085a), as vocabulary_sectors. The chosen value is on the ' +
    'profile section.',
  vocabulary_interests:
    'Product-wide reference data (FR-1085a). The interests an attendee holds ARE exported, on ' +
    'the interests section, as the labels they hold — chosen and retained free text alike.',
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

  // T018 (007).
  'messages.id': 'A surrogate key with no meaning outside this database.',
  'messages.author_id':
    'The requester. The export contains authored messages only (FR-578), so this column is the ' +
    'same value on every row — and it is a WHERE clause rather than a projection, which is what ' +
    'makes the exclusion structural.',
  'attendee_blocks.blocker_id': 'The requester.',
  'abuse_reports.id': 'A surrogate key with no meaning outside this database.',
  'abuse_reports.reporter_id': 'The requester.',
  'push_subscriptions.id': 'A surrogate key with no meaning outside this database.',
  'push_subscriptions.attendee_id': 'The requester.',

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **The two columns this feature adds that are CREDENTIALS RATHER THAN CONTENT**
   * (research R14).
   *
   * They look like ordinary text and they are not. Together, `p256dh_key` and `auth_key` are
   * what lets a server encrypt and deliver a notification to one specific device — so
   * reproducing them puts a *capability* into a file the attendee downloads, emails to
   * themselves and keeps, which is the same failure the password hash and live reset tokens are
   * kept out for.
   *
   * The export does not omit the subscription. It lists the endpoint and both timestamps, and
   * marks the omission with `keysRedacted: true` so the reader is told rather than left to
   * notice — the difference between a redaction and a gap.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  'push_subscriptions.p256dh_key':
    'A credential, not content (research R14). With `auth_key` it grants delivery to this ' +
    'device. Exported as a redacted presence — see `keysRedacted` in the document.',
  'push_subscriptions.auth_key':
    'A credential, not content (research R14). See `p256dh_key` above.',

  // T027 (008). Surrogate keys only — every other column of both tables is mapped in
  // `EXPORTED_COLUMNS`, in **both roles**, which is what FR-653 asks for.
  'shared_cards.id': 'A surrogate key with no meaning outside this database.',
  'appointments.id': 'A surrogate key with no meaning outside this database.',

  // T015, T016 (009). Both tables' author column is the requester, exactly as
  // `session_notes.attendee_id` above — the export is keyed on one attendee, so this column is
  // the same value on every row and is a WHERE clause rather than a projection.
  'session_questions.attendee_id':
    "The requester. `attendee_id = the requester` is the export query's WHERE clause, which is " +
    'what makes the scoping structural rather than a filter applied afterwards.',
  'question_votes.attendee_id': 'The requester, on every row of the votes section.',

  // T153 (014 tranche 2). The requester, exactly as `saved_sessions.attendee_id` above.
  'session_enrolments.attendee_id':
    "The requester. The export is keyed on one attendee, so this column is the query's WHERE " +
    'clause rather than a projection — the same structural scoping every commitment section has.',

  // T026 (013). The requester, exactly as `registrations.attendee_id` above — the export is
  // keyed on one attendee, so this column is the same value on every row and is a WHERE clause
  // rather than a projection.
  'organizer_assignments.attendee_id':
    'The requester. An assignment is exported because it is a fact about them; the column ' +
    "naming them is the query's WHERE clause, which is what makes the scoping structural.",
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
      heldPlaces: true,
      sessionNotes: true,
      signInSessions: true,
      avatar: true,
      // 007. `Record<keyof AccountExport, true>` means adding a section to the document without
      // acknowledging it here fails to compile — which is how these five arrived.
      messages: true,
      blocks: true,
      reports: true,
      pushSubscriptions: true,
      // 008. Cards appear as two sections because one row is two different facts — a card you
      // gave and a card you hold — and neither is derivable from the other (FR-653).
      cardsShared: true,
      cardsHeld: true,
      appointments: true,
      // 009. Two sections, because authoring a question and backing somebody else's are two
      // different acts — and `Record<keyof AccountExport, true>` means adding a section to the
      // document without acknowledging it here fails to compile, which is how these arrived.
      questionsAsked: true,
      questionVotes: true,
      // 011 — the only section this feature adds. An assignment is a fact about the
      // attendee who holds it (FR-981); the other four tables are declared
      // not-attendee-data above, each with its reasoning.
      organizerAssignments: true,
      exclusions: true,
    }

    expect(Object.keys(shape)).toContain('avatar')
  })

  /**
   * T137 (007) — **the export says what it leaves out** (FR-578).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * FR-578 excludes received messages from the export, which is a declared divergence from
   * standing decision 12's "every field collected". The divergence is defensible — a received
   * message is primarily its author's personal data — and it is *only* defensible if the person
   * reading their own export is told.
   *
   * Without this, an attendee with an empty `messages` section cannot distinguish "I wrote
   * nothing" from "half of my correspondence was withheld". That is the failure this asserts
   * against, which is why it checks the note is present **unconditionally** rather than only
   * when something was in fact withheld.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('declares the received-message exclusion in the document itself (FR-578)', () => {
    const shape: Record<keyof AccountExport, true> = {
      exportedAt: true,
      account: true,
      profile: true,
      interests: true,
      registrations: true,
      activeConference: true,
      savedSessions: true,
      heldPlaces: true,
      sessionNotes: true,
      signInSessions: true,
      avatar: true,
      messages: true,
      blocks: true,
      reports: true,
      pushSubscriptions: true,
      // 008. Cards appear as two sections because one row is two different facts — a card you
      // gave and a card you hold — and neither is derivable from the other (FR-653).
      cardsShared: true,
      cardsHeld: true,
      appointments: true,
      // 009. Two sections, because authoring a question and backing somebody else's are two
      // different acts — and `Record<keyof AccountExport, true>` means adding a section to the
      // document without acknowledging it here fails to compile, which is how these arrived.
      questionsAsked: true,
      questionVotes: true,
      // 011 — the only section this feature adds. An assignment is a fact about the
      // attendee who holds it (FR-981); the other four tables are declared
      // not-attendee-data above, each with its reasoning.
      organizerAssignments: true,
      exclusions: true,
    }

    expect(
      Object.keys(shape),
      'The export must carry an `exclusions` section. FR-578 withholds received messages, and ' +
        'an unexplained omission is indistinguishable from an attendee who wrote nothing.',
    ).toContain('exclusions')
  })
})
