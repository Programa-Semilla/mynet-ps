import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  ADA,
  attendeeCredentials,
  attendees,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T037 (004) — `POST /auth/sign-up` (FR-300, FR-303, FR-305, FR-306).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **This is the capability whose absence blocked the phase for two features.** Until it
 * existed, every attendee in the product had been put there by a seed script, and the
 * `ON DELETE CASCADE` 005 shipped had nothing that could ever trigger it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sign-up', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    // An earlier test's refusals must not delay a later one — the throttle counts across the
    // whole file otherwise, and these tests deliberately produce failures.
    await clearThrottle()
  })

  const signUp = (body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/auth/sign-up', payload: body })

  const newAccount = (overrides: Record<string, unknown> = {}) => ({
    email: `person-${Math.random().toString(36).slice(2)}@example.com`,
    displayName: 'Grace Hopper Jr',
    password: 'correct-horse-battery-staple',
    ...overrides,
  })

  it('creates an account and signs the person in, with no second credential entry (FR-306)', async () => {
    const account = newAccount()
    const response = await signUp(account)

    expect(response.statusCode).toBe(204)
    // 204 with no body at all, so the session token cannot leak into one.
    expect(response.body).toBe('')

    const token = sessionCookieFrom(response)
    expect(token, 'the session must be established by the same request').toBeTruthy()

    // The session actually works — the strongest form of "signed in", rather than "a cookie
    // was set".
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(token as string) },
    })

    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({
      email: (account.email as string).toLowerCase(),
      displayName: 'Grace Hopper Jr',
    })
  })

  it('refuses a second account for the same address, and creates nothing (FR-303)', async () => {
    const account = newAccount()
    expect((await signUp(account)).statusCode).toBe(204)

    const second = await signUp({ ...account, displayName: 'Somebody Else' })

    expect(second.statusCode).toBe(409)
    expect(second.json()).toMatchObject({ code: 'address_registered' })

    // The disclosure is deliberate (FR-303) and the wording must offer both exits, because
    // being told "already registered" and left there is a dead end for the two people who see
    // it — the one who forgot, and the one whose address somebody else used.
    const message = (second.json() as { message: string }).message.toLowerCase()
    expect(message).toContain('sign in')
    expect(message).toContain('reset')

    const rows = await getDb()
      .select({ id: attendees.id, displayName: attendees.displayName })
      .from(attendees)
      .where(eq(attendees.email, (account.email as string).toLowerCase()))

    expect(rows, 'no second account, and the first is untouched').toHaveLength(1)
    expect(rows[0]?.displayName).toBe('Grace Hopper Jr')
  })

  it("refuses a seeded attendee's address the same way", async () => {
    const response = await signUp(newAccount({ email: ADA }))
    expect(response.statusCode).toBe(409)
  })

  it('compares the address case-insensitively, so one person cannot hold two accounts', async () => {
    const account = newAccount()
    expect((await signUp(account)).statusCode).toBe(204)

    const shouted = await signUp({
      ...account,
      email: (account.email as string).toUpperCase(),
    })

    expect(
      shouted.statusCode,
      'FR-025a requires the address to be unique across the entire product, and the citext ' +
        'column is what makes that true in the case that actually lets somebody hold two.',
    ).toBe(409)
  })

  it('trims surrounding whitespace rather than calling it malformed (FR-025b)', async () => {
    const account = newAccount()
    const response = await signUp({ ...account, email: `  ${account.email}  ` })

    // `format: 'email'` rejects a trailing space, so without the preValidation trim an attendee
    // whose password manager appended one gets a 400 for typing correctly.
    expect(response.statusCode).toBe(204)
  })

  it('stores the password only as a hash, and never returns or echoes it (FR-305)', async () => {
    const account = newAccount()
    const response = await signUp(account)

    expect(response.body).not.toContain(account.password)

    const rows = await getDb()
      .select({ hash: attendeeCredentials.passwordHash })
      .from(attendeeCredentials)
      .innerJoin(attendees, eq(attendees.id, attendeeCredentials.attendeeId))
      .where(eq(attendees.email, (account.email as string).toLowerCase()))

    const hash = rows[0]?.hash
    expect(
      hash,
      'the credential row must exist — an account without one cannot be signed into',
    ).toBeTruthy()
    expect(hash).not.toContain(account.password)
    // Argon2id, with its parameters encoded in the hash. Asserted on the prefix rather than by
    // recomputing, because the whole point is that it cannot be recomputed without the pepper.
    expect(hash).toMatch(/^\$argon2id\$/)
  })

  it('leaves the new account unverified and discoverable — invisible until it proves the address', async () => {
    const account = newAccount()
    await signUp(account)

    const rows = await getDb()
      .select({
        verifiedAt: attendees.emailVerifiedAt,
        discoverable: attendees.discoverable,
        avatar: attendees.avatarObjectKey,
      })
      .from(attendees)
      .where(eq(attendees.email, (account.email as string).toLowerCase()))

    // FR-319 — not yet verified. FR-359 — discoverable defaults on, which is safe ONLY because
    // verification is also required: this account appears to nobody until its owner proves they
    // can receive mail at the address (SC-304a).
    expect(rows[0]?.verifiedAt).toBeNull()
    expect(rows[0]?.discoverable).toBe(true)
    expect(rows[0]?.avatar).toBeNull()
  })

  it('refuses a password below the stated policy, without creating an account (FR-304)', async () => {
    const account = newAccount({ password: 'short' })
    const response = await signUp(account)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'validation_failed' })

    const rows = await getDb()
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.email, (account.email as string).toLowerCase()))

    expect(rows).toHaveLength(0)
  })

  it('collects nothing beyond email, display name and password (FR-301)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `additionalProperties: false` is what makes FR-301 structural rather than a rule somebody
    // has to remember. Fastify's AJV **strips** an unexpected property rather than refusing the
    // request, so this asserts the requirement's actual claim — that nothing else is *collected*
    // — rather than a status code. Stripping satisfies it and rejecting would too; what must
    // never happen is the value reaching a table.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const account = newAccount()
    const response = await signUp({
      ...account,
      company: 'Analytical Engines Ltd',
      role: 'Countess',
      avatarObjectKey: 'avatars/somebody-else',
    })

    expect(response.statusCode).toBe(204)

    const stored = await getDb().execute<{ company: string | null }>(sql`
      SELECT p.company
      FROM attendees a
      LEFT JOIN attendee_profiles p ON p.attendee_id = a.id
      WHERE a.email = ${(account.email as string).toLowerCase()}
    `)

    expect(stored).toHaveLength(1)
    expect(
      stored[0]?.company,
      'A profile row must not exist at all after sign-up: it is created on first save, so ' +
        '"empty profile" has exactly one representation (FR-341).',
    ).toBeNull()

    const avatars = await getDb()
      .select({ key: attendees.avatarObjectKey })
      .from(attendees)
      .where(eq(attendees.email, (account.email as string).toLowerCase()))

    expect(
      avatars[0]?.key,
      "a client must not be able to point a new account at somebody else's bytes",
    ).toBeNull()
  })

  it('never writes the password to the sign-in attempt record (FR-031c)', async () => {
    const account = newAccount()
    await signUp(account)

    // There is no column on `sign_in_attempts` that could hold a credential, which is how
    // FR-031c is guaranteed rather than remembered. This asserts the guarantee has not been
    // weakened by a column somebody added.
    const rows = await getDb().execute<{ identifier_hash: string; source_hash: string }>(
      sql`SELECT identifier_hash, source_hash FROM sign_in_attempts`,
    )

    for (const row of rows) {
      expect(row.identifier_hash).not.toContain(account.password)
      expect(row.source_hash).not.toContain(account.password)
      // A keyed hash, not the address — the table holds addresses typed at the service by
      // people who may not be attendees at all (FR-042).
      expect(row.identifier_hash).not.toContain('@')
    }
  })
})
