import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import type { MailService } from '../../src/mail/service.js'
import {
  attendees,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T056 (004) — **a send failure MUST NOT fail account creation** (FR-318a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **An unprovisioned or failing mail provider is the EXPECTED state, not an exceptional one.**
 *
 * Register entry 18 has not chosen a transactional mail provider, and the development adapter
 * deliberately sends nothing. If account creation depended on a successful send, self sign-up
 * would be unusable in exactly the environments where it is most needed — and it would fail
 * *badly*: the person would see an error, try again, and the second attempt would answer 409
 * because the first one had already created their account.
 *
 * The consequence is bounded and stated rather than hidden: an attendee whose message never
 * arrives is unverified, keeps every other capability (FR-324, FR-325), appears to nobody
 * (FR-359), and can ask for a fresh link at any time.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A provider that is present, reachable, and refusing — the worst of the three failure modes. */
class FailingMailService implements MailService {
  calls = 0

  async sendVerification(): Promise<void> {
    this.calls += 1
    throw new Error('smtp: 421 service not available')
  }

  async sendPasswordReset(): Promise<void> {
    this.calls += 1
    throw new Error('smtp: 421 service not available')
  }
}

describe('mail failure does not fail the request that triggered it (FR-318a)', () => {
  let app: FastifyInstance
  const mail = new FailingMailService()

  const EMAIL = 'mail-is-broken@example.com'
  const PASSWORD = 'correct-horse-battery-staple'

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  it('creates the account and signs the person in, despite the send failing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: 'Undeliverable', password: PASSWORD },
    })

    expect(response.statusCode).toBe(204)
    expect(mail.calls, 'the send must have been attempted, not skipped').toBeGreaterThan(0)

    const token = sessionCookieFrom(response)
    expect(token, 'FR-306 still holds — signed in without a second credential entry').toBeTruthy()

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(token as string) },
    })
    expect(me.statusCode).toBe(200)
  })

  it('leaves the account unverified, which is the whole cost of the failure', async () => {
    const rows = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.email, EMAIL))

    expect(rows[0]?.verifiedAt).toBeNull()
  })

  it('does not leave a half-created account that the next attempt collides with', async () => {
    // The failure mode a naive "send first, then commit" ordering produces: the person sees an
    // error, tries again, and is told the address is already registered by the attempt they
    // believe failed.
    const second = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: 'Undeliverable', password: PASSWORD },
    })

    // 409 is correct HERE because the first attempt genuinely succeeded and said so.
    expect(second.statusCode).toBe(409)
  })

  it('answers a reset request 202 even when the send fails', async () => {
    // Same reasoning, and one requirement stronger: a send failure must not become the one
    // observable difference between an address that has an account and one that does not
    // (FR-327).
    const known = await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: EMAIL },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'no-such-address@example.com' },
    })

    expect(known.statusCode).toBe(202)
    expect(known.body).toEqual(unknown.body)
  })

  it('answers a resend 202 even when the send fails', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: 'resend-broken@example.com', displayName: 'R', password: PASSWORD },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie: cookieHeader(sessionCookieFrom(created) as string) },
    })

    expect(response.statusCode).toBe(202)
  })
})
