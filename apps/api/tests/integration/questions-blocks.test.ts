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
 * T064, T065, T066 (009) — blocking, in Q&A (FR-785, FR-786, FR-787, SC-711b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **READ-SIDE ONLY, BIDIRECTIONAL, AND IT CHANGES NOBODY ELSE'S VIEW.**
 *
 * Three properties, and each is a different way the obvious implementation goes wrong:
 *
 *   1. **Bidirectional, with the pair never ordered.** A-blocks-B and B-blocks-A are independent
 *      facts. An implementation that ordered the pair — as `conversation_pairs` deliberately does
 *      — would make unblocking one release both.
 *   2. **Nothing is written.** 008's appointments are *cancelled* by a block and stay cancelled;
 *      a question is a thing on a page, nobody turns up to it, so read-side filtering is correct
 *      and FR-786's reversibility comes free.
 *   3. **No count changes, for anybody** (FR-787). The filter removes rows from one reader's
 *      list; it does not enter the aggregate. An implementation that filtered the votes as well
 *      would let one attendee silently alter what a whole conference sees.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('blocking and audience questions', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let alan: string
  let summitId: string
  let sessionId: string
  let adaId: string
  let graceId: string

  const ALAN = 'alan@example.com'

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

  const idOf = async (email: string): Promise<string> => {
    const [row] = await getDb().select().from(attendees).where(eq(attendees.email, email))
    return row?.id as string
  }

  interface Question {
    id: string
    body: string
    votes: number
    authorDisplayName: string
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

  const list = async (cookie: string): Promise<Question[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { questions: Question[] }).questions
  }

  const vote = async (cookie: string, questionId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'POST',
      url: `/events/${summitId}/questions/${questionId}/vote`,
      headers: { cookie: cookieHeader(cookie) },
    })
  }

  const block = async (cookie: string, attendeeId: string) => {
    await clearThrottle()
    return app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId },
    })
  }

  const unblock = async (cookie: string, attendeeId: string) => {
    await clearThrottle()
    // The target is in the **body**, not the path — a write route naming an attendee in its URL
    // is forbidden outright by the route audit (FR-385), so `DELETE /blocks` mirrors `POST`.
    return app.inject({
      method: 'DELETE',
      url: '/blocks',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId },
    })
  }

  beforeAll(async () => {
    app = await setupTestApp()
  })

  beforeEach(async () => {
    await resetDatabase()
    await clearThrottle()

    ada = await signIn(ADA)
    grace = await signIn(GRACE)
    alan = await signIn(ALAN)

    adaId = await idOf(ADA)
    graceId = await idOf(GRACE)

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
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('hides each attendee’s questions from the other, in EITHER direction (FR-785)', async () => {
    const hers = await ask(grace, "Grace's question.")
    const his = await ask(ada, "Ada's question.")

    // Ada blocks Grace. **The block is Ada's**, and it is directional in the table — but the
    // filter asks whether *either* row exists, so it must work from both sides.
    expect((await block(ada, graceId)).statusCode).toBe(204)

    const adaSees = (await list(ada)).map((question) => question.id)
    const graceSees = (await list(grace)).map((question) => question.id)

    expect(adaSees, "the blocker still sees the blocked attendee's question").not.toContain(hers.id)
    expect(graceSees, "the blocked attendee still sees the blocker's question").not.toContain(
      his.id,
    )

    // Each still sees their own, which is what makes the assertions above about the *pair*
    // rather than about the list having been emptied.
    expect(adaSees).toContain(his.id)
    expect(graceSees).toContain(hers.id)
  })

  it('works identically when the OTHER party is the blocker', async () => {
    const hers = await ask(grace, "Grace's question, again.")
    const his = await ask(ada, "Ada's question, again.")

    // The reverse direction. `attendee_blocks` rows are directional and this is a different row
    // from the case above — if the query ordered the pair, only one of these two tests would
    // pass, and it would be luck which.
    expect((await block(grace, adaId)).statusCode).toBe(204)

    expect((await list(ada)).map((question) => question.id)).not.toContain(hers.id)
    expect((await list(grace)).map((question) => question.id)).not.toContain(his.id)
  })

  it('changes NO other reader’s list and NO count at all (FR-787, SC-711b)', async () => {
    const hers = await ask(grace, 'A question Ada will back and then block the author of.')

    // Ada votes for it **before** blocking. FR-787 keeps that vote counting afterwards.
    expect((await vote(ada, hers.id)).statusCode).toBe(200)

    const beforeBlock = (await list(alan)).find((question) => question.id === hers.id)
    expect(beforeBlock?.votes).toBe(1)

    await block(ada, graceId)

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **Alan is the whole point of this case.** He has blocked nobody and been blocked by
    // nobody, and his view must be byte-for-byte what it was — same question, same count.
    //
    // An implementation that filtered `question_votes` by the block as well as filtering the
    // question rows would drop Ada's vote from *everybody's* count, letting one attendee change
    // what a whole conference sees by making a private decision about one person.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const afterBlock = (await list(alan)).find((question) => question.id === hers.id)

    expect(
      afterBlock,
      'a third party lost sight of a question they were not party to',
    ).toBeDefined()
    expect(afterBlock?.votes, "a block changed a third party's count").toBe(1)
    expect(afterBlock?.authorDisplayName).toBe('Grace Hopper')
  })

  it('restores everything when the block is lifted, WITH NO WRITE (FR-786)', async () => {
    const hers = await ask(grace, 'A question that disappears and comes back.')
    await vote(ada, hers.id)

    await block(ada, graceId)
    expect((await list(ada)).map((question) => question.id)).not.toContain(hers.id)

    await unblock(ada, graceId)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **No repair path ran.** Nothing was written when the block was created and nothing is
    // written when it is lifted — the question was filtered out of one reader's query and is
    // now not. That is the deliberate opposite of 008's appointments, which a block *cancels*
    // by a write and which stay cancelled, precisely because somebody would otherwise turn up.
    //
    // Ada's vote is also intact, which it could not be if the block had deleted anything.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const restored = (await list(ada)).find((question) => question.id === hers.id)
    expect(restored, 'lifting the block did not restore the question').toBeDefined()
    expect(restored?.votes, "the blocker's own vote did not survive the round trip").toBe(1)
  })

  it('keeps the count consistent for the blocker too, once restored', async () => {
    // A question the blocker never voted for, so the assertion is about the aggregate rather
    // than about their own `votedByMe`.
    const hers = await ask(grace, 'Backed by somebody else entirely.')
    await vote(alan, hers.id)

    await block(ada, graceId)
    await unblock(ada, graceId)

    const restored = (await list(ada)).find((question) => question.id === hers.id)
    expect(restored?.votes).toBe(1)
  })
})
