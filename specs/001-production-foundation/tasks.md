---

description: "Task list for the MyNet production foundation slice"
---

# Tasks: Production Foundation Slice

**Input**: Design documents from `/specs/001-production-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The specification explicitly requires them — FR-005 names unit, component, and
integration tests; FR-063 makes eleven checks mandatory; FR-068 and FR-069 name specific coverage.
These are requirements, not a methodology preference.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US5)
- Exact file paths included in every task that touches a file. Ten do not: the four owner
  provisioning actions (T001–T004) and six review, audit, or manual-verification tasks
  (T093, T109–T114 where noted). Those are real work with no file to name, and are called out here
  rather than given a fabricated path.

**Suffixed IDs** (`T042a`, `T045a`, …) are tasks inserted after the first numbering, kept in
execution order rather than appended at the end. Same convention the spec uses for FR-025a and
FR-031a–d. Existing IDs and cross-references are therefore stable.

## Path Conventions

Web application in a single pnpm workspace (plan.md → Structure Decision): `apps/web/`, `apps/api/`,
`packages/`, `contracts/`, `e2e/`, `.github/workflows/`.

---

## Shared Interfaces

A task implementer sees only their own task. These are the names and shapes that cross task
boundaries — anything here must match exactly wherever it appears.

### Authenticated request context (T034 → consumed by T048–T056)

- `request.attendee` — present only on authenticated routes; carries `{ id, email, displayName }`.
- **There is no `attendeeId` parameter on any route or repository method.** Identity comes from the
  request context only. This is what makes FR-036 structural rather than a rule to remember.

### Auth primitives (T035–T037 → consumed by T048–T053)

- `hashPassword(plain): Promise<string>` / `verifyPassword(plain, hash): Promise<boolean>` — `apps/api/src/auth/password.ts`
- `issueToken(): { token, tokenHash }` / `hashToken(token): string` — `apps/api/src/auth/token.ts`
- `recordAttempt({ identifierHash, sourceHash, succeeded }): Promise<void>` and
  `nextDelayMs({ identifierHash, sourceHash }): Promise<number>` — `apps/api/src/auth/throttle.ts`

### Device capability interfaces (T038 → consumed by T040, T099, T105)

`NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`,
`ConnectivityService` — exact names, from constitution Principle V. Not pluralised, not suffixed
with `Provider`.

### Repository interfaces (T039 → consumed by T042, T057, T058)

- `AttendeeRepository.getCurrent(): Promise<Attendee>`
- `EventsRepository.listRegistered(): Promise<Event[]>`

No method takes an attendee identifier. Method names are the same in the interface, the HTTP
implementation, and every test double.

### Registry (T040, T041 → consumed by every client feature task)

- `PlatformServices` — one object holding all device capabilities and all repositories.
- `PlatformProvider` — the single root provider.
- Hooks: `useAttendeeRepository()`, `useEventsRepository()`, `useConnectivity()`, and one per
  remaining capability. Feature code uses hooks only and never touches the context object.

### Design tokens (T012, T015 → consumed by every UI task)

Tokens are CSS custom properties in `apps/web/src/theme/tokens.css`. Breakpoints:
`--bp-tablet: 768px`, `--bp-desktop: 1280px`, applied as half-open intervals.

---

## Phase 0: Owner Provisioning (BLOCKS MERGE — not a code task)

**Per FR-070 and FR-071**, this slice's own pull request cannot merge until provisioning exists. The
preview-deployment check is required (FR-063) and must not be disabled, skipped, or made non-blocking
to obtain a green result (FR-071). **Only the owner can do these.**

- [ ] T001 Create the Neon project and record `NEON_PROJECT_ID` and `NEON_API_KEY` as repository secrets
- [ ] T002 Create the Cloudflare Pages project and record `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets
- [ ] T003 Create the API hosting account and record its deploy token as a repository secret
- [ ] T004 Confirm no secret from T001–T003 grants access to any store holding real attendee data (FR-041, FR-067)

**Checkpoint**: Implementation can proceed without these, but nothing merges until they exist.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, tooling, and the token system every later phase depends on

- [X] T005 Create the pnpm workspace root — `pnpm-workspace.yaml`, root `package.json`, `.npmrc` — with `apps/*` and `packages/*` globs
- [X] T006 [P] Create shared TypeScript configuration in `packages/config/tsconfig.base.json` with strict mode enabled (FR-001)
- [X] T007 [P] Create shared ESLint and formatter configuration in `packages/config/eslint.config.js` (FR-004)
- [X] T008 [P] Create shared Vitest configuration in `packages/config/vitest.base.ts` (FR-005)
- [X] T009 [P] Create `.env.example` at repository root documenting database URL, session secret, and hashing pepper — never real values, and pointing at a non-production database so local work never needs access to real attendee data (FR-041, FR-007)
- [X] T010 Scaffold the client in `apps/web/` — Vite + React + TypeScript, extending `packages/config` (research.md D3)
- [X] T011 Scaffold the API in `apps/api/` — Fastify + TypeScript, extending `packages/config` (research.md D4)
- [X] T012 [P] Define the complete design-token set in `apps/web/src/theme/tokens.css` — the approved palette, typography, spacing, and radii as CSS custom properties, in this file only (FR-008, FR-009)
- [X] T013 [P] Add the lint rule banning colour literals outside `apps/web/src/theme/tokens.css` in `packages/config/eslint.config.js` — this is what makes SC-009 machine-checked rather than review-dependent
- [X] T014 [P] Add `lucide-react` and document it in `apps/web/src/theme/README.md` as the single permitted icon set (FR-010)
- [X] T015 Define breakpoints as half-open intervals in `apps/web/src/theme/tokens.css` — mobile `<768`, tablet `768–1279`, desktop `≥1280` — so exactly one layout matches any width (FR-019, research.md D16)
- [X] T016 Add workspace scripts to the root `package.json`: `dev`, `build`, `typecheck`, `lint`, `test:unit`, `test:component`, `test:integration`, `test:e2e`, `contract:check`, `db:migrate`, `db:seed`, `verify` (FR-006)
- [X] T017 Commit `pnpm-lock.yaml` and verify a clean-clone install resolves an identical dependency set (FR-002)

**Checkpoint**: `pnpm install`, `pnpm typecheck`, and `pnpm lint` succeed on an empty project.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, contract generation, error handling, and both abstraction layers

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database and schema

- [X] T018 Create the Drizzle configuration in `apps/api/drizzle.config.ts` pointing at `apps/api/src/db/schema/` with output to `apps/api/migrations/` (research.md D6)
- [X] T019 Create the database client in `apps/api/src/db/client.ts` with pooled connections
- [X] T020 [P] Define `attendees` and `attendee_credentials` in `apps/api/src/db/schema/attendees.ts` — email `citext` UNIQUE globally, credential hash in its own table so it cannot ride along in an attendee query (data-model.md, FR-025a, FR-031, FR-034, FR-039)
- [X] T021 [P] Define `auth_sessions` in `apps/api/src/db/schema/auth-sessions.ts` — stores `token_hash` not the token, with `last_used_at`, `expires_at`, `revoked_at`; one row per device is what makes sign-in sessions independent (FR-026, FR-028a, FR-029, FR-039)
- [X] T022 [P] Define `events` and `registrations` in `apps/api/src/db/schema/events.ts` — UNIQUE `(attendee_id, event_id)` (data-model.md, FR-034, FR-039)
- [X] T023 [P] Define `sign_in_attempts` in `apps/api/src/db/schema/sign-in-attempts.ts` — hashed identifier and source, no foreign key, no credential material (FR-031c, FR-042)
- [X] T024 Generate the initial migration into `apps/api/migrations/` with `drizzle-kit generate` and commit the SQL for review (FR-037)
- [X] T025 Create the migration runner wired to `pnpm db:migrate` in `apps/api/src/db/migrate.ts` (FR-037)
- [X] T026 Verify no `drizzle-kit push` invocation exists in any script in any `package.json` — it changes a database without producing a reviewable artifact, which the constitution prohibits (research.md D6)
- [X] T027 Create the seed script in `apps/api/src/db/seed.ts` producing **two** attendees with **different** event registrations — one attendee cannot demonstrate isolation, which is this slice's central claim (FR-069)

### API foundation

- [X] T028 Create the Fastify application bootstrap in `apps/api/src/app.ts` with plugin registration order
- [X] T029 Register `@fastify/swagger` in `apps/api/src/plugins/swagger.ts` so the contract is generated from route schemas (FR-044a, research.md D4)
- [X] T030 Create the contract generation script writing `fastify.swagger()` output to `contracts/openapi.json` in `apps/api/src/contract/generate.ts` (FR-044a)
- [X] T031 Create the `contract:check` script that regenerates and fails on any difference from the committed `contracts/openapi.json` (FR-044b)
- [X] T032 Create the error-handling plugin in `apps/api/src/plugins/errors.ts` — attendee-facing messages explain what happened and expose no internal detail; server records carry no credentials, session tokens, or message content (FR-059, FR-060)
- [X] T033 Create the `GET /health` route in `apps/api/src/routes/health.ts` for the hosting platform
- [X] T034 Create the authenticated-context plugin in `apps/api/src/plugins/auth-context.ts` binding the identity at the request boundary — **the mechanism that makes FR-036 structural**, because no handler can then express another attendee's data (FR-035)

### Authentication primitives

- [X] T035 [P] Create Argon2id hashing and verification in `apps/api/src/auth/password.ts` (FR-031, research.md D8)
- [X] T036 [P] Create opaque session token generation and hashing in `apps/api/src/auth/token.ts` — only the hash is ever stored (FR-026)
- [X] T037 [P] Create database-backed throttle counters in `apps/api/src/auth/throttle.ts` — keyed separately by identifier and source, escalating delay, **no lockout path may exist** (FR-031a, FR-031b, research.md D9)

### Abstraction layers (Principle V)

- [X] T038 [P] Define the six device capability interfaces in `packages/platform/src/interfaces/` — notification, calendar, camera, contact-share, secure-storage, connectivity (FR-043)
- [X] T039 [P] Define repository interfaces in domain terms in `packages/data/src/interfaces/` — **no method may accept a caller-supplied attendee identifier** (FR-044, data-model.md scoping rule)
- [X] T040 Create the `PlatformServices` registry type and root provider in `packages/platform/src/registry.ts` — one provider, not eleven nested ones (research.md D10)
- [X] T041 Create typed consumer hooks in `packages/platform/src/hooks.ts` so feature code never touches the context object directly (FR-045)
- [X] T042 Create HTTP repository implementations in `packages/data/src/http/` — the only place in the client that constructs requests (FR-045)
- [X] T042a Generate client-side response types from `contracts/openapi.json` into `packages/data/src/generated/` and assert repository parsing against them, so a client expecting a shape the server no longer produces fails the build rather than failing an attendee (FR-044c)

**Checkpoint**: Migrations apply to a clean database, seed produces two isolated attendees, and the contract generates.

---

## Phase 3: User Story 1 — Attendee signs in and sees their own workspace (Priority: P1) 🎯 MVP

**Goal**: The vertical walking skeleton — browser → API → PostgreSQL, scoped to one identity, and back.

**Independent Test**: Seed two attendees with different events. Sign in as each and confirm each sees only their own identity and events. Attempt to read the other's data by manipulating the request directly and confirm the server refuses.

### Tests for User Story 1

> Write these first and confirm they FAIL before implementing.

- [X] T043 [P] [US1] Integration test for sign-in success and failure in `apps/api/tests/integration/sign-in.test.ts` — asserts identical responses for unknown identifier and wrong credential (FR-030)
- [X] T044 [P] [US1] **Isolation test** in `apps/api/tests/integration/isolation.test.ts` — one attendee cannot read another's events by any request manipulation (FR-069, SC-002). The most important test in this slice
- [X] T045 [P] [US1] Integration test for session validity in `apps/api/tests/integration/auth-session.test.ts` — expiry, revocation on sign-out, tampered token, sliding extension, and survival across browser restart (FR-026, FR-027, FR-028, FR-028a)
- [X] T045a [P] [US1] Integration test for multi-device independence in `apps/api/tests/integration/multi-device.test.ts` — two concurrent sign-in sessions for one attendee, signing out of one leaves the other valid (FR-029)
- [X] T046 [P] [US1] Integration test for throttling in `apps/api/tests/integration/throttle.test.ts` — escalating delay, **no permanent lockout**, no existence disclosure (FR-031a, FR-031b, FR-031c, FR-031d, SC-003a)
- [X] T047 [P] [US1] Component test for the sign-in screen in `apps/web/tests/sign-in.test.tsx` — labels, keyboard operability, error presentation

### Implementation for User Story 1

- [X] T048 [US1] Implement `POST /auth/sign-in` with route schema in `apps/api/src/routes/auth/sign-in.ts` — normalises email, verifies credential, issues an `HttpOnly` `Secure` `SameSite=Lax` cookie (FR-025, FR-025b)
- [X] T049 [US1] Ensure sign-in failure is indistinguishable across causes in status, body, and as far as practical timing, in `apps/api/src/routes/auth/sign-in.ts` (FR-030)
- [X] T050 [US1] Wire throttle enforcement and attempt recording into `apps/api/src/routes/auth/sign-in.ts` — recording the hashed identifier only, never the credential (FR-031a, FR-031c)
- [X] T051 [US1] Implement `POST /auth/sign-out` in `apps/api/src/routes/auth/sign-out.ts` — sets `revoked_at` server-side, not merely clearing the cookie (FR-027)
- [X] T052 [US1] Implement `GET /auth/me` in `apps/api/src/routes/auth/me.ts` returning identity and display name only — never the credential hash (FR-032)
- [X] T053 [US1] Implement sliding expiry in `apps/api/src/plugins/auth-context.ts` — each authenticated request advances `last_used_at` and `expires_at` (FR-028a, FR-028b)
- [X] T054 [US1] Distinguish *expired* from *never signed in* in the refusal in `apps/api/src/plugins/auth-context.ts` so the client can explain inactivity (FR-028c)
- [X] T055 [US1] Implement `GET /events` in `apps/api/src/routes/events.ts` — scoped through `registrations` for the authenticated attendee, **taking no attendee identifier parameter** (FR-035, FR-036)
- [X] T056 [US1] Implement attendee and registration queries in `apps/api/src/db/queries/` respecting the scoping rule in data-model.md
- [X] T057 [P] [US1] Implement the attendee repository in `packages/data/src/http/attendee-repository.ts`
- [X] T058 [P] [US1] Implement the events repository in `packages/data/src/http/events-repository.ts`
- [X] T059 [US1] Build the sign-in screen in `apps/web/src/auth/SignInScreen.tsx` — accessible labels, visible focus, disabled submit while invalid rather than post-submit error (FR-021)
- [X] T060 [US1] Implement client auth state and session-expired handling in `apps/web/src/auth/useAuth.ts` — returns to sign-in with an inactivity explanation (FR-028c)
- [X] T061 [US1] Display the signed-in attendee's identity in `apps/web/src/shell/TopBar.tsx` (FR-032)
- [X] T062 [US1] Render registered events with an explicit empty state in `apps/web/src/app/destinations/Home.tsx` for an attendee registered for none — not an error, not a blank region (FR-040)
- [X] T063 [US1] Add loading and failure presentation for every network-crossing state in `apps/web/src/app/` — a failure must never render as an empty success (FR-058)
- [X] T063a [US1] Add the error boundary in `apps/web/src/app/ErrorBoundary.tsx` — an unexpected client error keeps the shell and offers a route back to a working state, never a blank page (FR-061)
- [X] T064 [US1] Regenerate and commit `contracts/openapi.json` (FR-044b)
- [X] T065 [US1] End-to-end test in `e2e/sign-in.spec.ts` — sign in, see own workspace, browser restart keeps session, sign out revokes access (FR-068, SC-001)

- [X] T065a [US1] End-to-end durability test in `e2e/durability.spec.ts` — attendee data survives browser reload, sign-out and sign-in, and **redeployment**; the redeploy case is the one most likely to regress silently (FR-033, SC-003)

**Checkpoint**: User Story 1 is fully functional and independently testable. This is the MVP.

---

## Phase 4: User Story 2 — The attendee reaches every part of the workspace on any device (Priority: P2)

**Goal**: The responsive, addressable, accessible five-destination shell.

**Independent Test**: Signed in, load at 320px, 768px, and 1280px; confirm the intended navigation form, no horizontal scrolling, and every destination reachable. Repeat by keyboard only. Open each destination address directly.

### Tests for User Story 2

- [X] T066 [P] [US2] Component tests for all three navigation forms in `apps/web/tests/navigation.test.tsx` — accessible names and current state (FR-022)
- [X] T067 [P] [US2] End-to-end test in `e2e/navigation.spec.ts` — direct address entry, history traversal consistency, and the not-found view (FR-014, FR-015, SC-007)
- [X] T068 [P] [US2] End-to-end accessibility test in `e2e/accessibility.spec.ts` using `@axe-core/playwright` across all five destinations at all three widths (SC-005)

### Implementation for User Story 2

- [X] T069 [US2] Configure the router with five addressable destinations in `apps/web/src/app/routes.tsx` — Home as default (FR-012, FR-013)
- [X] T070 [US2] Implement direct-address entry rendering the correct destination without passing through Home in `apps/web/src/app/routes.tsx` (FR-014)
- [X] T071 [US2] Implement the not-found view inside the shell with a route back to Home in `apps/web/src/shell/NotFound.tsx` — never a blank screen, including offline (FR-015)
- [X] T072 [US2] Add the route guard sending unauthenticated visitors to sign-in in `apps/web/src/app/RequireAuth.tsx` (FR-025)
- [X] T073 [P] [US2] Build the desktop persistent rail and contextual top bar in `apps/web/src/shell/DesktopRail.tsx` (FR-016)
- [X] T074 [P] [US2] Build the tablet reduced rail in `apps/web/src/shell/TabletRail.tsx` (FR-017)
- [X] T075 [P] [US2] Build the mobile compact header and bottom navigation with touch-sized targets in `apps/web/src/shell/MobileNav.tsx` (FR-018)
- [X] T076 [US2] Compose the responsive shell in `apps/web/src/shell/AppShell.tsx` selecting exactly one layout per width (FR-019)
- [X] T077 [US2] Constrain workspace content to a readable maximum measure on very large viewports in `apps/web/src/shell/AppShell.tsx` (edge case)
- [X] T078 [P] [US2] Create the five content-free destination regions in `apps/web/src/app/destinations/` — structurally present with headings, so verification has legitimate targets (FR-023)
- [X] T079 [US2] Implement visible focus indicators, accessible names, and current-destination state in `apps/web/src/shell/` (FR-021, FR-022, SC-004)
- [X] T080 [US2] Add the no-horizontal-scrolling assertion at every width from 320px upward across all destinations in `e2e/responsive.spec.ts` (FR-020, SC-006)
- [X] T081 [US2] Suppress non-essential animation under reduced-motion preference in `apps/web/src/theme/tokens.css` and assert reflow at 200% text zoom in `e2e/responsive.spec.ts` (FR-024)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 — Every proposed change is automatically verified (Priority: P3)

**Goal**: Eleven gates on Linux, with per-PR ephemeral resources.

**Independent Test**: Open pull requests each carrying one deliberate defect and confirm the matching gate fails and names it.

> **Sequencing note**: although this is P3, the cheap gates (T082) are worth landing immediately after
> Phase 1. The constitution's own rationale is that establishing the gate before the code exists is
> the only time it is free.

### Tests for User Story 3

- [X] T082 [P] [US3] Create the base workflow in `.github/workflows/verify.yml` running typecheck, lint, unit, and component tests on Linux (FR-062, FR-063)

### Implementation for User Story 3

- [X] T083 [US3] Add Neon branch creation and deletion per pull request in `.github/workflows/verify.yml` using `neondatabase/create-branch-action@v5` and `delete-branch-action@v3` (FR-067, research.md D5)
- [X] T084 [US3] Add the migration verification job applying all committed migrations to the fresh branch in `.github/workflows/verify.yml` (FR-038, SC-015)
- [X] T085 [US3] Add the integration test job running against the PR's own database branch in `.github/workflows/verify.yml` (FR-005, FR-069)
- [X] T086 [US3] Add the contract check job in `.github/workflows/verify.yml` failing both when the committed contract is stale and when client repository types diverge from it (FR-044b, FR-044c)
- [X] T087 [US3] Add the end-to-end and accessibility job in `.github/workflows/verify.yml` (FR-068)
- [X] T088 [US3] Add the production build job with asset budget enforcement in `.github/workflows/verify.yml` (FR-072)
- [X] T089 [US3] Add the ephemeral per-PR API deployment in `.github/workflows/verify.yml`, pointed at the PR's database branch (plan.md Complexity Tracking)
- [X] T090 [US3] Add the Cloudflare Pages preview deployment configured against the PR's API in `.github/workflows/verify.yml` — never pointed at real attendee data (FR-066, FR-067, SC-011)
- [X] T091 [US3] Ensure any absent, skipped, or errored check fails the run in `.github/workflows/verify.yml` — no path may report success while a gate did not execute (FR-032, FR-064, FR-071)
- [X] T091a [US3] Configure required status checks so a non-green run cannot merge, and record in `.githooks/README.md` that server-side enforcement is **unavailable** on this repository (private, free-tier; the branch-protection and ruleset APIs return 403). Until that changes, FR-065 rests on client-side hooks that `--no-verify` bypasses — a known, accepted, and now explicitly assigned gap (FR-065, spec Open Question 17)
- [X] T092 [US3] Add `neondatabase/schema-diff-action@v1` to post schema differences as a PR comment, serving the constitution's requirement that migrations be reviewed
- [ ] T093 [US3] Verify every gate by deliberately breaking it on a throwaway branch, per quickstart.md Scenario 8 — **a gate that does not fail when broken is not a gate** (SC-010)

**Checkpoint**: No change can merge without passing all eleven checks.

---

## Phase 6: User Story 4 — Installs and behaves honestly offline (Priority: P4)

**Goal**: An installable PWA whose offline behaviour is bounded and truthful.

**Independent Test**: Install to a home screen, disable the network, launch, and confirm the shell renders with an explicit offline state; confirm a server-dependent action is refused rather than appearing to succeed.

### Tests for User Story 4

- [X] T094 [P] [US4] End-to-end offline test in `e2e/offline.spec.ts` — shell renders, offline state shown, server-dependent action refused, recovery on reconnect (FR-051, FR-052, FR-053, FR-054, SC-012)

### Implementation for User Story 4

- [X] T095 [US4] Configure `vite-plugin-pwa` with content-hashed precache in `apps/web/vite.config.ts` so a new deployment supersedes stale assets (FR-055, research.md D14)
- [X] T096 [US4] Create the web app manifest sourcing the product name from the single branding constant in `apps/web/src/app/branding.ts` — the name is **MyNet** (FR-048, FR-049, SC-013)
- [X] T097 [P] [US4] Create provisional 192px, 512px, and maskable icons in `apps/web/public/icons/`, visibly marked as provisional, with `apps/web/public/icons/README.md` recording that they are not approved branding (FR-050)
- [X] T098 [US4] Implement the offline shell and navigation fallback in `apps/web/vite.config.ts` — **API responses are never precached**, so offline never serves stale attendee data (FR-051, research.md D14)
- [X] T099 [US4] Implement the web `ConnectivityService` in `packages/platform/src/web/connectivity.ts` with debouncing so transient drops do not make the indicator oscillate (FR-054)
- [X] T100 [US4] Build the offline state presentation in `apps/web/src/shell/OfflineBanner.tsx` naming what is unavailable rather than implying full function (FR-052)
- [X] T101 [US4] Refuse server-dependent actions while offline with a clear explanation in `packages/data/src/http/` — never queued silently, never shown as succeeded (FR-053, FR-057)
- [X] T102 [US4] Assert sign-out leaves no attendee data on the device in `e2e/offline.spec.ts` (FR-056)

**Checkpoint**: Installable, and honest about what it cannot do offline.

---

## Phase 7: User Story 5 — Capabilities and data sources are replaceable (Priority: P5)

**Goal**: Prove Principle V holds, mechanically rather than by review.

**Independent Test**: Substitute a test double for each of the six device interfaces and each repository; confirm the application runs and the substitution takes effect with no change to feature code.

> The interfaces themselves land in Phase 2 because User Story 1's data access requires them. This
> phase completes the stubs and **proves** substitutability.

### Tests for User Story 5

- [X] T103 [P] [US5] Substitutability tests for all six device interfaces in `packages/platform/tests/substitution.test.ts` (FR-047)
- [X] T104 [P] [US5] Substitutability tests for every repository in `packages/data/tests/substitution.test.ts` (FR-047)

### Implementation for User Story 5

- [X] T105 [US5] Complete web or no-op implementations for all six device interfaces in `packages/platform/src/web/` — each returns a defined result appropriate to its contract; completing without effect is a defined result where the contract has no return value (FR-046)
- [X] T106 [US5] Add the verification that counts direct browser API and network calls in feature code, failing when the count is non-zero, in `packages/config/eslint.config.js` (SC-008, FR-045)
- [X] T107 [US5] Confirm the notification and calendar implementations in `packages/platform/src/web/` are **not** wired to real delivery — the interfaces exist, the delivery does not, until a recorded decision brings it into scope

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T108 [P] Write `README.md` covering setup, run, and verification for a clean clone with no undocumented steps (FR-006, FR-007, SC-014)
- [ ] T109 Execute every scenario in [quickstart.md](./quickstart.md) and record the results
- [ ] T110 [P] Audit the dependency set against FR-003 — confirm nothing was carried forward from the prototype's inherited list without justification
- [ ] T111 Review against constitution Principle VIII — identity scoping, server-side authorization, secret placement, field minimisation
- [ ] T112 Conduct the recorded design review for FR-011 against its four named criteria, capturing the outcome and reviewer in the pull request
- [X] T113 Tune the asset budget to a value that is tight enough to fail on a careless dependency addition (FR-072)
- [ ] T114 Manual accessibility pass for what automation cannot judge — reduced motion, 200% zoom, screen-reader announcement of destination changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Provisioning)**: Owner action. Blocks *merge*, not implementation
- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phases 3–7 (User Stories)**: All depend on Phase 2
- **Phase 8 (Polish)**: Depends on all desired stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No dependency on other stories — it is the MVP
- **US2 (P2)**: After Phase 2. Renders inside the authenticated state US1 establishes, but its navigation, layout, and accessibility are independently testable
- **US3 (P3)**: After Phase 2. Independent of US1/US2 content, though its e2e job needs their specs to exist to run meaningfully
- **US4 (P4)**: After Phase 2. Needs the shell (US2) to have something to render offline
- **US5 (P5)**: After Phase 2. Independent — proves what Phase 2 built

### Within Each User Story

- Tests written and failing before implementation
- Schema before queries, queries before routes, routes before client repositories, repositories before UI
- Contract regenerated after any route schema change

### Parallel Opportunities

- T006–T009 (shared configuration) in parallel
- T012–T015 (tokens, lint rule, icons, breakpoints) in parallel
- T020–T023 (four schema files) in parallel
- T035–T037 (auth primitives) in parallel
- T038, T039 (both interface sets) in parallel
- T043–T047 (all US1 tests) in parallel
- T073–T075 (three navigation forms) in parallel
- T103, T104 (both substitution suites) in parallel

---

## Parallel Example: User Story 1

```bash
# All User Story 1 tests together — write first, confirm they fail:
Task: "Integration test for sign-in success and failure in apps/api/tests/integration/sign-in.test.ts"
Task: "Isolation test in apps/api/tests/integration/isolation.test.ts"
Task: "Integration test for session validity in apps/api/tests/integration/auth-session.test.ts"
Task: "Integration test for throttling in apps/api/tests/integration/throttle.test.ts"
Task: "Component test for the sign-in screen in apps/web/tests/sign-in.test.tsx"

# Both client repositories together:
Task: "Implement the attendee repository in packages/data/src/http/attendee-repository.ts"
Task: "Implement the events repository in packages/data/src/http/events-repository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational — blocks everything
3. Phase 3: User Story 1
4. **STOP and VALIDATE** — quickstart.md Scenarios 1 and 2, especially **Scenario 2 (isolation)**

At that point MyNet is a real authenticated product with durable per-attendee state. It has one plain
screen and no navigation, but the hard part — the part that cannot be retrofitted safely — is done.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + US1 → **MVP**: sign in, see your own workspace
3. + US2 → the full responsive, addressable, accessible shell
4. + US3 → the pipeline enforces everything above
5. + US4 → installable, honest offline
6. + US5 → substitutability proven mechanically

### A note on ordering versus priority

Story priority reflects **value**, not necessarily build order. Two pragmatic deviations:

- **Land T082 (the cheap CI gates) right after Phase 1.** The constitution's own rationale is that
  establishing the gate before the code exists is the only time it is free. The remaining US3 tasks
  need the database and application to exist, so they stay in Phase 5.
- **Phase 0 is not optional and not last.** Provisioning has lead time, and FR-071 forbids obtaining a
  green pipeline by disabling the check. Start it immediately even though nothing depends on it until
  merge.

### Resolved decision affecting this plan

**Spec Open Question 16 — does this ship as one pull request? Yes.** Settled 2026-08-04 by the owner
through `/speckit-spex-collab-phase-split`. All 115 code tasks (T005–T114) ship as a single pull
request against `develop`; the phase headings above stay as execution order, not PR boundaries.
FR-071 decided it — splitting would open pull requests whose required checks, the preview deployment
in particular, do not yet exist. The accepted cost is one review spanning the client shell, the API,
the schema, the auth flow, and CI orchestrating three ephemeral resources per PR.

T001–T004 remain outside that pull request: they are owner provisioning actions with no file to
change, and they block its merge rather than its implementation.

---

## Notes

- `[P]` means different files with no dependency on incomplete work
- `[Story]` maps each task to a user story for traceability
- Confirm tests fail before implementing
- Commit after each task or logical group; every change reaches `develop` by pull request (constitution)
- Stop at any checkpoint to validate a story independently
- **`drizzle-kit push` must never appear anywhere**, including local development
