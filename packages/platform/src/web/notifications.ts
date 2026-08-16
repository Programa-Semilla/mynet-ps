import type { DeviceSubscription, NotificationService } from '../interfaces/index.js'

/**
 * T116 (007) — the web `NotificationService`, wired to real delivery for the first time
 * (FR-550–FR-556, M4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS REPLACES A DELIBERATE NO-OP, AND THE NO-OP'S OWN COMMENT SAID NOT TO FINISH IT.**
 *
 * It said: *"Do not 'finish' this by calling `Notification.requestPermission()`. Asking an attendee
 * for a permission the product will not use is worse than not asking."* That was correct while
 * register entry 10 stood. **Constitution 3.1.0 reversed it** — delivery is in scope for a received
 * message and nothing else — so the product now does use the permission, and the instruction has
 * been satisfied rather than ignored.
 *
 * It moves into its own file, out of `devices.ts`, because it is no longer four lines: subscribing
 * needs the service worker registration, the VAPID key conversion and the browser's own
 * `PushSubscription` unpacked into a domain shape. `devices.ts` is a composition point, and a
 * capability that outgrows a literal belongs beside `WebConnectivityService` and
 * `WebVisibilityService`.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE BROWSER'S `PushSubscription` NEVER LEAVES THIS FILE.**
 *
 * Every method returns the domain `DeviceSubscription` instead. That is Principle V rather than
 * tidiness: the browser type carries `getKey(name)` returning an `ArrayBuffer`, `expirationTime`,
 * and an `unsubscribe()` of its own — passing it through would put all of that in front of every
 * consumer and defeat `mynet/no-direct-platform-access`, whose violation count SC-008 requires to
 * be zero.
 *
 * This file is the adapter layer, so it is one of the few places permitted to touch a browser API
 * directly.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The browser wants the key as bytes; VAPID keys are distributed as base64url text.
 *
 * Written out rather than pulled from a library: it is nine lines, and a dependency whose whole
 * job is one encoding is a dependency to keep patched forever.
 */
const urlBase64ToBytes = (base64: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replaceAll('-', '+').replaceAll('_', '/')
  const raw = atob(normalised)

  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return buffer
}

/** The browser's own subscription, unpacked into the domain shape. `null` if it is incomplete. */
const toDomain = (subscription: PushSubscription | null): DeviceSubscription | null => {
  if (!subscription) return null

  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  // A subscription missing either key cannot be encrypted to. Treated as no subscription rather
  // than as a partial one, so nothing downstream has to handle a half-registered device.
  if (!p256dh || !auth) return null

  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: toBase64Url(p256dh), auth: toBase64Url(auth) },
  }
}

const toBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/**
 * How long to wait for a service worker before concluding there is not going to be one.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`navigator.serviceWorker.ready` NEVER RESOLVES WHEN NOTHING IS REGISTERED — IT DOES NOT
 * REJECT, AND IT DOES NOT RESOLVE TO `null`.** It simply waits, forever.
 *
 * That is fine in production, where the worker is registered at boot. It is not fine anywhere
 * else, and "anywhere else" is not exotic: **`vite dev` registers no worker at all**
 * (`devOptions: { enabled: false }`), so the development server is exactly the case. Without a
 * bound, granting permission there leaves `subscribe()` pending for the lifetime of the page —
 * the button stays disabled, no error appears, and the surface is stuck in a state it can never
 * leave.
 *
 * A bound turns that into the outcome the rest of this file already handles: `null`, meaning this
 * device cannot be registered. Three seconds is far longer than an installed worker takes to
 * become ready and short enough that nobody wonders whether the button works.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const WORKER_READY_TIMEOUT_MS = 3_000

/**
 * T016 (012) — whether a push subscription could exist at all on this device (FR-1145).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WITHOUT GRANTED PERMISSION THERE IS NO SUBSCRIPTION, AND ASKING THE PUSH SERVICE ANYWAY
 * DEADLOCKED AN ENTIRE ENGINE.**
 *
 * The invariant comes first, because it is what makes the guard a no-op everywhere it does not
 * matter: a push subscription cannot outlive notification permission. Subscribing requires the
 * permission (`userVisibleOnly: true`), and revoking it discards the subscription — which is the
 * fact `NotificationPrompt`'s ENDPOINT_KEY exists to work around. So when permission is not
 * `'granted'`, `pushManager.getSubscription()` can only ever answer `null`, and consulting
 * `Notification.permission` instead returns the same answer without touching the push machinery.
 *
 * **Touching the push machinery is what this exists to avoid.** On WebKit builds with no push
 * service behind them — Playwright's WPE build is the measured case — `getSubscription()` wedges
 * the WebProcess main thread: the promise never settles, and moments later the page stops
 * executing anything at all. Every in-flight fetch response becomes undeliverable, which is how
 * this surfaced as *"`GET /conversations` is issued and never answered"* (research R5): the
 * request was fine, and the page it would have answered was dead. It presented as a Messages
 * defect only because `NotificationPrompt` lives in Messages and is the sole caller of this API.
 *
 * `subscribe()` has always carried this exact gate. The asymmetry — reads unguarded, the write
 * guarded — was the defect, because the reconcile-on-mount path runs the *read* on every visit
 * to Messages while the write waits for a button press.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const subscriptionPossible = (): boolean =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted'

/** The service worker this browser has registered, or `null` where there is none. */
const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), WORKER_READY_TIMEOUT_MS)
      }),
    ])
  } catch {
    // A browser with service workers disabled, or a context that cannot have one — a defined
    // "cannot subscribe" rather than an error anybody needs to see.
    return null
  }
}

export class WebNotificationService implements NotificationService {
  /**
   * The server's VAPID public key, **passed in rather than read from the environment**.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * Configuration is the composition root's job, not a capability's. `apps/web/src/app/
   * services.ts` is the one module in the client permitted to read `import.meta.env`, and it
   * already does exactly this for the API base URL — a capability that read its own configuration
   * would be a second place environment handling lives, and the one that drifted would be the one
   * deciding whether notifications work at all.
   *
   * **This is the only half of the key pair that may reach a browser** (FR-041). The `VITE_`
   * prefix is what makes that structural: only prefixed values are bundled, and nothing secret may
   * ever carry that prefix. The **private** key is read by the API and appears nowhere in this
   * package.
   *
   * **`undefined` is the expected state** (register entry 20). With no key, `isSupported()` is
   * false and `subscribe()` resolves to `null` — a defined result rather than a failure, and the
   * same shape FR-552 requires of a *denied* permission.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly #vapidPublicKey: string | undefined

  constructor(vapidPublicKey?: string) {
    this.#vapidPublicKey = vapidPublicKey && vapidPublicKey.length > 0 ? vapidPublicKey : undefined
  }

  /**
   * Whether this browser could deliver at all.
   *
   * **Four conditions, and the fourth is ours rather than the browser's**: without a configured
   * VAPID key there is nothing to subscribe with, so reporting `true` would offer the attendee a
   * permission prompt that could not lead anywhere.
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      this.#vapidPublicKey !== undefined
    )
  }

  /**
   * Ask the browser for permission.
   *
   * **The attendee must already have been told what notifications are for** (FR-551). That is not
   * enforceable from here — a permission prompt is the browser's — so it is enforced where it can
   * be: `NotificationPrompt.tsx` is the only caller, and it explains first.
   */
  async requestPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported'

    const result = await Notification.requestPermission()
    // `'default'` means the attendee dismissed the prompt without choosing. Treated as denied:
    // the product must behave identically either way (FR-552), and pretending otherwise would
    // mean re-prompting somebody who declined to answer.
    return result === 'granted' ? 'granted' : 'denied'
  }

  /**
   * A locally-raised notification.
   *
   * Kept from the 001 interface and **not used by this feature**: every notification MyNet raises
   * is server-initiated, for a received message (FR-561). A local one would be the product
   * interrupting somebody about something they did themselves.
   */
  async show(notification: { title: string; body: string; tag?: string }): Promise<void> {
    if (!this.isSupported() || Notification.permission !== 'granted') return

    const worker = await registration()
    if (!worker) return

    await worker.showNotification(notification.title, {
      body: notification.body,
      ...(notification.tag ? { tag: notification.tag } : {}),
    })
  }

  /**
   * Register this browser (FR-553, FR-555).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Resolves to `null` rather than throwing for every ordinary refusal** — no support, no VAPID
   * key, no service worker, permission denied. Each is a defined outcome, and FR-552 makes the
   * denied one *common*: an attendee who says no gets the whole product minus delivery, and a
   * caller that had to catch an exception to discover that would be treating the normal case as
   * an error.
   *
   * An existing subscription is reused rather than replaced. The browser returns the same one
   * anyway for the same key, and asking for a fresh one would rotate an endpoint the server has
   * already recorded.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  async subscribe(): Promise<DeviceSubscription | null> {
    const key = this.#vapidPublicKey
    if (!this.isSupported() || !key) return null
    if (Notification.permission !== 'granted') return null

    const worker = await registration()
    if (!worker) return null

    try {
      const existing = await worker.pushManager.getSubscription()
      if (existing) return toDomain(existing)

      const created = await worker.pushManager.subscribe({
        // Required by every current browser: a subscription that may be used for silent
        // background work is refused outright, and MyNet's every notification is user-visible
        // anyway (FR-561).
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(key),
      })
      return toDomain(created)
    } catch {
      // A push service that refuses, a key the browser rejects, or a revoked permission racing
      // this call. All of them mean the same thing to a caller: this device is not registered.
      return null
    }
  }

  /** Surrender this browser's registration (FR-556). Idempotent. */
  async unsubscribe(): Promise<void> {
    // No permission means the browser already discarded the subscription — there is nothing left
    // to surrender, and asking the push service to confirm that is the call `subscriptionPossible`
    // exists to avoid (FR-1145).
    if (!subscriptionPossible()) return

    const worker = await registration()
    if (!worker) return

    try {
      const existing = await worker.pushManager.getSubscription()
      await existing?.unsubscribe()
    } catch {
      // Already gone, or the browser discarded it. Either way there is nothing left to surrender
      // and nothing a caller could do about it.
    }
  }

  /** What this browser holds, or `null`. The browser is authoritative, not the server. */
  async currentSubscription(): Promise<DeviceSubscription | null> {
    // Answered from `Notification.permission` rather than from the push service: without granted
    // permission the answer is `null` by invariant, and this is the read that runs on every visit
    // to Messages — the one that deadlocked WebKit (FR-1145; see `subscriptionPossible`).
    if (!subscriptionPossible()) return null

    const worker = await registration()
    if (!worker) return null

    try {
      return toDomain(await worker.pushManager.getSubscription())
    } catch {
      return null
    }
  }
}
