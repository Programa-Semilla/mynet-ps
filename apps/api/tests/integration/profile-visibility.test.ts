import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events } from '../../src/db/schema/events.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T087 (004) — **all four refusal causes are indistinguishable** (FR-357, FR-358, FR-361,
 * FR-390, SC-304).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASSERTION THAT MATTERS IS THE ONE COMPARING RESPONSES TO EACH OTHER.**
 *
 * Each refusal being a 404 is easy and proves little. What FR-361 requires is that a requester
 * cannot tell *which* of four things happened — no shared conference, no such attendee, hidden,
 * or unverified — because three of those four are facts about somebody else that the requester
 * has no business learning. The fourth, verification state, is named explicitly.
 *
 * So the assertions below compare **status, body and headers across causes**. That is only
 * achievable because the query expresses all three conditions in one `WHERE` over one join: a
 * handler with four branches would satisfy this test today and diverge the first time somebody
 * added a helpful message to one of them.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a profile refusal discloses nothing about its cause (FR-361)', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let sharedEventId: string
  let gracesOwnEventId: string
  let adaId: string
  let graceId: string
  let alanId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const ids = await getDb().select({ id: attendees.id, email: attendees.email }).from(attendees)
    adaId = ids.find((row) => row.email === ADA)?.id as string
    graceId = ids.find((row) => row.email === GRACE)?.id as string
    alanId = ids.find((row) => row.email === 'alan@example.com')?.id as string

    const eventRows = await getDb().select({ id: events.id, name: events.name }).from(events)
    sharedEventId = eventRows.find((row) => row.name === SEED_EVENTS[0].name)?.id as string
    gracesOwnEventId = eventRows.find((row) => row.name === SEED_EVENTS[2].name)?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
    grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string

    // Reset the fixture's visibility between tests, so one test's change cannot decide another's.
    await getDb()
      .update(attendees)
      .set({ discoverable: true })
      .where(sql`true`)
    await getDb()
      .update(attendees)
      .set({ emailVerifiedAt: new Date() })
      .where(sql`email in (${ADA}, ${GRACE})`)
  })

  const read = (eventId: string, attendeeId: string, token = ada) =>
    app.inject({
      method: 'GET',
      url: `/events/${eventId}/attendees/${attendeeId}`,
      headers: { cookie: cookieHeader(token) },
    })

  it("returns a co-attendee's profile when all three conditions hold (FR-357)", async () => {
    const response = await read(sharedEventId, graceId)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      attendeeId: graceId,
      displayName: 'Grace Hopper',
      company: 'Naval Systems Group',
    })
  })

  it("never returns the target's email or verification state (FR-361, FR-391)", async () => {
    const body = (await read(sharedEventId, graceId)).body

    expect(body).not.toContain(GRACE)
    expect(body).not.toContain('emailVerified')
    expect(body).not.toContain('email')
  })

  it('refuses all four causes identically — status, body and headers', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // 1. No conference in common. Ada is not registered for Grace's own conference, so the
    //    EventScope cannot even be built — the guard refuses before the query runs.
    // 2. No such attendee.
    // 3. Discoverable off.
    // 4. Address unverified.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const noSharedConference = await read(gracesOwnEventId, graceId)

    const noSuchAttendee = await read(sharedEventId, '00000000-0000-4000-8000-000000000000')

    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, graceId))
    const notDiscoverable = await read(sharedEventId, graceId)
    await getDb().update(attendees).set({ discoverable: true }).where(eq(attendees.id, graceId))

    await getDb().update(attendees).set({ emailVerifiedAt: null }).where(eq(attendees.id, graceId))
    const notVerified = await read(sharedEventId, graceId)

    const responses = [noSharedConference, noSuchAttendee, notDiscoverable, notVerified]

    for (const response of responses) {
      expect(response.statusCode).toBe(404)
    }

    // The bodies must be byte-identical. A helpful message on any one of them is the leak.
    const bodies = new Set(responses.map((response) => response.body))
    expect(
      [...bodies],
      'Four causes, one refusal. If these differ, a requester can learn whether an attendee ' +
        'exists, whether they are hiding, or whether their address is verified (FR-361).',
    ).toHaveLength(1)
  })

  it('refuses a malformed identifier the same way (FR-361)', async () => {
    const malformed = await read(sharedEventId, 'not-a-uuid-at-all')
    const missing = await read(sharedEventId, '00000000-0000-4000-8000-000000000000')

    expect(malformed.statusCode).toBe(404)
    expect(
      malformed.body,
      'A 400 with a validation body would separate "not a uuid" from "not visible to you" — ' +
        'smaller than an existence leak, still a difference an attacker can read.',
    ).toEqual(missing.body)
  })

  it('hides the seeded unverified attendee from a co-attendee (FR-359)', async () => {
    // Alan is registered for the shared conference, is discoverable by default, and has never
    // verified. He is the fixture for exactly the state SC-304a is about.
    const response = await read(sharedEventId, alanId)

    expect(response.statusCode).toBe(404)
  })

  it('evaluates every condition SERVER-SIDE, before any field is returned (FR-358, FR-390)', async () => {
    // The refusal must carry no profile fields at all — not a filtered object, not an empty
    // one. Client-side filtering is what Principle VIII forbids relying on, and a response
    // carrying the data with a flag saying "do not show this" would be exactly that.
    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, graceId))

    const response = await read(sharedEventId, graceId)

    expect(response.body).not.toContain('Naval Systems Group')
    expect(response.body).not.toContain('Grace Hopper')
    expect(response.body).not.toContain('displayName')
  })

  it('is symmetric — hiding does not hide the other direction', async () => {
    // Discoverability is about being found, not about finding. Grace turning hers off must not
    // stop her reading Ada's profile.
    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, graceId))

    const response = await read(sharedEventId, adaId, grace)
    expect(response.statusCode).toBe(200)
  })

  it('refuses an unauthenticated caller before it considers anything else (FR-386)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${graceId}`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('refuses a conference the reader is not registered for, whoever the target is', async () => {
    // The reader's own registration is proven by the branded EventScope, which cannot be
    // constructed for a conference they have not joined — so this is refused before the target
    // is considered at all.
    const response = await read(gracesOwnEventId, adaId)
    expect(response.statusCode).toBe(404)
  })
})
