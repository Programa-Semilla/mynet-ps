import { createContext, type ReactNode } from 'react'

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
 * The repositories are typed structurally rather than imported from `@mynet/data`, so
 * `@mynet/platform` does not depend on `@mynet/data`. Both are leaves; the application root
 * is the only place that knows about both.
 */
/** The conference content a surface can be reading, for the freshness question above. */
export type ConferenceContent = 'programme' | 'tracks' | 'saved' | 'notes'

export interface PlatformServices {
  readonly devices: DeviceServices
  readonly repositories: {
    readonly attendee: { getCurrent(): Promise<unknown> }
    readonly events: { listRegistered(): Promise<unknown[]> }
    /** 002 — the attendee's active conference, recorded or derived (FR-100–FR-104). */
    readonly activeEvent: {
      getActive(): Promise<unknown>
      setActive(eventId: string): Promise<unknown>
    }
    /** 002 — the conference programme, per event and guarded server-side (FR-137-FR-140). */
    readonly catalog: {
      listSessions(eventId: string): Promise<unknown[]>
      listTracks(eventId: string): Promise<unknown[]>
    }
    /**
     * 005 — which sessions the attendee saved, per conference (FR-184–FR-188).
     *
     * Separate from `catalog` because the catalog is read-only in perpetuity and these are
     * attendee state *about* its content (FR-191).
     */
    readonly savedSessions: {
      listSaved(eventId: string): Promise<string[]>
      save(eventId: string, sessionId: string): Promise<void>
      unsave(eventId: string, sessionId: string): Promise<void>
    }
    /** 005 — the attendee's private notes, per conference (FR-207–FR-214). */
    readonly sessionNotes: {
      listNotes(eventId: string): Promise<unknown[]>
      writeNote(eventId: string, sessionId: string, body: string): Promise<unknown>
      deleteNote(eventId: string, sessionId: string): Promise<void>
    }
  }
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
