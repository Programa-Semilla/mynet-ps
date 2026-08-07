import { OfflineError } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MORNING, renderAgenda } from '../support/agenda.js'

/**
 * T059 (005) — **an offline write is refused, changes nothing, and queues nothing**
 * (FR-217, FR-218, US4 scenarios 3 and 6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"MUST NOT change displayed state, and MUST NOT be queued for later replay."**
 *
 * Both halves are asserted, and the first is why nothing in this feature is optimistic. An
 * optimistic update followed by a rollback would *approximately* satisfy this — the state
 * would end up correct — but the attendee would have watched their session appear as saved and
 * then un-save itself, which is precisely the "shown as having succeeded" the requirement
 * forbids. Awaiting the write is what makes the displayed state simply never move.
 *
 * The second half is why there is no queue at all: a write queue would incur its own recorded
 * decision under the constitution, and this feature deliberately does not take one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('writes attempted with no connection', () => {
  const saveControl = () =>
    screen.getByRole('button', { name: /save Opening Keynote to your agenda/i })

  it('REFUSES with an explanation rather than silently doing nothing (FR-217)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving that session'))
    await user.click(saveControl())

    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent(/needs a connection/i)
  })

  it('LEAVES THE DISPLAYED STATE UNCHANGED (FR-217)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving that session'))
    await user.click(saveControl())
    await screen.findByRole('alert')

    // The control still offers to save, because the session still is not saved. It never
    // flickered into the saved state and back.
    expect(saveControl()).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /remove Opening Keynote/i }),
      'The session must never appear saved when the server has not accepted it.',
    ).not.toBeInTheDocument()
  })

  it('QUEUES NOTHING for later replay (FR-217)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving that session'))
    await user.click(saveControl())
    await screen.findByRole('alert')

    // Coming back online must not cause the refused write to fire by itself. The attendee
    // decides; a queue would decide for them, minutes later, off screen.
    saved.failWrites(null)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(saved.calls, 'nothing may replay itself').toEqual([])
    expect(saved.set.has(MORNING.id)).toBe(false)
  })

  it('says a connection is needed and NOT that something is broken (FR-218)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving that session'))
    await user.click(saveControl())

    const refusal = await screen.findByRole('alert')
    expect(refusal).not.toHaveTextContent(/our side/i)
    // And it tells the attendee nothing was lost, which is the reassurance that stops them
    // trying again in ways that would lose something.
    expect(refusal).toHaveTextContent(/nothing has been queued/i)
  })

  it('succeeds on a retry once the connection returns, with no reload (US4 scenario 6)', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda()
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Saving that session'))
    await user.click(saveControl())
    await screen.findByRole('alert')

    saved.failWrites(null)
    await user.click(saveControl())

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove Opening Keynote/i })).toBeInTheDocument(),
    )
    // And the explanation clears, so an old refusal does not sit beside a control that has
    // since worked.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refuses an unsave the same way, not only a save', async () => {
    const user = userEvent.setup()
    const { saved } = renderAgenda({ saved: [MORNING.id] })
    await screen.findByText('Opening Keynote')

    saved.failWrites(new OfflineError('Removing that session'))
    await user.click(screen.getByRole('button', { name: /remove Opening Keynote/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a connection/i)
    // Still saved — the displayed state did not move in this direction either.
    expect(screen.getByRole('button', { name: /remove Opening Keynote/i })).toBeInTheDocument()
    expect(saved.set.has(MORNING.id)).toBe(true)
  })
})
