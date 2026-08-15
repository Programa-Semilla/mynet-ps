import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  sessionBody,
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
 * T133, T134 (014 tranche 2) — **capacity cannot drop below the places held, and a session's
 * kind cannot change while anybody is committed to it** (FR-1061a, FR-1065).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **BOTH CHECKS RUN INSIDE THE UPDATING TRANSACTION WITH THE SESSION ROW LOCKED** — FR-1019a's
 * clause, for FR-1019a's reason: an enrolment arriving between the check and the write must
 * block rather than slip past it, or a place is taken over the new cap and FR-1068's invariant
 * is false with nobody having enrolled over a limit. The lock is the same `FOR UPDATE` the
 * delete path takes (one mode, one lock, four callers — research R12) — but the race variant is
 * proved HERE, by this file, against the update path's own lock. `admin-catalog.ts` has two
 * separate `SELECT … FOR UPDATE` sites, `deleteSession`'s and `readSessionLocked`'s, and
 * `delete-engagement-race.test.ts` drives only the first: a header of this file once claimed
 * that proof covered both, and a proof of one lock site says nothing about a second that could
 * independently be weakened to `FOR NO KEY UPDATE` — or dropped — with every test still green.
 *
 * **Nobody is evicted, ever**: releasing a place is the attendee's act, and choosing which
 * attendees lose theirs is not something the product may do (US5 edge case).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('capacity reduction and kind changes (T133, T134, FR-1061a, FR-1065)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

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
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const createOptional = async (capacity: number): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'Bounded Workshop',
        kind: 'optional',
        capacity,
        enrolmentClosingOffsetHours: 0,
      } as never),
    })
    expect(response.statusCode, response.body).toBe(201)
    return (response.json() as { id: string }).id
  }

  const holdPlace = async (sessionId: string, email: string): Promise<void> => {
    const db = getDb()
    const id = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, email))
    )[0]?.id as string
    await db.execute(sql`
      INSERT INTO session_enrolments (attendee_id, session_id)
      VALUES (${id}::uuid, ${sessionId}::uuid)
    `)
  }

  const patch = (sessionId: string, overrides: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'Bounded Workshop',
        kind: 'optional',
        capacity: 3,
        enrolmentClosingOffsetHours: 0,
        ...overrides,
      } as never),
    })

  it('authors an optional session through the route, and refuses malformed shapes distinctly', async () => {
    await createOptional(3)

    // Optional without a capacity: its own code, because "this session needs a maximum number
    // of places" and "this offset is not a number of hours" are different facts (FR-1061).
    const noCapacity = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        kind: 'optional',
        enrolmentClosingOffsetHours: 2,
      } as never),
    })
    expect(noCapacity.statusCode).toBe(400)
    expect((noCapacity.json() as { code: string }).code).toBe('capacity_invalid')

    // Capacity zero is refused outright: a session nobody may take a place in is a cancelled
    // session, and cancellation already exists and preserves everything (US5 edge case).
    const zero = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        kind: 'optional',
        capacity: 0,
        enrolmentClosingOffsetHours: 2,
      } as never),
    })
    expect(zero.statusCode).toBe(400)
    expect((zero.json() as { code: string }).code).toBe('capacity_invalid')

    // Optional without an offset: distinct code (FR-1062).
    const noOffset = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { kind: 'optional', capacity: 3 } as never),
    })
    expect(noOffset.statusCode).toBe(400)
    expect((noOffset.json() as { code: string }).code).toBe('closing_offset_invalid')

    // A mandatory session carrying either field: a field that is meaningless on the kind of
    // session being edited is a field somebody will fill in (FR-1062a).
    const mandatoryWithCapacity = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { kind: 'mandatory', capacity: 3 } as never),
    })
    expect(mandatoryWithCapacity.statusCode).toBe(400)
    expect((mandatoryWithCapacity.json() as { code: string }).code).toBe(
      'mandatory_carries_no_places',
    )
  })

  it('refuses lowering capacity below the places held, NAMING how many, and evicts nobody (FR-1061a)', async () => {
    const sessionId = await createOptional(3)
    await holdPlace(sessionId, GRACE)
    await holdPlace(sessionId, ADA)

    const lowered = await patch(sessionId, { capacity: 1 })
    expect(lowered.statusCode).toBe(409)
    // `AppError.details` spread into the body top-level, exactly as `engagement` and
    // `sessions` are on the shipped refusals.
    const body = lowered.json() as { code: string; placesHeld?: number }
    expect(body.code).toBe('capacity_below_held')
    expect(body.placesHeld, 'the refusal names how many places are held').toBe(2)

    const held = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM session_enrolments WHERE session_id = ${sessionId}::uuid
    `)
    expect(held[0]?.n, 'nobody is evicted by a refused edit').toBe(2)

    // Down to exactly the held count is permitted — it takes nothing from anybody.
    expect((await patch(sessionId, { capacity: 2 })).statusCode).toBe(200)
    // And raising is always permitted.
    expect((await patch(sessionId, { capacity: 20 })).statusCode).toBe(200)
  })

  it('refuses a kind change while any place is held, with its own explanation (T134, FR-1065)', async () => {
    const sessionId = await createOptional(3)
    await holdPlace(sessionId, GRACE)

    const flipped = await patch(sessionId, {
      kind: 'mandatory',
      capacity: undefined,
      enrolmentClosingOffsetHours: undefined,
    })
    expect(flipped.statusCode).toBe(409)
    expect((flipped.json() as { code: string }).code).toBe('kind_committed')
  })

  it('refuses a kind change while any SAVE exists, in the other direction (T134, FR-1065)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title: 'Saved Then Flipped' }),
    })
    const sessionId = (created.json() as { id: string }).id

    const db = getDb()
    const graceId = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, GRACE))
    )[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db.execute(sql`
      INSERT INTO saved_sessions (attendee_id, session_id)
      VALUES (${graceId}::uuid, ${sessionId}::uuid)
    `)

    const flipped = await patch(sessionId, { kind: 'optional', capacity: 5 })
    expect(flipped.statusCode).toBe(409)
    expect((flipped.json() as { code: string }).code).toBe('kind_committed')
  })

  it('serialises a capacity cut against a CONCURRENT enrolment — held never exceeds capacity, and exactly one of the two is refused (FR-1061a, FR-1068)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The race the header names, in `delete-engagement-race.test.ts`'s shape: two real routes
    // fired concurrently against a real pool, repeated so the interleaving gets genuine
    // opportunities to land both ways. What is under test is `readSessionLocked`'s
    // `FOR UPDATE` — the update path's OWN lock site, not `deleteSession`'s — because
    // `updateSession` decides the capacity floor against the held count it reads under that
    // lock, and an enrolment slipping between an unlocked read and the write is exactly a place
    // taken over the new cap with nobody having enrolled over a limit.
    //
    // One place held, capacity 2, and simultaneously: the organizer lowers capacity to 1 while
    // a second attendee takes the last place. The locks serialise them, so whichever commits
    // second reads the first's world and is refused:
    //
    //   - the PATCH wins → capacity is 1, exactly covering the held place; the enrolment
    //     re-reads and is refused `session_full`.
    //   - the enrolment wins → two places are held; the PATCH re-reads and is refused
    //     `capacity_below_held`, naming 2 (nobody is evicted).
    //
    // In NO ordering do both succeed, and in NO ordering does `placesHeld` exceed `capacity`.
    // ─────────────────────────────────────────────────────────────────────────────────────────
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
    const grace = cookieHeader(sessionCookieFrom(signIn) as string)

    for (let round = 0; round < 8; round += 1) {
      const sessionId = await createOptional(2)
      await holdPlace(sessionId, ADA)

      const [lowered, enrolled] = await Promise.all([
        patch(sessionId, { capacity: 1 }),
        app.inject({
          method: 'PUT',
          url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
          headers: { cookie: grace },
        }),
      ])

      const [state] = await getDb().execute<{ capacity: number; held: number }>(sql`
        SELECT s.capacity,
               (SELECT count(*)::int FROM session_enrolments e WHERE e.session_id = s.id) AS held
        FROM sessions s WHERE s.id = ${sessionId}::uuid
      `)

      // The invariant first, unconditionally: it is what both orderings must preserve.
      expect(
        state?.held,
        `round ${round}: more places held than the capacity admits — the update path let one slip`,
      ).toBeLessThanOrEqual(state?.capacity as number)

      if (lowered.statusCode === 200) {
        // The PATCH won: the cap is 1, the held place exactly fills it, and the enrolment that
        // waited re-read a full session.
        expect(
          enrolled.statusCode,
          `round ${round}: the cut committed first, so the enrolment must find the session full`,
        ).toBe(409)
        expect((enrolled.json() as { code: string }).code).toBe('session_full')
        expect(state).toEqual({ capacity: 1, held: 1 })
      } else {
        // The enrolment won: two places are held, and the PATCH that waited re-read a count its
        // new cap cannot cover. Nobody is evicted — the refusal is the whole of the outcome.
        expect(
          lowered.statusCode,
          `round ${round}: with the place landed first, the cut must refuse`,
        ).toBe(409)
        const body = lowered.json() as { code: string; placesHeld?: number }
        expect(body.code).toBe('capacity_below_held')
        expect(body.placesHeld, 'the refusal names the count that blocked it').toBe(2)
        expect(enrolled.statusCode).toBe(204)
        expect(state).toEqual({ capacity: 2, held: 2 })
      }
    }
  })
})
