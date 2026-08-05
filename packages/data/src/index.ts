/**
 * Repository interfaces in domain terms (constitution Principle V).
 *
 * No method here accepts a caller-supplied attendee identifier — that absence is what makes
 * FR-036 structural rather than a rule someone has to remember. See `interfaces/index.ts`.
 */
export type {
  Attendee,
  AttendeeRepository,
  Event,
  EventsRepository,
  Repositories,
} from './interfaces/index.js'

export { NotAuthenticatedError, OfflineError, SessionExpiredError } from './interfaces/index.js'
