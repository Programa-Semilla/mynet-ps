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

import type { TrackColorToken } from '../contract.js'

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
  readonly roomId: string
  readonly speakerIds: readonly string[]
  /** Stored state, never derived from the clock (FR-1020). Null means it is happening. */
  readonly cancelledAt: string | null
  readonly engagement: AdminEngagementCounts
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
  readonly roomId: string
  readonly speakerIds: readonly string[]
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
   */
  deleteSession(eventId: string, id: string): Promise<void>

  /** Stored state, and **the one authoring act that reaches attendees' phones** (FR-1026). */
  cancelSession(eventId: string, id: string): Promise<void>
  /** **Dispatches nothing** (FR-1024). */
  reinstateSession(eventId: string, id: string): Promise<void>

  /** Refuses a range that would orphan a session, and a timezone change once one exists. */
  patchConference(
    eventId: string,
    input: Partial<{
      name: string
      location: string
      startsOn: string
      endsOn: string
      timezone: string
    }>,
  ): Promise<void>

  /**
   * **Both tiers** (FR-1007, FR-1008). An organizer is assigned to what they create, in the same
   * transaction — and creating grants no authority over any other conference and no platform
   * capability (FR-1010): it is not a promotion path.
   *
   * Returns the minted join code so the organizer can distribute it (FR-1009). There is no
   * `deleteConference` at any tier (FR-1011), and its absence is asserted.
   */
  createConference(input: {
    name: string
    location: string
    startsOn: string
    endsOn: string
    timezone: string
  }): Promise<{ id: string; joinCode: string }>
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
 *   lands"*. It landed as **014**, on constitution v4.2.0, and `catalog-read-only.test.ts` is
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
