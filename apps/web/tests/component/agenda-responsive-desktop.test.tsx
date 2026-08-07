import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T089 (005) — the desktop layout (SC-211, Feature Declarations).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The declared desktop layout**: Agenda keeps its single chronological column with venue-day
 * structure, gaining the filter above the programme and a save control on each row; the detail
 * panel renders as a **centred overlay above the programme, which stays visible behind it**.
 *
 * That last clause is the one worth a test rather than a look. It is why the panel is a nested
 * child route (research D4) instead of a sibling: a sibling would unmount the programme, so
 * closing would refetch and the background would be blank on a cold load. The structure below
 * is what makes the declared behaviour true, and it is decidable without a renderer.
 *
 * Measured desktop properties — the panel's actual width at 1440px, no overflow at 1279/1280 —
 * are in `e2e/responsive.spec.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('Agenda at desktop width', () => {
  it('keeps the PROGRAMME MOUNTED behind the open panel (research D4)', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    await screen.findByRole('dialog')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Every other session, the filter, and the day headings are all still rendered. This is the
    // declared desktop behaviour — "the programme stays visible behind it" — and it is also
    // what makes closing a navigation rather than a refetch at every width.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(screen.getByRole('heading', { level: 3, name: 'Open Studio' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All sessions' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Monday 14 September/i })).toBeInTheDocument()
  })

  it('centres the panel rather than docking it to an edge', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    const dialog = await screen.findByRole('dialog')

    // `m-auto` on a top-layer dialog is what centres it in both axes. A drawer docked to the
    // right is a different design, and one the specification does not declare.
    expect(dialog.className).toMatch(/\bm-auto\b/)
    expect(dialog.className).not.toMatch(/\bfixed\b|\bright-0\b|\bleft-0\b/)
  })

  it('dims the programme behind the panel without hiding it', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    const dialog = await screen.findByRole('dialog')

    // A backdrop, at partial opacity: the programme stays visible behind, which is the point of
    // an overlay rather than a page. Fully opaque would make it a screen with extra steps.
    expect(dialog.className).toMatch(/backdrop:/)
    expect(dialog.className).toMatch(/backdrop:bg-\S*\/\d+/)
  })

  it('keeps ONE chronological column with venue-day structure', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // Unchanged from 002 and declared unchanged by 005. Two columns at desktop would break
    // chronology: a reader would go down one column and back up another to read a day in order.
    const days = screen.getAllByRole('region', { name: /September/i })
    expect(days.map((day) => day.getAttribute('aria-label'))).toEqual([
      'Monday 14 September',
      'Tuesday 15 September',
    ])

    for (const day of days) {
      expect(day.querySelector('ul')?.className).not.toMatch(/grid-cols-|columns-/)
    }
  })

  it('renders sessions in chronological order within each day', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // The column is only meaningful if it is ordered. Asserted here as well as in 002's own
    // test because 005 filters this list, and a filter is a place ordering gets lost.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Opening Keynote',
      'Open Studio',
      'Roadmaps That Survive Contact',
    ])
  })
})
