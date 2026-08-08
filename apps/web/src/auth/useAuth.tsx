import type { Attendee } from '@mynet/data'
import { NotAuthenticatedError, OfflineError, SessionExpiredError } from '@mynet/data'
import { useAttendeeRepository, useConnectivity } from '@mynet/platform'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * T060 — client auth state and session-expired handling.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The client's belief about its session is **never** authoritative. Validity is decided
 * server-side on every request (FR-028b); this hook only reflects what the server last said.
 *
 * That is why there is no expiry timer here, and no stored token to inspect. The client finds
 * out its session ended the same way it finds out anything else — the server refuses.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export type AuthStatus =
  /** Still asking the server who we are. Distinct from signed-out — see below. */
  | 'checking'
  | 'signed-in'
  | 'signed-out'
  /**
   * We could not ask, because there is no connection (FR-052).
   *
   * **Not the same as signed-out, and treating it as such was a defect.** An attendee who opens
   * MyNet on a plane has not been signed out; we simply do not know. Claiming they were is both
   * untrue and useless — the sign-in screen it sends them to cannot submit anything either.
   */
  | 'offline'

export interface AuthState {
  readonly status: AuthStatus
  readonly attendee: Attendee | null
  /**
   * FR-028c — set when the session ended through inactivity, so the sign-in screen can
   * explain *why* the attendee is back there. Cleared on the next sign-in attempt.
   */
  readonly expiredThroughInactivity: boolean
  refresh(): Promise<void>
  markSignedIn(): Promise<void>
  markSignedOut(): void
}

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const attendeeRepository = useAttendeeRepository()
  const online = useConnectivity()

  // 'checking' rather than 'signed-out' initially. Starting at signed-out would flash the
  // sign-in screen at an attendee who is signed in — and worse, would be indistinguishable
  // from having actually been signed out.
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [attendee, setAttendee] = useState<Attendee | null>(null)
  const [expiredThroughInactivity, setExpired] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const current = await attendeeRepository.getCurrent()
      setAttendee(current)
      setStatus('signed-in')
      setExpired(false)
    } catch (error) {
      setAttendee(null)

      // Being unable to ask is not an answer. Reporting 'signed-out' here would state something
      // we do not know, and would replace the shell — which works offline — with a sign-in form
      // that cannot possibly succeed (FR-051, FR-052).
      if (error instanceof OfflineError) {
        setStatus('offline')
        setExpired(false)
        return
      }

      setStatus('signed-out')
      // FR-028c — only inactivity gets the explanation. "Never signed in" and "signed out
      // deliberately" must not claim the attendee was idle.
      setExpired(error instanceof SessionExpiredError)

      if (!(error instanceof SessionExpiredError) && !(error instanceof NotAuthenticatedError)) {
        // A server failure is not a sign-out either, but unlike the offline case there is
        // nothing better to show. Re-throwing would break the shell; swallowing it silently
        // would render an empty success (FR-058). Leave it visible for diagnosis.
        console.error('Could not establish sign-in state:', error)
      }
    }
  }, [attendeeRepository])

  useEffect(() => {
    // Asking the server who we are on mount is precisely the sanctioned case: subscribing to
    // an external system whose state React cannot derive. There is nowhere else this can
    // happen — the answer is only obtainable over the network, and the alternative is a
    // data-fetching library this slice has no other need for (FR-003 bars dependencies that
    // are not justified by an actual requirement).
    //
    // The setState calls inside `refresh` all occur after an await, so they are not the
    // synchronous cascade the rule targets; the rule cannot see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // FR-054 — recover without a manual reload. The question we could not answer while offline
  // becomes answerable the moment the connection returns, and making the attendee reload to
  // discover that would be the product forgetting something it already knows.
  //
  // Guarded on `status === 'offline'` so a connectivity blip does not re-interrogate the server
  // for somebody whose session is already established.
  useEffect(() => {
    // Same reasoning as the mount effect above: every setState inside `refresh` happens after an
    // await, so this is not the synchronous cascade the rule targets — and the rule cannot see
    // through the async boundary to tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (online && status === 'offline') void refresh()
  }, [online, status, refresh])

  const markSignedIn = useCallback(async () => {
    setExpired(false)
    await refresh()
  }, [refresh])

  const markSignedOut = useCallback(() => {
    setAttendee(null)
    setStatus('signed-out')
    setExpired(false)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ status, attendee, expiredThroughInactivity, refresh, markSignedIn, markSignedOut }),
    [status, attendee, expiredThroughInactivity, refresh, markSignedIn, markSignedOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthState => {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>.')
  return state
}
