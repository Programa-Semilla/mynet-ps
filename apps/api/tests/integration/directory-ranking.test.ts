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
 * T040 (006) — the ranking (FR-411, FR-412, FR-413).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ZERO-OVERLAP CASE IS THE ONE THAT BREAKS, AND IT BREAKS SILENTLY.**
 *
 * The natural way to write "count how many interests we share" is an inner join, and an inner
 * join **deletes every attendee who shares nothing** from the directory. At a conference where
 * most people have not filled in their interests, that is most of the conference — and the
 * result looks like a working directory with a suspiciously short list, not like a bug.
 *
 * So the assertions below check the *contents* of the ranking as well as its order, and the
 * fixture deliberately includes somebody with no interests at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **FR-413 is asserted structurally rather than behaviourally**, and it has to be: "the ranking
 * does not consult saved sessions" is a claim about what the query *does not* contain, which no
 * response can demonstrate. The check is in `directory-response-shape.test.ts`, over the source
 * of the query itself.
 */

const THREE = 'three@example.test'
const TWO = 'two@example.test'
const ONE = 'one@example.test'
const NONE = 'none@example.test'
const BARE = 'bare@example.test'
const FIXTURES = [THREE, TWO, ONE, NONE, BARE]

/** The reader's own interest set, replacing Ada's seeded three so the overlaps are stated. */
const READER_INTERESTS = ['Design systems', 'Developer experience', 'Documentation']

describe('the directory is ranked by shared-interest count (FR-411)', () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string
  let ids: Map<string, string>

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string
    const adaId = (await attendeeIdsByEmail()).get(ADA) as string
    await setInterests(adaId, READER_INTERESTS)

    ids = await createDirectoryPopulation([
      {
        email: THREE,
        displayName: 'Trina Three',
        company: 'Overlap Maximal',
        interests: [...READER_INTERESTS],
      },
      {
        email: TWO,
        displayName: 'Tobias Two',
        company: 'Overlap Partial',
        interests: ['Design systems', 'Documentation', 'Cycling'],
      },
      {
        email: ONE,
        displayName: 'Oona One',
        company: 'Overlap Minimal',
        interests: ['Documentation', 'Sailing', 'Baking'],
      },
      {
        email: NONE,
        displayName: 'Nadia None',
        company: 'Overlap Absent',
        interests: ['Sailing', 'Baking'],
      },
      {
        // Nobody has written anything at all. `attendee_interests` has no row for them, which
        // is a different shape from "rows that happen not to match".
        email: BARE,
        displayName: 'Barnaby Bare',
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

  interface Entry {
    attendeeId: string
    displayName: string
    sharedInterestCount: number
    interests: string[]
  }

  const list = async (query = ''): Promise<Entry[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees${query}`,
      headers: { cookie: cookieHeader(ada) },
    })
    expect(response.statusCode).toBe(200)
    return response.json().attendees as Entry[]
  }

  it('counts the overlap with the reader correctly', async () => {
    const byName = new Map((await list()).map((entry) => [entry.displayName, entry]))

    expect(byName.get('Trina Three')?.sharedInterestCount).toBe(3)
    expect(byName.get('Tobias Two')?.sharedInterestCount).toBe(2)
    expect(byName.get('Oona One')?.sharedInterestCount).toBe(1)
    expect(byName.get('Nadia None')?.sharedInterestCount).toBe(0)
    expect(byName.get('Barnaby Bare')?.sharedInterestCount).toBe(0)
  })

  it('orders by that count, descending (FR-411)', async () => {
    const counts = (await list()).map((entry) => entry.sharedInterestCount)

    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(counts[0]).toBe(3)
  })

  /**
   * The assertion the inner-join mistake fails. Both people below share nothing with Ada; one
   * has interests that do not match, the other has none at all.
   */
  it('still includes zero-overlap attendees, ranked last (FR-411)', async () => {
    const entries = await list()
    const names = entries.map((entry) => entry.displayName)

    expect(names).toContain('Nadia None')
    expect(
      names,
      'An attendee who has written no interests at all must still appear. A LEFT JOIN is what ' +
        'makes that true; an inner join deletes most of a real conference from its own directory.',
    ).toContain('Barnaby Bare')

    const lastFew = entries.slice(-2).map((entry) => entry.sharedInterestCount)
    expect(lastFew).toEqual([0, 0])
  })

  it('breaks ties deterministically — the same order on every render (FR-411)', async () => {
    const first = (await list()).map((entry) => entry.attendeeId)
    const second = (await list()).map((entry) => entry.attendeeId)
    const third = (await list()).map((entry) => entry.attendeeId)

    expect(
      second,
      'Two attendees with the same count must not swap places between renders. Without a total ' +
        'order the keyset cursor is meaningless as well — it names a position that moves.',
    ).toEqual(first)
    expect(third).toEqual(first)

    // Within each count band, the tie-break must be the attendee identifier ascending — the
    // same expression the cursor encodes.
    const zeros = (await list()).filter((entry) => entry.sharedInterestCount === 0)
    expect(zeros.map((entry) => entry.attendeeId)).toEqual(
      [...zeros].map((entry) => entry.attendeeId).sort(),
    )
  })

  /**
   * FR-412 and FR-413 meet here: the count shown on the card must be the *same* number the
   * ordering used. Two numbers — one for sorting, one for display — is how a ranking comes to
   * be explained by a label that does not match it.
   */
  it('shows the same count it ranked by (FR-412, FR-413)', async () => {
    const entries = await list()

    for (const entry of entries) {
      const overlap = entry.interests.filter((interest) =>
        READER_INTERESTS.includes(interest),
      ).length
      expect(
        entry.sharedInterestCount,
        `${entry.displayName}: the count on the card must be derivable from the interests on ` +
          'the card. If it is not, the ranking is using something the reader cannot see (FR-413).',
      ).toBe(overlap)
    }
  })

  it('ranks a reader with no interests without excluding anybody (FR-449)', async () => {
    const adaId = (await attendeeIdsByEmail()).get(ADA) as string
    await setInterests(adaId, [])

    const entries = await list()

    expect(entries.length).toBeGreaterThan(0)
    expect(
      entries.every((entry) => entry.sharedInterestCount === 0),
      'A reader with no interests shares nothing with anybody — which is a flat ranking, not an ' +
        'empty directory.',
    ).toBe(true)

    await setInterests(adaId, READER_INTERESTS)
  })

  it('recomputes the count when a co-attendee edits their interests', async () => {
    const oonaId = ids.get(ONE) as string
    await setInterests(oonaId, READER_INTERESTS)

    const entry = (await list()).find((row) => row.displayName === 'Oona One')
    expect(entry?.sharedInterestCount).toBe(3)

    await setInterests(oonaId, ['Documentation', 'Sailing', 'Baking'])
  })

  it('ranks within a filtered set, not across the whole directory', async () => {
    // The page is chosen *by* rank, so filtering then ranking and ranking then filtering are
    // different results. The filter must be inside the same query.
    const entries = await list('?interest=Documentation')
    const names = entries.map((entry) => entry.displayName)

    expect(names).toEqual(['Trina Three', 'Tobias Two', 'Oona One'])
    expect(entries.map((entry) => entry.sharedInterestCount)).toEqual([3, 2, 1])
  })
})
