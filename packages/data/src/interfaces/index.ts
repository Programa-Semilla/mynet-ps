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
// 005 — the attendee's own agenda. Separate from the catalog on purpose: the catalog is
// read-only in perpetuity, and these are attendee state *about* its content (FR-191).
// **Appended, never moved back into this barrel** (FR-235) — the per-domain split is what lets
// 005 and 006 add interfaces in parallel without contending over these lines.
export type { SavedSessionRepository, SessionNote, SessionNotesRepository } from './agenda.js'
// 004 — becoming an attendee, recovering an account, and leaving. **Appended, never merged into
// this barrel** (FR-180): the per-domain split is what lets 004 and 006 add interfaces without
// contending over anything but these two lines.
export type { IdentityRepository, JoinResult, PersonalDataExport } from './identity.js'
export type {
  Availability,
  Discoverability,
  NetworkingIntent,
  OwnProfile,
  ProfileDraft,
  ProfileRepository,
} from './profile.js'
// 006 — the Discover directory. **Appended, never merged into this barrel**, for the reason
// stated above: a new domain adds `./<domain>.js` here and nowhere else. Its own domain rather
// than a third verb on `IdentityRepository`, because it is about people and not about
// membership (research D1).
export type {
  DirectoryEntry,
  DirectoryPage,
  DirectoryQuery,
  DirectoryRepository,
  VisibleProfile,
} from './directory.js'

export {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './errors.js'

import type { SavedSessionRepository, SessionNotesRepository } from './agenda.js'
import type { AttendeeRepository } from './attendee.js'
import type { CatalogRepository } from './catalog.js'
import type { DirectoryRepository } from './directory.js'
import type { ActiveEventRepository, EventsRepository } from './events.js'
import type { IdentityRepository } from './identity.js'
import type { ProfileRepository } from './profile.js'

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
  // 005 — appended, not inserted. Two members, one per domain interface.
  readonly savedSessions: SavedSessionRepository
  readonly sessionNotes: SessionNotesRepository
  // 004 — appended likewise. **Neither is cached**, and that is a declaration rather than an
  // omission: the specification states that nothing this feature stores is available offline,
  // and caching a profile would put a second copy of personal data on the device for no offline
  // capability worth having.
  readonly identity: IdentityRepository
  readonly profile: ProfileRepository
  // 006 — the Discover directory. **Appended likewise, and deliberately NOT cached**: FR-466
  // makes offline a refusal rather than a degraded read, so 005's decorator is not applied to
  // this member and the composition root says so where the wiring happens.
  readonly directory: DirectoryRepository
}
