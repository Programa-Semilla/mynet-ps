import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendeePasswordResets } from '../../src/db/schema/identity-tokens.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T053 (004) — password recovery (FR-326–FR-333).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE NON-DISCLOSURE GUARANTEE THAT SURVIVES 004.**
 *
 * Sign-up deliberately discloses whether an address is registered (FR-303), because it cannot
 * avoid it: a new address signs the person in and an existing one does not, so the two outcomes
 * differ whatever the wording says. This path genuinely can hide it — the outcome is identical
 * either way — so it does, and the assertions below are what keep it that way.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('password recovery', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  const KNOWN = 'recoverable@example.com'
  const UNKNOWN = 'nobody-here@example.com'
  const OLD_PASSWORD = 'correct-horse-battery-staple'
  const NEW_PASSWORD = 'a-completely-different-passphrase'

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

  const signUp = async (email: string, password = OLD_PASSWORD) =>
    app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Recoverable', password },
    })

  const request = (email: string) =>
    app.inject({ method: 'POST', url: '/auth/reset-request', payload: { email } })

  const resetTokenFor = (email: string): string => {
    const message = mail.lastTo(email, 'password-reset')
    expect(message, `no reset message was sent to ${email}`).toBeDefined()
    return new URL(message!.link).searchParams.get('token') as string
  }

  const signIn = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/sign-in', payload: { email, password } })

  it('answers identically whether or not an account exists (FR-327)', async () => {
    await signUp(KNOWN)
    mail.clear()

    const known = await request(KNOWN)
    const unknown = await request(UNKNOWN)

    expect(known.statusCode).toBe(202)
    expect(unknown.statusCode).toBe(202)
    // Byte-identical, not merely the same status. A different body would be the oracle by
    // another name.
    expect(known.body).toEqual(unknown.body)

    // …and only one of them actually sent anything, which is the asymmetry that must never
    // reach the response.
    expect(mail.lastTo(KNOWN, 'password-reset')).toBeDefined()
    expect(mail.lastTo(UNKNOWN, 'password-reset')).toBeUndefined()
  })

  it('lets the attendee set a new password and sign in with it (SC-301)', async () => {
    const email = 'sets-new@example.com'
    await signUp(email)
    await request(email)

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: resetTokenFor(email), password: NEW_PASSWORD },
    })
    expect(reset.statusCode).toBe(204)

    expect((await signIn(email, NEW_PASSWORD)).statusCode).toBe(204)
    expect(
      (await signIn(email, OLD_PASSWORD)).statusCode,
      'the old password must stop working — otherwise a reset adds a credential rather than ' +
        'replacing one',
    ).toBe(401)
  })

  it('refuses a reused reset link (FR-328)', async () => {
    const email = 'reused-link@example.com'
    await signUp(email)
    await request(email)
    const token = resetTokenFor(email)

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/reset',
          payload: { token, password: NEW_PASSWORD },
        })
      ).statusCode,
    ).toBe(204)

    const second = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token, password: 'yet-another-passphrase' },
    })
    expect(second.statusCode).toBe(410)
  })

  it('invalidates an outstanding link when a new one is issued (FR-329)', async () => {
    const email = 'superseded@example.com'
    await signUp(email)

    await request(email)
    const first = resetTokenFor(email)
    mail.clear()

    await request(email)
    const second = resetTokenFor(email)
    expect(second).not.toBe(first)

    const stale = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: first, password: NEW_PASSWORD },
    })
    expect(
      stale.statusCode,
      'Invalidation is a DELETE inside the issuing transaction, not an `is_current` flag — a ' +
        'flag leaves the superseded row usable by any read that forgets to check it, on the one ' +
        'path where forgetting means an expired link still changes a password (research D4).',
    ).toBe(410)

    // …and the new one works, so the invalidation did not take both with it.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/reset',
          payload: { token: second, password: NEW_PASSWORD },
        })
      ).statusCode,
    ).toBe(204)
  })

  it('leaves exactly one outstanding reset row per attendee', async () => {
    const email = 'one-row@example.com'
    await signUp(email)

    await request(email)
    await request(email)
    await request(email)

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendee_password_resets r
      JOIN attendees a ON a.id = r.attendee_id
      WHERE a.email = ${email}
    `)
    expect(rows[0]?.count).toBe('1')
  })

  it('revokes EVERY session on EVERY device when the reset completes (FR-330)', async () => {
    const email = 'multi-device@example.com'
    await signUp(email)

    // Two devices, two independent sessions — the property 001 built one-row-per-sign-in for.
    const phone = sessionCookieFrom(await signIn(email, OLD_PASSWORD)) as string
    const laptop = sessionCookieFrom(await signIn(email, OLD_PASSWORD)) as string
    expect(phone).not.toBe(laptop)

    for (const token of [phone, laptop]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            headers: { cookie: cookieHeader(token) },
          })
        ).statusCode,
      ).toBe(200)
    }

    await request(email)
    await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: resetTokenFor(email), password: NEW_PASSWORD },
    })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A reset is what somebody does when they believe their account is compromised. Leaving the
    // compromiser signed in on their own device would defeat the entire point of the exercise.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const token of [phone, laptop]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            headers: { cookie: cookieHeader(token) },
          })
        ).statusCode,
      ).toBe(401)
    }
  })

  it('does not sign the attendee in as a side effect of resetting', async () => {
    // Sign-up signs the person in because they have just proved they own the address they typed.
    // A reset proves only that they hold a link; signing in with the new password is the step
    // that confirms they know it.
    const email = 'not-signed-in@example.com'
    await signUp(email)
    await request(email)

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: resetTokenFor(email), password: NEW_PASSWORD },
    })

    expect(sessionCookieFrom(reset)).toBeUndefined()
  })

  it('refuses an expired reset link, identically to an unknown one', async () => {
    const email = 'expired-reset@example.com'
    await signUp(email)
    await request(email)
    const token = resetTokenFor(email)

    await getDb()
      .update(attendeePasswordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(sql`true`)

    const expired = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token, password: NEW_PASSWORD },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: 'never-issued-at-all', password: NEW_PASSWORD },
    })

    expect(expired.statusCode).toBe(410)
    expect(expired.json()).toEqual(unknown.json())
  })

  it('enforces the same password policy the sign-up screen states (FR-304)', async () => {
    const email = 'weak-reset@example.com'
    await signUp(email)
    await request(email)

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: resetTokenFor(email), password: 'short' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('puts no password into any message, log or record (FR-332)', async () => {
    const email = 'no-password-anywhere@example.com'
    await signUp(email)
    await request(email)

    for (const message of mail.sent()) {
      expect(message.link).not.toContain(OLD_PASSWORD)
      expect(message.link).not.toContain(NEW_PASSWORD)
    }

    await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: resetTokenFor(email), password: NEW_PASSWORD },
    })

    // Every column of every table this feature writes on the recovery path.
    for (const table of ['attendee_password_resets', 'attendee_credentials', 'sign_in_attempts']) {
      const rows = await getDb().execute<Record<string, unknown>>(sql.raw(`SELECT * FROM ${table}`))
      for (const row of rows) {
        for (const value of Object.values(row)) {
          expect(String(value)).not.toContain(NEW_PASSWORD)
          expect(String(value)).not.toContain(OLD_PASSWORD)
        }
      }
    }
  })

  it('fails a reset link followed after the account was deleted, as an expired one would', async () => {
    // The cascade takes the reset row with the account, so the link simply finds nothing —
    // which is the same answer an expired link produces, and discloses nothing about whether
    // the account ever existed.
    const email = 'gone@example.com'
    await signUp(email)
    await request(email)
    const token = resetTokenFor(email)

    await getDb().execute(sql`DELETE FROM attendees WHERE email = ${email}`)

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token, password: NEW_PASSWORD },
    })
    expect(response.statusCode).toBe(410)
  })
})
