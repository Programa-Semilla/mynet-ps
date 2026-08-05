import type { Event, EventsRepository } from '../interfaces/index.js'
import type { HttpClient } from './client.js'

/**
 * T058 — the HTTP events repository.
 *
 * Returns whatever the server scoped to the signed-in attendee. An attendee registered for no
 * events gets `[]`, which the caller renders as an explicit empty state — not an error, and
 * not a blank region (FR-040).
 */
export class HttpEventsRepository implements EventsRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async listRegistered(): Promise<Event[]> {
    return this.#http.request<Event[]>('/events')
  }
}
