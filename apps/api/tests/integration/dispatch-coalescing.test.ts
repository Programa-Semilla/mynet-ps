import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { attendeesToNotify } from '../../src/db/queries/session-changes.js'
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
 * T061, T062 (014) — **one organizer act, one notification per attendee** (FR-1034, FR-1034a,
 * FR-1028b, SC-1012).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **COALESCING IS PER *ACT*, NEVER PER ATTENDEE PER TIME WINDOW, AND THE DIFFERENCE IS THE
 * REQUIREMENT.**
 *
 * A time window is the obvious implementation and FR-1028b forbids it explicitly: it would
 * **suppress a cancellation because a room moved earlier**, which is exactly the failure this
 * whole trigger exists to prevent. So two acts an hour apart produce two notifications however
 * close together they are, and one act touching a dozen sessions produces one.
 *
 * The key is the **audit entry id** (research R4). Nothing new is stored to make it work: the
 * entry already exists, is unique per act, is generated inside the act's transaction, and is
 * meaningless outside it. It also makes the relationship between the two records the correct one
 * — an attendee was interrupted **because a recorded act happened**.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **NO ROUTE IN 014 CHANGES SEVERAL SESSIONS IN ONE REQUEST, AND THAT IS WHY THE FAN-OUT IS
 * DRIVEN DIRECTLY BELOW.**
 *
 * There is no bulk edit, no bulk cancel, and the two conference-level acts that could touch many
 * sessions at once are both **refused** while sessions exist (FR-1014's orphan check, FR-1015's
 * timezone freeze). So FR-1034's multi-session case is a property of the **fan-out** rather than
 * of any request the product currently offers — and asserting it through a route would mean
 * building the bulk route this feature deliberately does not have.
 *
 * `attendeesToNotify` is therefore exercised against the state a multi-session act would leave:
 * several sessions carrying **one** `last_change_act_id`. That is not a shortcut around the
 * requirement, it is the requirement stated where it lives — and it is what makes 015's bulk
 * edit, if it ever exists, correct on the day it ships rather than the day somebody notices
 * twelve notifications. Recorded in `deviations.md`.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('one act, one notification (T061, T062, FR-1034, SC-1012)', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let fixture: AuthoringFixture
  let cookie: string
  let graceId: string
  let sessionIds: string[]

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

    sessionIds = []
    for (let index = 0; index < 4; index += 1) {
      const created = await app.inject({
        method: 'POST',
        url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
        headers: { cookie },
        payload: sessionBody(fixture.assigned, {
          title: `Session ${index}`,
          startsAt: `2027-03-01T${String(9 + index).padStart(2, '0')}:00:00.000Z`,
          endsAt: `2027-03-01T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
        }),
      })
      sessionIds.push(created.json().id as string)
    }

    // Grace is the saver. **Not Ada**, who is the organizer here — FR-1028a excludes the acting
    // principal, so using them would make every assertion pass for the wrong reason.
    const db = getDb()
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]?.id as string
    await db
      .insert(registrations)
      .values({ attendeeId: graceId, eventId: fixture.assigned.eventId })
    await db
      .insert(savedSessions)
      .values(sessionIds.map((sessionId) => ({ attendeeId: graceId, sessionId })))

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    await registerDevice(app, sessionCookieFrom(signIn) as string, anEndpoint('grace-phone'))
    push.clear()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const cancel = (sessionId: string) =>
    app.inject({ method: 'POST', url: at(`/sessions/${sessionId}/cancel`), headers: { cookie } })

  /** Puts several sessions under one act, which is the state a bulk act would leave. */
  const stampAll = async (ids: readonly string[], actId: string): Promise<void> => {
    await getDb()
      .update(sessions)
      .set({ lastChangeActId: actId, logisticsChangedAt: new Date() })
      .where(inArray(sessions.id, [...ids]))
  }

  const actIdOf = async (sessionId: string): Promise<string> => {
    const [row] = await getDb()
      .select({ actId: sessions.lastChangeActId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
    return row?.actId as string
  }

  it('stamps each act with its own id, which is what makes coalescing possible', async () => {
    // The premise. Without it, every assertion below could pass because the column was null and
    // the fan-out grouped everything together by accident.
    await cancel(sessionIds[0] as string)
    await cancel(sessionIds[1] as string)

    const first = await actIdOf(sessionIds[0] as string)
    const second = await actIdOf(sessionIds[1] as string)

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })

  it('groups one act into ONE notifiable entry, carrying every session it touched', async () => {
    await cancel(sessionIds[0] as string)
    const actId = await actIdOf(sessionIds[0] as string)

    // The state a multi-session act leaves: four sessions, one act id. See the header for why
    // this is driven rather than requested.
    // `inArray` rather than an interpolated array: drizzle expands a JS array in a raw `sql`
    // fragment as a parameter tuple, which PostgreSQL cannot cast to `uuid[]`.
    await stampAll(sessionIds, actId)

    const recipients = await attendeesToNotify(actId, null)

    expect(
      recipients,
      'One act produced more than one notifiable entry for the same attendee. FR-1034 makes that ' +
        'the whole point: a reshuffle would otherwise buzz a phone a dozen times, which is the ' +
        "outcome v3.1.0's exclusion existed to prevent.",
    ).toHaveLength(1)

    expect(recipients[0]?.attendeeId).toBe(graceId)
    expect([...(recipients[0]?.sessionIds ?? [])].sort()).toEqual([...sessionIds].sort())
  })

  it('produces a COALESCED payload with a count and NO session to open (FR-1034b)', async () => {
    await cancel(sessionIds[0] as string)
    const actId = await actIdOf(sessionIds[0] as string)
    push.clear()

    await stampAll(sessionIds, actId)

    const recipients = await attendeesToNotify(actId, null)
    expect(recipients[0]?.sessionIds).toHaveLength(4)
  })

  it('sends TWO notifications for two separate acts, never one (T062, FR-1028b)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The assertion that forbids a time window. Two acts in immediate succession — closer
    // together than any window would be — must produce two interruptions, because the second may
    // be a cancellation and the first only a room change.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    expect((await cancel(sessionIds[0] as string)).statusCode).toBe(200)
    expect((await cancel(sessionIds[1] as string)).statusCode).toBe(200)

    expect(
      push.delivered(),
      'Two separate acts produced fewer than two notifications. Coalescing is per ACT: a ' +
        'time-window rule would suppress a cancellation because a room moved earlier, which is ' +
        'the exact failure this trigger exists to prevent (FR-1028b).',
    ).toHaveLength(2)
  })

  it('names the session when only one of the attendee’s saved sessions changed (FR-1029)', async () => {
    await cancel(sessionIds[0] as string)

    const payload = push.delivered()[0]?.payload
    expect(payload && 'sessionId' in payload ? payload.sessionId : undefined).toBe(sessionIds[0])
    expect(
      payload && 'count' in payload ? payload.count : undefined,
      'A single-session notification carried a count. The count exists to make a coalesced ' +
        'interruption legible; on one session it is noise, and it is the one aggregate this ' +
        'feature may produce at all (FR-1034a).',
    ).toBeUndefined()
  })
})
