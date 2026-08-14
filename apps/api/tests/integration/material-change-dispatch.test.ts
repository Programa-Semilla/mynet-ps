import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
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
  let graceCookie: string

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
    // Held rather than discarded: the marker assertions below read Grace's own agenda, and
    // signing her in a second time inside a nested `beforeEach` does not produce a usable
    // session — one sign-in per attendee per test is the shape the rest of this suite uses.
    graceCookie = sessionCookieFrom(signIn) as string
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))
    push.clear()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  // Both helpers drain the fan-out before returning. It outlives the response deliberately —
  // `afterDispatch` records why — so asserting on the sink straight after `inject` would be a
  // race rather than an assertion, and a flaky pass is worse than a failure.
  const edit = async (overrides: Record<string, unknown>) => {
    const response = await app.inject({
      method: 'PATCH',
      url: at(`/sessions/${sessionId}`),
      headers: { cookie },
      payload: sessionBody(fixture.assigned, overrides),
    })
    await afterDispatch(app)
    return response
  }

  const cancel = async () => {
    const response = await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/cancel`),
      headers: { cookie },
    })
    await afterDispatch(app)
    return response
  }

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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T-review (014) — THE MARKER, ASSERTED IN THE POSITIVE. NOTHING DID.**
   *
   * A deep review found that **no test anywhere observed `changedSinceViewed: true`.** The only
   * two assertions in the repository were `false`, and `POST …/viewed` was exercised once, for
   * its status code alone. So the marker's entire read-side mechanism —
   * `coalesce(logistics_changed_at > viewed_at, false)` — and `markSessionViewed`'s clearing
   * effect were pinned only by their own absence.
   *
   * Everything that could go wrong stayed green under that: an inverted comparison, a `coalesce`
   * swallowing a correct result, an `UPDATE` whose `WHERE` matched no row. FR-1030 and US3
   * scenario 2 had **no positive server-side assertion at all**, and the marker is the half of
   * this feature an attendee who denied notification permission is left with — FR-1032 makes it
   * the complete outcome rather than a degraded one, so it is the half that must not be broken
   * silently.
   *
   * Read as **Grace**, who saved the session, rather than as the acting organizer: FR-1028a
   * stamps the actor's own row viewed in the same transaction, so asserting as Ada would assert
   * the exclusion and call it the marker.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('the in-app marker, in the positive (FR-1030, FR-1032, US3)', () => {
    const savedOf = async (): Promise<{ sessionId: string; changedSinceViewed: boolean }[]> => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${fixture.assigned.eventId}/agenda/saved`,
        headers: { cookie: `mynet_session=${graceCookie}` },
      })
      expect(response.statusCode).toBe(200)
      return response.json().sessions as { sessionId: string; changedSinceViewed: boolean }[]
    }

    const markerOf = async (): Promise<boolean | undefined> =>
      (await savedOf()).find((one) => one.sessionId === sessionId)?.changedSinceViewed

    it('is false before anything has changed', async () => {
      // The baseline the positive cases are measured against. `viewed_at` defaults to the save
      // instant precisely so a freshly saved session carries no marker — there is no `created_at`
      // to compare against, which is why the default is what it is.
      expect(await markerOf()).toBe(false)
    })

    it('SETS on a cancellation', async () => {
      await cancel()
      expect(
        await markerOf(),
        'The marker did not appear after a cancellation. This is the surface an attendee who ' +
          'denied notification permission is left with (FR-1032), so it failing silently means ' +
          'they learn nothing at all.',
      ).toBe(true)
    })

    it('SETS on a start-time change', async () => {
      await edit({
        startsAt: '2027-03-01T14:00:00.000Z',
        endsAt: '2027-03-01T15:00:00.000Z',
      })
      expect(await markerOf()).toBe(true)
    })

    it('SETS on a room change', async () => {
      const room = await app.inject({
        method: 'POST',
        url: at('/rooms'),
        headers: { cookie },
        payload: { name: 'Yet Another Room' },
      })

      await edit({ roomId: room.json().id as string })
      expect(await markerOf()).toBe(true)
    })

    it('stays false for a content edit (FR-1027)', async () => {
      // The mirror of the dispatch cases above, and it has to be here as well as there: the
      // marker and the notification are two mechanisms over one predicate, and a title edit
      // setting the marker would put a "Changed" chip on a row nothing changed about.
      await edit({ title: 'A Retitled Session' })
      expect(await markerOf()).toBe(false)
    })

    it('CLEARS when the attendee views the session, and stays cleared', async () => {
      await cancel()
      expect(await markerOf()).toBe(true)

      const viewed = await app.inject({
        method: 'POST',
        url: `/events/${fixture.assigned.eventId}/agenda/saved/${sessionId}/viewed`,
        headers: { cookie: `mynet_session=${graceCookie}` },
      })
      expect(viewed.statusCode).toBe(204)

      expect(
        await markerOf(),
        'Viewing the session did not clear the marker. `markSessionViewed` writes `viewed_at`, ' +
          'and an UPDATE whose WHERE matches no row returns success while changing nothing — ' +
          'which is indistinguishable from working until somebody asserts this.',
      ).toBe(false)

      // Cleared by an act, never by time passing: a second read must not resurrect it.
      expect(await markerOf()).toBe(false)
    })

    it('RE-SETS on a second change after being cleared', async () => {
      // The property a one-shot flag would fail. `viewed_at` is a timestamp rather than a boolean
      // precisely so a later change is newer than the last look, and an implementation that
      // cleared a flag permanently would pass every case above.
      await cancel()
      await app.inject({
        method: 'POST',
        url: `/events/${fixture.assigned.eventId}/agenda/saved/${sessionId}/viewed`,
        headers: { cookie: `mynet_session=${graceCookie}` },
      })
      expect(await markerOf()).toBe(false)

      const reinstated = await app.inject({
        method: 'POST',
        url: at(`/sessions/${sessionId}/reinstate`),
        headers: { cookie },
      })
      expect(reinstated.statusCode).toBe(200)
      await afterDispatch(app)

      const room = await app.inject({
        method: 'POST',
        url: at('/rooms'),
        headers: { cookie },
        payload: { name: 'A Later Room' },
      })
      await edit({ roomId: room.json().id as string })

      expect(await markerOf()).toBe(true)
    })

    it('marks only the attendee who saved it, and only the session that changed', async () => {
      // Two isolations in one: the marker is per-row state about one saved session, so a second
      // saved session must not inherit it — and it is per attendee, which is what stops it ever
      // being a product-wide "something changed" signal (FR-1031, v4.2.0 N2).
      const other = await app.inject({
        method: 'POST',
        url: at('/sessions'),
        headers: { cookie },
        payload: sessionBody(fixture.assigned, { title: 'An Unaffected Session' }),
      })
      const otherId = other.json().id as string
      await getDb().insert(savedSessions).values({ attendeeId: graceId, sessionId: otherId })

      await cancel()

      const rows = await savedOf()
      expect(rows.find((one) => one.sessionId === sessionId)?.changedSinceViewed).toBe(true)
      expect(
        rows.find((one) => one.sessionId === otherId)?.changedSinceViewed,
        'A session nothing happened to carries a marker. The marker is per-row state about one ' +
          'saved session; a second row inheriting it is the first step towards it meaning ' +
          '"something changed somewhere", which is the inbox v4.2.0 N2 forbids.',
      ).toBe(false)
    })
  })
})
