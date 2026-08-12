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

const built = await buildAssets()

for (const [path, expected] of built) {
  const actual = await read(path)

  if (actual === null) {
    fail(
      `${path} is declared by the pipeline but is not on disk.\n    Run: node scripts/generate-brand-assets.mjs`,
    )
    continue
  }

  if (!actual.equals(expected)) {
    fail(
      `${path} differs from what the pipeline produces ` +
        `(on disk ${actual.length.toLocaleString('en-GB')} bytes, generated ${expected.length.toLocaleString('en-GB')}).\n` +
        `    Either it was hand-edited, or it was generated from a different source or a different ` +
        `version of the script.\n    Run: node scripts/generate-brand-assets.mjs`,
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

// ── Report ────────────────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\nBrand audit failed with ${failures.length} problem(s):\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}\n`)
  process.exit(1)
}

console.log(
  `Brand audit passed: ${built.length} assets byte-identical to the pipeline, ` +
    `precache excludes screenshots and install icons, manifest matches the declarations.`,
)
