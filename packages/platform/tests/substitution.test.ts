import { describe, expect, it } from 'vitest'

import type {
  CalendarService,
  CameraService,
  ConnectivityService,
  ContactShareService,
  DeviceServices,
  NotificationService,
  SecureStorage,
  VisibilityService,
} from '../src/interfaces/index.js'
import { webDevices } from '../src/web/devices.js'
import { WebNotificationService } from '../src/web/notifications.js'

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
    // 007 — the three members M4 added. Present here because the registry is substituted **whole**:
    // a method added to the interface and forgotten in this double fails to compile, which is the
    // guard working rather than a chore.
    subscribe: async () => {
      calls.push('notifications.subscribe')
      return null
    },
    unsubscribe: async () => {
      calls.push('notifications.unsubscribe')
    },
    currentSubscription: async () => {
      calls.push('notifications.currentSubscription')
      return null
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
  const visibilityListeners = new Set<(visible: boolean) => void>()
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

  // 007 — the seventh capability. Substituting the registry whole is what makes FR-047's claim
  // testable in one object, so a member added to `DeviceServices` and forgotten here fails to
  // compile — which is the guard working rather than a chore.
  const visibility: VisibilityService = {
    isVisible: () => {
      calls.push('visibility.isVisible')
      return true
    },
    subscribe: (listener) => {
      calls.push('visibility.subscribe')
      visibilityListeners.add(listener)
      return () => visibilityListeners.delete(listener)
    },
  }

  const devices: DeviceServices = {
    notifications,
    calendar,
    camera,
    contactShare,
    secureStorage,
    connectivity,
    visibility,
  }

  return { devices, calls, listeners, visibilityListeners }
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SIX AT 001, SEVEN SINCE 007 — AND THE SEVENTH IS RECORDED HERE BECAUSE THIS TEST DEMANDED
 * IT.**
 *
 * The list below used to be six, with a comment saying that a seventh appearing "without an
 * amendment is a decision nobody recorded". That guard did exactly its job: 007 needed
 * `visibility`, and this test is what stopped the addition being made silently.
 *
 * So it is made loudly instead. **`visibility` is a declared addition to Principle V's list, and
 * it is an outstanding governance item** — the constitution names six capabilities and this makes
 * seven, which is a smaller version of the same act as 007's push amendment and belongs in the
 * same review.
 *
 * The reasoning, in full, is in `interfaces/index.ts` above `VisibilityService`. In short:
 * research R4's poll must not run in a background tab, the only way to ask is
 * `document.visibilityState`, and `mynet/no-direct-platform-access` correctly refuses that in
 * feature code — so the choice was a capability or a lint exemption, and a lint exemption would
 * have traded a structural boundary for a poll interval.
 *
 * **This list stays a fixed enumeration rather than being derived from `webDevices()`.** Deriving
 * it would make the test tautological and delete the guard that produced this note.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const CAPABILITIES = [
  'notifications',
  'calendar',
  'camera',
  'contactShare',
  'secureStorage',
  'connectivity',
  // 007 — see the block above. Added with its reasoning, not merely added.
  'visibility',
] as const

describe('device capability substitution', () => {
  it('names exactly the capabilities the constitution fixes, plus those declared since', () => {
    // Principle V names six. Not pluralised, not suffixed with `Provider`. An **eighth** appearing
    // here without a recorded decision is a decision nobody recorded — which is what this
    // assertion caught when 007 added the seventh.
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS TEST CLAIMED TO BE A GOVERNANCE GATE AND WAS VACUOUS.**
   *
   * It read: *"both are out of product scope until a recorded decision brings them in… if somebody
   * wires real delivery, this test fails, and that failure is the conversation."* Constitution
   * **v3.1.0 brought notification delivery in**, 007 wired `WebNotificationService` to a real
   * `PushManager`, and **this test kept passing** — because `webDevices()` is called with no VAPID
   * key and jsdom has neither `Notification` nor `PushManager`, so `isSupported()` returned false
   * for four environmental reasons that say nothing about whether the capability is wired.
   *
   * The event it existed to catch happened without it firing, and its comment went on asserting a
   * scope the constitution had reversed. Both halves are corrected below: calendar keeps the
   * genuine unwired assertion, and notifications get a **contract** assertion that does not depend
   * on what jsdom happens to lack.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves CALENDAR unwired to real delivery, which is still true', () => {
    // Calendar remains out of product scope: the constitution's exclusion is unchanged, and its
    // interface exists but must not be wired. This half of the original assertion still means
    // what it said.
    expect(devices.calendar.isSupported()).toBe(false)
  })

  it('reports notifications unsupported when no VAPID key is configured (register entry 20)', () => {
    // The fourth condition in `isSupported()` is **ours, not the browser's**: with no key there is
    // nothing to subscribe with, so offering a permission prompt would lead nowhere. This is the
    // property that survives a real browser, unlike the three jsdom happens to supply.
    expect(new WebNotificationService(undefined).isSupported()).toBe(false)
    expect(new WebNotificationService('').isSupported()).toBe(false)
  })

  it('resolves rather than rejecting when a configured browser still cannot register', async () => {
    // Constructed **with** a key, so `isSupported()`'s VAPID condition is satisfied and what is
    // being tested is the capability's own contract rather than the absence of configuration.
    // jsdom has no service worker, so this is the defined "cannot register" outcome — `null`,
    // never a rejection, because FR-552 makes "this device is not registered" an ordinary result.
    const configured = new WebNotificationService('BEl62iUYgUivxIkv69yViEuiBIa40HI')

    await expect(configured.subscribe()).resolves.toBeNull()
    await expect(configured.currentSubscription()).resolves.toBeNull()
    await expect(configured.unsubscribe()).resolves.toBeUndefined()
  })

  it('stores nothing in secure storage, because nothing in this slice may', async () => {
    // The sign-in token lives in an HttpOnly cookie precisely so that no client code — including
    // this interface — can reach it. A `set` that actually persisted would be the first step
    // toward a token the client can read.
    //
    // This assertion used to be `expect(devices.secureStorage).toBeDefined()`, which could not
    // fail for the reason it names: an implementation backed by `localStorage` would have passed
    // it. Writing and reading back is what actually holds the line.
    await devices.secureStorage.set('token', 'a-secret-value')
    await expect(devices.secureStorage.get('token')).resolves.toBeNull()

    // And nothing reached a browser store on the way past.
    expect(Object.keys(globalThis.localStorage ?? {})).toEqual([])
    expect(Object.keys(globalThis.sessionStorage ?? {})).toEqual([])
  })
})
