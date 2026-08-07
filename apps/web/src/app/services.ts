import {
  HttpActiveEventRepository,
  HttpAttendeeRepository,
  HttpAuthGateway,
  HttpClient,
  HttpEventsRepository,
} from '@mynet/data/http'
import type { ConnectivityService, PlatformServices } from '@mynet/platform'
import { webDevices } from '@mynet/platform/web'

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
    // …and the transport reports back what it observed, which is the only authoritative source
    // of "is MyNet reachable" (FR-054). This one wire is why the offline indicator and the
    // network cannot disagree. It is deliberately made here, at the composition root, and
    // nowhere else: feature code neither knows nor needs to know that the two are connected.
    onReachability: (reachable) => devices.connectivity.reportReachability(reachable),
    fetch: globalThis.fetch.bind(globalThis),
  })

  watchReachability(http, devices.connectivity)

  return {
    devices,
    repositories: {
      attendee: new HttpAttendeeRepository(http),
      events: new HttpEventsRepository(http),
      activeEvent: new HttpActiveEventRepository(http),
    },
    auth: new HttpAuthGateway(http),
  }
}

/** How often to re-test the connection while the server is believed unreachable. */
const PROBE_INTERVAL_MS = 5_000

/**
 * Re-tests the connection while MyNet is believed unreachable, so recovery is discovered rather
 * than waited for (FR-054).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Needed because the browser's `online` event is not a reliable recovery signal. It only fires
 * when `navigator.onLine` *changes*, and that flag reports true throughout an outage that began
 * before the page loaded — so a connection can come back with no event at all, leaving the
 * attendee behind an offline banner until they think to reload.
 *
 * Probing only while offline is the whole design. There is no polling in the normal case: the
 * loop starts when something fails and stops the moment a probe succeeds, so a healthy session
 * makes no requests it did not need.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Lives at the composition root because it is a wire between two collaborators, not a behaviour
 * of either. `ConnectivityService` has no business knowing HTTP exists, and `HttpClient` has no
 * business owning a timer.
 */
const watchReachability = (http: HttpClient, connectivity: ConnectivityService): void => {
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight = false

  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  connectivity.subscribe((online) => {
    if (online) {
      stop()
      return
    }
    if (timer === undefined) {
      timer = setInterval(() => {
        // Guarded against re-entry and gated on visibility. Without the guard, a connection
        // that *hangs* rather than fails accumulates one outstanding probe every interval —
        // a captive portal or a cold start turns ten minutes into a hundred pending requests,
        // exhausting the browser's per-host connection budget so that the attendee's own
        // requests cannot get out. Without the visibility gate, a backgrounded tab spends
        // battery and cellular data on a connection nobody is waiting for.
        if (inFlight || document.visibilityState === 'hidden') return
        inFlight = true
        void http.probe().finally(() => {
          inFlight = false
        })
      }, PROBE_INTERVAL_MS)
    }
  })
}
