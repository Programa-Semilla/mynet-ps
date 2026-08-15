/**
 * T031 (004) — the attendee's own description of themselves (FR-334–FR-363).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY** (FR-335, FR-385).
 *
 * `getOwn` and `saveOwn` are named for the property that makes them safe: there is no other
 * profile they could reach. FR-335 requires an attendee to edit every field of their own
 * profile and **no field of anyone else's**, and the absence of a parameter is what makes that
 * structural rather than a check somebody has to remember to write.
 *
 * **Reading another attendee's profile is deliberately not here.** It belongs to 006's Discover
 * directory, it is conference-scoped (`GET /events/:eventId/attendees/:attendeeId`), and it
 * carries three server-side conditions this interface has no business restating. Putting it on
 * the same interface as `saveOwn` would put "read anyone" one autocomplete away from "write
 * mine".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** FR-339 — chosen from stated options, because 006 filters on them and free text cannot. */
export type NetworkingIntent = 'open_to_meetings' | 'open_to_messages' | 'not_networking'
export type Availability = 'available' | 'busy'

/** What the attendee authored. Every field optional — an incomplete profile is valid (FR-336). */
export interface ProfileDraft {
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  /**
   * T178 (014 tranche 2) — the taxonomy fields (FR-1090), every one optional (FR-1091).
   *
   * Sector and subsector are LABELS chosen from the controlled vocabulary — never typed
   * (FR-1087) — and the server accepts, besides the currently choosable, every value the
   * attendee ALREADY HOLDS: retained free text and retired choices alike (FR-1095b). Whole-
   * profile semantics make that editor-critical: a save omitting a held value REMOVES it, so
   * the editor presents held-but-unchoosable values as present and removable, never silently
   * dropped. The subsector must belong to the chosen sector; resolving a mismatch after a
   * sector change is the attendee's own act inside their own save (FR-1087).
   */
  readonly sector: string | null
  readonly subsector: string | null
  /** Free text, bounded like the headline — what this person actually makes or does (REQ-030). */
  readonly productiveActivity: string | null
  readonly networkingIntent: NetworkingIntent | null
  readonly availability: Availability | null
  /** Bounded in count and in length; the editor surfaces both as they are approached (FR-337). */
  readonly interests: readonly string[]
}

/** The attendee's own profile, as only they see it (FR-340). */
export interface OwnProfile extends ProfileDraft {
  readonly displayName: string
  readonly email: string
  /** The attendee's own setting (FR-362). Not the same as being visible — see below. */
  readonly discoverable: boolean
  /** FR-325b — what verification adds, so the gate is discoverable rather than mysterious. */
  readonly emailVerified: boolean
  readonly hasAvatar: boolean
}

/**
 * The answer to changing discoverability (FR-359, FR-362).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`effectivelyVisible` is the field that matters, and it is why this is not a boolean.**
 *
 * An unverified attendee who turns discoverability on is still invisible to everyone (FR-359).
 * A response carrying only the flag would tell them the exact opposite of what is true, which
 * is precisely what FR-362 asks this surface not to do.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface Discoverability {
  readonly discoverable: boolean
  readonly emailVerified: boolean
  readonly effectivelyVisible: boolean
}

export interface ProfileRepository {
  /**
   * The signed-in attendee's profile.
   *
   * **Never fails because the profile is empty** (FR-341). A new account resolves to a profile
   * whose every field is null — an invitation to complete it, not a broken record and not a
   * refusal the caller has to translate.
   */
  getOwn(): Promise<OwnProfile>

  /**
   * Replaces the signed-in attendee's profile.
   *
   * **Whole-profile semantics: an omitted field clears it.** The caller sends the complete
   * draft, so "field absent" has exactly one meaning and there is no partial-update path in
   * which a cleared field and an unmentioned one look the same.
   */
  saveOwn(draft: ProfileDraft): Promise<OwnProfile>

  /** Sets discoverability and reports what it **effectively** means (FR-362, FR-363). */
  setDiscoverable(discoverable: boolean): Promise<Discoverability>

  /**
   * The signed-in attendee's avatar as a data URL, or `null` when they have none.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A data URL rather than a link, deliberately.** An `<img src>` needs something to point
   * at, and handing presentation code a URL would mean handing it knowledge that HTTP exists —
   * which is the one thing Principle V and FR-045 place out of its reach. A blob URL would
   * avoid that too, at the cost of a revocation lifecycle in every component that renders a
   * face.
   *
   * The cost is bounded by the format: one avatar, one stored size, re-encoded server-side.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readOwnAvatar(): Promise<string | null>

  /**
   * Uploads an image as the avatar, replacing any previous one (FR-346, FR-350).
   *
   * The bytes are decoded, resized and **re-encoded server-side**, so metadata absence is a
   * property of the operation rather than something the client is trusted to have done
   * (FR-349, research D8). Rejects when the image is too large or is not a decodable image of
   * an accepted type — determined by inspection, never by the filename (FR-347).
   */
  uploadAvatar(image: Blob): Promise<void>

  /** Removes the avatar; the non-photographic fallback returns (FR-346, FR-351). */
  removeAvatar(): Promise<void>
}
