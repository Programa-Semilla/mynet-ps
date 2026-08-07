import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { assembleExport, deleteAccount } from '../../src/db/queries/account.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { DbStorageService } from '../../src/storage/db-adapter.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T080 (004) — **the avatar is attendee personal data for every purpose** (FR-353).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * FR-353 says the avatar is treated as personal data "for the purposes of FR-364–FR-379",
 * which is to say **both deleted with the account and present in the export**. It is the one
 * piece of attendee data that lives outside the database, so it is also the one piece that a
 * cascade cannot reach and a `SELECT *` cannot find — which is exactly why it needs asserting
 * from both ends rather than being assumed to follow the profile.
 *
 * These assertions drive `assembleExport` and `deleteAccount` **directly**, because the routes
 * that expose them arrive in later phases (US6 and US7). That is deliberate rather than a
 * shortcut: the requirement is about what happens to the bytes, and the query layer is where
 * that is decided. `export.test.ts` and `account-deletion*.test.ts` assert the same properties
 * through the routes once those exist.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the avatar is deleted with the account and present in the export (FR-353)', () => {
  let app: FastifyInstance
  let token: string
  let attendeeId: string

  const EMAIL = 'has-a-face@example.com'
  const storage = new DbStorageService()

  beforeAll(async () => {
    app = await setupTestApp()
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
      payload: {
        email: EMAIL,
        displayName: 'Has A Face',
        password: 'correct-horse-battery-staple',
      },
    })
    token = sessionCookieFrom(created) as string

    const rows = await getDb()
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.email, EMAIL))
    attendeeId = rows[0]?.id as string

    const image = await sharp({
      create: { width: 500, height: 500, channels: 3, background: { r: 70, g: 130, b: 180 } },
    })
      .png()
      .toBuffer()

    await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
      payload: { image: image.toString('base64') },
    })
  })

  const storedCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM stored_objects WHERE key LIKE ${`%${attendeeId}`}
    `)
    return Number(rows[0]?.count)
  }

  it('appears in the export as embedded bytes, not as a link (research D11)', async () => {
    const exported = await assembleExport(attendeeId, storage)

    expect(exported?.avatar).toBeDefined()
    expect(exported?.avatar?.contentType).toBe('image/webp')
    expect(exported?.avatar?.base64.length ?? 0).toBeGreaterThan(100)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Embedded rather than referenced, so the export **stands alone**. A URL would make the
    // document a pointer into a system the attendee may have asked to be deleted from thirty
    // seconds later — a file that describes their data by telling them where it used to be.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(JSON.stringify(exported?.avatar)).not.toMatch(/https?:\/\//)

    // …and the bytes are genuinely an image, not a placeholder that happens to be base64.
    const decoded = Buffer.from(exported?.avatar?.base64 as string, 'base64')
    expect((await sharp(decoded).metadata()).format).toBe('webp')
  })

  it('is absent from the export of an attendee who has none', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
    })

    const exported = await assembleExport(attendeeId, storage)
    expect(
      exported?.avatar,
      'null rather than an empty object — "no avatar" has one shape',
    ).toBeNull()
  })

  it('goes with the account when it is deleted (FR-366)', async () => {
    expect(await storedCount(), 'the fixture must have an avatar to delete').toBe(1)

    await deleteAccount(attendeeId, storage)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **No foreign key reaches these bytes**, by design (research D3): the adapter is a
    // key-value store and the production adapter is a bucket that cannot have one. So this is
    // not the cascade working — it is the application removing the object explicitly, which is
    // the single case FR-370's structural guard exists to catch.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(await storedCount()).toBe(0)

    const remaining = await getDb()
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.id, attendeeId))
    expect(remaining).toHaveLength(0)
  })

  it('succeeds when the attendee never uploaded one', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
    })

    // `StorageService.delete` is idempotent precisely so the deletion path needs no branch for
    // an attendee with no avatar — and so a row whose key was somehow lost still has its bytes
    // removed.
    await expect(deleteAccount(attendeeId, storage)).resolves.toBe(true)
    expect(await storedCount()).toBe(0)
  })
})
