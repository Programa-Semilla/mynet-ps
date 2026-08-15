import type {
  Commitment,
  CommitmentRepository,
  PlaceAvailability,
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

/**
 * T196 (014 tranche 2) — was `HttpSavedSessionRepository`; renamed with the interface, because
 * from tranche 2 the set it serves carries held places as well as saves (FR-1066a, R13).
 */
export class HttpCommitmentRepository implements CommitmentRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * T074 (014) — **the room the response was given to grow into is the room the marker uses.**
   *
   * This read `{ sessionIds: [...] }` and returned the bare list; 005's comment said the object
   * wrapper existed "so the response has somewhere to grow without becoming a breaking change".
   * 014 is that growth: `sessions` carries the identifier **and** the marker, computed
   * server-side from two timestamps (FR-1030, research R7). T196 grew it a second time, the
   * same move: each row now carries the `saved | place` discriminator (FR-1066, R13).
   *
   * The method keeps its name — it is the identity the cache's `reads` map and resource key
   * are configured against; see the interface for why renaming it is not a tidy-up.
   */
  async listSaved(eventId: string): Promise<Commitment[]> {
    const body = await this.#http.request<{ sessions: Commitment[] }>(agendaPath(eventId, '/saved'))
    return body.sessions
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

  /**
   * T075 (014) — `POST` rather than `PUT` on a `viewed` sub-resource.
   *
   * The instant is the server's, not the client's: a `PUT` carrying a timestamp would let a
   * client clear a marker for a change it has not seen, and would put the marker's correctness
   * on the device's clock. There is nothing to send, so there is nothing to get wrong.
   */
  async markViewed(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(
      agendaPath(eventId, `/saved/${encodeURIComponent(sessionId)}/viewed`),
      { method: 'POST' },
    )
  }

  /**
   * T196 (014 tranche 2) — `PUT` on the place, mirroring `save`: the address IS the pairing,
   * which is where a double-tap's safety comes from — though here the server answers the second
   * tap with `already_enrolled` rather than silence, because the attendee holding a place is a
   * fact worth telling them (FR-1069a).
   */
  async enrol(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(
      agendaPath(eventId, `/places/${encodeURIComponent(sessionId)}`),
      { method: 'PUT' },
    )
  }

  /** T196 (014 tranche 2) — `DELETE` on the place, mirroring `unsave`. Idempotent (FR-1067). */
  async release(eventId: string, sessionId: string): Promise<void> {
    await this.#http.request<void>(
      agendaPath(eventId, `/places/${encodeURIComponent(sessionId)}`),
      { method: 'DELETE' },
    )
  }

  /**
   * T196, T209 (014 tranche 2) — the live places figure (FR-1070). **Not** under `/agenda`:
   * remaining places are a fact about the session, the same for every reader, so the address
   * says so. Declared `passThrough` at the composition root (FR-1070b) — see the interface.
   */
  async places(eventId: string, sessionId: string): Promise<PlaceAvailability> {
    return this.#http.request<PlaceAvailability>(
      `/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}/places`,
    )
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
