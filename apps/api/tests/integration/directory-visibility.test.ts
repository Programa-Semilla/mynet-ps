import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { DbStorageService } from '../../src/storage/db-adapter.js'
import { avatarObjectKey, cardKeyFor } from '../../src/storage/service.js'
import {
  attendeeIdsByEmail,
  createDirectoryPopulation,
  eventIdsByName,
  OTHER_EVENT,
  removeDirectoryPopulation,
  SHARED_EVENT,
} from './directory-fixtures.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T035, T036 (006) — **the three conditions, applied to a set instead of a row** (FR-402,
 * FR-403, FR-409, SC-404, SC-405).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"ABSENT" IS A STRONGER CLAIM THAN "NOT RENDERED", AND THIS FILE ASSERTS THE STRONGER ONE.**
 *
 * FR-402 says an excluded attendee must not be present in the response *at all, in any field,
 * at any point* — and it says why: a response that carries a hidden attendee and relies on the
 * client not to render them **has already disclosed them**. A test that only checked the parsed
 * `attendees` array would pass against an implementation that shipped every co-attendee with a
 * `visible: false` flag.
 *
 * So the assertions below search the **raw response body** for the excluded person's name,
 * company and identifier. That is the difference between testing the requirement and testing
 * the happy path of the code that implements it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const HIDDEN = 'hidden@example.test'
const UNVERIFIED = 'unverified@example.test'
const ELSEWHERE = 'elsewhere@example.test'
const VISIBLE = 'visible@example.test'
const FIXTURES = [HIDDEN, UNVERIFIED, ELSEWHERE, VISIBLE]

describe('the directory shows nobody it should not (FR-402, SC-404)', () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string
  let ids: Map<string, string>
  let adaId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string
    adaId = (await attendeeIdsByEmail()).get(ADA) as string

    ids = await createDirectoryPopulation([
      {
        email: VISIBLE,
        displayName: 'Vera Visible',
        company: 'Clearly Limited',
        role: 'Staff Engineer',
        headline: 'Reachable, and happy to be.',
        interests: ['Design systems'],
      },
      {
        email: HIDDEN,
        displayName: 'Hilda Hidden',
        company: 'Undisclosed Holdings',
        role: 'Staff Engineer',
        discoverable: false,
      },
      {
        email: UNVERIFIED,
        displayName: 'Ursula Unverified',
        company: 'Unproven Address Co',
        role: 'Staff Engineer',
        verified: false,
      },
      {
        email: ELSEWHERE,
        displayName: 'Elena Elsewhere',
        company: 'Another Conference Inc',
        role: 'Staff Engineer',
        event: OTHER_EVENT,
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

  const list = (token = ada, query = '') =>
    app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees${query}`,
      headers: { cookie: cookieHeader(token) },
    })

  it('returns the co-attendees who satisfy all three conditions', async () => {
    const response = await list()

    expect(response.statusCode).toBe(200)
    const names = response
      .json()
      .attendees.map((entry: { displayName: string }) => entry.displayName)
    expect(names).toContain('Vera Visible')
    expect(names).toContain('Grace Hopper')
  })

  /**
   * The assertion this file exists for. Each excluded person is searched for in the **raw
   * body**, by three different strings, because a partially-projected leak is still a leak.
   */
  it.each([
    ['discoverability off', 'Hilda Hidden', 'Undisclosed Holdings', HIDDEN],
    ['an unverified address', 'Ursula Unverified', 'Unproven Address Co', UNVERIFIED],
    ['a registration elsewhere', 'Elena Elsewhere', 'Another Conference Inc', ELSEWHERE],
  ])(
    'excludes %s from the payload entirely — not present-and-hidden (FR-402)',
    async (_cause, displayName, company, email) => {
      const response = await list()
      const body = response.body

      expect(body).not.toContain(displayName)
      expect(body).not.toContain(company)
      expect(body).not.toContain(ids.get(email) as string)
    },
  )

  it('excludes the seeded unverified attendee, who never opted out of anything (FR-402)', async () => {
    // Alan is registered for this conference and is discoverable by default. Verification is
    // the only thing keeping him out, which is the branch SC-304a is about.
    expect((await list()).body).not.toContain('Alan Turing')
  })

  it('does not include the reader in their own directory', async () => {
    const response = await list()
    const returned = response
      .json()
      .attendees.map((entry: { attendeeId: string }) => entry.attendeeId)

    expect(
      returned,
      'Discovering oneself has no purpose, and a self-card whose shared-interest count equals ' +
        "one's own interest count would sit permanently at the top of the ranking (Assumptions).",
    ).not.toContain(adaId)
  })

  it('re-includes an attendee the moment they become discoverable again (FR-363)', async () => {
    const hiddenId = ids.get(HIDDEN) as string

    await getDb().update(attendees).set({ discoverable: true }).where(eq(attendees.id, hiddenId))
    expect((await list()).body).toContain('Hilda Hidden')

    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, hiddenId))
    expect(
      (await list()).body,
      'Nothing caches the flag: every read evaluates the column, so a change takes effect on ' +
        'the very next request (FR-363).',
    ).not.toContain('Hilda Hidden')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FR-459 — THE FACE IS SUBJECT TO THE SAME THREE CONDITIONS AS THE PROFILE.**
   *
   * "The profile withheld and the face given away" is the failure this forbids, and it is a
   * *plausible* one rather than a contrived one: the listing embeds avatar bytes (FR-456), so a
   * resolution step that ran over a wider set than the query returned — or that ran before the
   * predicate rather than after it — would ship a hidden attendee's photograph inside a
   * response that carefully omits their name.
   *
   * It holds structurally today: `withAvatar` maps over the rows `listDirectory` returned, and
   * those rows are already bounded by all three conditions. Structural is exactly why it needs
   * a test — nothing in the code says "and this is where FR-459 lives", so nothing would object
   * if a later change resolved avatars from a separate query.
   *
   * **The visible attendee's avatar is asserted PRESENT in the same test**, or this would pass
   * vacuously against a directory that never resolves any avatar at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it("never serves a hidden attendee's face, in any rendition (FR-459)", async () => {
    const storage = new DbStorageService()
    const hiddenId = ids.get(HIDDEN) as string
    const visibleId = ids.get(VISIBLE) as string

    // Two real, distinguishable images, so a leak is identifiable rather than inferred.
    const png = async (r: number, g: number, b: number) =>
      sharp({ create: { width: 24, height: 24, channels: 3, background: { r, g, b } } })
        .png()
        .toBuffer()

    for (const [attendeeId, colour] of [
      [hiddenId, [220, 20, 20]],
      [visibleId, [20, 20, 220]],
    ] as const) {
      const key = avatarObjectKey(attendeeId)
      const bytes = await png(colour[0], colour[1], colour[2])
      await storage.put(key, bytes, 'image/png')
      await storage.put(cardKeyFor(key), bytes, 'image/png')
      await getDb()
        .update(attendees)
        .set({ avatarObjectKey: key })
        .where(eq(attendees.id, attendeeId))
    }

    const body = (await list()).json() as {
      attendees: { attendeeId: string; avatar: { base64: string } | null }[]
    }

    // The visible attendee's face IS served — so the mechanism is live.
    const visible = body.attendees.find((entry) => entry.attendeeId === visibleId)
    expect(
      visible?.avatar,
      'the directory must serve a visible attendee’s face at all',
    ).not.toBeNull()

    // …and the hidden attendee is absent entirely, face included.
    expect(body.attendees.some((entry) => entry.attendeeId === hiddenId)).toBe(false)

    const hiddenBytes = (await storage.get(cardKeyFor(avatarObjectKey(hiddenId))))?.bytes
    expect(
      hiddenBytes,
      'fixture: the hidden attendee must actually have stored bytes',
    ).toBeDefined()
    expect(
      (await list()).body,
      'A hidden attendee’s photograph must not appear in the listing, in any rendition. That is ' +
        'the profile withheld and the face given away (FR-459).',
    ).not.toContain((hiddenBytes as Buffer).toString('base64'))

    // Restore the fixture: later tests in this file assume nobody has an avatar.
    for (const attendeeId of [hiddenId, visibleId]) {
      const key = avatarObjectKey(attendeeId)
      await storage.delete(key)
      await storage.delete(cardKeyFor(key))
      await getDb()
        .update(attendees)
        .set({ avatarObjectKey: null })
        .where(eq(attendees.id, attendeeId))
    }
  })

  it('refuses an unauthenticated caller before it considers anything else', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees`,
    })

    expect(response.statusCode).toBe(401)
  })
})

/**
 * T036 — **discoverability is not reciprocal** (FR-403, SC-405).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Discoverability is about being *found*, not about *finding*. The two are easy to conflate in
 * a single predicate — one `AND a.discoverable` too many, applied to the reader instead of the
 * candidate, and an attendee who values their privacy is silently punished with an empty
 * directory. 004 asserts the same property for the single-profile read; this is the set.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('a reader who is hidden still reads the directory in full (FR-403, SC-405)', () => {
  let app: FastifyInstance
  let sharedEventId: string
  let graceId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    sharedEventId = (await eventIdsByName()).get(SHARED_EVENT) as string
    graceId = (await attendeeIdsByEmail()).get(GRACE) as string

    await createDirectoryPopulation([
      { email: VISIBLE, displayName: 'Vera Visible', company: 'Clearly Limited' },
    ])
  })

  afterAll(async () => {
    await removeDirectoryPopulation([VISIBLE])
    await teardown(app)
  })

  const listAs = async (email: string) => {
    await clearThrottle()
    const token = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: SEED_PASSWORD },
      }),
    ) as string

    return app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees`,
      headers: { cookie: cookieHeader(token) },
    })
  }

  it('returns the same directory to a hidden reader as to a visible one', async () => {
    const visible = await listAs(GRACE)
    const visibleNames = visible
      .json()
      .attendees.map((entry: { displayName: string }) => entry.displayName)
      .sort()

    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, graceId))

    const hidden = await listAs(GRACE)
    const hiddenNames = hidden
      .json()
      .attendees.map((entry: { displayName: string }) => entry.displayName)
      .sort()

    expect(hidden.statusCode).toBe(200)
    expect(
      hiddenNames,
      'An attendee who turned discoverability off must still read the directory in full ' +
        '(FR-403). Hiding is about being found, never about finding.',
    ).toEqual(visibleNames)
    expect(hiddenNames.length).toBeGreaterThan(0)

    await getDb().update(attendees).set({ discoverable: true }).where(eq(attendees.id, graceId))
  })

  it('returns the directory to an unverified reader too', async () => {
    // Verification gates exactly one thing — being discoverable — and 004's spec says so
    // (FR-325c). An unverified attendee uses the product fully and appears to nobody.
    await getDb().update(attendees).set({ emailVerifiedAt: null }).where(eq(attendees.id, graceId))

    const response = await listAs(GRACE)

    expect(response.statusCode).toBe(200)
    expect(response.json().attendees.length).toBeGreaterThan(0)

    await getDb()
      .update(attendees)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(attendees.id, graceId))
  })
})
