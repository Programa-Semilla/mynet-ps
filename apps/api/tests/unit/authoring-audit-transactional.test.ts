import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T023 (014) — **every authoring act and the entry accounting for it commit together, or neither
 * does** (FR-1037, and 013's FR-994 unchanged).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE THIS PROJECT HAS ALREADY SHIPPED THAT DEFECT ONCE.**
 *
 * `appendAuditEntry` has taken an executor parameter since the day it was written, and its own
 * header asserted that *"every write path"* passed one. **No caller did.** A failing entry
 * therefore left the act committed and unrecorded — precisely the guarantee FR-994 states cannot
 * happen — and it was 013's headline post-review fix. It was one of four functions whose
 * emphatic headers described call relationships that did not exist, which is the most
 * transferable thing that feature produced: **in a codebase whose discipline is that the comment
 * is the record, a header is a claim that needs a guard like any other.**
 *
 * 014 adds a whole new category of audited act — eight of them — written by somebody who will
 * not have read that review. So the guard is written first.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **ASSERTED AT THE SOURCE, BECAUSE THE FAILURE IS A ROLLBACK.**
 *
 * The only way to observe it behaviourally is to make the insert fail, which needs a broken
 * foreign key the route cannot be persuaded to produce.
 * `tests/integration/authoring-audit-rollback.test.ts` drives that at the query layer, per act
 * category; this is what stops a later edit quietly dropping the `tx` argument in between.
 *
 * **The parentheses are counted rather than matched with a regular expression.** The argument is
 * a multi-line object literal with a trailing comma after the executor, and a pattern for that
 * shape is exactly the kind of thing that stops matching after a formatter run — failing **open**,
 * which is the direction that matters. `admin-audit-completeness.test.ts` counts them for the
 * same reason, and this is deliberately the same code rather than a cleverer variant.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const WRITE_LAYER = fileURLToPath(new URL('../../src/db/queries/admin-catalog.ts', import.meta.url))

/** 009's rule: every name below appears in the prose explaining it. */
const code = (): string =>
  readFileSync(WRITE_LAYER, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/** The full text of each `appendAuditEntry(...)` call, by counting parentheses. */
const callsIn = (source: string): string[] => {
  const calls: string[] = []
  const needle = 'appendAuditEntry('
  let from = source.indexOf(needle)

  while (from !== -1) {
    let depth = 0
    let index = from + needle.length - 1

    for (; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1
      if (source[index] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }

    calls.push(source.slice(from, index + 1))
    from = source.indexOf(needle, index)
  }

  return calls
}

/** A call is atomic when its object argument is followed by a second one — the executor. */
const passesExecutor = (call: string): boolean => /\}\s*,\s*\w+\s*,?\s*\)$/.test(call)

describe('the authoring audit trail is transactional (T023, FR-1037)', () => {
  it('finds the write layer and its audit calls — a gate that cannot fail is not a gate', () => {
    const source = code()
    expect(source.length, 'the authoring write layer is missing or empty').toBeGreaterThan(1_000)
    expect(
      callsIn(source).length,
      'No `appendAuditEntry` calls were found in the authoring write layer. Either the audit ' +
        'entries moved — in which case this assertion has to move with them — or the acts have ' +
        'stopped recording anything at all (FR-1037).',
    ).toBeGreaterThan(0)
  })

  it('passes the acting transaction on every call', () => {
    const bare = callsIn(code()).filter((call) => !passesExecutor(call))

    expect(
      bare,
      'An authoring act appends its audit entry outside the transaction that performs the act. ' +
        'If the insert fails, the act still commits — unrecorded — which is precisely what ' +
        'FR-1037 promises cannot happen. Pass the transaction as the second argument.\n\n' +
        'This is not hypothetical: 013 shipped exactly this defect, in a function whose own ' +
        'header claimed every caller passed one.',
    ).toEqual([])
  })

  it('takes its executor as a required parameter, never a defaulted one', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The other half, and the one that made 013's defect possible. `appendAuditEntry` defaults
    // its executor to the pool — correctly, for the single caller that has no transaction to
    // join — which means **the unsafe call is the shorter one to write**. Every function in the
    // authoring write layer therefore requires a `tx`, so the mistake cannot be made silently.
    //
    // Matched on the parameter list rather than on a call, because the failure is a signature
    // that permits the omission rather than a call site that takes it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const source = code()
    const optional = [...source.matchAll(/\btx\s*(\?|=)\s*/g)].map((match) => match[0])

    expect(
      optional,
      'A function in the authoring write layer takes its transaction as optional or defaulted. ' +
        'That makes the unrecorded-act path the shorter one to write, which is how 013 shipped ' +
        'this defect. Require it.',
    ).toEqual([])
  })

  it('names an authoring action on every call, from the closed set', () => {
    // A call that passes a transaction and writes the wrong action is atomic and useless. The
    // check constraint would refuse an undeclared one at runtime;
    // `admin-audit-completeness.test.ts` fails the build first. This asserts the narrower thing:
    // every call in *this* module writes one of 014's eight.
    const used = [...code().matchAll(/action:\s*'([a-z_]+)'/g)].map((match) => match[1] as string)

    expect(used.length, 'no audit actions found in the authoring write layer').toBeGreaterThan(0)

    const authoring = [
      'create_conference',
      'update_conference',
      'write_catalog',
      'delete_catalog',
      'write_session',
      'cancel_session',
      'reinstate_session',
      'delete_session',
    ]

    expect(
      used.filter((action) => !authoring.includes(action)),
      'The authoring write layer records an action outside the eight 014 declares. An act ' +
        'recorded under another feature’s name is an accountability record pointing at the ' +
        'wrong thing.',
    ).toEqual([])
  })
})
