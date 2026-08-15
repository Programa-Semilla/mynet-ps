import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  platformSession,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import {
  ADA,
  attendees,
  clearThrottle,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T145 (014 tranche 2) — **the enrolment roster's four bounds, each testable** (FR-1073,
 * FR-1073a, SC-1018, constitution v5.3.0 O1 — the FOURTH recorded Principle VIII exception).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FIRST ADMINISTRATIVE READ OF ATTENDEE STATE THIS PROJECT HAS EVER PERMITTED**,
 * and every bound O1 ratified is asserted here separately rather than assumed to compose:
 *
 *   1. **Only enrolment** — no administrative read of who saved, noted, questioned or voted
 *      exists (FR-1042 survives unnarrowed for all four; the widened disclosure guard enforces
 *      the route table, and this file asserts the live behaviour).
 *   2. **Only an assigned organizer**, for their own conferences — an unassigned organizer is
 *      refused identically to a conference that does not exist.
 *   3. **Only that conference's sessions** — the query re-anchors on the scope's event, so a
 *      session of another conference addressed through an assigned one is a 404, not a roster.
 *   4. **Names only** — no identifier, no email, no route into a profile.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the enrolment roster (T145, FR-1073, FR-1073a, SC-1018)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let organizer: string

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

  const insertOptional = async (eventId: string, trackId: string, roomId: string) => {
    const rows = await getDb().execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                            capacity, enrolment_closing_offset_hours)
      VALUES (${eventId}::uuid, ${trackId}::uuid, ${roomId}::uuid, 'Roster Subject',
              '2027-03-01T09:00:00Z'::timestamptz, '2027-03-01T10:00:00Z'::timestamptz,
              'optional', 5, 0)
      RETURNING id
    `)
    return rows[0]?.id as string
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

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
    organizer = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const roster = (cookie: string, eventId: string, sessionId: string) =>
    app.inject({
      method: 'GET',
      url: `/admin/conferences/${eventId}/sessions/${sessionId}/enrolments`,
      headers: { cookie },
    })

  it('names the enrolled to an assigned organizer — names ONLY, in a stable order (FR-1073)', async () => {
    const sessionId = await insertOptional(
      fixture.assigned.eventId,
      fixture.assigned.trackId,
      fixture.assigned.roomId,
    )
    await holdPlace(sessionId, GRACE)
    await holdPlace(sessionId, ADA)

    const response = await roster(organizer, fixture.assigned.eventId, sessionId)
    expect(response.statusCode).toBe(200)

    const body = response.json() as { attendees: { displayName: string }[] }
    // Grace enrolled FIRST and Ada second, so name order differing from insertion order is
    // what proves the "stable order" this test's name promises — the query sorts by display
    // name, and a roster that shuffled between reads would fail here rather than pass on a
    // length check.
    expect(body.attendees.map((entry) => entry.displayName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ])
    for (const entry of body.attendees) {
      // Exactly one key. No id, no email, no avatar, no route into anybody's profile — the
      // exception O1 records is the name, and the name is all there is (FR-1073a bound 4).
      expect(Object.keys(entry)).toEqual(['displayName'])
    }
  })

  it('reads as "nobody yet" for an empty roster — a state, not a failure', async () => {
    const sessionId = await insertOptional(
      fixture.assigned.eventId,
      fixture.assigned.trackId,
      fixture.assigned.roomId,
    )
    const response = await roster(organizer, fixture.assigned.eventId, sessionId)
    expect(response.statusCode).toBe(200)
    expect((response.json() as { attendees: unknown[] }).attendees).toEqual([])
  })

  it('grants a platform operator the same read, by the authority they already hold (FR-1073)', async () => {
    const sessionId = await insertOptional(
      fixture.assigned.eventId,
      fixture.assigned.trackId,
      fixture.assigned.roomId,
    )
    await holdPlace(sessionId, GRACE)

    const platform = await platformSession(app)
    const response = await roster(platform, fixture.assigned.eventId, sessionId)
    expect(response.statusCode).toBe(200)
    expect((response.json() as { attendees: unknown[] }).attendees).toHaveLength(1)
  })

  it('refuses an UNASSIGNED organizer identically to a conference that does not exist (SC-1018)', async () => {
    const sessionId = await insertOptional(
      fixture.unassigned.eventId,
      fixture.unassigned.trackId,
      fixture.unassigned.roomId,
    )
    await holdPlace(sessionId, GRACE)

    const unassigned = await roster(organizer, fixture.unassigned.eventId, sessionId)
    const nonexistent = await roster(organizer, '00000000-0000-4000-8000-000000000000', sessionId)

    expect(unassigned.statusCode).toBe(404)
    expect(nonexistent.statusCode).toBe(404)
    expect(unassigned.body, 'indistinguishable refusals, byte for byte').toBe(nonexistent.body)
  })

  it('refuses a session of ANOTHER conference addressed through an assigned one (FR-1073a)', async () => {
    // The path names the conference the organizer runs; the session belongs to the one they do
    // not. Without the query re-anchoring on the scope's event, this would be a roster read
    // over any session in the product by guessing a UUID (research R16).
    const strayId = await insertOptional(
      fixture.unassigned.eventId,
      fixture.unassigned.trackId,
      fixture.unassigned.roomId,
    )
    await holdPlace(strayId, GRACE)

    const response = await roster(organizer, fixture.assigned.eventId, strayId)
    expect(response.statusCode).toBe(404)
  })

  it('offers NOTHING equivalent for saves, notes, questions or votes, in any conference (SC-1018)', async () => {
    const sessionId = await insertOptional(
      fixture.assigned.eventId,
      fixture.assigned.trackId,
      fixture.assigned.roomId,
    )

    // The addresses an organizer would try. Every one must not exist — FR-1042 survives
    // unnarrowed for all four engagement kinds, and the widened noun regex in
    // `no-attendee-state-disclosure.test.ts` is what keeps the route table honest over time.
    for (const noun of ['saved', 'notes', 'questions', 'votes', 'attendees']) {
      const response = await app.inject({
        method: 'GET',
        url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}/${noun}`,
        headers: { cookie: organizer },
      })
      expect(response.statusCode, `GET …/sessions/:id/${noun} must not exist`).toBe(404)
    }
  })
})
