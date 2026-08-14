import {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from '../interfaces/index.js'

/**
 * T042 — the only place in the client that constructs a request (FR-045).
 *
 * Every repository goes through here. Nothing in `apps/web/src` calls `fetch`, knows a URL,
 * or knows that HTTP is involved at all — `mynet/no-direct-platform-access` enforces that and
 * SC-008 counts it.
 */

/** Upper bound on any single request. See the `signal` in `request` for why one is needed. */
const REQUEST_TIMEOUT_MS = 20_000

/** Shorter for the probe: it must not outlive the interval that schedules it. */
const PROBE_TIMEOUT_MS = 4_000

export interface HttpClientOptions {
  readonly baseUrl: string
  /**
   * Injected rather than read from `navigator` here, so this module has no browser dependency
   * and a test can drive the offline path without faking a global.
   */
  readonly isOnline: () => boolean
  /** Seam for tests. Defaults to the platform `fetch` at the composition root. */
  readonly fetch: typeof globalThis.fetch
  /**
   * Reports what this client observed on the wire, so the connectivity indicator reflects
   * reality rather than the browser's optimistic flag (FR-054).
   *
   * Optional because a test double rarely cares. Wired at the composition root in production.
   */
  readonly onReachability?: ((reachable: boolean) => void) | undefined
}

export interface ApiErrorBody {
  code?: string
  message?: string
  retryAfterSeconds?: number
  /**
   * Structured detail a refusal carries beyond its sentence.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE SERVER WAS PRODUCING THIS AND THE CLIENT WAS DROPPING IT AT THE TRANSPORT BOUNDARY.**
   *
   * 014's `detailedRefusal` carries two of these — the engagement counts behind a refused deletion
   * (FR-1019, FR-1025) and **the sessions a date-range change would orphan, named** (FR-1014, whose
   * text is *"the refusal MUST name the sessions concerned"*). The route declares them in its
   * response schema after a long comment about Fastify stripping what a schema does not name, and
   * `patchConference` runs an extra ordered query solely to build the list.
   *
   * All of that terminated here: this type named three fields, so everything else in the body was
   * discarded before any client could see it, and the organizer was shown "Those dates would leave
   * sessions outside the conference" with no indication of which of forty.
   *
   * Deliberately opaque (`unknown` values). This is the transport boundary, and it must not learn
   * the shape of any one feature's refusal — the client that understands `sessions` is the one that
   * renders it. `retryAfterSeconds` stays a named field because every throttled route in the
   * product carries it and it predates this.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  [detail: string]: unknown
}

/**
 * A refusal the server explained, with the HTTP detail attached.
 *
 * Extends `RequestRefusedError` so that presentation code can recognise a refusal by importing
 * from `@mynet/data` — the interfaces — while anything that genuinely needs the status stays on
 * this side of the transport boundary (FR-045).
 */
export class ApiError extends RequestRefusedError {
  readonly status: number
  readonly retryAfterSeconds: number | undefined
  /**
   * Whatever else the refusal carried, unread by this layer.
   *
   * A caller that knows a code knows what accompanies it — see `ApiErrorBody`. Kept as the raw
   * body rather than a copy with the known fields removed, so nothing here decides what a future
   * refusal is allowed to carry.
   */
  readonly details: Readonly<Record<string, unknown>>

  constructor(status: number, body: ApiErrorBody) {
    super(body.code ?? 'unknown', body.message ?? 'The request could not be completed.')
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds =
      typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined
    this.details = body
  }
}

export class HttpClient {
  readonly #options: HttpClientOptions

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **In-flight GETs to the same path share one request.**
   *
   * Home renders four independent cards, and by design no card may know another exists
   * (FR-164). Two of them need the conference programme and two need the attendee's
   * conferences, so one Home render issued five requests where three would do — two of them
   * byte-identical duplicates, each costing a session lookup, a registration check and two
   * queries on the server, and each downloading the whole programme again.
   *
   * Coalescing here rather than in the cards is what keeps the card contract intact: a card
   * still calls its own repository and still knows nothing about its siblings. The entry is
   * removed the moment the request settles, so this is **not a cache** — it holds nothing
   * between renders, and a later read still goes to the network. Introducing a cache would
   * mean a staleness policy, which is an open question this feature deliberately does not
   * answer.
   *
   * GET only: a coalesced write would silently drop one of two deliberate actions.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  readonly #inFlight = new Map<string, Promise<unknown>>()

  constructor(options: HttpClientOptions) {
    this.#options = options
  }

  /**
   * Asks whether the server is reachable, and reports the answer.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Deliberately **skips the offline pre-check in `request`**, because it is the thing that
   * resolves being offline. Without a path that ignores the current belief, that belief latches:
   * the client will not send a request because it thinks it is offline, and it cannot learn
   * otherwise because it sends no request. The attendee is then stuck behind a banner until they
   * reload, which is precisely what FR-054's "without a manual reload" rules out.
   *
   * `/health` is used because it touches no attendee data and no database row — it is safe to
   * call repeatedly, and safe to call while unauthenticated.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  async probe(): Promise<boolean> {
    try {
      await this.#options.fetch(`${this.#options.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      this.#options.onReachability?.(true)
      return true
    } catch {
      this.#options.onReachability?.(false)
      return false
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method ?? 'GET'

    // Only reads are shared, only while one is actually outstanding, and only when the request
    // carries no options of its own. Sharing a request whose caller passed a `signal` or custom
    // headers would let one caller's abort or timeout reject another caller who never asked for
    // it — a cross-caller failure that would read as a random network error.
    const shareable = method === 'GET' && Object.keys(init).every((key) => key === 'method')

    if (shareable) {
      const existing = this.#inFlight.get(path)
      if (existing) return existing as Promise<T>

      const pending = this.#send<T>(path, init).finally(() => {
        this.#inFlight.delete(path)
      })
      this.#inFlight.set(path, pending)
      return pending
    }

    return this.#send<T>(path, init)
  }

  async #send<T>(path: string, init: RequestInit = {}): Promise<T> {
    // FR-053 — refuse rather than queue, and refuse *before* attempting, so the failure is
    // reported as connectivity rather than as an ambiguous network error. Never queued
    // silently, never shown as succeeded.
    if (!this.#options.isOnline()) {
      throw new OfflineError(describeAction(init.method ?? 'GET', path))
    }

    let response: Response
    try {
      response = await this.#options.fetch(`${this.#options.baseUrl}${path}`, {
        ...init,
        // A request that connects and then stalls would otherwise hang for the browser's
        // default — minutes. The attendee sees a spinner that never resolves, the offline
        // banner never appears because nothing has failed yet, and there is no retry
        // affordance. FR-058 asks for a defined failure presentation; a failure that is never
        // reported has none. An abort lands in the catch below and is reported as unreachable,
        // which is exactly what it is.
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // The sign-in session travels as an HttpOnly cookie, so every request must carry
        // credentials. Without this the API sees an anonymous request and refuses.
        credentials: 'include',
        headers: {
          // **Only when there is a body.** Declaring `application/json` on a bodyless request
          // makes the server parse an empty payload as JSON and refuse it — which is how
          // sign-out came to clear the cookie in the browser while never revoking the session
          // on the server, defeating FR-027. `fastify.inject()` does not reproduce the header
          // combination a browser sends, so only the end-to-end suite could catch it.
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init.headers,
        },
      })
    } catch (cause) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // A throw from `fetch` means the request never reached the server: no response, no status,
      // nothing applied. That is exactly `OfflineError`'s contract — "it has not been saved, and
      // it has not been queued" — so it is reported as one regardless of what the browser's
      // online flag currently claims.
      //
      // Consulting `isOnline()` here instead was a defect. `navigator.onLine` reports true after
      // a page load even on a device with no working connection, so a genuine outage surfaced as
      // a generic failure, the client concluded the attendee was signed out, and it showed them
      // a sign-in form that could not possibly submit.
      //
      // A CORS or DNS misconfiguration also lands here. That is acceptable: from the attendee's
      // side "MyNet could not be reached, nothing was changed, try again when you have a
      // connection" is true in every one of those cases, and diagnosing which is not their job.
      // ─────────────────────────────────────────────────────────────────────────────────────
      this.#options.onReachability?.(false)
      throw new OfflineError(describeAction(init.method ?? 'GET', path), { cause })
    }

    // The server answered. Whatever it said, it was reachable — including a 401 or a 500.
    this.#options.onReachability?.(true)

    if (response.ok) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Any empty body resolves to `undefined`, not only a 204.**
      //
      // This read `response.status === 204 ? undefined : await response.json()`, which was
      // correct for every route that existed when it was written — 204 was the only bodyless
      // success in the API. 004 added `202 Accepted` for the two routes that answer *"we have
      // accepted this and will say nothing more"*: a reset request, which must answer
      // identically whether or not an account exists (FR-327), and a verification resend.
      //
      // `response.json()` on an empty body throws a `SyntaxError`, which is neither an
      // `OfflineError` nor a `RequestRefusedError` — so it reached the generic branch in every
      // caller and told the attendee **"Could not reach MyNet"** about a request that had
      // succeeded. On the password-recovery path that is the worst possible wrong answer: it
      // sends somebody to fix their connection while their reset link sits in their inbox.
      //
      // Found by `e2e/password-recovery.spec.ts`. Nothing else could have: the integration
      // suite drives `fastify.inject()` and parses responses itself, so it never runs this
      // line, and the component suite substitutes the repository above it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const body = await response.text()
      return (body.length === 0 ? undefined : JSON.parse(body)) as T
    }

    const body = await safeJson(response)

    // FR-028c — the client must tell "signed out for inactivity" from "never signed in", so
    // it can explain the first and simply ask for sign-in on the second.
    //
    // **Only the two session codes are translated.** Treating every 401 as a session problem
    // swallowed `invalid_credentials`, so a wrong password surfaced on the sign-in screen as
    // "Could not reach MyNet. Check your connection and try again." — the server's carefully
    // worded refusal was unreachable, and the attendee was sent to fix a network that was
    // working (FR-059).
    if (response.status === 401) {
      if (body.code === 'session_expired') throw new SessionExpiredError()
      if (body.code === 'not_authenticated') throw new NotAuthenticatedError()
    }

    throw new ApiError(response.status, body)
  }
}

const safeJson = async (response: Response): Promise<ApiErrorBody> => {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    // A refusal with an unreadable body is still a refusal. Falling back keeps FR-058 true:
    // a failure must never be reported to the caller as an empty success.
    return {}
  }
}

const describeAction = (method: string, path: string): string =>
  method === 'GET' ? `Loading ${path.replace(/^\//, '')}` : 'That action'
