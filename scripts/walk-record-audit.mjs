// T097 (012) — **the machine-visible edge of the human gate** (SC-1203, FR-1125, FR-1126).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// **A WALK NOBODY CAN AUDIT IS A WALK THAT DID NOT HAPPEN, AS FAR AS ANY GATE CAN TELL.**
//
// 012's whole thesis is that a check which did not execute has not passed — and the consolidated
// walk is the one check no machine can execute. What a machine CAN check is the record's shape:
// that every step in the script has a row, that a verdict carries an observation rather than
// standing alone, and that every layout and install row names a capture file that actually
// exists on disk. `brand-audit.mjs` is the precedent: build-output claims are asserted where the
// build output is, and walk-record claims are asserted where the record is.
//
// **This gate is green before the walk starts, on purpose.** `walk-record.md` ships with every
// row `pending`; a pending row asserts nothing and demands nothing. The obligations arm row by
// row as verdicts are recorded, and arm completely when the record's own header declares
// `complete` — from that moment a single `pending` row fails the build, which is what makes "the
// walk is done" a machine-checkable sentence. Runs from `pnpm verify` as a step inside an
// existing job: FR-1147 hard-asserts the job count at 10 and this must not move it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIR = join(ROOT, 'specs/012-launch-readiness')

const quickstart = readFileSync(join(DIR, 'quickstart.md'), 'utf8')
const record = readFileSync(join(DIR, 'walk-record.md'), 'utf8')

const failures = []

// The step inventory, derived from the script itself — never hand-copied. A step added to the
// script gains its obligation by existing (deletion-coverage's property, applied to prose).
const steps = [...quickstart.matchAll(/^- \*\*([A-F]\d+) — /gm)].map((m) => m[1])
if (steps.length < 40) {
  failures.push(
    `only ${steps.length} steps parsed from quickstart.md — the step pattern no longer matches ` +
      'and this gate is checking nothing. Fix the parser, never the threshold.',
  )
}

// The record's rows: | Step | Subject | Observation | Pass/fail | Capture |. Split on pipes
// rather than matched with a spacing-sensitive regex — an empty cell renders as `| |`, and a
// parser that silently skips empty-celled rows is a gate that passes on the rows it most needs
// to see (the first version did exactly that; the pre-flight count guard below caught it).
const rows = record
  .split('\n')
  .filter((line) => /^\|\s*[A-F]\d+\s*\|/.test(line))
  .map((line) => {
    const cells = line.split('|').map((cell) => cell.trim())
    // cells[0] is the empty string before the leading pipe.
    return {
      step: cells[1],
      observation: cells[3] ?? '',
      verdict: (cells[4] ?? '').toLowerCase(),
      capture: cells[5] ?? '',
    }
  })

const recorded = new Set(rows.map((row) => row.step))
for (const step of steps) {
  if (!recorded.has(step)) {
    failures.push(`step ${step} appears in quickstart.md and has NO row in walk-record.md`)
  }
}
for (const step of recorded) {
  if (!steps.includes(step)) {
    failures.push(`walk-record.md carries a row for ${step}, which quickstart.md does not define`)
  }
}

const VERDICTS = new Set(['pending', 'pass', 'fail', 'blocked', 'n/a'])
for (const row of rows) {
  if (!VERDICTS.has(row.verdict)) {
    failures.push(
      `row ${row.step}: verdict "${row.verdict}" is not one of ${[...VERDICTS].join(', ')}`,
    )
    continue
  }
  // A verdict without an observation is exactly what FR-1125 forbids: "a step recorded only as
  // 'pass' is not recorded".
  if ((row.verdict === 'pass' || row.verdict === 'fail') && row.observation.length < 10) {
    failures.push(
      `row ${row.step} carries the verdict "${row.verdict}" with no real observation — FR-1125: ` +
        'what was actually on the screen, never a verdict alone',
    )
  }
  // FR-1126 — every layout/install row that PASSED names a capture that exists. `(required)` is
  // the template's placeholder, not a file.
  if (row.step.startsWith('D') && row.verdict === 'pass') {
    const name = row.capture.replace(/\(required\)/, '').trim()
    if (!name) {
      failures.push(
        `row ${row.step} passed with no capture named — FR-1126: layout is the one thing no verdict can convey`,
      )
    } else {
      for (const file of name.split(/[,\s]+/).filter(Boolean)) {
        if (!existsSync(join(DIR, 'captures', file))) {
          failures.push(
            `row ${row.step} names capture "${file}", which does not exist in captures/`,
          )
        }
      }
    }
  }
}

// The completion obligations arm when the record says it is complete.
const complete = /^\*\*Status\*\*: `complete`/m.test(record)
if (complete) {
  for (const row of rows.filter((r) => r.verdict === 'pending')) {
    failures.push(`the record declares itself complete while ${row.step} is still pending`)
  }
  if (/\*\(record before step A1/.test(record)) {
    failures.push(
      'the record declares itself complete without naming the deployed base commit (FR-1120a)',
    )
  }
  if (/\*\(name the patch/.test(record)) {
    failures.push('the record declares itself complete without naming the FR-1127 seed patch')
  }
}

if (failures.length > 0) {
  console.error(`walk-record-audit: ${failures.length} failure(s)\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

console.log(
  `walk-record-audit: ${steps.length} steps, ${rows.length} rows, ` +
    `${rows.filter((r) => r.verdict !== 'pending').length} recorded` +
    (complete ? ', record COMPLETE' : ' (record in progress)'),
)
