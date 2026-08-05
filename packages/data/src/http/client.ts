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
          'content-type': 'application/json',
          ...init.headers,
        },
      })
    } catch (cause) {
      // The connection dropped between the check above and the request completing.
      if (!this.#options.isOnline()) {
        throw new OfflineError(describeAction(init.method ?? 'GET', path))
      }
      throw new Error('Could not reach MyNet. Check your connection and try again.', { cause })
    }

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
