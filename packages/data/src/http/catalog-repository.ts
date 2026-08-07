import type { CatalogRepository, Session, Track } from '../interfaces/catalog.js'
import type { HttpClient } from './client.js'

/**
 * T042 (002) — the HTTP catalog repository.
 *
 * The event identifier goes in the path, where the server's access guard reads it. A refusal —
 * not registered, or no such conference — arrives as the same `RequestRefusedError` for both,
 * and this class deliberately does nothing to tell them apart: they are indistinguishable on
 * the wire by design (FR-148), and a client that appeared to know which had happened would be
 * inventing information it does not have.
 */
export class HttpCatalogRepository implements CatalogRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async listSessions(eventId: string): Promise<Session[]> {
    return this.#http.request<Session[]>(`/events/${encodeURIComponent(eventId)}/sessions`)
  }

  async listTracks(eventId: string): Promise<Track[]> {
    return this.#http.request<Track[]>(`/events/${encodeURIComponent(eventId)}/tracks`)
  }
}
