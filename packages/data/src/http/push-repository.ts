import type { DeviceRegistration, PushSubscriptionRepository } from '../interfaces/notifications.js'
import type { HttpClient } from './client.js'

/**
 * T026 (007) — the HTTP push subscription repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Two writes and no reads. What this device currently holds is a question for the browser, not
 * the server — `NotificationService.currentSubscription()` answers it — so there is no
 * `GET /push/subscriptions` here and none on the server either. A list of an attendee's
 * registered devices would be a surface nothing in the product needs and a disclosure of where
 * they are reachable.
 *
 * **The endpoint is bound to the calling session server-side.** That is what stops one browser
 * profile delivering one attendee's messages using another's registration, and it is the reason
 * neither method takes an attendee identifier (FR-525).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The cryptographic keys travel to the server and never come back.** They are credentials
 * rather than content: research R14 excludes them from the personal-data export for that
 * reason, and nothing in the client reads them after registration.
 */
export class HttpPushSubscriptionRepository implements PushSubscriptionRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * Register or replace. The server answers 201 for a new endpoint and 200 when the same one
   * re-registers; neither is surfaced, because the caller's intent — "this device should
   * receive" — is satisfied identically by both.
   *
   * Replacement rather than accumulation matters more than it looks: a browser silently renews
   * a push subscription, and every renewal that left its predecessor behind would be a row the
   * server tries and fails to deliver to, forever.
   */
  async register(subscription: DeviceRegistration): Promise<void> {
    await this.#http.request<void>('/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      }),
    })
  }

  /**
   * Surrender this device's registration.
   *
   * `DELETE` with a body rather than the endpoint in the path: a push endpoint is a full URL,
   * frequently longer than is comfortable to percent-encode into a path segment, and putting it
   * there would also write it into every access log the request passes through.
   *
   * **Not called on sign-out** (FR-555). A subscription is per device, not per session.
   */
  async unregister(endpoint: string): Promise<void> {
    await this.#http.request<void>('/push/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    })
  }
}
