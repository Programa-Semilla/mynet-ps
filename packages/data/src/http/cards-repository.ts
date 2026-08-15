import type { CardRepository, HeldCard, SharedCard } from '../interfaces/cards.js'
import type { HttpClient } from './client.js'

/**
 * T033 (008) — the HTTP card repository.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT ONE ADDRESS HERE BEGINS `/events/`, AND THAT ABSENCE IS THE MOST IMPORTANT THING ON
 * THIS PAGE** (FR-614, standing decision 7, research R1).
 *
 * A held card is cross-event: it outlives the conference it was shared at, the conference
 * ending, and the sharer turning discoverability off. There is therefore no conference in the
 * path to guard — and the consequence is subtler than "the event guard does not apply".
 * `apps/api/tests/unit/event-scope-audit.test.ts` examines a route only if it names an event, so
 * it would **pass these routes without inspecting anything and report success.**
 *
 * The server replaces that protection with a branded `CardScope`, the `requireHeldCard` guard,
 * and a **third** route audit. Nothing on this side of the wire substitutes for any of it, and
 * nothing here should look as though it does.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Refusals are indistinguishable, and this class deliberately does nothing to tell them
 * apart.** A recipient who does not exist, who shares no conference, who is not discoverable,
 * and a malformed identifier all arrive as the same 404 (FR-607); a blocked share arrives as a
 * reasonless 409 (FR-608). A client that appeared to know which had happened would be inventing
 * information it does not have — and in the block case, disclosing what FR-608 forbids.
 *
 * **No method takes the acting attendee's identifier.** Identity travels as the HttpOnly sign-in
 * cookie `HttpClient` attaches to every request, so there is nothing here to get wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO REVOCATION IN THIS FILE, AND THERE IS NO ADDRESS TO ADD ONE AT** (FR-618).
 *
 * If you are here because an "unshare" or "remove contact" control needed a `DELETE`: that is
 * the surface FR-618 refuses. You cannot un-give a card somebody already holds, and a product
 * that pretended otherwise would be lying about what it had done with the data. Blocking is the
 * mechanism for ending contact — read-side, reversible, and destroying nothing.
 * `apps/api/tests/unit/card-audit.test.ts` fails the build if such a route is ever registered.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** The avatar shape the API embeds, before it becomes a data URL. */
interface AvatarBody {
  readonly contentType: string
  readonly base64: string
}

/** A held card, as it arrives. Identical but for the avatar encoding. */
type HeldCardBody = Omit<HeldCard, 'avatar'> & { readonly avatar: AvatarBody | null }

interface HeldListBody {
  readonly cards: readonly HeldCardBody[]
}

interface SharedListBody {
  readonly cards: readonly SharedCard[]
}

/**
 * Encoded once, so no call site can forget and no identifier can escape into the path.
 *
 * The identifier names the **sharer** — whose card the reader holds — never the reader. See
 * `interfaces/cards.ts` for why that direction is the whole predicate.
 */
const heldPath = (attendeeId: string): string => `/cards/held/${encodeURIComponent(attendeeId)}`

const toHeldCard = (body: HeldCardBody): HeldCard => ({
  ...body,
  avatar: body.avatar ? `data:${body.avatar.contentType};base64,${body.avatar.base64}` : null,
})

export class HttpCardRepository implements CardRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * `POST /cards` with the recipient in the body.
   *
   * The card being given is the **caller's**, so the address cannot name both parties without
   * naming the actor — which FR-640 forbids. The target in the body is the shape that leaves the
   * actor implicit, and it is the same one `HttpBlockRepository.block` uses for the same reason.
   *
   * Idempotent server-side: a repeat answers 200 with the original `sharedAt` rather than 201,
   * and this class does not distinguish the two — the caller has no reason to know which
   * happened, and re-sharing must not read as a fresh event (FR-604).
   */
  async share(attendeeId: string): Promise<SharedCard> {
    return this.#http.request<SharedCard>('/cards', {
      method: 'POST',
      body: JSON.stringify({ attendeeId }),
    })
  }

  /**
   * The whole contacts list in one request, avatars included — the same shape decision 006 made
   * for the directory and 007 for the conversation list, for the same reason: a per-row avatar
   * fetch turns one request into N+1 and renders the destination's landing view as a column of
   * placeholders resolving one by one.
   *
   * **No `eventId` is sent, and none may ever be added.** The list is cross-event (FR-614);
   * scoping it here would silently reintroduce the per-conference disappearance the whole
   * feature exists to prevent.
   */
  async listHeld(): Promise<HeldCard[]> {
    const body = await this.#http.request<HeldListBody>('/cards/held')
    return body.cards.map(toHeldCard)
  }

  async getHeld(attendeeId: string): Promise<HeldCard> {
    return toHeldCard(await this.#http.request<HeldCardBody>(heldPath(attendeeId)))
  }

  async listShared(): Promise<SharedCard[]> {
    const body = await this.#http.request<SharedListBody>('/cards/shared')
    return [...body.cards]
  }
}
