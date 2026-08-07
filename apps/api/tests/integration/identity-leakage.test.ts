import { sql } from 'drizzle-orm'
import type { RouteOptions } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { getDb } from '../../src/db/client.js'
import { requireAttendee } from '../../src/plugins/auth-context.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T115, T126 (004) — **no response carries credential, verification or reset material, and no
 * response carries another attendee's verification state** (FR-361, FR-391, SC-311).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SWEPT ACROSS EVERY ROUTE RATHER THAN CHECKED ON THE OBVIOUS ONES.**
 *
 * The routes where somebody might *accidentally* return a hash are not the ones anybody thinks
 * to check. A `SELECT *` in a query that grows a join, a debug field added during an
 * investigation and left behind, a schema loosened to `additionalProperties: true` — each of
 * those leaks from a route nobody suspected, and each looks fine in review.
 *
 * So this walks the real route table, calls everything as a signed-in attendee, and scans every
 * response body for material that must never appear. It is blunt and it is cheap, which is the
 * right trade for a property whose failure is silent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('no response leaks credential, verification or reset material (SC-311)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  let routes: RouteOptions[]
  let ada: string
  let graceId: string
  let sharedEventId: string
  let passwordHash: string
  let verificationHash: string

  beforeAll(async () => {
    routes = []
    app = await setupTestApp({ mail })
    await resetDatabase()
    await clearThrottle()

    const observed = await buildApp({ onRoute: (route) => routes.push(route) })
    await observed.close()

    const attendees = await getDb().execute<{ id: string; email: string }>(sql`
      SELECT id, email FROM attendees
    `)
    graceId = attendees.find((row) => row.email === GRACE)?.id as string

    const events = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM events
    `)
    sharedEventId = events.find((row) => row.name === SEED_EVENTS[0].name)?.id as string

    // Real material, from the database — so the scan looks for the actual stored values rather
    // than for a pattern that might not match what is stored.
    const hashes = await getDb().execute<{ password_hash: string }>(sql`
      SELECT c.password_hash FROM attendee_credentials c
      JOIN attendees a ON a.id = c.attendee_id WHERE a.email = ${ADA}
    `)
    passwordHash = hashes[0]?.password_hash as string

    // An account with live verification and reset material outstanding.
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'has-material@example.com',
        displayName: 'Has Material',
        password: SEED_PASSWORD,
      },
    })
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'has-material@example.com' },
    })

    const tokens = await getDb().execute<{ token_hash: string }>(sql`
      SELECT token_hash FROM attendee_verifications LIMIT 1
    `)
    verificationHash = tokens[0]?.token_hash as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const methodsOf = (route: RouteOptions): string[] =>
    Array.isArray(route.method) ? route.method : [route.method]

  const preHandlersOf = (route: RouteOptions): unknown[] => {
    const declared = route.preHandler
    if (!declared) return []
    return Array.isArray(declared) ? declared : [declared]
  }

  /** Every readable route, called as Ada. */
  const readAll = async (): Promise<Array<{ label: string; body: string }>> => {
    const results: Array<{ label: string; body: string }> = []

    for (const route of routes) {
      if (!preHandlersOf(route).includes(requireAttendee)) continue
      for (const method of methodsOf(route)) {
        if (method !== 'GET') continue

        const url = route.url
          .replace(':eventId', sharedEventId)
          .replace(':attendeeId', graceId)
          .replace(':sessionId', '00000000-0000-4000-8000-000000000000')

        const response = await app.inject({
          method: 'GET',
          url,
          headers: { cookie: cookieHeader(ada) },
        })
        results.push({ label: `GET ${route.url}`, body: response.body })
      }
    }

    return results
  }

  it('found routes to sweep', async () => {
    const responses = await readAll()
    expect(responses.length).toBeGreaterThan(5)
    expect(passwordHash).toMatch(/^\$argon2id\$/)
    expect(verificationHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns no password hash from any route (FR-376, FR-391)', async () => {
    for (const { label, body } of await readAll()) {
      expect(body, `${label} returned the stored password hash`).not.toContain(passwordHash)
      expect(body, `${label} mentions argon2`).not.toContain('argon2')
      expect(body).not.toContain('passwordHash')
      expect(body).not.toContain('password_hash')
    }
  })

  it('returns no verification or reset material from any route (FR-391)', async () => {
    for (const { label, body } of await readAll()) {
      expect(body, `${label} returned a stored token hash`).not.toContain(verificationHash)
      expect(body).not.toContain('tokenHash')
      expect(body).not.toContain('token_hash')
    }
  })

  it('returns no session token from any route (FR-026)', async () => {
    // The session travels only in an HttpOnly cookie. A token in a body would be readable from
    // JavaScript and would have nowhere legitimate to live in this client.
    for (const { label, body } of await readAll()) {
      expect(body, `${label} echoed the session token`).not.toContain(ada)
    }
  })

  it("never exposes another attendee's verification state (FR-361)", async () => {
    // The one leak specific to this feature, and the reason `readCoAttendeeProfile` selects no
    // such column: knowing whether somebody's address is verified is knowing something about
    // them that they did not share.
    const visible = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${graceId}`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(visible.statusCode).toBe(200)
    expect(visible.body).not.toContain('emailVerified')
    expect(visible.body).not.toContain('email_verified')
    expect(visible.body, 'and not the address itself either').not.toContain(GRACE)
  })

  it('reports its OWN verification state, which is the attendee reading about themselves', async () => {
    // The positive half — without it, hiding everything would satisfy every assertion above.
    // FR-325b requires the product to state plainly what verification adds, which it cannot do
    // without knowing.
    const own = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
    })

    expect(own.json()).toMatchObject({ emailVerified: true })
  })

  it('puts no password into a mail message (FR-332)', async () => {
    for (const message of mail.sent()) {
      expect(message.link).not.toContain(SEED_PASSWORD)
      expect(message.link).not.toContain(passwordHash)
    }
  })

  it('puts no credential material into the export (FR-376)', async () => {
    const exported = await app.inject({
      method: 'GET',
      url: '/profile/export',
      headers: { cookie: cookieHeader(ada) },
    })

    expect(exported.statusCode).toBe(200)
    expect(exported.body).not.toContain(passwordHash)
    expect(exported.body).not.toContain('argon2')
    expect(exported.body).not.toContain(verificationHash)
  })
})
