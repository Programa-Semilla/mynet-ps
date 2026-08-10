/**
 * T022 (007) — where this device is reachable, in domain terms (FR-553–FR-557).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER** (FR-525). A subscription is bound to the
 * calling session server-side, which is what stops one browser profile delivering one
 * attendee's messages using another's registration: a device signed into a different account
 * that re-registers the same endpoint *reassigns* it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Cross-event** (standing decision 7, stated rather than inherited): a device does not attend
 * a conference. There is no conference identifier in this file for the same reason there is
 * none in `messages.ts`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Not cached** (FR-563). A stale copy of where a device is reachable is worse than no copy:
 * it would keep a revoked endpoint alive locally after the browser had already replaced it.
 */

/**
 * Where a browser can be reached, as a domain shape.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT the browser's `PushSubscription` object**, and the difference is Principle V rather
 * than tidiness. Passing the platform type through would leak a browser type into every
 * consumer of `@mynet/data` and defeat `mynet/no-direct-platform-access`, whose violation count
 * SC-008 requires to be zero.
 *
 * **Structurally identical to `DeviceSubscription` in `@mynet/platform`, and deliberately
 * declared twice.** `packages/platform` takes a *type-only* dependency on `@mynet/data`; the
 * reverse import would close that into a cycle. Two structural shapes assign to each other
 * without a cast, so the composition root hands what the notification service produced straight
 * to this repository, and `repository-casts.test.ts` still counts zero.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface DeviceRegistration {
  /** The push service URL this browser issued. Unique across the product — see `register`. */
  readonly endpoint: string
  /** The device's public key and auth secret. **Credentials, never content** (research R14). */
  readonly keys: {
    readonly p256dh: string
    readonly auth: string
  }
}

/**
 * This device's registration for server-initiated delivery.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Per device, not per session** (FR-555). Signing out does not unregister: the attendee's
 * other devices are unaffected by what this one does, and a device that stopped receiving
 * because somebody signed out on a different phone would be a bug rather than a privacy
 * feature. Surrendering the registration is an explicit act — revoking permission, or the
 * browser replacing the subscription.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface PushSubscriptionRepository {
  /**
   * Register this device, or **replace** an existing registration for the same endpoint.
   *
   * Replacement rather than accumulation is enforced by a unique constraint on the endpoint: a
   * browser that renews its subscription must not leave a dead row behind, and a dead row is a
   * delivery attempt that will fail forever.
   *
   * Idempotent. Registering an endpoint the attendee already holds succeeds and changes
   * nothing observable.
   */
  register(subscription: DeviceRegistration): Promise<void>

  /**
   * Surrender this device's registration. **Drops this device only** (FR-556) — every other
   * device the attendee has registered keeps receiving.
   *
   * Idempotent, so revoking permission twice, or revoking after the browser has already
   * discarded the subscription, is not an error the attendee has to see.
   */
  unregister(endpoint: string): Promise<void>
}
