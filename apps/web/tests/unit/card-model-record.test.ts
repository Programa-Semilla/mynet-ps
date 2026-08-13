import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T042 (016) — **no source file may describe card sharing as one-directional as current fact**
 * (FR-1021, FR-1022, FR-1052, constitution v5.0.0 C1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE THE PROSE SHIPPED WRONG WHILE EVERY GATE STAYED GREEN.**
 *
 * C1 reversed card sharing from one-directional to a mutual exchange, and 016 delivered that
 * server-side: `shareCard` writes both rows or neither. The client copy, three docblocks and two
 * tests were left describing the retracted model, and the deep review had to find them by
 * reading — three of its five perspectives arrived at the same defect independently.
 *
 * **What it would have caught, and did not exist to.** All of these were live, green and
 * shipping when this file was written:
 *
 *   - `ShareCardAction.tsx` told the sharer *"you will hold theirs when they share it with you"*
 *     — false at the instant it rendered, on the one surface whose stated purpose is to stop
 *     card direction being misread;
 *   - `NetworkStates.tsx` told an attendee with no contacts that *"theirs will arrive here when
 *     they share back"*, instructing them to wait for a step that no longer exists;
 *   - `AttendeeProfile.tsx` justified the scheduling control with *"sharing is one-directional
 *     (FR-602) … they do not become your contact"*, which is the dangerous kind of stale: a
 *     reader could delete a required control on the strength of it;
 *   - `packages/data/src/interfaces/cards.ts` stated the rule three times over;
 *   - `packages/data/src/interfaces/appointments.ts` opened its central contrast with *"a card
 *     is one-directional and needs no answer"*.
 *
 * The fixtures below are those exact sentences, asserted to be caught — so this guard is proven
 * against the text it was written for rather than against a paraphrase of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT READS PROSE, WHICH IS THE OPPOSITE OF WHAT EVERY OTHER ABSENCE TEST HERE DOES.**
 *
 * `qa-absences.test.ts`, `card-surfaces-absences.test.ts` and their siblings strip comments
 * before matching, because their subject is *code* and every pattern they use also appears in
 * the prose explaining the absence. Here the prose **is** the subject: a comment asserting a
 * retracted rule is the defect. So comments, JSX text and string literals are all scanned, and
 * the stripping runs the other way — comment syntax is removed so that the sentences inside it
 * can be read.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A HISTORICAL NOTE IS PERMITTED, AND THAT PERMISSION IS THE HARD PART.**
 *
 * Saying what was replaced is not the defect — it is how this codebase keeps a decision legible.
 * `apps/api/src/plugins/card-access.ts` records *"it used to be justified as 'sharing gives; it
 * does not take' — FR-602, which C1 retracts"*, and that sentence is correct and load-bearing;
 * `apps/api/src/db/queries/cards.ts` does the same for FR-1053's guard. Only a claim stated as
 * **present fact** is wrong.
 *
 * The discriminator is a `RETRACTION` marker — `C1`, `v5.0.0`, `retract`, `reverses`, `used to`,
 * `no longer` — **anywhere in the same paragraph**. Paragraph rather than sentence, deliberately:
 * these docblocks argue in paragraphs, and a marker one sentence away from its claim is the
 * normal shape of a correct note. A sentence-scoped window flagged three correct paragraphs when
 * it was tried, and a guard that cries wolf gets weakened until it checks nothing — which is the
 * failure 009's absence tests record and this one is trying not to repeat.
 *
 * The cost is stated rather than hidden: a stale claim smuggled into a paragraph that also names
 * C1 gets through. That is a narrower hole than the one this closes, and closing it would need
 * something that understands English rather than something that reads it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT IT DOES NOT REACH.** The patterns are the *canonical phrasings* of the retracted rule —
 * what the sharer receives, what they must wait for, and the label "one-directional" attached to
 * sharing or to a card. A rationale that implies the old model without using any of them is out
 * of range: `apps/api/src/app.ts` carried one (*"what stops sharing your own card from granting
 * you a read of somebody else's"*), it was fixed by hand in 016, and no pattern here would have
 * found it. Recorded so the next reader knows the boundary rather than assuming coverage.
 *
 * Three legitimate neighbours prove the patterns are narrow rather than lucky, and each is
 * asserted below: `apps/api/src/types/fastify.d.ts` calls the **card guard's predicate**
 * one-directional (still true — the predicate stayed directional, and `card-access.ts` argues
 * why); `packages/data/src/contract.ts` calls **type assignability** one-directional (a different
 * subject entirely); and the shipped confirmation copy must itself stay clear.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The three trees where card behaviour is described. `packages/platform` is excluded because it
 * holds no card prose, and `apps/admin` because no administrative surface touches cards.
 */
const TREES = [
  { name: 'apps/web/src', path: join(import.meta.dirname, '../../src') },
  { name: 'apps/api/src', path: join(import.meta.dirname, '../../../api/src') },
  { name: 'packages/data/src', path: join(import.meta.dirname, '../../../../packages/data/src') },
] as const

/**
 * `generated/` is skipped: it is `openapi-typescript` output, so its prose is a copy of route
 * descriptions in `apps/api/src/routes/`, which **are** scanned. Flagging it would point a
 * reader at a file they must not hand-edit.
 */
const SKIP_DIRS = new Set(['generated'])

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

/**
 * Source as prose: comment syntax removed so the sentences inside it read plainly, everything
 * else left alone. JSX text and string literals need no unwrapping — they are already text in
 * the file, which is why the whole source is passed through rather than parsed.
 */
const paragraphs = (source: string): string[] => {
  const lines = source.split('\n').map((line) =>
    line
      .replace(/^\s*\/\*+/, ' ')
      .replace(/\*+\/\s*$/, ' ')
      .replace(/^\s*\*+ ?/, ' ')
      .replace(/^\s*\/\/ ?/, ' ')
      .trim(),
  )

  const collected: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) collected.push(current.join(' '))
      current = []
    } else current.push(line)
  }
  if (current.length > 0) collected.push(current.join(' '))
  return collected
}

/**
 * A paragraph that says what **was** replaced rather than what **is** true. See the header for
 * why this is permitted and why the window is the paragraph.
 */
const RETRACTION =
  /\bC1\b|\bv5\.0\.0\b|retract(?:s|ed|ion)?|revers(?:es|ed|al)|\bused to\b|\bno longer\b|\buntil 016\b/i

/**
 * The canonical phrasings of the rule constitution v5.0.0 (C1) retracts.
 *
 * Each carries the reason it is wrong now, because a bare pattern list is what gets loosened by
 * somebody who cannot tell which entries are load-bearing.
 */
const RETRACTED_CLAIMS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    // "gives the recipient your card and gives you nothing". The server writes both rows.
    name: 'the sharer receives nothing',
    pattern: /\bgives? (?:you|the sharer) nothing\b/i,
  },
  {
    // "you will hold theirs when they share it with you" — the reader already holds it.
    name: 'the sharer must wait to hold the other card',
    pattern: /\byou (?:will )?hold theirs\b/i,
  },
  {
    // "theirs will arrive here when they share back" — there is no share-back step.
    name: 'the counterpart has to share back',
    pattern: /\bshare(?:s|d)? (?:it |theirs |their card )?back\b/i,
  },
  {
    // The confirmation's old justification, and the property the two tests were titled around.
    name: 'nothing came back',
    pattern: /\bnothing (?:came|comes) back\b/i,
  },
  {
    // FR-602's own wording. Correct only inside a note saying what C1 replaced.
    name: 'sharing gives; it does not take',
    pattern: /\bsharing gives; it does not take\b/i,
  },
  {
    // `AttendeeProfile`'s reason for keeping the scheduling control. They do become your contact.
    name: 'they do not become your contact',
    pattern: /\b(?:do|does|did) not become your contact\b/i,
  },
]

/**
 * The label "one-directional", but **only where it attaches to sharing or to a card**.
 *
 * Two forms, and the narrowing is what keeps the correct neighbours clear: the paragraph is about
 * sharing (`shar…` present), or the word sits behind a copula — *"a card **is** one-directional"*.
 * `fastify.d.ts`'s *"proves a one-directional fact"* and `contract.ts`'s *"deliberately
 * one-directional"* satisfy neither, which is the point rather than a coincidence.
 */
const ONE_DIRECTIONAL = /one[-\s]directional/i
const ATTACHED_TO_SHARING = /\bshar/i
const COPULA = /\b(?:is|was|are|were)\s+\**one[-\s]directional/i

/** Which retracted claims a paragraph makes as present fact. Empty for a historical note. */
const retractedClaims = (paragraph: string): string[] => {
  if (RETRACTION.test(paragraph)) return []

  const found = RETRACTED_CLAIMS.filter(({ pattern }) => pattern.test(paragraph)).map(
    ({ name }) => name,
  )

  if (
    ONE_DIRECTIONAL.test(paragraph) &&
    (ATTACHED_TO_SHARING.test(paragraph) || COPULA.test(paragraph))
  ) {
    found.push('sharing labelled one-directional')
  }

  return found
}

const findings = (): string[] =>
  TREES.flatMap(({ name, path }) =>
    sourceFiles(path).flatMap((file) =>
      paragraphs(readFileSync(file, 'utf8')).flatMap((paragraph) => {
        const claims = retractedClaims(paragraph)
        if (claims.length === 0) return []
        const relative = file.slice(file.indexOf(name))
        return [`${relative} — ${claims.join(', ')}\n    “${paragraph.slice(0, 150)}…”`]
      }),
    ),
  )

describe('the one-directional card model is described nowhere as current fact (FR-1052)', () => {
  it('finds the trees to scan — a gate that cannot fail is not a gate', () => {
    for (const { name, path } of TREES) {
      expect(sourceFiles(path).length, `${name} produced no sources to scan`).toBeGreaterThan(10)
    }
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The positive control, drawn from the text that actually shipped.**
   *
   * Every fixture here is a verbatim sentence that was live in `main`'s working tree when 016's
   * review ran. A guard for stale prose is worth nothing unless it is shown to fail on the prose
   * it was written for — and unlike a behavioural test there is no "remove the fix and watch it
   * go red", because the fix *is* the text.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('catches the exact sentences 016 shipped with (the pre-fix text)', () => {
    const shipped: readonly [string, string][] = [
      [
        'ShareCardAction header',
        'Sharing is one-directional: it gives **your** details to **them** and gives you ' +
          'nothing back (FR-602, constitution v3.2.0 N2).',
      ],
      [
        'ShareCardAction confirmation copy',
        'Your card is now with {displayName}. They can see your profile in their Network. ' +
          'You will hold theirs when they share it with you.',
      ],
      [
        'ShareCardAction confirmation comment',
        'Names both parties and the direction, and says outright that nothing came back.',
      ],
      [
        'NetworkStates empty state',
        'Find people at your conference in Discover, share your own card, and theirs will ' +
          'arrive here when they share back.',
      ],
      [
        'AttendeeProfile scheduling justification',
        'sharing is one-directional (FR-602), so sharing your card with somebody you just met ' +
          'gives you nothing, they do not become your contact, and Network never lists them.',
      ],
      [
        'cards.ts interface header',
        'Sharing is the only relationship-forming act in the product, and it is ' +
          '**one-directional**: `share` gives the recipient your card and gives you nothing. ' +
          'You hold theirs when, and only when, they share back.',
      ],
      [
        'cards.ts SharedCard',
        "sharing your card does not entitle you to the recipient's profile, which is what " +
          '"one-directional" means in practice.',
      ],
      [
        'cards.ts share()',
        "Returns the record of the exchange, never the recipient's profile. Sharing gives; it " +
          'does not take.',
      ],
      ['appointments.ts header', 'A card is one-directional and needs no answer.'],
    ]

    for (const [where, sentence] of shipped) {
      expect(
        retractedClaims(sentence),
        `${where}: this sentence shipped in 016 and states the model C1 retracted. If this ` +
          'assertion fails, the patterns have been loosened past the text they exist to catch.',
      ).not.toEqual([])
    }
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The negative control, and it is the half that keeps this guard usable.**
   *
   * Each of these is correct prose that names the old rule or reuses its vocabulary. A guard
   * that flagged them would be repaired by weakening it, and a weakened pattern is how an
   * absence test stops checking anything.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('clears the historical notes and the legitimate neighbours', () => {
    const permitted: readonly [string, string][] = [
      [
        'card-access.ts — says what C1 replaced',
        'It used to be justified as *"sharing gives; it does not take"* — FR-602, which C1 ' +
          'retracts. That sentence is no longer true and is no longer the argument.',
      ],
      [
        'queries/cards.ts — FR-1053 argued against the old model',
        'Relaxing this condition would need another amendment, not a change of mind — it is ' +
          'the premise C1 was argued from, not a leftover of the one-directional model.',
      ],
      [
        'fastify.d.ts — the card GUARD is directional, and still is',
        'this proves a *one-directional* fact — the reader holds a card **from** the named ' +
          'attendee, never the reverse.',
      ],
      [
        'contract.ts — type assignability, nothing to do with cards',
        'Deliberately one-directional: the server may add fields the client ignores (an ' +
          'additive change), but the client may never require a field the server does not ' +
          'produce.',
      ],
      [
        'the confirmation copy as it now reads',
        "You and Grace Hopper have exchanged cards. You can each see the other's profile in " +
          'Network.',
      ],
    ]

    for (const [where, sentence] of permitted) {
      expect(
        retractedClaims(sentence),
        `${where}: this is correct prose and must not be flagged. Fixing a failure here by ` +
          'narrowing a pattern is only right if the pattern was wrong — check first that the ' +
          'sentence has not itself become a claim about how sharing works today.',
      ).toEqual([])
    }
  })

  it('no source file states the retracted model as current fact', () => {
    expect(
      findings(),
      'Card sharing has been described as one-directional as present fact. Constitution ' +
        'v5.0.0 (C1) retracted that: one act writes both rows (FR-1021, FR-1022), so the ' +
        'sentence is false about the product as it is built. This is not a style point — the ' +
        'copy that said it told an attendee the exchange had not happened while their new ' +
        'contact was on the next screen, and the comment that said it was about to cost a ' +
        'required control its justification. If the paragraph is describing what C1 REPLACED, ' +
        'say so in it: name C1, v5.0.0, "used to" or "no longer" and this guard steps aside.',
    ).toEqual([])
  })
})
