import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
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
 * T034 (005) — a session address outside the reader's active conference is refused **without
 * disclosing whether it exists** (FR-204, FR-231, US2 scenario 7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **This is the cost of the one address in the product that names a session.**
 *
 * 002 established that destination addresses stay conference-neutral, so a shared link resolves
 * against the recipient's own active conference. A session address cannot be neutral — a
 * session identifier belongs to exactly one conference — so the specification handled the
 * consequence explicitly rather than leaving it to discovery: the reader is told the session is
 * not available to them, in wording that reveals nothing about whether it exists.
 *
 * The property is asserted **against the server**, not the client, because client wording is
 * presentation and the server is the enforcement (FR-232). A panel that hid the session while
 * the API answered "here it is" would pass a component test and be a disclosure.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('cross-conference session addresses', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  /** Ada's alone — Grace is not registered for it. */
  let horizonsId: string
  /** Grace's alone — Ada is not registered for it. */
  let systemsId: string
  /** Both attendees are registered for this one. */
  let summitId: string

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

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

  const sessionIdsOf = async (eventId: string, cookie: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as Array<{ id: string }>).map((session) => session.id)
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)

    summitId = await eventIdByName('Product & Design Summit')
    horizonsId = await eventIdByName('Frontend Horizons')
    systemsId = await eventIdByName('Systems & Scale')
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('refuses a conference the reader is not registered for', async () => {
    // Grace is not registered for Frontend Horizons.
    const response = await app.inject({
      method: 'GET',
      url: `/events/${horizonsId}/agenda/saved`,
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'not_found', message: 'That is not available.' })
  })

  it('gives the SAME answer for a conference that does not exist at all (FR-231)', async () => {
    const notRegistered = await app.inject({
      method: 'GET',
      url: `/events/${horizonsId}/agenda/saved`,
      headers: { cookie: cookieHeader(graceCookie) },
    })
    const nonexistent = await app.inject({
      method: 'GET',
      url: `/events/00000000-0000-4000-8000-000000000000/agenda/saved`,
      headers: { cookie: cookieHeader(graceCookie) },
    })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Identical status AND identical body. A 403 for "exists but not yours" against a 404 for
    // "does not exist" would let an attendee enumerate every conference in the product by
    // watching which refusal came back.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(nonexistent.statusCode).toBe(notRegistered.statusCode)
    expect(nonexistent.json()).toEqual(notRegistered.json())
  })

  it('refuses a session from ANOTHER conference under a conference the reader may read', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The subtle case, and the one the panel actually hits. Ada *is* registered for both the
    // Summit and Frontend Horizons, so the guard passes and the session genuinely exists and
    // is genuinely hers — it simply is not part of the conference the address names.
    //
    // Ada rather than Grace because Grace's second conference is the deliberately empty
    // programme fixture, which would have made this assert against a session that does not
    // exist: the wrong case, passing for the wrong reason.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const [horizonsSession] = await sessionIdsOf(horizonsId, adaCookie)
    if (!horizonsSession) throw new Error('The seeded Frontend Horizons programme is empty.')

    // The control: the same session, under its own conference, is reachable.
    const allowed = await app.inject({
      method: 'PUT',
      url: `/events/${horizonsId}/agenda/saved/${horizonsSession}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })
    expect(allowed.statusCode).toBe(204)
    await app.inject({
      method: 'DELETE',
      url: `/events/${horizonsId}/agenda/saved/${horizonsSession}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const response = await app.inject({
      method: 'PUT',
      url: `/events/${summitId}/agenda/saved/${horizonsSession}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'not_found', message: 'That is not available.' })
  })

  it('discloses nothing that separates "not yours", "no such session", or "malformed"', async () => {
    const [horizonsSession] = await sessionIdsOf(horizonsId, adaCookie)
    if (!horizonsSession) throw new Error('The seeded Frontend Horizons programme is empty.')

    const responses = await Promise.all(
      [
        // A real session Ada may read, but belonging to a conference other than the one named.
        horizonsSession,
        // A well-formed identifier naming nothing at all.
        '00000000-0000-4000-8000-000000000000',
        // Not an identifier at all.
        'not-a-uuid',
      ].map((sessionId) =>
        app.inject({
          method: 'PUT',
          url: `/events/${summitId}/agenda/saved/${sessionId}`,
          headers: { cookie: cookieHeader(adaCookie) },
        }),
      ),
    )

    const answers = responses.map((response) => ({
      status: response.statusCode,
      body: response.json(),
    }))

    expect(
      answers,
      'All three must be indistinguishable. A `format: uuid` on the route would have made the ' +
        'third a 400 with a validation body — a smaller leak than existence, but still a ' +
        'difference an attacker can read.',
    ).toEqual([answers[0], answers[0], answers[0]])
  })

  it('applies the same refusal to notes as to saves', async () => {
    const [horizonsSession] = await sessionIdsOf(horizonsId, adaCookie)
    if (!horizonsSession) throw new Error('The seeded Frontend Horizons programme is empty.')

    for (const request of [
      {
        method: 'PUT' as const,
        url: `/events/${summitId}/agenda/notes/${horizonsSession}`,
        payload: { body: 'A note against a session that is not in this conference.' },
      },
      { method: 'DELETE' as const, url: `/events/${summitId}/agenda/notes/${horizonsSession}` },
      { method: 'DELETE' as const, url: `/events/${summitId}/agenda/saved/${horizonsSession}` },
    ]) {
      const response = await app.inject({
        ...request,
        headers: { cookie: cookieHeader(adaCookie) },
      })

      expect(response.statusCode, `${request.method} ${request.url}`).toBe(404)
      expect(response.json()).toEqual({ code: 'not_found', message: 'That is not available.' })
    }
  })

  it('lets each attendee reach the conference that IS theirs', async () => {
    // The control. Without it, every assertion above would pass against a route that refused
    // everybody — a gate that cannot distinguish "correctly refused" from "entirely broken".
    for (const [cookie, eventId] of [
      [adaCookie, horizonsId],
      [graceCookie, systemsId],
      [adaCookie, summitId],
      [graceCookie, summitId],
    ] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/agenda/saved`,
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(response.statusCode).toBe(200)
    }
  })
})
