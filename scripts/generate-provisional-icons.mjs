/**
 * T097 — generates the **provisional** application icons.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * These are not branding. No logo exists for MyNet — that is an open client decision
 * (CLAUDE.md, "Real brand mark and application icons"), and inventing one here would quietly
 * answer a question nobody asked us to answer.
 *
 * What FR-050 needs is a manifest that validates and an installable application, which needs
 * icons of the right sizes to exist. So they exist, they are visibly provisional, and
 * `apps/web/public/icons/README.md` says so.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Generated from the design tokens by script rather than committed as opaque PNGs, so that a
 * reviewer can see exactly what they contain by reading forty lines instead of opening a binary.
 *
 *     node scripts/generate-provisional-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

const OUT = fileURLToPath(new URL('../apps/web/public/icons', import.meta.url))

// tokens.css: navy-800 (the primary surface), coral-500 (the accent), warning-500.
const NAVY = [0x1b, 0x23, 0x40]
const CORAL = [0xe8, 0x63, 0x4d]
/** The diagonal placeholder band. Amber because it is the palette's "attention, not error". */
const WARNING = [0xc0, 0x7d, 0x18]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * A navy square with a centred coral disc, struck through by an amber diagonal band.
 *
 * **The band is the point.** FR-050 asks for icons that are visibly provisional, and a tasteful
 * placeholder is the dangerous kind: it looks finished, so it ships. Nobody mistakes this for
 * approved branding, which is exactly what is wanted until the client supplies a real mark.
 *
 * `safeRatio` shrinks the mark for the maskable variant: a maskable icon may be cropped to a
 * circle by the platform, so anything outside the inner 80% can be cut off.
 */
const renderPng = (size, safeRatio) => {
  const radius = (size / 2) * safeRatio * 0.55
  const centre = size / 2
  const bandHalfWidth = size * 0.06

  // Raw scanlines: one filter byte (0 = none) followed by RGB triples.
  const raw = Buffer.alloc(size * (1 + size * 3))
  let offset = 0

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - centre
      const dy = y + 0.5 - centre

      // Anti-diagonal band, measured perpendicular to the line x + y = size.
      const onBand = Math.abs(x + y - size) / Math.SQRT2 <= bandHalfWidth
      const inDisc = dx * dx + dy * dy <= radius * radius

      const [r, g, b] = onBand ? WARNING : inDisc ? CORAL : NAVY
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: truecolour
  // 10–12 are compression, filter, and interlace methods — all zero, the only defined values.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })

const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Maskable: the mark stays inside the safe zone the platform is guaranteed not to crop.
  ['icon-maskable-512.png', 512, 0.8],
]

for (const [name, size, safeRatio] of icons) {
  writeFileSync(join(OUT, name), renderPng(size, safeRatio))
  console.log(`wrote ${name} (${size}×${size})`)
}
