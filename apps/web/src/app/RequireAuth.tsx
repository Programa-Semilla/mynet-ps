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

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Offline renders the shell, not the sign-in screen (FR-051, FR-052).
  //
  // We do not know whether this visitor is signed in — that is what 'offline' means — so we
  // claim neither. What the shell shows in that state is navigation, the destinations' own
  // static structure, and the offline banner naming what is unavailable. It shows no identity
  // and no attendee data, because it has none: every read still goes to a server that is not
  // answering, and authorization was never the client's job anyway (FR-035, FR-036).
  //
  // The alternative — a sign-in form — would be worse in both directions. To somebody already
  // signed in it is a false claim that their session ended; to somebody who is not, it is a
  // form that cannot submit. Neither can be acted on until the connection returns, at which
  // point `useAuth` re-asks and this resolves itself.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (status === 'offline') return <Outlet />

  return status === 'signed-in' ? <Outlet /> : <SignInScreen />
}
