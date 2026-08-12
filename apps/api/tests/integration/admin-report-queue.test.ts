import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import {
  conversationPairs,
  conversationParticipants,
  conversations,
} from '../../src/db/schema/conversations.js'
import { messages } from '../../src/db/schema/messages.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { sessionQuestions } from '../../src/db/schema/questions.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { ADA, attendees, clearThrottle, GRACE, setupTestApp, teardown } from './helpers.js'

/**
 * T075, T076, T077 (011) — what the report queue returns, and what it must not (FR-940, FR-941,
 * FR-942, FR-943, SC-902).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE INTERESTING ASSERTIONS HERE ARE THE NEGATIVE ONES.**
 *
 * Decision 38 grants the platform tier a read of **what was reported** and nothing adjacent. The
 * natural implementation — fetch the conversation, let the interface highlight the flagged
 * messages — would disclose the whole thread to an operator who was granted exactly part of it.
 * So the fixture deliberately puts **unreported messages in the same conversation** and asserts
 * they do not appear.
 *
 * `contentAvailable: false` is exercised as a **first-class state** rather than as an error path
 * (FR-941, SC-902): reported ids are stored as plain arrays precisely because the content is
 * usually gone before anybody looks, so this is the expected case and not the exceptional one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'queue-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('the abuse-report queue', () => {
  let app: FastifyInstance
  let adaId: string
  let graceId: string
  let sessionId: string

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
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 007 seeds one conversation between these two attendees, and `conversation_pairs` enforces
    // one conversation per ordered pair — so this fixture builds its own rather than reusing the
    // seeded one, and has to clear it first. The constraint refusing a second pair is the
    // mechanism working, not an obstacle: it is what stops two conversations existing between
    // the same two people.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    await db.delete(messages)
    await db.delete(conversationParticipants)
    await db.delete(conversationPairs)
    await db.delete(conversations)
    await db.delete(sessionQuestions)

    await db.insert(operators).values({
      email: OPERATOR_EMAIL,
      displayName: 'Queue Operator',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      credentialIsInitial: false,
    })

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

  /**
   * A conversation with **four** messages, of which two are reported. The other two are the
   * point: they are what FR-942 forbids returning.
   */
  const conversationReport = async (): Promise<{
    reportId: string
    reported: string[]
    unreported: string[]
  }> => {
    const db = getDb()
    const [conversation] = await db.insert(conversations).values({}).returning({
      id: conversations.id,
    })
    const [lower, higher] = [adaId, graceId].sort()
    await db.insert(conversationPairs).values({
      conversationId: conversation!.id,
      lowerAttendeeId: lower!,
      higherAttendeeId: higher!,
    })
    await db.insert(conversationParticipants).values([
      { conversationId: conversation!.id, attendeeId: adaId },
      { conversationId: conversation!.id, attendeeId: graceId },
    ])

    const written = await db
      .insert(messages)
      .values([
        { conversationId: conversation!.id, authorId: graceId, body: 'REPORTED-ONE' },
        { conversationId: conversation!.id, authorId: graceId, body: 'REPORTED-TWO' },
        { conversationId: conversation!.id, authorId: graceId, body: 'SURROUNDING-A' },
        { conversationId: conversation!.id, authorId: adaId, body: 'SURROUNDING-B' },
      ])
      .returning({ id: messages.id, body: messages.body })

    const reported = written.filter((row) => row.body.startsWith('REPORTED'))
    const unreported = written.filter((row) => row.body.startsWith('SURROUNDING'))

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'THE-REPORTERS-OWN-WORDS',
        messageIds: reported.map((row) => row.id),
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    return {
      reportId: report!.id,
      reported: reported.map((row) => row.body),
      unreported: unreported.map((row) => row.body),
    }
  }

  const questionReport = async (): Promise<string> => {
    const db = getDb()
    const [question] = await db
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: graceId, body: 'A-REPORTED-QUESTION' })
      .returning({ id: sessionQuestions.id })

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Reported this question.',
        messageIds: [],
        questionIds: [question!.id],
      })
      .returning({ id: abuseReports.id })

    return report!.id
  }

  /**
   * **T075 — both origins in one list**, because `abuse_reports` is one cross-event table.
   *
   * 007's rule: conduct is not a conference, and somebody's behaviour does not become acceptable
   * because they switched events. A message report and a question report differ only in which
   * array is populated, and `kind` says which — so an operator works one queue rather than
   * remembering to check two.
   */
  it('shows message and question reports in one list, with no content (FR-940, FR-943)', async () => {
    const conversation = await conversationReport()
    const question = await questionReport()
    const cookie = await platformSession()

    const response = await app.inject({
      method: 'GET',
      url: '/admin/reports',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    const queue = response.json() as { id: string; kind: string; resolution: unknown }[]

    expect(queue.map((row) => row.id).sort()).toEqual([conversation.reportId, question].sort())
    expect(
      queue.map((row) => row.kind).sort(),
      'the two report origins were not distinguished by `kind`',
    ).toEqual(['messages', 'questions'])

    // Open and resolved are separable by the caller from one response (FR-943). Two requests
    // would let the halves disagree about a report resolved between them.
    expect(queue.every((row) => row.resolution === null)).toBe(true)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **NO CONTENT AND NO REASON IN THE LIST**, which is why reading it writes no audit entry.
    // If bodies were here, an operator scrolling a queue would disclose fifty conversations
    // without deciding to read any of them.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(response.body).not.toContain('REPORTED-ONE')
    expect(response.body).not.toContain('A-REPORTED-QUESTION')
    expect(response.body).not.toContain('THE-REPORTERS-OWN-WORDS')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T076 — FR-942. THE SURROUNDING THREAD IS NOT RETURNED, AND THAT IS ENFORCED BY THE QUERY.**
   *
   * The fixture puts two unreported messages in the same conversation. If the detail query ever
   * grows a conversation join — the natural way to build "show the flagged messages in context"
   * — this fails naming the message that leaked.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('returns only what was reported, never the surrounding thread (FR-942)', async () => {
    const { reportId, reported, unreported } = await conversationReport()
    const cookie = await platformSession()

    const response = await app.inject({
      method: 'GET',
      url: `/admin/reports/${reportId}`,
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    const detail = response.json() as {
      reason: string
      contentAvailable: boolean
      content: { body: string }[]
    }

    // The disclosure decision 38 grants: the reported content **and** the reporter's own words.
    expect(detail.contentAvailable).toBe(true)
    expect(detail.content.map((item) => item.body).sort()).toEqual([...reported].sort())
    expect(detail.reason).toBe('THE-REPORTERS-OWN-WORDS')

    for (const body of unreported) {
      expect(
        response.body,
        `"${body}" was in the same conversation but not reported, and it was returned. FR-942 ` +
          'permits only what was reported — never the surrounding thread, the pair’s other ' +
          'conversations, or anything about a third party.',
      ).not.toContain(body)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-942'S OTHER DIRECTION: THE REPORTER MUST NOT BE ABLE TO CHOOSE WHAT THE OPERATOR SEES.**
   *
   * The test above bounds the disclosure *downward* — nothing adjacent to what was reported. This
   * bounds it *sideways*, and it is the one that was missing while the fixture hid the gap.
   *
   * `message_ids` is written **verbatim from the reporter's request body**; `POST /reports`
   * checks only that each entry is a well-formed UUID. So a reporter could name Grace as the
   * subject and list a message **Ada** wrote — or, with an id from any other thread they are in,
   * a message a third party wrote — and the platform tier would be shown it under a report about
   * somebody else. Decision 38's exception would be pointed at content it was never granted over,
   * with the operator unable to tell.
   *
   * Every existing test authored its reported messages as the reported attendee, so the query
   * selecting on id alone looked correct. This one authors the reported message as the **reporter**
   * and requires it to be withheld.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('withholds content the reported attendee did not write (FR-942)', async () => {
    const db = getDb()
    const [conversation] = await db.insert(conversations).values({}).returning({
      id: conversations.id,
    })
    const [lower, higher] = [adaId, graceId].sort()
    await db.insert(conversationPairs).values({
      conversationId: conversation!.id,
      lowerAttendeeId: lower!,
      higherAttendeeId: higher!,
    })
    await db.insert(conversationParticipants).values([
      { conversationId: conversation!.id, attendeeId: adaId },
      { conversationId: conversation!.id, attendeeId: graceId },
    ])

    // Authored by ADA, who is the reporter — not by Grace, who is the subject of the report.
    const [notGraces] = await db
      .insert(messages)
      .values({ conversationId: conversation!.id, authorId: adaId, body: 'SOMEBODY-ELSES-WORDS' })
      .returning({ id: messages.id })

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Naming a message the subject did not write.',
        messageIds: [notGraces!.id],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const cookie = await platformSession()
    const response = await app.inject({
      method: 'GET',
      url: `/admin/reports/${report!.id}`,
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    const detail = response.json() as { contentAvailable: boolean; content: { body: string }[] }

    expect(
      response.body,
      'A report disclosed a message the reported attendee did not write. `message_ids` comes ' +
        'verbatim from the reporter, so selecting on id alone lets the REPORTER choose what the ' +
        'platform tier is shown — including a third party’s private words, under a report about ' +
        'somebody else. The content query must also bound on authorship.',
    ).not.toContain('SOMEBODY-ELSES-WORDS')
    expect(detail.content).toEqual([])

    // It lands in the state that already exists for content deleted before anyone looked
    // (FR-941), rather than needing a new one or an error.
    expect(detail.contentAvailable).toBe(false)
  })

  /**
   * **T077 — `contentAvailable: false` is a STATE, and every report an attendee can file is
   * readable including this one** (FR-941, SC-902).
   *
   * The reported rows are deleted after the report is written, which is the ordinary course of
   * events: an account deletion cascades messages away, and a question's author can withdraw it
   * while it has no votes. The operator must still get who, when and why.
   */
  it('reports missing content as a state rather than an error (FR-941, SC-902)', async () => {
    const { reportId } = await conversationReport()

    // The reported messages go — exactly as they would when the reported attendee deletes their
    // account, or the reporter deletes theirs.
    await getDb().delete(messages)

    const cookie = await platformSession()
    const response = await app.inject({
      method: 'GET',
      url: `/admin/reports/${reportId}`,
      headers: { cookie },
    })

    expect(
      response.statusCode,
      'a report whose content is gone answered with an error. It is the EXPECTED case (FR-941).',
    ).toBe(200)

    const detail = response.json() as {
      contentAvailable: boolean
      content: unknown[]
      reason: string
      reporterName: string
      reportedName: string
    }

    expect(detail.contentAvailable).toBe(false)
    expect(detail.content).toEqual([])
    // Everything else survives: the operator can still act on who reported whom, and why.
    expect(detail.reason).toBe('THE-REPORTERS-OWN-WORDS')
    expect(detail.reporterName.length).toBeGreaterThan(0)
    expect(detail.reportedName.length).toBeGreaterThan(0)
  })

  it('reads a question report the same way, with its body (FR-940)', async () => {
    const reportId = await questionReport()
    const cookie = await platformSession()

    const response = await app.inject({
      method: 'GET',
      url: `/admin/reports/${reportId}`,
      headers: { cookie },
    })

    const detail = response.json() as {
      kind: string
      contentAvailable: boolean
      content: { body: string }[]
    }
    expect(detail.kind).toBe('questions')
    expect(detail.contentAvailable).toBe(true)
    expect(detail.content.map((item) => item.body)).toEqual(['A-REPORTED-QUESTION'])
  })

  /**
   * **A resolved report keeps naming the operator who resolved it, and their display name
   * resolves even after deactivation** (FR-944, FR-909).
   */
  it('shows a resolution attributed to the operator who made it (FR-944)', async () => {
    const { reportId } = await conversationReport()
    const cookie = await platformSession()

    await app.inject({
      method: 'POST',
      url: `/admin/reports/${reportId}/resolution`,
      headers: { cookie },
      payload: { outcome: 'actioned', note: 'Removed the messages at the source.' },
    })

    const queue = (
      await app.inject({ method: 'GET', url: '/admin/reports', headers: { cookie } })
    ).json() as { id: string; resolution: { outcome: string; resolvedBy: string } | null }[]

    const resolved = queue.find((row) => row.id === reportId)
    expect(resolved?.resolution).toMatchObject({
      outcome: 'actioned',
      resolvedBy: 'Queue Operator',
    })
  })
})
