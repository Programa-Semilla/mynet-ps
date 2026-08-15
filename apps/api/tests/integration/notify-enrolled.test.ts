import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { attendeesToNotify } from '../../src/db/queries/session-changes.js'
import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice } from '../support/push.js'
import {
  afterDispatch,
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
 * T154, T155, T156, T163 (014 tranche 2) — **a held place is notified and marked on exactly the
 * same terms as a save** (FR-1079, FR-1079a, FR-1080, SC-1016, SC-1016a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ATTENDEE UNDER TEST HOLDS NO SAVED ROW, AND THAT ABSENCE IS THE TEST.** Enrolment
 * REPLACES saving on an optional session (FR-1064), so before T159's union a place-holder was
 * the only person in the conference told nothing when the room changed — the stranding the
 * trigger exists to prevent, reintroduced by the feature that strengthened the commitment. Each
 * assertion here therefore verifies the fixture's negative space first: Grace's saved set is
 * EMPTY, and what reaches her reaches her through the enrolment branch alone.
 *
 * **The union widens the POPULATION, never the trigger SET** (FR-1079a): still two triggers,
 * still exactly three material changes, and a capacity or closing-offset change — the two new
 * session facts this tranche adds — dispatches nothing, because neither changes where or
 * whether the attendee must be somewhere. `trigger-set-pinned.test.ts` holds that over the
 * source; this file holds it over a real database and a real sink.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('notifying holders of places (T154, FR-1079, SC-1016)', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let fixture: AuthoringFixture
  let cookie: string
  let grace: string
  let graceId: string
  let optionalId: string

  beforeAll(async () => {
    app = await setupTestApp({ push })
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
    push.clear()

    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'A Bounded Workshop',
        kind: 'optional',
        capacity: 10,
        enrolmentClosingOffsetHours: 0,
      } as never),
    })
    expect(created.statusCode, created.body).toBe(201)
    optionalId = created.json().id as string

    const db = getDb()
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    grace = sessionCookieFrom(signIn) as string
    await registerDevice(app, grace, anEndpoint('grace-phone'))

    // Grace takes her place THROUGH THE ROUTE — the enrolment this file is about is the real
    // one, not a fixture row — and holds NO saved session anywhere (asserted per test).
    const enrolled = await app.inject({
      method: 'PUT',
      url: `/events/${fixture.assigned.eventId}/agenda/places/${optionalId}`,
      headers: { cookie: cookieHeader(grace) },
    })
    expect(enrolled.statusCode).toBe(204)

    push.clear()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const savedRowsFor = async (attendeeId: string): Promise<number> => {
    const rows = await getDb()
      .select({ sessionId: savedSessions.sessionId })
      .from(savedSessions)
      .where(eq(savedSessions.attendeeId, attendeeId))
    return rows.length
  }

  const actIdOf = async (sessionId: string): Promise<string> => {
    const [row] = await getDb()
      .select({ actId: sessions.lastChangeActId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
    return row?.actId as string
  }

  it('reaches a place-holder with NO saved row when the room changes (FR-1079, SC-1016)', async () => {
    expect(await savedRowsFor(graceId), 'the fixture must hold no saved row').toBe(0)

    const [room] = await getDb().execute<{ id: string }>(sql`
      INSERT INTO rooms (event_id, name)
      VALUES (${fixture.assigned.eventId}::uuid, 'The Other Room') RETURNING id
    `)

    const moved = await app.inject({
      method: 'PATCH',
      url: at(`/sessions/${optionalId}`),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'A Bounded Workshop',
        roomId: room?.id as string,
        kind: 'optional',
        capacity: 10,
        enrolmentClosingOffsetHours: 0,
      } as never),
    })
    expect(moved.statusCode, moved.body).toBe(200)
    await afterDispatch(app)

    expect(
      push.delivered(),
      'A room change did not reach the attendee holding a place. Enrolment replaces saving ' +
        '(FR-1064), so without the enrolment branch of the fan-out a place-holder is the only ' +
        'person told nothing — the stranding the trigger exists to prevent (FR-1079).',
    ).toHaveLength(1)

    expect(
      await attendeesToNotify(await actIdOf(optionalId), null, fixture.assigned.eventId),
    ).toEqual([{ attendeeId: graceId, sessionIds: [optionalId] }])
  })

  it('reaches a place-holder when the session is cancelled, and marks the row (FR-1079, FR-1080)', async () => {
    const cancelled = await app.inject({
      method: 'POST',
      url: at(`/sessions/${optionalId}/cancel`),
      headers: { cookie },
    })
    expect(cancelled.statusCode).toBe(200)
    await afterDispatch(app)

    expect(push.delivered()).toHaveLength(1)

    // The per-row marker travels on the commitment set exactly as it does for a save: the row
    // is a `place`, it is changed-since-viewed, and viewing the session clears it through the
    // shipped viewed route stamping WHICHEVER commitment exists (FR-1080, T163).
    const before = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/agenda/saved`,
      headers: { cookie: cookieHeader(grace) },
    })
    expect(before.json()).toEqual({
      sessions: [{ sessionId: optionalId, changedSinceViewed: true, commitment: 'place' }],
    })

    const viewed = await app.inject({
      method: 'POST',
      url: `/events/${fixture.assigned.eventId}/agenda/saved/${optionalId}/viewed`,
      headers: { cookie: cookieHeader(grace) },
    })
    expect(viewed.statusCode).toBe(204)

    const after = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/agenda/saved`,
      headers: { cookie: cookieHeader(grace) },
    })
    expect(after.json()).toEqual({
      sessions: [{ sessionId: optionalId, changedSinceViewed: false, commitment: 'place' }],
    })
  })

  it('reaches a place-holder when the start time changes (FR-1079)', async () => {
    const moved = await app.inject({
      method: 'PATCH',
      url: at(`/sessions/${optionalId}`),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'A Bounded Workshop',
        startsAt: '2027-03-02T09:00:00.000Z',
        endsAt: '2027-03-02T10:00:00.000Z',
        kind: 'optional',
        capacity: 10,
        enrolmentClosingOffsetHours: 0,
      } as never),
    })
    expect(moved.statusCode, moved.body).toBe(200)
    await afterDispatch(app)

    expect(push.delivered()).toHaveLength(1)
  })

  it('coalesces the MIXED attendee — one save, one place, one act — into ONE entry (SC-1016a)', async () => {
    // A second, mandatory session that Grace SAVES, beside the place she holds.
    const created = await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'A Mandatory Talk',
        startsAt: '2027-03-01T13:00:00.000Z',
        endsAt: '2027-03-01T14:00:00.000Z',
      }),
    })
    const mandatoryId = created.json().id as string
    await getDb().insert(savedSessions).values({ attendeeId: graceId, sessionId: mandatoryId })

    // One act touching both sessions — the state a bulk edit would leave, simulated the way
    // `dispatch-coalescing.test.ts` already does: cancel one for a real act id, then stamp the
    // other with the same id.
    const cancelled = await app.inject({
      method: 'POST',
      url: at(`/sessions/${optionalId}/cancel`),
      headers: { cookie },
    })
    expect(cancelled.statusCode).toBe(200)
    const actId = await actIdOf(optionalId)
    await getDb()
      .update(sessions)
      .set({ lastChangeActId: actId, logisticsChangedAt: new Date() })
      .where(eq(sessions.id, mandatoryId))

    // ONE entry, sessions = the save PLUS the place — the arithmetic no single-commitment test
    // can get wrong, which is exactly why SC-1016a names the mixed case.
    expect(await attendeesToNotify(actId, null, fixture.assigned.eventId)).toEqual([
      { attendeeId: graceId, sessionIds: [mandatoryId, optionalId].sort() },
    ])
  })

  it('dispatches NOTHING for a capacity or closing-offset change (T156, FR-1079a)', async () => {
    const patch = (capacity: number, offset: number) =>
      app.inject({
        method: 'PATCH',
        url: at(`/sessions/${optionalId}`),
        headers: { cookie },
        payload: sessionBody(fixture.assigned, {
          title: 'A Bounded Workshop',
          kind: 'optional',
          capacity,
          enrolmentClosingOffsetHours: offset,
        } as never),
      })

    expect((await patch(20, 0)).statusCode).toBe(200)
    expect((await patch(20, 24)).statusCode).toBe(200)
    await afterDispatch(app)

    expect(
      push.delivered(),
      'A capacity or closing-offset change dispatched. Neither changes where or whether the ' +
        'attendee must be somewhere: the material set is still exactly three (FR-1079a), and ' +
        'widening the notified population is not a licence to widen it.',
    ).toHaveLength(0)
  })

  it('dispatches NOTHING for an access-link change (T156, FR-1058, FR-1099c)', async () => {
    // The conference must be hybrid for a session to carry a link at all (FR-1050a), and the
    // fixture conference ships in-person — the modality walk is the FR-1059a route.
    await getDb().execute(sql`
      UPDATE events SET modality = 'hybrid' WHERE id = ${fixture.assigned.eventId}::uuid
    `)

    const withLink = (link: string) =>
      app.inject({
        method: 'PATCH',
        url: at(`/sessions/${optionalId}`),
        headers: { cookie },
        payload: sessionBody(fixture.assigned, {
          title: 'A Bounded Workshop',
          kind: 'optional',
          capacity: 10,
          enrolmentClosingOffsetHours: 0,
          accessLink: link,
        } as never),
      })

    const added = await withLink('https://meet.example/workshop')
    expect(added.statusCode, added.body).toBe(200)
    const corrected = await withLink('https://meet.example/workshop-corrected')
    expect(corrected.statusCode, corrected.body).toBe(200)
    await afterDispatch(app)

    expect(
      push.delivered(),
      'An access-link change dispatched. Unlike a room, a link is not somewhere an attendee ' +
        'travels to in advance — a corrected link is correct at the moment they open the ' +
        'session (FR-1058), and a fourth material change needs another amendment.',
    ).toHaveLength(0)
  })

  it('dispatches NOTHING when the session holding her place is DELETED (SC-1025)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The silence is RATIFIED, not overlooked, and this asserts it at the sink — SC-1025's
    // observable half. Grace holds a place and a registered device; the organizer deletes the
    // session with the correct figure, so the delete proceeds, the cascade destroys her place —
    // and she is told nothing, because a deletion is not one of the three material changes and
    // enrolling REPLACED saving (FR-1064), so no saved row survives for a marker to ride on.
    // v5.3.0 O2 ratifies exactly this cost, register entry 31 holds the question of whether it
    // should stay this way, and the remedy would be a THIRD trigger — another amendment. Until
    // then a dispatch here would be the defect: a trigger nobody ratified.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const removed = await app.inject({
      method: 'DELETE',
      url: at(`/sessions/${optionalId}?placesSeen=1`),
      headers: { cookie },
    })
    expect(removed.statusCode, removed.body).toBe(204)
    await afterDispatch(app)

    expect(
      push.delivered(),
      'Deleting a session dispatched a notification. The trigger set is two, the material set ' +
        'is exactly three named changes, and a deletion is in neither — notifying the enrolled ' +
        'on deletion is register entry 31, open, and needs its own amendment (SC-1025).',
    ).toHaveLength(0)
  })
})
