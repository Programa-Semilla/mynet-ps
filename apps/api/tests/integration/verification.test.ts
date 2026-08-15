import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendeeVerifications } from '../../src/db/schema/identity-tokens.js'
import {
  attendees,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T051 (004) — email verification (FR-318, FR-319, FR-320, FR-321, FR-322).
 */
describe('email verification', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    mail.clear()
  })

  const password = 'correct-horse-battery-staple'

  const signUp = async (email: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Verifier', password },
    })
    return sessionCookieFrom(response) as string
  }

  /** The token out of the link, which is the only place its plaintext ever exists (FR-323). */
  const tokenFor = (email: string): string => {
    const message = mail.lastTo(email, 'verification')
    expect(message, `no verification message was sent to ${email}`).toBeDefined()
    return new URL(message!.link).searchParams.get('token') as string
  }

  const verify = (token: string) =>
    app.inject({ method: 'POST', url: '/auth/verify', payload: { token } })

  it('sends a verification message on account creation (FR-318)', async () => {
    const email = 'verify-me@example.com'
    await signUp(email)

    const message = mail.lastTo(email, 'verification')
    expect(message).toBeDefined()
    // The link must point at the client's own address for it, or it 404s in the inbox.
    expect(message?.link).toContain('/verify?token=')
  })

  it('records the account as unverified until the link is followed (FR-319)', async () => {
    const email = 'not-yet@example.com'
    await signUp(email)

    const before = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.email, email))
    expect(before[0]?.verifiedAt).toBeNull()

    expect((await verify(tokenFor(email))).statusCode).toBe(204)

    const after = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.email, email))
    expect(after[0]?.verifiedAt).not.toBeNull()
  })

  it('refuses a second use of the same link (FR-320)', async () => {
    const email = 'once-only@example.com'
    await signUp(email)
    const token = tokenFor(email)

    expect((await verify(token)).statusCode).toBe(204)

    const second = await verify(token)
    expect(second.statusCode).toBe(410)
    expect(second.json()).toMatchObject({ code: 'link_expired' })
  })

  it('refuses an expired link, and identically to a used one (FR-321)', async () => {
    const email = 'expired@example.com'
    await signUp(email)
    const token = tokenFor(email)

    // Age the row rather than waiting 24 hours. The lifetime itself is configuration and is
    // asserted by the config, not by the clock.
    await getDb()
      .update(attendeeVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(sql`true`)

    const expired = await verify(token)
    expect(expired.statusCode).toBe(410)

    const unknown = await verify('a-token-that-was-never-issued')
    expect(unknown.statusCode).toBe(410)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Expired, used and unknown are ONE refusal, from one factory. A link that reported which
    // of the three had happened would let anyone holding a used link learn that it had once
    // been valid — and that it belonged to an account that exists.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(expired.json()).toEqual(unknown.json())
  })

  it('lets the attendee ask for a new link, and the new one works (FR-321, FR-322)', async () => {
    const email = 'resend@example.com'
    const token = await signUp(email)

    const stale = tokenFor(email)
    mail.clear()

    const resent = await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie: cookieHeader(token) },
    })
    expect(resent.statusCode).toBe(202)

    const fresh = tokenFor(email)
    expect(fresh).not.toBe(stale)
    expect((await verify(fresh)).statusCode).toBe(204)
  })

  it('leaves an earlier verification link working after a resend', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Deliberately unlike a password reset**, where FR-329 requires a new link to invalidate
    // the outstanding one. No requirement says that of verification, and doing it would punish
    // the ordinary mistake: somebody who does not see the first message, asks for another, and
    // then finds the first after all. Refusing the link they are looking at, to enforce a rule
    // nothing asks for, would be the product being clever at their expense.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const email = 'both-links@example.com'
    const session = await signUp(email)
    const first = tokenFor(email)
    mail.clear()

    await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie: cookieHeader(session) },
    })

    expect((await verify(first)).statusCode).toBe(204)
  })

  it('answers a resend for an already-verified account identically, and sends nothing', async () => {
    const email = 'already@example.com'
    const session = await signUp(email)
    await verify(tokenFor(email))
    mail.clear()

    const resent = await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie: cookieHeader(session) },
    })

    expect(resent.statusCode).toBe(202)
    expect(
      mail.lastTo(email, 'verification'),
      'A link that verifies something already verified is noise in an inbox — and the identical ' +
        'response is what stops this route reporting verification state to a caller.',
    ).toBeUndefined()
  })

  it('refuses a resend from an unauthenticated caller', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/verify/resend' })
    expect(response.statusCode).toBe(401)
  })

  it('refuses a missing or malformed token with 400, not 410', async () => {
    // A malformed *request* is the caller's mistake and is safe to describe; a valid request
    // carrying a dead token is the case that must disclose nothing.
    const empty = await app.inject({ method: 'POST', url: '/auth/verify', payload: {} })
    expect(empty.statusCode).toBe(400)
  })
})
