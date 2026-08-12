# Tasks: Conference Content Authoring

**Feature**: 014 · **Branch**: `spec/014-conference-content-authoring` · **Migration**: `0011`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Constitution**: **v4.2.0 — DRAFTED, NOT RATIFIED**

> **T001 is blocked until v4.2.0 is ratified.** The amendment gates the first line of code, as
> v3.1.0 gated 007's Phase 7, v3.2.0 gated 008, v3.3.0 gated 009 and v4.0.0 gated 013. Five
> requirements cite N1–N5 directly.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different files, no dependency on an incomplete task
- **[US1]–[US4]** — the user story the task serves (user-story phases only)

## Path Conventions

- `apps/api/src/admin/` — administrative guards and branded scopes
- `apps/api/src/routes/admin/` — administrative routes
- `apps/api/src/db/queries/` — query layer, split per domain
- `apps/admin/` — the administrative client (013)
- `apps/web/` — MyNet. **Three directories change**, and every change is attendee-facing and
  role-independent

---

## Global Constraints

**Every task inherits this section.** Copied from the spec, plan and research so no task has to go
looking.

| Constraint | Value |
|---|---|
| Migration number | **`0011`** — the only one this feature claims (013 holds `0009`, 012 reserves `0010`) |
| Requirement range | FR-1001–FR-1044, SC-1001–SC-1012 |
| Constitution | **v4.2.0**, N1–N5 |
| New branded scope | `ConferenceAuthorityScope`, minted only by `requireConferenceAuthority` (R2) |
| Material change set | **cancelled, start time, room** — and nothing else (N1, FR-1026) |
| Dispatch caller | `routes/admin/catalog.ts` — **never `notifications/**`**, which the gate does not scan (R3) |
| Coalescing key | the audit entry id (R4) |
| Every refusal without a reason | **404**, from 013's single factory |
| Act + audit entry | **one transaction** (FR-1037). Dispatch is **outside** it |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: schema and generated artifacts. Nothing here is feature behaviour.

- [ ] T001 Move `apps/api/migrations/meta/README.md` aside before any generation — `drizzle-kit generate` JSON-parses every file in `meta/`, and that README explains why the journal lists `0003` before `0004`. Restore it after
- [ ] T002 Add `cancelledAt`, `logisticsChangedAt` and `lastChangeActId` to `sessions` in `apps/api/src/db/schema/catalog.ts`, each with a header stating it is conference content and why it is stored rather than derived
- [ ] T003 [P] Add `viewedAt` (`NOT NULL DEFAULT now()`) to `savedSessions` in `apps/api/src/db/schema/agenda.ts`, with a header stating **why the default is the save instant** — there is no `created_at` to compare against
- [ ] T004 Add `sessions_event_cancelled_idx` and `saved_sessions_session_id_idx` in the same schema files, with a comment on the second naming the fan-out query it serves and the sequential scan it prevents
- [ ] T005 Generate `apps/api/migrations/0011_conference_authoring.sql`, review the SQL by hand, and restore `meta/README.md`
- [ ] T006 Run `pnpm db:migrate` against a scratch database and confirm `0011` applies cleanly on top of `0009`
- [ ] T007 [P] Regenerate the committed OpenAPI contract in `contracts/` once routes exist — placeholder task, re-run at the end of Phase 6

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the guard, the write layer, and the three schema-derived gates. **No user story can start
until this phase completes.**

**⚠️ This phase contains the largest piece of new construction in the feature (T008–T012).**

### The fifth branded scope

- [ ] T008 Create `apps/api/src/admin/conference-authority.ts` with `ConferenceAuthorityScope` — a branded class carrying operator id, tier and event id, **constructible only here**, mirroring `EventScope`, `ConversationScope`, `CardScope` and `VerifiedOperatorScope`
- [ ] T009 Implement `requireConferenceAuthority` in the same file: platform tier passes for any conference, organizer passes only for an assigned one, **everything else 404 from 013's single factory**
- [ ] T010 [P] Add `apps/api/tests/unit/conference-authority-brand.test.ts` — assert with `@ts-expect-error` that the scope cannot be constructed outside its module, so it fails the **typecheck** rather than the test run (013's precedent)
- [ ] T011 [P] Add `apps/api/tests/unit/conference-authority-sole-importer.test.ts` — the minting function has exactly one caller, scanning `src/` **only**; a test fabricating a scope proves nothing about what a request can reach
- [ ] T012 Add `apps/api/tests/integration/conference-authority.test.ts` — an organizer reaching an unassigned conference is **indistinguishable** from reaching one that does not exist

### The write layer

- [ ] T013 Create `apps/api/src/db/queries/admin-catalog.ts` — every function takes a `ConferenceAuthorityScope`, never a bare string. Header must state why the write path is **not** in `catalog.ts` (R1)
- [ ] T014 Amend the header of `apps/api/src/db/queries/catalog.ts`: a write path now exists elsewhere, this file stays the attendee read path, and its `EventScope` signatures are unchanged
- [ ] T015 Amend the header of `apps/api/tests/unit/catalog-read-only.test.ts` to state its subject is the attendee read path specifically. **Its assertions do not change** — `CatalogRepository` stays read-only in perpetuity, literally

### The engagement predicate

- [ ] T016 Implement the engagement predicate in `apps/api/src/db/queries/session-changes.ts` — covering `saved_sessions`, `session_notes`, `session_questions`, and `question_votes` **one hop** through `session_questions`
- [ ] T017 Add `apps/api/tests/unit/engagement-coverage.test.ts` — derive from the Drizzle schema every table with a foreign key to **both** `sessions` and `attendees`, and fail when one is absent from the predicate. **Enumerate the one-hop case explicitly**; transitive closure sweeps in merely-reachable tables
- [ ] T018 Verify T017 fails by adding a throwaway table to the schema, then remove it. **A gate that cannot fail is not a gate**

### Guard amendments

- [ ] T019 [P] Amend `apps/api/src/db/seed/catalog.ts`'s header — "no write path and no import path at any privilege" is now false. State what is permitted and to whom
- [ ] T020 [P] Amend `apps/api/tests/unit/notification-triggers.test.ts`: add `routes/admin/catalog.ts` to `DISPATCH_CALLERS`, and **record in the file why it is not under `notifications/`** — that directory is excluded from the scan, so a trigger placed there passes the gate written to catch it (R3)
- [ ] T021 [P] Confirm `join-grants-nothing.test.ts` and `qa-absences.test.ts` need **no** change, and record that conclusion in this feature's deviations rather than leaving it silent

### Throttling

- [ ] T022 Add `conference_create`, `session_write`, `session_cancel`, `session_delete`, `catalog_write` to `apps/api/tests/unit/throttle-actions.test.ts` and `throttle-thresholds.test.ts`, giving real thresholds to the first and third

**Checkpoint**: guard, write layer and gates exist. User stories may begin.

---

## Phase 3: User Story 1 — Author the programme (Priority: P1) 🎯 MVP

**Goal**: an organizer builds tracks, rooms, speakers and sessions inside a conference they are
assigned to, and an attendee sees the result.

**Independent test**: add a track, room, speaker and session as an organizer; confirm they appear in
an attendee's Agenda with the right time, track, room and speaker.

### Tests for User Story 1

- [ ] T023 [P] [US1] Add `apps/api/tests/integration/authoring-programme.test.ts` — create, read, update and delete each of tracks, rooms, speakers, sessions
- [ ] T024 [P] [US1] Add `apps/api/tests/integration/authoring-validation.test.ts` — session inside the conference's days **in venue-local time**, end after start, and **drive the day-range rule with the route bypassed** so the write path is not the only thing holding it (R9, 009's `trim()` lesson)
- [ ] T025 [P] [US1] Add `apps/api/tests/integration/authoring-isolation.test.ts` — a session cannot reference a track or room from another conference (FR-1005)

### Implementation for User Story 1

- [ ] T026 [US1] Implement track, room and speaker writes in `apps/api/src/db/queries/admin-catalog.ts`, each act writing its audit entry **in the same transaction** (FR-1037)
- [ ] T027 [US1] Implement session create and update in the same file, with day-range and end-after-start validation inside the transaction
- [ ] T028 [US1] Refuse deleting a track or room while a session references it — **409 with a reason**, because it describes the caller's own content (FR-1017)
- [ ] T029 [US1] Create `apps/api/src/routes/admin/catalog.ts` with `GET /admin/conferences/:eventId/programme` and the write routes from `contracts/authoring.md`, every one behind `requireConferenceAuthority` and naming its conference in the path
- [ ] T030 [US1] Register the routes in `apps/api/src/routes/admin/index.ts` — one line, per the append-only rule
- [ ] T031 [P] [US1] Restrict track colour to the existing tokens in the API (FR-1004); reject anything else with a 400 naming the permitted set
- [ ] T032 [P] [US1] Add `apps/admin/src/app/conferences/ProgrammeEditor.tsx` — the programme for one conference, with loading, empty and failure states
- [ ] T033 [P] [US1] Add `apps/admin/src/app/conferences/SessionForm.tsx` with client-side validation mirroring the server's, and the server's explanation surfaced on refusal
- [ ] T034 [P] [US1] Add `apps/admin/src/app/conferences/CatalogForms.tsx` for tracks, rooms and speakers — **track colour is a token picker, never a free colour input**
- [ ] T035 [US1] Wire the programme editor into the admin shell's navigation from `ConferenceList.tsx`
- [ ] T036 [P] [US1] Add `apps/admin/tests/component/programme-editor.test.tsx` — empty, loading and failure states, and the token-only colour control
- [ ] T037 [US1] Same-room overlap **warns and does not refuse** (FR-1016): server returns the warning, client confirms
- [ ] T038 [P] [US1] Add `apps/api/tests/unit/profile-uneditable.test.ts` — no administrative route edits a profile, and **no route leads from a speaker record to one** (FR-1006), comments stripped before matching

**Checkpoint**: US1 is independently shippable. An organizer can build a programme.

---

## Phase 4: User Story 2 — Change a live session without destroying attendee state (Priority: P2)

**Goal**: cancellation replaces deletion the moment anyone has engaged, and nothing anybody wrote is
lost.

**Independent test**: two attendees save a session, write notes, ask and upvote a question; cancel
it; confirm every record survives and the session reads as cancelled rather than missing.

### Tests for User Story 2

- [ ] T039 [P] [US2] Add `apps/api/tests/integration/cancel-preserves-state.test.ts` — after cancellation, all four engagement records survive and are readable by their authors (FR-1021, SC-1003)
- [ ] T040 [US2] Add `apps/api/tests/integration/delete-engagement-race.test.ts` — **the FR-1019a race**, against a real `postgres:17`: hold the delete transaction, attempt a concurrent save, assert the save blocks and no committed row is destroyed. Model it on 009's FR-714 test
- [ ] T041 [P] [US2] Add `apps/api/tests/integration/delete-refusal.test.ts` — deletion refused with 409 and a reason for each of the four engagement kinds independently
- [ ] T042 [P] [US2] Add `apps/api/tests/integration/date-range-orphan.test.ts` — shrinking the conference refuses and **names the sessions** (FR-1014); the timezone is frozen once a session exists (FR-1015)

### Implementation for User Story 2

- [ ] T043 [US2] Implement `deleteSession` in `admin-catalog.ts`: `SELECT … FOR UPDATE` on the session row **inside** the deleting transaction, then the engagement count, then the delete (R6)
- [ ] T044 [US2] Implement `cancelSession` and `reinstateSession` — set and clear `cancelled_at`; **reinstatement dispatches nothing** (FR-1024)
- [ ] T045 [US2] Implement the engagement-count read for the delete-versus-cancel decision — **counts only, no identity, no content** (FR-1025)
- [ ] T046 [US2] Implement conference `PATCH` with the orphan check and the timezone freeze
- [ ] T047 [US2] Add the cancel, reinstate and delete routes to `routes/admin/catalog.ts`
- [ ] T048 [P] [US2] Add `apps/admin/src/app/conferences/CancelDialog.tsx` — a native `<dialog>` with `showModal()`, **centred by the base rule in `theme/tokens.css` and not by a local `m-auto`**, Escape-dismissible, focus restored to the opener after closing
- [ ] T049 [P] [US2] Present a cancelled session in MyNet's Agenda row and session detail panel (FR-1022)
- [ ] T050 [US2] Teach `nextSession()` in `apps/web/src/app/sessions.ts` to skip cancelled sessions — **one change point**, serving both `UpNext` and `NextSavedSession` (R8, FR-1022a)
- [ ] T051 [P] [US2] Confirm `RestOfDay` still lists cancelled sessions, marked — it renders the full list and must not inherit the skip
- [ ] T052 [P] [US2] Let an attendee remove a cancelled session from their saved list (FR-1023)
- [ ] T053 [P] [US2] Close the Q&A composer on a cancelled session; existing questions stay readable
- [ ] T054 [P] [US2] Add `apps/web/tests/component/cancelled-session.test.tsx` — Agenda, panel and the Up-next skip
- [ ] T055 [P] [US2] Add `apps/api/tests/unit/no-attendee-state-disclosure.test.ts` — no administrative route reads a note, a message, or the identity of anyone who saved, questioned or voted (FR-1042)

**Checkpoint**: authoring is safe. US1 + US2 is a coherent release.

---

## Phase 5: User Story 3 — Be told when a saved session changes (Priority: P3)

**Goal**: the second notification trigger, and a marker that never becomes an inbox.

**Independent test**: save a session, cancel it as the organizer, confirm one notification arrives,
that activating it opens the session, and that the row carries a marker until viewed.

### Tests for User Story 3

- [ ] T056 [P] [US3] Add `apps/api/tests/integration/material-change-dispatch.test.ts` — cancellation, start-time and room changes each dispatch; **title, summary, track and speaker changes dispatch nothing** (FR-1027)
- [ ] T057 [P] [US3] Add `apps/api/tests/integration/dispatch-coalescing.test.ts` — one act changing four of one attendee's saved sessions produces **exactly one** notification carrying the count (FR-1034, SC-1012)
- [ ] T058 [P] [US3] Add to the same file: two separate acts produce **two** notifications, never one (FR-1028b)
- [ ] T059 [P] [US3] Add `apps/api/tests/integration/dispatch-excludes-actor.test.ts` — an organizer who saved the session they are changing is not notified (FR-1028a)
- [ ] T060 [P] [US3] Add `apps/api/tests/integration/dispatch-failure-isolation.test.ts` — a failing push leaves the act and its audit entry committed (007's precedent)
- [ ] T061 [P] [US3] Add `apps/web/tests/unit/authoring-absences.test.tsx` and `apps/api/tests/unit/authoring-absences.test.ts` — no bell, no notification centre, **no aggregate count and no change list in either client** (FR-1031), comments stripped before matching
- [ ] T062 [P] [US3] Add `apps/web/tests/component/push-denied-marker.test.tsx` — permission denied still shows the marker and leaves every other surface unchanged (FR-1032)

### Implementation for User Story 3

- [ ] T063 [US3] Implement `materialChangeOf` in `session-changes.ts` — returns which of cancelled/time/room applies, or none. **This function is the scope of the second trigger**; its header must say so
- [ ] T064 [US3] Set `logistics_changed_at` and `last_change_act_id` on a material change, inside the act's transaction
- [ ] T065 [US3] Implement the fan-out read: sessions changed by this act → attendees who saved any of them, **excluding the acting principal** (R4)
- [ ] T066 [US3] Dispatch from `routes/admin/catalog.ts` **after the transaction commits**, bounded by `dispatchPush`'s existing timeout, with failure logged and swallowed (R3)
- [ ] T067 [US3] Build the single and coalesced payloads per `contracts/authoring.md`
- [ ] T068 [US3] Handle activation in `apps/web/src/sw.ts` — single opens the session, **coalesced opens Agenda and never a list of changes** (FR-1034b)
- [ ] T069 [US3] Compute the marker in the agenda read as `logistics_changed_at > viewed_at`, **on the existing payload** — no new repository member, no new cached read (R7)
- [ ] T070 [US3] Update `viewed_at` when the attendee opens the session; declare the write in the caching decorator's composition root, since a write purges the conference prefix
- [ ] T071 [P] [US3] Render the marker on the Agenda row and Home, **as text and not by colour alone**
- [ ] T072 [P] [US3] Add `apps/web/tests/unit/marker-not-cached.test.ts` — no repository member is added and `substitution.test.ts` is untouched; **no eighth device capability**

**Checkpoint**: the attendee half is complete.

---

## Phase 6: User Story 4 — Create a conference (Priority: P4)

**Goal**: both tiers create a conference; an organizer is assigned to what they create.

**Independent test**: create a conference as an organizer, confirm self-assignment, confirm the join
code registers an attendee, confirm no reach over any other conference.

### Tests for User Story 4

- [ ] T073 [P] [US4] Add `apps/api/tests/integration/conference-create.test.ts` — creation by both tiers; the organizer is assigned in the **same transaction** (FR-1008)
- [ ] T074 [P] [US4] Add to the same file: creating grants **no** authority over any other conference and **no** platform capability (FR-1010)
- [ ] T075 [P] [US4] Add `apps/api/tests/integration/join-code-mint.test.ts` — the minted code is unique product-wide and works through MyNet's existing join flow (FR-1009)
- [ ] T076 [P] [US4] Add `apps/api/tests/unit/no-conference-delete.test.ts` — no route deletes a conference at any tier (FR-1011)

### Implementation for User Story 4

- [ ] T077 [US4] Implement `createConference` in `admin-catalog.ts` — conference, join code, organizer assignment and audit entry in one transaction
- [ ] T078 [US4] Mint the join code with the same generator the seed uses; retry on the unique violation rather than pre-checking
- [ ] T079 [US4] Add `POST /admin/conferences` behind `requireOperator` — **not** `requireConferenceAuthority`, because there is no conference yet
- [ ] T080 [P] [US4] Add `apps/admin/src/app/conferences/CreateConferenceDialog.tsx`, centred by the base rule, Escape-dismissible, focus restored
- [ ] T081 [P] [US4] Show the join code after creation so the organizer can distribute it
- [ ] T082 [P] [US4] Add `apps/admin/tests/component/create-conference.test.tsx` — validation, failure state, and the code displayed on success

**Checkpoint**: all four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T083 [P] Add `apps/web/tests/unit/no-admin-surface.test.ts` — re-assert FR-1003 now that MyNet has changed for the first time since 013. **The absence must be re-proved, not assumed still true**
- [ ] T084 [P] Add `apps/api/tests/unit/no-derived-relationships.test.ts` — no contact, conversation or appointment derives from an authoring act (FR-1044)
- [ ] T085 [P] Add `apps/api/tests/unit/no-session-start-trigger.test.ts` — nothing dispatches on a session starting (FR-1033)
- [ ] T086 [P] Add `apps/api/tests/unit/no-draft-state.test.ts` — no draft or published column, no lifecycle gate (FR-1040)
- [ ] T087 [P] Add `apps/api/tests/unit/no-attendee-restriction.test.ts` — no route suspends, removes or restricts an attendee (FR-1041)
- [ ] T088 Add `apps/web/tests/unit/error-classification.test.ts` — every explained refusal renders **differently from the others** and from the reasonless 404. Branch on `error.code`, **never on the class**: `ApiError extends RequestRefusedError`, which is how 008 swallowed every message its routes wrote to be read
- [ ] T089 [P] Add `e2e/authoring.spec.ts` — an organizer edits a programme in one browser profile while an attendee sees the result in another
- [ ] T090 [P] Add dialog position assertions to `e2e/responsive.spec.ts` for `CancelDialog` and `CreateConferenceDialog` — measure the gap on either side. **A width assertion never looks at position**, which is how two dialogs shipped in the top-left corner
- [ ] T091 [P] Run the accessibility gate over the programme editor and both new dialogs
- [ ] T092 Re-run `pnpm db:seed` and confirm `assertDisjoint`'s two disjoint programmes and the deliberately empty third conference survive (FR-1043)
- [ ] T093 Regenerate and commit the OpenAPI contract (completes T007)
- [ ] T094 Run `pnpm verify` — all ten gates green
- [ ] T095 Record deviations in `specs/014-conference-content-authoring/deviations.md`, including T021's no-change conclusion
- [ ] T096 Extend the reserved-migration table in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` to cover both in-flight programmes — **wrong for two features running**
- [ ] T097 Update `CLAUDE.md`: standing decisions 40–44, register entries 27 and 28, migrations run to `0011`, and the architectural invariants this feature establishes
- [ ] T098 Walk `quickstart.md` scenarios 1–5 (machine-checkable)
- [ ] T099 Walk `quickstart.md` scenarios 6–9 **by hand, on a device** — notification, coalescing, denied permission, and the three widths plus a screen-reader pass. **Joins the outstanding walkthroughs from 007, 008, 009 and 013 rather than replacing them**

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** → no dependencies. T001 blocked on v4.2.0's ratification
- **Phase 2 (Foundational)** → depends on Phase 1. **Blocks every user story**
- **Phase 3 (US1)** → depends on Phase 2
- **Phase 4 (US2)** → depends on Phase 2. Independent of US1 in principle; in practice US1 gives it sessions to act on
- **Phase 5 (US3)** → depends on Phase 4 for `cancelled_at` and on Phase 2 for the dispatch caller
- **Phase 6 (US4)** → depends on Phase 2 only. **Genuinely independent of US1–US3**
- **Phase 7 (Polish)** → depends on all

### User story dependencies

```
Phase 2 ──┬── US1 (P1) ──┐
          ├── US2 (P2) ──┼── US3 (P3)
          └── US4 (P4)   │
                         └── Phase 7
```

US3 is the only story with a hard dependency on another: it needs cancellation to exist.

### Parallel opportunities

- **T003, T010, T011, T019, T020, T021** — Phase 1/2, different files
- **T023–T025** — all US1 integration tests
- **T032, T033, T034** — three admin client files
- **T039, T041, T042** — US2 tests, except **T040 which is serial** (it holds a transaction)
- **T056–T062** — all seven US3 test files
- **T073–T076** — all US4 tests
- **T083–T087, T089–T091** — the absence guards and e2e

### Within each story

Tests → query layer → routes → client → component tests.

---

## Parallel Example: User Story 3

```bash
# Seven independent test files, all before implementation:
T056 material-change-dispatch   T057 dispatch-coalescing      T058 (same file as T057 — serial)
T059 dispatch-excludes-actor    T060 dispatch-failure-isolation
T061 authoring-absences (×2)    T062 push-denied-marker

# Then implementation, which is mostly serial: T063 → T064 → T065 → T066 → T067
# T071 and T072 parallelise once T069 lands.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

Phases 1 → 2 → 3 delivers an organizer who can build a programme that attendees see. **It is not
safe to ship alone**: US1 includes deletion, and until Phase 4's cancel rule exists, deleting a
session destroys attendee state. Treat US1 as the MVP *increment*, not as a releasable slice.

### Incremental delivery

1. **Phases 1–4** — the first coherent release. Authoring, and it cannot destroy anything.
2. **Phase 5** — the attendee learns. This is what needs v4.2.0 most directly.
3. **Phase 6** — new conferences.
4. **Phase 7** — the absences, the by-hand walk, and the documents that go stale otherwise.

### Delivered as one PR

Per brainstorm #10, matching 008, 009 and 013, each of which shipped its gating amendment and
implementation as one merge. The phase boundaries above are a **reading order for the reviewer**,
not a merge schedule — which is what 011's collapsed split turned out to be worth.

---

## Notes

- **99 tasks.** US1 16, US2 17, US3 17, US4 10; 22 foundational, 7 setup, 17 polish
- **T040 is the task most likely to be got wrong**, and the one with the least margin: it is the only
  property no layer above a real database can test, and 009 is the model
- **T020 is the task most likely to be got wrong quietly** — the tidy placement for the new dispatch
  is the one the gate does not scan
- **T099 needs a person and a phone.** Everything else a machine can check
