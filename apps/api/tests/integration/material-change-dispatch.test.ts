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
 * T060 (014) — **the second notification trigger, and the three changes that are it**
 * (FR-1026, FR-1027, SC-1006, constitution v4.2.0 N1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE NEGATIVE CASES ARE THE POINT, BECAUSE THE SET IS ENUMERATED RATHER THAN DESCRIBED.**
 *
 * v3.1.0 admitted exactly one trigger — a received message — and was worded so a second would
 * require an amendment. v4.2.0 is that amendment, and what it granted is **cancelled, start time,
 * room. Nothing else.** The principle that generated the set is *a notification is raised when a
 * change affects **where or whether** the attendee must be somewhere*; a title, a summary, a
 * track or a change of speaker is **content**, and content does not strand anybody in the wrong
 * corridor.
 *
 * A test that only asserted the three positive cases would pass against an implementation that
 * notified on **every** edit — which is the shape v3.1.0's exclusion existed to prevent, and the
 * one an organizer fixing a typo in forty session titles would discover on behalf of everybody.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('what a material change is (T060, FR-1026, FR-1027)', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let fixture: AuthoringFixture
  let cookie: string
  let sessionId: string
  let graceId: string

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

    // Grace is the saver. **Not Ada**, who is the organizer here — FR-1028a excludes the acting
    // principal, and using them as the saver would make every assertion below pass for the wrong
    // reason.
    const db = getDb()
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db.insert(savedSessions).values({ attendeeId: graceId, sessionId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    await registerDevice(app, sessionCookieFrom(signIn) as string, anEndpoint('grace-phone'))
    push.clear()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const edit = (overrides: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: at(`/sessions/${sessionId}`),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, overrides),
    })

  const cancel = () =>
    app.inject({ method: 'POST', url: at(`/sessions/${sessionId}/cancel`), headers: { cookie } })

  it('dispatches on CANCELLATION', async () => {
    expect((await cancel()).statusCode).toBe(200)

    expect(push.delivered()).toHaveLength(1)
    const payload = push.delivered()[0]?.payload
    expect(payload && 'sessionId' in payload ? payload.sessionId : undefined).toBe(sessionId)
    expect(payload?.body).toMatch(/cancelled/i)
  })

  it('dispatches on a START TIME change', async () => {
    const response = await edit({
      startsAt: '2027-03-01T14:00:00.000Z',
      endsAt: '2027-03-01T15:00:00.000Z',
    })
    expect(response.statusCode).toBe(200)

    expect(push.delivered()).toHaveLength(1)
    expect(push.delivered()[0]?.payload.body).toMatch(/time/i)
  })

  it('dispatches on a ROOM change', async () => {
    const room = await app.inject({
      method: 'POST',
      url: at('/rooms'),
      headers: { cookie },
      payload: { name: 'A Different Room' },
    })
    push.clear()

    const response = await edit({ roomId: room.json().id as string })
    expect(response.statusCode).toBe(200)

    expect(push.delivered()).toHaveLength(1)
    expect(push.delivered()[0]?.payload.body).toMatch(/room/i)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE FOUR CHANGES THAT ARE CONTENT, AND MUST REACH NOBODY** (FR-1027, SC-1006).
   *
   * Each is asserted separately rather than in one edit, because an implementation that notified
   * on "anything that is not the three" would pass a combined case while failing one of these —
   * and the one it failed would be the one an organizer does most often, which is fixing a title.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('dispatches NOTHING on a title change (FR-1027)', async () => {
    expect((await edit({ title: 'A Better Title' })).statusCode).toBe(200)
    expect(push.delivered()).toEqual([])
  })

  it('dispatches NOTHING on a summary change (FR-1027)', async () => {
    expect((await edit({ summary: 'Now with a summary.' })).statusCode).toBe(200)
    expect(push.delivered()).toEqual([])
  })

  it('dispatches NOTHING on a track change (FR-1027)', async () => {
    const track = await app.inject({
      method: 'POST',
      url: at('/tracks'),
      headers: { cookie },
      payload: { name: 'Another Track', colorToken: 'track-tech' },
    })
    push.clear()

    expect((await edit({ trackId: track.json().id as string })).statusCode).toBe(200)
    expect(
      push.delivered(),
      'A track change dispatched. A track is how a session is categorised, which is content — it ' +
        'does not strand anybody in the wrong corridor (FR-1027, v4.2.0 N1).',
    ).toEqual([])
  })

  it('dispatches NOTHING on a speaker change (FR-1027)', async () => {
    expect((await edit({ speakerIds: [] })).statusCode).toBe(200)
    expect(push.delivered()).toEqual([])
  })

  it('dispatches NOTHING on an edit that changes nothing at all', async () => {
    // The idempotent case. `materialChangeOf` compares the row before against the row after, so
    // re-submitting the same values must be silent — an organizer opening a form and saving
    // without touching it should not buzz a phone.
    expect((await edit({})).statusCode).toBe(200)
    expect(push.delivered()).toEqual([])
  })

  it('dispatches NOTHING on REINSTATEMENT (FR-1024)', async () => {
    await cancel()
    push.clear()

    const response = await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/reinstate`),
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(
      push.delivered(),
      'Reinstatement dispatched. The notification rule names cancellation and not its reversal: ' +
        'an attendee whose session comes back has lost nothing by not being told, whereas one ' +
        'told it is back may go to a room they had already written off (FR-1024).',
    ).toEqual([])
  })

  it('reports cancellation even when the room moves in the same act', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // Cancellation outranks the other two, and the ordering is a decision rather than an accident
    // of the `if` chain in `materialChangeOf`. An organizer who cancels a session *and* moves it
    // has made one change worth telling anybody about: it is not happening. Reporting "the room
    // moved" there would be true and useless.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const room = await app.inject({
      method: 'POST',
      url: at('/rooms'),
      headers: { cookie },
      payload: { name: 'Somewhere Else' },
    })

    await edit({ roomId: room.json().id as string })
    push.clear()
    await cancel()

    expect(push.delivered()[0]?.payload.body).toMatch(/cancelled/i)
  })
})
