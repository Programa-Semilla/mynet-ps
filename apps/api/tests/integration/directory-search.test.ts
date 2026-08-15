import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createDirectoryPopulation,
  eventIdsByName,
  removeDirectoryPopulation,
  SHARED_EVENT,
} from './directory-fixtures.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T038, T039 (006) — search and filters (FR-407, FR-408, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"MUNOZ" MUST FIND "MUÑOZ", AND THAT IS NOT A NICETY HERE.**
 *
 * The organisation is `Programa-Semilla` and the product's conferences are Spanish-language.
 * A `lower()`-only search is not a slightly worse search for these users — it is a search that
 * cannot find a large fraction of the people at the conference, by anyone typing on a keyboard
 * without a ñ. Research D5 enables the `unaccent` extension in migration `0005` for exactly
 * this assertion.
 *
 * The reverse direction matters equally and is easy to lose: typing **"Muñoz"** must also find
 * "Munoz", because the two spellings coexist in any real attendee list.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const MUNOZ = 'munoz@example.test'
const MUNOZ_PLAIN = 'munoz-plain@example.test'
const OTHER = 'searchable@example.test'
const DESIGNER = 'designer@example.test'
const FIXTURES = [MUNOZ, MUNOZ_PLAIN, OTHER, DESIGNER]

describe('directory search and filters', () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string

    await createDirectoryPopulation([
      {
        email: MUNOZ,
        displayName: 'Sofía Muñoz',
        company: 'Peña & Asociados',
        role: 'Diseñadora',
        headline: 'Sistemas de diseño para equipos grandes.',
        interests: ['Design systems', 'Accessibility'],
      },
      {
        email: MUNOZ_PLAIN,
        displayName: 'Sofia Munoz',
        company: 'Plain Ascii Ltd',
        role: 'Designer',
        headline: 'The same name, spelled without accents.',
        interests: ['Design systems'],
      },
      {
        email: OTHER,
        displayName: 'Bartholomew Unrelated',
        company: 'Nothing In Common Inc',
        role: 'Analyst',
        headline: 'Spreadsheets, mostly.',
        interests: ['Finance'],
      },
      {
        email: DESIGNER,
        displayName: 'Dana Draws',
        company: 'Studio Draw',
        role: 'Designer',
        headline: 'Illustration and motion.',
        interests: ['Accessibility'],
      },
    ])
  })

  afterAll(async () => {
    await removeDirectoryPopulation(FIXTURES)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const search = async (query: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?${query}`,
      headers: { cookie: cookieHeader(ada) },
    })
    expect(response.statusCode).toBe(200)
    return response.json().attendees.map((entry: { displayName: string }) => entry.displayName)
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // T038 — case- and accent-insensitivity, in both directions.
  // ─────────────────────────────────────────────────────────────────────────────────────────

  it('finds "Muñoz" when the reader types "Munoz" (research D5)', async () => {
    const found = await search('q=Munoz')

    expect(
      found,
      'unaccent() is what makes this work, and it is enabled in migration 0005 for this ' +
        'assertion. A lower()-only search cannot find a large fraction of a Spanish-language ' +
        'conference from a keyboard without a ñ.',
    ).toContain('Sofía Muñoz')
  })

  it('finds "Munoz" when the reader types "Muñoz" — the other direction', async () => {
    expect(await search('q=Mu%C3%B1oz')).toContain('Sofia Munoz')
  })

  it('is case-insensitive', async () => {
    expect(await search('q=SOFÍA')).toContain('Sofía Muñoz')
    expect(await search('q=sofia')).toContain('Sofía Muñoz')
  })

  it('matches substrings, not only prefixes', async () => {
    expect(await search('q=uño')).toContain('Sofía Muñoz')
  })

  it('searches company, role and headline as well as the name (FR-407)', async () => {
    expect(await search('q=Pena')).toContain('Sofía Muñoz')
    expect(await search('q=Analyst')).toContain('Bartholomew Unrelated')
    expect(await search('q=Spreadsheets')).toContain('Bartholomew Unrelated')
  })

  /**
   * FR-407's prohibition, asserted directly. The address is a unique identifier a co-attendee
   * has no business confirming, and a search box that answers "yes, that person is here" to a
   * typed address is an enumeration oracle rather than a search.
   */
  it('NEVER matches on email address (FR-407)', async () => {
    expect(
      await search(`q=${encodeURIComponent(MUNOZ)}`),
      'Searching a full address must find nobody. Matching it would turn the search box into a ' +
        'confirmation oracle for whether an address is registered at this conference.',
    ).toEqual([])

    expect(await search('q=example.test')).toEqual([])
  })

  /**
   * The reader's typing is a search term, not a pattern.
   *
   * In `LIKE`, `%` matches anything and `_` matches any single character — so without escaping,
   * a reader who types `%` is handed the entire directory and one who types `A_B` matches `AxB`.
   * Neither is what they asked for and neither is anything they could diagnose. Not a security
   * hole (the term is a bound parameter), but a correctness one.
   */
  it('treats LIKE wildcards as literal characters, not as patterns', async () => {
    expect(
      await search('q=%'),
      'a bare % must match nobody rather than returning the whole conference',
    ).toEqual([])

    expect(await search('q=_')).toEqual([])
    // `Sof_a` must not match "Sofía": the underscore is a character the reader typed.
    expect(await search('q=Sof_a')).toEqual([])
    // …while the ordinary case still works, so the escaping did not break matching.
    expect(await search('q=Sof')).toContain('Sofía Muñoz')
  })

  it('answers an empty page rather than an error when nothing matches (FR-414)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?q=zzzznobodyzzzz`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ attendees: [], nextCursor: null })
  })

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // T039 — the three narrowings combine conjunctively (FR-408).
  // ─────────────────────────────────────────────────────────────────────────────────────────

  it('filters by role exactly', async () => {
    const found = await search('role=Designer')

    expect(found).toContain('Sofia Munoz')
    expect(found).toContain('Dana Draws')
    expect(found).not.toContain('Bartholomew Unrelated')
    expect(
      found,
      'The role filter is exact. "Diseñadora" is a different role from "Designer", however ' +
        'similar; a fuzzy filter would make the filter chip mean something the reader did not ' +
        'choose.',
    ).not.toContain('Sofía Muñoz')
  })

  it('filters by interest exactly', async () => {
    const found = await search('interest=Accessibility')

    expect(found).toContain('Sofía Muñoz')
    expect(found).toContain('Dana Draws')
    expect(found).not.toContain('Sofia Munoz')
  })

  it('combines role and interest conjunctively (FR-408)', async () => {
    const found = await search('role=Designer&interest=Accessibility')

    expect(
      found,
      'Conjunctive, not disjunctive. Dana is the only Designer with Accessibility; Sofia Munoz ' +
        'is a Designer without it, and Sofía Muñoz has it without being a "Designer".',
    ).toEqual(['Dana Draws'])
  })

  it('combines the search term with both filters conjunctively (FR-408)', async () => {
    expect(await search('q=Draw&role=Designer&interest=Accessibility')).toEqual(['Dana Draws'])

    expect(
      await search('q=Munoz&role=Designer&interest=Accessibility'),
      'Every narrowing must apply. A term matching one attendee and filters matching another ' +
        'must produce nobody, not the union.',
    ).toEqual([])
  })

  it('applies filters on the server, never returning rows the client would hide (FR-409)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?role=Designer&interest=Accessibility`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(
      response.body,
      'A filtered response carrying the non-matching attendees for the client to hide has ' +
        'already sent them (FR-409).',
    ).not.toContain('Bartholomew Unrelated')
  })
})
