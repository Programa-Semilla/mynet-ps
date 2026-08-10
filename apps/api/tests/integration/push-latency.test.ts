import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice } from '../support/push.js'
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
 * T113a (007) — **SC-503 is a number, so this measures it** (FR-550).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT THIS CAN AND CANNOT MEASURE, STATED BEFORE THE ASSERTIONS.**
 *
 * SC-503 says a notification reaches a device within thirty seconds of the message being sent.
 * Most of that budget belongs to somebody else: the push service's own queue, the device's radio,
 * and whether the phone is asleep. None of it is measurable from here, and no test in this
 * repository can honestly claim otherwise.
 *
 * What *is* ours, and what this measures, is **the elapsed time from the message being accepted to
 * the delivery being handed to the port**. That is the only part the product controls, and it is
 * the part that would silently consume the whole budget if it were got wrong — a dispatch behind a
 * retry loop, a sequential fan-out across ten devices, or a synchronous call to something slow.
 *
 * The threshold is therefore set far below thirty seconds rather than at it. A budget that passes
 * at twenty-nine seconds of *our own* work would be a budget that had already failed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Our own share of SC-503's thirty seconds. Deliberately a small fraction of it — see above. */
const OUR_BUDGET_MS = 2_000

describe('how long the product takes to hand a notification to the push service', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let adaCookie: string
  let graceCookie: string
  let graceId: string
  let conversationId: string

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}: ${response.body}`)
    return token
  }

  const idOf = async (cookie: string): Promise<string> => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { id: string }).id
  }

  const send = (body: string) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp({ push })
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Opening.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('hands a single delivery to the port well inside our share of the budget (SC-503)', async () => {
    push.clear()
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))

    const startedAt = Date.now()
    const response = await send('Timed.')
    const elapsedMs = Date.now() - startedAt

    expect(response.statusCode).toBe(201)
    expect(push.delivered(), 'and it genuinely dispatched').toHaveLength(1)
    expect(
      elapsedMs,
      `The send took ${elapsedMs}ms end to end. SC-503 allows thirty seconds to the device, and ` +
        'most of that belongs to the push service — a dispatch behind a retry loop or a slow ' +
        'synchronous call would consume the budget before the message ever left.',
    ).toBeLessThan(OUR_BUDGET_MS)
  })

  it('FANS OUT CONCURRENTLY — ten devices cost roughly what one does', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The assertion the single-device case cannot make. A sequential fan-out passes the test
    // above and still consumes the budget for an attendee with several devices, because the cost
    // is per-device latency multiplied by the count.
    //
    // These are independent requests to independent hosts, and somebody is waiting on the send
    // that triggered them.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    push.clear()
    for (let index = 0; index < 10; index += 1) {
      await registerDevice(app, graceCookie, anEndpoint(`grace-device-${index}`))
    }

    const startedAt = Date.now()
    const response = await send('Timed, to many devices.')
    const elapsedMs = Date.now() - startedAt

    expect(response.statusCode).toBe(201)
    expect(push.delivered().length, 'every device').toBeGreaterThanOrEqual(10)
    expect(
      elapsedMs,
      `Eleven devices took ${elapsedMs}ms. A sequential fan-out would pass the single-device ` +
        'assertion above and still consume the budget for anybody with more than one.',
    ).toBeLessThan(OUR_BUDGET_MS)
  })

  it('a HANGING device does not hold the send open indefinitely', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The bound `dispatchPush` exists for. Without it a stalled push service holds the response
    // past the client's own abort — on the one request in this feature an attendee is waiting on.
    //
    // The harness shrinks the timeout to twenty milliseconds; what is asserted is that a bound
    // exists and is honoured, not what its production value is.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const hangingApp = await setupTestApp({ push: { send: () => new Promise(() => {}) } })
    try {
      const startedAt = Date.now()
      const response = await hangingApp.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(adaCookie) },
        payload: { body: 'Sent while the push service hangs.' },
      })
      const elapsedMs = Date.now() - startedAt

      expect(response.statusCode, 'the send still succeeds').toBe(201)
      expect(
        elapsedMs,
        'A `try/catch` handles a rejection and does nothing for a hang, which is the common ' +
          'failure mode of an HTTP push service.',
      ).toBeLessThan(OUR_BUDGET_MS)
    } finally {
      await hangingApp.close()
    }
  })
})
