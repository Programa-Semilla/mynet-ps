/**
 * Device capability interfaces and the injected registry (constitution Principle V).
 *
 * Feature code imports from here and never from a browser API directly —
 * `mynet/no-direct-platform-access` counts the violations, and SC-008 requires zero.
 */
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
export type { PlatformServices, PlatformProviderProps } from './registry.js'

export {
  useAttendeeRepository,
  useCalendar,
  useCamera,
  useConnectivity,
  useContactShare,
  useEventsRepository,
  useNotifications,
  useSecureStorage,
} from './hooks.js'
