import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { buildAssets } from './generate-brand-assets.mjs'
import {
  CROP,
  ICO_OUTPUT,
  INSTALL_ICONS,
  MASTER_HEIGHT,
  MAX_UPSCALE,
  PLATE,
  assertSourceDimensions,
  buildInstallIcons,
  cornerDistance,
  markScaleFactors,
  maskableMarkHeight,
  safeRadius,
} from './generate-install-icons.mjs'

/**
 * T056–T058 (016) — the second pipeline's maths and its boundary with the first.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THE BOUNDARY IS THE PART MOST WORTH TESTING, BECAUSE NOTHING ELSE WOULD NOTICE IT MOVING.**
 *
 * 016 puts two derivation pipelines in one repository, over two sources, writing into one
 * `public/` directory. A change that pointed either at the other's source, or that let one start
 * writing the other's outputs, would produce a complete set of plausible-looking icons — and
 * would silently resolve **register entry 28**, which asks which of the two marks is MyNet's and
 * which no feature may answer by quietly replacing one with the other.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

describe('the install-icon source', () => {
  it('is the second brand source, at the dimensions every constant was measured against', async () => {
    const meta = await sharp(fromRoot('assets/brand/new-logo.png')).metadata()

    expect(meta.width).toBe(114)
    expect(meta.height).toBe(133)
    expect(() => assertSourceDimensions(meta)).not.toThrow()
  })

  it('refuses a source of any other size rather than cropping somebody’s whitespace', () => {
    expect(() => assertSourceDimensions({ width: 1254, height: 1254 })).toThrow(
      /unexpected dimensions/i,
    )
    // The board's own size is the most likely wrong input, so it is named explicitly above.
    expect(() => assertSourceDimensions({ width: 114, height: 134 })).toThrow(
      /No asset was written/,
    )
  })

  /**
   * T060 — **the wordmark is cropped away** (FR-1041).
   *
   * The source is a lockup: a mark at rows 10–101 and the product's name at rows 105–123,
   * separated by blank rows. The crop must take the first and not the second, because a raster
   * lockup stays forbidden (decision 30) and a wordmark baked into a 192px launcher icon is
   * illegible at the size it is drawn.
   */
  it('crops to the mark and excludes the wordmark (FR-1041)', () => {
    expect(CROP).toEqual({ left: 10, top: 10, width: 92, height: 92 })

    // The wordmark begins at row 105. The crop must end before it.
    expect(
      CROP.top + CROP.height,
      'The crop reaches into the wordmark band (rows 105–123). An icon derives from the mark, ' +
        'never the mark plus rendered text.',
    ).toBeLessThan(105)
  })

  it('leaves no ink outside the crop except the wordmark', async () => {
    const { data, info } = await sharp(fromRoot('assets/brand/new-logo.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })

    const nonWhite = (x, y) => {
      const i = (y * info.width + x) * info.channels
      return 255 - data[i] + (255 - data[i + 1]) + (255 - data[i + 2]) > 30
    }

    const strays = []
    for (let y = 0; y < 105; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const insideCrop =
          x >= CROP.left &&
          x < CROP.left + CROP.width &&
          y >= CROP.top &&
          y < CROP.top + CROP.height
        if (!insideCrop && nonWhite(x, y)) strays.push(`${x},${y}`)
      }
    }

    expect(
      strays,
      'There is ink outside the crop rectangle and above the wordmark, so the crop is losing ' +
        'part of the mark.',
    ).toEqual([])
  })
})

describe('maskable safe-zone geometry (FR-1043)', () => {
  it('keeps the mark’s bounding box entirely inside the 80%-diameter safe circle', () => {
    expect(cornerDistance(maskableMarkHeight(512))).toBeCloseTo(safeRadius(512), 6)
    expect(cornerDistance(maskableMarkHeight(512))).toBeLessThanOrEqual(safeRadius(512) + 1e-9)
  })

  /**
   * The wrong answer, asserted beside the right one — 010's technique, and the reason it exists
   * is that the specification's narrative implied the wrong one and no other gate could see the
   * result. For this square mark the naive sizing overshoots by exactly √2.
   */
  it('REJECTS the naive `0.8 × size` sizing, which puts the corners outside the mask', () => {
    const naive = cornerDistance(0.8 * 512)

    expect(naive).toBeGreaterThan(safeRadius(512))
    expect(naive / safeRadius(512)).toBeCloseTo(Math.SQRT2, 3)
  })

  it('scales with the icon, so a later size inherits the constraint rather than a constant', () => {
    for (const size of [192, 256, 512, 1024]) {
      expect(cornerDistance(maskableMarkHeight(size))).toBeCloseTo(safeRadius(size), 6)
    }
  })
})

describe('the recorded upscale exception (FR-1045)', () => {
  it('measures every factor against the real master rather than a restated number', () => {
    expect(MASTER_HEIGHT).toBe(CROP.height)
    expect(MASTER_HEIGHT).toBe(92)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE EXCEPTION IS APPLIED TO THE WHOLE INVENTORY, NOT TO A HAND-KEPT SUBSET OF IT**
   * (deep review A1/T7 — found independently by two reviewers, which is why it is guarded twice).
   *
   * The measured set and the written set were two literal lists: six pairs measured, seven files
   * written, nothing relating them. An `icon-1024.png` added to the builder alone would draw the
   * mark at 6.46× from a 92px master while `MAX_UPSCALE` stayed 3.23 and every equality check
   * passed — **the exact outcome FR-1045 exists to make impossible**.
   *
   * `INSTALL_ICONS` closes it at the source: both are projections of one list, so a new output
   * raises `MAX_UPSCALE` and fails by existing. This asserts the one remaining route back —
   * appending an output inside `buildInstallIcons` beside the loop — and it is an **equality**,
   * so a measurement left behind for a file the pipeline stopped writing fails as well.
   *
   * `brand-audit.mjs` makes the same assertion, deliberately. The two fail at different moments:
   * this needs no build and runs in CI's `test-unit` job, that runs after `pnpm build`. 010's
   * whole lesson was a check that could never execute, so the duplication is the point.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('measures EVERY drawn output, so a new icon cannot escape the exception', async () => {
    const drawn = (await buildInstallIcons())
      .map(([path]) => path)
      .filter((path) => path.endsWith('.png'))

    expect(
      markScaleFactors()
        .map(({ path }) => path)
        .sort(),
      'The scale table and the pipeline inventory disagree. An output the table does not measure ' +
        'may enlarge the mark by any factor with every other check still green; a measurement ' +
        'with no artifact makes the table look more complete than it is.',
    ).toEqual(drawn.sort())
  })

  it('draws no mark in the `.ico`, which is why it is the one output with no factor', async () => {
    // A container around two PNGs the inventory already produced. Measuring it would count the
    // 16 and 32px marks twice and report the pipeline as scaling in more places than it does.
    expect(ICO_OUTPUT.from).toEqual([
      'apps/web/public/favicon-16.png',
      'apps/web/public/favicon-32.png',
    ])
    for (const path of ICO_OUTPUT.from) {
      expect(INSTALL_ICONS.some((icon) => icon.path === path)).toBe(true)
    }
  })

  /**
   * `MAX_UPSCALE` is the inventory's maximum rather than a restated `512 × 0.58`. A literal could
   * not *rise* when the pipeline started drawing something larger, which is how a new output would
   * have satisfied an equality check written against the old maximum.
   */
  it('derives the ceiling from the inventory rather than restating one output’s arithmetic', () => {
    expect(MAX_UPSCALE).toBe(
      Math.max(...INSTALL_ICONS.map(({ markHeight }) => markHeight)) / MASTER_HEIGHT,
    )

    const hypothetical = Math.max(...INSTALL_ICONS.map((i) => i.markHeight), 1024 * 0.58)
    expect(
      hypothetical / MASTER_HEIGHT,
      'Adding a 1024px icon would leave the recorded 3.23× exception unchanged, so the exception ' +
        'would cover an output nobody weighed.',
    ).toBeGreaterThan(MAX_UPSCALE + 0.005)
  })

  it('names the largest factor, and it is the 512 icon', () => {
    const largest = markScaleFactors().reduce((a, b) => (a.factor > b.factor ? a : b))

    expect(largest.path).toBe('apps/web/public/icons/icon-512.png')
    expect(largest.factor).toBeCloseTo(MAX_UPSCALE, 9)
    expect(MAX_UPSCALE).toBeCloseTo(3.23, 2)
  })

  it('leaves the favicons DOWNscaled, so the exception covers only what it must', () => {
    const favicons = markScaleFactors().filter(({ path }) => path.includes('favicon'))

    expect(favicons).toHaveLength(2)
    for (const { path, factor } of favicons) {
      expect(factor, `${path} is upscaled and need not be`).toBeLessThan(1)
    }
  })
})

describe('regeneration is byte-identical (FR-1042)', () => {
  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Two independent builds, compared to each other — not to disk.**
   *
   * `brand-audit.mjs` already compares one build against the committed files, which catches a
   * hand-edited asset. It does **not** catch a *non-deterministic* pipeline: a build whose output
   * varied would fail the audit sometimes, look like a flake, and be re-run until it passed.
   * Building twice in one process is what distinguishes the two.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('produces identical bytes from unchanged inputs', async () => {
    const first = await buildInstallIcons()
    const second = await buildInstallIcons()

    expect(second.map(([path]) => path)).toEqual(first.map(([path]) => path))

    for (const [index, [path, bytes]] of first.entries()) {
      expect(
        bytes.equals(second[index][1]),
        `${path} differs between two builds from the same input, so the pipeline is not ` +
          'deterministic. A varying asset fails the audit intermittently and reads as a flake.',
      ).toBe(true)
    }
  })
})

describe('the boundary between the two pipelines', () => {
  const installPaths = async () => (await buildInstallIcons()).map(([path]) => path)
  const boardPaths = async () => (await buildAssets()).map(([path]) => path)

  it('T058 — writes MyNet’s install icons and favicons, and nothing else (FR-1038)', async () => {
    expect((await installPaths()).sort()).toEqual([
      'apps/web/public/apple-touch-icon.png',
      'apps/web/public/favicon-16.png',
      'apps/web/public/favicon-32.png',
      'apps/web/public/favicon.ico',
      'apps/web/public/icons/icon-192.png',
      'apps/web/public/icons/icon-512.png',
      'apps/web/public/icons/icon-maskable-512.png',
    ])
  })

  it('T058 — never touches an in-app mark, which stays on the board (FR-1039)', async () => {
    const marks = (await installPaths()).filter((path) => path.includes('brand/mark-'))

    expect(
      marks,
      'The install-icon pipeline writes an in-app mark. Every in-app mark must continue to ' +
        'derive from assets/brand/logo.png and be visually unchanged (FR-1039, SC-1010) — this ' +
        'is an icon change, not a rebrand, and register entry 28 holds that question open.',
    ).toEqual([])

    // And the board still owns both, in both products.
    const board = await boardPaths()
    expect(board).toContain('apps/web/public/brand/mark-coral.png')
    expect(board).toContain('apps/web/public/brand/mark-navy.png')
    expect(board).toContain('apps/admin/public/brand/mark-coral.png')
    expect(board).toContain('apps/admin/public/brand/mark-navy.png')
  })

  it('T058 — never touches an administrative asset (FR-1040)', async () => {
    const admin = (await installPaths()).filter((path) => path.startsWith('apps/admin/'))

    expect(
      admin,
      'The install-icon pipeline writes into the administrative site. Its favicons are ' +
        'deliberately unchanged (FR-1040), which scopes the two-mark divergence to one product ' +
        'rather than spreading it to a third surface.',
    ).toEqual([])

    const board = await boardPaths()
    expect(board).toContain('apps/admin/public/favicon.ico')
    expect(board).toContain('apps/admin/public/favicon-32.png')
  })

  it('the two pipelines write disjoint sets of files', async () => {
    const install = new Set(await installPaths())
    const collisions = (await boardPaths()).filter((path) => install.has(path))

    expect(
      collisions,
      'Both pipelines write these files, so whichever runs last wins and the committed asset ' +
        'depends on command order. The audit would report the loser as differing from its ' +
        'pipeline, which is a confusing way to learn about an ownership bug.',
    ).toEqual([])
  })

  it('plates onto the source’s own white, so no edge carries a fringe (FR-1044)', () => {
    expect(PLATE).toEqual({ r: 0xff, g: 0xff, b: 0xff })
  })

  it('emits opaque icons, because iOS renders transparency as black', async () => {
    for (const [path, bytes] of await buildInstallIcons()) {
      if (!path.endsWith('.png')) continue
      const meta = await sharp(bytes).metadata()
      expect(meta.hasAlpha, `${path} carries an alpha channel`).toBe(false)
    }
  })
})

describe('what is on disk', () => {
  it('matches the pipeline, so the committed icons are the derived ones (FR-1042)', async () => {
    for (const [path, expected] of await buildInstallIcons()) {
      const actual = await readFile(fromRoot(path))
      expect(actual.equals(expected), `${path} on disk differs from the pipeline`).toBe(true)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **The geometry above is arithmetic; this is the artifact** (FR-1043).
   *
   * Every other safe-zone assertion tests a pure function, and pure functions are not what
   * installs. A regression in the build — sizing the maskable file with `STANDARD_FILL`, say —
   * leaves every geometry case green, produces a 512×512 PNG that satisfies the declaration
   * gate, passes every other suite, and is clipped on a real Android launcher.
   *
   * Carried over from `generate-brand-assets.test.mjs`, which owned this check until 016 moved
   * the file it was reading.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('keeps every mark pixel of the SHIPPED maskable icon inside the safe circle', async () => {
    const { data, info } = await sharp(fromRoot('apps/web/public/icons/icon-maskable-512.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })

    let furthest = 0
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels
        const isPlate =
          Math.abs(data[offset] - PLATE.r) <= 12 &&
          Math.abs(data[offset + 1] - PLATE.g) <= 12 &&
          Math.abs(data[offset + 2] - PLATE.b) <= 12
        if (!isPlate) {
          furthest = Math.max(furthest, Math.hypot(x + 0.5 - 256, y + 0.5 - 256))
        }
      }
    }

    expect(
      furthest,
      'Ink reaches outside the guaranteed-visible circle, so an Android circular mask cuts part ' +
        'of the mark off. Only a real device would otherwise show this.',
    ).toBeLessThanOrEqual(safeRadius(512))
  })

  it('plates the shipped icons in white, so no antialiased edge carries a fringe (FR-1044)', async () => {
    for (const name of [
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-512.png',
      'apple-touch-icon.png',
    ]) {
      const { data, info } = await sharp(fromRoot(`apps/web/public/${name}`))
        .raw()
        .toBuffer({ resolveWithObject: true })

      // The corner of a centred mark is always plate.
      expect(
        [data[0], data[1], data[2]],
        `${name} is not plated in the source's own white`,
      ).toEqual([PLATE.r, PLATE.g, PLATE.b])
      expect(info.channels).toBeGreaterThanOrEqual(3)
    }
  })

  /**
   * The shipped counterpart of the exception. The pure-function check above proves the *declared*
   * factors are within it; this proves the *drawn* mark is, which is what a device sees.
   *
   * Measured as the ink's bounding box against the 92px master. The bound is the recorded
   * exception rather than 1.0 — that is the whole of what FR-1045 grants, and nothing wider.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **WHICH FILES THIS READS IS DERIVED, BECAUSE IT WAS A THIRD HAND-KEPT LIST** (A1/T7).
   *
   * It named `icon-512.png` and `icon-maskable-512.png` literally — a third inventory beside
   * `markScaleFactors()` and `buildInstallIcons()`, and the one that would go stalest quietest,
   * since a shipped artifact nobody reads produces no failure at all.
   *
   * It now reads **every output the pipeline actually enlarges**, which is by construction the
   * set `brand-audit.mjs` declares as `DECLARED_UPSCALED_OUTPUTS` — that constant is not imported
   * because the audit is a self-executing script with a `process.exit`, and deriving from the
   * pipeline is the stronger relation anyway: the audit already pins the two sets equal in both
   * directions, so this covers the same four files without a fourth copy of their names, and a
   * fifth upscaled output joins this loop by existing.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('draws no shipped mark beyond the recorded exception (FR-1045)', async () => {
    const upscaled = markScaleFactors()
      .filter(({ factor }) => factor > 1)
      .map(({ path }) => path)

    // The exception covers four outputs today. A floor, so that a pipeline drawing nothing
    // above 1× cannot make this loop pass by iterating over an empty list.
    expect(upscaled.length).toBeGreaterThanOrEqual(4)

    for (const name of upscaled) {
      const { data, info } = await sharp(fromRoot(name)).raw().toBuffer({ resolveWithObject: true })

      let top = Infinity
      let bottom = -1
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * info.channels
          const isPlate =
            Math.abs(data[offset] - PLATE.r) <= 12 &&
            Math.abs(data[offset + 1] - PLATE.g) <= 12 &&
            Math.abs(data[offset + 2] - PLATE.b) <= 12
          if (!isPlate) {
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
      }

      const drawn = bottom - top + 1
      expect(
        drawn / MASTER_HEIGHT,
        `${name} draws the mark ${drawn}px from a ${MASTER_HEIGHT}px master, beyond the ` +
          `recorded ${MAX_UPSCALE.toFixed(2)}× exception`,
      ).toBeLessThanOrEqual(MAX_UPSCALE + 0.02)
    }
  })
})
