import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { DbStorageService } from '../../src/storage/db-adapter.js'
import { avatarObjectKey, type StorageService } from '../../src/storage/service.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T081 (004) — `StorageService` round-trips, against the interface (FR-352).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **PLACED IN THE INTEGRATION LAYER RATHER THAN THE UNIT LAYER, DELIBERATELY.**
 *
 * tasks.md files this as `tests/unit/storage-adapter.test.ts`. The unit project is hermetic by
 * design — `packages/config/vitest.base.ts` gives it a `DATABASE_URL` that points at nothing,
 * precisely so a unit test cannot reach a database. The only thing this could assert there is
 * that a *mock* of the adapter behaves like the mock, which asserts nothing about the adapter.
 *
 * The adapter's whole purpose is to store bytes durably somewhere that survives a container
 * restart (research D3), and that claim is only checkable against a real store. So it is here,
 * where `test-integration` runs it against a real PostgreSQL instance in CI.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Typed as the interface, not as the class.** Every assertion below is one the production
 * adapter (register entry 11) will have to satisfy too, so writing them against `StorageService`
 * makes this file the contract that adapter is checked against rather than a test of one
 * implementation's internals.
 */
describe('StorageService — the contract every adapter must satisfy (FR-352)', () => {
  let app: FastifyInstance
  const storage: StorageService = new DbStorageService()

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await getDb().execute(sql`DELETE FROM stored_objects`)
  })

  const KEY = 'avatars/round-trip'

  it('returns exactly the bytes it was given', async () => {
    // Every byte value, so a text-encoding round trip anywhere in the adapter would corrupt it
    // visibly rather than only for unusual images.
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i))

    await storage.put(KEY, bytes, 'image/webp')
    const read = await storage.get(KEY)

    expect(read?.bytes.equals(bytes)).toBe(true)
    expect(read?.contentType).toBe('image/webp')
  })

  it('returns null for a key that was never written — absence is an answer, not a fault', async () => {
    // The ordinary state of a new account. A throw here would make every caller handle an
    // exception for "this person has no photograph yet".
    expect(await storage.get('avatars/nobody')).toBeNull()
  })

  it('replaces on put, so there is never a second copy under one key (FR-350)', async () => {
    await storage.put(KEY, Buffer.from('first'), 'image/webp')
    await storage.put(KEY, Buffer.from('second'), 'image/png')

    const read = await storage.get(KEY)
    expect(read?.bytes.toString()).toBe('second')
    expect(read?.contentType, 'the content type is replaced along with the bytes').toBe('image/png')

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM stored_objects WHERE key = ${KEY}
    `)
    expect(rows[0]?.count).toBe('1')
  })

  it('deletes, and reports absence afterwards', async () => {
    await storage.put(KEY, Buffer.from('here'), 'image/webp')
    await storage.delete(KEY)

    expect(await storage.get(KEY)).toBeNull()
  })

  it('is idempotent on delete — removing nothing succeeds', async () => {
    // The account-deletion path deletes unconditionally, so an attendee who never uploaded
    // anything must not make the whole operation fail on its first step (research D10).
    await expect(storage.delete('avatars/never-existed')).resolves.toBeUndefined()
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    await storage.delete(KEY)
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
  })

  it('keeps keys independent — deleting one leaves the others', async () => {
    await storage.put('avatars/a', Buffer.from('a'), 'image/webp')
    await storage.put('avatars/b', Buffer.from('b'), 'image/webp')

    await storage.delete('avatars/a')

    expect(await storage.get('avatars/a')).toBeNull()
    expect((await storage.get('avatars/b'))?.bytes.toString()).toBe('b')
  })

  it('survives arbitrary binary content, including embedded nulls', async () => {
    const bytes = Buffer.from([0x00, 0xff, 0x00, 0x1a, 0x00, 0x7f])

    await storage.put(KEY, bytes, 'application/octet-stream')

    expect((await storage.get(KEY))?.bytes.equals(bytes)).toBe(true)
  })

  it('derives one key per attendee, so the avatar path cannot collide', async () => {
    // Exported from the port rather than built at each call site, because both the profile
    // route and the deletion path construct it and they must not be able to disagree.
    expect(avatarObjectKey('abc')).toBe('avatars/abc')
    expect(avatarObjectKey('abc')).toBe(avatarObjectKey('abc'))
    expect(avatarObjectKey('abc')).not.toBe(avatarObjectKey('abd'))
  })
})
