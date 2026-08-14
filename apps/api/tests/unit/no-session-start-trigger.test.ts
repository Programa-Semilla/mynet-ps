import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T091 (014) — **a session STARTING dispatches nothing** (FR-1033, constitution v4.2.0 N1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE DISTINCTION IS LOAD-BEARING AND IT IS ONE SENTENCE WIDE.**
 *
 * v4.2.0 widened the trigger set for the first time since v3.1.0 created it, and bounded the
 * widening to three named changes: cancelled, start time, room. The principle that generated the
 * set is *a notification is raised when a change affects **where or whether** the attendee must
 * be somewhere*.
 *
 * A session **starting** affects neither. It is a reminder — something an attendee can already
 * set on their own phone from a schedule they already have — and the amendment forbids it
 * explicitly rather than by omission, because it is the single most obvious thing to add next and
 * the one that would look most like a courtesy.
 *
 * **A change is different in kind**: the attendee cannot know their 14:00 moved to the room
 * across the venue, because only the product holds that fact. That asymmetry is the whole reason
 * one is permitted and the other is not, and it is why "we already notify about sessions" would
 * be a false step from here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE MECHANISM THAT WOULD BE NEEDED IS ITSELF THE TELL, AND IT IS WHAT THIS FILE LOOKS FOR.**
 *
 * Every dispatch in this product is caused by **a request somebody made**: a message sent, a
 * session cancelled. A start-time reminder cannot work that way — nobody makes a request when
 * 14:00 arrives — so it needs a **scheduler**: a cron entry, a timer, a queue, a sweep that reads
 * the clock and dispatches. This product has exactly one background mechanism, `RETENTION_SWEEPS`,
 * and its purpose is deleting data no cascade can reach.
 *
 * So the strongest available assertion is not about the word "start" — it is that **nothing
 * time-driven dispatches at all**. A grep for `starting` can be renamed around; a scheduler
 * cannot be built without appearing.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Comments are stripped before matching, as 009's guards do — every phrase above appears in the
 * prose of the code it audits.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const label = (path: string): string => path.slice(apiSrc.length)
const files = sourceFiles(apiSrc)

/**
 * Everything that can cause a delivery.
 *
 * Named from `notification-triggers.test.ts`'s own list rather than guessed: that gate is the one
 * that decides what may dispatch at all, and this one asks a different question of the same set.
 */
const dispatchers = files.filter((path) =>
  /dispatchToDevices|dispatchPush|\.push\b/.test(codeOnly(path)),
)

describe('014 — a session starting dispatches nothing (FR-1033)', () => {
  it('found the dispatchers to audit — a gate that cannot fail is not a gate', () => {
    expect(files.length).toBeGreaterThan(30)
    expect(
      dispatchers.length,
      'No dispatching code was found at all, so every assertion below is vacuous. Web Push is ' +
        'real in this product (007) and 014 adds a second trigger — if nothing matches, the ' +
        'pattern is wrong rather than the product being quiet.',
    ).toBeGreaterThan(1)
  })

  /**
   * **No dispatch is caused by a clock.** The mechanism, rather than the word.
   */
  it('schedules no delivery — no timer, cron or queue reaches a dispatcher (FR-1033)', () => {
    const scheduled = dispatchers
      .filter((path) => {
        const code = codeOnly(path)
        return /setInterval\s*\(|setTimeout\s*\([^)]*\d{4,}|\bcron\b|\bschedule(Job|Delivery)\b|\benqueue\b/i.test(
          code,
        )
      })
      .map(label)

    expect(
      scheduled,
      'A delivery is scheduled rather than caused by a request. Every dispatch in this product ' +
        'follows an act somebody performed; a clock-driven one is a reminder, and a reminder is ' +
        'something the attendee can already set themselves from a schedule they already have ' +
        '(FR-1033).',
    ).toEqual([])
  })

  it('runs no background sweep that dispatches (FR-1033)', () => {
    // `RETENTION_SWEEPS` is the one background mechanism, and it exists to DELETE data no cascade
    // can reach. A sweep that also notified would be the scheduler FR-1033 forbids, wearing the
    // one piece of infrastructure that already runs on a timer.
    const maintenance = files.filter((path) => /maintenance\.ts$|retention/i.test(path))
    expect(maintenance.length, 'the retention sweep could not be located').toBeGreaterThan(0)

    const notifying = maintenance
      .filter((path) => /dispatchToDevices|dispatchPush|subscriptionsFor/.test(codeOnly(path)))
      .map(label)

    expect(
      notifying,
      'The retention sweep dispatches. It exists to delete data no cascade can reach, and it is ' +
        'the only thing in this product that runs on a clock — which makes it the cheapest place ' +
        'to add the reminder FR-1033 forbids.',
    ).toEqual([])
  })

  /**
   * **No dispatcher reads a session's start time to decide whether to send.**
   *
   * The start time is read constantly and correctly — it is on the payload of a time change
   * (FR-1029), it orders the programme, it decides the venue day. What must not happen is a
   * *comparison against now* inside a dispatching path, which is what a reminder is.
   */
  it('compares no start time against the clock inside a dispatching path (FR-1033)', () => {
    const comparing = dispatchers
      .filter((path) => {
        const code = codeOnly(path)
        return /startsAt[^\n]{0,60}(Date\.now|new Date\(\)\s*)|\bnow\b[^\n]{0,40}startsAt/.test(
          code,
        )
      })
      .map(label)

    expect(
      comparing,
      'A dispatching path compares a session’s start time against now. That comparison IS a ' +
        'reminder: a change notification depends on what an organizer did, never on what time ' +
        'it is (FR-1033).',
    ).toEqual([])
  })

  /**
   * **The trigger set is exactly two**, which is the positive statement of the same rule.
   *
   * `notification-triggers.test.ts` names the permitted callers; this asserts what causes them.
   * A third entry here is a constitution amendment, as v4.2.0 was for the second.
   */
  it('keeps the dispatch causes at two, both request-driven (v3.1.0, v4.2.0 N1)', () => {
    const triggers = codeOnly(join(apiSrc, '../tests/unit/notification-triggers.test.ts'))
    const declared = /DISPATCH_CALLERS[^=]*=\s*\[([\s\S]*?)\]/.exec(triggers)?.[1] ?? ''

    expect(declared, 'the permitted-caller list could not be located').not.toBe('')

    const callers = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(
      callers,
      'The permitted dispatch callers changed. Two triggers exist: a received message (v3.1.0) ' +
        'and a material change to a saved session (v4.2.0 N1). A third needs an amendment — ' +
        'that is what v3.1.0 built the rule for and what 014 was the first to take up.',
    ).toHaveLength(2)

    // Both are route modules — that is what "request-driven" means structurally.
    for (const caller of callers) {
      expect(caller).toMatch(/^routes\//)
    }
  })
})
