import { OfflineError, type Event } from '@mynet/data'
import { useEventsRepository } from '@mynet/platform'
import { Check, ChevronDown, X } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { useActiveEventContext } from '../app/active-event.js'
import { Loading, useAsync } from '../app/AsyncState.js'

/**
 * T058–T062, T065 (002) — the conference switcher (FR-110–FR-119).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Every state this control can be in is declared here**, because Principle IX presumes an
 * undeclared state unmet:
 *
 *   loading   — the attendee's conferences are in flight (FR-117)
 *   empty     — registered for none; identified, no choice offered (FR-117)
 *   single    — registered for exactly one; named, no choice offered (FR-114)
 *   ready     — a choice
 *   switching — a switch in flight; nothing shown as changed yet
 *   failed    — the switch did not take effect, and the previous conference is still
 *               active (FR-115), with offline worded differently from a server fault (FR-112)
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing is queued and nothing is shown as succeeded** when a switch is attempted offline.
 * That follows the precedent sign-out set in `TopBar.tsx`: someone who is told a change worked
 * when it did not is worse off than someone told it failed.
 */
export const EventSwitcher = () => {
  const eventsRepository = useEventsRepository()
  const { state: active, switchTo } = useActiveEventContext()

  const load = useCallback(
    () => eventsRepository.listRegistered() as Promise<Event[]>,
    [eventsRepository],
  )
  const events = useAsync<Event[]>(load, [load])

  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    // Focus goes back to the control that opened the menu. Without this a keyboard user is
    // returned to the top of the document and has to find their place again.
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  /**
   * FR-116 — **Escape closes without changing the selection.**
   *
   * Stated as its own requirement because the failure mode is silent: a dismissal that applied
   * whatever was highlighted would move the attendee to a different conference when they meant
   * to back out, and nothing on screen would say so.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Handled by React's own key event on the wrapper rather than by a `document` listener, and
   * not only to satisfy `mynet/no-direct-platform-access`: while the menu is open focus is
   * always inside this subtree — on the trigger or on a menu item — so a listener on the
   * document would be reaching past the component to catch events it already receives.
   *
   * There is deliberately **no click-outside dismissal**. It would need a document listener,
   * no requirement asks for one, and the explicit close action Principle IV does require is
   * present in the overlay.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const onKeyDown = (keyEvent: ReactKeyboardEvent<HTMLElement>) => {
    if (!open || keyEvent.key !== 'Escape') return
    keyEvent.stopPropagation()
    close()
  }

  const onSelect = async (event: Event) => {
    setFailure(null)

    // FR-114's sibling: re-selecting the active conference is a no-op, and closing without a
    // request is the honest response to "no change requested".
    if (active.status === 'ready' && active.event.id === event.id) {
      close()
      return
    }

    setSwitching(event.id)
    try {
      await switchTo(event.id)
      close()
    } catch (error) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // FR-112, FR-115 — the previous conference stays active, and the interface says the
      // change did not take effect. Two causes get two explanations, because they call for two
      // different responses from the attendee.
      // ─────────────────────────────────────────────────────────────────────────────────────
      setFailure(
        error instanceof OfflineError
          ? 'Switching conference needs a connection. You are still in your previous conference — try again once you reconnect.'
          : 'That conference could not be opened. You are still in your previous conference.',
      )
      close()
    } finally {
      setSwitching(null)
    }
  }

  const label =
    active.status === 'ready'
      ? `${active.event.name} · ${active.event.location}`
      : 'Your conference'

  // FR-117 — loading is a declared state, not a blank space where the control will be.
  if (events.status === 'loading') {
    return <Loading label="Loading your conferences…" />
  }

  // FR-117 — registered for none. Identified, with no choice offered.
  if (events.status === 'empty' || events.status === 'failed') {
    return (
      <p className="truncate text-sm text-text-muted">
        {events.status === 'empty' ? 'No conferences yet' : 'Conferences unavailable'}
      </p>
    )
  }

  /**
   * FR-114 — **exactly one conference: identify it, and offer no choice.**
   *
   * A menu containing a single item that is already selected is a control that cannot do
   * anything, and offering it invites the attendee to try.
   */
  if (events.data.length === 1) {
    // FR-110 requires the location as well as the name. FR-114 removes the *choice* for a
    // single registration, not the identification — an attendee with one conference is exactly
    // the person with no other way to see where it is.
    return (
      <p className="min-w-0 truncate text-sm text-text-primary" data-testid="event-name">
        <span className="font-medium">{events.data[0]?.name}</span>
        <span className="text-text-muted"> · {events.data[0]?.location}</span>
      </p>
    )
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={onKeyDown}
        // The accessible name says what the control does AND what is currently chosen, so a
        // screen-reader user does not have to open it to find out where they are (FR-116).
        aria-label={`Conference: ${label}. Change conference`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="flex min-w-0 max-w-full items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 text-sm font-medium text-text-primary"
      >
        <span className="truncate">
          {active.status === 'ready' ? active.event.name : 'Conference'}
          {active.status === 'ready' && (
            // Visible from the tablet band up. Hidden at mobile, where the row already carries
            // the product name and the sign-out control and 320px must not scroll (FR-020) —
            // the accessible name below still carries it at every width.
            <span className="hidden text-text-muted tablet:inline"> · {active.event.location}</span>
          )}
        </span>
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0" />
      </button>

      {open && (
        <div
          /*
            T059 — one control, three presentations, selected in CSS so no width is read in
            JavaScript. Mobile is a full-width overlay with touch-sized targets; tablet and
            desktop are an anchored menu. Nothing here sets a fixed width, so 320px is the
            mobile layout working rather than a fourth case (FR-020).
          */
          className={[
            'z-20 rounded-md border border-border-subtle bg-surface-raised py-1 shadow-card',
            'fixed inset-x-2 top-14',
            'tablet:absolute tablet:inset-x-auto tablet:top-full tablet:right-0 tablet:mt-1 tablet:w-80',
          ].join(' ')}
        >
          <div className="flex items-center justify-between px-3 py-2 tablet:hidden">
            <span className="text-sm font-medium text-text-primary">Choose a conference</span>
            {/* A clear close action, required for anything modal (Principle IV). */}
            <button
              type="button"
              onClick={() => close()}
              onKeyDown={onKeyDown}
              aria-label="Close conference list"
              className="inline-flex h-11 w-11 items-center justify-center rounded-sm"
            >
              <X aria-hidden="true" size={18} strokeWidth={1.75} />
            </button>
          </div>

          {/*
            ─────────────────────────────────────────────────────────────────────────────────
            **`role="menu"` sits on the list, and every `li` carries `role="none"`.**

            A `menu` must contain its `menuitem*` children directly. Wrapping them in a plain
            `<ul>`/`<li>` — which is the natural markup, and what this was first written as —
            puts list roles between the menu and its items, and axe rejects it on two counts:
            `aria-required-children` on the menu and `aria-required-parent` on each item. The
            list semantics are removed rather than the list element, so the markup stays a list
            for anything that does not understand ARIA.

            The container above deliberately does **not** carry the role: the heading and the
            close button are part of the overlay, not items of the menu.
            ─────────────────────────────────────────────────────────────────────────────────
          */}
          <ul
            id={menuId}
            role="menu"
            aria-label="Choose a conference"
            onKeyDown={onKeyDown}
            // Focusable so the menu can receive Escape before focus reaches an item — an
            // interactive role that cannot be focused is unreachable.
            tabIndex={-1}
            className="grid"
          >
            {events.data.map((event) => {
              const isActive = active.status === 'ready' && active.event.id === event.id
              return (
                <li key={event.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={switching !== null}
                    onClick={() => void onSelect(event)}
                    /* Touch-sized at mobile widths (FR-018). */
                    className="flex w-full min-h-(--spacing-touch-target) items-center gap-2 px-3 py-2 text-left text-sm text-text-primary"
                  >
                    <Check
                      aria-hidden="true"
                      size={14}
                      strokeWidth={2}
                      className={isActive ? 'shrink-0' : 'shrink-0 opacity-0'}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{event.name}</span>
                      <span className="block truncate text-text-muted">{event.location}</span>
                    </span>
                    {switching === event.id && <span className="ml-auto text-text-muted">…</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {failure && (
        <p
          role="alert"
          className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-warning-500 bg-warning-100 px-3 py-2 text-sm text-text-body"
        >
          {failure}
        </p>
      )}
    </div>
  )
}
