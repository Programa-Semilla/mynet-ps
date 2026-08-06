import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  resetDatabase,
  SEED_PASSWORD,
  SESSION_COOKIE,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T043 — sign-in success and failure.
 *
 * The central assertion is FR-030: **a failure must be indistinguishable across causes.** An
 * unknown identifier and a wrong credential must produce the same status and the same body,
 * because any difference is an account-existence oracle — an attacker learns which addresses
 * are registered attendees at this conference without ever signing in.
 */
describe('POST /auth/sign-in', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  it('signs in with correct credentials and sets an HttpOnly session cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })

    expect(response.statusCode).toBe(204)

    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)
    expect(cookie, 'sign-in must set the session cookie').toBeDefined()
    expect(cookie?.httpOnly, 'FR-045: the token must not be reachable from JavaScript').toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')
  })

  it('never returns the session token in the response body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })

    // 204 has no body at all, which is the strongest form of this guarantee.
    expect(response.body).toBe('')
  })

  it('normalises the identifier: case and surrounding whitespace do not matter (FR-025b)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: '  ADA@Example.COM  ', password: SEED_PASSWORD },
    })

    expect(response.statusCode).toBe(204)
  })

  it('refuses a wrong credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: 'not-the-password' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined()
  })

  /**
   * FR-030, and the reason this file exists.
   */
  it('returns an IDENTICAL refusal for an unknown identifier and a wrong credential', async () => {
    const unknownIdentifier = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'nobody-here@example.com', password: SEED_PASSWORD },
    })

    await clearThrottle()

    const wrongCredential = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: 'not-the-password' },
    })

    expect(unknownIdentifier.statusCode).toBe(wrongCredential.statusCode)
    expect(unknownIdentifier.json()).toEqual(wrongCredential.json())
  })

  it('rejects a malformed request through the route schema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'not-an-email', password: '' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('never writes the submitted credential to sign_in_attempts (FR-031c)', async () => {
    const secret = 'a-very-distinctive-wrong-password'
    await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: secret },
    })

    const { getDb } = await import('../../src/db/client.js')
    const { signInAttempts } = await import('../../src/db/schema/sign-in-attempts.js')
    const rows = await getDb().select().from(signInAttempts)

    expect(rows.length).toBeGreaterThan(0)
    // `sign_in_attempts.id` is a bigserial, so it arrives as a BigInt that JSON.stringify
    // refuses outright. Coerce it — the assertion is about the *other* columns.
    const serialised = JSON.stringify(rows, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    )
    expect(serialised).not.toContain(secret)
    // FR-042 — no readable address either, only a keyed hash.
    expect(serialised).not.toContain(ADA)
  })
})
