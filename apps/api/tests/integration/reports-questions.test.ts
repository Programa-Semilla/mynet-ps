import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetConfigForTests } from '../../src/config.js'
import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
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
 * T067 (009) — reporting a question (FR-781–FR-784, SC-711a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **REPORTING FROM A QUESTION, WITHOUT OPENING A CONVERSATION FIRST — THAT IS FR-781.**
 *
 * Before this, the only report path in the product started in a thread. An attendee facing an
 * abusive *question* would have had to message its author to reach it, which is contact with the
 * very person they want to stop. This is what makes the product's first unmoderated
 * many-to-many surface survivable, in a product with public self sign-up and no moderator by
 * construction.
 *
 * Everything else about the route is 007's and is unchanged: **the block lands first** so a
 * failure anywhere after it still leaves the reporter protected, the row is written second, and
 * the mail is dispatched third with its failure isolated.
 * ═════════════════════════════════════════════════════════════════════════════════════════
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

const QUESTION = 'The specific question text that was reported and must never be emailed.'
const REASON = 'This question is abusive, and I do not want to hear from this person again.'

describe('reporting an audience question', () => {
  let app: FastifyInstance
  const mail = new CapturingMailService()

  let ada: string
  let grace: string
  let graceId: string
  let summitId: string
  let sessionId: string
  let questionId: string

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

  const list = async (cookie: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { questions: Array<{ id: string }> }).questions
  }

  beforeAll(async () => {
    process.env['MAIL_OPERATOR_ADDRESS'] = 'operator@example.invalid'
    // `loadConfig` memoises, so the environment has to be varied through the seam it provides.
    resetConfigForTests()

    app = await setupTestApp({ mail })
    await resetDatabase()

    ada = await signIn(ADA)
    grace = await signIn(GRACE)
    graceId = await idOf(grace)

    const [row] = await getDb()
      .select()
      .from(events)
      .where(eq(events.name, 'Product & Design Summit'))
    summitId = row?.id as string

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string

    await clearThrottle()
    const asked = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(grace) },
      payload: { body: QUESTION },
    })
    questionId = (
      asked.json() as { questions: Array<{ id: string; body: string }> }
    ).questions.find((question) => question.body === QUESTION)?.id as string

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The report, carrying a question and NO conversation.** No thread exists between these
    // two accounts, which is exactly the situation FR-781 exists for.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await clearThrottle()
    const reported = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(ada) },
      payload: { attendeeId: graceId, reason: REASON, questionIds: [questionId] },
    })
    expect(reported.statusCode).toBe(204)
  })

  afterAll(async () => {
    delete process.env['MAIL_OPERATOR_ADDRESS']
    resetConfigForTests()
    await teardown(app)
  })

  it('stores the reported question identifiers on the report (FR-783)', async () => {
    const rows = await getDb().execute<{ question_ids: string[]; message_ids: string[] }>(sql`
      SELECT question_ids, message_ids FROM abuse_reports ORDER BY created_at DESC LIMIT 1
    `)

    expect(rows[0]?.question_ids).toEqual([questionId])
    // And no conversation was invented to hang it on — the report concerns a question, so the
    // messages array stays empty rather than acquiring a thread identifier that means nothing.
    expect(rows[0]?.message_ids).toEqual([])
  })

  it('blocks the author in the same act, so the questions vanish (FR-782, SC-711a)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Protection first.** 007 makes reporting *include* blocking rather than suggesting it
    // afterwards, and 009 inherits it unchanged — which is what makes a report from a question
    // an act that stops the thing rather than paperwork that files it.
    //
    // The visible consequence here is 009's: the block predicate is read at Q&A read time, so
    // every question by that author leaves the reporter's list, not merely the reported one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect((await list(ada)).map((question) => question.id)).not.toContain(questionId)

    const blocked = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(ada) },
    })
    expect(JSON.stringify(blocked.json())).toContain(graceId)
  })

  it('hides EVERY question by that author, not only the reported one (FR-785)', async () => {
    // A second question by the same author, asked before the report. The block filter is on the
    // author rather than on the reported row, so this must be gone too — otherwise reporting one
    // question would leave the reporter reading the rest of them.
    await clearThrottle()
    const another = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(grace) },
      payload: { body: 'Another question by the same author.' },
    })
    // Grace's own write still answers with her own view, which includes it.
    expect(another.statusCode).toBe(201)

    const adaSees = (await list(ada)).map((question) => question.id)
    const graceSees = (await list(grace)).map((question) => question.id)

    expect(adaSees).toHaveLength(0)
    expect(graceSees.length, "the author's own view is untouched by being blocked").toBeGreaterThan(
      0,
    )
  })

  it('carries identifiers and a timestamp to the operator — never the question text (FR-784)', async () => {
    expect(mail.calls.length, 'no operator mail was dispatched').toBeGreaterThan(0)
    const call = mail.calls.at(-1)
    const serialised = JSON.stringify(call)

    expect(call?.to).toBe('operator@example.invalid')

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **What is absent is the point.** A question is published to a whole conference, which
    // makes it feel quotable — and quoting it here would move an attendee's words into an inbox
    // with its own retention, outside this project's control and beyond every deletion path.
    // The reason string is worse still: one attendee's accusation about another.
    //
    // `sendAbuseReport`'s signature has no parameter for either, so this protects the signature
    // as much as the call.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    expect(serialised, 'the question text reached the operator mail').not.toContain(QUESTION)
    expect(serialised, "the reporter's reason reached the operator mail").not.toContain(REASON)

    // A timestamp and an identifier, which is what an operator needs to find the row.
    expect(serialised).toMatch(/reportId/)
    expect(serialised).toMatch(/reportedAt/)
  })

  it('leaves the report readable from nowhere inside the product (FR-773a, SC-508)', async () => {
    // The absence 007 built and 009 must not erode. Asserted here as well as in the unit guard
    // because this feature adds a *column* to the table, and a column is the usual reason
    // somebody adds a way to read one back.
    for (const url of ['/reports', `/reports/${questionId}`, '/events/reports']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: cookieHeader(ada) },
      })
      expect(response.statusCode, `${url} answered something other than 404`).toBe(404)
    }
  })
})
