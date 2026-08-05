import { PlatformProvider, type PlatformServices } from '@mynet/platform'
import { useEffect } from 'react'
import { BrowserRouter } from 'react-router'

import { AuthProvider } from '../auth/useAuth.js'
import { PRODUCT_NAME } from './branding.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { AppRoutes } from './routes.js'

/**
 * The application root.
 *
 * Provider order is load-bearing. `BrowserRouter` sits above `AuthProvider` because the route
 * guard and the top bar both read the current address, and inside `ErrorBoundary` so that a
 * failure anywhere below still renders a working shell rather than a blank page (FR-061).
 */
export const App = ({ services }: { services: PlatformServices }) => {
  useEffect(() => {
    // FR-049 — the document title comes from the single branding constant.
    document.title = PRODUCT_NAME
  }, [])

  return (
    <ErrorBoundary>
      <PlatformProvider services={services}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </PlatformProvider>
    </ErrorBoundary>
  )
}
