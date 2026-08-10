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
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T113 (004) — **every route this feature adds, unauthenticated and cross-attendee**
 * (FR-385, FR-386, SC-307).
 *
 * **007 inherits this rather than reproducing it, and FR-525 is what it inherits.** That
 * requirement — an attendee's identity for every message operation is bound from the sign-in
 * session, and no conversation, message or unread operation accepts an attendee identifier from
 * the client — is 001's rule restated for a new domain. It needs no test of its own precisely
 * because this one reads the route table from the running application: 007's routes are covered
 * by it the moment they register, and a route that took its acting attendee from the client
 * would fail here as the wrong attendee reaching another's data.
 *
 * The `attendeeId` that `POST /conversations` and `POST /blocks` accept is the **counterpart**,
 * never the caller. FR-525 is about who you are, not who you are addressing.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ROUTE LIST IS READ FROM THE RUNNING APPLICATION, NOT WRITTEN OUT BY HAND.**
 *
 * SC-307 measures *100% of routes*, and a hand-maintained list cannot honestly claim a
 * percentage of anything: it covers what somebody remembered on the day. Walking the real
 * route table means a route added by 006 through 009 is covered by this the moment it exists,
 * which is the only way a "100%" claim stays true after the feature that made it ships.
 *
 * The exercise is deliberately blunt — call everything with no session, then call everything as
 * the wrong attendee. Blunt is the point: the interesting failures here are not subtle logic
 * errors but a missing `preHandler` on one route out of fourteen.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('every route is bound to the authenticated attendee (SC-307)', () => {
  let app: FastifyInstance
  let routes: RouteOptions[]
  let ada: string
  let grace: string
  let graceId: string
  let sharedEventId: string
  let gracesOwnEventId: string

  beforeAll(async () => {
    routes = []
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    // A second instance purely to observe the route table — `onRoute` only sees routes
    // registered after the hook is added, so the harness's app cannot report its own.
    const observed = await buildApp({ onRoute: (route) => routes.push(route) })
    await observed.close()

    const attendees = await getDb().execute<{ id: string; email: string }>(sql`
      SELECT id, email FROM attendees
    `)
    graceId = attendees.find((row) => row.email === GRACE)?.id as string

    const events = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM events ORDER BY name
    `)
    // Ada and Grace share the summit; Systems & Scale is Grace's alone.
    sharedEventId = events.find((row) => row.name === 'Product & Design Summit')?.id as string
    gracesOwnEventId = events.find((row) => row.name === 'Systems & Scale')?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const signIn = async (email: string) =>
      sessionCookieFrom(
        await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: { email, password: SEED_PASSWORD },
        }),
      ) as string

    ada = await signIn(ADA)
    grace = await signIn(GRACE)
  })

  const methodsOf = (route: RouteOptions): string[] =>
    Array.isArray(route.method) ? route.method : [route.method]

  const preHandlersOf = (route: RouteOptions): unknown[] => {
    const declared = route.preHandler
    if (!declared) return []
    return Array.isArray(declared) ? declared : [declared]
  }

  /** Every authenticated route, with its parameters filled in so it can actually be called. */
  const authenticatedCalls = (): Array<{
    method: string
    url: string
    label: string
    /** Whether Fastify will validate a body before the guard runs. See the 401 assertion. */
    declaresBody: boolean
  }> =>
    routes
      .filter((route) => preHandlersOf(route).includes(requireAttendee))
      .flatMap((route) =>
        methodsOf(route)
          .filter((method) => method !== 'HEAD')
          .map((method) => ({
            method,
            url: route.url
              .replace(':eventId', sharedEventId)
              .replace(':attendeeId', graceId)
              .replace(':sessionId', '00000000-0000-4000-8000-000000000000'),
            label: `${method} ${route.url}`,
            declaresBody: (route.schema as { body?: unknown } | undefined)?.body !== undefined,
          })),
      )

  it('found routes to exercise — a gate that cannot fail is not a gate', () => {
    expect(routes.length).toBeGreaterThan(15)
    expect(authenticatedCalls().length).toBeGreaterThan(10)
  })

  it('never SUCCEEDS on any authenticated route without a session (FR-386)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Refusal, not a particular status.** Fastify runs schema validation BEFORE the
    // `preHandler` chain, so an unauthenticated caller sending a malformed body is answered
    // `400` rather than `401` — the guard never runs, because there is nothing well-formed to
    // guard. That is a refusal and it discloses nothing an unauthenticated caller could not
    // already read out of the generated contract, which is public.
    //
    // What must never happen is a 2xx, and that is what this asserts. The stricter
    // "specifically 401" claim is made below, on the routes that take no body and therefore
    // reach the guard every time.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const accepted: string[] = []

    for (const call of authenticatedCalls()) {
      const response = await app.inject({
        method: call.method as 'GET',
        url: call.url,
        payload: {},
      })
      if (response.statusCode < 400) accepted.push(`${call.label} → ${response.statusCode}`)
    }

    expect(
      accepted,
      'These SUCCEEDED for a caller with no session. Every one of them reads or writes attendee ' +
        'data (FR-386, SC-307).',
    ).toEqual([])
  })

  it('answers 401 specifically wherever the guard is actually reached', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Routes that declare no body**, so schema validation cannot pre-empt the guard and the
    // status is unambiguously about identity.
    //
    // This used to select `GET` and `DELETE` by method, on the reasoning that neither carries a
    // body. **007 falsified that**: `DELETE /blocks` and `DELETE /push/subscriptions` both take
    // one, because a write route naming an attendee in its URL is forbidden outright by the route
    // audit — so the target had to move into the body, and the method stopped predicting the
    // shape.
    //
    // Read from the route's own schema instead, which is the fact the assertion actually depends
    // on. The two body-carrying DELETEs are still covered by the "never succeeds" assertion
    // above, which is the guarantee that matters; what they cannot support is the *stricter*
    // claim about which refusal comes back first.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const bodyless = authenticatedCalls().filter((call) => !call.declaresBody)

    expect(bodyless.length).toBeGreaterThan(5)

    for (const call of bodyless) {
      const response = await app.inject({ method: call.method as 'GET', url: call.url })
      expect(response.statusCode, `${call.label} answered ${response.statusCode}`).toBe(401)
      expect(response.json()).toMatchObject({ code: 'not_authenticated' })
    }
  })

  it('refuses a session that has been revoked', async () => {
    // A signed-out token is not merely forgotten by the browser — `sign-out` revokes it
    // server-side, and every route must honour that immediately (FR-027).
    await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(ada) },
    })

    for (const call of authenticatedCalls()) {
      const response = await app.inject({
        method: call.method as 'GET',
        url: call.url,
        headers: { cookie: cookieHeader(ada) },
        payload: {},
      })
      // Refusal rather than a particular status — see the note above on validation ordering.
      expect(
        response.statusCode,
        `${call.label} accepted a revoked session`,
      ).toBeGreaterThanOrEqual(400)
    }
  })

  it('refuses a fabricated session token', async () => {
    const forged = 'a'.repeat(43)

    for (const call of authenticatedCalls()) {
      const response = await app.inject({
        method: call.method as 'GET',
        url: call.url,
        headers: { cookie: cookieHeader(forged) },
        payload: {},
      })
      // Only the hash was ever stored, so a fabricated token simply fails to match — there is
      // nothing to forge (FR-026).
      expect(response.statusCode, `${call.label} accepted a forged token`).toBeGreaterThanOrEqual(
        400,
      )
    }
  })

  it('never lets one attendee reach another conference through a path parameter', async () => {
    // Ada is not registered for Grace's own conference. Every event-scoped route must refuse,
    // identically to a conference that does not exist (FR-148).
    const eventScoped = routes
      .filter((route) => /:eventId/.test(route.url))
      .flatMap((route) =>
        methodsOf(route)
          .filter((method) => method !== 'HEAD')
          .map((method) => ({
            method,
            url: route.url
              .replace(':eventId', gracesOwnEventId)
              .replace(':attendeeId', graceId)
              .replace(':sessionId', '00000000-0000-4000-8000-000000000000'),
            label: `${method} ${route.url}`,
          })),
      )

    expect(eventScoped.length).toBeGreaterThan(5)

    for (const call of eventScoped) {
      const response = await app.inject({
        method: call.method as 'GET',
        url: call.url,
        headers: { cookie: cookieHeader(ada) },
        payload: { body: 'x', joinCode: 'x' },
      })
      expect(response.statusCode, `${call.label} let Ada into Grace's conference`).toBe(404)
    }
  })

  it('never trusts an attendee identifier in a body over the session (FR-385)', async () => {
    // Every shape a client might try, on every authenticated route that takes a body.
    const smuggled = {
      attendeeId: graceId,
      attendee_id: graceId,
      email: GRACE,
      id: graceId,
      userId: graceId,
    }

    for (const call of authenticatedCalls()) {
      if (call.method === 'GET' || call.method === 'DELETE') continue

      await app.inject({
        method: call.method as 'PUT',
        url: call.url,
        headers: { cookie: cookieHeader(ada) },
        payload: { ...smuggled, discoverable: true, body: 'x', joinCode: 'x' },
      })
    }

    // Grace is untouched by every one of those. Asserted on her data rather than on status
    // codes, because a route could answer 200 and still have written to the wrong row.
    const grace_ = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(grace) },
    })

    expect(grace_.json()).toMatchObject({
      email: GRACE,
      displayName: 'Grace Hopper',
      company: 'Naval Systems Group',
    })
  })

  it('serves each attendee their own data on the same address (FR-035)', async () => {
    // The positive half: the routes work, and they work per-attendee. Without this, a suite
    // that refused everything would pass every assertion above.
    const adasProfile = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as { email: string }

    const gracesProfile = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(grace) },
      })
    ).json() as { email: string }

    expect(adasProfile.email).toBe(ADA)
    expect(gracesProfile.email).toBe(GRACE)
  })
})
