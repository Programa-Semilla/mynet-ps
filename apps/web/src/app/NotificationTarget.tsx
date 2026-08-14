import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useActiveEventContext } from './active-event.js'

/**
 * **A notification about another conference has to switch to it before it can open anything**
 * (FR-1029, FR-1034b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS EXISTS: THE ACTIVE CONFERENCE IS SERVER-SIDE STATE, AND A NOTIFICATION COULD NOT
 * REACH IT.**
 *
 * `payloadFor` sends `eventId`, and the service worker stored it in `notification.data` — and then
 * `notificationclick` navigated to `/agenda/<sessionId>` and threw it away. Every address in this
 * product resolves against the attendee's **active** conference, which lives on the server and
 * changes only through the event switcher.
 *
 * So for an attendee registered for two conferences — which the switcher makes an ordinary state,
 * not an edge case — a cancellation in conference A while B was active behaved like this: the
 * notification arrived correctly, tapping it went to `/agenda/<sessionA>`, `SessionPanel` looked
 * that id up in **B's** programme, found nothing, and rendered *"That session is not available to
 * you."* FR-1029 requires activating it to **open that session**; FR-1034b requires the coalesced
 * one to land on Agenda "where the changed rows carry their individual markers", and B's rows
 * carry none.
 *
 * Worse, the marker was then cleared for the change they never saw — the panel's `markViewed`
 * effect fired regardless of what was on screen. That half is fixed in `SessionPanel` itself; this
 * is the half that makes the address resolvable in the first place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **A QUERY PARAMETER, CONSUMED ONCE AND REMOVED.**
 *
 * The service worker cannot switch the conference itself — that is a server write behind a
 * repository — so it puts the conference in the URL and the application acts on it. Three
 * properties matter:
 *
 *   - **Removed after it is consumed**, with `replace`, so the parameter is not in history. A
 *     back-navigation must not re-switch somebody's conference, and a shared or reloaded URL must
 *     not either.
 *   - **Attempted once per value**, tracked in a ref. `switchTo` reloads the active event, which
 *     re-renders this, and a second attempt would be a write loop.
 *   - **A no-op when it names the conference already active**, which is the common case: most
 *     notifications concern the conference the attendee is already in.
 *
 * A failed switch is deliberately silent. The attendee is looking at Agenda for their current
 * conference, which is a coherent screen — and a banner explaining that a notification could not
 * change their conference would be a failure message about something they did not ask for.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const NotificationTarget = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, switchTo } = useActiveEventContext()

  /** Values already acted on, so a re-render cannot switch twice. */
  const handled = useRef(new Set<string>())

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('event')
    if (!requested) return
    if (handled.current.has(requested)) return
    handled.current.add(requested)

    // Strip the parameter first and unconditionally: whether or not the switch is needed or
    // succeeds, the URL must not keep an instruction that a reload would replay.
    const cleaned = `${location.pathname}${location.hash}`
    void navigate(cleaned, { replace: true })

    const active = state.status === 'ready' ? state.event.id : null
    if (active === requested) return

    void switchTo(requested).catch(() => {
      // Silent by design — see the header. The attendee keeps the conference they were in.
    })
  }, [location.search, location.pathname, location.hash, navigate, state, switchTo])

  return null
}
