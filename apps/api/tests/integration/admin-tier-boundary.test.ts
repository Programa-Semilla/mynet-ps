import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import {
  ADA,
  attendees,
  clearThrottle,
  events,
  GRACE,
  SEED_PASSWORD,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T078, T082, T115 (011) — the tier boundary, and the audit entry that only a disclosure writes
 * (FR-906, FR-995, SC-904, decision 35, decision 38).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TIER BOUNDARY IS PROVED BY DIRECT ADDRESS ENTRY, WHICH IS THE ONLY WAY TO PROVE IT.**
 *
 * The administrative client renders a conference organizer no entry for the report queue
 * (FR-925), and that is a courtesy rather than a control. What decision 35 actually requires is
 * that an organizer **cannot read reports at all** — so this drives the addresses directly, with
 * an organizer's live session, exactly as somebody typing a URL would.
 *
 * The two halves are deliberately separate tests in separate layers:
 * `tier-controls.test.tsx` asserts no control is rendered; this asserts the server refuses. A
 * hidden control an attacker can still call is not security, and a refused call with the button
 * still showing is not usability.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'tier-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

/** Every address the platform tier alone may reach (contracts, `operator-audit.test.ts`). */
const PLATFORM_ONLY = [
  { method: 'GET' as const, url: '/admin/reports' },
  { method: 'GET' as const, url: '/admin/reports/00000000-0000-4000-8000-000000000000' },
  {
    method: 'POST' as const,
    url: '/admin/reports/00000000-0000-4000-8000-000000000000/resolution',
    payload: { outcome: 'dismissed', note: 'probe' },
  },
  {
    method: 'DELETE' as const,
    url: '/admin/questions/00000000-0000-4000-8000-000000000000?reportId=00000000-0000-4000-8000-000000000000',
  },
  {
    method: 'POST' as const,
    url: '/admin/operators/00000000-0000-4000-8000-000000000000/deactivation',
  },
]

describe('the administrative tier boundary', () => {
  let app: FastifyInstance
  let operatorId: string
  let adaId: string
  let graceId: string
  let eventId: string

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
        displayName: 'Fixture Operator',
        passwordHash: await hashPassword(OPERATOR_PASSWORD),
        credentialIsInitial: false,
      })
      .returning({ id: operators.id })
    operatorId = operator!.id

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]!.id
    eventId = (await db.select().from(events).limit(1))[0]!.id

    await db.insert(organizerAssignments).values({
      attendeeId: adaId,
      eventId,
      assignedBy: operatorId,
    })
  })

  const sessionFor = async (email: string, password: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email, password },
    })
    expect(response.statusCode, `${email} could not sign in`).toBe(204)
    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    return `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
  }

  /**
   * **404, not 403** — identical to a route that does not exist.
   *
   * A 403 would confirm both that the surface exists and that the caller is not on it, which for
   * the report queue tells somebody exactly what to go looking for.
   */
  it('refuses a conference organizer on every platform-tier address (FR-906, SC-904)', async () => {
    const organizer = await sessionFor(ADA, SEED_PASSWORD)

    for (const address of PLATFORM_ONLY) {
      const response = await app.inject({ ...address, headers: { cookie: organizer } })
      expect(
        response.statusCode,
        `${address.method} ${address.url} did not refuse a conference organizer with 404`,
      ).toBe(404)
      // Nothing in the body may hint that a queue exists.
      expect(response.body).not.toMatch(/report|operator|queue/i)
    }
  })

  it('lets a conference organizer read the conferences they are assigned, and no others (FR-926)', async () => {
    const db = getDb()
    // A second conference Ada does not organize.
    const others = await db.select().from(events)
    expect(others.length, 'the fixture needs more than one conference').toBeGreaterThan(1)

    const organizer = await sessionFor(ADA, SEED_PASSWORD)
    const response = await app.inject({
      method: 'GET',
      url: '/admin/conferences',
      headers: { cookie: organizer },
    })

    expect(response.statusCode).toBe(200)
    const conferences = response.json() as { id: string }[]
    expect(
      conferences.map((conference) => conference.id),
      'an organizer saw a conference they do not organize (FR-926)',
    ).toEqual([eventId])
  })

  it('lets a platform operator see every conference, and its unassigned state (FR-936)', async () => {
    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    const response = await app.inject({
      method: 'GET',
      url: '/admin/conferences',
      headers: { cookie: platform },
    })

    const conferences = response.json() as { id: string; unassigned: boolean }[]
    expect(conferences.length).toBeGreaterThan(1)

    const organized = conferences.find((conference) => conference.id === eventId)
    expect(organized?.unassigned, 'a conference with a live assignment reported unassigned').toBe(
      false,
    )
    expect(
      conferences.some((conference) => conference.unassigned),
      'no conference reported the unassigned state, which decision 39 requires to be visible',
    ).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T082 — READING THE DETAIL WRITES AN AUDIT ENTRY; READING THE LIST WRITES NOTHING**
   * (FR-995).
   *
   * The asymmetry is the requirement, not an optimisation. The disclosure the constitution had to
   * permit is *reported content*; a list of who reported whom is metadata an operator needs to do
   * the work at all. If scrolling a queue wrote entries, the trail would be a record of scrolling
   * rather than of disclosure — and the thing it exists to make reviewable would be buried.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('writes a disclosure entry for the detail and none for the list (FR-995)', async () => {
    const db = getDb()
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: graceId,
        reportedId: adaId,
        reason: 'A reason only an operator may read.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    await app.inject({ method: 'GET', url: '/admin/reports', headers: { cookie: platform } })
    expect(
      await db.select().from(adminAuditEntries),
      'reading the QUEUE wrote an audit entry. The list carries no content, so there is no ' +
        'disclosure to record — see FR-995.',
    ).toEqual([])

    const detail = await app.inject({
      method: 'GET',
      url: `/admin/reports/${report!.id}`,
      headers: { cookie: platform },
    })
    expect(detail.statusCode).toBe(200)
    // The reporter's stated reason IS disclosed — the third recorded Principle VIII exception.
    expect(detail.json()).toMatchObject({ reason: 'A reason only an operator may read.' })

    const entries = await db.select().from(adminAuditEntries)
    expect(entries.length, 'reading report content wrote no audit entry (FR-995)').toBe(1)
    expect(entries[0]).toMatchObject({
      action: 'disclose_report_content',
      operatorId,
      subjectResourceId: report!.id,
      subjectKind: 'report',
    })
  })

  /**
   * **A 404 writes nothing** — an entry for a report that was not found would record a
   * disclosure that did not happen, and would turn the trail into a log of guessed identifiers.
   */
  it('writes no disclosure entry when the report is not found', async () => {
    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    const response = await app.inject({
      method: 'GET',
      url: '/admin/reports/00000000-0000-4000-8000-000000000000',
      headers: { cookie: platform },
    })

    expect(response.statusCode).toBe(404)
    expect(await getDb().select().from(adminAuditEntries)).toEqual([])
  })

  /**
   * **T079 — a second resolution is refused with an explanation, not an overwrite** (FR-945).
   *
   * The refusal comes from a **unique constraint**, so there is no read-then-write window. This
   * drives the second attempt after the first has committed, which is the sequential case; the
   * constraint is what makes the concurrent case impossible rather than unlikely.
   */
  it('refuses a second resolution with 409 rather than overwriting the first (FR-945)', async () => {
    const db = getDb()
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: graceId,
        reportedId: adaId,
        reason: 'Reported conduct.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    const first = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report!.id}/resolution`,
      headers: { cookie: platform },
      payload: { outcome: 'dismissed', note: 'The first operator judged this.' },
    })
    expect(first.statusCode).toBe(204)

    const second = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report!.id}/resolution`,
      headers: { cookie: platform },
      payload: { outcome: 'actioned', note: 'A second operator disagreed.' },
    })

    expect(second.statusCode, 'a second resolution was accepted (FR-945)').toBe(409)
    // **Explained**, unlike most refusals here — it describes a conflict in the reader's own
    // work, which they can act on, and discloses nothing about any attendee.
    expect(second.json()).toMatchObject({ code: 'report_already_resolved' })

    const resolutions = await db.select().from(reportResolutions)
    expect(resolutions.length, 'the report has more than one resolution').toBe(1)
    expect(resolutions[0]?.note, "the second resolution overwrote the first operator's note").toBe(
      'The first operator judged this.',
    )
  })
})
