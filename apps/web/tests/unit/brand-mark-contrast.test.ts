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

/**
 * Reads a colour token from the one file that defines colours, resolving `var()` indirection.
 *
 * **The names read here are the SEMANTIC ones the components actually paint with** —
 * `surface-inverse` on the rail, `surface-raised` on the top bar and the auth cards — not the
 * palette entries behind them. They currently resolve to `navy-800` and `surface-card`, so a
 * test that read the palette directly would agree today and silently stop tracking the surface
 * the moment either alias was repointed. Following the same indirection the CSS follows is what
 * keeps this measuring the mark's real background.
 */
const token = (name: string): string => {
  const tokens = readFileSync(join(import.meta.dirname, '../../src/theme/tokens.css'), 'utf8')
  const value = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim()

  if (!value) throw new Error(`Design token --color-${name} is not defined in tokens.css`)

  const indirect = /^var\(--color-([a-z0-9-]+)\)$/i.exec(value)
  if (indirect?.[1]) return token(indirect[1])

  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(
      `Design token --color-${name} resolved to "${value}", which is not a hex colour`,
    )
  }
  return value
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
    // The failure mode this pins: the *navy* mark here would score 1.1:1 and vanish.
    expect(contrast(BRAND_CORAL, token('surface-inverse'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_CORAL, token('surface-inverse'))).toBeCloseTo(5.29, 1)
  })

  it('navy on the raised surface — the top bar and the five authentication cards', () => {
    expect(contrast(BRAND_NAVY, token('surface-raised'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_NAVY, token('surface-raised'))).toBeCloseTo(17.01, 1)
  })

  it('navy on the page background, for the card’s surroundings', () => {
    expect(contrast(BRAND_NAVY, token('surface'))).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
  })

  it('coral on brand navy — the install icon’s own plate', () => {
    expect(contrast(BRAND_CORAL, BRAND_NAVY)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    expect(contrast(BRAND_CORAL, BRAND_NAVY)).toBeCloseTo(5.83, 1)
  })

  /**
   * The swap is the mistake that actually happens, so the wrong answer is asserted to be wrong.
   *
   * **Only one of the two swaps is genuinely invisible, and saying so is the honest version.**
   * Navy on the navy rail is 1.10:1 — gone. Coral on a white card is 2.92:1, which misses the
   * WCAG graphical-object threshold by 2.7% but is plainly *visible* to a person; asserting
   * "< 3" there and calling it invisibility would be a test passing for a reason other than its
   * name, and one that flips red if the brand coral is darkened by a few units with nothing
   * actually wrong. What is true and stable for that pair is that navy is the far better choice
   * on a light surface, by a wide margin.
   */
  it('REJECTS navy on the navy rail, where the mark would be invisible', () => {
    expect(contrast(BRAND_NAVY, token('surface-inverse'))).toBeLessThan(1.5)
  })

  it('prefers navy to coral on a light surface, by a wide margin', () => {
    expect(contrast(BRAND_NAVY, token('surface-raised'))).toBeGreaterThan(
      contrast(BRAND_CORAL, token('surface-raised')) * 3,
    )
  })

  it('checks the method itself against the two ends of the scale', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})
