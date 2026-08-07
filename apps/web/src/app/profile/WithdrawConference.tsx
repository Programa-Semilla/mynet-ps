import { OfflineError, type Event } from '@mynet/data'
import { useEventsRepository, useIdentityRepository } from '@mynet/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useActiveEventContext } from '../active-event.js'
import { ConfirmDialog } from './ConfirmDialog.js'

/**
 * T112 (004) — leaving a conference (FR-317c, FR-317d).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFIRMATION MUST SAY THAT THE CONFERENCE'S SAVED SESSIONS AND NOTES GO WITH IT.**
 *
 * That is the whole reason this needs a confirmation at all. Leaving a conference sounds
 * reversible — the code is public, rejoining takes seconds — and it very nearly is. What is
 * *not* reversible is the personal content attached to it: the sessions somebody saved and the
 * private notes they wrote are deleted, and rejoining does not bring them back.
 *
 * A person who assumed otherwise would lose work they had no reason to expect was at risk. So
 * the dialog says it in those words, before the control that does it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **A registration is the one piece of attendee state that could otherwise have no exit.** It
 * can be created by entering a public code; without this it could never be removed without
 * deleting the whole account, which sits badly beside self-serve deletion (FR-317c).
 */
export const WithdrawConference = () => {
  const events = useEventsRepository()
  const identity = useIdentityRepository()
  const { reload: reloadActiveEvent } = useActiveEventContext()

  const opener = useRef<HTMLButtonElement>(null)
  const [registered, setRegistered] = useState<Event[] | null>(null)
  const [leaving, setLeaving] = useState<Event | null>(null)
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRegistered((await events.listRegistered()) as Event[])
    } catch {
      // A conference list that will not load is not worth an error banner on an account page:
      // the section simply does not offer what it cannot describe.
      setRegistered([])
    }
  }, [events])

  useEffect(() => {
    // See `Profile.tsx` — the write is behind an await, and the rule cannot see through a
    // `useCallback` boundary to tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const withdraw = async (event: Event) => {
    setWorking(true)
    setFailure(null)

    try {
      await identity.withdrawFromConference(event.id)
      setLeaving(null)
      await load()
      // The active conference may have been the one just left. Re-asking is what leaves the
      // attendee coherent rather than looking at a conference they are no longer in (FR-317d).
      reloadActiveEvent()
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? 'Leaving a conference needs a connection. Nothing has changed — try again once you reconnect.'
          : 'Could not leave that conference just now. Nothing has changed — try again.',
      )
    } finally {
      setWorking(false)
    }
  }

  // Nothing to show somebody registered for nothing. Home already invites them to join (FR-308).
  if (!registered || registered.length === 0) return null

  return (
    <section
      aria-labelledby="withdraw-heading"
      className="mb-8 rounded-md border border-border-subtle bg-surface-raised px-4 py-4"
    >
      <h2
        id="withdraw-heading"
        className="mb-2 font-display text-base font-medium text-text-primary"
      >
        Conferences you have joined
      </h2>
      <p className="mb-3 text-sm text-text-body">
        Leaving one removes it from your workspace, along with the sessions you saved and the notes
        you wrote for it. Your profile is unaffected.
      </p>

      <ul className="grid gap-2">
        {registered.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text-primary">
                {event.name}
              </span>
              <span className="block truncate text-xs text-text-muted">{event.location}</span>
            </span>
            <button
              ref={leaving?.id === event.id ? opener : undefined}
              type="button"
              onClick={() => setLeaving(event)}
              // The accessible name names the conference, so a screen-reader user hearing a list
              // of "Leave" buttons knows which is which (SC-310).
              aria-label={`Leave ${event.name}`}
              className="shrink-0 rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
            >
              Leave
            </button>
          </li>
        ))}
      </ul>

      {failure && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {failure}
        </p>
      )}

      {leaving && (
        <ConfirmDialog
          title={`Leave ${leaving.name}?`}
          confirmLabel="Leave this conference"
          confirming={working}
          destructive
          onConfirm={() => void withdraw(leaving)}
          onDismiss={() => setLeaving(null)}
          returnFocusTo={opener}
        >
          <p className="mb-2">
            <strong className="font-medium text-text-primary">
              The sessions you saved and the notes you wrote for this conference are deleted.
            </strong>{' '}
            Rejoining later does not bring them back.
          </p>
          <p>Your profile, your photograph and your other conferences are unaffected.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
