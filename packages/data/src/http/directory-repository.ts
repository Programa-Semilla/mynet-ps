import type {
  DirectoryPage,
  DirectoryQuery,
  DirectoryRepository,
  VisibleProfile,
} from '../interfaces/directory.js'
import type { HttpClient } from './client.js'

/**
 * T031 (006) — the HTTP directory repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Three reads, all under `/events/:eventId/…`, so every one of them acquires the server's
 * `requireEventAccess` guard and the branded `EventScope` it produces. The reader's own
 * identity appears in no address here: it comes from the sign-in cookie.
 *
 * Only one of the three is new. `get` and `readAvatar` call 004's existing routes **unchanged**
 * (research D14) — reusing them is what makes the profile view inherit their four-way
 * indistinguishable refusal rather than reimplementing it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The shape the listing route embeds per attendee. See `list` for why it is JSON. */
interface AvatarBody {
  readonly contentType: string
  readonly base64: string
}

/** The listing response, before avatars are turned into data URLs. */
interface DirectoryPageBody {
  readonly attendees: readonly (Omit<DirectoryPage['attendees'][number], 'avatar'> & {
    readonly avatar: AvatarBody | null
  })[]
  readonly nextCursor: string | null
}

export class HttpDirectoryRepository implements DirectoryRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **The whole page — cards and faces — is one request** (FR-456, SC-407).
   *
   * The avatars arrive base64-encoded inside the listing body and are converted to data URLs
   * here, which is the same mechanism `HttpProfileRepository.readOwnAvatar` uses and for the
   * same reasons: `HttpClient` reads every successful response with one decoding path, the
   * contract generator expresses JSON far better than binary, and presentation code must be
   * able to render a face without learning that a network exists.
   *
   * The conversion happens **here rather than in a component** because this is the transport
   * boundary. A card receives a string it can put in `src` and nothing more.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  async list(eventId: string, query: DirectoryQuery): Promise<DirectoryPage> {
    const body = await this.#http.request<DirectoryPageBody>(
      `/events/${encodeURIComponent(eventId)}/attendees${queryString(query)}`,
    )

    return {
      attendees: body.attendees.map((entry) => ({
        ...entry,
        avatar: toDataUrl(entry.avatar),
      })),
      nextCursor: body.nextCursor,
    }
  }

  /**
   * 004's single-profile read, used exactly as it stands.
   *
   * The route answers `404` for every refusal cause, and `HttpClient` turns that into an
   * `ApiError`. It is translated to `null` here rather than propagated, because the four
   * causes are deliberately indistinguishable and a caller that received an error would be
   * tempted to word its message around one of them.
   */
  async get(eventId: string, attendeeId: string): Promise<VisibleProfile | null> {
    return notFoundAsNull(
      this.#http.request<VisibleProfile>(
        `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(attendeeId)}`,
      ),
    )
  }

  /**
   * 004's avatar read, at the 512px profile rendition, under the same three conditions.
   *
   * Answers `204` with no body when the attendee has none — which `HttpClient` resolves to
   * `undefined` — and that case is deliberately indistinguishable from "not visible to you",
   * because the route re-checks visibility before choosing between `204` and `404`.
   */
  async readAvatar(eventId: string, attendeeId: string): Promise<string | null> {
    const body = await notFoundAsNull(
      this.#http.request<AvatarBody | null | undefined>(
        `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(attendeeId)}/avatar`,
      ),
    )

    return toDataUrl(body ?? null)
  }
}

/** `data:` URL for an embedded rendition, or `null` when the attendee has no avatar. */
const toDataUrl = (avatar: AvatarBody | null): string | null =>
  avatar ? `data:${avatar.contentType};base64,${avatar.base64}` : null

/**
 * Turns the one refusal 004's reads produce into an absence.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Only 404**, and only 404. A 401 must still propagate — being signed out is a different
 * condition with a different remedy, and swallowing it here would render "this attendee is not
 * visible to you" to somebody whose session had simply expired.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Reads `status` structurally rather than importing `ApiError`, so this module keeps no
 * dependency on the error class's identity across bundling boundaries.
 */
const notFoundAsNull = async <T>(pending: Promise<T>): Promise<T | null> => {
  try {
    return await pending
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * The query string for a directory read.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **An empty or whitespace-only `q` is omitted rather than sent empty**, so "the attendee
 * cleared the search box" and "the attendee never typed anything" produce the *same* address.
 * Without this they produce two — `?q=` and no query at all — and `HttpClient`'s in-flight
 * coalescing keys on the path, so two renders of the same unfiltered directory would issue two
 * identical requests instead of sharing one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const queryString = (query: DirectoryQuery): string => {
  const params = new URLSearchParams()

  const add = (name: string, value: string | undefined) => {
    const trimmed = value?.trim()
    if (trimmed) params.set(name, trimmed)
  }

  add('q', query.q)
  add('role', query.role)
  add('interest', query.interest)
  add('cursor', query.cursor)
  if (query.limit !== undefined) params.set('limit', String(query.limit))

  const encoded = params.toString()
  return encoded.length === 0 ? '' : `?${encoded}`
}
