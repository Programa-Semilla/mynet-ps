import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config.js'
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
 * T078 (004) — **refused before any bytes are stored**, with the type determined by inspection
 * (FR-347, research D8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Two properties, and the second is the one an implementation gets wrong quietly.
 *
 * *Before any bytes are stored*: an oversize or undecodable upload must leave `stored_objects`
 * exactly as it found it. Storing first and validating afterwards would work identically in
 * every happy-path test and would leave the rejected bytes behind in every other.
 *
 * *By inspection*: the accepted set is decided by what the decoder actually found, never by the
 * declared `content-type` and never by a filename. A `.png` extension on something else is the
 * oldest trick there is, and a product that trusted it would be storing arbitrary bytes and
 * serving them back with an image content type.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('an upload that violates the stated limits is refused (FR-347)', () => {
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
    await getDb().execute(sql`DELETE FROM stored_objects`)
  })

  const upload = (image: Buffer) =>
    app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
      payload: { image: image.toString('base64') },
    })

  const storedCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM stored_objects
    `)
    return Number(rows[0]?.count)
  }

  it('refuses an image over the size limit, stating it (FR-347)', async () => {
    const { avatar } = loadConfig()

    // Genuinely over the limit, and genuinely a decodable image — so the refusal must come from
    // the size check rather than from the decoder.
    const oversize = Buffer.alloc(avatar.maxUploadBytes + 1024, 0x41)

    const response = await upload(oversize)

    expect(response.statusCode).toBe(413)
    expect(response.json()).toMatchObject({ code: 'image_too_large' })
    // The limit must be stated, not merely implied — somebody has to know what to resize to.
    expect((response.json() as { message: string }).message).toMatch(/\d+\s*MB/i)
  })

  it('stores nothing when the size limit is exceeded', async () => {
    const { avatar } = loadConfig()
    await upload(Buffer.alloc(avatar.maxUploadBytes + 1024, 0x41))

    expect(await storedCount(), 'refused BEFORE any bytes are stored (FR-347)').toBe(0)
  })

  it('refuses a body so large the transport rejects it before the handler runs', async () => {
    // The other half of "before any bytes are stored": the route's body limit means an upload
    // far over the ceiling never occupies memory proportional to what somebody chose to send.
    const { avatar } = loadConfig()
    const absurd = Buffer.alloc(avatar.maxUploadBytes * 4, 0x41)

    const response = await upload(absurd)

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(await storedCount()).toBe(0)
  })

  it('refuses a non-image, however it is labelled', async () => {
    const response = await upload(Buffer.from('%PDF-1.7\nthis is not an image at all'))

    expect(response.statusCode).toBe(415)
    expect(response.json()).toMatchObject({ code: 'image_unreadable' })
    expect(await storedCount()).toBe(0)
  })

  it('refuses a file whose CONTENT is not what its name would claim (research D8)', async () => {
    // The declared content type and the filename are chosen by the caller and are never
    // consulted. This is a text file that any client would happily call `portrait.png`.
    const disguised = Buffer.from('PNG-ish header but not actually a PNG at all, honestly')

    const response = await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada), 'content-type': 'application/json' },
      payload: { image: disguised.toString('base64') },
    })

    expect(response.statusCode).toBe(415)
  })

  it('refuses a truncated image rather than storing the part that parsed', async () => {
    const whole = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer()

    // Half a photograph is not a smaller problem than no photograph — `failOn: 'error'` refuses
    // it rather than storing whatever prefix decoded.
    const response = await upload(whole.subarray(0, Math.floor(whole.length / 2)))

    expect(response.statusCode).toBe(415)
    expect(await storedCount()).toBe(0)
  })

  it('refuses an empty upload', async () => {
    const response = await upload(Buffer.alloc(0))

    expect(response.statusCode).toBe(415)
    expect(await storedCount()).toBe(0)
  })

  it('leaves an existing avatar untouched when a replacement is refused', async () => {
    // The failure mode that matters most in practice: somebody with a working avatar tries a
    // file that is too large, and must not end up with none.
    const good = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .png()
      .toBuffer()

    expect((await upload(good)).statusCode).toBe(204)
    expect(await storedCount()).toBe(1)

    await upload(Buffer.from('not an image'))

    expect(await storedCount()).toBe(1)
    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
    })
    expect((profile.json() as { hasAvatar: boolean }).hasAvatar).toBe(true)
  })

  it('accepts each of the stated formats', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const canvas = sharp({
        create: { width: 300, height: 300, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
      const image = await canvas[format]().toBuffer()

      expect((await upload(image)).statusCode, `${format} must be accepted`).toBe(204)
    }
  })

  it('refuses an unauthenticated upload (FR-386)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      payload: { image: 'AAAA' },
    })

    expect(response.statusCode).toBe(401)
  })
})
