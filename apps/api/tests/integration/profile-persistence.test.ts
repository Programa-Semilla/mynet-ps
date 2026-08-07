import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
 * T125 (004) — **100% of authored fields survive a reload and appear identically on a second
 * session** (SC-302).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * SC-302 states a percentage, so this asserts on **every field the profile carries** rather
 * than on a sample. The field list is taken from the response itself, which means a field added
 * by a later feature is covered the moment it exists — a hand-written list would silently keep
 * measuring 100% of the fields somebody remembered.
 *
 * "A second session" rather than "a second request" is the point: the prototype's state was
 * `useState` in a root component, so everything survived a re-render and nothing survived a
 * reload. Signing in again is what distinguishes durable server-side state from a variable.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('authored profile fields are durable (SC-302)', () => {
  let app: FastifyInstance
  let first: string

  const DRAFT = {
    company: 'Analytical Engines & Co',
    role: 'Principal Analyst',
    headline: 'Notes on the Analytical Engine, and what follows from them.',
    networkingIntent: 'open_to_meetings',
    availability: 'available',
    interests: ['Numerical methods', 'Poetry', 'Compilers'],
  } as const

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const signIn = async () =>
    sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string

  beforeEach(async () => {
    await clearThrottle()
    first = await signIn()
  })

  const read = (token: string) =>
    app.inject({ method: 'GET', url: '/profile', headers: { cookie: cookieHeader(token) } })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Interests are a SET, and their order is not authored.**
   *
   * `attendee_interests` is keyed `(attendee_id, interest)`, so there is no stored order to
   * survive — and the query returns them in a total order deliberately, for the reason
   * `queries/agenda.ts` records: two reads must not be able to disagree, and a diff of the
   * response has to be meaningful.
   *
   * SC-302 asks that authored fields *appear identically*, which for a set means the same
   * members. Asserting the submitted sequence would be asserting a property the attendee never
   * authored and the schema never stored.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const comparable = (value: unknown): unknown =>
    Array.isArray(value) ? [...(value as string[])].sort() : value

  it('returns every authored field unchanged on the write itself', async () => {
    const written = await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(first) },
      payload: DRAFT,
    })

    expect(written.statusCode).toBe(200)

    const body = written.json() as Record<string, unknown>
    for (const [field, value] of Object.entries(DRAFT)) {
      expect(comparable(body[field]), `${field} was not echoed`).toEqual(comparable(value))
    }
  })

  it('returns 100% of them identically on a later read in the SAME session', async () => {
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(first) },
      payload: DRAFT,
    })

    const reread = (await read(first)).json() as Record<string, unknown>

    // Every key the profile carries, compared field by field — not `toMatchObject`, which would
    // pass while silently ignoring a field that had vanished from the response.
    for (const [field, value] of Object.entries(DRAFT)) {
      expect(comparable(reread[field]), `${field} did not survive`).toEqual(comparable(value))
    }
  })

  it('returns 100% of them identically on a SECOND SESSION (SC-302)', async () => {
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(first) },
      payload: DRAFT,
    })

    // A different device: a separate sign-in, a separate session row, a separate cookie.
    const second = await signIn()
    expect(second).not.toBe(first)

    const fromFirst = (await read(first)).json() as Record<string, unknown>
    const fromSecond = (await read(second)).json() as Record<string, unknown>

    expect(
      fromSecond,
      'Durable server-side state, not a variable in a component (SC-302). Every field, ' +
        'byte-for-byte, from a session that never saw the write.',
    ).toEqual(fromFirst)
  })

  it('survives sign-out and back in', async () => {
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(first) },
      payload: DRAFT,
    })

    await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: cookieHeader(first) },
    })

    const after = (await read(await signIn())).json() as Record<string, unknown>

    for (const [field, value] of Object.entries(DRAFT)) {
      expect(comparable(after[field]), `${field} did not survive sign-out`).toEqual(
        comparable(value),
      )
    }
  })

  it('covers every field the profile carries, not only the ones this test writes', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The guard on the guard. If a later feature adds an attendee-authored field and this test
    // keeps passing without covering it, SC-302's "100%" would quietly become "100% of the six
    // fields somebody wrote down in 2026".
    // ───────────────────────────────────────────────────────────────────────────────────────
    const profile = (await read(first)).json() as Record<string, unknown>

    /** Fields that are not attendee-authored, so persistence is not their property. */
    const NOT_AUTHORED = new Set([
      'displayName', // set at sign-up; changing it is out of scope
      'email', // the account's identity, with no path to change it (Out of Scope)
      'discoverable', // a setting, covered by `discoverability.test.ts`
      'emailVerified', // established by following a link, not by authoring
      'hasAvatar', // covered by the avatar suite, which asserts the bytes rather than a flag
    ])

    const authored = Object.keys(profile).filter((field) => !NOT_AUTHORED.has(field))
    const covered = Object.keys(DRAFT)

    expect(
      authored.sort(),
      'An attendee-authored field exists that this durability test does not write. Add it to ' +
        "DRAFT, or to NOT_AUTHORED with the reason it is not the attendee's to author (SC-302).",
    ).toEqual(covered.sort())
  })
})
