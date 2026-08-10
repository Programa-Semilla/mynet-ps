import type { FastifyBaseLogger } from 'fastify'

import { loadConfig } from '../config.js'
import type { PushPayload, PushResult, PushService, StoredSubscription } from './service.js'

/**
 * T109 (007) — bounding delivery, which the port cannot do for itself (research R8, FR-557).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A `try/catch` HANDLES A FAILURE. IT DOES NOT HANDLE A HANG — AND A HANG IS THE COMMON
 * FAILURE MODE OF AN HTTP PUSH SERVICE.**
 *
 * This is `mail/dispatch.ts`'s lesson applied to the second external dependency, and it is not
 * copied on the assumption that it generalises — it generalises for a reason that is *sharper*
 * here. Mail is dispatched once per request. **Push fans out**: an attendee with a phone, a laptop
 * and a stale registration is three deliveries on the send path, and a single hanging endpoint
 * would hold a message send open long past the client's own abort, on the one request in this
 * feature an attendee is actually waiting on.
 *
 * The bound lives here rather than in each adapter so that the register-entry-20 adapter, written
 * by somebody who has not read this file, cannot ship without one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * One delivery attempt, bounded and reduced to a `PushResult`.
 *
 * A timeout or a thrown error becomes `'failed'`, never `'gone'`: **the caller discards a
 * subscription on `'gone'`**, and a network blip must not be able to delete an attendee's device
 * registration. The asymmetry is deliberate — over-retrying a dead endpoint costs a request,
 * while wrongly discarding a live one silently stops that person receiving anything ever again.
 */
export const dispatchPush = async (
  push: PushService,
  subscription: StoredSubscription,
  payload: PushPayload,
  log: FastifyBaseLogger,
): Promise<PushResult> => {
  const timeoutMs = loadConfig().push.dispatchTimeoutMs

  // `unref()` so a pending timer cannot hold the process open at shutdown — the sweep and the
  // server both exit on SIGTERM.
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`push delivery timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
    timer.unref()
  })

  try {
    const result = await Promise.race([push.send(subscription, payload), timeout])

    // A `'failed'` return is not an exception — the port contract requires `send` to report it
    // rather than throw — so without this line the entire non-throwing failure path was silent.
    // An operator asked "why are notifications not arriving" had no log, no counter, and a
    // `last_delivered_at` that said everything was fine.
    if (result === 'failed') {
      log.warn({ endpoint: subscription.endpoint }, 'push delivery reported failure')
    }

    return result
  } catch (error) {
    log.error({ err: error, endpoint: subscription.endpoint }, 'push delivery failed')
    return 'failed'
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Fan out to every device, and report which subscriptions are finished.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE DEVICE'S FAILURE MUST NOT AFFECT ANOTHER'S**, which is why every attempt is bounded
 * individually and why nothing here rejects. An attendee with a dead registration alongside a live
 * one must still receive on the live one — and the dead row is exactly what makes that scenario
 * ordinary rather than exotic, because a browser silently renews subscriptions and every renewal
 * that left its predecessor behind is a permanent failure waiting on the next send.
 *
 * Concurrently rather than in sequence: these are independent requests to independent hosts, and
 * an attendee is waiting on the send that triggered them.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Returns the endpoints that answered `'gone'`, for the caller to discard (FR-557). It does not
 * discard them itself: this module has no database access by design, which keeps "what delivery
 * costs" and "what the database holds" in separate files.
 */
export const dispatchToDevices = async (
  push: PushService,
  subscriptions: readonly StoredSubscription[],
  payload: PushPayload,
  log: FastifyBaseLogger,
): Promise<{
  deliveredEndpoints: string[]
  failedEndpoints: string[]
  goneEndpoints: string[]
}> => {
  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      endpoint: subscription.endpoint,
      result: await dispatchPush(push, subscription, payload, log),
    })),
  )

  const withResult = (wanted: PushResult): string[] =>
    results.filter((entry) => entry.result === wanted).map((entry) => entry.endpoint)

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **ENDPOINTS, NOT A COUNT — AND THE COUNT WAS A DEFECT RATHER THAN AN OMISSION.**
  //
  // This used to return `{ delivered: number, goneEndpoints }`, and the only caller reconstructed
  // the delivered set as *everything that was not gone*. That set includes every endpoint that
  // answered `'failed'`, so `recordDelivery` stamped `last_delivered_at = now()` on devices that
  // had just failed — and that column exists precisely to recognise a stale registration later.
  // The one operational signal describing delivery health was systematically wrong for exactly
  // the unhealthy devices.
  //
  // The three-outcome `PushResult` union exists to keep `failed` and `delivered` apart. Returning
  // a count collapsed them back together at the boundary, which is the one place it mattered.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  return {
    deliveredEndpoints: withResult('delivered'),
    failedEndpoints: withResult('failed'),
    goneEndpoints: withResult('gone'),
  }
}

/**
 * The payload budget, in bytes of body text (research R8, M7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A Web Push payload is capped at roughly 4 KB **once encrypted**, and the encryption adds
 * padding and a header — so the usable budget is smaller than 4 KB and not exactly knowable in
 * advance. This is deliberately well inside it rather than tuned to the edge: exceeding the cap
 * fails the *whole* delivery, so a message that is slightly too long would arrive as nothing at
 * all rather than as a truncated notification.
 *
 * Research R12 set the message limit at 2,000 characters partly for this reason. Truncation is
 * therefore the exception rather than the normal path.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const PUSH_BODY_MAX_CHARS = 500

/** Truncates to the payload budget, with an ellipsis so the reader knows there is more. */
export const truncateForPush = (body: string): string =>
  body.length <= PUSH_BODY_MAX_CHARS ? body : `${body.slice(0, PUSH_BODY_MAX_CHARS - 1)}…`
