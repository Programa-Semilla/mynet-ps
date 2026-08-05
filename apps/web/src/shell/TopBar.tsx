import { useAuthGateway } from '@mynet/platform'
import { LogOut } from 'lucide-react'
import { useLocation } from 'react-router'

import { PRODUCT_NAME } from '../app/branding.js'
import { destinationFor } from '../app/navigation.js'
import { useAuth } from '../auth/useAuth.js'

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

  const onSignOut = async () => {
    try {
      await auth.signOut()
    } finally {
      // Clear local state even if the request failed. The server may already have revoked the
      // session; leaving the UI claiming "signed in" would be the worse of the two errors.
      markSignedOut()
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4 py-3 tablet:px-6">
      {/*
        Two labels, one visible at a time — the same CSS-only band selection the navigation uses,
        so neither is announced twice.
      */}
      <span className="font-display text-lg font-semibold text-text-primary tablet:hidden">
        {PRODUCT_NAME}
      </span>
      <span className="hidden font-display text-lg font-semibold text-text-primary tablet:inline">
        {current?.label ?? 'Not found'}
      </span>

      {attendee && (
        <div className="flex min-w-0 items-center gap-3">
          {/* Truncates rather than wrapping or pushing the button off-screen at 320px (FR-020). */}
          <span className="truncate text-sm text-text-body">{attendee.displayName}</span>
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
  )
}
