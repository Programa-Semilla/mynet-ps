import { PlatformProvider, type PlatformServices } from '@mynet/platform'
import { BrowserRouter } from 'react-router'

import { AuthProvider } from '../auth/useAuth.js'
import { ActiveEventProvider } from './active-event.js'
import { AppRoutes } from './routes.js'

/**
 * The application root.
 *
 * Provider order is load-bearing. `BrowserRouter` sits above `AuthProvider` because the shell
 * below both reads the current address — `TopBar` and `RouteAnnouncer` call `useLocation`, and
 * the routes themselves obviously need a router.
 *
 * `ErrorBoundary` is deliberately **not** here. It wraps this component in `main.tsx`, so that a
 * failure in the providers themselves is still caught (FR-061) — and so that the recovery
 * action, which touches the platform, is supplied by the bootstrap rather than by feature code.
 */
export const App = ({ services }: { services: PlatformServices }) => (
  <PlatformProvider services={services}>
    <BrowserRouter>
      <AuthProvider>
        {/*
          002 — the active conference is resolved once, above the router, so a switch reaches
          every conference-scoped surface at once and none is left showing the previous one
          (FR-113, SC-102). Below AuthProvider because it makes an authenticated request.
        */}
        <ActiveEventProvider>
          <AppRoutes />
        </ActiveEventProvider>
      </AuthProvider>
    </BrowserRouter>
  </PlatformProvider>
)
