import { type ReactNode } from 'react'
import { NavLink } from 'react-router'

import { ADMIN_PRODUCT_NAME } from '../branding.js'
import { useAdminSession } from '../session.js'

/**
 * T045, T070–T073 (013) — the administrative shell (FR-922, FR-924, FR-925).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE LAYOUTS, AND THE MIDDLE ONE IS THE RISK THIS FEATURE ESCALATES MORE THAN ANY BEFORE
 * IT.**
 *
 * Register entry 4 — desktop and tablet layouts have never been reviewed by the client — is an
 * open question, and the only approved visual reference in this project is a **mobile-only
 * 390×844 prototype frame**. The administrative product is desk work: it lives predominantly in
 * the width band nobody has ever looked at.
 *
 * 008 proved the distinction between Principle IV's *compliance* gate and its *design* review is
 * not academic. The first human to open a dialog found it in the top-left corner of the viewport,
 * having passed 135 e2e tests, five review agents and CodeRabbit — because every one of them
 * checks behaviour and none of them looks at where a thing is.
 *
 * So: the layouts follow the constitution's responsive constraint literally (persistent rail at
 * desktop, reduced rail at tablet, bottom navigation at mobile with touch-sized controls),
 * `e2e/responsive.spec.ts` measures dialog position at every width, and **neither substitutes for
 * the owner looking at it** (quickstart scenario 8).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **No content or primary action requires horizontal scrolling** at any width — the constitution's
 * one absolute responsive rule. Wide content here is the report queue, which stacks rather than
 * scrolls sideways.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-4 — THE THIRD LAYOUT, AND WHY THE SENTENCE ABOVE WAS FALSE WHEN IT WAS WRITTEN.**
 *
 * This shell shipped with **two** layouts where Principle IV requires three, and constitution
 * v5.4.0's R3 — which ratified MyNet's desktop and tablet layouts by owner decision — **carved
 * this file out of that ratification as a defect**, on the ground that fiat may close a judgement
 * but cannot make a non-compliance compliant. What was wrong:
 *
 *   - Below 768px the site's only navigation was `flex gap-1 overflow-x-auto` — a horizontally
 *     scrolling strip. Principle IV's mobile layout calls for bottom navigation and forbids any
 *     primary action requiring horizontal scrolling, and a destination you have to swipe to reach
 *     is a primary action requiring horizontal scrolling.
 *   - The rail was labelled at `md:w-56` from 768px up, which is a labelled rail rather than a
 *     *reduced* one, and it changed at `md`/`lg` — Tailwind's own 768/1024 defaults — rather than
 *     at this project's 768/1280 bands.
 *
 * **The end-to-end sweep could not see either, by construction.** `horizontalOverflow` in
 * `e2e/responsive.spec.ts` measures `documentElement.scrollWidth - clientWidth`, and an inner
 * `overflow-x-auto` container exists precisely to hold that at zero. The administrative sweep
 * passed and would have kept passing. The assertion that replaces it measures **this navigation's
 * own `scrollWidth` against its own `clientWidth`** (FIX-403), which is the one measurement an
 * inner scroll container cannot mask.
 *
 * The bands are now the project's, and they were available all along: `theme/index.css` imports
 * MyNet's token file, so `tablet:` and `desktop:` have always been in this application's
 * stylesheet. Nothing used them. That is the whole origin of the divergence and it is what made
 * the fix cheap.
 *
 *     mobile   width < 768      bottom navigation, wrapping, sticky
 *     tablet   768 ≤ w < 1280   reduced rail, 11rem, labels retained
 *     desktop  width ≥ 1280     persistent rail, --spacing-rail-desktop, labels
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT THIS DELIBERATELY DOES NOT DO, AND IT IS ONE LINE FROM DOING IT (FIX-404).**
 *
 * R3 **ratified** the 768–1279px divergence between the two products: MyNet shows an icon-only
 * rail in that band (`TabletRail`), this product shows a labelled one, and that difference is now
 * a *decision* rather than an oversight. So the tablet rail here is **reduced in width and type
 * and keeps its labels**. Narrowing it to `--spacing-rail-tablet` and dropping to icons would
 * look like tidying two products into agreement and would in fact be **reopening a ratified
 * judgement as if it were a defect**. What was defective is the *absence of a third layout*, not
 * the fact that the two products differ where both have one.
 *
 * For the same reason no test in this repository may assert that the two products' rails match in
 * that band. `e2e/responsive.spec.ts` asserts the opposite property — that this rail is still
 * *labelled* at 900px — which pins the ratified divergence in place instead of erasing it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** The destinations, declared once. `routes.tsx` maps them; nothing names an address twice. */
export interface AdminDestination {
  readonly to: string
  readonly label: string
  /** Platform tier only. A conference organizer is rendered no entry at all (FR-925). */
  readonly platformOnly: boolean
}

export const ADMIN_DESTINATIONS: readonly AdminDestination[] = [
  { to: '/', label: 'Overview', platformOnly: false },
  { to: '/conferences', label: 'Conferences', platformOnly: false },
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **The report queue is platform-tier only, and an organizer is shown no entry for it.**
  //
  // FR-925 is the rendering half of decision 35's first condition: a conference organizer may not
  // read reports **at all**. The server refuses them with a 404 identical to a route that does not
  // exist (`requirePlatformOperator`), and this is what stops them being offered a door that
  // answers "there is nothing here" — which would tell them the queue exists.
  //
  // `tier-controls.test.tsx` asserts the absence; `admin-tier-boundary.test.ts` asserts the server
  // refusal **by direct address entry**. Two tests, because hiding a control an attacker can still
  // call is not security and refusing a call while showing the button is not usability.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  { to: '/reports', label: 'Reports', platformOnly: true },
  { to: '/operators', label: 'Operators', platformOnly: true },
  // 014 tranche 2 — the vocabulary (FR-1089). Platform-tier only for the same shape of reason
  // as the two above: product-wide reference data no conference owns, so an organizer is
  // rendered no entry at all, and the server refuses their direct attempts with the same 404 a
  // nonexistent route gives (SC-1020). Mirrored by hand in `e2e/support/destinations.ts`, and
  // `admin-destinations-mirror.test.ts` is what keeps the two copies from drifting (T199).
  { to: '/vocabulary', label: 'Vocabulary', platformOnly: true },
]

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'rounded-lg px-2 py-2 text-xs font-medium transition-colors',
    // 44px minimum target at every width — the constitution's touch-sized-controls constraint,
    // applied to the rail as well as to the mobile bar, because a rail is touched on a tablet.
    'min-h-11 flex h-full items-center',
    // ─────────────────────────────────────────────────────────────────────────────────────
    // Mobile: a centred chip in the bottom bar. Tablet and desktop: a row in the rail, read
    // left to right like a list, which is what a rail is.
    //
    // **`break-words` is the structural half of FIX-402** and the arithmetic below is only the
    // reassurance. The widest label is "Conferences" — about 66px at this size — inside a chip
    // that is never narrower than 6rem (see the `basis-24` note), so it fits and the bar never
    // needs to scroll. But a *future* longer label must not be able to push the bar sideways
    // silently, and `overflow-wrap: break-word` is what makes that impossible rather than
    // unlikely: the word breaks before the container overflows. It costs nothing today,
    // because nothing today comes close.
    // ─────────────────────────────────────────────────────────────────────────────────────
    'justify-center break-words text-center',
    'tablet:justify-start tablet:px-3 tablet:text-left',
    'desktop:text-sm',
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`coral-600`, NOT `coral-500`, and the difference is an accessibility failure.**
    //
    // `tokens.css` splits the accent in two for exactly this: `coral-500` is the approved
    // prototype coral and is correct for icons, borders and text *on* navy, but it is only
    // **3.27:1** behind `text-inverse` — so text on a coral-500 surface fails AA. `coral-600`
    // is 5.04:1 and is the one for an accent surface that carries text.
    //
    // This was `coral-500`, which is the mistake that split exists to make visible.
    // `apps/web` reaches for it nowhere; this rail did, and MyNet's accessibility scan never
    // saw it because that scan does not visit this origin. `e2e/admin-accessibility.spec.ts`
    // is what caught it and is what keeps it caught.
    // ─────────────────────────────────────────────────────────────────────────────────────
    isActive
      ? 'bg-coral-600 text-text-inverse'
      : 'text-navy-200 hover:bg-navy-700 hover:text-text-inverse',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-300',
  ].join(' ')

export const AdminShell = ({ children }: { readonly children: ReactNode }) => {
  const { state, signOut } = useAdminSession()

  const identity = state.status === 'signed-in' ? state.identity : null
  const destinations = ADMIN_DESTINATIONS.filter(
    (destination) => !destination.platformOnly || identity?.tier === 'platform',
  )

  return (
    <div className="flex min-h-dvh flex-col bg-cream-100 text-text-body tablet:flex-row">
      {/*
        The navigation. **A persistent rail at desktop, a reduced rail at tablet, a bottom bar at
        mobile** — three layouts from one element and the project's own breakpoints.

        One element with responsive classes rather than three components, which is the arrangement
        this shell has had since 013 and is kept deliberately. `apps/web` renders three (`MobileNav`,
        `TabletRail`, `DesktopRail`) and pays for them with a test asserting exactly one is
        presented at any width — because three trees can disagree about which destinations exist,
        and here they would also have to apply the tier filter three times. One element cannot
        disagree with itself: at every width there is exactly one navigation landmark, one tab
        order and one filtered list, with no CSS required to make that true.

        **The cost of the choice is that the band cannot be named in a `data-*` attribute**, the
        way `apps/web` names its three. So the end-to-end assertion identifies each layout by
        measuring it — full-width and bottom-anchored, or a narrow left column of one width, or a
        narrow left column of a wider one. That is the better assertion anyway: an attribute can
        say "tablet" while the layout is anything at all.
      */}
      <nav
        aria-label={`${ADMIN_PRODUCT_NAME} sections`}
        className={[
          'bg-navy-800',
          // ───────────────────────────────────────────────────────────────────────────────
          // Mobile: bottom navigation.
          //
          // `order-last` puts it under the workspace while leaving it **first in the DOM**, so a
          // keyboard or screen-reader user still meets the navigation before the page's content
          // — the ordering a rail wants, kept at the width where the rail is not on screen. The
          // consequence is deliberate: **the tab order is identical at all three widths**, and
          // the alternative (DOM-last, as `apps/web`'s `MobileNav` is) would put the rail after
          // the whole workspace in the tab order at the two widths where it is a rail.
          //
          // **`sticky`, not `fixed`, and the difference is a class of defect.** A fixed bar is
          // out of flow, so it sits on top of whatever the last content happens to be and every
          // scrolling ancestor has to reserve padding for it by hand; `apps/web` does exactly
          // that and `AppShell` carries the `pb-[calc(...)]` to prove it. A sticky element keeps
          // its place in the flow, so the workspace can never end underneath it, and it is still
          // pinned to the bottom of the viewport while the page scrolls.
          // ───────────────────────────────────────────────────────────────────────────────
          'sticky bottom-0 z-10 order-last border-t border-navy-700',
          // Tablet: the reduced rail. Narrower and smaller-typed than desktop's, and **still
          // labelled** — see the FIX-404 note in this file's header before changing that.
          'tablet:static tablet:order-first tablet:w-44 tablet:shrink-0 tablet:border-t-0 tablet:border-r',
          // Desktop: the persistent rail, at the shared token the attendee client's rail uses.
          'desktop:w-(--spacing-rail-desktop)',
        ].join(' ')}
      >
        {/*
          The mark, as an image beside live text — never a raster lockup, and never replacing an
          accessible name (decision 30). Coral on the navy rail, mirroring `DesktopRail` in the
          attendee client.

          `alt=""` because the product name is right beside it: a screen reader announcing
          "MyNet logo, MyNet Administration" reads the brand twice.

          **Hidden at mobile, because the bottom bar is no place for a masthead.** It moves to the
          top bar at that width rather than disappearing — see the note there.
        */}
        <div className="hidden items-center gap-2 px-3 py-4 tablet:flex desktop:px-4">
          <img
            src="/brand/mark-coral.png"
            alt=""
            width={28}
            height={28}
            className="h-6 w-auto desktop:h-7"
          />
          <span className="text-xs leading-tight font-semibold text-text-inverse desktop:text-sm">
            {ADMIN_PRODUCT_NAME}
          </span>
        </div>

        {/*
          **`flex-wrap` is what replaced `overflow-x-auto`, and it is a structural answer rather
          than a tuned one.** The strip it replaces did not fail because five labels are slightly
          too wide for 320px; it failed because a scroll container answers "too many destinations"
          by hiding them, at every width, however many there are. A wrapping row answers it by
          taking a second line — so the bar cannot scroll sideways no matter what the tier filter
          above yields, which is the property FIX-402 asks for.

          `basis-24` (6rem) is the wrapping threshold rather than the width: each item grows to
          fill its row. Five destinations wrap 3+2 at 320px and 4+1 at 414px, and sit on one row
          from about 600px up. A smaller basis would fit four across at 360px with about 83px
          each, which "Conferences" very nearly does not fit — and *very nearly* is the failure
          mode this bar is being repaired for.

          No icons, and that is a decision rather than an omission. 013 chose labels for these
          five destinations and there is no administrative icon vocabulary to draw on; inventing
          five glyphs here would be a design decision this repair has no mandate for, with
          register entry 4 open.
        */}
        <ul className="flex flex-wrap items-stretch gap-1 px-2 py-2 tablet:flex-col tablet:flex-nowrap tablet:pb-4">
          {destinations.map((destination) => (
            <li key={destination.to} className="min-w-0 flex-1 basis-24 tablet:basis-auto">
              <NavLink to={destination.to} end={destination.to === '/'} className={linkClass}>
                {destination.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The contextual top bar. Carries the tier indicator, which FR-924 requires to be visible
          at all times — an organizer and a platform operator see different surfaces, and somebody
          who cannot tell which they are cannot tell whether a missing control is a permission or
          a bug.
        */}
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {/*
              **The mark at mobile, where the rail's masthead is not on screen.** Navy on cream
              here and coral on the navy rail — one mark, two colourways (decision 30), the same
              pairing `SignIn.tsx` uses.

              `alt=""`: it is decorative, and the product name still reaches assistive technology
              twice over — the document title is `ADMIN_PRODUCT_NAME` and the navigation landmark
              is labelled with it. So this is a mark *beside* an accessible name, not one standing
              in for it. It is the mark alone rather than mark-plus-wordmark because at 320px this
              row already carries a name, a tier badge and the sign-out control, and FR-020 is not
              negotiable.
            */}
            <img
              src="/brand/mark-navy.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-auto shrink-0 tablet:hidden"
            />

            {identity ? (
              <p className="min-w-0 truncate text-sm">
                <span className="font-semibold text-text-primary">{identity.displayName}</span>{' '}
                <span
                  className="ml-1 rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-700"
                  // Announced as a labelled value rather than as a bare word, so a screen-reader
                  // user gets "Tier: platform operator" rather than an unattached noun.
                  aria-label={`Tier: ${identity.tier === 'platform' ? 'platform operator' : 'conference organizer'}`}
                >
                  {identity.tier === 'platform' ? 'Platform operator' : 'Conference organizer'}
                </span>
              </p>
            ) : null}
          </div>

          {identity ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            >
              Sign out
            </button>
          ) : null}
        </header>

        {/*
          `min-w-0` on the column above and here is what keeps wide content — a report note, a
          long conference name — from forcing the page to scroll sideways. The constitution's one
          absolute responsive rule: no content or primary action may require horizontal scrolling.
        */}
        <main className="min-w-0 flex-1 px-4 py-6 tablet:px-6 desktop:px-8">{children}</main>
      </div>
    </div>
  )
}
