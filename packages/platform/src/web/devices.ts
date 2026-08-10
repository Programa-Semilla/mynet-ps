import type {
  CalendarService,
  CameraService,
  ContactShareService,
  DeviceServices,
  NotificationService,
  SecureStorage,
} from '../interfaces/index.js'
import { WebConnectivityService } from './connectivity.js'
import { WebNotificationService } from './notifications.js'
import { WebVisibilityService } from './visibility.js'

/**
 * T105 — web implementations of every device capability (FR-046). Six at 001; seven since 007
 * added visibility, which `interfaces/index.ts` argues in place.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every one returns a defined result appropriate to its contract.** None throws "not
 * implemented", and none is a placeholder awaiting a real version. "This platform cannot do
 * that" is an answer a caller can act on; a thrown error is a caller having to guess whether
 * something broke.
 *
 * Where a contract has no return value, completing without effect *is* the defined result
 * (FR-046). That is the case for notifications and calendar below.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * This file is the adapter layer, so it is one of the few places permitted to touch a browser
 * API directly. `mynet/no-direct-platform-access` guards feature code, which is what this layer
 * exists to keep out of the browser (FR-045, SC-008).
 */

/**
 * T116 (007) — **now wired to real delivery**, and the swap this file was shaped for.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * What stood here was a deliberate no-op reporting `isSupported() === false`, with a comment
 * saying *"Do not 'finish' this by calling `Notification.requestPermission()`. Asking an attendee
 * for a permission the product will not use is worse than not asking."*
 *
 * That was right while register entry 10 stood. **Constitution 3.1.0 reversed it** — delivery is
 * in scope for a received message and nothing else — so the product now uses the permission, and
 * the instruction is satisfied rather than overridden. `WebNotificationService` also records why
 * it is a class in its own file rather than four lines here.
 *
 * 001's claim that the eventual implementation would be "a swap rather than a refactor" is worth
 * noting as having held: nothing calling this interface changed.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const notificationsWith = (vapidPublicKey?: string): NotificationService =>
  new WebNotificationService(vapidPublicKey)

/** T107 — also out of scope until a recorded decision. Same reasoning as notifications. */
const calendar: CalendarService = {
  isSupported: () => false,
  addEvent: async () => {
    // Defined result: completes without effect.
  },
}

/**
 * Camera. Genuinely unsupported in this slice — nothing captures a photo yet — but the
 * capability check is real rather than hardcoded, so the badge-scanning slice that needs it
 * inherits a correct answer instead of a false one.
 */
const camera: CameraService = {
  isSupported: () =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
  capturePhoto: async () => null,
}

/**
 * Sharing a digital business card.
 *
 * `isSupported` reports the real capability; `shareCard` still resolves `false`, because what a
 * card exchange *records* is constitution Open Question 8 and is not decided. Sharing something
 * before deciding what it means would create data nobody has specified.
 */
const contactShare: ContactShareService = {
  isSupported: () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  shareCard: async () => false,
}

/**
 * Client-side secret storage.
 *
 * **Nothing in this slice stores anything here, and that is the design.** The sign-in token
 * lives in an HttpOnly cookie precisely so that no client code — including this interface — can
 * reach it. `get` returning null is the defined result of a store with nothing in it.
 *
 * MUST NOT become a general cache (constitution, Persistence). If a later slice needs one, that
 * is a different interface with a different name.
 */
const secureStorage: SecureStorage = {
  get: async () => null,
  set: async () => {},
  remove: async () => {},
  clear: async () => {},
}

/**
 * 007 — `webDevices` now takes configuration, and it takes exactly one thing.
 *
 * The VAPID public key comes from the composition root, which is the one module permitted to read
 * `import.meta.env`. Optional, because its absence is the expected state (register entry 20) and a
 * client with no key must still start: the attendee gets the whole product minus delivery.
 */
export const webDevices = (options: { vapidPublicKey?: string } = {}): DeviceServices => ({
  connectivity: new WebConnectivityService(),
  // 007 — the seventh capability. `interfaces/index.ts` records why it exists rather than
  // `useConversation.ts` reading `document.visibilityState` behind a lint exemption.
  visibility: new WebVisibilityService(),
  notifications: notificationsWith(options.vapidPublicKey),
  calendar,
  camera,
  contactShare,
  secureStorage,
})
