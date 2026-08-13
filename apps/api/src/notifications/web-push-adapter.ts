import type { FastifyBaseLogger } from 'fastify'
import webPush, { WebPushError } from 'web-push'

import type { PushPayload, PushResult, PushService, StoredSubscription } from './service.js'

/**
 * The real `PushService` — VAPID-signed Web Push (FR-550, FR-553, FR-557, register entry 20).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO VENDOR HERE, AND THAT IS WORTH SAYING BECAUSE THE OPEN QUESTION READS LIKE A
 * PROCUREMENT DECISION.**
 *
 * Register entry 20 is worded as "the push provider", which suggests choosing and signing up with
 * one. Web Push does not work that way. **The push service is whichever one the browser already
 * chose** — `fcm.googleapis.com` for Chromium, `updates.push.services.mozilla.com` for Firefox,
 * Apple's for Safari — and its address arrives inside the subscription the device hands us. This
 * adapter signs a payload with the VAPID key pair and POSTs it there. No account, no SDK, no
 * dashboard, no second party to have a relationship with.
 *
 * What entry 20 leaves genuinely open is therefore **key custody**, not vendor selection: who
 * holds the private key per environment, where it lives, and what happens on rotation — because
 * rotating it silently stops delivery for every attendee until their browser re-registers. That
 * question is untouched by this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE STATUS MAPPING IS THE ENTIRE POINT OF THIS CLASS, AND ITS ASYMMETRY IS DELIBERATE.**
 *
 * `PushResult` has three members because three different things must happen next, and the
 * expensive mistake is collapsing two of them:
 *
 * - **`gone` discards the registration forever.** Only `404` and `410` earn it, because only they
 *   mean the push service has declared *this endpoint* finished. Wrongly discarding a live
 *   subscription silently stops that person receiving anything, ever, with no error anybody sees.
 * - **`failed` discards nothing.** Everything else lands here — including the faults that are
 *   *ours* rather than the network's, which are logged loudly precisely because retrying will not
 *   fix them and discarding would make them permanent.
 *
 * A `403` is the one worth recognising by name: it means the VAPID key signing this request is not
 * the pair the device subscribed against. That is a **misconfiguration**, and the failure mode it
 * produces is the nastiest in the feature — every screen looks correct, subscriptions are created
 * happily, and nothing is ever delivered. `.env.example` warns about a mismatched pair for this
 * reason; this is where it actually shows up.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How long the push service holds an undelivered notification, in seconds.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Four hours, against a library default of four weeks.**
 *
 * This is a decision rather than a tuning constant. A notification is an *interruption about
 * something happening now*: a phone that was off overnight and buzzes at breakfast about a message
 * from yesterday afternoon is noise, and the attendee has already been told properly — Home's
 * unread card and the conversation list are the durable surfaces, and they are always right.
 *
 * Four hours covers the case this feature is actually for: a session, a lunch break, a flat
 * battery for an hour. Past that the notification has stopped being news.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const TTL_SECONDS = 4 * 60 * 60

/** Statuses that mean *this endpoint is finished* — the only ones that may discard (FR-557). */
const GONE = new Set([404, 410])

/**
 * Statuses that are our fault rather than the network's.
 *
 * Reported as `failed` like everything else, because discarding a live subscription over our own
 * misconfiguration would turn a fixable outage into a permanent one — but logged at `error`, since
 * retrying will not help and somebody has to know.
 */
const OUR_FAULT = new Map<number, string>([
  [400, 'malformed push request — the payload or headers this server sent were rejected'],
  [401, 'VAPID credentials rejected — check PUSH_VAPID_PRIVATE_KEY and PUSH_VAPID_SUBJECT'],
  [
    403,
    'VAPID key mismatch — the pair signing this request is not the pair the device subscribed ' +
      'against. Every screen will look correct and nothing will ever be delivered.',
  ],
  [413, 'payload too large — truncateForPush should have prevented this'],
])

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`sendNotification` COMES OFF THE DEFAULT EXPORT, AND A NAMED IMPORT OF IT FAILS AT RUNTIME.**
 *
 * `web-push` is CommonJS. Node's ESM interop statically scans the module for assignments it can
 * recognise, and it finds `WebPushError` and `supportedContentEncodings` — but **not**
 * `sendNotification`. So `import { sendNotification } from 'web-push'` typechecks (the `.d.ts`
 * declares it), passes every Vitest run (Vitest transforms the module and interops for you), and
 * throws on the first real import under Node:
 *
 *     SyntaxError: The requested module 'web-push' does not provide an export named 'sendNotification'
 *
 * Three runtimes, three answers, and only the third one is production. `contract:check` caught it
 * because that gate actually boots the application; nothing before it does.
 *
 * `.bind` because it is being detached from the object it was read off — leaving it unbound is the
 * kind of thing that works until the library adds one `this` reference.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const deliverViaLibrary = webPush.sendNotification.bind(webPush)

/** The injectable seam. Defaults to the library; a test supplies its own to exercise the mapping. */
export type Deliver = typeof webPush.sendNotification

export interface WebPushOptions {
  readonly subject: string
  readonly publicKey: string
  readonly privateKey: string
  readonly log?: FastifyBaseLogger
  /**
   * Overridden only by tests.
   *
   * The mapping above is the whole behaviour of this class and it is decided entirely by a status
   * code, so it must be testable without a network, a browser, or a real push service. Without
   * this seam the only way to reach the `403` branch would be to deliberately misconfigure a live
   * deployment — which is to say, it would never be tested.
   */
  readonly deliver?: Deliver
}

export class WebPushService implements PushService {
  readonly #subject: string
  readonly #publicKey: string
  readonly #privateKey: string
  readonly #log: FastifyBaseLogger | undefined
  readonly #deliver: Deliver

  constructor(options: WebPushOptions) {
    this.#subject = options.subject
    this.#publicKey = options.publicKey
    this.#privateKey = options.privateKey
    this.#log = options.log
    this.#deliver = options.deliver ?? deliverViaLibrary
  }

  /**
   * One delivery attempt. **Never throws** — see the port: a caller fanning out to several devices
   * cannot have one device's exception abandon the rest.
   */
  async send(subscription: StoredSubscription, payload: PushPayload): Promise<PushResult> {
    try {
      await this.#deliver(
        {
          endpoint: subscription.endpoint,
          // The browser's own shape. Ours stores the two keys flat, because a column each is
          // clearer in a schema than a JSON blob nothing can constrain.
          keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
        },
        // ─────────────────────────────────────────────────────────────────────────────────────
        // The service worker parses exactly this (`sw.ts`, the `push` handler). It carries
        // **identifiers** rather than a URL: the client owns its own addressing, and a server
        // emitting `/messages/<id>` would be a second place that scheme is decided.
        //
        // 014 — serialised **whole** rather than field by field, which is what lets a second
        // payload shape exist without this adapter knowing anything about it. The union is
        // closed and every member is plain data, so the adapter stays what it is: something that
        // signs and posts. Listing fields here meant the message shape was hard-coded in the
        // transport, and a session-change payload would have arrived with its identifiers
        // silently dropped — a notification that opens the wrong place rather than one that
        // fails.
        // ─────────────────────────────────────────────────────────────────────────────────────
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: this.#subject,
            publicKey: this.#publicKey,
            privateKey: this.#privateKey,
          },
          TTL: TTL_SECONDS,
        },
      )

      return 'delivered'
    } catch (error) {
      return this.#classify(error, subscription.endpoint)
    }
  }

  /**
   * Turn whatever went wrong into the one of three answers the caller can act on.
   *
   * Anything that is not a `WebPushError` — DNS, a refused socket, a TLS failure, the library
   * throwing on its own input — is transient by default. `failed` is the safe answer: it costs a
   * retry, where the alternative costs somebody every future notification.
   */
  #classify(error: unknown, endpoint: string): PushResult {
    if (!(error instanceof WebPushError)) {
      this.#log?.warn({ err: error, endpoint }, 'push delivery failed before a response arrived')
      return 'failed'
    }

    const status = error.statusCode

    if (GONE.has(status)) {
      // Not a warning. A browser replacing a subscription is ordinary, and the caller's next act
      // is to discard the row — which is the system working, not a fault to investigate.
      this.#log?.info({ endpoint, status }, 'push endpoint is gone; discarding the subscription')
      return 'gone'
    }

    const ours = OUR_FAULT.get(status)
    if (ours) {
      this.#log?.error({ endpoint, status, body: error.body }, `push not delivered: ${ours}`)
      return 'failed'
    }

    // 429 and 5xx: the push service is rate-limiting or unwell. Neither is ours to fix and neither
    // says anything about whether this device still exists.
    this.#log?.warn({ endpoint, status }, 'push delivery refused by the push service')
    return 'failed'
  }
}
