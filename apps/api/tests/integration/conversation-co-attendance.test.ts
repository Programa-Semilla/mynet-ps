import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
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
 * T035 (007) — **co-attendance is required to open a conversation, and its refusal is
 * indistinguishable from "no such person"** (FR-504, FR-506).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE INDISTINGUISHABILITY MATTERS MORE HERE THAN ANYWHERE ELSE IN THE FEATURE.**
 *
 * This route takes an attendee identifier in its body — the narrowing exception the contract
 * records — so a caller can put *any* uuid in it and read the answer. If "no such attendee" and
 * "real attendee, no conference in common" produced different statuses or different bodies, this
 * route would be an oracle answering **"is this identifier a real MyNet attendee?"** against a
 * world-readable repository with public self sign-up.
 *
 * So all of these answer the same 404 with the same body:
 *
 *   - a uuid nobody holds,
 *   - a real attendee who shares no conference,
 *   - a malformed identifier,
 *   - the caller themselves (FR-506).
 *
 * The test asserts the **bodies are byte-identical**, not merely that each is a 404. A shared
 * status with a differing `message` leaks exactly as much as a differing status would.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Discoverability is deliberately NOT part of this condition** (FR-504b). That divergence from
 * 006's visibility rule is a declared owner decision, and the last test here is what stops a
 * later reader "fixing" the inconsistency by adding the check.
 */
describe('opening a conversation requires a conference in common', () => {
  let app: FastifyInstance
  let adaCookie: string
  let adaId: string
  /** Signed up during the run, so registered for nothing at all. */
  let strangerId: string
  let strangerCookie: string

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}.`)
    return token
  }

  const idOf = async (cookie: string): Promise<string> => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { id: string }).id
  }

  const open = (cookie: string, attendeeId: string) =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId, body: 'Hello.' },
    })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    adaId = await idOf(adaCookie)

    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `stranger-${randomUUID()}@example.com`,
        displayName: 'A Stranger',
        password: SEED_PASSWORD,
      },
    })
    const token = sessionCookieFrom(signUp)
    if (!token) throw new Error(`Stranger sign-up failed: ${signUp.body}`)
    strangerCookie = token
    strangerId = await idOf(strangerCookie)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: the stranger exists and is registered for nothing', async () => {
    // Without this, every refusal below could be passing because the stranger does not exist.
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM registrations WHERE attendee_id = ${strangerId}::uuid
    `)
    expect(rows[0]?.count).toBe('0')

    const exists = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE id = ${strangerId}::uuid
    `)
    expect(exists[0]?.count).toBe('1')
  })

  it('refuses a real attendee with no conference in common, with 404', async () => {
    const response = await open(adaCookie, strangerId)

    expect(response.statusCode).toBe(404)
    expect(await conversationCount()).toBe(0)
  })

  it('answers a nonexistent attendee, a stranger, a malformed id and SELF identically', async () => {
    const responses = {
      nonexistent: await open(adaCookie, randomUUID()),
      stranger: await open(adaCookie, strangerId),
      malformed: await open(adaCookie, 'not-a-uuid'),
      // FR-506. Co-attendance is trivially satisfied by oneself, so this needs its own refusal —
      // and it must be the same refusal, or the route reports "that is you" to anybody probing.
      self: await open(adaCookie, adaId),
    }

    for (const [label, response] of Object.entries(responses)) {
      expect(response.statusCode, `${label} must answer 404`).toBe(404)
    }

    const bodies = Object.values(responses).map((response) => response.body)
    expect(
      new Set(bodies).size,
      'The four refusals must be byte-identical. A shared status with a differing message ' +
        'leaks exactly as much as a differing status would — this route would become an ' +
        '"is this a real attendee" oracle against a public sign-up (FR-504).',
    ).toBe(1)
  })

  it('writes nothing at all for any refused attempt', async () => {
    expect(await conversationCount()).toBe(0)

    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM conversation_participants`,
    )
    expect(rows[0]?.count).toBe('0')
  })

  it('the stranger cannot reach Ada either — the condition is symmetric', async () => {
    const response = await open(strangerCookie, adaId)
    expect(response.statusCode).toBe(404)
    expect(await conversationCount()).toBe(0)
  })

  it('does NOT require the recipient to be discoverable or verified (FR-504b)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Alan is seeded unverified and shares the summit with Ada. 006's directory would refuse to
    // show him; messaging deliberately does not apply that condition, on the recorded decision
    // that discoverability governs whether a person is *listed*, not whether they are
    // reachable.
    //
    // This test exists so that the divergence cannot be quietly "fixed" into consistency with
    // Discover. If it starts failing, the requirement changed and this file should be the thing
    // that says so.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const alan = await getDb().execute<{ id: string }>(
      sql`SELECT id FROM attendees WHERE email = 'alan@example.com'`,
    )
    const alanId = alan[0]?.id
    expect(alanId, 'the seed must still contain Alan').toBeDefined()

    const response = await open(adaCookie, alanId as string)
    expect(
      response.statusCode,
      'Alan is unverified and has no profile. He is still a co-attendee, and FR-504b makes ' +
        'that sufficient.',
    ).toBe(201)
  })

  const conversationCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM conversations`,
    )
    return Number(rows[0]?.count ?? '0')
  }
})
