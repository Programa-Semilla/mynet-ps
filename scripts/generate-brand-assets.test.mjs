/**
 * T013, T014, T020 (010) — the brand pipeline's maths, pinned.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **The first suite here exists because the specification was wrong, and following it would
 * have shipped a clipped icon that no other gate could see.**
 *
 * The spec described the maskable safe zone as 80% of the icon's side, which reads as a
 * bounding-box constraint. It is a *circle* of 80% diameter, and a rectangle's corners escape a
 * circle. Built to the original reading, the mark's node terminals — the feature of the mark —
 * sit 37% outside the region an Android circular mask is guaranteed to keep, and they are cut
 * off on a real device only.
 *
 * So the wrong answer is asserted here alongside the right one. A future edit that reintroduces
 * `0.8 × size` fails on the line that says why.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  CROP,
  IN_APP_MARK_HEIGHT,
  MARK,
  MARK_ASPECT,
  PLATE,
  assertBoardDimensions,
  buildAssets,
  cornerDistance,
  maskableMarkHeight,
  safeRadius,
  unmixAlpha,
} from './generate-brand-assets.mjs'

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

describe('maskable safe-zone geometry', () => {
  it('sizes the 512 maskable mark to 297.9px — a 0.993× scale of the 300px master, not an upscale', () => {
    expect(maskableMarkHeight(512)).toBeCloseTo(297.9, 1)
    expect(maskableMarkHeight(512)).toBeLessThan(CROP.height)
  })

  it('keeps the mark bounding box entirely inside the 80%-diameter safe circle', () => {
    expect(cornerDistance(maskableMarkHeight(512))).toBeCloseTo(safeRadius(512), 6)
    expect(cornerDistance(maskableMarkHeight(512))).toBeLessThanOrEqual(safeRadius(512) + 1e-9)
  })

  it('REJECTS the naive `0.8 × size` sizing, which puts the node terminals outside the mask', () => {
    // This is the sizing the specification's narrative implied. Its corner lands 281.5px from
    // centre against a safe radius of 204.8 — 37% outside, and clipped by a circular mask.
    const naive = cornerDistance(0.8 * 512)

    expect(naive).toBeCloseTo(281.5, 1)
    expect(naive).toBeGreaterThan(safeRadius(512))
    expect(naive / safeRadius(512)).toBeCloseTo(1.37, 2)
  })

  it('scales with the icon, so a later size inherits the correct constraint rather than a constant', () => {
    for (const size of [192, 256, 512, 1024]) {
      expect(cornerDistance(maskableMarkHeight(size))).toBeCloseTo(safeRadius(size), 6)
    }
  })

  it('derives the aspect ratio from the measured crop rather than from a rounded literal', () => {
    expect(MARK_ASPECT).toBe(CROP.width / CROP.height)
  })
})

describe('alpha unmixing', () => {
  it('resolves the plate colour to fully transparent and the mark colour to fully opaque', () => {
    expect(unmixAlpha(PLATE.r)).toBe(0)
    expect(unmixAlpha(MARK.r)).toBe(1)
  })

  it('resolves their midpoint to half alpha, which is what makes an antialiased edge clean', () => {
    expect(unmixAlpha((PLATE.r + MARK.r) / 2)).toBeCloseTo(0.5, 6)
  })

  it('clamps the board’s paper texture rather than producing alpha outside [0,1]', () => {
    // 1.49% of the real crop lands fractionally outside the range before clamping.
    expect(unmixAlpha(PLATE.r - 20)).toBe(0)
    expect(unmixAlpha(MARK.r + 20)).toBe(1)
  })

  it('solves on the red channel, whose 241/255 delta is the largest of the three', () => {
    expect(MARK.r - PLATE.r).toBe(241)
    expect(MARK.r - PLATE.r).toBeGreaterThan(MARK.g - PLATE.g)
    expect(MARK.r - PLATE.r).toBeGreaterThan(MARK.b - PLATE.b)
  })
})

describe('the source guard (FR-807)', () => {
  it('refuses a board of the wrong size, naming what it expected', () => {
    expect(() => assertBoardDimensions({ width: 1000, height: 1000 })).toThrow(/1254×1254/)
    expect(() => assertBoardDimensions({ width: 1000, height: 1000 })).toThrow(
      /No asset was written/,
    )
  })

  it('accepts the real board', () => {
    expect(() => assertBoardDimensions({ width: 1254, height: 1254 })).not.toThrow()
  })
})

describe('generated assets', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **T062 (016) — THESE ASSERT AGAINST THE ADMINISTRATIVE FILES NOW, NOT MyNet's.**
   *
   * They used to read `apps/web/public/icons/*` and `apps/web/public/favicon-*`, which this
   * pipeline no longer writes: MyNet's install icons and favicons come from the second brand
   * source and are covered by `generate-install-icons.test.mjs` (constitution v5.0.0, C4).
   *
   * **Re-pointed rather than deleted, and that is the important half.** Every claim below is
   * still true of what the board produces — the plate is still the brand navy, the resampling is
   * still a real filter, nothing is still upscaled — and the administrative favicons are
   * deliberately unchanged by 016 (FR-1040). Deleting these would have left the board pipeline's
   * only remaining plated outputs with no artifact-level check at all, which is how a pipeline
   * quietly stops producing what its constants say it produces.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */

  /**
   * FR-809 — the plate is the brand's navy, and nothing asserted it against a file. Painting it
   * `navy-800` instead would be invisible to every other check and is exactly the token/brand
   * confusion the constant's own comment exists to prevent.
   */
  it.each(['favicon-32.png', 'favicon-16.png'])(
    'paints the administrative %s on the brand navy plate, not a design token',
    async (name) => {
      const { data, info } = await sharp(fromRoot(`apps/admin/public/${name}`))
        .raw()
        .toBuffer({ resolveWithObject: true })

      // The corner of a centred mark is always plate.
      expect([data[0], data[1], data[2]]).toEqual([PLATE.r, PLATE.g, PLATE.b])
      expect(info.channels).toBeGreaterThanOrEqual(3)
    },
  )

  /**
   * FR-818 — "a resampling filter that preserves the round caps, **not** nearest-neighbour".
   * The spec calls this half "mechanical and verifiable", and it was neither asserted nor
   * verifiable until now. A nearest-neighbour downscale of a two-colour matte produces almost no
   * intermediate values; a real filter produces a ramp along every curved edge.
   */
  it('downscales the favicons with a real resampling filter, not nearest-neighbour', async () => {
    const { data, info } = await sharp(fromRoot('apps/admin/public/favicon-16.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })

    let intermediate = 0
    let total = 0
    for (let offset = 0; offset < data.length; offset += info.channels) {
      total += 1
      if (data[offset] > PLATE.r + 20 && data[offset] < MARK.r - 20) intermediate += 1
    }

    expect(intermediate / total).toBeGreaterThan(0.05)
  })

  /**
   * Nothing THIS pipeline ships may exceed the board's native mark height.
   *
   * **016's upscale exception is scoped to the other source and must not leak here** (FR-1045).
   * The board is 1254×1254 with a 300px mark and there has never been a reason to enlarge it;
   * `brand-audit.mjs` asserts the same thing about the shipped bytes.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THIS TEST WAS VACUOUS AND THE REPAIR IS WHAT IT MEASURES, NOT HOW STRICTLY** (T-m9).
   *
   * 016 re-pointed it from MyNet's icons — which this pipeline stopped writing — to the
   * administrative **16 and 32px favicons**. Correct as a redirection and worthless as a check:
   * a mark inside a 32px canvas cannot reach 33px, let alone 300, so **no implementation change
   * could make it fail**. It reported green on a property it was no longer examining, which is
   * the failure this repository has recorded against itself twice already.
   *
   * Two changes restore it. It now derives its subjects from `buildAssets()` rather than naming
   * two of them, so **a new output is measured by existing** — the property
   * `apps/api/tests/unit/deletion-coverage.test.ts` has over the Drizzle schema. And it asserts
   * its own power: the tallest mark this pipeline draws must be a **material fraction of the
   * master**, which fails if the subjects are ever narrowed back to something too small to
   * approach the bound. The board's largest outputs are the four in-app marks at
   * `IN_APP_MARK_HEIGHT` — 160px of a 300px master — so raising that constant past 300 fails
   * here, and under the old subjects it would not have.
   *
   * The two families need different detectors and that is a fact about the assets rather than a
   * concession: an in-app mark is **unplated**, so its ground is transparency; a favicon is
   * plated in the brand navy, and `mark-navy.png` paints the mark in that very colour — so a
   * single colour-based rule would find no ink in it at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('never upscales the mark beyond the 300px master, on every asset it emits', async () => {
    const inkHeight = async (bytes) => {
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Unplated marks separate by alpha, plated ones by colour. Decided per asset from the
      // bytes themselves, so neither list has to be maintained beside the other.
      let unplated = false
      for (let offset = 3; offset < data.length; offset += 4) {
        if (data[offset] < 250) {
          unplated = true
          break
        }
      }

      let top = Infinity
      let bottom = -1
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * 4
          const ink = unplated ? data[offset + 3] > 8 : data[offset] > (PLATE.r + MARK.r) / 2
          if (ink) {
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
      }

      return bottom - top + 1
    }

    // `.ico` is a container around PNGs already measured below, not a drawing of its own.
    const outputs = (await buildAssets()).filter(([path]) => path.endsWith('.png'))
    expect(outputs.length).toBeGreaterThanOrEqual(6)

    let tallest = 0
    for (const [path, bytes] of outputs) {
      const drawn = await inkHeight(bytes)
      tallest = Math.max(tallest, drawn)

      expect(
        drawn,
        `${path} draws the mark ${drawn}px from the board's ${CROP.height}px master. This ` +
          `pipeline is outside 016's upscale exception, which is scoped to the second source ` +
          `(FR-1045), and nothing derived from the board may be enlarged.`,
      ).toBeLessThanOrEqual(CROP.height)
    }

    expect(
      tallest,
      'The tallest mark this pipeline draws is nowhere near the 300px master, so the bound above ' +
        'cannot fail and this test asserts nothing. That is precisely what happened when its ' +
        'subjects became two favicons: re-point it at what the pipeline actually draws largest.',
    ).toBeGreaterThan(CROP.height * 0.4)

    // The in-app marks are that largest output, and the constant they are drawn at is the one an
    // edit would move. Stated so the failure above names a cause rather than a symptom.
    expect(tallest).toBe(IN_APP_MARK_HEIGHT)
  })

  it('renders the in-app mark tall enough for a 3× display at its largest CSS size', () => {
    // `h-10` — 40 CSS pixels on the five authentication screens — is 120 device pixels at 3×.
    expect(IN_APP_MARK_HEIGHT).toBeGreaterThanOrEqual(40 * 3)
    expect(IN_APP_MARK_HEIGHT).toBeLessThanOrEqual(CROP.height)
  })

  /**
   * The colour that ships, against the colour the pipeline was told to paint.
   *
   * `apps/web/tests/unit/brand-mark-contrast.test.ts` computes every ratio from `#fe6551` and
   * `#0d1942`, so if the shipped pixels drifted away from those the ratios would describe a mark
   * nobody sees. They are not identical — resampling round-trips through premultiplied alpha and
   * moves each channel by a unit or two — so the assertion is a tight bound rather than equality,
   * and it lives here because this is the suite that already has a PNG decoder.
   */
  it.each([
    ['mark-coral', MARK],
    ['mark-navy', PLATE],
  ])('paints %s within a rounding step of its brand constant', async (name, expected) => {
    const { data, info } = await sharp(fromRoot(`apps/web/public/brand/${name}.png`))
      .raw()
      .toBuffer({ resolveWithObject: true })

    // The first fully-opaque pixel is inside a stroke, so it carries the flat fill.
    let offset = 0
    while (offset < data.length && data[offset + 3] !== 255) offset += info.channels

    expect(offset, `${name} has no fully opaque pixel`).toBeLessThan(data.length)
    for (const [index, channel] of [expected.r, expected.g, expected.b].entries()) {
      expect(Math.abs(data[offset + index] - channel)).toBeLessThanOrEqual(3)
    }
  })

  /**
   * SC-803 — iOS ignores `purpose: maskable` and paints transparency **black**. A transparent
   * apple-touch icon is therefore not a degraded icon, it is a black square with a mark on it,
   * and nothing in this project renders it to notice.
   */
  it('gives the apple-touch icon a fully opaque plate — zero pixels below alpha 255', async () => {
    const { data, info } = await sharp(fromRoot('apps/web/public/apple-touch-icon.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let transparent = 0
    for (let index = 3; index < data.length; index += info.channels) {
      if (data[index] !== 255) transparent += 1
    }

    expect(info.width).toBe(180)
    expect(info.height).toBe(180)
    expect(transparent).toBe(0)
  })

  /**
   * FR-820a — the in-app marks sit on surfaces of two different colours, so a plate is not a
   * neutral extra: it is a navy rectangle on a cream card.
   */
  it('gives the in-app marks no plate at all', async () => {
    for (const name of ['mark-coral', 'mark-navy']) {
      const { data, info } = await sharp(fromRoot(`apps/web/public/brand/${name}.png`))
        .raw()
        .toBuffer({ resolveWithObject: true })

      expect(info.channels).toBe(4)
      // The corner of the bounding box is negative space in this mark's shape.
      expect(data[3]).toBe(0)
    }
  })

  it('paints both colourways from one matte, so their shapes cannot drift apart', async () => {
    const alphaOf = async (name) => {
      const { data, info } = await sharp(fromRoot(`apps/web/public/brand/${name}.png`))
        .raw()
        .toBuffer({ resolveWithObject: true })
      return data.filter((_, index) => index % info.channels === 3)
    }

    expect(Buffer.from(await alphaOf('mark-coral'))).toEqual(
      Buffer.from(await alphaOf('mark-navy')),
    )
  })

  /**
   * Research R9 — the container is six bytes of header and sixteen per image, and the payloads
   * are the PNGs verbatim. If that stops being true the file stops being an icon.
   */
  it('emits a favicon.ico containing the 16 and the 32 as embedded PNGs', async () => {
    const bytes = await readFile(fromRoot('apps/web/public/favicon.ico'))

    expect(bytes.readUInt16LE(0)).toBe(0) // reserved
    expect(bytes.readUInt16LE(2)).toBe(1) // type: icon
    expect(bytes.readUInt16LE(4)).toBe(2) // two images

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    for (let index = 0; index < 2; index += 1) {
      const entry = 6 + index * 16
      const declared = bytes[entry]
      const offset = bytes.readUInt32LE(entry + 12)

      expect(declared).toBe(index === 0 ? 16 : 32)
      expect(bytes.subarray(offset, offset + 8)).toEqual(pngSignature)
      // The embedded payload's own IHDR must agree with the directory entry.
      expect(bytes.readUInt32BE(offset + 16)).toBe(declared)
      expect(bytes.readUInt32BE(offset + 20)).toBe(declared)
    }
  })
})
