import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T214 (014 tranche 2) — **the Discover filter-options decision, stated and guarded**
 * (FR-1096, FR-1096a, FR-1099, FR-1099a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * The accumulate-what-you-have-seen design existed because a conference-wide option list would
 * disclose the shape of the population. T214's decision: **a closed vocabulary is not
 * population data**, so the INTEREST filter offers the whole choosable vocabulary — every value,
 * whether or not anybody at this conference holds it, with no count on any option — while the
 * ROLE filter, still free text and therefore still population data, keeps accumulating from
 * what the reader has seen. The comment in `Discover.tsx` carries the argument; this file makes
 * the halves fail separately if either drifts.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const discoverPath = fileURLToPath(
  new URL('../../src/app/destinations/Discover.tsx', import.meta.url),
)

const codeOnly = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('Discover filter options (T214, FR-1096, FR-1096a)', () => {
  const source = readFileSync(discoverPath, 'utf8')
  const code = codeOnly(source)

  it('offers interests from the choosable vocabulary, not from what was seen (FR-1096)', () => {
    expect(
      /useVocabularyRepository/.test(code),
      'Discover no longer reads the vocabulary. The interest options must be the whole ' +
        'choosable set — an option list derived from results shrinks to what exists, which is ' +
        'population data again (FR-1096’s second bound).',
    ).toBe(true)

    // The seen-state must carry roles alone. An `interests` member rejoining it is the
    // accumulate design returning — which would silently re-key the options on the conference
    // and reintroduce the population-shaped list under the old name (research R18).
    const seenShape = /interface SeenOptions\s*\{([\s\S]*?)\}/.exec(code)?.[1] ?? ''
    expect(seenShape, 'SeenOptions could not be located').not.toBe('')
    expect(/\binterests\b/.test(seenShape)).toBe(false)
    expect(/\broles\b/.test(seenShape)).toBe(true)
  })

  it('keeps the ROLE filter accumulating — free text is still population data (FR-1096a)', () => {
    expect(/seen\.roles/.test(code)).toBe(true)
    // And the reset-on-conference-switch survives for roles: the seen state is still keyed on
    // the event id, which is the mechanism the original comment argued for.
    expect(/seen\.eventId !== directory\.eventId/.test(code)).toBe(true)
  })

  it('adds no sector or subsector filter, and none joins the ranking (FR-1099a)', () => {
    // The row leaves sector/subsector's route into Discover deliberately open (spec
    // Assumptions: "This row adds no sector or subsector filter to Discover"). Filtering or
    // ranking on them is a decision about who the product suggests — to be ASKED, not
    // inferred from the fields existing.
    expect(
      /sector/i.test(code),
      'Discover mentions a sector. Adding a sector or subsector filter — or ranking input — is ' +
        'a decision about who the product suggests, deliberately left to be asked (FR-1099a), ' +
        'and the shared-interest count must remain the only ranking signal.',
    ).toBe(false)
  })

  it('renders every option as its bare label — no count, no signal of who holds it (FR-1096)', () => {
    // The option elements interpolate exactly the option string. A count beside an option —
    // "Fintech (12)" — is FR-1096's first bound broken: it tells the reader how many attendees
    // hold a value, which is the population disclosure the closed vocabulary was supposed to
    // avoid making.
    const optionRenders = [
      ...code.matchAll(/<option key=\{option\}[^>]*>\s*\{option\}\s*<\/option>/g),
    ]
    expect(
      optionRenders.length,
      'the two filter selects no longer render bare option labels — if a count or any other ' +
        'per-option annotation was added, FR-1096’s no-count bound needs re-arguing, not ' +
        'quietly breaking',
    ).toBe(2)
  })
})
