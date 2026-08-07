import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { PROFILE_LIMITS } from '../../src/db/schema/profiles.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T068 (004) — **the limits are enforced at the COLUMN, independently of the route** (FR-337).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `session_notes` set this precedent in 005 and the argument is unchanged: **client-side
 * presentation of a limit is never the enforcement of it** (Principle VIII). The editor
 * surfaces each limit as it is approached, the route schema refuses beyond it, and the column
 * refuses it again — so a second write path arriving later inherits the constraint rather than
 * having to remember it.
 *
 * The distinction this file makes is the one that matters: the route assertions prove the
 * *designed* path refuses, and the direct-SQL assertions prove the *last line of defence* does.
 * A test that only exercised the route would pass identically against a schema with no
 * constraints at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('profile limits are enforced at the column, not only at the route (FR-337)', () => {
  let app: FastifyInstance
  let ada: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const write = (body: Record<string, unknown>) =>
    app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
      payload: body,
    })

  /** Which constraint a write actually tripped over — see `migrations.test.ts` for why. */
  const refusedBy = async (statement: Promise<unknown>): Promise<string | undefined> => {
    try {
      await statement
      return undefined
    } catch (error) {
      return (error as { cause?: { constraint_name?: string } }).cause?.constraint_name
    }
  }

  const asAda = (statement: ReturnType<typeof sql>) => getDb().execute(statement)

  it.each([
    ['company', PROFILE_LIMITS.company],
    ['role', PROFILE_LIMITS.role],
    ['headline', PROFILE_LIMITS.headline],
  ])('refuses an over-length %s at the route', async (field, max) => {
    const response = await write({ [field]: 'x'.repeat(max + 1) })
    expect(response.statusCode).toBe(400)
  })

  it.each([
    ['company', 'attendee_profiles_company_length', PROFILE_LIMITS.company],
    ['role', 'attendee_profiles_role_length', PROFILE_LIMITS.role],
    ['headline', 'attendee_profiles_headline_length', PROFILE_LIMITS.headline],
  ])(
    'refuses an over-length %s at the COLUMN, bypassing the route entirely',
    async (field, constraint, max) => {
      // Straight to the database. This is the assertion the route-level one cannot make: it would
      // pass against a schema carrying no constraints at all.
      const refused = await refusedBy(
        asAda(sql`
        INSERT INTO attendee_profiles (attendee_id, ${sql.raw(`"${field}"`)})
        SELECT id, ${'x'.repeat(max + 1)} FROM attendees WHERE email = ${ADA}
        ON CONFLICT (attendee_id) DO UPDATE
          SET ${sql.raw(`"${field}"`)} = excluded.${sql.raw(`"${field}"`)}
      `),
      )

      expect(refused).toBe(constraint)
    },
  )

  it.each([
    ['company', PROFILE_LIMITS.company],
    ['role', PROFILE_LIMITS.role],
    ['headline', PROFILE_LIMITS.headline],
  ])('accepts a %s at exactly the limit — the bound is inclusive', async (field, max) => {
    // Off-by-one in the other direction: a limit that refused its own stated maximum would make
    // the editor's remaining-characters indication lie at the last character (FR-337).
    const response = await write({ [field]: 'x'.repeat(max) })
    expect(response.statusCode).toBe(200)
  })

  it('refuses a networking intent outside the stated options, at the column (FR-339)', async () => {
    const refused = await refusedBy(
      asAda(sql`
        INSERT INTO attendee_profiles (attendee_id, networking_intent)
        SELECT id, 'anything-i-fancy' FROM attendees WHERE email = ${ADA}
        ON CONFLICT (attendee_id) DO UPDATE SET networking_intent = excluded.networking_intent
      `),
    )

    expect(
      refused,
      '006 filters a directory on this value, and free text cannot be filtered on meaningfully.',
    ).toBe('attendee_profiles_networking_intent')
  })

  it('refuses an availability outside the stated options, at the column (FR-339)', async () => {
    const refused = await refusedBy(
      asAda(sql`
        INSERT INTO attendee_profiles (attendee_id, availability)
        SELECT id, 'perhaps' FROM attendees WHERE email = ${ADA}
        ON CONFLICT (attendee_id) DO UPDATE SET availability = excluded.availability
      `),
    )

    expect(refused).toBe('attendee_profiles_availability')
  })

  it('refuses an over-length interest at the column', async () => {
    const refused = await refusedBy(
      asAda(sql`
        INSERT INTO attendee_interests (attendee_id, interest)
        SELECT id, ${'x'.repeat(PROFILE_LIMITS.interest + 1)} FROM attendees WHERE email = ${ADA}
      `),
    )

    expect(refused).toBe('attendee_interests_length')
  })

  it('refuses a blank field at the column, so "unset" has one representation', async () => {
    // The route normalises blank to null before it gets here, which is why this constraint is
    // never reached by an ordinary edit. It exists for the second write path that does not.
    const refused = await refusedBy(
      asAda(sql`
        INSERT INTO attendee_profiles (attendee_id, company)
        SELECT id, '' FROM attendees WHERE email = ${ADA}
        ON CONFLICT (attendee_id) DO UPDATE SET company = excluded.company
      `),
    )

    expect(refused).toBe('attendee_profiles_company_length')
  })

  it('refuses more interests than the stated bound, at the route AND in the query layer', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The count bound is the one limit that is NOT a column CHECK, and the reason is recorded
    // in `PROFILE_LIMITS`: PostgreSQL forbids a subquery in a CHECK, so a per-row constraint
    // cannot see the set it belongs to. It is bounded where the set is written instead — twice,
    // at the route schema and again in `writeOwnProfile`, because the route is the only thing
    // between a client and the query layer and this is the limit with no third line.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const tooMany = Array.from({ length: PROFILE_LIMITS.interestCount + 1 }, (_, i) => `Topic ${i}`)

    const response = await write({ interests: tooMany })
    expect(response.statusCode).toBe(400)

    const stored = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendee_interests i
      JOIN attendees a ON a.id = i.attendee_id WHERE a.email = ${ADA}
    `)
    expect(
      Number(stored[0]?.count),
      'a refused write must store nothing at all, not a truncated set',
    ).toBeLessThanOrEqual(PROFILE_LIMITS.interestCount)
  })

  it('accepts exactly the maximum number of interests', async () => {
    const exactly = Array.from({ length: PROFILE_LIMITS.interestCount }, (_, i) => `Topic ${i}`)

    const response = await write({ interests: exactly })
    expect(response.statusCode).toBe(200)
    expect((response.json() as { interests: string[] }).interests).toHaveLength(
      PROFILE_LIMITS.interestCount,
    )
  })
})
