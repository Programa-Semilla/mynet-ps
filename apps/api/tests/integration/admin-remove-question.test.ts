import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { questionVotes, sessionQuestions } from '../../src/db/schema/questions.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { ADA, attendees, clearThrottle, GRACE, setupTestApp, teardown } from './helpers.js'

/**
 * T100, T102 (011) — removing a reported question (FR-950–FR-953).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE CLAIMS THAT COULD EACH HOLD WHILE ANOTHER FAILED, SO EACH IS DRIVEN SEPARATELY.**
 *
 *   1. The question and **all** its votes go (FR-950, FR-951). A removal that left orphaned votes
 *      would be invisible until somebody counted.
 *   2. **No other question's count moves** (FR-951). True by construction — the cascade is keyed
 *      on one question id — and asserted anyway, because a count is `count(*)` at read time and
 *      somebody introducing a denormalised counter would break it invisibly.
 *   3. The author is told **nothing** (FR-952): no notification, no placeholder, no tombstone.
 *      Constitution v3.3.0 decision 28 settled the equivalent question for a departing attendee,
 *      and the same answer applies — nothing survives de-attributed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'moderation-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('removing a reported question', () => {
  let app: FastifyInstance
  let adaId: string
  let graceId: string
  let sessionId: string
  let operatorId: string

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
    await db.delete(questionVotes)
    await db.delete(sessionQuestions)

    const [operator] = await db
      .insert(operators)
      .values({
        email: OPERATOR_EMAIL,
        displayName: 'Moderation Operator',
        passwordHash: await hashPassword(OPERATOR_PASSWORD),
        credentialIsInitial: false,
      })
      .returning({ id: operators.id })
    operatorId = operator!.id

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]!.id
    sessionId = (await db.select().from(sessions).limit(1))[0]!.id
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

  it('removes the question and every vote on it, moving no other count (FR-950, FR-951)', async () => {
    const db = getDb()

    const written = await db
      .insert(sessionQuestions)
      .values([
        { sessionId, attendeeId: graceId, body: 'The reported question.' },
        { sessionId, attendeeId: graceId, body: 'A neighbouring question, untouched.' },
      ])
      .returning({ id: sessionQuestions.id, body: sessionQuestions.body })

    const target = written[0]!
    const neighbour = written[1]!

    // Votes on both, so "no other count moved" is a claim with something to move.
    await db.insert(questionVotes).values([
      { questionId: target.id, attendeeId: adaId },
      { questionId: neighbour.id, attendeeId: adaId },
      { questionId: neighbour.id, attendeeId: graceId },
    ])

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Reported.',
        messageIds: [],
        questionIds: [target.id],
      })
      .returning({ id: abuseReports.id })

    const cookie = await platformSession()
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/questions/${target.id}?reportId=${report!.id}`,
      headers: { cookie },
    })

    expect(response.statusCode).toBe(204)

    // Gone for everybody — there is no soft delete and no hidden flag.
    const surviving = await db.select().from(sessionQuestions)
    expect(surviving.map((row) => row.id)).toEqual([neighbour.id])

    // **Its votes went with it**, and only its votes.
    const votes = await db.select().from(questionVotes)
    expect(
      votes.filter((vote) => vote.questionId === target.id),
      'votes on the removed question survived it (FR-951)',
    ).toEqual([])
    expect(
      votes.filter((vote) => vote.questionId === neighbour.id).length,
      "another question's vote count moved (FR-951)",
    ).toBe(2)
  })

  it('records a remove_question audit entry naming the question (FR-994)', async () => {
    const db = getDb()
    const [question] = await db
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: graceId, body: 'Reported.' })
      .returning({ id: sessionQuestions.id })
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Reported.',
        messageIds: [],
        questionIds: [question!.id],
      })
      .returning({ id: abuseReports.id })

    const cookie = await platformSession()
    await app.inject({
      method: 'DELETE',
      url: `/admin/questions/${question!.id}?reportId=${report!.id}`,
      headers: { cookie },
    })

    const entries = await db
      .select()
      .from(adminAuditEntries)
      .where(eq(adminAuditEntries.action, 'remove_question'))

    expect(entries.length).toBe(1)
    expect(entries[0]).toMatchObject({
      operatorId,
      subjectResourceId: question!.id,
      subjectKind: 'question',
    })
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The author is NOT named.** The act recorded is the removal of a piece of content;
    // recording whose content it was would put an attendee identifier into the accountability
    // record for every removal, and the trail would then need pseudonymising on a great many
    // more erasures for no gain in accountability. The reported attendee is already named on
    // the report, which is where that belongs.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(entries[0]?.subjectAttendeeId).toBe(null)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE `reportId` IS NOT DECORATION — IT IS WHAT BOUNDS THE POWER** (FR-953).
   *
   * Without this check an operator holding any report identifier — which every operator has —
   * could remove any question in the product. That is general moderation wearing the one
   * permitted route's label, and it is exactly what constitution v4.0.0 did **not** admit.
   *
   * Refused as **404**, identical to a question that no longer exists: a distinguishable answer
   * would tell an operator that the question exists but is not covered by their report, which is
   * a fact about content they have not been shown.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses to remove a question the report does not name (FR-953)', async () => {
    const db = getDb()
    const [unreported] = await db
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: graceId, body: 'Nobody reported this one.' })
      .returning({ id: sessionQuestions.id })

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'About something else entirely.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const cookie = await platformSession()
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/questions/${unreported!.id}?reportId=${report!.id}`,
      headers: { cookie },
    })

    expect(
      response.statusCode,
      'an operator removed a question their report does not name. Removal is reachable ONLY ' +
        'from a report (FR-953) — otherwise this route is general moderation.',
    ).toBe(404)

    expect((await db.select().from(sessionQuestions)).length).toBe(1)
    expect(await db.select().from(adminAuditEntries)).toEqual([])
  })

  it('answers 404 for a question that is already gone', async () => {
    const db = getDb()
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Reported.',
        messageIds: [],
        questionIds: ['00000000-0000-4000-8000-000000000000'],
      })
      .returning({ id: abuseReports.id })

    const cookie = await platformSession()
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/questions/00000000-0000-4000-8000-000000000000?reportId=${report!.id}`,
      headers: { cookie },
    })

    // Withdrawn by its author, or removed by another operator — indistinguishable from never
    // having existed, which is 009's rule for every question refusal.
    expect(response.statusCode).toBe(404)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T102 — A MESSAGE REPORT OFFERS NO REMOVAL ANYWHERE** (FR-953).
   *
   * 007's block at report time is the protective act for messages, and a message removal route
   * would be a second, unreviewed decision about somebody else's correspondence — by a principal
   * who is not a party to it.
   *
   * Asserted from the route table rather than by attempting a call, because the guarantee is that
   * the capability **does not exist**: an assertion that a call fails would still pass on the day
   * somebody added the route and got the guard wrong.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('exposes no way to remove a message, from any tier (FR-953)', async () => {
    const routes: { method: string | string[]; url: string }[] = []
    const { buildApp } = await import('../../src/app.js')
    const probe = await buildApp({ onRoute: (route) => routes.push(route) })
    await probe.close()

    const removal = routes
      .flatMap((route) =>
        (Array.isArray(route.method) ? route.method : [route.method]).map((method) => ({
          method,
          url: route.url,
        })),
      )
      .filter((route) => /message/i.test(route.url))
      .filter((route) => ['DELETE', 'PUT', 'PATCH'].includes(route.method))
      .map((route) => `${route.method} ${route.url}`)

    expect(
      removal,
      'A route removes, edits or redacts a message. FR-516 makes a sent message immutable for ' +
        'attendees, and FR-953 keeps it immutable for administrators too — the block at report ' +
        'time is the protective act, and a removal here would be a second decision about ' +
        'correspondence its maker is not party to.',
    ).toEqual([])
  })
})
