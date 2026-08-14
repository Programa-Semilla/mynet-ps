import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { buildApp, type BuildAppOptions } from '../../src/app.js'
import { SESSION_COOKIE } from '../../src/auth/cookie.js'
import { closeDb, getDb } from '../../src/db/client.js'
import { runMigrations } from '../../src/db/migrate.js'
import { attendeeCredentials, attendees } from '../../src/db/schema/attendees.js'
import { authSessions } from '../../src/db/schema/auth-sessions.js'
import { events, registrations } from '../../src/db/schema/events.js'
import { signInAttempts } from '../../src/db/schema/sign-in-attempts.js'
import { seed } from '../../src/db/seed/index.js'

/**
 * Integration test harness — the API against a **real** PostgreSQL database (FR-005, FR-069).
 *
 * Not a mocked database. FR-069's isolation assertion is meaningless against a fake: the
 * whole claim is that the *query* cannot reach another attendee's rows, and a stub would
 * happily agree with whatever the test expected.
 *
 * `fastify.inject()` drives the real routing, schema validation, and auth stack without
 * binding a port (research.md D11).
 */

/**
 * The escalating delay is served in-request, so the suite would otherwise spend minutes asleep
 * proving properties that do not depend on how long the sleep is. Shrinking it exercises the
 * same branches at a hundredth of the wall-clock cost.
 *
 * Set before anything calls `loadConfig`, which memoises.
 */
process.env['AUTH_MAX_SERVED_DELAY_MS'] ??= '20'

/**
 * Likewise for the reset-request timing pad (FR-327). The suite drives that route several
 * hundred times across the throttle, lockout and non-disclosure files, and paying the real
 * 600ms pad on each tripled the integration run for a property no test here asserts — a timing
 * oracle is not observable through `fastify.inject()`, which does not measure elapsed time.
 *
 * Production cannot take this value: `loadConfig` refuses to start below a floor when
 * `NODE_ENV=production`, so the guarantee holds where it is real and costs nothing here.
 */
process.env['AUTH_RESET_BRANCH_BUDGET_MS'] ??= '1'

/**
 * 007 — likewise for push delivery. `push-gone.test.ts` drives a push service that **hangs**,
 * which is the common failure mode of an HTTP push service and the one a `try/catch` alone does
 * not handle — so the timeout is the thing under test rather than an incidental wait. Paying the
 * real ten seconds proves nothing the twenty-millisecond version does not, and does it once per
 * hanging endpoint.
 *
 * Production cannot take this value: it is read from the environment and nothing sets it there.
 */
process.env['PUSH_DISPATCH_TIMEOUT_MS'] ??= '20'

export { IDENTIFIER_FREE_ATTEMPTS, SOURCE_FREE_ATTEMPTS } from '../../src/auth/throttle.js'

export const SEED_PASSWORD = 'correct-horse-battery-staple'
export const ADA = 'ada@example.com'
export const GRACE = 'grace@example.com'

/**
 * Fails loudly when DATABASE_URL is absent, rather than skipping.
 *
 * A test suite that skips itself when its dependency is missing reports green while asserting
 * nothing — which is exactly the "absent check reporting success" that FR-064 and FR-071
 * forbid. If this cannot run, the run must fail.
 */
const requireDatabaseUrl = (): string => {
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests run against a real database (FR-005, FR-069) ' +
        'and MUST NOT be skipped when it is missing — a skipped isolation test reporting success ' +
        'is the failure FR-071 exists to prevent.\n\n' +
        'Start one locally:\n' +
        '  docker run --name mynet-pg -e POSTGRES_PASSWORD=mynet -e POSTGRES_USER=mynet \\\n' +
        '    -e POSTGRES_DB=mynet_dev -p 5432:5432 -d postgres:17',
    )
  }
  return url
}

/**
 * 004 — the development mail sink, shared by the harness and the assertions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A test that needs a verification or reset **link** has nowhere else to read one: the token's
 * plaintext exists for exactly one moment, inside the route, and only its hash is stored
 * (FR-323, FR-333). That is the property under test, so reading the link out of the database
 * is not an option — there is nothing there to read.
 *
 * Injected per file rather than reached for globally, so one suite's sends are never visible to
 * another's assertions.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export { SinkMailService } from '../../src/mail/sink-adapter.js'
export type { SentMessage } from '../../src/mail/sink-adapter.js'

export const setupTestApp = async (
  ports: BuildAppOptions['ports'] = {},
): Promise<FastifyInstance> => {
  requireDatabaseUrl()
  await runMigrations()
  return buildApp({ ports })
}

/**
 * Truncates everything and re-seeds. Called per test file, not per test, for speed.
 *
 * 004 — `seed()` clears and re-inserts `attendees`, and every table this feature adds cascades
 * from it, so accounts created by a sign-up test and the profiles, tokens and registrations
 * hanging off them all disappear here without this function naming any of them. That is the
 * cascade doing the same job the delete route asks of it, which is a small daily proof that it
 * works.
 *
 * `stored_objects` is the exception, for exactly the reason it is the exception everywhere
 * else: no foreign key reaches it (research D3, D10). It is cleared explicitly.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **007 — `conversations` IS THE SECOND EXCEPTION, AND IT COST A FLAKY SUITE TO FIND.**
 *
 * The paragraph above states the invariant this function has relied on since 004: every table
 * cascades from `attendees`, so clearing attendees clears everything and this function need
 * name nothing. **007 is the first feature for which that is false.** `conversations` holds no
 * attendee foreign key at all — deliberately, because a row that named a departed attendee
 * would breach FR-573, which is the entire reason `conversation_pairs` exists as a separate
 * table (research R10). Nothing cascades to it, so nothing removed it.
 *
 * The symptom was worse than a leak. Orphaned conversations accumulated one per reset, and the
 * integration suite failed **intermittently** depending on how many had built up and in what
 * order files ran — five tests failing on one run and none on the next, from the same tree.
 *
 * Cleared before `seed()` and by explicit delete, which cascades to `conversation_pairs`,
 * `conversation_participants` and `messages` and so needs no companion lines. Anything a later
 * feature adds that holds no attendee foreign key belongs here too, and the fact that this list
 * now has two entries rather than one is the warning that the invariant is not self-maintaining.
 *
 * **This is a test-harness fix and not FR-575's.** Removing a conversation whose last
 * participant has left is the product's own obligation, implemented in `deleteAccount` (T131).
 * A helper that hid the residue would have made that requirement harder to test, not easier.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const resetDatabase = async (): Promise<void> => {
  const db = getDb()
  await db.delete(signInAttempts)
  await db.delete(authSessions)
  await db.execute(sql`DELETE FROM stored_objects`)
  await db.execute(sql`DELETE FROM conversations`)
  await seed()

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // **T144 (007) — the seeded conversation is removed AFTER seeding, and the asymmetry is
  // deliberate.**
  //
  // 007's seed adds one conversation between Ada and Grace so the destination is not empty on a
  // fresh clone — a *development-experience* fixture, and the only way Home's unread indicator
  // and the list's marker are reachable at first run without two browser profiles.
  //
  // The integration suite wants the opposite: a known-empty baseline. Every conversation test
  // constructs exactly the fixture it is asserting about, and a pre-existing conversation turns
  // "opening a conversation answers 201" into 200 and every count off by one — not because
  // anything is wrong, but because the test was written against a different starting point.
  //
  // Removed here rather than by making the seed conditional, because a seed that behaves
  // differently under test is a seed nobody can reason about — and because the *product's*
  // fixture is the one that should stay simple. A test that wants a conversation makes one.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  await db.execute(sql`DELETE FROM conversations`)
}

/** Test seam: the seeded conferences' join codes, so a test never hard-codes one. */
export { SEED_EVENTS } from '../../src/db/seed/events.js'

/** Clears only the throttle table, so an earlier test's failures do not delay a later one. */
/**
 * A seeded attendee's id, **or a failure that names the actual cause**.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SHARED SEED IS A PREREQUISITE, AND WHEN IT IS MISSING THE SYMPTOM IS UNREADABLE.**
 *
 * Most suites resolve their fixtures with `(await db.select()…)[0]!.id`, which is fine while the
 * seed is present and produces `TypeError: Cannot read properties of undefined (reading 'id')`
 * when it is not — a message that names neither the table, the attendee, nor the seed.
 *
 * It is not hypothetical: the 114 integration files share one database, are seeded **once** for
 * the whole run, run in file-size order, and several call `resetDatabase()` mid-run. A file that
 * assumes the seed is intact can find it gone for reasons that have nothing to do with what it
 * is testing, and the resulting `TypeError` sends the next reader after the wrong thing. This
 * turns that into one sentence.
 *
 * It does **not** fix the underlying isolation model — see `review-findings.md`. It makes the
 * next occurrence diagnosable instead of misleading.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const seededAttendeeId = async (email: string): Promise<string> => {
  const rows = await getDb().select().from(attendees).where(eq(attendees.email, email))
  const found = rows[0]
  if (!found) {
    throw new Error(
      `The seeded attendee ${email} is absent, so this suite's fixture cannot be built. That is ` +
        'a prerequisite failure rather than a defect in the behaviour under test: the ' +
        'integration files share one database and are seeded once for the whole run, so a ' +
        'neighbouring file’s `resetDatabase()` (or a partially-applied seed) can remove it. ' +
        'Re-run with `pnpm db:seed` first; if it recurs, the suite ordering is the thing to ' +
        'investigate, not this file.',
    )
  }
  return found.id
}

export const clearThrottle = async (): Promise<void> => {
  await getDb().delete(signInAttempts)
}

export const teardown = async (app: FastifyInstance): Promise<void> => {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // **BACKGROUND WORK DRAINS BEFORE THE APPLICATION AND THE POOL CLOSE, AND EVERY FILE NEEDS THIS
  // WHETHER OR NOT IT ASSERTS ON A NOTIFICATION.**
  //
  // 014's saved-session fan-out outlives the response deliberately: awaited in the organizer's
  // request it is `recipients × push RTT` against a 10s `connectionTimeout`. The consequence for
  // this suite is that **any** file which cancels or edits a session starts work that can still be
  // running when its `afterAll` fires — and these files share one database, seeded once for the
  // whole run.
  //
  // Left undrained, that work runs while the next file's `resetDatabase()`/`seed()` is executing,
  // and the symptom is D9's exactly: a later suite failing to find a seeded attendee, in a file
  // with nothing to do with authoring. It presents as flakiness that moves between files run to
  // run, which is precisely how it was found.
  //
  // Five files already await `afterDispatch` because they assert on the sink. This is the same
  // drain, applied to every file by putting it where teardown already happens — the property is
  // "a file does not outlive its own writes", which is not specific to asserting on them. It is
  // also the same call `server.ts` makes on SIGTERM, so nothing here is a test-only path.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  await app.background.drain()
  await app.close()
  await closeDb()
}

export { attendeeCredentials, attendees, authSessions, events, registrations, signInAttempts }

/** Extracts the sign-in session cookie value from a response's set-cookie headers. */
export const sessionCookieFrom = (response: {
  cookies: Array<{ name: string; value: string }>
}): string | undefined => response.cookies.find((c) => c.name === SESSION_COOKIE)?.value

/** Formats a cookie header for a subsequent request. */
export const cookieHeader = (token: string): string => `${SESSION_COOKIE}=${token}`

export { SESSION_COOKIE }
