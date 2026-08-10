import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
 * T044, T045, T046 (009) — upvoting (FR-717–FR-722, FR-725, FR-726, SC-704, SC-705).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE VOTE PER ATTENDEE IS ENFORCED BY THE SCHEMA, NOT BY HANDLER LOGIC** (FR-718).
 *
 * The composite primary key on `question_votes` is the whole mechanism, and `ON CONFLICT DO
 * NOTHING` is how the query expresses it. That means a double-tap on a slow connection is simply
 * the same request twice — and there is no code path anywhere that could produce a duplicate by
 * forgetting to check, which is exactly what makes it worth asserting against a real database
 * rather than against a mock that would agree with whatever the handler did.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('upvoting a question', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
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

  interface Question {
    id: string
    body: string
    votes: number
    votedByMe: boolean
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
    const questions = (response.json() as { questions: Question[] }).questions
    const asked = questions.find((question) => question.body === body)
    if (!asked) throw new Error(`The ask did not come back in the list: ${response.body}`)
    return asked
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
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('counts a vote, and counts a repeat as the same one (FR-718, SC-704)', async () => {
    const question = await ask(ada, 'Which part would you do differently?')

    const first = await vote(grace, question.id)
    expect(first.statusCode).toBe(200)

    const afterFirst = (first.json() as { questions: Question[] }).questions.find(
      (candidate) => candidate.id === question.id,
    )
    expect(afterFirst?.votes).toBe(1)
    expect(afterFirst?.votedByMe, "the voter's own state comes back on the write").toBe(true)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The same request again. **Not an error, and not a second vote** — the composite primary
    // key makes a duplicate unrepresentable, so this is idempotent rather than merely tolerated.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const second = await vote(grace, question.id)
    expect(second.statusCode).toBe(200)

    const afterSecond = (second.json() as { questions: Question[] }).questions.find(
      (candidate) => candidate.id === question.id,
    )
    expect(afterSecond?.votes, 'a repeated upvote inflated the count').toBe(1)
  })

  it('returns the count exactly when the vote is withdrawn (FR-719, SC-704)', async () => {
    const question = await ask(ada, 'How long did the rollout take?')

    await vote(grace, question.id)
    const removed = await unvote(grace, question.id)
    expect(removed.statusCode).toBe(200)

    const after = (removed.json() as { questions: Question[] }).questions.find(
      (candidate) => candidate.id === question.id,
    )
    expect(after?.votes).toBe(0)
    expect(after?.votedByMe).toBe(false)

    // Idempotent in this direction too — succeeding whether or not a vote existed.
    expect((await unvote(grace, question.id)).statusCode).toBe(200)
  })

  it('refuses a vote on the caller’s own question, WITH its reason (FR-722, FR-744)', async () => {
    const question = await ask(ada, 'Can I upvote myself?')

    const refused = await vote(ada, question.id)
    expect(refused.statusCode).toBe(403)

    const body = refused.json() as { code: string; message: string }
    expect(body.code, 'the client classifies on code, never on the class').toBe('own_question')
    // ───────────────────────────────────────────────────────────────────────────────────────
    // One of only two refusals in this feature that explain themselves, and it passes the test
    // every explained refusal has to pass: **the follow-up question is about the reader.** It
    // describes the caller's own authorship, which they already know.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(body.message).toMatch(/your own question/i)

    // And nothing was written.
    const listed = await list(ada)
    expect(listed.find((candidate) => candidate.id === question.id)?.votes).toBe(0)
  })

  it('gives two readers the SAME order, including where counts tie (SC-705, FR-726)', async () => {
    // Three questions asked in a known order, with a deliberate tie: two of them stay at zero.
    // **The database is deliberately NOT reset here** — earlier cases in this file have left
    // questions behind, and a list with unrelated rows in it is the more honest fixture. The
    // assertions are therefore about *relative* position rather than about absolute indices.
    const first = await ask(ada, 'Asked first, and it stays first among the ties.')
    const second = await ask(
      ada,
      'Asked second, so it sorts after the first when both are at zero.',
    )
    const third = await ask(grace, 'Asked third, and it will be the only one of these with a vote.')

    await vote(ada, third.id)

    const adaSees = (await list(ada)).map((question) => question.id)
    const graceSees = (await list(grace)).map((question) => question.id)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Identical, and identical in a specific way.** Two readers hold different `votedByMe`
    // and `canWithdraw` values for the same rows, so the payloads legitimately differ — the
    // *order* is what must not, because it comes from the server's `ORDER BY` rather than from
    // anything either client computes.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(adaSees).toEqual(graceSees)

    const at = (id: string): number => adaSees.indexOf(id)

    // The voted one outranks both ties, whatever else is in the list.
    expect(at(third.id)).toBeLessThan(at(first.id))
    expect(at(third.id)).toBeLessThan(at(second.id))

    // ───────────────────────────────────────────────────────────────────────────────────────
    // And the tie between the two zero-vote questions is broken by **ask time ascending**,
    // not left to whatever the plan happened to produce. This is the assertion that fails if
    // `ORDER BY` is ever reduced to the count alone: two readers would still agree with each
    // other by luck, and the order would drift between requests.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(at(first.id)).toBeLessThan(at(second.id))

    // Stable across repeated reads, which is the property "deterministic" actually means.
    expect((await list(ada)).map((question) => question.id)).toEqual(adaSees)
  })

  it('refuses a vote on a question in another conference, indistinguishably (FR-743)', async () => {
    const NOWHERE = '00000000-0000-0000-0000-000000000000'

    const missing = await vote(ada, NOWHERE)
    const malformed = await vote(ada, 'not-a-uuid')

    expect(missing.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(404)
    expect(missing.body).toBe(malformed.body)
  })

  it('answers 404, not 500, when the question is withdrawn under the vote (FR-743)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **`ON CONFLICT` absorbs a duplicate; it does not absorb a foreign-key violation.**
    //
    // Withdrawal takes `FOR UPDATE` on the question, which blocks a concurrent vote's implicit
    // `FOR KEY SHARE` request and then releases it onto a deleted row — so the insert raises
    // `23503`. Unhandled, that reached the error plugin as an unhandled fault: a 500 with a
    // correlation id and an operator log entry, for the ordinary outcome "somebody withdrew
    // their question a moment before you backed it".
    //
    // Reproduced deterministically by deleting the question between the handler's scope read and
    // its insert — which is what the lock makes happen for real.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const question = await ask(ada, 'A question about to be withdrawn under a vote.')

    await getDb().execute(sql`DELETE FROM session_questions WHERE id = ${question.id}::uuid`)

    const refused = await vote(grace, question.id)

    expect(
      refused.statusCode,
      'a vote for a question that has just gone answered with a server fault rather than the ' +
        'uniform refusal every other absence produces (FR-743)',
    ).toBe(404)
    expect((refused.json() as { code: string }).code).toBe('not_found')
  })

  it('reveals no other voter, on any route (FR-721, FR-769)', async () => {
    const question = await ask(ada, 'Who voted for this?')
    await vote(grace, question.id)

    const asAda = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(ada) },
    })

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Ada can see that her question has a vote. She must not be able to learn **whose**.
    //
    // Scoped to *her* question rather than asserted over the raw body, because Grace's name
    // legitimately appears elsewhere in this list — she is the author of questions from earlier
    // cases in this file, and attribution is the feature (FR-702). A body-wide search for
    // "Grace" therefore fails for a correct implementation, which is a worse outcome than not
    // testing at all: it would be "fixed" by weakening the assertion.
    //
    // The shape check below is what catches the leak this actually guards against — an *extra*
    // field nobody thought to look for — because it enumerates the keys exhaustively rather
    // than searching for the ones somebody remembered to forbid.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const mine = (asAda.json() as { questions: Array<Record<string, unknown>> }).questions.find(
      (candidate) => candidate['id'] === question.id,
    )
    expect(mine?.['votes']).toBe(1)
    expect(JSON.stringify(mine)).not.toMatch(/Grace/i)
    expect(JSON.stringify(mine)).not.toMatch(/voter|votedBy(?!Me)/i)

    const shape = mine
    expect(Object.keys(shape ?? {}).sort()).toEqual([
      'askedAt',
      'authorDisplayName',
      'authorId',
      'body',
      'canWithdraw',
      'id',
      'votedByMe',
      'votes',
    ])
  })
})
