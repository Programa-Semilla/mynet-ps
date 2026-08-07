import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T087 (005) — the mobile layout, at **320px** (FR-197, FR-199, SC-211).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY ABOUT LAYOUT — READ BEFORE ADDING HERE.**
 *
 * jsdom applies no stylesheet and computes no layout. It cannot measure a width, cannot tell
 * whether a document scrolls horizontally, and cannot resolve a Tailwind class into a pixel.
 * A test here that claimed to check "no horizontal scrolling at 320px" would be checking
 * nothing at all — the exact shape of green result this codebase warns about repeatedly.
 *
 * So the split is deliberate and the honest half is here:
 *
 *   - **Measured properties** — document width, overflow, the panel's box — are asserted in a
 *     real browser at real viewport sizes by `e2e/responsive.spec.ts` and
 *     `e2e/session-panel.spec.ts`, which already walk 320px and every breakpoint boundary.
 *
 *   - **Structural properties** are asserted here, because they are what the mobile layout is
 *     *made of* and they are decidable without a renderer: that the touch targets are declared
 *     at 44px, that nothing on Agenda is a fixed-width or horizontally-scrolling container,
 *     and that the panel is declared full-width with its constraint only from tablet up.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('Agenda at the narrowest supported width', () => {
  it('gives every save control a 44px touch target (FR-197)', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    for (const control of screen.getAllByRole('button', { name: /to your agenda/i })) {
      // `size-11` is 44px at this project's 4px base. Declared on the control's own box rather
      // than on the row, so the target is real without padding the row out of shape.
      expect(control.className, control.getAttribute('aria-label') ?? '').toMatch(/size-11/)
    }
  })

  it('gives the filter options a 44px minimum height, and the input fills the segment', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    for (const option of screen.getAllByRole('radio')) {
      const label = option.closest('label')
      expect(label?.className).toMatch(/min-h-11/)
      // The input is stretched over the segment rather than clipped to 1px, so the thing a
      // finger hits is the thing the accessibility tree names.
      expect(option.className).toMatch(/inset-0/)
    }
  })

  it('lays the filter out as a flex row, NOT a horizontally scrolling strip (SC-211)', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    const group = screen.getByRole('group', { name: /which sessions to show/i })
    const strip = group.querySelector('div')

    expect(strip?.className).toMatch(/\bflex\b/)
    // A scrolling tab strip is the usual way this control stops fitting at 320px.
    expect(strip?.className).not.toMatch(/overflow-x|whitespace-nowrap|min-w-\[/)
  })

  it('declares the panel FULL WIDTH at mobile, constrained only from tablet up (FR-199)', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    const dialog = await screen.findByRole('dialog')

    expect(dialog.className).toMatch(/\bw-full\b/)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `max-w-full` is not redundant with `w-full`. The user-agent stylesheet caps a `dialog` at
    // `calc(100% - 6px - 2em)`, which at 320px is 282px — a card with gutters, not a full-width
    // overlay. A max-width always beats a width, so this is the class that actually does it,
    // and a browser measurement is what found that out.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      dialog.className,
      'without max-w-full the user-agent stylesheet caps the panel at 282px on a 320px screen',
    ).toMatch(/\bmax-w-full\b/)
    // Constrained only from tablet up, so mobile genuinely spans the viewport.
    expect(dialog.className).toMatch(/tablet:max-w-/)
  })

  it('scrolls the panel VERTICALLY, never horizontally (SC-211)', async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))

    const dialog = await screen.findByRole('dialog')

    // A long summary must not make the page wider; it makes the panel taller and scrollable.
    expect(dialog.className).toMatch(/overflow-y-auto/)
    expect(dialog.className).not.toMatch(/overflow-x-auto|overflow-x-scroll/)
    expect(dialog.className).toMatch(/max-h-/)
  })

  it('keeps the session row wrapping rather than forcing a minimum width', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // The title and its track chip share a line and wrap when they cannot; the row's content
    // column is `min-w-0` so a long title shrinks instead of pushing the row wider.
    const row = screen.getByText('Opening Keynote').closest('li')
    expect(row?.querySelector('.min-w-0')).not.toBeNull()
    expect(row?.querySelector('.flex-wrap')).not.toBeNull()
  })

  it('never declares a fixed pixel width anywhere on Agenda', async () => {
    renderAgenda()
    await screen.findByText('Opening Keynote')

    // A fixed width is the single most common cause of horizontal scrolling at 320px, and it is
    // decidable from the class names alone.
    const classes = [
      ...screen.getByRole('region', { name: /Monday 14 September/i }).querySelectorAll('*'),
    ]
      .map((element) => element.className)
      .filter((value): value is string => typeof value === 'string')

    for (const value of classes) {
      expect(value, `fixed width in "${value}"`).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/)
    }
  })
})
