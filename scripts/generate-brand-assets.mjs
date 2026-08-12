/**
 * T006–T015 (010) — derives every MyNet brand asset from the one owner-supplied brand board.
 *
 *     node scripts/generate-brand-assets.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **Assets are derived by a readable script, never committed as opaque binaries** (constitution
 * v3.3.0, "Brand identity and application icons"). It replaces the provisional generator that
 * drew the amber-banded placeholder, and keeps the convention that one established: a reviewer
 * verifies the crop rectangle, the plate colour and the maskable safe-zone inset by reading
 * code, not by opening a PNG and trusting it. When the mark is later redrawn as a vector, that
 * is a change of *input* to this one pipeline rather than a second pipeline.
 *
 * **The whole thing is one idea.** The board has no alpha channel, so the coral mark exists only
 * as coral pixels composited against the board's navy — and a naive crop drags that navy into
 * every antialiased edge. For a two-colour image every pixel is `P = α·F + (1−α)·B`, so the
 * compositing can be undone algebraically: `α = (P − B) / (F − B)`. Solved once, on the red
 * channel, that recovers a clean alpha matte. Every asset below is then that one matte,
 * resampled and painted — onto an opaque plate for the icons, onto nothing for the in-app marks.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

import sharp from 'sharp'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fromRoot = (path) => join(repoRoot, path)

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Brand constants (FR-805, FR-809)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// **These are identity, not palette, and the distinction is the reason they live here.**
//
// `mynet/no-colour-literals` requires every colour in the application to come from the one token
// file, and these two values are deliberately outside that rule rather than exempted from it: the
// rule is registered on `apps/web/**` and the CSS language block, and has never covered
// `scripts/` (research R8). So this is documentation, not a lint concession, and the count of
// colour literals outside the token file does not rise.
//
// The reason they must not be tokens is that they answer a different question. `navy-800` and
// `coral-500` are the *product's* surface and accent; they may be retuned for contrast, for a
// dark mode, for anything the interface needs. `PLATE` and `MARK` are what the brand board
// measures — the identity a person recognises on their home screen. A design token moving must
// not repaint the application icon, and these do not move when one does.
//
// Both were measured from the board itself, as the most common colour in the cropped region:
// 6,919 pixels of `#0c1842`/`#0d1942` for the plate and 1,449 of `#fe6551` for the mark, the ±1
// spread being the board's paper texture.
//
// **Register entry 22 is the open question these create**: the brand's navy and the token
// `navy-800` (`#1b2340`) are not the same colour, so the icon plate and the manifest's
// token-derived `theme_color` differ visibly on the splash screen. That seam is a knowingly
// accepted interim cost, and 010 is explicitly forbidden from resolving it.

/** The brand board's true dimensions. A different size means different crop coordinates. */
const BOARD = { width: 1254, height: 1254 }

/**
 * The coral mark in the board's top-left quadrant, as its exact half-alpha bounding box.
 *
 * Measured, not estimated: scanning the quadrant for pixels at or above the α = 0.5 midpoint
 * (red ≥ 134) yields precisely this rectangle. One pixel of antialiased fringe sits outside it
 * on each edge, which the matte recovers as partial alpha rather than as a hard boundary.
 */
const CROP = { left: 172, top: 162, width: 283, height: 300 }

/** The board's navy. The icon plate, and the `B` term of the unmix. */
const PLATE = { r: 0x0d, g: 0x19, b: 0x42 }

/** The board's coral. The mark's own colour, and the `F` term of the unmix. */
const MARK = { r: 0xfe, g: 0x65, b: 0x51 }

/** The in-app navy colourway — the same mark painted for light surfaces (FR-820b). */
const MARK_NAVY = PLATE

/**
 * The red channel carries the unmix because its coral/navy delta is **241 of 255** — far the
 * largest of the three (green is 76, blue is 15), so the division is numerically stable. A blue
 * channel solve would divide by 15 and amplify the board's paper texture into visible noise.
 */
const UNMIX_DELTA = MARK.r - PLATE.r

/** The mark's aspect ratio, from the crop. Every sizing below is expressed in terms of it. */
const MARK_ASPECT = CROP.width / CROP.height

/**
 * A maskable icon's guaranteed-visible region is a **circle** whose diameter is 80% of the
 * icon's smallest dimension.
 */
const SAFE_CIRCLE_DIAMETER_FRACTION = 0.8

/**
 * How much of a standard (non-maskable) icon the mark's height fills.
 *
 * No safe zone applies to these, so this is a design choice rather than a constraint: it reads
 * as a confident mark with breathing room rather than a glyph swimming in navy.
 *
 * **The ceiling is not a design choice, and it is why this is 0.58 rather than 0.62.** The larger
 * value put the mark 317px tall in the 512 icon, drawn from a 300px master — a 1.06× upscale, and
 * the only asset in this feature that was one. It was defensible on its own ("visually
 * indistinguishable") and indefensible against the written record: the spec, the icons README and
 * the constitution amendment all state that nothing here is upscaled, and one asset quietly
 * contradicting that is how a booked follow-up later gets read as evidence something shipped soft.
 *
 * At 0.58 the 512 icon's mark is 296.9px — under the master, so the claim is now true everywhere
 * rather than nearly everywhere. Keep any future value at or below `CROP.height / 512`.
 */
const STANDARD_FILL = 0.58

/**
 * The same, for the favicons — deliberately tighter.
 *
 * A favicon has no safe zone and no launcher mask, and tighter is *sharper*, because more of the
 * available pixels carry the shape. At 16px the mark is legible but soft (research R4); 32px is
 * the size that must be right, because that is what hidpi displays request. Tuned by eye against
 * the board's own 32/24/16 scale tests, which is the judgement FR-818a assigns to a human.
 */
const FAVICON_FILL = 0.88

/**
 * In-app marks are rendered small by CSS; the asset is generous so it stays crisp on hidpi.
 *
 * **160, not 96, and the arithmetic is the reason.** The largest in-app rendering is `h-10` — 40
 * CSS pixels, on the five authentication screens. A 3× display draws that from 120 device pixels,
 * and current flagship phones are 3×. At 96 the asset was *below* that, so the most prominent
 * placement of the mark in the whole product was being upscaled 1.25× on the devices most
 * attendees hold. 160 covers 4× at `h-10` and 6× at the top bar's `h-6`, and is still comfortably
 * under the 300px master, so nothing here is upscaled either.
 *
 * The cost is a few kilobytes on two files. `BrandMark.tsx` carries the resulting intrinsic size,
 * and `icon-declarations.test.ts` fails if the two ever disagree.
 */
const IN_APP_MARK_HEIGHT = 160

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The tallest the mark may be in a maskable icon of `size` (FR-811).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The obvious answer — `0.8 × size` — is wrong, and it clips the node terminals that are the
 * whole point of the mark.** The safe zone is a circle, and a rectangle's corners escape a
 * circle. Sized to 80% of the *side*, the mark's bounding box is 386×410 in a 512 icon and its
 * corners sit **281.5px** from centre against a safe radius of 204.8 — 37% outside. An Android
 * circular mask cuts them off, and no test in this project would see it.
 *
 * What must fit the safe circle is therefore the bounding box's **diagonal**, which gives
 * 297.9px at 512: a 0.993× scale of the board's native 300px mark. Nothing here is upscaled.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const maskableMarkHeight = (size) =>
  (SAFE_CIRCLE_DIAMETER_FRACTION * size) / Math.hypot(MARK_ASPECT, 1)

/** How far a centred bounding box of this height puts its corner from the icon's centre. */
export const cornerDistance = (markHeight) => (markHeight * Math.hypot(MARK_ASPECT, 1)) / 2

/** The radius of the region a maskable icon is guaranteed to keep. */
export const safeRadius = (size) => (SAFE_CIRCLE_DIAMETER_FRACTION * size) / 2

/**
 * Undoes the board's compositing for one sample of the red channel (research R2).
 *
 * Clamping absorbs two real effects measured on the crop: 1.49% of pixels land fractionally
 * outside [0,1], and the worst per-channel residual on an edge pixel is 25/255. Both are the
 * board's paper texture, and both are invisible once clamped — 98% of the crop resolves to fully
 * opaque or fully transparent, which is the signature of a clean vector-drawn shape.
 */
export const unmixAlpha = (red) => Math.min(1, Math.max(0, (red - PLATE.r) / UNMIX_DELTA))

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Reads the board and refuses to continue if it is not the image these coordinates describe
 * (FR-807).
 *
 * A crop rectangle is meaningless against different dimensions. Failing loudly here is the
 * difference between "the brand source was replaced and the pipeline said so" and "the icons
 * quietly became a rectangle of somebody's background".
 */
export const assertBoardDimensions = ({ width, height }, source = 'assets/brand/logo.png') => {
  if (width !== BOARD.width || height !== BOARD.height) {
    throw new Error(
      `Brand source has unexpected dimensions.\n` +
        `  expected: ${BOARD.width}×${BOARD.height}\n` +
        `  actual:   ${width}×${height}\n` +
        `  source:   ${source}\n` +
        `The crop rectangle (${CROP.left},${CROP.top} ${CROP.width}×${CROP.height}) is measured ` +
        `against the expected size and means nothing against another. No asset was written.`,
    )
  }
}

const readBoard = async () => {
  const path = fromRoot('assets/brand/logo.png')
  const image = sharp(path)

  assertBoardDimensions(await image.metadata(), relative(repoRoot, path))

  return image
}

/**
 * Recovers the mark's alpha matte from the board (FR-820b, research R2).
 *
 * Returns alpha alone, one byte per pixel. Colour is applied later by `paint`, which is what
 * turns "two crops to keep in sync" into "one matte painted twice".
 */
const alphaMatte = async () => {
  const image = await readBoard()
  const { data, info } = await image.extract(CROP).raw().toBuffer({ resolveWithObject: true })

  const alpha = Buffer.alloc(CROP.width * CROP.height)

  /**
   * The stride comes from the **decoded buffer**, not from `metadata()`.
   *
   * They describe different things — `metadata()` describes the file on disk, `info` describes
   * what `raw()` actually produced — and they agree only by luck for the current board. A
   * replacement that decoded to a different channel count (a palette PNG, a greyscale export, one
   * carrying `tRNS`) passes the dimension guard above and would then be read at the wrong stride,
   * yielding a garbage matte with no error at all. That is precisely the "plausible-looking asset
   * from an unexpected source" FR-807 exists to prevent, so the mismatch is checked rather than
   * assumed.
   */
  if (data.length !== alpha.length * info.channels) {
    throw new Error(
      `Raw crop is ${data.length} bytes for ${alpha.length} pixels — unexpected channel count ` +
        `${info.channels}. The brand source did not decode to the expected shape. No asset was written.`,
    )
  }

  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = Math.round(unmixAlpha(data[index * info.channels]) * 255)
  }
  return alpha
}

/**
 * Paints the matte a flat colour, yielding RGBA at the matte's native size.
 *
 * Painted with `MARK` this is the coral matte the board shows; painted with `MARK_NAVY` it is
 * the same shape for light surfaces. Because every pixel carries the *same* RGB, resampling can
 * never bleed one colour into another — the only channel that varies is alpha.
 */
const paint = (alpha, colour) => {
  const rgba = Buffer.alloc(alpha.length * 4)
  for (let index = 0; index < alpha.length; index += 1) {
    rgba[index * 4] = colour.r
    rgba[index * 4 + 1] = colour.g
    rgba[index * 4 + 2] = colour.b
    rgba[index * 4 + 3] = alpha[index]
  }
  return sharp(rgba, { raw: { width: CROP.width, height: CROP.height, channels: 4 } })
}

/**
 * Resamples the painted matte to a given height.
 *
 * **Lanczos, and the filter choice is a requirement rather than a default** (FR-818). The mark is
 * two round-capped strokes with two disc terminals; a nearest-neighbour downscale turns those
 * caps into stair-steps at 16px, which is the size the board's own scale tests exist to validate.
 * A resampling filter is what keeps the curve a curve. `generate-brand-assets.test.mjs` asserts
 * the shipped favicon carries the intermediate values only a real filter produces.
 */
const resampled = (alpha, colour, height) =>
  paint(alpha, colour)
    .resize({ height: Math.round(height), kernel: 'lanczos3', fit: 'contain' })
    .png()
    .toBuffer()

/**
 * The mark centred on an **opaque** square of the brand's navy.
 *
 * Opacity is not incidental. iOS ignores `purpose: maskable` and renders transparency as black,
 * so the apple-touch icon cannot be the maskable file under another name (FR-812).
 */
const plate = async (alpha, size, markHeight) => {
  const mark = await resampled(alpha, MARK, markHeight)
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...PLATE, alpha: 1 },
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer()
}

/**
 * Wraps PNG payloads in an ICO container (research R9).
 *
 * A 6-byte header, one 16-byte directory entry per image, then the PNG bytes verbatim — ICO has
 * permitted embedded PNG since Vista, so nothing is re-encoded. This exists for the clients that
 * guess `/favicon.ico` without parsing the document: feed readers, link unfurlers, crawlers.
 * Every current browser uses the `<link>` tags instead and never asks for it.
 */
const ico = (images) => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach(({ size, png }, index) => {
    const entry = index * 16
    directory[entry] = size === 256 ? 0 : size // 0 denotes 256
    directory[entry + 1] = size === 256 ? 0 : size
    directory[entry + 2] = 0 // palette colours
    directory[entry + 3] = 0 // reserved
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...images.map(({ png }) => png)])
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every asset this feature ships, in one place (FR-808).
 *
 * The inventory is the point: a reader sees the complete set of files the repository is expected
 * to carry, at a glance, without following writes through the code that produces them.
 */
export const buildAssets = async () => {
  const alpha = await alphaMatte()
  const web = 'apps/web/public'
  // 011 — the second website. It takes the favicons and the two in-app marks and **nothing
  // else**; see the note beside its entries below.
  const admin = 'apps/admin/public'

  const favicon32 = await plate(alpha, 32, 32 * FAVICON_FILL)
  const favicon16 = await plate(alpha, 16, 16 * FAVICON_FILL)

  const assets = [
    // Install icons — replacing the provisional set at the same names and sizes (FR-810).
    [`${web}/icons/icon-192.png`, await plate(alpha, 192, 192 * STANDARD_FILL)],
    [`${web}/icons/icon-512.png`, await plate(alpha, 512, 512 * STANDARD_FILL)],
    // The one asset with a geometric constraint rather than a design choice (FR-811).
    [`${web}/icons/icon-maskable-512.png`, await plate(alpha, 512, maskableMarkHeight(512))],
    // Opaque, because iOS renders transparency as black (FR-812).
    [`${web}/apple-touch-icon.png`, await plate(alpha, 180, 180 * STANDARD_FILL)],

    // Browser chrome — `index.html` had neither of these links before this feature (FR-816).
    [`${web}/favicon-32.png`, favicon32],
    [`${web}/favicon-16.png`, favicon16],
    [
      `${web}/favicon.ico`,
      ico([
        { size: 16, png: favicon16 },
        { size: 32, png: favicon32 },
      ]),
    ],

    // In-app marks — **no plate**, so they take the surface behind them (FR-820a), and one matte
    // painted twice so the two colourways cannot drift apart in shape (FR-820b).
    [`${web}/brand/mark-coral.png`, await resampled(alpha, MARK, IN_APP_MARK_HEIGHT)],
    [`${web}/brand/mark-navy.png`, await resampled(alpha, MARK_NAVY, IN_APP_MARK_HEIGHT)],

    /**
     * T006 (011) — the administrative site's assets (FR-921).
     *
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **The same one pipeline, and the omissions are the requirement.**
     *
     * 011 adds a second website on `admin.<host>`, and decision 30 binds it exactly as it binds
     * MyNet: derived by this script, never committed as opaque binaries, so a reviewer verifies
     * plate colour and crop geometry by reading code. Copying the four files across would have
     * been quicker and would have created the first hand-placed brand binary in the repository.
     *
     * **What is deliberately NOT emitted here is the whole of FR-923**: no `icon-192`, no
     * `icon-512`, no `icon-maskable-512`, no `apple-touch-icon`. The administrative product is
     * not installable, so it has no install icons to declare — and because there is no manifest
     * at all, a missing declaration cannot be the thing that reveals it. The absence is in the
     * inventory, where FR-808 says the complete set of files must be legible at a glance.
     *
     * The marks are byte-identical to the attendee client's by construction: same matte, same
     * heights, same two colourways. `scripts/brand-audit.mjs` compares every entry in this list
     * against disk, so these are covered by FR-806 the moment they appear here.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    [`${admin}/favicon-32.png`, favicon32],
    [`${admin}/favicon-16.png`, favicon16],
    [
      `${admin}/favicon.ico`,
      ico([
        { size: 16, png: favicon16 },
        { size: 32, png: favicon32 },
      ]),
    ],
    [`${admin}/brand/mark-coral.png`, await resampled(alpha, MARK, IN_APP_MARK_HEIGHT)],
    [`${admin}/brand/mark-navy.png`, await resampled(alpha, MARK_NAVY, IN_APP_MARK_HEIGHT)],
  ]

  return assets
}

/**
 * Builds every asset and writes it.
 *
 * **Building and writing are separate on purpose.** `scripts/brand-audit.mjs` calls `buildAssets`
 * and compares the result against what is on disk, which is how FR-806 (regeneration is
 * byte-identical) and FR-803 (no derived asset is hand-edited) become a gate rather than a
 * quickstart step somebody is asked to remember. If this function did both, the audit could only
 * check the pipeline against itself after overwriting the evidence.
 */
const main = async () => {
  for (const [path, bytes] of await buildAssets()) {
    const absolute = fromRoot(path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, bytes)
    console.log(`wrote ${path} (${bytes.length.toLocaleString('en-GB')} bytes)`)
  }
}

// The self-run guard is what makes this importable by the geometry test without generating
// anything, and runnable as a command. Nothing else is needed for that, so nothing else is
// exported for it: the list below is exactly what `generate-brand-assets.test.mjs` imports.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

export { CROP, IN_APP_MARK_HEIGHT, MARK, MARK_ASPECT, PLATE }
