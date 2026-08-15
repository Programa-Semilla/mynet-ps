import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OfflineError } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { MORNING, renderAgenda } from '../support/agenda.js'

/**
 * T020 (005) — the save control (FR-184, FR-186, FR-189, FR-196).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The label is the requirement, not the icon.** FR-189 says the control must carry an
 * accessible label stating *what activating it will do*, and that the label must change with
 * the state. A bookmark glyph that fills in conveys the state to a sighted reader and nothing
 * at all to anyone else, which is the class of defect the prototype shipped throughout.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the save control', () => {
  const controlFor = (title: string, action: 'Save' | 'Remove') =>
    screen.getByRole('button', {
      name:
        action === 'Save' ? new RegExp(`save ${title}`, 'i') : new RegExp(`remove ${title}`, 'i'),
    })

  it('carries every session in the programme (FR-196)', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // Three sessions, three controls — not one per day, and not only on the saved ones.
    expect(screen.getAllByRole('button', { name: /save .* to your agenda/i })).toHaveLength(3)
  })

  it('states what activating it will do, and changes that with the state (FR-189)', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // Unsaved: the label describes saving.
    await user.click(controlFor('Opening Keynote', 'Save'))

    // Saved: the same control now describes removal. Same control, different promise.
    await waitFor(() => expect(controlFor('Opening Keynote', 'Remove')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: /save Opening Keynote/i }),
      'The label must not still offer to save a session that is already saved.',
    ).not.toBeInTheDocument()
  })

  it('takes effect with no separate confirming action (FR-186)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    await user.click(controlFor('Opening Keynote', 'Save'))

    await waitFor(() => expect(saved.calls).toEqual([{ op: 'save', sessionId: MORNING.id }]))
    // No dialog, no "confirm" button, nothing to dismiss.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('unsaves a saved session (US1 scenario 2)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ saved: [MORNING.id] })
    await screen.findByText('Opening Keynote')

    await user.click(controlFor('Opening Keynote', 'Remove'))

    await waitFor(() => expect(saved.set.has(MORNING.id)).toBe(false))
    expect(saved.calls).toEqual([{ op: 'unsave', sessionId: MORNING.id }])
  })

  it('is operable by keyboard alone (US1 scenario 7)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    const control = controlFor('Opening Keynote', 'Save')
    control.focus()
    expect(control).toHaveFocus()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(saved.set.has(MORNING.id)).toBe(true))
  })

  it('keeps focus on the control after toggling, so a keyboard journey can continue', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The control must not be `disabled` while the write is in flight. A disabled element is
    // not focusable, so the browser moves focus to the body and a keyboard reader loses their
    // place mid-list — which is exactly the handoff SC-206 tests across the whole journey.
    // Re-entry is safe without disabling because saving is idempotent (FR-187).
    // ───────────────────────────────────────────────────────────────────────────────────────
    const user = userEvent.setup()
    renderAgenda()
    await screen.findByText('Opening Keynote')

    await user.click(controlFor('Opening Keynote', 'Save'))
    await waitFor(() => expect(controlFor('Opening Keynote', 'Remove')).toBeInTheDocument())

    expect(controlFor('Opening Keynote', 'Remove')).toHaveFocus()
  })

  it('REFUSES a write offline, leaves the state unchanged, and queues nothing (FR-217)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving a session'))
    await user.click(controlFor('Opening Keynote', 'Save'))

    // Explained, not silent.
    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent(/connection/i)

    // The displayed state did not change: the control still offers to save.
    expect(controlFor('Opening Keynote', 'Save')).toBeInTheDocument()
    expect(
      saved.set.has(MORNING.id),
      'Nothing may be queued and nothing may be shown as having succeeded.',
    ).toBe(false)

    // And when the connection returns, a retry succeeds without a reload (US4 scenario 6).
    saved.failWrites(null)
    await user.click(controlFor('Opening Keynote', 'Save'))
    await waitFor(() => expect(controlFor('Opening Keynote', 'Remove')).toBeInTheDocument())
  })

  it('distinguishes a server fault from being offline (FR-218)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new Error('server fault'))
    await user.click(controlFor('Opening Keynote', 'Save'))

    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent(/our side/i)
    expect(
      refusal,
      'A server fault must not be reported as a connection problem — the attendee would go and ' +
        'fix a network that is working (FR-059, FR-218).',
    ).not.toHaveTextContent(/there is not one right now/i)
  })
})
