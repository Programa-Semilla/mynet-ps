import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config.js'
import { getDb } from '../../src/db/client.js'
import { deleteAccount } from '../../src/db/queries/account.js'
import { DbStorageService } from '../../src/storage/db-adapter.js'
import { avatarObjectKey, cardKeyFor } from '../../src/storage/service.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T027, T028 (006) — **the card rendition carries no metadata, and no rendition survives an
 * account** (FR-457, FR-458, FR-460, SC-408).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **BOTH ASSERTIONS EXIST BECAUSE 006 ADDS A SECOND COPY OF SOMETHING 004 GOT RIGHT ONCE.**
 *
 * 004 established that metadata absence is a property of the *operation* — a full decode and
 * re-encode, producing an image from pixels alone, so that a tag nobody anticipated cannot
 * survive. `avatar-upload.test.ts` proves that for the 512px rendition.
 *
 * A second rendition is a second chance to get it wrong, and the wrong ways all look right:
 * copying the stored bytes and resizing them elsewhere, resizing on the client, or building a
 * separate `sharp` chain that omits one line. **Each would produce a perfectly good-looking
 * avatar with a home address inside it**, and nothing in the product would report it. FR-458
 * requires the same path; this is what holds that requirement to its meaning rather than to its
 * wording.
 *
 * FR-460 is the same shape from the other end. 004's deletion path removed *the* avatar; there
 * are now two, and a path that removed only the profile one would leave the attendee's face in
 * every co-attendee's directory after the account was gone — **a silent regression of a
 * guarantee 004 shipped**, invisible because the profile would 404 correctly the whole time.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the card rendition (FR-457, FR-458, FR-460)', () => {
  let app: FastifyInstance
  let ada: string
  let adaId: string

  const storage = new DbStorageService()

  beforeAll(async () => {
    app = await setupTestApp()
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

    const rows = await getDb().execute<{ id: string }>(
      sql`SELECT id FROM attendees WHERE email = ${ADA}`,
    )
    adaId = rows[0]?.id as string
  })

  /**
   * A photograph as a phone with location services on would produce it.
   *
   * The same fixture shape `avatar-upload.test.ts` uses, and deliberately built rather than
   * committed: a real photograph of a real person is exactly what standing decision 13 keeps out
   * of this repository, and a synthesised one carries genuine EXIF IFD0 and GPS blocks written
   * by the library a camera's output would be decoded with.
   */
  const photograph = async (width = 1600, height = 1200): Promise<Buffer> =>
    sharp({ create: { width, height, channels: 3, background: { r: 180, g: 140, b: 120 } } })
      .jpeg()
      .withExif({
        IFD0: {
          Make: 'ACME Optics',
          Model: 'Pocket 9 Pro',
          Software: 'CameraApp 3.2',
          DateTime: '2026:08:07 09:14:22',
        },
        IFD2: { DateTimeOriginal: '2026:08:07 09:14:22', ExposureTime: '1/125' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '41/1 23/1 12/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '2/1 10/1 30/1',
        },
      })
      .toBuffer()

  const upload = (image: Buffer) =>
    app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
      payload: { image: image.toString('base64') },
    })

  /** Read straight out of the adapter's table, never through a route that might transform it. */
  const bytesAt = async (key: string): Promise<Buffer | null> => {
    const rows = await getDb().execute<{ bytes: Buffer }>(
      sql`SELECT bytes FROM stored_objects WHERE key = ${key}`,
    )
    const bytes = rows[0]?.bytes
    if (!bytes) return null
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as unknown as Uint8Array)
  }

  const cardBytes = async (): Promise<Buffer> => {
    const bytes = await bytesAt(cardKeyFor(avatarObjectKey(adaId)))
    expect(
      bytes,
      'no card rendition was stored — every assertion below would be vacuous',
    ).not.toBeNull()
    return bytes as Buffer
  }

  it('the fixture really does carry metadata — otherwise this file proves nothing', async () => {
    // The guard on the guard, as `avatar-upload.test.ts` has. If `withExif` silently stopped
    // working, every "no metadata survived" assertion below would be comparing nothing to
    // nothing and passing.
    const original = await photograph()
    expect((await sharp(original).metadata()).exif).toBeDefined()
    expect(original.includes(Buffer.from('ACME Optics'))).toBe(true)
  })

  it('is stored under a key DERIVED from the profile key, not a column (research D3)', async () => {
    await upload(await photograph())

    const profileKey = avatarObjectKey(adaId)
    expect(await bytesAt(profileKey)).not.toBeNull()
    expect(
      await bytesAt(cardKeyFor(profileKey)),
      'A stored key would be a new column collecting attendee data, and ' +
        '`tests/unit/export-coverage.test.ts` fails when one exists without export coverage. ' +
        'Deriving it is what keeps "no new table and no new column" true.',
    ).not.toBeNull()
  })

  it('carries NO exif block (FR-458)', async () => {
    await upload(await photograph())
    const metadata = await sharp(await cardBytes()).metadata()

    expect(
      metadata.exif,
      'FR-458: the card rendition must come from the same decode-and-re-encode path, so that ' +
        'metadata absence stays a property of the operation. A second production path is a ' +
        'second place EXIF stripping could regress — silently, because the image looks fine.',
    ).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
  })

  it('carries no GPS, camera or timestamp string anywhere in its bytes (FR-458)', async () => {
    await upload(await photograph())
    const card = await cardBytes()

    // A byte-level scan rather than a metadata read: "no EXIF block" and "no camera string
    // anywhere" are different claims, and a comment field, an XMP packet or a maker note would
    // satisfy the first while failing the second.
    //
    // The GPS coordinates are the reason standing decision 13 calls EXIF stripping mandatory —
    // what a phone photograph leaks is a real person's home address.
    for (const needle of ['ACME Optics', 'Pocket 9 Pro', 'CameraApp', '2026:08:07', '41/1']) {
      expect(card.includes(Buffer.from(needle)), `card bytes contain "${needle}"`).toBe(false)
    }
  })

  it('is re-encoded to the one output format, proving a decode rather than a copy', async () => {
    await upload(await photograph())

    // The upload was a JPEG. That the card is not is the proof that it came out of the decode
    // chain rather than being copied or cropped from the stored profile rendition.
    expect((await sharp(await cardBytes()).metadata()).format).toBe('webp')
  })

  it('is smaller than the profile rendition, at the configured card bound (FR-457)', async () => {
    await upload(await photograph(1600, 1200))

    const { avatar } = loadConfig()
    const card = await sharp(await cardBytes()).metadata()
    const profile = await sharp((await bytesAt(avatarObjectKey(adaId))) as Buffer).metadata()

    expect(card.width).toBe(avatar.cardDimensionPx)
    expect(card.height).toBe(avatar.cardDimensionPx)
    expect(profile.width).toBe(avatar.dimensionPx)

    // FR-457's actual point: the listing must not carry the profile rendition. Twenty-four of
    // those base64-encoded is about a megabyte on a conference connection.
    expect(card.width).toBeLessThan(profile.width as number)
    expect((await cardBytes()).byteLength).toBeLessThan(
      ((await bytesAt(avatarObjectKey(adaId))) as Buffer).byteLength,
    )
  })

  it('never upscales — a small upload stays small in both renditions', async () => {
    // 64px is below both bounds. Neither rendition may invent pixels, and the card must not be
    // padded up to 96 either.
    await upload(await photograph(64, 64))

    expect((await sharp(await cardBytes()).metadata()).width).toBe(64)
    expect((await sharp((await bytesAt(avatarObjectKey(adaId))) as Buffer).metadata()).width).toBe(
      64,
    )
  })

  /**
   * T028 — **zero renditions survive the account, in any size** (FR-460, SC-408).
   *
   * Driven through `deleteAccount` directly rather than through `DELETE /account`, matching
   * `avatar-personal-data.test.ts`: the requirement is about what happens to the bytes, and the
   * query layer is where that is decided. `account-deletion-storage.test.ts` asserts the same
   * property through the route.
   */
  it('leaves ZERO stored renditions in any size when the account is deleted (SC-408)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A throwaway account rather than Ada's, and the reason is not tidiness: the integration
    // suites share one database, and deleting a seeded attendee would remove them for every
    // file that ran afterwards. `avatar-personal-data.test.ts` signs up its own for the same
    // reason — a deletion test is the one test that cannot borrow its subject.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const email = 'card-rendition-deletion@example.com'
    await getDb().execute(sql`DELETE FROM attendees WHERE email = ${email}`)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Departing Face', password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(created) as string
    const rows = await getDb().execute<{ id: string }>(
      sql`SELECT id FROM attendees WHERE email = ${email}`,
    )
    const departingId = rows[0]?.id as string

    await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
      payload: { image: (await photograph()).toString('base64') },
    })

    const profileKey = avatarObjectKey(departingId)
    expect(await bytesAt(profileKey)).not.toBeNull()
    expect(await bytesAt(cardKeyFor(profileKey))).not.toBeNull()

    await deleteAccount(departingId, storage)

    // Asserted by prefix rather than by naming the two keys, deliberately: a THIRD rendition
    // added by a later feature and not deleted would pass a two-key check and fail this one.
    // FR-460 says "every stored rendition", and this is that word tested rather than restated.
    const survivors = await getDb().execute<{ key: string }>(
      sql`SELECT key FROM stored_objects WHERE key LIKE ${`${profileKey}%`}`,
    )

    expect(
      survivors,
      "A rendition outliving the account would keep the attendee's face in every co-attendee's " +
        'directory after they had gone — silently, because the profile would 404 correctly the ' +
        'whole time. 004 shipped that guarantee; 006 must not regress it (FR-460, SC-408).',
    ).toEqual([])
  })
})
