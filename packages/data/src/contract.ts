import type { components, paths } from './generated/api.js'

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
 * generation and diff mechanism therefore lands here (wired into `pnpm contract:check`), and
 * the per-endpoint bindings land with their routes at T064, when there is a contract to bind
 * to. Asserting against endpoints that do not exist yet would just be a compile error
 * standing in for work not yet done.
 */

/**
 * Fails to compile if `T` is not assignable to `U`.
 *
 * Deliberately one-directional: the server may add fields the client ignores (an additive
 * change), but the client may never require a field the server does not produce. That
 * asymmetry is what makes the check useful rather than merely noisy.
 */
export type Satisfies<T extends U, U> = T

/**
 * Proves the generated types are reachable and the binding mechanism compiles. Replaced by
 * the real endpoint assertions at T064.
 */
export type HealthResponse =
  paths['/health']['get']['responses'][200]['content']['application/json']

export type _HealthIsShaped = Satisfies<HealthResponse, { status: 'ok' }>

export type { components, paths }
