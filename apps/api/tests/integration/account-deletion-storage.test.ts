import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { deleteAccount } from '../../src/db/queries/account.js'
import { getDb } from '../../src/db/client.js'
import type { StorageService, StoredBytes } from '../../src/storage/service.js'
import { avatarObjectKey } from '../../src/storage/service.js'
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
 * T102 (004) — **the avatar's bytes, and the order in which they go** (research D10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE IS THE PROOF `tests/unit/deletion-coverage.test.ts` DEMANDS BY NAME.**
 *
 * That guard requires every table it cannot see a cascade for to be either swept or explicitly
 * deleted — and for an explicit-deletion claim to name an integration test that checks it. This
 * is that test, and the guard asserts this file exists: deleting it breaks the build.
 *
 * `stored_objects` is the single member of that category. It holds no foreign key **by design**
 * — a key-value store must not know what its callers put in it, and the production adapter is a
 * bucket that cannot have one — so no cascade reaches avatar bytes and the application must
 * remove them itself.
 *
 * **The ORDER is the interesting part, and it is asserted rather than assumed.** Exactly one of
 * two inconsistencies is available if the operation is interrupted:
 *
 *   - row first  → bytes no row references: unreachable, invisible to any audit, there forever;
 *   - object first → a row pointing at missing bytes: the profile renders its fallback, the
 *     next upload replaces the key, and the inconsistency is both harmless and findable.
 *
 * The second is strictly recoverable and the first is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the avatar goes with the account, and goes first (research D10)', () => {
  let app: FastifyInstance
  let token: string
  let attendeeId: string

  const EMAIL = 'with-a-photograph@example.com'
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
    await getDb().execute(sql`DELETE FROM stored_objects`)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: EMAIL,
        displayName: 'Photographed',
        password: 'correct-horse-battery-staple',
      },
    })
    token = sessionCookieFrom(created) as string

    const rows = await getDb().execute<{ id: string }>(sql`
      SELECT id FROM attendees WHERE email = ${EMAIL}
    `)
    attendeeId = rows[0]?.id as string

    const image = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 44, g: 55, b: 66 } },
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
      SELECT count(*)::text AS count FROM stored_objects
    `)
    return Number(rows[0]?.count)
  }

  it('has bytes to delete before it starts — otherwise this proves nothing', async () => {
    // TWO since 006: the 512px profile rendition and the 96px card rendition the directory
    // embeds (FR-457). The count matters here — the point of this assertion is that the
    // deletion test below has something to delete, and a deletion path that removed only one
    // of the two would pass a "zero remain" check written against a single rendition.
    expect(await storedCount(), 'both renditions exist before deletion (FR-460, SC-408)').toBe(2)
  })

  it('removes the stored object when the account is deleted (FR-366)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(token) },
    })
    expect(response.statusCode).toBe(204)

    expect(
      await storedCount(),
      'No foreign key reaches these bytes, so the cascade cannot take them. If this fails, ' +
        'every deleted account leaves its photograph behind, unreachable and undetectable.',
    ).toBe(0)
  })

  it('deletes the OBJECT FIRST, so a failure cannot orphan the bytes', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The order asserted directly, by making the row deletion fail after the object deletion
    // has already happened. A storage adapter that recorded when it was called lets this check
    // sequence rather than outcome — which is the only way to tell a correct implementation
    // from one that happens to work when nothing goes wrong.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const calls: string[] = []

    const observing: StorageService = {
      // 006 widened the port with a batched read (FR-456). Delegates, so this double keeps
      // observing exactly what it observed before.
      getMany: async (keys) => storage.getMany(keys),
      async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
        calls.push('put')
        return storage.put(key, bytes, contentType)
      },
      async get(key: string): Promise<StoredBytes | null> {
        calls.push('get')
        return storage.get(key)
      },
      async delete(key: string): Promise<void> {
        calls.push('delete')
        // Deliberately deletes for real, then records the count so the assertion below can
        // prove the row still existed at this moment.
        await storage.delete(key)
        const rows = await getDb().execute<{ count: string }>(sql`
          SELECT count(*)::text AS count FROM attendees WHERE id = ${attendeeId}::uuid
        `)
        calls.push(`row-still-present:${rows[0]?.count}`)
      },
    }

    await deleteAccount(attendeeId, observing)

    expect(calls[0]).toBe('delete')
    expect(
      calls[1],
      'The attendee row must still exist at the moment the object is removed. If it does not, ' +
        'the order is reversed and an interrupted deletion leaves bytes nothing references.',
    ).toBe('row-still-present:1')

    expect(await storedCount()).toBe(0)
  })

  it('leaves the recoverable inconsistency, not the unrecoverable one', async () => {
    // Simulating the interruption: the object is gone and the row is not. The profile must
    // render its fallback rather than failing, which is what makes this state harmless.
    await storage.delete(avatarObjectKey(attendeeId))

    const served = await app.inject({
      method: 'GET',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
    })
    expect(served.statusCode).toBe(204)

    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(token) },
    })
    expect(profile.statusCode).toBe(200)
  })

  it('succeeds for an attendee who never uploaded a photograph', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
    })

    // `StorageService.delete` is idempotent precisely so the deletion path needs no branch here
    // — a branch is a thing that can be got wrong, and this one would be got wrong silently.
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(token) },
    })
    expect(response.statusCode).toBe(204)
  })

  it("leaves nobody else's bytes behind or removed", async () => {
    await storage.put('avatars/somebody-else', Buffer.from('not yours'), 'image/webp')

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(token) },
    })

    expect((await storage.get('avatars/somebody-else'))?.bytes.toString()).toBe('not yours')
  })
})
