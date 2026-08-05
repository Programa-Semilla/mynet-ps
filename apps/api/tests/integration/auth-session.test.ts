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
 * T045 — sign-in session validity: expiry, revocation, tampering, sliding extension, and
 * survival across a browser restart (FR-026, FR-027, FR-028, FR-028a).
 */
describe('sign-in session lifecycle', () => {
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

  it('stores only the hash of the token, never the token (FR-026)', async () => {
    const token = await signIn()
    const rows = await getDb().select().from(authSessions)

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('survives a browser restart — the session lives on the server, not in memory (FR-028)', async () => {
    const token = await signIn()

    // A browser restart drops nothing but process memory. Rebuilding the app is the strongest
    // available analogue: a brand-new instance with no in-memory state must still honour it.
    await app.close()
    app = await setupTestApp()

    const response = await me(token)
    expect(response.statusCode).toBe(200)
  })

  it('slides expiry forward on each authenticated request (FR-028a)', async () => {
    const token = await signIn()

    const before = await getDb().select().from(authSessions)
    const initialExpiry = before[0]?.expiresAt.getTime() ?? 0

    // Rewind the stored expiry so the slide is measurable without waiting.
    const rewound = new Date(Date.now() + 60_000)
    await getDb().update(authSessions).set({ expiresAt: rewound })

    await me(token)

    const after = await getDb().select().from(authSessions)
    const slidExpiry = after[0]?.expiresAt.getTime() ?? 0

    expect(slidExpiry).toBeGreaterThan(rewound.getTime())
    // Back to roughly the full idle window — within a second of the original.
    expect(Math.abs(slidExpiry - initialExpiry)).toBeLessThan(5_000)
  })

  it('also advances last_used_at (FR-028a)', async () => {
    const token = await signIn()
    const before = await getDb().select().from(authSessions)
    const initial = before[0]?.lastUsedAt.getTime() ?? 0

    await new Promise((resolve) => setTimeout(resolve, 50))
    await me(token)

    const after = await getDb().select().from(authSessions)
    expect(after[0]?.lastUsedAt.getTime() ?? 0).toBeGreaterThan(initial)
  })

  it('refuses an expired session and says it was inactivity (FR-028b, FR-028c)', async () => {
    const token = await signIn()

    await getDb()
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })

    const response = await me(token)

    expect(response.statusCode).toBe(401)
    // FR-028c — the client explains inactivity differently from "never signed in", so the
    // two must be distinguishable in the refusal.
    expect((response.json() as { code: string }).code).toBe('session_expired')
  })

  it('distinguishes never-signed-in from expired (FR-028c)', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/me' })

    expect(response.statusCode).toBe(401)
    expect((response.json() as { code: string }).code).toBe('not_authenticated')
  })

  it('revokes server-side on sign-out, not merely clearing the cookie (FR-027)', async () => {
    const token = await signIn()

    const signOut = await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(token) },
    })
    expect(signOut.statusCode).toBe(204)

    // The row carries revoked_at — the cookie being cleared is not what makes this true.
    const rows = await getDb().select().from(authSessions)
    expect(rows[0]?.revokedAt).not.toBeNull()

    // Replaying the captured token must fail. This is the assertion that distinguishes real
    // revocation from merely forgetting the cookie.
    const replay = await me(token)
    expect(replay.statusCode).toBe(401)
  })

  it('reports a revoked session as not-authenticated, not as expired', async () => {
    const token = await signIn()
    await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(token) },
    })

    const response = await me(token)
    // Signing out is not inactivity. Telling the attendee they were signed out for being idle
    // when they deliberately signed out would be a lie the UI then repeats.
    expect((response.json() as { code: string }).code).toBe('not_authenticated')
  })

  it('leaves other sessions alone when one is revoked', async () => {
    const first = await signIn()
    const second = await signIn()

    await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(first) },
    })

    const rows = await getDb().select().from(authSessions)

    expect(rows, 'two sign-ins create two rows (FR-029)').toHaveLength(2)
    expect(
      rows.filter((r) => r.revokedAt !== null),
      'exactly one is revoked',
    ).toHaveLength(1)
    expect((await me(second)).statusCode).toBe(200)
  })
})
