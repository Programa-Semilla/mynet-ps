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
  MARK,
  MARK_ASPECT,
  PLATE,
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

describe('generated assets', () => {
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
