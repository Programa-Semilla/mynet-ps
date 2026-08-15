import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { setupTestApp, teardown } from './helpers.js'

/**
 * T020 (006) — **the indexes are used, not merely present** (FR-498, FR-499, SC-415).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `migrations.test.ts` asserts that `0005` created five indexes. That is necessary and it is
 * not sufficient, because **the failure mode both 004 review findings describe is an index that
 * exists and cannot be used.**
 *
 * `events.join_code` was the case in point: it carried a `UNIQUE` constraint, PostgreSQL indexed
 * it, and every join attempt still scanned the table — because the lookup matches
 * `lower(btrim(join_code))`, and an expression the index does not contain cannot use it. A test
 * that read `pg_indexes`, found an index on `join_code`, and stopped there would have reported
 * that finding as fixed while it was still open.
 *
 * So these assertions read the **planner's** answer. `EXPLAIN` is the only thing that can tell
 * "an index exists" from "this query uses it", and that distinction is the whole of both
 * findings.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS SUITE POPULATES ITS OWN SCALE, AND THAT IS THE TEST RATHER THAN SETUP FOR IT.**
 *
 * The first attempt at this file set `enable_seqscan = off` and asserted the plan named the
 * index. That was wrong twice over, and both errors are worth recording because both look
 * reasonable:
 *
 *   1. **`enable_seqscan = off` does not disable sequential scans.** It adds a large cost
 *      penalty. Against a seeded `registrations` of five rows the penalised scan is still the
 *      cheapest plan, so the assertion failed while the index was perfectly correct.
 *   2. **Even when an index was chosen, it was the wrong one.** With only `attendee_id`
 *      selected, the planner picked an *Index Only Scan* over the composite unique
 *      `(attendee_id, event_id)` — reading the whole index and applying `Filter: (event_id =
 *      …)`. That plan names an index and is exactly the pathology `0005` exists to remove: it
 *      touches every row.
 *
 * SC-415 says these operations must "complete in time that does **not grow** with the total
 * number of accounts or conferences". That is a claim about growth, so it is only testable
 * against a table large enough for growth to matter. This suite inserts that scale, `ANALYZE`s
 * so the planner has real statistics, and then reads the plan **with no planner settings
 * touched at all** — which is the configuration production runs.
 *
 * The assertion is on `Index Cond` rather than on the index name alone, for reason 2 above: a
 * predicate in `Index Cond` **bounds** the scan, whereas the same predicate in `Filter` means
 * every row was read and then discarded. Only the first stops growing.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Enough rows that a selective predicate is cheaper by index than by scan, and small enough that
 * inserting them costs a moment. 2,000 is also twice FR-401c's 1,000-attendee scale target, so
 * the planner's choice here is the one it makes at the size this product is specified for.
 */
const ROWS = 2_000

/** Marks every row this suite creates, so cleanup can be exact rather than approximate. */
const MARKER = 'index-usage-fixture'

/**
 * A constant, and it has to be one.
 *
 * `gen_random_uuid()` is **VOLATILE**, so the planner cannot hoist it into an index condition —
 * it has to evaluate the function once per row, which forces a sequential scan whatever indexes
 * exist. That produced a failure indistinguishable from a missing index, on a query that in
 * production is always a literal from the request. The value matches nothing, which is what
 * makes the plan about the access path rather than about the rows.
 */
const ABSENT_UUID = '00000000-0000-0000-0000-000000000000'

describe('the 0005 indexes are reachable by the planner (SC-415)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()

    const db = getDb()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Synthetic scale. Every row is marked, and `attendees` cascades to registrations,
    // verifications, resets and interests — so the cleanup in `afterAll` is one delete plus the
    // events, which do not cascade from anything.
    //
    // Inserted with `generate_series` rather than a loop of statements: 10,000 round trips would
    // dominate this suite's runtime and prove nothing extra.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await db.execute(sql`
      INSERT INTO attendees (email, display_name, discoverable, email_verified_at)
      SELECT ${MARKER} || n || '@example.invalid', 'Fixture ' || n, true, now()
      FROM generate_series(1, ${ROWS}) AS n
    `)

    await db.execute(sql`
      INSERT INTO events (name, location, starts_on, ends_on, timezone, join_code, modality)
      SELECT ${MARKER} || ' ' || n, 'Nowhere', DATE '2026-01-01', DATE '2026-01-02',
             'UTC', ${MARKER} || '-' || n, 'in-person'
      FROM generate_series(1, ${ROWS}) AS n
    `)

    // One conference holding every fixture attendee: the shape the directory reads.
    await db.execute(sql`
      INSERT INTO registrations (attendee_id, event_id)
      SELECT a.id, (SELECT id FROM events WHERE name = ${MARKER} || ' 1')
      FROM attendees a WHERE a.email LIKE ${MARKER} || '%'
    `)

    await db.execute(sql`
      INSERT INTO attendee_verifications (attendee_id, token_hash, expires_at)
      SELECT a.id, ${MARKER} || '-v-' || a.id, now() + interval '1 day'
      FROM attendees a WHERE a.email LIKE ${MARKER} || '%'
    `)

    await db.execute(sql`
      INSERT INTO attendee_password_resets (attendee_id, token_hash, expires_at)
      SELECT a.id, ${MARKER} || '-r-' || a.id, now() + interval '1 hour'
      FROM attendees a WHERE a.email LIKE ${MARKER} || '%'
    `)

    // A spread of interests rather than one repeated value: an index on a column holding a
    // single distinct value is one the planner correctly refuses to use, which would make this
    // suite fail for a reason that says nothing about `0005`.
    await db.execute(sql`
      INSERT INTO attendee_interests (attendee_id, interest)
      SELECT a.id, 'fixture-interest-' || (abs(hashtext(a.id::text)) % 200)
      FROM attendees a WHERE a.email LIKE ${MARKER} || '%'
      ON CONFLICT DO NOTHING
    `)

    // Without statistics the planner works from defaults and may choose either plan for reasons
    // that have nothing to do with the indexes.
    await db.execute(
      sql`ANALYZE attendees, events, registrations, attendee_interests, attendee_verifications, attendee_password_resets`,
    )
  }, 60_000)

  afterAll(async () => {
    const db = getDb()
    // Attendees first: the cascade takes registrations, verifications, resets and interests with
    // them, which is also `0005`'s own subject matter. Events last — nothing cascades to them,
    // and their registrations have to be gone first.
    await db.execute(sql`DELETE FROM attendees WHERE email LIKE ${MARKER} || '%'`)
    await db.execute(sql`DELETE FROM events WHERE name LIKE ${MARKER} || '%'`)
    await teardown(app)
  })

  /** The planner's chosen plan, as one string. No planner settings are touched. */
  const planFor = async (query: ReturnType<typeof sql>): Promise<string> => {
    const rows = await getDb().execute<{ 'QUERY PLAN': string }>(sql`EXPLAIN (COSTS OFF) ${query}`)
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  }

  /**
   * FR-499 — the finding this file was written for.
   *
   * The expression is copied from `db/queries/identity.ts`'s `WHERE` clause deliberately. If that
   * lookup ever changes its normalisation, this assertion goes on passing against the old
   * expression while the real query starts scanning again — so the two must be read together,
   * and this comment is the pointer.
   */
  it('uses a functional index for the join-code lookup, not a scan (FR-499)', async () => {
    const plan = await planFor(
      sql`SELECT e.id FROM events e WHERE lower(btrim(e.join_code)) = 'anything'`,
    )

    expect(
      plan,
      'The lookup normalises and the UNIQUE constraint does not, so before 0005 no index could ' +
        'serve this and every conference join scanned `events`. A 004 review finding.',
    ).toContain('events_join_code_lower_btrim_idx')
    expect(plan, 'Bounded by the index, not filtered after reading every row.').toMatch(
      /Index Cond/,
    )
  })

  /**
   * FR-498 — the other finding, one table each.
   *
   * A cascade's plan is not directly inspectable. What *is* inspectable is the lookup the cascade
   * performs — find this table's rows for one attendee — and that is the access path that had no
   * index at all.
   */
  it.each(['attendee_verifications', 'attendee_password_resets'])(
    'reaches %s rows for one attendee by index, so deletion stops scanning (FR-498)',
    async (table) => {
      const plan = await planFor(
        sql`SELECT id FROM ${sql.identifier(table)} WHERE attendee_id = ${ABSENT_UUID}::uuid`,
      )

      expect(
        plan,
        `ON DELETE CASCADE from attendees finds ${table}'s rows by exactly this predicate. ` +
          'PostgreSQL creates no index for a foreign key, so this was a sequential scan on every ' +
          'account deletion — work growing with every account that ever verified an address.',
      ).toContain(`${table}_attendee_id_idx`)
      expect(plan).toMatch(/Index Cond/)
    },
  )

  /**
   * research D11 — this feature's own primary access path.
   *
   * `id` is selected rather than `attendee_id` on purpose. With `attendee_id` alone the planner
   * can answer from the composite unique `(attendee_id, event_id)` as an index-only scan —
   * reading the entire index and applying `Filter: (event_id = …)`, which touches every
   * registration in the product. Selecting a column the composite does not carry asks the
   * question the directory actually asks, and the `Index Cond` assertion is what rejects the
   * filter-everything plan.
   */
  it("reaches a conference's registrations by index (research D11)", async () => {
    const plan = await planFor(
      sql`SELECT id FROM registrations WHERE event_id = ${ABSENT_UUID}::uuid`,
    )

    expect(
      plan,
      'The directory asks "who else is registered here". Only attendee_id was indexed, and the ' +
        'composite unique leads with the wrong column to serve it.',
    ).toContain('registrations_event_id_idx')
    expect(plan).toMatch(/Index Cond/)
  })

  /** research D12 — the interest filter and the overlap join. */
  it('reaches attendees holding one interest by index (research D12)', async () => {
    const plan = await planFor(
      sql`SELECT attendee_id FROM attendee_interests WHERE interest = 'fixture-interest-7'`,
    )

    expect(
      plan,
      'The primary key leads with attendee_id and cannot serve a search on `interest`, which is ' +
        'both the filter and the ranking join.',
    ).toContain('attendee_interests_interest_idx')
    expect(plan).toMatch(/Index Cond/)
  })
})
