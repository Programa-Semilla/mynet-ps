import { OfflineError, type Appointment, type AppointmentRepository } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { Appointments } from '../../src/app/network/Appointments.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T106–T108 (008) — the appointments view (FR-632–FR-636, FR-645, FR-656).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T108 — DECLINE AND CANCEL GO THROUGH THE SHARED `ConfirmDialog`, AND NO SECOND MODAL IS
 * EVER OPENED OVER THE FIRST** (FR-656).
 *
 * 007 established the reuse and recorded what is easy to get wrong: focus must be restored
 * **after** closing, because an inert element cannot take focus. Reusing the component is what
 * stops that ordering existing in two places and drifting apart in one of them — so the
 * assertion here is not "a dialog appeared" but "exactly one dialog exists".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

beforeAll(() => {
  // jsdom implements `<dialog>` structurally but not its modal behaviour. See
  // `schedule-dialog.test.tsx` for why these are stubbed rather than simulated.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false
    }
  }
})

const COUNTERPART = {
  attendeeId: 'attendee-grace',
  displayName: 'Grace Hopper',
}

const PENDING_FOR_READER: Appointment = {
  appointmentId: 'appointment-1',
  role: 'invitee',
  counterpart: COUNTERPART,
  slot: {
    slotId: 'slot-1',
    startsAt: '2026-09-14T07:30:00.000Z',
    endsAt: '2026-09-14T08:00:00.000Z',
  },
  topic: 'Design systems, briefly.',
  status: 'pending',
  createdAt: '2026-09-13T09:00:00.000Z',
  answeredAt: null,
}

const CONFIRMED: Appointment = {
  ...PENDING_FOR_READER,
  appointmentId: 'appointment-2',
  role: 'proposer',
  status: 'confirmed',
  answeredAt: '2026-09-13T10:00:00.000Z',
}

type AnswerFn = AppointmentRepository['accept']

const renderView = (
  rows: readonly Appointment[],
  overrides: Partial<Record<'accept' | 'decline' | 'cancel', AnswerFn>> = {},
) => {
  const base = testServices().repositories.appointments
  const accept = overrides.accept ?? vi.fn<AnswerFn>(async () => ({}) as never)
  const decline = overrides.decline ?? vi.fn<AnswerFn>(async () => ({}) as never)
  const cancel = overrides.cancel ?? vi.fn<AnswerFn>(async () => ({}) as never)

  render(
    <WithServices
      services={testServices({
        appointments: { ...base, list: async () => [...rows], accept, decline, cancel },
      })}
    >
      <ActiveEventProvider>
        <MemoryRouter>
          <Appointments eventName="Product & Design Summit" />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

  return { accept, decline, cancel }
}

describe('the appointments view', () => {
  it('renders its own empty state, naming the conference it is scoped to', async () => {
    renderView([])

    // Per-event (FR-639), and it says so: an attendee with meetings at another conference would
    // otherwise read this as having none at all.
    expect(await screen.findByText(/no meetings arranged/i)).toBeInTheDocument()
    expect(screen.getByText(/product & design summit/i)).toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **"You have joined no conference" and "we could not find out" are different, and this pair
   * is what keeps them apart.**
   *
   * `none` has a real next step — join one — and is where every brand-new account stands.
   * `failed` does not: telling somebody with three conferences to go and get one is the same
   * class of lie 006's `NoConference` was written to avoid, and it is what this component did
   * before the distinction was drawn.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('invites the reader to join when they have no conference at all', async () => {
    const base = testServices().repositories.activeEvent
    render(
      <WithServices
        services={testServices({ activeEvent: { ...base, getActive: async () => null } })}
      >
        <ActiveEventProvider>
          <MemoryRouter>
            <Appointments eventName={null} />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

    expect(await screen.findByText(/join a conference to arrange meetings/i)).toBeInTheDocument()
    // …and it says the contacts survive either way, because they are cross-event (FR-614).
    expect(screen.getByText(/your contacts stay with you either way/i)).toBeInTheDocument()
  })

  it('does NOT invite them to join when the conference merely failed to resolve', async () => {
    const base = testServices().repositories.activeEvent
    render(
      <WithServices
        services={testServices({
          activeEvent: {
            ...base,
            getActive: async () => {
              throw new Error('server fault')
            },
          },
        })}
      >
        <ActiveEventProvider>
          <MemoryRouter>
            <Appointments eventName={null} />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.queryByText(/join a conference to arrange meetings/i),
      'A conference that failed to resolve was reported as the attendee having none. Somebody ' +
        'with three conferences would be told to go and get one.',
    ).not.toBeInTheDocument()
  })

  /**
   * FR-635 mirrored on the client: **only the invitee may accept or decline**, and a proposal the
   * reader sent offers neither. Rendering controls that the server would refuse is the
   * post-submit failure FR-629 establishes the product does not do.
   */
  it('offers accept and decline ONLY to the invitee (FR-635)', async () => {
    renderView([PENDING_FOR_READER])

    expect(await screen.findByRole('button', { name: /accept the meeting/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decline the meeting/i })).toBeInTheDocument()
    // Not yet confirmed, so there is nothing to cancel.
    expect(screen.queryByRole('button', { name: /cancel the meeting/i })).not.toBeInTheDocument()
  })

  it('offers neither to the proposer of a pending proposal (FR-635)', async () => {
    renderView([{ ...PENDING_FOR_READER, role: 'proposer' }])

    expect(await screen.findByText(/waiting for grace hopper to answer/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
  })

  it('offers cancel to EITHER party on a confirmed meeting (FR-632)', async () => {
    renderView([CONFIRMED])

    // The reader is the *proposer* here, and may still cancel — a meeting one person cannot
    // attend is not a meeting.
    expect(await screen.findByRole('button', { name: /cancel the meeting/i })).toBeInTheDocument()
  })

  it('offers nothing at all on a lapsed proposal (FR-634)', async () => {
    renderView([{ ...PENDING_FOR_READER, status: 'lapsed' }])

    expect(await screen.findByText(/that time has passed/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T108 — **exactly one dialog, and it is the shared one** (FR-656).
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T108 — opens exactly ONE dialog to confirm a decline, never a second over the first (FR-656)', async () => {
    const { decline } = renderView([PENDING_FOR_READER])

    await userEvent.click(await screen.findByRole('button', { name: /decline the meeting/i }))

    // Queried through testing-library rather than `document`, which the platform boundary
    // refuses in this package (FR-045, SC-008). `<dialog>` carries an implicit `dialog` role
    // once open, so this counts exactly what is on screen.
    const dialogs = screen.getAllByRole('dialog')
    expect(
      dialogs.length,
      'More than one dialog is open. Decline and cancel reuse the shared `ConfirmDialog` ' +
        '(FR-656) precisely so the focus-restoration ordering exists in one place — a second ' +
        'modal is a second place for it to be got wrong.',
    ).toBe(1)

    // Nothing has happened yet: the confirmation is a question, not a delayed action.
    expect(decline).not.toHaveBeenCalled()

    // And it says what will follow, including that it cannot be undone.
    expect(screen.getByText(/cannot undo this/i)).toBeInTheDocument()
  })

  it('declines only after the confirmation is accepted, and says the slot returns to them (FR-633)', async () => {
    const { decline } = renderView([PENDING_FOR_READER])

    await userEvent.click(await screen.findByRole('button', { name: /decline the meeting/i }))

    // The wording is the requirement's own asymmetry: declining frees the time **for them**,
    // because the invitee never lost it (SC-608a).
    expect(screen.getByText(/becomes free for them again/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }))

    await waitFor(() => expect(decline).toHaveBeenCalledWith(expect.any(String), 'appointment-1'))
  })

  it('cancelling says the slot returns to BOTH, which decline deliberately does not (FR-633)', async () => {
    renderView([CONFIRMED])

    await userEvent.click(await screen.findByRole('button', { name: /cancel the meeting/i }))

    expect(screen.getByText(/free for you both/i)).toBeInTheDocument()
  })

  /**
   * **Accept has no confirmation, and the asymmetry is deliberate.**
   *
   * Accepting creates a commitment the reader can undo at any time by cancelling (FR-632).
   * Declining and cancelling are the ones that destroy something — a proposal cannot be
   * un-declined — which is what earns them a confirmation and denies accept one.
   */
  it('accepts without a confirmation dialog, because accepting is reversible (FR-632)', async () => {
    const { accept } = renderView([PENDING_FOR_READER])

    await userEvent.click(await screen.findByRole('button', { name: /accept the meeting/i }))

    await waitFor(() => expect(accept).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T039a — **every write in this feature is refused offline and NEVER queued** (FR-649).
   *
   * The decorator gives this for free — `cached` intercepts only the methods named as reads, and
   * writes pass straight through to a transport that raises `OfflineError` — which is exactly
   * why it can be lost silently: nothing else in the codebase would notice if `accept` were
   * wrapped in a retry queue one day.
   *
   * The wording carries both halves. "There is no connection" alone would leave an attendee
   * wondering whether their acceptance is waiting somewhere; saying it has **not** been saved to
   * send later is what makes the refusal honest rather than ambiguous.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it.each(['accept', 'decline', 'cancel'] as const)(
    'T039a — refuses %s offline and says nothing was queued (FR-649)',
    async (action) => {
      const failing = vi.fn<AnswerFn>(async () => {
        throw new OfflineError('offline')
      })

      const rows = action === 'cancel' ? [CONFIRMED] : [PENDING_FOR_READER]
      renderView(rows, { [action]: failing })

      const label =
        action === 'accept' ? /accept the meeting/i : new RegExp(`${action} the meeting`, 'i')
      await userEvent.click(await screen.findByRole('button', { name: label }))

      // Decline and cancel go through the shared confirmation first (FR-656); accept does not.
      if (action !== 'accept') {
        await userEvent.click(
          screen.getByRole('button', {
            name: action === 'decline' ? /^decline$/i : /cancel meeting/i,
          }),
        )
      }

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/no connection right now/i)
      expect(
        alert,
        'The refusal does not say that nothing was queued. Every write in this feature is ' +
          'refused rather than queued (FR-649) — an attendee left to assume their acceptance is ' +
          'waiting somewhere has been told something untrue.',
      ).toHaveTextContent(/not been saved to send later/i)
    },
  )

  /**
   * FR-633a surfaced verbatim. The server's message describes the **reader's own schedule to the
   * reader** and never mentions the proposer's, which is what makes explaining it disclose
   * nothing — rewording it here would be a second place for that boundary to be got wrong.
   */
  it('shows the acceptance conflict verbatim from the server (FR-633a)', async () => {
    const accept = vi.fn<AnswerFn>(async () => {
      throw new Error('You already have something else booked at that time.')
    })

    renderView([PENDING_FOR_READER], { accept })

    await userEvent.click(await screen.findByRole('button', { name: /accept the meeting/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already have something else booked/i)
  })
})
