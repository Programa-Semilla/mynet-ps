import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T100 (007) — **what Messages deliberately does not have** (M5, FR-516).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **READ RECEIPTS, DELIVERY TICKS, TYPING INDICATORS AND PRESENCE ARE OUT OF SCOPE ENTIRELY.**
 *
 * Owner decision M5, and it is not a "not yet". Each of them is a disclosure about one attendee
 * to another that no requirement asks for, and each is the kind of thing that arrives as a small
 * pleasing addition rather than as a decision: a second tick on a bubble, a "typing…" line, a
 * green dot beside a name.
 *
 * The server side is covered by `unread-privacy.test.ts`, which proves no response carries
 * another attendee's read position. This is the client side of the same absence, and it is a
 * source-level check because the failure it guards against is **a component that renders
 * something the server never sent** — a hopeful `Delivered` label under a message would satisfy
 * every integration test in the suite.
 *
 * A grep is a blunt instrument and this one is deliberately blunt. It cannot prove the absence of
 * a concept; it can make the obvious spellings of it fail the build, which is the difference
 * between an absence somebody has to argue for and one that erodes quietly.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const MESSAGES_DIR = join(import.meta.dirname, '../../src/app/messages')

const sources = (): { name: string; text: string }[] =>
  readdirSync(MESSAGES_DIR)
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(MESSAGES_DIR, name), 'utf8') }))

/**
 * Words stripped of comments first, because every one of these appears in the prose explaining
 * why it is absent — including in this file's own neighbours. A check that failed on its own
 * justification would be uselessly noisy and would push the reasoning out of the code.
 */
const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('Messages renders nothing M5 puts out of scope', () => {
  it('finds the source to check — a gate that cannot fail is not a gate', () => {
    expect(sources().length).toBeGreaterThan(4)
  })

  it.each([
    ['a read receipt', /\bseen by\b|\bread receipt\b|\bhasRead\b|\bwasRead\b|\bseenAt\b/i],
    ['a delivery tick', /\bdelivered\b|\bdeliveryStatus\b|\bdoubleTick\b|\bsentTick\b/i],
    ['a typing indicator', /\bis typing\b|\btyping\b|\btypingIndicator\b/i],
    ['presence', /\bisOnline\b|\bpresence\b|\blastSeen\b|\bonlineNow\b/i],
  ])('renders no %s (M5)', (_label, pattern) => {
    const offending = sources()
      .filter(({ text }) => pattern.test(codeOf(text)))
      .map(({ name }) => name)

    expect(
      offending,
      'Each of these is a disclosure about one attendee to another that no requirement asks ' +
        'for, and each arrives as a small pleasing addition rather than as a decision (M5).',
    ).toEqual([])
  })

  it('offers no way to edit or delete a single message (FR-516)', () => {
    // The client half of the absence `no-message-mutation-routes.test.ts` guards on the server.
    // An "Edit" or "Delete" control would have nothing to call — and would be the first half of
    // somebody adding the route.
    const offending = sources()
      .filter(({ text }) =>
        /\bunsend\b|\bedit message\b|\bdelete message\b|\bretract\b/i.test(codeOf(text)),
      )
      .map(({ name }) => name)

    expect(offending).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T019 (016) — **the conversation repository stays undecorated** (FR-1013).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A REFRESH LOOP IS THE CHANGE MOST LIKELY TO TEMPT SOMEBODY INTO CACHING THIS.**
   *
   * 016 gave the conversation list a ten-second poll. The obvious next thought is that a list
   * being re-read every ten seconds should be cached so the first paint has something in it —
   * and message content is the most sensitive data in the product, which is why 007 refused to
   * cache Messages at all and said so per member at the composition root.
   *
   * Worse, the decorator's default is the wrong way round for this: it treats **every method not
   * named in `reads` as a write**, and a write purges the whole conference prefix. That is the
   * defect 008 shipped with `slots`. Not decorating removes the mechanism rather than
   * configuring it — there is no `reads` map to omit from and no `args[0]` to misread.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T019 — leaves the conversation and message repositories uncached (FR-1013)', () => {
    const services = readFileSync(join(import.meta.dirname, '../../src/app/services.ts'), 'utf8')

    for (const member of ['conversations', 'messages']) {
      expect(
        new RegExp(`${member}: new Http[A-Za-z]+Repository\\(http\\)`).test(services),
        `The ${member} repository is no longer constructed bare at the composition root. ` +
          'Messages is uncached by decision (FR-1013): its content is the most sensitive data ' +
          'in the product, and the decorator revokes on age alone.',
      ).toBe(true)

      expect(
        new RegExp(`const ${member} = cached\\(`).test(services),
        `The ${member} repository has been wrapped in \`cached\`. That is a change to what is ` +
          'written to this device, and it needs a decision rather than a line.',
      ).toBe(false)
    }
  })
})
