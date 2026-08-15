import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  ensureInterestOptions,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T057 (004) — **an unverified attendee is obstructed by nothing except being seen**
 * (FR-324, FR-325, FR-325b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **VERIFICATION GATES EXACTLY ONE THING, AND THIS FILE IS WHERE THAT STAYS TRUE.**
 *
 * The specification narrowed FR-324 twice, and the narrowing is easy to over-apply later: the
 * obvious "safe" instinct on reading FR-359 is to gate a little more — joining, or notes, or
 * saving — on the reasoning that an unverified account might not be a real person.
 *
 * That instinct is wrong here and the specification says why. The mail provider is
 * unprovisioned (register entry 18), so **verification may never arrive at all**. Gating
 * anything else on it would make the product unusable for the state it is expected to be in,
 * and would break SC-300's one-sitting journey. The only thing withheld is appearing to other
 * attendees — which is precisely the exposure that mattered (FR-325a).
 *
 * The half this file cannot assert is the other side of that sentence: that the unverified
 * attendee does *not* appear to others. That is `verification-gates-visibility.test.ts`, which
 * arrives with US5 — deliberately, because until a profile can be read there is nothing to hide.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('an unverified attendee uses the product fully (FR-324, FR-325)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  let token: string
  let eventId: string
  let sessionId: string

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
    await clearThrottle()
    // T174 (014 tranche 2) — FR-1088: an unverified attendee writes a profile like anybody
    // else, and the interest they choose has to exist to be chosen.
    await ensureInterestOptions(['Cryptanalysis'])

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'never-verified@example.com',
        displayName: 'Never Verified',
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
    eventId = (joined.json() as { event: { id: string } }).event.id

    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(token) },
    })
    sessionId = (sessions.json() as Array<{ id: string }>)[0]?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  const as = () => ({ cookie: cookieHeader(token) })

  it('is genuinely unverified — otherwise every assertion below proves nothing', async () => {
    // The guard that stops this file passing vacuously. If the fixture were verified, each
    // "an unverified attendee can…" assertion would be testing a verified one.
    const rows = await getDb().execute<{ verified: boolean }>(sql`
      SELECT (email_verified_at IS NOT NULL) AS verified
      FROM attendees WHERE email = 'never-verified@example.com'
    `)
    expect(rows[0]?.verified).toBe(false)
  })

  it('signs in', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'never-verified@example.com',
        password: 'correct-horse-battery-staple',
      },
    })
    expect(response.statusCode).toBe(204)
  })

  it('joined a conference, and reads its programme', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: as(),
    })
    expect(response.statusCode).toBe(200)
  })

  it('resolves an active conference like anybody else', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/workspace/active-event',
      headers: as(),
    })
    expect(response.statusCode).toBe(200)
    expect((response.json() as { name: string }).name).toBe(SEED_EVENTS[0].name)
  })

  it('saves a session', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/saved/${sessionId}`,
      headers: as(),
    })
    expect(response.statusCode).toBe(204)
  })

  it('writes a personal note', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/notes/${sessionId}`,
      headers: as(),
      payload: { body: 'Ask about the migration story.' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('authors a profile (FR-324)', async () => {
    // The capability FR-325 was tempting to gate and deliberately does not. An unverified
    // attendee writes their profile like anybody else — they simply do not appear in anyone
    // else's directory while they do it.
    const response = await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: as(),
      payload: {
        company: 'Unverified & Co',
        headline: 'Still perfectly able to describe myself.',
        interests: ['Cryptanalysis'],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ company: 'Unverified & Co', emailVerified: false })
  })

  it('reads its own profile regardless of visibility (FR-340)', async () => {
    const response = await app.inject({ method: 'GET', url: '/profile', headers: as() })

    expect(response.statusCode).toBe(200)
    expect((response.json() as { emailVerified: boolean }).emailVerified).toBe(false)
  })

  it('joins a second conference', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: as(),
      payload: { joinCode: SEED_EVENTS[1].joinCode },
    })
    expect(response.statusCode).toBe(200)
  })

  it('is never told its account is pending, blocked or impaired (FR-325b)', async () => {
    // The product must not present an unverified account as broken. Nothing on the identity
    // surface may answer with a status that reads as "not yet allowed" — the only difference
    // is who can see them, and that is stated on their own profile rather than enforced here.
    for (const url of ['/auth/me', '/events', '/workspace/active-event']) {
      const response = await app.inject({ method: 'GET', url, headers: as() })
      expect(response.statusCode, `${url} must not gate on verification`).toBeLessThan(400)
    }
  })
})
