import { useEffect, useState, type RefObject } from 'react'

/**
 * T017 (016) — **whether an element is actually being displayed** (FR-1054).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE POINT IS THAT THE CALLER NEVER LEARNS A WIDTH.**
 *
 * FR-1054 pauses the conversation list's refresh when the list is not on screen. The layout band
 * is merely how that answer happens to be produced today — at phone widths an open thread
 * replaces the list, and from tablet up both panes are visible — and writing the condition as
 * `threadOpen && isMobile` would encode the coincidence rather than the rule. **A later layout
 * change would then silently re-enable a poll against a list nobody can see**, which is the
 * failure the requirement is worded to prevent.
 *
 * Asking the element instead keeps the rule where the rule is. It also keeps Principle V intact:
 * this reads a *rendered element*, the way `Thread.tsx` reads `scrollHeight` to decide whether
 * to pin the scroll — it never asks the browser about the viewport, which is the platform access
 * that would need a capability and an amendment.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **TWO OBSERVERS, BECAUSE THERE ARE TWO WAYS TO STOP BEING DISPLAYED AND ONLY ONE OF THEM
 * TOUCHES AN ATTRIBUTE.**
 *
 * The first version re-measured when the address changed, and a test hiding the pane directly
 * caught it: the address is not what determines whether an element is displayed, and a hook that
 * measured only on navigation was the width-coupling it was written to avoid, one step removed.
 *
 * The second version watched `class` and `style`, and **that was still not enough — it missed the
 * case the shipped layout actually uses.** The pane's class is the *constant* string
 * `'hidden min-w-0 tablet:block'`; crossing the `tablet` breakpoint changes the **computed**
 * display without mutating either attribute, so nothing re-measured. Both directions failed:
 * narrowing a window with a thread open left the poll firing every ten seconds at a list nobody
 * could see — verbatim the failure this hook exists to prevent — and rotating a phone into tablet
 * width left a visible list frozen, so FR-1054's "MUST resume" went unmet.
 *
 *   - **`MutationObserver`** on `class` and `style` covers a layout that hides the element by
 *     writing to it: Tailwind's `hidden` toggles the first, an inline rule the second.
 *   - **`ResizeObserver`** on the same element covers a layout that hides it by *stylesheet* — a
 *     media query, a container query, a parent's `grid-template` collapsing. An element with
 *     `display: none` has no box, so entering and leaving that state is a size change like any
 *     other and the callback fires for both.
 *
 * **`display` is read rather than the class list**, so a future arrangement that hides the pane by
 * some other means still reports correctly; the observers only decide *when* to look.
 *
 * **An `IntersectionObserver` was the reviewer's suggestion and is deliberately not what this
 * uses.** It reports `display: none` correctly, but its default root is the **viewport** — the one
 * thing this file's header says the caller must never learn — and it would also report a list
 * merely scrolled out of view as not displayed, pausing a refresh the reader still wants when they
 * scroll back. A `ResizeObserver` on the element answers the same question about the element
 * alone.
 *
 * **Its remaining limit is an ANCESTOR being hidden by a class or an inline style**, which neither
 * observer sees directly — an ancestor going `display: none` does collapse this element's box, so
 * the `ResizeObserver` catches it in a real browser, but nothing here observes the ancestor's
 * attributes. That is not the case in this layout — the pane carries its own `hidden` — and
 * covering it properly would mean observing the whole tree. Worth knowing before reusing this.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE THREE LINT EXEMPTIONS BELOW ARE NARROW ON PURPOSE, AND THIS IS THE ARGUMENT FOR THEM.**
 *
 * `mynet/no-direct-platform-access` names `getComputedStyle`, `MutationObserver` and
 * `ResizeObserver` since 016's deep review (finding A3): they were reachable here only because
 * nobody had enumerated them, while `window.getComputedStyle(element)` — the identical call —
 * already failed. A count of what a denylist knows is not a count of what is true.
 *
 * The distinction this repository draws is **asking the browser about the viewport** versus
 * **asking about a node this component rendered**. The first needs a capability and an amendment;
 * US5's `matchMedia` is exactly that, and it cost constitution v5.1.0. The second is what
 * `Composer.tsx` and `Thread.tsx` already do with `scrollHeight`, and it needs no port: there is
 * no device to substitute, no environment to differ, and nothing a test would want to fake beyond
 * the element itself.
 *
 * All three calls here are the second kind — `element` is the caller's own ref throughout, and no
 * viewport, screen or media query is consulted. The exemptions are per line rather than a
 * config-file entry for this file, so a *fourth* platform call added later still fails.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Defaults to displayed.** An environment that lays nothing out must not silently disable the
 * refresh: an absence of requests is a failure nobody sees, which is the reasoning
 * `WebVisibilityService` records for returning `true` when there is no document at all. The
 * `ResizeObserver` is optional for the same reason — jsdom does not implement one, and a hook that
 * threw there would take the refresh out with it.
 */
export const useDisplayed = (ref: RefObject<HTMLElement | null>): boolean => {
  const [displayed, setDisplayed] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Element-level measurement of the caller's own node, not a viewport query — the header
    // carries the full argument for this exemption and the two below it.
    // eslint-disable-next-line mynet/no-direct-platform-access
    const measure = (): void => setDisplayed(getComputedStyle(element).display !== 'none')

    measure()

    // Observes `element` only.
    // eslint-disable-next-line mynet/no-direct-platform-access
    const attributes = new MutationObserver(measure)
    attributes.observe(element, { attributes: true, attributeFilter: ['class', 'style'] })

    // Observes `element` only. Optional, because jsdom implements no `ResizeObserver`.
    // eslint-disable-next-line mynet/no-direct-platform-access
    const box = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    box?.observe(element)

    return () => {
      attributes.disconnect()
      box?.disconnect()
    }
  }, [ref])

  return displayed
}
