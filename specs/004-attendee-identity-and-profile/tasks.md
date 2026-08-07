# Tasks: Attendee Identity, Personal Data and Profile

**Input**: Design documents from `/specs/004-attendee-identity-and-profile/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/identity-api.md](./contracts/identity-api.md),
[quickstart.md](./quickstart.md)

**Tests**: **Required, not optional.** Constitution Principle VII mandates the CI gates, and four
requirements name automated tests as the mechanism rather than the evidence — FR-370 and FR-377 are
structural guards that must *fail the build* when a later feature forgets its deletion or export
coverage, FR-371 requires deletion asserted against a real database, and FR-389 requires isolation
asserted server-side.

**Organization**: grouped by user story, so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on incomplete work
- **[Story]**: US1–US8, matching spec.md
- Exact file paths in every description

## Path Conventions

Web application: `apps/api/src/`, `apps/web/src/`, shared `packages/*/src/`. Per plan.md.

## Global Constraints

Copied from spec.md and plan.md. **Every task inherits these.**

- **One migration, `0003`.** `0004` is spent by 005 and `0005`–`0007` are reserved by 006–008; there
  is no free adjacent number. If a split proves necessary, 007's and 008's reservations are
  renumbered in the same change (FR-396).
- **`routes/index.ts` is append-only.** The generated contract lists paths in observation order.
- **Every route carries a `schema` block.** A route without one is silently absent from
  `contracts/openapi.json`, and `contract:check` cannot notice what was never offered to it.
- **Every route declaring `:eventId` carries `requireEventAccess`**, or the route audit fails the build.
- **Validation is disabled confirmation, never a post-submit error** (FR-304, FR-338).
- **`CatalogRepository` is read-only in perpetuity.** No task adds a write path to it.
- **No card is added to Home**, and no existing card is edited.
- Free-text limits are enforced at the **column** as well as the route (FR-337), per `session_notes`.

## Interfaces

Declared once here because a task's implementer sees only their own task. Names and signatures below
are binding across every task that consumes them.

```ts
// apps/api/src/storage/service.ts — research D3
interface StorageService {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>
  delete(key: string): Promise<void>
}

// apps/api/src/mail/service.ts — transactional account mail only (FR-394, FR-395)
interface MailService {
  sendVerification(to: string, link: string): Promise<void>
  sendPasswordReset(to: string, link: string): Promise<void>
}

// apps/api/src/auth/verification.ts and password-reset.ts — reuse auth/token.ts unchanged (D4)
issueVerification(attendeeId: string): Promise<{ token: string }>
consumeVerification(token: string): Promise<{ attendeeId: string } | null>
issuePasswordReset(attendeeId: string): Promise<{ token: string }>
consumePasswordReset(token: string): Promise<{ attendeeId: string } | null>

// apps/api/src/auth/throttle.ts — extended, not replaced (D2)
type ThrottleAction = 'sign_in' | 'sign_up' | 'join_code' | 'reset_request'
recordAttempt(key: AttemptKey & { succeeded: boolean; action: ThrottleAction }): Promise<void>
failureDelayMs(key: AttemptKey & { action: ThrottleAction }): Promise<number>

// apps/api/src/images/avatar.ts — decode, resize, re-encode (D8)
processAvatar(input: Buffer): Promise<{ bytes: Buffer; contentType: string }>  // throws on undecodable input
```

---

## Phase 1: Setup

- [X] T001 Add a server-side image decode/resize/re-encode dependency to `apps/api/package.json`, chosen for metadata-stripping by re-encode per research D8
- [X] T002 [P] Add configuration for verification and reset link lifetimes, avatar size and dimension limits, and accepted image types in `apps/api/src/config.ts`
- [X] T003 [P] Add the corresponding environment variable declarations and validation in `apps/api/src/env.ts`
- [X] T004 [P] Document the new environment variables in `.env.example`, marking which have safe development defaults and which do not

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, ports, and the query layer every story depends on. **No user story can start
until this phase completes.**

### Schema and migration

- [X] T005 Add `email_verified_at`, `discoverable` (default true) and `avatar_object_key` columns to `apps/api/src/db/schema/attendees.ts` (FR-319, FR-359, FR-346)
- [X] T006 Add the `join_code` column to `apps/api/src/db/schema/events.ts` with a `UNIQUE` constraint, documenting per FR-317a that it is **not** a credential and is stored in plain text deliberately (FR-311)
- [X] T007 Add the `action` column to `apps/api/src/db/schema/sign-in-attempts.ts` and extend both existing indexes to lead with it (FR-307a, research D2)
- [X] T008 [P] Create `apps/api/src/db/schema/profiles.ts` with `attendee_profiles` and `attendee_interests`, with `CHECK` constraints for every length and enumerated value (FR-334, FR-337, FR-339)
- [X] T009 [P] Create `apps/api/src/db/schema/identity-tokens.ts` with `attendee_verifications` and `attendee_password_resets` as **two separate tables**, documenting why they are not one table with a discriminator (FR-323, FR-333, research D4)
- [X] T010 [P] Create `apps/api/src/db/schema/stored-objects.ts`, documenting the deliberate absence of a foreign key to `attendees` (FR-352, research D3)
- [X] T011 Export all new tables from `apps/api/src/db/schema/index.ts`
- [X] T012 Write migration `apps/api/migrations/0003_attendee_identity_and_profile.sql`, adding `join_code` and `action` with temporary defaults and **dropping those defaults in the same migration**, per the pattern `events.timezone` established in 002 (FR-396)
- [X] T013 Verify `apps/api/migrations/0003_attendee_identity_and_profile.sql` applies forward against a real database, and that `pnpm db:migrate` followed by `pnpm db:seed` leaves no column at a temporary default

### The deletion structural guard — early, so it protects this feature's own tables

- [X] T014 **Structural guard** in `apps/api/tests/unit/deletion-coverage.test.ts` that fails when any table storing attendee data has neither a cascade from `attendees` nor a declared retention rule, deriving the table set from the Drizzle schema with declared exclusions as an allow-list (FR-370). **Placed here rather than with US7**: a guard written after the tables it protects cannot have protected them, and phases 3–9 add six

### Ports and adapters

- [X] T015 [P] Define the `StorageService` port in `apps/api/src/storage/service.ts` per the Interfaces block, documenting why it is server-side and **not** a seventh member of `DeviceServices` (FR-352, FR-393, research D3)
- [X] T016 [P] Implement the database-backed adapter in `apps/api/src/storage/db-adapter.ts`, which needs no provisioning and survives container restarts — unlike a filesystem adapter on ephemeral disks (FR-352)
- [X] T017 [P] Add a lint rule to `packages/config/eslint.config.js` forbidding storage-vendor imports outside `apps/api/src/storage/`, mirroring `mynet/no-direct-platform-access` — **without it FR-352 is a sentence, not a boundary** (FR-352, FR-393)
- [X] T018 [P] Define the `MailService` port in `apps/api/src/mail/service.ts` per the Interfaces block, restricted to transactional account mail so it cannot carry engagement notifications (FR-394, FR-395)
- [X] T019 [P] Implement the development/test sink adapter in `apps/api/src/mail/sink-adapter.ts`, recording sent messages so tests and quickstart can read verification links (FR-394)
- [X] T020 Register both ports at the API composition root in `apps/api/src/app.ts`, without disturbing the load-bearing ordering of steps 1–7

### Throttle, retention and identity primitives

- [X] T021 Extend `apps/api/src/auth/throttle.ts` so every count filters on `action` per the Interfaces block, so exhausting one action's allowance cannot consume another's (FR-307, FR-307a, FR-314, FR-331)
- [X] T022 Add per-action thresholds to `apps/api/src/auth/throttle.ts`, with reset-request weighted toward the source dimension (FR-331, research D2)
- [X] T023 Add a `delayOnly` counting mode to `apps/api/src/auth/throttle.ts` so identifier-keyed reset throttling can delay but **never deny** — the person a denial harms is always the victim (FR-331, research D2)
- [X] T024 [P] Create `apps/api/src/auth/verification.ts` per the Interfaces block, reusing `issueToken`/`hashToken`/`tokenHashesEqual` from `auth/token.ts` unchanged (FR-320, FR-323, research D4)
- [X] T025 [P] Create `apps/api/src/auth/password-reset.ts` per the Interfaces block, invalidating outstanding resets **by deleting rows inside the issuing transaction** rather than by an `is_current` flag (FR-328, FR-329, FR-333, research D4)
- [X] T026 Extend the sweep in `apps/api/src/maintenance.ts` to remove consumed and expired verification and reset rows, **without altering the existing two-hour `sign_in_attempts` window** (FR-381, FR-382, FR-383, FR-384)

### Query layer

- [X] T027 [P] Create `apps/api/src/db/queries/identity.ts` for account creation, address lookup, verification state and join-code resolution (FR-301, FR-302, FR-305, FR-311)
- [X] T028 [P] Create `apps/api/src/db/queries/profiles.ts`, with the other-attendee read expressed as **one query over one join** so every refusal cause produces no row and is indistinguishable by construction (FR-357, FR-358, FR-361, FR-390, research D5)
- [X] T029 [P] Create `apps/api/src/db/queries/account.ts` for export assembly and account deletion (FR-366, FR-374)

### Repository interfaces and client transport

- [X] T030 [P] Create `packages/data/src/interfaces/identity.ts` — a new file, so 004 and 006 contend only on one appended export line
- [X] T031 [P] Create `packages/data/src/interfaces/profile.ts`
- [X] T032 Append both exports to `packages/data/src/interfaces/index.ts`
- [X] T033 [P] Implement `packages/data/src/http/identity-repository.ts`
- [X] T034 [P] Implement `packages/data/src/http/profile-repository.ts`
- [X] T035 Register both repositories in `packages/data/src/http/index.ts` and the client platform registry

### Seed

- [X] T036 Add join codes to every seeded conference in `apps/api/src/db/seed/events.ts` — **blocking**, because no conference can be joined without one (FR-311, FR-317)

**Checkpoint**: schema, guard, ports, queries and repositories exist. User stories may now proceed.

---

## Phase 3: User Story 1 — A person creates an account and joins a conference (P1) 🎯 MVP

**Goal**: a person with no prior account reaches Home for a conference under their own power.

**Independent test**: from a database with conferences but no accounts, complete sign-up and join, and
confirm arrival at Home with the conference active.

### Tests for User Story 1

- [X] T037 [P] [US1] Integration test in `apps/api/tests/integration/sign-up.test.ts`: account created and signed in; second attempt on the same address refused with no duplicate account; password stored only as a hash and absent from every response and log (FR-300, FR-303, FR-305, FR-306)
- [X] T038 [P] [US1] Integration test in `apps/api/tests/integration/sign-up-uniqueness.test.ts` asserting the address is unique **product-wide, not per conference** (FR-302)
- [X] T039 [P] [US1] Integration test in `apps/api/tests/integration/join-conference.test.ts`: valid code registers and becomes active; repeat entry is idempotent; unrecognised code returns one wording; a conference with no code is unjoinable (FR-310, FR-312, FR-313, FR-315, FR-317)
- [X] T040 [P] [US1] Integration test in `apps/api/tests/integration/join-grants-nothing.test.ts` asserting registration confers no capability over conference content, other attendees, or another conference — and is never accepted as identity assurance (FR-316, FR-317b)
- [X] T041 [P] [US1] Integration test in `apps/api/tests/integration/sign-up-throttle.test.ts`: a sign-up storm against an address does **not** slow that address's sign-in, and join-code entry cannot enumerate codes (FR-307, FR-307a, FR-314)
- [X] T042 [P] [US1] Component test in `apps/web/tests/component/SignUp.test.tsx`: confirmation stays disabled until the password policy is met, with the reason stated (FR-304)

### Implementation for User Story 1

- [X] T043 [US1] Implement `POST /auth/sign-up` in `apps/api/src/routes/auth/sign-up.ts`, trimming the address at `preValidation` per `sign-in.ts`'s precedent, with a full `schema` block (FR-300, FR-301, FR-303, FR-306)
- [X] T044 [US1] Implement `POST /events/join` in `apps/api/src/routes/events/join.ts`, deliberately **without** an `:eventId` path parameter so the route audit does not demand a guard that cannot pass for an unjoined conference (FR-310, FR-312, FR-313, FR-315)
- [X] T045 [US1] Append both route plugins to `apps/api/src/routes/index.ts` — appended, never inserted
- [X] T046 [P] [US1] Build the sign-up screen in `apps/web/src/app/auth/SignUp.tsx`, with disabled confirmation and the password policy visible before submission (FR-304)
- [X] T047 [P] [US1] Build the join-conference screen in `apps/web/src/app/join/JoinConference.tsx` (FR-310, FR-313)
- [X] T048 [US1] Add both addresses to `apps/web/src/app/navigation.ts`, extending the destination declarations rather than `routes.tsx`
- [X] T049 [US1] Present the invitation to join when an attendee is registered for no conference in `apps/web/src/app/home/HomeShell.tsx`, rather than an empty conference (FR-308)
- [X] T050 [US1] Link sign-up from the existing sign-in screen and back again in `apps/web/src/app/auth/SignIn.tsx`

**Checkpoint**: a new person can reach Home. This is the MVP.

---

## Phase 4: User Story 2 — Verification and recovery (P2)

**Goal**: the attendee confirms their address and can recover a forgotten password.

**Independent test**: sign up, follow the verification link, sign out, request a reset, set a new
password, sign in with it.

### Tests for User Story 2

- [X] T051 [P] [US2] Integration test in `apps/api/tests/integration/verification.test.ts`: link verifies once; second use refused; expired link refused; resend issues a new one and is itself rate-limited (FR-318, FR-319, FR-320, FR-321, FR-322)
- [X] T052 [P] [US2] Integration test in `apps/api/tests/integration/verification-storage.test.ts` asserting database access alone cannot reconstruct a verification or reset link (FR-323, FR-333)
- [X] T053 [P] [US2] Integration test in `apps/api/tests/integration/password-reset.test.ts`: identical response whether or not the account exists; single use; a new request invalidates the outstanding link; completion revokes **every** session; no password appears in any message, log or record (FR-326, FR-327, FR-328, FR-329, FR-330, FR-332)
- [X] T054 [P] [US2] Integration test in `apps/api/tests/integration/reset-lockout.test.ts` asserting **an attacker cannot deny an attendee their own reset** — FR-031b's failure reached by a new route (FR-331, research D2)
- [X] T055 [P] [US2] Integration test in `apps/api/tests/integration/reset-throttle.test.ts` asserting a throttled reset request still returns `202`, so the throttle is not an account-existence oracle (FR-327, FR-331)
- [X] T056 [P] [US2] Integration test in `apps/api/tests/integration/mail-failure.test.ts`: a send failure does **not** fail account creation (FR-318a)
- [X] T057 [P] [US2] Integration test in `apps/api/tests/integration/unverified-unobstructed.test.ts` asserting an unverified attendee can join, author a profile, save sessions and write notes — everything except appear to others (FR-324, FR-325, FR-325b)

### Implementation for User Story 2

- [X] T058 [US2] Implement `POST /auth/verify` in `apps/api/src/routes/auth/verify.ts` (FR-319, FR-320, FR-321)
- [X] T059 [US2] Implement `POST /auth/reset-request` and `POST /auth/reset` in `apps/api/src/routes/auth/reset.ts` (FR-326, FR-327, FR-328, FR-330)
- [X] T060 [US2] Dispatch verification mail after the account commits in `apps/api/src/routes/auth/sign-up.ts`, tolerating send failure per FR-318a (FR-318)
- [X] T061 [US2] Implement verification resend in `apps/api/src/routes/auth/verify.ts`, rate-limited (FR-321, FR-322)
- [X] T062 [US2] Append the route plugins to `apps/api/src/routes/index.ts`
- [X] T063 [P] [US2] Build `apps/web/src/app/auth/Verify.tsx` with pending, verified, expired and send-failed states (FR-321)
- [X] T064 [P] [US2] Build `apps/web/src/app/auth/ResetRequest.tsx` and `apps/web/src/app/auth/ResetPassword.tsx` (FR-326, FR-332)
- [X] T065 [US2] Add the addresses to `apps/web/src/app/navigation.ts`
- [X] T066 [US2] Surface an unobtrusive invitation to verify in `apps/web/src/app/profile/Profile.tsx`, stating that verification is what makes the attendee visible to others, without obstructing anything (FR-325a, FR-325b)

**Checkpoint**: accounts are recoverable. The gap self sign-up created is closed.

---

## Phase 5: User Story 3 — The attendee authors their profile (P3)

**Goal**: the attendee describes themselves.

**Independent test**: complete every field, reload, confirm persistence; edit one and confirm it persists.

### Tests for User Story 3

- [X] T067 [P] [US3] Integration test in `apps/api/tests/integration/profile.test.ts`: every field persists and reads back; an attendee with no profile row reads as empty rather than `404`; the owner always reads their own profile regardless of visibility settings (FR-334, FR-336, FR-340, FR-341)
- [X] T068 [P] [US3] Integration test in `apps/api/tests/integration/profile-constraints.test.ts` asserting length and enumerated-value limits are enforced at the **column**, independently of the route schema (FR-337)
- [X] T069 [P] [US3] Integration test in `apps/api/tests/integration/profile-ownership.test.ts` asserting no path edits another attendee's profile, and that no seed process sets networking intent or availability (FR-335, FR-339)
- [X] T070 [P] [US3] Component test in `apps/web/tests/component/ProfileEdit.test.tsx`: disabled confirmation with the reason stated, never a post-submit error (FR-338)

### Implementation for User Story 3

- [X] T071 [US3] Implement `GET /profile` and `PUT /profile` in `apps/api/src/routes/profile.ts`, with whole-profile semantics so an omitted field has one meaning (FR-334, FR-335, FR-336, FR-340)
- [X] T072 [US3] Append the route plugin to `apps/api/src/routes/index.ts`
- [X] T073 [P] [US3] Build `apps/web/src/app/profile/Profile.tsx` with its empty-and-invited state (FR-341)
- [X] T074 [P] [US3] Build `apps/web/src/app/profile/ProfileEdit.tsx` with per-field limits surfaced as they are approached (FR-337, FR-338)
- [X] T075 [US3] Add the profile address to `apps/web/src/app/navigation.ts` and reach it from the shell without introducing a sixth destination
- [X] T076 [US3] Add profiles and interests for the seeded demo attendees in `apps/api/src/db/seed/attendees.ts`, plus a **third attendee with no profile and no avatar**, so both populated and empty states are reachable at first run (FR-342, research D6)

---

## Phase 6: User Story 4 — The attendee sets a photograph as their avatar (P4)

**Goal**: real faces, with no hidden location data.

**Depends on US3** (a profile to attach to) **and on US5's visibility rule** for T083 — avatar bytes
must be served under the same three conditions as the profile, so T083 lands with or after US5.

**Independent test**: upload, confirm it renders, replace it, remove it and confirm the fallback.

### Tests for User Story 4

- [X] T077 [P] [US4] Integration test in `apps/api/tests/integration/avatar-upload.test.ts` asserting **the stored bytes** carry no location, camera or timestamp metadata — against a real photograph with EXIF, checking storage rather than the upload path (FR-348, FR-349)
- [X] T078 [P] [US4] Integration test in `apps/api/tests/integration/avatar-rejection.test.ts`: oversize and non-image uploads refused **before any bytes are stored**, with type determined by inspection rather than by the declared header or filename (FR-347)
- [X] T079 [P] [US4] Integration test in `apps/api/tests/integration/avatar-replace.test.ts` asserting replacing an avatar makes the previous object unretrievable, and removal restores the fallback (FR-350)
- [X] T080 [P] [US4] Integration test in `apps/api/tests/integration/avatar-personal-data.test.ts` asserting the avatar is deleted with the account and present in the export (FR-353)
- [X] T081 [P] [US4] Unit test in `apps/api/tests/unit/storage-adapter.test.ts` covering `put`/`get`/`delete` round-trips against the interface (FR-352)

### Implementation for User Story 4

- [X] T082 [US4] Implement `processAvatar` in `apps/api/src/images/avatar.ts` per the Interfaces block — decode, resize, **re-encode** — so metadata absence is a property of the operation rather than a list of tags to maintain (FR-348, FR-349)
- [X] T083 [US4] Implement `PUT /profile/avatar`, `DELETE /profile/avatar` and avatar serving in `apps/api/src/routes/profile.ts`, refusing on size before reading the body and applying the same visibility conditions as the profile (FR-346, FR-347, FR-350, FR-357)
- [X] T084 [P] [US4] Build `apps/web/src/app/profile/Avatar.tsx` using a file input with `accept="image/*"`, leaving `CameraService` unwired per research D9 (FR-346)
- [X] T085 [P] [US4] Implement the non-photographic fallback in `apps/web/src/app/profile/AvatarFallback.tsx` so no broken image can appear anywhere a profile renders (FR-351)
- [X] T086 [US4] Assert in `apps/api/tests/unit/seed-avatars.test.ts` that **no prototype photograph of a real person ships as a seeded avatar** — the repository is public and doing so would attribute real likenesses to fictional attendees (FR-354)

---

## Phase 7: User Story 5 — Discoverability (P5)

**Goal**: the attendee controls whether co-attendees can find them; verification is a precondition.

**Depends on US2** (verification state) **and US3** (a profile to hide), per FR-359.

**Independent test**: two verified attendees at one conference retrieve each other; turn one off and
confirm the other is refused identically to a cross-conference refusal.

### Tests for User Story 5

- [X] T087 [P] [US5] Integration test in `apps/api/tests/integration/profile-visibility.test.ts` asserting all four refusal causes — no shared conference, does not exist, not discoverable, not verified — return an identical response, evaluated server-side (FR-357, FR-358, FR-361, FR-390)
- [X] T088 [P] [US5] Integration test in `apps/api/tests/integration/verification-gates-visibility.test.ts` asserting an unverified attendee never appears to others however the setting is configured (FR-359, FR-325c)
- [X] T089 [P] [US5] Integration test in `apps/api/tests/integration/discoverability.test.ts` asserting the response states **effective** visibility, that a change takes effect on the next request without a new sign-in, and that no per-field visibility exists (FR-360, FR-362, FR-363)

### Implementation for User Story 5

- [X] T090 [US5] Implement `GET /events/:eventId/attendees/:attendeeId` in `apps/api/src/routes/events/attendees.ts`, carrying `requireEventAccess` so the reader's registration is proven by the branded `EventScope` (FR-357, FR-358, FR-390)
- [X] T091 [US5] Implement `PUT /profile/discoverability` in `apps/api/src/routes/profile.ts`, returning effective visibility rather than the raw flag (FR-359, FR-362, FR-363)
- [X] T092 [US5] Append the route plugin to `apps/api/src/routes/index.ts`
- [X] T093 [P] [US5] Build the discoverability control in `apps/web/src/app/profile/Account.tsx`, stating plainly what the setting currently does and what verification adds (FR-362)

---

## Phase 8: User Story 6 — Export (P6)

**Goal**: the attendee takes a complete copy of their data.

**Independent test**: with a profile, avatar, saved sessions and notes, request an export and confirm
every stored field appears.

### Tests for User Story 6

- [X] T094 [P] [US6] Integration test in `apps/api/tests/integration/export.test.ts`: every field present with avatar bytes embedded; nothing belonging to another attendee; no credential material; refused for another attendee's identifier; rate-limited (FR-373, FR-374, FR-375, FR-376, FR-378, FR-379)
- [X] T095 [US6] **Structural guard** in `apps/api/tests/unit/export-coverage.test.ts` deriving the expected personal-data field set **from the Drizzle schema** and failing when a field lacks export coverage, with deliberate exclusions declared as an allow-list (FR-377)

### Implementation for User Story 6

- [X] T096 [US6] Implement export assembly in `apps/api/src/db/queries/account.ts`, embedding avatar bytes rather than a URL so the document stands alone (FR-373, FR-374, FR-376)
- [X] T097 [US6] Implement `GET /profile/export` in `apps/api/src/routes/account.ts`, rate-limited and bound to the session (FR-378, FR-379)
- [X] T098 [US6] Append the route plugin to `apps/api/src/routes/index.ts`
- [X] T099 [P] [US6] Build the export action in `apps/web/src/app/profile/Account.tsx` with preparing, ready and failure states

---

## Phase 9: User Story 7 — Account deletion (P7)

**Goal**: the attendee leaves, completely. **This is what finally makes 005's cascade reachable.**

**Independent test**: delete an account with data across four features and assert **zero rows** remain
in every table, by direct database query.

### Tests for User Story 7

- [X] T100 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion.test.ts` asserting zero rows across every table in data-model.md, extending `agenda-deletion.test.ts`'s coverage (FR-364, FR-366, FR-371)
- [X] T101 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-no-tombstone.test.ts` asserting **no tombstone, soft-delete marker or anonymised shell** remains, and that deletion is irreversible through every surface (FR-365, FR-368)
- [X] T102 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-storage.test.ts` asserting the avatar's storage object is deleted, and that a mid-operation failure orphans a row pointing at missing bytes rather than bytes no row references (research D10)
- [X] T103 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-sessions.test.ts` asserting every session on every device stops working immediately (FR-369)
- [X] T104 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-attempts.test.ts` asserting `sign_in_attempts` rows are **deliberately not** deleted, so deleting an account is not a way to clear one's own trail (FR-382, research D10)
- [X] T105 [P] [US7] Integration test in `apps/api/tests/integration/withdraw-conference.test.ts` asserting withdrawal removes the registration, that conference's saved sessions and notes, and the active-conference row if it names it — leaving the attendee coherent (FR-317c, FR-317d)

### Implementation for User Story 7

- [X] T106 [US7] Implement deletion in `apps/api/src/db/queries/account.ts`: remove the storage object **first**, then the attendee row in one transaction, letting the cascade do the rest (FR-364, FR-365, FR-366)
- [X] T107 [US7] Implement `DELETE /account` in `apps/api/src/routes/account.ts`, revoking sessions and clearing the cookie (FR-368, FR-369)
- [X] T108 [US7] Implement `DELETE /events/:eventId/registration` in `apps/api/src/routes/events/registration.ts` (FR-317c)
- [X] T109 [US7] Leave the attendee coherent after withdrawal in `apps/api/src/db/queries/account.ts` and `apps/web/src/app/home/HomeShell.tsx`, per FR-317d
- [X] T110 [US7] Append both route plugins to `apps/api/src/routes/index.ts`
- [X] T111 [P] [US7] Build the delete-account confirmation in `apps/web/src/app/profile/Account.tsx` as a native `<dialog>` with `showModal()`, Escape dismissal and explicit focus restoration — the treatment 005 established — stating that it cannot be undone and no copy is kept (FR-367)
- [X] T112 [P] [US7] Build the withdraw-from-conference confirmation in `apps/web/src/app/profile/WithdrawConference.tsx`, stating that the conference's saved sessions and notes go with it (FR-317c)

---

## Phase 10: User Story 8 — Isolation (P8)

**Goal**: every surface bound to the authenticated attendee, server-side.

**Deliberately last** — it audits every route the earlier phases add.

### Tests for User Story 8

- [X] T113 [P] [US8] Integration test in `apps/api/tests/integration/identity-isolation.test.ts` covering **every** route this feature adds, unauthenticated and cross-attendee (FR-385, FR-386)
- [X] T114 [P] [US8] Integration test in `apps/api/tests/integration/identity-nondisclosure.test.ts` asserting no refusal distinguishes existence from non-existence on any path added here (FR-388)
- [X] T115 [P] [US8] Integration test in `apps/api/tests/integration/identity-leakage.test.ts` asserting no response exposes credential, verification or reset material, or another attendee's verification state (FR-361, FR-391)
- [X] T116 [P] [US8] Integration test in `apps/api/tests/integration/cross-attendee-isolation.test.ts` exercising the server directly with real seeded rows rather than through client behaviour (FR-389)
- [X] T117 [US8] Extend the route audit in `apps/api/tests/unit/event-scope-audit.test.ts` to assert the four intentionally unauthenticated routes are an explicit enumerated allow-list rather than an accident (FR-387)

### Implementation for User Story 8

- [X] T118 [US8] Ensure every authenticated route in `apps/api/src/routes/profile.ts`, `apps/api/src/routes/account.ts` and `apps/api/src/routes/events/` derives identity from the session only, rejecting any body or path attendee identifier (FR-385, FR-386)
- [X] T119 [US8] Ensure the four unauthenticated routes under `apps/api/src/routes/auth/` are individually rate-limited under their own action counters (FR-387)

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T120 [P] Accessibility pass over every surface under `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`: labels, visible focus, keyboard operability, and **disabled confirmations that state why** so the reason reaches a screen reader (SC-310)
- [X] T121 [P] Verify desktop, tablet and mobile layouts for every surface under `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`, with no horizontal scrolling at 320px (SC-309)
- [X] T122 [P] Implement offline refusal across `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`, distinguishing offline from server fault, preserving typed text and the selected file, and queueing nothing
- [X] T123 [P] End-to-end test in `e2e/identity-journey.spec.ts` covering sign up → join → verify → profile → avatar → export → delete, **timed and asserted under three minutes** for the sign-up-to-Home leg (SC-300)
- [X] T124 [P] End-to-end test in `e2e/password-recovery.spec.ts` asserting a verified attendee regains access unaided (SC-301)
- [X] T125 [P] Integration test in `apps/api/tests/integration/profile-persistence.test.ts` asserting 100% of authored fields survive a reload and appear identically on a second session (SC-302)
- [X] T126 [P] Assert in `apps/api/tests/integration/identity-leakage.test.ts` that no credential, verification or reset material appears in any response, log or export (SC-311)
- [X] T127 [P] Assert in `apps/api/tests/integration/retention-sweep.test.ts` that records no cascade reaches are absent once past the stated window (SC-308)
- [X] T128 [P] Add accessibility coverage for the new surfaces in `e2e/accessibility/` so the `test-accessibility` gate exercises them
- [X] T129 Regenerate and commit `contracts/openapi.json`, confirming every new route appears — a route without a `schema` block is silently absent and `contract:check` cannot notice it
- [X] T130 Confirm `pnpm lint && pnpm typecheck && pnpm test && pnpm contract:check && pnpm build` all pass, and that the correctness gates in `.github/workflows/verify.yml` are green
- [X] T131 Update `CLAUDE.md`'s status section to describe what 004 delivered, and note that 006 may now assume every readable profile carries a verified address (FR-325c)

---

## Requirement coverage

Every FR and SC, and the task that carries it. Named individually rather than by range, because a
range asserts coverage where a list demonstrates it — the standard 005 set for exactly this reason.

| Requirement | Tasks |
|---|---|
| FR-300 | T037, T043 |
| FR-301 | T027, T043 |
| FR-302 | T038 |
| FR-303 | T037, T043 |
| FR-304 | T042, T046 |
| FR-305 | T027, T037 |
| FR-306 | T037, T043 |
| FR-307, FR-307a | T021, T041 |
| FR-308 | T049 |
| FR-310 | T039, T044, T047 |
| FR-311 | T006, T027, T036 |
| FR-312 | T039, T044 |
| FR-313 | T039, T044, T047 |
| FR-314 | T021, T041 |
| FR-315 | T039, T044 |
| FR-316 | T040 |
| FR-317 | T036, T039 |
| FR-317a | T006 |
| FR-317b | T040 |
| FR-317c | T105, T108, T112 |
| FR-317d | T105, T109 |
| FR-318, FR-318a | T056, T060 |
| FR-319 | T005, T051, T058 |
| FR-320 | T024, T051, T058 |
| FR-321 | T051, T058, T061, T063 |
| FR-322 | T051, T061 |
| FR-323 | T009, T024, T052 |
| FR-324 | T057 |
| FR-325, FR-325a, FR-325b | T057, T066 |
| FR-325c | T088, T131 |
| FR-326 | T053, T059, T064 |
| FR-327 | T053, T055 |
| FR-328 | T025, T053, T059 |
| FR-329 | T025, T053 |
| FR-330 | T053, T059 |
| FR-331 | T021, T022, T023, T054, T055 |
| FR-332 | T053, T064 |
| FR-333 | T009, T025, T052 |
| FR-334 | T008, T067, T071 |
| FR-335 | T069, T071 |
| FR-336 | T067, T071 |
| FR-337 | T008, T068, T074 |
| FR-338 | T070, T074 |
| FR-339 | T008, T069 |
| FR-340 | T067, T071 |
| FR-341 | T067, T073 |
| FR-342 | T076 |
| FR-346 | T005, T083, T084 |
| FR-347 | T078, T083 |
| FR-348 | T077, T082 |
| FR-349 | T077, T082 |
| FR-350 | T079, T083 |
| FR-351 | T085 |
| FR-352 | T010, T015, T016, T017, T081 |
| FR-353 | T080 |
| FR-354 | T086 |
| FR-357 | T028, T083, T087, T090 |
| FR-358 | T028, T087, T090 |
| FR-359 | T005, T088, T091 |
| FR-360 | T089 |
| FR-361 | T028, T087, T115 |
| FR-362 | T089, T091, T093 |
| FR-363 | T089, T091 |
| FR-364 | T100, T106 |
| FR-365 | T101, T106 |
| FR-366 | T029, T100, T106 |
| FR-367 | T111 |
| FR-368 | T101, T107 |
| FR-369 | T103, T107 |
| FR-370 | **T014** |
| FR-371 | T100 |
| FR-373 | T094, T096 |
| FR-374 | T029, T094, T096 |
| FR-375 | T094 |
| FR-376 | T094, T096 |
| FR-377 | **T095** |
| FR-378 | T094, T097 |
| FR-379 | T094, T097 |
| FR-381 | T026 |
| FR-382 | T026, T104 |
| FR-383 | T026 |
| FR-384 | T026 |
| FR-385 | T113, T118 |
| FR-386 | T113, T118 |
| FR-387 | T117, T119 |
| FR-388 | T114 |
| FR-389 | T116 |
| FR-390 | T028, T087, T090 |
| FR-391 | T115 |
| FR-393 | T015, T017 |
| FR-394 | T018, T019 |
| FR-395 | T018 |
| FR-396 | T012 |
| SC-300 | T123 |
| SC-301 | T124 |
| SC-302 | T125 |
| SC-303 | T077 |
| SC-304, SC-304a | T087, T088 |
| SC-305 | T094, T095 |
| SC-306 | T100 |
| SC-307 | T113 |
| SC-308 | T127 |
| SC-309 | T121 |
| SC-310 | T120 |
| SC-311 | T126 |

**The two structural guards are T014 and T095** — the only tasks whose purpose is to fail a *future*
feature's build. Constitution v2.3.0 is what makes that legitimate rather than this feature
legislating for others. **T014 sits in Phase 2 deliberately**: a deletion guard written after the
tables it protects cannot have protected them, and phases 3–9 add six.

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
  └─> Phase 2 (Foundational, incl. the deletion guard) ── blocks everything
        ├─> Phase 3  US1 sign-up + join  (P1) 🎯 MVP
        │     ├─> Phase 4  US2 verification + recovery (P2)
        │     └─> Phase 5  US3 profile (P3)
        │           ├─> Phase 6  US4 avatar (P4) ──┐
        │           └─> Phase 7  US5 discoverability (P5)
        │                 ▲  needs US2 (verification state) + US3 (a profile)
        │                 └──── T083 (avatar serving) needs US5's visibility rule
        ├─> Phase 8  US6 export (P6)      [more complete after US3/US4]
        └─> Phase 9  US7 deletion (P7)
              └─> Phase 10 US8 isolation (P8) ── audits every route above
                    └─> Phase 11 Polish
```

**Two stories have real prerequisites.** US5 needs verification state from US2 and a profile from
US3, because FR-359 makes visibility conditional on both. **US4's T083 needs US5's visibility rule**,
because avatar bytes must be served under the same three conditions as the profile — if T083 lands
before US5, avatars are readable by people who cannot read the profile they belong to.

## Parallel opportunities

- **T008, T009, T010** — three new schema files
- **T015–T019** — both ports, both adapters, and the lint rule
- **T027, T028, T029** — three query modules
- **T030, T031, T033, T034** — repository interfaces and transports
- Every `[P]` test task within a story — separate files
- **T046/T047**, **T063/T064**, **T073/T074**, **T084/T085**, **T111/T112** — client screens
- **T120–T128** — the whole polish phase except the final three

Sequential by necessity: **T021–T023** all edit `throttle.ts`; every `routes/index.ts` append
(T045, T062, T072, T092, T098, T110) touches one append-only file.

## Implementation strategy

**MVP is Phase 3 alone.** A person can create an account and reach a conference — the capability
whose absence blocked this phase for two features.

**Then Phase 4**, which is not optional in practice: until recovery exists, every MVP account is one
forgotten password from being permanently lost, and there is no organizer to appeal to.

**Phases 8 and 9 get more expensive with every feature that adds a table**, and their guards are what
stop 006–009 silently regressing the commitment.

**Suggested phase split for review** — offered to `speckit-spex-collab-phase-split`, not decided here:

| PR | Phases | Rationale |
|---|---|---|
| 1 | 1–2 | Schema, migration, ports, and the deletion guard. Large, mechanical, reviewable alone. |
| 2 | 3–4 | Identity: sign-up, join, verification, recovery. The security-sensitive half. |
| 3 | 5–7 | Profile, avatar, discoverability. Kept together because T083 needs US5's rule. |
| 4 | 8–11 | Export, deletion, isolation, polish. Where the personal-data guarantees land. |
