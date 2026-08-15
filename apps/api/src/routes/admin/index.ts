import type { FastifyInstance } from 'fastify'

import { adminCatalogRoutes } from './catalog.js'
import { adminConferenceRoutes } from './conferences.js'
import { adminEnrolmentRoutes } from './enrolments.js'
import { adminMeRoutes } from './me.js'
import { adminModerationRoutes } from './moderation.js'
import { adminOperatorRoutes } from './operators.js'
import { adminReportRoutes } from './reports.js'
import { adminSessionRoutes } from './session.js'
import { adminVocabularyRoutes } from './vocabulary.js'

/**
 * T041 (013) — the administrative route group (contracts).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ROUTE REGISTERED HERE LIVES UNDER `/admin`, AND EVERY ONE OF THEM NAMES NO CONFERENCE
 * — WHICH IS WHY `event-scope-audit.test.ts` CANNOT COVER ANY OF THEM.**
 *
 * That audit examines a route **only if it declares an event parameter, and reports success
 * otherwise**. Administrative authority is product-wide or assignment-wide and is never derived
 * from a registration, so these routes have no conference to name — and would all pass it while
 * being guarded by nothing at all.
 *
 * `apps/api/tests/unit/operator-audit.test.ts` is the **fourth** route audit, and it fails any
 * route beneath this prefix carrying neither `requireOperator` nor `requirePlatformOperator`. It
 * also holds the positive table of routes only the platform tier may call, so a new
 * administrative route fails until somebody decides which tier it belongs to.
 *
 * **One route declares an event parameter anyway** — `/admin/conferences/:eventId/organizers` —
 * and it is the single place in this product where two audits disagree about the same path. The
 * event audit will examine it and demand `requireEventAccess`; it must not have one, because the
 * caller is a platform operator who is not registered for that conference and would fail that
 * guard entirely correctly. It carries an explicit entry in the event audit's allow-list with the
 * reason written down.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Split per domain, like `routes/index.ts` itself**, and appended rather than inserted for the
 * same reason: the generated contract lists paths in observation order, so reordering rewrites
 * `contracts/openapi.json` for no behavioural reason.
 */
export const adminRoutes = async (app: FastifyInstance): Promise<void> => {
  // US1 — the second actor exists and can sign in. Everything else depends on this.
  await adminSessionRoutes(app)
  await adminMeRoutes(app)

  // US2 — the report queue. The obligation that forced the amendment (register entry 21).
  await adminReportRoutes(app)

  // US3 — removing a reported question. Reachable only from a report (FR-953).
  await adminModerationRoutes(app)

  // US4 — conferences and promotion. The tier boundary 012 builds on.
  await adminConferenceRoutes(app)

  // US5 — operator deactivation. Authority must not outlive the access it depends on.
  await adminOperatorRoutes(app)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 014 — conference content authoring, appended per the append-only rule. **The first routes
  // beneath this prefix that name a conference and are guarded by authority over it** rather
  // than by tier alone, and the first that dispatch a notification.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  await adminCatalogRoutes(app)

  // 014 tranche 2 — the profile-taxonomy vocabulary, appended likewise. Platform tier only
  // (FR-1089): product-wide reference data no conference owns, so these routes name no
  // conference and carry `requirePlatformOperator` rather than the authoring guard (R20).
  await adminVocabularyRoutes(app)

  // 014 tranche 2 — the enrolment roster, appended likewise. The fourth recorded Principle
  // VIII exception (v5.3.0 O1), in its own module so the disclosure guard can audit its one
  // projection by name (R16). Conference-authority guarded, like the catalog routes above.
  await adminEnrolmentRoutes(app)
}
