---

description: "Task list for feature 005 — Agenda and Saved Sessions"
---

# Tasks: Agenda and Saved Sessions

**Input**: Design documents from `/specs/005-agenda-and-saved-sessions/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Constitution**: v2.2.0

**Tests**: **REQUIRED, not optional.** Principle VII names the test layers by name; Principle IX
makes accessibility and responsive verification task categories in their own right; and the
constitution states that a feature storing or reading attendee data MUST produce tasks for identity
scoping, server-side authorization, and migration verification. This feature does all three.

**Organization**: grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1–US6, mapping to the spec's user stories

## Path Conventions

pnpm monorepo: `apps/api/`, `apps/web/`, `packages/data/`, `packages/platform/`, `e2e/`.
All paths below are repository-relative.

---

## Phase 1: Setup

**Purpose**: make the gate that guards this feature actually run, before writing anything it guards.

- [ ] T001 Give the `unit` Vitest project a dummy `DATABASE_URL` via `env` in `packages/config/vitest.base.ts`, with a comment stating the route audit builds the app but never connects (research D7)
- [ ] T002 Confirm the audit executes and passes: `pnpm vitest run --project unit apps/api/tests/unit/event-scope-audit.test.ts` — a skip is not a pass under constitution v2.2.0
- [ ] T003 Confirm migration `0004` is unclaimed and `0005` remains reserved for 006 by listing `apps/api/migrations/`

**Checkpoint**: FR-230's enforcement is live. Every route added below is audited as it lands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user story work begins until this phase completes.

### Schema and migration

- [ ] T004 Define `savedSessions` and `sessionNotes` in `apps/api/src/db/schema/agenda.ts` — composite primary keys, `ON DELETE CASCADE` from `attendees`, and the `length(body) > 0 AND length(body) <= 10000` check (data-model)
- [ ] T005 Generate `apps/api/migrations/0004_saved_sessions_and_notes.sql` from the schema; do not hand-edit the generated SQL, and do not rename the file to resolve any conflict
- [ ] T006 Verify migration `0004` applies forward against a real database instance in `apps/api/tests/integration/migrations.test.ts` (Principle VII, constitution: migration verification is a required task category)

### Query layer

- [ ] T007 Implement the six query functions in `apps/api/src/queries/agenda.ts`, **each taking `EventScope` as its first parameter** so a handler that skipped verification cannot compile (data-model, FR-229)
- [ ] T008 In `apps/api/src/queries/agenda.ts`, fold the session-belongs-to-conference check into each write statement (`WHERE EXISTS …`) rather than reading then writing — a separate read is a race and leaks existence (FR-231)

### Repository interfaces

- [ ] T009 [P] Declare `SavedSessionRepository` and `SessionNotesRepository` in domain terms in `packages/data/src/interfaces/agenda.ts`, documenting that no method accepts an attendee identifier (FR-234)
- [ ] T010 Append the two type exports and two `Repositories` members in `packages/data/src/interfaces/index.ts` — append only, do not move declarations back into the barrel (FR-235)
- [ ] T011 [P] Implement the HTTP repositories in `packages/data/src/http/agenda-repository.ts`
- [ ] T012 Append the exports in `packages/data/src/http/index.ts` and wire the instances into the platform registry in `packages/platform/src/registry.tsx`

### API routes

- [ ] T013 Implement the five routes in `apps/api/src/routes/events/agenda.ts` — each nested under `:eventId`, each with `preHandler: [app.requireAttendee, app.requireEventAccess]`, each with a `schema` block (contracts/agenda-api.md)
- [ ] T014 Append `agendaRoutes` to `ROUTES` in `apps/api/src/routes/index.ts` — append only, do not reorder, do not touch `app.ts` (FR-235)
- [ ] T015 Regenerate `contracts/openapi.json` and confirm `pnpm contract:check` passes; a route without a `schema` block is silently absent from the contract rather than merely undocumented

### Router: destination owns its element (FR-233)

- [ ] T016 Add an optional `element` to `Destination` in `apps/web/src/app/navigation.ts`, and set Agenda's
- [ ] T017 Retire the literal `destination.path === '/agenda'` branch in `apps/web/src/app/routes.tsx`, rendering `destination.element ?? <DestinationPlaceholder …>` instead
- [ ] T018 Prove the change is behaviour-neutral: the existing routing tests in `apps/web/tests/unit/` and `apps/web/tests/component/` pass unchanged, with no test edited to accommodate it

**Checkpoint**: schema, query layer, repositories, routes and routing are in place. User stories can now proceed.

---

## Phase 3: User Story 1 — The attendee builds a personal agenda (P1) 🎯 MVP

**Goal**: save and unsave sessions from the programme, and filter to only those. Durable across
sign-out, device and conference switch.

**Independent Test**: sign in, save two sessions, switch the filter to Saved and see exactly those
two, sign out, sign in on a different browser, see them still saved.

### Tests for User Story 1

- [ ] T019 [P] [US1] Contract test for `GET`/`PUT`/`DELETE` on the saved-session routes in `apps/api/tests/integration/agenda-saved.test.ts`, including that `PUT` twice creates one row (FR-187)
- [ ] T020 [P] [US1] Component test: the save control toggles state and its accessible label changes with it, in `apps/web/tests/component/agenda-save-control.test.tsx` (FR-189)
- [ ] T021 [P] [US1] Component test: the filter shows only saved sessions, preserving venue-day grouping, in `apps/web/tests/component/agenda-filter.test.tsx` (FR-194)
- [ ] T022 [P] [US1] Component test: the Saved-filter empty state offers a way back to All, in `apps/web/tests/component/agenda-empty.test.tsx` (FR-195)
- [ ] T023 [US1] **Update 002's US2 scenario 6 test**, which asserts the *absence* of a save control on Agenda, in `apps/web/tests/component/agenda.test.tsx`. Update rather than delete, so history records the absence was deliberate and is now deliberately ended (FR-236)

### Implementation for User Story 1

- [ ] T024 [P] [US1] Add the save control to the session row in `apps/web/src/app/SessionPresentation.tsx` — accessible label reflecting state, visible focus, keyboard operable, touch-sized at 320px
- [ ] T025 [P] [US1] Implement the saved-set hook in `apps/web/src/app/agenda/useSavedSessions.ts`, reading through the repository and never the network directly (Principle V)
- [ ] T026 [US1] Add the All/Saved filter to `apps/web/src/app/destinations/Agenda.tsx`, defaulting to All, exposing its state accessibly (FR-193, FR-197)
- [ ] T027 [US1] Implement the Saved-filter empty state in `apps/web/src/app/agenda/SavedEmptyState.tsx` — an invitation to explore plus an action returning to All
- [ ] T028 [US1] **Replace the load-bearing read-only comment** in `apps/web/src/app/destinations/Agenda.tsx` with an accurate one; no stale statement that saving does not exist may remain (FR-237)
- [ ] T029 [US1] E2E: save → filter → sign out → sign in elsewhere → still saved, in `e2e/agenda-saved.spec.ts`
- [ ] T030 [US1] E2E: saves survive a conference switch away and back, each conference showing its own set, in `e2e/agenda-saved-scoping.spec.ts` (US1 scenario 5)

**Checkpoint**: US1 is a complete, shippable increment. Agenda is a personal schedule.

---

## Phase 4: User Story 2 — The attendee opens a session and reads its detail (P2)

**Goal**: an addressable detail panel with Overview and Speaker info, Escape, a real focus trap, and
focus restored to the opener.

**Independent Test**: open a session, confirm the address changes, press Escape, confirm focus
returns to the row that opened it; reload the panel's address directly and get the same session.

### Tests for User Story 2

- [ ] T031 [P] [US2] Component test: Escape closes the panel and focus returns to the opening control, in `apps/web/tests/component/session-panel-focus.test.tsx` (FR-202)
- [ ] T032 [P] [US2] Component test: focus stays within the panel while open, in `apps/web/tests/component/session-panel-trap.test.tsx`
- [ ] T033 [P] [US2] Component test: a session with no speakers says so, in wording distinct from a load failure, in `apps/web/tests/component/session-panel-speakers.test.tsx` (FR-201)
- [ ] T034 [P] [US2] Integration test: a session address outside the reader's active conference is refused without disclosing existence, in `apps/api/tests/integration/agenda-cross-event.test.ts` (FR-204)

### Implementation for User Story 2

- [ ] T035 [US2] Add the nested `:sessionId` child route under Agenda in `apps/web/src/app/routes.tsx`, using the `element` added in T016 (research D4)
- [ ] T036 [US2] Implement the panel as a native `<dialog>` with `showModal()` in `apps/web/src/app/agenda/SessionPanel.tsx` — top-layer, background inert, platform focus trap (research D3)
- [ ] T037 [US2] In `apps/web/src/app/agenda/SessionPanel.tsx`, route the dialog's `cancel` event to the same close path as the close button so the address updates identically either way
- [ ] T038 [US2] Restore focus explicitly to the opening control on close in `apps/web/src/app/agenda/SessionPanel.tsx`; `<dialog>` does not do this reliably across engines (FR-202)
- [ ] T039 [P] [US2] Render Overview — title, venue-local start and end, room, track, summary — in `apps/web/src/app/agenda/PanelOverview.tsx` (FR-200)
- [ ] T040 [P] [US2] Render Speaker info as its **own section**, so 009 can add a third without editing this one, in `apps/web/src/app/agenda/PanelSpeakers.tsx` (FR-206)
- [ ] T041 [US2] Handle cold load in `apps/web/src/app/agenda/SessionPanel.tsx`: the panel opens once the programme resolves, selecting from it rather than fetching the session separately (FR-203)
- [ ] T042 [US2] Refuse a cross-conference session address in `apps/web/src/app/agenda/SessionPanel.tsx`, with wording matching the server's, disclosing nothing (FR-204)
- [ ] T043 [US2] E2E: open → Escape → Back-button → cold load by address, in `e2e/session-panel.spec.ts` (FR-205)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — The attendee keeps personal notes (P3)

**Goal**: durable private notes, autosaved on pause, non-optimistically, never silently lost.

**Independent Test**: type a note, stop, watch the status resolve to saved, reload, read it back.

### Tests for User Story 3

- [ ] T044 [P] [US3] Contract test for the note routes in `apps/api/tests/integration/agenda-notes.test.ts`, including that over-length is rejected server-side independently of the client (FR-213)
- [ ] T045 [P] [US3] Component test: status **never reads Saved before the write resolves**, in `apps/web/tests/component/note-status.test.tsx` — the test that keeps this non-optimistic (FR-210, research D5)
- [ ] T046 [P] [US3] Component test: a failed write leaves the text on screen, distinguishes offline from server fault, and offers retry, in `apps/web/tests/component/note-failure.test.tsx` (FR-211)
- [ ] T047 [P] [US3] Component test: clearing the text removes the note; reopening shows empty, in `apps/web/tests/component/note-clear.test.tsx` (FR-212)
- [ ] T048 [P] [US3] Unit test: an out-of-order response cannot resurrect older status, in `apps/web/tests/unit/note-autosave.test.ts` (research D5)

### Implementation for User Story 3

- [ ] T049 [US3] Implement the notes repository methods in `packages/data/src/http/agenda-repository.ts`
- [ ] T050 [US3] Implement the autosave controller in `apps/web/src/app/agenda/useNoteAutosave.ts` — 1200 ms debounce, four-state machine, sequence-numbered writes, **status driven by the response and never by the keystroke** (research D5)
- [ ] T051 [US3] In `apps/web/src/app/agenda/useNoteAutosave.ts`, ensure an in-flight write is **not cancelled when the panel closes** — the request must outlive the component (US3 scenario 6)
- [ ] T052 [US3] Render the note editor and its status as the panel's third section in `apps/web/src/app/agenda/PanelNotes.tsx`, status announced rather than conveyed by colour alone
- [ ] T053 [US3] Surface the remaining-characters indication in `apps/web/src/app/agenda/PanelNotes.tsx` as the 10,000 limit approaches, so the limit is never learned from a rejected write (FR-213)
- [ ] T054 [US3] Confirm via `apps/web/src/app/agenda/PanelNotes.tsx` that a note can be written on a session that is **not** saved — noting and saving are independent (FR-207)
- [ ] T055 [US3] E2E: type → pause → saved → reload → read back → clear → gone, in `e2e/session-notes.spec.ts`

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 — The attendee reads their agenda with no signal (P4)

**Goal**: the programme, saved set and notes readable offline with a staleness stamp; writes refused,
never queued.

**Independent Test**: load online, go offline, reload, read everything with its retrieval time, and
confirm an attempted save is refused rather than appearing to succeed.

### Tests for User Story 4

- [ ] T056 [P] [US4] Unit test: an entry older than 24 hours is treated as absent, in `packages/platform/tests/local-cache.test.ts` (FR-221)
- [ ] T057 [P] [US4] Unit test: cache keys include the attendee, so a second sign-in on one device cannot read the first attendee's notes, in `packages/data/tests/cached-repository.test.ts` (research D10)
- [ ] T058 [P] [US4] Unit test: **two concurrent callers each receive their own promise**, so one caller's rejection does not fail the other, in `packages/data/tests/cached-independence.test.ts` (FR-222, SC-212)
- [ ] T059 [P] [US4] Component test: offline writes are refused with an explanation, displayed state unchanged, nothing queued, in `apps/web/tests/component/offline-writes.test.tsx` (FR-217)
- [ ] T060 [P] [US4] Component test: a never-read conference says a connection is needed and nothing is cached — not an empty programme, in `apps/web/tests/component/offline-uncached.test.tsx` (FR-219)

### Implementation for User Story 4

- [ ] T061 [P] [US4] Declare the `LocalCache` interface in `packages/platform/src/interfaces/local-cache.ts` — a browser capability, so it is reached through an interface, never directly (Principle V)
- [ ] T062 [US4] Implement it over IndexedDB in `packages/platform/src/web/local-cache.ts`; do **not** use `SecureStorage`, which the constitution forbids as a general cache (research D2)
- [ ] T063 [US4] Implement the caching decorator in `packages/data/src/http/cached.ts` — keyed `(attendeeId, eventId, resource)`, entries stamped with `retrievedAt` (research D1, D10)
- [ ] T064 [US4] In `packages/data/src/http/cached.ts`, purge a conference's entries on `RequestRefusedError`, and all of an attendee's on sign-out; the cache must never serve what the server has begun refusing (FR-221)
- [ ] T065 [US4] Wire the decorated repositories in `packages/platform/src/registry.tsx` — no component changes, because no component knows the cache exists
- [ ] T066 [US4] Render the staleness stamp on every cached surface as a time rather than a coloured badge, in `apps/web/src/app/agenda/StalenessStamp.tsx` (FR-216)
- [ ] T067 [US4] Distinguish "you are offline" from "a problem on our side" across `apps/web/src/app/agenda/` and `apps/web/src/app/home/cards/NextSavedSession.tsx`, matching 002's existing wording (FR-218)
- [ ] T068 [US4] E2E: online read → offline reload → read with stamp → refused write → back online → retry succeeds without reload, in `e2e/agenda-offline.spec.ts`

**Checkpoint**: the feature works where conferences actually are.

---

## Phase 7: User Story 5 — Nobody reads or writes another attendee's agenda (P5)

**Goal**: server-side isolation by identity and by conference, proven without the client.

**Independent Test**: as attendee B, attempt every saved-session and note operation using attendee
A's identifiers, and confirm each is refused server-side with nothing disclosed.

### Tests for User Story 5

- [ ] T069 [P] [US5] Integration test: attendee B cannot read or modify attendee A's saves or notes by any request, in `apps/api/tests/integration/agenda-isolation.test.ts` (FR-190, FR-208)
- [ ] T070 [P] [US5] Integration test: an attendee registered only for conference A is refused for conference B, with 403 and 404 indistinguishable in what they reveal, in `apps/api/tests/integration/agenda-event-isolation.test.ts` (FR-231)
- [ ] T071 [P] [US5] Integration test: deleting an attendee removes their saves and notes, proving the `ON DELETE CASCADE` that backs the declared retention commitment, in `apps/api/tests/integration/agenda-deletion.test.ts` (US5 scenario 5)
- [ ] T072 [US5] Confirm `apps/api/tests/unit/event-scope-audit.test.ts` fails the build for a route added without the guard, by adding an unguarded route temporarily and observing the failure, then removing it (FR-230)

### Implementation for User Story 5

- [ ] T073 [US5] Review every route in `apps/api/src/routes/events/agenda.ts` against `contracts/agenda-api.md`, confirming identity comes from the session and never from a client-supplied identifier (FR-227)
- [ ] T074 [US5] Confirm no client-side filtering is load-bearing: every test in `apps/api/tests/integration/agenda-*.test.ts` must pass against the server directly, not through the UI (FR-232)
- [ ] T075 [US5] Follow `apps/api/tests/integration/` conventions for isolation so the cached-ids-in-`beforeAll` coupling recorded in the idea inbox is not repeated

**Checkpoint**: the personal-data guarantees are enforced, not asserted.

---

## Phase 8: User Story 6 — Home gains a saved-session card (P6)

**Goal**: Home shows what is next from the sessions the attendee chose, as a card of this feature's
own, with nothing else on Home changed.

**Independent Test**: save a session later today, load Home, see it named — and confirm by diff that
no other feature's card file was touched.

### Tests for User Story 6

- [ ] T076 [P] [US6] Component test: all four states — next saved session today, none left today, nothing saved at all, failed — in `apps/web/tests/component/next-saved-session-card.test.tsx` (FR-225)
- [ ] T077 [P] [US6] Unit test: the registry still has at most one `lead` card after the append, in `apps/web/tests/unit/home-registry.test.ts`
- [ ] T078 [P] [US6] Component test: with this card forced to fail, every other card still renders and Home is not blank, in `apps/web/tests/component/home-card-independence.test.tsx` (SC-212)

### Implementation for User Story 6

- [ ] T079 [US6] Implement the card in `apps/web/src/app/home/cards/NextSavedSession.tsx`, calling the repositories **itself** and reading nothing from `UpNext` (FR-226, research D8)
- [ ] T080 [US6] Scope it to the venue's current day, so it never renders a later day's session as if it were today's — reusing `nextSession`/`venueDateOf` from `apps/web/src/app/sessions.ts` (FR-224, FR-225)
- [ ] T081 [US6] Append **exactly one line** to `apps/web/src/app/home/registry.ts`. Do not edit another card, do not reorder entries, do not touch `HomeShell` (FR-226, SC-208)
- [ ] T082 [US6] Confirm SC-210 in `apps/web/tests/component/home-read-count.test.tsx`: Home issues no more conference-programme reads with this card present than without it, because the cache from Phase 6 serves the repeats

**Checkpoint**: all six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T083 [P] Accessibility sweep across Agenda, the filter, the save control and the panel — labels, visible focus, keyboard operability, Escape — via `pnpm test:a11y` (Principle IV, Principle IX)
- [ ] T084 [P] Responsive verification of `apps/web/src/app/destinations/Agenda.tsx` and `apps/web/src/app/agenda/SessionPanel.tsx` at 320px, tablet and desktop, in `apps/web/tests/component/agenda-responsive.test.tsx`: no horizontal scrolling of Agenda, filter or panel; panel full-width at mobile; touch targets not crowding the row (SC-211)
- [ ] T085 [P] Confirm every Feature Declarations row in `spec.md` traces to at least one task above; an obligation without a task is presumed unmet (Principle IX)
- [ ] T086 [P] Run `quickstart.md` end to end and correct any step that does not match the built feature
- [ ] T087 Verify `pnpm verify:clean` passes against a clean database
- [ ] T088 **Confirm the CI position before opening the PR.** Register entry 17 requires the red pipeline waived or closed before 005 merges. If `NEON_API_KEY` is still unset, `test-integration` — which is where T069–T071 live — will be *skipped*, and a skip is not a pass under Principle VII. Check with `gh pr checks <n>` and record a waiver naming the unsatisfied checks on the PR, or stop
- [ ] T089 Update `brainstorm/00-overview.md`: mark 005 shipped, move its settled design questions to resolved, and record what the feature closed

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies. **Do it first**: it makes FR-230's gate live before any route it guards exists.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks every user story.**
- **Phase 3–8 (Stories)** — all depend on Phase 2.
- **Phase 9 (Polish)** — depends on the stories being complete.

### Story dependencies

| Story | Depends on | Note |
|---|---|---|
| **US1** (P1) | Phase 2 | None. This is the MVP |
| **US2** (P2) | Phase 2, and T016 from Phase 2 | Independently testable |
| **US3** (P3) | Phase 2; the panel from US2 is where notes render | Can be built against a stub panel, but is naturally sequenced after US2 |
| **US4** (P4) | Phase 2 | Genuinely independent — the decorator changes no component |
| **US5** (P5) | Phase 2 | Independent; exercises the server directly |
| **US6** (P6) | Phase 2. **T082 only** needs US4's cache | The card itself works without it |

### Within each story

- Tests written first and **failing** before implementation.
- Schema → queries → routes → repositories → UI.
- Story complete before moving to the next priority.

### Parallel opportunities

- T009 ∥ T011 (interfaces and HTTP implementation, different files)
- All `[P]` test tasks within a story
- T024 ∥ T025; T039 ∥ T040; T061 is `[P]` against the US4 test tasks
- **US4 and US5 can run fully in parallel with each other** — one touches only `packages/`, the other only `apps/api/tests/`
- **Feature 006 can run in parallel with all of this**, which is what the Phase 2 append-only tasks protect

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Contract test for saved-session routes in apps/api/tests/integration/agenda-saved.test.ts"
Task: "Component test: save control label reflects state in apps/web/tests/component/agenda-save-control.test.tsx"
Task: "Component test: filter shows only saved in apps/web/tests/component/agenda-filter.test.tsx"
Task: "Component test: Saved empty state in apps/web/tests/component/agenda-empty.test.tsx"

# Then implementation, where files are disjoint:
Task: "Save control in apps/web/src/app/SessionPresentation.tsx"
Task: "Saved-set hook in apps/web/src/app/agenda/useSavedSessions.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. **Stop and validate**: Agenda is a personal schedule. Saves are durable across device and
   conference switch.
3. This is a genuine increment — it is what `requirements.md` means by *agenda management*.

### Incremental delivery

US1 → US2 → US3 → US4 → US5 → US6, each independently testable at its checkpoint.

**Note on the PR shape**: brainstorm #03 settled this as **one squash-merged pull request**, so these
checkpoints are validation points rather than merge points. Because `develop` is squash-merge only,
the per-phase commits do not survive into `develop` — the same limitation 002 recorded.

### Two things that are not optional

- **T023 changes a shipped test.** 002's US2 scenario 6 asserts the absence of a save control. It is
  planned work, not a surprise failure (FR-236).
- **T088 gates the merge.** The isolation suite in US5 is the personal-data guarantee, and it lives
  in the layer that CI currently skips. Under constitution v2.2.0 a skipped check has not passed.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every task names a file path. A task without one is not executable.
- Verify tests fail before implementing.
- Commit after each task or logical group.
- **Never** edit another feature's Home card, reorder registry entries, or add a write method to
  `CatalogRepository`.
