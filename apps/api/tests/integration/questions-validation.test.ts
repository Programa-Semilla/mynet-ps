import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
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
 * T037 (009) — the question body's bounds, at **both** layers independently
 * (FR-703, FR-704, FR-705, research R10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE POINT OF THIS FILE IS THAT THE TWO LAYERS ARE TESTED SEPARATELY.**
 *
 * The composer disables its post control while the field is empty or whitespace, so a reader
 * never meets a rejection (FR-704). That is presentation. Principle VIII says client-side
 * presentation of a limit is never the enforcement of it — so the route refuses too, and the
 * column's `CHECK` refuses a third time.
 *
 * A test that only drove the route would leave the column's constraint unexercised, and a
 * constraint nothing exercises is a constraint that can be dropped from a migration without any
 * gate noticing. So the second half of this file writes **straight to the database**, bypassing
 * the route entirely, and asserts that PostgreSQL itself refuses.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('question validation', () => {
  let app: FastifyInstance
  let cookie: string
  let summitId: string
  let sessionId: string
  let adaId: string

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const ask = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: `/events/${summitId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  /** Writes directly to the table, so only the column's CHECK stands in the way. */
  const insertDirectly = (body: string) =>
    getDb().execute(sql`
      INSERT INTO session_questions (session_id, attendee_id, body)
      VALUES (${sessionId}::uuid, ${adaId}::uuid, ${body})
    `)

  /**
   * Which constraint refused an insert, or `null` if it succeeded.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Drizzle wraps the driver's error, and the constraint name is only on the cause.** The
   * outer `message` is `Failed query: INSERT INTO …` with the parameters interpolated — so
   * asserting `.rejects.toThrow(/session_questions_body_length/)` passes for a 501-character
   * body **whatever went wrong**, including a foreign-key violation or a typo in the table name.
   *
   * Walking to the cause is what makes these assertions about the CHECK rather than about the
   * insert having failed somehow. **Both spellings are read** because the two PostgreSQL drivers
   * disagree: `pg` exposes `constraint`, `postgres.js` — which this project uses — exposes
   * `constraint_name`. Reading only the first silently found nothing and threw the fallback
   * below, which is how this was noticed rather than shipped as a green vacuous assertion.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const refusedBy = async (body: string): Promise<string | null> => {
    try {
      await insertDirectly(body)
      return null
    } catch (error: unknown) {
      let current: unknown = error
      while (current instanceof Error) {
        const named =
          (current as { constraint?: unknown }).constraint ??
          (current as { constraint_name?: unknown }).constraint_name
        if (typeof named === 'string') return named
        current = current.cause
      }
      // The cause is attached rather than only stringified: this branch means the insert failed
      // for a reason this helper does not understand, and the original error is the only thing
      // that says what it was.
      throw new Error('The insert failed, but not with a named constraint.', { cause: error })
    }
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error('Sign-in failed; the test cannot proceed.')
    cookie = token

    summitId = await eventIdByName('Product & Design Summit')

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string

    const [row] = await getDb().select().from(attendees).where(eq(attendees.email, ADA))
    adaId = row?.id as string
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  describe('at the route', () => {
    it('refuses an empty body', async () => {
      expect((await ask('')).statusCode).toBe(400)
    })

    it('refuses a whitespace-only body (FR-705)', async () => {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **This one passes the schema and is caught by the handler**, which is why it is worth
      // asserting separately from the empty case. `minLength: 1` is satisfied by three spaces;
      // only the trim rejects it. Without the handler's own check this would reach the column
      // and come back as a 500 rather than a 400 — a validation failure reported as a fault.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect((await ask('   ')).statusCode).toBe(400)
      expect((await ask('\n\t  \n')).statusCode).toBe(400)
    })

    it('refuses a body over 500 characters (FR-703)', async () => {
      expect((await ask('x'.repeat(501))).statusCode).toBe(400)
    })

    it('accepts exactly 500 characters, so the bound is inclusive', async () => {
      expect((await ask('x'.repeat(500))).statusCode).toBe(201)
    })

    it('refuses 500 characters of padding around one, which the schema alone would accept', async () => {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 499 spaces plus a character is 500 by `maxLength` and 1 after trimming — accepted, and
      // stored trimmed. The mirror case is what matters: a payload whose *trimmed* length
      // exceeds the limit passes `maxLength` only if the padding is counted, so the handler
      // measures the trimmed string. Both directions are asserted here because getting one
      // right and the other wrong is the natural mistake.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect((await ask(`${' '.repeat(499)}?`)).statusCode).toBe(201)
      expect((await ask(`  ${'x'.repeat(500)}  `)).statusCode).toBe(400)
    })

    it('refuses a body that is not a string and cannot be coerced into one', async () => {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **A number is NOT refused, and that is Fastify's behaviour across this whole product
      // rather than anything this route decides.** Ajv runs with `coerceTypes` on, so `42`
      // becomes `"42"` — a perfectly valid one-character question. Asserting a 400 here would be
      // asserting a behaviour the product does not have, on a route picked at random.
      //
      // What is genuinely unrepresentable is a shape with no string coercion. Those are refused
      // before the handler runs, which is where the `additionalProperties: false` and the
      // required-field checks also live.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect((await ask({ nested: 'object' })).statusCode).toBe(400)
      expect((await ask(['an', 'array'])).statusCode).toBe(400)

      const missing = await app.inject({
        method: 'POST',
        url: `/events/${summitId}/sessions/${sessionId}/questions`,
        headers: { cookie: cookieHeader(cookie) },
        payload: {},
      })
      expect(missing.statusCode).toBe(400)
    })
  })

  describe('at the column, with the route bypassed entirely', () => {
    it('refuses an empty body (FR-703)', async () => {
      expect(await refusedBy('')).toBe('session_questions_body_length')
    })

    it('refuses a whitespace-only body, which is what makes FR-705 structural', async () => {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // `length(trim(body)) > 0` rather than `length(body) > 0`. The difference is the whole of
      // FR-705: with the plain form, a body of spaces is a perfectly valid row and "no question"
      // acquires a second representation that every reader has to remember to handle. With the
      // trim it **cannot exist**, so there is nothing to remember.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(await refusedBy('   ')).toBe('session_questions_body_length')
      expect(await refusedBy('\n\t  \n')).toBe('session_questions_body_length')
    })

    it('refuses a body over 500 characters (FR-703)', async () => {
      expect(await refusedBy('x'.repeat(501))).toBe('session_questions_body_length')
    })

    it('accepts a legitimate body, so the constraint is not simply refusing everything', async () => {
      // Non-vacuity. A CHECK that rejected every insert would satisfy all three assertions
      // above while making the feature impossible.
      expect(await refusedBy('A question written straight to the table.')).toBeNull()
    })
  })
})
