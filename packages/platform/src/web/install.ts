import type { InstallService, InstallState } from '../interfaces/index.js'

/**
 * T052 (016) — the web `InstallService` (FR-1031, FR-1033, FR-1034).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE IS THE ADAPTER LAYER, WHICH IS WHY IT MAY TOUCH THE BROWSER AT ALL.**
 *
 * `mynet/no-direct-platform-access` guards *feature* code, and this is what that guard exists to
 * keep feature code out of. Everything below — `matchMedia`, `window`, a captured event — is
 * confined here, and `packages/platform/src/interfaces/index.ts` argues why the capability had to
 * exist rather than be reached for directly (constitution v5.1.0).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The event Chromium fires when it is willing to offer an install.
 *
 * Declared locally because it is **not in the DOM lib**: `BeforeInstallPromptEvent` is a Chromium
 * extension that no standard type definition carries. Writing it out here is honest about that —
 * an `as any` would hide that this is one engine's API rather than a web platform one, which is
 * precisely the fact `InstallState.promptToInstall` is nullable to express.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * How "mobile-class" is decided (FR-1031).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Viewport and pointer, never a user-agent string.** The specification's assumption, and the
 * reason is that user-agent strings are unreliable, are actively frozen by browsers, and change
 * without notice — a product that parsed one would show the wrong thing to some readers forever
 * and nobody would know which.
 *
 * `pointer: coarse` is the primary signal: it says the input is a finger. The width bound catches
 * a touchscreen laptop, which is coarse-pointing but is not the device this guidance is about.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const MOBILE_QUERY = '(pointer: coarse) and (max-width: 1023px)'

/** Display modes that mean "not in a browser tab". Any one of them is an installed launch. */
const INSTALLED_QUERIES = ['(display-mode: standalone)', '(display-mode: fullscreen)']

/**
 * Every query whose answer this service reports, so nothing announces two of its three parts.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A `MediaQueryList` IS AN EVENT TARGET, AND NOT SUBSCRIBING TO IT MADE `current()` A
 * READ-ONCE-PER-MOUNT VALUE WEARING A SUBSCRIPTION SHAPE** (review finding A6).
 *
 * `#announce` fired only from `beforeinstallprompt`, `appinstalled` and `#prompt`, so `installed`
 * and `mobile` changed underneath every subscriber in silence. Both genuinely move: rotating a
 * phone crosses `MOBILE_QUERY`'s width bound, and a reader who installs from the browser's own
 * menu and relaunches crosses `INSTALLED_QUERIES` — which is the case `appinstalled` does *not*
 * cover, because it fires in the tab that was open rather than in the installed instance.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const OBSERVED_QUERIES = [...INSTALLED_QUERIES, MOBILE_QUERY]

export class WebInstallService implements InstallService {
  readonly #listeners = new Set<(state: InstallState) => void>()

  /**
   * The deferred `beforeinstallprompt`, if this engine ever gave us one.
   *
   * **Held rather than acted on immediately**, which is the whole reason the listener exists:
   * Chromium fires this when *it* is ready, not when the reader is, and calling `prompt()` on
   * arrival would interrupt somebody mid-sign-in with a dialog they did not ask for. FR-1037
   * forbids the guidance blocking or delaying signing in, and an unsolicited system prompt is the
   * loudest possible way to break that.
   */
  #deferred: BeforeInstallPromptEvent | null = null

  /** Whether a prompt is currently on screen. See `#prompt` for why the port owns this. */
  #prompting = false

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THE WINDOW LISTENERS ARE ATTACHED FOR THIS OBJECT'S WHOLE LIFE, NOT FOR AS LONG AS
   * SOMEBODY IS SUBSCRIBED — AND THE FIRST VERSION LOST THE INSTALL EVENT BECAUSE THEY WERE
   * NOT** (review findings A6, P-m3).
   *
   * `subscribe` used to attach on the first listener and detach on the last, which is the
   * ordinary shape and is wrong here for a reason specific to `beforeinstallprompt`:
   *
   *   1. **`InstallGuidance` is the only consumer, and it unmounts on sign-in.** So for the whole
   *      authenticated session — the overwhelming majority of a reader's time in the product —
   *      there was no listener attached at all.
   *   2. **Chromium fires `beforeinstallprompt` once per page load**, commonly *after* its
   *      engagement heuristics are satisfied, which is to say after somebody has been using the
   *      product for a while. Precisely the window in which nothing was listening.
   *
   * Two things followed, and both are user-visible. `preventDefault()` was never called, so
   * Chromium showed its own mini-infobar — the banner this service exists to suppress in favour
   * of FR-1033's explained control. And the event was gone by the time anybody subscribed again,
   * so a reader returning to the sign-in screen on a **Chromium phone** was shown FR-1034's
   * manual iOS steps: the no-mechanism branch, on a platform that has one.
   *
   * **There is nothing to leak.** `webDevices()` runs once at the composition root and this object
   * lives as long as the page does, so "detaching" only ever discarded state it would need again.
   * `subscribe` therefore manages the **listener set** and nothing else.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  constructor() {
    if (typeof window === 'undefined') return

    window.addEventListener('beforeinstallprompt', this.#onBeforeInstallPrompt)
    window.addEventListener('appinstalled', this.#onInstalled)

    if (typeof window.matchMedia !== 'function') return

    for (const query of OBSERVED_QUERIES) {
      const list = window.matchMedia(query)
      // `addEventListener` on a `MediaQueryList` is the standard form and the only one used
      // here — the deprecated `addListener` is Safari 13 and earlier, which cannot install a
      // web application at all, so falling back to it would be code for a platform that never
      // reaches this branch.
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', this.#onQueryChange)
      }
    }
  }

  current(): InstallState {
    return {
      installed: this.#installed(),
      mobile: this.#mobile(),
      // Bound here, so a caller holding the returned function cannot lose `this`. The same trap
      // 008's cache decorator met with `#private` fields and a Proxy.
      promptToInstall: this.#deferred ? () => this.#prompt() : null,
    }
  }

  /**
   * Adds a listener and removes it again. **It attaches nothing and detaches nothing** — see the
   * constructor for why the platform listeners outlive every subscriber.
   */
  subscribe(listener: (state: InstallState) => void): () => void {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * True when this is running as an installed application.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────
   * **`false` where a platform ANSWERS UNHELPFULLY**, which makes the guidance *show*.
   *
   * The direction is deliberate and is the specification's stated assumption: a redundant hint to
   * somebody who has already installed is a smaller harm than an attendee who never learns that
   * notifications need installing. Defaulting the other way would hide the guidance on exactly
   * the platforms whose reporting is worst — iOS, which is the only platform the guidance is
   * really for.
   *
   * `navigator.standalone` is the iOS-only legacy signal and is checked alongside the display-mode
   * queries, because older iOS reports the second and not the first.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────
   * **THAT RULE GOVERNS A BAD ANSWER, NOT A MISSING `matchMedia` — AND THE DIFFERENCE HAD TO BE
   * WRITTEN DOWN, BECAUSE THE CODE ALREADY BEHAVED THIS WAY AND THE COMMENT SAID OTHERWISE**
   * (review finding A7).
   *
   * `#mobile()` also returns `false` with no `matchMedia`, and `InstallGuidance` renders nothing
   * unless `mobile` is true — so the "show rather than hide" claim was never what happened. One
   * default silently overrode the other, and the record described behaviour the product did not
   * have.
   *
   * It is corrected here rather than in the code, because **a platform with no `matchMedia` is not
   * a reader**. Every browser capable of installing a web application has had it for a decade,
   * iOS Safari included — which is what makes the "worst reporting platform" argument above still
   * hold, since that platform answers the display-mode query, it just answers it badly on older
   * versions. An absent `matchMedia` means a non-browser environment: a test harness, a
   * prerender, a scraper. Claiming `mobile: true` there would put a home-screen notice in front
   * of something that has no home screen, on the strength of no measurement at all.
   *
   * So: **a platform with no `matchMedia` gets no guidance, and that is acceptable because it is
   * not a device somebody is holding.** Both defaults are `false`, both mean "nothing was
   * measured", and the two now agree with each other and with what is on screen.
   * ─────────────────────────────────────────────────────────────────────────────────────
   */
  #installed(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false

    if (INSTALLED_QUERIES.some((query) => window.matchMedia(query).matches)) return true

    const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone
    return legacy === true
  }

  /** See `#installed` for why an absent `matchMedia` produces no guidance rather than more. */
  #mobile(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(MOBILE_QUERY).matches
  }

  /**
   * Presents the platform's own prompt and reports what the reader chose.
   *
   * **A dismissal is a complete outcome, not an error** (spec edge case) — the reader was asked
   * and declined, which is the mechanism working. The deferred event is cleared either way,
   * because a `beforeinstallprompt` may be used **once**; a second `prompt()` on the same event
   * rejects, and holding a spent event would leave `promptToInstall` non-null and broken.
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **CLEARED AND ANNOUNCED *AFTER* THE READER CHOOSES, NEVER BEFORE — AND THE ORDER IS A BUG
   * THIS HAD.**
   *
   * The first version nulled `#deferred` and announced immediately, before awaiting. Subscribers
   * therefore observed `promptToInstall: null` **while the system dialog was still open**, and
   * `InstallGuidance` renders the manual iOS steps in exactly that case (FR-1034) — so a
   * Chromium reader who pressed "Install MyNet" watched the guidance flip to *"tap the share
   * icon"* underneath the dialog they had just opened. Wrong instructions, on the wrong
   * platform, at the one moment the reader is looking.
   *
   * Announcing after the choice keeps the observable state true throughout: a prompt is
   * available until it has been used, and then it is not.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  async #prompt(): Promise<boolean> {
    const event = this.#deferred
    // `#prompting` rather than trusting the caller: `prompt()` may be invoked **once** per event,
    // and a second call rejects. The component disables its control while awaiting, but a port
    // must not depend on every consumer remembering to.
    if (!event || this.#prompting) return false

    this.#prompting = true

    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      return outcome === 'accepted'
    } finally {
      this.#prompting = false
      this.#deferred = null
      this.#announce()
    }
  }

  readonly #onBeforeInstallPrompt = (event: Event): void => {
    // Chromium shows its own mini-infobar unless this is prevented. Preventing it is what makes
    // FR-1033's "the guidance MUST offer to invoke it" the reader's choice rather than a second
    // banner competing with ours.
    event.preventDefault()
    this.#deferred = event as BeforeInstallPromptEvent
    this.#announce()
  }

  /**
   * The application was installed — possibly from our prompt, possibly from the browser's own
   * menu, and the two are indistinguishable here on purpose. FR-1035's dismissal is remembered
   * separately; this is the state changing underneath everybody.
   */
  readonly #onInstalled = (): void => {
    this.#deferred = null
    this.#announce()
  }

  /**
   * A media query changed its answer — the display mode, or the pointer-and-width pair.
   *
   * Nothing is stored: `current()` re-reads every query each time it is called, so announcing is
   * the whole of the work. That is what makes this the fix for A6 rather than a second copy of
   * the state to keep in step with the first.
   */
  readonly #onQueryChange = (): void => {
    this.#announce()
  }

  #announce(): void {
    const state = this.current()
    for (const listener of this.#listeners) listener(state)
  }
}
