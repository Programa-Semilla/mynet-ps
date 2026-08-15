import { ApiError } from '@mynet/data/http'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ProgrammeEditor } from '../../src/app/conferences/ProgrammeEditor.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { adminSession, identity, programme, stubServices } from '../support/services.js'

/**
 * T040 (014) — the programme editor's three required states, and the colour control (FR-1004).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE EMPTY STATE IS THE FIRST SCREEN OF EVERY NEW CONFERENCE, WHICH IS WHY IT IS TESTED
 * RATHER THAN ASSUMED.**
 *
 * US4 creates a conference with no programme at all, so the empty state is not an edge case
 * reachable by deleting things — it is the entry point. The constitution requires an empty state
 * to be an invitation rather than an absence, and this one carries a second job: saying out loud
 * that there is no draft to publish from, because decision 48 means an organizer authors into a
 * conference their attendees can already see.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE COLOUR CONTROL IS ASSERTED AS AN ABSENCE AS WELL AS A PRESENCE.**
 *
 * FR-1004 is satisfiable in two directions and only one of them survives a later edit: offering
 * the four tokens is the presence, and there being **no `<input type="color">` anywhere** is the
 * absence. A test that only counted the options would stay green if somebody added a free colour
 * input beside them, which is the change FR-1004 exists to prevent — 002 stores a token *name* so
 * the palette lives in one place, and a colour value in the data would move the design system
 * into the database.
 *
 * `track-unknown` must not be offered. It is the neutral an unrecognised token degrades to, so
 * choosing it deliberately would make a real typo indistinguishable from a decision.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const EVENT_ID = 'event-1'

const renderEditor = (services: ReturnType<typeof stubServices>) =>
  render(
    <MemoryRouter initialEntries={[`/conferences/${EVENT_ID}/programme`]}>
      <AdminSessionProvider services={services}>
        <Routes>
          <Route path="/conferences/:eventId/programme" element={<ProgrammeEditor />} />
        </Routes>
      </AdminSessionProvider>
    </MemoryRouter>,
  )

describe('the programme editor', () => {
  it('shows a loading state while the programme is in flight', async () => {
    let release: (value: never) => void = () => {}
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          new Promise((resolve) => {
            release = resolve as (value: never) => void
          }),
      },
    })

    renderEditor(services)

    expect(await screen.findByText(/loading the programme/i)).toBeInTheDocument()
    release(undefined as never)
  })

  it('invites the organizer to author into an empty programme, and says there is no draft state', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: async () => programme({ sessions: [] }) },
    })

    renderEditor(services)

    const empty = await screen.findByText(/no sessions yet/i)
    // Decision 43 stated where somebody would otherwise look for a publish button. An organizer
    // who believes their work is private until published will author into a live conference
    // thinking otherwise, and the empty state is the only screen guaranteed to be read first.
    expect(empty).toHaveTextContent(/see it immediately/i)
    expect(empty).toHaveTextContent(/no draft state/i)
  })

  it('renders the failure state as an alert, and does not render a half-loaded programme behind it', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => {
          throw new ApiError(404, { code: 'not_found' })
        },
      },
    })

    renderEditor(services)

    const alert = await screen.findByRole('alert')
    // The client's own sentence for `not_found`, not the server's — and deliberately reasonless,
    // because a 404 here covers "you do not run this conference", "it is gone" and "it never
    // existed" alike (FR-1036). A message naming any of them would disclose which.
    expect(alert).toHaveTextContent(/no longer available/i)

    // Nothing from the programme may render beside the failure. A conference name with no
    // sessions under it reads as an empty conference rather than as a failed read.
    expect(screen.queryByRole('heading', { name: /a conference/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/no sessions yet/i)).not.toBeInTheDocument()
  })

  it('offers exactly the four track colour tokens, and no free colour input (FR-1004)', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: async () => programme({ sessions: [adminSession()] }) },
    })

    const { container } = renderEditor(services)

    const colour = await screen.findByLabelText(/^colour$/i)
    const options = within(colour).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Design',
      'Product',
      'Tech',
      'Keynote',
    ])

    // `track-unknown` is the defined fallback, never an offer.
    expect(options.map((option) => (option as HTMLOptionElement).value)).not.toContain(
      'track-unknown',
    )

    // The absence half of FR-1004. A picker beside a free input satisfies every assertion above.
    expect(container.querySelector('input[type="color"]')).toBeNull()
  })

  it('shows the join code so an organizer can distribute it without a second screen', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: async () => programme() },
    })

    renderEditor(services)

    expect(await screen.findByText('JOINCODE')).toBeInTheDocument()
  })

  it('states cancellation in text on the session row, never by colour alone (FR-1022)', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          programme({
            sessions: [adminSession({ cancelledAt: '2027-03-01T08:00:00.000Z' })],
          }),
      },
    })

    renderEditor(services)

    expect(await screen.findByText('Cancelled')).toBeInTheDocument()

    // A cancelled session offers reinstatement instead of the cancel-or-delete decision: the
    // decision has already been taken, and re-offering it would let one be cancelled twice.
    expect(screen.getByRole('button', { name: /reinstate/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel or delete/i })).not.toBeInTheDocument()
  })

  it('shows engagement as counts with nobody named (FR-1025)', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          programme({
            sessions: [
              adminSession({ engagement: { saved: 3, notes: 2, questions: 1, votes: 7 } }),
            ],
          }),
      },
    })

    renderEditor(services)

    const counts = await screen.findByText(/3 saved/i)
    expect(counts).toHaveTextContent(/2 notes/i)
    expect(counts).toHaveTextContent(/1 questions/i)
    expect(counts).toHaveTextContent(/7 votes/i)
  })
})
