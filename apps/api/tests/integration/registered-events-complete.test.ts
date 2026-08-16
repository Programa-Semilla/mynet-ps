import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
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
 * T043 (012) — **a conference whose dates have ended is still listed by `GET /events`**
 * (FR-1141, research R4 break mode D).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE BREAK NO STATIC CHECK REACHES.**
 *
 * `erasingWithdrawnConferences` (apps/web/src/app/services.ts) erases every cached conference
 * absent from this route's answer, on the ground that absence means withdrawal. R4 found four
 * ways that ground can fail; three are caught before the code runs — an envelope by
 * `_EventsMatchContract`, a query by `_EventsTakesNoQuery` (both in
 * `packages/data/src/contract.ts`), a pagination-shaped schema by
 * `apps/api/tests/unit/registered-events-complete.test.ts`. The fourth is a date predicate:
 * *"only show conferences that haven't ended"* is a plausible product request nobody would
 * connect to a cache, it changes no schema and no contract type, and no regex over the query
 * source could tell a completeness-breaking `WHERE` from a legitimate one. So it is covered
 * behaviourally: move a seeded conference wholly into the past and ask whether it is still
 * listed. If this fails, the client changes FIRST — rework the erasure, then filter.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('GET /events lists every registration, however old (FR-1141)', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>
  let cookie: string

  /**
   * Places an event's range relative to the database's today, in the venue's own zone —
   * the same helper `active-event.test.ts` uses, for the same reason: the clock is not
   * movable, so the events move instead. The offsets are cast explicitly because PostgreSQL
   * cannot choose between `date + integer` and `date + interval` for an untyped parameter.
   */
  const moveEvent = async (name: string, startOffset: number, endOffset: number): Promise<void> => {
    await getDb()
      .update(events)
      .set({
        startsOn: sql`((now() AT TIME ZONE "events".timezone)::date + ${startOffset}::int)`,
        endsOn: sql`((now() AT TIME ZONE "events".timezone)::date + ${endOffset}::int)`,
      })
      .where(eq(events.name, name))
  }

  beforeAll(async () => {
    app = await setupTestApp()
    // D19 — files run in size order, so a new file that depends on the seed reseeds rather
    // than inheriting whatever the previous file left behind.
    await resetDatabase()

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const issued = sessionCookieFrom(signIn)
    if (!issued) throw new Error(`Sign-in failed: ${signIn.body}`)
    cookie = issued
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('still lists a conference whose dates are wholly in the past', async () => {
    // Ada is seeded into both conferences. One ends well in the past; the other stays ahead,
    // so the assertion below distinguishes "the ended one was dropped" from "the read broke".
    await moveEvent('Product & Design Summit', -30, -28)
    await moveEvent('Frontend Horizons', 10, 12)

    const response = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode).toBe(200)

    const listed = (response.json() as Array<{ name: string }>).map((event) => event.name)
    expect(
      listed,
      'GET /events stopped listing a conference whose dates have ended. ' +
        '`erasingWithdrawnConferences` (apps/web/src/app/services.ts) erases every cached ' +
        'conference absent from this answer — so an "upcoming only" predicate erases the ' +
        "device copy of every conference the moment it ends: programme, saved sessions, the " +
        "attendee's private notes, appointments. The client changes FIRST: rework the erasure " +
        'at the composition root, then filter this read. Do not fix this by tuning the test dates.',
    ).toContain('Product & Design Summit')
    expect(listed).toContain('Frontend Horizons')
  })
})
