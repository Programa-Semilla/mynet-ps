import { PlatformProvider, type PlatformServices } from '@mynet/platform'
import { useEffect } from 'react'

import { SignInScreen } from '../auth/SignInScreen.js'
import { AuthProvider, useAuth } from '../auth/useAuth.js'
import { TopBar } from '../shell/TopBar.js'
import { PRODUCT_NAME } from './branding.js'
import { Home } from './destinations/Home.js'
import { ErrorBoundary } from './ErrorBoundary.js'

/**
 * The application root.
 *
 * Routing across the five addressable destinations is T069 (User Story 2). This slice's MVP
 * is the vertical path — sign in, see your own workspace — so Home is the only destination
 * rendered here for now.
 */

const AuthenticatedApp = () => (
  <div className="min-h-screen bg-surface">
    <TopBar />
    <Home />
  </div>
)

const Gate = () => {
  const { status } = useAuth()

  // FR-025 — an unauthenticated visitor is asked to sign in and shown no attendee data.
  // 'checking' renders neither: showing the sign-in screen while we are still asking the
  // server would flash it at someone who is signed in.
  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Loading {PRODUCT_NAME}…
        </p>
      </main>
    )
  }

  return status === 'signed-in' ? <AuthenticatedApp /> : <SignInScreen />
}

export const App = ({ services }: { services: PlatformServices }) => {
  useEffect(() => {
    // FR-049 — the document title comes from the single branding constant.
    document.title = PRODUCT_NAME
  }, [])

  return (
    <ErrorBoundary>
      <PlatformProvider services={services}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </PlatformProvider>
    </ErrorBoundary>
  )
}
