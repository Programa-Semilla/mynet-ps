import { useConnectivity } from '@mynet/platform'
import { WifiOff } from 'lucide-react'

/**
 * T100 — the offline state (FR-052, FR-054).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Names what is unavailable, rather than implying the product still works.**
 *
 * "You're offline" alone invites the attendee to keep trying things and to interpret every
 * subsequent refusal as a bug. Saying which capabilities are gone — and, just as importantly,
 * that nothing has been lost — is what FR-052's "honest" means. The constitution requires
 * offline behaviour to be *bounded*, and a boundary nobody can see is not one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Connectivity arrives through `useConnectivity`, which reads the `ConnectivityService`
 * interface — never `navigator.onLine` (FR-045, SC-008). The debouncing that stops this from
 * flickering on a transient drop lives in the implementation, not here (FR-054).
 */
export const OfflineBanner = () => {
  const online = useConnectivity()

  if (online) return null

  return (
    <div
      // `status` rather than `alert`: losing a connection is a change of state worth announcing,
      // not an emergency that should interrupt whatever is being read.
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 border-b border-warning-500 bg-warning-100 px-4 py-2 text-sm text-text-body tablet:px-6"
    >
      <WifiOff aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <p>
        <span className="font-medium text-text-primary">You are offline.</span> MyNet is showing the
        parts of the workspace that do not need a connection. Your events, your identity, and
        anything else stored on the server cannot be loaded or changed until you reconnect — nothing
        you have done has been lost.
      </p>
    </div>
  )
}
