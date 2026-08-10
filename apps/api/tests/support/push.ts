import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import type { PushResult } from '../../src/notifications/service.js'
import { SinkPushService } from '../../src/notifications/sink-adapter.js'

import { getDb } from '../../src/db/client.js'
import { cookieHeader } from '../integration/helpers.js'

/**
 * Shared fixtures for the Web Push suite (007, Phase 7).
 *
 * Kept in one place because five files need the same three things — a registered device, the rows
 * behind it, and a conversation to send into — and five copies of that setup is five places for
 * the fixture to drift from what the routes actually do.
 */

/** A push endpoint of the shape a browser issues, unique per call. */
export const anEndpoint = (label: string): string =>
  `https://push.example.invalid/${label}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Registers a device **through the route**, not by insert.
 *
 * Deliberately: the route is where the endpoint is bound to the calling session, and a fixture
 * that wrote rows directly would let a test pass against a route that had stopped binding it.
 */
export const registerDevice = async (
  app: FastifyInstance,
  cookie: string,
  endpoint: string,
): Promise<number> => {
  const response = await app.inject({
    method: 'POST',
    url: '/push/subscriptions',
    headers: { cookie: cookieHeader(cookie) },
    payload: { endpoint, keys: { p256dh: `p256dh-for-${endpoint}`, auth: `auth-for-${endpoint}` } },
  })
  if (response.statusCode >= 400) throw new Error(`Device registration failed: ${response.body}`)
  return response.statusCode
}

/** The rows behind an attendee's registrations, for assertions the API deliberately cannot make. */
export const subscriptionRows = async (
  attendeeId: string,
): Promise<{ endpoint: string; p256dh_key: string; last_delivered_at: Date | null }[]> =>
  getDb().execute(sql`
    SELECT endpoint, p256dh_key, last_delivered_at
    FROM push_subscriptions WHERE attendee_id = ${attendeeId}::uuid
    ORDER BY created_at
  `)

/** Every registration in the database, when the question is about ownership rather than a person. */
export const allSubscriptionRows = async (): Promise<{ endpoint: string; attendee_id: string }[]> =>
  getDb().execute(sql`SELECT endpoint, attendee_id FROM push_subscriptions`)

/**
 * A `PushService` whose every delivery costs real wall-clock time.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE THE FAN-OUT TEST COULD NOT SEE THE THING IT TESTED.**
 *
 * `SinkPushService.send` resolves synchronously — no I/O, no delay. So a *sequential* fan-out
 * (`for (const s of subs) await dispatchPush(...)`) completed in single-digit milliseconds and
 * passed an assertion written to prove concurrency. Replacing `Promise.all` in
 * `dispatchToDevices` with a loop would have left the whole suite green while making SC-503's
 * budget scale linearly with device count — which is precisely the regression the test names.
 *
 * A delay per delivery is what makes the two distinguishable: N devices sequentially cost N × the
 * delay, concurrently they cost one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const slowPushService = (delayMs: number): SinkPushService => {
  // Delegates to the real sink rather than reimplementing it, so `delivered()` — the accessor
  // every other push test already uses — keeps working and there is one recording implementation
  // rather than two.
  const sink = new SinkPushService()
  const inner = sink.send.bind(sink)

  sink.send = async (subscription, payload): Promise<PushResult> => {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return inner(subscription, payload)
  }

  return sink
}
