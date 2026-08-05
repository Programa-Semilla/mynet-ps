import type { HttpClient } from './client.js'

/**
 * Sign-in and sign-out, behind the same transport boundary as the repositories (FR-045).
 *
 * Not a repository — it does not read domain data, it changes session state — but it lives
 * here for the same reason: `apps/web` must not know that HTTP exists.
 *
 * Neither method returns a token. The session travels in an HttpOnly cookie the browser
 * manages, so there is nothing for the client to hold, store, or accidentally log.
 */
export interface AuthGateway {
  signIn(credentials: { email: string; password: string }): Promise<void>
  signOut(): Promise<void>
}

export class HttpAuthGateway implements AuthGateway {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async signIn(credentials: { email: string; password: string }): Promise<void> {
    await this.#http.request<void>('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  }

  async signOut(): Promise<void> {
    await this.#http.request<void>('/auth/sign-out', { method: 'POST' })
  }
}
