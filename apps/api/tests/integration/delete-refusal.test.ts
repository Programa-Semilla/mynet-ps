import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions, sessionNotes } from '../../src/db/schema/agenda.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { questionVotes, sessionQuestions } from '../../src/db/schema/questions.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import {
  ADA,
  attendees,
  clearThrottle,
  GRACE,
  SEED_PASSWORD,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T045 (014) — **each of the four kinds of engagement refuses a deletion, independently**
 * (FR-1018, FR-1019, SC-1002).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FOUR SEPARATE FIXTURES, AND THE SEPARATION IS THE ASSERTION.**
 *
 * A test that engaged every way at once would pass against a predicate that only checked
 * `saved_sessions` — the other three would be present but never consulted, and the failure would
 * appear the first time somebody deleted a session that had a question and no saves. Each kind is
 * therefore driven **alone**, and a predicate missing any one of them fails exactly one case.
 *
 * `question_votes` is the case worth watching: it reaches a session only through
 * `session_questions`, so a predicate written as "tables referencing `sessions`" misses it
 * entirely — and a vote is somebody's record about somebody else's question, which nobody
 * consented to losing.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deletion is refused by any engagement (T045, FR-1018, FR-1019)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string
  let adaId: string
  let graceId: string
  let sessionId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    // Nothing cascades to `events`, so a fixture conference left behind blocks the NEXT file's
    // `seed()` — and the symptom lands there rather than here. See `clearAuthoringFixture`.
    await clearAuthoringFixture()
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })
    sessionId = created.json().id as string

    const db = getDb()
    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]?.id as string
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]?.id as string
  })

  const remove = () =>
    app.inject({
      method: 'DELETE',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}`,
      headers: { cookie },
    })

  const survives = async (): Promise<boolean> =>
    (await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)))
      .length === 1

  it('deletes a session nobody has touched (FR-1018)', async () => {
    // The positive case, and it is not decoration: without it, a predicate that refused
    // everything would pass all four refusal assertions below while making deletion impossible.
    expect((await remove()).statusCode).toBe(204)
    expect(await survives()).toBe(false)
  })

  it('refuses when one attendee has SAVED it', async () => {
    await getDb().insert(savedSessions).values({ attendeeId: adaId, sessionId })

    const response = await remove()
    expect(response.statusCode).toBe(409)
    expect(await survives()).toBe(true)
  })

  it('refuses when one attendee has written a NOTE', async () => {
    await getDb().insert(sessionNotes).values({ attendeeId: adaId, sessionId, body: 'Mine.' })

    expect((await remove()).statusCode).toBe(409)
    expect(await survives()).toBe(true)
  })

  it('refuses when one attendee has asked a QUESTION', async () => {
    await getDb().insert(sessionQuestions).values({ sessionId, attendeeId: adaId, body: 'Why?' })

    expect((await remove()).statusCode).toBe(409)
    expect(await survives()).toBe(true)
  })

  it('refuses when the only engagement is a VOTE, one hop away (FR-1018a)', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The question's author then withdraws it? No — the question is by Ada and the vote is
    // Grace's, and the point is that the vote is **somebody else's record about somebody else's
    // question**. A predicate enumerating tables that reference `sessions` directly would miss
    // `question_votes` entirely, and the failure would look like a successful delete.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const [question] = await getDb()
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: adaId, body: 'Worth a vote?' })
      .returning({ id: sessionQuestions.id })

    await getDb()
      .insert(questionVotes)
      .values({ questionId: question?.id as string, attendeeId: graceId })

    expect((await remove()).statusCode).toBe(409)
    expect(await survives()).toBe(true)
  })

  it('explains the refusal and offers cancellation instead (FR-1019)', async () => {
    await getDb().insert(savedSessions).values({ attendeeId: adaId, sessionId })

    const response = await remove()
    const body = response.json()

    expect(
      body.message,
      'The refusal carries no explanation. FR-1019 requires it to say why and to offer ' +
        'cancellation: an organizer told only "no" has no way to learn that the safe act exists.',
    ).toMatch(/cancel/i)
  })

  it('carries the engagement COUNTS with the refusal, and no identity (FR-1025)', async () => {
    await getDb()
      .insert(savedSessions)
      .values([
        { attendeeId: adaId, sessionId },
        { attendeeId: graceId, sessionId },
      ])
    await getDb().insert(sessionNotes).values({ attendeeId: adaId, sessionId, body: 'Mine.' })

    const response = await remove()

    expect(response.json().engagement).toEqual({
      saved: 2,
      notes: 1,
      questions: 0,
      votes: 0,
    })

    expect(
      response.body.includes(adaId) || response.body.includes(graceId),
      'The refusal names an attendee. Engagement is shown as counts only, with nobody ' +
        'identified (FR-1025) — and at seed scale "1 attendee wrote a note" is already close to ' +
        'a name, which is why the identifier must never accompany it.',
    ).toBe(false)
  })

  it('deletes it once the engagement is gone', async () => {
    // The state an organizer reaches by asking attendees to unsave, or by an attendee leaving.
    // Without this, a refusal that never lifted would pass every assertion above.
    await getDb().insert(savedSessions).values({ attendeeId: adaId, sessionId })
    expect((await remove()).statusCode).toBe(409)

    await getDb().delete(savedSessions).where(eq(savedSessions.sessionId, sessionId))
    expect((await remove()).statusCode).toBe(204)
  })
})
