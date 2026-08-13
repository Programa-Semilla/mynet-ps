import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  attendees,
  clearThrottle,
  cookieHeader,
  events,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T040 (004) — **registration grants scope, and nothing else** (FR-316, FR-317b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The join code is public by decision (FR-317a), which makes this file the load-bearing one:
 * everything a registration confers is something anybody who can read this repository can
 * confer on themselves. FR-317b states the consequence — **a registration is evidence of
 * presence, not of vetting** — and forbids any requirement, now or later, from reading it as
 * identity assurance, as an entitlement, or as a trust signal.
 *
 * Open Question 10 records the trigger for revisiting that: if a future feature ever makes
 * registration itself confer access to something private, the reasoning stops holding. These
 * assertions are what would notice.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a registration confers scope, never trust (FR-316, FR-317b)', () => {
  let app: FastifyInstance
  let token: string
  let joinedEventId: string
  let otherEventId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'grants-nothing@example.com',
        displayName: 'Nobody Special',
        password: 'correct-horse-battery-staple',
      },
    })
    token = sessionCookieFrom(created) as string

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })
    joinedEventId = (joined.json() as { event: { id: string } }).event.id

    const rows = await getDb()
      .select({ id: events.id })
      .from(events)
      .where(eq(events.name, SEED_EVENTS[2].name))
    otherEventId = rows[0]?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  const as = () => ({ cookie: cookieHeader(token) })

  it('grants read of the joined conference programme — the scope it is FOR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${joinedEventId}/sessions`,
      headers: as(),
    })

    expect(response.statusCode).toBe(200)
  })

  it('grants nothing over another conference, whose code was never entered', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${otherEventId}/sessions`,
      headers: as(),
    })

    // Refused identically to a conference that does not exist (FR-148), so holding one
    // registration cannot be used to enumerate the others.
    expect(response.statusCode).toBe(404)

    const missing = await app.inject({
      method: 'GET',
      url: '/events/00000000-0000-4000-8000-000000000000/sessions',
      headers: as(),
    })
    expect(response.json()).toEqual(missing.json())
  })

  it('grants no write over the conference content it can read (FR-132, FR-134)', async () => {
    // Creating, editing or importing a programme is organizer administration, which Principle
    // III places out of product scope. The route audit asserts no such route is *declared*;
    // this asserts the same thing from outside, against a caller holding a real registration.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: `/events/${joinedEventId}/sessions`,
        headers: as(),
        payload: { title: 'A Session I Invented' },
      })

      expect(
        response.statusCode,
        `${method} on conference content must not exist at any privilege.`,
      ).toBeGreaterThanOrEqual(400)
    }
  })

  it('grants no capability over another attendee registered for the same conference', async () => {
    // There is no route in the product that takes an attendee identifier and acts on them.
    // 002's route audit asserts that structurally; this checks it from the outside, because the
    // audit can only see routes that exist and this would notice one arriving by another path.
    const response = await app.inject({
      method: 'GET',
      url: `/events/${joinedEventId}/agenda/saved`,
      headers: as(),
    })

    expect(response.statusCode).toBe(200)
    expect(
      (response.json() as { sessions: { sessionId: string }[] }).sessions.map(
        (entry) => entry.sessionId,
      ),
      "A brand-new attendee sees their own empty agenda, not the conference's.",
    ).toEqual([])
  })

  it('is NEVER identity assurance — joining does not verify the address (FR-317b)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The single most important assertion in this file.**
    //
    // Anybody can obtain a registration, because the code is world-readable. If registering
    // marked the address verified — or if any later feature read a registration as evidence
    // that somebody had been checked — then signing up under an address you do not own and
    // joining a conference would be enough to appear in a professional directory as its owner
    // (FR-325a, SC-304a). Verification is the only thing that establishes the address, and it
    // requires receiving mail at it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const rows = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.email, 'grants-nothing@example.com'))

    expect(rows[0]?.verifiedAt).toBeNull()
  })

  it('offers no surface that creates, changes or revokes a join code (FR-311)', async () => {
    // The code lives on a seeded row and is written by the seed alone. A product surface that
    // could mint one would be organizer administration arriving through the back door.
    for (const url of [
      `/events/${joinedEventId}/join-code`,
      '/events/join-code',
      `/events/${joinedEventId}`,
    ]) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        const response = await app.inject({ method, url, headers: as(), payload: {} })
        expect(response.statusCode, `${method} ${url} must not exist`).toBeGreaterThanOrEqual(400)
      }
    }
  })
})
