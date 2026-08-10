import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
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
 * T036 (009) — asking a question, and who can see it (FR-701, FR-702, FR-708, FR-734, FR-743).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CROSSING IS THE FEATURE.** Every other surface in this product shows an attendee their
 * own records or one counterpart's; this is the first where one attendee writes something that
 * **every** co-attendee reads, under a real name and with no opt-out. So the central assertion
 * is not that a row was written — it is that a *second account* sees it, attributed.
 *
 * The refusal half is the other side of the same property: a reader who is not registered for
 * the conference must be refused **indistinguishably** from a session that does not exist, or
 * the public list becomes a way to enumerate conferences (FR-743).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('asking a question', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let summitId: string
  let sessionId: string
  /** A conference Grace is registered for and Ada is not — the refusal fixture. */
  let graceOnlyEventId: string

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}; the test cannot proceed.`)
    return token
  }

  const list = (cookie: string, eventId = summitId, session = sessionId) =>
    app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions/${session}/questions`,
      headers: { cookie: cookieHeader(cookie) },
    })

  const ask = (cookie: string, body: string, eventId = summitId, session = sessionId) =>
    app.inject({
      method: 'POST',
      url: `/events/${eventId}/sessions/${session}/questions`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    ada = await signIn(ADA)
    grace = await signIn(GRACE)

    summitId = await eventIdByName('Product & Design Summit')

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string

    const graceEvents = (
      await app.inject({
        method: 'GET',
        url: '/events',
        headers: { cookie: cookieHeader(grace) },
      })
    ).json() as Array<{ id: string }>
    const adaEvents = (
      await app.inject({ method: 'GET', url: '/events', headers: { cookie: cookieHeader(ada) } })
    ).json() as Array<{ id: string }>

    const only = graceEvents.find((event) => !adaEvents.some((mine) => mine.id === event.id))
    if (!only) throw new Error('Seed must give Grace a conference Ada is not registered for.')
    graceOnlyEventId = only.id
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('carries a question from one attendee to another, attributed (FR-701, FR-702)', async () => {
    const asked = await ask(ada, 'What did the migration actually cost you?')
    expect(asked.statusCode).toBe(201)

    // The write answers with the whole re-ordered list rather than the created row (research R5),
    // which is what lets the asker's own question appear with no second request (FR-730).
    const own = (asked.json() as { questions: Array<{ body: string }> }).questions
    expect(own.map((question) => question.body)).toContain(
      'What did the migration actually cost you?',
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The assertion this file exists for.** A different account, on the same session.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const seen = await list(grace)
    expect(seen.statusCode).toBe(200)

    const questions = (seen.json() as { questions: Array<Record<string, unknown>> }).questions
    const crossed = questions.find(
      (question) => question.body === 'What did the migration actually cost you?',
    )

    expect(crossed, "Grace cannot see Ada's question — the list is not public").toBeDefined()
    expect(crossed?.authorDisplayName).toBe('Ada Lovelace')
    expect(crossed?.votes).toBe(0)
    // Grace has not voted, and it is not hers to withdraw.
    expect(crossed?.votedByMe).toBe(false)
    expect(crossed?.canWithdraw).toBe(false)
  })

  it('attributes a question to an author who is NOT discoverable (FR-734, FR-735)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The exception constitution v3.3.0 records, asserted against the database rather than
    // against a comment.** Attribution has no opt-out: turning discoverability off removes you
    // from the *directory*, not from a question you published to the room.
    //
    // The directory query one file over applies `discoverable = true AND email_verified_at IS
    // NOT NULL`; this list applies neither, and each absence looks exactly like a forgotten
    // `WHERE`. This is what would fail if somebody "fixed" one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.email, GRACE))

    try {
      await ask(grace, 'Does the toggle hide my question too?')

      const seen = await list(ada)
      const questions = (seen.json() as { questions: Array<Record<string, unknown>> }).questions
      const hers = questions.find(
        (question) => question.body === 'Does the toggle hide my question too?',
      )

      expect(hers, 'a non-discoverable attendee vanished from the question list').toBeDefined()
      expect(
        hers?.authorDisplayName,
        'a non-discoverable author was rendered anonymous, which attribution forbids',
      ).toBe('Grace Hopper')

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **THE SECOND HALF, WITHOUT WHICH THE FIRST LOOKS LIKE A DEFECT** (FR-736, SC-707).
      //
      // The spec says both halves must be verified together, "because either alone would look
      // like a defect". Naming a non-discoverable author is only defensible because the name is
      // **attribution and not a route**: her profile must still refuse to open, from the
      // existing profile route, unchanged by this feature.
      //
      // Asserted through the real route rather than by reading the query, because what FR-736
      // forbids is a *reachable* profile — and reachability is a property of the route.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const profile = await app.inject({
        method: 'GET',
        url: `/events/${summitId}/attendees/${hers?.authorId}`,
        headers: { cookie: cookieHeader(ada) },
      })

      expect(
        profile.statusCode,
        "a non-discoverable author's profile opened from the identifier her question carries. " +
          'The attribution has become a route around the directory, which FR-736 forbids.',
      ).toBe(404)
    } finally {
      await getDb().update(attendees).set({ discoverable: true }).where(eq(attendees.email, GRACE))
    }
  })

  it('refuses a reader who is not registered, exactly like a session that does not exist (FR-743)', async () => {
    const NOWHERE = '00000000-0000-0000-0000-000000000000'

    const notRegistered = await list(ada, graceOnlyEventId, NOWHERE)
    const noSuchEvent = await list(ada, NOWHERE, NOWHERE)
    const noSuchSession = await list(ada, summitId, NOWHERE)
    const malformed = await list(ada, summitId, 'not-a-uuid')

    for (const refusal of [notRegistered, noSuchEvent, noSuchSession, malformed]) {
      expect(refusal.statusCode).toBe(404)
    }

    // Identical **bodies**, not merely identical statuses. A different `message` between two of
    // these would distinguish them just as well as a 403 would.
    const bodies = [notRegistered, noSuchEvent, noSuchSession, malformed].map((r) => r.body)
    expect(new Set(bodies).size, 'the four refusals are distinguishable by their bodies').toBe(1)
  })

  it('refuses an ask into a conference the caller is not registered for (FR-741)', async () => {
    // The session identifier is a real one — from Ada's conference — so the only thing wrong
    // with this request is the conference in the address. It must still be refused, and the
    // question must not land anywhere.
    const refused = await ask(ada, 'Can I ask into a room I am not in?', graceOnlyEventId)
    expect(refused.statusCode).toBe(404)

    const seen = await list(grace)
    const questions = (seen.json() as { questions: Array<{ body: string }> }).questions
    expect(questions.map((question) => question.body)).not.toContain(
      'Can I ask into a room I am not in?',
    )
  })

  it('refuses everything without a sign-in session', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
    })
    expect(anonymous.statusCode).toBe(401)
  })
})
