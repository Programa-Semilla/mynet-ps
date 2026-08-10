import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
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
 * T060 (009) — questions and votes in the personal-data export (FR-764, SC-710).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE STRUCTURAL GUARD PROVES THE FIELDS EXIST; THIS PROVES THEY CARRY THE RIGHT VALUES.**
 *
 * `tests/unit/export-coverage.test.ts` fails when a column has no mapping, and
 * `tests/integration/export.test.ts` walks that mapping against a real document to prove each
 * named field is present. Neither looks at *what is in* the fields — a query joined to the wrong
 * session, or filtered on the wrong attendee, satisfies both perfectly.
 *
 * So this file checks the two things a reader of their own export actually depends on: that
 * their questions are theirs and nobody else's, and that each entry **names its session** well
 * enough to be recognised a year later, when the identifiers mean nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('questions in the personal-data export', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let summitId: string
  let sessionId: string
  let sessionTitle: string
  let gracesQuestionId: string

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}.`)
    return token
  }

  const ask = async (cookie: string, body: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })
    const asked = (
      response.json() as { questions: Array<{ id: string; body: string }> }
    ).questions.find((question) => question.body === body)
    if (!asked) throw new Error(`The ask did not come back: ${response.body}`)
    return asked.id
  }

  interface Export {
    questionsAsked: Array<{
      questionId: string
      sessionId: string
      sessionTitle: string
      eventId: string
      body: string
      askedAt: string
    }>
    questionVotes: Array<{
      questionId: string
      sessionId: string
      sessionTitle: string
      votedAt: string
    }>
  }

  const exportFor = async (cookie: string): Promise<Export> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'GET',
      url: '/profile/export',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode).toBe(200)
    return response.json() as Export
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    ada = await signIn(ADA)
    grace = await signIn(GRACE)

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
    const first = (programme.json() as Array<{ id: string; title: string }>)[0]
    sessionId = first?.id as string
    sessionTitle = first?.title as string

    await ask(ada, 'A question Ada asked, which her export contains.')
    gracesQuestionId = await ask(grace, "Grace's question, which Ada upvoted.")

    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: `/events/${summitId}/questions/${gracesQuestionId}/vote`,
      headers: { cookie: cookieHeader(ada) },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('contains every question the attendee asked, naming its session (FR-764, SC-710)', async () => {
    const document = await exportFor(ada)

    const asked = document.questionsAsked.find(
      (question) => question.body === 'A question Ada asked, which her export contains.',
    )

    expect(asked, "Ada's own question is missing from her export").toBeDefined()
    expect(asked?.sessionId).toBe(sessionId)
    expect(asked?.eventId).toBe(summitId)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The title is what makes the document readable a year later**, when `sessionId` names
    // nothing the attendee recognises. It is seeded conference content rather than personal
    // data, reproduced here for the same reason `savedSessions` reproduces it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(asked?.sessionTitle).toBe(sessionTitle)
    expect(asked?.askedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('contains every vote the attendee cast, naming its session (FR-764)', async () => {
    const document = await exportFor(ada)

    const cast = document.questionVotes.find((vote) => vote.questionId === gracesQuestionId)

    expect(cast, "Ada's upvote is missing from her export").toBeDefined()
    expect(cast?.sessionId).toBe(sessionId)
    expect(cast?.sessionTitle).toBe(sessionTitle)
    expect(cast?.votedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("contains no other attendee's question, in either section (FR-375)", async () => {
    const document = await exportFor(ada)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // `attendee_id = the requester` is the export queries' WHERE clause, which is what makes
    // this structural rather than a filter applied afterwards. Asserted from both directions:
    // Grace's question is absent from Ada's `questionsAsked`…
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(document.questionsAsked.map((question) => question.questionId)).not.toContain(
      gracesQuestionId,
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // …and the **text** of it appears nowhere in the votes section either, even though Ada
    // voted for it. A vote is a fact about Ada; the question it backs is Grace's words, and
    // reproducing them would hand one attendee a machine-readable copy of another's content
    // through a self-service route the author never sees — the reasoning FR-578 gives for
    // received messages, reached here by a different road.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(JSON.stringify(document.questionVotes)).not.toMatch(/Grace's question/)
  })

  it('gives Grace HER questions, so the scoping is not simply an empty result', async () => {
    // Non-vacuity. Every assertion above would pass against an export that returned nothing at
    // all for both sections.
    const document = await exportFor(grace)

    expect(document.questionsAsked.map((question) => question.questionId)).toContain(
      gracesQuestionId,
    )
    expect(document.questionVotes, 'Grace voted for nothing and should have an empty list').toEqual(
      [],
    )
  })
})
