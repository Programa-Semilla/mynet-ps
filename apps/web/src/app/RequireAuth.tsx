import { Outlet } from 'react-router'

import { SignInScreen } from '../auth/SignInScreen.js'
import { useAuth } from '../auth/useAuth.js'
import { PRODUCT_NAME } from './branding.js'

/**
 * T072 — the route guard (FR-025).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is not access control.** Authorization is enforced server-side on every request
 * (FR-035, FR-036); a guard in the client only decides what to draw. Removing it would change
 * what an unauthenticated visitor *sees*, not what they can *read* — the API would still refuse
 * every request. Constitution Principle VIII is explicit that client-side filtering must never
 * be relied upon, and this comment exists so nobody later mistakes this for the boundary.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The sign-in screen renders **at the address that was requested** rather than redirecting to
 * one. Somebody who follows a shared link to `/network` while signed out signs in and arrives
 * at `/network`, which is what FR-013's "stable, shareable address" is worth. A redirect would
 * drop them on Home and lose the thing they were sent.
 */
export const RequireAuth = () => {
  const { status } = useAuth()

  // 'checking' renders neither. Showing the sign-in screen while the server has not yet answered
  // would flash it at somebody who is already signed in, and is indistinguishable to them from
  // having been signed out.
  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Loading {PRODUCT_NAME}…
        </p>
      </main>
    )
  }

  return status === 'signed-in' ? <Outlet /> : <SignInScreen />
}
