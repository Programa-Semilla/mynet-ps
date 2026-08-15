import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  GRACE,
  registrations,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T132 (014 tranche 2) — **the closing deadline is DERIVED from start-plus-offset and follows a
 * rescheduled session** (FR-1071, FR-1071a, FR-1071b, FR-1071c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING HERE IS STORED AND NOTHING HERE IS SCHEDULED.** Open-or-closed is answered against
 * the database clock at the moment of the request (FR-1072); there is no stored instant, no
 * stored open flag, and no sweep that flips one. That is why moving a session later RE-OPENS
 * enrolment with no repair step, and moving it earlier closes it with nobody told — both
 * accepted costs the spec states rather than repairs (FR-1071c). A stored deadline would
 * detach from the session it belongs to, and the detachment would be silent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the enrolment deadline (T132, FR-1071)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let grace: string

  beforeAll(async () => {
    app = await setupTestApp()
    // The integration files share one database, run in FILE-SIZE order, and several reset it
    // mid-run — so the seed this file's fixtures assume can be gone for reasons unrelated to
    // anything it tests (the D19-recorded isolation weakness, met again when this tranche's
    // growth reshuffled the order). Reseeding here is `export.test.ts`'s own pattern: the file
    // states its prerequisite instead of hoping a neighbour left it standing.
    await resetDatabase()
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)

    const db = getDb()
    const graceId = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, GRACE))
    )[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    grace = cookieHeader(sessionCookieFrom(signIn) as string)
  })

  /** An optional session whose start is `leadHours` from now, closing `offsetHours` before it. */
  const sessionStarting = async (leadHours: number, offsetHours: number): Promise<string> => {
    const rows = await getDb().execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                            capacity, enrolment_closing_offset_hours)
      VALUES (${fixture.assigned.eventId}::uuid, ${fixture.assigned.trackId}::uuid,
              ${fixture.assigned.roomId}::uuid, 'Deadline Subject',
              now() + make_interval(hours => ${leadHours}),
              now() + make_interval(hours => ${leadHours + 1}),
              'optional', 5, ${offsetHours})
      RETURNING id
    `)
    return rows[0]?.id as string
  }

  const enrol = (sessionId: string) =>
    app.inject({
      method: 'PUT',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
      headers: { cookie: grace },
    })

  it('derives closing from start minus offset: open before it, closed after it (FR-1071)', async () => {
    // Starts in 48h, closes 24h before: the deadline is 24h away — open.
    const open = await sessionStarting(48, 24)
    expect((await enrol(open)).statusCode).toBe(204)

    // Starts in 12h, closes 24h before: the deadline passed 12h ago — closed.
    const closed = await sessionStarting(12, 24)
    const refusal = await enrol(closed)
    expect(refusal.statusCode).toBe(409)
    expect((refusal.json() as { code: string }).code).toBe('enrolment_closed')
  })

  it('permits an offset of zero — enrolment open until the session starts (REQ-083)', async () => {
    const open = await sessionStarting(1, 0)
    expect((await enrol(open)).statusCode).toBe(204)
  })

  it('re-opens enrolment when a session moves later (FR-1071c)', async () => {
    const sessionId = await sessionStarting(12, 24)
    expect((await enrol(sessionId)).json()).toMatchObject({ code: 'enrolment_closed' })

    // The organizer moves it a week out. The deadline moves WITH it, because it is derived —
    // there is no stored instant to repair and no repair step to forget (FR-1071).
    await getDb().execute(sql`
      UPDATE sessions SET starts_at = now() + interval '168 hours',
                          ends_at = now() + interval '169 hours'
      WHERE id = ${sessionId}::uuid
    `)

    expect((await enrol(sessionId)).statusCode).toBe(204)
  })

  it('closes enrolment at once when a session moves earlier, keeping held places (FR-1071b)', async () => {
    const sessionId = await sessionStarting(48, 24)
    expect((await enrol(sessionId)).statusCode).toBe(204)

    await getDb().execute(sql`
      UPDATE sessions SET starts_at = now() + interval '12 hours',
                          ends_at = now() + interval '13 hours'
      WHERE id = ${sessionId}::uuid
    `)

    // Grace keeps her place — the deadline governs taking, not holding.
    const held = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM session_enrolments WHERE session_id = ${sessionId}::uuid
    `)
    expect(held[0]?.n).toBe(1)

    // And nobody new can take one.
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const ada = cookieHeader(sessionCookieFrom(signIn) as string)
    const refused = await app.inject({
      method: 'PUT',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
      headers: { cookie: ada },
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { code: string }).code).toBe('enrolment_closed')
  })

  it('reads as closed-with-no-places-figure when offline-style stale data would mislead: the places read is live and reports closed (FR-1070b, FR-1071a)', async () => {
    const closed = await sessionStarting(12, 24)
    const places = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions/${closed}/places`,
      headers: { cookie: grace },
    })
    expect(places.statusCode).toBe(200)
    expect(places.json()).toEqual({ remaining: 5, open: false })
  })
})
