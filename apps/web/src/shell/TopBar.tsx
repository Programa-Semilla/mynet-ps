import { OfflineError } from '@mynet/data'
import { useAuthGateway } from '@mynet/platform'
import { LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'

import { PRODUCT_NAME } from '../app/branding.js'
import { destinationFor } from '../app/navigation.js'
import { useAuth } from '../auth/useAuth.js'
import { BrandMark } from './BrandMark.js'
import { EnvironmentMarker } from './EnvironmentMarker.js'
import { EventSwitcher } from './EventSwitcher.js'

/**
 * T061, T073 — the contextual top bar (FR-016, FR-032).
 *
 * "Contextual" means it says where the attendee is. At desktop and tablet widths the product
 * name lives in the rail, so the bar carries the current destination; at mobile widths there is
 * no rail, so it carries the product name instead (FR-018's "compact header").
 *
 * Shows the display name the server returned for *this* session. The prototype greeted
 * "Good morning, Sarah" regardless of who was looking; CLAUDE.md records that as a prototype
 * artifact made moot by real authentication, and this is where it stopped being true.
 *
 * There is deliberately **no notification bell**. The prototype header shows one with an unread
 * dot, but notifications are out of product scope until a recorded decision brings them in
 * (constitution Open Question 10). An affordance for a capability that does not exist is a
 * promise the product cannot keep.
 */
export const TopBar = () => {
  const { attendee, markSignedOut } = useAuth()
  const auth = useAuthGateway()
  const { pathname } = useLocation()

  const current = destinationFor(pathname)

  const [signOutFailure, setSignOutFailure] = useState<string | null>(null)

  const onSignOut = async () => {
    setSignOutFailure(null)

    try {
      await auth.signOut()
      markSignedOut()
    } catch (error) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Offline is not a sign-out.** Clearing local state regardless used to be the whole of
      // this handler, and it did the one thing FR-053 names outright: an action requiring the
      // server, attempted offline, appeared to have succeeded. The attendee was returned to the
      // sign-in screen while `revoked_at` was still null and the cookie was still live on the
      // device — the opposite of FR-027, which exists precisely because forgetting a token is
      // not the same as revoking it.
      //
      // Someone signing out on a shared or borrowed device is exactly the person who must not
      // be told it worked when it did not.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (error instanceof OfflineError) {
        setSignOutFailure(
          'Signing out needs a connection. You are still signed in on this device — try again once you reconnect.',
        )
        return
      }

      // The server refused, which means it answered — the session is already unusable, or soon
      // will be. Leaving the interface claiming "signed in" would be the worse of the two errors.
      markSignedOut()
    }
  }

  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-raised px-4 py-3 tablet:gap-3 tablet:px-6">
        {/*
        Two labels, one visible at a time — the same CSS-only band selection the navigation uses,
        so neither is announced twice.

        `shrink` on both, because at 320px this label, the conference switcher, the attendee's
        name and the sign-out control share one row. Something has to give, and it must be a
        label rather than a control (FR-020, SC-006).
      */}
        <div className="flex min-w-0 shrink items-center gap-2">
          {/*
            T039, T040 (010) — the mark, in the **navy** colourway for this raised surface, at
            the mobile and tablet bands only (FR-820b, FR-823, FR-824).

            Not FR-822: that one is the *desktop rail's* requirement, and this element is defined
            against it by `desktop:hidden`. The citations in this codebase are a navigable index —
            people grep them to find every site bound by a requirement — so naming the wrong one
            sends the search to the wrong file.

            `desktop:hidden` is what stops two marks appearing at once: above 1280px the rail
            carries it, six centimetres to the left, and both showing is worse than neither.
            The band is chosen in **CSS, never in JavaScript** (FR-827) — `display: none` takes
            the hidden form out of the accessibility tree and the tab order as well as off the
            page, and reading the viewport in feature code is a direct platform access that
            `mynet/no-direct-platform-access` forbids.

            It is `shrink-0` at a fixed 24px while the label beside it keeps `shrink truncate`,
            so at 320px the **label** yields and the conference switcher, the profile control and
            the sign-out control are all untouched — which is the rule this bar's own comment
            already sets (FR-825).
          */}
          <BrandMark colourway="navy" className="h-6 desktop:hidden" />

          <span className="shrink truncate font-display text-lg font-semibold text-text-primary tablet:hidden">
            {PRODUCT_NAME}
          </span>
          <span className="hidden shrink truncate font-display text-lg font-semibold text-text-primary tablet:inline">
            {current?.label ?? 'Not found'}
          </span>

          {/*
            011 T076 — FR-828. **Inside this group, not a sibling of it.** The header is
            `justify-between`, so a third top-level child would be spread into the middle of the
            bar — floating between the brand and the attendee's controls, attached to neither.
            Beside the label is where it belongs and what its own requirement describes.

            Not a band above the header either: a band costs vertical space on every screen, and
            mobile is where Principle III puts a success criterion on the first viewport.

            It renders to nothing in a production build — the guard is a build-time literal, so
            the element is not in the bundle at all rather than hidden inside it.
          */}
          <EnvironmentMarker />
        </div>


        {attendee && (
          <div className="flex min-w-0 shrink items-center gap-2 tablet:gap-3">
            {/*
              002 — the conference switcher, at all three widths (FR-110, FR-111, T059). It
              carries its own loading, single-conference and failure presentations; the top bar
              only decides where it sits.
            */}
            <EventSwitcher />

            {/*
              ─────────────────────────────────────────────────────────────────────────────
              T075 (004) — **the attendee's own name is how they reach their profile**, and
              that is what keeps the profile from becoming a sixth destination.

              The five destinations are fixed (spec, "Where this feature's surfaces live"), so
              the profile needed somewhere in the shell that was not the rail. The attendee's
              own name is the obvious place: it already identifies them, it is already here at
              every width the rail is, and "click your own name to see your profile" needs no
              explaining. Open Question 8 records that exactly where these surfaces hang off the
              existing five is a presentation question, so this is a decision to be reviewed
              rather than one to be inherited.

              At mobile widths the name is hidden — the conference switcher, the sign-out control
              and this label share one row at 320px, and something has to give (FR-020, SC-006).
              An icon-only link takes its place there rather than the profile becoming
              unreachable on a phone.
              ─────────────────────────────────────────────────────────────────────────────
            */}
            <Link
              to="/profile"
              className="hidden truncate text-sm text-text-body underline decoration-transparent hover:decoration-inherit tablet:inline"
            >
              {attendee.displayName}
            </Link>
            <Link
              to="/profile"
              // The accessible name carries what the icon cannot, so the control is not "link"
              // to a screen reader (FR-021, SC-310).
              aria-label={`Your profile, ${attendee.displayName}`}
              className="inline-flex shrink-0 items-center rounded-sm border border-border-subtle p-1.5 text-text-primary tablet:hidden"
            >
              <UserRound aria-hidden="true" size={16} strokeWidth={1.75} />
            </Link>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
            >
              <LogOut aria-hidden="true" size={14} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        )}
      </header>

      {/*
        Announced, and placed where the attendee is already looking after pressing Sign out.
        FR-053 requires the refusal to be explained rather than silent.
      */}
      {signOutFailure && (
        <p
          role="alert"
          className="border-b border-warning-500 bg-warning-100 px-4 py-2 text-sm text-text-body tablet:px-6"
        >
          {signOutFailure}
        </p>
      )}
    </>
  )
}
