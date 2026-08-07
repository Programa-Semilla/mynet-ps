import type { ActiveEventRepository, Event } from '../interfaces/index.js'
import type { HttpClient } from './client.js'

/**
 * T022 (002) — the HTTP active-event repository.
 *
 * Takes no attendee identifier: which conference is active is a property of the signed-in
 * attendee, resolved server-side from the session cookie (research D3).
 */
export class HttpActiveEventRepository implements ActiveEventRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * The active conference, or `null` when the attendee is registered for none (FR-105).
   *
   * The server answers that case with **204 and no body**, which `HttpClient` surfaces as
   * `undefined`. Mapping it to `null` here keeps the distinction the domain cares about — "no
   * conferences" is a definite answer — and keeps the transport's spelling of emptiness on this
   * side of the boundary (FR-045). A failure throws, so a caller never has to wonder whether
   * `null` means absence or ignorance.
   */
  async getActive(): Promise<Event | null> {
    const event = await this.#http.request<Event | undefined>('/workspace/active-event')
    return event ?? null
  }

  /**
   * Records an explicit choice and returns what the server actually recorded.
   *
   * **The echo is not decoration** (research D9): a client that issued two switches in quick
   * succession compares this against its own latest selection to detect requests that settled
   * out of order, and re-reads when they disagree. That is reconciliation *after* the server
   * confirms — not an optimistic update, so no recorded decision under Principle VI is needed.
   */
  async setActive(eventId: string): Promise<Event> {
    return this.#http.request<Event>('/workspace/active-event', {
      method: 'PUT',
      body: JSON.stringify({ eventId }),
    })
  }
}
