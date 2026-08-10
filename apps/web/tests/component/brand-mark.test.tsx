import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ResetPassword } from '../../src/app/auth/ResetPassword.js'
import { ResetRequest } from '../../src/app/auth/ResetRequest.js'
import { SignUp } from '../../src/app/auth/SignUp.js'
import { Verify } from '../../src/app/auth/Verify.js'
import { PRODUCT_NAME } from '../../src/app/branding.js'
import { SignInScreen } from '../../src/auth/SignInScreen.js'
import { DesktopRail } from '../../src/shell/DesktopRail.js'
import { TopBar } from '../../src/shell/TopBar.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T046, T047 (010) — **which asset each surface references** (FR-820b, SC-814, research R11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The defect this exists to catch is a mark that passes every other assertion.**
 *
 * A navy mark on the navy rail is not a degraded mark, it is an absent one — and it is present
 * in the DOM, correctly sized, correctly hidden from assistive technology, and indistinguishable
 * from success to every behavioural test that could be written. Nothing here renders pixels, so
 * "is it visible" is not a question this layer can ask.
 *
 * What it *can* ask is which of the two files a surface named, and that is enough to catch the
 * mistake that actually happens: the colourways swapped, or one surface edited later and the
 * other left behind. It is deliberately a weaker guarantee than "the mark is visible", and
 * saying so is the point — the visible half is quickstart scenario 7, done by a person.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Light surfaces take the navy mark; the inverse surface takes the coral one. */
const SURFACES = [
  { name: 'the desktop rail (inverse surface)', colourway: 'coral', Component: DesktopRail },
  { name: 'the top bar (raised surface)', colourway: 'navy', Component: TopBar },
  { name: 'the sign-in screen', colourway: 'navy', Component: SignInScreen },
  { name: 'the sign-up screen', colourway: 'navy', Component: SignUp },
  { name: 'the verification screen', colourway: 'navy', Component: Verify },
  { name: 'the reset-request screen', colourway: 'navy', Component: ResetRequest },
  { name: 'the reset-password screen', colourway: 'navy', Component: ResetPassword },
] as const

const renderSurface = (Component: (typeof SURFACES)[number]['Component']) =>
  render(
    <WithServices services={testServices()}>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </WithServices>,
  )

describe.each(SURFACES)('$name', ({ colourway, Component }) => {
  it(`carries the ${colourway} mark, which is the one visible against this surface`, () => {
    const { container } = renderSurface(Component)
    const marks = container.querySelectorAll('[data-brand-mark]')

    expect(marks).toHaveLength(1)
    expect(marks[0]?.getAttribute('data-brand-mark')).toBe(colourway)
    expect(marks[0]?.getAttribute('src')).toBe(`/brand/mark-${colourway}.png`)
  })

  /**
   * FR-821, SC-807 — the mark adds nothing to the accessibility tree. Every name a screen
   * reader reads on these screens is the text that was already there.
   */
  it('announces nothing — no accessible name, no role, no alt text', () => {
    const { container } = renderSurface(Component)

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(container.querySelector('[data-brand-mark]')?.getAttribute('alt')).toBe('')
    expect(container.querySelector('[data-brand-mark]')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('the headings the mark sits above are unchanged (FR-821, SC-808)', () => {
  const HEADINGS = [
    { Component: SignInScreen, heading: PRODUCT_NAME },
    { Component: SignUp, heading: `Create your ${PRODUCT_NAME} account` },
    { Component: Verify, heading: 'Verify your email address' },
    { Component: ResetRequest, heading: 'Reset your password' },
    { Component: ResetPassword, heading: 'Set a new password' },
  ] as const

  it.each(HEADINGS)('$heading is still the level-1 heading', ({ Component, heading }) => {
    renderSurface(Component)

    // Exactly one `<h1>`, with exactly the text it had before the mark was added above it. An
    // image cannot be a heading, which is why the mark is decorative and sits outside it.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(heading)
  })

  /**
   * FR-826 is an arrangement, not just a presence — "the **stacked** arrangement, mark centred
   * **above** the existing heading". Nothing asserted the *above* part at any layer: a mark
   * rendered below the heading, or outside the card entirely, satisfied the colourway test, the
   * heading test and the end-to-end overflow test alike.
   *
   * Position in pixels is still a human judgement (quickstart scenario 8). Position in the
   * document is not, and it is free to check.
   */
  it.each(HEADINGS)('$heading has the mark above it, in the same header', ({ Component }) => {
    const { container } = renderSurface(Component)
    const mark = container.querySelector('[data-brand-mark]')
    const heading = screen.getByRole('heading', { level: 1 })

    expect(mark).not.toBeNull()
    expect(
      mark!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the mark must precede the heading in document order',
    ).toBeTruthy()
    expect(mark!.closest('header')).toBe(heading.closest('header'))
  })

  it('leaves the rail’s product name as live text rather than replacing it with the mark', () => {
    const { container } = renderSurface(DesktopRail)

    expect(container.querySelector('nav')).toHaveTextContent(PRODUCT_NAME)
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})
