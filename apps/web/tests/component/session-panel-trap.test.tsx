import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T032 (005) — focus stays within the panel while it is open (FR-202).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **READ THIS BEFORE TRUSTING THIS FILE.**
 *
 * The focus trap is a **browser** guarantee. It comes from `showModal()` putting the dialog in
 * the top layer and making everything behind it inert — and **jsdom implements none of that**
 * (jsdom 30 has no `HTMLDialogElement.showModal` at all; `tests/setup.ts` supplies a shim that
 * deliberately does not emulate the trap).
 *
 * So a component test cannot honestly assert "focus is confined". If it appeared to, it would
 * be asserting the shim — a gate that passes without checking, which is worse than no gate
 * because it reads as coverage.
 *
 * **What is asserted here is the precondition the trap depends on**: that the panel is opened
 * with `showModal()` rather than `show()`, and that it is the element the browser will apply
 * the trap to. **The trap itself is asserted in a real browser** by
 * `e2e/session-panel.spec.ts` ("focus never escapes the open panel") and by the keyboard
 * journey in `e2e/agenda-keyboard-journey.spec.ts`.
 *
 * Research D3 chose the native element for exactly this reason: a hand-written trap over a
 * `div` would be testable here and would be the thing most likely to be wrong, since the
 * prototype's failure at precisely this is the register's own example.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the session panel: the trap’s precondition', () => {
  const openPanel = async () => {
    const user = userEvent.setup()
    renderAgenda()
    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })
    return user
  }

  it('is a real <dialog>, which is what the browser applies the trap to', async () => {
    await openPanel()

    const dialog = screen.getByRole('dialog')
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
  })

  it('was opened with showModal(), not show() — the trap follows from that choice', async () => {
    await openPanel()

    // `show()` renders a non-modal dialog: no top layer, no inertness, and a Tab walks
    // straight out into the programme behind. The distinction is the whole guarantee.
    expect(screen.getByRole('dialog')).toHaveAttribute('data-modal', 'true')
  })

  it('names itself, so the trapped region is announced when focus enters it', async () => {
    await openPanel()

    // Without an accessible name a screen-reader user is told only "dialog" and has to explore
    // to find out what they are now confined to.
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Opening Keynote')
  })

  it('contains its own focusable close control, so the trap is never a dead end', async () => {
    await openPanel()

    // A modal with no focusable control inside it traps focus with nowhere to go. Escape would
    // still work, but a reader who cannot see the panel has no announced way out.
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('button[aria-label="Close session details"]')).not.toBeNull()
  })
})
