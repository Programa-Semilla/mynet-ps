import { useAuthGateway } from '@mynet/platform'

import { PRODUCT_NAME } from '../app/branding.js'
import { useAuth } from '../auth/useAuth.js'

/**
 * T061 — display the signed-in attendee's identity (FR-032).
 *
 * Shows the display name the server returned for *this* session. The prototype hardcoded
 * "Good morning, Sarah" regardless of who was looking at it; CLAUDE.md records that as a
 * prototype artifact made moot by real authentication, and this is where it stops being true.
 *
 * There is deliberately **no notification bell**. The prototype header shows one with an
 * unread dot, but notifications are out of product scope until a recorded decision brings
 * them in (constitution Open Question 10). An affordance for a capability that does not exist
 * is a promise the product cannot keep.
 */
export const TopBar = () => {
  const { attendee, markSignedOut } = useAuth()
  const auth = useAuthGateway()

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
    <header className="flex items-center justify-between border-b border-border-subtle bg-surface-raised px-4 py-3">
      <span className="font-display text-lg font-semibold text-text-primary">{PRODUCT_NAME}</span>

      {attendee && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-body">{attendee.displayName}</span>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
