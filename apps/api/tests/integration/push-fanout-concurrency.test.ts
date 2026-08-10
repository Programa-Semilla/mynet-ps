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

    const startedAt = Date.now()
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'Timed against a port that actually costs something.' },
    })
    const elapsedMs = Date.now() - startedAt

    expect(response.statusCode).toBe(201)
    expect(push.delivered(), 'every device took delivery').toHaveLength(DEVICES)

    // Sequential would be DEVICES × DELAY_MS. Concurrent is one delay plus overhead. The bound
    // sits well between the two, so neither timing noise nor a slow machine decides the result.
    const sequentialWouldBe = DEVICES * DELAY_MS

    expect(
      elapsedMs,
      `${DEVICES} devices at ${DELAY_MS}ms each took ${elapsedMs}ms. Sequential would be about ` +
        `${sequentialWouldBe}ms — if this fails, \`dispatchToDevices\` has stopped using ` +
        'Promise.all and SC-503 now scales with how many devices somebody owns.',
    ).toBeLessThan(sequentialWouldBe / 2)
  }, 120_000)
})
