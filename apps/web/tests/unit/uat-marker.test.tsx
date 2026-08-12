import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EnvironmentMarker } from '../../src/shell/EnvironmentMarker.js'

/**
 * T077 (010) — **the environment marker's four constraints, each asserted** (FR-828).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ELEMENT IS ON EVERY VIEW IN THE PRODUCT, SO EVERY COST IT CARRIES IS PAID EVERYWHERE.**
 *
 * That is what turns four small requirements into things worth testing. A focus stop is a
 * keystroke on every keyboard journey through five destinations. A dismiss control is a promise
 * that the marker can be absent at the moment it matters. Colour alone is nothing at all to
 * somebody who cannot see it. None of these would be caught by a test that only asked whether the
 * marker renders.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The guard is a build-time literal, so it is stubbed here rather than imported — see
 * `uat-marker-absent.test.ts` for the assertion that a production build contains no marker at all,
 * which is the half this file cannot make.
 */
describe('the UAT environment marker (FR-828)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const renderMarker = (enabled: boolean) => {
    vi.stubGlobal('__UAT_MARKER__', enabled)
    return render(<EnvironmentMarker />)
  }

  it('renders nothing when the flag is off', () => {
    const { container } = renderMarker(false)
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * "Conveyed in text rather than by colour or position alone." The visible token is three
   * characters; the sentence beside it is what actually says what is going on, and it is the one
   * assistive technology announces.
   */
  it('says what it means in text, not in colour', () => {
    renderMarker(true)

    // Found by its accessible text, which is the only way a screen-reader user meets it.
    expect(
      screen.getByText(/not the live MyNet/i),
      'The marker conveys its meaning only visually. FR-828 requires text, because a coloured ' +
        'stripe reads as "something is different" to a sighted reader and as nothing at all to ' +
        'anybody else.',
    ).toBeInTheDocument()
  })

  it('spells out the consequence, not just the environment name', () => {
    renderMarker(true)
    // "UAT" is jargon. Somebody who followed a link here needs to know their data is not real.
    expect(screen.getByText(/test data/i)).toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **NOT FOCUSABLE, AND THIS IS THE ONE MOST LIKELY TO REGRESS.**
   *
   * The natural way to build this is a small badge component, and badge components acquire
   * `tabIndex` and `title` attributes as they get reused. Every one of those is a stop on the
   * keyboard path through every view in the product, for an element nobody can act on.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('is not focusable', () => {
    const { container } = renderMarker(true)

    expect(container.querySelector('[tabindex]')).toBeNull()
    expect(container.querySelector('a, button, input, select, textarea')).toBeNull()
  })

  it('is not dismissible', () => {
    const { container } = renderMarker(true)

    expect(
      container.querySelector('button, [role="button"]'),
      'The marker has gained a control. An environment marker that can be dismissed is one that ' +
        'is dismissed at the moment somebody most needs to see it.',
    ).toBeNull()
  })

  /**
   * One announcement, not two. The visible token and the sentence say the same thing, so if both
   * were exposed a screen reader would read "U-A-T" and then the sentence.
   */
  it('exposes the sentence and hides the abbreviation from assistive technology', () => {
    const { container } = renderMarker(true)

    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden?.textContent).toBe('UAT')
  })
})
