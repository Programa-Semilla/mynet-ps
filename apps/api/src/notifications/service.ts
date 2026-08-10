/**
 * T108 (007) — the push delivery port (FR-550, FR-553, FR-557, FR-559, research R8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO VENDOR APPEARS IN THIS INTERFACE, AND THAT IS WHAT MAKES REGISTER ENTRY 20 A
 * CONFIGURATION QUESTION RATHER THAN A BLOCKER.**
 *
 * No push provider is chosen. `apps/api/src/mail/` solved the same problem for entry 18 and this
 * module mirrors it exactly — port, dispatch wrapper, sink adapter — because the lesson generalises:
 * **an unprovisioned external dependency must be the expected state, not an exceptional one.** A
 * clean clone, the whole test suite and CI all run against the sink; only a deployed environment
 * needs the real adapter.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`'gone'` IS A RESULT RATHER THAN AN ERROR, AND THE DISTINCTION IS FR-557.**
 *
 * A push service answers `404` or `410` for a subscription that will never work again — the
 * browser discarded it, the profile was wiped, the attendee revoked permission on that device.
 * That is categorically different from a timeout or a `503`, which will very likely work in a
 * minute.
 *
 * An exception flattens the two. The caller needs to tell "this device is finished, delete the
 * row" from "try again later", and if it cannot it must choose between deleting subscriptions on
 * a transient outage or retrying a dead endpoint forever. Both are wrong; naming the outcome is
 * what avoids the choice.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Where a device is reachable, as this port sees it. Never the browser's `PushSubscription`. */
export interface StoredSubscription {
  readonly endpoint: string
  readonly p256dhKey: string
  readonly authKey: string
}

/**
 * What is delivered.
 *
 * **`conversationId` rather than a URL**, so the port carries no knowledge of the client's
 * addressing scheme — the service worker builds the address it opens (FR-554). And **nothing
 * beyond these three fields**: Principle VIII's collect-only-what-a-requirement-names applied to
 * a payload rather than a column, since a notification is the one place this product's data leaves
 * it for a surface nobody here controls.
 */
export interface PushPayload {
  /** Who it is from. FR-553 requires the sender to be identified. */
  readonly title: string
  /**
   * The message, truncated to fit the encrypted payload budget (M7, research R12).
   *
   * Carrying content is a decision with a recorded cost: it puts message text on a lock screen,
   * and whether an attendee may suppress that was deliberately not decided (constitution 3.1.0,
   * "Notification delivery"). The alternative — "you have a message" — makes the attendee open the
   * application to learn whether it mattered, which is most of the value gone.
   */
  readonly body: string
  readonly conversationId: string
}

/**
 * The outcome of one delivery attempt to one device.
 *
 * - `delivered` — handed to the push service. **Not** proof the attendee saw it; nothing in this
 *   product claims delivery to a person, and M5 keeps it that way.
 * - `gone` — this subscription is permanently dead. The caller MUST discard it (FR-557).
 * - `failed` — transient. The caller MUST NOT discard anything.
 */
export type PushResult = 'delivered' | 'gone' | 'failed'

export interface PushService {
  /**
   * Attempt one delivery. **MUST NOT throw** for a delivery failure — every outcome is a
   * `PushResult`, because a caller fanning out to several devices cannot have one device's
   * exception abandon the rest.
   */
  send(subscription: StoredSubscription, payload: PushPayload): Promise<PushResult>
}
