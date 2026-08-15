import type { AdminIdentity } from '@mynet/data'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { classify } from './errors.js'
import type { AdminServices } from './services.js'

/**
 * The administrative session, as the client believes it (T046, FR-924, FR-980).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS PRESENTATION, NOT AUTHORISATION, AND THE DISTINCTION IS FR-980.**
 *
 * Every route enforces its own tier server-side through `requireOperator` or
 * `requirePlatformOperator`. Nothing here decides what anybody may do — it decides what to
 * *render*, and a client that lied to itself about the tier would render controls that refuse.
 *
 * That is why `admin-tier-boundary.test.ts` proves an organizer cannot reach a platform address
 * **by direct address entry**, and `tier-controls.test.tsx` separately proves no control is
 * rendered for them. Two tests because they are two guarantees: hiding a control an attacker can
 * still call is not security, and refusing a call while showing the button is not usability.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export type SessionState =
  | { readonly status: 'loading' }
  /** No live session — or one whose bounds expired since the last request (FR-919a, FR-919b). */
  | { readonly status: 'signed-out' }
  /**
   * Signed in, but the bootstrapped credential still stands (FR-992).
   *
   * **Carries no identity, and cannot.** `/admin/me` is refused in this state like every other
   * address except the replacement route, so there is nothing to carry. See `refresh` below.
   */
  | { readonly status: 'must-replace-credential' }
  | { readonly status: 'signed-in'; readonly identity: AdminIdentity }

export interface AdminSession {
  readonly state: SessionState
  readonly services: AdminServices
  /** Re-reads `/admin/me`. Called after sign-in and after replacing a credential. */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AdminSessionContext = createContext<AdminSession | null>(null)

export const useAdminSession = (): AdminSession => {
  const session = use(AdminSessionContext)
  if (!session) throw new Error('useAdminSession must be used inside AdminSessionProvider')
  return session
}

export const AdminSessionProvider = ({
  services,
  children,
}: {
  readonly services: AdminServices
  readonly children: ReactNode
}) => {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const identity = await services.session.me()
      setState({ status: 'signed-in', identity })
    } catch (error) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **THE UNREPLACED CREDENTIAL IS LEARNED FROM THE 403, BECAUSE THERE IS NO OTHER WAY TO
      // LEARN IT.**
      //
      // This read `identity.credentialIsInitial` from a successful `/admin/me`, and that state
      // is **unreachable**: `requireOperator` refuses every address except the replacement route
      // while `credential_is_initial` is true, and `/admin/me` is not that route. So the call
      // threw, the catch below classified it as signed-out, and the operator was returned to the
      // sign-in form they had just successfully used — a loop with no way through it, and the
      // product's opening interaction.
      //
      // It survived every gate because the component test substitutes `session.me()` and had it
      // resolve with `credentialIsInitial: true` — a response the server cannot produce. The
      // route's own `credentialIsInitial` field is dead for the same reason; it is left in place
      // because the contract is committed, and `admin-bootstrap.test.ts` pins the 403.
      //
      // **`error.code`, not the class** — `ApiError extends RequestRefusedError` and every non-2xx
      // throws `ApiError`, so `instanceof` cannot tell this 403 from the 401 beside it. That is
      // 008's defect and the reason `errors.ts` exists.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (classify(error) === 'credential_not_replaced') {
        setState({ status: 'must-replace-credential' })
        return
      }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Every OTHER failure is "signed out", deliberately.**
      //
      // `/admin/me` is the first request the application makes. A 401 means no session; anything
      // else means the application cannot establish who is signed in, and the only screen that
      // is safe to show in that state is the sign-in form. Rendering an administrative shell
      // around an unknown principal is the failure worth avoiding here.
      // ─────────────────────────────────────────────────────────────────────────────────────
      setState({ status: 'signed-out' })
    }
  }, [services])

  useEffect(() => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // `react-hooks/set-state-in-effect` is correct in general and does not apply here: this is
    // the **initial synchronisation with an external system**, which is the case the rule's own
    // documentation names as legitimate. The application cannot render anything until it knows
    // whether a session exists, and that answer lives on the server.
    //
    // Disabled with the same comment shape `apps/web/src/app/discover/useDirectory.ts` uses for
    // the same reason, so the two clients treat the rule identically.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await services.session.signOut()
    } finally {
      // Cleared locally whatever the server said. A sign-out that failed on the wire must not
      // leave somebody looking at an administrative surface believing they are signed out.
      setState({ status: 'signed-out' })
    }
  }, [services])

  const value = useMemo<AdminSession>(
    () => ({ state, services, refresh, signOut }),
    [state, services, refresh, signOut],
  )

  return <AdminSessionContext value={value}>{children}</AdminSessionContext>
}
