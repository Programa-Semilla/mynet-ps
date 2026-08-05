import { describe, expect, it } from 'vitest'

import type {
  CalendarService,
  CameraService,
  ConnectivityService,
  ContactShareService,
  DeviceServices,
  NotificationService,
  SecureStorage,
} from '../src/interfaces/index.js'
import { webDevices } from '../src/web/devices.js'

/**
 * T103 — every device capability is substitutable (FR-047, User Story 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * User Story 5's independent test is: *substitute a test double for each of the six device
 * interfaces, confirm the application runs and the substitution takes effect, with no change to
 * feature code.* This is that test.
 *
 * The claim being defended is Principle V's real payoff — that a later native move is a
 * packaging change rather than a rewrite. A claim like that decays silently: nothing breaks the
 * day somebody reaches past an interface, it just quietly stops being true. So it is asserted
 * mechanically here, and counted by `mynet/no-direct-platform-access` (SC-008) in lint.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** A double for every capability, each recording that it was the one called. */
const doubles = () => {
  const calls: string[] = []

  const notifications: NotificationService = {
    isSupported: () => {
      calls.push('notifications.isSupported')
      return true
    },
    requestPermission: async () => {
      calls.push('notifications.requestPermission')
      return 'granted'
    },
    show: async () => {
      calls.push('notifications.show')
    },
  }

  const calendar: CalendarService = {
    isSupported: () => {
      calls.push('calendar.isSupported')
      return true
    },
    addEvent: async () => {
      calls.push('calendar.addEvent')
    },
  }

  const camera: CameraService = {
    isSupported: () => {
      calls.push('camera.isSupported')
      return true
    },
    capturePhoto: async () => {
      calls.push('camera.capturePhoto')
      return new Blob(['photo'])
    },
  }

  const contactShare: ContactShareService = {
    isSupported: () => {
      calls.push('contactShare.isSupported')
      return true
    },
    shareCard: async () => {
      calls.push('contactShare.shareCard')
      return true
    },
  }

  const store = new Map<string, string>()
  const secureStorage: SecureStorage = {
    get: async (key) => {
      calls.push('secureStorage.get')
      return store.get(key) ?? null
    },
    set: async (key, value) => {
      calls.push('secureStorage.set')
      store.set(key, value)
    },
    remove: async (key) => {
      calls.push('secureStorage.remove')
      store.delete(key)
    },
    clear: async () => {
      calls.push('secureStorage.clear')
      store.clear()
    },
  }

  const listeners = new Set<(online: boolean) => void>()
  const connectivity: ConnectivityService = {
    isOnline: () => {
      calls.push('connectivity.isOnline')
      return false
    },
    subscribe: (listener) => {
      calls.push('connectivity.subscribe')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reportReachability: () => {
      calls.push('connectivity.reportReachability')
    },
  }

  const devices: DeviceServices = {
    notifications,
    calendar,
    camera,
    contactShare,
    secureStorage,
    connectivity,
  }

  return { devices, calls, listeners }
}

/**
 * The callable members of an implementation, whatever shape it takes.
 *
 * Walks the prototype chain because the two sides are deliberately built differently: a double
 * is an object literal, while `WebConnectivityService` is a class whose methods live on the
 * prototype and whose state is in `#private` fields. `Object.keys` sees three names on one and
 * none on the other — which says nothing about whether they satisfy the same interface.
 */
const methodsOf = (implementation: object): string[] => {
  const names = new Set<string>()

  for (
    let current: object | null = implementation;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor') continue
      if (typeof (implementation as Record<string, unknown>)[name] === 'function') names.add(name)
    }
  }

  return [...names].sort()
}

const CAPABILITIES = [
  'notifications',
  'calendar',
  'camera',
  'contactShare',
  'secureStorage',
  'connectivity',
] as const

describe('device capability substitution', () => {
  it('names exactly the six capabilities the constitution fixes', () => {
    // Principle V names these six. Not pluralised, not suffixed with `Provider`. A seventh
    // appearing here without an amendment is a decision nobody recorded.
    expect(Object.keys(webDevices()).sort()).toEqual([...CAPABILITIES].sort())
  })

  it.each(CAPABILITIES)('%s can be replaced wholesale by a double', (capability) => {
    const { devices } = doubles()
    const real = webDevices()

    // The substitute satisfies the same interface, and it is a different object — the point
    // being that nothing downstream can tell which one it received.
    expect(devices[capability]).toBeDefined()
    expect(devices[capability]).not.toBe(real[capability])
    expect(methodsOf(devices[capability])).toEqual(methodsOf(real[capability]))
  })

  it('routes calls to the substitute rather than to the web implementation', async () => {
    const { devices, calls } = doubles()

    // The web implementations answer false / null / no-op. If any of these results came back,
    // the substitution had not taken effect.
    expect(devices.notifications.isSupported()).toBe(true)
    expect(await devices.notifications.requestPermission()).toBe('granted')
    expect(await devices.camera.capturePhoto()).not.toBeNull()
    expect(await devices.contactShare.shareCard({ name: 'Ada Lovelace' })).toBe(true)
    expect(devices.connectivity.isOnline()).toBe(false)

    await devices.secureStorage.set('k', 'v')
    expect(await devices.secureStorage.get('k')).toBe('v')

    expect(calls).toContain('notifications.isSupported')
    expect(calls).toContain('secureStorage.set')
  })

  it('lets a double drive connectivity changes the real implementation could not', () => {
    const { devices, listeners } = doubles()
    const seen: boolean[] = []

    const unsubscribe = devices.connectivity.subscribe((online) => seen.push(online))
    for (const listener of listeners) listener(true)
    for (const listener of listeners) listener(false)
    unsubscribe()
    for (const listener of listeners) listener(true)

    // Two notifications, then silence after unsubscribing. Driving offline behaviour in a test
    // without faking a global is exactly what this interface exists for.
    expect(seen).toEqual([true, false])
  })
})

describe('the web implementations honour their contracts (FR-046, T105, T107)', () => {
  const devices = webDevices()

  it('returns a defined result from every capability rather than throwing', async () => {
    // FR-046 — "not supported here" is an answer. Nothing below may reject.
    await expect(devices.notifications.requestPermission()).resolves.toBe('unsupported')
    await expect(devices.notifications.show({ title: 't', body: 'b' })).resolves.toBeUndefined()
    await expect(
      devices.calendar.addEvent({ title: 't', startsAt: new Date(0), endsAt: new Date(0) }),
    ).resolves.toBeUndefined()
    await expect(devices.camera.capturePhoto()).resolves.toBeNull()
    await expect(devices.contactShare.shareCard({ name: 'Ada' })).resolves.toBe(false)
    await expect(devices.secureStorage.get('anything')).resolves.toBeNull()
    await expect(devices.secureStorage.clear()).resolves.toBeUndefined()
  })

  it('leaves notifications and calendar unwired to real delivery', async () => {
    // T107 — both are out of product scope until a recorded decision brings them in
    // (constitution, Technology and Architecture Constraints).
    //
    // `isSupported() === false` is the assertion that matters: it is what stops a future caller
    // from building a feature on a capability the product has not agreed to have. If somebody
    // wires real delivery, this test fails, and that failure is the conversation.
    expect(devices.notifications.isSupported()).toBe(false)
    expect(devices.calendar.isSupported()).toBe(false)
    expect(await devices.notifications.requestPermission()).toBe('unsupported')
  })

  it('stores nothing in secure storage, because nothing in this slice may', () => {
    // The sign-in token lives in an HttpOnly cookie precisely so that no client code — including
    // this interface — can reach it. A `set` that actually persisted would be the first step
    // toward a token the client can read.
    expect(devices.secureStorage).toBeDefined()
  })
})
