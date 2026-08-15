import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'

/**
 * T179, T180 (014 tranche 2) — **the directory card and the productive-activity description**
 * (FR-1092, FR-1099d).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Two halves, deliberately together: the description is ON the card when written — it joined
 * the free-text search, and a description somebody can find is one they must be able to read —
 * and it is ABSENT when unset: no empty line, no placeholder, no dash (FR-1092's rule, the one
 * the shipped card already obeys for company, now guarded rather than incidental).
 *
 * Sector and subsector never appear on this card at all: they are not in the directory payload,
 * because their route into Discover is the open filter question (FR-1099, T214) and a card
 * field would answer it by accident.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the attendee card and the taxonomy (FR-1092, FR-1099d)', () => {
  it('shows the productive-activity description where one is written', async () => {
    renderDiscover({
      attendees: [anAttendee({ productiveActivity: 'Fabricamos empaques compostables.' })],
    })

    expect(await screen.findByText('Fabricamos empaques compostables.')).toBeInTheDocument()
  })

  it('renders NOTHING for an unset description — no line, no placeholder, no dash', async () => {
    renderDiscover({ attendees: [anAttendee({ productiveActivity: null })] })

    const card = (await screen.findByRole('link', { name: 'Sofía Muñoz' })).closest('li')
    expect(card).not.toBeNull()
    // No placeholder prose, and no orphaned dash standing in for a value. The separator dot in
    // "Designer · Peña & Asociados" is legitimate; a bare dash token is not.
    expect(card?.textContent).not.toMatch(/not (set|stated|specified)/i)
    expect(card?.textContent).not.toMatch(/(^|\s)[—–-](\s|$)/)
  })
})
