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
 * desktop, reduced rail at tablet, bottom-free single column at mobile with touch-sized
 * controls), `e2e/responsive.spec.ts` measures dialog position at every width, and **neither
 * substitutes for the owner looking at it** (quickstart scenario 8).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **No content or primary action requires horizontal scrolling** at any width — the constitution's
 * one absolute responsive rule. Wide content here is the report queue, which stacks rather than
 * scrolls sideways.
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
]

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    // 44px minimum target at every width — the constitution's touch-sized-controls constraint,
    // applied to the rail as well as to the mobile strip, because a rail is touched on a tablet.
    'min-h-11 flex items-center',
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
    <div className="min-h-dvh bg-cream-100 text-text-body md:flex">
      {/*
        The rail. **Persistent at desktop, reduced at tablet, a horizontal strip at mobile.**

        One element with responsive classes rather than three components: the alternative is three
        navigation trees that can disagree about which destinations exist, and the tier filter
        above would then have to be applied three times.
      */}
      <nav
        aria-label={`${ADMIN_PRODUCT_NAME} sections`}
        className="bg-navy-800 md:min-h-dvh md:w-56 md:shrink-0 lg:w-64"
      >
        <div className="flex items-center gap-2 px-4 py-4">
          {/*
            The mark, as an image beside live text — never a raster lockup, and never replacing an
            accessible name (decision 30). Coral on the navy rail, mirroring `DesktopRail` in the
            attendee client.

            `alt=""` because the product name is right beside it: a screen reader announcing
            "MyNet logo, MyNet Administration" reads the brand twice.
          */}
          <img src="/brand/mark-coral.png" alt="" width={28} height={28} className="h-7 w-auto" />
          <span className="text-sm font-semibold text-text-inverse">{ADMIN_PRODUCT_NAME}</span>
        </div>

        <ul className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {destinations.map((destination) => (
            <li key={destination.to} className="shrink-0 md:shrink">
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
          ) : (
            <span />
          )}

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
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
