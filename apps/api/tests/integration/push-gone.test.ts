import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice, subscriptionRows } from '../support/push.js'
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
 * T104 (007) — **a permanently dead subscription is discarded, not retried forever** (FR-557).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DISTINCTION BEING TESTED IS `gone` AGAINST `failed`, AND FLATTENING IT IS WRONG IN BOTH
 * DIRECTIONS.**
 *
 * A push service answers `404` or `410` for an endpoint that will never work again — the browser
 * discarded it, the profile was wiped, permission was revoked on that device. That is categorically
 * different from a timeout or a `503`, which will very likely work in a minute.
 *
 * An implementation that treated every failure as permanent would **delete an attendee's devices
 * on a transient outage**, silently stopping them receiving anything ever again. One that treated
 * every failure as transient would retry a dead endpoint on every message for the life of the
 * account. `PushService` names the outcome instead of throwing, which is what lets the caller be
 * right in both cases — and this file asserts both, because a test of only the first would pass
 * against the wrong half of the trade.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a subscription the push service reports as gone', () => {
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
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await resetDatabase()
    push.clear()

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
    push.clear()
  })

  it('IS DISCARDED after the delivery that reports it (FR-557)', async () => {
    const dead = anEndpoint('grace-old-browser')
    await registerDevice(app, graceCookie, dead)
    push.markGone(dead)

    expect((await send('Are you nearby?')).statusCode).toBe(201)

    expect(
      await subscriptionRows(graceId),
      'A dead row is a delivery attempt that will fail forever. Nothing else would ever remove ' +
        'it — a browser that discarded a subscription does not tell the server.',
    ).toEqual([])
  })

  it('A TRANSIENT FAILURE DISCARDS NOTHING — the other half of the trade', async () => {
    const live = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, live)
    push.markFailing(live)

    expect((await send('Are you nearby?')).statusCode).toBe(201)

    expect(
      await subscriptionRows(graceId),
      'Over-retrying a dead endpoint costs a request. Wrongly discarding a live one silently ' +
        'stops that person receiving anything ever again, which is why the asymmetry runs this way.',
    ).toHaveLength(1)
  })

  it('discards only the dead device, leaving the live one registered and delivered to', async () => {
    const dead = anEndpoint('grace-old-browser')
    const live = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, dead)
    await registerDevice(app, graceCookie, live)
    push.markGone(dead)

    await send('Are you nearby?')

    const remaining = await subscriptionRows(graceId)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.endpoint).toBe(live)

    expect(
      push.delivered().map((delivery) => delivery.endpoint),
      'One device being finished must not stop another receiving — which is why every attempt ' +
        'is bounded and evaluated individually.',
    ).toEqual([live])
  })

  it('a timeout is treated as transient, never as gone', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The path that decides this is `dispatchPush`'s catch, and it deliberately returns
    // `'failed'` rather than `'gone'`: a network blip must not be able to delete an attendee's
    // device registration. Exercised through a port that hangs, which is the common failure mode
    // of an HTTP push service and the one a `try/catch` alone does not handle.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const hanging = anEndpoint('grace-hanging')
    await registerDevice(app, graceCookie, hanging)

    const hangingApp = await setupTestApp({
      push: { send: () => new Promise(() => {}) },
    })
    try {
      const response = await hangingApp.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(adaCookie) },
        payload: { body: 'Sent while the push service hangs.' },
      })

      expect(response.statusCode, 'the send still succeeds — delivery is a courtesy').toBe(201)
      expect(
        await subscriptionRows(graceId),
        'A hang is not a permanent failure, and treating it as one would delete a live device.',
      ).toHaveLength(1)
    } finally {
      await hangingApp.close()
    }
  })

  it('the send still succeeds when every device is gone', async () => {
    const dead = anEndpoint('grace-old-browser')
    await registerDevice(app, graceCookie, dead)
    push.markGone(dead)

    expect(
      (await send('Nobody will hear this.')).statusCode,
      'The message is stored and the sender is owed their 201. Delivery is for somebody else.',
    ).toBe(201)
  })
})
