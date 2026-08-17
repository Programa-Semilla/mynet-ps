import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  events,
  GRACE,
  registrations,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T113, T114, T116, T118 (013) — promotion, demotion, and the two things that must NOT happen
 * (FR-930–FR-935, FR-904).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO NEGATIVES ARE THE LOAD-BEARING ASSERTIONS.**
 *
 * FR-904 — a promoted attendee's MyNet experience is unchanged **in every observable way** —
 * is what keeps Principle III's attendee-workspace framing true while its actor clause changes.
 * It is achievable only because promotion writes a row in a *separate table* and touches nothing
 * on the `attendees` record; the assertion below compares the attendee's own surfaces before and
 * after, byte for byte.
 *
 * FR-935 — nothing is dispatched — is the trigger set staying at a received message. Telling
 * somebody they have been promoted is an obvious product idea and would be a second trigger,
 * which standing decision 21 makes a governance conversation rather than a feature.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'promotion-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('promotion and demotion', () => {
  let app: FastifyInstance
  let operatorId: string
  let adaId: string
  let graceId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    const [operator] = await db
      .insert(operators)
      .values({
        email: OPERATOR_EMAIL,
        displayName: 'Promoting Operator',
        passwordHash: await hashPassword(OPERATOR_PASSWORD),
        credentialIsInitial: false,
      })
      .returning({ id: operators.id })
    operatorId = operator!.id

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]!.id
  })

  const platformSession = async (): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD },
    })
    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    return `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
  }

  /** Which conferences an attendee is actually registered for, so fixtures are honest. */
  const registeredEvents = async (attendeeId: string): Promise<string[]> => {
    const rows = await getDb()
      .select({ eventId: registrations.eventId })
      .from(registrations)
      .where(eq(registrations.attendeeId, attendeeId))
    return rows.map((row) => row.eventId)
  }

  it('promotes a registered attendee, recording the actor and the instant (FR-930, FR-933)', async () => {
    const cookie = await platformSession()
    const eventId = (await registeredEvents(adaId))[0]!

    const response = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    expect(response.statusCode).toBe(204)

    const [assignment] = await getDb()
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.attendeeId, adaId))

    expect(assignment).toBeDefined()
    expect(assignment?.eventId).toBe(eventId)
    // **Who granted it**, which is what makes the audit entry explaining it coherent.
    expect(assignment?.assignedBy).toBe(operatorId)
    expect(assignment?.assignedAt).toBeInstanceOf(Date)
    expect(assignment?.revokedAt).toBe(null)

    const entries = await getDb()
      .select()
      .from(adminAuditEntries)
      .where(eq(adminAuditEntries.action, 'promote'))
    expect(entries[0]).toMatchObject({
      operatorId,
      subjectAttendeeId: adaId,
      subjectResourceId: eventId,
      subjectKind: 'conference',
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **AN UNREGISTERED ATTENDEE IS REFUSED WITH 404, IDENTICAL TO A CONFERENCE THAT DOES NOT
   * EXIST — AND THAT IS 008'S ENUMERATION-ORACLE DEFECT NOT REPEATED.**
   *
   * The caller controls the conference, so the *attendee* is the only variable. Answering
   * "that person is not registered" would make this route a way to ask, of any attendee
   * identifier, whether they are at a given conference — which is precisely what 008's deep
   * review found on `POST /appointments`, where the caller controlled the slot and the invitee
   * was the only variable.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses an unregistered attendee indistinguishably from an unknown conference (FR-930)', async () => {
    const cookie = await platformSession()

    const adasEvents = await registeredEvents(adaId)
    // Searched across **every** conference rather than the two this suite happens to name.
    // `assertDisjoint`'s two-disjoint-programmes guarantee plus the deliberately empty third
    // conference (decision 34) mean one always exists — but which one is the seed's business,
    // and hard-coding a guess is how a fixture silently stops testing what it names.
    const allEvents = (await getDb().select({ id: events.id }).from(events)).map((row) => row.id)
    const notRegistered = allEvents.find((eventId) => !adasEvents.includes(eventId))
    expect(notRegistered, 'the fixture needs a conference Ada is not registered for').toBeDefined()

    const unregistered = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${notRegistered}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    const unknownConference = await app.inject({
      method: 'POST',
      url: '/admin/conferences/00000000-0000-4000-8000-000000000000/organizers',
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    expect(unregistered.statusCode).toBe(404)
    expect(unknownConference.statusCode).toBe(404)
    expect(
      unregistered.body,
      'an unregistered attendee and an unknown conference answered differently, which makes ' +
        "this route an oracle for another attendee's presence at a conference (008's defect).",
    ).toBe(unknownConference.body)

    expect(await getDb().select().from(organizerAssignments)).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **012 (walk step A4) — PROMOTION BY EMAIL, because the UUID form was unusable in practice.**
   *
   * No administrative surface can ever show an operator a UUID — the admin product deliberately
   * has no attendee directory (FR-973) — so every real promotion attempt 400'd, found by the
   * first person to try one. The identifier a real request carries is the address; resolution
   * is blind, inside the promoting transaction, and a miss takes the same indistinguishable-404
   * path as everything else, so accepting it widens no disclosure.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('promotes by email, resolving it blind (012 walk A4)', async () => {
    const cookie = await platformSession()
    const eventId = (await registeredEvents(adaId))[0]!

    const response = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      // Mixed case on purpose: resolution must normalise, as sign-in does.
      payload: { email: 'ADA@example.com' },
    })

    expect(response.statusCode).toBe(204)

    const [assignment] = await getDb()
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.attendeeId, adaId))
    expect(assignment?.eventId).toBe(eventId)

    // The audit entry names the RESOLVED attendee, never the address (FR-994's entry stays
    // coherent whichever identifier form arrived).
    const entries = await getDb()
      .select()
      .from(adminAuditEntries)
      .where(eq(adminAuditEntries.action, 'promote'))
    expect(entries[0]?.subjectAttendeeId).toBe(adaId)
  })

  it('refuses an unknown email indistinguishably from every other 404 (012 walk A4)', async () => {
    const cookie = await platformSession()
    const eventId = (await registeredEvents(adaId))[0]!

    const unknownEmail = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { email: 'nobody-here@example.com' },
    })

    const unknownConference = await app.inject({
      method: 'POST',
      url: '/admin/conferences/00000000-0000-4000-8000-000000000000/organizers',
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    expect(unknownEmail.statusCode).toBe(404)
    expect(
      unknownEmail.body,
      'an unknown address and an unknown conference answered differently — the email form has ' +
        "become an oracle for whether an address holds an account (008's defect, new door).",
    ).toBe(unknownConference.body)

    // Exactly one identifier form per request: both, or neither, is a schema refusal.
    const both = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId, email: 'ada@example.com' },
    })
    const neither = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: {},
    })
    expect(both.statusCode).toBe(400)
    expect(neither.statusCode).toBe(400)

    expect(await getDb().select().from(organizerAssignments)).toEqual([])
  })

  /**
   * **T114 — two conferences, two rows, independently revocable** (FR-932).
   *
   * A single `is_organizer` column could not express this at all, which is one of the reasons
   * authority is a table rather than a flag on the person.
   */
  it('promotes one attendee for two conferences, each independently revocable (FR-932)', async () => {
    const db = getDb()
    // Grace is registered for both in the seed; assert rather than assume.
    const gracesEvents = await registeredEvents(graceId)
    expect(gracesEvents.length, 'the fixture needs an attendee registered for two').toBeGreaterThan(
      1,
    )
    const [one, two] = gracesEvents as [string, string]

    const cookie = await platformSession()
    for (const eventId of [one, two]) {
      const response = await app.inject({
        method: 'POST',
        url: `/admin/conferences/${eventId}/organizers`,
        headers: { cookie },
        payload: { attendeeId: graceId },
      })
      expect(response.statusCode).toBe(204)
    }

    const demote = await app.inject({
      method: 'DELETE',
      url: `/admin/conferences/${one}/organizers/${graceId}`,
      headers: { cookie },
    })
    expect(demote.statusCode).toBe(204)

    const live = await db
      .select({ eventId: organizerAssignments.eventId })
      .from(organizerAssignments)
      .where(
        and(eq(organizerAssignments.attendeeId, graceId), isNull(organizerAssignments.revokedAt)),
      )

    expect(
      live.map((row) => row.eventId),
      'revoking one assignment took the other with it (FR-932)',
    ).toEqual([two])

    // The revoked row is **history**, not a deletion — an audit entry explaining the promotion
    // has to stay coherent against it.
    const all = await db
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.attendeeId, graceId))
    expect(all.length, 'the revoked assignment was deleted rather than kept as history').toBe(2)
  })

  it('refuses a second live assignment for the same person and conference', async () => {
    const cookie = await platformSession()
    const eventId = (await registeredEvents(adaId))[0]!

    const first = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })
    const second = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    expect(first.statusCode).toBe(204)
    // 409 rather than the 404 above, and safely so: reaching this means the caller already knows
    // this attendee organizes this conference, because that is what the list they are looking at
    // says. It describes their own duplicate action.
    expect(second.statusCode).toBe(409)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T113 — FR-934. DEMOTION ENDS ADMINISTRATIVE ACCESS AND LEAVES THE ATTENDEE ACCOUNT
   * UNTOUCHED, AND BOTH HALVES ARE DRIVEN HERE.**
   *
   * The two halves fail in opposite directions and neither is implied by the assignment row
   * being revoked, which is all the test above checks:
   *
   *   - **Access ends IMMEDIATELY, not at next sign-in.** The live session is still valid — it
   *     has not expired and nobody revoked it — so an implementation that captured the tier at
   *     sign-in would leave a demoted organizer working normally until their session lapsed.
   *     `require-operator.ts` re-reads `organizer_assignments` on every request precisely so
   *     this cannot happen (decision 39: authority must not outlive the access it depends on),
   *     and that re-read is the thing under test. Deleting it would break nothing else.
   *   - **The account is untouched.** Demotion is an administrative act on an *assignment*, and
   *     a person is not conference content — no administrative tier may edit anybody's profile
   *     (decision 33). Reusing the attendee session established *before* the demotion is
   *     deliberate: it proves the account was not disturbed rather than merely still reachable.
   *
   * The refusal is the ordinary unauthenticated one, in both places. From the administrative
   * product's point of view a demoted attendee is nobody, and saying so in any more detail would
   * confirm to somebody probing that this address used to be an organizer.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('ends administrative access on demotion and leaves the account untouched (FR-934)', async () => {
    const eventId = (await registeredEvents(adaId))[0]!
    const cookie = await platformSession()

    // Ada's MyNet session, established BEFORE the demotion, so the second half of this test is
    // about the account surviving rather than about signing in again afterwards.
    const attendeeSignIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const attendeeHeaders = { cookie: cookieHeader(sessionCookieFrom(attendeeSignIn) as string) }

    const surfaces = ['/auth/me', '/events', '/profile']
    const before = new Map<string, string>()
    for (const surface of surfaces) {
      before.set(
        surface,
        (await app.inject({ method: 'GET', url: surface, headers: attendeeHeaders })).body,
      )
    }

    await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    // Ada signs in to the administrative product with her own MyNet password (FR-914) and holds
    // a live session across the demotion.
    const organizerSignIn = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    expect(organizerSignIn.statusCode, 'a promoted attendee must be able to sign in').toBe(204)
    const organizerCookie = `${ADMIN_SESSION_COOKIE}=${
      organizerSignIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)?.value
    }`

    const whileAssigned = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: organizerCookie },
    })
    expect(whileAssigned.json()).toMatchObject({ tier: 'organizer' })

    const demote = await app.inject({
      method: 'DELETE',
      url: `/admin/conferences/${eventId}/organizers/${adaId}`,
      headers: { cookie },
    })
    expect(demote.statusCode).toBe(204)

    // ── Half one: the SAME session, which is still live, no longer reaches anything.
    const afterDemotion = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: organizerCookie },
    })
    expect(
      afterDemotion.statusCode,
      'a demoted organizer kept administrative access on a session established before the ' +
        'demotion. Authority must not outlive the access it depends on (FR-934, decision 39), ' +
        'so the assignment is re-read on every request rather than captured at sign-in.',
    ).toBe(401)

    // And signing in again is refused with the same answer as any other failure (FR-915).
    const reSignIn = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    expect(reSignIn.statusCode).toBe(401)

    // ── Half two: the attendee account is exactly as it was.
    for (const surface of surfaces) {
      const after = (await app.inject({ method: 'GET', url: surface, headers: attendeeHeaders }))
        .body
      expect(
        after,
        `${surface} changed after the attendee was demoted. FR-934 requires the account to be ` +
          'left untouched — demotion acts on an assignment, and a person is not conference ' +
          'content (decision 33).',
      ).toBe(before.get(surface))
    }

    // Including the credential: their MyNet password still signs them in to MyNet.
    const stillAnAttendee = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    expect(
      stillAnAttendee.statusCode,
      'demotion disturbed the attendee’s own credential (FR-934)',
    ).toBe(204)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T116 — FR-904. A PROMOTED ATTENDEE'S MYNET EXPERIENCE IS UNCHANGED IN EVERY OBSERVABLE
   * WAY, AND THIS COMPARES THE RESPONSES BYTE FOR BYTE.**
   *
   * Not "no admin controls appear" — *nothing at all differs*. A badge saying "Organizer" beside
   * their name in Discover would satisfy a naive reading of "no admin surface" and break this.
   *
   * It is achievable only because promotion writes a row in a separate table and touches nothing
   * on the `attendees` record. If somebody ever adds an `is_organizer` column, this fails.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('changes nothing an attendee can observe in MyNet (FR-904, decision 33)', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(signIn)
    const headers = { cookie: cookieHeader(token as string) }

    const surfaces = ['/auth/me', '/events', '/profile']
    const before = new Map<string, string>()
    for (const surface of surfaces) {
      before.set(surface, (await app.inject({ method: 'GET', url: surface, headers })).body)
    }

    const cookie = await platformSession()
    const eventId = (await registeredEvents(adaId))[0]!
    await app.inject({
      method: 'POST',
      url: `/admin/conferences/${eventId}/organizers`,
      headers: { cookie },
      payload: { attendeeId: adaId },
    })

    for (const surface of surfaces) {
      const after = (await app.inject({ method: 'GET', url: surface, headers })).body
      expect(
        after,
        `${surface} changed after the attendee was promoted. FR-904 requires their MyNet ` +
          'experience to be unchanged in EVERY observable way — no badge, no extra field, no ' +
          'reordered list. This is what keeps Principle III true while its actor clause changes.',
      ).toBe(before.get(surface))
    }
  })

  /**
   * **T118 — FR-935: promotion and demotion dispatch nothing.**
   *
   * The trigger set stays at a received message. Telling somebody they have been promoted is an
   * obvious product idea, and it would be a second trigger — which standing decision 21 makes a
   * governance conversation rather than a feature. The absence is also asserted structurally by
   * `guards-still-in-force.test.ts`, which requires 007's trigger audit to be unedited.
   */
  it('dispatches nothing on promotion or demotion (FR-935)', async () => {
    const dispatched: unknown[] = []
    const { buildApp } = await import('../../src/app.js')

    const instrumented = await buildApp({
      ports: {
        push: {
          send: async (...args: unknown[]) => {
            dispatched.push(args)
            return 'delivered' as const
          },
        } as never,
      },
    })

    try {
      const signIn = await instrumented.inject({
        method: 'POST',
        url: '/admin/session',
        payload: { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD },
      })
      const cookie = signIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
      const header = `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
      const eventId = (await registeredEvents(adaId))[0]!

      await instrumented.inject({
        method: 'POST',
        url: `/admin/conferences/${eventId}/organizers`,
        headers: { cookie: header },
        payload: { attendeeId: adaId },
      })
      await instrumented.inject({
        method: 'DELETE',
        url: `/admin/conferences/${eventId}/organizers/${adaId}`,
        headers: { cookie: header },
      })

      expect(
        dispatched,
        'promotion or demotion dispatched a notification. A received message is the ONLY ' +
          'trigger (FR-935, SC-910), and a second one needs another amendment.',
      ).toEqual([])
    } finally {
      await instrumented.close()
    }
  })
})
