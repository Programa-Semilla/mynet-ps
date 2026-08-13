import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  createConference,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T027 (014) — **a session belongs inside its conference's days, in the venue's timezone**
 * (FR-1012, FR-1013, research R9).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE LAST TWO ASSERTIONS DRIVE THE RULE WITH THE ROUTE BYPASSED, AND THAT IS 009's LESSON
 * REPAID.**
 *
 * 009 found PostgreSQL's `trim()` accepting `"\n\t \n"` while the route — using JavaScript's
 * Unicode-aware `String.prototype.trim` — refused it. Two layers that were assumed to agree, and
 * the weaker one was the last line of defence.
 *
 * Here the **application** is the weaker layer, and unavoidably so: a `CHECK` constraint cannot
 * reference another table, and the timezone lives on `events`. So FR-1012 is structurally
 * unavailable at the column level, and the honest thing is to say which layer holds it and prove
 * that layer holds it *by itself* — with the route out of the way. FR-1013 is the opposite case:
 * `sessions_ends_at_after_starts_at` has been a check constraint since 002, so the database holds
 * it whatever the route does, and that is asserted rather than assumed too.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('session validation (T027, FR-1012, FR-1013)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const create = (payload: Record<string, unknown>, eventId = fixture.assigned.eventId) =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/sessions`,
      headers: { cookie },
      payload,
    })

  it('accepts a session inside the conference days', async () => {
    // The conference runs 2027-03-01 to 2027-03-03 in UTC.
    expect((await create(sessionBody(fixture.assigned))).statusCode).toBe(201)
  })

  it('refuses a session before the conference starts (FR-1012)', async () => {
    const response = await create(
      sessionBody(fixture.assigned, {
        startsAt: '2027-02-28T09:00:00.000Z',
        endsAt: '2027-02-28T10:00:00.000Z',
      }),
    )

    expect(response.statusCode).toBe(400)
    expect(
      response.json().message,
      'The refusal carries no explanation. The caller supplied the time, so telling them it is ' +
        "outside the conference's dates describes their own input back to them — which is the " +
        'test every explained refusal in this product must pass.',
    ).toMatch(/date|timezone|conference/i)
  })

  it('refuses a session after the conference ends (FR-1012)', async () => {
    expect(
      (
        await create(
          sessionBody(fixture.assigned, {
            startsAt: '2027-03-04T09:00:00.000Z',
            endsAt: '2027-03-04T10:00:00.000Z',
          }),
        )
      ).statusCode,
    ).toBe(400)
  })

  it('refuses an end at or before the start (FR-1013)', async () => {
    for (const endsAt of ['2027-03-01T09:00:00.000Z', '2027-03-01T08:00:00.000Z']) {
      expect(
        (await create(sessionBody(fixture.assigned, { endsAt }))).statusCode,
        `an end of ${endsAt} against a 09:00 start was accepted`,
      ).toBe(400)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE TIMEZONE IS THE WHOLE POINT OF FR-1012, AND A UTC FIXTURE CANNOT SHOW IT.**
   *
   * This conference runs 1–3 March in `Pacific/Auckland` (UTC+13 in March). An instant of
   * `2027-02-28T20:00:00Z` is **28 February in UTC and 1 March at the venue** — so a rule
   * evaluated in UTC refuses it and the rule the requirement asks for accepts it.
   *
   * That difference is the requirement. Without a non-UTC fixture, an implementation comparing
   * instants in UTC would pass every other assertion in this file.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('interprets the day range in the VENUE’s timezone, not UTC (FR-1012)', async () => {
    const auckland = await createConference('Auckland Conference', {
      startsOn: '2027-03-01',
      endsOn: '2027-03-03',
      timezone: 'Pacific/Auckland',
    })

    await getDb().execute(sql`
      INSERT INTO organizer_assignments (attendee_id, event_id, assigned_by)
      VALUES (${fixture.organizerId}::uuid, ${auckland.eventId}::uuid, ${fixture.operatorId}::uuid)
    `)

    const venueLocalFirstMorning = await create(
      sessionBody(auckland, {
        // 09:00 on 1 March in Auckland. In UTC this is 20:00 on 28 February.
        startsAt: '2027-02-28T20:00:00.000Z',
        endsAt: '2027-02-28T21:00:00.000Z',
      }),
      auckland.eventId,
    )

    expect(
      venueLocalFirstMorning.statusCode,
      'A session at 09:00 on the conference’s first day was refused. Its UTC date is the day ' +
        'before, so the rule is being evaluated in UTC rather than in the venue’s timezone — ' +
        'which is precisely what FR-1012 forbids, and it would refuse the opening keynote of ' +
        'every conference east of Greenwich.',
    ).toBe(201)

    // And the mirror: an instant that is inside the range in UTC and outside it at the venue.
    const afterVenueLocalEnd = await create(
      sessionBody(auckland, {
        // 09:00 on 4 March in Auckland — 20:00 on 3 March in UTC, which is inside the range.
        startsAt: '2027-03-03T20:00:00.000Z',
        endsAt: '2027-03-03T21:00:00.000Z',
      }),
      auckland.eventId,
    )

    expect(afterVenueLocalEnd.statusCode).toBe(400)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE ROUTE BYPASSED — 009's `trim()` LESSON, APPLIED TO THE LAYER THAT IS WEAKER HERE.**
   *
   * FR-1013's guarantee is a **database constraint**, so it holds against any write path,
   * including one a later feature adds without reading this file. Driving the column directly is
   * the only way to show that: through the route, a passing test proves the route validated,
   * which is a different and much weaker claim.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses an end-before-start at the DATABASE, with the route bypassed (FR-1013)', async () => {
    await expect(
      getDb().execute(sql`
        INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at)
        VALUES (
          ${fixture.assigned.eventId}::uuid,
          ${fixture.assigned.trackId}::uuid,
          ${fixture.assigned.roomId}::uuid,
          'Bypassed',
          '2027-03-01T10:00:00Z'::timestamptz,
          '2027-03-01T09:00:00Z'::timestamptz
        )
      `),
      'The database accepted a session that ends before it starts. FR-1013 is held by the ' +
        '`sessions_ends_at_after_starts_at` check constraint, which has existed since 002 — if ' +
        'this passes, the constraint is gone and only the route is holding the rule.',
    ).rejects.toThrow()
  })

  it('accepts a valid session at the DATABASE, so the assertion above is about the constraint', async () => {
    // Without this, a broken statement — a typo in a column name, a missing cast — would produce
    // the same rejection and the assertion above would be proving nothing.
    await expect(
      getDb().execute(sql`
        INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at)
        VALUES (
          ${fixture.assigned.eventId}::uuid,
          ${fixture.assigned.trackId}::uuid,
          ${fixture.assigned.roomId}::uuid,
          'Bypassed and valid',
          '2027-03-01T09:00:00Z'::timestamptz,
          '2027-03-01T10:00:00Z'::timestamptz
        )
      `),
    ).resolves.toBeDefined()
  })

  it('permits an overlapping session in the same room, and warns (FR-1016)', async () => {
    await create(sessionBody(fixture.assigned, { title: 'First' }))

    const overlapping = await create(
      sessionBody(fixture.assigned, {
        title: 'Second',
        startsAt: '2027-03-01T09:30:00.000Z',
        endsAt: '2027-03-01T10:30:00.000Z',
      }),
    )

    expect(
      overlapping.statusCode,
      'An overlapping session was refused. Conferences genuinely overlap sessions during ' +
        'changeover, so a refusal would be a rule the product invented rather than one the ' +
        'domain has (FR-1016).',
    ).toBe(201)

    const warnings = overlapping.json().warnings as { code: string; sessions: unknown[] }[]
    expect(warnings.map((warning) => warning.code)).toContain('room_overlap')
    expect(warnings[0]?.sessions).toHaveLength(1)
  })

  it('does not warn when one session begins exactly as another ends', async () => {
    // Half-open, deliberately: a changeover at the boundary is the normal case, and a warning
    // everybody learns to ignore is worse than no warning.
    await create(sessionBody(fixture.assigned, { title: 'First' }))

    const adjacent = await create(
      sessionBody(fixture.assigned, {
        title: 'Second',
        startsAt: '2027-03-01T10:00:00.000Z',
        endsAt: '2027-03-01T11:00:00.000Z',
      }),
    )

    expect(adjacent.json().warnings).toEqual([])
  })
})
