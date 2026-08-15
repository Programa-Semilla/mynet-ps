import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T088 (005) — the tablet layout (SC-211, Feature Declarations).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The declared tablet layout, asserted where it is decidable.**
 *
 * The specification's tablet row says: the reduced rail is unchanged, the filter stays above
 * the programme, the programme stacks as in 002, and the detail panel remains an overlay
 * **wider relative to the viewport than at desktop**.
 *
 * The measured half — actual widths at 900px, no horizontal scrolling at the 767/768 and
 * 1279/1280 boundaries — is in `e2e/responsive.spec.ts`, because jsdom computes no layout and a
 * component test claiming to measure would be checking nothing. What is decidable here is the
 * **structure**: that the constraint engages at the tablet breakpoint and not before, and that
 * the programme is a single stacking column at every width rather than a grid that reflows.
 *
 * Written as a separate file from the mobile and desktop ones so a failure names the band.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('Agenda at tablet width', () => {
  it('constrains the panel FROM the tablet breakpoint, not below it (FR-199)', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    const dialog = await screen.findByRole('dialog')

    // The constraint is prefixed, so mobile is unaffected by it — which is what makes the
    // mobile sheet full-width and the tablet overlay a card.
    expect(dialog.className).toMatch(/tablet:max-w-/)
    expect(
      dialog.className.replace(/tablet:max-w-\S+/g, ''),
      'an unprefixed max-width would constrain the mobile sheet too',
    ).not.toMatch(/\bmax-w-(?!full)\S/)
  })

  it('keeps the filter ABOVE the programme rather than beside it', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    const group = screen.getByRole('group', { name: /which sessions to show/i })
    const firstDay = screen.getByRole('region', { name: /Monday 14 September/i })

    // Document order is the layout here: nothing floats the filter into a sidebar at any width,
    // so the reading order and the visual order agree at every band.
    expect(group.compareDocumentPosition(firstDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the programme a single stacking column, not a grid that reflows', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // 002's declared shape, unchanged by 005: one chronological column with venue-day
    // structure. A multi-column grid at tablet would break chronology, because a reader would
    // have to go down one column and back up another to read the day in order.
    const days = screen.getAllByRole('region', { name: /September/i })
    expect(days.length).toBeGreaterThan(0)

    for (const day of days) {
      const list = day.querySelector('ul')
      expect(list?.className, 'the day list must stack').not.toMatch(/grid-cols-|columns-/)
    }
  })

  it('applies horizontal padding at tablet without a fixed content width', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    const region = screen.getByRole('region', { name: 'Agenda' })
    // Wider gutters from tablet up, but the measure itself is fluid — the maximum readable
    // measure is the shell's job, applied in one place, not each destination's.
    expect(region.className).toMatch(/tablet:px-/)
    expect(region.className).not.toMatch(/\bw-\[\d+px\]|\bmax-w-\[\d+px\]/)
  })
})
