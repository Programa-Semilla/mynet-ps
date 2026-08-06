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

const total = files.reduce((sum, entry) => sum + entry.bytes, 0)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

console.log('Initial shell JavaScript, gzipped:\n')
for (const { file, bytes } of files) console.log(`  ${kb(bytes).padStart(9)}  ${file}`)
console.log(`\n  ${kb(total).padStart(9)}  total`)
console.log(`  ${kb(BUDGET_BYTES).padStart(9)}  budget\n`)

if (total > BUDGET_BYTES) {
  console.error(
    `Asset budget exceeded by ${kb(total - BUDGET_BYTES)} (FR-072).\n` +
      'Either remove what was added, or raise the budget in scripts/asset-budget.mjs as a\n' +
      'deliberate, reviewed decision — but do not raise it to make a red build green.',
  )
  process.exit(1)
}

console.log(`Within budget, with ${kb(BUDGET_BYTES - total)} to spare.`)
