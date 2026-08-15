import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'

/**
 * T057, T089 (006) — the three layouts, and the 320px floor (Principle IV, SC-211).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY ABOUT LAYOUT.**
 *
 * jsdom applies no stylesheet and computes no layout. It cannot measure a width, cannot tell
 * whether a document scrolls horizontally, and cannot resolve a Tailwind class into a pixel. A
 * test here claiming to check "no horizontal scrolling at 320px" would be checking nothing —
 * the exact shape of green result this codebase warns about repeatedly. 005's
 * `agenda-responsive-mobile.test.tsx` records the same split, and this file follows it.
 *
 *   - **Measured properties** — document width, overflow, the dialog's box — are asserted in a
 *     real browser at real viewport sizes by `e2e/discover.spec.ts`.
 *   - **Structural properties** are asserted here, because they are what the layouts are *made
 *     of* and they are decidable without a renderer.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const THREE = [
  anAttendee({ attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111', displayName: 'Ada' }),
  anAttendee({ attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222', displayName: 'Bea' }),
  anAttendee({ attendeeId: 'cccccccc-3333-4333-8333-333333333333', displayName: 'Cai' }),
]

describe('the directory grid across the three layouts', () => {
  it('is one column at mobile, two at tablet and three at desktop', async () => {
    renderDiscover({ attendees: THREE })
    await screen.findByText('Ada')

    const grid = screen.getByText('Ada').closest('ul') as HTMLElement

    // Single-column first, so the mobile layout is the base rather than an override — which is
    // what keeps the narrowest width from being the one nobody checked.
    expect(grid.className).toMatch(/\bgrid-cols-1\b/)
    expect(grid.className).toMatch(/tablet:grid-cols-2/)
    expect(grid.className).toMatch(/desktop:grid-cols-3/)
  })

  it('is a grid, NOT a horizontally scrolling row of cards', async () => {
    renderDiscover({ attendees: THREE })
    await screen.findByText('Ada')

    const grid = screen.getByText('Ada').closest('ul') as HTMLElement

    // A carousel is what the prototype's phone frame suggests, and it is the single most direct
    // way to fail the no-horizontal-scroll floor.
    expect(grid.className).not.toMatch(/overflow-x|flex-nowrap|snap-x/)
  })

  it('lets a long company name shrink rather than widen its column', async () => {
    renderDiscover({
      attendees: [
        anAttendee({
          company: 'An Extremely Long Organisation Name That Would Otherwise Push The Column Wide',
        }),
      ],
    })
    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    // `min-w-0` is what allows a flex child to shrink below its content's intrinsic width; the
    // `truncate` is what it shrinks *to*. Without the first, the second never applies.
    expect(card.querySelector('.min-w-0')).not.toBeNull()
    expect(card.querySelector('.truncate')).not.toBeNull()
  })

  it('never declares a fixed pixel width anywhere on the destination', async () => {
    renderDiscover({ attendees: THREE })
    await screen.findByText('Ada')

    const classes = [...screen.getByRole('region', { name: 'Discover' }).querySelectorAll('*')]
      .map((element) => element.className)
      .filter((value): value is string => typeof value === 'string')

    for (const value of classes) {
      expect(value, `fixed width in "${value}"`).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/)
    }
  })

  it('gives every control a 44px minimum touch target', async () => {
    renderDiscover({ attendees: THREE, pages: [{ attendees: THREE, nextCursor: 'more' }] })
    await screen.findByText('Ada')

    for (const control of [
      screen.getByRole('searchbox', { name: /search attendees/i }),
      screen.getByRole('combobox', { name: /^role$/i }),
      screen.getByRole('combobox', { name: /^interest$/i }),
      screen.getByRole('button', { name: /show more attendees/i }),
    ]) {
      expect(control.className, control.getAttribute('id') ?? '').toMatch(/min-h-11/)
    }
  })
})

/**
 * T089 — the profile dialog's own three layouts.
 *
 * **Full width on mobile** is the one worth asserting structurally, because the failure is
 * invisible here and obvious in a browser: the user-agent stylesheet caps a `dialog` at
 * `calc(100% - 6px - 2em)`, which at 320px is 282px — a card floating on a phone with gutters
 * rather than the full-width overlay the layout declares. A max-width always beats a width, so
 * `max-w-full` is the class that actually does it.
 */
describe('the profile dialog across the three layouts', () => {
  const open = async () => {
    const user = userEvent.setup()
    renderDiscover({ attendees: THREE })
    await user.click(await screen.findByRole('link', { name: 'Ada' }))
    return screen.findByRole('dialog')
  }

  it('is declared full width at mobile, constrained only from tablet up', async () => {
    const dialog = await open()

    expect(dialog.className).toMatch(/\bw-full\b/)
    expect(
      dialog.className,
      'without max-w-full the user-agent stylesheet caps the dialog at 282px on a 320px screen',
    ).toMatch(/\bmax-w-full\b/)
    expect(dialog.className).toMatch(/tablet:max-w-/)
  })

  it('is centred, and scrolls vertically rather than horizontally', async () => {
    const dialog = await open()

    expect(dialog.className).toMatch(/\bm-auto\b/)
    expect(dialog.className).toMatch(/overflow-y-auto/)
    expect(dialog.className).not.toMatch(/overflow-x-auto|overflow-x-scroll/)
    expect(dialog.className).toMatch(/max-h-/)
  })
})
