import { OfflineError, type Event } from '@mynet/data'
import { useActiveEventRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { useAsync } from './AsyncState.js'
import type { ActiveEventState } from './home/HomeShell.js'

/**
 * T025, T028 (002) — resolving the active conference above the cards (FR-102, FR-105).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Resolved once, here, and handed down.** Four event-scoped cards each fetching the active
 * conference would be four requests, four loading states able to disagree with each other, and
 * four separate chances to forget the registered-for-nothing case. The shell renders no
 * event-scoped card until this resolves, which is what lets `EventCardProps.event` be a plain
 * `Event` rather than a nullable one — so no card contains the words `if (!event)`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The active conference, as the shell consumes it.
 *
 * Returns the state plus the resolved event, because Home needs the event for its cards and the
 * top bar needs it to name the current conference.
 */
export const useActiveEvent = (): ActiveEventState & { readonly reload: () => void } => {
  const repository = useActiveEventRepository()

  const load = useCallback(() => repository.getActive() as Promise<Event | null>, [repository])

  // `emptyWhen` is what turns "registered for no conferences" into its own state rather than a
  // `ready` carrying null. FR-105 wants an explicit empty state, and the four-state machine in
  // AsyncState exists precisely so a failure can never be rendered as an empty success.
  const state = useAsync<Event | null>(load, [load], { emptyWhen: (data) => data === null })

  switch (state.status) {
    case 'loading':
      return { status: 'loading', reload: state.retry }
    case 'empty':
      return { status: 'none', reload: state.retry }
    case 'failed':
      return {
        status: 'failed',
        // FR-053 — being offline is not a server fault, and saying so would send the attendee
        // looking for a problem that is not there. Two causes, two explanations, following the
        // precedent already set by sign-out in `TopBar.tsx`.
        message:
          state.error instanceof OfflineError
            ? 'Your conference needs a connection, and there is not one right now. Nothing has been lost.'
            : 'We could not tell which conference you are in. This is a problem on our side, not with your account.',
        retry: state.retry,
        reload: state.retry,
      }
    case 'ready':
      // `emptyWhen` has already claimed the null case, so this is a real conference.
      return { status: 'ready', event: state.data as Event, reload: state.retry }
  }
}

/**
 * T028 — the explicit empty state for an attendee registered for no conferences (FR-105).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A statement of what will appear — not an error, and not a blank region.**
 *
 * This is a valid state, reached by a perfectly healthy request. Rendering it as a failure
 * would tell the attendee something is broken; rendering nothing would leave them looking at an
 * empty screen with no way to tell absence from breakage. It says what is true and what will
 * change it.
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
