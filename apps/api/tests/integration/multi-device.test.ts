import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { authSessions } from '../../src/db/schema/auth-sessions.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T045a — sign-in sessions are independent per device (FR-029).
 *
 * The attendee has a phone in the conference hall and a laptop in the hotel. Signing out of
 * one must not sign them out of the other — and the mechanism is simply that each sign-in
 * creates its own row (data-model.md). This test is what stops a future "one session per
 * attendee" optimisation from quietly breaking that.
 */
describe('multi-device sign-in sessions', () => {
  let app: FastifyInstance

  const signIn = async (): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error('Sign-in failed; the test cannot proceed.')
    return token
  }

  const me = (cookie: string) =>
    app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(cookie) } })

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('issues a distinct token per sign-in', async () => {
    const phone = await signIn()
    const laptop = await signIn()

    expect(phone).not.toBe(laptop)

    const rows = await getDb().select().from(authSessions)
    expect(rows).toHaveLength(2)
  })

  it('keeps both sessions valid concurrently', async () => {
    const phone = await signIn()
    const laptop = await signIn()

    expect((await me(phone)).statusCode).toBe(200)
    expect((await me(laptop)).statusCode).toBe(200)
  })

  it('signing out of one device leaves the other signed in (FR-029)', async () => {
    const phone = await signIn()
    const laptop = await signIn()

    const signOut = await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(phone) },
    })
    expect(signOut.statusCode).toBe(204)

    expect((await me(phone)).statusCode, 'the phone is signed out').toBe(401)
    expect((await me(laptop)).statusCode, 'the laptop is unaffected').toBe(200)
  })

  it('sliding one session does not slide the other', async () => {
    const phone = await signIn()
    const laptop = await signIn()

    // Rewind both, then use only the phone.
    const rewound = new Date(Date.now() + 60_000)
    await getDb().update(authSessions).set({ expiresAt: rewound })

    await me(phone)

    const rows = await getDb().select().from(authSessions)
    const slid = rows.filter((r) => r.expiresAt.getTime() > rewound.getTime())
    const untouched = rows.filter((r) => r.expiresAt.getTime() <= rewound.getTime())

    expect(slid, 'exactly the used session slides').toHaveLength(1)
    expect(untouched, 'the idle session keeps its original expiry').toHaveLength(1)
    expect(laptop).not.toBe(phone)
  })
})
