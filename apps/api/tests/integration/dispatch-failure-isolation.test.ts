import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { sessions } from '../../src/db/schema/catalog.js'
import type {
  PushPayload,
  PushResult,
  PushService,
  StoredSubscription,
} from '../../src/notifications/service.js'
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
 * T065 (014) — **a failed notification must not undo the act it was about to announce** (007's
 * precedent, FR-1037).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ORDERING IS THE REQUIREMENT: ACT AND AUDIT COMMIT, *THEN* DISPATCH.**
 *
 * FR-1037 binds an administrative act and its audit entry into one transaction, and 013 shipped
 * the defect that rule exists to prevent — `appendAuditEntry` took an executor from the start and
 * no caller passed one, so a failing entry left the act committed and unrecorded. 014 adds a
 * whole new category of audited act and a **notification** on top of it, which introduces the
 * mirror-image mistake: putting the dispatch *inside* the transaction.
 *
 * That version is easy to argue for — "either everybody hears about the cancellation or it did
 * not happen" — and it is wrong twice over:
 *
 *   1. **A push service is an HTTP call to somebody else's server.** Holding a transaction open
 *      across a fan-out to N attendees puts an external timeout on a row lock, and the common
 *      failure of a push endpoint is a hang rather than a refusal.
 *   2. **It makes an organizer's authority depend on a third party's uptime.** A cancelled
 *      session that rolls back because Mozilla's push endpoint was slow leaves attendees walking
 *      to a room for a session the organizer believes they cancelled — the exact harm the
 *      notification exists to prevent, caused by the notification.
 *
 * So the guarantee is deliberately one-directional: **the act survives a failed dispatch, and a
 * failed dispatch is not retried into one.** An attendee who misses the push still sees the
 * cancellation on the row and in the panel (FR-1022) and still carries the marker (FR-1030) —
 * which is why losing the interruption is survivable and losing the act is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** A push service that fails every delivery, in the shape the port requires. */
class FailingPushService implements PushService {
  attempts = 0

  /**
   * Returns `'failed'` rather than throwing, because that is the contract: `PushService.send`
   * **must not throw** for a delivery failure, so that one device's problem cannot abandon the
   * fan-out to the rest. A double that threw here would be testing a case the port forbids.
   */
  async send(_subscription: StoredSubscription, _payload: PushPayload): Promise<PushResult> {
    this.attempts += 1
    return 'failed'
  }
}

/** A push service that throws — the case the port forbids, kept honest by the route. */
class ThrowingPushService implements PushService {
  attempts = 0

  async send(_subscription: StoredSubscription, _payload: PushPayload): Promise<PushResult> {
    this.attempts += 1
    throw new Error('the push endpoint hung up')
  }
}

describe('a failing dispatch leaves the act committed (T065, FR-1037)', () => {
  let app: FastifyInstance
  let push: FailingPushService

  let fixture: AuthoringFixture
  let cookie: string
  let sessionId: string

  const setup = async (service: PushService): Promise<void> => {
    if (app) await teardown(app)
    app = await setupTestApp({ push: service })
  }

  beforeAll(async () => {
    push = new FailingPushService()
    await setup(push)
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    push.attempts = 0

    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title: 'The Session That Moves' }),
    })
    sessionId = created.json().id as string

    // Grace saves it and holds a device, so there is genuinely something to fail at delivering.
    const db = getDb()
    const graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]
      ?.id as string
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
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const cancelledAtOf = async (id: string): Promise<Date | null> => {
    const [row] = await getDb()
      .select({ cancelledAt: sessions.cancelledAt })
      .from(sessions)
      .where(eq(sessions.id, id))
    return row?.cancelledAt ?? null
  }

  it('answers the organizer with success when every delivery fails', async () => {
    const response = await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/cancel`),
      headers: { cookie },
    })
    // The fan-out outlives the response — see `afterDispatch`. `push.attempts` below is a claim
    // about work that has finished, and this is what makes it one.
    await afterDispatch(app)

    expect(
      response.statusCode,
      'A failed push failed the act. An organizer’s cancellation must not depend on a push ' +
        'service being reachable — the attendee still sees the cancellation on the row and in ' +
        'the panel (FR-1022), which is why losing the interruption is survivable.',
    ).toBe(200)

    // The delivery was genuinely attempted, so the success above is not "nothing happened".
    expect(push.attempts).toBeGreaterThan(0)
  })

  it('leaves the cancellation stored (FR-1020)', async () => {
    await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/cancel`),
      headers: { cookie },
    })

    expect(
      await cancelledAtOf(sessionId),
      'The session is not cancelled after a failed dispatch. The act commits before the ' +
        'notification is attempted; a rollback here would mean attendees walk to a room for a ' +
        'session the organizer believes they cancelled.',
    ).not.toBeNull()
  })

  it('leaves the audit entry committed alongside it (FR-1037, FR-1038)', async () => {
    await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/cancel`),
      headers: { cookie },
    })

    const entries = await getDb().select().from(adminAuditEntries)

    expect(
      entries.length,
      'The act committed with no audit entry after a failed dispatch. FR-1037 binds the act and ' +
        'its entry into ONE transaction and the dispatch is OUTSIDE it — so a push failure must ' +
        'leave both, never one. 013 shipped the half-committed version of this once already.',
    ).toBeGreaterThan(0)

    // The stamp the fan-out coalesces on is written in that same transaction, so it survives too.
    const [row] = await getDb()
      .select({ actId: sessions.lastChangeActId, changedAt: sessions.logisticsChangedAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId))

    expect(row?.actId).toBeTruthy()
    expect(
      row?.changedAt,
      'The material-change stamp is missing after a failed dispatch. It is half the marker ' +
        'predicate (FR-1030), and the marker is what an attendee who never got the push still ' +
        'sees — so it is exactly the state that must NOT depend on delivery.',
    ).not.toBeNull()
  })

  it('survives a push service that THROWS, which the port forbids but the route cannot assume', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // `PushService.send` **must not throw** — the port says so, because one device's exception
    // would otherwise abandon the fan-out to the rest. That is a contract with implementations,
    // and an implementation is code somebody writes later: `WebPushService` calls a third-party
    // library over the network, and a library that throws on a malformed endpoint is ordinary.
    //
    // So the route may not *rely* on the contract to keep an organizer's act safe. This is the
    // same reasoning 007 records for report mail, and the case a `.catch()` that was moved or
    // narrowed would silently lose.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const throwing = new ThrowingPushService()
    await setup(throwing)

    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title: 'The Session That Throws' }),
    })
    const throwingSessionId = created.json().id as string

    const db = getDb()
    const graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]
      ?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db.insert(savedSessions).values({ attendeeId: graceId, sessionId: throwingSessionId })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    await registerDevice(app, sessionCookieFrom(signIn) as string, anEndpoint('grace-throws'))

    const response = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${throwingSessionId}/cancel`,
      headers: { cookie },
    })

    expect(
      response.statusCode,
      'A throwing push service failed the act. The route must swallow a dispatch failure ' +
        'whatever shape it arrives in — the act is already committed by then, so an exception ' +
        'escaping here turns a delivered cancellation into a 500 the organizer will retry.',
    ).toBe(200)
    expect(await cancelledAtOf(throwingSessionId)).not.toBeNull()

    // Put the failing (non-throwing) service back for anything that runs after this.
    push = new FailingPushService()
    await setup(push)
  })
})
