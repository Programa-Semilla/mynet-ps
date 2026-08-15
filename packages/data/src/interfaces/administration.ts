/**
 * T065, T091, T108, T126 (013) — the administrative repository interfaces (Principle V).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THESE LIVE IN `@mynet/data` LIKE EVERY OTHER REPOSITORY, AND ARE DELIBERATELY ABSENT FROM
 * THE `Repositories` AGGREGATE.**
 *
 * Principle V's data-access half binds the administrative product in full: no component calls the
 * network or knows a URL, and every read goes through an interface stated in domain terms. So
 * they belong here, beside the attendee product's, sharing one `HttpClient` and one error model.
 *
 * They are **not** added to `Repositories` — the aggregate `packages/platform`'s injected registry
 * exposes — and that is not an oversight. That registry is what `apps/web` consumes through its
 * hooks, so adding an administrative repository to it would put administrative code inside
 * **MyNet's dependency graph and inside its bundle**, which is exactly what decision 33 forbids
 * and what `apps/web/tests/unit/admin-absences.test.ts` exists to catch.
 *
 * They are composed instead in `apps/admin/src/app/services.ts`, that product's own composition
 * root. `specs/013-administrative-foundation/deviations.md` D2 records the decision in full.
 *
 * The two products therefore share repository *interfaces* and share nothing else.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing here is cached**, and the refusal is declared rather than omitted. An operator acting
 * on stale state resolves a report twice, promotes somebody who has withdrawn, or removes a
 * question that is already gone — a different class of error from an attendee reading a stale
 * agenda. 009 answered the same question by not decorating at all, and this follows it: there is
 * no `reads` map to omit from and no `args[0]` to misread.
 */

import type { ConferenceFormat, ConferenceModality, TrackColorToken } from '../contract.js'

/** Which tier the signed-in principal holds (FR-900, FR-924). */
export type OperatorTier = 'platform' | 'organizer'

export interface AdminIdentity {
  readonly displayName: string
  readonly tier: OperatorTier
  /** FR-992 — true while the bootstrapped credential has not been replaced. */
  readonly credentialIsInitial: boolean
}

/**
 * Administrative sign-in, sign-out, and the forced credential replacement.
 *
 * **No method takes an identifier for the acting principal.** Who is calling is decided from the
 * host-only session cookie at the request boundary — the same absence that makes FR-036
 * structural on the attendee side, applied to a second actor.
 */
export interface AdminSessionRepository {
  /**
   * Exchanges credentials for a session.
   *
   * Every failure — unknown address, wrong password, an attendee who is not an organizer, a
   * deactivated operator — arrives as one identical refusal (FR-915). The client must not try to
   * tell them apart, and there is nothing in the response that would let it.
   */
  signIn(credentials: { email: string; password: string }): Promise<void>
  signOut(): Promise<void>
  /** Who is signed in, and at which tier. The only route that answers the tier question. */
  me(): Promise<AdminIdentity>
  /** FR-992. Reachable while the initial credential stands; refused for an organizer with 404. */
  replaceCredential(input: { currentPassword: string; newPassword: string }): Promise<void>
}

/** One row of the queue. **Carries no reported content** — see `AdminReportDetail`. */
export interface AdminReportSummary {
  readonly id: string
  readonly reporterName: string
  readonly reportedName: string
  readonly reportedAt: string
  readonly kind: 'messages' | 'questions'
  readonly resolution: {
    readonly outcome: 'actioned' | 'dismissed'
    readonly note: string
    readonly resolvedAt: string
    readonly resolvedBy: string
  } | null
}

/**
 * The detail view — **the third recorded exception to "private content stays private"**
 * (constitution v4.1.0, decision 38).
 */
export interface AdminReportDetail extends AdminReportSummary {
  /** The reporter's own words. Never in the operator mail; only here (FR-940). */
  readonly reason: string
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **A FIRST-CLASS STATE, NOT AN ERROR** (FR-941).
   *
   * Reported message and question ids are stored as plain arrays rather than foreign keys
   * *precisely because* the content is usually gone before anybody looks — deleted with an
   * account, or withdrawn by its author while it had no votes.
   *
   * **A client that renders this as a failure has misread the contract**, and
   * `report-detail.test.tsx` asserts the opposite. The operator still needs to see who reported
   * whom, when, and why; "the thing they described is no longer here" is information, not a
   * broken screen.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  readonly contentAvailable: boolean
  readonly content: readonly { readonly id: string; readonly body: string }[]
}

export interface AdminReportRepository {
  /** Open and resolved together; the caller separates them (FR-943). */
  list(): Promise<readonly AdminReportSummary[]>
  /** **Reading this writes an audit entry** server-side (FR-995). The list does not. */
  detail(reportId: string): Promise<AdminReportDetail>
  resolve(
    reportId: string,
    resolution: { outcome: 'actioned' | 'dismissed'; note: string },
  ): Promise<void>
  /**
   * Removes a reported question and every vote on it (FR-950, FR-951).
   *
   * **Takes the report it was reached from**, because removal is reachable only from a report —
   * an operator cannot browse questions and remove ones they dislike. Enforced server-side; this
   * signature is what makes the constraint visible at the call site rather than a rule the
   * interface trusts the screen to follow.
   */
  removeQuestion(input: { reportId: string; questionId: string }): Promise<void>
}

export interface AdminConference {
  readonly id: string
  readonly name: string
  readonly organizers: readonly { readonly attendeeId: string; readonly displayName: string }[]
  /**
   * Derived server-side from the absence of a live assignment (FR-936), never stored.
   *
   * Decision 39 makes this load-bearing: a conference left with no organizer enters an explicit
   * state platform operators can **see**, because reverting ownership silently to the platform
   * tier would be a tidier invariant that hides the event nobody is prompted to act on.
   */
  readonly unassigned: boolean
}

export interface AdminConferenceRepository {
  /** Every conference for the platform tier; assigned ones only for an organizer (FR-926). */
  list(): Promise<readonly AdminConference[]>
  /** Platform tier only. The attendee must already be registered for the conference (FR-930). */
  promote(input: { eventId: string; attendeeId: string }): Promise<void>
  /** Platform tier only. Ends authority and leaves the account untouched (FR-934). */
  demote(input: { eventId: string; attendeeId: string }): Promise<void>
  /**
   * Ends a platform operator's access permanently (FR-908).
   *
   * **Deactivation, not deletion** — the row survives so the identity keeps resolving on records
   * that name it (FR-909). There is deliberately no `deleteOperator`: an operator is not an
   * attendee and has no erasure right in this product.
   */
  deactivateOperator(operatorId: string): Promise<void>
}

/** One track, room or speaker as the programme editor holds it (014). */
export interface AdminTrack {
  readonly id: string
  readonly name: string
  /**
   * A theme token NAME, never a colour value (FR-136, FR-1004).
   *
   * **Typed from the generated contract rather than as `string`.** It was `string`, which is what
   * let `CatalogForms.tsx` carry a third hand-written copy of the closed set with nothing binding
   * it to the server's — so adding a token server-side left the form unable to offer it, and
   * removing one left the form offering a value every write refuses. See `contract.ts`.
   */
  readonly colorToken: TrackColorToken
}

export interface AdminRoom {
  readonly id: string
  readonly name: string
}

export interface AdminSpeaker {
  readonly id: string
  readonly name: string
  readonly title: string | null
  readonly company: string | null
}

/**
 * What an organizer is shown when choosing between deleting a session and cancelling it
 * (FR-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **COUNTS, AND THERE IS NO FIELD HERE THAT COULD HOLD A NAME.**
 *
 * FR-1042 forbids any administrative read of a note, a message, or the identity of anybody who
 * saved, questioned or voted on a session. This type is where that is enforced on the client
 * side: there is nothing to render but four integers, and no method below accepts an argument
 * that would ask for more.
 *
 * The spec records that the aggregate is thin at small scale — with three registrants, "1
 * attendee wrote a note" is close to a name — and names the mitigation available without an
 * owner decision: a **threshold** rather than a count. That change is this type and its two
 * readers, and nothing else.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface AdminEngagementCounts {
  readonly saved: number
  readonly notes: number
  readonly questions: number
  readonly votes: number
}

export interface AdminSession {
  readonly id: string
  readonly title: string
  readonly summary: string | null
  readonly startsAt: string
  readonly endsAt: string
  readonly trackId: string
  /**
   * Nullable since 014 tranche 2 (FR-1049): a virtual session carries an access link instead
   * of a room, and which of the two a session must carry is decided by the conference's
   * modality (FR-1050a), server-side.
   */
  readonly roomId: string | null
  /**
   * The dedicated, validated joining link (FR-1052, FR-1053) — `https:` only, never carried
   * in the summary, published the moment it is written (FR-1055).
   */
  readonly accessLink: string | null
  readonly speakerIds: readonly string[]
  /** Stored state, never derived from the clock (FR-1020). Null means it is happening. */
  readonly cancelledAt: string | null
  /**
   * 014 tranche 2 (FR-1060–FR-1062a) — mandatory sessions carry neither bound; optional ones
   * carry both. The form presents the bounds only on an optional session, because a field
   * that is meaningless on the kind being edited is a field somebody will fill in.
   */
  readonly kind: 'mandatory' | 'optional'
  readonly capacity: number | null
  readonly enrolmentClosingOffsetHours: number | null
  readonly engagement: AdminEngagementCounts
  /**
   * T148 (014 tranche 2) — the held-places figure, **a separate field beside the four
   * engagement counts and never a fifth member of them** (v5.3.0 O2, FR-1077b, research R15):
   * the delete decision derives from summing `engagement`, so a fifth count there would make
   * places-held sessions undeletable — the opposite of what O2 ratifies. This is the figure
   * the delete-versus-cancel confirmation must present (FR-1077c) and pass back as
   * `placesSeen` when the organizer confirms.
   */
  readonly placesHeld: number
}

export interface AdminProgramme {
  readonly conference: {
    readonly id: string
    readonly name: string
    readonly location: string
    readonly startsOn: string
    readonly endsOn: string
    readonly timezone: string
    /** Not a credential (FR-317a). Shown so an organizer can distribute it (FR-1009). */
    readonly joinCode: string
    /** False once any session exists (FR-1015), so the control matches what the server will do. */
    readonly timezoneEditable: boolean
    /**
     * 014 tranche 2 (FR-1045, FR-1046) — governs which of room and access link this
     * conference's sessions carry (FR-1050a), which is what the session form reads to decide
     * which fields to offer. Correctable after creation through `patchConference` (FR-1059).
     */
    readonly modality: ConferenceModality
    /** A descriptive label with no behavioural consequence (FR-1047). Nothing branches on it. */
    readonly format: ConferenceFormat | null
  }
  readonly tracks: readonly AdminTrack[]
  readonly rooms: readonly AdminRoom[]
  readonly speakers: readonly AdminSpeaker[]
  readonly sessions: readonly AdminSession[]
}

export interface AdminSessionInput {
  readonly title: string
  readonly summary: string | null
  readonly startsAt: string
  readonly endsAt: string
  readonly trackId: string
  /** Null for a link-only session (FR-1049). The server decides validity by modality. */
  readonly roomId: string | null
  /** `https:` only, validated server-side and never fetched (FR-1053). */
  readonly accessLink: string | null
  readonly speakerIds: readonly string[]
  /** Absent bounds on a mandatory session; both present on an optional one (FR-1062a). */
  readonly kind: 'mandatory' | 'optional'
  readonly capacity: number | null
  readonly enrolmentClosingOffsetHours: number | null
}

/**
 * T036 (014) — **conference content authoring, in the ADMINISTRATIVE product only** (FR-1001,
 * FR-1003).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE WRITE PATH `CatalogRepository` STILL DOES NOT HAVE, AND THE SEPARATION IS THE
 * WHOLE OF FR-1003.**
 *
 * MyNet consumes `CatalogRepository`, which declares reads and nothing else — *in perpetuity*,
 * asserted by name-shape in `catalog-read-only.test.ts`. Adding a write there would put an
 * authoring capability in the attendee bundle whether or not any component called it.
 *
 * This interface is composed only in `apps/admin/src/app/services.ts` and is deliberately absent
 * from the `Repositories` aggregate, like every other administrative repository — see this file's
 * header for why that absence is what keeps administrative code out of MyNet's dependency graph.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Every method names its conference.** Authority is a server-enforced predicate over the
 * principal and the named conference (FR-1035), so an `eventId` here is not a convenience: it is
 * the operand of the check. A method without one would be a method the server could not
 * authorise.
 */
export interface AdminCatalogRepository {
  /** The whole programme, with engagement counts per session (FR-1025). */
  programme(eventId: string): Promise<AdminProgramme>

  createTrack(eventId: string, input: { name: string; colorToken: TrackColorToken }): Promise<void>
  updateTrack(
    eventId: string,
    id: string,
    input: { name: string; colorToken: TrackColorToken },
  ): Promise<void>
  /** Refused with a reason while any session references it (FR-1017). */
  deleteTrack(eventId: string, id: string): Promise<void>

  createRoom(eventId: string, input: { name: string }): Promise<void>
  updateRoom(eventId: string, id: string, input: { name: string }): Promise<void>
  deleteRoom(eventId: string, id: string): Promise<void>

  createSpeaker(
    eventId: string,
    input: { name: string; title: string | null; company: string | null },
  ): Promise<void>
  updateSpeaker(
    eventId: string,
    id: string,
    input: { name: string; title: string | null; company: string | null },
  ): Promise<void>
  deleteSpeaker(eventId: string, id: string): Promise<void>

  /** Returns any same-room overlap warnings (FR-1016). Overlap is permitted, never refused. */
  createSession(eventId: string, input: AdminSessionInput): Promise<{ warnings: readonly string[] }>
  updateSession(
    eventId: string,
    id: string,
    input: AdminSessionInput,
  ): Promise<{ warnings: readonly string[] }>

  /**
   * Permitted only while **zero** attendees have engaged (FR-1018). Otherwise refused with a
   * reason and the counts, and cancellation offered instead (FR-1019).
   *
   * **`placesSeen` is the held-places figure the confirmation SHOWED the organizer**
   * (FR-1077b): held places are not engagement (v5.3.0 O2), so an optional session with
   * places held stays deletable, and this figure is re-read server-side inside the deleting
   * transaction under the same lock — a delete whose count has RISEN since refuses with
   * `places_changed` and the current figure, to be re-presented rather than acted on.
   */
  deleteSession(eventId: string, id: string, placesSeen: number): Promise<void>

  /** Stored state, and **the one authoring act that reaches attendees' phones** (FR-1026). */
  cancelSession(eventId: string, id: string): Promise<void>
  /** **Dispatches nothing** (FR-1024). */
  reinstateSession(eventId: string, id: string): Promise<void>

  /**
   * Refuses a range that would orphan a session, and a timezone change once one exists.
   *
   * T190 (014 tranche 2) — also accepts `modality` and `format` (FR-1059), so no value chosen
   * at creation is permanently uncorrectable. A modality change is refused with
   * `modality_conflicts_sessions`, **naming the sessions**, while any existing session would
   * violate FR-1050a under the new value; a format change is always permitted (FR-1047).
   */
  patchConference(
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
  ): Promise<void>

  /**
   * **Both tiers** (FR-1007, FR-1008). An organizer is assigned to what they create, in the same
   * transaction — and creating grants no authority over any other conference and no platform
   * capability (FR-1010): it is not a promotion path.
   *
   * Returns the minted join code so the organizer can distribute it (FR-1009). There is no
   * `deleteConference` at any tier (FR-1011), and its absence is asserted.
   *
   * **Modality is required** (FR-1059b): FR-1048 forbids a default, so a creation carrying
   * none is refused with `modality_missing`. Format stays optional (FR-1047).
   */
  createConference(input: {
    name: string
    location: string
    startsOn: string
    endsOn: string
    timezone: string
    modality: ConferenceModality
    format: ConferenceFormat | null
  }): Promise<{ id: string; joinCode: string }>

  /**
   * T146 (014 tranche 2) — the enrolment roster: the names of the attendees holding places in
   * one optional session (FR-1073, constitution v5.3.0 O1 — the **fourth** recorded Principle
   * VIII exception, and the first administrative read of attendee state this project has ever
   * permitted). Four bounds, all server-enforced (FR-1073a): only enrolment — saves, notes,
   * questions and votes stay counts-only with nobody identified; only an assigned organizer,
   * or a platform operator by the authority they already hold; only this conference's
   * sessions; and names only — no identifier, no address, no route to anything further about
   * the person. The attendee was told before they enrolled (FR-1074). An empty roster is an
   * ordinary state, not a failure.
   */
  listEnrolments(
    eventId: string,
    sessionId: string,
  ): Promise<readonly { readonly displayName: string }[]>
}

/** One value of the vocabulary, as the administrative screen holds it (014 tranche 2). */
export interface AdminSector {
  readonly id: string
  readonly label: string
  /**
   * Set while the value is withdrawn from NEW choice (FR-1094a). Holders keep it either way —
   * retirement writes to no attendee record — and clearing this reverses the withdrawal with
   * no repair (FR-1094b). It is an attribute of the value, never a lifecycle: there is no
   * unpublished vocabulary value and no further state may be added to one.
   */
  readonly retiredAt: string | null
}

export interface AdminSubsector extends AdminSector {
  /** The sector this refines — exactly one, always (FR-1087). */
  readonly sectorId: string
}

export type AdminInterestOption = AdminSector

/** What creating or renaming a value submits: the label, and nothing else. */
export interface VocabularyValueInput {
  readonly label: string
}

/**
 * T172 (014 tranche 2) — **authoring the product-wide vocabulary, platform tier ONLY**
 * (FR-1085, FR-1089, FR-1093a, R17).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE NAMES A CONFERENCE, AND NO METHOD NAMES A PERSON — BOTH ABSENCES ARE THE
 * INTERFACE.**
 *
 * The vocabulary is cross-event reference data no conference owns, so unlike every method on
 * `AdminCatalogRepository` there is no `eventId` operand: the server's predicate is the
 * platform tier itself, and a conference organizer is refused with the same 404 as a route that
 * does not exist. And it is reference data rather than anything about a person (FR-1093a): the
 * addresses name lists — sectors, subsectors, interests — never their holders, there is no
 * method that could reach an attendee from a value, and no reading of any signature here can
 * name somebody (FR-1099b). What an attendee CHOSE stays on their own record, editable by them
 * alone in MyNet, and no member of this interface can touch it (FR-1093).
 *
 * Composed only in `apps/admin/src/app/services.ts`, absent from the `Repositories` aggregate,
 * undecorated — this file's header carries all three arguments and they are unchanged.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface AdminVocabularyRepository {
  /** Every value, retired ones included — this screen is where retirement is reversed. */
  sectors(): Promise<readonly AdminSector[]>
  subsectors(): Promise<readonly AdminSubsector[]>
  interests(): Promise<readonly AdminInterestOption[]>

  createSector(input: VocabularyValueInput): Promise<void>
  /** Refused with `vocabulary_rename_held` while any attendee holds the value (FR-1094c). */
  renameSector(id: string, input: VocabularyValueInput): Promise<void>
  /** Reversible, and writes to NO attendee record: holders keep the value (FR-1094). */
  retireSector(id: string): Promise<void>
  unretireSector(id: string): Promise<void>
  /** Refused while held (`vocabulary_delete_held`) or refined (`sector_has_subsectors`). */
  deleteSector(id: string): Promise<void>

  /** Requires an existing, unretired sector — `sector_retired` otherwise (FR-1087). */
  createSubsector(input: VocabularyValueInput & { sectorId: string }): Promise<void>
  renameSubsector(id: string, input: VocabularyValueInput): Promise<void>
  retireSubsector(id: string): Promise<void>
  unretireSubsector(id: string): Promise<void>
  deleteSubsector(id: string): Promise<void>

  createInterest(input: VocabularyValueInput): Promise<void>
  renameInterest(id: string, input: VocabularyValueInput): Promise<void>
  retireInterest(id: string): Promise<void>
  unretireInterest(id: string): Promise<void>
  deleteInterest(id: string): Promise<void>
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DELIBERATELY ABSENT FROM THIS FILE, EACH FOR ITS OWN REASON.**
 *
 * - **No audit repository.** FR-999 gives the trail no read route and no client write path, so an
 *   interface for it would declare no methods and would advertise a capability that must never
 *   exist. `deviations.md` D1 records this against T036.
 * - **No profile read or write, at any tier** (FR-973). Decision 33: *conference content is
 *   authorable, a person is not.*
 * - **Conference content authoring HAS LANDED — see `AdminCatalogRepository` above.** This entry
 *   used to read *"that is 012, and FR-974 keeps `catalog-read-only.test.ts` in force until it
 *   lands"*. It landed as **014**, on constitution v5.2.0, and `catalog-read-only.test.ts` is
 *   **still in force**: research R1 found its two subjects are the attendee query module and
 *   `CatalogRepository`, and authoring is neither. FR-191 survives literally.
 * - **No join-code method.** That is 013, and FR-975 keeps `join-grants-nothing.test.ts` in force.
 * - **No attendee suspension, removal or restriction** (FR-955), and no avatar moderation
 *   (FR-954) — register entry 19's standard is undecided, and building the action would decide it
 *   by inference.
 * - **No reporter-facing status of any kind** (FR-946). There is no method here an attendee could
 *   call about their own report, and no argument any of these accepts that would name one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
