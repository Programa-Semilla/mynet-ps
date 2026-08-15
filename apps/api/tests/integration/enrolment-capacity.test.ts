import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
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
import { eq } from 'drizzle-orm'

/**
 * T129 (014 tranche 2) — **capacity is impossible to exceed, verified by CONCURRENT attempts**
 * (FR-1068, SC-1014, US5 acceptance scenario 4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE REQUIREMENT IS STATED AS AN OUTCOME AND VERIFIED AS ONE: in every ordering, exactly one
 * of two attendees contesting the last place holds it, and there is no interval in which both
 * appear to have succeeded.**
 *
 * Sequential attempts cannot verify this — they exercise the ordinary refusal, not the race.
 * These attempts are genuinely concurrent requests against a real `postgres:17`, because the
 * property under test is the `SELECT … FOR UPDATE` critical section in `queries/enrolments.ts`
 * (research R12): lock, count, insert, three statements, nothing else inside the transaction.
 * A double using a mocked query layer would prove the property is *checked* while checking
 * nothing, since the subject IS the serialisation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('enrolment capacity under contention (T129, FR-1068, SC-1014)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let ada: string
  let grace: string
  let alan: string

  const ALAN = 'alan@example.com'

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
    // The deletion test above erased a SEEDED account; the reseed restores it so the suites
    // that run after this file find the fixture the seed promises them.
    await resetDatabase()
    await teardown(app)
  })

  const attendeeSession = async (email: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    return cookieHeader(sessionCookieFrom(response) as string)
  }

  const register = async (email: string): Promise<void> => {
    const db = getDb()
    const id = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, email))
    )[0]?.id as string
    await db.insert(registrations).values({ attendeeId: id, eventId: fixture.assigned.eventId })
  }

  /** An optional session, inserted directly so the test controls capacity and times exactly. */
  const optionalSession = async (capacity: number): Promise<string> => {
    const rows = await getDb().execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                            capacity, enrolment_closing_offset_hours)
      VALUES (${fixture.assigned.eventId}::uuid, ${fixture.assigned.trackId}::uuid,
              ${fixture.assigned.roomId}::uuid, 'Contested Workshop',
              '2027-03-01T09:00:00Z'::timestamptz, '2027-03-01T10:00:00Z'::timestamptz,
              'optional', ${capacity}, 0)
      RETURNING id
    `)
    return rows[0]?.id as string
  }

  const enrol = (cookie: string, sessionId: string) =>
    app.inject({
      method: 'PUT',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
      headers: { cookie },
    })

  const placesHeld = async (sessionId: string): Promise<number> => {
    const rows = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM session_enrolments WHERE session_id = ${sessionId}::uuid
    `)
    return rows[0]?.n ?? 0
  }

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
    await register(GRACE)
    await register(ALAN)
    ada = await attendeeSession(ADA)
    grace = await attendeeSession(GRACE)
    alan = await attendeeSession(ALAN)
  })

  it('admits exactly `capacity` attendees when more contend at once (FR-1068)', async () => {
    const sessionId = await optionalSession(2)

    const responses = await Promise.all([
      enrol(ada, sessionId),
      enrol(grace, sessionId),
      enrol(alan, sessionId),
    ])

    const succeeded = responses.filter((r) => r.statusCode === 204)
    const refused = responses.filter((r) => r.statusCode === 409)

    expect(succeeded, 'exactly two of three concurrent attempts hold the two places').toHaveLength(
      2,
    )
    expect(refused, 'the third is refused, never queued and never over-admitted').toHaveLength(1)
    expect((refused[0]?.json() as { code: string }).code).toBe('session_full')

    // The database, not the responses, is the arbiter: no ordering may leave more rows than
    // places, and no interval in which both "successes" of a contested pair are committed can
    // have existed for the count to exceed capacity now.
    expect(await placesHeld(sessionId)).toBe(2)
  })

  it('gives the LAST place to exactly one of two simultaneous attempts, in every ordering', async () => {
    // Repeated because a single interleaving proves a single interleaving. Ten rounds against a
    // real pool give the race genuine opportunities to land both ways; the invariant must hold
    // in all of them (SC-1014 "verified by concurrent attempts rather than by sequential ones").
    for (let round = 0; round < 10; round += 1) {
      const sessionId = await optionalSession(1)

      const [first, second] = await Promise.all([enrol(grace, sessionId), enrol(alan, sessionId)])
      const codes = [first?.statusCode, second?.statusCode].sort()

      expect(codes, `round ${round}: exactly one 204 and one 409`).toEqual([204, 409])
      expect(await placesHeld(sessionId)).toBe(1)
    }
  })

  it('returns a released place to the pool immediately (FR-1067)', async () => {
    const sessionId = await optionalSession(1)

    expect((await enrol(grace, sessionId)).statusCode).toBe(204)
    expect((await enrol(alan, sessionId)).statusCode).toBe(409)

    const released = await app.inject({
      method: 'DELETE',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
      headers: { cookie: grace },
    })
    expect(released.statusCode).toBe(204)

    // The place is takeable the moment the release commits — no sweep, no delay, no tombstone.
    expect((await enrol(alan, sessionId)).statusCode).toBe(204)
    expect(await placesHeld(sessionId)).toBe(1)
  })

  it('releases places on withdrawal from the conference, by hand (T152, FR-1081)', async () => {
    const sessionId = await optionalSession(2)
    expect((await enrol(grace, sessionId)).statusCode).toBe(204)

    // Nothing cascades from a registration — the shipped withdrawal path deletes saves and
    // notes by hand for the same reason, and a place left behind would be held by somebody who
    // can no longer see or release it (the same trap 008 recorded for appointments).
    const withdrawal = await app.inject({
      method: 'DELETE',
      url: `/events/${fixture.assigned.eventId}/registration`,
      headers: { cookie: grace },
    })
    expect([200, 204]).toContain(withdrawal.statusCode)

    expect(await placesHeld(sessionId)).toBe(0)
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // FR-1077b, driven through the ROUTE (T150's server half). The admin client's confirm dialog
  // has its own component tests, but the figure-you-saw contract is enforced by `deleteSession`
  // re-reading the held count under the session-row lock — and until these three tests existed,
  // no integration test sent `placesSeen` at all, so the server-side promise was asserted
  // nowhere a real database could falsify it.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  const sessionRows = async (sessionId: string): Promise<number> => {
    const rows = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM sessions WHERE id = ${sessionId}::uuid
    `)
    return rows[0]?.n ?? 0
  }

  const removeSession = (cookie: string, sessionId: string, placesSeen?: number) =>
    app.inject({
      method: 'DELETE',
      url:
        `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}` +
        (placesSeen === undefined ? '' : `?placesSeen=${String(placesSeen)}`),
      headers: { cookie },
    })

  it('refuses a delete whose placesSeen has been overtaken, and destroys nothing (FR-1077b)', async () => {
    const sessionId = await optionalSession(3)
    expect((await enrol(grace, sessionId)).statusCode).toBe(204)
    expect((await enrol(alan, sessionId)).statusCode).toBe(204)

    // The organizer confirmed against a stale figure: they saw 1, a second place has since been
    // taken. The re-read happens inside the deleting transaction, under the same `FOR UPDATE`
    // FR-1019a takes, so the current figure — not the one they were shown — decides.
    const organizer = await organizerSession(app, ADA, SEED_PASSWORD)
    const refusal = await removeSession(organizer, sessionId, 1)

    expect(refusal.statusCode).toBe(409)
    const body = refusal.json() as { code: string; placesHeld?: number }
    expect(body.code).toBe('places_changed')
    expect(body.placesHeld, 'the refusal re-presents the CURRENT figure, to be confirmed').toBe(2)

    // Nothing was destroyed: the session survives and both attendees still hold their places.
    // A refusal that cascaded anyway would be indistinguishable from success in the response
    // alone, which is why the database is the arbiter here.
    expect(await sessionRows(sessionId)).toBe(1)
    expect(await placesHeld(sessionId)).toBe(2)
  })

  it('refuses a delete that names NO figure while any place exists — the honest floor (FR-1077b)', async () => {
    const sessionId = await optionalSession(3)
    expect((await enrol(grace, sessionId)).statusCode).toBe(204)

    // `placesSeen` omitted defaults to zero in the route, deliberately: a client that showed
    // the organizer no figure may not delete as if zero places were seen, so any held place at
    // all refuses it into showing one. The floor is the route's own documented promise.
    const organizer = await organizerSession(app, ADA, SEED_PASSWORD)
    const refusal = await removeSession(organizer, sessionId)

    expect(refusal.statusCode).toBe(409)
    const body = refusal.json() as { code: string; placesHeld?: number }
    expect(body.code).toBe('places_changed')
    expect(body.placesHeld).toBe(1)
    expect(await sessionRows(sessionId)).toBe(1)
    expect(await placesHeld(sessionId)).toBe(1)
  })

  it('deletes when placesSeen matches what is held — the success control (FR-1077)', async () => {
    const sessionId = await optionalSession(3)
    expect((await enrol(grace, sessionId)).statusCode).toBe(204)
    expect((await enrol(alan, sessionId)).statusCode).toBe(204)

    // Held places are NOT engagement (v5.3.0 O2), so a session with places held stays
    // deletable — the confirmation figure is the whole of the protection, and when it matches,
    // the delete proceeds and the held places are destroyed by the cascade with no trace
    // (register entry 31 is open on that, and `notify-enrolled.test.ts` asserts the silence).
    const organizer = await organizerSession(app, ADA, SEED_PASSWORD)
    const removed = await removeSession(organizer, sessionId, 2)

    expect(removed.statusCode).toBe(204)
    expect(await sessionRows(sessionId)).toBe(0)
    expect(await placesHeld(sessionId), 'the enrolment rows went with the session').toBe(0)
  })

  // LAST in the file, deliberately: it destroys the seeded account it uses, and `afterAll`'s
  // reseed is what restores the fixture for the next suite.
  it('releases every place on account deletion, through the cascade (FR-1081a)', async () => {
    const sessionId = await optionalSession(2)
    expect((await enrol(grace, sessionId)).statusCode).toBe(204)

    const deletion = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: grace },
    })
    expect(deletion.statusCode).toBe(204)

    expect(await placesHeld(sessionId), 'no seat is held by somebody who has left').toBe(0)
  })
})
