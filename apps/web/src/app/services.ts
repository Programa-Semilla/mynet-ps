import {
  attendeePrefix,
  cached,
  createFreshnessRegistry,
  HttpActiveEventRepository,
  HttpAttendeeRepository,
  HttpAuthGateway,
  HttpCatalogRepository,
  HttpClient,
  HttpEventsRepository,
  HttpSavedSessionRepository,
  HttpSessionNotesRepository,
  type CacheScope,
  type LocalCache,
} from '@mynet/data/http'
import type { ConnectivityService, PlatformServices } from '@mynet/platform'
import { webDevices, WebLocalCache } from '@mynet/platform/web'

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

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // T065 (005) — **the cache is wired here and nowhere else** (research D1, Principle V).
  //
  // Every repository below is decorated in place, so no component changes, no card changes, no
  // hook changes, and no test double changes. A component cannot tell a cached repository from
  // an uncached one, which is the whole reason the cache is a decorator rather than something
  // callers opt into.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const store: LocalCache = new WebLocalCache()
  const identity = attendeeIdentity()
  // Written by the decorators as they serve reads, read by the staleness stamp (FR-216).
  const freshness = createFreshnessRegistry()

  // ───────────────────────────────────────────────────────────────────────────────────────
  // **Identity and the active conference are cached too, and they have to be.**
  //
  // FR-215 requires the active conference's programme to be readable with no connection. You
  // cannot read *the active conference's* programme without knowing which conference is active,
  // and you cannot key a per-attendee cache without knowing who the attendee is. Caching the
  // programme alone produced a screen stuck on "Loading your conference…" — the cache was
  // perfectly warm and unreachable, which an end-to-end run found and no component test could.
  //
  // `getCurrent` is cached under the scope's *current* value, which is `anonymous` on the first
  // call of a page load — deliberately, because that is the only value available before
  // identity resolves, and it is therefore also the value a later offline reload will look
  // under. Sign-out purges it explicitly alongside the attendee's own prefix.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const attendee = identity.watching(
    cached(
      new HttpAttendeeRepository(http),
      store,
      identity.scope,
      { getCurrent: 'self' },
      { freshness },
    ),
  )

  // Wrapped by `watching` on the *outside*, so identity is recorded whether the answer came
  // from the server or from the cache. Decorating the other way round would mean a cache hit
  // never told anybody who the attendee was, and every per-attendee key would fall back to
  // `anonymous` exactly when it mattered.
  const activeEvent = cached(
    new HttpActiveEventRepository(http),
    store,
    identity.scope,
    { getActive: 'active-event' },
    { freshness },
  )

  const catalog = cached(
    new HttpCatalogRepository(http),
    store,
    identity.scope,
    {
      // The programme is the read Home makes three times over and Agenda makes a fourth — one
      // cached entry per conference serves all of them (SC-210).
      listSessions: 'programme',
      listTracks: 'tracks',
    },
    { freshness },
  )

  const savedSessions = cached(
    new HttpSavedSessionRepository(http),
    store,
    identity.scope,
    { listSaved: 'saved' },
    { freshness },
  )

  const sessionNotes = cached(
    new HttpSessionNotesRepository(http),
    store,
    identity.scope,
    { listNotes: 'notes' },
    { freshness },
  )

  return {
    devices,
    repositories: {
      // Records who the cache is for, as a side effect of the call that establishes identity.
      attendee,
      // **Not cached, deliberately.** The conference list is what 002's offline spec asserts is
      // absent offline, and 005 does not reverse that: FR-215 names the *active* conference's
      // content and nothing else. Caching a cross-event read behind a per-event key is also the
      // one place the scoping rules would have to be bent.
      events: new HttpEventsRepository(http),
      activeEvent,
      catalog,
      savedSessions,
      sessionNotes,
    },
    freshness: {
      lastRetrieved: (eventId, content) =>
        freshness.lastRetrieved(identity.current(), eventId, content),
    },
    auth: purgingOnSignOut(new HttpAuthGateway(http), store, identity),
  }
}

/**
 * Who the cache is keyed for, learned from the call that establishes identity.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The registry is built once, before anybody has signed in**, so the attendee identifier
 * cannot be a constructor argument. It also must not be pushed in by a component — that would
 * make feature code responsible for cache correctness, which is exactly what Principle V and
 * research D1 place out of its reach.
 *
 * So it is *observed*: `attendee.getCurrent()` is the one call whose whole purpose is to say
 * who is signed in, and wrapping it here means the cache learns the identity at precisely the
 * moment it becomes true, with no component involved and nothing to remember.
 *
 * Until it resolves, the scope reads `anonymous` — a key nothing is ever written under while
 * signed out, because every cached read requires a session that would have answered
 * `getCurrent` first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const attendeeIdentity = () => {
  let attendeeId = 'anonymous'

  return {
    /** Read lazily, because the decorator captures this object rather than a snapshot. */
    scope: {
      get attendeeId(): string {
        return attendeeId
      },
    } satisfies CacheScope,

    current: () => attendeeId,

    forget: () => {
      attendeeId = 'anonymous'
    },

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **Delegates explicitly rather than spreading the repository.**
     *
     * `{ ...repository, getCurrent }` type-checks and happens to work today, and it is a trap:
     * the thing being wrapped is a `Proxy` over a class instance, whose methods live on the
     * prototype and are therefore **not** copied by a spread. It works only because
     * `AttendeeRepository` has exactly one method. The day it gains a second, the spread would
     * silently drop it — at runtime, in the composition root, with a type signature still
     * claiming the whole repository was returned.
     *
     * Typed as the registry's own member shape, so it promises exactly what it delivers.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    watching: (
      repository: PlatformServices['repositories']['attendee'],
    ): PlatformServices['repositories']['attendee'] => ({
      getCurrent: async () => {
        const attendee = (await repository.getCurrent()) as { id?: string } | null
        if (attendee?.id) attendeeId = attendee.id
        return attendee
      },
    }),
  }
}

/**
 * Signing out **purges everything cached for that attendee** (FR-221, research D10).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Without this, a shared device — a phone lent at a conference, a kiosk — would keep the
 * previous attendee's programme, saved set and **notes** on disk after they signed out. The
 * attendee keys would stop them being *served* to the next person, but leaving personal
 * content on a device somebody has just signed out of is a Principle VIII failure regardless
 * of who can read it back.
 *
 * The purge runs **before** the request rather than after, and it runs even if the request
 * fails. An attendee signing out on a flaky connection has still asked to leave; the local
 * copy of their data must not be what survives that.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const purgingOnSignOut = (
  auth: PlatformServices['auth'],
  store: LocalCache,
  identity: { current: () => string; forget: () => void },
): PlatformServices['auth'] => ({
  signIn: (credentials) => auth.signIn(credentials),
  signOut: async () => {
    const attendeeId = identity.current()
    try {
      await store.purge(attendeePrefix(attendeeId))
      // Identity itself is cached before the attendee is known, so it lives under the
      // `anonymous` prefix. Leaving it behind would keep the previous attendee's name and email
      // on a device they have just signed out of.
      await store.purge(attendeePrefix('anonymous'))
    } finally {
      identity.forget()
    }
    await auth.signOut()
  },
})

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
