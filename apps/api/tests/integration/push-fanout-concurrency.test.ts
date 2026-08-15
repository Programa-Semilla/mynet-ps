import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config.js'
import {
  allSubscriptionRows,
  anEndpoint,
  registerDevice,
  slowPushService,
  subscriptionRows,
} from '../support/push.js'
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
 * Deep review — **the fan-out is concurrent, proved against a port that costs time** (SC-503).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`push-latency.test.ts` ASSERTED THIS AND COULD NOT SEE IT.**
 *
 * Its "ten devices cost roughly what one does" case registers eleven devices and asserts the send
 * completes under two seconds — against `SinkPushService`, whose `send` resolves synchronously
 * with no I/O. A sequential `for (const s of subs) await dispatchPush(...)` also completes in
 * single-digit milliseconds and passes it. The test could not distinguish `Promise.all` from a
 * loop, which is the one distinction it exists to make: swap them and the suite stays green while
 * SC-503's thirty-second budget starts scaling linearly with device count.
 *
 * This file drives the same path through a port with a **real delay per delivery**, so the two
 * shapes differ by an order of magnitude and the assertion has something to fail on.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The per-delivery cost, derived from the **configured dispatch timeout** rather than chosen.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * The integration environment sets `PUSH_DISPATCH_TIMEOUT_MS` very low so `push-latency.test.ts`
 * can prove a hanging device does not hold a send open. A delay above that bound makes **every**
 * delivery time out and answer `'failed'`, so nothing is ever recorded — which is exactly how the
 * first version of this file failed, silently and confusingly.
 *
 * Comfortably inside the bound, so each delivery succeeds; multiplied by enough devices that
 * sequential and concurrent differ by an order of magnitude.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const DELAY_MS = Math.max(3, Math.floor(loadConfig().push.dispatchTimeoutMs * 0.4))
const DEVICES = 20

describe('push fan-out is concurrent, not sequential (SC-503)', () => {
  let app: FastifyInstance
  let push: ReturnType<typeof slowPushService>
  let adaCookie: string
  let graceCookie: string
  let conversationId: string
  let graceId: string

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

  beforeAll(async () => {
    push = slowPushService(DELAY_MS)
    app = await setupTestApp({ push })
  })

  beforeEach(async () => {
    await resetDatabase()

    adaCookie = await signIn('ada@example.com')
    graceCookie = await signIn('grace@example.com')

    graceId = (
      await app
        .inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(graceCookie) } })
        .then((r) => r.json() as { id: string })
    ).id

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Opening the thread.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    // Grace's devices, registered through the route so the binding is the real one.
    for (let index = 0; index < DEVICES; index += 1) {
      await registerDevice(app, graceCookie, anEndpoint(`concurrency-${index}-${randomUUID()}`))
    }
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: every device is registered and the port is slow', async () => {
    expect(DEVICES).toBeGreaterThan(1)
    expect(DELAY_MS).toBeGreaterThan(0)
    // A fan-out test that fans out to nothing proves nothing.
    expect(await allSubscriptionRows()).toHaveLength(DEVICES)
  })

  it('costs roughly ONE delivery, not one per device', async () => {
    // Re-asserted here rather than relying on the previous test: the integration project shares
    // one database, so a neighbouring file's `resetDatabase()` can truncate between tests.
    expect(await allSubscriptionRows(), 'devices at send time').toHaveLength(DEVICES)
    expect(await subscriptionRows(graceId), 'bound to the RECIPIENT').toHaveLength(DEVICES)

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **THE BOUND SUBTRACTS FIXED OVERHEAD, BECAUSE THE FIRST VERSION DID NOT AND FAILED ON A
    // LOADED RUNNER WHILE THE PROPERTY IT GUARDS STILL HELD.**
    //
    // It asserted `elapsed < DEVICES × DELAY_MS / 2` — an absolute 80ms against a request whose
    // own overhead (route, session, insert, subscription lookup) is most of that on a busy CI
    // machine. It failed at `expected 86 to be less than 80` on a run where sequential would
    // have been 160ms, so the concurrency was never in question; the threshold had simply sunk
    // to the overhead floor. Its header claimed "neither timing noise nor a slow machine decides
    // the result", and on that run both did.
    //
    // A *latency* assertion and a *concurrency* assertion are not the same test. This measures
    // the same route to a recipient with **no devices**, which walks every step except the
    // fan-out, and compares the difference. What remains is the fan-out's own cost, which is one
    // delay when concurrent and DEVICES delays when sequential — so the bound now scales with
    // the machine instead of pretending the machine is free.
    //
    // The baseline is the **minimum of three samples**: overhead is bounded below by real work
    // and above by whatever else the runner is doing, and only the floor is a property of this
    // code. Taking the minimum makes a noisy sample widen the margin rather than fake one.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const timeSend = async (cookie: string, to: string, body: string): Promise<number> => {
      const startedAt = Date.now()
      const sent = await app.inject({
        method: 'POST',
        url: `/conversations/${to}/messages`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body },
      })
      const elapsed = Date.now() - startedAt
      expect(sent.statusCode).toBe(201)
      return elapsed
    }

    // Grace → Ada. Ada registered no devices in this fixture, so the fan-out is empty and what is
    // left is exactly the cost this test must not charge to concurrency.
    const baselineSamples = [
      await timeSend(graceCookie, conversationId, 'Baseline: no devices on the other side.'),
      await timeSend(graceCookie, conversationId, 'Baseline again.'),
      await timeSend(graceCookie, conversationId, 'Baseline once more.'),
    ]
    const overheadMs = Math.min(...baselineSamples)
    expect(push.delivered(), 'the baseline must fan out to nobody').toHaveLength(0)

    const elapsedMs = await timeSend(
      adaCookie,
      conversationId,
      'Timed against a port that actually costs something.',
    )

    expect(push.delivered(), 'every device took delivery').toHaveLength(DEVICES)

    // Sequential would be DEVICES × DELAY_MS of fan-out. Concurrent is one delay. The bound sits
    // between the two and is measured against the same machine's own overhead.
    const sequentialWouldBe = DEVICES * DELAY_MS
    const fanOutMs = elapsedMs - overheadMs

    expect(
      fanOutMs,
      `${DEVICES} devices at ${DELAY_MS}ms each cost ${fanOutMs}ms of fan-out ` +
        `(${elapsedMs}ms total less ${overheadMs}ms of measured overhead). Sequential would be ` +
        `about ${sequentialWouldBe}ms — if this fails, \`dispatchToDevices\` has stopped using ` +
        'Promise.all and SC-503 now scales with how many devices somebody owns.',
    ).toBeLessThan(sequentialWouldBe / 2)
  }, 120_000)
})
