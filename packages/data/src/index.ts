/**
 * Repository interfaces in domain terms (constitution Principle V).
 *
 * No method here accepts a caller-supplied attendee identifier — that absence is what makes
 * FR-036 structural rather than a rule someone has to remember. See `interfaces/index.ts`.
 */
export type {
  ActiveEventRepository,
  Attendee,
  AttendeeRepository,
  CatalogRepository,
  // T196 (014 tranche 2) — the agenda pair renamed: the set carries held places as well as
  // saves, so `SavedSession(Repository)` became `Commitment(Repository)` (FR-1066a, R13).
  Commitment,
  CommitmentRepository,
  Event,
  EventsRepository,
  PlaceAvailability,
  Room,
  Session,
  SessionKind,
  SessionNote,
  SessionNotesRepository,
  Speaker,
  Track,
} from './interfaces/index.js'

// 004 — identity and the attendee's own profile. Appended, never merged into the list above:
// the per-domain split (FR-180) is what lets 004 and 006 add interfaces without contending.
export type {
  Availability,
  Discoverability,
  IdentityRepository,
  JoinResult,
  NetworkingIntent,
  OwnProfile,
  PersonalDataExport,
  ProfileDraft,
  ProfileRepository,
} from './interfaces/index.js'

// 006 — the Discover directory. Appended likewise, for the same reason.
export type {
  DirectoryEntry,
  DirectoryPage,
  DirectoryQuery,
  DirectoryRepository,
  VisibleProfile,
} from './interfaces/index.js'

/**
 * T009 (006) — the aggregate, exported from the root barrel for the first time (FR-496).
 *
 * `@mynet/platform`'s registry used to mirror every repository method by hand as
 * `Promise<unknown>`, and fifteen casts across eleven files existed to undo that. It now takes
 * a **type-only** dependency on this package and names this type directly, so the mirror — and
 * every cast that paid for it — is gone. Nothing is added to the runtime dependency graph:
 * `import type` is erased at build time.
 */
export type { Repositories } from './interfaces/index.js'

// 007 — conversations, messages, safety and notification subscriptions. Appended likewise, for
// the reason every block above states: the per-domain split is what lets features add interfaces
// without contending over one list.
export type {
  AbuseReportDraft,
  BlockedAttendee,
  BlockRepository,
  ConversationPreview,
  ConversationRepository,
  ConversationState,
  ConversationSummary,
  Counterpart,
  DeviceRegistration,
  Message,
  MessagePage,
  MessagePageQuery,
  MessageRepository,
  OpenedConversation,
  PushSubscriptionRepository,
  ReportRepository,
  SentMessage,
} from './interfaces/index.js'

// 008 — Network: the cards you hold and the meetings you arrange. Appended likewise. **Two
// domains rather than one**, because a card is cross-event and uncached while an appointment is
// per-event and cached — a single interface spanning both would put a method that must never be
// event-scoped beside one that must always be.
export type {
  Appointment,
  AppointmentRepository,
  AppointmentRole,
  AppointmentStatus,
  CardRepository,
  HeldCard,
  MeetingSlot,
  ProposeInput,
  SharedCard,
} from './interfaces/index.js'

// 009 — audience questions on a session. Appended likewise, and its own domain rather than
// methods on `CatalogRepository`: the catalog is read-only in perpetuity, and a question is
// attendee state *about* conference content (FR-710, FR-772).
export type { QuestionListItem, QuestionsRepository } from './interfaces/index.js'

// 014 tranche 2 — the controlled vocabulary's attendee-side read. Appended likewise; its own
// domain because Discover's interest filter reads the same list as the profile editor and must
// not reach it through the profile interface (R17).
export type {
  ChoosableVocabulary,
  VocabularyInterest,
  VocabularyRepository,
  VocabularySector,
  VocabularySubsector,
} from './interfaces/index.js'

export {
  MESSAGE_MAX_LENGTH,
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './interfaces/index.js'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 011 — the administrative interfaces. Appended, never merged into the lists above.
//
// **Not added to `Repositories`.** See `interfaces/administration.ts` for the full reasoning: the
// aggregate is the ATTENDEE client's injected registry, and an administrative member there would
// be an administrative surface inside MyNet (decision 33, FR-970).
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type {
  AdminCatalogRepository,
  AdminInterestOption,
  AdminSector,
  AdminSubsector,
  AdminVocabularyRepository,
  VocabularyValueInput,
  AdminConference,
  AdminConferenceRepository,
  AdminEngagementCounts,
  AdminIdentity,
  AdminProgramme,
  AdminRoom,
  AdminSession,
  AdminSessionInput,
  AdminSpeaker,
  AdminTrack,
  AdminReportDetail,
  AdminReportRepository,
  AdminReportSummary,
  AdminSessionRepository,
  OperatorTier,
} from './interfaces/administration.js'

// T-review (014) — the closed track colour set, derived from the generated contract so the
// administrative form cannot hold a fourth hand-maintained copy of it. See `contract.ts`.
export type { TrackColorToken } from './contract.js'
// 014 tranche 2 (T190) — derived from the generated contract, `TrackColorToken`'s discipline:
// one chain from the server's constant to the administrative form, so neither set can drift.
export type { ConferenceFormat, ConferenceModality } from './contract.js'
