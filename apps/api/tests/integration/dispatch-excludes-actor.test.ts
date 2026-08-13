import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice } from '../support/push.js'
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
  GRACE,
  registrations,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T063 (014) — **an organizer is not notified of their own act** (FR-1028a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A CONFERENCE ORGANIZER IS AN ORDINARY ATTENDEE, WHICH IS WHY THIS CASE EXISTS AT ALL.**
 *
 * 013's tier model has no separate people table: an organizer is an attendee holding a live
 * assignment, with the same account and the same MyNet experience (FR-904). So an organizer who
 * is registered for their own conference and has **saved the session they are about to cancel**
 * is not an exotic fixture — it is the ordinary case for somebody running an event they also
 * attend.
 *
 * They already know. Being buzzed by your own edit is the kind of thing that makes people turn
 * notifications off, and the exclusion is done in the fan-out query rather than filtered at the
 * dispatch — which is what keeps the **marker** consistent with the notification: neither appears.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the acting principal is not notified (T063, FR-1028a)', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let fixture: AuthoringFixture
  let cookie: string
  let sessionId: string
  let adaCookie: string

  beforeAll(async () => {
    app = await setupTestApp({ push })
  })

  afterAll(async () => {
    await clearAuthoringFixture()
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    push.clear()

    fixture = await buildAuthoringFixture(ADA)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })
    sessionId = created.json().id as string

    // Ada is the organizer AND saves the session — the fixture registers them for the conference
    // they run, which is what makes this reachable.
    await getDb().insert(savedSessions).values({ attendeeId: fixture.organizerId, sessionId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    adaCookie = sessionCookieFrom(signIn) as string
    await registerDevice(app, adaCookie, anEndpoint('ada-phone'))
    push.clear()
  })

  const cancel = () =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}/cancel`,
      headers: { cookie },
    })

  it('delivers nothing to the organizer who cancelled it', async () => {
    expect((await cancel()).statusCode).toBe(200)

    expect(
      push.delivered(),
      'The organizer was notified of their own cancellation. They performed it — the ' +
        'notification tells them nothing and teaches them to ignore the next one (FR-1028a).',
    ).toEqual([])
  })

  it('still delivers to everybody ELSE who saved it', async () => {
    // The other half, and it is what stops the exclusion being implemented as "dispatch nothing
    // when the actor saved it". Grace saved the same session and is owed the notification.
    const db = getDb()
    const graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]
      ?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db.insert(savedSessions).values({ attendeeId: graceId, sessionId })

    const graceSignIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    await registerDevice(app, sessionCookieFrom(graceSignIn) as string, anEndpoint('grace-phone'))
    push.clear()

    await cancel()

    expect(push.delivered()).toHaveLength(1)
    expect(push.delivered()[0]?.endpoint).toMatch(/grace-phone/)
  })

  it('leaves the organizer no MARKER either, which is the same exclusion', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The marker and the notification must agree. An organizer who was deliberately not
    // interrupted and then finds a "Changed" chip on their own Agenda row has been told twice
    // that something happened, once uselessly — and the second time by a surface they cannot
    // dismiss.
    //
    // The `viewed_at` stamp is what delivers this: the act sets `logistics_changed_at`, and the
    // actor's own row is left alone only if something updates it. Asserted through the ordinary
    // attendee read, which is where an organizer would see it.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    await cancel()

    const saved = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/agenda/saved`,
      headers: { cookie: `mynet_session=${adaCookie}` },
    })

    const entry = (
      saved.json().sessions as { sessionId: string; changedSinceViewed: boolean }[]
    ).find((row) => row.sessionId === sessionId)

    expect(entry).toBeDefined()
    expect(
      entry?.changedSinceViewed,
      'The organizer sees a change marker on the session they just cancelled. The marker and the ' +
        'notification must agree — being told twice, once uselessly, is worse than either.',
    ).toBe(false)
  })
})
