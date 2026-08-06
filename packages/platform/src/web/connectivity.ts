import type { ConnectivityService } from '../interfaces/index.js'

/**
 * The web `ConnectivityService` (FR-054, T099).
 *
 * Two sources, because neither is sufficient alone:
 *
 * 1. **The browser's `online`/`offline` events.** Immediate and cheap, but `navigator.onLine`
 *    returning true only means a network interface exists — not that MyNet is reachable. It
 *    also reports true right after a page load on a device with no working connection.
 * 2. **What actually happened on the wire**, reported by the HTTP client through
 *    `reportReachability`. Authoritative, but only available after something has been tried.
 *
 * Online means both agree. A failed request wins over an optimistic flag, which is the
 * conservative direction: claiming offline while online costs one banner, while claiming online
 * while offline costs the attendee's trust in every indicator the product shows them (FR-052).
 *
 * **Debounced**, because `online`/`offline` events fire on every transient blip — a train
 * tunnel, a lift, a conference venue's overloaded wifi. Without debouncing the offline indicator
 * oscillates, and an indicator that flickers is worse than none: the attendee stops believing
 * it, which defeats FR-052's requirement that offline state be *honest*.
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

  /**
   * What the last actual attempt to reach the server observed.
   *
   * Starts optimistic: before anything has been tried there is no evidence of a problem, and
   * opening the application with an offline banner already showing would be its own kind of lie.
   */
  #reachable = true

  isOnline(): boolean {
    const flag = typeof navigator === 'undefined' ? true : navigator.onLine
    return flag && this.#reachable
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.#listeners.add(listener)
    this.#attach()

    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#detach()
    }
  }

  reportReachability(reachable: boolean): void {
    if (this.#reachable === reachable) return
    this.#reachable = reachable
    this.#notifyDebounced()
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
    // A browser `online` event is a reason to re-test, not proof of reachability. Clearing the
    // observed failure lets the next request decide, rather than leaving the banner up until
    // something happens to be requested.
    if (typeof navigator === 'undefined' || navigator.onLine) this.#reachable = true
    this.#notifyDebounced()
  }

  #notifyDebounced(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      const online = this.isOnline()
      for (const listener of this.#listeners) listener(online)
    }, DEBOUNCE_MS)
  }
}
