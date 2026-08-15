import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T006 (005) — **migration `0004` applies forward against a real database** (Principle VII).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The constitution makes migration verification a required task category in its own right for
 * any feature that stores attendee data, and Principle VII requires `0004` to be applied
 * forward against a real instance **before it reaches any environment holding real data**.
 *
 * `setupTestApp()` runs `runMigrations()` against the configured database, so simply arriving
 * at these assertions proves the forward application. What the assertions add is that the
 * migration produced the *structure the schema declares* — a migration can apply cleanly and
 * still be missing a constraint, and every guarantee below is one this feature leans on
 * somewhere else:
 *
 *   - the composite primary keys ARE FR-187's idempotency and the one-note-per-session rule;
 *   - `ON DELETE CASCADE` from `attendees` IS the retention commitment the spec declares
 *     (Principle VIII, register entry 6) — US5 scenario 5 asserts the behaviour, this asserts
 *     the mechanism that cannot be forgotten by a future deletion path;
 *   - the `body` CHECK is FR-212 and FR-213 at the last line of defence, independent of the
 *     route schema and of the editor.
 *
 * Asserted over `pg_catalog` rather than by inserting rows, because the question here is
 * whether the *schema* is what the migration was supposed to produce. A behavioural test can
 * pass against a table that acquired its constraints some other way; this cannot.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * The constraint a write actually tripped over.
 *
 * Asserted on the driver's `constraint_name` rather than by matching the message, because
 * Drizzle wraps the `PostgresError` in an `Error` whose message is the failed SQL and its
 * parameters — for an over-length note, that message is the 10,001-character body itself.
 * The field is also the stronger assertion: it names *which* constraint refused, so a write
 * rejected by the primary key could not pass as the length check doing its job.
 *
 * Hoisted to module scope by 004, so the `0003` block can make the same assertion about the
 * profile CHECK constraints without a second copy that could drift from this one.
 */
const refusedBy = async (statement: Promise<unknown>): Promise<string | undefined> => {
  try {
    await statement
    return undefined
  } catch (error) {
    return (error as { cause?: { constraint_name?: string } }).cause?.constraint_name
  }
}

describe('migration 0004 — saved sessions and notes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Runs every committed migration in order, `0004` included, against a real instance.
    app = await setupTestApp()
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Seeded HERE, because several assertions below read seeded rows** — the constraint
    // checks insert `SELECT … FROM registrations JOIN sessions … LIMIT 1`, and the seeded-join-
    // code check reads `events`.
    //
    // Without this the file passed only when some *other* file happened to run first and seed
    // the shared database. 006 added eight integration files, the order changed, and five tests
    // failed in CI while passing locally. Worse, they failed **silently in the wrong direction**:
    // an empty `SELECT` inserts zero rows, so no constraint is violated and the assertion sees
    // `undefined` — a fixture problem reported as a missing CHECK constraint.
    //
    // `resetDatabase()` is what every other integration file does. This file was the exception.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const constraintsOn = async (table: string) =>
    getDb().execute<{ conname: string; contype: string; definition: string }>(sql`
      SELECT c.conname, c.contype::text AS contype, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = ${table}
      ORDER BY c.conname
    `)

  it('created both tables', async () => {
    const rows = await getDb().execute<{ relname: string }>(sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('saved_sessions', 'session_notes')
      ORDER BY c.relname
    `)

    expect(rows.map((row) => row.relname)).toEqual(['saved_sessions', 'session_notes'])
  })

  it('gives saved_sessions the composite primary key that IS FR-187 idempotency', async () => {
    const primaryKeys = (await constraintsOn('saved_sessions')).filter((row) => row.contype === 'p')

    expect(primaryKeys).toHaveLength(1)
    expect(
      primaryKeys[0]?.definition,
      "Saving twice must be unable to create a second row, and that is the schema's job rather " +
        "than the handler's (FR-187, data-model.md).",
    ).toBe('PRIMARY KEY (attendee_id, session_id)')
  })

  it('gives session_notes the composite primary key — one note per attendee per session', async () => {
    const primaryKeys = (await constraintsOn('session_notes')).filter((row) => row.contype === 'p')

    expect(primaryKeys).toHaveLength(1)
    expect(primaryKeys[0]?.definition).toBe('PRIMARY KEY (attendee_id, session_id)')
  })

  it.each(['saved_sessions', 'session_notes'])(
    'cascades %s from attendees — the declared retention commitment, at schema level',
    async (table) => {
      const toAttendees = (await constraintsOn(table)).filter(
        (row) => row.contype === 'f' && row.definition.includes('REFERENCES attendees'),
      )

      expect(toAttendees).toHaveLength(1)
      expect(
        toAttendees[0]?.definition,
        `${table} must be deleted with the attendee's account. The specification declares that ` +
          'as its retention commitment under Principle IX, and a schema-level cascade is what ' +
          'makes it something a future deletion path cannot forget (US5 scenario 5).',
      ).toContain('ON DELETE CASCADE')
    },
  )

  it.each(['saved_sessions', 'session_notes'])(
    'cascades %s from sessions, so no orphan can outlive the programme it refers to',
    async (table) => {
      const toSessions = (await constraintsOn(table)).filter(
        (row) => row.contype === 'f' && row.definition.includes('REFERENCES sessions'),
      )

      expect(toSessions).toHaveLength(1)
      expect(toSessions[0]?.definition).toContain('ON DELETE CASCADE')
    },
  )

  it('bounds a note at 1..10,000 characters in the column itself (FR-212, FR-213)', async () => {
    const checks = (await constraintsOn('session_notes')).filter((row) => row.contype === 'c')

    const bodyLength = checks.find((row) => row.conname === 'session_notes_body_length')
    expect(
      bodyLength,
      'The column must constrain the note independently of the route schema and of the editor. ' +
        'Client-side presentation of a limit is never its enforcement (Principle VIII, research D9).',
    ).toBeDefined()

    // `length > 0` is what makes "no note" have exactly one representation: clearing the text
    // deletes the row rather than writing a blank one (FR-212).
    expect(bodyLength?.definition).toContain('length(body) > 0')
    expect(bodyLength?.definition).toContain('length(body) <= 10000')
  })

  it('refuses an empty note at the database, not merely in the editor (FR-212)', async () => {
    // The behavioural half, because the CHECK's *purpose* is to refuse a write that reached it
    // — reading the definition proves it exists, not that it bites.
    const constraint = await refusedBy(
      getDb().execute(sql`
        INSERT INTO session_notes (attendee_id, session_id, body)
        SELECT r.attendee_id, s.id, ''
        FROM registrations r
        JOIN sessions s ON s.event_id = r.event_id
        LIMIT 1
      `),
    )

    expect(
      constraint,
      'An emptied note must not be storable as a blank row. Clearing the text deletes the row, ' +
        'so "no note" has exactly one representation (FR-212).',
    ).toBe('session_notes_body_length')
  })

  it('refuses an over-length note at the database (FR-213)', async () => {
    const constraint = await refusedBy(
      getDb().execute(sql`
        INSERT INTO session_notes (attendee_id, session_id, body)
        SELECT r.attendee_id, s.id, ${'x'.repeat(10_001)}
        FROM registrations r
        JOIN sessions s ON s.event_id = r.event_id
        LIMIT 1
      `),
    )

    expect(constraint).toBe('session_notes_body_length')
  })

  it('accepts a note at exactly the limit — the bound is inclusive', async () => {
    // Off-by-one in the other direction: a limit that refused 10,000 would make the editor's
    // remaining-characters indication lie at the last character (FR-213).
    //
    // `ON CONFLICT DO UPDATE` rather than a bare insert: this file does not re-seed, and the
    // (attendee, session) pair it picks may already carry a note left by another suite. A
    // primary-key violation here would report as the length check failing, which is the wrong
    // diagnosis for the right symptom.
    const constraint = await refusedBy(
      getDb().execute(sql`
        INSERT INTO session_notes (attendee_id, session_id, body)
        SELECT r.attendee_id, s.id, ${'x'.repeat(10_000)}
        FROM registrations r
        JOIN sessions s ON s.event_id = r.event_id
        LIMIT 1
        ON CONFLICT (attendee_id, session_id) DO UPDATE SET body = excluded.body
      `),
    )

    expect(constraint).toBeUndefined()

    // Written by this assertion rather than by the feature, so it must not outlive it.
    await getDb().execute(sql`DELETE FROM session_notes WHERE length(body) = 10000`)
  })

  it('does not denormalise event_id onto either table (data-model.md)', async () => {
    // A second source of truth for "which conference is this" could disagree with
    // `sessions.event_id` — and the one that disagreed would be the one authorization read.
    const columns = await getDb().execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('saved_sessions', 'session_notes')
        AND column_name = 'event_id'
    `)

    expect(
      columns,
      'The conference is reached through the session and must not be stored again. Every query ' +
        "joins through `sessions` and filters on the EventScope's event instead.",
    ).toEqual([])
  })

  it('records exactly one migration for this feature, under its reserved number', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The roadmap reserves `0004` for 005 and `0005` for 006, which may be in flight in
    // parallel. Neither number may be renamed to resolve a conflict with the other.
    //
    // **`0003` was asserted absent until 004 shipped, and is now asserted present.** That
    // change is the point of the assertion rather than a weakening of it: 005 wrote it so that
    // 004 claiming its reserved number would be a deliberate edit in a reviewed diff, and not
    // something that happened quietly. This is that edit.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const tags = await journalTags()

    expect(tags.filter((tag) => tag.startsWith('0004_'))).toEqual(['0004_saved_sessions_and_notes'])
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`0005` was asserted absent until 006 shipped, and is now asserted present** — the same
    // deliberate edit 004 made to the `0003` line below, and for the same reason. 005 wrote
    // this so that 006 claiming its reserved number would appear in a reviewed diff rather
    // than happening quietly. This is that diff. `0006` remains reserved for 007.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(
      tags.filter((tag) => tag.startsWith('0005_')),
      '0005 belongs to 006, and 006 has claimed it — exactly one migration, as reserved',
    ).toEqual(['0005_directory_indexes'])
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`0006` was asserted absent until 007 shipped, and is now asserted present** — the third
    // time this line has been edited, and each time for the reason 005 wrote it: a feature
    // claiming its reserved number must appear in a reviewed diff rather than happening
    // quietly. This is 007's edit. `0007` remains reserved for 008.
    //
    // The tag is `0006_conversations_and_notifications` rather than the name `drizzle-kit`
    // generated, matching the convention `0004_saved_sessions_and_notes` and
    // `0005_directory_indexes` set; the journal entry was renamed with the file (T012).
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(
      tags.filter((tag) => tag.startsWith('0006_')),
      '0006 belongs to 007, and 007 has claimed it — exactly one migration, as reserved',
    ).toEqual(['0006_conversations_and_notifications'])
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`0007` was asserted absent until 008 shipped, and is now asserted present** — the
    // fourth time this pair of lines has been edited, and each time for the reason 005 wrote
    // it: a feature claiming its reserved number must appear in a **reviewed diff** rather than
    // happening quietly. This is 008's edit. `0008` is reserved for 009 by the roadmap and is
    // not asserted here, because there is nothing yet to assert it against.
    //
    // The tag matches the convention every entry above sets: the feature's subject, not
    // `drizzle-kit`'s generated name.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(
      tags.filter((tag) => tag.startsWith('0007_')),
      '0007 belongs to 008, and 008 has claimed it — exactly one migration, as reserved',
    ).toEqual(['0007_network_and_appointments'])
    expect(
      tags.filter((tag) => tag.startsWith('0003_')),
      '0003 belongs to 004, and 004 has claimed it',
    ).toEqual(['0003_attendee_identity_and_profile'])
  })
})

const journalTags = async (): Promise<string[]> => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath, URL: NodeURL } = await import('node:url')

  const journalPath = fileURLToPath(
    new NodeURL('../../migrations/meta/_journal.json', import.meta.url),
  )
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>
  }

  return journal.entries.map((entry) => entry.tag)
}

/**
 * T013 (004) — **migration `0003` applies forward against a real database** (Principle VII,
 * FR-396).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `setupTestApp()` runs every committed migration, so arriving at these assertions proves the
 * forward application. What they add is that `0003` produced **the structure the schema
 * declares** — a migration can apply cleanly and still be missing a constraint, and every
 * guarantee below is one this feature leans on somewhere else:
 *
 *   - the cascades from `attendees` ARE the deletion commitment (FR-366), and the structural
 *     guard in `tests/unit/deletion-coverage.test.ts` reads the *schema* rather than the
 *     database — so this is what proves the two agree;
 *   - `join_code`'s UNIQUE constraint is what stops two conferences sharing a code and joining
 *     resolving to whichever row the planner returned first (D7);
 *   - the profile CHECK constraints are FR-337 at the last line of defence, independent of the
 *     route schema and of the editor;
 *   - **both temporary defaults are dropped**, which is the pattern `events.timezone`
 *     established in 002: a column that keeps a silent default is how a wrong value ships
 *     unnoticed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('migration 0003 — attendee identity, personal data and profile', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    // Seeded for the same reason as the block above: these assertions read seeded rows, and an
    // empty fixture fails as a missing constraint rather than as an empty fixture.
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const constraintsOn = async (table: string) =>
    getDb().execute<{ conname: string; contype: string; definition: string }>(sql`
      SELECT c.conname, c.contype::text AS contype, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = ${table}
      ORDER BY c.conname
    `)

  it('applies before 0004 on a fresh database and after it on an existing one', async () => {
    // The journal's ordering and its timestamps carry different jobs, and getting either wrong
    // is silent — see `migrations/meta/README.md`. Array position decides what a FRESH database
    // does; `when` decides what a database that already holds 0004 receives. A 0003 stamped
    // earlier than 0004 would be skipped on every existing developer clone with no error at all.
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath, URL: NodeURL } = await import('node:url')
    const journal = JSON.parse(
      await readFile(
        fileURLToPath(new NodeURL('../../migrations/meta/_journal.json', import.meta.url)),
        'utf8',
      ),
    ) as { entries: Array<{ idx: number; tag: string; when: number }> }

    const positions = journal.entries.map((entry) => entry.tag)
    expect(positions.indexOf('0003_attendee_identity_and_profile')).toBeLessThan(
      positions.indexOf('0004_saved_sessions_and_notes'),
    )

    const three = journal.entries.find((entry) => entry.idx === 3)
    const four = journal.entries.find((entry) => entry.idx === 4)
    expect(
      three?.when,
      'A 0003 stamped earlier than 0004 is silently skipped on every database that already ' +
        'applied 0004 — no error, just a schema missing six tables (migrations/meta/README.md).',
    ).toBeGreaterThan(four?.when ?? 0)
  })

  it('created every table this feature adds', async () => {
    const rows = await getDb().execute<{ relname: string }>(sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('attendee_profiles', 'attendee_interests', 'attendee_verifications',
                          'attendee_password_resets', 'stored_objects')
      ORDER BY c.relname
    `)

    expect(rows.map((row) => row.relname)).toEqual([
      'attendee_interests',
      'attendee_password_resets',
      'attendee_profiles',
      'attendee_verifications',
      'stored_objects',
    ])
  })

  it.each([
    'attendee_profiles',
    'attendee_interests',
    'attendee_verifications',
    'attendee_password_resets',
  ])('cascades %s from attendees — the deletion commitment, at schema level', async (table) => {
    const toAttendees = (await constraintsOn(table)).filter(
      (row) => row.contype === 'f' && row.definition.includes('REFERENCES attendees'),
    )

    expect(toAttendees).toHaveLength(1)
    expect(
      toAttendees[0]?.definition,
      `${table} must go with the account (FR-366). A schema-level cascade is what makes that ` +
        'something a future deletion path cannot forget.',
    ).toContain('ON DELETE CASCADE')
  })

  it('gives stored_objects NO foreign key, which is the design rather than the gap', async () => {
    // research D3: a key-value store must not know what its callers store, and the production
    // adapter is a bucket that cannot have one. This is the single case FR-370's guard covers
    // by explicit deletion instead — asserted here so removing the guard's justification would
    // also have to remove this.
    const keys = (await constraintsOn('stored_objects')).filter((row) => row.contype === 'f')
    expect(keys).toEqual([])
  })

  it('makes join_code unique, so a code cannot resolve to two conferences', async () => {
    const unique = (await constraintsOn('events')).filter(
      (row) => row.contype === 'u' && row.definition.includes('join_code'),
    )

    expect(
      unique,
      'Without UNIQUE, two conferences could seed one code and joining would ' +
        'resolve to whichever row the planner returned first (research D7).',
    ).toHaveLength(1)
  })

  it('drops both temporary defaults in the same migration', async () => {
    const rows = await getDb().execute<{ table_name: string; column_default: string | null }>(sql`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'events' AND column_name = 'join_code')
          OR (table_name = 'sign_in_attempts' AND column_name = 'action'))
      ORDER BY table_name
    `)

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(
        row.column_default,
        `${row.table_name} kept its temporary default. A column that keeps one is how a wrong ` +
          'value ships unnoticed — the reason 002 established this pattern for events.timezone.',
      ).toBeNull()
    }
  })

  it('leaves no seeded conference at a placeholder join code', async () => {
    // The other half of T013: `db:migrate` followed by `db:seed` must leave nothing at the
    // migration's placeholder. A placeholder is a random uuid, so this checks for the shape
    // rather than for a literal — an unseeded database has three of them and cannot be joined.
    const rows = await getDb().execute<{ name: string; join_code: string }>(sql`
      SELECT name, join_code FROM events ORDER BY name
    `)

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.join_code),
        `"${row.name}" still carries the migration's placeholder code, so it cannot be joined ` +
          '(FR-317). Run `pnpm db:seed` after `pnpm db:migrate` — always, for this reason.',
      ).toBe(false)
    }
  })

  it('bounds every free-text profile field at the column (FR-337)', async () => {
    const checks = (await constraintsOn('attendee_profiles')).filter((row) => row.contype === 'c')
    const named = new Set(checks.map((row) => row.conname))

    for (const constraint of [
      'attendee_profiles_company_length',
      'attendee_profiles_role_length',
      'attendee_profiles_headline_length',
      'attendee_profiles_networking_intent',
      'attendee_profiles_availability',
    ]) {
      expect(
        named,
        'The column must constrain the profile independently of the route schema and of the ' +
          'editor. Client-side presentation of a limit is never its enforcement (Principle VIII).',
      ).toContain(constraint)
    }
  })

  it('refuses an over-length company at the database, not merely in the editor', async () => {
    const constraint = await refusedBy(
      getDb().execute(sql`
        INSERT INTO attendee_profiles (attendee_id, company)
        SELECT id, ${'x'.repeat(121)} FROM attendees LIMIT 1
        ON CONFLICT (attendee_id) DO UPDATE SET company = excluded.company
      `),
    )

    expect(constraint).toBe('attendee_profiles_company_length')
  })

  it('refuses a networking intent outside the stated options (FR-339)', async () => {
    const constraint = await refusedBy(
      getDb().execute(sql`
        INSERT INTO attendee_profiles (attendee_id, networking_intent)
        SELECT id, 'whatever-i-like' FROM attendees LIMIT 1
        ON CONFLICT (attendee_id) DO UPDATE SET networking_intent = excluded.networking_intent
      `),
    )

    expect(
      constraint,
      '006 filters a directory on this value, and free text cannot be filtered on meaningfully.',
    ).toBe('attendee_profiles_networking_intent')
  })

  it('leads both sign_in_attempts indexes with `action` (FR-307a)', async () => {
    // Without `action` leading, every count still scans four actions' rows to answer a question
    // about one — and worse, an index that does not lead with the filtered column is the shape
    // that makes a per-action counter look implemented while performing like a shared one.
    const rows = await getDb().execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'sign_in_attempts'
      ORDER BY indexname
    `)

    const identifier = rows.find((row) => row.indexname === 'sign_in_attempts_identifier_idx')
    const source = rows.find((row) => row.indexname === 'sign_in_attempts_source_idx')

    expect(identifier?.indexdef).toContain('(action, identifier_hash, occurred_at)')
    expect(source?.indexdef).toContain('(action, source_hash, occurred_at)')
  })
})

/**
 * T019 (006) — **migration `0005` applies forward against a real database** (Principle VII,
 * FR-488).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `0005` is the first migration in this product that adds **no table and no column**. It is
 * five indexes and one extension, and that makes verifying it *more* important rather than
 * less: a missing table fails the next query loudly, whereas a missing index fails nothing at
 * all. It simply makes the directory scan, the deletion cascade scan, and the join scan —
 * correct answers, arrived at slowly, for as long as nobody measures.
 *
 * So the assertions are structural. Two of the five discharge findings 004's review left open
 * deliberately (FR-498, FR-499); two serve this feature's own query (research D11); and the
 * extension is what makes accent-insensitive search possible at all (FR-407, D5).
 *
 * **`unaccent` and the functional index are hand-written into the migration**, because neither
 * is expressible in the Drizzle schema. That means `drizzle-kit generate` will not re-emit them
 * — so these two assertions are the only thing standing between a future regeneration and a
 * database that silently loses both. See the block comment in `0005_directory_indexes.sql`.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('migration 0005 — the directory indexes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    // Seeded for the same reason as the block above: these assertions read seeded rows, and an
    // empty fixture fails as a missing constraint rather than as an empty fixture.
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const indexesOn = async (table: string) =>
    getDb().execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${table}
      ORDER BY indexname
    `)

  it('adds no table and no column — the headline of this feature (data-model.md)', async () => {
    // The two structural guards read the Drizzle schema; this reads the database they produced.
    // Asserted here because "no new table and no new column" is what keeps deletion coverage and
    // export coverage green with no allow-list entry, and an accidental column would be caught
    // by those guards only if somebody declared it in the schema — a hand-written migration
    // could add one without them ever seeing it.
    const added = await getDb().execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('avatar_card_object_key', 'card_object_key', 'rendition')
    `)

    expect(
      added,
      'The card rendition is keyed by CONVENTION, derived from the profile key (research D3). ' +
        'A column here would be a new column collecting attendee data, and ' +
        '`tests/unit/export-coverage.test.ts` fails when one exists without export coverage.',
    ).toEqual([])
  })

  it("indexes registrations by event — the directory's primary access path (D11)", async () => {
    const indexes = await indexesOn('registrations')
    const byEvent = indexes.find((row) => row.indexname === 'registrations_event_id_idx')

    expect(
      byEvent,
      'The directory asks "who else is at this conference". Only attendee_id was indexed, and ' +
        'the composite unique leads with the wrong column, so that read scanned the table.',
    ).toBeDefined()
    expect(byEvent?.indexdef).toContain('(event_id)')

    // The 001–005 access path is unchanged. Both reads exist, so both indexes do.
    expect(indexes.map((row) => row.indexname)).toContain('registrations_attendee_id_idx')
  })

  it('indexes attendee_interests by interest — the filter and the ranking join (D12)', async () => {
    const byInterest = (await indexesOn('attendee_interests')).find(
      (row) => row.indexname === 'attendee_interests_interest_idx',
    )

    expect(
      byInterest,
      "The primary key leads with attendee_id, which answers 'this attendee's interests'. The " +
        "directory asks the other way round — 'which attendees hold this interest' — for both " +
        'the filter and the overlap count, and a composite cannot serve a search on its second ' +
        'column.',
    ).toBeDefined()
    expect(byInterest?.indexdef).toContain('(interest)')
  })

  it.each(['attendee_verifications', 'attendee_password_resets'])(
    'indexes %s on attendee_id, so account deletion stops scanning it (FR-498, SC-415)',
    async (table) => {
      const index = (await indexesOn(table)).find(
        (row) => row.indexname === `${table}_attendee_id_idx`,
      )

      expect(
        index,
        'PostgreSQL creates NO index for a foreign key, so ON DELETE CASCADE from attendees had ' +
          'to find rows here by sequential scan — on a path an attendee is waiting on, growing ' +
          'with every account that ever verified an address. A 004 review finding.',
      ).toBeDefined()
      expect(index?.indexdef).toContain('(attendee_id)')
    },
  )

  it('indexes the join-code lookup as it is actually written (FR-499)', async () => {
    const functional = (await indexesOn('events')).find(
      (row) => row.indexname === 'events_join_code_lower_btrim_idx',
    )

    expect(
      functional,
      'The UNIQUE constraint indexes the RAW column; the lookup matches lower(btrim(join_code)) ' +
        'because a code read off a badge arrives with arbitrary case and whitespace. An index ' +
        'the expression does not match cannot be used. Hand-written into 0005 — Drizzle cannot ' +
        'express an expression index, so a regeneration will not re-emit it.',
    ).toBeDefined()

    // The expression, not merely the column: an index on the bare column would satisfy a
    // name-only check while leaving the lookup scanning exactly as before.
    expect(functional?.indexdef).toContain('lower(btrim(join_code))')
  })

  it('enables the unaccent extension (FR-407, research D5)', async () => {
    const rows = await getDb().execute<{ extname: string }>(sql`
      SELECT extname FROM pg_extension WHERE extname = 'unaccent'
    `)

    expect(
      rows,
      'Searching "Munoz" must find "Muñoz": the organisation is Programa-Semilla and its ' +
        'conferences are Spanish-language. Hand-written into 0005 for the same reason as the ' +
        'functional index above.',
    ).toHaveLength(1)
  })

  it('actually normalises accents, rather than merely being installed', async () => {
    // The behavioural half. An extension present in `pg_extension` but installed into a schema
    // outside the search path answers "installed" and then fails every query that uses it.
    const rows = await getDb().execute<{ folded: string }>(sql`
      SELECT unaccent(lower('Muñoz')) AS folded
    `)

    expect(rows[0]?.folded).toBe('munoz')
  })
})

/**
 * T115 (014 tranche 2) — **migration `0012`'s structural truths, over `pg_catalog`** (research
 * R19's own prescription: assertions in this file's established shape, because a behavioural
 * test can pass against a table that acquired its constraints some other way).
 *
 * Numbered `0012` while `0010` stays permanently empty — the journal's fourth recorded skew,
 * documented in `migrations/meta/README.md` §4. What this block pins is the half a hand-edited
 * migration could silently lose on regeneration: the nullable room, the constant-default
 * back-fills having DROPPED their defaults, the new CHECKs, and the enrolment cascades from
 * BOTH parents.
 */
describe('migration 0012 — conference authoring, tranche 2', () => {
  it('made sessions.room_id nullable (FR-1049) and dropped both back-fill defaults (FR-1048, FR-1060)', async () => {
    const rows = await getDb().execute<{ attname: string; attnotnull: boolean; hasdef: boolean }>(
      sql`
        SELECT a.attname, a.attnotnull, (d.adbin IS NOT NULL) AS hasdef
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid IN ('sessions'::regclass, 'events'::regclass)
          AND a.attname IN ('room_id', 'kind', 'modality')
      `,
    )
    const byName = new Map(rows.map((row) => [row.attname, row]))

    expect(byName.get('room_id')?.attnotnull, 'room_id must be nullable').toBe(false)
    // The back-fill pattern: a CONSTANT default applied so existing rows stay valid, dropped in
    // the same migration — a column that keeps a silent default is how a wrong value ships
    // unnoticed (the events.timezone precedent, FR-1048's own words).
    expect(byName.get('kind')?.attnotnull).toBe(true)
    expect(byName.get('kind')?.hasdef, 'sessions.kind must not keep its back-fill default').toBe(
      false,
    )
    expect(byName.get('modality')?.attnotnull).toBe(true)
    expect(
      byName.get('modality')?.hasdef,
      'events.modality must not keep its back-fill default',
    ).toBe(false)
  })

  it('carries every tranche-2 CHECK, including the two-layer last lines of defence', async () => {
    const rows = await getDb().execute<{ conname: string }>(sql`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'sessions_room_or_link', 'sessions_kind_fields', 'sessions_access_link_https',
        'events_modality_valid', 'events_format_valid',
        'attendee_profiles_sector_length', 'attendee_profiles_subsector_length',
        'attendee_profiles_productive_activity_length',
        'vocabulary_sectors_label_length', 'vocabulary_subsectors_label_length',
        'vocabulary_interests_label_length'
      )
    `)
    expect(rows.map((row) => row.conname).sort()).toHaveLength(11)
  })

  it('cascades session_enrolments from BOTH parents, and keys it as the idempotency (FR-1081a)', async () => {
    const rows = await getDb().execute<{ conname: string; confdeltype: string; def: string }>(sql`
      SELECT conname, confdeltype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'session_enrolments'::regclass AND contype = 'f'
      ORDER BY conname
    `)

    // Two foreign keys, both `ON DELETE CASCADE` ('c'): erasure reaches a held place through the
    // attendee, and deleting a session destroys its places — the ratified O2 cost, which the
    // referential rules must not quietly soften into RESTRICT.
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.confdeltype).toBe('c')

    const pk = await getDb().execute<{ def: string }>(sql`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'session_enrolments'::regclass AND contype = 'p'
    `)
    expect(pk[0]?.def).toContain('(attendee_id, session_id)')
  })

  it('refuses the kind/fields combinations at the database, with the route bypassed (FR-1062a)', async () => {
    // 009's btrim lesson: the two layers are asserted separately. A mandatory session carrying
    // a capacity must be refused by the COLUMN constraint even when the write path is not the
    // one holding the rule.
    const [event] = await getDb().execute<{ id: string; track: string; room: string }>(sql`
      SELECT e.id, t.id AS track, r.id AS room
      FROM events e
      JOIN tracks t ON t.event_id = e.id
      JOIN rooms r ON r.event_id = e.id
      LIMIT 1
    `)

    expect(
      await refusedBy(
        getDb().execute(sql`
          INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                                capacity)
          VALUES (${event?.id}::uuid, ${event?.track}::uuid, ${event?.room}::uuid,
                  'Mandatory With Capacity', now(), now() + interval '1 hour',
                  'mandatory', 10)
        `),
      ),
    ).toBe('sessions_kind_fields')

    expect(
      await refusedBy(
        getDb().execute(sql`
          INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                                capacity, enrolment_closing_offset_hours, access_link)
          VALUES (${event?.id}::uuid, ${event?.track}::uuid, ${event?.room}::uuid,
                  'Insecure Link', now(), now() + interval '1 hour',
                  'optional', 10, 0, 'http://not-https.example')
        `),
      ),
    ).toBe('sessions_access_link_https')
  })
})
