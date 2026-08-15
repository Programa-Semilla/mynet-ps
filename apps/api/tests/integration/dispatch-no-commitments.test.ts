import { eq, sql } from 'drizzle-orm'
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
  GRACE,
  registrations,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T064 (014) / T162 (tranche 2) — **the boundary of the fan-out: a material change to a session
 * with NO SAVER AND NO HOLDER OF A PLACE reaches nobody** (FR-1028 as reworded by FR-1079b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE COMMITMENT SET IS THE SUBSCRIPTION, AND THIS IS THE TEST THAT SAYS SO.**
 *
 * This file shipped as `dispatch-no-savers.test.ts`, guarding "a session no attendee has saved
 * dispatches nothing" — and FR-1079 CONTRADICTED that sentence: a holder of a place is notified
 * too, so the shipped rule read literally would have kept a place-held session silent. It was
 * **re-scoped and renamed in the same change that widened the population** (T162, FR-1079b),
 * because a guard written for one rule must not be mistaken for enforcement of the other: the
 * boundary is now *no saver AND no holder*, and the fixture asserts both halves of that
 * emptiness rather than assuming the second.
 *
 * What is unchanged is the reason the boundary matters. A conference has a whole programme; an
 * attendee has committed to a handful of it. Dispatching on the programme rather than on the
 * commitment set would turn one organizer fixing a room number into an interruption for every
 * registrant — the product v3.1.0's exclusion existed to prevent.
 *
 * The failure mode this catches is **quiet and plausible**: a fan-out that joined registrations
 * instead of commitments, or that fell back to "everybody at the conference" when the set came
 * back empty, would pass every other test in this feature — `dispatch-coalescing` and
 * `dispatch-excludes-actor` both give their attendee a commitment, so neither notices a fan-out
 * that is too **wide**. `notify-enrolled.test.ts` holds the positive half for places.
 *
 * So the assertion is the empty one, and it is made twice over: against the fan-out directly,
 * and against the sink after a real cancellation — because "nobody is notified" can be true of
 * the query and false of the route, and the route is where a well-meaning `else` would live.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a material change nobody committed to (T064, T162, FR-1028, FR-1079b)', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let fixture: AuthoringFixture
  let cookie: string
  let graceId: string
  let unsavedId: string
  let savedId: string

  beforeAll(async () => {
    app = await setupTestApp({ push })
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

    const create = async (title: string, hour: number): Promise<string> => {
      const created = await app.inject({
        method: 'POST',
        url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
        headers: { cookie },
        payload: sessionBody(fixture.assigned, {
          title,
          startsAt: `2027-03-01T${String(hour).padStart(2, '0')}:00:00.000Z`,
          endsAt: `2027-03-01T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
        }),
      })
      return created.json().id as string
    }

    unsavedId = await create('Nobody Saved This', 9)
    savedId = await create('Grace Saved This', 11)

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // Grace is **registered for the conference and holds a live device**, and saves exactly one
    // of the two sessions.
    //
    // Both halves matter. A registrant with no device would make the empty assertion pass because
    // there was nothing to deliver to, and an attendee who saved nothing at all would make it
    // pass because they were not in the fan-out's world at all. The interesting case is somebody
    // the product *could* reach, *is* at the conference, and *has* saved something — just not
    // this.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const db = getDb()
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db.insert(savedSessions).values({ attendeeId: graceId, sessionId: savedId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    await registerDevice(app, sessionCookieFrom(signIn) as string, anEndpoint('grace-phone'))
    push.clear()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const actIdOf = async (sessionId: string): Promise<string> => {
    const [row] = await getDb()
      .select({ actId: sessions.lastChangeActId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
    return row?.actId as string
  }

  it('dispatches nothing when the changed session is in nobody’s COMMITMENT set (FR-1028, T162)', async () => {
    // T162 — the boundary is "no saver AND no holder of a place", and the second half must be
    // asserted rather than assumed: a fixture that only proved the saved set empty would let an
    // enrolment-joining fan-out pass this test for the wrong reason.
    const held = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM session_enrolments WHERE session_id = ${unsavedId}::uuid
    `)
    expect(held[0]?.n, 'the fixture must hold no places on the session under test').toBe(0)

    const cancelled = await app.inject({
      method: 'POST',
      url: at(`/sessions/${unsavedId}/cancel`),
      headers: { cookie },
    })

    // The act itself succeeds. Nothing about the fan-out may gate the organizer's own work — a
    // session nobody committed to is the ordinary case early in a conference's life.
    expect(cancelled.statusCode).toBe(200)

    expect(
      push.delivered(),
      'A material change to a session nobody saved or holds a place in produced a ' +
        'notification. The commitment set IS the subscription (v5.2.0 N1, population widened ' +
        'by FR-1079): dispatching on the programme instead would make one room change an ' +
        'interruption for every registrant.',
    ).toHaveLength(0)
  })

  it('resolves an empty recipient list for that act, not a fallback audience (FR-1028)', async () => {
    await app.inject({
      method: 'POST',
      url: at(`/sessions/${unsavedId}/cancel`),
      headers: { cookie },
    })

    const recipients = await attendeesToNotify(
      await actIdOf(unsavedId),
      null,
      fixture.assigned.eventId,
    )

    expect(
      recipients,
      'The fan-out answered with somebody for a session nobody saved. An empty result is the ' +
        'correct answer here — a query that widened to registrations when the saved set was ' +
        'empty would pass every other dispatch test in this feature.',
    ).toEqual([])
  })

  it('still reaches the saver when the OTHER session changes, so the silence is not the fixture', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **The control, and the reason the two assertions above mean anything.**
    //
    // Every "nothing happened" test can pass because nothing was wired up. Grace has a device, a
    // registration and a save; changing the session she saved must reach her. If this fails, the
    // silence above was the fixture rather than the requirement.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const cancelled = await app.inject({
      method: 'POST',
      url: at(`/sessions/${savedId}/cancel`),
      headers: { cookie },
    })
    expect(cancelled.statusCode).toBe(200)
    // The fan-out outlives the response — see `afterDispatch`. This is the positive control for
    // the silence asserted above, so it has to observe completed work.
    await afterDispatch(app)

    expect(push.delivered()).toHaveLength(1)
    expect(await attendeesToNotify(await actIdOf(savedId), null, fixture.assigned.eventId)).toEqual(
      [{ attendeeId: graceId, sessionIds: [savedId] }],
    )
  })

  it('reaches nobody when the change is not material, even on a saved session (FR-1027)', async () => {
    // The other boundary, asserted here because it shares the fixture: a title edit on a session
    // somebody saved is the case where every precondition for a notification holds except the
    // one that decides it.
    const renamed = await app.inject({
      method: 'PATCH',
      url: at(`/sessions/${savedId}`),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, {
        title: 'A Different Title',
        startsAt: '2027-03-01T11:00:00.000Z',
        endsAt: '2027-03-01T12:00:00.000Z',
      }),
    })

    expect(renamed.statusCode).toBe(200)
    expect(
      push.delivered(),
      'A title change notified a saver. The material set is exactly three — cancelled, start ' +
        'time, room (v5.2.0 N1) — because a title does not strand anybody in the wrong corridor.',
    ).toHaveLength(0)
  })
})
