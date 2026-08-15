import type {
  Discoverability,
  OwnProfile,
  ProfileDraft,
  ProfileRepository,
} from '../interfaces/profile.js'
import type { HttpClient } from './client.js'

/**
 * T034 (004) — the HTTP profile repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Every address here is `/profile…` with **no identifier of any kind in it**. The server binds
 * the attendee from the sign-in session, so there is no path segment a caller could change to
 * reach somebody else's profile (FR-335, FR-385).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The shape both avatar reads answer with. See `readOwnAvatar` for why it is JSON. */
interface AvatarBody {
  readonly contentType: string
  readonly base64: string
}

export class HttpProfileRepository implements ProfileRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async getOwn(): Promise<OwnProfile> {
    return this.#http.request<OwnProfile>('/profile')
  }

  async saveOwn(draft: ProfileDraft): Promise<OwnProfile> {
    // The whole draft, always. Whole-profile semantics mean an omitted field clears, so sending
    // a subset would silently erase whatever it left out.
    return this.#http.request<OwnProfile>('/profile', {
      method: 'PUT',
      body: JSON.stringify(draft),
    })
  }

  async setDiscoverable(discoverable: boolean): Promise<Discoverability> {
    return this.#http.request<Discoverability>('/profile/discoverability', {
      method: 'PUT',
      body: JSON.stringify({ discoverable }),
    })
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **Image bytes travel as base64 in JSON, in both directions, and that is a decision.**
   *
   * The alternative — raw binary with an `image/*` content type — is the conventional shape and
   * was rejected for three reasons specific to this codebase:
   *
   *   1. `contracts/openapi.json` is generated from Fastify route schemas and checked in CI. A
   *      binary body and a binary response are the two shapes that generator expresses least
   *      well, and a route whose schema does not describe it is a route the contract check
   *      cannot see (`routes/index.ts`).
   *   2. `HttpClient` reads every successful response with `response.json()`. Teaching it a
   *      second decoding path for one endpoint would widen the one module in the client that
   *      constructs requests, for a payload measured in tens of kilobytes.
   *   3. The export already embeds the avatar as base64 (research D11), so base64-over-JSON is
   *      already how this product moves image bytes. One mechanism, not two.
   *
   * The cost is 33% inflation on one small, bounded, server-re-encoded image. The upload route
   * accounts for it in its body limit, so FR-347's "refused before any bytes are stored" is
   * still enforced at the transport rather than after a decode.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   *
   * Returns a data URL so presentation code can render it with no knowledge that a network
   * exists — see the interface for why not a blob URL.
   */
  async readOwnAvatar(): Promise<string | null> {
    const body = await this.#http.request<AvatarBody | null>('/profile/avatar')
    return body ? `data:${body.contentType};base64,${body.base64}` : null
  }

  async uploadAvatar(image: Blob): Promise<void> {
    await this.#http.request<void>('/profile/avatar', {
      method: 'PUT',
      body: JSON.stringify({ image: await toBase64(image) }),
    })
  }

  async removeAvatar(): Promise<void> {
    await this.#http.request<void>('/profile/avatar', { method: 'DELETE' })
  }
}

/**
 * Base64 for a `Blob`, without `FileReader`.
 *
 * Chunked because `String.fromCharCode(...bytes)` spreads every byte as an argument, and a few
 * hundred thousand arguments overflows the call stack — a five-megabyte upload would fail here
 * rather than at the size check that is supposed to refuse it, reporting the wrong problem.
 */
const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const CHUNK = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }

  return btoa(binary)
}
