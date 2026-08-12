import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ConferenceList } from '../../src/app/conferences/ConferenceList.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { conference, identity, stubServices } from '../support/services.js'

/**
 * T119 (011) — the conference list, and its two deliberate states (FR-926, FR-936).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`unassigned` MUST BE VISIBLE, AND DECISION 39 IS WHY.**
 *
 * A conference left with no organizer enters an explicit state platform operators can **see**.
 * Reverting ownership silently to the platform tier was considered and rejected — *"a tidier
 * invariant that hides the event nobody is prompted to act on."* So this is a state asking for a
 * decision rather than a quiet default, and rendering it faintly or not at all would defeat the
 * decision while satisfying the schema.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const renderList = (services: ReturnType<typeof stubServices>) =>
  render(
    <MemoryRouter>
      <AdminSessionProvider services={services}>
        <ConferenceList />
      </AdminSessionProvider>
    </MemoryRouter>,
  )

describe('the conference list', () => {
  it('renders the unassigned state prominently (FR-936, decision 39)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      conferences: {
        list: async () => [
          conference({ id: 'a', name: 'An Unassigned Conference', unassigned: true }),
          conference({
            id: 'b',
            name: 'An Organized Conference',
            unassigned: false,
            organizers: [{ attendeeId: 'x', displayName: 'The Organizer' }],
          }),
        ],
      },
    })

    renderList(services)

    expect(await screen.findByText(/nobody organizes this/i)).toBeInTheDocument()
    expect(screen.getByText('The Organizer')).toBeInTheDocument()

    // Exactly one conference is unassigned, so exactly one badge — a list that marked both, or
    // neither, would still render "something" and pass a laxer assertion.
    expect(screen.getAllByText(/nobody organizes this/i)).toHaveLength(1)
  })

  it('renders an organizer’s empty list as a deliberate state, not a blank screen', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      conferences: { list: async () => [] },
    })

    renderList(services)

    const empty = await screen.findByText(/do not organize any conferences/i)
    // Says what it means: their assignments were ended, and **their MyNet account is
    // unaffected** — which is FR-904 stated where somebody would otherwise worry about it.
    expect(empty).toHaveTextContent(/mynet account is unaffected/i)
  })

  it('renders a platform operator’s empty list differently, because it means something else', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      conferences: { list: async () => [] },
    })

    renderList(services)

    // A platform operator with no conferences is looking at an empty product; an organizer with
    // none has had every assignment revoked. Two states, two sentences.
    expect(await screen.findByText(/no conferences exist yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/do not organize any conferences/i)).not.toBeInTheDocument()
  })

  it('shows a loading state while the list is in flight', async () => {
    let release: (value: never[]) => void = () => {}
    const services = stubServices({
      session: { me: async () => identity('platform') },
      conferences: {
        list: async () =>
          new Promise((resolve) => {
            release = resolve as (value: never[]) => void
          }),
      },
    })

    renderList(services)

    expect(await screen.findByText(/loading conferences/i)).toBeInTheDocument()
    release([])
  })
})
