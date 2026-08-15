import { OfflineError } from '@mynet/data'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AFTERNOON, MORNING, renderAgenda } from '../support/agenda.js'

/**
 * T208, T209 (014 tranche 2) — the panel's commitment section: the control, and the LIVE
 * remaining-places figure in text (FR-1063, FR-1070, FR-1070a, FR-1070b).
 */

const OPTIONAL = { ...AFTERNOON, kind: 'optional' as const }

const openPanel = async (options: Parameters<typeof renderAgenda>[0] = {}) => {
  const rendered = renderAgenda({
    sessions: [MORNING, OPTIONAL],
    at: `/agenda/${OPTIONAL.id}`,
    ...options,
  })
  await screen.findByRole('heading', { level: 2, name: 'Open Studio' })
  return rendered
}

/** The panel's own commitment section, so no assertion can accidentally read the row behind. */
const section = () => screen.getByRole('region', { name: 'Your commitment' })

describe('the panel commitment section (T208, T209)', () => {
  it('shows "N places left" as TEXT beside the control, read live (FR-1070)', async () => {
    await openPanel({ placesAvailability: { remaining: 4, open: true } })

    expect(await within(section()).findByText('4 places left')).toBeInTheDocument()
    expect(
      within(section()).getByRole('button', { name: 'Take a place in Open Studio' }),
    ).toBeInTheDocument()
  })

  it('says "1 place left" in the singular — a number an attendee reads, not a datum', async () => {
    await openPanel({ placesAvailability: { remaining: 1, open: true } })
    expect(await within(section()).findByText('1 place left')).toBeInTheDocument()
  })

  it('says "Session full" at zero, while enrolment is still open (FR-1069’s distinction)', async () => {
    await openPanel({ placesAvailability: { remaining: 0, open: true } })
    expect(await within(section()).findByText('Session full')).toBeInTheDocument()
  })

  it('says "Enrolment closed" once the deadline has passed, whatever the number', async () => {
    // Remaining places exist and the deadline governs anyway: closed is the fact that decides
    // whether taking a place can succeed, so it is the fact shown (FR-1071).
    await openPanel({ placesAvailability: { remaining: 3, open: false } })
    expect(await within(section()).findByText('Enrolment closed')).toBeInTheDocument()
  })

  it('OMITS the figure entirely when it cannot be read live — never a stale number (FR-1070b)', async () => {
    await openPanel({ placesAvailability: new OfflineError('offline') })

    // The control renders; the figure does not, and neither does an error about it. Where the
    // live read fails, absence is the honest rendering — a number would be a promise of a
    // place nobody can keep, and a failure banner would outweigh a figure nobody asked for.
    expect(
      within(section()).getByRole('button', { name: 'Take a place in Open Studio' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(within(section()).queryByText(/places? left/i)).not.toBeInTheDocument()
      expect(within(section()).queryByText(/session full/i)).not.toBeInTheDocument()
      expect(within(section()).queryByText(/enrolment closed/i)).not.toBeInTheDocument()
    })
  })

  it('presents FR-1064a’s cost: no bookmark without a place, said in the section', async () => {
    await openPanel({ placesAvailability: { remaining: 4, open: true } })

    expect(
      within(section()).getByText(/taking a place is the only way to keep this session/i),
    ).toBeInTheDocument()
    expect(within(section()).getByText(/no\s+bookmark without one/i)).toBeInTheDocument()
  })

  it('renders NO places figure for a mandatory session — it has no places to count (FR-1070a)', async () => {
    renderAgenda({
      sessions: [MORNING, OPTIONAL],
      at: `/agenda/${MORNING.id}`,
      placesAvailability: { remaining: 4, open: true },
    })
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

    expect(screen.queryByText(/places? left/i)).not.toBeInTheDocument()
    // And the mandatory control is the save control, in the panel exactly as on the row.
    expect(
      within(screen.getByRole('region', { name: 'Your commitment' })).getByRole('button', {
        name: 'Save Opening Keynote to your agenda',
      }),
    ).toBeInTheDocument()
  })

  it('enrolling from the panel passes through the same FR-1074 notice, then re-reads the figure', async () => {
    const user = userEvent.setup()
    const { saved } = await openPanel({ placesAvailability: { remaining: 2, open: true } })
    await within(section()).findByText('2 places left')

    await user.click(within(section()).getByRole('button', { name: 'Take a place in Open Studio' }))
    const notice = await screen.findByRole('dialog', { name: 'Before you take a place' })
    await user.click(within(notice).getByRole('button', { name: 'Take a place' }))

    await waitFor(() => expect(saved.calls.map((call) => call.op)).toContain('enrol'))
    // The figure re-reads on the attendee's own commitment change: the places read runs again
    // rather than leaving the pre-enrolment number beside a just-taken place (FR-1070b).
    await waitFor(() =>
      expect(saved.calls.filter((call) => call.op === 'places').length).toBeGreaterThan(1),
    )
  })
})
