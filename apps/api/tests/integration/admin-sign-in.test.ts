import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operatorSessions } from '../../src/db/schema/operator-sessions.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  events,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T048, T050 (013) — administrative sign-in, its four indistinguishable refusals, and both
 * session bounds (FR-914–FR-919b, SC-901).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-915 IS A PROPERTY OF FOUR RESPONSES BEING THE SAME, WHICH IS NOT A THING A SINGLE
 * ASSERTION CAN CHECK.**
 *
 * Each case is driven separately and the four responses are then compared **to each other**,
 * rather than each being compared to an expected shape. That difference matters: four assertions
 * of `expect(status).toBe(401)` would pass while the bodies differed, and the body is what a
 * prober reads.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'sign-in-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('administrative sign-in', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **`report_resolutions` and `admin_audit_entries` first, and this suite was the only one of
    // eight that did not clear them.**
    //
    // `report_resolutions.resolved_by` is a `NO ACTION` reference to `operators`, so a resolution
    // left behind by a preceding file makes `delete(operators)` raise a foreign-key violation
    // naming neither of this suite's fixtures. Integration files share one database and run
    // sequentially, and several suites end having created a resolution through the route — so
    // whether this file passed depended on which file ran before it, and Vitest orders by file
    // size, meaning adding lines to any test could reorder it.
    //
    // It did fail exactly this way during 011's verification run. That was initially misread as
    // contamination from a partial test run; the real cause is this missing cleanup, which its
    // seven siblings all have. Same shape as 008's `shared_cards` trap.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(organizerAssignments)
    await db.delete(operators)
    await db.insert(operators).values({
      email: OPERATOR_EMAIL,
      displayName: 'Fixture Operator',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      // Already replaced, so this fixture reaches administrative surfaces. The forced-replacement
      // path is exercised in `admin-bootstrap.test.ts`.
      credentialIsInitial: false,
    })
  })

  const signIn = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/admin/session', payload: { email, password } })

  it('signs a platform operator in and reports their tier', async () => {
    const response = await signIn(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    expect(response.statusCode).toBe(204)

    // The token is in a host-only cookie and in **no response body** (FR-911).
    expect(response.body).toBe('')
    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    expect(cookie, 'no administrative session cookie was set').toBeDefined()

    // **No `Domain` attribute** — the property FR-912's independence rests on. Asserted on the
    // wire as well as on the options object (`tests/unit/admin-cookie.test.ts`), because the
    // options are only a claim about what the browser will be told.
    expect(cookie?.domain, 'the administrative cookie is not host-only').toBeUndefined()

    const me = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookie?.value}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ tier: 'platform', displayName: 'Fixture Operator' })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE FOUR REFUSALS, COMPARED TO EACH OTHER** (FR-915).
   *
   * The fourth case is the one worth pausing on: an ordinary attendee typing their perfectly
   * correct MyNet password into the administrative form gets the same answer as somebody
   * guessing. That is deliberate — a distinguishable answer would confirm both that the address
   * has an account and that the person asking is not an organizer, and the second half is
   * exactly what an attacker probing for organizers wants to know.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('answers all four failure causes identically (FR-915)', async () => {
    const unknownAddress = await signIn('nobody-at-all@mynet.invalid', 'any-password')
    await clearThrottle()

    const wrongPassword = await signIn(OPERATOR_EMAIL, 'not-the-password')
    await clearThrottle()

    // A real attendee, with their real password, who has not been promoted.
    const unpromotedAttendee = await signIn(ADA, SEED_PASSWORD)
    await clearThrottle()

    await getDb()
      .update(operators)
      .set({ deactivatedAt: new Date() })
      .where(eq(operators.email, OPERATOR_EMAIL))
    const deactivated = await signIn(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    const responses = [unknownAddress, wrongPassword, unpromotedAttendee, deactivated]

    for (const response of responses) {
      expect(response.statusCode, 'a sign-in failure did not answer 401').toBe(401)
    }

    // The bodies must be **identical to each other**, not merely each plausible.
    const bodies = new Set(responses.map((response) => response.body))
    expect(
      bodies.size,
      'The four administrative sign-in failures produced different bodies. FR-915 requires one ' +
        'refusal for all four causes, from one factory, so there is no branch for a prober to ' +
        'observe — an unknown address, a wrong password, an unpromoted attendee and a ' +
        'deactivated operator must be indistinguishable.',
    ).toBe(1)

    // And none of them may set a session.
    for (const response of responses) {
      expect(response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)).toBeUndefined()
    }
  })

  /**
   * **A promoted attendee signs in with their ATTENDEE credentials** (FR-914) — there is no
   * separate administrative password for the organizer tier, and creating one would be a second
   * credential for the same person to lose.
   */
  it('signs a promoted attendee in as an organizer, with their MyNet password (FR-914)', async () => {
    const db = getDb()
    const ada = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]
    const event = (await db.select().from(events).limit(1))[0]
    const operator = (
      await db.select().from(operators).where(eq(operators.email, OPERATOR_EMAIL))
    )[0]
    expect(ada && event && operator).toBeTruthy()

    await db.insert(organizerAssignments).values({
      attendeeId: ada!.id,
      eventId: event!.id,
      assignedBy: operator!.id,
    })

    const response = await signIn(ADA, SEED_PASSWORD)
    expect(response.statusCode).toBe(204)

    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    const me = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookie?.value}` },
    })
    expect(me.json()).toMatchObject({ tier: 'organizer' })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **SC-901 — TWO INDEPENDENT SESSIONS, AND SIGNING OUT OF ONE LEAVES THE OTHER.**
   *
   * The half that would be easy to get wrong is the *storage* half: reusing `auth_sessions` with
   * a `kind` column would let one product's sign-out end the other's the day somebody wrote a
   * sign-out-everywhere feature (research R3). This drives both directions.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('holds an administrative session independent of a MyNet session (FR-912, SC-901)', async () => {
    const db = getDb()
    const ada = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]
    const event = (await db.select().from(events).limit(1))[0]
    const operator = (
      await db.select().from(operators).where(eq(operators.email, OPERATOR_EMAIL))
    )[0]

    await db.insert(organizerAssignments).values({
      attendeeId: ada!.id,
      eventId: event!.id,
      assignedBy: operator!.id,
    })

    const attendeeSignIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const attendeeToken = sessionCookieFrom(attendeeSignIn)
    expect(attendeeToken, 'the attendee sign-in set no session cookie').toBeDefined()

    const adminSignIn = await signIn(ADA, SEED_PASSWORD)
    const adminCookie = adminSignIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    const adminHeader = `${ADMIN_SESSION_COOKIE}=${adminCookie?.value}`

    // Both live.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { cookie: cookieHeader(attendeeToken as string) },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie: adminHeader } }))
        .statusCode,
    ).toBe(200)

    // Signing out of the administrative site leaves the MyNet session alone.
    await app.inject({ method: 'DELETE', url: '/admin/session', headers: { cookie: adminHeader } })
    expect(
      (await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie: adminHeader } }))
        .statusCode,
      'the administrative session survived its own sign-out',
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { cookie: cookieHeader(attendeeToken as string) },
        })
      ).statusCode,
      'signing out of administration ended the MyNet session (FR-912)',
    ).toBe(200)

    // And the other direction: signing out of MyNet leaves a fresh administrative session alone.
    const secondAdmin = await signIn(ADA, SEED_PASSWORD)
    const secondCookie = secondAdmin.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    const secondHeader = `${ADMIN_SESSION_COOKIE}=${secondCookie?.value}`

    await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(attendeeToken as string) },
    })
    expect(
      (await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie: secondHeader } }))
        .statusCode,
      'signing out of MyNet ended the administrative session (FR-912, decision 37)',
    ).toBe(200)
  })

  /**
   * **FR-917 — an unauthenticated request to any administrative address discloses nothing.**
   *
   * Driven over the whole administrative surface rather than one address, because the disclosure
   * this forbids is *differential*: a route that answered 404 while its neighbours answered 401
   * would tell somebody which addresses exist.
   */
  it('discloses nothing about what exists to an unauthenticated caller (FR-917)', async () => {
    const addresses = [
      { method: 'GET' as const, url: '/admin/me' },
      { method: 'GET' as const, url: '/admin/conferences' },
      { method: 'GET' as const, url: '/admin/reports' },
      { method: 'GET' as const, url: '/admin/reports/00000000-0000-4000-8000-000000000000' },
      { method: 'DELETE' as const, url: '/admin/session' },
    ]

    const statuses = new Set<number>()
    for (const address of addresses) {
      const response = await app.inject(address)
      statuses.add(response.statusCode)
      expect(response.body).not.toMatch(/operator|organiz|report/i)
    }

    expect(
      [...statuses],
      'Administrative addresses answered an unauthenticated caller differently from one ' +
        'another, which reports which of them exist (FR-917).',
    ).toEqual([401])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T050 — THE TWO SESSION BOUNDS, AND THE ONE PROPERTY THAT HAS NO OTHER GUARD.**
   *
   * `absolute_expires_at` is computed at establishment and must never move (research R8). It is
   * the *only* reason the two bounds are two things: an idle rule alone lets a session used every
   * four minutes live forever, which is exactly the session an unattended signed-in workstation
   * holds.
   *
   * Advancing it in `resolveAdminSession`'s `set` clause — beside `idleExpiresAt`, which *is*
   * advanced there and correctly so — is a one-word change that looks like a consistency fix, and
   * it would silently make the eight-hour cap infinite. Nothing else in this feature would
   * notice: every other test signs in and acts immediately, so a session that never expires
   * passes all of them. That is what this drives.
   *
   * The bounds are moved by writing the row directly rather than by waiting. Waiting is the only
   * honest alternative and it costs eight hours.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('the two session bounds (FR-919a, FR-919b)', () => {
    /**
     * Signs in and returns the cookie header plus the session row's id.
     *
     * Clears `operator_sessions` first: the suite's `beforeEach` removes operators, and an
     * operator's sessions cascade with them — but an **organizer's** session is keyed on
     * `attendee_id` and survives, so "the only row" is not otherwise true here.
     */
    const liveSession = async (): Promise<{ cookie: string; id: string }> => {
      await getDb().delete(operatorSessions)
      const response = await signIn(OPERATOR_EMAIL, OPERATOR_PASSWORD)
      expect(response.statusCode).toBe(204)
      const value = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)?.value
      const [row] = await getDb().select().from(operatorSessions)
      return { cookie: `${ADMIN_SESSION_COOKIE}=${value}`, id: row!.id }
    }

    const bounds = async (id: string): Promise<{ idle: Date; absolute: Date }> => {
      const [row] = await getDb().select().from(operatorSessions).where(eq(operatorSessions.id, id))
      return { idle: row!.idleExpiresAt, absolute: row!.absoluteExpiresAt }
    }

    const call = (cookie: string) =>
      app.inject({ method: 'GET', url: '/admin/me', headers: { cookie } })

    it('advances the idle window on use and NEVER the absolute cap (research R8)', async () => {
      const { cookie, id } = await liveSession()
      const before = await bounds(id)

      // Two further requests, separated enough that a moved timestamp is unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect((await call(cookie)).statusCode).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect((await call(cookie)).statusCode).toBe(200)

      const after = await bounds(id)

      expect(
        after.idle.getTime(),
        'the idle window did not move on use, so it does not measure inactivity (FR-919a)',
      ).toBeGreaterThan(before.idle.getTime())

      expect(
        after.absolute.getTime(),
        'THE ABSOLUTE CAP MOVED. It is resolved to an instant once, at establishment, and ' +
          'nothing may advance it (research R8) — a session in constant use must still end. ' +
          'Advancing it beside `idleExpiresAt` in `resolveAdminSession` looks like a ' +
          'consistency fix and makes the cap infinite, and no other test in this feature ' +
          'would fail.',
      ).toBe(before.absolute.getTime())
    })

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **THE COOKIE MUST BE RE-ISSUED ON USE, OR THE SLIDING WINDOW IS ONLY HALF BUILT.**
     *
     * Added at the deep-review gate, and it is the half the test above cannot see. That one
     * asserts the *database* columns move, driven through `app.inject`, which models no browser
     * and no cookie lifetime — so it passed while the browser's copy still expired 30 minutes
     * after sign-in however continuously the operator worked.
     *
     * The consequences are both bounds: the idle window did not slide in the only place the
     * operator experiences it, and the **absolute cap became unreachable**, since the session
     * could never survive long enough to hit it. `plugins/auth-context.ts` re-issues the
     * attendee cookie for exactly this reason.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    it('re-issues the cookie on every authenticated request (FR-919a)', async () => {
      const { cookie } = await liveSession()

      const response = await call(cookie)
      expect(response.statusCode).toBe(200)

      const reissued = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
      expect(
        reissued,
        'no Set-Cookie on an authenticated administrative request. The database idle window is ' +
          'advanced on every request; without re-issuing the cookie the browser discards it at ' +
          'its original expiry, so the window does not slide and the absolute cap can never be ' +
          'reached.',
      ).toBeDefined()
      expect(reissued?.maxAge, 'the re-issued cookie carries no lifetime').toBeGreaterThan(0)
      // Host-only survives the refresh — the property FR-912's independence rests on.
      expect(reissued?.domain).toBeUndefined()
    })

    /**
     * The browser's copy must never outlive the server's absolute bound: a refreshed idle
     * window that ran past `absolute_expires_at` would leave the browser presenting a token the
     * server refuses, which presents as an unexplained sign-out mid-action.
     */
    it('clamps the re-issued cookie to what remains of the absolute cap (FR-919b)', async () => {
      const { cookie, id } = await liveSession()

      // Two minutes of absolute cap left, which is far less than the 30-minute idle window.
      await getDb()
        .update(operatorSessions)
        .set({ absoluteExpiresAt: new Date(Date.now() + 2 * 60 * 1000) })
        .where(eq(operatorSessions.id, id))

      const response = await call(cookie)
      expect(response.statusCode).toBe(200)

      const reissued = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
      expect(
        reissued?.maxAge,
        'the re-issued cookie outlives the absolute cap, so the browser would keep presenting a ' +
          'token the server refuses.',
      ).toBeLessThanOrEqual(2 * 60)
    })

    it('refuses a session past its idle window (FR-919a)', async () => {
      const { cookie, id } = await liveSession()
      expect((await call(cookie)).statusCode).toBe(200)

      // Idle lapses; the absolute cap is still hours away, so this isolates the idle rule.
      await getDb()
        .update(operatorSessions)
        .set({ idleExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(operatorSessions.id, id))

      expect((await call(cookie)).statusCode).toBe(401)
    })

    /**
     * **The half that proves the two bounds are separately observable.** The idle window is
     * deliberately left far in the future here, so the only thing that can refuse this request
     * is the absolute cap. A `resolveAdminSession` that checked idle alone passes the test
     * above and fails this one.
     */
    it('refuses a session past its absolute cap while it is still actively in use (FR-919b)', async () => {
      const { cookie, id } = await liveSession()

      await getDb()
        .update(operatorSessions)
        .set({
          idleExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          absoluteExpiresAt: new Date(Date.now() - 1000),
        })
        .where(eq(operatorSessions.id, id))

      const response = await call(cookie)
      expect(
        response.statusCode,
        'a session past its absolute cap was still accepted because its idle window was fresh. ' +
          'Both bounds are conditions on one statement precisely so no path can check one and ' +
          'not the other (FR-919b).',
      ).toBe(401)

      /**
       * **FR-919b — expiry returns to sign-in without disclosing the prior view.** The refusal
       * must be the *same* one an unauthenticated stranger gets: an operator whose session
       * lapsed while a report was open must not have the response confirm that.
       */
      const stranger = await app.inject({ method: 'GET', url: '/admin/me' })
      expect(
        response.body,
        'an expired session was refused differently from an absent one, which tells the ' +
          'caller their session was once valid (FR-919b).',
      ).toBe(stranger.body)
      expect(response.body).not.toMatch(/operator|organiz|report|expire/i)
    })
  })
})
