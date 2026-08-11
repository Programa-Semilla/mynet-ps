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

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create `apps/admin/` workspace package with `package.json` naming `@mynet/admin`, added to `pnpm-workspace.yaml`
- [ ] T002 [P] Create `apps/admin/tsconfig.json` extending `packages/config` TypeScript base
- [ ] T003 [P] Create `apps/admin/vite.config.ts` — **explicitly without `vite-plugin-pwa`** (research R1, FR-923)
- [ ] T004 [P] Create `apps/admin/vitest.config.ts` extending the shared Vitest base in `packages/config`
- [ ] T005 [P] Create `apps/admin/index.html` with favicon only — no manifest link, no `apple-touch-icon` (FR-923)
- [ ] T006 [P] Create `apps/admin/src/theme/` importing shared `theme/tokens.css` and the 010 brand assets (FR-921)
- [ ] T007 Add `apps/admin` to the root `pnpm verify`, `lint` and `typecheck` scripts in `package.json` (Principle VII)
- [ ] T008 [P] Add `apps/admin` jobs to `.github/workflows/verify.yml` for typecheck, lint, unit, component and build
- [ ] T009 [P] Add `ADMIN_SESSION_IDLE_MINUTES`, `ADMIN_SESSION_ABSOLUTE_HOURS`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` to `deploy/vm/.env.example` with what a blank value costs
- [ ] T010 Add the four values to `apps/api/src/config.ts` with boot-time validation, following the existing `positiveInt` pattern (research R8)

**Checkpoint**: `pnpm verify` passes with an empty admin app in the workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Every user story depends on this phase. Nothing visible works until Phase 3, which is exactly why this phase gets skipped under pressure — see plan.md.**

### Guards written first, and failing

- [ ] T011 Write `apps/api/tests/unit/operator-audit.test.ts` — fails any route under `/admin/*` carrying neither `requireOperator` nor `requirePlatformOperator`; maintains an explicit allow-list with written reasons (contracts, R5). **Must fail at this point**
- [ ] T012 [P] Write `apps/api/tests/unit/admin-absences.test.ts` asserting FR-970–973: no administrative route, screen, navigation entry or tier-dependent rendering in `apps/web/src`. **Strip comments before matching** — 009's rule, because every pattern also appears in prose explaining the absence
- [ ] T013 [P] Write `apps/admin/tests/unit/no-service-worker.test.ts` asserting `apps/admin/src` contains no `serviceWorker` or `registerSW` reference (research R9)
- [ ] T014 [P] Write `apps/admin/tests/unit/no-platform-dependency.test.ts` asserting `apps/admin` takes no `@mynet/platform` dependency — the admin client needs none of the seven capabilities and must not add an eighth (research R9)

### Migration and schema

- [ ] T015 Create `apps/api/src/db/schema/operators.ts` — id, email (citext unique), display name, nullable `password_hash`, `credential_is_initial`, `deactivated_at`, per data-model.md
- [ ] T016 [P] Create `apps/api/src/db/schema/operator-sessions.ts` — nullable `operator_id` and `attendee_id` with a check constraint that exactly one is non-null, `idle_expires_at`, `absolute_expires_at`
- [ ] T017 [P] Create `apps/api/src/db/schema/organizer-assignments.ts` — `attendee_id` **CASCADE**, `event_id` **NO ACTION** (FR-937), `assigned_by`, partial unique index on `(attendee_id, event_id) WHERE revoked_at IS NULL`
- [ ] T018 [P] Create `apps/api/src/db/schema/report-resolutions.ts` — `report_id` **unique** (this is FR-945's concurrency guarantee), `resolved_by` NO ACTION, outcome check constraint, note
- [ ] T019 [P] Create `apps/api/src/db/schema/admin-audit.ts` — `subject_attendee_id` as a **plain nullable column with no foreign key**, with the reasoning in the header (research R6)
- [ ] T020 Amend the header comment of `apps/api/src/db/schema/reports.ts` — FR-548 survives for MyNet, the read surface exists only in the administrative product for the platform tier. **Amend, do not delete**: the reasoning still governs the attendee product
- [ ] T021 Move `apps/api/migrations/meta/README.md` aside, run `drizzle-kit generate`, restore it, and rename output to `0009_administrative_foundation.sql` (`meta/README.md` is JSON-parsed by the generator)
- [ ] T022 Review the generated `0009` SQL by hand — confirm the `event_id` reference is `NO ACTION`, the partial unique index is present, and the audit subject column carries no FK

### Coverage guards (these fail by existing the moment T021 lands)

- [ ] T023 Add `deletion-coverage.test.ts` allow-list entries in `apps/api/tests/unit/` stating **pseudonymise-plus-clock** (audit), **deactivate-plus-clock** (operators) and cascade-from-subject (sessions) — each with a written reason, not a bare exemption
- [ ] T024 [P] Add `organizer_assignments` to export coverage in `apps/api/tests/unit/export-coverage.test.ts` and declare operator and audit records as non-attendee data (FR-981)
- [ ] T025 [P] Add `RETENTION_SWEEPS` entries for pseudonymised audit entries and unreferenced deactivated operators in `apps/api/src/maintenance.ts` (FR-998, FR-909)
- [ ] T026 Add the `event-scope-audit.test.ts` allow-list entry for `/admin/conferences/:eventId/organizers`, with the reason written down — the caller is a platform operator who would correctly fail `requireEventAccess` (plan, post-design re-check)

### Branded scopes and guards

- [ ] T027 Create `apps/api/src/admin/scope.ts` — branded `OperatorScope` and `PlatformScope` as a refinement, constructible only by the guards below
- [ ] T028 Create `apps/api/src/admin/require-operator.ts` — `requireOperator` resolving an `operator_sessions` row and enforcing both expiry bounds
- [ ] T029 Add `requirePlatformOperator` to `apps/api/src/admin/require-operator.ts` — refuses a conference organizer with **404**, indistinguishable from a route that does not exist (contracts)
- [ ] T030 [P] Add the lint rule keeping `OperatorScope`'s type-assertion escape hatch closed, mirroring the existing rule for `EventScope`, in `eslint.config.js`
- [ ] T031 [P] Write `apps/api/tests/unit/admin-scope-brand.test.ts` asserting a platform-only handler receiving only `OperatorScope` fails to typecheck

### Audit trail (needed before the queue — reading report content writes an entry)

- [ ] T032 Create `apps/api/src/db/queries/admin-audit.ts` with append and sweep only — **no update, no delete** (FR-996)
- [ ] T033 [P] Write `apps/api/tests/unit/audit-append-only.test.ts` asserting by name-shape over exports that no update or delete path exists, the mechanism `catalog-read-only.test.ts` uses for FR-191
- [ ] T034 Create `packages/data/src/interfaces/admin-audit.ts` repository interface, and register it in `packages/platform`'s `Repositories` (one line, per the append-only extension point)

### Session store

- [ ] T035 Create `apps/api/src/admin/session.ts` — start, resolve, revoke, with `absolute_expires_at` **fixed at establishment** and never advanced (research R8)
- [ ] T036 Create `apps/api/src/admin/cookie.ts` — **host-only** (no `Domain`), `httpOnly`, `sameSite: 'lax'`, `secure` gated on `config.isDeployed`, with the reasoning comment (FR-911, FR-913)
- [ ] T037 [P] Write `apps/api/tests/unit/admin-cookie.test.ts` asserting no `Domain` attribute is ever set — the property FR-912's independence rests on
- [ ] T038 Add `admin_sign_in` as a new throttle action in `apps/api/src/auth/throttle.ts`, configured `mayDeny: false` (FR-916, research R4)

### Route scaffolding

- [ ] T039 Create `apps/api/src/routes/admin/index.ts` registering the administrative route group, following the per-domain split convention
- [ ] T040 [P] Add the second Caddy site block for `admin.{$APP_DOMAIN}` in `deploy/vm/Caddyfile`, serving `apps/admin` and proxying `/api/*` to `api:3000` (research R2)
- [ ] T041 [P] Add security response headers to the admin Caddy block — and **do not** add them to MyNet's block in this feature, so `security-response-headers` does not read as closed (research R9)

### Client shell scaffold

- [ ] T042 Create `apps/admin/src/main.tsx` — **no service-worker registration**, no shared bootstrap import from `apps/web`
- [ ] T043 [P] Create `apps/admin/src/app/shell/AdminShell.tsx` — rail, top bar, tier indicator (FR-924)
- [ ] T044 [P] Create `apps/admin/src/app/shell/RequireOperator.tsx` client-side session gate (presentation only; authorisation is server-side per FR-980)
- [ ] T045 [P] Create `apps/admin/src/app/routes.tsx` with an append-only destination declaration, mirroring `navigation.ts`'s contract without reusing MyNet's

**Checkpoint**: migration applies, all guards exist and fail correctly, no route is reachable yet.

---

## Phase 3: User Story 1 — A platform operator signs in, and the second actor exists (Priority: P1) 🎯 MVP

**Goal**: an administrative identity exists, authenticates on its own origin, and holds a session independent of any attendee session.

**Independent test**: seed a platform operator, bootstrap a credential, sign in; confirm the session is distinct from an attendee session in the same browser and that signing out of one leaves the other.

### Tests for User Story 1

- [ ] T046 [P] [US1] Integration test in `apps/api/tests/integration/admin-sign-in.test.ts` — the four refusals of SC-902 scenario 2 are **identical** in status, shape and wording (FR-915)
- [ ] T047 [P] [US1] Integration test in `apps/api/tests/integration/admin-address-uniqueness.test.ts` — an operator cannot take an attendee's address and vice versa, driven **concurrently** because the constraint is application-enforced (FR-918, plan Complexity Tracking)
- [ ] T048 [P] [US1] Integration test in `apps/api/tests/integration/admin-session-bounds.test.ts` — idle expiry and **absolute** expiry are separately observable (FR-919a)
- [ ] T049 [P] [US1] Integration test in `apps/api/tests/integration/admin-bootstrap.test.ts` — absent credential means sign-in is **impossible**, not defaulted; unreplaced initial credential reaches no surface (FR-991, FR-992, SC-912)
- [ ] T050 [P] [US1] Component test in `apps/admin/tests/component/sign-in.test.tsx` — loading, failure and disabled-submit states
- [ ] T051 [P] [US1] E2E test in `e2e/admin-sessions.spec.ts` — two browser contexts proving FR-912 in both directions

### Implementation for User Story 1

- [ ] T052 [P] [US1] Create `apps/api/src/db/seed/operators.ts` seeding **identities only**, with a null `password_hash` and a header explaining why (FR-990)
- [ ] T053 [US1] Register the operator seed module in `apps/api/src/db/seed/index.ts` per the per-domain split
- [ ] T054 [US1] Create `apps/api/src/admin/bootstrap.ts` consuming `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` (research R10)
- [ ] T055 [US1] Add a `pnpm admin:bootstrap` script in `package.json` — **separate from `db:seed`**, which deletes every attendee and re-inserts committed passwords
- [ ] T056 [US1] Implement FR-993 in `apps/api/src/admin/bootstrap.ts` — never reset an operator who has replaced their credential; assert it, because idempotent upsert is the natural wrong implementation
- [ ] T057 [US1] Implement address resolution across both stores as **one lookup** in `apps/api/src/admin/identity.ts` (research R4)
- [ ] T058 [US1] Implement `POST /admin/session` in `apps/api/src/routes/admin/session.ts` — always runs password verification on a miss so timing does not answer what the response refuses
- [ ] T059 [US1] Implement `DELETE /admin/session` in `apps/api/src/routes/admin/session.ts` (FR-919)
- [ ] T060 [US1] Implement `PUT /admin/session/credential` in `apps/api/src/routes/admin/session.ts` — forced replacement, reachable with an initial credential (FR-992)
- [ ] T061 [US1] Implement `GET /admin/me` in `apps/api/src/routes/admin/me.ts` returning identity and tier (FR-924)
- [ ] T062 [US1] Add the `admin_sign_in` throttle to the sign-in route (FR-916)
- [ ] T063 [P] [US1] Create `packages/data/src/interfaces/admin-session.ts` and its HTTP implementation
- [ ] T064 [US1] Register the admin session repository in `packages/platform`'s `Repositories` — one line; `registry.tsx` untouched
- [ ] T065 [P] [US1] Build `apps/admin/src/app/auth/SignIn.tsx` with loading, failure and disabled-submit states
- [ ] T066 [P] [US1] Build `apps/admin/src/app/auth/ReplaceCredential.tsx` for the forced replacement flow
- [ ] T067 [US1] Build `apps/admin/src/app/shell/AdminHome.tsx` naming the operator and their tier
- [ ] T068 [P] [US1] Desktop layout for the shell in `apps/admin/src/app/shell/AdminShell.tsx` — persistent rail, contextual top bar
- [ ] T069 [P] [US1] Tablet layout — reduced rail, stacked detail
- [ ] T070 [P] [US1] Mobile layout — single column, touch-sized controls, no horizontal scrolling
- [ ] T071 [P] [US1] Accessibility pass on the shell and auth screens — labels, visible focus, keyboard operability (FR-922)
- [ ] T072 [US1] Regenerate and commit `contracts/openapi.json` for the session routes

**Checkpoint**: US1 is independently demonstrable. This is the MVP.

---

## Phase 4: User Story 2 — An operator reads the report queue and the promise becomes true (Priority: P1)

**Goal**: reports filed since 007 become readable by a platform operator, with content and reason.

**Independent test**: file a conversation report and a question report as attendees; read both as a platform operator; resolve one; confirm the reporter is told nothing.

**Depends on**: US1 (shell and session), Phase 2 (audit trail — reading content **writes** an entry).

### Tests for User Story 2

- [ ] T073 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-queue.test.ts` — both report origins appear in one list (research: `abuse_reports` is one cross-event table)
- [ ] T074 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-disclosure.test.ts` — the response carries reported content and the reason, and carries **nothing** about the surrounding thread or a third party (FR-942)
- [ ] T075 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-content-missing.test.ts` — a report whose messages were deleted returns `contentAvailable: false`, **not** an error (FR-941)
- [ ] T076 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-tier.test.ts` — a conference organizer is refused on every queue address by **direct address entry** (FR-906, SC-904)
- [ ] T077 [P] [US2] Integration test in `apps/api/tests/integration/admin-report-concurrency.test.ts` — a second resolution is refused with an explanation, not an overwrite (FR-945)
- [ ] T078 [P] [US2] Integration test in `apps/api/tests/integration/admin-audit-disclosure.test.ts` — reading content writes `disclose_report_content`; reading the **list** writes nothing (FR-995)
- [ ] T079 [P] [US2] Unit test in `apps/admin/tests/unit/error-classification.test.ts` requiring all seven refusal outcomes to be **different from each other** — the property `instanceof` classification destroys (contracts)
- [ ] T080 [P] [US2] Component test in `apps/admin/tests/component/report-detail.test.tsx` — content-unavailable renders as a state, not a failure

### Implementation for User Story 2

- [ ] T081 [P] [US2] Create `apps/api/src/db/queries/admin-reports.ts` — list and detail, scoping enforced **in the query** rather than by what the client renders
- [ ] T082 [US2] Implement `GET /admin/reports` in `apps/api/src/routes/admin/reports.ts` — open and resolved separated (FR-943), no content in the list
- [ ] T083 [US2] Implement `GET /admin/reports/:reportId` in `apps/api/src/routes/admin/reports.ts` with content, reason and `contentAvailable`
- [ ] T084 [US2] Write the `disclose_report_content` audit entry from the detail route only (FR-995)
- [ ] T085 [US2] Implement `POST /admin/reports/:reportId/resolution` in `apps/api/src/routes/admin/reports.ts`, relying on the unique constraint for concurrency (FR-945)
- [ ] T086 [US2] Write the `resolve_report` audit entry (FR-994)
- [ ] T087 [P] [US2] Create `packages/data/src/interfaces/admin-reports.ts` and its HTTP implementation — **undecorated**, no caching (Feature Declarations)
- [ ] T088 [US2] Register the reports repository in `packages/platform`'s `Repositories`
- [ ] T089 [P] [US2] Build `apps/admin/src/app/reports/ReportQueue.tsx` — open and resolved views, with an **empty open queue as a deliberate state**
- [ ] T090 [P] [US2] Build `apps/admin/src/app/reports/ReportDetail.tsx` rendering content, reason, and content-unavailable
- [ ] T091 [US2] Build `apps/admin/src/app/reports/ResolveDialog.tsx` — outcome and note, with **Escape dismissal and focus restored to the opener after closing**
- [ ] T092 [US2] Ensure `ResolveDialog` is centred by the base `<dialog>` rule in `theme/tokens.css` — 004's and 008's dialogs shipped in the top-left corner because Preflight removes `margin: auto`
- [ ] T093 [P] [US2] Three layouts for the queue and detail — side by side at desktop, stacked at tablet and mobile
- [ ] T094 [P] [US2] Accessibility pass on the queue, detail and resolve dialog
- [ ] T095 [US2] Regenerate and commit `contracts/openapi.json` for the report routes

**Checkpoint**: register entry 21's promise — "a person will read it" — is true for the first time.

---

## Phase 5: User Story 3 — An operator removes an abusive question (Priority: P1)

**Goal**: a reported question can be removed, and its votes go with it.

**Independent test**: publish, upvote, report, remove; confirm it is gone for every attendee and no other count moved.

**Depends on**: US2 (removal is reachable only from a report).

### Tests for User Story 3

- [ ] T096 [P] [US3] Integration test in `apps/api/tests/integration/admin-remove-question.test.ts` — the question and **all** its votes go; no other question's count changes (FR-951)
- [ ] T097 [P] [US3] Integration test in `apps/api/tests/integration/admin-remove-question-race.test.ts` — a vote arriving mid-removal blocks on `FOR UPDATE` rather than creating a vote on a removed row (research R7)
- [ ] T098 [P] [US3] Integration test in `apps/api/tests/integration/admin-no-message-removal.test.ts` — a message report offers no removal action anywhere (FR-953)
- [ ] T099 [P] [US3] Amend `apps/api/tests/unit/qa-absences.test.ts` to permit exactly one moderation route **narrowed by path**, still forbidding answer, pin, edit and downvote. **Do not weaken the pattern** — 009 recorded that as the natural wrong repair
- [ ] T100 [P] [US3] E2E test in `e2e/admin-moderation.spec.ts` — three browser profiles confirm the question is gone for all of them

### Implementation for User Story 3

- [ ] T101 [US3] Implement question removal in `apps/api/src/db/queries/admin-moderation.ts` with `SELECT … FOR UPDATE` on the question row, mirroring 009's withdrawal lock
- [ ] T102 [US3] Implement `DELETE /admin/questions/:questionId` in `apps/api/src/routes/admin/moderation.ts` under `requirePlatformOperator`
- [ ] T103 [US3] Write the `remove_question` audit entry (FR-994)
- [ ] T104 [P] [US3] Extend `packages/data/src/interfaces/admin-reports.ts` with the removal method and its HTTP implementation
- [ ] T105 [US3] Add the removal control to `apps/admin/src/app/reports/ReportDetail.tsx`, offered **only** for a question report (FR-953)
- [ ] T106 [US3] Build the removal confirmation as a nested dialog, comparing `event.target` against its own dialog so one Escape does not close the parent — 009's finding, invisible to component tests because jsdom has no top layer
- [ ] T107 [P] [US3] Accessibility pass on the removal control and confirmation
- [ ] T108 [US3] Regenerate and commit `contracts/openapi.json` for the moderation route

**Checkpoint**: the product's only unmoderated many-to-many surface has a moderator.

---

## Phase 6: User Story 4 — A platform operator promotes an attendee, and the tier boundary is real (Priority: P1)

**Goal**: the two-tier boundary exists and is enforced, which is what 012 will build on.

**Independent test**: promote for one of two conferences; sign in as that person; confirm they see one conference, not the other, and no platform surface.

**Depends on**: US1. **Independent of US2/US3** — can run in parallel with Phases 4–5.

### Tests for User Story 4

- [ ] T109 [P] [US4] Integration test in `apps/api/tests/integration/admin-promotion.test.ts` — promotion requires existing registration (FR-933)
- [ ] T110 [P] [US4] Integration test in `apps/api/tests/integration/admin-tier-boundary.test.ts` — an organizer is refused on every platform address by direct entry, and sees only assigned conferences (FR-905, SC-904)
- [ ] T111 [P] [US4] Integration test in `apps/api/tests/integration/admin-organizer-attendee-unchanged.test.ts` — a promoted attendee's MyNet surfaces are byte-identical to before (FR-904)
- [ ] T112 [P] [US4] Integration test in `apps/api/tests/integration/admin-reseed-guard.test.ts` — with a live assignment, the seed fails **naming organizer assignments**, not a bare FK error (FR-937–939)
- [ ] T113 [P] [US4] Integration test in `apps/api/tests/integration/admin-no-notification.test.ts` — promotion and demotion dispatch nothing (FR-935)
- [ ] T114 [P] [US4] Component test in `apps/admin/tests/component/conference-list.test.tsx` — unassigned renders, empty assignment list renders

### Implementation for User Story 4

- [ ] T115 [P] [US4] Create `apps/api/src/db/queries/admin-assignments.ts` — list conferences with organizers, deriving `unassigned` from the absence of a live assignment (FR-936)
- [ ] T116 [US4] Implement `GET /admin/conferences` in `apps/api/src/routes/admin/conferences.ts` — all conferences for platform tier, assigned only for organizers (FR-926)
- [ ] T117 [US4] Implement `POST /admin/conferences/:eventId/organizers` in `apps/api/src/routes/admin/conferences.ts` under `requirePlatformOperator`, with the registration precondition
- [ ] T118 [US4] Implement `DELETE /admin/conferences/:eventId/organizers/:attendeeId` for demotion (FR-934)
- [ ] T119 [US4] Write `promote` and `demote` audit entries (FR-994)
- [ ] T120 [US4] Add organizer-assignment clearing to `apps/api/src/db/seed/index.ts` as a **declared step**, clearing the whole domain rather than only what it seeded (FR-938)
- [ ] T121 [P] [US4] Create `packages/data/src/interfaces/admin-conferences.ts` and its HTTP implementation
- [ ] T122 [US4] Register the conferences repository in `packages/platform`'s `Repositories`
- [ ] T123 [P] [US4] Build `apps/admin/src/app/conferences/ConferenceList.tsx` showing organizers or **unassigned**
- [ ] T124 [US4] Build `apps/admin/src/app/conferences/PromoteDialog.tsx`, centred by the base `<dialog>` rule, with Escape and focus restoration
- [ ] T125 [P] [US4] Three layouts and an accessibility pass for the conference list and promote dialog
- [ ] T126 [US4] Regenerate and commit `contracts/openapi.json` for the conference routes

**Checkpoint**: the boundary 012 depends on is real and independently tested.

---

## Phase 7: User Story 5 — Leaving takes the authority with it (Priority: P2)

**Goal**: authority never outlives the access it depends on, and deletion is never made conditional.

**Independent test**: promote, then withdraw; promote, then delete the account. Confirm assignments end, the conference shows unassigned with content intact, and audit entries pseudonymise.

**Depends on**: US4.

### Tests for User Story 5

- [ ] T127 [P] [US5] Integration test in `apps/api/tests/integration/admin-deletion-revokes.test.ts` — deletion proceeds with no extra step, no blocking warning and no refusal (FR-960, SC-905)
- [ ] T128 [P] [US5] Integration test in `apps/api/tests/integration/admin-withdrawal-revokes.test.ts` — withdrawal revokes that conference's assignment only (FR-961)
- [ ] T129 [P] [US5] Integration test in `apps/api/tests/integration/admin-audit-pseudonymise.test.ts` — the subject id is cleared, operator/action/instant survive, **no placeholder row and nothing reconstructible** (FR-997a, FR-997b)
- [ ] T130 [P] [US5] Integration test in `apps/api/tests/integration/admin-unassigned-content-intact.test.ts` — sessions, tracks, rooms and speakers survive an organizer's departure (FR-962, SC-906)
- [ ] T131 [P] [US5] Integration test in `apps/api/tests/integration/admin-operator-deactivation.test.ts` — access ends immediately; the identity still resolves on records naming it (FR-908, FR-909)

### Implementation for User Story 5

- [ ] T132 [US5] Add assignment revocation to the account-deletion transaction in `apps/api/src/routes/account.ts` — **a file 004 owns** (FR-960)
- [ ] T133 [US5] Add audit pseudonymisation to the same transaction — `UPDATE … SET subject_attendee_id = NULL` (FR-997a)
- [ ] T134 [US5] Add assignment revocation to the withdrawal path in the same transaction — **a file 004/008 own** (FR-961)
- [ ] T135 [US5] Implement `POST /admin/operators/:operatorId/deactivation` in `apps/api/src/routes/admin/operators.ts` (FR-908)
- [ ] T136 [US5] Write the `deactivate_operator` audit entry, and ensure a deactivated operator still resolves on entries naming them (FR-909, FR-997)
- [ ] T137 [P] [US5] Build `apps/admin/src/app/conferences/OperatorList.tsx` with deactivation, and its confirmation dialog
- [ ] T138 [P] [US5] Add the last-operator edge case to the runbook — recovery is by re-seed, deliberately unguarded (spec Assumptions)
- [ ] T139 [P] [US5] Three layouts and an accessibility pass for the operator list
- [ ] T140 [US5] Regenerate and commit `contracts/openapi.json` for the operator routes

**Checkpoint**: every user story is complete and independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T141 [P] Extend `e2e/responsive.spec.ts` with **dialog-position** assertions for every admin dialog — the class of defect no behavioural test sees, and the one 008 shipped
- [ ] T142 [P] Add `e2e/admin-accessibility.spec.ts` covering the admin site at all three width bands
- [ ] T143 [P] Confirm the notification trigger audit in `apps/api/tests/unit/` is **unedited** and still passes (FR-935, SC-910)
- [ ] T144 [P] Confirm `catalog-read-only.test.ts` and `join-grants-nothing.test.ts` are **untouched and still in force** (FR-974, FR-975)
- [ ] T145 [P] Narrow `apps/api/tests/unit/no-report-read-surface.test.ts` to `apps/web` and the attendee API surface (FR-972)
- [ ] T146 [P] Update `deploy/vm/README.md` — the admin host, its A record, the bootstrap command, and the second certificate
- [ ] T147 [P] Update `CLAUDE.md`'s repository-layout section with `apps/admin/`
- [ ] T148 [P] Add the admin site to `deploy/vm/OPERATIONS-LOG.md`'s restore procedure
- [ ] T149 Run `pnpm verify`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:accessibility` and confirm every gate is green
- [ ] T150 **Walk `quickstart.md` scenarios 1–7 by hand** and record the result
- [ ] T151 **Walk `quickstart.md` scenarios 8–11 by hand** — three widths, keyboard and screen reader, session bounds, and MyNet unchanged. **These need a person, and every feature since 007 has shipped without walking them**

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

**Phase 2, after T022 (migration applied)** — T023, T024, T025 and T026 are four different files with no ordering between them.

**Phase 3 tests** — T046 through T051 are six files, all independent.

**Phase 3 layouts** — T068, T069, T070 and T071 are separable once T067 exists.

**Phases 4–5 alongside Phases 6–7** — the largest opportunity, and the one worth taking if two people are available.

## Implementation strategy

**MVP is Phase 3 (US1).** It delivers an authenticated second actor on its own origin with independent sessions — which is the whole architectural claim of v4.0.0, proven before anything large depends on it.

**Then Phase 4 (US2).** This is the one that makes an existing promise true rather than only enabling future work, and it is why moderation ships in the foundation feature rather than after it.

**Phases 1–2 are the reviewable unit most at risk.** Nothing visible works until Phase 3, so they are what gets compressed under time pressure — and they contain the fourth route audit, the coverage-guard rules, and the branded scopes. A route added before T011 is a route nothing checks.

**Suggested phase split for PRs** (decide at `speckit-spex-collab-phase-split` against this list, as 007 and 008 both did): Phases 1–3 as one PR, Phases 4–5 as a second, Phases 6–8 as a third. **Do not split 4 from 5** — shipping a report queue with no way to act on what it shows is the shape 009 refused when it declined to ship Q&A without reporting.
