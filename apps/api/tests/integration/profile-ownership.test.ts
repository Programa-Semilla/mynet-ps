import type { RouteOptions } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { SEED_ATTENDEES } from '../../src/db/seed/attendees.js'
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
 * T069 (004) — **no path edits another attendee's profile** (FR-335, FR-339).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * This is asserted **structurally and behaviourally**, because the two catch different things.
 *
 * The behavioural half exercises the routes that exist: no combination of body, path or query
 * lets Ada write Grace's profile. It would keep passing if somebody added a new route that did.
 *
 * The structural half walks the real application's route table and asserts that **no profile
 * route names an attendee identifier at all**. That is what catches the route nobody has
 * written yet — and it is the same technique 002's event-scope audit uses, for the same reason:
 * seven features after this one will add surfaces, each written by somebody who has not read
 * this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a profile is editable by its owner and by nobody else (FR-335)', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const signIn = async (email: string) =>
    sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: SEED_PASSWORD },
      }),
    ) as string

  beforeEach(async () => {
    await clearThrottle()
    ada = await signIn(ADA)
    grace = await signIn(GRACE)
  })

  const readAs = (token: string) =>
    app.inject({ method: 'GET', url: '/profile', headers: { cookie: cookieHeader(token) } })

  it("writes only the caller's own profile, whatever identifier the body carries", async () => {
    const graceBefore = (await readAs(grace)).json() as { company: string | null }

    // Every shape a caller might try. `additionalProperties: false` strips each of them, and
    // the handler reads `request.attendee` regardless — so none can redirect the write.
    for (const smuggled of [
      { attendeeId: 'grace' },
      { attendee_id: 'grace' },
      { email: GRACE },
      { id: 'grace' },
      { target: GRACE },
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/profile',
        headers: { cookie: cookieHeader(ada) },
        payload: { company: 'Written By Ada', ...smuggled },
      })
      expect(response.statusCode).toBe(200)
    }

    const graceAfter = (await readAs(grace)).json() as { company: string | null }
    expect(
      graceAfter.company,
      "Grace's profile must be exactly as she left it, however Ada addressed the request.",
    ).toBe(graceBefore.company)

    const adaAfter = (await readAs(ada)).json() as { company: string | null }
    expect(adaAfter.company).toBe('Written By Ada')
  })

  it('exposes NO profile route carrying an attendee identifier', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The structural half. `/profile` is bound to the session and has nowhere to put an
    // identifier; a route like `PUT /profile/:attendeeId` or `PUT /attendees/:id/profile` would
    // pass every behavioural test above by simply not being exercised by it.
    //
    // `GET /events/:eventId/attendees/:attendeeId` is the one route that legitimately names an
    // attendee — it READS a co-attendee's profile under three server-side conditions — and it
    // is allowed here by method rather than by name, because a *write* to that address would be
    // exactly the breach this asserts against.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const routes: RouteOptions[] = []
    const audited = await buildApp({ onRoute: (route) => routes.push(route) })
    await audited.close()

    const methodsOf = (route: RouteOptions): string[] =>
      Array.isArray(route.method) ? route.method : [route.method]

    const offending = routes
      .filter((route) => /:attendeeId|\{attendeeId\}|:userId|:personId/.test(route.url))
      .filter((route) => methodsOf(route).some((method) => method !== 'GET' && method !== 'HEAD'))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      offending,
      'A write route naming an attendee is a route that can edit somebody else (FR-335). The ' +
        'attendee is bound at the request boundary from the sign-in session and nowhere else.',
    ).toEqual([])
  })

  it('exposes no profile write route at all outside /profile', async () => {
    const routes: RouteOptions[] = []
    const audited = await buildApp({ onRoute: (route) => routes.push(route) })
    await audited.close()

    const methodsOf = (route: RouteOptions): string[] =>
      Array.isArray(route.method) ? route.method : [route.method]

    const writes = routes
      .filter((route) => /profile/i.test(route.url))
      .filter((route) =>
        methodsOf(route).some((method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
      )
      .map((route) => route.url)

    for (const url of writes) {
      expect(
        url.startsWith('/profile'),
        `${url} writes a profile from an address other than /profile, which is the one address ` +
          'the session binds. If this is intentional, it needs a recorded decision.',
      ).toBe(true)
    }
  })

  it('lets no seed process set networking intent or availability for the bare attendee (FR-339)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // FR-339 makes intent and availability **attendee-authored**: no seed process and no other
    // attendee may set them. The seeded fixtures Ada and Grace have them because they are
    // fixtures standing in for people who authored their own; the third seeded attendee has
    // nothing at all, which is what proves the seed is not *required* to set them.
    //
    // The stronger reading — that no seed may set them for anybody — would make FR-342's
    // "seeded attendees MUST be given profile data" unsatisfiable, so this asserts the property
    // that both requirements can hold: an account exists whose intent nobody chose for them.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const bare = SEED_ATTENDEES.find(
      (attendee) => attendee.email !== ADA && attendee.email !== GRACE,
    )
    expect(bare, 'the seed must include an attendee who has authored nothing (D6)').toBeDefined()

    const token = await signIn(bare!.email)
    const profile = (await readAs(token)).json() as {
      networkingIntent: string | null
      availability: string | null
      company: string | null
    }

    expect(profile.networkingIntent).toBeNull()
    expect(profile.availability).toBeNull()
    expect(profile.company).toBeNull()
  })

  it("never returns another attendee's data from /profile", async () => {
    const adasProfile = (await readAs(ada)).body

    expect(adasProfile).not.toContain(GRACE)
    expect(adasProfile).not.toContain('Grace Hopper')
    expect(adasProfile).not.toContain('Naval Systems Group')
  })
})
