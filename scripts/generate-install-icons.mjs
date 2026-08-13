/**
 * T059–T062 (016) — derives MyNet's **install icons and favicon** from the second brand source.
 *
 *     node scripts/generate-install-icons.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A SECOND SOURCE, AND THIS IS NOT A REBRAND** (constitution v5.0.0, C4).
 *
 * `assets/brand/logo.png` — the owner's 2026-08-10 brand board — remains the source for every
 * **in-app** mark, and `generate-brand-assets.mjs` still owns those. `assets/brand/new-logo.png`
 * is the source for **install icons and MyNet's favicon only** (FR-1038, FR-1039). The
 * administrative site's favicons are deliberately untouched (FR-1040), which scopes the
 * divergence to one product rather than spreading it to a third surface.
 *
 * **The home-screen icon will visibly differ from the coral mark inside the application.** That
 * is knowingly accepted and is **register entry 28** — which of the two marks is MyNet's is open,
 * and no feature may resolve it by quietly replacing one with the other.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A SEPARATE PATH BESIDE THE BOARD PIPELINE, NOT A PARAMETERISATION OF IT** (research R4).
 *
 * Generalising `generate-brand-assets.mjs` to take a source argument was considered and
 * rejected. Its crop rectangle, its plate derivation and its unmix are all measured against
 * **one specific image**: `assertBoardDimensions` refuses anything that is not 1254×1254 because
 * *"a crop rectangle is meaningless against different dimensions"*, and its whole algebra assumes
 * a two-colour source with no alpha channel. A parameterised pipeline would carry two sets of
 * constants selected by a flag, which is exactly the shape that lets the wrong constants apply
 * silently — and the guard that would have caught it is the one the flag disabled.
 *
 * So this file has its **own** dimension assertion, its **own** crop, and its **own** plate. The
 * cost is a second script; what it buys is that neither can be wrong about the other's image.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

import sharp from 'sharp'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fromRoot = (path) => join(repoRoot, path)

/** The second source's true dimensions. A different size means a different crop. */
const SOURCE = { width: 114, height: 133 }

const SOURCE_PATH = 'assets/brand/new-logo.png'

/**
 * The mark alone — **the wordmark is cropped away** (FR-1041).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A RASTER LOCKUP STAYS FORBIDDEN, AND THAT RULE PREDATES THIS SOURCE.**
 *
 * Decision 30 binds it: the mark ships as an image beside live text, never as a picture of the
 * brand name. An icon derives from the **mark**, never the mark plus rendered text — a wordmark
 * baked into a 192px launcher icon is illegible at the size it is actually drawn, and it is a
 * second, unaccountable copy of the product's name.
 *
 * Measured rather than estimated. Scanning for non-white pixels finds two bands separated by
 * four blank rows: the mark at rows 10–101 and the wordmark at rows 105–123. The mark's bounding
 * box is exactly **92×92 at (10, 10)** — square, which is why every icon below needs no aspect
 * correction.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const CROP = { left: 10, top: 10, width: 92, height: 92 }

/**
 * The icon plate — **white, chosen deliberately and recorded here** (FR-1044).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THE BOARD'S DERIVATION DOES NOT APPLY TO THIS SOURCE, WHICH IS WHY A CHOICE HAD TO BE MADE.**
 *
 * `generate-brand-assets.mjs` did not *choose* its navy — it **measured** it. That board has no
 * alpha channel, so the coral mark exists only as coral pixels composited against the board's own
 * navy; the plate had to be that navy or every antialiased edge would carry a halo of a colour
 * that was never in the design.
 *
 * This source has an alpha channel, so the naive reading is that the derivation simply
 * transfers. **It does not, and the reason is that the alpha channel is uniformly opaque**:
 * every one of the 15,162 pixels has α = 255. The mark is drawn on a **white** background, and
 * its edges are blends against white in exactly the way the board's are blends against navy.
 *
 * So the same *reasoning* gives a different answer. White is not a preference here — it is the
 * only plate that does not introduce a fringe, and plating this mark onto the board's navy would
 * ring every curve with white.
 *
 * **Unmixing was considered and is not available.** The board's algebra works because it has two
 * known colours: `α = (P − B) / (F − B)`. This mark is a **gradient**, so `F` varies per pixel
 * and there is no single value to solve against. Recovering a matte would mean guessing at the
 * gradient, and a guess is precisely what a readable pipeline is supposed to remove.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT THIS COSTS: THE MANIFEST COLOUR SEAM IS NOW MATERIALLY WIDER, AND IT IS RECORDED HERE
 * RATHER THAN LEFT TO BE REDISCOVERED** (deep review P-m5).
 *
 * 010 shipped a navy plate — `#0d1942`, measured from the board — against a `theme_color` of
 * `navy-800` (`#1b2340`). Two navies that differ, on a splash screen, described in
 * `apps/web/public/icons/README.md` as a knowingly accepted cost and left to **register entry
 * 23**, which asks whether the tokens should adopt the brand's values.
 *
 * That seam has not moved; it has **widened**, and by more than a retune of one token would
 * close. `brand-audit.mjs` still requires `background_color` to equal `cream-100` and
 * `theme_color` to equal `navy-800` — correctly, because FR-829 forbids a literal there — so an
 * Android launch screen now paints **cream behind a white-plated icon framed in navy**. Three
 * grounds, not one, where 010 had two shades of the same ground.
 *
 * **It is stated and not fixed, deliberately.** Fixing it means either repainting the plate — the
 * one thing the argument above says cannot be done without a fringe — or moving `theme_color` and
 * `background_color` off the tokens, which is register entry 23's territory and explicitly the
 * owner's call. It is also the second knowingly accepted divergence this feature carries, beside
 * **register entry 28** (which of the two marks is MyNet's), and the two are visible at the same
 * moment: launch.
 *
 * **No gate can see it.** Every colour involved is asserted somewhere — the plate here, the two
 * manifest values in `brand-audit.mjs` — and each assertion passes. What nobody checks is how the
 * three look together, because that is a photograph of a phone at launch. It belongs on **T068's
 * by-hand list** with the icon judgement, and this paragraph is here so that the next reader meets
 * it beside the decision that caused it rather than in a review document.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const PLATE = { r: 0xff, g: 0xff, b: 0xff }

/** The mark is square, so this is 1 — kept named because the safe-zone maths reads better. */
const MARK_ASPECT = CROP.width / CROP.height

/** A maskable icon's guaranteed-visible region is a circle of 80% of the icon's diameter. */
const SAFE_CIRCLE_DIAMETER_FRACTION = 0.8

/**
 * How much of a standard icon's height the mark fills. The board pipeline's figure, deliberately.
 *
 * Matching it keeps the two families of icon optically the same size, which matters while both
 * exist: register entry 28 is open, and a reader comparing them should be comparing the *marks*
 * rather than one being noticeably larger than the other.
 */
const STANDARD_FILL = 0.58

/** Tighter for favicons: no safe zone, no launcher mask, and tighter is sharper at 16 and 32px. */
const FAVICON_FILL = 0.88

/**
 * The tallest the mark may be in a maskable icon of `size` (FR-1043).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The obvious answer — `0.8 × size` — is wrong, and 010's planning is where that was caught.**
 * The safe zone is a **circle**, and a rectangle's corners escape a circle. What must fit is the
 * bounding box's **diagonal**, not its side. For this square mark that gives
 * `0.8 × 512 / √2 = 289.6px` rather than 409.6px — the difference between a mark inside the
 * guaranteed region and one whose corners an Android circular mask cuts off.
 *
 * **For THIS mark the rule is conservative, and the conservatism is deliberate.** The new mark
 * happens to be a disc, so its bounding-box corners are empty white and sizing it to the full
 * 409.6px would clip nothing visible. Two reasons not to: the rule would then depend on the
 * artwork being circular, which is a property of one export rather than of the brand — a later
 * source with a square badge or a tighter crop would silently start losing corners. And 010
 * established this geometry after the specification's own narrative implied the wrong one, so
 * one rule across both pipelines means there is one thing to be right about. The cost is a mark
 * 2.5% smaller than the standard icon's, which is not visible.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const maskableMarkHeight = (size) =>
  (SAFE_CIRCLE_DIAMETER_FRACTION * size) / Math.hypot(MARK_ASPECT, 1)

/** How far a centred bounding box of this height puts its corner from the icon's centre. */
export const cornerDistance = (markHeight) => (markHeight * Math.hypot(MARK_ASPECT, 1)) / 2

/** The radius of the region a maskable icon is guaranteed to keep. */
export const safeRadius = (size) => (SAFE_CIRCLE_DIAMETER_FRACTION * size) / 2

/**
 * The master's own height, in pixels. Everything below is measured against it.
 *
 * Exported because `brand-audit.mjs` must not restate it: a second copy of this number is a
 * second thing to be wrong, and the copy that drifted would be the one the audit trusted.
 */
export const MASTER_HEIGHT = CROP.height

/** Where MyNet's public assets live. One constant, so the inventory below is the only list. */
const WEB = 'apps/web/public'

/**
 * **THE INVENTORY — every asset this pipeline draws, and how tall it draws the mark in each.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **ONE LIST, BECAUSE TWO LISTS DRIFTED AND THE DRIFT WAS INVISIBLE** (deep review A1/T7).
 *
 * This started as two independent declarations: a `buildInstallIcons` that wrote seven files, and
 * a `markScaleFactors` that measured six path/size pairs restated by hand. Nothing tied them
 * together, and the failure that produced is worth stating exactly, because it is the failure
 * every "checked exception" is prone to:
 *
 * > Add an `icon-1024.png` at `STANDARD_FILL` and forget the second list. It draws the mark at
 * > 593.9px from a 92px master — **6.46×** — the scale table never sees it, `MAX_UPSCALE` stays
 * > 3.23, every equality check the audit makes still passes, and the build is green. FR-1045 asks
 * > that an upscale outside the single recorded exception **fail the build**, and this one would
 * > have shipped.
 *
 * The exception was not too weak — `brand-audit.mjs` checks it for **equality** rather than as a
 * ceiling, which is right and must stay. What was wrong is *what it was applied to*: a
 * hand-maintained copy of the inventory rather than the inventory.
 *
 * So there is now one list and both readers derive from it. `buildInstallIcons` maps over it to
 * produce bytes; `markScaleFactors` maps over it to produce factors; `MAX_UPSCALE` is the largest
 * entry in it rather than a restated `512 × 0.58`. **A new output therefore fails by existing** —
 * it raises `MAX_UPSCALE`, and the audit's equality check against the declared 3.23× fails,
 * naming it. That is the property `apps/api/tests/unit/deletion-coverage.test.ts` and
 * `export-coverage.test.ts` have over the Drizzle schema, and it is the reason those two fail a
 * *future* feature's build rather than this one's.
 *
 * **The escape hatch that remains is writing a file outside this list**, which is why
 * `brand-audit.mjs` and `generate-install-icons.test.mjs` each assert that the paths measured here
 * are **exactly** the `.png` outputs of `buildInstallIcons()`. Adding a bespoke output beside the
 * loop is the one way back to two inventories, and it is named in a failure message rather than
 * left to be noticed.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
export const INSTALL_ICONS = [
  { path: `${WEB}/icons/icon-192.png`, size: 192, markHeight: 192 * STANDARD_FILL },
  { path: `${WEB}/icons/icon-512.png`, size: 512, markHeight: 512 * STANDARD_FILL },
  // The one asset with a geometric constraint rather than a design choice (FR-1043).
  { path: `${WEB}/icons/icon-maskable-512.png`, size: 512, markHeight: maskableMarkHeight(512) },
  // Opaque, because iOS renders transparency as black.
  { path: `${WEB}/apple-touch-icon.png`, size: 180, markHeight: 180 * STANDARD_FILL },

  { path: `${WEB}/favicon-32.png`, size: 32, markHeight: 32 * FAVICON_FILL },
  { path: `${WEB}/favicon-16.png`, size: 16, markHeight: 16 * FAVICON_FILL },
]

/**
 * The `.ico`, which is the one output that draws **no mark of its own**.
 *
 * It is a container around two PNGs the inventory has already produced, so it has no `markHeight`
 * and belongs in no scale table — a third copy of the 16 and 32px marks measured twice would say
 * the pipeline enlarges the mark in more places than it does. Declared here rather than inline in
 * the builder so that the complete set of files this pipeline owns is still two adjacent lists.
 */
export const ICO_OUTPUT = {
  path: `${WEB}/favicon.ico`,
  from: [`${WEB}/favicon-16.png`, `${WEB}/favicon-32.png`],
}

/**
 * The largest factor by which any output enlarges the 92px master — **derived, never restated**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THE UPSCALE IS REAL, IT IS NAMED, AND NAMING IT IS WHAT KEEPS A SECOND ONE FAILING**
 * (FR-1045).
 *
 * `scripts/brand-audit.mjs` fails the build on **any** upscale — a check 010 added after finding
 * a single asset drawn at 1.06× and fixing the *asset* rather than weakening the check. This
 * source is 114×133 and its mark is 92px; a 512 icon needs ~297px of it. There is no way to
 * satisfy both, and the owner has confirmed no higher-resolution source exists and has licensed
 * the crop.
 *
 * So the exception is **measured and specific**: this file, this factor, these outputs. A second
 * upscale — a different asset, a larger factor, a different source — still fails, which is the
 * whole point of stating it as three coordinates rather than as a flag. **Weakening the check
 * until it stops checking anything is forbidden**, and the audit asserts the factor is not
 * merely under a ceiling but *equal* to what is declared.
 *
 * It reads the inventory rather than repeating `512 × 0.58` **because a literal here could not
 * rise when the pipeline started drawing something larger**, which is precisely how a new output
 * would have passed an equality check written against the old maximum.
 *
 * The largest output is today `icon-512.png` at `512 × 0.58 = 296.96px` from a 92px master.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
export const MAX_UPSCALE =
  Math.max(...INSTALL_ICONS.map(({ markHeight }) => markHeight)) / MASTER_HEIGHT

/**
 * How large the mark is drawn in each output, and therefore by what factor it is scaled.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS WHAT MAKES FR-1045's EXCEPTION CHECKABLE RATHER THAN ASSERTED IN PROSE.**
 *
 * The requirement asks that the exception name the source file, the factor and the specific
 * outputs it covers — so that a **second** upscale still fails. A comment can name all three and
 * a comment cannot fail a build. This function is the same three facts in a form the audit can
 * compare against, so widening the exception means changing a number the audit checks for
 * equality rather than editing a sentence nobody diffs.
 *
 * It is a projection of `INSTALL_ICONS` and holds no path of its own, which is the whole of the
 * A1/T7 fix: there is nothing here to forget to update.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
export const markScaleFactors = () =>
  INSTALL_ICONS.map(({ path, markHeight }) => ({
    path,
    drawn: markHeight,
    factor: markHeight / MASTER_HEIGHT,
  }))

/**
 * Refuses a source that is not the one every constant here was measured against.
 *
 * The mirror of `assertBoardDimensions`, and it exists for the same reason: a crop rectangle is
 * meaningless against different dimensions, and the failure it prevents is silent — a slightly
 * different export of the logo would still produce plausible-looking icons that were quietly a
 * crop of somebody's whitespace.
 */
export const assertSourceDimensions = ({ width, height }, source = SOURCE_PATH) => {
  if (width !== SOURCE.width || height !== SOURCE.height) {
    throw new Error(
      `Install-icon source has unexpected dimensions.\n` +
        `  expected: ${SOURCE.width}×${SOURCE.height}\n` +
        `  actual:   ${width}×${height}\n` +
        `  source:   ${source}\n` +
        `The crop rectangle (${CROP.left},${CROP.top} ${CROP.width}×${CROP.height}) is measured ` +
        `against the expected size and means nothing against another. No asset was written.`,
    )
  }
}

/** The cropped mark, still on its own white ground. */
const markOnly = async () => {
  const path = fromRoot(SOURCE_PATH)
  const image = sharp(path)

  assertSourceDimensions(await image.metadata(), relative(repoRoot, path))

  return image.extract(CROP).toBuffer()
}

/**
 * One square icon: the mark, resampled to `markHeight`, centred on an opaque plate.
 *
 * **Opaque, always.** iOS renders a transparent apple-touch icon against black, and a launcher
 * icon with holes in it is a launcher icon with holes in it. The plate is the source's own white
 * (see `PLATE`), so the mark's antialiasing is correct against it by construction.
 *
 * `fit: 'fill'` is safe only because the crop is square and every target is square; it is stated
 * rather than defaulted so that a future non-square crop fails loudly here.
 */
const plate = async (mark, size, markHeight) => {
  const drawn = Math.round(markHeight)
  const resampled = await sharp(mark)
    .resize(drawn, drawn, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...PLATE, alpha: 1 },
    },
  })
    .composite([{ input: resampled, gravity: 'centre' }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer()
}

/**
 * A minimal ICO container around already-encoded PNGs.
 *
 * Deliberately the same shape as the board pipeline's: a `.ico` is a header plus directory
 * entries plus payloads, and PNG-in-ICO is understood by every browser this product supports.
 */
const ico = (entries) => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.concat(
    entries.map((entry, index) => {
      const row = Buffer.alloc(16)
      row.writeUInt8(entry.size === 256 ? 0 : entry.size, 0)
      row.writeUInt8(entry.size === 256 ? 0 : entry.size, 1)
      row.writeUInt8(0, 2)
      row.writeUInt8(0, 3)
      row.writeUInt16LE(1, 4)
      row.writeUInt16LE(32, 6)
      row.writeUInt32LE(entry.png.length, 8)
      row.writeUInt32LE(
        6 +
          entries.length * 16 +
          entries.slice(0, index).reduce((total, previous) => total + previous.png.length, 0),
        12,
      )
      return row
    }),
  )

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

/**
 * Every asset this pipeline owns, as `[path, bytes]`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The inventory IS the boundary between the two pipelines**, and reading the two lists side
 * by side is how a reviewer confirms FR-1039 and FR-1040 without following writes through code.
 *
 * Here: MyNet's install icons and MyNet's favicons. **Not here, and deliberately**: the two
 * in-app marks (`brand/mark-coral.png`, `brand/mark-navy.png`) in either product, and every
 * administrative asset. Those stay with `generate-brand-assets.mjs` and the board.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The inventory is `INSTALL_ICONS`, not this function.** This loops over it, so an output
 * cannot exist here without also being measured by `markScaleFactors` and counted by
 * `MAX_UPSCALE`; adding one beside the loop instead is what `brand-audit.mjs`'s coverage check
 * and `generate-install-icons.test.mjs` refuse by name.
 */
export const buildInstallIcons = async () => {
  const mark = await markOnly()

  /** path → plated PNG. A `Map` because insertion order is the emitted order. */
  const plated = new Map()
  for (const icon of INSTALL_ICONS) {
    plated.set(icon.path, await plate(mark, icon.size, icon.markHeight))
  }

  const sizeOf = (path) => INSTALL_ICONS.find((icon) => icon.path === path).size

  return [
    ...plated,
    [
      ICO_OUTPUT.path,
      ico(ICO_OUTPUT.from.map((path) => ({ size: sizeOf(path), png: plated.get(path) }))),
    ],
  ]
}

/**
 * Builds and writes.
 *
 * Building and writing are separate for the reason the board pipeline records: `brand-audit.mjs`
 * calls `buildInstallIcons` and compares the result against disk, which is how FR-1042
 * (regeneration is byte-identical) becomes a gate rather than a step somebody is asked to
 * remember. If this did both, the audit could only check the pipeline against itself after
 * overwriting the evidence.
 */
const main = async () => {
  for (const [path, bytes] of await buildInstallIcons()) {
    const absolute = fromRoot(path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, bytes)
    console.log(`wrote ${path} (${bytes.length.toLocaleString('en-GB')} bytes)`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
