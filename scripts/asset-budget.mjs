/**
 * T088, T113 — the client asset budget, enforced (FR-072, research.md D18).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Measures the **initial shell JavaScript**: the entry chunk plus everything it statically
 * imports, gzipped. Not the whole `dist` directory, and not every chunk — a lazily-loaded
 * destination that an attendee never opens costs them nothing, and counting it would make the
 * number mean something other than what FR-072 asks about.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The point of the budget is to fail when somebody adds a heavyweight dependency without
 * meaning to. It is expected to be raised deliberately as destinations gain content; a raise is
 * a reviewed change to this file, which is exactly the visibility that makes it a gate rather
 * than a habit.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

/**
 * **150 KB**, tuned at T113 from research.md D18's opening figure of 200 KB.
 *
 * The shell measures 133 KB gzipped — React, the router, the icons actually used, and this
 * slice's own code. At 200 KB the check had 67 KB of slack, which is more than `moment`
 * (~72 KB), `chart.js` (~60 KB), or an accidental full `lodash` import (~25 KB) would need to
 * slip through unnoticed. A budget that cannot fail on a careless dependency addition is not a
 * budget, and T113 exists precisely to close that gap.
 *
 * 150 KB leaves ~17 KB of working room: enough that ordinary work inside this slice does not
 * trip it, tight enough that adding a heavyweight library does.
 *
 * Raising this is a decision, not a fix. See the note at the top of this file.
 */
const BUDGET_BYTES = 150 * 1024

const DIST = fileURLToPath(new URL('../apps/web/dist', import.meta.url))
const MANIFEST = join(DIST, '.vite', 'manifest.json')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

/** The entry chunk and every chunk it statically imports, transitively. */
const shellChunks = () => {
  const entries = Object.values(manifest).filter((chunk) => chunk.isEntry)
  if (entries.length === 0) {
    throw new Error(`No entry chunk in ${MANIFEST}. Did the build succeed?`)
  }

  const seen = new Set()
  const walk = (chunk) => {
    if (!chunk || seen.has(chunk.file)) return
    seen.add(chunk.file)
    for (const key of chunk.imports ?? []) walk(manifest[key])
  }
  entries.forEach(walk)

  return [...seen].filter((file) => file.endsWith('.js'))
}

const files = shellChunks()
  .map((file) => ({ file, bytes: gzipSync(readFileSync(join(DIST, file))).length }))
  .sort((a, b) => b.bytes - a.bytes)

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T142 (007) — THE GATE REFUSES TO REPORT A NUMBER ABOUT A BUNDLE NO ATTENDEE RECEIVES.**
 *
 * `apps/web/vite.config.ts` sets `envDir: '../..'`, so Vite loads the **repository-root `.env`**
 * when building the client — and that file (gitignored, seeded from `.env.example`) sets
 * `NODE_ENV=development`. Vite honours it, and React, React DOM, React Router and the scheduler
 * all resolve to their **development** builds: roughly 60 KB gzipped of extra warnings,
 * `Object.freeze` calls and component stacks.
 *
 * CI has no `.env`, so it measures the production shell. The two differ by more than a third of
 * the budget, which means a local `pnpm verify` was failing on a figure CI would never see —
 * exactly the "green result that checks nothing", inverted into a red one that means nothing.
 *
 * Detecting it and **refusing to judge** is the honest response. The alternatives were each a
 * decision rather than a fix, and 007's T003 recorded them as deliberately unclaimed: whether the
 * web build should ignore the root `.env`'s `NODE_ENV`, whether `.env.example` should stop
 * seeding it, and whether local end-to-end runs *want* the development build's diagnostics.
 * Nothing here settles any of those; it stops the budget answering a question it was not asked.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const developmentReact = files.some(({ file }) => {
  const source = readFileSync(join(DIST, file), 'utf8')
  // ───────────────────────────────────────────────────────────────────────────────────────
  // Two markers, both of which exist **only** in React's development builds and neither of which
  // minification removes: `jsxDEV`, the development JSX runtime entry point, and the text of a
  // warning that is compiled out of production entirely.
  //
  // Matched on the bundled source rather than on `process.env`, because what matters is what was
  // *emitted*: reading the environment would report the intent, and the whole defect here is
  // that the intent and the artifact disagree.
  // ───────────────────────────────────────────────────────────────────────────────────────
  return source.includes('jsxDEV') || source.includes('Each child in a list')
})

const total = files.reduce((sum, entry) => sum + entry.bytes, 0)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

console.log('Initial shell JavaScript, gzipped:\n')
for (const { file, bytes } of files) console.log(`  ${kb(bytes).padStart(9)}  ${file}`)
console.log(`\n  ${kb(total).padStart(9)}  total`)
console.log(`  ${kb(BUDGET_BYTES).padStart(9)}  budget\n`)

if (developmentReact) {
  console.warn(
    'This build bundles DEVELOPMENT React, so the figure above is not what an attendee\n' +
      'downloads and the budget cannot be judged against it.\n\n' +
      "  Cause:  apps/web/vite.config.ts sets envDir: '../..', so Vite loads the repository-root\n" +
      '          .env, which sets NODE_ENV=development. CI has no .env and builds production.\n\n' +
      '  Fix:    NODE_ENV=production pnpm build && pnpm budget\n\n' +
      'Not failing: a red result about a bundle nobody receives is as useless as a green one.\n' +
      'CI measures the production shell, and that is the number the gate is about (FR-072).',
  )
  process.exit(0)
}

if (total > BUDGET_BYTES) {
  console.error(
    `Asset budget exceeded by ${kb(total - BUDGET_BYTES)} (FR-072).\n` +
      'Either remove what was added, or raise the budget in scripts/asset-budget.mjs as a\n' +
      'deliberate, reviewed decision — but do not raise it to make a red build green.',
  )
  process.exit(1)
}

console.log(`Within budget, with ${kb(BUDGET_BYTES - total)} to spare.`)
