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
// 006 — the Discover directory. One new route plus 004's two profile reads, used unchanged.
export { HttpDirectoryRepository } from './directory-repository.js'
// 007 — Messages, the safety controls, and device registration. **Not one of these addresses
// begins `/events/`**: conversations are cross-event (FR-507), so there is no conference for
// `requireEventAccess` to guard and the server substitutes a branded `ConversationScope`
// instead. None of the five is decorated with `cached()` at the composition root, and the
// refusal is declared there (FR-563).
export { HttpConversationRepository, HttpMessageRepository } from './messages-repository.js'
export { HttpBlockRepository, HttpReportRepository } from './safety-repository.js'
export { HttpPushSubscriptionRepository } from './push-repository.js'
// 008 — Network. **The two files disagree about whether their addresses name a conference, and
// that disagreement is the feature's central decision.** `cards-repository.ts` names none,
// because a held card is cross-event and outlives the conference it was shared at — which is
// exactly why the server needs a third route audit for it. `appointments-repository.ts` names
// one in every path, because an appointment is a time at a specific conference, which puts it
// inside the audit that already exists (research R1, R2).
export { HttpCardRepository } from './cards-repository.js'
export { HttpAppointmentRepository } from './appointments-repository.js'
// 009 — audience questions. Names a conference in **every** path, like appointments above and
// unlike cards — including on the three addresses whose question could be found without one. The
// server names it because `event-scope-audit` examines a route only if it does and reports
// success otherwise; this mirrors it so neither side reads as optional (research R12, FR-742).
export { HttpQuestionsRepository } from './questions-repository.js'
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 011 — the administrative product's three repositories.
//
// Exported from this barrel like every other HTTP implementation, and **deliberately absent from
// the `Repositories` aggregate in `interfaces/index.ts`**: that aggregate is what
// `packages/platform`'s injected registry exposes to `apps/web`, and adding an administrative
// repository to it would put administrative code inside MyNet's bundle — which decision 33
// forbids and `apps/web/tests/unit/admin-absences.test.ts` catches. They are composed in
// `apps/admin/src/app/services.ts`, that product's own root. See `deviations.md` D2.
//
// **None is decorated with `cached`**, and the absence is the whole offline story for the
// administrative product: an operator acting on stale state resolves a report twice or removes a
// question that is already gone. 009's reasoning, applied to a second product.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export {
  HttpAdminConferenceRepository,
  HttpAdminReportRepository,
  HttpAdminSessionRepository,
} from './administration-repository.js'

// 014 — conference content authoring, in its own module rather than appended to the three above.
// It is the only administrative repository whose every path names a conference, because authority
// over one is the predicate the server checks (FR-1035); the others are guarded by tier alone.
export { HttpAdminCatalogRepository } from './admin-catalog-repository.js'
