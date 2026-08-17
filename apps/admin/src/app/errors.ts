import { NotAuthenticatedError, RequestRefusedError, SessionExpiredError } from '@mynet/data'

/**
 * T083 (013) — **classify on `error.code`, never on the class** (contracts, 008's defect).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`ApiError extends RequestRefusedError` AND *EVERY* NON-2xx THROWS `ApiError`.**
 *
 * So `instanceof RequestRefusedError` catches 401, 403, 404, 409, 429 and 500 alike — which is
 * precisely what swallowed 008's deliberately-written messages: the routes wrote refusals to be
 * read, and the client rendered one generic sentence for all of them.
 *
 * This feature has **seven** distinguishable outcomes, and a test requires all seven to be
 * different from each other (`error-classification.test.ts`). That property is the one
 * `instanceof` classification destroys, and it is the one that would have caught 008.
 *
 * The seven, from `contracts/administrative.md`:
 *
 *   1. `not_authenticated`        — no session, expired, unknown token. **401, no detail.**
 *   2. `invalid_credentials`      — all four sign-in failures, indistinguishable (FR-915).
 *   3. `credential_not_replaced`  — 403 **with an explanation**; the reader can fix it.
 *   4. `not_found`                — wrong tier, gone, or never existed. One answer for all.
 *   5. `report_already_resolved`  — 409 **with an explanation**; the reader's own conflict.
 *   6. `refused`                  — a reasonless conflict (already an organizer).
 *   7. `too_many_attempts`        — throttled; delay only, never denial (FR-916).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The outcomes this client distinguishes. `unknown` is the honest catch-all, not a default.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **014 ADDED SIX, AND THEY ARRIVED AS TWO.**
 *
 * The authoring routes were written with four distinct 409 explanations all carrying `refused`
 * and two distinct 400 explanations all carrying `validation_failed`. This file classified them
 * correctly — on the code — and so rendered *"That could not be completed."* for four different
 * situations and *"Something went wrong."* for two more.
 *
 * That is 008's defect arriving from the other direction: 008 classified on the **class** and
 * collapsed codes that differed; here the classification was right and the **codes** were not
 * distinct. Both produce the same outcome, which is the one this product refuses to ship: the
 * server writes an explanation and the reader never sees it.
 *
 * The fix was on the server — six `ErrorCode`s, following `question_has_votes` and
 * `own_question` — and these six are their counterparts. Each says something actionable about
 * the **caller's own conference**, which is the test every explained refusal here must pass.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export type AdminFailure =
  | 'not_authenticated'
  | 'invalid_credentials'
  | 'credential_not_replaced'
  | 'not_found'
  | 'report_already_resolved'
  | 'refused'
  | 'too_many_attempts'
  // 014 — the six authoring refusals (contracts/authoring.md).
  | 'still_referenced'
  | 'session_has_engagement'
  | 'would_orphan_sessions'
  | 'timezone_frozen'
  | 'outside_conference_days'
  | 'ends_before_start'
  // Added by the deep review: three more refusals that would otherwise render as `unknown`.
  | 'unknown_timezone'
  | 'conference_ends_before_start'
  | 'malformed_time'
  // 014 tranche 2 — the five vocabulary refusals (contracts/tranche-2.md). Each its own code,
  // per this file's whole thesis: the two "held" refusals differ in what to do next (retire
  // versus retire-plus-create), and folding them would hide exactly the sentence that teaches
  // FR-1094's rule at the moment an operator meets it.
  | 'vocabulary_label_taken'
  | 'vocabulary_rename_held'
  | 'vocabulary_delete_held'
  | 'sector_retired'
  | 'sector_has_subsectors'
  // 014 tranche 2 — the optional-session refusals (FR-1059b, FR-1061–FR-1065, FR-1077b) and
  // US8's modality and access-link refusals (FR-1050–FR-1053, FR-1058a, FR-1059a). Every one
  // its own outcome: the derived-population test reads the server's `ErrorCode` union, so a
  // code rendered as "Something went wrong" fails the build until somebody decides what an
  // operator should read instead — the mechanism that would have caught this feature's own
  // six-into-two collapse without anybody noticing first.
  | 'modality_missing'
  | 'capacity_invalid'
  | 'closing_offset_invalid'
  | 'mandatory_carries_no_places'
  | 'capacity_below_held'
  | 'kind_committed'
  | 'places_changed'
  | 'session_needs_room_or_link'
  | 'modality_forbids_link'
  | 'modality_forbids_room'
  | 'access_link_invalid'
  | 'access_link_committed'
  | 'modality_conflicts_sessions'
  | 'unreachable'
  | 'unknown'

/**
 * Reads the server's code off a refusal.
 *
 * **Reads `code`, not the class.** `RequestRefusedError` is used only to tell *a refusal the
 * server explained* from *a request that never arrived* — never to decide which refusal it was.
 */
export const classify = (error: unknown): AdminFailure => {
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **These two come FIRST, and the `instanceof RequestRefusedError` gate below cannot see
  // them** — `NotAuthenticatedError` and `SessionExpiredError` extend `Error`, not
  // `RequestRefusedError` (the exact trap `cached.ts` documents for its own predicate). Until
  // 012's walk, the `not_authenticated` case in the switch below was DEAD CODE for a real 401:
  // the transport mints these two classes from the codes before any code-carrying refusal is
  // thrown, so an ended session fell through to `unreachable` and every administrative page
  // told a signed-out operator that MyNet could not be reached — found by walk step A2, the
  // first person to delete the cookie by hand.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (error instanceof NotAuthenticatedError || error instanceof SessionExpiredError) {
    return 'not_authenticated'
  }

  if (error instanceof RequestRefusedError) {
    const code = (error as { code?: string }).code
    switch (code) {
      case 'not_authenticated':
      case 'session_expired':
        return 'not_authenticated'
      case 'invalid_credentials':
        return 'invalid_credentials'
      case 'credential_not_replaced':
        return 'credential_not_replaced'
      case 'not_found':
        return 'not_found'
      case 'report_already_resolved':
        return 'report_already_resolved'
      case 'refused':
        return 'refused'
      case 'too_many_attempts':
        return 'too_many_attempts'
      // 014's six. Each is its own code precisely so this switch can tell them apart.
      case 'still_referenced':
        return 'still_referenced'
      case 'session_has_engagement':
        return 'session_has_engagement'
      case 'would_orphan_sessions':
        return 'would_orphan_sessions'
      case 'timezone_frozen':
        return 'timezone_frozen'
      case 'outside_conference_days':
        return 'outside_conference_days'
      case 'ends_before_start':
        return 'ends_before_start'
      case 'unknown_timezone':
        return 'unknown_timezone'
      case 'conference_ends_before_start':
        return 'conference_ends_before_start'
      case 'malformed_time':
        return 'malformed_time'
      // 014 tranche 2 — the vocabulary's five. Their own codes are what make this switch able
      // to tell them apart at all.
      case 'vocabulary_label_taken':
        return 'vocabulary_label_taken'
      case 'vocabulary_rename_held':
        return 'vocabulary_rename_held'
      case 'vocabulary_delete_held':
        return 'vocabulary_delete_held'
      case 'sector_retired':
        return 'sector_retired'
      case 'sector_has_subsectors':
        return 'sector_has_subsectors'
      // 014 tranche 2 — the optional-session and modality refusals, one case per code.
      case 'modality_missing':
        return 'modality_missing'
      case 'capacity_invalid':
        return 'capacity_invalid'
      case 'closing_offset_invalid':
        return 'closing_offset_invalid'
      case 'mandatory_carries_no_places':
        return 'mandatory_carries_no_places'
      case 'capacity_below_held':
        return 'capacity_below_held'
      case 'kind_committed':
        return 'kind_committed'
      case 'places_changed':
        return 'places_changed'
      case 'session_needs_room_or_link':
        return 'session_needs_room_or_link'
      case 'modality_forbids_link':
        return 'modality_forbids_link'
      case 'modality_forbids_room':
        return 'modality_forbids_room'
      case 'access_link_invalid':
        return 'access_link_invalid'
      case 'access_link_committed':
        return 'access_link_committed'
      case 'modality_conflicts_sessions':
        return 'modality_conflicts_sessions'
      default:
        return 'unknown'
    }
  }

  // Nothing reached the server. `HttpClient` throws `OfflineError` for this, and its message is
  // already truthful — nothing was changed, try again — so the distinction is kept rather than
  // collapsed into `unknown`, which would send somebody to reload a page that will not load.
  return 'unreachable'
}

/**
 * What to say. **Every string differs**, which is what `error-classification.test.ts` asserts.
 *
 * The two that explain themselves — `credential_not_replaced` and `report_already_resolved` —
 * pass the test every explained refusal in this product must pass: *the follow-up question is
 * about the reader.* Everything else says as little as the server did.
 */
/**
 * The structured detail a refusal carried, if this client knows what to do with it.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-1014 SAYS THE REFUSAL "MUST NAME THE SESSIONS CONCERNED", AND IT WAS NAMING NONE.**
 *
 * `classify` reduces a refusal to an enum and `describe` maps it to a fixed sentence, so the two
 * fields the API works to produce — the engagement counts behind a refused deletion, and the
 * sessions a date-range change would orphan — were discarded at this boundary even after the
 * transport stopped dropping them. An organizer was told "Move or cancel them first" about forty
 * sessions they would then have to find by eye.
 *
 * Read here rather than in each screen, so that a caller cannot forget the refusal has more to
 * say, and so the shape is understood in exactly one place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface RefusalDetail {
  /**
   * Named sessions a change would leave invalid: a date range that orphans them (FR-1014), or
   * a modality they would violate (FR-1059a). The caller's own content in both cases.
   */
  readonly sessions?: readonly { readonly id: string; readonly title: string }[]
  /** Counts behind a refused deletion (FR-1019, FR-1025). Counts only — nobody is identified. */
  readonly engagement?: {
    readonly saved: number
    readonly notes: number
    readonly questions: number
    readonly votes: number
  }
  /**
   * T149 (014 tranche 2) — the held-places figure behind `capacity_below_held` and
   * `places_changed` (FR-1061a, FR-1077b). On `places_changed` it is load-bearing beyond the
   * sentence: the confirmation must RE-PRESENT this figure and pass it back as `placesSeen`,
   * or the organizer can never complete a delete while enrolment is moving. A count only,
   * never identity (FR-1075a).
   */
  readonly placesHeld?: number
}

export const detailOf = (error: unknown): RefusalDetail => {
  if (!(error instanceof RequestRefusedError) || !('details' in error)) return {}

  const details = (error as { details?: Record<string, unknown> }).details ?? {}
  const sessions = Array.isArray(details.sessions)
    ? (details.sessions as RefusalDetail['sessions'])
    : undefined
  const engagement =
    details.engagement && typeof details.engagement === 'object'
      ? (details.engagement as RefusalDetail['engagement'])
      : undefined
  const placesHeld = typeof details.placesHeld === 'number' ? details.placesHeld : undefined

  return {
    ...(sessions ? { sessions } : {}),
    ...(engagement ? { engagement } : {}),
    ...(placesHeld === undefined ? {} : { placesHeld }),
  }
}

/**
 * The sentence to show, given an outcome and whatever detail accompanied it.
 *
 * The detail is **appended to** the fixed sentence rather than replacing it: the sentence says what
 * happened and what to do, and the detail says which things it happened to. A message assembled
 * wholly from server text would have no guarantee it was written for a reader rather than a log,
 * which is the property this file exists to keep.
 */
export const describe = (failure: AdminFailure, detail: RefusalDetail = {}): string => {
  switch (failure) {
    case 'not_authenticated':
      return 'Your administrative session has ended. Sign in again to continue.'
    case 'invalid_credentials':
      return 'That email and password combination did not match. Check both and try again.'
    case 'credential_not_replaced':
      return 'Replace your initial password before continuing. It was set for you, so it is not yours yet.'
    case 'not_found':
      return 'That is no longer available. Reload to see the current state.'
    case 'report_already_resolved':
      return 'Another operator has already resolved this report. Reload the queue to see what they decided.'
    case 'refused':
      return 'That could not be completed.'
    case 'too_many_attempts':
      return 'Too many attempts. Wait a moment and try again.'

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 014's six. Each names the caller's own content and what to do about it — the server's
    // wording is not rendered directly, because a client that echoed server text would have no
    // way to be sure the text was written for a reader rather than for a log.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    case 'still_referenced':
      return 'A session still uses this. Move those sessions to another track or room first, then remove it.'
    case 'session_has_engagement': {
      // FR-1025 — counts only, nobody identified. The server's counts rather than the programme's,
      // which may be stale: FR-1019a means a save can arrive between the render and the request.
      const counts = detail.engagement
      const detailed = counts
        ? ` (${counts.saved} saved, ${counts.notes} notes, ${counts.questions} questions, ${counts.votes} votes)`
        : ''

      return `Attendees have already saved, noted, questioned or voted on this session${detailed}, so it cannot be deleted. Cancel it instead — everything they wrote stays where it is.`
    }
    case 'would_orphan_sessions': {
      const named = detail.sessions ?? []
      // FR-1014 — named, because an organizer told only "no" has to guess which of forty sessions
      // is in the way. Bounded at five so a badly-chosen range does not produce a wall of text;
      // the remainder is counted rather than hidden.
      const shown = named
        .slice(0, 5)
        .map((one) => one.title)
        .join(', ')
      const rest = named.length > 5 ? ` and ${named.length - 5} more` : ''

      return named.length === 0
        ? 'Those dates would leave sessions outside the conference. Move or cancel them first.'
        : `Those dates would leave these outside the conference: ${shown}${rest}. Move or cancel them first.`
    }
    case 'timezone_frozen':
      return 'The timezone can only be changed while the conference has no sessions. Session times are stored as absolute instants, so changing it now would move what everybody sees.'
    case 'outside_conference_days':
      return 'That time falls outside the conference’s dates, in the venue’s own timezone.'
    case 'ends_before_start':
      return 'The end must be after the start.'
    case 'unknown_timezone':
      return 'That is not a timezone this server recognises. Use an IANA name such as “America/Costa_Rica”.'
    case 'conference_ends_before_start':
      return 'The last day cannot be before the first. A one-day conference has the same date for both.'
    case 'malformed_time':
      return 'That is not a time this server can read. Check the date and time you entered.'

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 014 tranche 2 — the vocabulary's five. The two "held" sentences say THAT attendees hold
    // the value and never how many: a number would be the per-value census FR-1099b forbids.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    case 'vocabulary_label_taken':
      return 'A value with that name already exists in this list. Reuse it, or rename the existing one.'
    case 'vocabulary_rename_held':
      return 'Attendees hold this value on their profiles, so its wording cannot change under them. Retire it and create the new wording instead — holders keep what they chose.'
    case 'vocabulary_delete_held':
      return 'Attendees hold this value on their profiles, so it cannot be deleted. Retire it instead — it stops being offered, and what anybody chose stays theirs.'
    case 'sector_retired':
      return 'That sector is retired, so a new subsector of it could never be chosen. Un-retire the sector first.'
    case 'sector_has_subsectors':
      return 'This sector still has subsectors. Delete or move them first, then remove it.'

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 014 tranche 2 — the optional-session and modality refusals. Same discipline as 014's
    // six: each names the caller's own content and the next step, and every sentence differs
    // from every other because the derived-population test asserts mutual difference.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    case 'modality_missing':
      return 'Say whether this conference is in person, virtual or hybrid. There is no default — a conference whose modality nobody chose is one whose sessions nobody can validate.'
    case 'capacity_invalid':
      return 'An optional session needs a maximum number of places — a whole number of at least one. A session nobody may take a place in is a cancelled session, and cancellation already exists.'
    case 'closing_offset_invalid':
      return 'An optional session needs an enrolment-closing offset: how many whole hours before it starts enrolment stops. Zero keeps it open until the session begins.'
    case 'mandatory_carries_no_places':
      return 'A mandatory session takes no enrolment, so it carries neither a capacity nor a closing offset. Make it optional if attendees should take places in it.'
    case 'capacity_below_held': {
      // FR-1061a — the server names how many places are held; nobody is evicted.
      const held = detail.placesHeld
      const figure =
        held === undefined ? 'more places than that' : `${held} place${held === 1 ? '' : 's'}`
      return `Attendees already hold ${figure} in this session, so the capacity cannot drop below that. Nobody is evicted — releasing a place is theirs to do, not yours.`
    }
    case 'kind_committed':
      return 'Attendees have already committed to this session as it is — saved it, or taken a place — so its kind cannot change under them. Create the session you meant and let this one stand.'
    case 'places_changed': {
      // FR-1077b — re-presented rather than merely reported: the caller reads `placesHeld`
      // from the detail and shows the new figure before asking again.
      const held = detail.placesHeld
      const figure = held === undefined ? 'more places' : `${held} place${held === 1 ? '' : 's'}`
      return `More places were taken while you decided: attendees now hold ${figure}. Check the new figure before deleting — cancelling preserves everything.`
    }
    case 'session_needs_room_or_link':
      return 'A session needs a room, a joining link, or both — with neither, nobody can attend it. Give it whichever this conference uses.'
    case 'modality_forbids_link':
      return 'This conference is in person, so its sessions carry a room and no joining link. To stream some sessions, make the conference hybrid first.'
    case 'modality_forbids_room':
      return 'This conference is virtual, so its sessions carry a joining link and no room. To hold some sessions in person, make the conference hybrid first.'
    case 'access_link_invalid':
      return 'That is not a link this product can publish. A joining link must be a complete https:// address — nothing else is accepted.'
    case 'access_link_committed':
      return 'Attendees have saved this session or hold places in it, so its joining link cannot be removed — they would arrive with nowhere to go and no notice. Correcting it to a new address is always allowed.'
    case 'modality_conflicts_sessions': {
      const named = detail.sessions ?? []
      // FR-1059a — named, FR-1014's shape: an organizer told only "no" has to find the
      // sessions by eye. Bounded at five, remainder counted, as `would_orphan_sessions` does.
      const shown = named
        .slice(0, 5)
        .map((one) => one.title)
        .join(', ')
      const rest = named.length > 5 ? ` and ${named.length - 5} more` : ''

      return named.length === 0
        ? 'That change would leave sessions carrying the wrong thing for the new modality. Switch to hybrid first, adjust each session, then switch again.'
        : `That change would leave these sessions carrying the wrong thing for the new modality: ${shown}${rest}. Switch to hybrid first, adjust them, then switch again.`
    }
    case 'unreachable':
      return 'MyNet could not be reached. Nothing was changed — try again when you have a connection.'
    case 'unknown':
      return 'Something went wrong. Try again, and reload if it keeps happening.'
  }
}
