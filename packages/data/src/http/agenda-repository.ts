import type {
  SavedSessionRepository,
  SessionNote,
  SessionNotesRepository,
} from '../interfaces/agenda.js'
import type { HttpClient } from './client.js'

/**
 * T011, T049 (005) — the HTTP agenda repositories.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The conference identifier goes in the path, where the server's access guard reads it. A
 * refusal — not registered, no such conference, or a session that is not in this one — arrives
 * as the same `RequestRefusedError` in every case, and these classes deliberately do nothing
 * to tell them apart: they are indistinguishable on the wire by design (FR-204, FR-231), and a
 * client that appeared to know which had happened would be inventing information it does not
 * have.
 *
 * **No method takes an attendee identifier.** Identity travels as the HttpOnly sign-in cookie
 * that `HttpClient` attaches to every request, so there is nothing here to get wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Encoded once, so no call site can forget and no identifier can escape into the path. */
const agendaPath = (eventId: string, rest: string): string =>
  `/events/${encodeURIComponent(eventId)}/agenda${rest}`

export class HttpSavedSessionRepository implements SavedSessionRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async listSaved(eventId: string): Promise<string[]> {
    // The route answers `{ sessionIds: [...] }` rather than a bare array, so the response has
    // somewhere to grow without becoming a breaking change. The interface promises the list.
    const body = await this.#http.request<{ sessionIds: string[] }>(agendaPath(eventId, '/saved'))
    return body.sessionIds
  }

  /**
   * `PUT` on a resource whose address **is** the pairing, which is where the idempotency comes
   * from (FR-187, research D6) — rather than from a uniqueness constraint doing double duty as
   * business logic, though that constraint exists too as defence in depth.
   */
  async save(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(agendaPath(eventId, `/saved/${encodeURIComponent(sessionId)}`), {
      method: 'PUT',
    })
  }

  async unsave(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(agendaPath(eventId, `/saved/${encodeURIComponent(sessionId)}`), {
      method: 'DELETE',
    })
  }
}

export class HttpSessionNotesRepository implements SessionNotesRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async listNotes(eventId: string): Promise<SessionNote[]> {
    const body = await this.#http.request<{ notes: SessionNote[] }>(agendaPath(eventId, '/notes'))
    return body.notes
  }

  /**
   * Returns the written note, `updatedAt` included.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **That return value is what keeps the autosave non-optimistic** (FR-210, research D5). The
   * editor's status may enter *saved* only from a resolved write, and a method that resolved to
   * `void` would leave the caller with nothing to distinguish "the server confirmed this" from
   * "the request was dispatched". Entering *saved* from the keystroke instead would incur the
   * optimistic-update decision the constitution requires be recorded separately.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  async writeNote(eventId: string, sessionId: string, body: string): Promise<SessionNote> {
    const written = await this.#http.request<{ updatedAt: string }>(
      agendaPath(eventId, `/notes/${encodeURIComponent(sessionId)}`),
      { method: 'PUT', body: JSON.stringify({ body }) },
    )

    return { sessionId, body, updatedAt: written.updatedAt }
  }

  async deleteNote(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(agendaPath(eventId, `/notes/${encodeURIComponent(sessionId)}`), {
      method: 'DELETE',
    })
  }
}
