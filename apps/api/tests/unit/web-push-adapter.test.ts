import { describe, expect, it, vi } from 'vitest'
import { WebPushError, type Headers as WebPushHeaders } from 'web-push'

import type { PushPayload, StoredSubscription } from '../../src/notifications/service.js'
import { WebPushService, type Deliver } from '../../src/notifications/web-push-adapter.js'

/**
 * The real adapter's **status mapping**, which is the whole of its behaviour (FR-557).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASYMMETRY IS WHAT IS UNDER TEST, AND GETTING IT WRONG IS EXPENSIVE IN ONE DIRECTION.**
 *
 * `gone` tells the caller to **delete the registration forever**. `failed` tells it to keep the
 * registration and try again later. The costs are not symmetric:
 *
 * - Over-retrying a dead endpoint costs one request that answers 410 again.
 * - Wrongly discarding a live one **silently stops that person receiving anything, ever** — no
 *   error, no log on their side, no way for them to notice except that MyNet went quiet.
 *
 * So every status that is not an explicit "this endpoint is finished" must resolve to `failed`,
 * including the ones that are our own fault and will never succeed on retry. This file asserts
 * that, status by status, without a network — which is the only way the 403 branch is reachable
 * at all, since provoking it for real means deliberately misconfiguring a live deployment.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SUBSCRIPTION: StoredSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dhKey: 'p256dh-key',
  authKey: 'auth-secret',
}

const PAYLOAD: PushPayload = {
  title: 'Ada Lovelace',
  body: 'See you at the keynote.',
  conversationId: '33333333-3333-4333-8333-333333333333',
}

/**
 * The library declares its **own** `Headers` — a plain `{ [header: string]: string }`, not the DOM
 * one. Passing `new Headers()` compiles under Vitest, which transpiles without typechecking, and
 * fails only at `pnpm typecheck`. Named here so the difference is obvious rather than surprising.
 */
const NO_HEADERS: WebPushHeaders = {}

/** A `deliver` that rejects with a real `WebPushError` carrying the status under test. */
const rejectingWith = (statusCode: number): Deliver =>
  (async () => {
    throw new WebPushError('refused', statusCode, NO_HEADERS, 'body', SUBSCRIPTION.endpoint)
  }) as unknown as Deliver

const service = (deliver: Deliver) =>
  new WebPushService({
    subject: 'mailto:operator@example.test',
    publicKey: 'public-key',
    privateKey: 'private-key',
    deliver,
  })

describe('the Web Push adapter maps outcomes to what the caller must do', () => {
  it('DELIVERED when the push service accepts it', async () => {
    const deliver = vi.fn(async () => ({ statusCode: 201, body: '', headers: NO_HEADERS }))

    await expect(service(deliver as unknown as Deliver).send(SUBSCRIPTION, PAYLOAD)).resolves.toBe(
      'delivered',
    )
  })

  it.each([404, 410])('GONE on %i — the only statuses permitted to discard', async (status) => {
    await expect(service(rejectingWith(status)).send(SUBSCRIPTION, PAYLOAD)).resolves.toBe('gone')
  })

  it.each([
    [400, 'malformed request'],
    [401, 'credentials rejected'],
    [403, 'VAPID key mismatch — the misconfiguration that looks like everything working'],
    [413, 'payload too large'],
    [429, 'rate limited'],
    [500, 'push service unwell'],
    [502, 'push service unwell'],
    [503, 'push service unwell'],
  ])('FAILED on %i (%s) — never gone, so nothing is discarded', async (status) => {
    expect(
      await service(rejectingWith(status)).send(SUBSCRIPTION, PAYLOAD),
      `${status} must not discard the subscription. Only an explicit 404/410 means this endpoint ` +
        'is finished; everything else risks silently ending delivery for that attendee forever.',
    ).toBe('failed')
  })

  it('FAILED, never thrown, when the request dies before any response', async () => {
    // DNS, a refused socket, a TLS failure, the library throwing on its own input. The port
    // forbids throwing: a caller fanning out to several devices cannot have one device's
    // exception abandon the rest.
    const deliver = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as Deliver

    await expect(service(deliver).send(SUBSCRIPTION, PAYLOAD)).resolves.toBe('failed')
  })

  it('sends the payload the service worker actually parses', async () => {
    const deliver = vi.fn(async () => ({ statusCode: 201, body: '', headers: NO_HEADERS }))
    await service(deliver as unknown as Deliver).send(SUBSCRIPTION, PAYLOAD)

    const [subscription, body, options] = deliver.mock.calls[0] as unknown as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { vapidDetails: { subject: string }; TTL: number },
    ]

    // The browser's own shape, rebuilt from our two flat columns.
    expect(subscription).toEqual({
      endpoint: SUBSCRIPTION.endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    })

    // Exactly the three fields `sw.ts` reads. A fourth would be silently ignored; a missing one
    // would fall back to "You have a new message" and lose FR-553's sender identification.
    expect(JSON.parse(body)).toEqual({
      title: 'Ada Lovelace',
      body: 'See you at the keynote.',
      conversationId: PAYLOAD.conversationId,
    })

    expect(options.vapidDetails.subject).toBe('mailto:operator@example.test')
  })

  it('sets a TTL far below the four-week default — a stale interruption is worse than none', async () => {
    const deliver = vi.fn(async () => ({ statusCode: 201, body: '', headers: NO_HEADERS }))
    await service(deliver as unknown as Deliver).send(SUBSCRIPTION, PAYLOAD)

    const options = (deliver.mock.calls[0] as unknown as [unknown, unknown, { TTL: number }])[2]

    // A notification is an interruption about something happening now. The durable surfaces —
    // Home's unread card and the conversation list — are always right, so a push that arrives a
    // day late is noise rather than a safety net.
    expect(options.TTL).toBeGreaterThan(0)
    expect(options.TTL).toBeLessThanOrEqual(24 * 60 * 60)
  })
})
