import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

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
 * T044 — **the most important test in this slice** (FR-069, SC-002).
 *
 * Constitution Principle VIII exists because this failure is not recoverable by a later
 * patch: leaked data stays leaked. quickstart.md Scenario 2 is the manual form of what this
 * asserts automatically, and FR-069 requires it to be automated precisely because review
 * alone has been shown to miss it.
 *
 * The test is deliberately hostile. It does not check that the happy path returns the right
 * rows — it tries, by every means the HTTP surface allows, to make the server return somebody
 * else's data, and asserts that none of them work.
 */
describe('attendee data isolation', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaEventNames: string[]
  let graceEventNames: string[]

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}; the test cannot proceed.`)
    return token
  }

  const eventsFor = async (cookie: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode).toBe(200)
    return (response.json() as Array<{ name: string }>).map((e) => e.name)
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaEventNames = await eventsFor(adaCookie)
    graceEventNames = await eventsFor(graceCookie)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the two seeded attendees genuinely differ, or this whole file proves nothing', () => {
    // Guard against the suite passing because both attendees happen to see identical data —
    // every assertion below would then be trivially true.
    expect(adaEventNames.length).toBeGreaterThan(0)
    expect(graceEventNames.length).toBeGreaterThan(0)
    expect(adaEventNames).not.toEqual(graceEventNames)

    const onlyAda = adaEventNames.filter((n) => !graceEventNames.includes(n))
    const onlyGrace = graceEventNames.filter((n) => !adaEventNames.includes(n))
    expect(onlyAda.length, 'Ada must have an event Grace does not').toBeGreaterThan(0)
    expect(onlyGrace.length, 'Grace must have an event Ada does not').toBeGreaterThan(0)
  })

  it('each attendee sees only their own identity', async () => {
    const ada = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const grace = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect((ada.json() as { email: string }).email).toBe(ADA)
    expect((grace.json() as { email: string }).email).toBe(GRACE)
  })

  it('never returns the credential hash (FR-032)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const body = JSON.stringify(response.json())
    expect(body).not.toContain('$argon2')
    expect(body.toLowerCase()).not.toContain('passwordhash')
    expect(body.toLowerCase()).not.toContain('password_hash')
  })

  /**
   * quickstart.md Scenario 2, steps 3–4. The endpoint takes no attendee identifier, so these
   * are attempts to smuggle one in anyway.
   */
  it.each([
    ['a query parameter', '/events?attendeeId='],
    ['a differently-cased query parameter', '/events?attendee_id='],
    ['a repeated query parameter', '/events?attendeeId=&attendeeId='],
  ])('ignores an attendee identifier smuggled in via %s', async (_label, prefix) => {
    // Grace's own id, sent by Ada. If any of these were honoured, Ada would see Grace's data.
    const graceMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(graceCookie) },
    })
    const graceId = (graceMe.json() as { id: string }).id

    const response = await app.inject({
      method: 'GET',
      url: `${prefix}${graceId}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(response.statusCode).toBe(200)
    const names = (response.json() as Array<{ name: string }>).map((e) => e.name)
    expect(names.sort()).toEqual([...adaEventNames].sort())
  })

  it('ignores an attendee identifier smuggled in via a header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: {
        cookie: cookieHeader(adaCookie),
        'x-attendee-id': 'whatever',
        'x-user-id': 'whatever',
      },
    })

    const names = (response.json() as Array<{ name: string }>).map((e) => e.name)
    expect(names.sort()).toEqual([...adaEventNames].sort())
  })

  it('refuses a fabricated session token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader('a-token-that-was-never-issued') },
    })

    expect(response.statusCode).toBe(401)
  })

  it('refuses a tampered session token (FR-026)', async () => {
    // Flip the last character. An opaque random token has no structure to exploit, so this
    // simply fails to match any stored hash.
    const tampered = adaCookie.slice(0, -1) + (adaCookie.at(-1) === 'a' ? 'b' : 'a')

    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(tampered) },
    })

    expect(response.statusCode).toBe(401)
  })

  it('discloses nothing about whether a referenced record exists (FR-036)', async () => {
    const fabricated = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader('completely-made-up-token') },
    })
    const tampered = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(adaCookie.slice(0, -3) + 'zzz') },
    })

    // Identical treatment. A difference would tell an attacker which of their guesses was
    // structurally closer to a real session.
    expect(fabricated.statusCode).toBe(tampered.statusCode)
    expect(fabricated.json()).toEqual(tampered.json())
  })

  it('refuses an unauthenticated request outright', async () => {
    const response = await app.inject({ method: 'GET', url: '/events' })
    expect(response.statusCode).toBe(401)
  })

  /**
   * T070 (002) — **event isolation** (FR-145–FR-150, SC-105).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * 001 proved an attendee cannot reach another attendee's data. 002 introduced an explicit
   * event identifier in the path, which is the first thing in this product a client can name
   * that it might not be entitled to — so this is where that trade gets paid for.
   *
   * **Every route accepting an event identifier is covered**, discovered from the real route
   * table rather than listed by hand, so a route added later without a test here still fails.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('event isolation (002)', () => {
    /**
     * Every per-event route the application actually declares.
     *
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **005 — this carries a METHOD now, and it had to.**
     *
     * The list was a plain array of URL templates, and every assertion below issued a `GET`.
     * That was sufficient while every per-event route was a read; 005 adds four writes, and a
     * coverage gate that can only express reads cannot cover them — it would have forced the
     * new routes to be either omitted (defeating SC-105) or listed and then exercised with the
     * wrong method (passing for the wrong reason).
     *
     * `ok` is the status a *legitimate* request returns, which differs per route: the
     * refusal-parity assertions do not care, but the "serves the conference the attendee IS
     * registered for" one does — and without it that test would have had to drop to "not a
     * 404", which is exactly the weakening this suite exists to prevent.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    interface EventRoute {
      /** The URL as the application declares it, which is what coverage is checked against. */
      readonly template: string
      readonly method: 'GET' | 'PUT' | 'DELETE'
      readonly payload?: Record<string, unknown>
      /** What a legitimate request answers, so the "not over-refusing" half stays strict. */
      readonly ok: number
      /** Undoes a write, so one route's coverage test does not become another's fixture. */
      readonly undo?: { readonly method: 'DELETE'; readonly template: string }
    }

    const EVENT_ROUTES: readonly EventRoute[] = [
      // 002 — the catalog.
      { template: '/events/:eventId/sessions', method: 'GET', ok: 200 },
      { template: '/events/:eventId/tracks', method: 'GET', ok: 200 },
      // 005 — the attendee's own agenda.
      { template: '/events/:eventId/agenda/saved', method: 'GET', ok: 200 },
      {
        template: '/events/:eventId/agenda/saved/:sessionId',
        method: 'PUT',
        ok: 204,
        undo: { method: 'DELETE', template: '/events/:eventId/agenda/saved/:sessionId' },
      },
      { template: '/events/:eventId/agenda/saved/:sessionId', method: 'DELETE', ok: 204 },
      { template: '/events/:eventId/agenda/notes', method: 'GET', ok: 200 },
      {
        template: '/events/:eventId/agenda/notes/:sessionId',
        method: 'PUT',
        payload: { body: 'Written by the isolation suite.' },
        ok: 200,
        undo: { method: 'DELETE', template: '/events/:eventId/agenda/notes/:sessionId' },
      },
      { template: '/events/:eventId/agenda/notes/:sessionId', method: 'DELETE', ok: 204 },
    ]

    const NONEXISTENT = '00000000-0000-0000-0000-000000000000'

    let adaEventIds: string[]
    let graceOnlyEventId: string
    /** A session that really is in Ada's first conference, for the `:sessionId` routes. */
    let adaSessionId: string

    /**
     * Fills a template. `:sessionId` is substituted with a real session only where the request
     * is meant to succeed — every refusal case is refused by the *event* guard before the
     * session is ever looked at, which is itself the property being asserted.
     */
    const urlFor = (template: string, eventId: string, sessionId: string): string =>
      template.replace(':eventId', eventId).replace(':sessionId', sessionId)

    beforeAll(async () => {
      const ada = await app.inject({
        method: 'GET',
        url: '/events',
        headers: { cookie: cookieHeader(adaCookie) },
      })
      const grace = await app.inject({
        method: 'GET',
        url: '/events',
        headers: { cookie: cookieHeader(graceCookie) },
      })

      const adaEvents = ada.json() as Array<{ id: string; name: string }>
      const graceEvents = grace.json() as Array<{ id: string; name: string }>

      adaEventIds = adaEvents.map((e) => e.id)
      const graceOnly = graceEvents.find((e) => !adaEventIds.includes(e.id))
      if (!graceOnly) throw new Error('Seed must give Grace an event Ada does not have.')
      graceOnlyEventId = graceOnly.id

      const programme = await app.inject({
        method: 'GET',
        url: `/events/${adaEventIds[0] ?? ''}/sessions`,
        headers: { cookie: cookieHeader(adaCookie) },
      })
      const first = (programme.json() as Array<{ id: string }>)[0]
      if (!first) throw new Error("Seed must give Ada's first conference a programme.")
      adaSessionId = first.id
    })

    it('covers every route the application declares with an event identifier (SC-105)', async () => {
      // Discovered rather than assumed: if a feature adds a third per-event route and does not
      // add it here, this fails and says so.
      const declared: string[] = []
      const probe = await buildApp({
        onRoute: (route) => {
          if (/:eventId/.test(route.url)) declared.push(route.url)
        },
      })
      await probe.close()

      // Compared as URL sets: `PUT` and `DELETE` on one address are two entries in the list
      // and one declared URL, and both directions of the comparison matter — an uncovered
      // route is an untested scoping boundary, and a covered route that no longer exists is a
      // list that has stopped describing the application.
      const covered = [...new Set(EVENT_ROUTES.map((route) => route.template))]
      expect(
        [...new Set(declared)].sort(),
        'A per-event route exists that this isolation suite does not exercise. Add it to ' +
          'EVENT_ROUTES — an uncovered route is an untested scoping boundary (SC-105).',
      ).toEqual(covered.sort())
    })

    it.each(EVENT_ROUTES)(
      '$method $template — refuses another attendee’s conference IDENTICALLY to a nonexistent one (FR-148)',
      async (route) => {
        // ───────────────────────────────────────────────────────────────────────────────────
        // **Refusal parity is the assertion that matters here.** A 403 for "exists but not
        // yours" and a 404 for "no such conference" would let Ada enumerate every conference in
        // the product by watching which refusal came back. Status *and* body must match.
        // ───────────────────────────────────────────────────────────────────────────────────
        const unregistered = await app.inject({
          method: route.method,
          url: urlFor(route.template, graceOnlyEventId, NONEXISTENT),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })
        const nonexistent = await app.inject({
          method: route.method,
          url: urlFor(route.template, NONEXISTENT, NONEXISTENT),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })

        expect(unregistered.statusCode).toBe(nonexistent.statusCode)
        expect(unregistered.json()).toEqual(nonexistent.json())
        expect(unregistered.statusCode).toBe(404)
      },
    )

    it.each(EVENT_ROUTES)(
      '$method $template — a malformed identifier refuses the same way',
      async (route) => {
        const malformed = await app.inject({
          method: route.method,
          url: urlFor(route.template, 'not-a-uuid', NONEXISTENT),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })
        const nonexistent = await app.inject({
          method: route.method,
          url: urlFor(route.template, NONEXISTENT, NONEXISTENT),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })

        expect(malformed.statusCode).toBe(nonexistent.statusCode)
        expect(malformed.json()).toEqual(nonexistent.json())
      },
    )

    it.each(EVENT_ROUTES)('$method $template — refuses without a session at all', async (route) => {
      const response = await app.inject({
        method: route.method,
        url: urlFor(route.template, adaEventIds[0] ?? NONEXISTENT, adaSessionId),
        ...(route.payload ? { payload: route.payload } : {}),
      })

      expect(response.statusCode).toBe(401)
    })

    it.each(EVENT_ROUTES)(
      '$method $template — serves the conference the attendee IS registered for',
      async (route) => {
        // The other half: the guard must not be so enthusiastic that it refuses legitimate
        // requests. A suite that only asserted refusals would pass against a route that
        // refused everything.
        const eventId = adaEventIds[0] ?? ''
        const response = await app.inject({
          method: route.method,
          url: urlFor(route.template, eventId, adaSessionId),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })

        expect(response.statusCode).toBe(route.ok)

        // A coverage test must not leave state behind for the next one to trip over.
        if (route.undo) {
          await app.inject({
            method: route.undo.method,
            url: urlFor(route.undo.template, eventId, adaSessionId),
            headers: { cookie: cookieHeader(adaCookie) },
          })
        }
      },
    )

    it('does not let a smuggled attendee identifier widen event access', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${graceOnlyEventId}/sessions?attendeeId=${graceOnlyEventId}`,
        headers: { cookie: cookieHeader(adaCookie), 'x-attendee-id': graceOnlyEventId },
      })

      expect(response.statusCode).toBe(404)
    })

    it('refuses Ada’s attempt to make Grace’s conference active (FR-101)', async () => {
      const put = await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(adaCookie) },
        payload: { eventId: graceOnlyEventId },
      })

      expect(put.statusCode).toBe(404)

      // And Ada's own active conference is untouched by the attempt.
      const active = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(adaCookie) },
      })
      expect(adaEventIds).toContain((active.json() as { id: string }).id)
    })
  })
})
