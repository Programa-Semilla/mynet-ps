import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
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

export const setupTestApp = async (): Promise<FastifyInstance> => {
  requireDatabaseUrl()
  await runMigrations()
  return buildApp()
}

/** Truncates everything and re-seeds. Called per test file, not per test, for speed. */
export const resetDatabase = async (): Promise<void> => {
  const db = getDb()
  await db.delete(signInAttempts)
  await db.delete(authSessions)
  await seed()
}

/** Clears only the throttle table, so an earlier test's failures do not delay a later one. */
export const clearThrottle = async (): Promise<void> => {
  await getDb().delete(signInAttempts)
}

export const teardown = async (app: FastifyInstance): Promise<void> => {
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
