import type { Attendee, AttendeeRepository } from '../interfaces/index.js'
import type { HttpClient } from './client.js'

/**
 * T057 — the HTTP attendee repository.
 *
 * `getCurrent()` takes no identifier and there is no method that does. The server resolves
 * the attendee from the sign-in session cookie, so "current" is the only attendee this client
 * can ever ask about (FR-035, FR-036).
 */
export class HttpAttendeeRepository implements AttendeeRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async getCurrent(): Promise<Attendee> {
    return this.#http.request<Attendee>('/auth/me')
  }
}
