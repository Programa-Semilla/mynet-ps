import type { Event } from '../interfaces/events.js'
import type { IdentityRepository, JoinResult, PersonalDataExport } from '../interfaces/identity.js'
import type { HttpClient } from './client.js'

/**
 * T033 (004) — the HTTP identity repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **No method sends an attendee identifier**, because none has one to send. Identity travels
 * as the HttpOnly sign-in cookie `HttpClient` attaches to every request, so `deleteAccount()`
 * and `exportPersonalData()` cannot be aimed at anybody else even by a caller trying to
 * (FR-378, FR-385).
 *
 * The three unauthenticated methods precede a session by necessity. Each is rate-limited
 * server-side under its own action counter, and **none reports anything about an account** —
 * `requestPasswordReset` in particular resolves identically whether or not one exists, which is
 * FR-327's guarantee and the reason this class does nothing to inspect the response.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export class HttpIdentityRepository implements IdentityRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async signUp(account: { email: string; displayName: string; password: string }): Promise<void> {
    // 204 with no body, so the session token cannot leak into one. The cookie is set by the
    // response headers and managed by the browser.
    await this.#http.request<void>('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(account),
    })
  }

  /**
   * The code goes in the **body**, not the path.
   *
   * A code in a URL would end up in browser history, in a shared link, and in any intermediary's
   * access log — and while FR-317a settles that it is not a secret, that is a reason not to
   * protect it, not a reason to broadcast it.
   */
  async joinConference(joinCode: string): Promise<JoinResult> {
    return this.#http.request<{ event: Event; alreadyRegistered: boolean }>('/events/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode }),
    })
  }

  async withdrawFromConference(eventId: string): Promise<void> {
    await this.#http.request<void>(`/events/${encodeURIComponent(eventId)}/registration`, {
      method: 'DELETE',
    })
  }

  async verifyEmail(token: string): Promise<void> {
    await this.#http.request<void>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  async resendVerification(): Promise<void> {
    await this.#http.request<void>('/auth/verify/resend', { method: 'POST' })
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.#http.request<void>('/auth/reset-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.#http.request<void>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    })
  }

  async exportPersonalData(): Promise<PersonalDataExport> {
    return this.#http.request<PersonalDataExport>('/profile/export')
  }

  async deleteAccount(): Promise<void> {
    await this.#http.request<void>('/account', { method: 'DELETE' })
  }
}
