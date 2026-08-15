import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { sessions } from '../../src/db/schema/catalog.js'
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
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T044 (014) — **the race FR-1019a exists to close, driven against a real PostgreSQL**
 * (FR-1019a, research R6, US2 acceptance scenario 6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE PROPERTY NO LAYER ABOVE A REAL DATABASE CAN TEST, AND THE TASK LIST NAMES IT
 * AS THE TASK MOST LIKELY TO BE GOT WRONG.**
 *
 * The scenario: an organizer deletes a session the engagement check has just read as empty, and an
 * attendee saves it in the window before the delete commits. Every table holding attendee state
 * about a session cascades from `sessions.id`, so the naive implementation destroys that row —
 * silently, with no error anywhere.
 *
 * `deleteSession` closes it by taking `SELECT … FOR UPDATE` on the **session row**, inside the
 * deleting transaction, **before** the engagement count. `FOR UPDATE` conflicts with the
 * `FOR KEY SHARE` a child insert takes when PostgreSQL validates its foreign key — so the two
 * cannot interleave, in either order.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TEST HOLDS THE *SAVE* OPEN RATHER THAN THE DELETE, AND THAT IS FORCED BY THE DESIGN
 * BEING CORRECT.**
 *
 * The obvious shape is to hold the delete's transaction open and fire a save at it. That would
 * mean calling `deleteSession` directly — which requires a `ConferenceAuthorityScope`, which
 * **nothing outside the guard can mint**. That is the guarantee working, so the test goes the
 * other way: it holds an uncommitted `saved_sessions` insert and fires the delete through the
 * real route.
 *
 * The interleaving is the same one and the assertion is the same one: **in no ordering is a
 * committed row destroyed.** Either the delete waits and then refuses because the save has
 * landed, or the save waits and then fails against a session that is gone.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Serial, and it must stay serial**: it holds a transaction open, and a neighbouring test
 * touching `sessions` in the same window would block on it rather than on anything it asserts.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the delete/engagement race (T044, FR-1019a)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string
  let adaId: string
  let sessionId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    // Nothing cascades to `events`, so a fixture conference left behind blocks the NEXT file's
    // `seed()` — and the symptom lands there rather than here. See `clearAuthoringFixture`.
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title: 'Contended' }),
    })
    sessionId = created.json().id as string

    adaId = (await getDb().select().from(attendees).where(eq(attendees.email, ADA)))[0]
      ?.id as string
  })

  const remove = () =>
    app.inject({
      method: 'DELETE',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}`,
      headers: { cookie },
    })

  /**
   * Starts a request and reports whether it has finished, **without consuming it**.
   *
   * The promise is kept so the assertion can await the *same* request afterwards. Firing a second
   * one instead would be asking a different question: the first would already have completed and
   * deleted the session, so the second would answer 404 and the test would read as a failure of
   * the property rather than of the test.
   */
  const inFlight = <T>(promise: Promise<T>): { done: boolean; promise: Promise<T> } => {
    const state = { done: false, promise }
    void promise.then(
      () => {
        state.done = true
      },
      () => {
        state.done = true
      },
    )
    return state
  }

  const tick = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })

  it('makes the delete WAIT for an in-flight save, then refuse (FR-1019a)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // A `saved_sessions` insert that has not committed. PostgreSQL takes `FOR KEY SHARE` on the
    // parent `sessions` row to validate the foreign key, and holds it until this transaction
    // ends — which is precisely the lock `FOR UPDATE` conflicts with.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    let releaseSave: () => void = () => {}
    const saveHeld = new Promise<void>((resolve) => {
      releaseSave = resolve
    })

    const saving = getDb().transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO saved_sessions (attendee_id, session_id)
        VALUES (${adaId}::uuid, ${sessionId}::uuid)
      `)
      await saveHeld
    })

    // Let the insert reach the database and take its lock before the delete starts.
    await tick(150)

    const deleting = inFlight(remove())
    await tick(300)

    expect(
      deleting.done,
      'The delete completed while an uncommitted save held the parent row. `SELECT … FOR UPDATE` ' +
        'is what makes it wait — `FOR NO KEY UPDATE` would compile, return the same row, and ' +
        'conflict with nothing (research R6). Without the wait, the save commits into a session ' +
        'that is about to be cascaded away and the attendee loses a row they were told was saved.',
    ).toBe(false)

    releaseSave()
    await saving

    const response = await deleting.promise

    expect(
      response.statusCode,
      'Once the save committed, the delete proceeded anyway. The engagement check runs INSIDE ' +
        'the deleting transaction and after the lock, so by the time it reads, the save it was ' +
        'waiting for is visible (FR-1019a).',
    ).toBe(409)

    const survivors = await getDb()
      .select({ sessionId: savedSessions.sessionId })
      .from(savedSessions)
      .where(eq(savedSessions.sessionId, sessionId))

    expect(
      survivors,
      'The attendee’s saved-session row was destroyed. In NO interleaving may a committed row be ' +
        'destroyed — that is the whole of FR-1019a, and the four cascades from `sessions.id` are ' +
        'what make it possible for the database to do it silently.',
    ).toHaveLength(1)
  })

  it('still deletes cleanly when the in-flight save rolls back', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The other half, and the one that stops the fix being "refuse whenever anybody is nearby".
    // A save that never commits is not engagement, so the delete must proceed once the lock is
    // released — an implementation that treated the *lock* as engagement would pass the
    // assertion above and make deletion impossible under any concurrency at all.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    let abortSave: (reason: Error) => void = () => {}
    const saveHeld = new Promise<void>((_, reject) => {
      abortSave = reject
    })

    const saving = getDb()
      .transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO saved_sessions (attendee_id, session_id)
          VALUES (${adaId}::uuid, ${sessionId}::uuid)
        `)
        await saveHeld
      })
      .catch(() => undefined)

    await tick(150)
    const deleting = inFlight(remove())
    await tick(300)
    expect(deleting.done).toBe(false)

    abortSave(new Error('the attendee closed the tab'))
    await saving

    // The SAME request, resumed. It was waiting on the lock, not refused.
    const response = await deleting.promise
    expect(response.statusCode).toBe(204)

    expect(
      await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)),
    ).toEqual([])
  })

  it('leaves the session present when the delete is refused', async () => {
    // The state an organizer is left in, asserted plainly: the session they tried to remove is
    // still there and still theirs to cancel instead.
    await getDb().insert(savedSessions).values({ attendeeId: adaId, sessionId })

    expect((await remove()).statusCode).toBe(409)
    expect(
      await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)),
    ).toHaveLength(1)
  })

  it('serialises a concurrent ENROLMENT against the delete — a place never lands in a deleted session, and a delete never destroys a place placesSeen did not cover (T150, FR-1077b)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The tranche-2 variant of the race above, with the SAVE replaced by an ENROLMENT — the
    // commitment that replaces saving on an optional session (FR-1064). The lock is the same
    // `FOR UPDATE` on the session row (both `deleteSession` and `takePlace` take it, one mode,
    // one lock — `queries/enrolments.ts`'s header), so the two requests cannot interleave: the
    // loser waits and then re-reads a settled world.
    //
    // Driven through both REAL routes concurrently rather than by holding a transaction open,
    // because an enrolment cannot be held mid-flight from outside — `takePlace` owns its
    // transaction end to end. `Promise.all` against a real pool gives the race genuine
    // opportunities to land both ways, and the invariant must hold in whichever order it does
    // (enrolment-capacity.test.ts's own repetition argument):
    //
    //   - delete wins → the enrolment finds no session and is the uniform 404; no row exists.
    //   - enrolment wins → the delete's re-read under the lock sees a place `placesSeen` (the
    //     pre-race count, zero) did not cover, and refuses `places_changed` (FR-1077b); the
    //     place survives.
    //
    // In NO ordering is a place written into a deleted session, and in NO ordering is a
    // committed place destroyed unseen — which is FR-1019a's guarantee extended to the
    // commitment FR-1077b exists to protect.
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

    for (let round = 0; round < 6; round += 1) {
      const created = await app.inject({
        method: 'POST',
        url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
        headers: { cookie },
        payload: sessionBody(fixture.assigned, {
          title: 'Contended Optional',
          kind: 'optional',
          capacity: 2,
          enrolmentClosingOffsetHours: 0,
        } as never),
      })
      expect(created.statusCode, created.body).toBe(201)
      const optionalId = created.json().id as string

      // `placesSeen=0` IS the correct figure for the pre-race count: nobody holds a place when
      // the two requests are fired.
      const [removed, enrolled] = await Promise.all([
        app.inject({
          method: 'DELETE',
          url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${optionalId}?placesSeen=0`,
          headers: { cookie },
        }),
        app.inject({
          method: 'PUT',
          url: `/events/${fixture.assigned.eventId}/agenda/places/${optionalId}`,
          headers: { cookie: grace },
        }),
      ])

      const places = await getDb().execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM session_enrolments WHERE session_id = ${optionalId}::uuid
      `)
      const held = places[0]?.n ?? 0
      const survivors = await getDb()
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, optionalId))

      if (removed.statusCode === 204) {
        // The delete won the lock. The enrolment waited, re-read a world with no session, and
        // was refused with the uniform 404 — never a place written into a session that is gone.
        expect(
          enrolled.statusCode,
          `round ${round}: the delete committed, so the enrolment must have found nothing`,
        ).toBe(404)
        expect(survivors).toHaveLength(0)
        expect(held, `round ${round}: no place may survive a committed delete`).toBe(0)
      } else {
        // The enrolment won the lock. The delete's re-read saw a place its `placesSeen` did
        // not cover and refused — never a committed place destroyed.
        expect(
          removed.statusCode,
          `round ${round}: with a place landed first, the delete must refuse`,
        ).toBe(409)
        const body = removed.json() as { code: string; placesHeld?: number }
        expect(body.code).toBe('places_changed')
        expect(body.placesHeld, 'the refusal re-presents the risen figure').toBe(1)
        expect(enrolled.statusCode).toBe(204)
        expect(survivors).toHaveLength(1)
        expect(held, `round ${round}: the place that refused the delete survives it`).toBe(1)
      }
    }
  })
})
