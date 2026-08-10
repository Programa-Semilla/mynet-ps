import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { HOME_CARDS } from '../../src/app/home/registry.js'
import { DESTINATIONS } from '../../src/app/navigation.js'

/**
 * T089, T090a (009) — **the client-side absences** (FR-731, FR-753, FR-773).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FEATURE ADDS NO DESTINATION AND NO HOME CARD, AND BOTH REFUSALS ARE DELIBERATE.**
 *
 * Q&A is a *section on a panel*, not a place. It is the first feature since 002 to add a surface
 * without adding anywhere to go, and the temptation runs the other way: Home has a registry that
 * takes one appended line, and `navigation.ts` takes one more. Neither is right.
 *
 *   - **No Home card** (FR-753). Home answers "what is happening next, who should I meet, where
 *     are my conversations". A list of questions on a session the attendee may not be at answers
 *     none of them, and Home is *composed* — seven cards is already the declared limit of what a
 *     first viewport can carry (standing decision 9).
 *   - **No navigation destination** (FR-773). The five destinations are settled product scope. A
 *     sixth would be a change to what the product *is*, and a question has no meaning away from
 *     the session it was asked at.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const appSrc = fileURLToPath(new URL('../../src/app/', import.meta.url))

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * Source with comments stripped, so these guards read code rather than prose.
 *
 * The API's sibling guard records the reasoning at length: every pattern below also appears in
 * the comments *explaining* the absence, so matching raw text fails on a correct implementation
 * and the natural repair is to weaken the pattern until it stops checking anything.
 */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/**
 * Every file this feature owns in the client, **derived rather than listed**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A hand-maintained list makes the guards below blind to exactly the change they exist to
 * catch: a poller added in a *new* file — `agenda/useQuestionPoll.ts`, `agenda/QuestionRow.tsx`
 * — is invisible to a list that names two files. Deriving it means a new Q&A file is scanned
 * the moment it exists.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const QA_FILES = sourceFiles(join(appSrc, 'agenda')).filter((path) => /[Qq]uestion/.test(path))

describe('009 — the client-side absences', () => {
  it('adds no navigation destination (FR-773)', () => {
    const addresses = DESTINATIONS.map((destination) => destination.path)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The five destinations are settled product scope, and `navigation.ts` is an append-only
    // registry — which is exactly why this needs asserting: adding a sixth costs one line and
    // would look like ordinary feature work.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(addresses).toHaveLength(5)
    expect(addresses.join(' ')).not.toMatch(/question/i)
  })

  it('adds no Home card (FR-753)', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Asserted over the **registry itself** rather than over the file's text. A text match found
    // the word "question" inside a development-mode assertion's error string — prose again, in a
    // runtime literal this time, where stripping comments does not reach it.
    //
    // Reading the exported array is better than a workaround anyway: it checks what the shell
    // will actually render, so a card added under any name at all is caught, while a comment
    // discussing questions is not.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const described = HOME_CARDS.map((card) => `${card.id} ${card.title}`).join(' ')

    expect(
      described,
      'A Q&A card appeared on Home. Home answers "what is next, who should I meet, where are my ' +
        'conversations" — a list of questions on a session the attendee may not be at answers ' +
        'none of them, and Home is composed rather than accumulated (standing decision 9).',
    ).not.toMatch(/question|q&a|upvote/i)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Eight entries, and 009 adds none.** Pinned so that "one more line" in an append-only
    // registry is a visible decision rather than an append nobody notices.
    //
    // Eight rather than the seven the feature notes describe: those count the *dashboard
    // elements* `requirements.md` names, and 002 contributed four cards to cover the first few.
    // The registry entry count and the requirement count have never been the same number.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(HOME_CARDS).toHaveLength(8)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T090a — **NOTHING IN THIS FEATURE POLLS** (FR-731).
   *
   * 007's thread poller is one import away and this is deliberately not it. A conversation is a
   * live exchange between two people who are both waiting; a question list is a page somebody is
   * reading, and refreshing it under them would move the row they were part-way through. The
   * list updates when the reader acts, because every write answers with the whole list.
   *
   * **An absence nobody tests is one the next reader adds back**, and this is the single most
   * likely addition to this feature — "the count doesn't update live" reads as a bug rather than
   * as a decision unless something says otherwise.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('starts no timer and reads no visibility state (FR-731)', () => {
    for (const path of QA_FILES) {
      const source = codeOnly(path)

      expect(source, `${path} starts an interval`).not.toMatch(/setInterval|setTimeout/)
      expect(source, `${path} polls on a schedule`).not.toMatch(
        /useDocumentVisible|VisibilityService/,
      )
      expect(source, `${path} imports a poller`).not.toMatch(/poll/i)
    }
  })

  it('keeps the Q&A files free of the notification platform (FR-747, FR-767)', () => {
    for (const path of QA_FILES) {
      const source = codeOnly(path)

      // 007's platform is reachable from anywhere in the client. Q&A dispatches nothing, and a
      // Q&A surface is exactly where somebody would reach for a bell next.
      expect(source).not.toMatch(/useNotifications|requestPermission|NotificationPrompt/)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE ONE LINE THAT MAKES SC-711 TRUE, ASSERTED WHERE IT ACTUALLY LIVES.**
   *
   * `packages/data/tests/questions-uncached.test.ts` proves that an *undecorated* repository
   * purges nothing — which is true by construction of the object it builds itself. It says
   * nothing about what `services.ts` wires, and that is where the property lives: change one
   * line to `cached(new HttpQuestionsRepository(http), …)` and every test in this feature stays
   * green while every ask, vote, unvote and withdraw purges the attendee's whole offline
   * conference. Exactly 008's `slots` defect, on 009's methods.
   *
   * Read from source rather than by constructing the registry, because `cached` returns a
   * `Proxy` that forwards `getPrototypeOf` — so `instanceof` cannot tell a decorated repository
   * from a bare one, and a behavioural check would need a real store and a real transport.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('wires the questions repository UNDECORATED at the composition root (SC-711, FR-754)', () => {
    const services = codeOnly(join(appSrc, 'services.ts'))

    const member = /questions:\s*([^,\n]+)/.exec(services)
    expect(member, 'no `questions:` member found in the composition root').not.toBeNull()

    expect(
      member?.[1]?.trim(),
      'The questions repository is no longer wired bare. `cached` treats every method not named ' +
        'in `reads` as a WRITE, and a write purges the whole conference prefix — so decorating ' +
        'this member makes every upvote drop the cached programme, saved sessions and notes ' +
        '(FR-756, SC-711). Not decorating is what makes FR-755 and FR-757 structural rather ' +
        'than classified: there is no `reads` map to omit from and no `args[0]` to misread.',
    ).toBe('new HttpQuestionsRepository(http)')

    // …and the decorator is not applied to it from anywhere else in the file either.
    expect(services).not.toMatch(/cached\(\s*new HttpQuestionsRepository/)
  })

  it('found the files it claims to audit', () => {
    // A gate that cannot fail is not a gate: every assertion above iterates `QA_FILES`, and an
    // empty list would make all of them pass over nothing.
    expect(
      QA_FILES.length,
      "no Q&A files were found to audit — has this feature's structure moved?",
    ).toBeGreaterThanOrEqual(2)

    // The two that must always be there, so the derivation cannot silently start matching
    // something else entirely.
    expect(QA_FILES).toContain(join(appSrc, 'agenda/PanelQuestions.tsx'))
    expect(QA_FILES).toContain(join(appSrc, 'agenda/useSessionQuestions.ts'))
  })
})
