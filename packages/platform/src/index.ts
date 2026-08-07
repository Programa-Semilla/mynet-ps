/**
 * Device capability interfaces and the injected registry (constitution Principle V).
 *
 * Feature code imports from here and never from a browser API directly —
 * `mynet/no-direct-platform-access` counts the violations, and SC-008 requires zero.
 */
export type { CachedEntry, LocalCache } from './interfaces/local-cache.js'

export type {
  CalendarService,
  CameraService,
  ConnectivityService,
  ContactShareService,
  DeviceServices,
  NotificationService,
  SecureStorage,
} from './interfaces/index.js'

export { PlatformProvider, PlatformContext } from './registry.js'
export type { ConferenceContent, PlatformServices, PlatformProviderProps } from './registry.js'

export {
  useActiveEventRepository,
  useAttendeeRepository,
  useAuthGateway,
  useCalendar,
  useCamera,
  useCatalogRepository,
  useConnectivity,
  useContactShare,
  useEventsRepository,
  useFreshness,
  useIdentityRepository,
  useNotifications,
  useProfileRepository,
  useSavedSessionRepository,
  useSecureStorage,
  useSessionNotesRepository,
} from './hooks.js'
