import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createConferenceAtScale,
  removeConferenceAtScale,
  SCALE_ATTENDEE_COUNT,
} from '../fixtures/conference-at-scale.js'
import {
  attendeeIdsByEmail,
  eventIdsByName,
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
 * T058b (006) — the performance thresholds, **measured at the scale they are stated at**
 * (FR-401c, SC-402, SC-403).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WITHOUT THE 1,000-ATTENDEE FIXTURE THESE THRESHOLDS ARE ASPIRATIONS.**
 *
 * Against the three seeded attendees, "first page under 2 seconds" and "a filtered query under
 * 1 second" are met by any implementation, including one that sequentially scans every table it
 * touches. The specification states both criteria *at the scale FR-401c establishes*, so the
 * fixture is not a detail of the test — it is the half of the criterion that makes it able to
 * fail.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT IS MEASURED, AND WHAT IS NOT.**
 *
 * `fastify.inject()` drives the real routing, the real guards, the real query and the real
 * serialisation against a real database — everything except the network hop and the browser.
 * The thresholds are therefore a **server-side budget**, and they are set where the server's
 * share of them lives. SC-402's "first meaningful content" also includes a round trip and a
 * render, which only the end-to-end suite can see.
 *
 * The measured numbers are printed, so a regression is visible as a **trend** rather than only
 * as a pass or a fail. A run that creeps from 40ms to 900ms passes this file and is a defect;
 * the number in the log is what makes it noticeable before the threshold catches it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** SC-402: first content under 2s. The server's share, measured here. */
const FIRST_PAGE_BUDGET_MS = 2_000
/** SC-403: a filtered query under 1s, likewise. */
const FILTERED_BUDGET_MS = 1_000

const READER_INTERESTS = ['Design systems', 'Developer experience', 'Documentation']

describe(`the directory at ${SCALE_ATTENDEE_COUNT} registered attendees (FR-401c)`, () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string
    await setInterests((await attendeeIdsByEmail()).get(ADA) as string, READER_INTERESTS)

    await createConferenceAtScale(sharedEventId)
  }, 120_000)

  afterAll(async () => {
    await removeConferenceAtScale()
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

  const timed = async (url: string): Promise<{ ms: number; body: { attendees: unknown[] } }> => {
    // Warmed once before measuring: the first request through any route pays for lazy schema
    // compilation and a cold connection, neither of which is what the criterion is about.
    await app.inject({ method: 'GET', url, headers: { cookie: cookieHeader(ada) } })

    const started = process.hrtime.bigint()
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: cookieHeader(ada) },
    })
    const ms = Number(process.hrtime.bigint() - started) / 1_000_000

    expect(response.statusCode).toBe(200)
    return { ms, body: response.json() }
  }

  it('has a conference of the declared size to measure against', async () => {
    // A gate that cannot fail is not a gate. If the fixture silently created nothing, every
    // threshold below would pass while measuring an empty table.
    const { body } = await timed(`/events/${sharedEventId}/attendees?limit=100`)
    expect(body.attendees).toHaveLength(100)
  })

  it(`answers the first page under ${FIRST_PAGE_BUDGET_MS}ms (SC-402)`, async () => {
    const { ms, body } = await timed(`/events/${sharedEventId}/attendees`)

    // eslint-disable-next-line no-console
    console.log(
      `  [SC-402] first page of 24, ${SCALE_ATTENDEE_COUNT} attendees: ${ms.toFixed(1)}ms`,
    )

    expect(body.attendees).toHaveLength(24)
    expect(ms).toBeLessThan(FIRST_PAGE_BUDGET_MS)
  })

  it(`answers a SEARCHED query under ${FILTERED_BUDGET_MS}ms (SC-403)`, async () => {
    // The search is deliberately unindexed (research D5) — a scan of 1,000 rows already narrowed
    // by the registration join. This is the measurement that decides whether that choice holds,
    // and it is where a later conference approaching five figures would first show strain.
    const { ms, body } = await timed(`/events/${sharedEventId}/attendees?q=Attendee%2007`)

    // eslint-disable-next-line no-console
    console.log(`  [SC-403] search, ${SCALE_ATTENDEE_COUNT} attendees: ${ms.toFixed(1)}ms`)

    // **A query matching nobody is the fastest possible result.** Without this the test would
    // go green AND get faster if `unaccent` were dropped or the escaping broke matching — the
    // same "cannot fail, so reads as coverage" failure this file's header warns about.
    expect(body.attendees.length, 'the search must actually match rows').toBeGreaterThan(0)
    expect(ms).toBeLessThan(FILTERED_BUDGET_MS)
  })

  it(`answers a FILTERED query under ${FILTERED_BUDGET_MS}ms (SC-403)`, async () => {
    const { ms, body } = await timed(
      `/events/${sharedEventId}/attendees?role=Designer&interest=${encodeURIComponent('Design systems')}`,
    )

    // eslint-disable-next-line no-console
    console.log(`  [SC-403] role + interest, ${SCALE_ATTENDEE_COUNT} attendees: ${ms.toFixed(1)}ms`)

    expect(body.attendees.length, 'the filter must actually match rows').toBeGreaterThan(0)
    expect(ms).toBeLessThan(FILTERED_BUDGET_MS)
  })

  it('pages deep into the directory without degrading (FR-410)', async () => {
    // Keyset paging's whole advantage over offset is that page fifty costs what page one costs.
    // Measured, because "keyset does not degrade" is a claim about this query rather than about
    // keyset paging in the abstract — the overlap count is recomputed per page either way.
    let cursor: string | null = null
    let slowest = 0

    for (let page = 0; page < 10; page += 1) {
      const url = `/events/${sharedEventId}/attendees${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      const started = process.hrtime.bigint()
      const response: Awaited<ReturnType<typeof app.inject>> = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: cookieHeader(ada) },
      })
      const ms = Number(process.hrtime.bigint() - started) / 1_000_000
      slowest = Math.max(slowest, ms)

      expect(response.statusCode).toBe(200)
      cursor = (response.json() as { nextCursor: string | null }).nextCursor
      if (cursor === null) break
    }

    // eslint-disable-next-line no-console
    console.log(`  [FR-410] slowest of ten pages: ${slowest.toFixed(1)}ms`)

    expect(slowest).toBeLessThan(FIRST_PAGE_BUDGET_MS)
  })

  it('embeds every face in ONE request, never one request per card (SC-407, FR-456)', async () => {
    // Asserted here as a property of the payload — the client-side half, that no per-card image
    // request is issued, is asserted in `e2e/discover.spec.ts` where requests can be counted.
    const { body } = await timed(`/events/${sharedEventId}/attendees`)

    const entries = body.attendees as { avatar: unknown }[]
    expect(entries).toHaveLength(24)
    for (const entry of entries) {
      // `null` for an attendee with no avatar — which is every one of these, since the seed
      // deliberately ships no faces (FR-354). The property under test is that the field is
      // *present and resolved*, not a URL the client would have to go and fetch.
      expect(entry).toHaveProperty('avatar')
      expect(typeof entry.avatar === 'object').toBe(true)
    }
  })
})
