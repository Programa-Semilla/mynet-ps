import { useContext, useEffect, useState } from 'react'

import type {
  CalendarService,
  CameraService,
  ConnectivityService,
  ContactShareService,
  NotificationService,
  SecureStorage,
} from './interfaces/index.js'
import { PlatformContext, type PlatformServices } from './registry.js'

/**
 * T041 — typed consumer hooks.
 *
 * Feature code uses these and **never** touches the context object directly (FR-045). That
 * indirection is what lets the registry's shape change later without editing components, and
 * it is why `usePlatform` is not exported.
 */

const usePlatform = (): PlatformServices => {
  const services = useContext(PlatformContext)
  if (!services) {
    throw new Error(
      'No PlatformProvider found. Wrap the application root in <PlatformProvider services={…}>. ' +
        'Feature code reaches devices and data only through the registry (constitution Principle V).',
    )
  }
  return services
}

export const useNotifications = (): NotificationService => usePlatform().devices.notifications
export const useCalendar = (): CalendarService => usePlatform().devices.calendar
export const useCamera = (): CameraService => usePlatform().devices.camera
export const useContactShare = (): ContactShareService => usePlatform().devices.contactShare
export const useSecureStorage = (): SecureStorage => usePlatform().devices.secureStorage

export const useAttendeeRepository = (): PlatformServices['repositories']['attendee'] =>
  usePlatform().repositories.attendee

export const useEventsRepository = (): PlatformServices['repositories']['events'] =>
  usePlatform().repositories.events

export const useActiveEventRepository = (): PlatformServices['repositories']['activeEvent'] =>
  usePlatform().repositories.activeEvent

export const useCatalogRepository = (): PlatformServices['repositories']['catalog'] =>
  usePlatform().repositories.catalog

/**
 * 005 — the attendee's own agenda.
 *
 * Two hooks rather than one, matching the two interfaces, because saving and noting are
 * independent capabilities (FR-207) and a surface that only notes should not be handed the
 * ability to save.
 */
export const useSavedSessionRepository = (): PlatformServices['repositories']['savedSessions'] =>
  usePlatform().repositories.savedSessions

export const useSessionNotesRepository = (): PlatformServices['repositories']['sessionNotes'] =>
  usePlatform().repositories.sessionNotes

/**
 * 004 — becoming an attendee, recovering an account, and leaving.
 *
 * Two hooks rather than one, matching the two interfaces, for the reason the agenda pair
 * records: a surface that only edits a profile should not also be handed the ability to delete
 * the account. `ProfileEdit` reaches for `useProfileRepository`; only `Account` reaches for
 * `useIdentityRepository`.
 */
export const useIdentityRepository = (): PlatformServices['repositories']['identity'] =>
  usePlatform().repositories.identity

export const useProfileRepository = (): PlatformServices['repositories']['profile'] =>
  usePlatform().repositories.profile

/**
 * 006 — the Discover directory: co-attendees at the active conference.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **One hook, because it is one subject.** The pairs above exist where two capabilities are
 * genuinely independent — saving is not noting, editing a profile is not deleting an account.
 * Listing the directory and opening one of its entries are the same capability at two
 * granularities, and a surface holding one has no reason to be denied the other.
 *
 * **`registry.tsx` needed no edit for this.** T009 replaced its hand-mirrored repository
 * declarations with `@mynet/data`'s own `Repositories`, so a new domain is added to that
 * aggregate and reaches this package by inference — which is exactly the property FR-496 was
 * asking for, demonstrated by the first feature to add a repository after it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const useDirectoryRepository = (): PlatformServices['repositories']['directory'] =>
  usePlatform().repositories.directory

/**
 * 005 — when the content on screen was retrieved, or `null` when it is live (FR-216).
 *
 * A component calls this to render the staleness stamp. It learns nothing about caching from
 * the answer: `null` means "current", a timestamp means "this is what your device last
 * received".
 */
export const useFreshness = (): PlatformServices['freshness'] => usePlatform().freshness

export const useAuthGateway = (): PlatformServices['auth'] => usePlatform().auth

/**
 * Live connectivity state (FR-054).
 *
 * Returns the current value and re-renders on change, rather than handing back the service —
 * connectivity is the one capability whose *value* the UI reacts to, and making every caller
 * wire up its own subscription would guarantee that some caller forgets to unsubscribe.
 */
export const useConnectivity = (): boolean => {
  const connectivity: ConnectivityService = usePlatform().devices.connectivity
  const [online, setOnline] = useState(() => connectivity.isOnline())

  useEffect(() => {
    // Re-read on mount: the value may have changed between the initial render and the
    // subscription being attached.
    setOnline(connectivity.isOnline())
    return connectivity.subscribe(setOnline)
  }, [connectivity])

  return online
}
