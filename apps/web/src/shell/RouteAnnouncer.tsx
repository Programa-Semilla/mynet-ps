import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

import { destinationFor } from '../app/navigation.js'

/**
 * Announces the destination when it changes (FR-021, FR-022, SC-004).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A single-page navigation is silent.** Following a link in a traditional site loads a new
 * document, and assistive technology announces its title. Changing a route swaps some DOM and
 * says nothing — so a screen-reader user activates "Agenda", hears nothing at all, and has no
 * way to know whether anything happened.
 *
 * `aria-current` on the navigation link is not a substitute. It describes the link, and it is
 * only encountered by somebody who has navigated back to the rail to look for it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Deliberately **not** focus management. Moving focus to the heading on every route change is
 * the other common approach, and it fights the attendee: it discards their place in the page
 * and, on a rail that is always present, it makes tabbing through destinations jump the
 * viewport on every arrow press. A polite live region tells them what happened and leaves them
 * where they are.
 */
export const RouteAnnouncer = () => {
  const { pathname } = useLocation()
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const destination = destinationFor(pathname)
    // The empty first render matters: a live region that already has content when it is
    // inserted announces nothing on the first change in some screen readers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnnouncement(destination ? `${destination.label}, ${destination.purpose}` : 'Page not found')
  }, [pathname])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Available to assistive technology and invisible on screen. `display: none` and
      // `visibility: hidden` would remove it from the accessibility tree along with the pixels,
      // which is why the clip technique exists rather than either of those.
      className="sr-only"
    >
      {announcement}
    </div>
  )
}
