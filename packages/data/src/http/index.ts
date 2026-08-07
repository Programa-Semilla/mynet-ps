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
export { HttpAuthGateway } from './auth.js'
export type { AuthGateway } from './auth.js'
