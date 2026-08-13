import type { FastifyBaseLogger } from 'fastify'

import type { PushPayload, PushResult, PushService, StoredSubscription } from './service.js'

/**
 * T110 (007) — the development and test implementation of `PushService` (research R8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS WHAT MAKES PHASE 7 BUILDABLE AND TESTABLE WITHOUT A PROVIDER.**
 *
 * Register entry 20 has chosen no push provider and no VAPID key custody arrangement, and this
 * adapter is why that blocks a deployed environment rather than the feature. It records what
 * *would* have been sent, so the integration suite can assert fan-out, blocked-sender suppression,
 * `gone` handling and latency against real behaviour with no external dependency at all.
 *
 * `SinkMailService` is the same idea for entry 18 and this is deliberately its sibling — down to
 * `sent()` returning a copy and `clear()` existing so one suite's deliveries are invisible to
 * another's assertions.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **UNLIKE `SinkMailService`, THIS DOES NOT REFUSE TO RUN IN PRODUCTION, AND THE DIFFERENCE IS
 * WORTH STATING BECAUSE IT LOOKS LIKE AN OMISSION.**
 *
 * The mail sink throws under `NODE_ENV=production` because it holds **verification and reset
 * links**, and a reset link *is* the account: writing one to a log anywhere but development would
 * be a credential leak. Nothing here is a credential. A recorded push payload is a sender's name
 * and a message the recipient was about to be shown anyway.
 *
 * What it *is* is a silent non-delivery, so this logs a warning naming the register entry instead
 * — visible in the one place an operator would look when notifications are not arriving, rather
 * than a boot failure over a capability FR-552 says every attendee may decline.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export interface RecordedDelivery {
  readonly endpoint: string
  readonly payload: PushPayload
  readonly at: Date
}

/**
 * How many recorded deliveries the sink keeps.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ARRAY WAS UNBOUNDED, AND THIS CLASS RUNS IN DEPLOYED ENVIRONMENTS.**
 *
 * `SinkPushService` is the only `PushService` implementation that exists, and `ports.ts` selects
 * it whenever no override is supplied — which is every environment today, since no provider has
 * been chosen (register entry 20). So a long-lived UAT or production container accumulated one
 * record per delivered notification **for the life of the process**, each holding a sender's name
 * and up to 500 characters of message body.
 *
 * Two problems, and the second is the worse one: unbounded heap growth against a 1200 MB limit on
 * a `restart: unless-stopped` container, and **message content retained in process memory in a
 * deployed environment** — the exact concern this file already cites when it hands the logger to
 * development only.
 *
 * A ring is enough for the purpose the record has: tests assert on the last few deliveries, and
 * nothing needs the history of a conference.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
const MAX_RECORDED = 100

export class SinkPushService implements PushService {
  readonly #delivered: RecordedDelivery[] = []

  /**
   * Where a recorded delivery is announced, or `undefined` for silence.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **WITHOUT THIS, "THE SINK RECORDS WHAT WOULD HAVE BEEN SENT" IS TRUE AND USELESS.**
   *
   * The record lives in this object's private field, inside the API process. A test holds the
   * instance and reads `delivered()`; **a person running the application locally holds nothing**,
   * and until this existed a successful dispatch produced no log line, no response change and no
   * database change — the one path in the feature that cannot be seen in the interface was also
   * the one path that left no trace anywhere. `quickstart.md` scenario 5 asked the reader to
   * "inspect the push sink", which there was no way to do.
   *
   * Supplied **only in development** by `plugins/ports.ts`, and that is the whole safety argument:
   * the line carries the sender's name and the message body, which is content, and content does
   * not belong in a deployed environment's logs. Tests construct this with no logger and stay
   * silent, which keeps sixteen application builds from drowning the assertions.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly #log: FastifyBaseLogger | undefined

  constructor(log?: FastifyBaseLogger) {
    this.#log = log
  }

  /**
   * Endpoints to answer `gone` for, so the discard path (FR-557) is reachable in a test without
   * a push service that will actually reject one.
   */
  readonly #goneEndpoints = new Set<string>()

  /** Endpoints to answer `failed` for — transient, and the caller must NOT discard them. */
  readonly #failingEndpoints = new Set<string>()

  async send(subscription: StoredSubscription, payload: PushPayload): Promise<PushResult> {
    if (this.#goneEndpoints.has(subscription.endpoint)) return 'gone'
    if (this.#failingEndpoints.has(subscription.endpoint)) return 'failed'

    this.#delivered.push({ endpoint: subscription.endpoint, payload, at: new Date() })
    // Oldest first out. See `MAX_RECORDED`: this class runs in deployed environments, so the
    // record has to be bounded and has to stop holding message bodies indefinitely.
    while (this.#delivered.length > MAX_RECORDED) this.#delivered.shift()

    // `warn`, not `info`: `app.ts` sets the development log level to **warn**, so an `info` line
    // would be written to nowhere — which is the exact failure this whole field exists to fix. It
    // is also the honest severity. A recorded delivery is a notification that did not arrive.
    this.#log?.warn(
      {
        endpoint: subscription.endpoint,
        title: payload.title,
        body: payload.body,
        // 014 — whichever identifier this payload shape carries. Read defensively rather than by
        // narrowing on `kind`, because this is a log line: a shape it does not recognise should
        // produce a line with a missing field, never a crash inside the fallback adapter that
        // exists so a clone with no VAPID keys still works.
        target:
          'conversationId' in payload
            ? payload.conversationId
            : (payload.sessionId ?? payload.eventId),
      },
      'push RECORDED by the development sink — not delivered to a device (register entry 20)',
    )

    return 'delivered'
  }

  /** Everything handed to this adapter, newest last. A copy, so a holder cannot be surprised. */
  delivered(): readonly RecordedDelivery[] {
    return [...this.#delivered]
  }

  /** Test seam: make this endpoint answer `gone`, as a discarded browser subscription does. */
  markGone(endpoint: string): void {
    this.#goneEndpoints.add(endpoint)
  }

  /** Test seam: make this endpoint fail transiently. */
  markFailing(endpoint: string): void {
    this.#failingEndpoints.add(endpoint)
  }

  clear(): void {
    this.#delivered.length = 0
    this.#goneEndpoints.clear()
    this.#failingEndpoints.clear()
  }
}
