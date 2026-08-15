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
 * T130, T131 (014 tranche 2) — **the five refusals the enrolment row introduces are MUTUALLY
 * different, and already-enrolled resolves before full** (FR-1069, FR-1069a, SC-1015,
 * research R12).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE MUTUAL-DIFFERENCE ASSERTION IS THE POINT, NOT A NICETY.** This feature's own recorded
 * lesson (tranche 1, deviations D10): six carefully-written refusals rendered as two sentences,
 * because four distinct 409s shared one code — and a test checking that each code maps to *a*
 * message passed, because every one of them did. The property `instanceof` classification and
 * shared codes both destroy is that the outcomes differ **from each other**, so that is what is
 * asserted: pairwise, codes and messages both.
 *
 * "This session is full" and "enrolment has closed" are different facts about the reader's own
 * action and lead to different next steps (SC-1015: tellable apart from the message alone, no
 * second request, no guessing).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('enrolment refusals (T130, T131, FR-1069, FR-1069a)', () => {
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

  const insertSession = async (values: {
    kind: 'mandatory' | 'optional'
    capacity?: number
    offsetHours?: number
    startsAt?: string
  }): Promise<string> => {
    const rows = await getDb().execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                            capacity, enrolment_closing_offset_hours)
      VALUES (${fixture.assigned.eventId}::uuid, ${fixture.assigned.trackId}::uuid,
              ${fixture.assigned.roomId}::uuid, 'Refusal Subject',
              ${values.startsAt ?? '2027-03-01T09:00:00Z'}::timestamptz,
              (${values.startsAt ?? '2027-03-01T09:00:00Z'}::timestamptz + interval '1 hour'),
              ${values.kind}, ${values.capacity ?? null}, ${values.offsetHours ?? null})
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

  const fillWith = async (sessionId: string, email: string): Promise<void> => {
    const db = getDb()
    const id = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, email))
    )[0]?.id as string
    await db.execute(sql`
      INSERT INTO session_enrolments (attendee_id, session_id)
      VALUES (${id}::uuid, ${sessionId}::uuid)
    `)
  }

  it('answers the five refusals with five MUTUALLY different codes and messages (FR-1069a)', async () => {
    // Full: capacity 1, taken by somebody else.
    const full = await insertSession({ kind: 'optional', capacity: 1, offsetHours: 0 })
    await fillWith(full, ADA)

    // Closed: a 24-hour offset against a start twelve hours away — the deadline passed twelve
    // hours ago, derived from the database clock at the moment of the request (FR-1071).
    const closed = await getDb().execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, track_id, room_id, title, starts_at, ends_at, kind,
                            capacity, enrolment_closing_offset_hours)
      VALUES (${fixture.assigned.eventId}::uuid, ${fixture.assigned.trackId}::uuid,
              ${fixture.assigned.roomId}::uuid, 'Closed Subject',
              now() + interval '12 hours', now() + interval '13 hours',
              'optional', 5, 24)
      RETURNING id
    `)
    const closedId = closed[0]?.id as string

    // Already enrolled: an open session Grace holds a place in.
    const held = await insertSession({ kind: 'optional', capacity: 5, offsetHours: 0 })
    await fillWith(held, GRACE)

    // Not optional: a mandatory session has no places to take — saving is its commitment.
    const mandatory = await insertSession({ kind: 'mandatory' })

    // Not saveable: the fifth refusal the enrolment row introduces, and it lives on the SAVE
    // route rather than the enrol route (FR-1064) — an optional session takes enrolment, so a
    // bookmark on it is refused. It is in this matrix because FR-1069a covers EVERY refusal
    // the row introduces, wherever it is answered from.
    const optional = await insertSession({ kind: 'optional', capacity: 5, offsetHours: 0 })
    const save = (sessionId: string) =>
      app.inject({
        method: 'PUT',
        url: `/events/${fixture.assigned.eventId}/agenda/saved/${sessionId}`,
        headers: { cookie: grace },
      })

    const outcomes = await Promise.all([
      enrol(full),
      enrol(closedId),
      enrol(held),
      enrol(mandatory),
      save(optional),
    ])

    const bodies = outcomes.map((r) => r.json() as { code: string; message: string })
    for (const outcome of outcomes) expect(outcome.statusCode).toBe(409)

    expect(bodies.map((b) => b.code).sort()).toEqual([
      'already_enrolled',
      'enrolment_closed',
      'not_optional',
      'not_saveable',
      'session_full',
    ])

    // The mutual-difference property itself: no two of the five share a code OR a sentence. A
    // per-code check would pass while checking nothing if two codes carried one message.
    //
    // `not_saveable` is `not_optional`'s semantic near-twin, and keeping them apart is what
    // this matrix exists for: each says "you used the wrong commitment for this session's
    // kind", from opposite ends of the same axis — a shared code or sentence would send the
    // attendee in exactly the wrong direction, telling a bookmark-shaped retry to enrol or an
    // enrolment-shaped retry to save.
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        expect(bodies[i]?.code).not.toBe(bodies[j]?.code)
        expect(bodies[i]?.message).not.toBe(bodies[j]?.message)
      }
    }
  })

  it('resolves already-enrolled BEFORE full (T131, R12)', async () => {
    // Grace holds one of the two places and the session is full. A double-tap must be told
    // about the place she already holds, not about a fullness that does not apply to her.
    const sessionId = await insertSession({ kind: 'optional', capacity: 2, offsetHours: 0 })
    await fillWith(sessionId, GRACE)
    await fillWith(sessionId, ADA)

    const response = await enrol(sessionId)
    expect(response.statusCode).toBe(409)
    expect((response.json() as { code: string }).code).toBe('already_enrolled')
  })

  it('keeps a held place usable after enrolment closes, and releases stay available (FR-1071b)', async () => {
    const sessionId = await insertSession({ kind: 'optional', capacity: 2, offsetHours: 0 })
    await fillWith(sessionId, GRACE)

    // Close enrolment by moving the deadline into the past: the offset now exceeds the lead
    // time. The deadline governs TAKING a place, not holding one.
    await getDb().execute(sql`
      UPDATE sessions SET starts_at = now() + interval '1 hour',
                          ends_at = now() + interval '2 hours',
                          enrolment_closing_offset_hours = 24
      WHERE id = ${sessionId}::uuid
    `)

    const release = await app.inject({
      method: 'DELETE',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${sessionId}`,
      headers: { cookie: grace },
    })
    expect(release.statusCode, 'withdrawal remains available after closing').toBe(204)

    // A place released after closing must NOT become takeable — the honest state, rather than a
    // place quietly reserved for nobody (spec edge case).
    const retake = await enrol(sessionId)
    expect(retake.statusCode).toBe(409)
    expect((retake.json() as { code: string }).code).toBe('enrolment_closed')
  })

  it('refuses SAVING an optional session, so the saved-but-no-place state has no route (FR-1064)', async () => {
    const sessionId = await insertSession({ kind: 'optional', capacity: 5, offsetHours: 0 })

    const save = await app.inject({
      method: 'PUT',
      url: `/events/${fixture.assigned.eventId}/agenda/saved/${sessionId}`,
      headers: { cookie: grace },
    })

    // An explained refusal rather than the uniform 404: the session exists and the reader may
    // see it — what is refused is the ACT, and the wording must present FR-1064a's cost (there
    // is no bookmark without a commitment) rather than pretend the session is not there.
    expect(save.statusCode).toBe(409)
    expect((save.json() as { code: string }).code).toBe('not_saveable')

    const rows = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM saved_sessions WHERE session_id = ${sessionId}::uuid
    `)
    expect(rows[0]?.n, 'no saved row exists for an optional session').toBe(0)
  })

  it('reports remaining places live, and refuses the read for a mandatory session (FR-1070)', async () => {
    const sessionId = await insertSession({ kind: 'optional', capacity: 3, offsetHours: 0 })
    await fillWith(sessionId, ADA)

    const places = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions/${sessionId}/places`,
      headers: { cookie: grace },
    })
    expect(places.statusCode).toBe(200)
    expect(places.json()).toEqual({ remaining: 2, open: true })

    const mandatory = await insertSession({ kind: 'mandatory' })
    const refused = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions/${mandatory}/places`,
      headers: { cookie: grace },
    })
    // A mandatory session has no places, and the uniform refusal discloses nothing about why.
    expect(refused.statusCode).toBe(404)
  })
})
