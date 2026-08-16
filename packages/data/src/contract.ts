import type { components, paths } from './generated/api.js'
import type {
  Attendee,
  DirectoryEntry,
  Event,
  Session,
  SessionNote,
  Track,
  VisibleProfile,
} from './interfaces/index.js'

/**
 * T042a — bind the client's domain types to the generated contract types.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Everything here is **compile-time only** and emits no runtime code. That is the point: if
 * the server stops producing a shape the client expects, this file stops compiling, so the
 * divergence fails the build rather than failing an attendee (FR-044c).
 *
 * Without it, `contracts/openapi.json` would be regenerated, committed, reviewed, and the
 * client would carry on expecting the old shape until someone hit the broken screen.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Ordering note.** tasks.md places T042a in Phase 2, but the assertions it exists to make
 * are about `GET /auth/me` and `GET /events` — which are T052 and T055, in Phase 3. The
 * generation and diff mechanism landed in Phase 2 (wired into `pnpm contract:check`); the
 * per-endpoint bindings below landed at T064, once there were endpoints to bind to.
 */

/**
 * Fails to compile if `T` is not assignable to `U`.
 *
 * Deliberately one-directional: the server may add fields the client ignores (an additive
 * change), but the client may never require a field the server does not produce. That
 * asymmetry is what makes the check useful rather than merely noisy.
 */
export type Satisfies<T extends U, U> = T

/** Response body of `GET /auth/me`, as the server actually declares it. */
export type MeResponse = paths['/auth/me']['get']['responses'][200]['content']['application/json']

/** Response body of `GET /events`, as the server actually declares it. */
export type EventsResponse =
  paths['/events']['get']['responses'][200]['content']['application/json']

export type HealthResponse =
  paths['/health']['get']['responses'][200]['content']['application/json']

/**
 * Response body of `GET /workspace/active-event` (002, T020).
 *
 * The 200 only. The 204 has no body by design — an attendee registered for no conferences
 * (FR-105) — and there is nothing to bind for it.
 */
export type ActiveEventResponse =
  paths['/workspace/active-event']['get']['responses'][200]['content']['application/json']

/** Response bodies of the catalog reads (002, T038/T039). */
export type SessionsResponse =
  paths['/events/{eventId}/sessions']['get']['responses'][200]['content']['application/json']

export type TracksResponse =
  paths['/events/{eventId}/tracks']['get']['responses'][200]['content']['application/json']

// If any line below stops compiling, the client's domain type expects something the contract
// no longer guarantees. Fix the domain type or the route schema — never this file, and never
// contracts/openapi.json, which is generated output.
export type _AttendeeMatchesContract = Satisfies<MeResponse, Attendee>

/**
 * T040 (012) — **this line is also the erasure's only protection against `GET /events`
 * growing a pagination envelope, and `[number]` is the load-bearing part** (FR-1141,
 * research R4 break mode A).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `erasingWithdrawnConferences` (apps/web/src/app/services.ts) erases every cached conference
 * absent from this response — programme, saved sessions, private notes, appointments — which
 * is only safe while the response is a COMPLETE enumeration of the attendee's registrations.
 * Wrapped in an envelope (`{ events, nextCursor }`), one page's answer would mark every
 * conference on the next page as withdrawn, and the erasure would destroy working offline
 * copies of conferences the attendee is still registered for.
 *
 * Indexing with `number` only typechecks while `EventsResponse` is an array (verified against
 * this repository's own TypeScript: error TS2537), so that change stops the build right here —
 * accidentally until 012 wrote this down, deliberately since. A refactor "tidying" this line
 * to bind the whole response, or to index a named property, keeps every test green and removes
 * the protection; if it goes, either the erasure over-deletes or the build stops proving the
 * completeness it depends on. The other break modes are guarded separately:
 * `_EventsTakesNoQuery` below (a limit/offset query, mode B),
 * `apps/api/tests/unit/registered-events-complete.test.ts` (the route schema, modes B and C),
 * and `apps/api/tests/integration/registered-events-complete.test.ts` (an "upcoming only"
 * date predicate, mode D — the one no static check can reach).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type _EventsMatchContract = Satisfies<EventsResponse[number], Event>

/**
 * T041 (012) — **the events contract declares no query parameters, asserted at compile time**
 * (FR-1141, research R4 break mode B).
 *
 * A `limit`/`offset` pair with a server-side default is the pagination that arrives *without*
 * an envelope: the response stays a bare array, so `_EventsMatchContract` above keeps compiling
 * while the array quietly stops being the whole answer — and the erasure it protects starts
 * deleting conferences that were merely on the next page. The generated contract writes
 * `query?: never` for a route with no `querystring` schema, so this binding holds exactly until
 * somebody gives the route one; the generated type then carries a real object here and stops
 * being assignable to `undefined`. The failure lands in this file on purpose, one comment away
 * from the explanation of why the client must change before the route may paginate.
 */
export type _EventsTakesNoQuery = Satisfies<
  paths['/events']['get']['parameters']['query'],
  undefined
>

export type _HealthIsShaped = Satisfies<HealthResponse, { status: 'ok' }>

// 002 — the active conference is the same `Event` the client already knows, including the
// venue timezone day context needs (FR-120). If the route ever stopped sending `timezone`,
// this is what would notice.
export type _ActiveEventMatchesContract = Satisfies<ActiveEventResponse, Event>

// 002 — the catalog. `speakers` being an array rather than a nullable field (FR-138) and
// `colorToken` being a token name rather than a colour (FR-136) are both properties of the
// route schema; if either changed, these would stop compiling.
export type _SessionsMatchContract = Satisfies<SessionsResponse[number], Session>
export type _TracksMatchContract = Satisfies<TracksResponse[number], Track>

/** Response bodies of the agenda reads (005, T013). */
export type SavedSessionsResponse =
  paths['/events/{eventId}/agenda/saved']['get']['responses'][200]['content']['application/json']

export type NotesResponse =
  paths['/events/{eventId}/agenda/notes']['get']['responses'][200]['content']['application/json']

export type WriteNoteResponse =
  paths['/events/{eventId}/agenda/notes/{sessionId}']['put']['responses'][200]['content']['application/json']

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 005 — the saved set arrives as identifiers, never as whole sessions: a second copy of session
// data could disagree with the programme, and this is what would notice if the route ever started
// sending one (FR-188).
//
// **T074 (014) — the entry gained a second field and the rule is unchanged.** Each entry is now
// `{ sessionId, changedSinceViewed }`: an identifier and one boolean about *this attendee's*
// relationship to it. That is not session data arriving by the back door — nothing here describes
// the session — and the binding still fails if a title, a time or a room ever appears.
// ───────────────────────────────────────────────────────────────────────────────────────────────
// **T196 (014 tranche 2) — the entry gained a third field, the `saved | place` discriminator,
// and the rule is still unchanged.** One list with a kind on each row is what makes FR-1064's
// forbidden state — a saved optional session with no place — unrepresentable on the client
// (research R13). Still nothing here describes the session itself.
export type _SavedSessionsAreIdentifiers = Satisfies<
  SavedSessionsResponse['sessions'][number],
  { sessionId: string; changedSinceViewed: boolean; commitment: 'saved' | 'place' }
>

// 005 — a note carries its `updatedAt`, and so does the response to writing one. That second
// binding is load-bearing: the editor may enter its *saved* status only from a confirmed
// response, so a route that stopped returning `updatedAt` would silently remove the only
// evidence the write completed and push the client towards an optimistic update the
// constitution requires be recorded separately (FR-210, research D5).
export type _NotesMatchContract = Satisfies<
  NotesResponse['notes'][number],
  Omit<SessionNote, 'sessionId'> & { sessionId: string }
>
export type _WriteNoteConfirms = Satisfies<WriteNoteResponse, { updatedAt: string }>

/** Response bodies of the directory reads (006, T048). */
export type DirectoryResponse =
  paths['/events/{eventId}/attendees']['get']['responses'][200]['content']['application/json']

export type VisibleProfileResponse =
  paths['/events/{eventId}/attendees/{attendeeId}']['get']['responses'][200]['content']['application/json']

/**
 * 006 — the directory entry, minus its avatar.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`avatar` is deliberately excluded from this binding, and the exclusion is the interesting
 * part.** On the wire it is `{ contentType, base64 } | null`; in the domain type it is a data
 * URL, because `HttpDirectoryRepository` converts it at the transport boundary so presentation
 * code never learns that a network exists (Principle V). Binding it would assert that the two
 * are the same shape, which they must not be.
 *
 * Everything else is bound. If the route stopped sending `sharedInterestCount` — the number
 * FR-412 puts on the card and FR-411 ranks by — this is what would notice, at build time,
 * rather than a directory rendering with no reason to meet anybody.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type _DirectoryEntryMatchesContract = Satisfies<
  Omit<DirectoryResponse['attendees'][number], 'avatar'>,
  Omit<DirectoryEntry, 'avatar'>
>

// 006 — `nextCursor` is nullable and must stay so: a non-nullable cursor would give the client
// no way to know it had reached the end except by reading an empty page.
export type _DirectoryPagesAreCursored = Satisfies<
  DirectoryResponse['nextCursor'],
  string | null | undefined
>

/**
 * 006 — the profile view is built on 004's read **unchanged** (research D14), so this binding is
 * what would notice if a later feature "helpfully" added a field to it or removed one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`Required<>` here, and not on the directory binding above, for a stated reason.** 004's
 * route lists only four properties in its schema's `required`, so the generated type marks the
 * nullable ones optional. 006's own route lists all of them, because it can — it is this
 * feature's route to declare. Reusing 004's read *unchanged* is a requirement (FR-431), and
 * tightening its `required` would be a change to it, so the binding adapts instead.
 *
 * `Required<>` keeps every `| null`; it only asserts that when a field is present it has the
 * declared shape. A removed or retyped field still fails to compile, which is the property this
 * file exists for.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type _VisibleProfileMatchesContract = Satisfies<
  Required<VisibleProfileResponse>,
  VisibleProfile
>

/**
 * T-review (014) — **the track colour set, derived from the contract rather than copied.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **IT WAS WRITTEN OUT BY HAND THREE TIMES AND THE THIRD COPY WAS TYPED `string`.**
 *
 * `TRACK_COLOR_TOKENS` on the server, the `enum` in the route schema, and `TRACK_TOKENS` in the
 * administrative form — with `AdminTrack.colorToken` a bare `string` between them, so nothing
 * connected any copy to any other. The server's two agree because one generates the other; the
 * form agreed by somebody having typed it correctly.
 *
 * The failure that shape produces is quiet in both directions. **Add a fifth token server-side**
 * and the form silently cannot offer it — an organizer sees four choices and no error anywhere.
 * **Remove one** and the form offers a value every write refuses with a 404, because
 * `isTrackColorToken` narrows before the query layer is reached.
 *
 * FR-136 is what makes this worth binding rather than tolerating: the palette lives in
 * `apps/web/src/theme/tokens.css` and nowhere else, and a token name is the only thing that
 * crosses the wire. A set that can drift is a set that can name a token the theme does not define,
 * which renders as an unstyled track rather than as a failure.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export type CreateTrackBody =
  paths['/admin/conferences/{eventId}/tracks']['post']['requestBody']['content']['application/json']

/** The closed set of track colour tokens, as the generated contract declares it (FR-136, FR-1004). */
export type TrackColorToken = CreateTrackBody['colorToken']

/**
 * The enum must stay an enum.
 *
 * A membership check (`Satisfies<'track-design', TrackColorToken>`) proves the wrong thing here:
 * `'track-design'` extends `string`, so it would keep compiling after the route relaxed
 * `colorToken` to a bare string — the one change this binding exists to notice. The conditional
 * asks the question the other way round, and only a widened type answers it wrongly.
 */
type ClosednessOf<T> = string extends T ? 'RELAXED_TO_STRING' : 'closed'

export type _TrackColorTokenIsClosed = Satisfies<ClosednessOf<TrackColorToken>, 'closed'>
export type _TrackColorTokenHasTheDesignToken = Satisfies<'track-design', TrackColorToken>

/**
 * T190 (014 tranche 2) — **the modality and format sets, derived from the contract rather than
 * copied** — `TrackColorToken`'s discipline, applied before the third hand-written copy exists
 * rather than after it was found typed `string`.
 *
 * The server's `CONFERENCE_MODALITIES`/`CONFERENCE_FORMATS` generate the route enums; these
 * derive from the generated contract; the administrative forms consume these. One chain, so a
 * value added or removed server-side is a compile failure here rather than a select silently
 * missing an option — or offering one every write refuses.
 */
export type CreateConferenceBody =
  paths['/admin/conferences']['post']['requestBody']['content']['application/json']

/** Exactly three, controlled, and it GOVERNS what a session must carry (FR-1046). */
export type ConferenceModality = NonNullable<CreateConferenceBody['modality']>
/** A descriptive label with NO behavioural consequence (FR-1047). Optional on a conference. */
export type ConferenceFormat = NonNullable<CreateConferenceBody['format']>

export type _ModalityIsClosed = Satisfies<ClosednessOf<ConferenceModality>, 'closed'>
export type _ModalityHasHybrid = Satisfies<'hybrid', ConferenceModality>
export type _FormatIsClosed = Satisfies<ClosednessOf<ConferenceFormat>, 'closed'>

export type { components, paths }
