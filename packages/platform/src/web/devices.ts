import type {
  CalendarService,
  CameraService,
  ContactShareService,
  DeviceServices,
  NotificationService,
  SecureStorage,
} from '../interfaces/index.js'
import { WebConnectivityService } from './connectivity.js'

/**
 * T105 — web implementations of all six device capabilities (FR-046).
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
 * T107 — **not wired to real delivery, deliberately.**
 *
 * Notifications are out of product scope until a recorded decision brings them in (constitution,
 * Technology and Architecture Constraints). The interface exists so feature code has something
 * to call and so the eventual implementation is a swap rather than a refactor. Reporting
 * `isSupported() === false` and `'unsupported'` is truthful: MyNet does not deliver
 * notifications, whatever the browser is capable of.
 *
 * Do not "finish" this by calling `Notification.requestPermission()`. Asking an attendee for a
 * permission the product will not use is worse than not asking.
 */
const notifications: NotificationService = {
  isSupported: () => false,
  requestPermission: async () => 'unsupported' as const,
  show: async () => {
    // Defined result: completes without effect. See above.
  },
}

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

export const webDevices = (): DeviceServices => ({
  connectivity: new WebConnectivityService(),
  notifications,
  calendar,
  camera,
  contactShare,
  secureStorage,
})
