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
  Session,
  Speaker,
  Track,
} from './interfaces/index.js'

export {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from './interfaces/index.js'
