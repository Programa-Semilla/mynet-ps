import { describe, expect, it } from 'vitest'

import { ADMIN_DESTINATIONS as APP_DESTINATIONS } from '../../src/app/shell/AdminShell.js'
import { ADMIN_DESTINATIONS as E2E_DESTINATIONS } from '../../../../e2e/support/destinations.js'

/**
 * T199 (014 tranche 2, R20) — **the e2e copy of the administrative destination list cannot
 * drift from the shell's.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ATTENDEE SIDE HAS HAD THIS GUARD SINCE 002; THE ADMINISTRATIVE SIDE HAD NONE, AND R20
 * NAMED THE CONSEQUENCE.** `e2e/support/destinations.ts` keeps its own copy because importing
 * the shell's module would pull React into the test runner's Node process —
 * `navigation-mirror.test.ts`'s arrangement, inherited deliberately. Duplication is only safe if
 * it cannot drift, and until this file existed it could: a fifth destination added to
 * `AdminShell.tsx` and forgotten in the e2e list would leave the accessibility sweep (three
 * widths) and the horizontal-overflow sweep (thirteen widths) quietly walking four pages while
 * the product has five — the exact "gate that passes while not checking" the attendee mirror's
 * own header warns about. The vocabulary destination is the fifth, and this guard arrives in
 * the same change.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the end-to-end administrative destination list mirrors the shell', () => {
  it('covers the same addresses in the same order', () => {
    expect(E2E_DESTINATIONS.map((d) => d.path)).toEqual(APP_DESTINATIONS.map((d) => d.to))
  })

  it('uses the same labels', () => {
    expect(E2E_DESTINATIONS.map((d) => d.label)).toEqual(APP_DESTINATIONS.map((d) => d.label))
  })

  it('recognises each destination by a heading its label satisfies or its own greeting', () => {
    // The e2e list carries the level-1 heading each page must render — the sweeps' whole way of
    // knowing a page arrived. Every entry's pattern must at least match SOMETHING the shell can
    // produce: for the overview that is the greeting ("Signed in as …"), for the rest the
    // heading is the label. A pattern matching neither is a sweep that can never pass, or —
    // worse — one that was loosened until it matches anything.
    for (const destination of E2E_DESTINATIONS) {
      const app = APP_DESTINATIONS.find((d) => d.to === destination.path)
      expect(app, `${destination.path} is not a shell destination`).toBeDefined()

      const matchesLabel = destination.heading.test(app?.label ?? '')
      const matchesGreeting = destination.heading.test('Signed in as somebody')
      expect(
        matchesLabel || matchesGreeting,
        `${destination.path}'s heading pattern ${String(destination.heading)} matches neither ` +
          'its label nor the overview greeting — the sweeps would wait forever on it.',
      ).toBe(true)
    }
  })
})
