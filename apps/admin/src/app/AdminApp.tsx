import { BrowserRouter } from 'react-router'

import { AdminRoutes } from './routes.js'
import { AdminSessionProvider } from './session.js'
import type { AdminServices } from './services.js'

/**
 * The application root (T044).
 *
 * Receives its services rather than constructing them, exactly as `apps/web`'s `App` does — so
 * every test below this point substitutes the whole boundary in one line, and nothing under it
 * knows that HTTP exists (Principle V, and FR-980's client half).
 *
 * Three layers and no more: a router, the session the whole product is a function of, and the
 * route table. There is no `ErrorBoundary` here yet and no offline provider — the first because
 * this product has no crash-recovery requirement of its own beyond Principle IV's, the second
 * because it has no offline behaviour at all (FR-923).
 */
export interface AdminAppProps {
  readonly services: AdminServices
}

export const AdminApp = ({ services }: AdminAppProps) => (
  <BrowserRouter>
    <AdminSessionProvider services={services}>
      <AdminRoutes />
    </AdminSessionProvider>
  </BrowserRouter>
)
