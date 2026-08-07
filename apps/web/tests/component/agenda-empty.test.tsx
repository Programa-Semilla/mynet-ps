import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T022 (005) — the Saved-filter empty state (FR-195, US1 scenario 4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"Never a blank list and never a spinner that never resolves"** is the requirement's own
 * wording, and both halves are asserted here.
 *
 * This state is also the **first thing a reviewer sees**: no saved session is seeded, because
 * seeding attendee-authored content would fabricate personal data. So the state most likely to
 * be skipped is the one on screen at first run — deliberately (data-model.md).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the Saved filter with nothing saved', () => {
  const switchToSaved = async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [] })
    await screen.findByText('Opening Keynote')
    await user.click(screen.getByRole('radio', { name: /saved/i }))
    return user
  }

  it('invites the attendee to explore the programme (FR-195)', async () => {
    await switchToSaved()

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    // Says what to *do*, not merely that there is nothing — the difference between an
    // invitation to explore the programme and a bare "no results".
    expect(screen.getByText(/browse the programme and save the sessions/i)).toBeInTheDocument()
  })

  it('offers an action that returns to the full programme (FR-195)', async () => {
    const user = await switchToSaved()

    const back = await screen.findByRole('button', { name: /show all sessions/i })
    await user.click(back)

    await waitFor(() => expect(screen.getByRole('radio', { name: /all sessions/i })).toBeChecked())
    expect(screen.getByText('Opening Keynote')).toBeInTheDocument()
  })

  it('is NOT a blank list and NOT a spinner (FR-195)', async () => {
    await switchToSaved()
    await screen.findByText(/nothing saved yet/i)

    // No session rows.
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    // No day regions left standing with nothing under them.
    expect(screen.queryByRole('region', { name: /September/i })).not.toBeInTheDocument()
    // Not a loading state: the programme resolved, and the emptiness is an answer.
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('is not announced as a failure', async () => {
    await switchToSaved()
    await screen.findByText(/nothing saved yet/i)

    // An empty agenda is a valid answer. Announcing it as an alert would tell the attendee
    // something is wrong when the truth is that they have not saved anything yet.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still shows the empty state when the conference has no programme at all', async () => {
    const user = userEvent.setup()
    renderAgenda({ sessions: [], saved: [] })

    // FR-139's state, unchanged from 002, is what All shows.
    expect(await screen.findByText(/no published programme/i)).toBeInTheDocument()

    // The filter is still operable, and Saved says the same true thing rather than repeating
    // the programme's wording (Edge Cases: "a conference with no published programme").
    await user.click(screen.getByRole('radio', { name: /saved/i }))
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
  })
})
