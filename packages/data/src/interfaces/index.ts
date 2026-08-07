/**
 * T001 (002) — the barrel over the per-domain interface modules.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This file used to be every interface in the product.** FR-180 split it per domain so that
 * the seven features after 002 add a file instead of editing this one, and so two of them in
 * flight at once do not contend over the same lines.
 *
 * It stays a barrel so **no consumer's import path moved** — which is what makes the split's
 * behaviour-neutrality (FR-183, SC-110) demonstrable by an unchanged test suite and a
 * byte-identical `contracts/openapi.json` rather than argued.
 *
 * A new domain adds `./<domain>.js` here and nowhere else. Do not move declarations back in.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Method names are identical in the interface, the HTTP implementation, and every test
 * double (tasks.md → Shared Interfaces).
 *
 * **The rule that governs all of them — no method accepts an attendee identifier — is stated
 * in each domain file**, not only here. See `attendee.ts` and `events.ts`.
 */
export type { Attendee, AttendeeRepository } from './attendee.js'
export type { ActiveEventRepository, Event, EventsRepository } from './events.js'
export type { CatalogRepository, Room, Session, Speaker, Track } from './catalog.js'

export {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './errors.js'

import type { AttendeeRepository } from './attendee.js'
import type { CatalogRepository } from './catalog.js'
import type { ActiveEventRepository, EventsRepository } from './events.js'

/**
 * Every repository, in one shape (research.md D10).
 *
 * The one declaration that stays in the barrel, because it is the aggregate *of* the domains
 * rather than a member of any one of them. A feature adding a domain adds its repository here
 * — that edit is unavoidable wherever this type lives, and it is one line.
 */
export interface Repositories {
  readonly attendee: AttendeeRepository
  readonly events: EventsRepository
  readonly activeEvent: ActiveEventRepository
  readonly catalog: CatalogRepository
}
