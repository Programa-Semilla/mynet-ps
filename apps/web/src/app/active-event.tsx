import { OfflineError, type Event } from '@mynet/data'
import { useActiveEventRepository } from '@mynet/platform'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useAuth } from '../auth/useAuth.js'
import type { ActiveEventState } from './home/HomeShell.js'

/**
 * T025, T028, T063, T064 (002) — the active conference, resolved once for the whole workspace.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE SOURCE, ABOVE EVERY SURFACE. THAT IS WHAT MAKES FR-113 TRUE.**
 *
 * A switch must leave **no** surface showing the previous conference (SC-102). If Home and
 * Agenda each resolved the active conference for themselves, a switch would update whichever
 * happened to be mounted and leave the other stale until it remounted — and the defect would be
 * invisible in any test that only ever looked at one screen at a time.
 *
 * So the conference lives here, in one provider above the router, and every conference-scoped
 * surface derives from it. Changing it re-renders all of them at once, with **no page reload**
 * — a reload would work, and would throw away the shell, the scroll position and the offline
 * state to solve a problem that is not the browser's.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ActiveEventContextValue {
  readonly state: ActiveEventState
  /** Re-reads the active conference from the server. */
  readonly reload: () => void
  /**
   * Records a switch, resolving to the conference the server actually recorded.
   *
   * Rejects on refusal or offline; the caller renders the failure and the previous conference
   * stays active (FR-112, FR-115).
   */
  readonly switchTo: (eventId: string) => Promise<Event>
}

const ActiveEventContext = createContext<ActiveEventContextValue | null>(null)

export const ActiveEventProvider = ({ children }: { children: ReactNode }) => {
  const repository = useActiveEventRepository()
  const { status: authStatus, attendee } = useAuth()
  /**
   * The resolved conference, **tagged with the attendee it belongs to**.
   *
   * The tag is what makes a stale conference unobservable rather than merely short-lived: the
   * value is derived away during render whenever it does not belong to the attendee who is
   * signed in now, so B never sees A's conference even for a single frame. Clearing it from an
   * effect instead would leave one render in which it was still on screen — and would be a
   * cascading `setState` in an effect, which React's own lint rule rejects.
   */
  const [resolved, setResolved] = useState<{
    readonly attendeeId: string | null
    readonly state: ActiveEventState
  }>({ attendeeId: null, state: { status: 'loading' } })

  /**
   * FR-118 — **the last selection wins, and the client is what sequences.**
   *
   * Each switch takes the next number; a response is applied only if it belongs to the highest
   * request issued so far. Without this, two quick switches race and the slower response can
   * land last, leaving the interface displaying one conference while the server recorded
   * another — which is precisely the resting state FR-118 forbids.
   *
   * The server deliberately has no ordering logic (research D9): it is an idempotent set, and
   * the ordering knowledge lives where the ordering actually happens.
   */
  const issued = useRef(0)
  const applied = useRef(0)

  const failureMessage = (error: unknown): string =>
    error instanceof OfflineError
      ? 'Your conference needs a connection, and there is not one right now. Nothing has been lost.'
      : 'We could not tell which conference you are in. This is a problem on our side, not with your account.'

  /**
   * A stable `retry` that reaches the current `load` through a ref.
   *
   * `load` cannot name itself inside its own definition, and a failure state has to carry a way
   * to try again. The indirection keeps `retry` referentially stable across renders too, so a
   * failure banner holding it does not re-render every time the provider does.
   */
  const loadRef = useRef<(() => void) | null>(null)
  const retry = useCallback(() => loadRef.current?.(), [])

  /**
   * Fetches, and sets state only from the asynchronous callbacks.
   *
   * **No synchronous `setState({ status: 'loading' })` here**, following the same reasoning as
   * `useAsync` in `AsyncState.tsx`: the initial state is already `loading`, so setting it again
   * on mount is a cascading render that `react-hooks/set-state-in-effect` flags and that buys
   * nothing. Reloading from an event handler is where that transition belongs, and `reload`
   * below is where it happens.
   */
  const fetchActive = useCallback(
    (forAttendeeId: string | null) => {
      const sequence = ++issued.current

      void repository
        .getActive()
        .then((event) => {
          if (sequence < applied.current) return
          applied.current = sequence
          setResolved({
            attendeeId: forAttendeeId,
            state: event ? { status: 'ready', event: event as Event } : { status: 'none' },
          })
        })
        .catch((error: unknown) => {
          if (sequence < applied.current) return
          applied.current = sequence
          setResolved({
            attendeeId: forAttendeeId,
            state: { status: 'failed', message: failureMessage(error), retry },
          })
        })
    },
    [repository, retry],
  )

  const attendeeId = attendee?.id ?? null

  const reload = useCallback(() => {
    setResolved({ attendeeId, state: { status: 'loading' } })
    fetchActive(attendeeId)
  }, [fetchActive, attendeeId])

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **The active conference is read only while somebody is signed in, and it is re-read when
   * that changes.**
   *
   * Both halves were missing, and the bug they produced is worth recording because nothing in
   * the component suite could have caught it. This provider sits inside `AuthProvider` but
   * above the router, so it mounts on the **sign-in screen** — before there is a session. A
   * fetch on mount was therefore answered 401, the state went to `failed`, and nothing ever
   * re-ran it: the attendee signed in successfully and Home told them "we could not tell which
   * conference you are in" until they reloaded the page.
   *
   * Component tests missed it because they substitute a repository that always resolves, which
   * is exactly the state a signed-in attendee is in. It took the end-to-end suite, where the
   * app is driven from the sign-in screen the way a person drives it.
   *
   * Keying on `attendee?.id` rather than on the status alone also covers the case that matters
   * on a shared device: signing out and signing in as somebody else must re-resolve, not
   * inherit the previous attendee's conference.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    loadRef.current = reload

    // Nothing to read while signed out. No state is cleared here — `state` below derives the
    // previous attendee's value away, so there is no window in which it can be seen.
    if (authStatus !== 'signed-in') return

    fetchActive(attendeeId)
  }, [fetchActive, reload, authStatus, attendeeId])

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **The conference on screen belongs to the attendee who is signed in now, or it is `loading`.**
   *
   * Derived, not stored, which is what closes a real shared-device leak. This provider sits
   * above the router and never unmounts, so after A signed out and B signed in, the stored value
   * was still `{ ready, A's conference }` for the whole of B's request: B saw A's conference
   * name and venue in the top bar and on the lead card, and the event-scoped cards fetched A's
   * programme — which the server correctly refused, putting failure regions on a perfectly
   * healthy account.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const state: ActiveEventState =
    authStatus === 'signed-in' && resolved.attendeeId === attendeeId
      ? resolved.state
      : { status: 'loading' }

  const switchTo = useCallback(
    async (eventId: string): Promise<Event> => {
      const sequence = ++issued.current

      // No optimistic update. Nothing is shown as switched before the server confirms it, which
      // is what keeps this reconciliation rather than an optimistic write — the distinction
      // matters, because the latter would need its own recorded decision under Principle VI.
      const recorded = (await repository.setActive(eventId)) as Event

      // A slower earlier request must not overwrite a faster later one.
      if (sequence >= applied.current) {
        applied.current = sequence
        setResolved({ attendeeId, state: { status: 'ready', event: recorded } })
      }

      // ───────────────────────────────────────────────────────────────────────────────────
      // **There is deliberately no echo-comparison here, and that is a correction.**
      //
      // This previously read `if (recorded.id !== eventId) reload()`, described as detecting
      // requests that reached the server out of order (research D9's residual risk). It could
      // never fire: `recordActiveEvent` returns the row for the event the request *named*, so
      // the echo is the requested event by construction and the comparison is always false.
      //
      // The risk it claimed to cover is instead prevented upstream — `EventSwitcher` disables
      // every menu item while a switch is in flight — together with the sequence guard above,
      // which discards a slower earlier response. Making the echo meaningful would mean having
      // the PUT return the row actually stored in `active_event_selections` after the upsert;
      // that is a contract change, and nothing currently needs it.
      // ───────────────────────────────────────────────────────────────────────────────────

      return recorded
    },
    [repository, attendeeId],
  )

  return (
    <ActiveEventContext.Provider value={{ state, reload, switchTo }}>
      {children}
    </ActiveEventContext.Provider>
  )
}

export const useActiveEventContext = (): ActiveEventContextValue => {
  const value = useContext(ActiveEventContext)
  if (!value) {
    throw new Error(
      'No ActiveEventProvider found. Conference-scoped surfaces read the active conference from ' +
        'one provider above the router, so that a switch reaches all of them (FR-113).',
    )
  }
  return value
}

/** The active conference, for a surface that only reads it. */
export const useActiveEvent = (): ActiveEventState & { readonly reload: () => void } => {
  const { state, reload } = useActiveEventContext()
  return { ...state, reload }
}

/**
 * T028 — the explicit empty state for an attendee registered for no conferences (FR-105).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A statement of what will appear — not an error, and not a blank region.**
 *
 * This is a valid state, reached by a perfectly healthy request. Rendering it as a failure
 * would tell the attendee something is broken; rendering nothing would leave them looking at an
 * empty screen with no way to tell absence from breakage.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const NoConferencesNotice = () => (
  <div className="mb-4 rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
    <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
      You are not registered for any conferences yet
    </h2>
    <p className="text-sm text-text-body">
      When you are registered for one, it will appear here — with what is happening next, the
      day&apos;s programme, and the people worth meeting.
    </p>
  </div>
)

/** The failure banner for an unresolvable active conference. */
export const ActiveEventFailure = ({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) => (
  <div
    role="alert"
    className="mb-4 rounded-md border border-danger-500 bg-danger-100 px-4 py-3 text-sm text-danger-700"
  >
    <p className="mb-2">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-sm border border-danger-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)
