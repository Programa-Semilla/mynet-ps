import { sql as sqlTag } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { getDb } from '../../src/db/client.js'

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
      /**
       * **008 widened this from `GET | PUT | DELETE`.** Appointments are answered by `POST` to a
       * named sub-address — `…/accept`, `…/decline`, `…/cancel` — rather than by a `PATCH`
       * carrying a status, so that the server makes three separate authorization decisions
       * instead of branching on a value the client chose (FR-632, FR-635).
       */
      readonly method: 'GET' | 'PUT' | 'DELETE' | 'POST'
      readonly payload?: Record<string, unknown>
      /** What a legitimate request answers, so the "not over-refusing" half stays strict. */
      readonly ok: number
      /**
       * Undoes a write, so one route's coverage test does not become another's fixture.
       *
       * **004 widened this from `DELETE` alone**, because withdrawing from a conference is the
       * first per-event write whose inverse is not a delete: it is undone by re-joining, which
       * is a `POST` to a different address carrying a code. Narrowing the type to `DELETE`
       * would have forced `DELETE /events/:eventId/registration` to be either omitted from the
       * coverage list — defeating SC-105 — or exercised and left to break every later test in
       * this file.
       */
      readonly undo?: {
        readonly method: 'DELETE' | 'POST'
        readonly template: string
        readonly payload?: Record<string, unknown>
      }
      /** Substituted into `:attendeeId`. Only the co-attendee routes need one (004). */
      readonly attendeeId?: 'grace'
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
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 006 — the Discover directory.
      //
      // **This entry exists because the coverage assertion above demanded it**, which is the
      // guard working: the route was added, this suite failed, and the boundary had to be
      // exercised before it could pass.
      //
      // It is the widest per-event read in the product — every co-attendee at a conference,
      // rather than one named row — so an event-scoping failure here discloses the most. The
      // suite's other half proves the reverse direction: Ada asking for a conference that is
      // Grace's and not hers gets the same refusal a nonexistent conference produces.
      // ─────────────────────────────────────────────────────────────────────────────────────
      { template: '/events/:eventId/attendees', method: 'GET', ok: 200 },
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 004 — reading a co-attendee, and leaving a conference.
      //
      // The first two are the product's first routes naming an attendee identifier. They are
      // reads, they carry the event guard, and the identifier can only narrow a set already
      // bounded by three server-side conditions — see `routes/events/attendees.ts`. Their
      // presence here is what proves the *event* half of that is enforced identically to every
      // other per-event route.
      //
      // Grace is the target because she shares Ada's first conference, is verified, and is
      // discoverable: all three conditions hold, so a legitimate read genuinely succeeds and
      // the "not over-refusing" assertion stays strict.
      // ─────────────────────────────────────────────────────────────────────────────────────
      {
        template: '/events/:eventId/attendees/:attendeeId',
        method: 'GET',
        attendeeId: 'grace',
        ok: 200,
      },
      {
        template: '/events/:eventId/attendees/:attendeeId/avatar',
        method: 'GET',
        attendeeId: 'grace',
        // Grace has no photograph — the seed ships none (FR-354) — so the honest legitimate
        // answer is "no avatar", which is what makes the client render the fallback (FR-351).
        ok: 204,
      },
      {
        template: '/events/:eventId/registration',
        method: 'DELETE',
        ok: 204,
        // Undone by re-joining, which is why `undo` had to widen. Without this, the legitimate
        // exercise would withdraw Ada from her own conference and every later assertion in this
        // file would be testing an attendee who is not registered for anything.
        undo: {
          method: 'POST',
          template: '/events/join',
          payload: { joinCode: SEED_EVENTS[0].joinCode },
        },
      },
      // ═════════════════════════════════════════════════════════════════════════════════════
      // 008 — meetings. **These five entries exist because the coverage assertion above demanded
      // them**, which is the guard working exactly as 006's entry records: the routes were
      // added, this suite failed, and the boundary had to be exercised before it could pass.
      //
      // They are the first per-event routes in this list that 008 could have avoided adding at
      // all — registering them as `/appointments/:id` would have named no conference, kept them
      // out of this list, and left them outside every guarantee it enforces. That shape was
      // rejected deliberately (research R2): a route naming no conference is one
      // `event-scope-audit` silently passes.
      // ═════════════════════════════════════════════════════════════════════════════════════
      { template: '/events/:eventId/appointments/slots', method: 'GET', ok: 200 },
      { template: '/events/:eventId/appointments', method: 'GET', ok: 200 },
      {
        // ─────────────────────────────────────────────────────────────────────────────────
        // **`ok: 400`, and the 400 is what proves the event guard let the request through.**
        //
        // The payload names a nonexistent invitee and a blank topic. Reaching the topic check
        // at all means `requireEventAccess` passed and the handler ran — so a 400 here is
        // strictly stronger evidence of "not over-refusing" than a 200 would be on a read: a
        // 404 would be indistinguishable from the guard refusing, which is the whole point of
        // the three assertions above.
        //
        // Whitespace rather than an empty string, because the route schema's `minLength: 1`
        // would refuse `''` before the handler — and it is the *server-side* trim backstop
        // (FR-629) this is meant to reach.
        // ─────────────────────────────────────────────────────────────────────────────────
        template: '/events/:eventId/appointments',
        method: 'POST',
        payload: {
          inviteeId: '00000000-0000-0000-0000-000000000000',
          slotId: '00000000-0000-0000-0000-000000000000',
          topic: '   ',
        },
        ok: 400,
      },
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The three answer routes legitimately answer 404, and that is a REQUIREMENT rather
      // than a weakness in this fixture** (FR-636).
      //
      // A legitimate request here names an appointment that does not exist, and FR-636 makes
      // that **deliberately indistinguishable** from an appointment the caller is not party to
      // and from a conference they are not registered for. So the "not over-refusing" half
      // cannot be demonstrated at this level for these three: the two answers are required to
      // be identical, and a fixture that could tell them apart would be evidence of a defect.
      //
      // What this list still proves for them is the part that is about *events*: refusal parity
      // between another attendee's conference and a nonexistent one, the same for a malformed
      // identifier, and 401 without a session. The non-over-refusal half is proven with real
      // fixtures in `appointments-answer.test.ts`, where an actual pending appointment exists to
      // accept — which is the only place it can honestly be proven.
      // ─────────────────────────────────────────────────────────────────────────────────────
      {
        template: '/events/:eventId/appointments/:appointmentId/accept',
        method: 'POST',
        ok: 404,
      },
      {
        template: '/events/:eventId/appointments/:appointmentId/decline',
        method: 'POST',
        ok: 404,
      },
      {
        template: '/events/:eventId/appointments/:appointmentId/cancel',
        method: 'POST',
        ok: 404,
      },
      // ═════════════════════════════════════════════════════════════════════════════════════
      // 009 — audience questions. **These five entries exist because the coverage assertion
      // above demanded them**, which is the guard working exactly as 006's and 008's entries
      // record: the routes were added, this suite failed, and the boundary had to be exercised
      // before it could pass.
      //
      // Three of them name a conference they do not need in order to find the question, and that
      // is the point (FR-742, research R12). Registering them as `/questions/:questionId` would
      // have named no conference, kept them out of this list, and left them outside every
      // guarantee it enforces — while `event-scope-audit` reported success. 007 and 008 each had
      // to build a whole second audit to close that hole; 009 pays one path segment instead.
      // ═════════════════════════════════════════════════════════════════════════════════════
      { template: '/events/:eventId/sessions/:sessionId/questions', method: 'GET', ok: 200 },
      {
        // ───────────────────────────────────────────────────────────────────────────────────
        // **`ok: 400`, on 008's reasoning above and for the same reason it works here.**
        //
        // A whitespace-only body passes the route schema's `minLength: 1` and is refused by the
        // handler's own trim (FR-703, FR-705). Reaching that check at all means
        // `requireEventAccess` passed and the handler ran — so a 400 is strictly stronger
        // evidence of "not over-refusing" than a 201 would be, and it leaves **no question
        // behind**, so this entry needs no `undo` and cannot pollute the rest of the file.
        // ───────────────────────────────────────────────────────────────────────────────────
        template: '/events/:eventId/sessions/:sessionId/questions',
        method: 'POST',
        payload: { body: '   ' },
        ok: 400,
      },
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **These three legitimately answer 404, and that is a REQUIREMENT rather than a weakness
      // in the fixture** — the same position 008's three answer routes are in (FR-743).
      //
      // A legitimate request here names a question that does not exist, which FR-743 makes
      // deliberately indistinguishable from one in another conference and from one the caller
      // did not write. The non-over-refusal half is proven with real fixtures in
      // `questions-vote.test.ts` and `questions-withdraw.test.ts`, where an actual question
      // exists to act on — which is the only place it can honestly be proven.
      //
      // What this list still proves for them is the part that is about *events*: refusal parity
      // between another attendee's conference and a nonexistent one, the same for a malformed
      // identifier, and 401 without a session.
      // ─────────────────────────────────────────────────────────────────────────────────────
      { template: '/events/:eventId/questions/:questionId', method: 'DELETE', ok: 404 },
      { template: '/events/:eventId/questions/:questionId/vote', method: 'POST', ok: 404 },
      { template: '/events/:eventId/questions/:questionId/vote', method: 'DELETE', ok: 404 },
    ]

    const NONEXISTENT = '00000000-0000-0000-0000-000000000000'

    let adaEventIds: string[]
    let graceOnlyEventId: string
    /** A session that really is in Ada's first conference, for the `:sessionId` routes. */
    let adaSessionId: string
    /** 004 — a real co-attendee in Ada's first conference, for the `:attendeeId` routes. */
    let graceId: string

    /**
     * Fills a template. `:sessionId` is substituted with a real session only where the request
     * is meant to succeed — every refusal case is refused by the *event* guard before the
     * session is ever looked at, which is itself the property being asserted.
     */
    const urlFor = (
      template: string,
      eventId: string,
      sessionId: string,
      attendeeId = NONEXISTENT,
    ): string =>
      template
        .replace(':eventId', eventId)
        .replace(':sessionId', sessionId)
        .replace(':attendeeId', attendeeId)
        // 008 — always a nonexistent appointment. See the three answer entries in EVENT_ROUTES
        // for why a real one could not make the legitimate case distinguishable anyway (FR-636).
        .replace(':appointmentId', NONEXISTENT)
        // 009 — always a nonexistent question, for the same reason (FR-743).
        .replace(':questionId', NONEXISTENT)

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

      // 004 — the co-attendee routes need a real target. Grace shares Ada's first conference.
      const graceProfile = await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(graceCookie) },
      })
      if (graceProfile.statusCode !== 200) throw new Error('Grace must have a readable profile.')
      const graceRows = await getDb().execute<{ id: string }>(
        sqlTag`SELECT id FROM attendees WHERE email = 'grace@example.com'`,
      )
      graceId = graceRows[0]?.id as string
    })

    it('covers every route the application declares with an event identifier (SC-105)', async () => {
      // Discovered rather than assumed: if a feature adds a third per-event route and does not
      // add it here, this fails and says so.
      const declared: string[] = []
      const probe = await buildApp({
        onRoute: (route) => {
          // ───────────────────────────────────────────────────────────────────────────────────
          // T028 (011) — administrative routes are excluded from this inventory.
          //
          // `EVENT_ROUTES` below drives each declared route with an **attendee's** cookie and
          // requires the same 404 for "another attendee's conference" as for one that does not
          // exist. An administrative route reads a different cookie from a different store, so
          // an attendee is refused as **401 — nobody** rather than as 404 — not a weaker
          // refusal, a different question.
          //
          // The equivalent guarantee for the principal it applies to is
          // `admin-tier-boundary.test.ts`: an organizer at a conference they are not assigned
          // gets 404, indistinguishable from one that does not exist (FR-906).
          // ───────────────────────────────────────────────────────────────────────────────────
          if (/^\/admin(\/|$)/.test(route.url)) return
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
          url: urlFor(route.template, graceOnlyEventId, NONEXISTENT, graceId),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })
        const nonexistent = await app.inject({
          method: route.method,
          url: urlFor(route.template, NONEXISTENT, NONEXISTENT, graceId),
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
          url: urlFor(route.template, 'not-a-uuid', NONEXISTENT, graceId),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })
        const nonexistent = await app.inject({
          method: route.method,
          url: urlFor(route.template, NONEXISTENT, NONEXISTENT, graceId),
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
        url: urlFor(route.template, adaEventIds[0] ?? NONEXISTENT, adaSessionId, graceId),
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
          url: urlFor(route.template, eventId, adaSessionId, graceId),
          headers: { cookie: cookieHeader(adaCookie) },
          ...(route.payload ? { payload: route.payload } : {}),
        })

        expect(response.statusCode).toBe(route.ok)

        // A coverage test must not leave state behind for the next one to trip over.
        if (route.undo) {
          await app.inject({
            method: route.undo.method,
            url: urlFor(route.undo.template, eventId, adaSessionId, graceId),
            headers: { cookie: cookieHeader(adaCookie) },
            ...(route.undo.payload ? { payload: route.undo.payload } : {}),
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
