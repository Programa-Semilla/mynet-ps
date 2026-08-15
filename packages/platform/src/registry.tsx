import { createContext, type ReactNode } from 'react'

import type { Repositories } from '@mynet/data'

import type { DeviceServices } from './interfaces/index.js'

/**
 * T040 — one injected registry (research.md D10).
 *
 * `PlatformServices` holds every device capability and every repository. It is provided once
 * at the application root and consumed through the typed hooks in `hooks.ts`.
 *
 * **One provider, not eleven nested ones.** A test substitutes the whole registry in a single
 * line, which is exactly what FR-047 and User Story 5's independent test require — eleven
 * nested providers would mean eleven substitutions per test, and the substitutability claim
 * would be technically true and practically unusable.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T009 (006) — THE REPOSITORIES ARE THE REAL INTERFACES NOW, NOT A STRUCTURAL MIRROR OF
 * THEM** (FR-496, FR-497, research D10).
 *
 * This block used to declare every repository method by hand as `Promise<unknown>`, with a
 * comment explaining that the mirroring existed "so `@mynet/platform` does not depend on
 * `@mynet/data`. Both are leaves." That reasoning was about the **runtime** dependency graph,
 * and `import type` is erased entirely at build time — so a `devDependency` plus a type-only
 * import preserves exactly the property the comment was protecting.
 *
 * What the mirroring cost was **fifteen unchecked casts across eleven files**: every consumer
 * of a repository hook wrote `(await repository.getOwn()) as OwnProfile` to recover the type
 * this file had just discarded. Each one was a place where a genuine contract change would
 * type-check and fail at runtime. `apps/web/tests/unit/repository-casts.test.ts` now asserts
 * that none returns (SC-414).
 *
 * FR-497 required this before 006's own repository work, so that the directory repository is
 * added to a registry that already carries real types rather than adding four more casts and
 * then deleting them.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
/** The conference content a surface can be reading, for the freshness question above. */
// 008 — `appointments` appended. It is the fifth cacheable resource and the first this product
// caches that is *about other people as well as the reader*, which is why the composition root
// argues the decision per member: appointments are cached because they are the attendee's own
// commitments at one conference, while contacts are refused because resolving one reads somebody
// else's live profile (FR-647, FR-648).
export type ConferenceContent = 'programme' | 'tracks' | 'saved' | 'notes' | 'appointments'

export interface PlatformServices {
  readonly devices: DeviceServices
  /**
   * Every repository, as its own interface declares it (FR-496).
   *
   * `Repositories` is `@mynet/data`'s own aggregate — the one declaration that stays in its
   * barrel because it is the aggregate *of* the domains rather than a member of any one. A
   * feature adding a domain adds it there, and this file needs no edit at all.
   *
   * **`import type` only.** Nothing here survives to runtime, so `@mynet/platform` still emits
   * no `require` or `import` of `@mynet/data` and the two packages remain independent where
   * that independence is actually observable.
   */
  readonly repositories: Repositories
  /**
   * 005 — **when the content currently on screen was retrieved** (FR-216, SC-204).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Not a repository: it reads no domain data. It exists because a surface served from the
   * cache must say when its content was last retrieved, and that is not answerable from the
   * payload — a cached programme and a live one are the same array.
   *
   * Expressed in domain terms deliberately. A component asks "when did this device last
   * receive this conference's programme"; it does not ask about a cache, a store, or a key,
   * and it returns `null` whenever the content is live. That is what keeps Principle V intact
   * while still satisfying FR-216.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  readonly freshness: {
    lastRetrieved(eventId: string, content: ConferenceContent): string | null
  }
  /**
   * Session lifecycle. Not a repository — it changes session state rather than reading domain
   * data — but it lives in the registry for the same reason: feature code must not know that
   * HTTP exists, and a test must be able to substitute it in the same single line.
   */
  readonly auth: {
    signIn(credentials: { email: string; password: string }): Promise<void>
    signOut(): Promise<void>
  }
}

/**
 * No default value. A missing provider must fail loudly at the first hook call rather than
 * silently handing out a no-op registry — a no-op default would let the application render a
 * plausible empty workspace while nothing was wired up, which FR-058 explicitly forbids
 * ("a failure must never render as an empty success").
 */
export const PlatformContext = createContext<PlatformServices | null>(null)

export interface PlatformProviderProps {
  readonly services: PlatformServices
  readonly children: ReactNode
}

/** The single root provider. */
export const PlatformProvider = ({ services, children }: PlatformProviderProps) => (
  <PlatformContext.Provider value={services}>{children}</PlatformContext.Provider>
)
