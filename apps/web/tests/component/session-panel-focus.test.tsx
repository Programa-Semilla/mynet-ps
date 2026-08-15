import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MORNING, renderAgenda } from '../support/agenda.js'

/**
 * T031 (005) — Escape closes the panel, and focus returns to the control that opened it
 * (FR-202, FR-205, US2 scenario 3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **These are the two halves the platform does NOT hand us**, and they are therefore the two
 * worth testing here.
 *
 * `<dialog>`'s `showModal()` gives the focus trap, the inert background and Escape dismissal.
 * What it does not give is (a) focus returning to the opener, which is unreliable across
 * engines, and (b) any knowledge of the address — Escape would close the dialog while the URL
 * still named the session, and the next render would re-open it.
 *
 * So this file tests **our** wiring: that `cancel` reaches the same close path as the button,
 * and that we put focus back ourselves. jsdom implements no part of `<dialog>`, so the real
 * trap and the real Escape are proved in a browser by `e2e/session-panel.spec.ts` — see the
 * note on the shim in `tests/setup.ts` for why that split is deliberate rather than a gap.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the session panel: dismissal and focus', () => {
  const openPanel = async () => {
    const user = userEvent.setup()
    renderAgenda()
    const opener = await screen.findByRole('link', { name: 'Opening Keynote' })
    await user.click(opener)
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })
    return { user, opener }
  }

  it('opens from the session title, at the session’s own address (FR-198)', async () => {
    const { opener } = await openPanel()

    expect(opener).toHaveAttribute('href', `/agenda/${MORNING.id}`)
    expect(screen.getByRole('heading', { level: 2, name: 'Opening Keynote' })).toBeInTheDocument()
  })

  it('opens MODALLY rather than inline', async () => {
    await openPanel()

    // `showModal`, not `show`. Only the modal form gives the focus trap and the inert
    // background; `show` would render an overlay a Tab could walk straight out of. The
    // attribute is the jsdom shim's record of which was called — the trap itself is a browser
    // guarantee and is asserted in the end-to-end suite.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('data-modal', 'true')
  })

  it('closes on Escape and RETURNS FOCUS to the control that opened it (FR-202)', async () => {
    const { user, opener } = await openPanel()

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Opening Keynote' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      opener,
      'Focus must land back on the row that opened the panel. Left on the body, a keyboard ' +
        'reader is returned to the top of the document and loses their place in the programme.',
    ).toHaveFocus()
  })

  it('closes on the close control, by the same path (T037)', async () => {
    const { user, opener } = await openPanel()

    await user.click(screen.getByRole('button', { name: /close session details/i }))

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Opening Keynote' }),
      ).not.toBeInTheDocument(),
    )
    // Identical outcome to Escape — the address returns to the programme and focus comes back.
    expect(opener).toHaveFocus()
  })

  it('offers a visible, labelled close control (FR-202)', async () => {
    await openPanel()

    const close = screen.getByRole('button', { name: /close session details/i })
    expect(close).toBeVisible()
    // Touch-sized, so it is operable at 320px without crowding the title beside it.
    expect(close.className).toMatch(/size-11/)
  })

  it('leaves the programme mounted behind the panel (research D4)', async () => {
    await openPanel()

    // Nested route, not a sibling: closing is a navigation rather than a refetch, and the
    // background is not blank on a cold load. The other sessions are still rendered.
    expect(screen.getByRole('heading', { level: 3, name: 'Open Studio' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /all sessions/i })).toBeInTheDocument()
  })
})
