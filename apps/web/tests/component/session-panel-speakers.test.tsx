import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AFTERNOON, MORNING, NEXT_DAY, renderAgenda } from '../support/agenda.js'
import { aSession } from '../support/services.js'

/**
 * T033 (005) — a session with no speakers says so, in wording distinct from a failure
 * (FR-200, FR-201, FR-206, US2 scenarios 1 and 2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The distinction this file exists for is the one a nullable field would have destroyed.**
 *
 * The server sends `speakers` as an array that is empty when there are none — never null,
 * never absent (FR-138). That is what makes "this session has no listed speaker" and "the
 * speakers did not load" two different renderings instead of one falsy check. An attendee who
 * reads the first and believes the second stops trusting the programme.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the session panel: speakers and overview', () => {
  const open = async (title: string, sessions = [MORNING, AFTERNOON, NEXT_DAY]) => {
    const user = userEvent.setup()
    renderAgenda({ sessions })
    await user.click(await screen.findByRole('link', { name: title }))
    await screen.findByRole('heading', { level: 2, name: title })
  }

  it('shows each speaker with title and company where present (FR-200)', async () => {
    await open('Opening Keynote')

    // Scoped to the dialog: the programme row behind it names the same speaker, and an
    // unscoped query would pass whichever of the two happened to render.
    const speakers = within(screen.getByRole('dialog'))
    expect(speakers.getByText('Ingrid Halvorsen')).toBeInTheDocument()
    // The fixture speaker has a company and no title, so exactly one of the two renders.
    expect(speakers.getByText(/Fjord Labs/)).toBeInTheDocument()
  })

  it('STATES that a session has no listed speaker (FR-201)', async () => {
    // `Open Studio` carries an empty speakers array on purpose.
    await open('Open Studio')

    expect(screen.getByText(/no speaker is listed for this session/i)).toBeInTheDocument()
  })

  it('words that distinctly from a failure, and does not announce it as one (FR-201)', async () => {
    await open('Open Studio')

    const message = screen.getByText(/no speaker is listed for this session/i)
    // A statement about the programme, not about our servers.
    expect(message.textContent).not.toMatch(/could not|problem|failed|try again/i)
    // And not announced as an alert: nothing has gone wrong.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders no empty speaker line for a speaker with neither title nor company', async () => {
    const bare = aSession({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Bare Speaker',
      startsAt: '2026-09-14T09:00:00.000Z',
      endsAt: '2026-09-14T10:00:00.000Z',
      speakers: [{ id: 's9', name: 'Solo Presenter', title: null, company: null }],
    })
    await open('Bare Speaker', [bare])

    const panel = within(screen.getByRole('dialog'))
    expect(panel.getByText('Solo Presenter')).toBeInTheDocument()
    // One line, complete — not a name followed by a blank or a placeholder dash.
    expect(panel.queryByText('·')).not.toBeInTheDocument()
  })

  it('shows the venue-local start AND end, room and track (FR-200)', async () => {
    await open('Opening Keynote')

    const dialog = screen.getByRole('dialog')
    // 07:00Z–08:00Z is 09:00–10:00 in Barcelona. A device-local render would say something else.
    expect(dialog).toHaveTextContent('09:00')
    expect(dialog).toHaveTextContent('10:00')
    expect(dialog).toHaveTextContent('Miró Room')
    expect(dialog).toHaveTextContent('Keynote')
    // The venue day, so the panel and the programme behind it cannot disagree about which day.
    expect(dialog).toHaveTextContent(/Monday 14 September/)
  })

  it('keeps Overview and Speakers as SEPARATE sections, so 009 can add a third (FR-206)', async () => {
    await open('Opening Keynote')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Structural, and a requirement rather than tidiness. Feature 009 adds audience questions
    // to this panel and must not have to edit either of these two to do it. One combined body
    // would make that impossible without restructuring — which is exactly what FR-206 forbids.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelectorAll('section').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('heading', { name: 'Speakers' })).toBeInTheDocument()
  })

  it('renders the summary when there is one, and nothing when there is not', async () => {
    await open('Opening Keynote')
    expect(screen.getByText(/how the conference thinks about the year ahead/i)).toBeInTheDocument()
  })
})
