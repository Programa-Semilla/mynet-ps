import {
  HttpAttendeeRepository,
  HttpAuthGateway,
  HttpClient,
  HttpEventsRepository,
} from '@mynet/data/http'
import type { PlatformServices } from '@mynet/platform'

import { webDevices } from '../platform/webDevices.js'

/**
 * The composition root — the single place that wires interfaces to implementations.
 *
 * This is the only module in `apps/web` permitted to know that HTTP exists, and it does so
 * only by naming the implementations; it still constructs no requests itself. Everything
 * downstream receives `PlatformServices` and sees interfaces (FR-045, research.md D10).
 *
 * Substituting the whole registry here is what makes FR-047's substitutability claim testable
 * in one line rather than eleven.
 */
export const createServices = (): PlatformServices => {
  const devices = webDevices()

  const http = new HttpClient({
    // Only VITE_-prefixed values reach the bundle. Nothing secret may ever carry that prefix
    // — that is the mechanism keeping FR-041 true on the client side.
    baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
    // Connectivity is read through the interface, not from `navigator` directly, so the
    // offline path is substitutable and SC-008 stays at zero.
    isOnline: () => devices.connectivity.isOnline(),
    fetch: globalThis.fetch.bind(globalThis),
  })

  return {
    devices,
    repositories: {
      attendee: new HttpAttendeeRepository(http),
      events: new HttpEventsRepository(http),
    },
    auth: new HttpAuthGateway(http),
  }
}
