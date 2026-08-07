/**
 * The storage the caching decorator writes to, described **structurally** (005).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **This is deliberately not an import of `LocalCache` from `@mynet/platform`.**
 *
 * `@mynet/data` and `@mynet/platform` are both leaves: neither depends on the other, and the
 * application root is the only module that knows about both. That is the same rule
 * `PlatformServices` follows when it types the repositories structurally rather than importing
 * them from here — stated in `packages/platform/src/registry.tsx` and enforced by the
 * dependency graph rather than by convention.
 *
 * The cost is one interface declared in two places. The alternative is a cycle between the two
 * packages, or a third package existing solely to hold six lines. The web implementation
 * satisfies this shape structurally, and the composition root is where the two meet — so if
 * they ever diverged, `apps/web/src/app/services.ts` would stop compiling, which is exactly
 * where a mismatch should surface.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A cached payload and the moment it was retrieved from the server. */
export interface CachedEntry<T> {
  readonly payload: T
  /** ISO-8601. Feeds both the staleness stamp (FR-216) and the age limit (FR-221). */
  readonly retrievedAt: string
}

export interface LocalCache {
  /** The entry stored under this key, or `null` for a miss — including a failed read. */
  read<T>(key: string): Promise<CachedEntry<T> | null>
  /** Stores a payload, stamped with the moment of retrieval. */
  write<T>(key: string, payload: T): Promise<void>
  /** Removes every entry whose key begins with this prefix. */
  purge(keyPrefix: string): Promise<void>
}
