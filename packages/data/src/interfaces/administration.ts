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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DELIBERATELY ABSENT FROM THIS FILE, EACH FOR ITS OWN REASON.**
 *
 * - **No audit repository.** FR-999 gives the trail no read route and no client write path, so an
 *   interface for it would declare no methods and would advertise a capability that must never
 *   exist. `deviations.md` D1 records this against T036.
 * - **No profile read or write, at any tier** (FR-973). Decision 33: *conference content is
 *   authorable, a person is not.*
 * - **No conference content authoring.** That is 012, and FR-974 keeps `catalog-read-only.test.ts`
 *   in force until it lands.
 * - **No join-code method.** That is 013, and FR-975 keeps `join-grants-nothing.test.ts` in force.
 * - **No attendee suspension, removal or restriction** (FR-955), and no avatar moderation
 *   (FR-954) — register entry 19's standard is undecided, and building the action would decide it
 *   by inference.
 * - **No reporter-facing status of any kind** (FR-946). There is no method here an attendee could
 *   call about their own report, and no argument any of these accepts that would name one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
