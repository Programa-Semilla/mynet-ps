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
  Event,
  EventsRepository,
  Room,
  SavedSessionRepository,
  Session,
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

export {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './interfaces/index.js'
