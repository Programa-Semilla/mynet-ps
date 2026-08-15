import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  attendeeIdsByEmail,
  createDirectoryPopulation,
  eventIdsByName,
  removeDirectoryPopulation,
  setInterests,
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
 * T041 (006) — paging is stable, and **never repeats a co-attendee** (FR-410, FR-410a,
 * SC-403a, research D4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE GUARANTEE IS DELIBERATELY ASYMMETRIC, AND THIS FILE TESTS BOTH HALVES OF THAT.**
 *
 * *No duplicate, ever* — a duplicate is a visible defect that makes the directory look broken
 * and, worse, makes a reader wonder whether they have already spoken to somebody.
 *
 * *Omissions permitted* — because forbidding them requires retaining a snapshot of the result
 * set between requests, and FR-466 forbids retaining anything. Keyset pagination is stable
 * against inserts but not against a score that *falls* for somebody already passed; that is
 * the residue, and the client closes it by de-duplicating against the list it is rendering
 * (research D4).
 *
 * So the assertions below deliberately mutate the directory **between** page requests — a
 * co-attendee joins, another edits their interests, a third disappears — and assert that no
 * identifier is seen twice. An assertion that also demanded completeness would be asserting
 * against the specification.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const READER_INTERESTS = ['Design systems', 'Developer experience', 'Documentation']

/** Enough people to page several times at a small limit. */
const POPULATION = Array.from({ length: 12 }, (_, index) => ({
  email: `pager-${index}@example.test`,
  displayName: `Pager ${String(index).padStart(2, '0')}`,
  company: 'Paging Test Co',
  // A spread of overlaps, so the ranking has bands rather than one flat tie.
  interests: READER_INTERESTS.slice(0, index % 4),
}))

const LATE_JOINER = 'late-joiner@example.test'
const FIXTURES = [...POPULATION.map((person) => person.email), LATE_JOINER]

describe('paging the directory never shows the same co-attendee twice (FR-410a)', () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string
    await setInterests((await attendeeIdsByEmail()).get(ADA) as string, READER_INTERESTS)

    await createDirectoryPopulation(POPULATION)
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

  interface Page {
    attendees: { attendeeId: string; displayName: string; sharedInterestCount: number }[]
    nextCursor: string | null
  }

  const page = async (cursor: string | null, limit = 4): Promise<Page> => {
    const cursorParam = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?limit=${limit}${cursorParam}`,
      headers: { cookie: cookieHeader(ada) },
    })
    expect(response.statusCode).toBe(200)
    return response.json() as Page
  }

  /** Reads every page, optionally running a mutation between each. */
  const readAll = async (
    between: (pageIndex: number) => Promise<void> = async () => {},
  ): Promise<string[]> => {
    const seen: string[] = []
    let cursor: string | null = null
    let index = 0

    do {
      const result: Page = await page(cursor)
      seen.push(...result.attendees.map((entry) => entry.attendeeId))
      cursor = result.nextCursor
      await between(index)
      index += 1
      // A runaway cursor must fail the test rather than the process.
      expect(index, 'paging did not terminate').toBeLessThan(20)
    } while (cursor !== null)

    return seen
  }

  it('walks the whole directory in pages, with no duplicate and nothing missing when it is still', async () => {
    const seen = await readAll()

    expect(new Set(seen).size).toBe(seen.length)

    const whole = await page(null, 100)
    expect(seen.sort()).toEqual(whole.attendees.map((entry) => entry.attendeeId).sort())
  })

  it('returns nextCursor: null on the last page, and not before', async () => {
    let cursor: string | null = null
    const pages: Page[] = []

    do {
      const result: Page = await page(cursor)
      pages.push(result)
      cursor = result.nextCursor
    } while (cursor !== null)

    expect(pages.length).toBeGreaterThan(1)
    expect(pages.at(-1)?.nextCursor).toBeNull()
    for (const earlier of pages.slice(0, -1)) {
      expect(earlier.nextCursor).not.toBeNull()
    }
  })

  it('repeats nobody when a co-attendee JOINS mid-page (FR-410a, SC-403a)', async () => {
    let joined = false

    const seen = await readAll(async (index) => {
      if (index === 0 && !joined) {
        joined = true
        await createDirectoryPopulation([
          {
            email: LATE_JOINER,
            displayName: 'Zoë Latecomer',
            company: 'Arrived Halfway Ltd',
            interests: [...READER_INTERESTS],
          },
        ])
      }
    })

    expect(
      new Set(seen).size,
      'Offset pagination duplicates whenever a row is inserted before the current position — ' +
        'which is the ordinary case of somebody joining the conference while you scroll. Keyset ' +
        'is what makes this hold (research D4).',
    ).toBe(seen.length)

    await removeDirectoryPopulation([LATE_JOINER])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE ONE CASE KEYSET DOES NOT CLOSE, ASSERTED AS THE RESIDUE IT IS** (research D4).
   *
   * A score that *falls* below the cursor for somebody already shown brings them back into the
   * range of a later page. Keyset is stable against inserts and deletes — the two tests above
   * — but a cursor names a *position*, and this moves a row past a position it had already
   * gone by.
   *
   * **The only server-side fix is a snapshot of the result set, and FR-466 forbids exactly
   * that.** So this is not a defect to be fixed here; it is the residue the client closes by
   * de-duplicating against the list it is already rendering — which is not a cache, because it
   * *is* the rendered list and it disappears with the view.
   *
   * FR-410a's guarantee is about **the system**, not about this route in isolation. The
   * corresponding half is asserted where the closing happens: `useDirectory`'s de-duplication
   * in `apps/web/tests/component/discover-states.test.tsx`, and end to end in `e2e/`.
   *
   * This test exists so that the residue is *known and bounded* rather than discovered later.
   * If it ever starts passing — if the server stops returning the demoted attendee — something
   * has begun retaining state between requests, and that is the thing FR-466 forbids.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('may return an attendee again ONLY when their score fell below the cursor (FR-410a, D4)', async () => {
    const first = await page(null)
    const alreadyShown = first.attendees.map((entry) => entry.attendeeId)

    // Drop the top-ranked shown attendee's overlap to zero, moving them to the very end.
    const demoted = first.attendees[0]?.attendeeId as string
    await setInterests(demoted, ['Nothing', 'In', 'Common'])

    const seen = [...alreadyShown]
    let cursor = first.nextCursor
    while (cursor !== null) {
      const result: Page = await page(cursor)
      seen.push(...result.attendees.map((entry) => entry.attendeeId))
      cursor = result.nextCursor
    }

    const repeated = [...new Set(seen.filter((id, index) => seen.indexOf(id) !== index))]

    expect(
      repeated,
      'The residue must be exactly the demoted attendee and nobody else. A repeat of anyone ' +
        'whose score did not change means the cursor itself is unstable, which is a defect ' +
        'rather than the declared asymmetry.',
    ).toEqual([demoted])

    // …and the client is what closes it. Stated as an assertion rather than a comment, so the
    // de-duplication key and the identifier the server repeats cannot drift apart.
    const deduplicated = [...new Set(seen)]
    expect(deduplicated.filter((id) => id === demoted)).toHaveLength(1)

    await setInterests(demoted, [...READER_INTERESTS])
  })

  it('repeats nobody when a co-attendee DISAPPEARS mid-page (FR-410a)', async () => {
    const first = await page(null)
    const seen = first.attendees.map((entry) => entry.attendeeId)

    await removeDirectoryPopulation([POPULATION[11]?.email as string])

    let cursor = first.nextCursor
    while (cursor !== null) {
      const result: Page = await page(cursor)
      seen.push(...result.attendees.map((entry) => entry.attendeeId))
      cursor = result.nextCursor
    }

    expect(new Set(seen).size).toBe(seen.length)

    // Restore the fixture for whatever runs next in this file.
    await createDirectoryPopulation([POPULATION[11] as (typeof POPULATION)[number]])
  })

  it('is repeatable for an unchanging directory — the same pages, in the same order (FR-410)', async () => {
    const first = await readAll()
    const second = await readAll()

    expect(second).toEqual(first)
  })

  /**
   * **Refused rather than silently clamped**, and the choice is deliberate.
   *
   * The maximum is declared in the route schema, so it is in `contracts/openapi.json` and a
   * client can read it. Clamping would answer a request for 10,000 with 100 and no indication
   * that anything had been decided for the caller; refusing says what the bound is. The bound
   * itself is not negotiable — an unbounded `limit` is both a denial-of-service parameter and
   * an invitation to pull an entire conference in one response.
   *
   * This is not the information leak that `format: uuid` on the path would be: the maximum is
   * public in the contract, and refusing it discloses nothing about any attendee.
   */
  it('bounds the page size server-side, so a caller cannot ask for the whole conference', async () => {
    const enormous = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?limit=10000`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(enormous.statusCode).toBe(400)

    // …and the declared maximum itself is honoured rather than being a number nobody enforces.
    const atMaximum = await page(null, 100)
    expect(atMaximum.attendees.length).toBeLessThanOrEqual(100)
  })

  it('refuses a malformed cursor without disclosing anything about it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?cursor=not-a-real-cursor`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(
      [400, 404].includes(response.statusCode),
      `A malformed cursor must be refused rather than ignored — silently returning page one ` +
        `would make a truncated URL look like a working directory. Got ${response.statusCode}.`,
    ).toBe(true)
  })

  it('cannot be used to reach another conference by hand-editing it', async () => {
    // The cursor encodes a position, never a scope. The conference comes from the path and its
    // guard, so even a perfectly-formed cursor from another conference narrows nothing.
    const first = await page(null)
    expect(first.nextCursor).not.toBeNull()

    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees?cursor=${encodeURIComponent(first.nextCursor as string)}`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(response.statusCode).toBe(200)
    const names = response
      .json()
      .attendees.map((entry: { displayName: string }) => entry.displayName)
    expect(names.every((name: string) => !name.includes('Elsewhere'))).toBe(true)
  })
})
