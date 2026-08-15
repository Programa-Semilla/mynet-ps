import type { DeviceSubscription, NotificationService, SecureStorage } from '@mynet/platform'

/**
 * 007 — doubles for the notification capability and the storage the prompt reconciles against
 * (T106, T107).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These record rather than merely answer**, because the interesting assertions in this feature
 * are about what was *not* called: FR-551 is satisfied only if `requestPermission` has not run by
 * the time the explanation is on screen, and there is no way to see that from a double that only
 * returns values.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export const A_SUBSCRIPTION: DeviceSubscription = {
  endpoint: 'https://push.example.test/subscriptions/ada-laptop',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
}

export interface NotificationsDouble {
  readonly service: NotificationService
  /** Every `requestPermission` call. Its **length** is the FR-551 assertion. */
  readonly prompted: number[]
  readonly subscribed: number[]
  readonly unsubscribed: number[]
}

export const notificationsDouble = ({
  supported = true,
  permission = 'granted',
  existing = null,
  issues = A_SUBSCRIPTION,
}: {
  supported?: boolean
  permission?: 'granted' | 'denied' | 'unsupported'
  /** What the browser already holds — non-null means this device is registered already. */
  existing?: DeviceSubscription | null
  /** What `subscribe` produces once permission is granted. `null` is a push service refusing. */
  issues?: DeviceSubscription | null
} = {}): NotificationsDouble => {
  const prompted: number[] = []
  const subscribed: number[] = []
  const unsubscribed: number[] = []
  let held = existing

  return {
    prompted,
    subscribed,
    unsubscribed,
    service: {
      isSupported: () => supported,
      requestPermission: async () => {
        prompted.push(prompted.length)
        return permission
      },
      show: async () => {},
      subscribe: async () => {
        subscribed.push(subscribed.length)
        if (permission !== 'granted') return null
        held = issues
        return issues
      },
      unsubscribe: async () => {
        unsubscribed.push(unsubscribed.length)
        held = null
      },
      currentSubscription: async () => held,
    },
  }
}

export interface StorageDouble extends SecureStorage {
  readonly entries: Map<string, string>
}

/** `SecureStorage` over a map, so the prompt's "already answered" memory is observable. */
export const storageDouble = (initial: Record<string, string> = {}): StorageDouble => {
  const entries = new Map<string, string>(Object.entries(initial))

  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value)
    },
    remove: async (key) => {
      entries.delete(key)
    },
    clear: async () => {
      entries.clear()
    },
  }
}

export interface PushRepositoryDouble {
  readonly registered: DeviceSubscription[]
  readonly unregistered: string[]
  readonly repository: {
    register(subscription: DeviceSubscription): Promise<void>
    unregister(endpoint: string): Promise<void>
  }
}

export const pushRepositoryDouble = (fails?: Error): PushRepositoryDouble => {
  const registered: DeviceSubscription[] = []
  const unregistered: string[] = []

  return {
    registered,
    unregistered,
    repository: {
      register: async (subscription) => {
        if (fails) throw fails
        registered.push(subscription)
      },
      unregister: async (endpoint) => {
        if (fails) throw fails
        unregistered.push(endpoint)
      },
    },
  }
}
