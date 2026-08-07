import { describe, expect, it } from 'vitest'

import { DESTINATIONS as APP_DESTINATIONS } from '../../src/app/navigation.js'
import { DESTINATIONS as E2E_DESTINATIONS } from '../../../../e2e/support/destinations.js'

/**
 * The end-to-end suite keeps its own copy of the destination list, because importing the app's
 * module would drag React and an icon library into the test runner's Node process.
 *
 * Duplication is only safe if it cannot drift. This is what makes it safe: add a destination to
 * one list and forget the other, and the unit gate fails immediately — rather than the
 * end-to-end suite quietly continuing to verify four destinations while the product has five,
 * which is exactly the "gate that passes while not checking" SC-010 warns about.
 */
describe('the end-to-end destination list mirrors the application', () => {
  it('covers the same addresses in the same order', () => {
    expect(E2E_DESTINATIONS.map((d) => d.path)).toEqual(APP_DESTINATIONS.map((d) => d.path))
  })

  it('uses the same labels', () => {
    expect(E2E_DESTINATIONS.map((d) => d.label)).toEqual(APP_DESTINATIONS.map((d) => d.label))
  })
})

/**
 * T066 (002) — **no destination address names a conference** (FR-119).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The active conference travels in requests, never in the address. That is what lets a switch
 * leave the browser address untouched, and it is why an address is safe to share: a link cannot
 * carry one attendee's conference into somebody else's session, and the router needs no scoping
 * rules of its own.
 *
 * Asserted here rather than observed once, because the tempting change — adding `/:eventId` to
 * make a destination "linkable to a conference" — looks reasonable in isolation and would
 * silently undo it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('destination addresses stay conference-neutral (FR-119)', () => {
  it.each(APP_DESTINATIONS.map((d) => [d.label, d.path] as const))(
    '%s has no event segment or query parameter',
    (_label, path) => {
      expect(path).not.toMatch(/:eventId|:event\b/)
      expect(path).not.toContain('?')
      // No dynamic segment of any kind: the five destinations are fixed addresses.
      expect(path).not.toMatch(/:/)
    },
  )
})
