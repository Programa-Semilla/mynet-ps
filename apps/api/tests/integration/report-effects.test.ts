import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import type { MailService } from '../../src/mail/service.js'
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
 * T071 (007) — **three things happen, in this order, and the order is the requirement**
 * (FR-544, FR-545, FR-547, FR-549).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ATTENDEE'S PROTECTION LANDS FIRST, AND STAYS LANDED WHEN EVERYTHING ELSE FAILS.**
 *
 * Reporting somebody blocks them (FR-544) — reporting is not paperwork somebody files and then
 * waits on. A report that only recorded a complaint would leave the reporter reachable by the
 * person they just reported, which is the wrong way round for the one action in the product
 * taken by somebody who wants contact to stop *now*.
 *
 * And **mail failure must not fail the report** (FR-549). Register entry 18 has chosen no
 * provider, so an unprovisioned or failing one is the *expected* state rather than an
 * exceptional one — safety that depended on an external service succeeding would be safety that
 * does not work in the environment it ships in today. This file therefore runs the whole journey
 * against a mail service that throws, and asserts the block and the row survive it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A provider that is present, reachable, and refusing — the worst of the three failure modes. */
class FailingMailService implements MailService {
  abuseReports = 0

  async sendVerification(): Promise<void> {}
  async sendPasswordReset(): Promise<void> {}

  async sendAbuseReport(): Promise<void> {
    this.abuseReports += 1
    throw new Error('smtp: 421 service not available')
  }
}

/**
 * **SC-507 lives here**: *100% of reports result in a stored report record and an effective
 * block, including when mail dispatch fails.* The three effects are asserted separately below and
 * then together against a throwing `MailService` — which is the only arrangement that can measure
 * "including when dispatch fails", because the failure has to be made to happen.
 */
describe('filing a report', () => {
  let app: FastifyInstance
  const mail = new FailingMailService()

  let adaCookie: string
  let graceCookie: string
  let adaId: string
  let graceId: string
  let conversationId: string
  let messageId: string

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

  const report = (body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: body,
    })

  const reportRows = async (): Promise<
    { reporter_id: string; reported_id: string; reason: string; message_ids: string[] }[]
  > =>
    getDb().execute(sql`
      SELECT reporter_id, reported_id, reason, message_ids FROM abuse_reports
    `)

  beforeAll(async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **An operator address is configured for this file**, because without one the route
    // correctly skips dispatch and logs why — and a test of "dispatch failure is isolated" that
    // never dispatched would pass for the wrong reason.
    //
    // Set before `loadConfig` is first called, which memoises.
    // ───────────────────────────────────────────────────────────────────────────────────────
    process.env['MAIL_OPERATOR_ADDRESS'] = 'operator@example.invalid'

    app = await setupTestApp({ mail })
  })

  afterAll(async () => {
    await teardown(app)
    delete process.env['MAIL_OPERATOR_ADDRESS']
  })

  beforeEach(async () => {
    await resetDatabase()
    mail.abuseReports = 0

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId, body: 'The message being reported.' },
    })
    const created = opened.json() as { conversationId: string; messageId: string }
    conversationId = created.conversationId
    messageId = created.messageId
  })

  it('SUCCEEDS even though mail dispatch throws (FR-549)', async () => {
    const response = await report({
      attendeeId: graceId,
      reason: 'Persistent unwanted contact.',
      messageIds: [messageId],
    })

    expect(response.statusCode, response.body).toBe(204)
    expect(mail.abuseReports, 'and dispatch was genuinely attempted').toBe(1)
  })

  it('BLOCKS the reported attendee, in the same action (FR-544)', async () => {
    await report({ attendeeId: graceId, reason: 'Persistent unwanted contact.', messageIds: [] })

    const blocks = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    expect(
      (blocks.json() as { blocks: { attendeeId: string }[] }).blocks.map((b) => b.attendeeId),
    ).toEqual([graceId])

    // …and the block is enforced, not merely recorded.
    const refused = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { body: 'Still here.' },
    })
    expect(refused.statusCode).toBe(409)
  })

  it('WRITES the row, with reporter, reported, reason and message identifiers (FR-545)', async () => {
    await report({
      attendeeId: graceId,
      reason: 'Persistent unwanted contact.',
      messageIds: [messageId],
    })

    const rows = await reportRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.reporter_id).toBe(adaId)
    expect(rows[0]?.reported_id).toBe(graceId)
    expect(rows[0]?.reason).toBe('Persistent unwanted contact.')
    expect(rows[0]?.message_ids).toEqual([messageId])
  })

  it('the block AND the row both survive the failed dispatch', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The combined assertion, stated separately from the ones above because it is the one FR-549
    // is actually about: not that the request succeeds, but that **the effects the attendee
    // needed have happened** when the external service did not.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await report({ attendeeId: graceId, reason: 'Reported while mail is down.', messageIds: [] })

    expect(mail.abuseReports).toBe(1)
    expect(await reportRows()).toHaveLength(1)

    const blocks = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    expect((blocks.json() as { blocks: unknown[] }).blocks).toHaveLength(1)
  })

  it('accepts a report with no message identifiers at all', async () => {
    // Conduct can be reported without citing a specific message — somebody may be reporting a
    // profile, or a pattern. The column is `NOT NULL`, so this is the empty-array path.
    const response = await report({ attendeeId: graceId, reason: 'General conduct.' })

    expect(response.statusCode, response.body).toBe(204)
    expect((await reportRows())[0]?.message_ids).toEqual([])
  })

  it('refuses an empty or whitespace-only reason (FR-546)', async () => {
    for (const reason of ['', '   ']) {
      const response = await report({ attendeeId: graceId, reason, messageIds: [] })
      expect(response.statusCode, `reason ${JSON.stringify(reason)}`).toBe(400)
    }

    expect(await reportRows(), 'and nothing was written').toHaveLength(0)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS TEST PINNED AN EXISTENCE ORACLE, AND THE ASSERTION CHANGED WITH THE BEHAVIOUR.**
   *
   * It asserted **404** for an attendee who does not exist. That answer is the disclosure: hand
   * the route a UUID and read the status to learn whether it belongs to a real MyNet attendee.
   * `POST /conversations` refuses to be that oracle by construction — "distinguishing them would
   * turn this route into an oracle for 'is this identifier a real attendee'" — and reporting
   * answered the same question freely, one route over.
   *
   * A nonexistent target and an unreachable one now take the **same 204** a real report takes.
   * Nothing is written either way, which the row count below still proves. Reporting *yourself*
   * keeps its 400: the caller is asking about themselves, so there is no privacy cost, and a
   * silent success would hide a client defect.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses reporting yourself, and discloses nothing about anyone else', async () => {
    expect((await report({ attendeeId: adaId, reason: 'Myself.' })).statusCode).toBe(400)

    const nobody = await report({
      attendeeId: '00000000-0000-4000-8000-000000000000',
      reason: 'Nobody.',
    })

    expect(
      nobody.statusCode,
      'A nonexistent attendee must be answered exactly as a real one is. A 404 here is an ' +
        'existence oracle: the status alone tells the caller whether the identifier is real.',
    ).toBe(204)

    // The disclosure is closed without weakening the effect: nothing was written for either.
    expect(await reportRows()).toHaveLength(0)
  })

  it('says NOTHING about what happens next (FR-548, contract)', async () => {
    const response = await report({ attendeeId: graceId, reason: 'Conduct.', messageIds: [] })

    expect(response.statusCode).toBe(204)
    expect(
      response.body,
      'No case identifier to quote, no status to poll. There is no route that would answer ' +
        'either, and returning one would promise the review surface FR-548 forbids building.',
    ).toBe('')
  })

  it('reporting twice files two reports and leaves the block in place', async () => {
    await report({ attendeeId: graceId, reason: 'First.', messageIds: [] })
    await report({ attendeeId: graceId, reason: 'It happened again.', messageIds: [] })

    // Two reports, because they are two events. One block, because blocking is idempotent — a
    // second report must not be an error just because the first already blocked them.
    expect(await reportRows()).toHaveLength(2)

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendee_blocks WHERE blocker_id = ${adaId}::uuid
    `)
    expect(rows[0]?.count).toBe('1')
  })
})
