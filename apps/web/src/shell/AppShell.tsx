import { Outlet } from 'react-router'

import { NotificationTarget } from '../app/NotificationTarget.js'

import { DesktopRail } from './DesktopRail.js'
import { MobileNav } from './MobileNav.js'
import { OfflineBanner } from './OfflineBanner.js'
import { RouteAnnouncer } from './RouteAnnouncer.js'
import { TabletRail } from './TabletRail.js'
import { TopBar } from './TopBar.js'

/**
 * T076, T077 — the responsive shell (FR-016, FR-017, FR-018, FR-019, FR-020).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Exactly one navigation form applies at any width, and the selection is made in CSS.**
 *
 * All three forms are rendered; each is `display: none` outside its band, which removes it from
 * the page, the tab order, *and* the accessibility tree. So a screen reader finds one navigation
 * landmark at every width, not three.
 *
 * The bands are half-open (research.md D16, tokens.css), so no width matches two forms and no
 * width matches none:
 *
 *     mobile   width < 768      MobileNav     flex tablet:hidden
 *     tablet   768 ≤ w < 1280   TabletRail    hidden tablet:flex desktop:hidden
 *     desktop  width ≥ 1280     DesktopRail   hidden desktop:flex
 *
 * Selecting in JavaScript instead would mean feature code reading the viewport through a browser
 * API (FR-045), and would introduce a first-paint flash at whichever width guessed wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const AppShell = () => (
  <div className="flex min-h-screen bg-surface">
    {/* Nothing visible. Tells a screen-reader user that the destination changed (FR-022). */}
    <RouteAnnouncer />

    <DesktopRail />
    <TabletRail />

    {/*
      `min-w-0` is load-bearing for FR-020: a flex child defaults to `min-width: auto`, which
      refuses to shrink below its content and pushes the page into horizontal scrolling at
      narrow widths. This is the single most common cause of the overflow SC-006 forbids.
    */}
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar />
      {/*
        Above the workspace and below the bar, so it is the first thing read after "where am I"
        and cannot be scrolled past while the attendee wonders why nothing loads (FR-052).
      */}
      <OfflineBanner />

      <main
        className={[
          'mx-auto w-full flex-1',
          // T077 — a readable maximum measure. Without it a 2560px display stretches body text
          // across the full width and it stops being readable at any font size.
          'max-w-(--spacing-measure-max)',
          // Clears the fixed mobile bottom navigation, which would otherwise sit on top of the
          // last of the content. No effect once the bar is hidden.
          'pb-[calc(var(--spacing-bottom-nav)+var(--spacing-dev-legend))] tablet:pb-(--spacing-dev-legend)',
        ].join(' ')}
      >
        <Outlet />
      </main>
    </div>

    {/*
      014 — consumes the `?event=` a notification carries, switching the active conference before
      the address below it resolves (FR-1029, FR-1034b). Renders nothing. Mounted in the shell
      rather than in a destination because a notification may land on any of them.
    */}
    <NotificationTarget />

    <MobileNav />
  </div>
)
