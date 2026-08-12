import { describe, expect, it } from 'vitest'

import * as auditModule from '../../src/db/queries/admin-audit.js'

/**
 * T035 (013) — **append-only, asserted by name-shape over the module's exports** (FR-996).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE MECHANISM IS THAT THE FUNCTION DOES NOT EXIST, AND THIS IS WHAT NOTICES WHEN ONE DOES.**
 *
 * `catalog-read-only.test.ts` established this shape for FR-191 and it is used unchanged here.
 * Its value is that it fails on the *addition*, not on the use: somebody adding
 * `updateAuditEntry` "for a correction workflow" gets a red build in the change that adds it,
 * before any route calls it and before anybody has built a screen around it.
 *
 * An audit trail an operator can edit accounts for nothing — and the operator with the most
 * reason to edit an entry is the one it indicts. That is not a hypothetical about bad faith; it
 * is the reason accountability records are append-only everywhere they exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The two permitted exceptions are named individually rather than pattern-matched away.**
 *
 * `pruneAuditEntries` deletes, and `pseudonymiseAuditEntriesFor` updates. Both are *retention*
 * rather than *revision*, both are required by Principle VIII, and both are listed here by exact
 * name — so a third function cannot arrive by matching a relaxed pattern. Widening this list is
 * the natural wrong repair, which is precisely why it is a list of literals.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Exactly the two retention operations, by name. Not a pattern — see the header. */
const PERMITTED_MUTATIONS = new Set(['pruneAuditEntries', 'pseudonymiseAuditEntriesFor'])

const exportNames = Object.keys(auditModule).sort()

describe('the audit trail is append-only (FR-996)', () => {
  it('found exports to audit', () => {
    // A gate that cannot fail is not a gate.
    expect(exportNames.length).toBeGreaterThan(2)
    expect(exportNames).toContain('appendAuditEntry')
  })

  it('exposes no update or delete path', () => {
    const mutating = exportNames
      .filter((name) =>
        /^(update|delete|remove|edit|amend|revise|set|patch|clear|purge)/i.test(name),
      )
      .filter((name) => !PERMITTED_MUTATIONS.has(name))

    expect(
      mutating,
      'The audit module exposes a way to change or remove an entry (FR-996). An accountability ' +
        'record an operator can edit accounts for nothing, and the operator with the most reason ' +
        'to edit an entry is the one it indicts. The only permitted mutations are the two ' +
        'retention operations, and they are listed by exact name in this file.',
    ).toEqual([])
  })

  it('exposes no read path (FR-999)', () => {
    const reading = exportNames.filter((name) =>
      /^(get|list|find|read|fetch|search|count)/i.test(name),
    )

    expect(
      reading,
      'The audit module exposes a read. The trail records THAT a disclosure happened, never ' +
        'what was disclosed — and a route returning entries would turn the accountability ' +
        "record into a second, unbounded copy of what v4.1.0's third Principle VIII exception " +
        'carefully bounded (FR-999). There is no administrative screen for this.',
    ).toEqual([])
  })

  it('keeps the permitted-mutation list at exactly the two retention operations', () => {
    // The list is the thing that would be widened to make a new mutation pass, so its size is
    // asserted rather than left to review.
    expect(
      PERMITTED_MUTATIONS.size,
      'The permitted-mutation list has grown. Both entries are retention obligations under ' +
        "Principle VIII; a third would be revision wearing retention's clothes.",
    ).toBe(2)

    for (const name of PERMITTED_MUTATIONS) {
      expect(exportNames, `${name} is permitted but no longer exists`).toContain(name)
    }
  })
})
