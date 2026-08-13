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
export type {
  SavedSession,
  SavedSessionRepository,
  SessionNote,
  SessionNotesRepository,
} from './agenda.js'
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
// 007 — Messages, the safety controls that make open send responsible, and where a device is
// reachable. **Three domains, three files, appended**: messaging, safety and push registration
// are three subjects, and 004's review recorded the cost of letting one interface span two
// (`identity-repository-spans-two-subjects`).
export type {
  ConversationPreview,
  ConversationRepository,
  ConversationState,
  ConversationSummary,
  Counterpart,
  Message,
  MessagePage,
  MessagePageQuery,
  MessageRepository,
  OpenedConversation,
  SentMessage,
} from './messages.js'
export type {
  AbuseReportDraft,
  BlockedAttendee,
  BlockRepository,
  ReportRepository,
} from './safety.js'
export type { DeviceRegistration, PushSubscriptionRepository } from './notifications.js'
// ─────────────────────────────────────────────────────────────────────────────────────────
// 008 — Network. **Two domains, two files, appended**, for the reason every entry above states:
// a new domain adds `./<domain>.js` here and nowhere else.
//
// They are separate because they are separate subjects and — unusually — because they obey
// **different scoping rules**. A card is cross-event, so `CardRepository` takes no `eventId` at
// all; an appointment is per-event, so every `AppointmentRepository` method takes one. Folding
// them into one `NetworkRepository` would put a method that must never be event-scoped beside
// one that must always be, in a single interface, which is precisely the confusion the
// per-domain split exists to prevent (004's review recorded the cost of one interface spanning
// two subjects).
// ─────────────────────────────────────────────────────────────────────────────────────────
export type { CardRepository, HeldCard, SharedCard } from './cards.js'
export type {
  Appointment,
  AppointmentRepository,
  AppointmentRole,
  AppointmentStatus,
  MeetingSlot,
  ProposeInput,
} from './appointments.js'
// ─────────────────────────────────────────────────────────────────────────────────────────
// 009 — audience questions. **One domain, one file, appended**, for the reason every entry above
// states: a new domain adds `./<domain>.js` here and nowhere else.
//
// Its own domain rather than methods on `CatalogRepository`, which is read-only in perpetuity and
// asserted by name-shape over its exports (FR-710, FR-772). A question is attendee state *about*
// conference content — 005's distinction, unchanged — and the attendee owns it outright.
// ─────────────────────────────────────────────────────────────────────────────────────────
export type { QuestionListItem, QuestionsRepository } from './questions.js'

/** The one runtime value 007 contributes: the message limit the composer's counter reads. */
export { MESSAGE_MAX_LENGTH } from './messages.js'

export {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './errors.js'

import type { SavedSessionRepository, SessionNotesRepository } from './agenda.js'
import type { AppointmentRepository } from './appointments.js'
import type { AttendeeRepository } from './attendee.js'
import type { CardRepository } from './cards.js'
import type { CatalogRepository } from './catalog.js'
import type { DirectoryRepository } from './directory.js'
import type { ActiveEventRepository, EventsRepository } from './events.js'
import type { IdentityRepository } from './identity.js'
import type { ConversationRepository, MessageRepository } from './messages.js'
import type { PushSubscriptionRepository } from './notifications.js'
import type { ProfileRepository } from './profile.js'
import type { QuestionsRepository } from './questions.js'
import type { BlockRepository, ReportRepository } from './safety.js'

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
  // ───────────────────────────────────────────────────────────────────────────────────────
  // 007 — **five members, appended, and not one of them is cached** (FR-563).
  //
  // A declaration rather than an omission, stated here and again at the composition root where
  // the wiring happens. The reasons differ per member and each is worth having in writing:
  //
  // - `conversations` and `messages` are other people's words. 005's decorator revokes on age
  //   alone, so a cached thread is a copy of somebody else's personal data ageing on a device
  //   — with no offline capability worth having in exchange, because every write here is
  //   refused rather than queued (FR-565) and a thread you cannot reply to is not a product.
  // - `blocks` must take effect on the very next request (SC-506). Age is the wrong clock for
  //   a refusal, exactly as 006 found it was for a discoverability setting.
  // - `reports` is write-only, so there is nothing to cache.
  // - `pushSubscriptions` holds credentials, and a stale copy would keep a revoked endpoint
  //   alive locally after the browser had already replaced it.
  //
  // FR-567 — all five are registered **here**, in the aggregate every other domain already uses.
  // Adding a repository stays one line per domain and `registry.tsx` is untouched, which is the
  // append-only extension point 001 established and 004, 005 and 006 each extended in turn.
  // ───────────────────────────────────────────────────────────────────────────────────────
  readonly conversations: ConversationRepository
  readonly messages: MessageRepository
  readonly blocks: BlockRepository
  readonly reports: ReportRepository
  readonly pushSubscriptions: PushSubscriptionRepository
  // ───────────────────────────────────────────────────────────────────────────────────────
  // 008 — Network. **Two members, appended, and they DISAGREE about caching** — which is the
  // first time that has been true of one feature's set, and is why the declaration is per
  // member here and again at the composition root where the wiring happens.
  //
  // - `appointments` **is** cached, under the existing `(attendeeId, eventId, resource)` key
  //   (FR-647). These are the attendee's own commitments at one conference, which is exactly
  //   the shape that key was built for — the same fit saved sessions have.
  // - `cards` is **not** (FR-648). Resolving a held card reads *another person's live profile*,
  //   which is the argument that made Discover uncached in 006: the decorator revokes on age
  //   alone, and age is the wrong clock for somebody else's personal data. Refusing also means
  //   **no event-less cache key is needed**, which closes the question 007 deferred to this
  //   feature rather than widening the cache contract to answer it (research R4).
  //
  // Every **write** in this feature is refused offline and never queued (FR-649), for both.
  // ───────────────────────────────────────────────────────────────────────────────────────
  readonly cards: CardRepository
  readonly appointments: AppointmentRepository
  // ───────────────────────────────────────────────────────────────────────────────────────
  // 009 — audience questions. **One member, appended, and NOT cached** (FR-754).
  //
  // A declaration rather than an omission, stated here and again at the composition root where
  // the wiring happens — because "no cache" and "nobody got round to it" look identical in both
  // places. The reason is 006's and 007's unchanged: a question is **another attendee's name and
  // words**, and 005's decorator revokes on **age alone**, which is the wrong clock for content
  // its author may have withdrawn a second ago.
  //
  // A vote count is worse still. It is a live number that is wrong the moment it is stored, and
  // the staleness stamp answers "when did this device last receive this" — honest about the
  // retrieval and silent about the number, which is the part that changed.
  //
  // **Leaving it undecorated makes FR-755 and FR-757 structural rather than classified**: an
  // undecorated repository is never wrapped by the Proxy at all, so there is no `reads` map to
  // omit a read from, no write branch to fall into, and no `args[0]` to be misread as an event
  // id. 008's cache-purge defect is not merely avoided here — it is unreachable.
  // ───────────────────────────────────────────────────────────────────────────────────────
  readonly questions: QuestionsRepository
}
