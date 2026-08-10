import { eq, sql } from 'drizzle-orm'
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
 * T058, T059, T061, T062, T063 (009) — what leaving takes with you
 * (FR-760, FR-761, FR-763, FR-765, SC-709, owner decision 1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ANSWER TO THE QUESTION CONSTITUTION v3.2.0 LEFT OPEN FOR THIS PHASE.**
 *
 * v3.2.0 closed register entry 9 by making audience questions attributed, and explicitly left
 * one problem for 009: *what happens to a departing attendee's question that other people have
 * upvoted.* 007's answer for conversations does not transfer — a conversation holds the
 * survivor's own words, and a question by somebody who has left holds nobody's.
 *
 * The answer is owner decision 1: **it goes, and their votes go with it.** Nothing survives
 * de-attributed — no placeholder, no "deleted attendee", no tombstone. The cost is real and is
 * asserted here rather than hidden: other attendees lose a question they backed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T062 — DELETION NEEDS NO APPLICATION CODE AT ALL, AND THAT IS WHAT THIS FILE PROVES.**
 *
 * Both cascades are schema-level, declared in `schema/questions.ts`, which is the point of
 * putting them there: `deleteAccount` was not edited by this feature and does not mention
 * questions or votes. A test that drove a bespoke cleanup routine would prove the routine
 * works; this proves there is nothing to forget.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('questions and account deletion', () => {
  let app: FastifyInstance
  let summitId: string
  let sessionId: string

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

  const vote = async (cookie: string, questionId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'POST',
      url: `/events/${summitId}/questions/${questionId}/vote`,
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const deleteAccount = async (cookie: string) => {
    await clearThrottle()
    return app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const countQuestions = async (id: string): Promise<number> => {
    const rows = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM session_questions WHERE id = ${id}::uuid
    `)
    return rows[0]?.count ?? 0
  }

  const countVotes = async (questionId: string): Promise<number> => {
    const rows = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM question_votes WHERE question_id = ${questionId}::uuid
    `)
    return rows[0]?.count ?? 0
  }

  const votesCastBy = async (attendeeId: string): Promise<number> => {
    const rows = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM question_votes WHERE attendee_id = ${attendeeId}::uuid
    `)
    return rows[0]?.count ?? 0
  }

  const idOf = async (email: string): Promise<string> => {
    const [row] = await getDb().select().from(attendees).where(eq(attendees.email, email))
    return row?.id as string
  }

  beforeAll(async () => {
    app = await setupTestApp()
  })

  beforeEach(async () => {
    // Each case deletes an account, so every one starts from a fresh seed rather than from
    // whatever the previous case left of the fixtures.
    await resetDatabase()
    await clearThrottle()

    const ada = await signIn(ADA)
    summitId = await eventIdByName('Product & Design Summit')

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  it("removes an author's questions AND everybody's votes on them (FR-760, FR-761, SC-709)", async () => {
    const ada = await signIn(ADA)
    const grace = await signIn(GRACE)

    const question = await ask(ada, 'A question Ada asked and Grace backed.')
    await vote(grace, question)

    expect(await countVotes(question), 'the fixture must actually have a vote').toBe(1)

    expect((await deleteAccount(ada)).statusCode).toBe(204)

    expect(await countQuestions(question), "the author's question survived their deletion").toBe(0)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The half that is owner decision 1's stated cost.** Grace's vote is Grace's record, and
    // it goes anyway — because it is a vote *for a question that no longer exists*, and keeping
    // it would leave a count pointing at nothing. This is the cascade from `session_questions`
    // rather than the one from `attendees`, and the two do different work.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(await countVotes(question), "a departed author's question left its votes behind").toBe(0)
  })

  it("removes a voter's votes wherever they were cast, leaving the questions (FR-761)", async () => {
    const ada = await signIn(ADA)
    const grace = await signIn(GRACE)

    const question = await ask(ada, "Ada's question, which outlives Grace's vote.")
    await vote(grace, question)

    expect((await deleteAccount(grace)).statusCode).toBe(204)

    // The other direction of the same table's two cascades: the voter goes, the vote goes, and
    // the question is untouched because it was never theirs.
    expect(await countQuestions(question)).toBe(1)
    expect(await countVotes(question)).toBe(0)
  })

  it('leaves NO placeholder, no de-attributed row and no tombstone (owner decision 1)', async () => {
    const ada = await signIn(ADA)
    const grace = await signIn(GRACE)

    const adaId = await idOf(ADA)
    await ask(ada, 'A question that must vanish completely.')
    const gracesQuestion = await ask(grace, "Grace's, which stays.")
    await vote(ada, gracesQuestion)

    expect(await votesCastBy(adaId)).toBe(1)

    await deleteAccount(ada)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Nothing anywhere still references the departed attendee — not a null author, not a
    // "deleted attendee" row, not an orphan vote. Asserted by counting rows that name the
    // identifier at all, rather than by reading a list, because a tombstone would be invisible
    // to a read that filtered it out.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const authored = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM session_questions WHERE attendee_id = ${adaId}::uuid
    `)
    expect(authored[0]?.count).toBe(0)
    expect(await votesCastBy(adaId)).toBe(0)

    const orphanAuthors = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM session_questions q
      LEFT JOIN attendees a ON a.id = q.attendee_id
      WHERE a.id IS NULL
    `)
    expect(orphanAuthors[0]?.count, 'a question survived with no author to attribute it to').toBe(0)

    // Grace's question is untouched, which is what makes the assertions above about deletion
    // rather than about the table having been emptied.
    expect(await countQuestions(gracesQuestion)).toBe(1)
  })

  it('renders the empty state where a departed attendee was the only asker (T061, FR-727)', async () => {
    const ada = await signIn(ADA)
    const grace = await signIn(GRACE)

    await ask(ada, 'The only question on this session.')
    await deleteAccount(ada)

    const listed = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(grace) },
    })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **An empty list, not a gap and not an error.** A session whose only question belonged to
    // somebody who left is indistinguishable from one nobody has asked about — which is what
    // makes "no tombstone" true from the reader's side as well as in the table.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(listed.statusCode).toBe(200)
    expect((listed.json() as { questions: unknown[] }).questions).toEqual([])
  })

  it('lets the seed clear itself with questions present (T063, FR-763)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **008 met exactly this trap and broke the re-seed with an error naming neither table.**
    //
    // `shared_cards.event_id` was `ON DELETE NO ACTION`, so a surviving card refused
    // `DELETE FROM events` — which is how the seed clears itself. A question referencing a
    // session with anything other than `CASCADE` reproduces it precisely, and the failure
    // surfaces as a foreign-key error mentioning `sessions` and `events` while the actual
    // culprit is `session_questions`.
    //
    // Asserted directly rather than trusted to the seed, because the seed runs in `beforeEach`
    // *before* any question exists — the one ordering in which this trap is invisible.
    //
    // **`DELETE FROM sessions` is the statement that matters, not `DELETE FROM events`.** The
    // seed walks its modules backwards, so `catalogSeed.clear` empties sessions, rooms and
    // tracks before `eventSeed.clear` reaches the events themselves — and `sessions` is the
    // table 009's two new tables actually reference. Asserting the events statement instead
    // would fail on `rooms` and `registrations` first and prove nothing about this feature.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const ada = await signIn(ADA)
    const grace = await signIn(GRACE)

    const question = await ask(ada, 'A question standing between the seed and a clean slate.')
    await vote(grace, question)

    await expect(
      getDb().execute(sql`DELETE FROM sessions`),
      'a question refused the catalog clear — check that session_questions.session_id cascades',
    ).resolves.toBeDefined()

    // And the cascade reached both tables, transitively through `sessions`.
    expect(await countQuestions(question)).toBe(0)
    expect(await countVotes(question)).toBe(0)
  })
})
