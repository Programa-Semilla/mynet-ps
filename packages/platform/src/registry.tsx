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
