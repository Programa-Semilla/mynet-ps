import type { AppointmentRepository, MeetingSlot } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { ScheduleDialog } from '../../src/app/network/ScheduleDialog.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T078–T080, T088–T090 (008) — the scheduling dialog (FR-624, FR-627, FR-629, FR-655).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFIRMATION IS DISABLED, NEVER A POST-SUBMIT ERROR** (FR-629).
 *
 * `requirements.md` names this treatment explicitly for an invalid empty meeting topic, and the
 * constitution repeats it as a required empty/error state. The server refuses a blank topic too,
 * and the column CHECK refuses it again — but both are backstops: an attendee who *sees* either
 * of them has met the failure this rule exists to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * jsdom implements `<dialog>` structurally but not its modal behaviour, so `showModal` and
 * `close` are absent. Defined once here rather than per test, and deliberately **not** faked
 * into doing something clever: what these tests assert is that the component *calls* the
 * platform's own modal machinery and restores focus in the right order — not that jsdom
 * reproduces the top layer, which it cannot.
 */
beforeAll(() => {
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

const SLOTS: MeetingSlot[] = [
  {
    slotId: 'slot-1',
    startsAt: '2026-09-14T07:30:00.000Z',
    endsAt: '2026-09-14T08:00:00.000Z',
  },
  {
    slotId: 'slot-2',
    startsAt: '2026-09-14T08:00:00.000Z',
    endsAt: '2026-09-14T08:30:00.000Z',
  },
]

type ProposeFn = AppointmentRepository['propose']

const renderDialog = (
  overrides: {
    slots?: AppointmentRepository['slots']
    propose?: ProposeFn
    onClose?: () => void
    onProposed?: () => void
  } = {},
) => {
  const base = testServices().repositories.appointments
  const slots = overrides.slots ?? (async () => SLOTS)
  const propose = overrides.propose ?? vi.fn<ProposeFn>(async () => ({}) as never)
  const onClose = overrides.onClose ?? vi.fn()
  const onProposed = overrides.onProposed ?? vi.fn()

  // A real focusable element standing in for the control that opened the dialog, so focus
  // restoration is asserted against something rather than against a null ref.
  const opener = createRef<HTMLButtonElement>()

  render(
    <WithServices services={testServices({ appointments: { ...base, slots, propose } })}>
      {/*
        The dialog reads the active conference for two things: the event to ask for slots in, and
        the venue timezone every slot is rendered in (FR-624). One provider above the router is
        the shape the real application has, so that a conference switch reaches every scoped
        surface at once (FR-113).
      */}
      <ActiveEventProvider>
        <MemoryRouter>
          <button type="button" ref={opener}>
            Propose a meeting
          </button>
          <ScheduleDialog
            attendeeId="attendee-grace"
            displayName="Grace Hopper"
            onClose={onClose}
            onProposed={onProposed}
            returnFocusTo={opener}
          />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

  return { propose, onClose, onProposed, opener }
}

const confirm = () => screen.getByRole('button', { name: /propose meeting/i })

describe('the scheduling dialog', () => {
  it('T078 — keeps the confirmation DISABLED until both a slot and a topic are present (FR-629)', async () => {
    renderDialog()

    // Nothing chosen: disabled.
    await waitFor(() => expect(confirm()).toBeDisabled())

    // A slot but no topic: still disabled.
    await userEvent.click(await screen.findByRole('radio', { name: /09:30|08:30|07:30/ }))
    expect(confirm()).toBeDisabled()

    // A topic as well: enabled.
    await userEvent.type(screen.getByLabelText(/what is it about/i), 'Design systems')
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('T078 — treats a whitespace-only topic as absent, exactly as the server does (FR-629)', async () => {
    renderDialog()

    await userEvent.click(await screen.findByRole('radio', { name: /09:30|08:30|07:30/ }))
    await userEvent.type(screen.getByLabelText(/what is it about/i), '     ')

    // `trim()` rather than length, so a field of spaces is as invalid here as it is at the
    // database. Otherwise the control enables, the request fails, and the attendee meets exactly
    // the post-submit error FR-629 forbids.
    expect(confirm()).toBeDisabled()
  })

  it('never submits an invalid proposal, because the control cannot be reached', async () => {
    const { propose } = renderDialog()

    await waitFor(() => expect(confirm()).toBeDisabled())
    await userEvent.click(confirm())

    expect(propose).not.toHaveBeenCalled()
  })

  /**
   * T079 — **the no-slots state: an explanation and a close action, and NO selection**
   * (FR-627).
   *
   * The explanation is deliberately about the **reader's own day** — the only true account,
   * since availability is computed from their commitments alone — and says nothing whatever
   * about the invitee, who contributes nothing to the offered set (FR-626).
   */
  it('T079 — renders an explanation and a close action, and offers no selection, when there are no slots (FR-627)', async () => {
    renderDialog({ slots: async () => [] })

    expect(await screen.findByText(/no free times left/i)).toBeInTheDocument()

    // A close action is present…
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    // …and there is nothing to choose, and nothing to press that would fail.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /propose meeting/i })).not.toBeInTheDocument()

    // And it discloses nothing about the invitee — the set is the reader's own.
    const explanation = screen.getByText(/no free times left/i)
    expect(explanation.textContent?.toLowerCase()).not.toContain('grace')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T080 — **Escape closes the dialog, and focus returns to the opener AFTER it closes**
   * (FR-655).
   *
   * The ordering is the part that is easy to get wrong and the part this asserts. While a dialog
   * is modal everything behind it is **inert**, and an inert element cannot take focus — so
   * restoring before closing silently does nothing, focus stays on `<body>`, and a keyboard
   * reader is returned to the top of the page.
   *
   * The approved prototype implements neither Escape nor focus restoration; the register lists
   * both as settled requirements it failed to meet rather than as open questions.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T080 — Escape closes it and returns focus to the opener (FR-655)', async () => {
    const { onClose, opener } = renderDialog()

    await screen.findByRole('radio', { name: /09:30|08:30|07:30/ })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // `toHaveFocus` rather than reading `document.activeElement`: the platform boundary refuses
    // a DOM global in this package (FR-045, SC-008), and jest-dom's matcher is what every other
    // focus assertion in the suite already uses.
    expect(
      opener.current,
      'Focus was not returned to the control that opened the dialog. It must be restored AFTER ' +
        'the dialog closes — an inert element cannot take focus, so restoring first succeeds ' +
        'silently and leaves a keyboard reader at the top of the page (FR-655).',
    ).toHaveFocus()
  })

  it('the close control takes the same path as Escape, so the two cannot differ', async () => {
    const { onClose, opener } = renderDialog()

    await userEvent.click(await screen.findByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
    expect(opener.current).toHaveFocus()
  })

  it('T089 — renders slot times, and names who the meeting is with (FR-624)', async () => {
    renderDialog()

    // The dialog is titled with the invitee — which is the *only* thing their identifier is used
    // for. It must not have influenced which slots were offered (FR-626), which the API tests
    // assert directly.
    expect(await screen.findByText(/with grace hopper/i)).toBeInTheDocument()

    // Two slots, two choices.
    expect(await screen.findAllByRole('radio')).toHaveLength(2)
  })

  it('sends the trimmed topic and the chosen slot, and reports success upward', async () => {
    const propose = vi.fn<ProposeFn>(async () => ({}) as never)
    const { onProposed } = renderDialog({ propose })

    await userEvent.click((await screen.findAllByRole('radio'))[1] as HTMLElement)
    await userEvent.type(screen.getByLabelText(/what is it about/i), '  Design systems  ')
    await userEvent.click(confirm())

    await waitFor(() => expect(propose).toHaveBeenCalled())

    const [, input] = propose.mock.calls[0] ?? []
    if (!input) throw new Error('propose was not called')
    expect(input.slotId).toBe('slot-2')
    // Trimmed on the way out, matching what the disabled-state check measured. Sending the
    // padded string would make the control's enablement and the server's validation disagree.
    expect(input.topic).toBe('Design systems')

    await waitFor(() => expect(onProposed).toHaveBeenCalled())
  })
})
