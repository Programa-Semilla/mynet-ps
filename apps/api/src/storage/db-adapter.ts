import { eq } from 'drizzle-orm'

import { getDb } from '../db/client.js'
import { storedObjects } from '../db/schema/stored-objects.js'
import type { StorageService, StoredBytes } from './service.js'

/**
 * T016 (004) — the development, test and preview implementation of `StorageService`
 * (FR-352, research D3).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **It needs no provisioning at all, which is the requirement rather than a convenience.**
 * FR-352 asks for an implementation that works in development, test and preview with nothing
 * external configured — because register entry 11 has not chosen an object-storage provider,
 * and a feature that could not be built or tested until it was would be blocked on an answer
 * nobody has.
 *
 * **Database-backed rather than filesystem-backed**, and that choice was made against a real
 * failure mode rather than on taste: Fly machines have ephemeral disks and preview environments
 * are recreated per pull request, so a filesystem adapter would appear to work locally and then
 * lose every avatar the first time a container restarted. The database is the one durable thing
 * these environments already have.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **This is the only module permitted to touch `stored_objects`.** The lint rule registered in
 * `packages/config/eslint.config.js` keeps storage-vendor imports out of everything except
 * `apps/api/src/storage/`, and the production adapter (entry 11) will replace this file behind
 * the same three methods without any caller changing.
 */
export class DbStorageService implements StorageService {
  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    // Upsert, so replacing an avatar is one statement with no window in which the attendee has
    // neither the old bytes nor the new (FR-350).
    await getDb()
      .insert(storedObjects)
      .values({ key, bytes, contentType })
      .onConflictDoUpdate({
        target: storedObjects.key,
        set: { bytes, contentType, createdAt: new Date() },
      })
  }

  async get(key: string): Promise<StoredBytes | null> {
    const rows = await getDb()
      .select({ bytes: storedObjects.bytes, contentType: storedObjects.contentType })
      .from(storedObjects)
      .where(eq(storedObjects.key, key))
      .limit(1)

    const row = rows[0]
    // `null` rather than a throw: "there is no avatar" is the ordinary state of a new account,
    // and the caller renders the fallback (FR-351) rather than handling an exception.
    return row ? { bytes: row.bytes, contentType: row.contentType } : null
  }

  async delete(key: string): Promise<void> {
    // Idempotent by construction — a DELETE matching no row is a success, which is what the
    // account-deletion path needs for an attendee who never uploaded anything.
    await getDb().delete(storedObjects).where(eq(storedObjects.key, key))
  }
}
