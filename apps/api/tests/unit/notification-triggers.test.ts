import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T123a (007) — **a received message is the only thing that dispatches a notification**
 * (FR-561, constitution 3.1.0).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE GATE THAT STOPS 008 AND 009 ADOPTING THE PLATFORM WITHOUT A DECISION.**
 *
 * Register entry 10 kept engagement notifications out of the product for four features. 3.1.0
 * reversed it for **one trigger** — somebody wrote to you — and left the rest exactly where it
 * was. That reversal is worded narrowly on purpose, and a narrow reversal has a predictable
 * failure mode: the hard part is now built, and the next feature reaches for it in good faith.
 * "An appointment was booked" and "your question was answered" are both obviously useful, both
 * one line away, and both a change of scope that the constitution requires somebody to *decide*
 * rather than to notice afterwards.
 *
 * So the trigger set is asserted structurally rather than trusted. A feature adding a second one
 * must edit this file, and editing this file is the conversation.
 *
 * **Distinct from `no-notification-surface.test.ts`**, which is the client half: that file covers
 * the bell and the notification centre FR-560 forbids; this one covers what may cause a push at
 * all. Either could pass while the other failed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SRC = join(import.meta.dirname, '../../src')

const sourcesUnder = (directory: string, prefix = ''): { name: string; text: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return sourcesUnder(path, name)
    return entry.name.endsWith('.ts') ? [{ name, text: readFileSync(path, 'utf8') }] : []
  })

/**
 * Comments stripped, because every one of the names below appears in the prose explaining the
 * rule — including in this file's own neighbours. A gate that failed on its own justification
 * would push the reasoning out of the code, which is the opposite of what it is for.
 */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * The modules permitted to dispatch, each named with the trigger it carries. Adding a name here
 * is how a second trigger gets introduced deliberately — and 014 is the first feature to do it.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T020 (014) — `routes/admin/catalog.ts` IS THE SECOND ENTRY, AND ITS PLACEMENT IS THE
 * FINDING RATHER THAN A DETAIL** (constitution v4.2.0 N1, FR-1026, research R3).
 *
 * v3.1.0 admitted one trigger and was worded so a second would require an amendment. v4.2.0 is
 * that amendment, and what it granted is **enumerated rather than described**: a material change
 * to a session the attendee has **saved**, where material means exactly three things —
 * *cancelled, start time, room*. A title, a summary or a change of speaker is content, and
 * content does not strand anybody in the wrong corridor. **A session starting is still
 * forbidden** (FR-1033), and that distinction is load-bearing: a reminder is something an
 * attendee could set themselves, a room change is information only the product holds.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THE DISPATCH IS IN A ROUTE MODULE AND NOT IN `notifications/session-change.ts`.**
 *
 * `PLATFORM` below excludes `notifications/**` from the scan **entirely**, because that
 * directory *is* the dispatcher. So a second trigger implemented as
 * `notifications/session-change.ts` would have passed the very test written to catch it —
 * silently, with a green suite. **The obvious tidy placement is the one that defeats the gate.**
 *
 * Recorded here rather than only in research R3, because this file is what somebody reads when
 * they are about to make that exact move.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const DISPATCH_CALLERS = ['routes/admin/catalog.ts', 'routes/conversations.ts']

/** The push implementation itself. Naturally excluded — it *is* the dispatcher. */
const PLATFORM = (name: string): boolean => name.startsWith('notifications/')

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T020 (014) — THE NEGATIVE ASSERTIONS NOW READ THE DISPATCH PATH RATHER THAN THE WHOLE
 * MODULE, AND THE NARROWING IS A DECISION RATHER THAN A CONVENIENCE.**
 *
 * The forbidden-trigger cases at the bottom of this file scanned each permitted caller's entire
 * source for words like `question` and `appointment`. That was an exact proxy while the only
 * caller was the message-send path, whose subject matter is messages and nothing else.
 *
 * It is the wrong population for a **catalog** module. `routes/admin/catalog.ts` legitimately
 * names questions — `engagementCountsFor` returns how many questions a session has, which is
 * what an organizer needs to choose between deleting and cancelling (FR-1025). A whole-module
 * scan would fail on a correct implementation, and the natural repair is to drop `question` from
 * the pattern — which would stop the assertion checking anything at all, in exactly the way this
 * file's own header warns about.
 *
 * So the population narrows to **what the module dispatches**: the body of every `notify…`
 * helper, plus `notifications/**` in full. That is what the requirement was always about — the
 * question is not "does this file mention appointments", it is "can an appointment cause a
 * push". 009 narrowed the event audit's conference-content predicate for the same reason and
 * recorded it the same way.
 *
 * **Extracted by counting braces rather than by a regex over the body.** A pattern for
 * "everything until the next `}`" stops matching the moment a helper contains an object literal,
 * and it fails *open* — the extracted region shrinks to nothing and every assertion below passes
 * vacuously. `admin-audit-completeness.test.ts` counts parentheses for the same reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const DISPATCH_HELPER = /const\s+(notify\w*)\s*=/g

const dispatchRegionOf = (code: string): string => {
  const regions: string[] = []

  for (const match of code.matchAll(DISPATCH_HELPER)) {
    const start = code.indexOf('{', match.index ?? 0)
    if (start === -1) continue

    let depth = 0
    let index = start

    for (; index < code.length; index += 1) {
      if (code[index] === '{') depth += 1
      if (code[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }

    regions.push(code.slice(start, index + 1))
  }

  return regions.join('\n')
}

describe('the notification trigger set is exactly two (FR-561, FR-1026)', () => {
  it('finds the source to check — a gate that cannot fail is not a gate', () => {
    const sources = sourcesUnder(SRC)
    expect(sources.length).toBeGreaterThan(20)
    for (const caller of DISPATCH_CALLERS) {
      expect(sources.map((source) => source.name)).toContain(caller)
    }
  })

  it('is dispatched from exactly the two declared modules', () => {
    const importers = sourcesUnder(SRC)
      .filter(({ name }) => !PLATFORM(name))
      .filter(({ text }) => /from '.*notifications\/dispatch\.js'/.test(codeOf(text)))
      .map(({ name }) => name)

    expect(
      importers.sort(),
      'A module reaches the dispatcher and is not one of the two declared triggers. The set is ' +
        'a received message (v3.1.0) and a material change to a saved session (v4.2.0 N1) — ' +
        'nothing else, and a third requires an amendment rather than an import.',
    ).toEqual([...DISPATCH_CALLERS].sort())
  })

  it('reaches the push port from nowhere else either', () => {
    // The port is decorated onto the Fastify instance, so `app.push` is the other way to dispatch
    // without importing the dispatcher — a route could call `app.push.send` directly and pass the
    // check above. `plugins/ports.ts` is where the decoration is declared, so it names it too.
    const users = sourcesUnder(SRC)
      .filter(({ name }) => !PLATFORM(name) && name !== 'plugins/ports.ts')
      .filter(({ text }) =>
        /\bapp\.push\b|\bfastify\.push\b|\brequest\.server\.push\b/.test(codeOf(text)),
      )
      .map(({ name }) => name)

    expect(users.sort()).toEqual(DISPATCH_CALLERS)
  })

  it('dispatches from the two send paths and nowhere else within that module', () => {
    const text = codeOf(readFileSync(join(SRC, 'routes/conversations.ts'), 'utf8'))

    // The helper exists — without this the count below would pass trivially on a file that had
    // stopped notifying anybody at all.
    expect(text).toMatch(/const notifyRecipient\s*=/)

    // Two calls: opening a conversation with a first message, and appending to an existing one.
    // Those are the two ways a message comes into being (FR-505, FR-511), so they are the two
    // ways somebody may be interrupted about one.
    const calls = text.match(/notifyRecipient\s*\(/g) ?? []
    expect(calls).toHaveLength(2)
  })

  /**
   * T020 (014) — **the authoring caller dispatches from ONE place, and only on a material
   * change** (FR-1026, FR-1027, FR-1028).
   *
   * The mirror of the assertion above, and it carries a requirement that one does not: the
   * authoring module writes eleven kinds of thing and exactly one of them may interrupt anybody.
   * A single call site is what makes that reviewable — a second would mean somebody had decided,
   * in code, that a different act deserves a push.
   */
  it('dispatches from one place in the authoring path, and only there', () => {
    const text = codeOf(readFileSync(join(SRC, 'routes/admin/catalog.ts'), 'utf8'))

    expect(
      text,
      'The authoring dispatch helper is gone. Either the second trigger was removed — in which ' +
        'case remove it from DISPATCH_CALLERS too — or it has been renamed out of the `notify` ' +
        'shape the negative assertions below extract, which would silently stop them checking.',
    ).toMatch(/const notifySavers\s*=/)

    const calls = text.match(/notifySavers\s*\(/g) ?? []
    expect(
      calls.length,
      'The authoring module calls its dispatch helper from more than one place. A material ' +
        'change is one thing that happens — a session was cancelled, moved, or put in another ' +
        'room — and the fan-out is the same for all three. A second call site means an act that ' +
        'is not one of v4.2.0 N1s three has been given a push.',
    ).toBe(2)
  })

  /**
   * The negative half. These are the triggers a later feature will want, and each is a scope
   * change rather than an implementation detail — the constitution's `Notification delivery`
   * block names the received message and the three material changes, and nothing else.
   *
   * **Scanned over the dispatch region rather than the whole module** — see `dispatchRegionOf`
   * for why, and why that is narrower rather than weaker.
   */
  it.each([
    ['an appointment', /\bappointment\b/i],
    ['a card exchange', /\bcardExchange\b|\bexchangedCard\b/i],
    ['a question or an answer', /\bquestion\b|\bupvote\b/i],
    ['a session reminder', /\bsessionReminder\b|\bstartingSoon\b|\bupNext\b|\bstarting\b/i],
    ['a marketing or digest send', /\bdigest\b|\bannouncement\b|\bbroadcast\b/i],
    // 014 — the three changes the amendment did NOT grant. Each is a plausible next ask and each
    // needs its own amendment: v4.2.0 enumerated the set precisely so that widening it is an
    // edit somebody has to justify rather than a line somebody adds.
    ['a title or summary edit', /\btitleChanged\b|\bsummaryChanged\b/i],
    ['a speaker change', /\bspeakerChanged\b|\bspeakerAdded\b/i],
    ['a reinstatement', /\breinstat/i],
  ])('does not dispatch for %s', (_label, pattern) => {
    const dispatchers = sourcesUnder(SRC)
      .filter(({ name }) => PLATFORM(name) || DISPATCH_CALLERS.includes(name))
      .filter(({ name, text }) => {
        const code = codeOf(text)
        // The platform is the dispatcher, so its whole source is the dispatch path. A caller's
        // is only the body of its `notify…` helpers.
        return pattern.test(PLATFORM(name) ? code : dispatchRegionOf(code))
      })
      .map(({ name }) => name)

    expect(
      dispatchers,
      'A dispatch path names a trigger the constitution has not admitted. The set is a received ' +
        'message (v3.1.0) and a cancellation, start-time change or room change to a SAVED ' +
        'session (v4.2.0 N1). Anything else is a scope change that needs an amendment — and ' +
        'this assertion reads the dispatch helper bodies, so moving the word elsewhere in the ' +
        'module is not the fix.',
    ).toEqual([])
  })

  it('extracts a dispatch region that is not empty, or the assertions above check nothing', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The failure mode of an extractor is silence: a brace-counting bug, a renamed helper or a
    // formatter run leaves `dispatchRegionOf` returning `''`, every pattern fails to match, and
    // eight assertions pass while examining nothing at all.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const caller of DISPATCH_CALLERS) {
      const region = dispatchRegionOf(codeOf(readFileSync(join(SRC, caller), 'utf8')))
      expect(region.length, `no dispatch region extracted from ${caller}`).toBeGreaterThan(80)
      expect(region, `the region extracted from ${caller} does not dispatch`).toMatch(
        /dispatchToDevices|dispatchPush/,
      )
    }
  })
})
