import { OfflineError } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MORNING, PROGRAMME, renderAgenda } from '../support/agenda.js'
import { openNotePanel } from '../support/notes.js'

/**
 * T086 (005) — **SC-209: every surface this feature adds renders a visible, meaningful state
 * in all four of loading, populated, empty and failed.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A MATRIX, DELIBERATELY, RATHER THAN FOUR ASSERTIONS SCATTERED ACROSS SIX FILES.**
 *
 * Each surface's individual test file asserts its states in passing, on the way to testing
 * something else — which is how a state comes to be *nearly* covered: the loading case tested
 * for the filter, the failure case for the panel, and nobody notices that the note editor's
 * empty state renders a blank box.
 *
 * This file asserts the property SC-209 actually states, surface by surface, and it is written
 * so that a missing state fails **by name**. "The saved list renders nothing when empty" is a
 * defect somebody can act on; a green suite is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Never resolves — the loading state, held open. */
const pending = <T,>(): Promise<T> => new Promise<T>(() => {})

const failing = async (): Promise<never> => {
  throw new Error('server fault')
}

describe('SC-209 — the filter and the saved list', () => {
  it('LOADING: says the programme is loading', async () => {
    renderAgenda({ overrides: { catalog: { listSessions: pending, listTracks: async () => [] } } })

    // Awaited, not read synchronously: the active conference resolves first and has its own
    // loading line, so a snapshot taken too early records *that* state instead of this one.
    expect(await screen.findByText(/loading the programme/i)).toBeInTheDocument()
  })

  it('POPULATED: renders the programme with its filter', async () => {
    renderAgenda()

    expect(await screen.findByText('Opening Keynote')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All sessions' })).toBeChecked()
  })

  it('EMPTY: the saved view says nothing is saved, and offers the way back', async () => {
    const user = userEvent.setup()
    renderAgenda({ saved: [] })
    await screen.findByText('Opening Keynote')
    await user.click(screen.getByRole('radio', { name: 'Saved' }))

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all sessions/i })).toBeInTheDocument()
  })

  it('EMPTY: the programme itself says a conference has published nothing', async () => {
    renderAgenda({ sessions: [] })

    // A different empty state from the one above, because it is a different fact.
    expect(await screen.findByText(/no published programme/i)).toBeInTheDocument()
  })

  it('FAILED: reports a failure with a retry, and never as an empty programme', async () => {
    renderAgenda({ overrides: { catalog: { listSessions: failing, listTracks: async () => [] } } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/problem on our side/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/no published programme/i)).not.toBeInTheDocument()
  })

  it('FAILED: the saved set failing does not take the programme down with it', async () => {
    renderAgenda({
      overrides: {
        savedSessions: { listSaved: failing, save: async () => {}, unsave: async () => {} },
      },
    })

    // The personal layer failed; the schedule is still readable. Two facts, both said.
    expect(await screen.findByRole('alert')).toHaveTextContent(/saved sessions could not be read/i)
    expect(screen.getByText('Opening Keynote')).toBeInTheDocument()
  })
})

describe('SC-209 — the session detail panel', () => {
  const openWith = async (overrides: Parameters<typeof renderAgenda>[0]) => {
    const user = userEvent.setup()
    renderAgenda({ ...overrides, at: `/agenda/${MORNING.id}` })
    return user
  }

  it('LOADING: a cold load shows the panel loading rather than an empty destination', async () => {
    await openWith({
      overrides: { catalog: { listSessions: pending, listTracks: async () => [] } },
    })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent(/loading this session/i))
  })

  it('POPULATED: renders overview and speakers', async () => {
    await openWith({})

    // The panel's own heading, awaited — the dialog element itself appears in its loading state
    // first, so asserting against it immediately captures the wrong one of the four.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Miró Room')
  })

  it('EMPTY: a session with no speakers says so, distinctly from a failure', async () => {
    renderAgenda({ at: `/agenda/${PROGRAMME[1]?.id ?? ''}` })

    expect(await screen.findByText(/no speaker is listed/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('EMPTY: an address naming no session in this conference is refused, disclosing nothing', async () => {
    renderAgenda({ at: '/agenda/00000000-0000-4000-8000-000000000000' })

    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent(/not available to you/i)
    expect(refusal).not.toHaveTextContent(/another conference|does not exist/i)
  })

  it('FAILED: says the session could not be loaded, as our problem', async () => {
    await openWith({
      overrides: { catalog: { listSessions: failing, listTracks: async () => [] } },
    })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent(/problem on our side/i))
  })

  it('FAILED offline: says a connection is needed instead (FR-218)', async () => {
    await openWith({
      overrides: {
        catalog: {
          listSessions: async () => {
            throw new OfflineError('Loading the programme')
          },
          listTracks: async () => [],
        },
      },
    })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent(/needs a connection/i))
    expect(dialog).not.toHaveTextContent(/problem on our side/i)
  })
})

describe('SC-209 — the note editor', () => {
  it('EMPTY: an empty note is an editor with a prompt, not a blank box', async () => {
    await openNotePanel()

    const field = screen.getByRole('textbox', { name: /private notes/i })
    expect(field).toHaveValue('')
    // "Visible and meaningful" — the placeholder says who can see it, and the status says how
    // saving works, so an empty editor still tells the attendee something true.
    expect(field).toHaveAttribute('placeholder', expect.stringMatching(/only you/i))
    expect(screen.getByRole('status')).toHaveTextContent(/save automatically/i)
  })

  it('POPULATED: a stored note is shown as written', async () => {
    await openNotePanel([
      {
        sessionId: MORNING.id,
        body: 'Read back from the server.',
        updatedAt: '2026-09-14T10:00:00.000Z',
      },
    ])

    expect(screen.getByRole('textbox', { name: /private notes/i })).toHaveValue(
      'Read back from the server.',
    )
  })

  it('SAVING: says so while the write is in flight, without claiming success', async () => {
    const user = userEvent.setup()
    const { notes } = await openNotePanel()

    await user.type(screen.getByRole('textbox', { name: /private notes/i }), 'x')
    await waitFor(() => expect(notes.writes.length).toBeGreaterThan(0), { timeout: 3_000 })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saving/i))
    expect(screen.getByRole('status')).not.toHaveTextContent(/^Saved\.$/)
  })

  it('FAILED: says it is not saved, keeps the text, and offers a retry', async () => {
    const user = userEvent.setup()
    const { notes } = await openNotePanel()

    await user.type(screen.getByRole('textbox', { name: /private notes/i }), 'y')
    await waitFor(() => expect(notes.writes.length).toBeGreaterThan(0), { timeout: 3_000 })
    notes.rejectWrite(0, new Error('server fault'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/not saved/i)
    expect(screen.getByRole('textbox', { name: /private notes/i })).toHaveValue('y')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
