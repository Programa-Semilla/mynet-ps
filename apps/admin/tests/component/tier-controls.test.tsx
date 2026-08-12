import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ConferenceList } from '../../src/app/conferences/ConferenceList.js'
import { AdminShell } from '../../src/app/shell/AdminShell.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { conference, identity, stubServices } from '../support/services.js'

/**
 * T120 (011) — **a conference organizer is rendered NO control for a capability they do not
 * hold** (FR-925).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS SEPARATE FROM THE SERVER REFUSAL, AND BOTH ARE REQUIRED.**
 *
 * `admin-tier-boundary.test.ts` proves an organizer cannot reach a platform address **by direct
 * address entry** — that is the control. This proves they are never offered the door.
 *
 * The two are different guarantees and neither substitutes for the other: **a hidden control an
 * attacker can still call is not security, and a refused call with the button still showing is
 * not usability.** Worse, for the report queue specifically, offering an organizer a link that
 * answers "there is nothing here" would tell them the queue exists — which is precisely what the
 * 404 is shaped to withhold.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const renderShell = (tier: 'platform' | 'organizer') => {
  const services = stubServices({
    session: { me: async () => identity(tier) },
    conferences: {
      list: async () => [
        conference({
          unassigned: false,
          organizers: [{ attendeeId: 'x', displayName: 'The Organizer' }],
        }),
      ],
    },
  })

  return render(
    <MemoryRouter>
      <AdminSessionProvider services={services}>
        <AdminShell>
          <ConferenceList />
        </AdminShell>
      </AdminSessionProvider>
    </MemoryRouter>,
  )
}

describe('what each tier is offered', () => {
  it('offers a platform operator the reports and operators destinations', async () => {
    renderShell('platform')

    expect(await screen.findByRole('link', { name: /reports/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /operators/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /conferences/i })).toBeInTheDocument()
  })

  it('offers a conference organizer NEITHER (FR-925, decision 35)', async () => {
    renderShell('organizer')

    // Conferences is theirs; the other two are not.
    expect(await screen.findByRole('link', { name: /conferences/i })).toBeInTheDocument()

    expect(
      screen.queryByRole('link', { name: /reports/i }),
      'a conference organizer was offered the report queue. They may not read reports AT ALL ' +
        '(decision 35), and a link that answers "there is nothing here" tells them it exists.',
    ).not.toBeInTheDocument()

    expect(screen.queryByRole('link', { name: /operators/i })).not.toBeInTheDocument()
  })

  it('offers a platform operator the promotion and demotion controls', async () => {
    renderShell('platform')

    expect(await screen.findByRole('button', { name: /add an organizer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end their authority/i })).toBeInTheDocument()
  })

  it('offers a conference organizer neither promotion nor demotion (FR-925)', async () => {
    renderShell('organizer')

    // The list renders — they organize this conference — but the acts on it are the platform
    // tier's. The server refuses them with a 404 regardless; this is why they are not asked.
    expect(await screen.findByText('The Organizer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add an organizer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end their authority/i })).not.toBeInTheDocument()
  })

  it('names the tier at all times, so a missing control is legible as a permission (FR-924)', async () => {
    renderShell('organizer')

    // The accessible name is what a screen-reader user gets — "Tier: conference organizer"
    // rather than an unattached noun. The visible text carries the same words, which is why the
    // query below is scoped to the badge rather than to the document: the empty-list copy on
    // the conference screen names the tier too.
    const badge = await screen.findByLabelText(/tier: conference organizer/i)
    expect(badge).toHaveTextContent(/conference organizer/i)
  })
})
