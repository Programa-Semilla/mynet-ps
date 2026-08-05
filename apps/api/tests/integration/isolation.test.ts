import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T044 — **the most important test in this slice** (FR-069, SC-002).
 *
 * Constitution Principle VIII exists because this failure is not recoverable by a later
 * patch: leaked data stays leaked. quickstart.md Scenario 2 is the manual form of what this
 * asserts automatically, and FR-069 requires it to be automated precisely because review
 * alone has been shown to miss it.
 *
 * The test is deliberately hostile. It does not check that the happy path returns the right
 * rows — it tries, by every means the HTTP surface allows, to make the server return somebody
 * else's data, and asserts that none of them work.
 */
describe('attendee data isolation', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaEventNames: string[]
  let graceEventNames: string[]

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}; the test cannot proceed.`)
    return token
  }

  const eventsFor = async (cookie: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode).toBe(200)
    return (response.json() as Array<{ name: string }>).map((e) => e.name)
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaEventNames = await eventsFor(adaCookie)
    graceEventNames = await eventsFor(graceCookie)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the two seeded attendees genuinely differ, or this whole file proves nothing', () => {
    // Guard against the suite passing because both attendees happen to see identical data —
    // every assertion below would then be trivially true.
    expect(adaEventNames.length).toBeGreaterThan(0)
    expect(graceEventNames.length).toBeGreaterThan(0)
    expect(adaEventNames).not.toEqual(graceEventNames)

    const onlyAda = adaEventNames.filter((n) => !graceEventNames.includes(n))
    const onlyGrace = graceEventNames.filter((n) => !adaEventNames.includes(n))
    expect(onlyAda.length, 'Ada must have an event Grace does not').toBeGreaterThan(0)
    expect(onlyGrace.length, 'Grace must have an event Ada does not').toBeGreaterThan(0)
  })

  it('each attendee sees only their own identity', async () => {
    const ada = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const grace = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect((ada.json() as { email: string }).email).toBe(ADA)
    expect((grace.json() as { email: string }).email).toBe(GRACE)
  })

  it('never returns the credential hash (FR-032)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const body = JSON.stringify(response.json())
    expect(body).not.toContain('$argon2')
    expect(body.toLowerCase()).not.toContain('passwordhash')
    expect(body.toLowerCase()).not.toContain('password_hash')
  })

  /**
   * quickstart.md Scenario 2, steps 3–4. The endpoint takes no attendee identifier, so these
   * are attempts to smuggle one in anyway.
   */
  it.each([
    ['a query parameter', '/events?attendeeId='],
    ['a differently-cased query parameter', '/events?attendee_id='],
    ['a repeated query parameter', '/events?attendeeId=&attendeeId='],
  ])('ignores an attendee identifier smuggled in via %s', async (_label, prefix) => {
    // Grace's own id, sent by Ada. If any of these were honoured, Ada would see Grace's data.
    const graceMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(graceCookie) },
    })
    const graceId = (graceMe.json() as { id: string }).id

    const response = await app.inject({
      method: 'GET',
      url: `${prefix}${graceId}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(response.statusCode).toBe(200)
    const names = (response.json() as Array<{ name: string }>).map((e) => e.name)
    expect(names.sort()).toEqual([...adaEventNames].sort())
  })

  it('ignores an attendee identifier smuggled in via a header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: {
        cookie: cookieHeader(adaCookie),
        'x-attendee-id': 'whatever',
        'x-user-id': 'whatever',
      },
    })

    const names = (response.json() as Array<{ name: string }>).map((e) => e.name)
    expect(names.sort()).toEqual([...adaEventNames].sort())
  })

  it('refuses a fabricated session token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader('a-token-that-was-never-issued') },
    })

    expect(response.statusCode).toBe(401)
  })

  it('refuses a tampered session token (FR-026)', async () => {
    // Flip the last character. An opaque random token has no structure to exploit, so this
    // simply fails to match any stored hash.
    const tampered = adaCookie.slice(0, -1) + (adaCookie.at(-1) === 'a' ? 'b' : 'a')

    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(tampered) },
    })

    expect(response.statusCode).toBe(401)
  })

  it('discloses nothing about whether a referenced record exists (FR-036)', async () => {
    const fabricated = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader('completely-made-up-token') },
    })
    const tampered = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(adaCookie.slice(0, -3) + 'zzz') },
    })

    // Identical treatment. A difference would tell an attacker which of their guesses was
    // structurally closer to a real session.
    expect(fabricated.statusCode).toBe(tampered.statusCode)
    expect(fabricated.json()).toEqual(tampered.json())
  })

  it('refuses an unauthenticated request outright', async () => {
    const response = await app.inject({ method: 'GET', url: '/events' })
    expect(response.statusCode).toBe(401)
  })
})
