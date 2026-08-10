import type { FastifyInstance } from 'fastify'

import { accountRoutes } from './account.js'
import { meRoutes } from './auth/me.js'
import { signInRoutes } from './auth/sign-in.js'
import { signOutRoutes } from './auth/sign-out.js'
import { resetRoutes } from './auth/reset.js'
import { signUpRoutes } from './auth/sign-up.js'
import { verifyRoutes } from './auth/verify.js'
import { blockRoutes } from './blocks.js'
import { cardRoutes } from './cards.js'
import { conversationRoutes } from './conversations.js'
import { agendaRoutes } from './events/agenda.js'
import { appointmentRoutes } from './events/appointments.js'
import { attendeeProfileRoutes } from './events/attendees.js'
import { catalogRoutes } from './events/catalog.js'
import { directoryRoutes } from './events/directory.js'
import { joinRoutes } from './events/join.js'
import { questionRoutes } from './events/questions.js'
import { eventRoutes } from './events.js'
import { healthRoutes } from './health.js'
import { profileRoutes } from './profile.js'
import { pushRoutes } from './push.js'
import { reportRoutes } from './reports.js'
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
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 007 — private 1:1 conversations. **Appended, never inserted**, for the reason every entry
  // above states: the generated contract lists paths in observation order.
  //
  // **Registered here rather than under `routes/events/`, and that placement is a decision**
  // (plan, Structure Decision 1). Conversations are cross-event (FR-507), so nesting them under
  // `:eventId` would produce one of two bad outcomes: the event audit would demand
  // `requireEventAccess` and fail the build, or somebody would satisfy it with a guard that
  // verifies a registration having nothing to do with who may read the conversation — a check
  // that looks like authorization and is not.
  //
  // What guards them instead is `requireParticipation` and its own audit, because the event
  // audit **walks straight past a route naming no conference and reports success** (research R9).
  // ─────────────────────────────────────────────────────────────────────────────────────────
  conversationRoutes,
  // 007 — **what makes open send responsible.** Anyone sharing an event may message anyone else
  // with no request and no acceptance step, and once open a conversation stays open forever;
  // that combination creates a contact path the recipient cannot otherwise close, in a product
  // with public self sign-up and no moderator by construction. Blocking is the close.
  //
  // Neither names a conversation, and neither should: a block refuses contact that has not
  // happened yet as well as contact that has, and a report concerns conduct rather than a
  // thread. The participation audit therefore does not examine them, correctly.
  blockRoutes,
  // 007 — reporting conduct **out of** the product. One route, and the missing `GET` is a
  // requirement rather than an omission (FR-548, SC-508).
  reportRoutes,
  // 007 — registering and surrendering a device for notification delivery. Appended likewise.
  // Neither route names a conversation or a conference, and neither takes an attendee identifier:
  // the endpoint is bound to the calling session, which is what stops one browser profile
  // delivering one attendee's messages using another's registration (FR-555).
  pushRoutes,
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 008 — digital business cards, and the contacts holding one creates. **Appended, never
  // inserted**, for the reason every entry above states: the generated contract lists paths in
  // observation order.
  //
  // **Registered here rather than under `routes/events/`, and that placement is a decision**
  // (research R1). A held card is cross-event — it outlives the conference it was shared at
  // (FR-614) — so nesting it under `:eventId` would produce one of two bad outcomes: the event
  // audit would demand `requireEventAccess` and fail the build, or somebody would satisfy it
  // with a guard that verifies a registration having nothing to do with whether the reader holds
  // the card, which is a check that looks like authorization and is not.
  //
  // What guards them instead is `requireHeldCard` and a **third** audit, because the event audit
  // walks straight past a route naming no conference and reports success — the same finding 007
  // recorded for conversations, met again here.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  cardRoutes,
  // 008 — meetings. **Appended likewise, and registered under `/events/:eventId` deliberately**
  // — the exact opposite of `cardRoutes` above, and the two together are this feature's central
  // structural decision (research R2).
  //
  // Appointments are per-event, so naming the conference in the path puts them **inside** the
  // guarantee that already exists: `event-scope-audit.test.ts` examines them and fails the build
  // if `requireEventAccess` is ever dropped. Registering them as `/appointments/:id` would name
  // no conference and that audit would silently pass them — the hole `cardRoutes` needs a third
  // audit to close. Do not "tidy" the nesting away.
  appointmentRoutes,
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 009 — audience questions on a session. **Appended, never inserted**, for the reason every
  // entry above states: the generated contract lists paths in observation order.
  //
  // Registered under `/events/:eventId` like `appointmentRoutes` and unlike `cardRoutes`, and
  // here the naming does more work than it looks. Three of these five routes could find their
  // question from `:questionId` alone; they name the conference anyway, because
  // `event-scope-audit.test.ts` examines a route only if it declares an event parameter and
  // **reports success otherwise**. Naming it is what keeps this feature inside the guarantee that
  // already exists, and is why 009 needs no fourth branded scope and no fourth audit — the thing
  // both 007 and 008 had to build. Do not "tidy" the nesting away (research R12, FR-742).
  // ─────────────────────────────────────────────────────────────────────────────────────────
  questionRoutes,
]
