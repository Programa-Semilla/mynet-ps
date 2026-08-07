import type { FastifyInstance } from 'fastify'

import { meRoutes } from './auth/me.js'
import { signInRoutes } from './auth/sign-in.js'
import { signOutRoutes } from './auth/sign-out.js'
import { eventRoutes } from './events.js'
import { healthRoutes } from './health.js'
import { activeEventRoutes } from './workspace/active-event.js'

/**
 * T002 (002) — the route registry, lifted out of step 8 of `app.ts` (FR-181).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **APPEND-ONLY.** A feature adding routes adds its plugin to the end of `ROUTES` and its
 * import above. It does not reorder the list, and it does not touch `app.ts` — which is the
 * point: `app.ts` steps 1–7 encode a registration order that is load-bearing for reasons
 * unrelated to routing, and every feature editing that file to add a line is how that ordering
 * eventually gets disturbed by accident.
 *
 * **Every route plugin must carry a `schema` block on each route it registers.** Swagger builds
 * the contract by observing routes as they register (`app.ts` step 4), so a route without one
 * is not merely undocumented — it is *silently absent* from `contracts/openapi.json`, and
 * `pnpm contract:check` cannot notice something that was never offered to it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Order within this array is preserved from the inline registration it replaces. Nothing here
 * depends on it today — Fastify resolves routes by method and path, not by registration
 * sequence — but the generated contract lists paths in observation order, so reordering this
 * array rewrites `contracts/openapi.json` for no behavioural reason and turns a genuine
 * contract diff into noise.
 */
export type RoutePlugin = (app: FastifyInstance) => Promise<void>

export const ROUTES: readonly RoutePlugin[] = [
  healthRoutes,
  signInRoutes,
  signOutRoutes,
  meRoutes,
  eventRoutes,
  // 002 — event context.
  activeEventRoutes,
]
