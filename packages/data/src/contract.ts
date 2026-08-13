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
export type _EventsMatchContract = Satisfies<EventsResponse[number], Event>
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
export type _SavedSessionsAreIdentifiers = Satisfies<
  SavedSessionsResponse['sessions'][number],
  { sessionId: string; changedSinceViewed: boolean }
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

export type { components, paths }
