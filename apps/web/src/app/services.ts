import {
  attendeePrefix,
  cached,
  conferencePrefix,
  createFreshnessRegistry,
  HttpActiveEventRepository,
  HttpAppointmentRepository,
  HttpAttendeeRepository,
  HttpAuthGateway,
  HttpBlockRepository,
  HttpCardRepository,
  HttpCatalogRepository,
  HttpClient,
  HttpConversationRepository,
  HttpDirectoryRepository,
  HttpEventsRepository,
  HttpIdentityRepository,
  HttpMessageRepository,
  HttpProfileRepository,
  HttpPushSubscriptionRepository,
  HttpQuestionsRepository,
  HttpReportRepository,
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
  const devices = webDevices({
    // 007 (T117, FR-041) — the **public** half of the VAPID pair, and the only half that may ever
    // reach a browser. The private key is read by the API and appears in no client module.
    //
    // Read here rather than in the capability, for the same reason the API base URL is: the
    // composition root owns configuration. A capability reading its own environment would be a
    // second place environment handling lives, and the one that drifted would silently decide
    // whether notifications work at all.
    //
    // **Absent is a supported state** (register entry 20): with no key `isSupported()` is false,
    // no permission is ever requested, and the product behaves exactly as it does for somebody
    // who declined — which FR-552 already requires to be a complete product.
    //
    // 010 T059 — FR-853. **One name, shared with the API.** This was
    // `import.meta.env['VITE_PUSH_VAPID_PUBLIC_KEY']`, a second spelling of the value the API
    // reads as `PUSH_VAPID_PUBLIC_KEY`, with nothing checking they matched. A public key from one
    // pair and a private key from another gives a push service that rejects every delivery with
    // a 403 while the product looks like it is working. See `vite.config.ts` for the substitution.
    // `exactOptionalPropertyTypes` is on, so the property is omitted rather than set to
    // `undefined` — absent means absent, which is the state FR-552 makes a complete product.
    ...(__VAPID_PUBLIC_KEY__ ? { vapidPublicKey: __VAPID_PUBLIC_KEY__ } : {}),
  })

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

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // T037 (008) — **appointments ARE cached, under the key that already exists** (FR-647).
  //
  // The decorator is keyed `(attendeeId, eventId, resource)`. Appointments are per-event and are
  // the attendee's **own commitments**, so that key fits them exactly as it fits saved sessions —
  // no new key shape, no widening of the cache contract.
  //
  // Only `list` is cached. `slots` is deliberately left live: an offered set that had gone stale
  // would invite a proposal for a slot the reader has since filled, and the refusal would arrive
  // after the attendee had typed a topic. Every **write** below passes straight through, because
  // `cached` only intercepts the methods named here — writes are refused offline and never
  // queued (FR-649), which needs no new mechanism.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const appointments = cached(
    new HttpAppointmentRepository(http),
    store,
    identity.scope,
    { list: 'appointments' },
    {
      freshness,
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **`slots` is a READ that must stay live, and saying so is not optional.**
      //
      // Omitting it from `reads` was the obvious way to keep it uncached and was silently
      // destructive: the decorator classifies anything unnamed as a **write**, and a write
      // purges the whole conference prefix on success. Opening the scheduling dialog therefore
      // wiped the cached programme, tracks, saved sessions, notes and appointments — FR-215 and
      // FR-647 both broken, with the loss only visible on the next disconnection.
      //
      // `passThrough` exists for exactly this: not served from the cache, not written to it, and
      // not purging anything.
      // ─────────────────────────────────────────────────────────────────────────────────────
      passThrough: ['slots'],
    },
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
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 004 — **deliberately NOT decorated with `cached`**, and the absence is a declaration
      // rather than an omission (spec, Offline behaviour).
      //
      // Nothing this feature stores is readable offline. The profile is small, it is only
      // meaningful when editable, and caching it would put a second copy of personal data on
      // the device in exchange for no offline capability worth having. Every write here — sign
      // up, join, save, upload, export, delete — is refused offline and **never queued**,
      // which is 005's rule unchanged.
      // ─────────────────────────────────────────────────────────────────────────────────────
      identity: purgingIdentity(new HttpIdentityRepository(http), store, identity),
      profile: new HttpProfileRepository(http),
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 006 — **NOT decorated with `cached`, and this one is a requirement rather than a
      // judgement** (FR-466, FR-468, SC-409).
      //
      // The specification states that no directory content is readable offline, and says why:
      // a cached directory is a copy of other people's personal data sitting on this device,
      // ageing, after they may have turned discoverability off. 005's decorator revokes on age
      // alone, which is the wrong clock entirely for a visibility setting that takes effect on
      // the very next request (FR-363).
      //
      // Declared here rather than merely omitted, because "no cache" and "nobody got round to
      // it" look identical in a composition root.
      // ─────────────────────────────────────────────────────────────────────────────────────
      directory: new HttpDirectoryRepository(http),
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 007 — **five repositories, NONE of them decorated with `cached`** (FR-563), and the
      // refusal is declared here because "no cache" and "nobody got round to it" look identical
      // in a composition root. 006 made the same declaration for the directory; this feature
      // makes it for its whole surface.
      //
      // The reasoning is not one reason five times:
      //
      // - **Conversations and messages** are another person's words. 005's decorator revokes on
      //   age alone, so a cached thread is a second copy of somebody else's personal data
      //   ageing on this device — bought for no offline capability worth having, because every
      //   write here is refused rather than queued (FR-565) and a thread that cannot be replied
      //   to is not a product. FR-563 makes the whole destination's offline behaviour a stated
      //   refusal rather than a degraded read.
      // - **Blocks** must bind on the very next request (SC-506). Age is the wrong clock for a
      //   refusal, which is precisely what 006 found it was for a discoverability setting.
      // - **Reports** are write-only. There is nothing to cache and no method that could read
      //   one back (FR-548).
      // - **Push subscriptions** hold credentials. A stale copy would keep a revoked endpoint
      //   alive locally after the browser had already replaced it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      conversations: new HttpConversationRepository(http),
      messages: new HttpMessageRepository(http),
      blocks: new HttpBlockRepository(http),
      reports: new HttpReportRepository(http),
      pushSubscriptions: new HttpPushSubscriptionRepository(http),
      // ─────────────────────────────────────────────────────────────────────────────────────
      // T038, T039 (008) — **cards are NOT decorated with `cached`, and this refusal is written
      // beside the member rather than achieved by leaving a line out** (FR-648).
      //
      // An omission and a decision look identical in a composition root, which is why 006 and
      // 007 each declared theirs here and why this one is declared too.
      //
      // The reason is 006's, unchanged: **resolving a held card reads another person's live
      // profile** (FR-611). 005's decorator revokes on **age alone**, so a cached contact is a
      // second copy of somebody else's name, company, role and face ageing on this device — and
      // it would go on rendering after they edited any of it. There is no offline capability
      // worth buying with that: every write in this feature is refused rather than queued
      // (FR-649), and a contacts list you cannot act on is a list of stale strangers.
      //
      // The staleness stamp cannot rescue it either. It answers "when did this device last
      // receive this", which is honest about *the retrieval* and silent about *the person* — and
      // the person is what changed.
      //
      // ═════════════════════════════════════════════════════════════════════════════════════
      // **T039 — THIS ANSWERS, BY REFUSAL, THE CACHE-KEY QUESTION 007 DEFERRED TO THIS FEATURE**
      // (research R4).
      //
      // Cards are cross-event, so caching them would have needed an **event-less key variant** —
      // the decorator's key is `(attendeeId, eventId, resource)` and there is no conference to
      // put in it. 007 left that open rather than invent one for a member it did not have.
      //
      // Refusing closes it without widening the cache contract at all. **No event-less key
      // variant is needed, and none should be added** on this feature's account: the next author
      // who needs one is arriving with a different requirement and should have to argue it.
      // ═════════════════════════════════════════════════════════════════════════════════════
      cards: new HttpCardRepository(http),
      // Cached, unlike its neighbour — see the decorator above for why the same feature answers
      // the offline question two different ways.
      appointments,
      // ─────────────────────────────────────────────────────────────────────────────────────
      // T031 (009) — **audience questions are NOT decorated with `cached`, and the refusal is
      // written beside the member rather than achieved by leaving a line out** (FR-754).
      //
      // The fifth declaration of its kind here, after 004's profile, 006's directory, 007's five
      // and 008's cards — each written in place because an omission and a decision look identical
      // in a composition root.
      //
      // The reason is 006's and 007's unchanged. A question is **another attendee's name and
      // words**, and the decorator revokes on **age alone** — the wrong clock entirely for
      // content its author may have withdrawn a second ago, which they may do at any time while
      // it has no votes (FR-712). A vote count is worse: it is a live number that is wrong the
      // moment it is stored, and the staleness stamp answers "when did this device last receive
      // this", which is honest about the retrieval and silent about the number.
      //
      // ═════════════════════════════════════════════════════════════════════════════════════
      // **BEING UNDECORATED IS WHAT MAKES FR-755 AND FR-757 STRUCTURAL RATHER THAN CLASSIFIED,
      // AND THAT IS THE LESSON 008 PAID FOR** (research R1).
      //
      // `cached` treats every method not named in `reads` as a **write**, and a write purges the
      // whole conference prefix — which is how opening 008's scheduling dialog silently wiped the
      // cached programme, saved sessions and notes. Every alternative here reproduces the risk:
      // decorating with `reads: {}` adds a Proxy that does nothing and invites a later reader to
      // "fix" the empty map, and decorating while leaving the four writes unclassified would
      // purge the attendee's whole offline conference **on every upvote**.
      //
      // Not decorating removes the mechanism instead of configuring it. There is no `reads` map
      // to omit a read from, no write branch to fall into, and no `args[0]` to misread as an
      // event id. **Do not add `cached` here to gain `passThrough`** — passing through is what
      // this line already does, with nothing to get wrong.
      // ═════════════════════════════════════════════════════════════════════════════════════
      //
      // Every write is refused offline and **never queued**, which needs no mechanism at all:
      // `HttpClient` refuses when connectivity reports offline, and there is no queue in this
      // product to fall into.
      questions: new HttpQuestionsRepository(http),
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
        // T012 (006) — no cast. `AttendeeRepository.getCurrent` is typed here now, so the
        // identifier this reads is the one the interface promises rather than one recovered
        // from `unknown` (FR-496).
        const attendee = await repository.getCurrent()
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

/**
 * 004 — **deleting an account and leaving a conference purge the device too** (FR-365, FR-366,
 * FR-317c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SERVER-SIDE DELETE IS ONLY HALF OF "NO COPY IS KEPT".**
 *
 * `WebLocalCache` has no eviction: `write` puts an entry and only `purge` ever removes one. The
 * 24-hour lifetime stops a stale entry being *served*; it does not delete the bytes. So without
 * this, an attendee who deletes their account leaves their saved sessions, their **notes** —
 * the product's first attendee-authored free text — and, under the `anonymous` prefix, their
 * name and email on the device, indefinitely. The confirmation dialog they read first says in
 * bold that no copy is kept and there is nothing to restore.
 *
 * `purgingOnSignOut` above cannot cover this: deletion calls `markSignedOut()`, which only
 * resets React state, and never reaches `auth.signOut()`. Withdrawal is missed for a different
 * reason — `identity` is deliberately not wrapped by `cached`, so the decorator's per-conference
 * purge never fires for it either.
 *
 * Both live here rather than in the components because cache correctness is the composition
 * root's job, not feature code's (Principle V, research D1). A component that forgot to purge
 * would still type-check.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Delegates every method explicitly rather than spreading**, for the reason stated at length
 * in `attendeeIdentity().watching` above: the wrapped object's methods live on a prototype, so a
 * spread would silently drop them while the type signature still claimed otherwise. This
 * interface has nine methods, so that failure would be near-total rather than subtle.
 */
const purgingIdentity = (
  identity: PlatformServices['repositories']['identity'],
  store: LocalCache,
  scope: { current: () => string; forget: () => void },
): PlatformServices['repositories']['identity'] => ({
  signUp: (account) => identity.signUp(account),
  joinConference: (joinCode) => identity.joinConference(joinCode),
  verifyEmail: (token) => identity.verifyEmail(token),
  resendVerification: () => identity.resendVerification(),
  requestPasswordReset: (email) => identity.requestPasswordReset(email),
  resetPassword: (token, password) => identity.resetPassword(token, password),
  exportPersonalData: () => identity.exportPersonalData(),

  /**
   * Purges only the conference that was left, keeping every other conference's cached content
   * — the attendee is still registered for those. Ordered **after** the request: unlike signing
   * out, a failed withdrawal means the attendee is still registered, and discarding their
   * offline copy of a conference they still hold would be a loss with nothing gained.
   */
  withdrawFromConference: async (eventId) => {
    await identity.withdrawFromConference(eventId)
    await store.purge(conferencePrefix(scope.current(), eventId))
  },

  /**
   * Purges in a `finally`, matching sign-out: an attendee whose account was deleted server-side
   * but whose response was lost to a flaky connection has still had their account deleted, and
   * the local copy must not be what survives it.
   */
  deleteAccount: async () => {
    const attendeeId = scope.current()
    try {
      await identity.deleteAccount()
    } finally {
      await store.purge(attendeePrefix(attendeeId))
      // Identity is cached before the attendee is known, so it lives under `anonymous` — the
      // same reason sign-out clears both prefixes.
      await store.purge(attendeePrefix('anonymous'))
      scope.forget()
    }
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
