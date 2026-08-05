import type { DeviceServices } from '@mynet/platform'

import { WebConnectivityService } from './connectivity.js'

/**
 * Web implementations of the six device capabilities.
 *
 * Only `ConnectivityService` is genuinely implemented in this slice — it is the one FR-054
 * requires. The rest return **defined results** appropriate to their contracts rather than
 * throwing: "not supported here" is an answer, not a failure (FR-046, completed at T105).
 *
 * Notifications and calendar are deliberately **not wired to real delivery**. Both are out of
 * product scope until a recorded decision brings them in (constitution, Technology and
 * Architecture Constraints; T107 asserts this).
 */
export const webDevices = (): DeviceServices => ({
  connectivity: new WebConnectivityService(),

  notifications: {
    isSupported: () => false,
    requestPermission: async () => 'unsupported' as const,
    show: async () => {
      // Intentionally does nothing. Out of scope until a recorded decision (T107).
    },
  },

  calendar: {
    isSupported: () => false,
    addEvent: async () => {
      // Intentionally does nothing. Out of scope until a recorded decision (T107).
    },
  },

  camera: {
    isSupported: () => false,
    capturePhoto: async () => null,
  },

  contactShare: {
    isSupported: () => false,
    shareCard: async () => false,
  },

  secureStorage: {
    // Nothing in this slice stores client-side secrets: the sign-in token lives in an
    // HttpOnly cookie precisely so no client code can reach it. These are the defined
    // no-op results, not stubs awaiting an implementation.
    get: async () => null,
    set: async () => {},
    remove: async () => {},
    clear: async () => {},
  },
})
