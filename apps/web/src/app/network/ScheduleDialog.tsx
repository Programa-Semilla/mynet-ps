import { OfflineError, RequestRefusedError, type MeetingSlot } from '@mynet/data'
import { useAppointmentRepository } from '@mynet/platform'
import { useEffect, useId, useRef, useState } from 'react'

import { useActiveEvent } from '../active-event.js'

/**
 * T088–T091 (008) — the scheduling dialog (FR-624, FR-627, FR-629, FR-655).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A NATIVE `<dialog>` OPENED WITH `showModal()`.**
 *
 * The platform supplies the focus trap, the inertness of everything behind, and Escape — three
 * things the approved prototype implemented none of, and which the register lists as *settled
 * requirements the prototype failed to meet* rather than as open questions. 005 established this
 * for the session panel and 004 for confirmations; this inherits rather than reinvents.
 *
 * **Focus restoration is explicit, and the ORDER is the part that is easy to get wrong**
 * (FR-655). Restoring focus *before* closing does nothing at all: while a dialog is modal
 * everything behind it is **inert**, and an inert element cannot take focus. The call succeeds,
 * focus stays on `<body>`, and a keyboard reader is returned to the top of the page. So: leave
 * the top layer first, then restore focus to an element that is once again focusable.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is NOT `ConfirmDialog`, and that is deliberate** (contrast T107).
 *
 * `ConfirmDialog` answers a yes/no question. This one carries a *choice* — a slot grid and a
 * text field — and its confirmation is disabled until both are present. Decline and cancel, which
 * genuinely are yes/no, **do** reuse `ConfirmDialog` rather than opening a second dialog over
 * this one (FR-656).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

type Status = 'loading' | 'ready' | 'offline' | 'failed'
type Submitting = 'idle' | 'sending' | 'refused' | 'rejected' | 'offline' | 'failed'

export const ScheduleDialog = ({
  attendeeId,
  displayName,
  onClose,
  onProposed,
  returnFocusTo,
}: {
  readonly attendeeId: string
  readonly displayName: string
  readonly onClose: () => void
  readonly onProposed: () => void
  /**
   * The control that opened this, so focus can be returned to it (FR-655).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Passed in as a ref rather than read from `document.activeElement`**, which is the shape
   * `ConfirmDialog` established and the shape the platform boundary requires: reaching for a
   * DOM global in feature code is refused outright by `mynet/no-direct-platform-access`
   * (FR-045, SC-008), and SC-008 requires the violation count to stay at zero.
   *
   * It is also more correct than the global would have been. `document.activeElement` is
   * whatever happened to be focused at mount, which is not necessarily the control that opened
   * the dialog — a click moves focus in ways that differ between browsers, and a dialog opened
   * from a keyboard shortcut would restore focus to something arbitrary.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly returnFocusTo: React.RefObject<HTMLElement | null>
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const topicId = useId()
  const appointments = useAppointmentRepository()
  const activeEvent = useActiveEvent()

  const eventId = activeEvent.status === 'ready' ? activeEvent.event.id : null
  const timezone = activeEvent.status === 'ready' ? activeEvent.event.timezone : undefined

  const [slots, setSlots] = useState<readonly MeetingSlot[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [chosen, setChosen] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [submitting, setSubmitting] = useState<Submitting>('idle')
  /** The server's own wording, for the refusals that carry one. Never rewritten here. */
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  useEffect(() => {
    // `showModal`, never `show`: only the modal form gives the focus trap and the inertness.
    const dialog = dialogRef.current
    dialog?.showModal()

    /**
     * **The opener is captured now, not read at cleanup** — the correctness fix `ConfirmDialog`
     * records in full. The render that closes this dialog may also unmount or detach the control
     * that opened it, so reading `returnFocusTo.current` in the cleanup would find `null` on
     * precisely the path that most needs focus restored.
     */
    const restoreTo = returnFocusTo.current

    return () => {
      // Step 1 — leave the top layer, so what is behind stops being inert.
      dialog?.close()
      // Step 2 — return focus. `<dialog>` does not do it reliably, which is why it is explicit,
      // and it must come second: an inert element cannot take focus (FR-655).
      restoreTo?.focus()
    }
  }, [returnFocusTo])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    appointments
      .slots(eventId)
      .then((rows) => {
        if (cancelled) return
        setSlots(rows)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus(error instanceof OfflineError ? 'offline' : 'failed')
      })

    return () => {
      cancelled = true
    }
  }, [appointments, eventId])

  /**
   * The single dismiss path. Both the close control and Escape arrive here, so the two cannot
   * behave differently — which is exactly what went wrong in the prototype, where Escape did
   * nothing at all.
   */
  const dismiss = () => {
    // Ordered: leave the top layer, then restore focus. See the effect above.
    dialogRef.current?.close()
    returnFocusTo.current?.focus()
    onClose()
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T078 — THE CONFIRMATION IS DISABLED, NEVER A POST-SUBMIT ERROR** (FR-629).
   *
   * `requirements.md` names this treatment explicitly for an invalid empty meeting topic: a
   * **disabled confirmation**, never an error shown after submission. The server refuses a blank
   * topic too and the column CHECK refuses it again, but both of those are backstops — reaching
   * either means something bypassed this, and the attendee should never see them.
   *
   * `topic.trim()` rather than `topic`, so a field of spaces is as invalid here as it is at the
   * database. Otherwise the control would enable, the request would fail, and the attendee would
   * meet exactly the post-submit error the requirement forbids.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const canSubmit = chosen !== null && topic.trim().length > 0 && submitting !== 'sending'

  const propose = () => {
    if (!eventId || !chosen) return
    setSubmitting('sending')

    appointments
      .propose(eventId, { attendeeId, slotId: chosen, topic: topic.trim() })
      .then(() => onProposed())
      .catch((error: unknown) => {
        // ═══════════════════════════════════════════════════════════════════════════════════
        // **BRANCH ON THE ERROR CODE, NEVER ON THE CLASS.**
        //
        // `ApiError extends RequestRefusedError`, and `HttpClient` throws `ApiError` for
        // **every** non-2xx response — so `instanceof RequestRefusedError` is true for the 409
        // block, the 400 slot-unavailable, the 404, the 429 and a 500 alike. Classifying that
        // way rendered the deliberately *reasonless* block wording for all of them, and swallowed
        // the one message the route wrote to be read: "That time is no longer free in your
        // schedule" (FR-657 also requires a fault on our side to be distinguishable, and it was
        // not).
        //
        // `code` is what the server actually decides. `auth/Verify.tsx` established this idiom.
        // The write is refused offline and **never queued** (FR-649).
        // ═══════════════════════════════════════════════════════════════════════════════════
        if (error instanceof OfflineError) return setSubmitting('offline')

        const code = error instanceof RequestRefusedError ? error.code : undefined

        // The block. Reasonless, deliberately (FR-637).
        if (code === 'refused') return setSubmitting('refused')

        // A fact about the reader's own schedule or their own request, told to them verbatim —
        // the server is the only place that wording should exist.
        if (code === 'validation_failed' || code === 'too_many_attempts') {
          setServerMessage(error instanceof Error ? error.message : null)
          return setSubmitting('rejected')
        }

        return setSubmitting('failed')
      })
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape reaches the same dismiss path as the close control, so the two cannot behave
        // differently — which is exactly what went wrong in the prototype, where Escape did
        // nothing at all. Prevented so the platform does not close the dialog underneath us
        // before focus has been restored (FR-655).
        event.preventDefault()
        dismiss()
      }}
      /*
        T131 — full-width from the bottom edge at phone widths, centred and bounded above it.
        `max-h` plus an inner scroll keeps a long grid usable on a short screen **without the
        page scrolling horizontally**, which is the property FR-659 actually protects.
      */
      className="w-full max-w-lg rounded-lg border border-border-subtle bg-surface-raised p-0 shadow-card backdrop:bg-navy-900/40"
    >
      <div className="p-5 tablet:p-6">
        <h2 id={titleId} className="mb-1 font-display text-lg font-semibold text-text-primary">
          Propose a meeting
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          With {displayName}. They will choose whether to accept.
        </p>

        {status === 'loading' && (
          <p role="status" className="py-4 text-sm text-text-muted">
            Finding times you are free…
          </p>
        )}

        {status === 'offline' && (
          <p role="status" className="mb-4 text-sm text-warning-700">
            Times cannot be loaded without a connection, and none are stored on this device.
          </p>
        )}

        {status === 'failed' && (
          <p role="alert" className="mb-4 text-sm text-danger-700">
            Times could not be loaded. This is a problem on our side, not with your account.
          </p>
        )}

        {/*
          ═══════════════════════════════════════════════════════════════════════════════════
          T079 — **the no-slots state: an explanation and a close action, and NO selection**
          (FR-627).

          An empty grid with a disabled confirm would leave the reader pressing things to find
          out why. The explanation is deliberately about **the reader's own day** — it is the
          only true account, since availability is computed from their commitments alone — and it
          says nothing whatever about the invitee, who contributes nothing to this set (FR-626).
          ═══════════════════════════════════════════════════════════════════════════════════
        */}
        {status === 'ready' && slots.length === 0 && (
          <p className="mb-4 rounded-md border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-text-body">
            You have no free times left at this conference — every meeting slot is either in the
            past or already taken by something in your own schedule. Freeing a saved session or
            cancelling a meeting will open one up.
          </p>
        )}

        {status === 'ready' && slots.length > 0 && (
          <>
            <fieldset className="mb-4 border-0 p-0">
              <legend className="mb-2 text-sm font-medium text-text-primary">Choose a time</legend>
              {/*
                T131 — a wrapping grid of touch-sized targets, never a horizontally scrolling
                row (FR-659). `grid-cols-2` at phone widths gives a comfortable 44px+ target at
                320px without anything leaving the viewport.
              */}
              <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto tablet:grid-cols-3">
                {slots.map((slot) => (
                  <label
                    key={slot.slotId}
                    className={`focus-within:focus-ring flex min-h-11 cursor-pointer items-center justify-center rounded-sm border px-2 py-2 text-sm ${
                      chosen === slot.slotId
                        ? 'border-accent-strong bg-accent-strong text-text-inverse'
                        : 'border-border-subtle text-text-body'
                    }`}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot.slotId}
                      checked={chosen === slot.slotId}
                      onChange={() => setChosen(slot.slotId)}
                      // Visually replaced by the label, but present and focusable so the group is
                      // operable by keyboard with arrow keys — which a grid of buttons would not
                      // give for free.
                      className="sr-only"
                    />
                    {/*
                      T089 — **venue time, following 002's clock rule** (FR-624). Slots are stored
                      as absolute instants and localised at display, using the *conference's*
                      timezone rather than the device's: a meeting is a thing you turn up to at a
                      venue, and an attendee reading from another timezone must be told the time
                      they will actually meet.
                    */}
                    {formatSlot(slot, timezone)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label htmlFor={topicId} className="mb-1 block text-sm font-medium text-text-primary">
              What is it about?
            </label>
            <input
              id={topicId}
              type="text"
              value={topic}
              maxLength={200}
              onChange={(event) => setTopic(event.target.value)}
              className="focus-ring mb-4 w-full rounded-sm border border-border-subtle px-3 py-2 text-sm"
            />
          </>
        )}

        {submitting === 'refused' && (
          <p role="alert" className="mb-3 text-sm text-danger-700">
            {/* Reasonless, deliberately (FR-637): a reason would confirm a block. */}
            That meeting could not be proposed.
          </p>
        )}
        {submitting === 'offline' && (
          <p role="status" className="mb-3 text-sm text-warning-700">
            Nothing was sent — there is no connection right now. It has not been saved to send
            later, so try again once you are back online.
          </p>
        )}
        {submitting === 'rejected' && (
          <p role="alert" className="mb-3 text-sm text-danger-700">
            {/*
              Verbatim from the server. The route's own comment explains why this one may carry a
              reason: it describes the reader's own diary to the reader, so it discloses nothing.
              Rewording it here would be a second place for that boundary to be got wrong.
            */}
            {serverMessage ?? 'That meeting could not be proposed.'}
          </p>
        )}
        {submitting === 'failed' && (
          <p role="alert" className="mb-3 text-sm text-danger-700">
            That meeting could not be proposed. This is a problem on our side, not with your
            account.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="focus-ring min-h-11 rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary"
          >
            Close
          </button>
          {status === 'ready' && slots.length > 0 && (
            <button
              type="button"
              onClick={propose}
              disabled={!canSubmit}
              className="focus-ring min-h-11 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === 'sending' ? 'Proposing…' : 'Propose meeting'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}

/**
 * A slot in **venue time** (FR-624, T089).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The conference's own zone, passed in rather than read from the device. Without it a delegate
 * in Lisbon reading a Madrid conference's grid would be shown times an hour out — and would turn
 * up an hour late, which is the concrete failure 002's clock rule exists to prevent.
 *
 * `undefined` falls back to the device zone, which happens only while the active conference is
 * still resolving and the dialog is showing its loading state anyway.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const formatSlot = (slot: MeetingSlot, timeZone: string | undefined): string => {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    ...(timeZone ? { timeZone } : {}),
  }
  return new Date(slot.startsAt).toLocaleString(undefined, options)
}
