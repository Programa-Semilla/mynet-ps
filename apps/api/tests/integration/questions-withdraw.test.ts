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
 * T051, T052, T053 (009) — withdrawing a question (FR-712–FR-715, SC-708).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE RACE IS THE POINT OF THIS FILE, AND IT IS THE ONE THING NO OTHER LAYER CAN TEST.**
 *
 * FR-714 does not merely say "refuse once a vote exists" — it says the check must happen
 * **inside the transaction that deletes**. A handler that read the count, found zero, and then
 * deleted would pass every assertion here except the interleaving one, and would lose a vote
 * that arrived in the gap: the question disappears and somebody's upvote goes with it, silently.
 *
 * The interleaved case below drives that window directly, against a real database, which is the
 * only place row locks exist to be observed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('withdrawing a question', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let summitId: string
  let sessionId: string
  let graceId: string

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

  interface Question {
    id: string
    body: string
    votes: number
    canWithdraw: boolean
  }

  const ask = async (cookie: string, body: string): Promise<Question> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })
    const asked = (response.json() as { questions: Question[] }).questions.find(
      (question) => question.body === body,
    )
    if (!asked) throw new Error(`The ask did not come back: ${response.body}`)
    return asked
  }

  const withdraw = async (cookie: string, questionId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'DELETE',
      url: `/events/${summitId}/questions/${questionId}`,
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const vote = async (cookie: string, questionId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'POST',
      url: `/events/${summitId}/questions/${questionId}/vote`,
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const unvote = async (cookie: string, questionId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'DELETE',
      url: `/events/${summitId}/questions/${questionId}/vote`,
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const list = async (cookie: string): Promise<Question[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { questions: Question[] }).questions
  }

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

    const [row] = await getDb().select().from(attendees).where(eq(attendees.email, GRACE))
    graceId = row?.id as string
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('withdraws an unvoted question, and it is gone for everybody (FR-712, SC-708)', async () => {
    const question = await ask(ada, 'A question I will take back.')
    expect(question.canWithdraw, 'an unvoted question of your own is withdrawable').toBe(true)

    const removed = await withdraw(ada, question.id)
    expect(removed.statusCode).toBe(200)

    // The write answers with the re-ordered list, like every other write here.
    const remaining = (removed.json() as { questions: Question[] }).questions
    expect(remaining.map((candidate) => candidate.id)).not.toContain(question.id)

    // **And for a second account**, which is the half that makes it a withdrawal rather than a
    // hidden row.
    expect((await list(grace)).map((candidate) => candidate.id)).not.toContain(question.id)
  })

  it('refuses once somebody has upvoted it, WITH its reason (FR-714, FR-744, SC-708)', async () => {
    const question = await ask(ada, 'A question somebody will back.')
    await vote(grace, question.id)

    const refused = await withdraw(ada, question.id)
    expect(refused.statusCode).toBe(403)

    const body = refused.json() as { code: string; message: string }
    expect(body.code).toBe('question_has_votes')
    // Explained, because it describes the reader's own question to the reader — and it names no
    // voter, no count and no timing, which is what keeps the explanation safe.
    expect(body.message).toMatch(/upvoted/i)
    expect(body.message).not.toMatch(/Grace/i)

    // Still there, for both of them.
    expect((await list(ada)).map((candidate) => candidate.id)).toContain(question.id)
    expect((await list(grace)).map((candidate) => candidate.id)).toContain(question.id)
  })

  it('refuses a question the caller did not write, whatever any interface offered (FR-715)', async () => {
    const question = await ask(ada, "Grace's attempt to remove this must fail.")

    const refused = await withdraw(grace, question.id)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **404 rather than 403.** The withdrawal reason is safe to explain because it is about the
    // reader's own question; "this is not yours" is a fact about somebody else's, so it takes
    // the indistinguishable refusal (FR-743). Grace learns nothing she could not already see.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(refused.statusCode).toBe(404)
    expect((await list(ada)).map((candidate) => candidate.id)).toContain(question.id)
  })

  it('refuses when a vote lands between the render and the submission (FR-714)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **The race.** The attendee's screen says `canWithdraw: true` — truthfully, when it was
    // drawn. A vote then arrives, and the withdrawal request is sent afterwards.
    //
    // An implementation that trusted the client's `canWithdraw`, or that checked the count
    // before opening its transaction, deletes the question here and takes a real upvote with
    // it. The transaction-internal re-check under `FOR UPDATE` is what refuses instead.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const question = await ask(ada, 'The window between deciding and doing.')
    expect(question.canWithdraw).toBe(true)

    // The vote arrives after Ada's screen was drawn, and before she acts on it.
    await vote(grace, question.id)

    const refused = await withdraw(ada, question.id)
    expect(
      refused.statusCode,
      'a vote that arrived after the list was rendered was not seen by the withdrawal',
    ).toBe(403)
    expect((refused.json() as { code: string }).code).toBe('question_has_votes')

    // The vote survived, which is the harm the refusal exists to prevent.
    const still = (await list(grace)).find((candidate) => candidate.id === question.id)
    expect(still?.votes).toBe(1)
  })

  it('BLOCKS on a vote that is still uncommitted, then refuses once it lands (FR-714)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **THE ACTUAL INTERLEAVING. Every other case in this file commits the vote before the
    // withdrawal is issued, and an implementation that read the count outside any transaction
    // would pass all of them.**
    //
    // Here the vote is inserted on a second connection and **held open**. The withdrawal's
    // `SELECT … FOR UPDATE OF q` then has to wait: inserting a vote takes `FOR KEY SHARE` on the
    // referenced question row, and `FOR UPDATE` conflicts with it. So the request cannot resolve
    // until the vote's transaction ends — which is the entire mechanism FR-714 asks for, and the
    // only place it can be observed is a real database.
    //
    // Without the lock, the withdrawal would read zero votes, delete the question, and take a
    // real upvote with it — silently, and with the voter's own record gone.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const question = await ask(ada, 'A question a vote is racing.')

    let releaseVote: (() => void) | undefined
    const voteHeld = new Promise<void>((resolve) => {
      releaseVote = resolve
    })

    // A transaction that inserts the vote and then waits for this test to let it commit.
    const voting = getDb().transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO question_votes (question_id, attendee_id)
        VALUES (${question.id}::uuid, ${graceId}::uuid)
      `)
      await voteHeld
    })

    // Give the insert time to take its lock before the withdrawal asks for a conflicting one.
    await new Promise((resolve) => setTimeout(resolve, 250))

    await clearThrottle()
    const withdrawal = app.inject({
      method: 'DELETE',
      url: `/events/${summitId}/questions/${question.id}`,
      headers: { cookie: cookieHeader(ada) },
    })

    // ── It must NOT have resolved: it is waiting on the lock ───────────────────────────────
    const pending = Symbol('still waiting')
    const raced = await Promise.race([
      withdrawal.then(() => 'resolved' as const),
      new Promise<typeof pending>((resolve) => setTimeout(() => resolve(pending), 750)),
    ])

    expect(
      raced,
      'the withdrawal resolved while a vote was still uncommitted — it did not take the row ' +
        'lock, so the "no votes" check is being made outside the deleting transaction (FR-714)',
    ).toBe(pending)

    // ── The vote commits, the lock is released, and the withdrawal is refused ──────────────
    releaseVote?.()
    await voting

    const refused = await withdrawal
    expect(refused.statusCode).toBe(403)
    expect((refused.json() as { code: string }).code).toBe('question_has_votes')

    // The question and the vote both survived, which is the harm the lock prevents.
    const still = (await list(grace)).find((candidate) => candidate.id === question.id)
    expect(still?.votes).toBe(1)
  })

  it('SUCCEEDS when the racing vote is rolled back instead (the negative control)', async () => {
    // The mirror of the case above, and the reason it is not vacuous: if the withdrawal simply
    // always refused after waiting, this would fail. The lock must delay the decision, not
    // predetermine it.
    const question = await ask(ada, 'A question a vote is racing, and losing.')

    let abandonVote: (() => void) | undefined
    const voteHeld = new Promise<void>((resolve) => {
      abandonVote = resolve
    })

    const voting = getDb()
      .transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO question_votes (question_id, attendee_id)
          VALUES (${question.id}::uuid, ${graceId}::uuid)
        `)
        await voteHeld
        // Rolling back by throwing, which is how drizzle ends a transaction unsuccessfully.
        throw new Error('the voter changed their mind')
      })
      .catch(() => undefined)

    await new Promise((resolve) => setTimeout(resolve, 250))

    await clearThrottle()
    const withdrawal = app.inject({
      method: 'DELETE',
      url: `/events/${summitId}/questions/${question.id}`,
      headers: { cookie: cookieHeader(ada) },
    })

    abandonVote?.()
    await voting

    const removed = await withdrawal
    expect(
      removed.statusCode,
      'a rolled-back vote still blocked the withdrawal — the re-check is seeing uncommitted data',
    ).toBe(200)

    expect((await list(grace)).map((candidate) => candidate.id)).not.toContain(question.id)
  })

  it('holds the refusal even against a vote inserted straight into the table', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The route path above proves the handler re-reads. This proves the re-read reaches the
    // **table** rather than any cached or returned value: the vote is written with the API
    // bypassed entirely, so nothing the handler saw earlier could know about it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const question = await ask(ada, 'A vote nobody routed.')

    await getDb().execute(sql`
      INSERT INTO question_votes (question_id, attendee_id)
      VALUES (${question.id}::uuid, ${graceId}::uuid)
    `)

    expect((await withdraw(ada, question.id)).statusCode).toBe(403)
  })

  it('becomes withdrawable again when every vote is taken back (Edge Cases)', async () => {
    const question = await ask(ada, 'Backed, then unbacked.')

    await vote(grace, question.id)
    expect((await withdraw(ada, question.id)).statusCode).toBe(403)

    await unvote(grace, question.id)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Nothing in the application notices this. `canWithdraw` is `author = reader AND votes = 0`
    // computed in the list query, so removing the last vote restores the possibility with no
    // state transition, no flag and no repair path — which is why it is worth asserting: an
    // implementation that had stored "was once voted" would fail here and nowhere else.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const restored = (await list(ada)).find((candidate) => candidate.id === question.id)
    expect(restored?.canWithdraw).toBe(true)

    expect((await withdraw(ada, question.id)).statusCode).toBe(200)
    expect((await list(grace)).map((candidate) => candidate.id)).not.toContain(question.id)
  })

  it('takes the votes with it when a voted question is withdrawn by cascade', async () => {
    // A question with votes cannot be withdrawn through the route, so the cascade this asserts
    // is reachable only by deletion — but the constraint is worth pinning here, because it is
    // the mechanism US4 depends on and a `NO ACTION` would make account deletion fail instead.
    const question = await ask(ada, 'Deleted with its votes.')
    await vote(grace, question.id)

    await getDb().execute(sql`DELETE FROM session_questions WHERE id = ${question.id}::uuid`)

    const orphans = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM question_votes WHERE question_id = ${question.id}::uuid
    `)
    expect(orphans[0]?.count, 'votes outlived the question they backed').toBe(0)
  })
})
