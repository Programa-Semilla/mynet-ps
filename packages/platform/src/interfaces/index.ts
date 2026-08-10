/**
 * T038 — the device capability interfaces (constitution Principle V, FR-043). Six at 001; seven
 * since 007 added `VisibilityService`, ratified in 3.1.0.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The names are fixed by the constitution and are **not** open to restyling:
 * `NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`,
 * `SecureStorage`, `ConnectivityService`, `VisibilityService`. Not pluralised, not suffixed with
 * `Provider`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Application code calls these, never a browser API. `mynet/no-direct-platform-access`
 * counts the violations, and SC-008 requires that count to be zero.
 *
 * The point is not indirection for its own sake. It is that a later native move becomes a
 * packaging change rather than a rewrite, and that every one of these is substitutable in a
 * test without touching feature code (FR-047, User Story 5).
 */

/**
 * Where a browser can be reached for server-initiated delivery, as a domain shape.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT the browser's `PushSubscription` object**, and the difference is Principle V rather than
 * tidiness. Passing the platform type through the port would leak a browser type into every
 * consumer and defeat `mynet/no-direct-platform-access`, whose violation count SC-008 requires to
 * be zero.
 *
 * **Structurally identical to `DeviceRegistration` in `@mynet/data`, and deliberately declared
 * twice.** This package takes a *type-only* dependency on `@mynet/data`; importing back the other
 * way would close a cycle. Two structural shapes assign to each other without a cast, so the
 * composition root hands what this service produced straight to that repository, and
 * `repository-casts.test.ts` still counts zero.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface DeviceSubscription {
  readonly endpoint: string
  readonly keys: {
    readonly p256dh: string
    readonly auth: string
  }
}

/**
 * Notification delivery.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T115 (007) — THIS COMMENT USED TO SAY THE IMPLEMENTATION "MUST NOT BE WIRED TO REAL
 * DELIVERY". CONSTITUTION 3.1.0 REVERSED THE REGISTER ENTRY IT WAS RESTATING, SO IT IS REWRITTEN
 * RATHER THAN LEFT STANDING ABOVE AN IMPLEMENTATION THAT CONTRADICTS IT.**
 *
 * Delivery is in product scope **for a received message and nothing else** (M4, and the
 * "Notification delivery" block in the constitution). What survives is narrower and unchanged in
 * force:
 *
 *   - **A received message is the ONLY trigger.** Not a session starting, not an appointment, not
 *     an audience question. `apps/api/tests/unit/notification-triggers.test.ts` fails the build if
 *     a second one appears — because the way this erodes is a later feature helping itself to a
 *     channel that already exists.
 *   - **No bell, and no in-app notification centre.** That half of register entry 10 is carried
 *     forward untouched. Delivery and an inbox are separable, and bringing the first in did not
 *     bring the second.
 *
 * `requestPermission` returning `'unsupported'` remains a defined result rather than a stub that
 * failed — and **permission is deniable**, so every capability except delivery itself must work
 * identically for an attendee who refuses (FR-552).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface NotificationService {
  isSupported(): boolean
  requestPermission(): Promise<'granted' | 'denied' | 'unsupported'>
  /** Resolves when the notification has been handed off, or immediately when unsupported. */
  show(notification: { title: string; body: string; tag?: string }): Promise<void>

  /**
   * T114 (007) — register this browser for server-initiated delivery (FR-553, FR-555).
   *
   * Resolves to `null` when the browser cannot subscribe or the attendee declines, which is a
   * defined result rather than a failure: FR-552 makes refusal an ordinary outcome costing
   * nothing but delivery.
   */
  subscribe(): Promise<DeviceSubscription | null>

  /**
   * Surrender this browser's registration (FR-556).
   *
   * **Not called on sign-out.** A subscription is per device, not per session — somebody who signs
   * out on their phone still wants to hear about a reply, and a device that stopped receiving
   * because they signed out on a laptop would be a bug rather than a privacy feature.
   */
  unsubscribe(): Promise<void>

  /**
   * What this browser currently holds, or `null`.
   *
   * The browser is authoritative here, not the server — which is why there is no
   * `GET /push/subscriptions` and no repository read: asking the server what *this* device holds
   * would be asking the wrong party, and answering would disclose where an attendee is reachable.
   */
  currentSubscription(): Promise<DeviceSubscription | null>
}

/**
 * Calendar integration.
 *
 * **Also out of scope until a recorded decision** (T107). Appointments exist in MyNet's own
 * data; exporting them to a device calendar is a separate capability nobody has asked for yet.
 */
export interface CalendarService {
  isSupported(): boolean
  addEvent(event: {
    title: string
    startsAt: Date
    endsAt: Date
    location?: string
    notes?: string
  }): Promise<void>
}

/** Camera access — for scanning a badge or capturing an avatar in a later slice. */
export interface CameraService {
  isSupported(): boolean
  capturePhoto(): Promise<Blob | null>
}

/**
 * Sharing a digital business card (a MyNet domain concept — see CLAUDE.md terminology).
 *
 * What a card exchange *records* is constitution Open Question 8 and is not decided here.
 * This interface covers only the act of sharing.
 */
export interface ContactShareService {
  isSupported(): boolean
  /** Resolves true when shared, false when the attendee dismissed the share sheet. */
  shareCard(card: {
    name: string
    title?: string
    company?: string
    url?: string
  }): Promise<boolean>
}

/**
 * Client-side secret storage.
 *
 * **MUST NOT be used as a general cache** (constitution, Persistence). In this slice nothing
 * uses it: the sign-in token lives in an HttpOnly cookie precisely so that no client code —
 * including this interface — can reach it.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  /** Clears everything this application stored. Used at sign-out (FR-056). */
  clear(): Promise<void>
}

/**
 * Online/offline state (FR-054).
 *
 * `subscribe` returns an unsubscribe function rather than exposing an event-emitter, so a
 * consumer cannot leak a listener by forgetting which removal call matches which addition.
 */
export interface ConnectivityService {
  isOnline(): boolean
  subscribe(listener: (online: boolean) => void): () => void
  /**
   * Reports what actually happened when something tried to reach the server.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The browser's own online flag cannot carry FR-054 by itself.** A false value is
   * trustworthy; a true value only means a network interface exists. In practice it also
   * reports true immediately after a page load on a device with no working connection at all,
   * so an indicator driven by it alone tells the attendee they are online while nothing loads
   * — which is precisely the dishonesty FR-052 exists to prevent.
   *
   * The transport layer knows better, because it just tried. This is how it says so. Nothing in
   * feature code calls this: it is wired once at the composition root, from the HTTP client to
   * the connectivity service, so that what the indicator claims and what the network does
   * cannot disagree.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  reportReachability(reachable: boolean): void
}

/** Every device capability, in one shape (research.md D10). */
/**
 * T063 (007) — **whether the attendee is actually looking at this tab.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A SEVENTH CAPABILITY, AND ITS ADDITION IS RECORDED RATHER THAN PERFORMED QUIETLY.**
 *
 * The constitution names six device capabilities and this makes seven, so it is worth saying
 * exactly why a seventh was unavoidable rather than convenient.
 *
 * Research R4 chose a three-second poll for an open thread, running **only while the document is
 * visible** — the condition is not a performance tweak: a backgrounded tab has its timers
 * throttled unpredictably, so a poll that "runs" there fires in bursts when the tab wakes, on a
 * phone, at a conference, on cellular data. That design is only expressible if feature code can
 * ask whether the page is visible, and the only way to ask is `document.visibilityState`, which
 * `mynet/no-direct-platform-access` correctly refuses in feature code (SC-008 requires the
 * violation count to be zero).
 *
 * The alternatives were worse rather than merely different. Exempting `useConversation.ts` from
 * the lint rule would trade a structural boundary for a poll interval. Dropping the visibility
 * condition would leave a background tab polling forever. Folding it into
 * `ConnectivityService` would put two unrelated ambient states behind one name, and a component
 * asking "am I online" would start re-rendering when the attendee switched tabs.
 *
 * **It is deliberately the same shape as `ConnectivityService`** — a current value plus a
 * subscription — because it is the same *kind* of thing: an ambient browser state the UI reacts
 * to rather than a device action the UI performs. `useDocumentVisible` returns the value, so no
 * caller manages a subscription and none can forget to unsubscribe.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface VisibilityService {
  isVisible(): boolean
  subscribe(listener: (visible: boolean) => void): () => void
}

export interface DeviceServices {
  readonly notifications: NotificationService
  readonly calendar: CalendarService
  readonly camera: CameraService
  readonly contactShare: ContactShareService
  readonly secureStorage: SecureStorage
  readonly connectivity: ConnectivityService
  // 007 — appended. See `VisibilityService` above for why a seventh capability exists.
  readonly visibility: VisibilityService
}
