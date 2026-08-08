import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { cardKeyFor } from '../../src/storage/service.js'
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
 * T079 (004) — **replacing an avatar makes the previous bytes unretrievable** (FR-350), and
 * removing it restores the fallback (FR-351).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The obvious implementation stores each upload under a fresh key and repoints the row. It
 * passes every "the new avatar renders" test and leaves **every previous photograph
 * retrievable by anyone who ever held its key** — including the one somebody replaced
 * *because* they wanted it gone.
 *
 * Deriving the key from the attendee makes replacement an overwrite, so there is never a second
 * copy to forget about. These assertions are on the count of stored objects, not on what the
 * profile now shows, because the second is what a fresh-key implementation would also satisfy.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('replacing and removing an avatar (FR-350, FR-351)', () => {
  let app: FastifyInstance
  let ada: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
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
    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })
  })

  const solid = (r: number, g: number, b: number) =>
    sharp({ create: { width: 400, height: 400, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer()

  const upload = async (image: Buffer) =>
    app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
      payload: { image: image.toString('base64') },
    })

  const objects = async (): Promise<Array<{ key: string; bytes: Buffer }>> => {
    const rows = await getDb().execute<{ key: string; bytes: Buffer }>(sql`
      SELECT key, bytes FROM stored_objects ORDER BY key
    `)
    return rows.map((row) => ({
      key: row.key,
      bytes: Buffer.isBuffer(row.bytes)
        ? row.bytes
        : Buffer.from(row.bytes as unknown as Uint8Array),
    }))
  }

  const served = async () =>
    app.inject({ method: 'GET', url: '/profile/avatar', headers: { cookie: cookieHeader(ada) } })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **006 changed the expected count from one to two, and the property under test is
   * unchanged.**
   *
   * 004 stored one rendition per attendee; 006 stores two — the 512px profile rendition and a
   * 96px card rendition embedded in the directory listing (FR-457, research D2). So "exactly
   * one" became "exactly two", and it would have been easy to relax this to "at most a few"
   * and lose the assertion entirely.
   *
   * What FR-350 actually requires is that the count **does not grow with the number of
   * uploads**: a fresh key per upload would leave every previous photograph retrievable by
   * anyone holding its key, including the one somebody replaced *because* they wanted it gone.
   * Both keys are derived from the attendee, so both overwrite. Three uploads, two objects.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('keeps exactly one object PER RENDITION however many times the avatar is replaced', async () => {
    await upload(await solid(255, 0, 0))
    await upload(await solid(0, 255, 0))
    await upload(await solid(0, 0, 255))

    const stored = await objects()

    expect(
      stored,
      'A fresh key per upload would leave every previous photograph retrievable by anyone who ' +
        'held its key — including the one somebody replaced BECAUSE they wanted it gone (FR-350).',
    ).toHaveLength(2)

    // Related, not merely counted: two objects could also be one attendee's avatar plus a
    // stray. The card key is DERIVED from the profile key (research D3), and asserting that
    // relation is what proves deletion can reach it from the attendee identifier alone.
    const [profileKey, cardKey] = stored.map((object) => object.key)
    expect(profileKey).toMatch(/^avatars\//)
    expect(cardKey).toBe(cardKeyFor(profileKey as string))
  })

  it('makes the previous bytes unretrievable, not merely unreferenced', async () => {
    await upload(await solid(255, 0, 0))
    const [first] = await objects()

    await upload(await solid(0, 0, 255))
    const [second] = await objects()

    expect(second?.key, 'the key is derived from the attendee, so it does not move').toBe(
      first?.key,
    )
    expect(second?.bytes.equals(first?.bytes as Buffer)).toBe(false)

    // Nothing anywhere in the store still holds the first image's bytes.
    const all = await objects()
    for (const object of all) {
      expect(object.bytes.equals(first?.bytes as Buffer)).toBe(false)
    }
  })

  it('serves the replacement, not the original', async () => {
    await upload(await solid(255, 0, 0))
    await upload(await solid(0, 0, 255))

    const body = (await served()).json() as { base64: string }
    const pixel = await sharp(Buffer.from(body.base64, 'base64'))
      .raw()
      .toBuffer({ resolveWithObject: true })

    // The blue channel dominates in the replacement and not in the original, so this
    // distinguishes them by content rather than by byte length.
    const [r, , b] = pixel.data
    expect(b).toBeGreaterThan(r as number)
  })

  it('removes the bytes and restores the fallback (FR-351)', async () => {
    await upload(await solid(120, 120, 120))
    expect(await objects(), 'both renditions are stored (006, FR-457)').toHaveLength(2)

    const removed = await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })
    expect(removed.statusCode).toBe(204)

    expect(await objects(), 'the bytes are deleted, not merely unreferenced').toHaveLength(0)

    // 204 with no body is what makes the client render the non-photographic fallback rather
    // than a broken image.
    expect((await served()).statusCode).toBe(204)

    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
    })
    expect((profile.json() as { hasAvatar: boolean }).hasAvatar).toBe(false)
  })

  it('is idempotent — removing an avatar that is not there succeeds', async () => {
    const first = await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })
    const second = await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })

    expect(first.statusCode).toBe(204)
    expect(second.statusCode).toBe(204)
  })

  it('renders the fallback rather than failing when a row points at missing bytes', async () => {
    // The one inconsistency the deletion path can leave behind, and deliberately the
    // recoverable one (research D10): object removed, row not yet. It must read as "no avatar",
    // never as a failure.
    await upload(await solid(30, 30, 30))
    await getDb().execute(sql`DELETE FROM stored_objects`)

    expect((await served()).statusCode).toBe(204)
  })

  it("does not touch another attendee's avatar", async () => {
    await upload(await solid(200, 10, 10))

    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: 'grace@example.com', password: SEED_PASSWORD },
      }),
    ) as string

    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(grace) },
    })

    // Grace removing hers must not remove Ada's — the key is derived from the session's
    // attendee, so there is no path by which one caller reaches another's object.
    expect(await objects(), "Ada's two renditions survive Grace's removal").toHaveLength(2)
    expect((await served()).statusCode).toBe(200)
  })
})
