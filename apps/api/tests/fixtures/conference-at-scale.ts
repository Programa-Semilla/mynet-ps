import { sql } from 'drizzle-orm'

import { getDb } from '../../src/db/client.js'

/**
 * T058a (006) — a conference of **1,000 registered attendees** (FR-401c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SCALE IS THE REQUIREMENT, NOT A DETAIL OF THE TEST.**
 *
 * FR-401c sets the directory's usable scale at 1,000 registered attendees, and SC-402 and
 * SC-403 are both stated *at that scale*. Measured against the three seeded attendees, both
 * thresholds are met by any implementation including one that sequentially scans every table it
 * touches — so a performance test without this fixture is a test that cannot fail, which is
 * worse than no test because it reads as coverage.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A REALISTIC SPREAD OF INTERESTS, NOT A DEGENERATE ONE.**
 *
 * The ranking is a `LEFT JOIN` from each candidate's interests to the reader's, counted. Give
 * every attendee the same three interests and the join is uniform: one bucket, one cardinality,
 * and a planner that can be right about it by accident. Give nobody any interests and the join
 * is empty and free.
 *
 * So interests are drawn from a vocabulary with a deliberately skewed distribution — a handful
 * of very common ones, a long tail of rare ones — which is what a real conference looks like
 * and what makes the overlap count actually cost something.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Generated, and generated deterministically.** No `Math.random()`: a performance threshold
 * that passes or fails depending on the fixture it happened to draw is not a threshold. The
 * index arithmetic below is the whole source of variation, and it is reproducible.
 */

export const SCALE_ATTENDEE_COUNT = 1_000

/** Marks every row this fixture creates, so teardown needs no list. */
export const SCALE_EMAIL_DOMAIN = 'scale.example.test'

/**
 * Skewed on purpose. The first entries are held by a large fraction of the conference and the
 * last by a handful — so a query that is fast only because every bucket is tiny is not fast
 * here.
 */
const INTEREST_VOCABULARY = [
  'Design systems',
  'Developer experience',
  'Documentation',
  'Accessibility',
  'Platform engineering',
  'Observability',
  'Standards',
  'Mentoring',
  'Typography',
  'Performance',
  'Security',
  'Distributed systems',
  'Machine learning',
  'Community',
  'Open source',
  'Localisation',
  'Testing',
  'Product strategy',
  'Research',
  'Illustration',
] as const

const ROLES = [
  'Principal Engineer',
  'Designer',
  'Director of Engineering',
  'Product Manager',
  'Researcher',
  'Staff Engineer',
  'Developer Advocate',
] as const

const COMPANIES = [
  'Analytical Engines',
  'Naval Systems Group',
  'Peña & Asociados',
  'Fjord Labs',
  'Northwind Systems',
  'Estudio Muñoz',
] as const

/**
 * The interests one attendee holds.
 *
 * `index % (n + 2)` walks the vocabulary at a stride that depends on the attendee, so the
 * common entries recur constantly and the rare ones seldom — the skew, obtained arithmetically
 * rather than by drawing.
 */
const interestsFor = (index: number): string[] => {
  const count = 1 + (index % 4)
  const interests = new Set<string>()

  for (let n = 0; n < count; n += 1) {
    // Squaring the offset is what concentrates the draw at the head of the vocabulary.
    const position = (index * (n + 1) * (n + 1)) % (INTEREST_VOCABULARY.length * (n + 1) + 1)
    interests.add(INTEREST_VOCABULARY[position % INTEREST_VOCABULARY.length] as string)
  }

  return [...interests]
}

/**
 * Creates the population and registers every one of them for `eventId`.
 *
 * Written as three set-based statements rather than a thousand round trips: a fixture that took
 * minutes to build would be one nobody ran, and the timing this feeds is about the *read* path.
 */
export const createConferenceAtScale = async (
  eventId: string,
  count = SCALE_ATTENDEE_COUNT,
): Promise<void> => {
  const db = getDb()

  await db.execute(sql`
    INSERT INTO attendees (email, display_name, discoverable, email_verified_at)
    SELECT
      'scale-' || n || '@${sql.raw(SCALE_EMAIL_DOMAIN)}',
      'Attendee ' || lpad(n::text, 4, '0'),
      true,
      now()
    FROM generate_series(1, ${count}) AS n
  `)

  await db.execute(sql`
    INSERT INTO attendee_profiles (attendee_id, company, role, headline)
    SELECT
      a.id,
      (ARRAY[${sql.join(
        COMPANIES.map((company) => sql`${company}`),
        sql`, `,
      )}])[1 + (('x' || substr(md5(a.email::text), 1, 8))::bit(32)::int & 2147483647) % ${COMPANIES.length}],
      (ARRAY[${sql.join(
        ROLES.map((role) => sql`${role}`),
        sql`, `,
      )}])[1 + (('x' || substr(md5(a.email::text || 'r'), 1, 8))::bit(32)::int & 2147483647) % ${ROLES.length}],
      'Working on things at scale.'
    FROM attendees a
    WHERE a.email::text LIKE '%@${sql.raw(SCALE_EMAIL_DOMAIN)}'
  `)

  await db.execute(sql`
    INSERT INTO registrations (attendee_id, event_id)
    SELECT a.id, ${eventId}::uuid
    FROM attendees a
    WHERE a.email::text LIKE '%@${sql.raw(SCALE_EMAIL_DOMAIN)}'
  `)

  // Interests, computed here rather than in SQL so the skew is readable and testable as code.
  const rows = await db.execute<{ id: string; email: string }>(sql`
    SELECT id, email::text AS email FROM attendees
    WHERE email::text LIKE '%@${sql.raw(SCALE_EMAIL_DOMAIN)}'
    ORDER BY email
  `)

  const values = rows.flatMap((row, index) =>
    interestsFor(index).map((interest) => sql`(${row.id}::uuid, ${interest})`),
  )

  if (values.length > 0) {
    await db.execute(sql`
      INSERT INTO attendee_interests (attendee_id, interest)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT DO NOTHING
    `)
  }

  // The planner needs statistics to choose the indexes `0005` added; without this it may choose
  // a sequential scan on a table it has never seen a row count for, and the measurement would
  // be of a cold optimiser rather than of the query.
  await db.execute(sql`ANALYZE attendees, attendee_profiles, attendee_interests, registrations`)
}

/** Removes the population. The cascade from `attendees` takes profiles, interests and registrations. */
export const removeConferenceAtScale = async (): Promise<void> => {
  await getDb().execute(
    sql`DELETE FROM attendees WHERE email::text LIKE '%@${sql.raw(SCALE_EMAIL_DOMAIN)}'`,
  )
}
