import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { pruneExpiredReports, REPORT_RETENTION_DAYS } from '../../src/db/queries/reports.js'
import { RETENTION_SWEEPS } from '../../src/maintenance.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T129 (007) — **reports cascade from both attendees, and the 90-day sweep clears the rest**
 * (FR-579, research R3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE TABLE IN THIS FEATURE WITH A RETENTION RULE AS WELL AS A CASCADE, AND THE REASON IS
 * THAT THE ROW IS NOT THE RECORD.**
 *
 * The durable artifact of a report is the **operator's mail** (FR-547). The row exists so a report
 * is not lost in the window between being written and being dispatched, and so a dispatch failure
 * is recoverable by somebody reading the database. Once that window has passed it is one
 * attendee's free-text accusation about another, sitting in a table nothing in this product may
 * read (FR-548) — which is a poor thing to keep indefinitely.
 *
 * The accepted cost is recorded rather than hidden, in the schema and in `RETENTION_SWEEPS`: **a
 * report can be lost**, if dispatch failed *and* the reported attendee then deleted their account.
 * The erasure right was chosen over the evidence.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('report retention', () => {
  let app: FastifyInstance
  let adaCookie: string

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}: ${response.body}`)
    return token
  }

  const idOf = async (cookie: string): Promise<string> => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { id: string }).id
  }

  const newAttendee = async (): Promise<{ cookie: string; id: string }> => {
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `reported-${randomUUID()}@example.com`,
        displayName: 'Reported Attendee',
        password: SEED_PASSWORD,
      },
    })
    const cookie = sessionCookieFrom(signUp)
    if (!cookie) throw new Error(`Sign-up failed: ${signUp.body}`)

    // **Joined, because a report is only possible against somebody you can reach.** This fixture
    // used to sign up and stop there, which worked only while `blockAttendee` accepted any
    // attendee that merely existed — the permissiveness that let a harvested identifier be
    // blocked, and thereafter read from `GET /blocks`, long after the target became invisible.
    // Requiring co-attendance closed that; the fixture now reflects the product it tests.
    await clearThrottle()
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    return { cookie, id: await idOf(cookie) }
  }

  const reportCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM abuse_reports`,
    )
    return Number(rows[0]?.count ?? '0')
  }

  const fileReport = (reportedId: string) =>
    app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: reportedId, reason: 'Conduct.', messageIds: [] },
    })

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await resetDatabase()
    adaCookie = await signIn(ADA)
  })

  it('is declared in RETENTION_SWEEPS with its window and reason (FR-579)', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `deletion-coverage.test.ts` reads this registry to decide whether a table is covered, so a
    // sweep that was implemented but not declared would leave the table looking unclassified —
    // and one declared but not implemented would be a comment the guard trusted. This asserts
    // the entry names the real function.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const sweep = RETENTION_SWEEPS.find((entry) => entry.table === 'abuse_reports')

    expect(sweep, 'abuse_reports must be declared').toBeDefined()
    expect(sweep?.window).toContain(String(REPORT_RETENTION_DAYS))
    expect(sweep?.run, 'and the entry must name the function that actually runs').toBe(
      pruneExpiredReports,
    )
  })

  it('CASCADES when the REPORTER deletes their account', async () => {
    const reported = await newAttendee()
    expect((await fileReport(reported.id)).statusCode).toBe(204)
    expect(await reportCount()).toBe(1)

    // Ada is seeded, so a created account files the report instead and then leaves.
    const reporter = await newAttendee()
    await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(reporter.cookie) },
      payload: { attendeeId: reported.id, reason: 'Also conduct.', messageIds: [] },
    })
    expect(await reportCount()).toBe(2)

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(reporter.cookie) },
    })

    expect(await reportCount(), "the reporter's report went with them").toBe(1)
  })

  it('CASCADES when the REPORTED attendee deletes their account', async () => {
    const reported = await newAttendee()
    await fileReport(reported.id)
    expect(await reportCount()).toBe(1)

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(reported.cookie) },
    })

    expect(
      await reportCount(),
      'The accepted cost, recorded rather than hidden: a report can be lost if the reported ' +
        'attendee deletes. The erasure right was chosen over the evidence (research R3).',
    ).toBe(0)
  })

  it('THE SWEEP CLEARS WHAT NEITHER CASCADE REACHES — the case where both stay', async () => {
    const reported = await newAttendee()
    await fileReport(reported.id)
    expect(await reportCount()).toBe(1)

    // Aged past the window. Written directly, because waiting ninety days is not a test strategy
    // and the sweep's condition is about the column rather than about elapsed wall-clock.
    await getDb().execute(sql`
      UPDATE abuse_reports
      SET created_at = now() - interval '${sql.raw(`${REPORT_RETENTION_DAYS + 1}`)} days'
    `)

    await pruneExpiredReports()

    expect(await reportCount()).toBe(0)
  })

  it('leaves a report that is still inside its window', async () => {
    const reported = await newAttendee()
    await fileReport(reported.id)

    await getDb().execute(sql`
      UPDATE abuse_reports
      SET created_at = now() - interval '${sql.raw(`${REPORT_RETENTION_DAYS - 1}`)} days'
    `)

    await pruneExpiredReports()

    expect(
      await reportCount(),
      'The window exists so a dispatch failure stays recoverable by somebody reading the ' +
        'database. Sweeping early would remove the only reason the row exists.',
    ).toBe(1)
  })

  it('the sweep is idempotent and safe to run against an empty table', async () => {
    await pruneExpiredReports()
    await pruneExpiredReports()
    expect(await reportCount()).toBe(0)
  })
})
