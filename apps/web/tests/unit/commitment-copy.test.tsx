import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T195 (014 tranche 2) — **no attendee-visible string on the four commitment surfaces may
 * claim the commitment set is saves alone** (FR-1066a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE 016 PROVED THE FAILURE MODE.** FR-1052 ordered every comment citing a
 * retracted rule rewritten, scored compliant — the number appears wherever the work was done,
 * and nowhere it was missed — and the product went on telling the sharer the exchange had not
 * happened, because the rule was scoped to comments and never reached product copy. FR-1066a
 * is that lesson's other half written into this tranche: enrolment joins saving as a second
 * commitment, so every string asserting a commitment is a *save* becomes false in the same
 * change that falsifies it, and the check READS prose rather than stripping it — the comment
 * and the rendered sentence are the same kind of claim here.
 *
 * The four surfaces are the ones FR-1066a names: the Agenda filter and its empty state, the
 * Home card that composes the attendee's own programme, and the commitment-refusal wording.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A HISTORICAL NOTE IS PERMITTED — 016's `card-model-record` precedent, followed exactly.**
 * Saying what was renamed is how this codebase keeps a decision legible: "the label 'Saved'
 * became 'My agenda'" is correct and load-bearing. The discriminator is a RETRACTION marker
 * anywhere in the same PARAGRAPH — paragraph rather than sentence, because these docblocks
 * argue in paragraphs and a sentence-scoped window flagged correct paragraphs when 016 tried
 * it. A guard that cries wolf gets weakened until it checks nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const WEB = join(import.meta.dirname, '../../src')

/** The four surfaces FR-1066a names. Scanned whole — prose, copy and code alike. */
const SURFACES = [
  'app/destinations/Agenda.tsx',
  'app/agenda/MyAgendaEmptyState.tsx',
  'app/home/cards/NextSavedSession.tsx',
  'app/agenda/useCommitments.ts',
] as const

/** Comment syntax unwrapped so the sentences inside read plainly; nothing else removed. */
const paragraphs = (source: string): string[] => {
  const lines = source.split('\n').map((line) =>
    line
      .replace(/^\s*\/\*+/, ' ')
      .replace(/\*+\/\s*$/, ' ')
      .replace(/^\s*\*+ ?/, ' ')
      .replace(/^\s*\/\/ ?/, ' ')
      .replace(/^\s*\{\/\* ?/, ' ')
      .replace(/\*\/\}\s*$/, ' ')
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
 * A paragraph saying what tranche 2 REPLACED rather than what is true now. The markers are the
 * ones the renaming paragraphs actually carry; keep them narrow — a marker loose enough to
 * exempt a live claim makes this file check nothing.
 */
const RETRACTION =
  /\bT194\b|\bT196\b|\bT198\b|\bFR-1066a?\b|\btranche 2\b|renam(?:e|ed|ing)|\bbecame\b|\bused to\b|\bno longer\b/i

/**
 * The saves-alone phrasings that shipped and are now false of the product. Each carries the
 * reason, because a bare pattern list is what gets loosened by somebody who cannot tell which
 * entries are load-bearing.
 */
const SAVES_ALONE_CLAIMS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    // The 005 empty-state heading. An enrolled attendee's agenda is not "nothing".
    name: 'the "Nothing saved yet" heading',
    pattern: /\bnothing saved yet\b/i,
  },
  {
    // The Home card's empty copy. False for somebody holding a place and saving nothing.
    name: 'the "you have not saved any sessions" empty copy',
    pattern: /\byou have not saved any sessions\b/i,
  },
  {
    // The Home card's old title. An enrolled session appears on this card too (FR-1066), and
    // presenting the stronger commitment under a saves-only heading is the weaker presence
    // FR-1066 forbids. The registry id `next-saved-session` is kebab-case and never rendered,
    // so it does not match — deliberately.
    name: 'the "Next saved session" card title',
    pattern: /\bnext saved session\b/i,
  },
  {
    // The refusal's old reassurance. A refused enrolment saved nothing either — the honest
    // sentence covers both commitments ("nothing on your agenda has changed").
    name: 'the "nothing has been saved" refusal wording',
    pattern: /\bnothing has been saved\b/i,
  },
  {
    // The filter's old label, as a lone quoted string an attendee would read on the control.
    name: 'a bare "Saved" label literal',
    pattern: /'Saved'|"Saved"/,
  },
]

/** Which saves-alone claims a paragraph makes as present fact. Empty for a historical note. */
const savesAloneClaims = (paragraph: string): string[] => {
  if (RETRACTION.test(paragraph)) return []

  const found = SAVES_ALONE_CLAIMS.filter(({ pattern }) => pattern.test(paragraph)).map(
    ({ name }) => name,
  )

  // The structural rule behind the list: an invitation to build an agenda that names saving
  // and never a place claims the set is saves alone, whatever its exact words.
  if (
    /browse the programme/i.test(paragraph) &&
    /\bsave\b/i.test(paragraph) &&
    !/\bplace\b|\benrol/i.test(paragraph)
  ) {
    found.push('an invitation naming saving alone')
  }

  return found
}

const findings = (): string[] =>
  SURFACES.flatMap((surface) =>
    paragraphs(readFileSync(join(WEB, surface), 'utf8')).flatMap((paragraph) => {
      const claims = savesAloneClaims(paragraph)
      if (claims.length === 0) return []
      return [`${surface} — ${claims.join(', ')}\n    “${paragraph.slice(0, 150)}…”`]
    }),
  )

describe('no commitment surface claims the set is saves alone (FR-1066a, T195)', () => {
  it('finds the four surfaces — a gate that cannot fail is not a gate', () => {
    for (const surface of SURFACES) {
      expect(
        readFileSync(join(WEB, surface), 'utf8').length,
        `${surface} is empty or missing`,
      ).toBeGreaterThan(100)
    }
  })

  /**
   * The positive control, drawn from the text that actually shipped in tranche 1 and 005.
   * A guard for stale prose is worth nothing unless it fails on the prose it was written for —
   * and there is no "remove the fix and watch it go red", because the fix IS the text.
   */
  it('catches the exact sentences the rename replaced (the pre-T194 text)', () => {
    const shipped: readonly [string, string][] = [
      ['SavedEmptyState heading', 'Nothing saved yet'],
      [
        'NextSavedSession empty copy',
        'You have not saved any sessions yet. Browse the programme and save the ones you intend to attend.',
      ],
      ['the Home card title', 'Next saved session'],
      ['the refusal wording', 'Nothing has been saved, and nothing has been queued for later.'],
      ['the filter label', "{option('saved', 'Saved')}"],
      [
        'the empty-state invitation',
        'Browse the programme and save the sessions you intend to attend. They will appear here, in the order you will attend them.',
      ],
    ]

    for (const [where, sentence] of shipped) {
      expect(
        savesAloneClaims(sentence),
        `${where}: this text shipped before T194 and asserts the commitment set is saves ` +
          'alone. If this assertion fails, the patterns have been loosened past the text they ' +
          'exist to catch.',
      ).not.toEqual([])
    }
  })

  /**
   * The negative control — correct prose that names the old wording or reuses its vocabulary.
   * A guard that flagged these would be repaired by weakening it.
   */
  it('clears the renaming notes and the truthful copy', () => {
    const permitted: readonly [string, string][] = [
      [
        'a historical note',
        'T194 (014 tranche 2) — the label "Saved" became "My agenda" (FR-1066a): the filtered set carries held places as well as saves.',
      ],
      [
        'the new empty state',
        'Browse the programme and commit to the sessions you intend to attend — save them, or take a place in the ones that enrol.',
      ],
      [
        'the new card empty copy',
        'Nothing on your agenda yet. Browse the programme and save the sessions you intend to attend — or take a place in the ones that enrol.',
      ],
      [
        'the new refusal wording',
        'Taking a place in that session needs a connection, and there is not one right now. Nothing on your agenda has changed, and nothing has been queued for later.',
      ],
      [
        'ordinary prose about saved mandatory sessions',
        'A saved session is unchanged in shape and in meaning: it continues to cover mandatory sessions.',
      ],
    ]

    for (const [where, sentence] of permitted) {
      expect(
        savesAloneClaims(sentence),
        `${where}: this is correct prose and must not be flagged. Fixing a failure here by ` +
          'narrowing a pattern is only right if the pattern was wrong — check first that the ' +
          'sentence has not itself become a claim that the set is saves alone.',
      ).toEqual([])
    }
  })

  it('no surface states the saves-alone model as current fact', () => {
    expect(
      findings(),
      'A commitment surface claims the set is saves alone. Since T196 the set carries held ' +
        'places as well as saves (FR-1063, FR-1066), so the sentence is false about the ' +
        'product as built — and 016 proved this exact defect ships green when the check stops ' +
        'one word short of the screen (FR-1066a). If the paragraph is describing what T194 ' +
        'REPLACED, say so in it: name T194, FR-1066a, "renamed", "became" or "used to" and ' +
        'this guard steps aside.',
    ).toEqual([])
  })
})
