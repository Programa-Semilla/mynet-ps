import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  platformSession,
} from './authoring-fixtures.js'
import {
  ADA,
  clearThrottle,
  GRACE,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T081 (014) — **the minted code is unique product-wide and works through the join flow that
 * already exists** (FR-1009, SC-1011).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE END-TO-END CLAIM: A CONFERENCE CREATED IN THE ADMINISTRATIVE PRODUCT IS JOINABLE FROM
 * MyNet WITH NOTHING ELSE DONE TO IT.**
 *
 * This is the assertion that makes decision 34's *"one class of conference"* real rather than
 * stated. A seeded conference and a minted one must be indistinguishable to the attendee product
 * — same code shape, same join route, same registration, no privileged or immutable content. If
 * a created conference needed a seed run, a migration, or any second step before an attendee
 * could reach it, then there would be two classes of conference and the seeded one would be
 * privileged.
 *
 * **Uniqueness is enforced by the database and mint retries into it, rather than pre-checking.**
 * `events.join_code` is `UNIQUE`, and a read-then-insert would be both a race and a second source
 * of truth for a rule the constraint already states. The generator inserts with
 * `ON CONFLICT DO NOTHING` and tries again, bounded at five attempts — with a 31-character
 * alphabet over eight characters the space is ~8.5e11, so five collisions in a row means the
 * generator is broken rather than unlucky, and failing loudly beats a loop spinning while an
 * organizer waits.
 *
 * The alphabet omits `0`/`O` and `1`/`I`/`l` on purpose: a code is read off a badge or a slide
 * and typed by hand, and a code nobody can transcribe is a conference nobody can join. That is
 * asserted here because it is invisible to every other test and would be "tidied" by anybody
 * reaching for a full alphabet to widen the space.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the minted join code (T081, FR-1009, SC-1011)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    await buildAuthoringFixture(ADA, app)
  })

  const create = async (name: string): Promise<{ id: string; joinCode: string }> => {
    const cookie = await platformSession(app)
    const response = await app.inject({
      method: 'POST',
      url: '/admin/conferences',
      headers: { cookie },
      payload: {
        name,
        location: 'A Venue',
        startsOn: '2028-06-01',
        endsOn: '2028-06-02',
        timezone: 'UTC',
        // T191 (014 tranche 2, FR-1059b): creation collects an explicit modality.
        modality: 'in-person',
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json() as { id: string; joinCode: string }
  }

  it('returns the code on creation, so the organizer can distribute it (FR-1009)', async () => {
    const created = await create('A Distributable Conference')

    expect(created.joinCode).toBeTruthy()
    // The code is returned rather than looked up afterwards: there is no second screen, and no
    // route in 014 reads a code back. 015 owns rotating, revoking and viewing (brainstorm #09).
    const [row] = await getDb().select().from(events).where(eq(events.id, created.id))
    expect(row?.joinCode).toBe(created.joinCode)
  })

  it('draws from the transcribable alphabet, at the seeded length', async () => {
    const created = await create('A Transcribable Code')

    expect(created.joinCode).toHaveLength(8)
    expect(
      created.joinCode,
      'The join code contains a character the alphabet excludes. `0`/`O` and `1`/`I`/`l` are ' +
        'omitted because a code is read off a badge and typed by hand — widening the alphabet ' +
        'buys entropy nobody needed and costs transcription somebody does.',
    ).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('mints a code unique PRODUCT-WIDE, not merely within the creator’s conferences', async () => {
    const first = await create('First Minted')
    const second = await create('Second Minted')

    expect(first.joinCode).not.toBe(second.joinCode)

    // Against every conference that exists, seeded ones included — the constraint is on the
    // column, so "unique among mine" is not a state the database can be in.
    const rows = await getDb().execute<{ total: number; distinct: number }>(sql`
      SELECT count(*)::int AS total, count(DISTINCT join_code)::int AS distinct FROM ${events}
    `)
    const counts = rows[0]

    expect(counts, 'the uniqueness count returned no row').toBeDefined()
    expect(counts?.total).toBeGreaterThan(2)
    expect(counts?.total).toBe(counts?.distinct)
  })

  it('is refused by the database if it were ever duplicated, which is what makes the retry safe', async () => {
    const created = await create('A Uniquely Coded Conference')

    // The constraint itself, asserted directly. The mint's `ON CONFLICT DO NOTHING` retry is only
    // correct because this refusal exists; a test of the retry that never proved the constraint
    // would be testing a loop against nothing.
    await expect(
      getDb().execute(sql`
        INSERT INTO ${events} (name, location, starts_on, ends_on, timezone, join_code)
        VALUES ('A Colliding Conference', 'Elsewhere', '2028-07-01'::date, '2028-07-02'::date,
                'UTC', ${created.joinCode})
      `),
    ).rejects.toThrow()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **SC-1011 — THE WHOLE POINT: AN ATTENDEE JOINS IT.**
   *
   * Through `POST /events/join`, which 004 built and 014 does not touch. Nothing about the
   * created conference is special-cased on the way in.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('registers an attendee through MyNet’s existing join flow (SC-1011)', async () => {
    const created = await create('A Joinable Conference')

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    const cookie = sessionCookieFrom(signIn) as string

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: `mynet_session=${cookie}` },
      payload: { joinCode: created.joinCode },
    })

    expect(
      joined.statusCode,
      'An attendee could not join a conference created through the administrative product. ' +
        'Decision 34 makes a created conference an ORDINARY conference — if this needs a seed ' +
        'run or any second step, there are two classes of conference and the seeded one is ' +
        'privileged.',
    ).toBe(200)

    expect(joined.json().event.id).toBe(created.id)
    expect(joined.json().event.name).toBe('A Joinable Conference')
    expect(joined.json().alreadyRegistered).toBe(false)
  })

  it('accepts the code as it is transcribed — trimmed and case-insensitive (004’s rule)', async () => {
    const created = await create('A Forgivingly Coded Conference')

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: GRACE, password: SEED_PASSWORD },
    })
    const cookie = sessionCookieFrom(signIn) as string

    // A minted code and a seeded one must be indistinguishable to the join flow, and that
    // includes the forgiveness 004 built for codes read off a slide.
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: `mynet_session=${cookie}` },
      payload: { joinCode: `  ${created.joinCode.toLowerCase()}  ` },
    })

    expect(joined.statusCode).toBe(200)
    expect(joined.json().event.id).toBe(created.id)
  })
})
