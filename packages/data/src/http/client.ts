import { NotAuthenticatedError, OfflineError, SessionExpiredError } from '../interfaces/index.js'

/**
 * T042 — the only place in the client that constructs a request (FR-045).
 *
 * Every repository goes through here. Nothing in `apps/web/src` calls `fetch`, knows a URL,
 * or knows that HTTP is involved at all — `mynet/no-direct-platform-access` enforces that and
 * SC-008 counts it.
 */

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
}

/** A refusal the server explained. Carries the server's attendee-facing message (FR-059). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? 'The request could not be completed.')
    this.name = 'ApiError'
    this.status = status
    this.code = body.code ?? 'unknown'
    this.retryAfterSeconds = body.retryAfterSeconds
  }
}

export class HttpClient {
  readonly #options: HttpClientOptions

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
      await this.#options.fetch(`${this.#options.baseUrl}/health`, { method: 'GET' })
      this.#options.onReachability?.(true)
      return true
    } catch {
      this.#options.onReachability?.(false)
      return false
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
    }

    const body = await safeJson(response)

    // FR-028c — the client must tell "signed out for inactivity" from "never signed in", so
    // it can explain the first and simply ask for sign-in on the second.
    if (response.status === 401) {
      if (body.code === 'session_expired') throw new SessionExpiredError()
      throw new NotAuthenticatedError()
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
