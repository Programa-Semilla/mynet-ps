import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { SignUp } from '../../src/app/auth/SignUp.js'
import { JoinConference } from '../../src/app/join/JoinConference.js'
import { Account } from '../../src/app/profile/Account.js'
import { Profile } from '../../src/app/profile/Profile.js'
import { ProfileEdit } from '../../src/app/profile/ProfileEdit.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T121 (004) — the three layouts, and **no horizontal scrolling at 320px** (SC-309).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY ABOUT LAYOUT — the split 005 recorded.**
 *
 * jsdom applies no stylesheet and computes no layout. It cannot measure a width, cannot tell
 * whether a document scrolls horizontally, and cannot resolve a Tailwind class into a pixel. A
 * test here claiming to check "no horizontal scrolling at 320px" would be checking nothing —
 * the exact shape of green result this codebase warns about repeatedly.
 *
 * So the honest half is here and the measured half is in a real browser:
 *
 *   - **Measured** — document width, overflow, viewport boundaries — by `e2e/responsive.spec.ts`
 *     and `e2e/accessibility/`, which walk 320px and every breakpoint.
 *   - **Structural** — asserted below, because these are what the layout is *made of* and they
 *     are decidable without a renderer: that nothing declares a fixed width, that no container
 *     scrolls horizontally, and that every surface is a single column with its constraint
 *     applied only from the tablet band up.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SURFACES = [
  ['sign-up', <SignUp key="s" />],
  ['join a conference', <JoinConference key="j" />],
  ['profile', <Profile key="p" />],
  ['profile editor', <ProfileEdit key="e" />],
  ['account', <Account key="a" />],
] as const

const renderSurface = (element: React.ReactElement) => {
  const { container } = render(
    <WithServices services={testServices()}>
      <MemoryRouter>
        <ActiveEventProvider>{element}</ActiveEventProvider>
      </MemoryRouter>
    </WithServices>,
  )
  return container
}

/** Every class on every element, which is what the structural assertions read. */
const classesIn = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('*')].flatMap((element) => [...element.classList])

describe('the surfaces 004 introduces, at every width (SC-309)', () => {
  it.each(SURFACES)('%s declares no fixed width', async (_name, element) => {
    const container = renderSurface(element)
    await screen.findByRole('heading', { level: 1 })

    // A fixed width is the single most common cause of horizontal scrolling at 320px: it cannot
    // shrink, so the viewport must grow. `max-w-*` is fine — it is a ceiling, not a floor.
    const fixed = classesIn(container).filter((name) => /^w-\[\d|^min-w-\[\d|^w-\d{3,}/.test(name))

    expect(fixed, 'a fixed width cannot shrink; the viewport has to grow instead (FR-020)').toEqual(
      [],
    )
  })

  it.each(SURFACES)('%s makes nothing scroll horizontally', async (_name, element) => {
    const container = renderSurface(element)
    await screen.findByRole('heading', { level: 1 })

    // "No content or primary action may require horizontal scrolling" is a constraint on the
    // whole product, and a container that scrolls sideways satisfies the letter while breaking
    // the intent.
    const scrolling = classesIn(container).filter((name) => /^overflow-x-(auto|scroll)$/.test(name))

    expect(scrolling).toEqual([])
  })

  it.each(SURFACES)(
    '%s is a single column, constrained only from tablet up',
    async (_name, element) => {
      const container = renderSurface(element)
      await screen.findByRole('heading', { level: 1 })

      const classes = classesIn(container)

      // Multi-column arrangements must be band-qualified. An unqualified `grid-cols-2` is two
      // columns at 320px, which is where a form stops being usable.
      const unqualifiedColumns = classes.filter((name) => /^grid-cols-[2-9]/.test(name))
      expect(unqualifiedColumns).toEqual([])

      // Any horizontal padding beyond the base is band-qualified too, so the narrowest width
      // keeps the most content.
      const unqualifiedWidePadding = classes.filter((name) => /^px-([89]|1[0-9])$/.test(name))
      expect(unqualifiedWidePadding).toEqual([])
    },
  )

  it('stacks the deletion confirmation vertically first, widening only from tablet', async () => {
    const user = userEvent.setup()
    const container = renderSurface(<Account key="a" />)

    await user.click(await screen.findByRole('button', { name: /delete my account/i }))
    await screen.findByRole('dialog', { hidden: true })

    const classes = classesIn(container)

    // A full-width overlay at mobile widths (Mobile layout declaration), with the two controls
    // stacked — `flex-col-reverse` so the confirming action is nearest the thumb without being
    // first in the tab order.
    expect(classes).toContain('flex-col-reverse')
    expect(classes.some((name) => name === 'tablet:flex-row')).toBe(true)
    expect(classes.some((name) => name === 'w-full')).toBe(true)
  })

  it('gives the avatar control a real, labelled, keyboard-reachable target', async () => {
    renderSurface(<Profile key="p" />)

    // A `<label>` bound to a real file input rather than a hidden input clicked by a styled
    // button — the common alternative loses keyboard operability and the accessible name unless
    // both are rebuilt by hand.
    const control = await screen.findByLabelText(/add a photograph/i)
    expect(control).toHaveAttribute('type', 'file')
    expect(control).toHaveAttribute('accept', 'image/*')
  })

  it('keeps the profile a single column at every width, as declared', async () => {
    const container = renderSurface(<ProfileEdit key="e" />)
    await screen.findByLabelText(/^headline$/i)

    // "The profile renders as a single-column form within the multi-column workspace" — the
    // multi-column part is the shell's, not this surface's (Desktop layout declaration).
    const columns = classesIn(container).filter((name) => /grid-cols-/.test(name))
    expect(columns).toEqual([])
  })
})
