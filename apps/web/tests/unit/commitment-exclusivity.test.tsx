import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useCommitments } from '../../src/app/agenda/useCommitments.js'
import {
  AFTERNOON,
  commitmentsDouble,
  MORNING,
  renderAgenda,
  WithAgendaProviders,
} from '../support/agenda.js'
import { testServices } from '../support/services.js'

/**
 * T210 (014 tranche 2) — **no route exists by which an optional session can be saved**, and the
 * cost of that absence is presented rather than worked around (FR-1064, FR-1064a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FORBIDDEN STATE IS "SAVED AN OPTIONAL SESSION WHILE HOLDING NO PLACE"** — a bookmark
 * sitting beside a reservation is read as a reservation, and the person who reads it that way
 * finds out by arriving at a full room. The server refuses the state (`not_saveable`, and one
 * discriminated list makes it unrepresentable on the wire — R13); this file asserts the CLIENT
 * offers no route to it either, at both layers a route could exist:
 *
 *   1. **The hook**: `useCommitments.toggle` picks its write by the session's KIND (FR-1063).
 *      Driven directly with an optional session, in both directions, it must call
 *      `enrol`/`release` and never `save`/`unsave`.
 *   2. **The surface**: an optional session renders no save affordance anywhere — the one
 *      control it carries is the take-a-place control.
 *
 * And FR-1064a's cost is a sentence an attendee actually reads, not a silence: there is no way
 * to keep an optional session in view without a place, and the panel says so.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const OPTIONAL = { ...AFTERNOON, kind: 'optional' as const }

/** A minimal probe over the hook itself, so the assertion is about the hook and nothing else. */
const HookProbe = ({ session }: { session: { id: string; kind: 'mandatory' | 'optional' } }) => {
  const commitments = useCommitments('event-1')
  return (
    <button type="button" onClick={() => commitments.toggle(session)}>
      toggle {session.id}
    </button>
  )
}

describe('T210 — the saved-optional state has no client route (FR-1064)', () => {
  it('the hook NEVER calls save for an optional session — committing enrols', async () => {
    const user = userEvent.setup()
    const double = commitmentsDouble()
    const services = testServices({ commitments: double.repository })

    render(
      <WithAgendaProviders services={services}>
        <HookProbe session={{ id: OPTIONAL.id, kind: 'optional' }} />
      </WithAgendaProviders>,
    )

    await user.click(screen.getByRole('button', { name: `toggle ${OPTIONAL.id}` }))

    await waitFor(() => expect(double.calls.map((call) => call.op)).toContain('enrol'))
    expect(
      double.calls.filter((call) => call.op === 'save' || call.op === 'unsave'),
      'The hook reached the save write for an optional session. The write is picked by the ' +
        'session’s KIND (FR-1063), and a membership-derived pick is exactly the route by which ' +
        'a saved optional session would arise (FR-1064).',
    ).toEqual([])
  })

  it('the hook NEVER calls unsave for an optional session — withdrawing releases', async () => {
    const user = userEvent.setup()
    const double = commitmentsDouble([OPTIONAL.id], [], [OPTIONAL.id])
    const services = testServices({ commitments: double.repository })

    render(
      <WithAgendaProviders services={services}>
        <HookProbe session={{ id: OPTIONAL.id, kind: 'optional' }} />
      </WithAgendaProviders>,
    )

    // Wait for the initial read so membership is known, then withdraw.
    await waitFor(() => expect(double.calls.length).toBeGreaterThanOrEqual(0))
    await user.click(screen.getByRole('button', { name: `toggle ${OPTIONAL.id}` }))

    await waitFor(() => expect(double.calls.map((call) => call.op)).toContain('release'))
    expect(double.calls.filter((call) => call.op === 'save' || call.op === 'unsave')).toEqual([])
  })

  it('an optional session renders NO save affordance — the one control takes a place', async () => {
    renderAgenda({ sessions: [MORNING, OPTIONAL] })
    await screen.findByText('Open Studio')

    // The absence, asserted where a route would start. The mandatory neighbour proves the
    // query is not vacuous: its save control is present in the same rendered programme.
    expect(
      screen.getByRole('button', { name: 'Save Opening Keynote to your agenda' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save Open Studio/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take a place in Open Studio' })).toBeInTheDocument()
  })

  it('presents the cost instead of a workaround: no bookmark without a place (FR-1064a)', async () => {
    renderAgenda({
      sessions: [MORNING, OPTIONAL],
      at: `/agenda/${OPTIONAL.id}`,
      placesAvailability: { remaining: 4, open: true },
    })
    await screen.findByRole('heading', { level: 2, name: 'Open Studio' })

    const section = screen.getByRole('region', { name: 'Your commitment' })
    // The sentence is the requirement: the attendee who wants this session in view is told the
    // one way to keep it there, rather than left to discover a refused save.
    expect(
      within(section).getByText(/taking a place is the only way to keep this session/i),
    ).toBeInTheDocument()
    expect(within(section).getByText(/no\s+bookmark without one/i)).toBeInTheDocument()
  })
})
