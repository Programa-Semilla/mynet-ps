import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { HOME_CARDS } from '../../src/app/home/registry.js'

/**
 * T037a (016) — **there is no Home card for contacts, and this feature must not add one**
 * (FR-1030).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ABSENCE THAT ONLY BECAME LOAD-BEARING WHEN ACQUIRING A CONTACT BECAME PASSIVE.**
 *
 * Until constitution v5.0.0 (C1), a card only ever entered somebody's Network because they
 * reciprocated — their own act, at a moment they chose, so there was nothing to surface. Mutual
 * exchange changes that: a contact now appears from **another person's** act, and the reader
 * finds out on their next visit to Network and not before, because FR-1029 dispatches nothing.
 *
 * That gap is exactly what makes "just put it on Home" the obvious next move, and it is why the
 * absence needs a guard rather than a note. The specification records it as the open question C1
 * creates and answers it for now: **Network is the only surface that lists contacts.**
 *
 * **This is not a claim that the answer is right** — it is a claim that changing it is a
 * decision. A feature that wants a contacts card must edit this file, and editing it is the
 * conversation. The same mechanism `notification-triggers.test.ts` uses for the trigger set.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const HOME = join(import.meta.dirname, '../../src/app/home')

/**
 * Comments stripped, because every word this test searches for also appears in the prose
 * explaining why the surface is absent — including in this file's own neighbours. A guard that
 * failed on its own justification would push the reasoning out of the code, which is the
 * opposite of what it is for. 009's absence tests record the same trap: the natural repair is to
 * weaken the pattern until it checks nothing.
 */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const cardSources = (): { name: string; text: string }[] =>
  readdirSync(join(HOME, 'cards'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(join(HOME, 'cards', entry.name), 'utf8'),
    }))

/**
 * The **eight** cards Home carries, by declared id.
 *
 * Eight rather than the seven the feature notes describe: those count the *dashboard elements*
 * `requirements.md` names, and 002 contributed four cards to cover the first few. The registry
 * entry count and the requirement count have never been the same number — `qa-absences.test.ts`
 * records the same correction against its own `toHaveLength(8)`. The header said seven above an
 * eight-element array, which is the one thing a reader deciding whether a card had been added
 * would have trusted.
 *
 * **Derived from the registry rather than from a copy of it**, which is what makes a newly
 * registered contacts card fail *by existing* — the technique `deletion-coverage.test.ts` and
 * `export-coverage.test.ts` both use to make a future feature's omission break the build rather
 * than pass unnoticed.
 */
const EXPECTED_CARD_IDS = [
  'appointments',
  'greeting-day-context',
  'next-saved-session',
  'people-to-meet',
  'rest-of-day',
  'unread-messages',
  'up-next',
  'your-conferences',
]

describe('contacts have no Home surface (FR-1030)', () => {
  it('finds the registry to check — a gate that cannot fail is not a gate', () => {
    expect(HOME_CARDS.length).toBeGreaterThan(5)
    expect(cardSources().length).toBeGreaterThan(5)
  })

  it('registers exactly the known cards, so a contacts card fails by existing', () => {
    expect(
      HOME_CARDS.map((card) => card.id).sort(),
      'A card was added to or removed from Home. If it lists contacts or exchanged cards, ' +
        'FR-1030 forbids it and this feature’s answer to "how does somebody learn they were ' +
        'given a card" has been changed without the decision that requires. If it is something ' +
        'else entirely, add its id here.',
    ).toEqual(EXPECTED_CARD_IDS)
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The pattern is the card REPOSITORY, not the word "contact", and that is a narrowing
   * made deliberately rather than to get to green.**
   *
   * Matching the English word flagged `Appointments.tsx`, whose empty state reads *"…to propose
   * one to a contact"*. That is a sentence pointing somebody at Network, not a surface listing
   * contacts — the card reads appointments and would render identically if the card domain did
   * not exist.
   *
   * What FR-1030 forbids is a Home card that **reads held cards**, and a card cannot do that
   * without reaching the repository. So the guard asks about the data dependency, which is the
   * thing that would actually have to appear. Weakening it further — to a name a contacts card
   * might not happen to use — is the failure 009's absence tests warn about, where the natural
   * repair is to loosen the pattern until it checks nothing.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('has no card that reads the card domain (FR-1030)', () => {
    const offenders = cardSources()
      .filter(({ text }) =>
        /useCardRepository|CardRepository|\bheldCards?\b|\bsharedCards?\b/.test(codeOf(text)),
      )
      .map(({ name }) => name)

    expect(
      offenders,
      'A Home card reaches the card repository. Network is the only surface that lists contacts ' +
        '(FR-1030), and a card acquired by somebody else’s act is found there on the reader’s ' +
        'next visit — not announced, and not surfaced on Home.',
    ).toEqual([])
  })

  it('registers no card claiming to be about cards, by id or by title', () => {
    const suspicious = HOME_CARDS.filter((card) => /card|contact/i.test(card.id))

    expect(suspicious.map((card) => card.id)).toEqual([])
  })
})
