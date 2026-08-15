import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T037 (006) — **no directory response can carry an email address or verification state**
 * (FR-406, SC-406), asserted over the schema rather than by inspecting a sample.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS IS A SCHEMA TEST AND NOT A RESPONSE TEST.**
 *
 * SC-406 says "zero email or verification indicators", and an integration test can only observe
 * the fixtures it happens to build. It would pass for an attendee whose profile did not trigger
 * whichever branch leaked, and it would keep passing while the leak sat there — which is exactly
 * the failure mode FR-406 names when it says *"by any field, count, ordering effect, or timing
 * difference"*. This response is the one where getting it wrong is silent.
 *
 * So the assertions walk the **declared response schema** of every route this feature adds. A
 * property that does not appear in the schema cannot appear in a Fastify response at all, given
 * `additionalProperties: false` — the serializer strips it. Two mechanisms for one property,
 * matching what 004 did for the single-profile response.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Anything that would name an address or its verification, however spelled. */
const FORBIDDEN_PROPERTY = /^(e_?mail|email_?verified(_?at)?|verified|verification|discoverable)/i

const DIRECTORY_ROUTES = /\/events\/:eventId\/attendees/

const propertyNamesOf = (node: unknown, found: string[] = []): string[] => {
  if (typeof node !== 'object' || node === null) return found
  const record = node as Record<string, unknown>

  const properties = record['properties']
  if (typeof properties === 'object' && properties !== null) {
    found.push(...Object.keys(properties))
  }

  for (const value of Object.values(record)) {
    propertyNamesOf(value, found)
  }
  return found
}

/** Every object node in a schema that declares `properties`, so each can be checked closed. */
const objectNodesOf = (node: unknown, found: Record<string, unknown>[] = []) => {
  if (typeof node !== 'object' || node === null) return found
  const record = node as Record<string, unknown>
  if (typeof record['properties'] === 'object' && record['properties'] !== null) {
    found.push(record)
  }
  for (const value of Object.values(record)) objectNodesOf(value, found)
  return found
}

describe('the directory response cannot carry an address or verification state (FR-406)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found the directory routes to audit', () => {
    // A gate that cannot fail is not a gate. If the route is renamed and this stops matching,
    // every assertion below passes vacuously.
    const matched = routes.filter((route) => DIRECTORY_ROUTES.test(route.url))
    expect(
      matched.map((route) => route.url),
      'No directory routes were found. Either they were removed, or this pattern stopped ' +
        'recognising them — both need a human, not a green tick.',
    ).toContain('/events/:eventId/attendees')
  })

  it('declares no property naming an address or verification, at any depth', () => {
    const offenders = routes
      .filter((route) => DIRECTORY_ROUTES.test(route.url))
      .flatMap((route) => {
        const response = (route.schema as Record<string, unknown> | undefined)?.['response']
        return propertyNamesOf(response)
          .filter((name) => FORBIDDEN_PROPERTY.test(name))
          .map((name) => `${route.url} → ${name}`)
      })

    expect(
      offenders,
      'FR-406: the card must not expose an email address or verification state by any field. ' +
        'Every attendee in this listing is verified — that is what the query guarantees — so a ' +
        'verification field would be both redundant and a disclosure.',
    ).toEqual([])
  })

  it('closes every object in the response with additionalProperties: false', () => {
    const open = routes
      .filter((route) => DIRECTORY_ROUTES.test(route.url))
      .flatMap((route) => {
        const response = (route.schema as Record<string, unknown> | undefined)?.['response'] ?? {}
        // Only the 200 bodies; the refusal bodies are `{ code, message }` and are shared with
        // every other route, where they are deliberately open for the error serialiser.
        const success = (response as Record<string, unknown>)['200']
        return objectNodesOf(success)
          .filter((node) => node['additionalProperties'] !== false)
          .map(() => route.url)
      })

    expect(
      open,
      'An open object lets a query that started selecting a new column serialise it silently. ' +
        '`additionalProperties: false` is the second of the two mechanisms — the projection is ' +
        'the first — and this is the response where getting it wrong is not visible.',
    ).toEqual([])
  })

  it('declares exactly the card fields FR-405 names, and nothing more', () => {
    const listing = routes.find((route) => route.url === '/events/:eventId/attendees')
    const response = (listing?.schema as Record<string, unknown> | undefined)?.['response'] as
      Record<string, Record<string, unknown>> | undefined

    const page = response?.['200']?.['properties'] as Record<string, unknown>
    expect(Object.keys(page).sort()).toEqual(['attendees', 'nextCursor'])

    const entry = (
      (page['attendees'] as Record<string, unknown>)['items'] as Record<string, unknown>
    )['properties'] as Record<string, unknown>

    // T180 (014 tranche 2) — `productiveActivity` joined the card deliberately (FR-1099d): the
    // description is searchable, so it must be readable. Sector and subsector are deliberately
    // NOT here — their route into Discover is the open filter question (FR-1099, T214), and a
    // field added to this list is how that question would get answered by accident.
    expect(Object.keys(entry).sort()).toEqual(
      [
        'attendeeId',
        'availability',
        'avatar',
        'company',
        'displayName',
        'headline',
        'interests',
        'networkingIntent',
        'productiveActivity',
        'role',
        'sharedInterestCount',
      ].sort(),
    )
  })

  /**
   * FR-404's three prohibitions, expressed as an absence of fields.
   *
   * A total that differs from what is shown, a withheld count, or a flag distinguishing a hidden
   * attendee from a nonexistent one would each widen the listing's disclosure beyond the bounded
   * narrowing FR-404 records. None of them can be added without appearing here.
   */
  it('carries no total, no withheld count, and no withheld marker (FR-404)', () => {
    const listing = routes.find((route) => route.url === '/events/:eventId/attendees')
    const declared = propertyNamesOf(
      (listing?.schema as Record<string, unknown> | undefined)?.['response'],
    )

    const widening = declared.filter((name) =>
      /total|count$|withheld|hidden|excluded|omitted/i.test(name),
    )

    expect(
      widening.filter((name) => name !== 'sharedInterestCount'),
      'FR-404 bounds the listing to disclosing membership of the discoverable-and-verified set ' +
        'and nothing further. A total, a withheld count, or a hidden marker each widen it.',
    ).toEqual([])
  })
})

/**
 * T037 — **FR-413 holds structurally, and structural claims need a structural test.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * "The ranking does not consult saved sessions, notes or messages" is a claim about what the
 * query **does not contain**. No response can demonstrate it: a ranking that secretly weighted
 * saved sessions would produce a perfectly plausible order, and the only way to notice would be
 * to construct a fixture where the two orders differ — which is a test of one weighting rather
 * than of the prohibition.
 *
 * So this reads the query's own source and asserts that the tables it must never touch are not
 * named in it. Crude, and exactly proportionate: the prohibition is about a join somebody would
 * have to *write*, so it is detectable in the text and nowhere else.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the ranking reads only what the card shows (FR-413)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../src/db/queries/directory.ts', import.meta.url)),
    'utf8',
  )

  /** Attendee-private data, every one of which a shared-interest ranking has no business seeing. */
  const FORBIDDEN_TABLES = [
    'saved_sessions',
    'savedSessions',
    'session_notes',
    'sessionNotes',
    'messages',
    'conversations',
    'appointments',
    'qa_votes',
  ]

  it.each(FORBIDDEN_TABLES)('does not reference %s', (table) => {
    // Comments discussing the prohibition are the point of the file's header, so strip them
    // before looking — otherwise documenting the rule would break the rule.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

    expect(
      code.includes(table),
      `The directory query references ${table}. FR-413 permits the ranking only data the card ` +
        'itself displays — 005 made the agenda private, and a ranking derived from it would make ' +
        'the score a side channel for data the product deliberately withholds.',
    ).toBe(false)
  })

  /**
   * The **projection**, not the predicate. `email_verified_at` appears in the `WHERE` and must —
   * it is the third visibility condition, and removing it would let an unverified account
   * appear in a professional directory as the owner of an address it never proved (FR-325a).
   *
   * Word boundaries do that separation: `\ba\.email\b` does not match `a.email_verified_at`,
   * because `_` is a word character. What is forbidden is *selecting* either into a row.
   */
  it('selects no column that could carry an address or verification state', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

    const projections: [string, RegExp][] = [
      ['the email address', /\ba\.email\b/],
      ['verification state, as a selected column', /email_verified_at\s+AS\b/i],
      ['the discoverability flag, as a selected column', /\bdiscoverable\s+AS\b/i],
    ]

    for (const [what, pattern] of projections) {
      expect(
        pattern.test(code),
        `The directory query projects ${what}. Both mechanisms matter: the schema strips what ` +
          'the projection should never have selected, and the projection is the one a reviewer ' +
          'reads (FR-406).',
      ).toBe(false)
    }
  })
})
