import { ApiError } from '@mynet/data/http'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ProgrammeEditor } from '../../src/app/conferences/ProgrammeEditor.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { adminSession, identity, programme, stubServices } from '../support/services.js'

/**
 * T146 (014 tranche 2) — the enrolment roster and the places-aware delete (FR-1073, FR-1077b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ROSTER IS ONE DELIBERATE CONTROL AWAY, ON OPTIONAL SESSIONS ALONE** (FR-1075a). It is
 * not a column, and the delete-versus-cancel confirmation shows the count and never the names
 * — the act being confirmed is about the session, not about who is in it. So the tests here
 * assert the control's ABSENCE on a mandatory session as firmly as its presence on an optional
 * one: a roster button beside every row would make O1's bounded exception ambient.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const EVENT_ID = 'event-1'

const optional = (over: Parameters<typeof adminSession>[0] = {}) =>
  adminSession({
    kind: 'optional',
    capacity: 12,
    enrolmentClosingOffsetHours: 2,
    placesHeld: 3,
    ...over,
  })

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

describe('the enrolment roster (T146, FR-1073)', () => {
  it('offers the roster on an optional session and NOT on a mandatory one', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          programme({
            sessions: [optional({ id: 's-opt', title: 'Bounded Workshop' }), adminSession()],
          }),
      },
    })
    renderEditor(services)

    await screen.findByText('Bounded Workshop')
    // Exactly one roster control, and it belongs to the optional session — enrolment is the
    // only attendee state any administrative surface may name (O1), and only where it exists.
    expect(screen.getAllByRole('button', { name: /^roster$/i })).toHaveLength(1)
  })

  it('reads the names through the repository, shows the figures, and lists them', async () => {
    const user = userEvent.setup()
    const listEnrolments = vi.fn(async () => [
      { displayName: 'Ada Lovelace' },
      { displayName: 'Grace Hopper' },
    ])
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => programme({ sessions: [optional()] }),
        listEnrolments,
      },
    })
    renderEditor(services)

    await user.click(await screen.findByRole('button', { name: /^roster$/i }))

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(listEnrolments).toHaveBeenCalledWith(EVENT_ID, 'session-1')

    // The held/remaining figures come from the programme payload (`placesHeld`, `capacity`),
    // not from counting the list — the two can legitimately disagree while enrolment moves.
    // Twice on screen deliberately: once on the session row, once on the roster panel.
    expect(screen.getAllByText(/3 of 12 places held/i)).toHaveLength(2)
    expect(screen.getByText(/9 left/i)).toBeInTheDocument()
  })

  it('reads "nobody yet" as a state, not a failure', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => programme({ sessions: [optional({ placesHeld: 0 })] }),
        listEnrolments: async () => [],
      },
    })
    renderEditor(services)

    await user.click(await screen.findByRole('button', { name: /^roster$/i }))

    expect(await screen.findByText(/nobody holds a place yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a failed read as an alert, with the loading state before it', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => programme({ sessions: [optional()] }),
        listEnrolments: async () => {
          throw new ApiError(404, { code: 'not_found' })
        },
      },
    })
    renderEditor(services)

    await user.click(await screen.findByRole('button', { name: /^roster$/i }))

    const alert = await screen.findByRole('alert')
    // The indistinguishable 404: an unassigned organizer and a session that never existed read
    // identically (FR-1073a's assigned-only bound, presented as the server sent it).
    expect(alert).toHaveTextContent(/no longer available/i)
  })
})

describe('deleting with places held sends the figure shown (FR-1077b)', () => {
  it('passes placesSeen, and RE-PRESENTS the server’s new figure on places_changed', async () => {
    const user = userEvent.setup()
    const deleteSession = vi
      .fn()
      .mockRejectedValueOnce(
        // The server spreads `AppError.details` into the body top level (the same shape the
        // route's `detailedRefusal` schema declares), so `placesHeld` rides beside `code`.
        new ApiError(409, { code: 'places_changed', placesHeld: 5 } as never),
      )
      .mockResolvedValueOnce(undefined)
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => programme({ sessions: [optional({ placesHeld: 3 })] }),
        deleteSession,
      },
    })
    renderEditor(services)

    await user.click(await screen.findByRole('button', { name: /cancel or delete/i }))

    // The confirmation shows the figure it will send (FR-1077c's count, FR-1077b's contract).
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/3 attendees hold places/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /delete it permanently/i }))
    expect(deleteSession).toHaveBeenCalledWith(EVENT_ID, 'session-1', 3)

    // Refused: the dialog stays open, the sentence explains, and the FIGURE IS THE SERVER'S —
    // acting again against the stale 3 would loop forever while enrolment moves.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/5 places/i)
    expect(within(dialog).getByText(/5 attendees hold places/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /delete it permanently/i }))
    expect(deleteSession).toHaveBeenLastCalledWith(EVENT_ID, 'session-1', 5)
  })
})
