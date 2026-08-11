# Tasks: Administrative Foundation — the Second Actor, the Admin Site, and the Report Queue

**Feature**: 011 · **Branch**: `spec/011-administrative-product` · **Migration**: `0009`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Constitution**: v4.1.0

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different files, no dependency on an incomplete task
- **[US1]–[US5]** — the user story the task serves (user-story phases only)

## Path Conventions

- `apps/admin/` — the **new** administrative client
- `apps/api/src/admin/` — administrative guards and branded scopes
- `apps/api/src/routes/admin/` — administrative routes
- `apps/web/` — MyNet. **Nothing in this feature adds to it**; the only entries touching it assert absences

---

## Global Constraints

**Every task inherits this section.** Values are copied verbatim from the spec, plan and constitution
so no task has to go looking for them.

| Constraint | Value |
|---|---|
| Migration number | **`0009`** — the only one this feature claims |
| Requirement range | FR-900–FR-999, SC-900–SC-912 |
| Constitution | **v4.1.0**, standing decisions 31–39 |
| Branded scopes | `OperatorScope` (all admin routes), `PlatformScope` (platform tier only) — refinement, not a flag |
| Route prefix | `/admin/*` — every route under it carries a guard or an allow-list entry with a written reason |
| Admin origin | `admin.{$APP_DOMAIN}`, host-only session cookie, `SameSite=Lax` preserved on both origins |
| Session bounds | `ADMIN_SESSION_IDLE_MINUTES` **and** `ADMIN_SESSION_ABSOLUTE_HOURS`; the cap is fixed at establishment, never advanced |
| Refusal shapes | 401 unauthenticated · 401 identical across all four sign-in failures · **404** for wrong tier · 403+reason for unreplaced credential · 409+reason for double resolution |
| Client error handling | Classify on `error.code`, **never** `instanceof` — every non-2xx throws `ApiError` |
| Caching | **Nothing in this feature is cached.** No repository takes the caching decorator |
| Notifications | **None.** The trigger set stays at a received message; the source-level audit is not edited |
| **The five guards** | `seed/catalog.ts`, `catalog-read-only.test.ts`, `join-grants-nothing.test.ts`, `qa-absences.test.ts`, `no-report-read-surface.test.ts` — amended **deliberately and narrowly**, never weakened to the point of checking nothing (FR-976) |
| Absence discipline | Every absence requirement gets a test that fails when the absence ends. **Strip comments before matching**, because every pattern also appears in the prose explaining it |
| Dialogs | Centred by the base `<dialog>` rule in `theme/tokens.css`; Escape dismissal; focus restored to the opener **after** closing |

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create `apps/admin/` workspace package with `package.json` naming `@mynet/admin`, added to `pnpm-workspace.yaml` — a **separate application** reusing none of MyNet's five destinations, Home card registry or navigation contract (FR-920)
- [ ] T002 [P] Create `apps/admin/tsconfig.json` extending the `packages/config` TypeScript base
- [ ] T003 [P] Create `apps/admin/vite.config.ts` — **explicitly without `vite-plugin-pwa`** (research R1, FR-923)
- [ ] T004 [P] Create `apps/admin/vitest.config.ts` extending the shared Vitest base in `packages/config`
- [ ] T005 [P] Create `apps/admin/index.html` with favicon only — no manifest link, no `apple-touch-icon` (FR-923)
- [ ] T006 [P] Create `apps/admin/src/theme/index.css` importing shared `theme/tokens.css` and the 010 brand assets (FR-921)
- [ ] T007 Add `apps/admin` to the root `pnpm verify`, `lint` and `typecheck` scripts in `package.json` (Principle VII)
- [ ] T008 [P] Add `apps/admin` jobs to `.github/workflows/verify.yml` for typecheck, lint, unit, component and build
- [ ] T009 [P] Add `ADMIN_SESSION_IDLE_MINUTES`, `ADMIN_SESSION_ABSOLUTE_HOURS`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` to `deploy/vm/.env.example`, each documenting what a blank value costs
- [ ] T010 Add the four values to `apps/api/src/config.ts` with boot-time validation, following the existing `positiveInt` pattern (research R8)

> **Interfaces produced by T010** — `config.admin: { sessionIdleMs: number; sessionAbsoluteMs: number }`. Consumed by T037 and T060.

**Checkpoint**: `pnpm verify` passes with an empty admin app in the workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Every user story depends on this phase. Nothing visible works until Phase 3, which is exactly why this phase gets skipped under pressure — see plan.md.**

### Guards written first, and failing

- [ ] T011 Write `apps/api/tests/unit/operator-audit.test.ts` — fails any route under `/admin/*` carrying neither `requireOperator` nor `requirePlatformOperator`; maintains an explicit allow-list with written reasons (contracts, R5). **Must fail at this point**
- [ ] T012 [P] Write `apps/web/tests/unit/admin-absences.test.ts` asserting FR-970, FR-971, FR-972, FR-973: no administrative route, screen, navigation entry, tier-dependent rendering, or report-reading surface in `apps/web/src` (SC-907). **Strip comments before matching** — 009's rule
- [ ] T013 [P] Write `apps/admin/tests/unit/no-service-worker.test.ts` asserting `apps/admin/src` contains no `serviceWorker` or `registerSW` reference (research R9)
- [ ] T014 [P] Write `apps/admin/tests/unit/no-platform-dependency.test.ts` asserting `apps/admin/package.json` declares no `@mynet/platform` dependency — the admin client needs none of the seven capabilities and must not add an eighth (research R9)
- [ ] T015 [P] Write `apps/api/tests/unit/admin-forbidden-surfaces.test.ts` over `apps/api/src` asserting **six absences** that have no other guard: no operator or organizer **self-creation** route (FR-902); no route returning an operator in any attendee-facing payload (FR-903); no **avatar moderation** route (FR-954); no **attendee suspension, removal or restriction** route (FR-955); no **profile read or write** route for any administrative tier (FR-973); and no route exposing the **audit trail** or re-disclosing content through it (FR-999). Strip comments before matching
- [ ] T016 [P] Write `apps/api/tests/unit/admin-tier-signals.test.ts` asserting the administrative guards in `apps/api/src/admin/` reference **neither** verification state **nor** discoverability (FR-907) — the project invariant is that verification gates exactly one thing, and a second consumer of it is a governance change rather than a refactor

### Migration and schema

- [ ] T017 Create `apps/api/src/db/schema/operators.ts` — id, email (citext unique), display name, nullable `password_hash`, `credential_is_initial`, `deactivated_at`, per data-model.md
- [ ] T018 [P] Create `apps/api/src/db/schema/operator-sessions.ts` — nullable `operator_id` and `attendee_id` with a check constraint that exactly one is non-null, `idle_expires_at`, `absolute_expires_at`
- [ ] T019 [P] Create `apps/api/src/db/schema/organizer-assignments.ts` — `attendee_id` **CASCADE**, `event_id` **NO ACTION** (FR-937), `assigned_by`, partial unique index on `(attendee_id, event_id) WHERE revoked_at IS NULL`
- [ ] T020 [P] Create `apps/api/src/db/schema/report-resolutions.ts` — `report_id` **unique** (this is FR-945's concurrency guarantee), `resolved_by` NO ACTION, outcome check constraint, note
- [ ] T021 [P] Create `apps/api/src/db/schema/admin-audit.ts` — `subject_attendee_id` as a **plain nullable column with no foreign key**, with the reasoning in the header (research R6)
- [ ] T022 Amend the header comment of `apps/api/src/db/schema/reports.ts` — FR-548 survives for MyNet, the read surface exists only in the administrative product for the platform tier. **Amend, do not delete**: the reasoning still governs the attendee product
- [ ] T023 Move `apps/api/migrations/meta/README.md` aside, run `drizzle-kit generate`, restore it, and rename output to `apps/api/migrations/0009_administrative_foundation.sql` (`meta/README.md` is JSON-parsed by the generator)
- [ ] T024 Review `apps/api/migrations/0009_administrative_foundation.sql` by hand — confirm the `event_id` reference is `NO ACTION`, the partial unique index is present, and `admin_audit_entries.subject_attendee_id` carries **no** foreign key

> **Interfaces produced by T017–T021** — Drizzle table exports `operators`, `operatorSessions`, `organizerAssignments`, `reportResolutions`, `adminAuditEntries`, all re-exported from `apps/api/src/db/schema/index.ts`. Every later query task imports from there.

### Coverage guards (these fail by existing the moment T023 lands)

- [ ] T025 Add allow-list entries to `apps/api/tests/unit/deletion-coverage.test.ts` stating **pseudonymise-plus-clock** (audit), **deactivate-plus-clock** (operators) and cascade-from-subject (sessions) — each with a written reason, not a bare exemption (FR-983)
- [ ] T026 [P] Add `organizer_assignments` to `apps/api/tests/unit/export-coverage.test.ts` and declare operator and audit records as non-attendee data (FR-981, FR-982)
- [ ] T027 [P] Add `RETENTION_SWEEPS` entries for pseudonymised audit entries and unreferenced deactivated operators in `apps/api/src/maintenance.ts`, with the stated windows (FR-998, FR-909, FR-984)
- [ ] T028 Add the `apps/api/tests/unit/event-scope-audit.test.ts` allow-list entry for `/admin/conferences/:eventId/organizers`, with the reason written down — the caller is a platform operator who would correctly fail `requireEventAccess` (plan, post-design re-check)

### Branded scopes and guards

- [ ] T029 Create `apps/api/src/admin/scope.ts` — branded `OperatorScope` and `PlatformScope` as a refinement, constructible only by the guards below
- [ ] T030 Create `apps/api/src/admin/require-operator.ts` — `requireOperator` resolving an `operator_sessions` row and enforcing **both** expiry bounds
- [ ] T031 Add `requirePlatformOperator` to `apps/api/src/admin/require-operator.ts` — refuses a conference organizer with **404**, indistinguishable from a route that does not exist (contracts)
- [ ] T032 [P] Add the lint rule keeping `OperatorScope`'s type-assertion escape hatch closed in `eslint.config.js`, mirroring the existing rule for `EventScope`
- [ ] T033 [P] Write `apps/api/tests/unit/admin-scope-brand.test.ts` asserting a platform-only handler receiving only `OperatorScope` fails to typecheck

> **Interfaces produced by T029–T031** —
> `requireOperator(request): Promise<OperatorScope>`;
> `requirePlatformOperator(request): Promise<PlatformScope>`;
> `OperatorScope = { operatorId: string | null; attendeeId: string | null; tier: 'platform' | 'organizer' }` (branded);
> `PlatformScope extends OperatorScope` (branded, `tier: 'platform'`).
> Every route task in Phases 3–7 consumes these exact names.

### Audit trail (needed before the queue — reading report content writes an entry)

- [ ] T034 Create `apps/api/src/db/queries/admin-audit.ts` with append and sweep only — **no update, no delete** (FR-996)
- [ ] T035 [P] Write `apps/api/tests/unit/audit-append-only.test.ts` asserting by name-shape over the exports of `apps/api/src/db/queries/admin-audit.ts` that no update or delete path exists — the mechanism `catalog-read-only.test.ts` uses for FR-191
- [ ] T036 Create `packages/data/src/interfaces/admin-audit.ts` repository interface and register it in `packages/platform`'s `Repositories` (one line, per the append-only extension point)

> **Interfaces produced by T034** —
> `appendAuditEntry(entry: { operatorId: string; action: 'promote' | 'demote' | 'resolve_report' | 'remove_question' | 'deactivate_operator' | 'disclose_report_content'; subjectAttendeeId?: string; subjectResourceId?: string; subjectKind?: string }): Promise<void>`.
> Called by T088, T090, T107, T124, T141.

### Session store

- [ ] T037 Create `apps/api/src/admin/session.ts` — start, resolve, revoke, with `absolute_expires_at` **fixed at establishment** and never advanced (research R8), reading `config.admin` from T010
- [ ] T038 Create `apps/api/src/admin/cookie.ts` — **host-only** (no `Domain`), `httpOnly`, `sameSite: 'lax'`, `secure` gated on `config.isDeployed`, with the reasoning comment (FR-911, FR-913)
- [ ] T039 [P] Write `apps/api/tests/unit/admin-cookie.test.ts` asserting no `Domain` attribute is ever set — the property FR-912's independence rests on
- [ ] T040 Add `admin_sign_in` as a new throttle action in `apps/api/src/auth/throttle.ts`, configured `mayDeny: false` (FR-916, research R4)

> **Interfaces produced by T037** —
> `startAdminSession(reply, subject: { operatorId: string } | { attendeeId: string }): Promise<void>`;
> `revokeAdminSession(reply, sessionId: string): Promise<void>`.
> Consumed by T060, T061.

### Route scaffolding and origin

- [ ] T041 Create `apps/api/src/routes/admin/index.ts` registering the administrative route group, following the per-domain split convention, and register it in `apps/api/src/routes/index.ts`
- [ ] T042 [P] Add the second Caddy site block for `admin.{$APP_DOMAIN}` in `deploy/vm/Caddyfile`, serving `apps/admin` and proxying `/api/*` to `api:3000` so administrative requests stay same-origin (FR-910, research R2)
- [ ] T043 [P] Add security response headers to the admin block in `deploy/vm/Caddyfile` — and **do not** add them to MyNet's block in this feature, so the `security-response-headers` inbox entry does not read as closed (research R9)

### Client shell scaffold

- [ ] T044 Create `apps/admin/src/main.tsx` — **no service-worker registration**, no shared bootstrap import from `apps/web`
- [ ] T045 [P] Create `apps/admin/src/app/shell/AdminShell.tsx` — rail, top bar, tier indicator (FR-924)
- [ ] T046 [P] Create `apps/admin/src/app/shell/RequireOperator.tsx` client-side session gate (presentation only; authorisation is server-side per FR-980)
- [ ] T047 [P] Create `apps/admin/src/app/routes.tsx` with an append-only destination declaration, mirroring `navigation.ts`'s contract without reusing MyNet's

**Checkpoint**: migration applies, every guard exists and fails correctly, no route is reachable yet.

---

## Phase 3: User Story 1 — A platform operator signs in, and the second actor exists (Priority: P1) 🎯 MVP

**Goal**: an administrative identity exists, authenticates on its own origin, and holds a session independent of any attendee session.

**Independent test**: seed a platform operator, bootstrap a credential, sign in; confirm the session is distinct from an attendee session in the same browser and that signing out of one leaves the other.

### Tests for User Story 1

- [ ] T048 [P] [US1] Integration test in `apps/api/tests/integration/admin-sign-in.test.ts` — the four refusals are **identical** in status, shape and wording (FR-915), and an unauthenticated request to any admin address discloses nothing about what exists (FR-917)
- [ ] T049 [P] [US1] Integration test in `apps/api/tests/integration/admin-address-uniqueness.test.ts` — an operator cannot take an attendee's address and vice versa, driven **concurrently** because the constraint is application-enforced (FR-918, plan Complexity Tracking)
- [ ] T050 [P] [US1] Integration test in `apps/api/tests/integration/admin-session-bounds.test.ts` — idle expiry and **absolute** expiry are separately observable, and expiry returns to sign-in without disclosing the prior view (FR-919a, FR-919b)
- [ ] T051 [P] [US1] Integration test in `apps/api/tests/integration/admin-bootstrap.test.ts` — absent credential means sign-in is **impossible**, not defaulted; an unreplaced initial credential reaches no surface; a re-seed does not reset a replaced credential (FR-991, FR-992, FR-993, SC-912)
- [ ] T052 [P] [US1] Component test in `apps/admin/tests/component/sign-in.test.tsx` — loading, failure and disabled-submit states
- [ ] T053 [P] [US1] E2E test in `e2e/admin-sessions.spec.ts` — two browser contexts proving FR-912 in both directions (SC-901)

### Implementation for User Story 1

- [ ] T054 [P] [US1] Create `apps/api/src/db/seed/operators.ts` seeding **identities only**, with a null `password_hash` and a header explaining why (FR-990, FR-901)
- [ ] T055 [US1] Register the operator seed module in `apps/api/src/db/seed/index.ts` per the per-domain split
- [ ] T056 [US1] Create `apps/api/src/admin/bootstrap.ts` consuming `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` (research R10)
- [ ] T057 [US1] Add a `pnpm admin:bootstrap` script to the root `package.json` pointing at `apps/api/src/admin/bootstrap.ts` — **separate from `db:seed`**, which deletes every attendee and re-inserts committed passwords
- [ ] T058 [US1] Implement FR-993 in `apps/api/src/admin/bootstrap.ts` — never reset an operator who has replaced their credential; assert it, because idempotent upsert is the natural wrong implementation
- [ ] T059 [US1] Implement address resolution across both stores as **one lookup** in `apps/api/src/admin/identity.ts` (research R4, FR-914)
- [ ] T060 [US1] Implement `POST /admin/session` in `apps/api/src/routes/admin/session.ts` — always runs password verification on a miss so timing does not answer what the response refuses (FR-915)
- [ ] T061 [US1] Implement `DELETE /admin/session` in `apps/api/src/routes/admin/session.ts` (FR-919)
- [ ] T062 [US1] Implement `PUT /admin/session/credential` in `apps/api/src/routes/admin/session.ts` — forced replacement, reachable with an initial credential (FR-992)
- [ ] T063 [US1] Implement `GET /admin/me` in `apps/api/src/routes/admin/me.ts` returning identity and tier (FR-900, FR-924)
- [ ] T064 [US1] Add the `admin_sign_in` throttle to `POST /admin/session` in `apps/api/src/routes/admin/session.ts` (FR-916)
- [ ] T065 [P] [US1] Create `packages/data/src/interfaces/admin-session.ts` and its HTTP implementation in `packages/data/src/http/admin-session.ts`
- [ ] T066 [US1] Register the admin session repository in `packages/platform`'s `Repositories` — one line; `registry.tsx` untouched
- [ ] T067 [P] [US1] Build `apps/admin/src/app/auth/SignIn.tsx` with loading, failure and disabled-submit states
- [ ] T068 [P] [US1] Build `apps/admin/src/app/auth/ReplaceCredential.tsx` for the forced replacement flow
- [ ] T069 [US1] Build `apps/admin/src/app/shell/AdminHome.tsx` naming the operator and their tier
- [ ] T070 [P] [US1] Desktop layout in `apps/admin/src/app/shell/AdminShell.tsx` — persistent rail, contextual top bar
- [ ] T071 [P] [US1] Tablet layout in `apps/admin/src/app/shell/AdminShell.tsx` — reduced rail, stacked detail
- [ ] T072 [P] [US1] Mobile layout in `apps/admin/src/app/shell/AdminShell.tsx` — single column, touch-sized controls, no horizontal scrolling
- [ ] T073 [P] [US1] Accessibility pass on `apps/admin/src/app/shell/` and `apps/admin/src/app/auth/` — labels, visible focus, keyboard operability (FR-922)
- [ ] T074 [US1] Regenerate and commit `contracts/openapi.json` for the session routes

**Checkpoint**: US1 is independently demonstrable. This is the MVP.

---

## Phase 4: User Story 2 — An operator reads the report queue and the promise becomes true (Priority: P1)

**Goal**: reports filed since 007 become readable by a platform operator, with content and reason.

**Independent test**: file a conversation report and a question report as attendees; read both as a platform operator; resolve one; confirm the reporter is told nothing.

**Depends on**: US1 (shell and session), Phase 2 (audit trail — reading content **writes** an entry).

### Tests for User Story 2

- [ ] T075 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-queue.test.ts` — both report origins appear in one list (`abuse_reports` is one cross-event table), showing reporter, subject, instant, reason and content (FR-940)
- [ ] T076 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-disclosure.test.ts` — the response carries **nothing** about the surrounding thread, the pair's other conversations, or any third party (FR-942)
- [ ] T077 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-content-missing.test.ts` — a report whose messages were deleted returns `contentAvailable: false`, **not** an error; every report an attendee can file is readable including this one (FR-941, SC-902)
- [ ] T078 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-tier.test.ts` — a conference organizer is refused on every queue address by **direct address entry** (FR-906, SC-904)
- [ ] T079 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-concurrency.test.ts` — a second resolution is refused with an explanation, not an overwrite (FR-945)
- [ ] T080 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-silence.test.ts` — resolution discloses nothing to the reporter, the reported attendee, or any MyNet surface (FR-946)
- [ ] T081 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-mail-unchanged.test.ts` — filing a report **still dispatches operator mail**, and that mail still carries identifiers and a timestamp only, never message text and never the reason (FR-947)
- [ ] T082 [P] [US2] Integration test in `apps/api/tests/integration/admin-audit-disclosure.test.ts` — reading content writes `disclose_report_content`; reading the **list** writes nothing (FR-995)
- [ ] T083 [P] [US2] Unit test in `apps/admin/tests/unit/error-classification.test.ts` requiring all seven refusal outcomes to be **different from each other** — the property `instanceof` classification destroys (contracts)
- [ ] T084 [P] [US2] Component test in `apps/admin/tests/component/report-detail.test.tsx` — content-unavailable renders as a state, not a failure

### Implementation for User Story 2

- [ ] T085 [P] [US2] Create `apps/api/src/db/queries/admin-reports.ts` — list and detail, scoping enforced **in the query** rather than by what the client renders
- [ ] T086 [US2] Implement `GET /admin/reports` in `apps/api/src/routes/admin/reports.ts` — open and resolved separated (FR-943), **no content in the list**
- [ ] T087 [US2] Implement `GET /admin/reports/:reportId` in `apps/api/src/routes/admin/reports.ts` with content, reason and `contentAvailable` (FR-940, FR-941)
- [ ] T088 [US2] Write the `disclose_report_content` audit entry from `GET /admin/reports/:reportId` only, in `apps/api/src/routes/admin/reports.ts` (FR-995)
- [ ] T089 [US2] Implement `POST /admin/reports/:reportId/resolution` in `apps/api/src/routes/admin/reports.ts`, relying on the unique constraint for concurrency (FR-943, FR-944, FR-945)
- [ ] T090 [US2] Write the `resolve_report` audit entry in `apps/api/src/routes/admin/reports.ts` (FR-994)
- [ ] T091 [P] [US2] Create `packages/data/src/interfaces/admin-reports.ts` and its HTTP implementation in `packages/data/src/http/admin-reports.ts` — **undecorated**, no caching
- [ ] T092 [US2] Register the reports repository in `packages/platform`'s `Repositories`
- [ ] T093 [P] [US2] Build `apps/admin/src/app/reports/ReportQueue.tsx` — open and resolved views, with an **empty open queue as a deliberate state**
- [ ] T094 [P] [US2] Build `apps/admin/src/app/reports/ReportDetail.tsx` rendering content, reason, and content-unavailable
- [ ] T095 [US2] Build `apps/admin/src/app/reports/ResolveDialog.tsx` — outcome and note, with **Escape dismissal and focus restored to the opener after closing**
- [ ] T096 [US2] Ensure `ResolveDialog` is centred by the base `<dialog>` rule in `theme/tokens.css` — 004's and 008's dialogs shipped in the top-left corner because Preflight removes `margin: auto`
- [ ] T097 [P] [US2] Three layouts for `apps/admin/src/app/reports/` — side by side at desktop, stacked at tablet and mobile
- [ ] T098 [P] [US2] Accessibility pass on `apps/admin/src/app/reports/`
- [ ] T099 [US2] Regenerate and commit `contracts/openapi.json` for the report routes

**Checkpoint**: register entry 21's promise — "a person will read it" — is true for the first time.

---

## Phase 5: User Story 3 — An operator removes an abusive question (Priority: P1)

**Goal**: a reported question can be removed, and its votes go with it.

**Independent test**: publish, upvote, report, remove; confirm it is gone for every attendee and no other count moved.

**Depends on**: US2 (removal is reachable only from a report).

### Tests for User Story 3

- [ ] T100 [P] [US3] Integration test in `apps/api/tests/integration/admin-remove-question.test.ts` — the question and **all** its votes go; no other question's count changes; the author is not told who removed it or why (FR-950, FR-951, FR-952)
- [ ] T101 [P] [US3] Integration test in `apps/api/tests/integration/admin-remove-question-race.test.ts` — a vote arriving mid-removal blocks on `FOR UPDATE` rather than creating a vote on a removed row (research R7)
- [ ] T102 [P] [US3] Integration test in `apps/api/tests/integration/admin-no-message-removal.test.ts` — a message report offers no removal action anywhere (FR-953)
- [ ] T103 [P] [US3] Amend `apps/api/tests/unit/qa-absences.test.ts` to permit exactly one moderation route **narrowed by path**, still forbidding answer, pin, edit and downvote. **Do not weaken the pattern** — 009 recorded that as the natural wrong repair
- [ ] T104 [P] [US3] E2E test in `e2e/admin-moderation.spec.ts` — three browser profiles confirm the question is gone for all of them within one refresh (SC-903)

### Implementation for User Story 3

- [ ] T105 [US3] Implement question removal in `apps/api/src/db/queries/admin-moderation.ts` with `SELECT … FOR UPDATE` on the question row, mirroring 009's withdrawal lock
- [ ] T106 [US3] Implement `DELETE /admin/questions/:questionId` in `apps/api/src/routes/admin/moderation.ts` under `requirePlatformOperator`
- [ ] T107 [US3] Write the `remove_question` audit entry in `apps/api/src/routes/admin/moderation.ts` (FR-994)
- [ ] T108 [P] [US3] Extend `packages/data/src/interfaces/admin-reports.ts` with the removal method and its HTTP implementation
- [ ] T109 [US3] Add the removal control to `apps/admin/src/app/reports/ReportDetail.tsx`, offered **only** for a question report (FR-953)
- [ ] T110 [US3] Build the removal confirmation in `apps/admin/src/app/reports/RemoveQuestionDialog.tsx` as a nested dialog, comparing `event.target` against its own dialog so one Escape does not close the parent — 009's finding, invisible to component tests because jsdom has no top layer
- [ ] T111 [P] [US3] Accessibility pass on `apps/admin/src/app/reports/RemoveQuestionDialog.tsx`
- [ ] T112 [US3] Regenerate and commit `contracts/openapi.json` for the moderation route

**Checkpoint**: the product's only unmoderated many-to-many surface has a moderator.

---

## Phase 6: User Story 4 — A platform operator promotes an attendee, and the tier boundary is real (Priority: P1)

**Goal**: the two-tier boundary exists and is enforced, which is what 012 will build on.

**Independent test**: promote for one of two conferences; sign in as that person; confirm they see one conference, not the other, and no platform surface.

**Depends on**: US1. **Independent of US2/US3** — can run in parallel with Phases 4–5.

### Tests for User Story 4

- [ ] T113 [P] [US4] Integration test in `apps/api/tests/integration/admin-promotion.test.ts` — promotion requires existing registration, records actor and instant, and demotion ends access while leaving the account untouched (FR-930, FR-931, FR-933, FR-934)
- [ ] T114 [P] [US4] Integration test in `apps/api/tests/integration/admin-multi-assignment.test.ts` — one attendee promoted for two conferences, each assignment **independently revocable** (FR-932)
- [ ] T115 [P] [US4] Integration test in `apps/api/tests/integration/admin-tier-boundary.test.ts` — an organizer is refused on every platform address by direct entry, and sees only assigned conferences (FR-905, FR-906, SC-904)
- [ ] T116 [P] [US4] Integration test in `apps/api/tests/integration/admin-organizer-attendee-unchanged.test.ts` — a promoted attendee's MyNet surfaces are identical to before promotion (FR-904)
- [ ] T117 [P] [US4] Integration test in `apps/api/tests/integration/admin-reseed-guard.test.ts` — with a live assignment, the seed fails **naming organizer assignments**, not a bare FK error (FR-937, FR-938, FR-939)
- [ ] T118 [P] [US4] Integration test in `apps/api/tests/integration/admin-no-notification.test.ts` — promotion and demotion dispatch nothing (FR-935)
- [ ] T119 [P] [US4] Component test in `apps/admin/tests/component/conference-list.test.tsx` — unassigned renders; an organizer's empty assignment list renders as a deliberate state
- [ ] T120 [P] [US4] Component test in `apps/admin/tests/component/tier-controls.test.tsx` — a conference organizer is **rendered no control** for a capability they do not hold (FR-925), which is separate from the server refusal in T115

### Implementation for User Story 4

- [ ] T121 [P] [US4] Create `apps/api/src/db/queries/admin-assignments.ts` — list conferences with organizers, deriving `unassigned` from the absence of a live assignment (FR-936)
- [ ] T122 [US4] Implement `GET /admin/conferences` in `apps/api/src/routes/admin/conferences.ts` — all conferences for platform tier, assigned only for organizers (FR-926)
- [ ] T123 [US4] Implement `POST /admin/conferences/:eventId/organizers` in `apps/api/src/routes/admin/conferences.ts` under `requirePlatformOperator`, with the registration precondition (FR-930, FR-933)
- [ ] T124 [US4] Implement `DELETE /admin/conferences/:eventId/organizers/:attendeeId` for demotion in `apps/api/src/routes/admin/conferences.ts` (FR-934), writing `promote` and `demote` audit entries (FR-994)
- [ ] T125 [US4] Add organizer-assignment clearing to `apps/api/src/db/seed/index.ts` as a **declared step**, clearing the whole domain rather than only what it seeded (FR-938)
- [ ] T126 [P] [US4] Create `packages/data/src/interfaces/admin-conferences.ts` and its HTTP implementation in `packages/data/src/http/admin-conferences.ts`
- [ ] T127 [US4] Register the conferences repository in `packages/platform`'s `Repositories`
- [ ] T128 [P] [US4] Build `apps/admin/src/app/conferences/ConferenceList.tsx` showing organizers or **unassigned**
- [ ] T129 [US4] Build `apps/admin/src/app/conferences/PromoteDialog.tsx`, centred by the base `<dialog>` rule, with Escape and focus restoration
- [ ] T130 [P] [US4] Three layouts and an accessibility pass for `apps/admin/src/app/conferences/`
- [ ] T131 [US4] Regenerate and commit `contracts/openapi.json` for the conference routes

**Checkpoint**: the boundary 012 depends on is real and independently tested.

---

## Phase 7: User Story 5 — Leaving takes the authority with it (Priority: P2)

**Goal**: authority never outlives the access it depends on, and deletion is never made conditional.

**Independent test**: promote, then withdraw; promote, then delete the account. Confirm assignments end, the conference shows unassigned with content intact, and audit entries pseudonymise.

**Depends on**: US4.

### Tests for User Story 5

- [ ] T132 [P] [US5] Integration test in `apps/api/tests/integration/admin-deletion-revokes.test.ts` — deletion proceeds with no extra step, no blocking warning and no refusal (FR-960, SC-905)
- [ ] T133 [P] [US5] Integration test in `apps/api/tests/integration/admin-withdrawal-revokes.test.ts` — withdrawal revokes that conference's assignment only (FR-961)
- [ ] T134 [P] [US5] Integration test in `apps/api/tests/integration/admin-audit-pseudonymise.test.ts` — the subject id is cleared, operator/action/instant survive, **no placeholder row and nothing reconstructible** (FR-997a, FR-997b)
- [ ] T135 [P] [US5] Integration test in `apps/api/tests/integration/admin-unassigned-content-intact.test.ts` — sessions, tracks, rooms and speakers survive an organizer's departure (FR-962, SC-906)
- [ ] T136 [P] [US5] Integration test in `apps/api/tests/integration/admin-operator-deactivation.test.ts` — access ends immediately; the identity still resolves on records naming it, including a report resolution (FR-908, FR-909, FR-944)

### Implementation for User Story 5

- [ ] T137 [US5] Add assignment revocation to the account-deletion transaction in `apps/api/src/routes/account.ts` — **a file 004 owns** (FR-960)
- [ ] T138 [US5] Add audit pseudonymisation to the same transaction in `apps/api/src/routes/account.ts` — `UPDATE … SET subject_attendee_id = NULL` (FR-997a)
- [ ] T139 [US5] Add assignment revocation to the withdrawal path in `apps/api/src/routes/events.ts` in the same transaction — **a file 004/008 own** (FR-961)
- [ ] T140 [US5] Implement `POST /admin/operators/:operatorId/deactivation` in `apps/api/src/routes/admin/operators.ts` (FR-908)
- [ ] T141 [US5] Write the `deactivate_operator` audit entry in `apps/api/src/routes/admin/operators.ts`, and ensure a deactivated operator still resolves on entries naming them (FR-909, FR-997)
- [ ] T142 [P] [US5] Build `apps/admin/src/app/conferences/OperatorList.tsx` with deactivation and its confirmation dialog
- [ ] T143 [P] [US5] Add the last-operator edge case to `deploy/vm/README.md` — recovery is by re-seed, deliberately unguarded (spec Assumptions)
- [ ] T144 [P] [US5] Three layouts and an accessibility pass for `apps/admin/src/app/conferences/OperatorList.tsx`
- [ ] T145 [US5] Regenerate and commit `contracts/openapi.json` for the operator routes

**Checkpoint**: every user story is complete and independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T146 [P] Extend `e2e/responsive.spec.ts` with **dialog-position** assertions for every admin dialog — the class of defect no behavioural test sees, and the one 008 shipped
- [ ] T147 [P] Add `e2e/admin-accessibility.spec.ts` covering the admin site at all three width bands (SC-909)
- [ ] T148 [P] Add `apps/api/tests/unit/admin-audit-completeness.test.ts` asserting **every** administrative write route appends an audit entry and **no** navigation route does — derived from the route table so a new route fails by existing (SC-911, FR-994)
- [ ] T149 [P] Add `apps/api/tests/unit/guards-still-in-force.test.ts` asserting all five named guards exist and still fail on their forbidden patterns, and that `catalog-read-only.test.ts` and `join-grants-nothing.test.ts` are **byte-unchanged** by this feature (FR-974, FR-975, FR-976)
- [ ] T150 [P] Confirm the notification trigger audit in `apps/api/tests/unit/` is **unedited** and still passes (FR-935, SC-910)
- [ ] T151 [P] Narrow `apps/api/tests/unit/no-report-read-surface.test.ts` to `apps/web` and the attendee API surface (FR-972)
- [ ] T152 Run the full attendee test suite and record that it passes **without modification**, listing exactly which guard files this feature amended and why (SC-908)
- [ ] T153 [P] Record the sign-in-to-queue path timing in `specs/011-administrative-foundation/quickstart.md` as a measured value, so SC-900's 30-second criterion has a method rather than an assertion
- [ ] T154 [P] Update `deploy/vm/README.md` — the admin host, its A record, the bootstrap command, and the second certificate
- [ ] T155 [P] Update `CLAUDE.md`'s repository-layout section with `apps/admin/`
- [ ] T156 [P] Add the admin site to `deploy/vm/OPERATIONS-LOG.md`'s restore procedure
- [ ] T157 Run `pnpm verify`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:accessibility` and confirm every gate is green
- [ ] T158 **Walk `quickstart.md` scenarios 1–7 by hand** and record the result
- [ ] T159 **Walk `quickstart.md` scenarios 8–11 by hand** — three widths, keyboard and screen reader, session bounds, and MyNet unchanged. **These need a person, and every feature since 007 has shipped without walking them**

---

## Dependencies

```
Phase 1 Setup
    ↓
Phase 2 Foundational  ← BLOCKING: nothing visible works until Phase 3
    ↓
Phase 3 US1 (sign in)  🎯 MVP
    ↓
    ├─────────────────────────────┐
    ↓                             ↓
Phase 4 US2 (report queue)   Phase 6 US4 (promotion)
    ↓                             ↓
Phase 5 US3 (remove question) Phase 7 US5 (leaving)
    └─────────────┬───────────────┘
                  ↓
          Phase 8 Polish
```

**US2→US3 and US4→US5 are two independent branches after US1.** They touch disjoint files — reports and moderation on one side, assignments and lifecycle on the other — so they satisfy standing decision 10's condition for parallel work.

## Parallel execution examples

**Phase 2 guards** — T012 through T016 are five different files with no ordering between them, and all must fail before anything else in the phase.

**Phase 2, after T024 (migration reviewed)** — T025, T026, T027 and T028 are four different files.

**Phase 3 tests** — T048 through T053 are six files, all independent.

**Phase 3 layouts** — T070, T071, T072 and T073 are separable once T069 exists.

**Phases 4–5 alongside Phases 6–7** — the largest opportunity, and the one worth taking if two people are available.

## Implementation strategy

**MVP is Phase 3 (US1).** It delivers an authenticated second actor on its own origin with independent sessions — the whole architectural claim of v4.0.0, proven before anything large depends on it.

**Then Phase 4 (US2).** This is the one that makes an existing promise true rather than only enabling future work, and it is why moderation ships in the foundation feature rather than after it.

**Phases 1–2 are the reviewable unit most at risk.** Nothing visible works until Phase 3, so they are what gets compressed under time pressure — and they contain the fourth route audit, the six absence guards, the coverage rules, and the branded scopes. A route added before T011 is a route nothing checks.

**Suggested phase split for PRs** (decide at `speckit-spex-collab-phase-split` against this list, as 007 and 008 both did): Phases 1–3 as one PR, Phases 4–5 as a second, Phases 6–8 as a third. **Do not split 4 from 5** — shipping a report queue with no way to act on what it shows is the shape 009 refused when it declined to ship Q&A without reporting.
