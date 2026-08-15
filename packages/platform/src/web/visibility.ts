import type { VisibilityService } from '../interfaces/index.js'

/**
 * The web `VisibilityService` (T063, 007, research R4).
 *
 * One source and one event, which is the whole of it: `document.visibilityState` says whether the
 * page is being displayed, and `visibilitychange` fires when that alters. Unlike connectivity
 * there is nothing to reconcile — the browser is authoritative about its own tab, and there is no
 * second opinion to weigh against it.
 *
 * **Not debounced**, deliberately, where `WebConnectivityService` is. A connectivity flap is a
 * train tunnel and produces a flickering banner; a visibility change is a person switching tabs,
 * happens at human speed, and its consumer wants to act on it *immediately* — the point of the
 * signal is that somebody has just come back to a conversation and a delay is exactly the
 * staleness it exists to remove.
 *
 * This file is the adapter layer, so it is one of the few places permitted to touch a browser API
 * directly. `mynet/no-direct-platform-access` guards feature code, which is what this layer exists
 * to keep out of the browser (FR-045, SC-008).
 */
export class WebVisibilityService implements VisibilityService {
  readonly #listeners = new Set<(visible: boolean) => void>()
  #attached = false

  isVisible(): boolean {
    // True when there is no document at all — server-side rendering, or a test environment that
    // has not built one. "Nobody is looking" is the wrong default: it would silently disable
    // every behaviour gated on visibility, and the failure would be an absence of requests
    // rather than an error anybody sees.
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  }

  subscribe(listener: (visible: boolean) => void): () => void {
    this.#listeners.add(listener)
    this.#attach()

    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#detach()
    }
  }

  #attach(): void {
    if (this.#attached || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', this.#onChange)
    this.#attached = true
  }

  #detach(): void {
    if (!this.#attached || typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', this.#onChange)
    this.#attached = false
  }

  readonly #onChange = (): void => {
    const visible = this.isVisible()
    for (const listener of this.#listeners) listener(visible)
  }
}
