import type { ConferenceFormat, ConferenceModality } from '../contract.js'
import type {
  AdminCatalogRepository,
  AdminProgramme,
  AdminSessionInput,
} from '../interfaces/administration.js'
import type { HttpClient } from './client.js'

/**
 * T036 (014) — the HTTP conference-authoring repository.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **UNDECORATED, LIKE EVERY OTHER ADMINISTRATIVE REPOSITORY, AND FOR A SHARPER REASON HERE.**
 *
 * `administration-repository.ts` records the general argument: an operator acting on stale state
 * resolves a report twice or removes a question that is already gone. This one adds a second
 * case that is worse, because the stale value is a **decision input**: the engagement counts on
 * the programme are what an organizer reads to choose between deleting a session and cancelling
 * it. A cached zero would present deletion as safe for a session somebody has since saved — and
 * the server would refuse it, correctly, leaving the organizer looking at a refusal that
 * contradicts the screen in front of them.
 *
 * Not decorating removes the mechanism rather than configuring it (009's answer): there is no
 * `reads` map to omit from and no `args[0]` to misread.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Every path names its conference**, and that is not a convenience. `requireConferenceAuthority`
 * reads `:eventId` from the path and refuses everything else with an indistinguishable 404
 * (FR-1035, FR-1036) — a route without one would be a route the server could not authorise. The
 * one exception is conference creation, which has no conference to be authorised over yet.
 */

/** Encoded once, so no call site can forget and no identifier can escape into the path. */
const at = (eventId: string, rest = ''): string =>
  `/admin/conferences/${encodeURIComponent(eventId)}${rest}`

/**
 * The warnings a write may return (FR-1016).
 *
 * **Advisory, never a refusal.** Conferences genuinely overlap sessions during changeover, so the
 * server permits it and says so; refusing would be a rule the product invented. Reduced to codes
 * here, because the wording belongs to the screen rather than to the transport.
 */
const warningsOf = (body: unknown): readonly string[] =>
  ((body as { warnings?: { code: string }[] } | undefined)?.warnings ?? []).map(
    (warning) => warning.code,
  )

export class HttpAdminCatalogRepository implements AdminCatalogRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async programme(eventId: string): Promise<AdminProgramme> {
    return this.#http.request<AdminProgramme>(at(eventId, '/programme'))
  }

  async createTrack(eventId: string, input: { name: string; colorToken: string }): Promise<void> {
    await this.#write(at(eventId, '/tracks'), 'POST', input)
  }

  async updateTrack(
    eventId: string,
    id: string,
    input: { name: string; colorToken: string },
  ): Promise<void> {
    await this.#write(at(eventId, `/tracks/${encodeURIComponent(id)}`), 'PATCH', input)
  }

  async deleteTrack(eventId: string, id: string): Promise<void> {
    await this.#write(at(eventId, `/tracks/${encodeURIComponent(id)}`), 'DELETE')
  }

  async createRoom(eventId: string, input: { name: string }): Promise<void> {
    await this.#write(at(eventId, '/rooms'), 'POST', input)
  }

  async updateRoom(eventId: string, id: string, input: { name: string }): Promise<void> {
    await this.#write(at(eventId, `/rooms/${encodeURIComponent(id)}`), 'PATCH', input)
  }

  async deleteRoom(eventId: string, id: string): Promise<void> {
    await this.#write(at(eventId, `/rooms/${encodeURIComponent(id)}`), 'DELETE')
  }

  async createSpeaker(
    eventId: string,
    input: { name: string; title: string | null; company: string | null },
  ): Promise<void> {
    await this.#write(at(eventId, '/speakers'), 'POST', input)
  }

  async updateSpeaker(
    eventId: string,
    id: string,
    input: { name: string; title: string | null; company: string | null },
  ): Promise<void> {
    await this.#write(at(eventId, `/speakers/${encodeURIComponent(id)}`), 'PATCH', input)
  }

  async deleteSpeaker(eventId: string, id: string): Promise<void> {
    await this.#write(at(eventId, `/speakers/${encodeURIComponent(id)}`), 'DELETE')
  }

  async createSession(
    eventId: string,
    input: AdminSessionInput,
  ): Promise<{ warnings: readonly string[] }> {
    const body = await this.#write(at(eventId, '/sessions'), 'POST', input)
    return { warnings: warningsOf(body) }
  }

  async updateSession(
    eventId: string,
    id: string,
    input: AdminSessionInput,
  ): Promise<{ warnings: readonly string[] }> {
    const body = await this.#write(
      at(eventId, `/sessions/${encodeURIComponent(id)}`),
      'PATCH',
      input,
    )
    return { warnings: warningsOf(body) }
  }

  async deleteSession(eventId: string, id: string, placesSeen: number): Promise<void> {
    // `placesSeen` is the held-places figure the confirmation showed (FR-1077b). The server
    // re-reads it under the deleting transaction's lock and refuses with `places_changed` when
    // it has risen — so the caller re-presents rather than destroying places taken mid-dialog.
    await this.#write(
      at(eventId, `/sessions/${encodeURIComponent(id)}?placesSeen=${String(placesSeen)}`),
      'DELETE',
    )
  }

  async cancelSession(eventId: string, id: string): Promise<void> {
    await this.#write(at(eventId, `/sessions/${encodeURIComponent(id)}/cancel`), 'POST')
  }

  async reinstateSession(eventId: string, id: string): Promise<void> {
    await this.#write(at(eventId, `/sessions/${encodeURIComponent(id)}/reinstate`), 'POST')
  }

  async patchConference(
    eventId: string,
    input: Partial<{
      name: string
      location: string
      startsOn: string
      endsOn: string
      timezone: string
      modality: ConferenceModality
      format: ConferenceFormat | null
    }>,
  ): Promise<void> {
    await this.#write(at(eventId), 'PATCH', input)
  }

  async listEnrolments(
    eventId: string,
    sessionId: string,
  ): Promise<readonly { readonly displayName: string }[]> {
    // Names only (FR-1073, O1). The response shape is the whole disclosure: `displayName` and
    // nothing beside it, declared by the route's own response schema so anything more is
    // stripped before it leaves the server.
    const body = await this.#http.request<{ attendees: { displayName: string }[] }>(
      at(eventId, `/sessions/${encodeURIComponent(sessionId)}/enrolments`),
    )
    return body.attendees
  }

  async createConference(input: {
    name: string
    location: string
    startsOn: string
    endsOn: string
    timezone: string
    modality: ConferenceModality
    format: ConferenceFormat | null
  }): Promise<{ id: string; joinCode: string }> {
    // The one path with no conference in it. `requireOperator` alone guards it, because there is
    // nothing yet to hold authority over (FR-1007, FR-1008).
    return this.#http.request<{ id: string; joinCode: string }>('/admin/conferences', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /**
   * One write path, so every refusal takes the same route out.
   *
   * **The refusals are not classified here, and that is deliberate.** `ApiError extends
   * RequestRefusedError`, so `instanceof` catches 400, 404, 409 and 429 alike — which is how 008
   * swallowed every message its routes wrote to be read. Classification happens once, on
   * `error.code`, in `apps/admin/src/app/errors.ts`, and this repository lets the error through
   * untouched so there is exactly one place that decides what it means.
   */
  async #write(path: string, method: string, body?: unknown): Promise<unknown> {
    return this.#http.request<unknown>(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
}
