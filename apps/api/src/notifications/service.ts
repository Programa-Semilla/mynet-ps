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
interface PushPayloadBase {
  /** Who or what it is from. FR-553 requires the sender to be identified. */
  readonly title: string
  /**
   * The message, truncated to fit the encrypted payload budget (M7, research R12).
   *
   * Carrying content is a decision with a recorded cost: it puts message text on a lock screen,
   * and whether an attendee may suppress that was deliberately not decided (constitution 3.1.0,
   * "Notification delivery"). The alternative — "you have a message" — makes the attendee open the
   * application to learn whether it mattered, which is most of the value gone.
   *
   * **014 accepts the same cost a second time and does not solve it either.** A saved-session
   * notification carries a session **title**, so what somebody chose to attend is now on their
   * locked device alongside what somebody said to them. That is register entry 27, promoted from
   * a deferral that had sat in prose since v3.1.0 precisely because a consequence recorded twice
   * in the same words is one nobody acts on.
   */
  readonly body: string
}

/** What 007 delivers: somebody wrote to you. Activating it opens that conversation (FR-554). */
export interface MessagePushPayload extends PushPayloadBase {
  readonly kind?: 'message'
  readonly conversationId: string
}

/**
 * T072 (014) — what the **second** trigger delivers (v4.2.0 N1, FR-1029, FR-1034, FR-1034b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO SHAPES, AND WHICH ONE ARRIVES IS THE WHOLE OF THE COALESCING RULE.**
 *
 *   - **One session changed** → `sessionId` is present. Activating it opens that session, which
 *     is where the attendee can see what happened and decide what to do (FR-1029).
 *   - **Several of one attendee's saved sessions changed in one act** → `count` is present and
 *     `sessionId` is not. Activating it opens **Agenda**, where the changed rows carry their
 *     individual markers — and explicitly **not** a list of changes, because that list is the
 *     surface FR-1031 forbids (FR-1034b).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **`count` IS THE ONLY AGGREGATE OVER CHANGES THIS PRODUCT MAY PRODUCE, AND IT MAY EXIST HERE
 * AND NOWHERE ELSE** (FR-1034a, v4.2.0 N2).
 *
 * N2's prohibition governs **in-app surfaces**, where an aggregate becomes the notification
 * centre v3.1.0 forbids. A notification is a single interruption by nature, and twelve
 * interruptions for one organizer act is exactly the outcome that exclusion existed to prevent —
 * so a count in the body is what makes coalescing possible at all.
 *
 * **The moment a screen answers "how many things changed", this is broken** regardless of what
 * this payload does. `apps/web/tests/unit/authoring-absences.test.tsx` and its API sibling assert
 * that, in both products.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface SessionChangePushPayload extends PushPayloadBase {
  readonly kind: 'session-change'
  /** Present when exactly one saved session changed. Activating it opens that session. */
  readonly sessionId?: string
  /** Present when several did. Activating it opens Agenda, never a list (FR-1034b). */
  readonly count?: number
  /** The conference, so activation can open the right Agenda. */
  readonly eventId: string
}

/**
 * What is delivered.
 *
 * **Identifiers rather than a URL**, so the port carries no knowledge of the client's addressing
 * scheme — the service worker builds the address it opens (FR-554). And **nothing beyond these
 * fields**: Principle VIII's collect-only-what-a-requirement-names applied to a payload rather
 * than a column, since a notification is the one place this product's data leaves it for a
 * surface nobody here controls.
 */
export type PushPayload = MessagePushPayload | SessionChangePushPayload

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
