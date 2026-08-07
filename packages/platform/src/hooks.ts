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
