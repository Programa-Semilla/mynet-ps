import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions, sessionNotes } from '../../src/db/schema/agenda.js'
import { questionVotes, sessionQuestions } from '../../src/db/schema/questions.js'
import {
  buildAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  GRACE,
  registrations,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T043 (014) — **cancelling a session destroys nothing anybody wrote** (FR-1020, FR-1021,
 * SC-1003).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE FOUR TABLES BELOW ALL CASCADE FROM `sessions.id`, WHICH IS WHY THIS FEATURE EXISTS.**
 *
 * Before 014 an organizer had no way to touch a session at all. The moment they do, one `DELETE`
 * is enough for PostgreSQL to silently destroy four kinds of other people's writing — a saved
 * session, a private note, a question, and every vote on it — with no confirmation and no record.
 * v4.2.0's N5 calls that a **correction of a live hazard rather than a preference**.
 *
 * Cancellation is the answer, and this is the assertion that it is a real one: every record still
 * present, still readable **by the attendee who wrote it**, through the ordinary attendee routes.
 * Counting rows in the database would prove they survived; reading them back through the product
 * proves they are still theirs.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('cancellation preserves attendee state (T043, FR-1021, SC-1003)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let organizerCookie: string
  let sessionId: string
  let adaCookie: string
  let graceCookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
    organizerCookie = await organizerSession(app, ADA, SEED_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie: organizerCookie },
      payload: sessionBody(fixture.assigned, { title: 'Doomed but preserved' }),
    })
    sessionId = created.json().id as string

    // Grace is registered for this conference too, so both attendees can engage with it. Two
    // attendees rather than one because FR-1021 is about **everybody's** records, and a single
    // author cannot show that somebody else's survived.
    const db = getDb()
    const [grace] = await db.select().from(attendees).where(eq(attendees.email, GRACE))
    await db
      .insert(registrations)
      .values({ attendeeId: grace?.id as string, eventId: fixture.assigned.eventId })

    adaCookie = await attendeeSession(ADA)
    graceCookie = await attendeeSession(GRACE)
  })

  const attendeeSession = async (email: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    return cookieHeader(sessionCookieFrom(response) as string)
  }

  const engage = async (): Promise<{ questionId: string }> => {
    const base = `/events/${fixture.assigned.eventId}`

    for (const cookie of [adaCookie, graceCookie]) {
      await app.inject({
        method: 'PUT',
        url: `${base}/agenda/saved/${sessionId}`,
        headers: { cookie },
      })
      await app.inject({
        method: 'PUT',
        url: `${base}/agenda/notes/${sessionId}`,
        headers: { cookie },
        payload: { body: 'Worth remembering.' },
      })
    }

    const asked = await app.inject({
      method: 'POST',
      url: `${base}/sessions/${sessionId}/questions`,
      headers: { cookie: adaCookie },
      payload: { body: 'Will the slides be shared?' },
    })

    const questionId = (asked.json().questions as { id: string }[])[0]?.id as string

    await app.inject({
      method: 'POST',
      url: `${base}/questions/${questionId}/vote`,
      headers: { cookie: graceCookie },
    })

    return { questionId }
  }

  const cancel = () =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}/cancel`,
      headers: { cookie: organizerCookie },
    })

  it('keeps every saved session, note, question and vote (FR-1021, SC-1003)', async () => {
    const { questionId } = await engage()
    expect((await cancel()).statusCode).toBe(200)

    const db = getDb()

    expect(
      await db.select().from(savedSessions).where(eq(savedSessions.sessionId, sessionId)),
      'Saved-session rows were destroyed by a cancellation.',
    ).toHaveLength(2)

    expect(
      await db.select().from(sessionNotes).where(eq(sessionNotes.sessionId, sessionId)),
      "Private notes were destroyed by a cancellation. This is the product's most personal " +
        'content and nobody consented to an organizer removing it.',
    ).toHaveLength(2)

    expect(
      await db.select().from(sessionQuestions).where(eq(sessionQuestions.sessionId, sessionId)),
    ).toHaveLength(1)

    expect(
      await db.select().from(questionVotes).where(eq(questionVotes.questionId, questionId)),
      "Votes were destroyed. 009's precedent does not license that: a withdrawn question takes " +
        'everybody’s votes because the AUTHOR exercised erasure over their own words, and that ' +
        'does not transfer to a third party erasing somebody else’s.',
    ).toHaveLength(1)
  })

  it('leaves every record readable BY ITS AUTHOR, through the ordinary routes (SC-1003)', async () => {
    // Rows surviving in the database is not the requirement. SC-1003 says 100% of them remain
    // **readable by the attendees who wrote them**, and that is a different claim: a read path
    // that filtered cancelled sessions out would satisfy the assertion above and fail this one.
    await engage()
    await cancel()

    const base = `/events/${fixture.assigned.eventId}`

    for (const cookie of [adaCookie, graceCookie]) {
      const saved = await app.inject({
        method: 'GET',
        url: `${base}/agenda/saved`,
        headers: { cookie },
      })
      expect(
        (saved.json().sessions as { sessionId: string }[]).map((entry) => entry.sessionId),
      ).toContain(sessionId)

      const notes = await app.inject({
        method: 'GET',
        url: `${base}/agenda/notes`,
        headers: { cookie },
      })
      expect(
        (notes.json().notes as { sessionId: string; body: string }[]).find(
          (note) => note.sessionId === sessionId,
        )?.body,
      ).toBe('Worth remembering.')
    }

    const questions = await app.inject({
      method: 'GET',
      url: `${base}/sessions/${sessionId}/questions`,
      headers: { cookie: adaCookie },
    })

    expect(questions.statusCode).toBe(200)
    expect((questions.json().questions as { votes: number }[])[0]?.votes).toBe(1)
  })

  it('presents the session as CANCELLED rather than removing it (FR-1022)', async () => {
    await engage()
    await cancel()

    const catalog = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions`,
      headers: { cookie: adaCookie },
    })

    const listed = (catalog.json() as { id: string; cancelled: boolean }[]).find(
      (entry) => entry.id === sessionId,
    )

    expect(
      listed,
      'A cancelled session disappeared from the programme. An attendee who saved it needs to see ' +
        'that it will not happen — a session that simply vanished is indistinguishable from one ' +
        'they misremembered (FR-1022).',
    ).toBeDefined()
    expect(listed?.cancelled).toBe(true)
  })

  it('is reversible, and reinstating restores the ordinary state (FR-1024)', async () => {
    await cancel()

    const reinstated = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}/reinstate`,
      headers: { cookie: organizerCookie },
    })

    expect(reinstated.statusCode).toBe(200)

    const catalog = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions`,
      headers: { cookie: adaCookie },
    })

    expect(
      (catalog.json() as { id: string; cancelled: boolean }[]).find(
        (entry) => entry.id === sessionId,
      )?.cancelled,
    ).toBe(false)
  })

  it('refuses to cancel an already-cancelled session, rather than re-stamping it', async () => {
    await cancel()
    const second = await cancel()

    expect(
      second.statusCode,
      'Cancelling twice succeeded. The second act would re-stamp `logistics_changed_at` and ' +
        'dispatch a second notification for a cancellation that already happened.',
    ).toBe(404)
  })

  it('shows the organizer the engagement, as counts with nobody named (FR-1025)', async () => {
    await engage()

    const programme = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.assigned.eventId}/programme`,
      headers: { cookie: organizerCookie },
    })

    const listed = (programme.json().sessions as { id: string; engagement: unknown }[]).find(
      (entry) => entry.id === sessionId,
    )

    expect(listed?.engagement).toEqual({ saved: 2, notes: 2, questions: 1, votes: 1 })

    // And the negative half, which is the requirement: no identity, anywhere in the response.
    const body = programme.body
    for (const identifier of [fixture.organizerId]) {
      expect(
        body.includes(identifier),
        'The programme response carries an attendee identifier. Engagement is an aggregate with ' +
          'no identity attached (FR-1025), and no administrative tier may learn who saved, ' +
          'questioned or voted on a session (FR-1042).',
      ).toBe(false)
    }
  })
})
