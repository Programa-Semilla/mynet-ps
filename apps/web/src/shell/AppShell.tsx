import { Outlet } from 'react-router'

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
/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SHELL HAS A DEFINITE HEIGHT, AND THAT IS WHAT MAKES `overflow` MEAN ANYTHING BELOW IT.**
 *
 * This was `min-h-screen`, and a *minimum* height is not a height: every descendant sized to its
 * content, so `flex-1` grew into a box nobody had bounded and `overflow-y-auto` never had an
 * overflow to act on. The page simply became taller than the window and the reader scrolled it.
 *
 * That is invisible on most destinations and it shipped a defect on one. `Thread.tsx` is built
 * as a flex column — history with `min-h-0 flex-1 overflow-y-auto`, composer after it — the
 * arrangement that pins the send control to the bottom and scrolls the history behind it. With
 * no definite height anywhere above, that chain never resolved: the history grew instead of
 * scrolling, and the send control went wherever the text above it left room. On the fonts this
 * repository was developed against it landed 28px inside a 420px viewport and every gate passed;
 * on CI's fonts the same layout put it 33px **outside**, and `e2e/responsive.spec.ts` caught it
 * twice, deterministically. 016's `max-h-[30dvh]` composer cap bounds the *field* and could
 * never bound the heading, the top bar and the empty-state prompt stacked above it.
 *
 * **Bounding it here rather than inside Messages is deliberate, and the alternative was tried.**
 * A route-local `calc(100dvh - …)` has to name the chrome above itself — top bar, offline
 * banner, the destination's own heading — and that quantity is font-dependent, which is the
 * property that caused the bug. Over-subtracting does not fail safe: it shrinks the box below
 * the composer's own minimum and the overflow simply moves inside, measured at 5px *outside* the
 * viewport on the first attempt. Measuring instead is not available either — reading
 * `innerHeight` is asking the browser about the viewport, which `useDisplayed`'s header records
 * as needing a capability and an amendment, the way US5's `matchMedia` cost v5.1.0.
 *
 * So the height is declared once, at the only place that knows it without asking: the shell.
 * `dvh` rather than `vh` for the reason `Composer.tsx` already gives — `vh` is measured with
 * mobile browser chrome retracted, so it is taller than what the reader can actually see.
 *
 * **Every destination now scrolls inside `main` rather than scrolling the page.** The rail and
 * the top bar stay put, which is what a workspace shell should do, and no destination can grow
 * past the fold again. `min-h-0` on the column and on `main` is load-bearing: a flex item's
 * default `min-height: auto` refuses to shrink below its content, which would reinstate exactly
 * the unbounded growth this removes — the vertical twin of the `min-w-0` note below.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const AppShell = () => (
  <div className="flex h-dvh overflow-hidden bg-surface">
    {/* Nothing visible. Tells a screen-reader user that the destination changed (FR-022). */}
    <RouteAnnouncer />

    <DesktopRail />
    <TabletRail />

    {/*
      `min-w-0` is load-bearing for FR-020: a flex child defaults to `min-width: auto`, which
      refuses to shrink below its content and pushes the page into horizontal scrolling at
      narrow widths. This is the single most common cause of the overflow SC-006 forbids.
    */}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TopBar />
      {/*
        Above the workspace and below the bar, so it is the first thing read after "where am I"
        and cannot be scrolled past while the attendee wonders why nothing loads (FR-052).
      */}
      <OfflineBanner />

      <main
        className={[
          // `min-h-0` lets it shrink to the bounded column; `overflow-y-auto` is where the page's
          // scrolling now happens. See this file's header for why the height is definite at all.
          'mx-auto w-full min-h-0 flex-1 overflow-y-auto',
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

    <MobileNav />
  </div>
)
