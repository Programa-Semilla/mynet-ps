import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T170 (014 tranche 2) — **the vocabulary changes NOTHING about `attendee_interests` or about
 * Discover's interest machinery** (R18, FR-1095, FR-1095a, SC-1021).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE PREMISE THIS GUARD PINS: A CHOSEN INTEREST IS STORED AS ITS LABEL, NEVER AS A REFERENCE.**
 *
 * R18 found that the "migrate interests to foreign keys" reading of this tranche does not
 * survive contact with the code, three times over: the interest list ships EMPTY (FR-1086), so
 * on day one there is nothing for any row to reference; the mapping migration a foreign key
 * needs is an administrative write to attendee records, which FR-1093 forbids and FR-1095 names
 * ("no administrative act may map it onto a vocabulary value"); and the exact-match ranking
 * (FR-1095a) is satisfied by text and broken by ids — a reader holding retained free-text
 * "Fintech" and a candidate holding the vocabulary entry "Fintech" must not score 0 against
 * each other because of how the value was authored.
 *
 * Membership is therefore enforced **at the write** in `queries/profiles.ts`, and the table,
 * the ranking, the filter and the cursor are untouched. This file is what makes "untouched" a
 * property the build checks rather than a sentence in a research document — because the
 * tempting later edit ("normalise interests onto the vocabulary") breaks paging, ranking and
 * retained free text at once, while every behavioural test that seeds its own fixtures stays
 * green.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/** 009's rule: every name below also appears in prose explaining the absence. */
const codeOnly = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('the tranche-2 migration leaves attendee_interests alone (T170, R18)', () => {
  const migration = read('../../migrations/0012_conference_authoring_tranche_2.sql')

  it('found the migration to audit — a gate that cannot fail is not a gate', () => {
    expect(migration.length).toBeGreaterThan(100)
  })

  it('contains no statement touching attendee_interests', () => {
    // The whole of R18's part 1: same text column, same composite primary key, same index, same
    // length CHECK, no new column, no reference. A migration statement naming the table — in any
    // clause — is the edit this tranche decided not to make.
    expect(
      /attendee_interests/i.test(migration),
      'The tranche-2 migration touches `attendee_interests`. R18 decided the table needs NO ' +
        'migration at all: membership is enforced at the profile write, a chosen value is ' +
        'stored as its label, and a foreign key would need the mapping migration FR-1093 and ' +
        'FR-1095 forbid.',
    ).toBe(false)
  })

  it('adds no foreign key from any attendee table to the vocabulary', () => {
    // The nullable-hybrid alternative R18 rejected: two sources of truth for one displayed
    // string, with the one that drifts being the one displayed.
    expect(
      /attendee_[a-z_]+"?\s+ADD\s+CONSTRAINT[\s\S]{0,200}?vocabulary_/i.test(migration),
      'An attendee table gained a reference to the vocabulary. The chosen value is stored as ' +
        'its LABEL (R18); FR-1094c — a held value may never be renamed — is what makes carrying ' +
        'the label safe from divergence.',
    ).toBe(false)
  })
})

describe("Discover's interest machinery is unchanged (T170, FR-1095a, SC-1021)", () => {
  const directory = read('../../src/db/queries/directory.ts')
  const code = codeOnly(directory)

  it('keeps the interest filter an exact text comparison', () => {
    expect(code).toContain('filtered.interest = ${interest}')
  })

  it('keeps the displayed-interest aggregation on the text column', () => {
    expect(code).toContain('array_agg(ai.interest ORDER BY ai.interest)')
  })

  it('keeps the shared-interest ranking an exact text-to-text overlap', () => {
    // FR-1095a in one line: controlled and retained values alike are matched exactly, so no
    // attendee's rank changes because of how a value was authored.
    expect(code).toContain('candidate.interest IN (')
    expect(code).toContain('reader.interest')
  })

  it('keeps the cursor carrying only the score and the identifier', () => {
    // No interest value, no vocabulary version, no filter state — which is why no in-flight
    // cursor can break when the vocabulary changes underneath a paging reader (FR-1095a).
    expect(code).toContain('${sharedInterestCount}:${attendeeId}')
  })

  it('never references a vocabulary table', () => {
    // The one tranche-2 edit to this file is FR-1099d's search column. A vocabulary join here
    // would re-answer the filter-options question (FR-1099) by accident, and would be the first
    // step of the id-normalisation R18 rejected.
    expect(
      /vocabulary_sectors|vocabulary_subsectors|vocabulary_interests|interestOptions\b|\bsubsectors\b/.test(
        code,
      ),
      'The directory query references the vocabulary. Its interest machinery compares text to ' +
        'text and must keep doing so (R18, FR-1095a).',
    ).toBe(false)
  })

  it('keeps sector and subsector out of the free-text search (FR-1099d)', () => {
    // FR-1099d's second half: they are controlled values whose route into Discover is the open
    // filter question (T214), and putting them in free-text search would answer it by accident.
    const search = /unaccent\(lower\(\s*([\s\S]*?)\)\)\s*LIKE/.exec(code)?.[1] ?? ''
    expect(search.length, 'the search predicate could not be located').toBeGreaterThan(10)
    expect(search).not.toMatch(/\bsector\b|\bsubsector\b/)
  })
})
