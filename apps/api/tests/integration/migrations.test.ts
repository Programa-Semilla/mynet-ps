import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { setupTestApp, teardown } from './helpers.js'

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
describe('migration 0004 — saved sessions and notes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Runs every committed migration in order, `0004` included, against a real instance.
    app = await setupTestApp()
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

  /**
   * The constraint a write actually tripped over.
   *
   * Asserted on the driver's `constraint_name` rather than by matching the message, because
   * Drizzle wraps the `PostgresError` in an `Error` whose message is the failed SQL and its
   * parameters — for an over-length note, that message is the 10,001-character body itself.
   * The field is also the stronger assertion: it names *which* constraint refused, so a write
   * rejected by the primary key could not pass as the length check doing its job.
   */
  const refusedBy = async (statement: Promise<unknown>): Promise<string | undefined> => {
    try {
      await statement
      return undefined
    } catch (error) {
      return (error as { cause?: { constraint_name?: string } }).cause?.constraint_name
    }
  }

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
    // parallel. `0003` is deliberately skipped — it belongs to 004, which has not shipped —
    // and neither number may be renamed to resolve a conflict with the other.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath, URL: NodeURL } = await import('node:url')

    const journalPath = fileURLToPath(
      new NodeURL('../../migrations/meta/_journal.json', import.meta.url),
    )
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    const tags = journal.entries.map((entry) => entry.tag)
    expect(tags.filter((tag) => tag.startsWith('0004_'))).toEqual(['0004_saved_sessions_and_notes'])
    expect(
      tags.filter((tag) => tag.startsWith('0005_')),
      '0005 belongs to 006',
    ).toEqual([])
    expect(
      tags.filter((tag) => tag.startsWith('0003_')),
      '0003 belongs to 004',
    ).toEqual([])
  })
})
