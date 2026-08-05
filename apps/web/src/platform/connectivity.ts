import type { ConnectivityService } from '@mynet/platform'

/**
 * The web `ConnectivityService` (FR-054, T099).
 *
 * **Debounced**, because `online`/`offline` events fire on every transient blip — a train
 * tunnel, a lift, a conference venue's overloaded wifi. Without debouncing the offline
 * indicator oscillates, and an indicator that flickers is worse than none: the attendee stops
 * believing it, which defeats FR-052's requirement that offline state be *honest*.
 *
 * This is one of the few places a browser API is called directly, and that is correct: this
 * file *is* the implementation of the interface. `mynet/no-direct-platform-access` applies to
 * feature code, not to the adapter layer it exists to keep feature code out of.
 */
const DEBOUNCE_MS = 750

export class WebConnectivityService implements ConnectivityService {
  readonly #listeners = new Set<(online: boolean) => void>()
  #timer: ReturnType<typeof setTimeout> | undefined
  #attached = false

  isOnline(): boolean {
    // `navigator.onLine` false is reliable; true only means a network interface exists, not
    // that the API is reachable. The HTTP client's own failure path covers the rest.
    return typeof navigator === 'undefined' ? true : navigator.onLine
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.#listeners.add(listener)
    this.#attach()

    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#detach()
    }
  }

  #attach(): void {
    if (this.#attached || typeof window === 'undefined') return
    window.addEventListener('online', this.#onChange)
    window.addEventListener('offline', this.#onChange)
    this.#attached = true
  }

  #detach(): void {
    if (!this.#attached || typeof window === 'undefined') return
    window.removeEventListener('online', this.#onChange)
    window.removeEventListener('offline', this.#onChange)
    if (this.#timer) clearTimeout(this.#timer)
    this.#attached = false
  }

  readonly #onChange = (): void => {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      const online = this.isOnline()
      for (const listener of this.#listeners) listener(online)
    }, DEBOUNCE_MS)
  }
}
