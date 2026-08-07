/**
 * The HTTP implementations of the repository interfaces (FR-045).
 *
 * This directory is the **only** place in the client that constructs a request or knows a
 * URL. Feature code depends on `@mynet/data`'s interfaces; swapping these implementations for
 * test doubles requires no change to feature code (FR-047).
 */
export { ApiError, HttpClient } from './client.js'
export type { HttpClientOptions } from './client.js'
export { HttpAttendeeRepository } from './attendee-repository.js'
export { HttpEventsRepository } from './events-repository.js'
export { HttpActiveEventRepository } from './active-event-repository.js'
export { HttpCatalogRepository } from './catalog-repository.js'
// 005 — the attendee's own agenda.
export { HttpSavedSessionRepository, HttpSessionNotesRepository } from './agenda-repository.js'
// 004 — identity and the attendee's own profile.
export { HttpIdentityRepository } from './identity-repository.js'
export { HttpProfileRepository } from './profile-repository.js'
// 005 — the caching decorator. Applied at the composition root, so no component learns that a
// cache exists (research D1, Principle V).
export {
  attendeePrefix,
  cached,
  cacheKey,
  CACHE_LIFETIME_MS,
  conferencePrefix,
  createFreshnessRegistry,
} from './cached.js'
export type { CachedReads, CacheOptions, CacheScope, Clock, FreshnessRegistry } from './cached.js'
export type { CachedEntry, LocalCache } from './cache-store.js'
export { HttpAuthGateway } from './auth.js'
export type { AuthGateway } from './auth.js'
