import type { FastifyInstance } from 'fastify'

import { accountRoutes } from './account.js'
import { meRoutes } from './auth/me.js'
import { signInRoutes } from './auth/sign-in.js'
import { signOutRoutes } from './auth/sign-out.js'
import { resetRoutes } from './auth/reset.js'
import { signUpRoutes } from './auth/sign-up.js'
import { verifyRoutes } from './auth/verify.js'
import { agendaRoutes } from './events/agenda.js'
import { attendeeProfileRoutes } from './events/attendees.js'
import { catalogRoutes } from './events/catalog.js'
import { directoryRoutes } from './events/directory.js'
import { joinRoutes } from './events/join.js'
import { eventRoutes } from './events.js'
import { healthRoutes } from './health.js'
import { profileRoutes } from './profile.js'
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
  // 002 — the session catalog. Every route here declares `:eventId` and carries
  // `requireEventAccess`; the audit in T068 fails the build if one ever does not.
  catalogRoutes,
  // 005 — the attendee's own agenda: saved sessions and personal notes. **Appended, not
  // inserted** (FR-235): reordering this array rewrites `contracts/openapi.json` for no
  // behavioural reason, because the generated contract lists paths in observation order — and
  // the per-domain split is what lets 005 and 006 proceed in parallel without contending here.
  agendaRoutes,
  // 004 — a person becomes an attendee and reaches a conference under their own power.
  // **Appended, never inserted**, for the reason above: the generated contract lists paths in
  // observation order, so reordering rewrites `contracts/openapi.json` for no behavioural
  // reason and turns a genuine contract diff into noise.
  //
  // `signUpRoutes` is the product's first deliberately unauthenticated **write** route, and
  // `joinRoutes` deliberately carries no `:eventId` — see each file for why.
  signUpRoutes,
  joinRoutes,
  // 004 — verification and recovery. Appended after US1's two, in the order the phases landed,
  // so the generated contract's path order follows the order the routes were written.
  verifyRoutes,
  resetRoutes,
  // 004 — the attendee's own profile. No identifier in any address here: the session decides
  // whose profile it is, which is what makes FR-335 structural (see the file).
  profileRoutes,
  // 004 — reading a CO-ATTENDEE's profile. Under `:eventId` and carrying `requireEventAccess`,
  // so the reader's registration is proven by the branded EventScope; the target's three
  // conditions are one WHERE in the query (research D5). The route audit fails the build if the
  // guard is ever dropped.
  attendeeProfileRoutes,
  // 004 — the personal-data export, and (from US7) deletion. Both bound to the session with no
  // identifier in the address, which is FR-378's refusal expressed as an absence.
  accountRoutes,
  // 006 — the Discover directory. **Appended, never inserted**, for the reason every entry
  // above states: the generated contract lists paths in observation order. It carries `:eventId`
  // and therefore acquires `requireEventAccess` and the branded scope, which the route audit
  // fails the build for omitting (research D14).
  directoryRoutes,
]
