import { OfflineError, type Appointment } from '@mynet/data'
import { useAppointmentRepository, useFreshness } from '@mynet/platform'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { useActiveEvent } from '../active-event.js'
import { StalenessStamp } from '../agenda/StalenessStamp.js'
import { Loading } from '../AsyncState.js'
import { ConfirmDialog } from '../profile/ConfirmDialog.js'
import {
  classify,
  NetworkFailed,
  NetworkOffline,
  NoAppointments,
  NoConferenceForMeetings,
} from './NetworkStates.js'

/**
 * T106, T107 (008) — the appointments view (FR-630–FR-636, FR-656, FR-657).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **PER-EVENT, AND IT SWAPS ENTIRELY WHEN THE READER SWITCHES CONFERENCE** (FR-639).
 *
 * The deliberate opposite of `Contacts.tsx` beside it, which is cross-event and takes no
 * `eventId` at all. Both rules are stated where they are implemented, because standing decision
 * 7 makes neither a default that may be assumed — and this feature is the first to hold both at
 * once, in one destination.
 *
 * With **no** active conference this renders `NoConferenceForMeetings` rather than an empty
 * list: an attendee between conferences has no set of meetings, not an empty one, and showing
 * "no meetings" would tell somebody with a perfectly healthy account something untrue.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Cached, unlike contacts** (FR-647). These are the attendee's own commitments at one
 * conference, which is exactly the shape the `(attendeeId, eventId, resource)` key was built for.
 * The decision is argued per member at the composition root; nothing here knows a cache exists,
 * which is the whole point of the decorator.
 *
 * Every **write** — accept, decline, cancel — is refused offline and **never queued** (FR-649).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

type Status = 'loading' | 'ready' | 'offline' | 'failed'

/** Which confirmation is open, if any. See `confirm` below for why this is not two booleans. */
type Pending = { readonly action: 'decline' | 'cancel'; readonly appointment: Appointment } | null

export const Appointments = ({
  eventName,
  refreshToken = 0,
}: {
  readonly eventName: string | null
  /**
   * Bumped by the destination when a proposal is made in the contacts pane beside this one.
   *
   * A number rather than a callback or shared state: this view owns its own read, and lifting
   * the list up would give it a second source of truth for what the server holds. See
   * `Network.tsx` for why the coupling exists at all.
   */
  readonly refreshToken?: number
}) => {
  const headingId = useId()
  const repository = useAppointmentRepository()
  const activeEvent = useActiveEvent()
  const freshness = useFreshness()

  const eventId = activeEvent.status === 'ready' ? activeEvent.event.id : null
  const timezone = activeEvent.status === 'ready' ? activeEvent.event.timezone : undefined

  const [appointments, setAppointments] = useState<readonly Appointment[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<Pending>(null)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * The control that opened the confirmation, so focus returns to it (FR-655).
   *
   * One ref rather than one per row: only one confirmation can be open at a time, so the opener
   * is whichever control set `pending`. `ConfirmDialog` reads it at mount and restores at
   * unmount, in that order — see its own header for why the ordering is the part that matters.
   */
  const opener = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    repository
      .list(eventId)
      .then((rows) => {
        if (cancelled) return
        setAppointments(rows)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // T039b — the same classification the contacts list uses, so the two surfaces beside each
        // other cannot describe the same failure differently (FR-657).
        setStatus(classify(error))
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, attempt, refreshToken])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  /**
   * Accept, decline and cancel all land here.
   *
   * Re-reads the list from the server rather than patching the local copy. A patched copy would
   * be a second source of truth for what the server holds — and accepting can *fail* on a
   * conflict (FR-633a), which an optimistic update would have to unwind.
   */
  const run = (action: 'accept' | 'decline' | 'cancel', appointment: Appointment) => {
    if (!eventId) return
    setWorking(true)
    setActionError(null)

    repository[action](eventId, appointment.appointmentId)
      .then(() => {
        setPending(null)
        setAttempt((n) => n + 1)
      })
      .catch((error: unknown) => {
        setPending(null)
        // ───────────────────────────────────────────────────────────────────────────────────
        // **The acceptance conflict is the one refusal in this feature that carries a reason**
        // (FR-633a), and it is surfaced verbatim from the server rather than reworded here.
        //
        // The server's message describes **the reader's own schedule to the reader** and never
        // mentions the proposer's, which is what makes explaining it disclose nothing. Rewording
        // it on the client would be a second place for that boundary to be got wrong.
        // ───────────────────────────────────────────────────────────────────────────────────
        if (error instanceof OfflineError) {
          setActionError(
            'Nothing was changed — there is no connection right now, and it has not been saved to send later.',
          )
        } else if (error instanceof Error && error.message) {
          setActionError(error.message)
        } else {
          setActionError('That could not be done. This is a problem on our side.')
        }
      })
      .finally(() => setWorking(false))
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h2
        id={headingId}
        className="mb-3 font-display text-lg font-medium text-text-primary tablet:mb-4"
      >
        Appointments
      </h2>

      {/*
        ═════════════════════════════════════════════════════════════════════════════════════
        **The conference not resolving and the attendee having none are DIFFERENT, and telling
        them apart is the whole of this block.**

        `none` means they have joined nothing — a real state with a real next step, and where
        every brand-new account stands. `failed` means we could not find out. Rendering "join a
        conference" for the second would tell somebody who has three of them to go and get one,
        which is the same class of lie 006's `NoConference` was written to avoid.

        `loading` renders nothing here: the list below owns its own loading state, and two
        spinners for one wait is worse than either.
        ═════════════════════════════════════════════════════════════════════════════════════
      */}
      {activeEvent.status === 'none' && <NoConferenceForMeetings />}
      {activeEvent.status === 'failed' && (
        <NetworkFailed what="Your conference" onRetry={activeEvent.retry} />
      )}

      {eventId !== null && (
        <>
          {/*
            ═════════════════════════════════════════════════════════════════════════════════
            **FR-647's second half: the retrieval time, stated on the surface.**

            The requirement is "readable offline from the existing cache, **with the retrieval
            time stated on the surface**", and this is the only cached surface 008 adds. Without
            it a cache-served list renders identically to a live one — which is precisely what
            SC-204 forbids, and what makes an age-based cache honest at all.

            Renders nothing when the content is live: `lastRetrieved` answers `null` then, and a
            stamp on live content would train the reader to ignore it.
            ═════════════════════════════════════════════════════════════════════════════════
          */}
          <StalenessStamp retrievedAt={freshness.lastRetrieved(eventId, 'appointments')} />

          {status === 'loading' && <Loading label="Loading your meetings…" />}
          {status === 'offline' && (
            <NetworkOffline
              what="Your meetings"
              because="Your meetings are kept on this device once they have loaded, and that has not happened yet."
              onRetry={retry}
            />
          )}
          {status === 'failed' && <NetworkFailed what="Your meetings" onRetry={retry} />}

          {actionError && (
            <p role="alert" className="mb-3 text-sm text-danger-700">
              {actionError}
            </p>
          )}

          {status === 'ready' &&
            (appointments.length === 0 ? (
              <NoAppointments eventName={eventName} />
            ) : (
              <ul className="grid gap-3">
                {appointments.map((appointment) => (
                  <li key={appointment.appointmentId} className="min-w-0">
                    <AppointmentCard
                      appointment={appointment}
                      timezone={timezone}
                      working={working}
                      onAccept={() => run('accept', appointment)}
                      onDecline={(control) => {
                        opener.current = control
                        setPending({ action: 'decline', appointment })
                      }}
                      onCancel={(control) => {
                        opener.current = control
                        setPending({ action: 'cancel', appointment })
                      }}
                    />
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}

      {/*
        ═════════════════════════════════════════════════════════════════════════════════════
        T107 — **decline and cancel go through the SHARED `ConfirmDialog`, not a second modal
        over the scheduling one** (FR-656).

        007 established this and recorded what is easy to get wrong: focus must be restored
        **after** closing, because an inert element cannot take focus. Reusing the component is
        what stops that ordering existing in two places and drifting apart in one of them.

        There is no second dialog stacked here either: the scheduling dialog belongs to
        `Contacts`, and by the time an appointment exists to decline it has already closed.

        **Accept has no confirmation, and that asymmetry is deliberate.** Accepting creates a
        commitment the reader can undo at any time by cancelling (FR-632); declining and
        cancelling are the ones that destroy something — a proposal cannot be un-declined.
        ═════════════════════════════════════════════════════════════════════════════════════
      */}
      {pending && (
        <ConfirmDialog
          title={pending.action === 'decline' ? 'Decline this meeting?' : 'Cancel this meeting?'}
          confirmLabel={pending.action === 'decline' ? 'Decline' : 'Cancel meeting'}
          confirming={working}
          destructive
          onConfirm={() => run(pending.action, pending.appointment)}
          onDismiss={() => setPending(null)}
          returnFocusTo={opener}
        >
          {pending.action === 'decline' ? (
            <p>
              {pending.appointment.counterpart.displayName} will see that you declined. The time
              becomes free for them again. You cannot undo this — they would have to propose again.
            </p>
          ) : (
            <p>
              {pending.appointment.counterpart.displayName} will see that the meeting is cancelled,
              and the time becomes free for you both. You cannot undo this — one of you would have
              to propose again.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}

/**
 * One meeting.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Which actions exist is decided by `role` and `status` together, server-side rules mirrored
 * exactly**: only the invitee may accept or decline a pending proposal (FR-635), and either
 * party may cancel a confirmed one (FR-632).
 *
 * A **lapsed** proposal offers nothing at all. Its slot has passed, so accepting is impossible
 * (FR-634) — and rendering an Accept control that must then fail is the post-submit error FR-629
 * establishes the product does not do.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const AppointmentCard = ({
  appointment,
  timezone,
  working,
  onAccept,
  onDecline,
  onCancel,
}: {
  readonly appointment: Appointment
  readonly timezone: string | undefined
  readonly working: boolean
  readonly onAccept: () => void
  readonly onDecline: (control: HTMLButtonElement) => void
  readonly onCancel: (control: HTMLButtonElement) => void
}) => {
  const { status, role, counterpart } = appointment
  const awaitingReader = status === 'pending' && role === 'invitee'
  const awaitingOther = status === 'pending' && role === 'proposer'

  return (
    <article className="min-w-0 rounded-md border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-medium text-text-primary">{counterpart.displayName}</h3>
        <StatusBadge status={status} awaitingReader={awaitingReader} />
      </div>

      {/* Venue time, following 002's clock rule (FR-624) — see `ScheduleDialog.formatSlot`. */}
      <p className="mt-1 text-sm text-text-body">
        <time dateTime={appointment.slot.startsAt}>
          {new Date(appointment.slot.startsAt).toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            ...(timezone ? { timeZone: timezone } : {}),
          })}
        </time>
      </p>

      <p className="mt-1 text-sm text-text-muted">{appointment.topic}</p>

      {awaitingOther && (
        <p className="mt-2 text-xs text-text-muted">
          Waiting for {counterpart.displayName} to answer.
        </p>
      )}

      {status === 'lapsed' && (
        <p className="mt-2 text-xs text-text-muted">
          {/*
            Honest rather than hidden, on the same reasoning `deriveStatus` records: the proposal
            happened, and removing it from the list would leave the reader wondering where it
            went. It simply offers nothing to do.
          */}
          That time has passed, so this can no longer be accepted.
        </p>
      )}

      {(awaitingReader || status === 'confirmed') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {awaitingReader && (
            <>
              <button
                type="button"
                onClick={onAccept}
                disabled={working}
                aria-label={`Accept the meeting with ${counterpart.displayName}`}
                className="focus-ring min-h-11 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={(event) => onDecline(event.currentTarget)}
                disabled={working}
                aria-label={`Decline the meeting with ${counterpart.displayName}`}
                className="focus-ring min-h-11 rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}

          {status === 'confirmed' && (
            <button
              type="button"
              onClick={(event) => onCancel(event.currentTarget)}
              disabled={working}
              aria-label={`Cancel the meeting with ${counterpart.displayName}`}
              className="focus-ring min-h-11 rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * The status, in words.
 *
 * **Never colour alone** (Principle IV): every state is named in text, and the tone is a second
 * signal rather than the only one. A proposal awaiting *the reader* is worded distinctly from one
 * awaiting the other person, because those demand opposite things of them (FR-645).
 */
const StatusBadge = ({
  status,
  awaitingReader,
}: {
  readonly status: Appointment['status']
  readonly awaitingReader: boolean
}) => {
  const label = awaitingReader
    ? 'Needs your answer'
    : {
        pending: 'Proposed',
        confirmed: 'Confirmed',
        declined: 'Declined',
        cancelled: 'Cancelled',
        lapsed: 'No longer available',
      }[status]

  const tone = awaitingReader
    ? 'bg-coral-100 text-coral-700'
    : status === 'confirmed'
      ? 'bg-mint-100 text-mint-700'
      : 'bg-cream-200 text-text-body'

  return <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}
