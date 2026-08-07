import type { components, paths } from './generated/api.js'
import type { Attendee, Event, Session, SessionNote, Track } from './interfaces/index.js'

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

// 005 — the saved set arrives as identifiers, never as whole sessions: a second copy of session
// data could disagree with the programme, and this is what would notice if the route ever
// started sending one (FR-188).
export type _SavedSessionsAreIdentifiers = Satisfies<SavedSessionsResponse['sessionIds'], string[]>

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

export type { components, paths }
