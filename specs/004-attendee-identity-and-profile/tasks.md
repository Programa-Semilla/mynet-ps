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

---

## Phase 1: Setup

**Purpose**: dependencies and configuration this feature needs before anything else.

- [ ] T001 Add a server-side image decode/resize/re-encode dependency to `apps/api/package.json`, chosen for metadata-stripping by re-encode per research D8
- [ ] T002 [P] Add configuration for verification and reset link lifetimes, avatar size and dimension limits, and accepted image types in `apps/api/src/config.ts`
- [ ] T003 [P] Add the corresponding environment variable declarations and validation in `apps/api/src/env.ts`
- [ ] T004 [P] Document the new environment variables in `.env.example`, marking which have safe development defaults and which do not

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, ports, and the query layer every story below depends on. **No user story can
start until this phase completes.**

### Schema and migration (one migration, `0003` — no adjacent number is free)

- [ ] T005 Add `email_verified_at`, `discoverable` and `avatar_object_key` columns to `apps/api/src/db/schema/attendees.ts`, each with a comment stating its scoping rule and retention position per data-model.md
- [ ] T006 Add the `join_code` column to `apps/api/src/db/schema/events.ts` with a `UNIQUE` constraint, documenting per FR-317a that it is **not** a credential and is stored in plain text deliberately
- [ ] T007 Add the `action` column to `apps/api/src/db/schema/sign-in-attempts.ts` and extend both existing indexes to lead with it, per research D2
- [ ] T008 [P] Create `apps/api/src/db/schema/profiles.ts` with `attendee_profiles` and `attendee_interests`, including `CHECK` constraints for every length and enumerated value — following `session_notes`' precedent that the column constrains independently of the route schema
- [ ] T009 [P] Create `apps/api/src/db/schema/identity-tokens.ts` with `attendee_verifications` and `attendee_password_resets` as **two separate tables**, documenting why they are not one table with a discriminator (research D4)
- [ ] T010 [P] Create `apps/api/src/db/schema/stored-objects.ts`, documenting the deliberate absence of a foreign key to `attendees` — the adapter must not know what its callers store
- [ ] T011 Export all new tables from `apps/api/src/db/schema/index.ts`
- [ ] T012 Write migration `apps/api/migrations/0003_attendee_identity_and_profile.sql`, adding `join_code` and `action` with temporary defaults and **dropping those defaults in the same migration**, per the pattern `events.timezone` established in 002
- [ ] T013 Verify `apps/api/migrations/0003_attendee_identity_and_profile.sql` applies forward against a real database, and that `pnpm db:migrate` followed by `pnpm db:seed` leaves no column at a temporary default

### Ports and adapters

- [ ] T014 [P] Define the `StorageService` port (`put`, `get`, `delete`) in `apps/api/src/storage/service.ts`, documenting per research D3 why it is server-side and **not** a seventh member of `DeviceServices`
- [ ] T015 [P] Implement the database-backed adapter in `apps/api/src/storage/db-adapter.ts`, which needs no provisioning and survives container restarts — unlike a filesystem adapter on ephemeral disks
- [ ] T016 [P] Define the `MailService` port in `apps/api/src/mail/service.ts`, restricted to transactional account mail so it cannot be used for engagement notifications (FR-395)
- [ ] T017 [P] Implement the development/test sink adapter in `apps/api/src/mail/sink-adapter.ts`, recording sent messages so tests and quickstart can read verification links
- [ ] T018 Register both ports at the API composition root in `apps/api/src/app.ts`, without disturbing the load-bearing ordering of steps 1–7

### Throttle, retention and identity primitives

- [ ] T019 Extend `apps/api/src/auth/throttle.ts` so every count filters on `action`, so exhausting one action's allowance cannot consume another's (FR-307a)
- [ ] T020 Add per-action threshold configuration to `apps/api/src/auth/throttle.ts`, with reset-request weighted toward the source dimension per research D2
- [ ] T021 Add a `delayOnly` counting mode to `apps/api/src/auth/throttle.ts` so identifier-keyed reset throttling can delay but **never deny** — the person a denial harms is always the victim
- [ ] T022 [P] Create `apps/api/src/auth/verification.ts` issuing and consuming single-use verification tokens, reusing `issueToken`/`hashToken`/`tokenHashesEqual` from `auth/token.ts` unchanged (research D4)
- [ ] T023 [P] Create `apps/api/src/auth/password-reset.ts`, invalidating outstanding resets **by deleting rows inside the issuing transaction** rather than by an `is_current` flag (research D4)
- [ ] T024 Extend the sweep in `apps/api/src/maintenance.ts` to remove consumed and expired verification and reset rows, **without altering the existing two-hour `sign_in_attempts` window** (FR-382)

### Query layer

- [ ] T025 [P] Create `apps/api/src/db/queries/identity.ts` for account creation, address lookup, verification state and join-code resolution
- [ ] T026 [P] Create `apps/api/src/db/queries/profiles.ts`, with the other-attendee read expressed as **one query over one join** so every refusal cause produces no row and is indistinguishable by construction (research D5)
- [ ] T027 [P] Create `apps/api/src/db/queries/account.ts` for export assembly and account deletion

### Repository interfaces and client transport

- [ ] T028 [P] Create `packages/data/src/interfaces/identity.ts` — a new file, so 004 and 006 contend only on one appended export line
- [ ] T029 [P] Create `packages/data/src/interfaces/profile.ts`
- [ ] T030 Append both exports to `packages/data/src/interfaces/index.ts`
- [ ] T031 [P] Implement `packages/data/src/http/identity-repository.ts`
- [ ] T032 [P] Implement `packages/data/src/http/profile-repository.ts`
- [ ] T033 Register both repositories in `packages/data/src/http/index.ts` and the client platform registry

### Seed

- [ ] T034 Add join codes to every seeded conference in `apps/api/src/db/seed/events.ts`
- [ ] T035 Add profiles and interests for the seeded demo attendees in `apps/api/src/db/seed/attendees.ts`, plus a **third attendee with no profile and no avatar**, so both the populated and empty states are reachable at first run (research D6)

**Checkpoint**: schema, ports, queries and repositories exist. User stories may now proceed.

---

## Phase 3: User Story 1 — A person creates an account and joins a conference (P1) 🎯 MVP

**Goal**: a person with no prior account reaches Home for a conference under their own power.

**Independent test**: from a database with conferences but no accounts, complete sign-up and join, and
confirm arrival at Home with the conference active.

### Tests for User Story 1

- [ ] T036 [P] [US1] Integration test in `apps/api/tests/integration/sign-up.test.ts`: account created and signed in; second attempt on the same address refused with no duplicate account (FR-303)
- [ ] T037 [P] [US1] Integration test in `apps/api/tests/integration/join-conference.test.ts`: valid code registers; repeat entry is idempotent; unrecognised code returns one wording; a conference with no code is unjoinable
- [ ] T038 [P] [US1] Integration test in `apps/api/tests/integration/sign-up-throttle.test.ts`: a sign-up storm against an address does **not** slow that address's sign-in (FR-307a)
- [ ] T039 [P] [US1] Component test in `apps/web/tests/component/SignUp.test.tsx`: confirmation stays disabled until the password policy is met, with the reason stated

### Implementation for User Story 1

- [ ] T040 [US1] Implement `POST /auth/sign-up` in `apps/api/src/routes/auth/sign-up.ts`, trimming the address at `preValidation` per `sign-in.ts`'s precedent, with a full `schema` block
- [ ] T041 [US1] Implement `POST /events/join` in `apps/api/src/routes/events/join.ts`, deliberately **without** an `:eventId` path parameter so the route audit does not demand a guard that cannot pass for an unjoined conference
- [ ] T042 [US1] Append both route plugins to `apps/api/src/routes/index.ts` — appended, never inserted
- [ ] T043 [P] [US1] Build the sign-up screen in `apps/web/src/app/auth/SignUp.tsx`, with disabled confirmation and the password policy visible before submission
- [ ] T044 [P] [US1] Build the join-conference screen in `apps/web/src/app/join/JoinConference.tsx`
- [ ] T045 [US1] Add both addresses to `apps/web/src/app/navigation.ts`, extending the destination declarations rather than `routes.tsx`
- [ ] T046 [US1] Present the invitation to join when an attendee is registered for no conference (FR-308) in `apps/web/src/app/home/HomeShell.tsx`, rather than an empty conference
- [ ] T047 [US1] Link sign-up from the existing sign-in screen and back again in `apps/web/src/app/auth/SignIn.tsx`

**Checkpoint**: a new person can reach Home. This is the MVP.

---

## Phase 4: User Story 2 — Verification and recovery (P2)

**Goal**: the attendee confirms their address and can recover a forgotten password.

**Independent test**: sign up, follow the verification link, sign out, request a reset, set a new
password, sign in with it.

### Tests for User Story 2

- [ ] T048 [P] [US2] Integration test in `apps/api/tests/integration/verification.test.ts`: link verifies once; second use refused; expired link refused; resend issues a new one
- [ ] T049 [P] [US2] Integration test in `apps/api/tests/integration/password-reset.test.ts`: identical response whether or not the account exists (FR-327); single use; a new request invalidates the outstanding link; completion revokes **every** session (FR-330)
- [ ] T050 [P] [US2] Integration test in `apps/api/tests/integration/reset-lockout.test.ts` asserting **an attacker cannot deny an attendee their own reset** — the FR-031b failure reached by a new route (research D2)
- [ ] T051 [P] [US2] Integration test in `apps/api/tests/integration/reset-throttle.test.ts` asserting a throttled reset request still returns `202`, so the throttle is not an account-existence oracle
- [ ] T052 [P] [US2] Integration test in `apps/api/tests/integration/mail-failure.test.ts`: a send failure does **not** fail account creation (FR-318a)

### Implementation for User Story 2

- [ ] T053 [US2] Implement `POST /auth/verify` in `apps/api/src/routes/auth/verify.ts`
- [ ] T054 [US2] Implement `POST /auth/reset-request` and `POST /auth/reset` in `apps/api/src/routes/auth/reset.ts`
- [ ] T055 [US2] Dispatch verification mail after the account commits in `apps/api/src/routes/auth/sign-up.ts`, tolerating send failure per FR-318a
- [ ] T056 [US2] Append the route plugins to `apps/api/src/routes/index.ts`
- [ ] T057 [P] [US2] Build `apps/web/src/app/auth/Verify.tsx` with pending, verified, expired and send-failed states
- [ ] T058 [P] [US2] Build `apps/web/src/app/auth/ResetRequest.tsx` and `apps/web/src/app/auth/ResetPassword.tsx`
- [ ] T059 [US2] Add the addresses to `apps/web/src/app/navigation.ts`
- [ ] T060 [US2] Surface an unobtrusive invitation to verify in `apps/web/src/app/profile/Profile.tsx`, stating that verification is what makes the attendee visible to others (FR-325b), without obstructing anything

**Checkpoint**: accounts are recoverable. The gap self sign-up created is closed.

---

## Phase 5: User Story 3 — The attendee authors their profile (P3)

**Goal**: the attendee describes themselves.

**Independent test**: complete every field, reload, confirm persistence; edit one and confirm it persists.

### Tests for User Story 3

- [ ] T061 [P] [US3] Integration test in `apps/api/tests/integration/profile.test.ts`: fields persist; an attendee with no profile row reads as empty rather than `404` (FR-341)
- [ ] T062 [P] [US3] Integration test in `apps/api/tests/integration/profile-constraints.test.ts` asserting length and enumerated-value limits are enforced at the **column**, independently of the route schema
- [ ] T063 [P] [US3] Component test in `apps/web/tests/component/ProfileEdit.test.tsx`: disabled confirmation with the reason stated, never a post-submit error

### Implementation for User Story 3

- [ ] T064 [US3] Implement `GET /profile` and `PUT /profile` in `apps/api/src/routes/profile.ts`, with whole-profile semantics so an omitted field has one meaning
- [ ] T065 [US3] Append the route plugin to `apps/api/src/routes/index.ts`
- [ ] T066 [P] [US3] Build `apps/web/src/app/profile/Profile.tsx` with its empty-and-invited state
- [ ] T067 [P] [US3] Build `apps/web/src/app/profile/ProfileEdit.tsx` with per-field limits surfaced as they are approached
- [ ] T068 [US3] Add the profile address to `apps/web/src/app/navigation.ts` and reach it from the shell without introducing a sixth destination

---

## Phase 6: User Story 4 — The attendee sets a photograph as their avatar (P4)

**Goal**: real faces, with no hidden location data.

**Independent test**: upload, confirm it renders, replace it, remove it and confirm the fallback.

### Tests for User Story 4

- [ ] T069 [P] [US4] Integration test in `apps/api/tests/integration/avatar-upload.test.ts` asserting **the stored bytes** carry no location, camera or timestamp metadata — against a real photograph with EXIF, checking storage rather than the upload path (FR-349, SC-303)
- [ ] T070 [P] [US4] Integration test in `apps/api/tests/integration/avatar-rejection.test.ts`: oversize and non-image uploads refused **before any bytes are stored**, with type determined by inspection rather than by the declared header or filename
- [ ] T071 [P] [US4] Integration test in `apps/api/tests/integration/avatar-replace.test.ts` asserting replacing an avatar makes the previous object unretrievable
- [ ] T072 [P] [US4] Unit test in `apps/api/tests/unit/storage-adapter.test.ts` covering `put`/`get`/`delete` round-trips

### Implementation for User Story 4

- [ ] T073 [US4] Implement decode, resize and **re-encode** in `apps/api/src/images/avatar.ts`, so metadata absence is a property of the operation rather than a list of tags to maintain
- [ ] T074 [US4] Implement `PUT /profile/avatar` and `DELETE /profile/avatar` in `apps/api/src/routes/profile.ts`, refusing on size before reading the body
- [ ] T075 [US4] Serve avatar bytes in `apps/api/src/routes/profile.ts` through a route applying the same visibility conditions as the profile itself
- [ ] T076 [P] [US4] Build `apps/web/src/app/profile/Avatar.tsx` using a file input with `accept="image/*"`, leaving `CameraService` unwired per research D9
- [ ] T077 [P] [US4] Implement the non-photographic fallback in `apps/web/src/app/profile/AvatarFallback.tsx` so no broken image can appear anywhere a profile renders (FR-351)

---

## Phase 7: User Story 5 — Discoverability (P5)

**Goal**: the attendee controls whether co-attendees can find them; verification is a precondition.

**Independent test**: two verified attendees at one conference retrieve each other; turn one off and
confirm the other is refused identically to a cross-conference refusal.

### Tests for User Story 5

- [ ] T078 [P] [US5] Integration test in `apps/api/tests/integration/profile-visibility.test.ts` asserting all four refusal causes — no shared conference, does not exist, not discoverable, **not verified** — return an identical response (FR-361)
- [ ] T079 [P] [US5] Integration test in `apps/api/tests/integration/verification-gates-visibility.test.ts` asserting an unverified attendee never appears to others however the setting is configured (FR-359, SC-304a)
- [ ] T080 [P] [US5] Integration test in `apps/api/tests/integration/discoverability.test.ts` asserting the response states **effective** visibility, so an unverified attendee turning it on is not told the opposite of the truth

### Implementation for User Story 5

- [ ] T081 [US5] Implement `GET /events/:eventId/attendees/:attendeeId` in `apps/api/src/routes/events/attendees.ts`, carrying `requireEventAccess` so the reader's registration is proven by the branded `EventScope`
- [ ] T082 [US5] Implement `PUT /profile/discoverability` in `apps/api/src/routes/profile.ts`, returning effective visibility rather than the raw flag
- [ ] T083 [US5] Append the route plugin to `apps/api/src/routes/index.ts`
- [ ] T084 [P] [US5] Build the discoverability control in `apps/web/src/app/profile/Account.tsx`, stating plainly what the setting currently does and what verification adds

---

## Phase 8: User Story 6 — Export (P6)

**Goal**: the attendee takes a complete copy of their data.

**Independent test**: with a profile, avatar, saved sessions and notes, request an export and confirm
every stored field appears.

### Tests for User Story 6

- [ ] T085 [P] [US6] Integration test in `apps/api/tests/integration/export.test.ts`: every field present, avatar bytes embedded, nothing belonging to another attendee, no credential material
- [ ] T086 [US6] **Structural guard** in `apps/api/tests/unit/export-coverage.test.ts` deriving the expected personal-data field set **from the Drizzle schema** and failing when a field lacks export coverage, with deliberate exclusions declared as an allow-list (FR-377)

### Implementation for User Story 6

- [ ] T087 [US6] Implement export assembly in `apps/api/src/db/queries/account.ts`, embedding avatar bytes rather than a URL so the document stands alone
- [ ] T088 [US6] Implement `GET /profile/export` in `apps/api/src/routes/account.ts`, rate-limited and bound to the session
- [ ] T089 [US6] Append the route plugin to `apps/api/src/routes/index.ts`
- [ ] T090 [P] [US6] Build the export action in `apps/web/src/app/profile/Account.tsx` with preparing, ready and failure states

---

## Phase 9: User Story 7 — Account deletion (P7)

**Goal**: the attendee leaves, completely. **This is what finally makes 005's cascade reachable.**

**Independent test**: delete an account with data across four features and assert **zero rows** remain
in every table, by direct database query.

### Tests for User Story 7

- [ ] T091 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion.test.ts` asserting zero rows across every table listed in data-model.md, extending the existing `agenda-deletion.test.ts` coverage (FR-371, SC-306)
- [ ] T092 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-no-tombstone.test.ts` asserting **no tombstone, soft-delete marker or anonymised shell** remains anywhere
- [ ] T093 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-storage.test.ts` asserting the avatar's storage object is deleted, and that a mid-operation failure orphans a row pointing at missing bytes rather than bytes no row references (research D10)
- [ ] T094 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-sessions.test.ts` asserting every session on every device stops working immediately (FR-369)
- [ ] T095 [P] [US7] Integration test in `apps/api/tests/integration/account-deletion-attempts.test.ts` asserting `sign_in_attempts` rows are **deliberately not** deleted, so deleting an account is not a way to clear one's own trail
- [ ] T096 [US7] **Structural guard** in `apps/api/tests/unit/deletion-coverage.test.ts` failing when a table storing attendee data has neither a cascade from `attendees` nor a declared retention rule (FR-370)

### Implementation for User Story 7

- [ ] T097 [US7] Implement deletion in `apps/api/src/db/queries/account.ts`: remove the storage object **first**, then the attendee row in one transaction, letting the cascade do the rest
- [ ] T098 [US7] Implement `DELETE /account` in `apps/api/src/routes/account.ts`, revoking sessions and clearing the cookie
- [ ] T099 [US7] Implement withdrawal — `DELETE /events/:eventId/registration` in `apps/api/src/routes/events/registration.ts` — deleting the registration, that conference's saved sessions and notes, and the active-conference row if it names it (FR-317c)
- [ ] T100 [US7] Leave the attendee coherent after withdrawal in `apps/api/src/db/queries/account.ts` and `apps/web/src/app/home/HomeShell.tsx`, per FR-317d, rather than in an empty or broken conference
- [ ] T101 [US7] Append both route plugins to `apps/api/src/routes/index.ts`
- [ ] T102 [P] [US7] Build the delete-account confirmation in `apps/web/src/app/profile/Account.tsx` as a native `<dialog>` with `showModal()`, Escape dismissal and explicit focus restoration — the treatment 005 established
- [ ] T103 [P] [US7] Build the withdraw-from-conference confirmation in `apps/web/src/app/profile/WithdrawConference.tsx`, stating that the conference's saved sessions and notes go with it

---

## Phase 10: User Story 8 — Isolation (P8)

**Goal**: every surface bound to the authenticated attendee, server-side.

**Independent test**: exercise every route added here against the API directly, unauthenticated and
as a different attendee.

### Tests for User Story 8

- [ ] T104 [P] [US8] Integration test in `apps/api/tests/integration/identity-isolation.test.ts` covering **every** route this feature adds, unauthenticated and cross-attendee (FR-385, FR-386, SC-307)
- [ ] T105 [P] [US8] Integration test in `apps/api/tests/integration/identity-nondisclosure.test.ts` asserting no refusal distinguishes existence from non-existence on any path added here (FR-388)
- [ ] T106 [P] [US8] Integration test in `apps/api/tests/integration/identity-leakage.test.ts` asserting no response exposes credential, verification or reset material, or another attendee's verification state (FR-361, FR-391)
- [ ] T107 [US8] Extend the route audit in `apps/api/tests/unit/event-scope-audit.test.ts` to assert the four intentionally unauthenticated routes are an explicit, enumerated allow-list rather than an accident (FR-387)

### Implementation for User Story 8

- [ ] T108 [US8] Ensure every authenticated route in `apps/api/src/routes/profile.ts`, `apps/api/src/routes/account.ts` and `apps/api/src/routes/events/` derives identity from the session only, rejecting any body or path attendee identifier
- [ ] T109 [US8] Ensure the four unauthenticated routes under `apps/api/src/routes/auth/` are individually rate-limited under their own action counters

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T110 [P] Accessibility pass over every surface added under `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`: labels, visible focus, keyboard operability, and **disabled confirmations that state why** so the reason reaches a screen reader
- [ ] T111 [P] Verify all three layouts for every surface under `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`, with no horizontal scrolling at 320px (SC-309)
- [ ] T112 [P] Implement offline refusal across `apps/web/src/app/auth/`, `apps/web/src/app/join/` and `apps/web/src/app/profile/`, distinguishing offline from server fault, preserving typed text and the selected file, and queueing nothing
- [ ] T113 [P] Add end-to-end coverage in `e2e/` for the full journey: sign up → join → verify → profile → avatar → export → delete
- [ ] T114 [P] Add accessibility coverage for the new surfaces in `e2e/accessibility/` so the `test-accessibility` gate exercises them
- [ ] T115 Regenerate and commit `contracts/openapi.json`, confirming every new route appears — a route without a `schema` block is silently absent and `contract:check` cannot notice it
- [ ] T116 Confirm `pnpm lint && pnpm typecheck && pnpm test && pnpm contract:check && pnpm build` all pass, and that `.github/workflows/verify.yml`'s correctness gates are green
- [ ] T117 Update `CLAUDE.md`'s status section to describe what 004 delivered, and note that 006 may now assume every readable profile carries a verified address (FR-325c)

---

## Requirement coverage

| Requirement group | Tasks |
|---|---|
| Account creation (FR-300–308) | T040, T043, T046, T036, T039 |
| Joining and withdrawing (FR-310–317d) | T006, T041, T044, T099, T100, T103, T037 |
| Verification (FR-318–325c) | T022, T053, T055, T057, T060, T048, T052 |
| Password recovery (FR-326–333) | T023, T054, T058, T049, T050, T051 |
| Profile (FR-334–342) | T008, T035, T064, T066, T067, T061, T062 |
| Avatar (FR-346–354) | T014, T015, T073, T074, T076, T077, T069, T070 |
| Discoverability (FR-357–363) | T081, T082, T084, T078, T079, T080 |
| Deletion (FR-364–371) | T097, T098, T102, T091, T092, T093, T096 |
| Export (FR-373–379) | T087, T088, T090, T085, T086 |
| Retention (FR-381–384) | T024, T095 |
| Authorization (FR-385–391) | T104, T105, T106, T107, T108, T109 |
| Structural (FR-393–396) | T012, T014, T016, T030, T042 |

**The two structural guards are T086 and T096.** They are the only tasks here whose purpose is to
fail a *future* feature's build, and constitution v2.3.0 is what makes that legitimate rather than
this feature legislating for others.

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
  └─> Phase 2 (Foundational) ── blocks everything
        ├─> Phase 3  US1 sign-up + join  (P1) 🎯 MVP
        │     ├─> Phase 4  US2 verification + recovery (P2)
        │     │     └─> Phase 7  US5 discoverability (P5)   [needs verification state]
        │     └─> Phase 5  US3 profile (P3)
        │           ├─> Phase 6  US4 avatar (P4)
        │           └─> Phase 7  US5 discoverability (P5)   [needs a profile to hide]
        ├─> Phase 8  US6 export (P6)      [more complete after US3/US4, testable before]
        └─> Phase 9  US7 deletion (P7)    [likewise]
              └─> Phase 10 US8 isolation (P8) ── audits every route above
                    └─> Phase 11 Polish
```

**US5 is the one story with two real prerequisites**: it needs verification state from US2 and a
profile from US3, because FR-359 makes visibility conditional on both.

**US8 is deliberately last** — it audits every route the earlier phases add, so running it earlier
would test an incomplete surface.

## Parallel opportunities

- **T008, T009, T010** — three new schema files, no overlap
- **T014–T017** — both ports and both adapters
- **T025, T026, T027** — three query modules
- **T028, T029, T031, T032** — repository interfaces and transports
- Every test task marked `[P]` within a story — separate files
- **T043/T044**, **T057/T058**, **T066/T067**, **T076/T077**, **T102/T103** — client screens in separate files

Sequential by necessity: **T019–T021** all edit `throttle.ts`; every `routes/index.ts` append
(T042, T056, T065, T083, T089, T101) touches one file and must not be reordered.

## Implementation strategy

**MVP is Phase 3 alone.** A person can create an account and reach a conference — the capability
whose absence blocked this phase for two features.

**Then Phase 4**, which is not optional in practice: until recovery exists, every MVP account is one
forgotten password from being permanently lost, and there is no organizer to appeal to.

**Phases 8 and 9 (export and deletion) are cheapest now and get more expensive with every feature
that adds a table.** Their structural guards (T086, T096) are what stop 006–009 from silently
regressing the commitment, so landing them early is worth more than their user-visible value
suggests.

**Suggested phase split for review** — offered to `speckit-spex-collab-phase-split`, not decided here:

| PR | Phases | Rationale |
|---|---|---|
| 1 | 1–2 | Schema, migration, ports. Large, mechanical, reviewable on its own. |
| 2 | 3–4 | Identity: sign-up, join, verification, recovery. The security-sensitive half. |
| 3 | 5–7 | Profile, avatar, discoverability. The product half. |
| 4 | 8–11 | Export, deletion, isolation, polish. Where the personal-data guarantees land. |
