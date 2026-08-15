import {
  HttpAdminCatalogRepository,
  HttpAdminConferenceRepository,
  HttpAdminReportRepository,
  HttpAdminSessionRepository,
  HttpAdminVocabularyRepository,
  HttpClient,
} from '@mynet/data/http'
import type {
  AdminCatalogRepository,
  AdminConferenceRepository,
  AdminReportRepository,
  AdminSessionRepository,
  AdminVocabularyRepository,
} from '@mynet/data'

/**
 * The administrative composition root (T044).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS A MUCH SMALLER FILE THAN `apps/web/src/app/services.ts`, AND EVERY DIFFERENCE IS A
 * REQUIREMENT RATHER THAN AN ECONOMY.**
 *
 * The attendee client's root wires seventeen repositories, every device capability, a local
 * cache and a freshness registry. This one wires an HTTP client and three repositories, and it
 * wires:
 *
 *   - **no device capabilities** — research R9. This product needs none of them, so
 *     `@mynet/platform` is absent from its dependencies entirely and
 *     `no-platform-dependency.test.ts` asserts it. Principle V is satisfied here by
 *     *subtraction*, `substitution.test.ts` is untouched, and no capability is added — which
 *     would have been a governance change, since `VisibilityService` needed constitution v3.1.0
 *     to ratify it and `InstallService` needed v5.1.0.
 *
 *     **The count is deliberately not written here.** It said "seven" until 016 ratified an
 *     eighth, at which point this header was quietly wrong — and a header that misstates a fact
 *     is the defect class 013's review named as its most transferable finding. What this file
 *     needs to say is *none*, which no amendment can falsify.
 *
 *   - **no caching decorator** — 009's answer rather than 008's. An operator acting on stale
 *     state resolves a report twice or removes a question that is already gone, and an
 *     undecorated repository has no `reads` map to omit a method from.
 *
 *   - **no connectivity service** — so `isOnline` is a constant. There is no offline behaviour
 *     to be honest about (FR-923), which means there is no state in which a request should be
 *     refused before it is attempted. Reporting "you are offline" from a product with no offline
 *     mode would be a fiction; a failed request surfaces as a failed request.
 *
 * **Substituting the whole object is one line in a test**, which is the property `apps/web`'s
 * registry has and the reason this is an object rather than module-level singletons.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface AdminServices {
  readonly session: AdminSessionRepository
  readonly reports: AdminReportRepository
  readonly conferences: AdminConferenceRepository
  /**
   * T036 (014) — conference content authoring (FR-1001).
   *
   * **A fourth repository and no fourth mechanism.** It is undecorated like the other three, for
   * a reason that is sharper here: the engagement counts on the programme are a **decision
   * input** — what an organizer reads to choose between deleting a session and cancelling it — so
   * a cached zero would present deletion as safe for a session somebody has since saved, and the
   * server's refusal would contradict the screen in front of them.
   */
  readonly catalog: AdminCatalogRepository
  /**
   * T172 (014 tranche 2) — the vocabulary (FR-1089).
   *
   * A fifth repository and still no new mechanism: undecorated like the other four, and here
   * the stale value would be the WORST kind — a cached "nobody holds this" would present
   * deletion as safe for a value somebody chose a minute ago, and the server's refusal would
   * contradict the screen. Platform tier only; a conference organizer's requests are refused
   * server-side with the 404 a nonexistent route gives, and the rail never offers them the
   * destination (`AdminShell`).
   */
  readonly vocabulary: AdminVocabularyRepository
}

export const createAdminServices = (): AdminServices => {
  const http = new HttpClient({
    // Only VITE_-prefixed values reach the bundle (FR-041). Caddy proxies `/api/*` under
    // `admin.<host>` so this stays same-origin — which is what keeps `connect-src 'self'`
    // literally true here and the host-only session cookie sendable (decision 37).
    baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
    // ── No `ConnectivityService`, so there is no belief to consult ────────────────────────
    //
    // The attendee client injects one because FR-053 requires a write to be *refused* rather
    // than queued while offline, and refusing before attempting is what makes the failure legible
    // as connectivity. This product has neither offline reads nor a queue, so the honest answer
    // is to always attempt: a request that cannot reach the server fails as a request, and
    // `HttpClient` already reports that with a truthful message — nothing was changed, try again.
    isOnline: () => true,
    fetch: globalThis.fetch.bind(globalThis),
  })

  return {
    session: new HttpAdminSessionRepository(http),
    reports: new HttpAdminReportRepository(http),
    conferences: new HttpAdminConferenceRepository(http),
    catalog: new HttpAdminCatalogRepository(http),
    vocabulary: new HttpAdminVocabularyRepository(http),
  }
}
