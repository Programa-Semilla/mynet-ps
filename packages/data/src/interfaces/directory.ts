/**
 * T029 (006) — the attendee directory, in domain terms (research D1, Principle V).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ITS OWN REPOSITORY, NOT A THIRD VERB ON `IdentityRepository`** (research D1).
 *
 * The idea-inbox entry framed Discover's listing as a third registration verb, next to
 * `joinConference` and `withdrawFromConference`. It is not. Those two are *lifecycle*
 * operations on the reader's own membership; this is about **people**, and membership is
 * merely its filter. Putting a "read every co-attendee" method on the interface that also
 * carries "delete my account" would put two unrelated subjects one autocomplete apart.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO METHOD HERE ACCEPTS THE READER'S ATTENDEE IDENTIFIER**, which is the rule every
 * repository in this package states in its own file (see `agenda.ts`, `profile.ts`). The
 * reader is decided by the sign-in session at the request boundary.
 *
 * `get` **does** name a *target* attendee, and that is the same narrowing exception 004
 * recorded when it shipped `GET /events/:eventId/attendees/:attendeeId`: the identifier can
 * only narrow a set three server-side conditions have already bounded, and both verbs here are
 * reads. Nothing in this interface acts on anybody.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * What the caller is asking the directory to narrow to.
 *
 * `q`, `role` and `interest` combine **conjunctively** (FR-408) — the server ANDs them. Every
 * field is optional, and the empty query is the whole directory.
 */
export interface DirectoryQuery {
  /**
   * Free-text search over display name, company, role and headline — case- **and
   * accent-insensitively**, because the product's conferences are Spanish-language and
   * "Munoz" must find "Muñoz" (research D5).
   *
   * **Never matches email** (FR-407). Email is not in the projection, not in the predicate,
   * and not in the response.
   */
  readonly q?: string
  /** Exact role filter. */
  readonly role?: string
  /** Exact interest filter. */
  readonly interest?: string
  /**
   * Opaque to every caller. It encodes the previous page's last
   * `(sharedInterestCount, attendeeId)` pair, and nothing outside the server may parse or
   * construct one — a cursor the client could author is a cursor the client could use to
   * re-order or widen the result set.
   */
  readonly cursor?: string
  /** Page size. **Bounded server-side**, so a caller cannot ask for the whole conference. */
  readonly limit?: number
}

/**
 * One card in the directory. Not stored anywhere — it exists as a row of the listing query and
 * its lifetime is that response (data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`email` AND VERIFICATION STATE ARE ABSENT, AND THEIR ABSENCE IS THE REQUIREMENT**
 * (FR-406, SC-406).
 *
 * Not "absent unless asked for" and not "present but unused" — absent. Every attendee in this
 * listing is verified, because unverified attendees are excluded by the query rather than
 * marked in the response, so there is no verification state left to carry. A field would be
 * both redundant and a disclosure.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface DirectoryEntry {
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  /**
   * T180 (014 tranche 2) — the productive-activity description (FR-1099d): on the card because
   * it joined the free-text search, and a description somebody can search for is one they must
   * also be able to read. Absent entirely when unset — no empty line, no placeholder (FR-1092).
   * Sector and subsector are deliberately NOT here: their route into Discover is the open
   * filter question (FR-1099, T214).
   */
  readonly productiveActivity: string | null
  readonly networkingIntent: string | null
  readonly availability: 'available' | 'busy' | null
  readonly interests: readonly string[]
  /**
   * How many interests this attendee shares with the reader.
   *
   * **May be `0`, and a zero-overlap attendee still appears** — the ranking is a `LEFT JOIN`,
   * so they rank last rather than vanishing (FR-411). This is the value the card displays
   * (FR-412), which is what makes FR-413 checkable: the ranking may read only what the card
   * shows, and this *is* what the card shows.
   */
  readonly sharedInterestCount: number
  /**
   * The card rendition as a data URL, or `null` when the attendee has no avatar.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Embedded in the listing, deliberately** (FR-456, SC-407). Twenty-four cards are one
   * request, not twenty-five: a per-card avatar fetch is the N-round-trip problem this shape
   * exists to avoid, and it is what would make a directory page arrive as a grid of
   * placeholders resolving one by one.
   *
   * **Never the 512px profile rendition** — this is the 96px card one (research D2). The
   * larger rendition continues to serve the profile view through 004's existing avatar route.
   *
   * A data URL rather than a link, for the reason `ProfileRepository.readOwnAvatar` records at
   * length: an `<img src>` needs something to point at, and handing presentation code a URL
   * would hand it knowledge that HTTP exists.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly avatar: string | null
}

/**
 * One page of the directory.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **There is no total, no withheld count, and no field distinguishing a hidden attendee from
 * a nonexistent one** (FR-404). A listing already narrows disclosure by existing — absence
 * tells a reader who knows somebody is here that they are not registered, not discoverable,
 * or not verified — and that narrowing is bounded to exactly that. Any of those three fields
 * would widen it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface DirectoryPage {
  readonly attendees: readonly DirectoryEntry[]
  /** `null` when this is the last page. Opaque; hand it back unchanged to read the next. */
  readonly nextCursor: string | null
}

/**
 * A co-attendee's full profile, as the profile view renders it.
 *
 * Mirrors 004's `GET /events/:eventId/attendees/:attendeeId` response, which this feature
 * consumes **unchanged** — that is what makes the profile view inherit its four-way
 * indistinguishable refusal by construction (research D14). `contract.ts` binds this to the
 * generated contract type, so a route that stopped producing one of these fields would fail
 * the build rather than an attendee.
 *
 * `hasAvatar` rather than the bytes: the profile view reads the 512px rendition through 004's
 * avatar route, which re-checks visibility before answering.
 */
export interface VisibleProfile {
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  /**
   * T179 (014 tranche 2) — the taxonomy, shown only where set (FR-1092): an unset field is
   * absent from the view, never a blank row or a dash. Governed by the one visibility decision
   * this whole shape already answers to (FR-1097) — no field here has its own audience.
   */
  readonly sector: string | null
  readonly subsector: string | null
  readonly productiveActivity: string | null
  readonly networkingIntent: string | null
  readonly availability: 'available' | 'busy' | null
  readonly interests: readonly string[]
  readonly hasAvatar: boolean
}

export interface DirectoryRepository {
  /**
   * One page of the conference directory (FR-401–FR-415).
   *
   * **Every visibility condition is evaluated server-side** (FR-409) and an excluded attendee
   * is *absent from the payload entirely*, never present-and-hidden (FR-402) — a response
   * carrying a hidden attendee for the client to filter has already disclosed them.
   *
   * A conference where nobody is discoverable answers with an **empty page, not an error**.
   * The caller renders an empty state worded so it discloses no cause (FR-415).
   *
   * **Not cached, and that is a declaration rather than an omission** (FR-466). Nothing this
   * feature reads is available offline; 005's caching decorator is deliberately not applied.
   */
  list(eventId: string, query: DirectoryQuery): Promise<DirectoryPage>

  /**
   * One co-attendee's profile, or `null` (FR-431).
   *
   * `null` covers *not registered*, *does not exist*, *not discoverable* and *not verified* —
   * **indistinguishably**, because the server answers all four identically and this method
   * has no field in which to tell them apart.
   */
  get(eventId: string, attendeeId: string): Promise<VisibleProfile | null>

  /**
   * A co-attendee's avatar at the **profile** rendition, as a data URL, or `null`.
   *
   * Separate from `get` because the profile view needs the large rendition and the listing
   * carries only the card one — and because 004's avatar route re-checks visibility before
   * answering, so "no avatar" and "not visible to you" are the same answer here too (FR-351).
   */
  readAvatar(eventId: string, attendeeId: string): Promise<string | null>
}
