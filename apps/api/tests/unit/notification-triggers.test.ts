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
 * The one module permitted to dispatch, and the reason it is that one: it is where a message is
 * written. Adding a name here is how a second trigger gets introduced deliberately.
 */
const DISPATCH_CALLERS = ['routes/conversations.ts']

/** The push implementation itself. Naturally excluded — it *is* the dispatcher. */
const PLATFORM = (name: string): boolean => name.startsWith('notifications/')

describe('a received message is the only notification trigger (FR-561)', () => {
  it('finds the source to check — a gate that cannot fail is not a gate', () => {
    const sources = sourcesUnder(SRC)
    expect(sources.length).toBeGreaterThan(20)
    expect(sources.map((source) => source.name)).toContain('routes/conversations.ts')
  })

  it('is dispatched from exactly one module, and that module is the send path', () => {
    const importers = sourcesUnder(SRC)
      .filter(({ name }) => !PLATFORM(name))
      .filter(({ text }) => /from '.*notifications\/dispatch\.js'/.test(codeOf(text)))
      .map(({ name }) => name)

    expect(importers.sort()).toEqual(DISPATCH_CALLERS)
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
   * The negative half. These are the triggers a later feature will want, and each is a scope
   * change rather than an implementation detail — the constitution's `Notification delivery`
   * block names the received message and nothing else.
   */
  it.each([
    ['an appointment', /\bappointment\b/i],
    ['a card exchange', /\bcardExchange\b|\bexchangedCard\b/i],
    ['a question or an answer', /\bquestion\b|\bupvote\b/i],
    ['a session reminder', /\bsessionReminder\b|\bstartingSoon\b|\bupNext\b/i],
    ['a marketing or digest send', /\bdigest\b|\bannouncement\b|\bbroadcast\b/i],
  ])('does not dispatch for %s', (_label, pattern) => {
    const dispatchers = sourcesUnder(SRC)
      .filter(({ name }) => PLATFORM(name) || DISPATCH_CALLERS.includes(name))
      .filter(({ text }) => pattern.test(codeOf(text)))
      .map(({ name }) => name)

    expect(dispatchers).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T036 (016) — **the card exchange dispatches nothing** (FR-1029).
   *
   * The two structural cases above already make this impossible, since only
   * `routes/conversations.ts` may import the dispatcher or reach `app.push`. This names the card
   * path anyway, for a reason 016 supplies and 007 could not:
   *
   * **C1 made acquiring a contact PASSIVE.** Until v5.0.0 a card only ever arrived because the
   * holder reciprocated, so there was nothing to announce and nobody was tempted to announce it.
   * Now a card appears in somebody's Network from another person's act, and "tell them" becomes
   * the obvious next thought — it is one line, it reads as a kindness, and it is a second
   * notification trigger, which the constitution requires somebody to *decide*.
   *
   * The specification records this as the open question C1 creates (*"is 'found on your next
   * visit to Network' enough?"*) and answers it for now with FR-1029 plus FR-1030's absent Home
   * card. So the refusal is deliberate and needs a named guard rather than an incidental one.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T036 — nothing on the card write path can dispatch (FR-1029)', () => {
    const cardPath = ['routes/cards.ts', 'db/queries/cards.ts']

    const sources = sourcesUnder(SRC).filter(({ name }) => cardPath.includes(name))

    // The files exist. Renaming one must fail this rather than silently checking nothing.
    expect(sources.map(({ name }) => name).sort()).toEqual([...cardPath].sort())

    for (const { name, text } of sources) {
      const code = codeOf(text)

      expect(code, `${name} imports the notification dispatcher`).not.toMatch(
        /from '.*notifications\//,
      )
      expect(code, `${name} reaches the push port`).not.toMatch(
        /\bapp\.push\b|\bfastify\.push\b|\brequest\.server\.push\b/,
      )
    }
  })
})
