import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T039 (012) — **the identity read must never re-enter a `reads` map** (FR-1140, SC-1207,
 * decision D-012-1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ENTRY THIS FORBIDS WAS THE OFFLINE DISCLOSURE.**
 *
 * `getCurrent` cached under the scope's pre-resolution value (`anonymous`) is what let an
 * offline cold start presenting no credential resolve the previous attendee, adopt their
 * identifier as the cache scope, and serve their programme, saved sessions and private notes
 * (SC-1207). The fix is one word of configuration — `passThrough` instead of a `reads` entry —
 * which is exactly why it needs a tripwire: the sentence that argued for the old arrangement
 * ("a cache hit has to tell somebody who the attendee is") reads like an improvement, and the
 * revert would type-check, pass every behavioural test that runs online, and re-open the
 * disclosure only on a device somebody else picks up.
 *
 * Source-shaped deliberately, following `messages-absences.test.ts`: the subject is the
 * composition root's CONFIGURATION, which no online behavioural test can observe failing. The
 * behavioural half lives in `e2e/agenda-offline.spec.ts`'s SC-1207 case, which crosses the
 * document boundary this file cannot.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SERVICES = join(import.meta.dirname, '../../src/app/services.ts')

/**
 * Comments stripped first, because `getCurrent` appears throughout the prose explaining why it
 * is not cached — a check that failed on its own justification would push the reasoning out of
 * the code.
 */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the identity read stays out of the cache (FR-1140)', () => {
  const source = codeOf(readFileSync(SERVICES, 'utf8'))

  it('finds the wiring it checks — a gate that cannot fail is not a gate', () => {
    expect(source).toContain('HttpAttendeeRepository')
    expect(source).toContain('passThrough')
  })

  it('names getCurrent in no reads map', () => {
    // A `reads` entry is `getCurrent: '<resource>'` — a key with a string value. The
    // passThrough form is `'getCurrent'` inside an array and never matches this shape.
    expect(
      /getCurrent\s*:\s*['"]/.test(source),
      'getCurrent appears as a reads-map entry in services.ts. Caching the identity read is ' +
        'SC-1207 re-opened: an offline cold start with no credential would again resolve the ' +
        'previous attendee from disk and serve their notes. Decision D-012-1 (owner, ' +
        '2026-08-16) closed this deliberately — passThrough, never cached. If you are here to ' +
        'restore the offline cold start, that is a reversal of an owner decision, not a fix.',
    ).toBe(false)
  })

  it('declares getCurrent as passThrough rather than omitting it', () => {
    // Omission is 008's `slots` defect: an unnamed method falls into the decorator's write
    // branch and purges the conference prefix on every identity read.
    expect(/passThrough:\s*\[\s*'getCurrent'\s*\]/.test(source)).toBe(true)
  })
})
