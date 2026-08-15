import '@testing-library/jest-dom/vitest'

import { configure } from '@testing-library/react'

/**
 * How long `findBy*` waits before declaring an element absent.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE 1000ms DEFAULT IS TOO TIGHT FOR A CODE-SPLIT DESTINATION, AND IT FAILED AS A FLAKE.**
 *
 * Agenda, Discover and Messages are all loaded through `lazy(() => import(…))`, so a `findBy*`
 * that waits for their first heading is waiting on a **dynamic import** plus the first repository
 * read — not on a re-render. Under the full component project's parallel load that regularly
 * lands between one and one-and-a-half seconds, so tests passed alone and failed in the suite,
 * reporting "unable to find role…" against a screen that renders the element moments later.
 *
 * Three separate tests hit this before it was recognised as one problem. Raising the default is
 * the fix for the class: **no assertion changes**, and a genuinely missing element still fails —
 * five seconds later instead of one. A test that needs to prove something is *absent* uses
 * `queryBy*`, which does not wait at all and is unaffected by this.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
configure({ asyncUtilTimeout: 5_000 })

/**
 * 005 — a **deliberately minimal** `<dialog>` shim for jsdom.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **jsdom 30 does not implement `HTMLDialogElement.showModal` at all**, so the session detail
 * panel cannot render in the component layer without this. That is a gap in the test
 * environment, not in the browser: research D3 chose the native element precisely *because*
 * every target browser implements the focus trap, the background inertness, and Escape
 * dismissal correctly, and the register names those three as settled requirements the
 * prototype failed to meet.
 *
 * **WHAT THIS SHIM DOES NOT DO, AND MUST NOT BE READ AS TESTING:**
 *
 *   - It does **not** trap focus. There is no top layer and no inertness in jsdom.
 *   - It does **not** make the background inert.
 *   - It does **not** implement the platform's own Escape handling.
 *
 * A shim that emulated those would make the component tests assert the *shim's* behaviour
 * while reading as if they asserted the browser's — a gate that passes without checking, which
 * is the failure mode this codebase warns about repeatedly. So the real guarantees are
 * asserted where they actually exist: `e2e/session-panel.spec.ts` and
 * `e2e/agenda-keyboard-journey.spec.ts` drive a real browser, and that is where FR-202's focus
 * confinement is proved.
 *
 * What the component layer can honestly assert with this in place is **our own wiring**: that
 * the panel opens modally rather than inline, that our `cancel` handler routes to the same
 * close path as the close button (T037), and that we restore focus to the opener ourselves
 * (T038) — which the platform does *not* do reliably and which is therefore genuinely this
 * feature's code under test.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const dialog = globalThis.HTMLDialogElement?.prototype

if (dialog && typeof dialog.showModal !== 'function') {
  /** Records which dialogs were opened modally, so a test can tell `showModal` from `show`. */
  const modal = new WeakSet<HTMLDialogElement>()

  dialog.showModal = function showModal(this: HTMLDialogElement): void {
    this.open = true
    modal.add(this)
    // The real element reflects modal state through the top layer, which jsdom has no concept
    // of. This attribute is the shim's stand-in and is asserted only as "we called showModal
    // rather than show" — never as "focus is trapped".
    this.setAttribute('data-modal', 'true')
  }

  dialog.show = function show(this: HTMLDialogElement): void {
    this.open = true
  }

  dialog.close = function close(this: HTMLDialogElement, returnValue?: string): void {
    if (!this.open) return
    this.open = false
    modal.delete(this)
    this.removeAttribute('data-modal')
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event('close'))
  }

  /**
   * Escape → `cancel`, which is the one piece of platform behaviour reproduced here.
   *
   * It is reproduced because the thing under test is **our** `cancel` handler — T037 requires
   * Escape and the close button to reach the same close path, so the address updates
   * identically either way. Without this the handler would be unreachable in the component
   * layer and that requirement would have no fast test at all. The browser's own Escape
   * dismissal is still proved end to end.
   */
  globalThis.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return

    const open = globalThis.document.querySelector('dialog[open]')
    if (!open) return

    const cancel = new Event('cancel', { cancelable: true })
    const proceed = open.dispatchEvent(cancel)
    if (proceed) (open as HTMLDialogElement).close()
  })
}
