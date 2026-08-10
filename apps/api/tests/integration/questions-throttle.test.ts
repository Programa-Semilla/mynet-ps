import { eq } from 'drizzle-orm'
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
 * Q&A throttling, against a real database (FR-746).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ADDED AT DEEP REVIEW: FR-746 HAD NO BEHAVIOURAL TEST AT ALL.**
 *
 * Every other 009 integration file calls `clearThrottle()` in `beforeEach` *and* inside each
 * helper — deliberately, so the tests measure the thing they are about. The consequence is that
 * deleting both `await throttle(...)` calls from `routes/events/questions.ts` left the entire
 * suite green. `tests/unit/throttle-actions.test.ts` covers the *table* and not the *routes*.
 *
 * 007 and 008 each shipped a dedicated file for exactly this — `message-send-throttle`,
 * `conversation-create-throttle`, `sign-up-throttle`. This is 009's, and it is the one file in
 * the feature that must **not** clear the counter between requests.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('Q&A throttling', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let summitId: string
  let sessionId: string

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

  /** Deliberately does NOT clear the throttle — that is the point of this file. */
  const ask = (cookie: string, body: string) =>
    app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp()
  })

  beforeEach(async () => {
    await resetDatabase()
    await clearThrottle()

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
    sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string

    // The sign-ins above wrote `sign_in` rows; clear once more so the ask counter starts empty.
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('eventually refuses a flood of questions, with a wait to act on (FR-746)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `question_ask` allows 10 on the identifier dimension before escalation begins, and every
    // request counts — a *successful* eleventh question is precisely what is being bounded, so
    // a counter that reset on success would not bound it at all.
    //
    // The loop runs well past the allowance and stops at the first refusal, so the test measures
    // "does it ever refuse" rather than pinning an exact request number, which would break the
    // moment the threshold is retuned for a good reason.
    // ───────────────────────────────────────────────────────────────────────────────────────
    let refused: Awaited<ReturnType<typeof ask>> | null = null

    for (let attempt = 0; attempt < 40 && !refused; attempt += 1) {
      const response = await ask(ada, `Question number ${attempt}.`)
      if (response.statusCode === 429) refused = response
      else expect(response.statusCode, `attempt ${attempt}`).toBe(201)
    }

    expect(
      refused,
      'asking was never refused in 40 attempts — the throttle is not wired into the route',
    ).not.toBeNull()

    const body = refused?.json() as { code: string; message: string; retryAfterSeconds: number }
    expect(body.code).toBe('too_many_attempts')
    // A refusal without a wait is a dead end. The wording names the action rather than
    // "sign-in attempts", which is what 004 separated the counters to make possible.
    expect(body.message).toMatch(/questions/i)
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keys the counter on the acting attendee, so one asker cannot silence another', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **This is the property that makes `mayDeny: true` legitimate here.** A denial keyed on
    // anything but the actor would fall on somebody who did nothing — which is precisely why
    // `reset_request` is delay-only. Ada exhausts her allowance; Grace must be unaffected.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    let adaRefused = false
    for (let attempt = 0; attempt < 40 && !adaRefused; attempt += 1) {
      adaRefused = (await ask(ada, `Ada's question ${attempt}.`)).statusCode === 429
    }
    expect(adaRefused, 'the fixture needs Ada to actually hit her limit').toBe(true)

    const hers = await ask(grace, "Grace's first question, after Ada exhausted hers.")
    expect(
      hers.statusCode,
      "Ada's throttle refused Grace. The counter is not keyed on the acting attendee, so a " +
        'denial now falls on somebody who did nothing (FR-746).',
    ).toBe(201)
  })

  it('counts asking separately from voting, so one cannot consume the other', async () => {
    // Separate counters are the whole of FR-307a applied to this feature: exhausting the ask
    // allowance must leave voting untouched, or a curious attendee is silenced twice over.
    let adaRefused = false
    for (let attempt = 0; attempt < 40 && !adaRefused; attempt += 1) {
      adaRefused = (await ask(ada, `Ada's question ${attempt}.`)).statusCode === 429
    }
    expect(adaRefused).toBe(true)

    // Grace asks one, so there is something for Ada to vote on.
    const asked = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(grace) },
      payload: { body: 'Something for Ada to back.' },
    })
    const target = (
      asked.json() as { questions: Array<{ id: string; body: string }> }
    ).questions.find((question) => question.body === 'Something for Ada to back.')

    const voted = await app.inject({
      method: 'POST',
      url: `/events/${summitId}/questions/${target?.id}/vote`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(
      voted.statusCode,
      'exhausting `question_ask` refused a vote, so the two actions share a counter (FR-746)',
    ).toBe(200)
  })
})
