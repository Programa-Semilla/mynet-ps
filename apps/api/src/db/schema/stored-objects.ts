import { customType, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * T010 (004) — the development, test and preview backing store for `StorageService`
 * (FR-352, research D3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TABLE IS AN IMPLEMENTATION DETAIL OF ONE ADAPTER, NOT A DOMAIN TABLE.**
 *
 * Only `storage/db-adapter.ts` may read or write it. The production adapter (register entry
 * 11) replaces it with a bucket behind the same three methods and this table simply stops
 * being used — which is the whole point of FR-352, and the reason avatar bytes are not a
 * `bytea` column on the profile row instead.
 *
 * **Database-backed rather than filesystem-backed**, deliberately. A filesystem adapter would
 * appear to work and then lose every avatar: Fly machines have ephemeral disks and preview
 * environments are recreated per pull request. This needs no provisioning at all, which is
 * exactly what FR-352 demands of the non-production implementation.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO FOREIGN KEY TO `attendees`, AND ITS ABSENCE IS THE DESIGN** (research D3, D10).
 *
 * A key-value store must not know what its callers store in it. A foreign key here would make
 * the abstraction a lie — the production adapter cannot have one, so the dev adapter enforcing
 * a relationship the real one does not would let code depend on a guarantee that disappears at
 * deployment.
 *
 * The consequence is stated rather than left to be discovered: **these rows are the one piece
 * of attendee personal data no cascade reaches.** Deletion removes the object explicitly, and
 * removes it *before* the attendee row, so a mid-operation failure orphans a row pointing at
 * missing bytes rather than bytes no row references. **This single case is why FR-370's
 * structural guard is a requirement rather than a note**, and the guard's allow-list names
 * this table with that reasoning attached.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Scoping: neither per-event nor cross-event, because it holds no attendee data as far as
 * the schema is concerned** — it holds opaque bytes under opaque keys. The scoping rule
 * belongs to `attendees.avatar_object_key`, which is the column that knows whose bytes these
 * are, and which declares itself cross-event.
 */

/**
 * `bytea`. Declared here rather than imported because Drizzle's pg-core has no first-class
 * binary column, and the driver hands back a `Uint8Array` which every caller wants as a
 * `Buffer` — converting at the column keeps that off five call sites.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
  fromDriver(value: Buffer): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as unknown as Uint8Array)
  },
})

export const storedObjects = pgTable('stored_objects', {
  /**
   * Opaque to this table. **`storage/service.ts` decides what a key means** — `avatarObjectKey`
   * is the sole constructor, which is what keeps the profile route and the deletion path from
   * disagreeing about where an attendee's avatar lives.
   *
   * (`images/avatar.ts` neither builds nor reads a key; it only turns bytes into other bytes.)
   */
  key: text('key').primaryKey(),

  /**
   * Served back on read, so the adapter does not have to infer a type from the bytes and the
   * caller does not have to remember what it stored.
   */
  contentType: text('content_type').notNull(),

  bytes: bytea('bytes').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type StoredObject = typeof storedObjects.$inferSelect
