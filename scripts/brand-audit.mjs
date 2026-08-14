/**
 * Deep review (010) — the three brand guarantees that had no gate.
 *
 *     node scripts/brand-audit.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **Each of these was asserted in prose, in a quickstart step, or in a test that could not run.**
 *
 * 1. **The committed assets are what the script produces** (FR-806, FR-803, SC-809). This existed
 *    only as quickstart scenario 1 — a by-hand step, in a project whose own CLAUDE.md records
 *    that the by-hand walkthrough was skipped for both 007 and 008. The committed binaries *are*
 *    the deliverable, and "a reviewer verifies them by reading the script" (User Story 4) is only
 *    true if the script and the binaries agree.
 *
 * 2. **Screenshots stay out of the precache, install icons too, in-app marks stay in**
 *    (FR-815d, SC-815). This was a unit test guarded by `it.skipIf(!existsSync(dist/sw.js))` — and
 *    `dist/` never exists when the unit layer runs, because CI's `test-unit` job does not build
 *    and `pnpm verify` runs `test:unit` *before* `build`. It therefore skipped on every CI run and
 *    read a stale worker locally. A check that did not execute has not passed, so it moved here,
 *    where a build has definitely happened and a missing worker is a **failure** rather than a skip.
 *
 * 3. **The built manifest carries what was declared** (FR-828, FR-829). Nothing read the emitted
 *    `manifest.webmanifest` at all.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Runs in `pnpm verify` immediately after `pnpm build`, beside `pnpm budget`, which is the other
 * check that needs a build to exist.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import { buildAssets } from './generate-brand-assets.mjs'
import {
  MASTER_HEIGHT,
  MAX_UPSCALE,
  buildInstallIcons,
  markScaleFactors,
} from './generate-install-icons.mjs'

/**
 * **This audit reads the BUILT manifest, never `src/app/icons.ts`.**
 *
 * Not a workaround — a deliberate second input. `apps/web/tests/unit/icon-declarations.test.ts`
 * checks the source module, which is where a developer edits. This checks what the build actually
 * emitted, which is what a device actually installs. A plugin that dropped, reordered or rewrote a
 * declaration between the two would be invisible to a check that read only the source.
 */
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const failures = []
const fail = (message) => failures.push(message)

/**
 * Both pipelines, built once each and reused by every section below.
 *
 * Building is the expensive part of this audit, and a second call would also be a second chance
 * for the two halves of a comparison to disagree about what they were comparing.
 */
const boardBuilt = await buildAssets()
const installBuilt = await buildInstallIcons()

/** The paths the install-icon pipeline owns. */
const buildInstallIconPaths = new Set(installBuilt.map(([path]) => path))

/**
 * Which pipeline owns a path, so a failure names the command that fixes it.
 *
 * 016 split the derivation in two: MyNet's install icons and favicons come from the second brand
 * source, everything else from the board (constitution v5.0.0, C4). A single suggested command
 * would send half of all failures to the script that does not write the file.
 *
 * These name package scripts rather than bare `node` invocations because `pnpm brand:generate`
 * is what a developer finds, and until 016's review it ran only the board half — so somebody
 * following a hint that named the *other* command saw no change and concluded the pipeline was
 * broken. Both scripts exist in `package.json`, and `brand:generate` now runs the pair.
 */
const regenerate = (path) =>
  buildInstallIconPaths.has(path) ? 'pnpm brand:generate:install' : 'pnpm brand:generate:board'

const read = async (path) => {
  try {
    return await readFile(fromRoot(path))
  } catch {
    return null
  }
}

// ── 1. The committed assets are exactly what the pipeline produces ───────────────────────────
//
// Byte-for-byte, against the files on disk rather than against git. That catches three things at
// once: a non-deterministic pipeline, a hand-edited asset, and an asset generated from some other
// source. It needs no clean working tree and no commit, so it is honest to run at any moment.

const built = [...boardBuilt, ...installBuilt]

for (const [path, expected] of built) {
  const actual = await read(path)

  if (actual === null) {
    // FR-1046 — a declared icon with no file on disk is a FAILURE, never a skip. A manifest can
    // name a missing file while every other gate passes, and the failure then appears only on a
    // real device at install time.
    fail(`${path} is declared by a pipeline but is not on disk.\n    Run: ${regenerate(path)}`)
    continue
  }

  if (!actual.equals(expected)) {
    fail(
      `${path} differs from what the pipeline produces ` +
        `(on disk ${actual.length.toLocaleString('en-GB')} bytes, generated ${expected.length.toLocaleString('en-GB')}).\n` +
        `    Either it was hand-edited, or it was generated from a different source or a different ` +
        `version of the script.\n    Run: ${regenerate(path)}`,
    )
  }
}

// ── 2. The built manifest declares what a device needs ────────────────────────────────────────

const manifestBytes = await read('apps/web/dist/manifest.webmanifest')
let manifest = null

if (manifestBytes === null) {
  fail('apps/web/dist/manifest.webmanifest is absent.\n    Run: pnpm build')
} else {
  manifest = JSON.parse(manifestBytes.toString('utf8'))

  const icons = manifest.icons ?? []
  const screenshots = manifest.screenshots ?? []

  // Floors, so that emptying a declaration list cannot make every check below pass vacuously.
  if (icons.length < 4) fail(`The built manifest declares only ${icons.length} icons.`)
  if (screenshots.length < 2) {
    fail(`The built manifest declares only ${screenshots.length} screenshots (FR-815a).`)
  }
  if (icons.filter((icon) => icon.purpose === 'maskable').length !== 1) {
    fail('The built manifest does not declare exactly one maskable icon (FR-811).')
  }
  if (icons.some((icon) => icon.purpose === 'monochrome')) {
    fail(
      'The built manifest declares a monochrome purpose, which is booked follow-up work (FR-841).',
    )
  }
  for (const factor of ['narrow', 'wide']) {
    if (!screenshots.some((shot) => shot.form_factor === factor)) {
      fail(`The built manifest declares no ${factor} screenshot.`)
    }
  }

  // Every declared file exists at its declared size — the same guarantee the unit gate makes of
  // the source module, made here of the emitted artifact.
  for (const entry of [...icons, ...screenshots]) {
    const bytes = await read(`apps/web/dist${entry.src}`)
    if (bytes === null) {
      fail(`The built manifest declares ${entry.src}, which is not in the build output.`)
      continue
    }
    const [width, height] = entry.sizes.split('x').map(Number)
    const actual = pngSize(bytes)
    if (actual.width !== width || actual.height !== height) {
      fail(`${entry.src} is declared ${entry.sizes} but is ${actual.width}x${actual.height}.`)
    }
  }

  // FR-829 — these stay derived from the token file. A literal here would be the manifest
  // exemption `mynet/no-colour-literals` exists to refuse.
  const tokens = (await read('apps/web/src/theme/tokens.css')).toString('utf8')
  for (const [key, token] of [
    ['background_color', 'color-cream-100'],
    ['theme_color', 'color-navy-800'],
  ]) {
    const expected = new RegExp(`--${token}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim()
    if (manifest[key] !== expected) {
      fail(`The manifest's ${key} is ${manifest[key]}, not the token --${token} (${expected}).`)
    }
  }
}

// ── 3. The precache set ───────────────────────────────────────────────────────────────────────

const worker = await read('apps/web/dist/sw.js')

if (worker === null) {
  fail(
    'apps/web/dist/sw.js is absent. This audit asserts what the BUILT worker precaches, so a ' +
      'missing build is a failure and not a reason to skip.\n    Run: pnpm build',
  )
} else {
  const text = worker.toString('utf8')

  // Excluded: fetched by the platform's install prompt, over the network, at install time.
  if (/screenshots\//.test(text)) {
    fail('The precache contains screenshots. They are install-prompt illustrations (FR-815d).')
  }

  // Excluded: manifest icons and favicons are fetched by the **browser process**, so those
  // requests never reach the worker's fetch handler and could never be served from this cache.
  for (const icon of manifest?.icons ?? []) {
    if (text.includes(icon.src.replace(/^\//, ''))) {
      // FR-1047 — and `includeManifestIcons: false` is what governs this, NOT `globIgnores`:
      // `vite-plugin-pwa` re-adds manifest icons after the glob runs.
      fail(`The precache contains ${icon.src}, which the worker's fetch handler never sees.`)
    }
  }
  for (const chrome of ['favicon-16.png', 'favicon-32.png', 'favicon.ico']) {
    if (text.includes(chrome)) {
      fail(`The precache contains ${chrome}, which the worker's fetch handler never sees.`)
    }
  }

  // Included: the in-app marks are rendered by the shell, on every page, and must work offline.
  for (const mark of ['brand/mark-coral.png', 'brand/mark-navy.png']) {
    if (!text.includes(mark)) {
      fail(`The precache is missing ${mark}, which the shell renders on every page.`)
    }
  }
}

// ── 4. The recorded upscale exception ─────────────────────────────────────────────────────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// **FR-1045 — ONE NAMED EXCEPTION, AND A SECOND UPSCALE STILL FAILS.**
//
// 010 added an upscale check after finding a single asset drawn at 1.06× from its master, and
// fixed the **asset** rather than weakening the check. 016 cannot do that: `new-logo.png` is
// 114×133, its mark is 92px, and a 512 icon needs ~297px of it. The owner has confirmed no
// higher-resolution source exists and has licensed the crop, so the enlargement is accepted —
// **once, named, and measured**.
//
// The exception is three coordinates: **this source**, **this factor**, **these outputs**. Each
// is checked for equality rather than as a ceiling, because a ceiling is what quietly absorbs the
// next one. Widening it means editing a number here, which is the conversation.
//
// **Weakening this check until it stops checking anything is forbidden**, and the shape that
// would do it is an inequality: `factor <= SOMETHING_LARGE` passes for every future asset.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** The factor 016 accepted, to two decimals. `icon-512.png` at 296.96px from a 92px master. */
const DECLARED_UPSCALE = 3.23

/** The outputs the exception covers, and no others. */
const DECLARED_UPSCALED_OUTPUTS = [
  'apps/web/public/apple-touch-icon.png',
  'apps/web/public/icons/icon-192.png',
  'apps/web/public/icons/icon-512.png',
  'apps/web/public/icons/icon-maskable-512.png',
]

const scales = markScaleFactors()

// ── 4a. The exception is measured against the WHOLE inventory ─────────────────────────────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// **A COVERAGE CHECK, BECAUSE AN EXCEPTION APPLIED TO A PARTIAL INVENTORY IS NOT AN EXCEPTION**
// (deep review A1/T7, found independently by two reviewers).
//
// `markScaleFactors()` and `buildInstallIcons()` used to be two hand-maintained lists — six
// path/size pairs measured, seven files written, and nothing relating them. An `icon-1024.png`
// added to the builder and not to the scale table would draw the mark at **6.46×** while every
// equality check below passed, because none of them would ever see it.
//
// `INSTALL_ICONS` fixed that at the source: both are now projections of one list, so a new output
// raises `MAX_UPSCALE` and fails the equality check by existing. **This is the second lock**, and
// it covers the one route back to two inventories: appending a bespoke output inside
// `buildInstallIcons` beside the loop. It is deliberately an **equality** of path sets rather than
// a containment, so a stale measurement of a file the pipeline stopped writing fails too.
//
// The pattern is `apps/api/tests/unit/deletion-coverage.test.ts`'s: derive the expectation from
// the thing being checked, and a new member fails by existing rather than by being remembered.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const measured = new Set(scales.map((entry) => entry.path))
// `.ico` is a container around two PNGs the inventory already drew, so it draws no mark of its
// own and is correctly absent from the scale table.
const drawnOutputs = installBuilt.map(([path]) => path).filter((path) => path.endsWith('.png'))

for (const path of drawnOutputs) {
  if (!measured.has(path)) {
    fail(
      `${path} is written by the install-icon pipeline but NO upscale factor is measured for it ` +
        `(FR-1045). An output outside the scale table is an output the recorded exception has ` +
        `never been applied to: it could enlarge the mark by any factor at all and every check ` +
        `below would still pass. Add it to INSTALL_ICONS in scripts/generate-install-icons.mjs ` +
        `rather than beside the loop in buildInstallIcons().`,
    )
  }
}

for (const path of measured) {
  if (!drawnOutputs.includes(path)) {
    fail(
      `markScaleFactors() measures ${path}, which the pipeline no longer writes. A measurement ` +
        `with no artifact is a scale table drifting away from the inventory — the same drift in ` +
        `the other direction, and the one that makes the table look more complete than it is.`,
    )
  }
}

if (MASTER_HEIGHT !== 92) {
  fail(
    `The install-icon master is ${MASTER_HEIGHT}px, not the 92px the exception was measured ` +
      `against. The crop changed, so the accepted factor has to be re-derived rather than ` +
      `inherited.`,
  )
}

if (Math.abs(MAX_UPSCALE - DECLARED_UPSCALE) > 0.005) {
  fail(
    `The install-icon pipeline's largest upscale is ${MAX_UPSCALE.toFixed(3)}×, but the recorded ` +
      `exception is ${DECLARED_UPSCALE}× (FR-1045). An upscale outside the single recorded ` +
      `exception must fail the build — if this one is intended, it is a decision to record here.`,
  )
}

const upscaled = scales.filter((entry) => entry.factor > 1).map((entry) => entry.path)

for (const path of upscaled) {
  if (!DECLARED_UPSCALED_OUTPUTS.includes(path)) {
    fail(
      `${path} enlarges the mark and is NOT covered by the recorded exception (FR-1045). ` +
        `The exception names ${DECLARED_UPSCALED_OUTPUTS.length} outputs and this is not one.`,
    )
  }
}

for (const path of DECLARED_UPSCALED_OUTPUTS) {
  if (!upscaled.includes(path)) {
    fail(
      `${path} is named by the upscale exception but no longer enlarges the mark. The exception ` +
        `must describe what is actually happening — a stale entry is licence nobody is using, ` +
        `and it would cover a future asset at the same path.`,
    )
  }
}

for (const entry of scales) {
  if (entry.factor > MAX_UPSCALE + 1e-9) {
    fail(
      `${entry.path} draws the mark at ${entry.drawn.toFixed(1)}px from a ${MASTER_HEIGHT}px ` +
        `master (${entry.factor.toFixed(2)}×), beyond the recorded maximum of ` +
        `${MAX_UPSCALE.toFixed(2)}× (FR-1045).`,
    )
  }
}

// **The board pipeline keeps the original rule: nothing it produces is upscaled at all.** The
// exception is scoped to the second source, and this is what stops it leaking across.
for (const [path, bytes] of boardBuilt) {
  if (!/mark-(coral|navy)\.png$/.test(path)) continue
  const { height } = pngSize(bytes)
  if (height > 300) {
    fail(
      `${path} is ${height}px tall, drawn from the board's 300px master. The board pipeline is ` +
        `outside 016's exception and nothing it produces may be upscaled.`,
    )
  }
}

// ── 5. The two pipelines write disjoint sets ──────────────────────────────────────────────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// **THE BOUNDARY, ASSERTED WHERE THE PROJECT'S OWN RECORD SAYS IT IS ASSERTED** (deep review A5).
//
// 016 puts two derivation pipelines over two sources into one `public/` directory, and the
// invariant `CLAUDE.md` records is that *"`brand-audit.mjs` asserts the two write **disjoint**
// sets"*. It did not — the assertion lived only in `generate-install-icons.test.mjs`, where it is
// genuine, and this file merely happened to build both. A record defect rather than a coverage
// gap, and the cheaper repair is to make the claim true where it is made rather than to correct
// the sentence: the invariant is worth asserting twice, and the two layers fail at different
// moments. The unit test fails without a build; this fails in `pnpm verify` and in CI's own step.
//
// **What a collision would actually do**, which is why it is worth a named failure rather than
// being left to show up as a mismatch: both pipelines would write the file, whichever ran last
// would win, and section 1 above would report the *loser* as differing from its own pipeline —
// with a suggested command that regenerates it into the same losing state. The committed asset
// would depend on command order, which is exactly how one source silently starts answering for
// the other and **register entry 28** gets resolved by accident.
// ══════════════════════════════════════════════════════════════════════════════════════════════

for (const [path] of boardBuilt) {
  if (buildInstallIconPaths.has(path)) {
    fail(
      `${path} is written by BOTH pipelines, so the committed asset depends on which command ran ` +
        `last. The board (assets/brand/logo.png) owns every in-app mark and every administrative ` +
        `asset (FR-1039, FR-1040); the second source (assets/brand/new-logo.png) owns MyNet's ` +
        `install icons and favicons (FR-1038). One file, one owner.`,
    )
  }
}

// ── Report ────────────────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\nBrand audit failed with ${failures.length} problem(s):\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}\n`)
  process.exit(1)
}

console.log(
  `Brand audit passed: ${built.length} assets byte-identical to the pipeline across two ` +
    `disjoint pipelines, ${drawnOutputs.length} drawn outputs all measured against the recorded ` +
    `upscale exception, precache excludes screenshots and install icons, manifest matches the ` +
    `declarations.`,
)
