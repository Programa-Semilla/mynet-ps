import type { components, paths } from './generated/api.js'
import type { Attendee, Event } from './interfaces/index.js'

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

// If any line below stops compiling, the client's domain type expects something the contract
// no longer guarantees. Fix the domain type or the route schema — never this file, and never
// contracts/openapi.json, which is generated output.
export type _AttendeeMatchesContract = Satisfies<MeResponse, Attendee>
export type _EventsMatchContract = Satisfies<EventsResponse[number], Event>
export type _HealthIsShaped = Satisfies<HealthResponse, { status: 'ok' }>

export type { components, paths }
