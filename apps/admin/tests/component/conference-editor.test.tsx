import { ApiError } from '@mynet/data/http'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ProgrammeEditor } from '../../src/app/conferences/ProgrammeEditor.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { adminSession, identity, programme, stubServices } from '../support/services.js'

/**
 * T190 (014 tranche 2) — **the conference editor, and the caller `patchConference` never had**
 * (FR-1059, FR-1059a, SC-1023, research R20 I11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE UPDATE PATH SHIPPED END TO END IN TRANCHE 1 AND NOTHING CALLED IT**, so a modality —
 * or a name, or a date — chosen wrongly at creation was permanently uncorrectable. The test
 * harness itself proved it: `patchConference` was `unexpected(...)`, so any screen that had
 * called it would have failed a test, and none did. These tests are what make that regression
 * impossible to reintroduce silently: they drive the editor through the screen, so removing
 * the caller removes a green test.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
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

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /edit conference/i }))
}

describe('the conference editor (T190, FR-1059)', () => {
  it('opens pre-filled from the programme and PATCHES modality and format through the repository', async () => {
    const user = userEvent.setup()
    const patchConference = vi.fn(async () => undefined)
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () => programme({ conference: { modality: 'in-person' } }),
        patchConference,
      },
    })
    renderEditor(services)

    await openEditor(user)

    expect(screen.getByLabelText('Name')).toHaveValue('A Conference')
    expect(screen.getByLabelText('Modality')).toHaveValue('in-person')

    // In-person → hybrid: permitted with no further act, because hybrid is satisfied by every
    // room-carrying session (US8 edge case) — and the format is independent (FR-1045).
    await user.selectOptions(screen.getByLabelText('Modality'), 'hybrid')
    await user.selectOptions(screen.getByLabelText('Format'), 'hackathon')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(patchConference).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({ modality: 'hybrid', format: 'hackathon' }),
    )
    // Closed on success — the re-read programme is the confirmation.
    expect(screen.queryByRole('heading', { name: /edit conference/i })).not.toBeInTheDocument()
  })

  it('surfaces a refused modality change NAMING the sessions, and stays open (FR-1059a)', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          programme({
            conference: { modality: 'in-person' },
            sessions: [adminSession({ title: 'Opening Keynote' })],
          }),
        patchConference: async () => {
          // What the server sends for a change the programme cannot satisfy: its own code and
          // the sessions in the way, `would_orphan_sessions`' shape (FR-1014's reasoning).
          throw new ApiError(409, {
            code: 'modality_conflicts_sessions',
            // The server spreads `AppError.details` into the body top level, and `ApiError`
            // keeps the whole body as `details` — so `sessions` rides beside `code`.
            sessions: [{ id: 'session-1', title: 'Opening Keynote' }],
          } as never)
        },
      },
    })
    renderEditor(services)

    await openEditor(user)
    await user.selectOptions(screen.getByLabelText('Modality'), 'virtual')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const alert = await screen.findByRole('alert')
    // Named, so the organizer is not left finding the offending sessions by eye — and hybrid
    // is taught as the route, which is FR-1059a's transitional-modality clause reaching the
    // person at the moment they meet the rule.
    expect(alert).toHaveTextContent(/opening keynote/i)
    expect(alert).toHaveTextContent(/hybrid/i)
    expect(screen.getByRole('heading', { name: /edit conference/i })).toBeInTheDocument()
  })

  it('disables the confirmation while a required field is empty, never erroring afterwards', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: async () => programme() },
    })
    renderEditor(services)

    await openEditor(user)
    await user.clear(screen.getByLabelText('Name'))

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    expect(screen.getByText(/a conference needs a name/i)).toBeInTheDocument()
  })

  it('disables the timezone exactly when the server would refuse it (FR-1015)', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: async () =>
          programme({
            conference: { timezoneEditable: false },
            sessions: [adminSession()],
          }),
      },
    })
    renderEditor(services)

    await openEditor(user)

    const timezone = screen.getByLabelText(/venue timezone/i)
    expect(timezone).toBeDisabled()
    // Explained beside the control rather than mute: the freeze has a reason an organizer can
    // read (session times are stored as absolute instants).
    expect(timezone).toHaveAccessibleDescription(/frozen/i)
  })
})
