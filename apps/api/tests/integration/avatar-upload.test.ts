import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
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
 * T077 (004) — **the STORED bytes carry no location, camera or timestamp metadata**
 * (FR-348, FR-349, SC-303).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ASSERTS AGAINST STORAGE, NOT AGAINST THE UPLOAD PATH, AND THE DISTINCTION IS THE
 * WHOLE REQUIREMENT.**
 *
 * SC-303 says it outright: *verified by inspecting stored bytes, not by trusting the upload
 * path*. A test that checked what the client sent, or that the handler called a stripping
 * function, would pass against an implementation that stripped nothing — and the thing being
 * protected is a real person's home address, which is what a phone photograph's GPS tags
 * amount to when they are shown to a conference full of strangers.
 *
 * The fixture is **synthesised rather than committed**: a JPEG carrying genuine EXIF IFD0 and
 * GPS blocks, built by the same library a camera's output would be decoded with. Committing a
 * real photograph would put a real person's likeness — and possibly their coordinates — into a
 * public repository to test that this product does not do exactly that.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('an uploaded photograph is stored without its metadata (FR-349)', () => {
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
  })

  /** A photograph as a phone with location services on would produce it. */
  const photograph = async (width = 1600, height = 1200): Promise<Buffer> =>
    sharp({
      create: { width, height, channels: 3, background: { r: 180, g: 140, b: 120 } },
    })
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

  /** Read straight out of the adapter's table — never through the route that wrote it. */
  const storedBytes = async (): Promise<Buffer> => {
    const rows = await getDb().execute<{ bytes: Buffer }>(sql`
      SELECT o.bytes FROM stored_objects o
      JOIN attendees a ON a.avatar_object_key = o.key
      WHERE a.email = ${ADA}
    `)
    const bytes = rows[0]?.bytes
    expect(bytes, 'nothing was stored').toBeDefined()
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as unknown as Uint8Array)
  }

  it('the fixture really does carry metadata — otherwise this file proves nothing', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The guard that stops every assertion below passing vacuously. If `withExif` silently
    // stopped working, the "no metadata survived" checks would be comparing nothing to nothing.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const original = await photograph()
    const metadata = await sharp(original).metadata()

    expect(
      metadata.exif,
      'the fixture must have EXIF for its absence to mean anything',
    ).toBeDefined()
    expect(original.includes(Buffer.from('ACME Optics'))).toBe(true)
    expect(original.includes(Buffer.from('GPS'))).toBe(false) // tag names are not stored as text
  })

  it('stores the image and records it on the account', async () => {
    expect((await upload(await photograph())).statusCode).toBe(204)

    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
    })
    expect((profile.json() as { hasAvatar: boolean }).hasAvatar).toBe(true)
  })

  it('carries NO exif block in the stored bytes', async () => {
    await upload(await photograph())

    const metadata = await sharp(await storedBytes()).metadata()

    expect(
      metadata.exif,
      'FR-349: no camera, location or timestamp information may survive',
    ).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
  })

  it('carries no camera make, model or software string anywhere in the stored bytes', async () => {
    await upload(await photograph())
    const stored = await storedBytes()

    // A byte-level scan rather than a metadata read, because "no EXIF block" and "no camera
    // string anywhere" are different claims — a comment field, an XMP packet or a maker note
    // would satisfy the first and fail the second.
    for (const needle of ['ACME Optics', 'Pocket 9 Pro', 'CameraApp', '2026:08:07']) {
      expect(stored.includes(Buffer.from(needle)), `stored bytes contain "${needle}"`).toBe(false)
    }
  })

  it('re-encodes to one format rather than passing the original through (research D8)', async () => {
    await upload(await photograph())
    const metadata = await sharp(await storedBytes()).metadata()

    // The uploaded bytes were a JPEG. That the stored bytes are not is the proof that a
    // decode-and-re-encode happened rather than a copy with tags removed — which is what makes
    // metadata absence a property of the operation rather than a list to maintain.
    expect(metadata.format).toBe('webp')
  })

  it('resizes to bounded dimensions rather than storing the uploaded resolution (FR-348)', async () => {
    await upload(await photograph(1600, 1200))
    const metadata = await sharp(await storedBytes()).metadata()

    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
  })

  it('never upscales a small photograph into a blurry large one', async () => {
    await upload(await photograph(96, 96))
    const metadata = await sharp(await storedBytes()).metadata()

    expect(metadata.width).toBe(96)
    expect(metadata.height).toBe(96)
  })

  it('crops a non-square photograph to a square rather than letterboxing it', async () => {
    await upload(await photograph(400, 250))
    const metadata = await sharp(await storedBytes()).metadata()

    // An avatar frame is square everywhere it appears; padding would push the face into a
    // fraction of the space.
    expect(metadata.width).toBe(metadata.height)
    expect(metadata.width).toBe(250)
  })

  it('serves back what it stored, and nothing about the original', async () => {
    await upload(await photograph())

    const served = await app.inject({
      method: 'GET',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })

    expect(served.statusCode).toBe(200)
    const body = served.json() as { contentType: string; base64: string }
    expect(body.contentType).toBe('image/webp')

    // FR-349 is about what is stored **and served**. Same assertion, from the other end.
    const servedBytes = Buffer.from(body.base64, 'base64')
    expect((await sharp(servedBytes).metadata()).exif).toBeUndefined()
    expect(servedBytes.includes(Buffer.from('ACME Optics'))).toBe(false)
  })

  it('answers 204 for an attendee with no avatar, so the fallback renders (FR-351)', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })

    const served = await app.inject({
      method: 'GET',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
    })

    expect(served.statusCode).toBe(204)
  })
})
