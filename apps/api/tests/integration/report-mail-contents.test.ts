import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetConfigForTests } from '../../src/config.js'
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
 * T072 (007) — **the operator's mail carries identifiers and a timestamp, and nothing else**
 * (FR-547, research R11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT IS ABSENT FROM THIS MESSAGE IS THE POINT OF IT.**
 *
 * The obvious design puts the reported messages and the reporter's reason in the email, because
 * that is what an operator wants to read. It was rejected, and the reasoning is worth keeping:
 *
 *   - It would copy **two attendees' personal data** into an external provider's systems and
 *     into an inbox with its own retention, indefinitely and outside this project's control.
 *   - The recipient can **query the database directly**. They are the operator; a copy in an
 *     email buys them nothing they do not already have, at the cost of putting attendee-authored
 *     free text somewhere no deletion path reaches.
 *   - The reason string is one attendee's **accusation about another**, written in the moment.
 *     Its home is a row a 90-day sweep removes (research R3), not an inbox.
 *
 * The mail says *a report exists, here is its identifier*. This file asserts that by capturing
 * everything handed to the port and searching it for content that must not be there.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The signature is the real guard.** `sendAbuseReport` has no parameter for a reason or a body,
 * so this could not leak them even by accident — the test protects the signature as much as the
 * call. `mail/service.ts` argues the third method's existence at length.
 */

/** Captures every argument, so the assertions can search the whole call rather than a summary. */
class CapturingMailService implements MailService {
  readonly calls: { to: string; report: unknown }[] = []

  async sendVerification(): Promise<void> {}
  async sendPasswordReset(): Promise<void> {}

  async sendAbuseReport(to: string, report: unknown): Promise<void> {
    this.calls.push({ to, report })
  }
}

const REASON = 'They kept messaging me after I asked them to stop, and it was upsetting.'
const REPORTED_MESSAGE = 'The specific message text that was reported and must not be emailed.'

describe('the operator report mail', () => {
  let app: FastifyInstance
  const mail = new CapturingMailService()

  let adaCookie: string
  let graceId: string
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

  beforeAll(async () => {
    process.env['MAIL_OPERATOR_ADDRESS'] = 'operator@example.invalid'
    // `loadConfig` memoises, so the environment has to be varied through the seam it provides
    // rather than by setting a variable and hoping nothing has read it yet.
    resetConfigForTests()

    app = await setupTestApp({ mail })
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)
    const adaId = await idOf(adaCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId, body: REPORTED_MESSAGE },
    })
    messageId = (opened.json() as { messageId: string }).messageId

    const filed = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, reason: REASON, messageIds: [messageId] },
    })
    if (filed.statusCode !== 204) throw new Error(`Fixture failed: ${filed.body}`)
  })

  afterAll(async () => {
    await teardown(app)
    delete process.env['MAIL_OPERATOR_ADDRESS']
    resetConfigForTests()
  })

  it('is dispatched once, to the configured operator address', () => {
    expect(mail.calls).toHaveLength(1)
    expect(mail.calls[0]?.to).toBe('operator@example.invalid')
  })

  it('carries a report identifier, a timestamp, and the reported message identifiers', () => {
    const report = mail.calls[0]?.report as {
      reportId: string
      reportedAt: string
      messageIds: string[]
    }

    expect(report.reportId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(new Date(report.reportedAt).toISOString()).toBe(report.reportedAt)
    expect(report.messageIds).toEqual([messageId])
  })

  it('CARRIES NO MESSAGE TEXT (research R11)', () => {
    const everything = JSON.stringify(mail.calls)

    expect(
      everything.includes(REPORTED_MESSAGE),
      "Putting reported content in email copies two attendees' personal data into an external " +
        "provider's systems and into an inbox with its own retention — for a recipient who can " +
        'query the database directly.',
    ).toBe(false)
  })

  it('CARRIES NO REASON STRING (research R11)', () => {
    const everything = JSON.stringify(mail.calls)

    expect(
      everything.includes(REASON),
      "The reason is one attendee's accusation about another, written in the moment. Its home " +
        'is a row a 90-day sweep removes, not an inbox nobody in this project controls.',
    ).toBe(false)
    // Not even a fragment of it.
    expect(everything).not.toContain('upsetting')
  })

  it('carries no attendee name, email address or profile detail', () => {
    const everything = JSON.stringify(mail.calls)

    for (const value of ['Ada Lovelace', 'Grace Hopper', ADA, GRACE, 'Analytical Engines']) {
      expect(everything.includes(value), `the mail contains "${value}"`).toBe(false)
    }
  })

  it('does not even carry the reporter or the reported attendee identifier', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Stronger than the requirement, and worth stating as a decision rather than leaving as an
    // accident: the report identifier is enough for an operator to find the row, and the row has
    // both parties in it. Sending the identifiers as well would put "attendee X was reported by
    // attendee Y" into an inbox for no gain.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const everything = JSON.stringify(mail.calls)
    expect(everything).not.toContain(graceId)
  })

  it('is NOT dispatched at all when no operator address is configured', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The expected state today.** Register entry 18 has chosen no provider and spec open
    // question 3 has not named an address. The report must still block and still be written —
    // only the notification is skipped, and the route logs that it was skipped rather than
    // dropping it silently.
    //
    // The environment is varied through `resetConfigForTests`, because `loadConfig` memoises:
    // deleting the variable and building a second application would otherwise reuse the first
    // read, and the test would assert nothing while appearing to.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const unconfigured = new CapturingMailService()
    delete process.env['MAIL_OPERATOR_ADDRESS']
    resetConfigForTests()

    const bare = await setupTestApp({ mail: unconfigured })
    try {
      await resetDatabase()
      const ada = await signIn(ADA)
      const grace = await signIn(GRACE)
      const graceIdentifier = await idOf(grace)

      const filed = await bare.inject({
        method: 'POST',
        url: '/reports',
        headers: { cookie: cookieHeader(ada) },
        payload: { attendeeId: graceIdentifier, reason: 'Conduct.', messageIds: [] },
      })

      expect(filed.statusCode, 'the report still succeeds').toBe(204)
      expect(
        unconfigured.calls,
        'and nothing was dispatched, because there is nowhere to dispatch to',
      ).toEqual([])

      const blocks = await bare.inject({
        method: 'GET',
        url: '/blocks',
        headers: { cookie: cookieHeader(ada) },
      })
      expect(
        (blocks.json() as { blocks: unknown[] }).blocks,
        'the block landed all the same — safety does not depend on configuration',
      ).toHaveLength(1)
    } finally {
      await bare.close()
    }
  })
})
