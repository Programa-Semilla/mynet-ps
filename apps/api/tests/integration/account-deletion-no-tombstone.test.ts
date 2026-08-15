import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T101 (004) — **no tombstone, no soft-delete marker, no anonymised shell** (FR-365, FR-368).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"A RECORD MARKED DELETED IS A RECORD STILL HELD."**
 *
 * That is the whole of FR-365, and it rules out the three shapes this would ordinarily take.
 * All three are things a reasonable engineer adds *for good reasons* — auditability, undo,
 * referential tidiness — and all three would mean the product kept holding data about somebody
 * who asked it to stop:
 *
 *   1. a `deleted_at` column, so the row is filtered rather than removed;
 *   2. an anonymised shell — the row kept with its fields blanked, so foreign keys survive;
 *   3. a retained address, so the person cannot re-register.
 *
 * The assertions below look for all three **in the schema**, not merely in the behaviour, so
 * one arriving later fails here rather than being discovered by somebody reading the database.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deletion leaves no trace of the account (FR-365, FR-368)', () => {
  let app: FastifyInstance
  let token: string
  let attendeeId: string

  const EMAIL = 'no-trace@example.com'
  const DISPLAY_NAME = 'No Trace Remaining'
  const PASSWORD = 'correct-horse-battery-staple'

  // Needed so the reset-link test below can use the token that was ACTUALLY issued, rather
  // than a string that was never a link and would produce its 410 by being unknown.
  const mail = new SinkMailService()

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    await getDb().execute(sql`DELETE FROM attendees WHERE email = ${EMAIL}`)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: DISPLAY_NAME, password: PASSWORD },
    })
    token = sessionCookieFrom(created) as string

    const rows = await getDb().execute<{ id: string }>(sql`
      SELECT id FROM attendees WHERE email = ${EMAIL}
    `)
    attendeeId = rows[0]?.id as string

    await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(token) },
      payload: { company: 'Distinctive Company Name', headline: 'A very distinctive headline.' },
    })
  })

  const remove = () =>
    app.inject({ method: 'DELETE', url: '/account', headers: { cookie: cookieHeader(token) } })

  it('declares no soft-delete column anywhere in the schema', async () => {
    // The shape that would make every "zero rows" assertion in the sibling file pass while the
    // row was merely filtered out of view.
    const columns = await getDb().execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('deleted_at', 'is_deleted', 'deleted', 'archived_at', 'removed_at',
                            'anonymised_at', 'anonymized_at', 'tombstone')
    `)

    expect(
      columns,
      'A record marked deleted is a record still held (FR-365). If auditability genuinely ' +
        'requires one of these, that is a decision needing a recorded amendment, not a column.',
    ).toEqual([])
  })

  it('leaves no row anywhere containing the attendee identifier', async () => {
    await remove()

    // Every table with an `attendee_id`, found from the catalogue rather than from a list
    // somebody maintains — so a table added later is covered by this without being named.
    const tables = await getDb().execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'attendee_id'
    `)

    expect(tables.length).toBeGreaterThan(5)

    for (const { table_name } of tables) {
      const rows = await getDb().execute<{ count: string }>(
        sql.raw(
          `SELECT count(*)::text AS count FROM ${table_name} WHERE attendee_id = '${attendeeId}'`,
        ),
      )
      expect(Number(rows[0]?.count), `${table_name} still holds a row`).toBe(0)
    }
  })

  it('leaves no anonymised shell — the identifier resolves to nothing at all', async () => {
    await remove()

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE id = ${attendeeId}::uuid
    `)

    // Not "a row with blank fields", which is what an anonymised shell is. No row.
    expect(rows[0]?.count).toBe('0')
  })

  it('retains neither the address nor the display name anywhere', async () => {
    await remove()

    // Scanned rather than asserted per column: a retained address in a table nobody thought of
    // is exactly the shape this requirement is about.
    const addresses = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email = ${EMAIL}
    `)
    expect(addresses[0]?.count).toBe('0')

    const profiles = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendee_profiles
      WHERE company = 'Distinctive Company Name'
    `)
    expect(profiles[0]?.count).toBe('0')
  })

  it('is irreversible through every surface the product offers (FR-368)', async () => {
    await remove()
    await clearThrottle()

    // There is no undo route, no restore, and no grace period. Signing in is the only thing
    // resembling "getting the account back", and it must fail like any unknown address.
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: EMAIL, password: PASSWORD },
    })
    expect(signIn.statusCode).toBe(401)

    // And nothing at any plausible address resurrects it.
    for (const url of ['/account/restore', '/account/undelete', '/account']) {
      for (const method of ['POST', 'PUT', 'PATCH'] as const) {
        const response = await app.inject({ method, url, payload: { email: EMAIL } })
        expect(response.statusCode, `${method} ${url} must not exist`).toBeGreaterThanOrEqual(400)
      }
    }
  })

  it('leaves a reset link issued before deletion useless, as an expired one would be', async () => {
    // The edge case the specification names: the link's row went with the cascade, so it finds
    // nothing and fails exactly as an expired link does — disclosing nothing about whether the
    // account ever existed.
    await app.inject({ method: 'POST', url: '/auth/reset-request', payload: { email: EMAIL } })

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The token the link actually carried.**
    //
    // An earlier revision submitted the literal string `'whatever-that-link-carried'`, which
    // was never issued and hashes to nothing stored — so its 410 was guaranteed by "unknown
    // token" alone, and the test would have passed unchanged had the cascade left
    // `attendee_password_resets` intact and the route gone on honouring those rows. That is
    // precisely the regression the name promises to catch.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const sent = mail.lastTo(EMAIL, 'password-reset')
    expect(sent, 'no reset message was sent, so there is no link to invalidate').toBeDefined()
    const issued = new URL(sent!.link).searchParams.get('token') as string
    expect(issued, 'the reset link carried no token').toBeTruthy()

    await remove()

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: issued, password: 'a-brand-new-passphrase' },
    })
    expect(response.statusCode).toBe(410)
  })
})
