import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T047a (010) — **each colourway is visible against the surface it sits on** (FR-820c, SC-814).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The accessibility suite cannot cover this, and that is not an oversight.**
 *
 * The mark is `aria-hidden` with empty alt text — decorative, by design, so that no accessible
 * name changes anywhere it appears. axe does not evaluate the contrast of a decorative image,
 * and it is right not to: an image nobody is told about cannot fail to be read. Which leaves the
 * one failure this feature is most likely to ship — a navy mark on the navy rail — with no gate
 * at all. It would be present, correctly sized, correctly hidden, and *invisible*.
 *
 * So the ratio is computed from the two known colours rather than from a rendering. It needs no
 * browser, no screenshot and no new gate class: the mark's colour is a constant of the pipeline
 * and the surface's is a design token, and if those two are close enough the mark is gone.
 *
 * **3:1, not 4.5:1.** WCAG 1.4.11 (non-text contrast) is the applicable threshold — the mark is
 * a graphical object, not text. 1.4.3's 4.5:1 governs the product name beside it, which is real
 * text and unchanged by this feature.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** WCAG 2.x relative luminance. */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** Reads a colour token from the one file that defines colours, rather than restating it here. */
const token = (name: string): string => {
  const tokens = readFileSync(join(import.meta.dirname, '../../src/theme/tokens.css'), 'utf8')
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)
  if (!match?.[1]) throw new Error(`Design token --color-${name} is not a hex value in tokens.css`)
  return match[1]
}

/**
 * The mark's own colours, from the brand board — **identity, not palette**, which is why they
 * are not tokens and do not move when a token moves.
 */
const BRAND_CORAL = '#fe6551'
const BRAND_NAVY = '#0d1942'

/** WCAG 1.4.11 — the threshold for a graphical object. */
const NON_TEXT_MINIMUM = 3

describe('the in-app mark is visible on every surface that carries it (FR-820c)', () => {
  it('coral on the inverse surface — the desktop rail', () => {
    // The failure mode this pins: the *navy* mark here would score 1.2:1 and vanish.
    expect(contrast(BRAND_CORAL, token('navy-800'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_CORAL, token('navy-800'))).toBeCloseTo(5.29, 1)
  })

  it('navy on the raised surface — the top bar and the five authentication cards', () => {
    expect(contrast(BRAND_NAVY, token('surface-card'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_NAVY, token('surface-card'))).toBeCloseTo(17.01, 1)
  })

  it('navy on the page background, for the card’s surroundings', () => {
    expect(contrast(BRAND_NAVY, token('cream-100'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
  })

  it('coral on brand navy — the install icon’s own plate', () => {
    expect(contrast(BRAND_CORAL, BRAND_NAVY)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_CORAL, BRAND_NAVY)).toBeCloseTo(5.83, 1)
  })

  /**
   * The swap is the mistake that actually happens, so both wrong answers are asserted to be
   * wrong. If a future edit puts navy on the rail, this is the line that says why it is a defect
   * rather than a preference.
   */
  it('REJECTS each colourway on the other’s surface — both are invisible there', () => {
    expect(contrast(BRAND_NAVY, token('navy-800'))).toBeLessThan(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_CORAL, token('surface-card'))).toBeLessThan(NON_TEXT_MINIMUM)
  })

  it('checks the method itself against the two ends of the scale', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})
