# Tasks: Conference Content Authoring

**Feature**: 014 · **Branch**: `spec/014-conference-content-authoring` · **Migration**: `0011`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Constitution**: **v5.2.0 — RATIFIED 2026-08-12**

> **T001 is unblocked.** v5.2.0 was ratified unchanged from the drafted text, so every requirement
> citing N1–N5 stands as written. The amendment gated the first line of code, as v3.1.0 gated 007's
> Phase 7, v3.2.0 gated 008, v3.3.0 gated 009 and v4.0.0 gated 013.
>
> ### T001–T105 are TRANCHE 1, merged to `develop` on 2026-08-14. The feature is still open.
>
> Brainstorm #11 rescoped 014 on 2026-08-12 from a parallel branch, after this list was written and
> largely executed. The owner decided on **2026-08-14** that 014 stays open and grows rather than
> being closed and succeeded, so **104 of 105 complete is tranche 1 complete, not the feature
> complete.** `spec.md`'s header carries the tranche-2 scope and what each part is blocked on.
>
> **No tranche-2 tasks are listed here, deliberately.** Two of its three outstanding rows are
> unblocked and could be planned today; writing tasks for them from a brainstorm alone would skip
> the requirements and the plan that every other phase of this project went through, and the third
> row cannot be planned at all until the client supplies a list. Tranche 2 gets its own planning
> pass, its own migration number, and its own discharge of the Feature Declarations rows.

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
| Constitution | **v5.2.0**, N1–N5 |
| New branded scope | `ConferenceAuthorityScope`, minted only by `requireConferenceAuthority` (R2) |
| Material change set | **cancelled, start time, room** — and nothing else (N1, FR-1026) |
| Dispatch caller | `routes/admin/catalog.ts` — **never `notifications/**`**, which the gate does not scan (R3) |
| Coalescing key | the audit entry id (R4) |
| Every refusal without a reason | **404**, from 013's single factory |
| Act + audit entry | **one transaction** (FR-1037). Dispatch is **outside** it |

---

## Interfaces

**An implementer sees only their own task.** These are the names and shapes crossing task
boundaries; every task producing or consuming one must use them exactly.

```ts
// apps/api/src/admin/require-conference-authority.ts   (T008–T009)
export type ConferenceAuthorityScope = VerifiedConferenceAuthority  // branded, class not exported
export const requireConferenceAuthority: (req, reply) => Promise<void>
export const conferenceAuthorityOf: (req) => ConferenceAuthorityScope

// apps/api/src/db/queries/admin-catalog.ts             (T013, T030–T032, T047–T050, T083–T084)
createTrack | createRoom | createSpeaker (scope, input, tx) => Promise<Row>
updateTrack | updateRoom | updateSpeaker (scope, id, input, tx) => Promise<Row>
deleteTrack | deleteRoom            (scope, id, tx) => Promise<void>   // 409 while referenced
createSession | updateSession       (scope, input, tx) => Promise<SessionRow>
deleteSession                       (scope, id, tx) => Promise<void>   // FOR UPDATE + engagement
cancelSession | reinstateSession    (scope, id, tx) => Promise<SessionRow>
engagementCountsFor                 (scope, id) => Promise<EngagementCounts>
patchConference                     (scope, input, tx) => Promise<EventRow>
createConference                    (operator, input, tx) => Promise<{ event, joinCode }>

// apps/api/src/db/queries/session-changes.ts           (T016, T068, T070)
export type MaterialChange = 'cancelled' | 'time' | 'room' | null
materialChangeOf   (before: SessionRow, after: SessionRow) => MaterialChange
hasEngagement      (sessionId, tx) => Promise<boolean>          // schema-derived (T016–T018)
attendeesToNotify  (actId: string) => Promise<{ attendeeId, sessionIds }[]>

export type EngagementCounts = { saved: number; notes: number; questions: number; votes: number }
```

The agenda payload gains **`cancelled: boolean`** and **`changedSinceViewed: boolean`** (T007,
T074). No new repository member is added — that is the point of R7.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: schema and generated artifacts. Nothing here is feature behaviour.

- [X] T001 *(unblocked — v5.2.0 ratified)* Move `apps/api/migrations/meta/README.md` aside before any generation — `drizzle-kit generate` JSON-parses every file in `meta/`, and that README explains why the journal lists `0003` before `0004`. Restore it after
- [X] T002 Add `cancelledAt`, `logisticsChangedAt` and `lastChangeActId` to `sessions` in `apps/api/src/db/schema/catalog.ts`, each with a header stating it is conference content and why it is stored rather than derived
- [X] T003 [P] Add `viewedAt` (`NOT NULL DEFAULT now()`) to `savedSessions` in `apps/api/src/db/schema/agenda.ts`, with a header stating **why the default is the save instant** — there is no `created_at` to compare against
- [X] T004 Add `sessions_event_cancelled_idx` and `saved_sessions_session_id_idx` in the same schema files, with a comment on the second naming the fan-out query it serves and the sequential scan it prevents
- [X] T005 Generate `apps/api/migrations/0011_conference_authoring.sql`, review the SQL by hand, and restore `meta/README.md`
- [X] T006 Run `pnpm db:migrate` against a scratch database and confirm `0011` applies cleanly on top of `0009`
- [X] T007 [P] Add `cancelled` and `changedSinceViewed` to the agenda payload types in `packages/data` so both clients compile against them before any route exists

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the guard, the write layer, the three schema-derived gates, and accountability.
**No user story can start until this phase completes.**

**⚠️ Contains the largest piece of new construction in the feature (T008–T012).**

### The fifth branded scope

- [X] T008 Create `apps/api/src/admin/require-conference-authority.ts` with `ConferenceAuthorityScope` — a branded class carrying operator id, tier and event id, **constructible only here**, mirroring `EventScope`, `ConversationScope`, `CardScope` and `VerifiedOperatorScope`
- [X] T009 Implement `requireConferenceAuthority` in the same file: platform tier passes for any conference, organizer passes only for an assigned one, **everything else 404 from 013's single factory**
- [X] T010 [P] Add `apps/api/tests/unit/conference-authority-brand.test.ts` — assert with `@ts-expect-error` that the scope cannot be constructed outside its module, so it fails the **typecheck** rather than the test run (013's precedent)
- [X] T011 [P] Add `apps/api/tests/unit/conference-authority-sole-importer.test.ts` — the minting function has exactly one caller, scanning `src/` **only**; a test fabricating a scope proves nothing about what a request can reach
- [X] T012 Add `apps/api/tests/integration/conference-authority.test.ts` — an organizer reaching an unassigned conference is **indistinguishable** from reaching one that does not exist (FR-1035, FR-1036, SC-1007)

### The write layer

- [X] T013 Create `apps/api/src/db/queries/admin-catalog.ts` per the Interfaces block — every function takes a `ConferenceAuthorityScope`, never a bare string. Header must state why the write path is **not** in `catalog.ts` (R1)
- [X] T014 Amend the header of `apps/api/src/db/queries/catalog.ts`: a write path now exists elsewhere, this file stays the attendee read path, and its `EventScope` signatures are unchanged
- [X] T015 Amend the header of `apps/api/tests/unit/catalog-read-only.test.ts` to state its subject is the attendee read path specifically. **Its assertions do not change** — `CatalogRepository` stays read-only in perpetuity, literally

### The engagement predicate

- [X] T016 Implement `hasEngagement` in `apps/api/src/db/queries/session-changes.ts` — covering `saved_sessions`, `session_notes`, `session_questions`, and `question_votes` **one hop** through `session_questions` (FR-1018a)
- [X] T017 Add `apps/api/tests/unit/engagement-coverage.test.ts` — derive from the Drizzle schema every table with a foreign key to **both** `sessions` and `attendees`, and fail when one is absent from the predicate. **Enumerate the one-hop case explicitly**; transitive closure sweeps in merely-reachable tables
- [X] T018 Verify T017 fails by adding a throwaway table to the schema, then remove it. **A gate that cannot fail is not a gate**

### Guard amendments

- [X] T019 [P] Amend `apps/api/src/db/seed/catalog.ts`'s header — "no write path and no import path at any privilege" is now false. State what is permitted and to whom
- [X] T020 [P] Amend `apps/api/tests/unit/notification-triggers.test.ts`: add `routes/admin/catalog.ts` to `DISPATCH_CALLERS`, and **record in the file why it is not under `notifications/`** — that directory is excluded from the scan, so a trigger placed there passes the gate written to catch it (R3)
- [X] T021 [P] Confirm `join-grants-nothing.test.ts` and `qa-absences.test.ts` need **no** change, and record that conclusion in `deviations.md` rather than leaving it silent
- [X] T022 Add `conference_create`, `session_write`, `session_cancel`, `session_delete`, `catalog_write` to `apps/api/tests/unit/throttle-actions.test.ts` and `throttle-thresholds.test.ts`, giving real thresholds to the first and third (FR-1039)

### Accountability — the defect 013 shipped once already

**⚠️ These three exist because `appendAuditEntry` took a transaction parameter from the start and no
caller passed one, so a failing entry left the act committed and unrecorded. It was 013's headline
post-review fix, guarded twice. 014 adds a whole new category of audited act.**

- [X] T023 Add `apps/api/tests/unit/authoring-audit-transactional.test.ts` — a **source assertion** that every authoring call to `appendAuditEntry` passes the caller's transaction, in the shape 013's equivalent uses. Comments stripped before matching (FR-1037)
- [X] T024 Add `apps/api/tests/integration/authoring-audit-rollback.test.ts` — a **behavioural** test forcing the audit insert to fail and asserting the act is gone. One per act category: catalog write, session write, cancel, delete, conference create (FR-1037, SC-1010)
- [X] T025 [P] Add `apps/api/tests/integration/authoring-audit-content.test.ts` — each entry records principal, conference, act, entity and instant (FR-1038); and re-assert **no read path over the audit trail** now a new act category exists (FR-999 survives from 013)

**Checkpoint**: guard, write layer, gates and accountability exist. User stories may begin.

---

## Phase 3: User Story 1 — Author the programme (Priority: P1) 🎯 MVP

**Goal**: an organizer builds tracks, rooms, speakers and sessions inside a conference they are
assigned to, and an attendee sees the result.

**Independent test**: add a track, room, speaker and session as an organizer; confirm they appear in
an attendee's Agenda with the right time, track, room and speaker.

**⚠️ No `DELETE` route is registered in this phase.** Deletion needs the engagement check and the
lock, which land in Phase 4 (T047, T051). Registering it here would expose an unguarded delete that
destroys attendee state — the reason this story is an increment rather than a releasable slice.

### Tests for User Story 1

- [X] T026 [P] [US1] Add `apps/api/tests/integration/authoring-programme.test.ts` — create, read and update each of tracks, rooms, speakers, sessions (FR-1001)
- [X] T027 [P] [US1] Add `apps/api/tests/integration/authoring-validation.test.ts` — session inside the conference's days **in venue-local time** (FR-1012), end after start (FR-1013), and **drive the day-range rule with the route bypassed** so the write path is not the only thing holding it (R9, 009's `trim()` lesson)
- [X] T028 [P] [US1] Add `apps/api/tests/integration/authoring-isolation.test.ts` — a session cannot reference a track or room from another conference (FR-1005)
- [X] T029 [P] [US1] Add `apps/api/tests/integration/platform-authoring.test.ts` — a **platform operator** authors a conference they hold no assignment for, with the same capability as an assigned organizer (FR-1002)

### Implementation for User Story 1

- [X] T030 [US1] Implement track, room and speaker writes in `apps/api/src/db/queries/admin-catalog.ts`, each act writing its audit entry **in the same transaction** (FR-1037)
- [X] T031 [US1] Implement `createSession` and `updateSession` in the same file, with day-range and end-after-start validation inside the transaction
- [X] T032 [US1] Implement `deleteTrack` and `deleteRoom` — **409 with a reason** while a session references either, because it describes the caller's own content (FR-1017)
- [X] T033 [US1] Create `apps/api/src/routes/admin/catalog.ts` with `GET /admin/conferences/:eventId/programme` and the **create and update** routes from `contracts/authoring.md` — **not the session `DELETE`**, which T051 adds once its guard exists. Every route behind `requireConferenceAuthority`, naming its conference in the path
- [X] T034 [US1] Register the routes in `apps/api/src/routes/admin/index.ts` — one line, per the append-only rule
- [X] T035 [P] [US1] Restrict track colour to the existing tokens in the API (FR-1004); reject anything else with a 400 naming the permitted set
- [X] T036 [P] [US1] Add `apps/admin/src/app/conferences/ProgrammeEditor.tsx` — the programme for one conference, with loading, empty and failure states
- [X] T037 [P] [US1] Add `apps/admin/src/app/conferences/SessionForm.tsx` with client-side validation mirroring the server's, and the server's explanation surfaced on refusal
- [X] T038 [P] [US1] Add `apps/admin/src/app/conferences/CatalogForms.tsx` for tracks, rooms and speakers — **track colour is a token picker, never a free colour input**
- [X] T039 [US1] Wire the programme editor into the admin shell's navigation from `ConferenceList.tsx`
- [X] T040 [P] [US1] Add `apps/admin/tests/component/programme-editor.test.tsx` — empty, loading and failure states, and the token-only colour control
- [X] T041 [US1] Same-room overlap **warns and does not refuse** (FR-1016): server returns the warning, client confirms
- [X] T042 [P] [US1] Add `apps/api/tests/unit/profile-uneditable.test.ts` — no administrative route edits a profile, and **no route leads from a speaker record to one** (FR-1006), comments stripped before matching

**Checkpoint**: an organizer can build a programme. **Not releasable alone** — see the warning above.

---

## Phase 4: User Story 2 — Change a live session without destroying attendee state (Priority: P2)

**Goal**: cancellation replaces deletion the moment anyone has engaged, and nothing anybody wrote is
lost.

**Independent test**: two attendees save a session, write notes, ask and upvote a question; cancel
it; confirm every record survives and the session reads as cancelled rather than missing.

### Tests for User Story 2

- [X] T043 [P] [US2] Add `apps/api/tests/integration/cancel-preserves-state.test.ts` — after cancellation, all four engagement records survive and are readable by their authors (FR-1021, SC-1003)
- [X] T044 [US2] Add `apps/api/tests/integration/delete-engagement-race.test.ts` — **the FR-1019a race**, against a real `postgres:17`: hold the delete transaction, attempt a concurrent save, assert the save blocks and no committed row is destroyed. Model it on 009's FR-714 test. **Serial: it holds a transaction**
- [X] T045 [P] [US2] Add `apps/api/tests/integration/delete-refusal.test.ts` — deletion refused with 409 and a reason for each of the four engagement kinds independently (FR-1018, FR-1019)
- [X] T046 [P] [US2] Add `apps/api/tests/integration/date-range-orphan.test.ts` — shrinking the conference refuses and **names the sessions** (FR-1014); the timezone is frozen once a session exists (FR-1015)

### Implementation for User Story 2

- [X] T047 [US2] Implement `deleteSession` in `admin-catalog.ts`: `SELECT … FOR UPDATE` on the session row **inside** the deleting transaction, then `hasEngagement`, then the delete (R6, FR-1019a)
- [X] T048 [US2] Implement `cancelSession` and `reinstateSession` — set and clear `cancelled_at` as **stored state** (FR-1020); **reinstatement dispatches nothing** (FR-1024)
- [X] T049 [US2] Implement `engagementCountsFor` — **counts only, no identity, no content** (FR-1025)
- [X] T050 [US2] Implement `patchConference` with the orphan check and the timezone freeze
- [X] T051 [US2] Add the cancel, reinstate, conference-`PATCH` **and session `DELETE`** routes to `routes/admin/catalog.ts` — the `DELETE` deliberately held back from T033 until its guard existed
- [X] T052 [P] [US2] Add `apps/admin/src/app/conferences/CancelDialog.tsx` — a native `<dialog>` with `showModal()`, **centred by the base rule in `theme/tokens.css` and not by a local `m-auto`**, Escape-dismissible, focus restored to the opener after closing
- [X] T053 [P] [US2] Present a cancelled session in MyNet's Agenda row and session detail panel (FR-1022)
- [X] T054 [US2] Teach `nextSession()` in `apps/web/src/app/sessions.ts` to skip cancelled sessions — **one change point**, serving both `UpNext` and `NextSavedSession` (R8, FR-1022a)
- [X] T055 [P] [US2] Confirm `RestOfDay` still lists cancelled sessions, marked — it renders the full list and must not inherit the skip
- [X] T056 [P] [US2] Let an attendee remove a cancelled session from their saved list (FR-1023)
- [X] T057 [P] [US2] Close the Q&A composer on a cancelled session; existing questions stay readable
- [X] T058 [P] [US2] Add `apps/web/tests/component/cancelled-session.test.tsx` — Agenda, panel and the Up-next skip (SC-1002)
- [X] T059 [P] [US2] Add `apps/api/tests/unit/no-attendee-state-disclosure.test.ts` — no administrative route reads a note, a message, or the identity of anyone who saved, questioned or voted (FR-1042)

**Checkpoint**: authoring is safe. **US1 + US2 is the first releasable slice.**

---

## Phase 5: User Story 3 — Be told when a saved session changes (Priority: P3)

**Goal**: the second notification trigger, and a marker that never becomes an inbox.

**Independent test**: save a session, cancel it as the organizer, confirm one notification arrives,
that activating it opens the session, and that the row carries a marker until viewed.

### Tests for User Story 3

- [X] T060 [P] [US3] Add `apps/api/tests/integration/material-change-dispatch.test.ts` — cancellation, start-time and room changes each dispatch (FR-1026); **title, summary, track and speaker changes dispatch nothing** (FR-1027, SC-1006)
- [X] T061 [P] [US3] Add `apps/api/tests/integration/dispatch-coalescing.test.ts` — one act changing four of one attendee's saved sessions produces **exactly one** notification carrying the count (FR-1034, FR-1034a, SC-1012)
- [X] T062 [US3] Add to that same file: two separate acts produce **two** notifications, never one (FR-1028b). **Serial — same file as T061**
- [X] T063 [P] [US3] Add `apps/api/tests/integration/dispatch-excludes-actor.test.ts` — an organizer who saved the session they are changing is not notified (FR-1028a)
- [X] T064 [P] [US3] Add `apps/api/tests/integration/dispatch-no-savers.test.ts` — a material change to a session **nobody saved** dispatches nothing (FR-1028). This is the boundary of the fan-out
- [X] T065 [P] [US3] Add `apps/api/tests/integration/dispatch-failure-isolation.test.ts` — a failing push leaves the act and its audit entry committed (007's precedent)
- [X] T066 [P] [US3] Add `apps/web/tests/unit/authoring-absences.test.tsx` and `apps/api/tests/unit/authoring-absences.test.ts` — no bell, no notification centre, **no aggregate count and no change list in either client** (FR-1031, SC-1009), comments stripped before matching
- [X] T067 [P] [US3] Add `apps/web/tests/component/push-denied-marker.test.tsx` — permission denied still shows the marker and leaves every other surface unchanged (FR-1032, SC-1005)

### Implementation for User Story 3

- [X] T068 [US3] Implement `materialChangeOf` in `session-changes.ts` — returns which of cancelled/time/room applies, or `null`. **This function is the scope of the second trigger**; its header must say so
- [X] T069 [US3] Set `logistics_changed_at` and `last_change_act_id` on a material change, inside the act's transaction
- [X] T070 [US3] Implement `attendeesToNotify` — sessions changed by this act → attendees who saved any of them, **excluding the acting principal** (R4)
- [X] T071 [US3] Dispatch from `routes/admin/catalog.ts` **after the transaction commits**, bounded by `dispatchPush`'s existing timeout, with failure logged and swallowed (R3)
- [X] T072 [US3] Build the single and coalesced payloads per `contracts/authoring.md` (FR-1029)
- [X] T073 [US3] Handle activation in `apps/web/src/sw.ts` — single opens the session, **coalesced opens Agenda and never a list of changes** (FR-1034b)
- [X] T074 [US3] Compute the marker in the agenda read as `logistics_changed_at > viewed_at`, **on the existing payload** — no new repository member, no new cached read (R7, FR-1030)
- [X] T075 [US3] Update `viewed_at` when the attendee opens the session; declare the write in the caching decorator's composition root, since a write purges the conference prefix
- [X] T076 [P] [US3] Render the marker on the Agenda row and Home, **as text and not by colour alone**
- [X] T077 [P] [US3] Add `apps/web/tests/unit/marker-not-cached.test.ts` — no repository member is added and `substitution.test.ts` is untouched; **no device capability**
- [X] T078 [US3] Add a timing assertion to `e2e/authoring.spec.ts` (T095) — a material change reaches a subscribed attendee **within one minute** (SC-1004). Measured against the sink adapter, so it needs no real push service

**Checkpoint**: the attendee half is complete.

---

## Phase 6: User Story 4 — Create a conference (Priority: P4)

**Goal**: both tiers create a conference; an organizer is assigned to what they create.

**Independent test**: create a conference as an organizer, confirm self-assignment, confirm the join
code registers an attendee, confirm no reach over any other conference.

### Tests for User Story 4

- [X] T079 [P] [US4] Add `apps/api/tests/integration/conference-create.test.ts` — creation by **both tiers** (FR-1007, FR-1008); the organizer is assigned in the **same transaction**
- [X] T080 [P] [US4] Add to that file: creating grants **no** authority over any other conference and **no** platform capability (FR-1010)
- [X] T081 [P] [US4] Add `apps/api/tests/integration/join-code-mint.test.ts` — the minted code is unique product-wide and works through MyNet's existing join flow (FR-1009, SC-1011)
- [X] T082 [P] [US4] Add `apps/api/tests/unit/no-conference-delete.test.ts` — no route deletes a conference at any tier (FR-1011)

### Implementation for User Story 4

- [X] T083 [US4] Implement `createConference` in `admin-catalog.ts` — conference, join code, organizer assignment and audit entry in one transaction
- [X] T084 [US4] Mint the join code with the same generator the seed uses; retry on the unique violation rather than pre-checking
- [X] T085 [US4] Add `POST /admin/conferences` behind `requireOperator` — **not** `requireConferenceAuthority`, because there is no conference yet
- [X] T086 [P] [US4] Add `apps/admin/src/app/conferences/CreateConferenceDialog.tsx`, centred by the base rule, Escape-dismissible, focus restored
- [X] T087 [P] [US4] Show the join code after creation so the organizer can distribute it
- [X] T088 [P] [US4] Add `apps/admin/tests/component/create-conference.test.tsx` — validation, failure state, and the code displayed on success

**Checkpoint**: all four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T089 [P] Add `apps/web/tests/unit/no-admin-surface.test.ts` — re-assert FR-1003 and SC-1008 now that MyNet has changed for the first time since 013. **The absence must be re-proved, not assumed still true**
- [X] T090 [P] Add `apps/api/tests/unit/no-derived-relationships.test.ts` — no contact, conversation or appointment derives from an authoring act (FR-1044)
- [X] T091 [P] Add `apps/api/tests/unit/no-session-start-trigger.test.ts` — nothing dispatches on a session starting (FR-1033)
- [X] T092 [P] Add `apps/api/tests/unit/no-draft-state.test.ts` — no draft or published column, no lifecycle gate (FR-1040)
- [X] T093 [P] Add `apps/api/tests/unit/no-attendee-restriction.test.ts` — no route suspends, removes or restricts an attendee (FR-1041)
- [X] T094 Add `apps/web/tests/unit/error-classification.test.ts` — every explained refusal renders **differently from the others** and from the reasonless 404. Branch on `error.code`, **never on the class**: `ApiError extends RequestRefusedError`, which is how 008 swallowed every message its routes wrote to be read
- [X] T095 [P] Add `e2e/authoring.spec.ts` — an organizer edits a programme in one browser profile while an attendee sees the result in another (host for T078's timing assertion)
- [X] T096 [P] Add dialog position assertions to `e2e/responsive.spec.ts` for `CancelDialog` and `CreateConferenceDialog` — measure the gap on either side. **A width assertion never looks at position**, which is how two dialogs shipped in the top-left corner
- [X] T097 [P] Run the accessibility gate over the programme editor and both new dialogs
- [X] T098 Re-run `pnpm db:seed` and confirm `assertDisjoint`'s two disjoint programmes and the deliberately empty third conference survive (FR-1043)
- [X] T099 Regenerate and commit the OpenAPI contract in `contracts/` now every route exists
- [X] T100 Run `pnpm verify` — all ten gates green *(run as `pnpm verify:clean` against a fresh database: 13/13 gates, 162 e2e)*
- [X] T101 Record deviations in `specs/014-conference-content-authoring/deviations.md`, including T021's no-change conclusion
- [X] T102 Extend the reserved-migration table in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` to cover both in-flight programmes — **wrong for two features running**
- [X] T103 Update `CLAUDE.md`: standing decisions 45–49, register entries 29 and 30, migrations run to `0011`, and the architectural invariants this feature establishes
- [X] T104 Walk `quickstart.md` scenarios 1–5 (machine-checkable)
- [ ] T105 Walk `quickstart.md` scenarios 6–9 **by hand, on a device** — notification, coalescing, denied permission, and the three widths plus a screen-reader pass. **Joins the outstanding walkthroughs from 007, 008, 009 and 013 rather than replacing them**

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** → no dependencies. T001 blocked on v5.2.0's ratification
- **Phase 2 (Foundational)** → depends on Phase 1. **Blocks every user story**
- **Phase 3 (US1)** → depends on Phase 2
- **Phase 4 (US2)** → depends on Phase 2, and **completes US1's route surface** (T051 adds the `DELETE` T033 held back)
- **Phase 5 (US3)** → depends on Phase 4 for `cancelled_at`, and on Phase 2 for the dispatch caller
- **Phase 6 (US4)** → depends on Phase 2 **only**. Genuinely independent of US1–US3: it needs no session, no cancellation and no dispatch
- **Phase 7 (Polish)** → depends on all

### User story dependencies

```
Phase 2 ──┬── US1 (P1) ── US2 (P2) ── US3 (P3) ──┐
          └── US4 (P4) ───────────────────────────┴── Phase 7
```

US3 is the only story with a hard dependency on another: it needs cancellation to exist. US1 and US2
are sequential in practice because US2 completes US1's route surface.

### Parallel opportunities

- **T003, T007, T010, T011, T019, T020, T021, T025** — Phase 1/2, different files
- **T026–T029** — all four US1 integration tests
- **T036, T037, T038** — three admin client files
- **T043, T045, T046** — US2 tests. **T044 is serial** (it holds a transaction)
- **T060, T061, T063–T067** — US3 tests. **T062 is serial** (same file as T061)
- **T079–T082** — all US4 tests
- **T089–T093, T095–T097** — the absence guards and e2e

### Within each story

Tests → query layer → routes → client → component tests.

---

## Parallel Example: User Story 3

```bash
# Seven independent test files, before implementation:
T060 material-change-dispatch    T061 dispatch-coalescing
T063 dispatch-excludes-actor     T064 dispatch-no-savers
T065 dispatch-failure-isolation  T066 authoring-absences (×2)
T067 push-denied-marker
# T062 waits on T061 — same file.

# Implementation is mostly serial: T068 → T069 → T070 → T071 → T072
# T076 and T077 parallelise once T074 lands.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

Phases 1 → 2 → 3 delivers an organizer who can build a programme that attendees see. **It is an
increment, not a releasable slice**: T033 deliberately withholds the session `DELETE` route until
Phase 4's guard exists, so US1 alone is *safe* but *incomplete* — an organizer cannot remove a
mistake.

### Incremental delivery

1. **Phases 1–4** — the first releasable slice. Authoring, and it cannot destroy anything.
2. **Phase 5** — the attendee learns. This is what needs v5.2.0 most directly.
3. **Phase 6** — new conferences.
4. **Phase 7** — the absences, the by-hand walk, and the documents that go stale otherwise.

### Delivered as one PR

Per brainstorm #10, matching 008, 009 and 013, each of which shipped its gating amendment and
implementation as one merge. The phase boundaries above are a **reading order for the reviewer**,
not a merge schedule — which is what 011's collapsed split turned out to be worth.

---

## Notes

- **105 tasks.** Setup 7, foundational 18, US1 17, US2 17, US3 19, US4 10, polish 17
- **T044 is the task most likely to be got wrong**, and the one with the least margin: the only
  property no layer above a real database can test. 009's FR-714 test is the model
- **T020 is the task most likely to be got wrong quietly** — the tidy placement for the new dispatch
  is the one the gate does not scan
- **T024 exists because this project has already shipped that defect once.** An audit entry that can
  fail without undoing its act is accountability theatre
- **T105 needs a person and a phone.** Everything else a machine can check

### Outcome

**104 of 105 done. T105 is outstanding** and joins the unwalked by-hand scenarios from 007, 008, 009
and 013 rather than replacing them.

**T094 was the task that earned its place**, and it was predicted to be routine. It found six
explained refusals sharing two error codes — 008's swallowed-message defect reproduced from the
opposite direction, by code that was obeying the rule 008 produced. See `deviations.md` D10.

**Three tasks were completed against a different file or client than the one they name**, each
recorded rather than quietly redirected: T094 (`apps/admin`, where 014's refusals are), T077 (asserts
*no new read* rather than *no member*), and T078 (times the attendee-visible arrival, because nothing
exposes the sink over HTTP). D11, D12 and D13.

**T100 found a gap older than this feature**: the local clean-verify runner has never been able to
pass the administrative end-to-end specs, because it supplies no `ADMIN_ORIGIN` and CI does. D16.

---

# Part II — Tranche 2 tasks (T106 onward)

**Added 2026-08-14.** T001–T105 above are tranche 1's, **merged to `develop` in PR #23**. These
continue the numbering and **must not renumber them**. Tranche 2 is the change that closes 014.

> ## ✅ PRECONDITION DISCHARGED — v5.3.0 RATIFIED 2026-08-14
>
> **Constitution v5.3.0 is RATIFIED.** It records the **fourth** Principle VIII privacy exception
> (O1, the named enrolment roster), the engagement exclusion (O2), the attendee-visible seat count
> (O3) and the migration-numbering change (O4).
>
> **Tranche 2 is licensed from T106**, exactly as T001 was once v5.2.0 was ratified. The precondition
> is left recorded rather than deleted: a gate that was never seen to be closed is one nobody can tell
> was checked.
>
> **O2's cost travels with the licence.** Deleting an optional session destroys held places with no
> notification, no marker and no trace. That is ratified, not overlooked — see T149, T151 and T212,
> and register entry 31.

## Global constraints — Tranche 2

These bind every task below and are not repeated per task.

- **Nothing time-driven.** No scheduler, no sweep, no background job. Enrolment-closing derives **in
  SQL against the database clock**. `no-session-start-trigger.test.ts`'s population predicate is
  `\.push\b`, which matches every `Array.prototype.push` — **fifteen files are already in scope**, so
  the constraint is on the **SQL text and naming**, never on where a file sits (R14).
- **No new repository.** The commitment set rides the **existing** saved-sessions payload with a
  `saved | place` discriminator. A new `EnrolmentRepository` is a silent staleness bug — only the
  repository owning the cached read can purge what an enrolment invalidates (R13).
- **`attendee_interests` and `listDirectory` are NOT touched** (R18).
- **Every guard amendment is a widening followed by a named exemption**, never a weakened pattern.
- **The migration is `0012`.** `0010` stays empty (R19).

---

## Phase 8: Setup — Tranche 2 (migration mechanics)

- [ ] T106 *(unblocked — v5.3.0 ratified 2026-08-14)* Move `apps/api/migrations/meta/README.md` aside before any generation — `drizzle-kit generate` JSON-parses every file in `meta/`. Restore it afterwards. Same trap as T001; it has not gone away
- [ ] T107 Add a fourth section to `apps/api/migrations/meta/README.md` recording **why `0010` stays permanently empty**: tranche 2 redefines the same named CHECK constraint `0011` drops and re-adds, so numbering it `0010` would order a dependent migration before its dependency (R19)
- [ ] T108 Extend the reserved-number table in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` in this same change — constitution O4 requires the claiming feature to extend it, and this is the fourth collision this project has had over a number
- [ ] T109 State the migration lock strategy in `specs/014-conference-content-authoring/data-model.md`: a `statement_timeout` on the migration connection, and any index build issued outside the wrapping transaction where the runner allows. Altering `sessions` takes `ACCESS EXCLUSIVE` on the table every attendee request touches

---

## Phase 9: Foundational — Tranche 2 (BLOCKING PREREQUISITES)

**Phase 9 blocks US5, US6 and US8 in full. It does NOT block US7 in full** — the taxonomy depends
only on T112, T114, T118 and T125–T127, and waiting on the events/sessions/enrolment schema or the
catalog/agenda/panel comment rewrites would lengthen the critical path for no dependency reason.

### Schema

- [ ] T110 [P] Add `modality` and `format` to `events` in `apps/api/src/db/schema/events.ts`, each with a header stating it is conference content. **Modality is controlled with no neutral default; format is descriptive and nothing may branch on it** (FR-1046, FR-1047, FR-1045)
- [ ] T111 Add `kind`, `capacity`, `enrolmentClosingOffsetHours` and `accessLink` to `sessions` in `apps/api/src/db/schema/catalog.ts`, and **make `roomId` nullable** (FR-1049, FR-1060, FR-1061, FR-1062, FR-1052)
- [ ] T112 Create `apps/api/src/db/schema/vocabulary.ts` — `sectors`, `subsectors`, `interestOptions`, each with `retiredAt`. **A new file rather than an addition to `profiles.ts`**, and one append-only export line in `schema/index.ts` (R17)
- [ ] T113 Add `sessionEnrolments` to `apps/api/src/db/schema/agenda.ts` — composite PK `(sessionId, attendeeId)`, `takenAt`, `viewedAt`, **and an explicit `index(sessionId)`**. PostgreSQL creates no index for a foreign key and the `count(*)` runs **inside the exclusive lock** (R12)
- [ ] T114 Add `sector`, `subsector`, `productiveActivity` and `company` to `attendee_profiles` in `apps/api/src/db/schema/profiles.ts`, **all nullable** — FR-336 holds and REQ-027 is not granted (FR-1097)
- [ ] T115 Generate migration `0012` and verify by reading it: `modality` back-filled **`in-person`** with the default **dropped in the same migration**, and `0010` left empty (FR-1048, R19)

### The comments this tranche falsifies

- [ ] T116 Rewrite `apps/api/src/db/schema/catalog.ts`'s "**Absent by design**: … no capacity, no attendance … not named by any requirement" — FR-1061 and FR-1063 name both. **Rewrite, do not delete**: the comment is the record
- [ ] T117 Rewrite `apps/api/src/db/schema/catalog.ts`'s "Speakers are the only optional part of a session's identity" — the room is now optional too (FR-1049)
- [ ] T118 Rewrite `apps/api/src/db/schema/profiles.ts`'s "A fixed taxonomy would be an organizer-authored artifact, and **Principle III puts that out of scope**" — v4.0.0 reversed that premise (FR-1088, FR-1096a)
- [ ] T119 [P] Rewrite `apps/api/src/db/schema/agenda.ts`'s "the fact that one attendee intends to attend one session" — saving is now one of two commitments (FR-1066a)
- [ ] T120 [P] Rewrite `apps/web/src/app/agenda/SessionPanel.tsx`'s "a fifth section the roadmap says will never arrive" — the enrolment control is that fifth section

### Guard amendments — each is a widening, then a named exemption

- [ ] T121 **Widen `apps/api/tests/unit/no-attendee-state-disclosure.test.ts` FIRST** — its noun denylist does not match `enrolments`, so a roster route ships green today. Add the noun, run the suite, and **confirm the roster route fails** before writing any exemption (R16)
- [ ] T122 Only after T121 fails as expected: add a **named enrolment exemption** to that guard, with a comment citing constitution O1 and stating that every other administrative read of attendee state must still fail. **Never widen the pattern to make the route pass** (R16, FR-1075)
- [ ] T123 Add the single `NOT_ENGAGEMENT` entry for `session_enrolments` in `apps/api/src/db/queries/session-changes.ts` — the key is the **snake_case table name**, and the reason must say **whose data it is and why losing it silently is acceptable**, cite v5.3.0 O2, state it is **not precedent for a second entry**, and name **register entry 31** (FR-1078, R15)
- [ ] T124 **Do NOT touch `ENGAGEMENT_TABLES`** and confirm the four-table equality pin never fires. Verify by running `apps/api/tests/unit/engagement-coverage.test.ts` and reading which assertion caught the new table (R15)
- [ ] T125 [P] Add `vocabulary.ts` to `apps/api/tests/unit/no-draft-state.test.ts`'s file list — a new schema file is **outside** its scope today, so a `status` column there would pass green (R17)
- [ ] T126 [P] Extend `PERSONAL_TABLES` reasoning in `apps/api/tests/unit/profile-uneditable.test.ts` — it is **hand-maintained, not schema-derived**, so a new attendee-side table would pass green. Record that, and keep interest selections on `attendee_interests` so no new personal table is created (R17, R18)
- [ ] T127 [P] Verify `packages/data/src/interfaces/administration.ts` contains no occurrence of the string `profile`, case-insensitively — the vocabulary interface must be named to avoid it (R17)
- [ ] T128 Document the **session-row lock and its ordering rule once, for all four callers** — enrolment, capacity reduction, kind change and the shipped delete — in `apps/api/src/db/queries/enrolments.ts`'s header. Any transaction locking more than one session row sorts by id first (R12)

**Checkpoint**: schema, migration, comments and guards are correct. User stories may begin.

---

## Phase 10: User Story 5 — Run a workshop with limited places (Priority: P1) 🎯 MVP

**Goal**: an organizer bounds a session's places; attendees take and release them; over-capacity is unreachable.

**Independent test**: capacity 2, three attendees from three profiles, concurrent. Exactly one of the contested pair fails, naming fullness. The organizer's roster names exactly the two who succeeded.

### Tests for User Story 5

- [ ] T129 [P] [US5] Add `apps/api/tests/integration/enrolment-capacity.test.ts` — **concurrent** attempts on the last place; assert no ordering produces more places than capacity (FR-1068, SC-1014)
- [ ] T130 [P] [US5] Add `apps/api/tests/integration/enrolment-refusals.test.ts` — assert the four refusals are **mutually different** from each other, not merely that each maps to some message (FR-1069a). This is the assertion 014's own recorded lesson says a per-code check would pass while checking nothing (SC-1015)
- [ ] T131 [P] [US5] Assert **already-enrolled resolves before full**, so a double-tap on a full session does not report `full` about a place the caller already holds (R12)
- [ ] T132 [P] [US5] Add `apps/api/tests/integration/enrolment-deadline.test.ts` — closing derives from start plus offset; a session moved later **re-opens** enrolment; an attendee already holding a place **keeps it** after closing (FR-1071, FR-1071b, FR-1071c, FR-1071a)
- [ ] T133 [P] [US5] Add `apps/api/tests/integration/capacity-reduction.test.ts` — lowering capacity below places held is **refused, naming how many are held**, and nobody is evicted (FR-1061a)
- [ ] T134 [P] [US5] Assert a kind change is refused while any save or place exists, **checked under the same lock** (FR-1065)

### Implementation for User Story 5

- [ ] T135 [US5] Create `apps/api/src/db/queries/enrolments.ts`. **The critical section is exactly three statements**: `SELECT … FOR UPDATE` on the session row, then `count(*)`, then the insert with `ON CONFLICT DO NOTHING … RETURNING`. **Not one CTE** — a sibling CTE's count reads the pre-lock snapshot and both writers compute the same stale value (R12)
- [ ] T136 [US5] Add the **advisory pre-check outside any transaction** — already enrolled, closed, obviously full — so the common refusals under a rush never take the exclusive lock. It decides nothing (R12)
- [ ] T137 [US5] Add the four refusal codes, **each distinct**: session full, enrolment closed, already enrolled, not an optional session (FR-1069)
- [ ] T138 [US5] Ensure a lock-wait timeout surfaces as a 500 and is **never** classified as `full` or `closed` — telling somebody a session is full when the server decided nothing is a settled outcome the client will render (R12)
- [ ] T139 [US5] Add a `session_enrol` throttle action bounding the rate that can produce a lock wait (R12)
- [ ] T140 [US5] Implement release-a-place; the place returns to availability immediately (FR-1067)
- [ ] T141 [US5] Add capacity and closing-offset fields to the session authoring form in `apps/admin/src/app/conferences/SessionForm.tsx`, present **only** on optional sessions (FR-1062a). Mind the remount key — every field inherits it
- [ ] T142 [US5] Implement the capacity-reduction refusal in `admin-catalog.ts`, reading the held count **inside the updating transaction with the session row locked** (FR-1061a, R12)
- [ ] T143 [US5] Implement the kind-change refusal under the same lock (FR-1065)

- [ ] T208 [US5] **Build the attendee-side commitment control** in `apps/web/src/app/SessionPresentation.tsx` — on an optional session it takes a place, on a mandatory one it saves, and there is exactly **one** control whose identity is determined by the session's kind (FR-1063, SC-1013)
- [ ] T209 [US5] Display **remaining places** beside that control, as **text** rather than colour or a bar alone, and omit it entirely where it cannot be read live rather than showing a stale figure (FR-1070, FR-1070b)
- [ ] T210 [P] [US5] Add `apps/web/tests/unit/commitment-exclusivity.test.tsx` asserting **no route exists** by which an optional session can be saved, so the "saved but holds no place" state is unreachable — and that the cost is presented rather than worked around (FR-1064, FR-1064a)

### The roster — the fourth privacy exception

- [ ] T144 [US5] Implement `GET /admin/conferences/:eventId/sessions/:id/enrolments` behind `requireConferenceAuthority`, projecting **names only** (FR-1073, O1)
- [ ] T145 [P] [US5] Add `apps/api/tests/integration/roster-bounds.test.ts` asserting all four bounds: only enrolment; only an assigned organizer; only that conference's sessions; and refusal identical to a conference that does not exist (FR-1073a, SC-1018)
- [ ] T146 [US5] Build `apps/admin/src/app/conferences/EnrolmentRoster.tsx`
- [ ] T147 [US5] Add the pre-enrolment notice telling the attendee their name becomes visible to that conference's organizers **before** they take a place — the only privacy exception the subject can decline by not acting (FR-1074)

### Deletion, and the confirmation that lies

- [ ] T148 [US5] Add a **separate held-places field** beside the four engagement counts — **never a fifth count**. `hasEngagement` has zero callers; `countEngagement`'s boolean is a sum, so adding places to it makes places-held sessions undeletable, which is the opposite of O2 (R15, FR-1077b)
- [ ] T149 [US5] **Fix `apps/admin/src/app/conferences/CancelDialog.tsx` so it stops asserting nothing is attached** when places are held. It must state the number held, that those attendees **will not be notified and their rows carry no marker**, that nothing survives to explain the absence, and that cancellation is the preserving alternative (FR-1077c — the Critical review finding, FR-1077, FR-1077a)
- [ ] T150 [US5] Re-read the held-places figure **inside the deleting transaction under the same lock**, refusing and re-presenting if it has risen since the organizer was shown it (FR-1077b)
- [ ] T151 [P] [US5] Add `apps/admin/tests/unit/cancel-dialog-copy.test.tsx` asserting the confirmation **never** claims nothing is attached to a session with places held (SC-1025)

### Withdrawal and deletion release places

- [ ] T152 [US5] Release enrolments in `withdrawFromConference` in `apps/api/src/db/queries/account.ts` — **nothing cascades from a registration** and that gap is invisible in the schema (FR-1081)
- [ ] T153 [P] [US5] Assert account deletion releases every place, and that `deletion-coverage` and `export-coverage` both pass with the enrolment declared (FR-1081a)

**Checkpoint**: User Story 5 is independently testable.

---

## Phase 11: User Story 6 — Be told when a session you hold a place in moves (Priority: P1)

**Goal**: a held place is notified on the same three material changes as a save.

**Independent test**: enrol, change the room as an organizer, confirm the same notification and the same per-row marker a saved session produces.

### Tests for User Story 6

- [ ] T154 [P] [US6] Add `apps/api/tests/integration/notify-enrolled.test.ts` — cancelled, start time and room each reach an attendee who holds a place and has **no saved row** (FR-1079, SC-1016)
- [ ] T155 [P] [US6] Assert the **mixed** attendee — one save and one place, both changed by one act — receives **exactly one** notification whose count is saves plus places (SC-1016a)
- [ ] T156 [P] [US6] Assert a title, summary, speaker, capacity, closing-offset or access-link change dispatches **nothing** (FR-1058, FR-1079a, FR-1099c)
- [ ] T157 [P] [US6] Assert **nothing time-driven dispatches**, over the source rather than by observing that nothing arrived (SC-1017, FR-1072, FR-1072a)
- [ ] T158 [P] [US6] Assert the **trigger set is still two and the material set still three** after the population widens — counting dispatching modules is not sufficient evidence (SC-1026)

### Implementation for User Story 6

- [ ] T159 [US6] Union enrolments into `attendeesToNotify` in `apps/api/src/db/queries/session-changes.ts`. This widens the **population**, not the trigger **set** — state that distinction in the header, because it is written down nowhere in the shipped product (FR-1079a)
- [ ] T160 [US6] Pin the material-change predicate's input to exactly the three N1 changes, asserted **over the source**, so a fourth logistics field admitted to it **fails by existing** (FR-1079a, R14)
- [ ] T161 [US6] **Reword shipped FR-1026, FR-1028 and FR-1030 in `spec.md` Part I** — FR-1028 says a session "no attendee has saved" dispatches nothing, which FR-1079 contradicts. Part I and Part II must not disagree inside one document (FR-1079b)
- [ ] T162 [US6] **Re-scope AND rename** the shipped `apps/api/tests/integration/dispatch-no-savers.test.ts` to cover "no saver and no holder of a place" — a guard written for one rule must not be mistaken for enforcement of the other (FR-1079b)
- [ ] T163 [US6] Carry the per-row marker onto held places, clearing via the shipped viewed route, which must stamp **whichever commitment** the attendee holds (FR-1080)
- [ ] T164 [US6] Ensure an organizer's own act does not mark their own row (FR-1080)

**Checkpoint**: User Story 6 is independently testable.

---

## Phase 12: User Story 7 — Describe what you do, and find people who match (Priority: P2)

**Goal**: a product-wide vocabulary, authored at platform tier; optional taxonomy fields on a profile.

**Independent test**: with lists empty, a profile completes and saves; a platform operator then adds a subsector and an interest and they become selectable with no deployment.

### Tests for User Story 7

- [ ] T165 [P] [US7] Assert a profile with **every** taxonomy field empty saves and leaves every destination usable (SC-1019, FR-1097)
- [ ] T166 [P] [US7] Assert a conference organizer **cannot reach** the vocabulary at all, and a platform operator can (SC-1020, FR-1091, FR-1091a)
- [ ] T167 [P] [US7] Assert **no administrative tier can write** an attendee's own selections, in Drizzle or raw SQL (FR-1093, FR-1093a)
- [ ] T168 [P] [US7] Assert a profile write **accepts every value the attendee already holds** — retained free text and retired values alike — and refuses only values neither held nor choosable (FR-1095b)
- [ ] T169 [P] [US7] Assert renaming a held vocabulary value is **refused**, offering retire-plus-create (FR-1094c)
- [ ] T170 [P] [US7] Assert `attendee_interests` has **no migration** and `listDirectory` is unchanged (R18, SC-1021)

### Implementation for User Story 7

- [ ] T171 [US7] Seed `sectors` with **Servicios, Comercio, Industria, Agro**; `subsectors` and `interestOptions` ship **empty** (FR-1086, FR-1085, FR-1085a, FR-1087)
- [ ] T172 [US7] Create `apps/api/src/db/queries/admin-vocabulary.ts` and `apps/api/src/routes/admin/vocabulary.ts` behind **`requirePlatformOperator`** — `requireConferenceAuthority` reads `:eventId` and 404s without one, so it cannot express product-wide authority at all (R20, FR-1089, FR-1090)
- [ ] T173 [US7] Implement retire-not-delete, and the **rename refusal** while any attendee holds the value (FR-1094, FR-1094c, FR-1094a, FR-1094b)
- [ ] T174 [US7] Enforce vocabulary membership **at the write in `writeOwnProfile`** — union the choosable set with what the attendee already holds. No foreign key, no mapping migration (R18, FR-1095b, FR-1095, FR-1095a)
- [ ] T175 [US7] Add the audit entries for vocabulary acts, committing **in the same transaction** as the act (FR-1089a, FR-994's rule)
- [ ] T176 [US7] Append `{ to: '/vocabulary', label: 'Vocabulary', platformOnly: true }` to `ADMIN_DESTINATIONS` in `apps/admin/src/app/shell/AdminShell.tsx` — tier-hiding already exists and needs nothing built (R20)
- [ ] T177 [US7] Build the vocabulary destination in `apps/admin/src/app/vocabulary/`, with an **empty-list state that invites authoring** rather than looking broken — the shipped condition (FR-1092)
- [ ] T178 [US7] Add the taxonomy fields to the attendee profile editor, presenting **held-but-unchoosable values as present and removable** (FR-1095b)
- [ ] T179 [US7] Show the company on the networking card when given, and **no empty company line** when not (FR-1096)
- [ ] T180 [US7] Join the productive-activity description to Discover's existing free-text search; **sector and subsector must not join it** (FR-1099d)

**Checkpoint**: User Story 7 is independently testable.

---

## Phase 13: User Story 8 — Run a virtual conference (Priority: P3)

**Goal**: modality governs whether a session carries a room or a link; both are correctable after creation.

**Independent test**: create a virtual conference, author a linked session with no room, correct the format afterwards, and confirm the attendee sees the link and no empty room line.

### Tests for User Story 8

- [ ] T181 [P] [US8] Assert every modality/field combination is unambiguously permitted or forbidden — in-person requires a room and forbids a link; virtual the reverse; hybrid requires at least one and **never both** (FR-1050, FR-1050a)
- [ ] T182 [P] [US8] Assert a direct in-person→virtual change is refused and that **hybrid is the reachable route** (FR-1059a)
- [ ] T183 [P] [US8] Assert the modality refusals are **mutually different** (FR-1050b)
- [ ] T184 [P] [US8] Assert only `https:` links are accepted and that `javascript:` and `data:` are refused **by name** (FR-1053)
- [ ] T185 [P] [US8] Assert clearing an access link is refused while any place or save exists (FR-1058a)
- [ ] T186 [P] [US8] Assert conference **creation** refuses without an explicit modality, with its own code (FR-1059b)
- [ ] T187 [P] [US8] Assert neither product renders a session summary as clickable markup — over markdown, autolinking and any raw-HTML path (FR-1054)

- [ ] T211 [P] [US8] Assert there is **no timed release, per-attendee gating or reveal condition** on an access link — withholding it until a session starts needs either a lifecycle state or a scheduler, and this feature adds neither (FR-1056)

### Implementation for User Story 8

- [ ] T188 [US8] Implement the modality/room/link validation and its distinct refusal codes (FR-1050, FR-1050a, FR-1050b)
- [ ] T189 [US8] Implement `https:`-only access-link validation. **Never fetch the link to check it** — that is a server-side request to a URL a promoted attendee typed (FR-1053)
- [ ] T190 [US8] Extend the conference update path to accept modality and format, and **build the conference editor** in `apps/admin/src/app/conferences/ConferenceEditor.tsx` — the update path has no caller today, so a value set at creation is currently uncorrectable (FR-1059, SC-1023)
- [ ] T191 [US8] Add modality to conference creation and reword shipped FR-1007's field list in the same change (FR-1059b)
- [ ] T192 [US8] Tell the organizer, where they type it, that an access link is **published immediately** to everyone holding the join code (FR-1055)
- [ ] T193 [US8] Present the link on the attendee's session view; derive in-person/virtual from what the session carries rather than storing it (FR-1051, SC-1022)

**Checkpoint**: User Story 8 is independently testable. **All user stories complete.**

---

## Phase 14: Polish & Cross-Cutting Concerns

- [ ] T194 **Rename the All/Saved filter and the Home card**, and rewrite the saved-filter empty state and the commitment-write refusal wording — every attendee-visible string asserting a commitment is a *save* must be made true of both commitments (FR-1066a)
- [ ] T195 Add `apps/web/tests/unit/commitment-copy.test.tsx` which **READS prose rather than stripping it**, following 016's `card-model-record` precedent, and exempts explicitly-marked historical notes by paragraph (FR-1066a)
- [ ] T196 Grow the saved-sessions payload to carry the `saved | place` discriminator, and **rename the repository** — no new repository member for the commitment set (R13, FR-1066)
- [ ] T197 Declare remaining places a **live `passThrough`** read in `apps/web/src/app/services.ts`; the commitment set stays **cached**. The two are deliberately opposite (FR-1070b, R13)
- [ ] T198 Make the Home card that composes the attendee's own programme read places as well as saves. "Up next" and the rest-of-day timeline need **no change** and must not be cited as discharging this (FR-1066)
- [ ] T199 [P] Add `apps/admin/tests/unit/admin-destinations-mirror.test.ts` — the e2e `ADMIN_DESTINATIONS` list has **no mirror test**, so a fifth destination can be added and silently omitted from the accessibility and overflow sweeps while everything stays green (R20)
- [ ] T200 [P] Assert the tranche-2 absences: no waitlist, no automatic enrolment, no attendance or check-in record, no administrative enrolling on somebody's behalf, no record of access-link use (FR-1082, FR-1083, FR-1084, FR-1076, FR-1057)
- [ ] T201 [P] Assert no view in either product presents a count of **changes**, and that the permitted **remaining-places** count is kept distinct from it (SC-1024, FR-1070a)
- [ ] T202 [P] Add e2e coverage for quickstart scenarios 10–13 in `e2e/`, two browser profiles
- [ ] T212 Rewrite `apps/admin/src/app/conferences/CancelDialog.tsx`'s header comment claiming the product **has no route that would** identify anybody — FR-1073 makes it false. **FR-1025 is narrowed by name, not contradicted**: it survives unnarrowed for saves, notes, questions and votes (FR-1075a)
- [ ] T213 [P] Declare deletion and export coverage for the taxonomy: an attendee's **chosen** sector, subsector, activity and company are attendee data and export with the profile; the **vocabulary** is reference data needing a `NOT_EXPORTED` entry with a stated reason. **Nothing survives a deletion de-attributed** (FR-1098)
- [ ] T214 Decide and implement Discover's filter options for controlled values — the accumulate-what-you-have-seen design exists because a conference-wide list would disclose the population shape, and a **closed vocabulary is not population data**. State the outcome either way rather than leaving it ambiguous, and assert the row's absences (FR-1099, FR-1099a, FR-1099b)
- [ ] T203 Regenerate and commit the OpenAPI contract now every route exists
- [ ] T204 Update `CLAUDE.md` — standing decisions 50–53, register entry 31, and the tranche-2 invariants
- [ ] T205 Record any deliberate deviation in `specs/014-conference-content-authoring/deviations.md`, following D14's rule that "scoped deliberately" and "weakened until it passed" are indistinguishable in a diff
- [ ] T206 Walk `quickstart.md` scenarios 10–13 by hand
- [ ] T207 **Walk scenarios 14–17 by hand — needs a person and a phone.** The roster, a virtual conference, the vocabulary empty then filled, and the three widths plus a screen-reader pass. **This joins the unwalked scenarios from 007, 008, 009, 013, 014 tranche 1 and 016**

---

## Dependencies & Execution Order — Tranche 2

### Phase dependencies

- **Phase 8 (setup)** → **Phase 9 (foundational)** → user stories → **Phase 14 (polish)**
- Phase 9 **blocks everything**. Schema, migration, the falsified comments and the guard amendments must all land first
- **T121 must fail before T122 is written.** An exemption written before the widening is a decorative constant beside a check that never fires (R16)

### User story dependencies

- **US5 (P1)** — depends only on Phase 9. **This is the MVP**
- **US6 (P1)** — depends on US5, because there is no held place to notify about until enrolment exists
- **US7 (P2)** — depends only on Phase 9. **Fully parallel with US5 and US6** — it shares no file with them
- **US8 (P3)** — depends only on Phase 9. Parallel with all three

### Parallel opportunities

- T110, T111, T114 — three schema files, no overlap
- T116–T120 — five comment rewrites in five files
- All `[P]` test tasks within a story
- **US7 and US8 can run alongside US5/US6 entirely.** The taxonomy touches `profiles.ts`, `vocabulary.ts` and the admin vocabulary destination; the event model touches `events.ts`, `catalog.ts` and the conference editor; enrolment touches `agenda.ts` and `enrolments.ts`

### MVP scope

**Phase 8 + Phase 9 + Phase 10 (US5).** That delivers a bounded, race-safe optional session with a roster — the row that motivated the tranche. **US6 should follow immediately**, because enrolment without it is a trap: enrolling replaces saving, so a place-holder would be the only person told nothing when the room changed.
