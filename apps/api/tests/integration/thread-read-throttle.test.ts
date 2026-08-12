import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  READ_MAX_DELAY_MS,
  THRESHOLDS,
} from '../../src/auth/throttle.js'
import { getDb } from '../../src/db/client.js'
import { signInAttempts } from '../../src/db/schema/sign-in-attempts.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T011 (010) — **the message-thread poll is bounded, and never denied** (FR-803).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE READ IN THE PRODUCT THAT A CLIENT REQUESTS WITHOUT ANYBODY ACTING.**
 *
 * `useConversation` polls every three seconds while a thread is open and the tab is visible. That
 * is the definition FR-803 uses — "every authenticated read route that a client requests
 * repeatedly without a person acting" — and a search of the client confirms it is the only one:
 * the sole other interval is the offline reachability probe, which is unauthenticated and stops
 * the moment connectivity returns.
 *
 * Left unbounded, the frequency of this read is entirely client-controlled. A modified client, or
 * a script holding a session cookie, polls as fast as it likes against a route that returns
 * message content.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ALLOWANCE HAS TO EXCEED LEGITIMATE USE, WHICH IS WHY IT IS THE LARGEST IN THE TABLE.**
 *
 * An hour with one conversation open is roughly 1,200 requests at three seconds apart. An
 * allowance below that would delay **every attendee having an ordinary exchange** — the bound
 * would be a product defect rather than a defence. `throttle-thresholds.test.ts` asserts that
 * relationship directly; this file asserts what happens past it.
 *
 * As in `directory-throttle.test.ts` the counter is pre-loaded rather than spent: issuing 1,501
 * real polls would take an hour of wall-clock at the interval that makes them legitimate.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('the thread poll is rate-limited and never denied (FR-803)', () => {
  let app: FastifyInstance
  let readerCookie: string
  let readerId: string
  let conversationId: string

  const FREE = THRESHOLDS.thread_read.identifier.freeAttempts

  const signUpAndJoin = async (label: string): Promise<{ cookie: string; id: string }> => {
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `${label}-${randomUUID()}@example.com`,
        displayName: 'Conference Attendee',
        password: SEED_PASSWORD,
      },
    })
    const cookie = sessionCookieFrom(signUp)
    if (!cookie) throw new Error(`Sign-up failed: ${signUp.body}`)

    await clearThrottle()
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })

    return { cookie, id: (me.json() as { id: string }).id }
  }

  const preloadCounter = async (count: number): Promise<void> => {
    if (count <= 0) return
    await getDb()
      .insert(signInAttempts)
      .values(
        Array.from({ length: count }, () => ({
          identifierHash: hashAttemptValue(readerId),
          sourceHash: hashAttemptValue(`unused-${randomUUID()}`),
          action: 'thread_read' as const,
          succeeded: false,
        })),
      )
  }

  const poll = () =>
    app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(readerCookie) },
    })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE DELAY IS ASSERTED AS THE VALUE THE ROUTE SERVES, NOT AS WALL-CLOCK TIME, AND THAT IS
   * FORCED BY THE HARNESS RATHER THAN CHOSEN FOR CONVENIENCE.**
   *
   * `tests/integration/helpers.ts` sets `AUTH_MAX_SERVED_DELAY_MS=20` for the whole suite, so a
   * request that owes five seconds sleeps twenty milliseconds and reports the rest as guidance.
   * Without that, the throttle tests alone would add minutes to every run.
   *
   * A wall-clock assertion would therefore be measuring the harness's cap, not the bound — and
   * would fail against a correct implementation. `failureDelayMs` is the exact function the route
   * calls one line earlier, so reading it here observes the same computation the request did
   * rather than reimplementing it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const owedDelayMs = async (): Promise<number> => {
    const key = {
      identifierHash: hashAttemptValue(readerId),
      sourceHash: hashAttemptValue('127.0.0.1'),
      action: 'thread_read' as const,
    }
    return failureDelayMs(key, await beginAttempt(key))
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    const reader = await signUpAndJoin('thread-reader')
    const counterpart = await signUpAndJoin('thread-counterpart')
    readerCookie = reader.cookie
    readerId = reader.id

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(readerCookie) },
      payload: { attendeeId: counterpart.id, body: 'Enjoyed your talk — shall we compare notes?' },
    })
    if (opened.statusCode >= 400) throw new Error(`Opening a conversation failed: ${opened.body}`)
    conversationId = (opened.json() as { conversationId: string }).conversationId

    await clearThrottle()
  }, 180_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: a participant reading their own thread', async () => {
    const response = await poll()
    expect(response.statusCode, response.body).toBe(200)
    expect(FREE).toBeGreaterThan(1_000)
  })

  it('charges the thread_read counter, keyed on the reader (FR-803)', async () => {
    await clearThrottle()
    await poll()

    const charged = (await getDb().select().from(signInAttempts)).filter(
      (row) => row.action === 'thread_read',
    )

    expect(
      charged.length,
      'A thread read recorded no `thread_read` attempt. FR-803 requires the frequency of this ' +
        'read not to be left entirely client-controlled, and a threshold nothing charges leaves ' +
        'it exactly that.',
    ).toBe(1)

    expect(charged[0]!.identifierHash).toBe(hashAttemptValue(readerId))
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A DELAYED POLL MUST STILL LOOK LIKE A THREAD, NOT A BROKEN ONE.**
   *
   * This is the spec's own words in the empty/loading/failure declaration: a throttled poll
   * "delays and never fails, so a thread with a slowed poll looks like a thread". The client's
   * poll has exponential backoff on *failure* — so a 429 here would not merely refuse one read,
   * it would push the client into a backoff that makes the conversation appear to stop updating
   * long after the throttle had cleared.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE BOUND ENGAGES EXACTLY WHERE THE ALLOWANCE ENDS, AND NOT BEFORE.**
   *
   * Two points, on either side of the threshold. One of them alone proves nothing: an
   * implementation that delayed *every* poll would satisfy "past the allowance costs
   * something", and one that never delayed would satisfy "at the allowance costs nothing".
   *
   * The escalation curve itself is asserted in `tests/unit/throttle-thresholds.test.ts` rather
   * than here, and deliberately: `failureDelayMs` clamps a delay-only action's result to what
   * `serveDelay` can sleep — the mechanism that makes a denial unrepresentable (FR-802) — and
   * the harness sets that bound to 20ms, which flattens the curve to a single value. The clamp
   * hiding the number is the clamp working.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('costs nothing inside the allowance and something past it (SC-808)', async () => {
    await clearThrottle()
    await preloadCounter(FREE)
    const atTheAllowance = await owedDelayMs()
    const insideResponse = await poll()

    await clearThrottle()
    await preloadCounter(FREE + 1)
    const pastTheAllowance = await owedDelayMs()
    const pastResponse = await poll()

    expect(insideResponse.statusCode, 'a poll inside the allowance must be served').toBe(200)
    expect(pastResponse.statusCode, 'a delayed poll must still be served').toBe(200)

    expect(
      atTheAllowance,
      'A poll INSIDE the allowance was already being delayed. The allowance is what an ' +
        'ordinary attendee spends, and delaying inside it is a product defect wearing a ' +
        "defence's clothes.",
    ).toBe(0)

    expect(
      pastTheAllowance,
      'One poll past the allowance owes nothing — the bound never engages, and the ' +
        'frequency of this read stays entirely client-controlled.',
    ).toBeGreaterThan(0)
  }, 60_000)

  /**
   * The ceiling, which is what keeps "delay" from meaning "hang".
   *
   * Five seconds rather than the six minutes every write action escalates toward. At six minutes
   * the poll would not be slowed, it would be indistinguishable from a thread that had stopped.
   */
  it('never owes more than the read ceiling, however far the counter is driven', async () => {
    await clearThrottle()
    await preloadCounter(FREE + 40)

    expect(await owedDelayMs()).toBeLessThanOrEqual(READ_MAX_DELAY_MS)
  }, 60_000)

  it('never denies, however far past the allowance the counter is driven', async () => {
    await clearThrottle()
    await preloadCounter(FREE + 40)

    const response = await poll()

    expect(
      response.statusCode,
      'The thread poll was refused. FR-803 configures this action so it MAY delay and can never ' +
        'deny — and the client’s failure backoff would turn one refusal into a conversation that ' +
        'appears to have stopped.',
    ).toBe(200)
  }, 60_000)

  /**
   * FR-803's bound must not become a bound on *sending*. The two are different actions with
   * different allowances and different denial rules, and folding them would mean an attendee who
   * had been reading a long conversation could not reply to it.
   */
  it('does not charge the send counter, so a heavy reader can still write', async () => {
    await clearThrottle()
    await preloadCounter(FREE + 40)

    const sent = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(readerCookie) },
      payload: { body: 'Still here, and still able to reply.' },
    })

    expect(
      sent.statusCode,
      'A saturated read counter blocked a send. `thread_read` and `message_send` are separate ' +
        'actions precisely so that reading a conversation cannot consume the allowance for ' +
        'replying to it.',
    ).toBe(201)
  }, 60_000)
})
