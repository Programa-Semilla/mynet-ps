---
description: "Task list for 008 — Network: contacts, exchanged cards, and appointments"
---

# Tasks: Network — Contacts, Exchanged Cards, and Appointments

**Input**: Design documents from `/specs/008-network-and-appointments/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/network.md](./contracts/network.md),
[quickstart.md](./quickstart.md)

**Tests**: **included and not optional here.** Principle VII requires ten correctness gates, and
three of this feature's guarantees are *only* expressible as tests — the third route audit, the
coverage classification that fails by existence, and the availability-privacy properties (SC-605 and
SC-608a, which read alike and guard opposite failures).

**Organization**: grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task serves

---

## ⚠️ Blocking precondition, before Phase 1

The owner ruled on 2026-08-10 that register entries 7 and 8 close by **constitution amendment**
(v3.2.0). **That amendment now travels in this same branch and pull request**, at the owner's
direction — the governance and the specification it authorises are reviewed together rather than in
two PRs.

The precondition therefore becomes a review-order obligation rather than a merge-order one: **the
amendment must be approved as part of this PR**, and nothing here is licensed by an amendment a
reviewer has not accepted.

- [ ] T001 Confirm `.specify/memory/constitution.md` on this branch reads **Version: 3.2.0** and
      contains the "Networking relationships and appointments" and "Audience questions" sections
      (satisfied by the governance merge; re-check after any rebase, which is when it could be lost)

---

## Phase 1: Setup

**Purpose**: nothing to install. This feature adds **no dependency** — no package, no vendor, no
external service — which is worth confirming rather than assuming.

- [ ] T002 Verify `pnpm install && pnpm start --reset` brings up a clean database; `--reset` is
      required at least once because migration `0007` seeds the slot grid (quickstart.md)
- [ ] T003 [P] Move `apps/api/migrations/meta/README.md` aside before any `drizzle-kit generate`,
      and restore it after — `generate` JSON-parses every file in `meta/`
- [ ] T004 [P] Confirm the journal's deliberate `0003`/`0004` ordering is untouched after any
      regeneration, per `apps/api/migrations/meta/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: everything every user story needs. **No story may start until this phase completes.**

### Schema and migration `0007`

- [ ] T005 [P] Create `shared_cards` schema in `apps/api/src/db/schema/cards.ts` — cross-event,
      with `sharer_id`/`recipient_id` both `ON DELETE CASCADE`, `event_id` as a historical fact,
      and `shared_at` (FR-605)
- [ ] T006 [P] Add `unique (sharer_id, recipient_id)` and `check (sharer_id <> recipient_id)` in
      `apps/api/src/db/schema/cards.ts` (FR-604, FR-606)
- [ ] T007 Document in `apps/api/src/db/schema/cards.ts` **why there is no ordered-pair
      normalisation** — `conversation_pairs` normalises because a conversation is symmetric; a card
      is directional, and copying that trick would make a reciprocal exchange impossible
      (data-model.md)
- [ ] T008 [P] Create `meeting_slots` schema in `apps/api/src/db/schema/appointments.ts` —
      per-event, `starts_at`/`ends_at` as absolute instants, `unique (event_id, starts_at)`
- [ ] T009 Create `appointments` schema in `apps/api/src/db/schema/appointments.ts` — per-event,
      both participant references `ON DELETE CASCADE`, status enum
      `pending|confirmed|declined|cancelled` (FR-630)
- [ ] T010 Add to `apps/api/src/db/schema/appointments.ts` the `check (btrim(topic) <> '')` and
      `check (proposer_id <> invitee_id)` constraints, plus the partial unique on
      `(proposer_id, slot_id)` where status is pending or confirmed (data-model.md)
- [ ] T011 Record in `apps/api/src/db/schema/appointments.ts` that **`lapsed` is deliberately NOT a
      stored status** — it is derived from the slot instant, which is what keeps this feature free
      of any scheduled job (FR-634)
- [ ] T012 Declare the event-scoping rule and its reason in **each** of the three new schema files:
      cards cross-event, appointments and slots per-event (standing decision 7 — neither rule is a
      default)
- [ ] T013 Register the new schemas in `apps/api/src/db/schema/index.ts`
- [ ] T014 Generate migration `apps/api/migrations/0007_network_and_appointments.sql` and review the
      emitted SQL by hand
- [ ] T015 [P] Add indexes on `shared_cards.recipient_id`, `shared_cards.sharer_id`,
      `appointments (event_id, proposer_id)`, `appointments (event_id, invitee_id)`, and
      `meeting_slots (event_id, starts_at)` in migration `0007`

### The card guard — this feature's core authorization decision

- [ ] T016 Create `apps/api/src/plugins/card-access.ts` with a nominal `CardScope` class carrying a
      `#private` field, unexported, mirroring `plugins/participation.ts`
- [ ] T017 Implement `requireHeldCard` in `apps/api/src/plugins/card-access.ts` — **directional**:
      it asks whether the reader holds a card *from* the named attendee, never the reverse
- [ ] T018 Make `requireHeldCard` refuse with **404**, indistinguishable from the card not existing
      (FR-616, FR-642) — a 403 would confirm two specific people exchanged
- [ ] T019 Document in `apps/api/src/plugins/card-access.ts` why a third module exists rather than a
      widened `participation.ts`: the predicate is directional where participation is symmetric, and
      007 already recorded why conflating predicates makes the failure message name the wrong
      requirement
- [ ] T020 Create `apps/api/tests/unit/card-audit.test.ts` — the **third** route audit, failing any
      route beneath `/cards` that lacks `requireHeldCard` (**FR-641**, SC-613). FR-641 is the
      requirement this whole guard exists to satisfy: a card route names no conference, so
      `event-scope-audit` walks past it and reports success
- [ ] T021 Match routes in `card-audit.test.ts` by **path shape** rather than parameter name, per
      the lesson recorded in `participation-audit.test.ts` — a gate keyed on a name is defeated by
      choosing another
- [ ] T022 Give `card-audit.test.ts` an allow-list requiring a **stated reason** per entry, matching
      the discipline in `participation-audit.test.ts` and `deletion-coverage.test.ts`
- [ ] T023 Correct the comment in `apps/api/src/plugins/participation.ts` that predicts *"008's
      appointments are the first feature that will inherit this"* — appointments are **per-event**;
      it is **cards** that are cross-event (research R1)
- [ ] T024 Correct the same prediction in `apps/api/tests/unit/participation-audit.test.ts`,
      including *"which are also cross-event and also two-party"*, and point it at
      `card-audit.test.ts`

### Coverage classification — the guards that fail by existence

- [ ] T025 Add `meeting_slots` to `NOT_ATTENDEE_DATA` in
      `apps/api/tests/unit/deletion-coverage.test.ts` **with a stated reason** (FR-654) — the test
      asserts every entry states one
- [ ] T026 Confirm `shared_cards` and `appointments` need **no** allow-list entry, because all four
      attendee references cascade; run `deletion-coverage.test.ts` to prove it rather than assuming
- [ ] T027 Extend `apps/api/tests/unit/export-coverage.test.ts` expectations for every new column on
      the two attendee-data tables
- [ ] T028 Confirm **no** `RETENTION_SWEEPS` entry is needed — every new row is cascade-reachable —
      and record that in the migration comment
- [ ] T029 Confirm **no column is added to `attendees`**, and that no attendee-authored field with
      its own audience is introduced anywhere; the contact line was withdrawn as a breach of
      standing decision 16 (FR-619, FR-620, FR-621, FR-622)

### Repository interfaces and wiring

- [ ] T030 [P] Create `packages/data/src/interfaces/cards.ts` in domain terms — share, list held,
      read one, list shared. **No revoke method** (FR-618, FR-650)
- [ ] T031 [P] Create `packages/data/src/interfaces/appointments.ts` — slots, propose, list, accept,
      decline, cancel
- [ ] T032 Export both from `packages/data/src/interfaces/index.ts`
- [ ] T033 [P] Implement `packages/data/src/http/cards.ts`
- [ ] T034 [P] Implement `packages/data/src/http/appointments.ts`
- [ ] T035 Add both repositories to `Repositories` in `packages/platform/src/interfaces/index.ts` —
      two lines, `registry.tsx` untouched
- [ ] T036 Confirm `apps/web/tests/unit/repository-casts.test.ts` still passes with no new unchecked
      cast

### Offline policy at the composition root

- [ ] T037 Wire the appointments repository through the `cached` decorator under `conferencePrefix`
      in `apps/web/src/app/services.ts` (FR-647)
- [ ] T038 Leave the cards repository **out** of the decorator and write the refusal as a comment
      **beside that member** in `apps/web/src/app/services.ts` (FR-648) — an omission looks
      identical to an oversight
- [ ] T039 Record in that comment that this **answers by refusal** the cache-key question 007
      deferred here, so no event-less key variant is needed (research R4)
- [ ] T039a Component test in `apps/web/tests/unit/` asserting **every write in this feature is
      refused offline and never queued** — share, propose, accept, decline, cancel (FR-649). The
      decorator gives this for free, which is exactly why it can be lost silently; nothing else
      verifies it
- [ ] T039b Establish the failure-state contract for this feature's surfaces: a **connectivity
      failure must be distinguishable from a server fault** (FR-657), and record the distinction
      once so T060, T106 and T113 all render it the same way

### Throttling

- [ ] T040 Add `card_share` and `appointment_propose` to `THROTTLE_ACTIONS` in
      `apps/api/src/db/schema/sign-in-attempts.ts` (FR-609, FR-638)
- [ ] T041 Give both thresholds `mayDeny: true` in `apps/api/src/auth/throttle.ts` (FR-638a) — the
      opposite of `reset_request` and `message_send`, because here the throttled action is the
      actor's own
- [ ] T042 Extend `apps/api/tests/unit/throttle-actions.test.ts` to assert both new actions have
      thresholds and that their `mayDeny` is deliberate

### Seed

- [ ] T043 Create `apps/api/src/db/seed/network.ts` seeding uniform 30-minute meeting slots across
      each event day, in venue time (FR-623, FR-624)
- [ ] T044 Register the new seed module in `apps/api/src/db/seed/index.ts` — its own file, no
      neighbour edited
- [ ] T045 Confirm **no route** creates, edits or deletes a slot, and assert that absence by test
      (FR-623, Principle III)

### Client foundation

- [ ] T046 Create `apps/web/src/app/destinations/Network.tsx` with the two-view shell
- [ ] T047 Append `element` and `children` to the **Network entry only** in
      `apps/web/src/app/navigation.ts` (FR-643a) — no neighbour's entry touched
- [ ] T048 Confirm Network's existing `purpose` string is already accurate and needs no correction,
      recording that in the entry comment as 006 and 007 each did
- [ ] T049 Code-split the Network destination per the established rule — it is not the workspace —
      and confirm `scripts/asset-budget.mjs` still passes

**Checkpoint**: schema, guard, audits, repositories, offline policy, throttle and seed all in place.
User stories may now proceed.

---

## Phase 3: User Story 1 — Keep someone you just met (P1) 🎯 MVP

**Goal**: sharing a card creates a durable contact for the recipient and nothing for the sharer.

**Independent test**: with two accounts at one conference, share from A and confirm B's Network
lists A while A's Network is unchanged.

### Tests for User Story 1

- [ ] T050 [P] [US1] Integration test in `apps/api/tests/integration/cards-share.test.ts`: sharing is
      one-directional — B gains a contact, A gains nothing (FR-602)
- [ ] T051 [P] [US1] Integration test: re-sharing is idempotent and **does not refresh `shared_at`**
      (FR-604)
- [ ] T052 [P] [US1] Integration test: sharing with yourself is refused (FR-606)
- [ ] T053 [P] [US1] Integration test: sharing with a non-co-attendee, a nonexistent attendee, and a
      non-discoverable attendee all produce the **same** 404 shape (FR-607)
- [ ] T054 [P] [US1] Contract test asserting `POST /cards` returns 201 first, 200 on repeat

### Implementation for User Story 1

- [ ] T055 [US1] Implement share and held-card queries in `apps/api/src/db/queries/cards.ts`
- [ ] T056 [US1] Implement `POST /cards` and `GET /cards/held` in `apps/api/src/routes/cards.ts`,
      guarded per T017 — server-side authorization on every read and write, never client-side
      filtering (FR-640)
- [ ] T057 [US1] Register card routes in `apps/api/src/routes/index.ts`
- [ ] T058 [US1] Resolve held cards against the sharer's **current** profile — no stored copy
      (FR-611)
- [ ] T059 [US1] Regenerate and commit `contracts/openapi.json`
- [ ] T060 [P] [US1] Build the contacts list in `apps/web/src/app/network/Contacts.tsx` with loading,
      empty and failure states per T039b; empty offers a route to Discover (FR-610, FR-617, FR-657)
- [ ] T061 [P] [US1] Add the share action to `apps/web/src/app/discover/AttendeeProfile.tsx`, in the
      action boundary 006 declared and left empty (FR-601)
- [ ] T062 [US1] Make the control's accessible name and its confirmation **both state whose card
      moves** (FR-603) — the most misreadable control in the feature
- [ ] T063 [P] [US1] Component test asserting the share control's accessible name names the sharer's
      card, not the recipient
- [ ] T064 [US1] Show the event and date of exchange on each contact (FR-615)

**Checkpoint**: US1 is independently demonstrable.

---

## Phase 4: User Story 2 — A relationship that outlives the conference (P1)

**Goal**: a contact survives event switching, the conference ending, and the contact going
undiscoverable.

**Independent test**: switch the reader to an event the contact is not registered for; then turn the
contact's discoverability off. The contact resolves in both cases.

### Tests for User Story 2

- [ ] T065 [P] [US2] Integration test in `apps/api/tests/integration/cards-durability.test.ts`: a
      held card resolves after the reader switches to an event the sharer is not in (FR-614)
- [ ] T066 [P] [US2] Integration test: the sharer turning discoverability off removes them from
      Discover and **not** from the holder's Network (FR-612, SC-602)
- [ ] T067 [P] [US2] Integration test: an edit to the sharer's profile is visible to the holder with
      no action by the holder (FR-611, SC-603)
- [ ] T068 [P] [US2] Unit test inspecting the resolution path to assert **verification state is
      never consulted** (FR-613) — verified by inspection, because no un-verify action exists, and
      the test exists to stop one being added as a second use of verification

### Implementation for User Story 2

- [ ] T069 [US2] Ensure the held-card query applies **no** discoverability condition and **no**
      verification condition in `apps/api/src/db/queries/cards.ts`
- [ ] T070 [US2] Ensure the query requires **no** shared current registration
- [ ] T071 [US2] Document standing consent at the query in `apps/api/src/db/queries/cards.ts` —
      discoverability governs being *found*, not being *remembered* — so a later reader does not
      "fix" the missing condition
- [ ] T072 [US2] Confirm the contacts list is **not** filtered by the active event anywhere on the
      client

**Checkpoint**: the durability promise standing decision 7 already made is now kept.

---

## Phase 5: User Story 3 — Propose a meeting (P1)

**Goal**: a compact scheduling dialog over the event's slot grid, disclosing nothing about the
invitee.

**Independent test**: confirm the control is disabled until slot and topic are present, send a
proposal, and see it pending for both.

### Tests for User Story 3

- [ ] T073 [P] [US3] Integration test in `apps/api/tests/integration/appointments-slots.test.ts`:
      offered slots exclude the reader's saved sessions, sent pending proposals, and confirmed
      appointments (FR-625)
- [ ] T074 [US3] **SC-605 measurement test** — the privacy half: for a fixed reader, the offered set
      is byte-identical regardless of the invitee's saved sessions and appointments (FR-626). This
      is the Principle VIII property, asserted by comparison
- [ ] T075 [P] [US3] **SC-608a measurement test** — the anti-griefing half, which is a *different*
      guarantee: a **received** proposal removes no slot from the invitee, so no attendee's
      availability can be reduced by another attendee's action (FR-625). Keep T074 and T075
      distinct; they read alike and protect against opposite failures
- [ ] T076 [P] [US3] Integration test: proposing while blocked is refused with a **reasonless** 409
      (FR-637)
- [ ] T077 [P] [US3] Integration test: whitespace-only topic is refused server-side (FR-629 backstop)
- [ ] T078 [P] [US3] Component test: the confirm control is **disabled**, never a post-submit error
      (FR-629)
- [ ] T079 [P] [US3] Component test: the no-slots state shows an explanation and a close action and
      offers no selection (FR-627)
- [ ] T080 [P] [US3] Accessibility test: Escape closes the dialog and focus returns to the opener
      **after** closing (FR-655)

### Implementation for User Story 3

- [ ] T081 [US3] Implement the availability query in `apps/api/src/db/queries/appointments.ts` as
      **one query whose every input is reader-keyed** (research R10)
- [ ] T082 [US3] Record at that query why an invitee-derived input is forbidden — it leaks their
      Agenda by omission — so the property is defended in prose as well as in test
- [ ] T083 [US3] Implement propose in `apps/api/src/db/queries/appointments.ts` (FR-628)
- [ ] T084 [US3] Create `apps/api/src/routes/events/appointments.ts` **beneath `:eventId`**, guarded
      by `requireEventAccess`
- [ ] T085 [US3] Record at the route registration that the nesting is a **security** decision:
      `/appointments/:id` would name no conference and `event-scope-audit` would silently pass it
- [ ] T086 [US3] Add the participant condition inside the query, returning 404 rather than 403
      (FR-636)
- [ ] T087 [US3] Regenerate and commit `contracts/openapi.json`
- [ ] T088 [P] [US3] Build the scheduling dialog in `apps/web/src/app/network/ScheduleDialog.tsx` as
      a native `<dialog>` with `showModal()`
- [ ] T089 [US3] Render slots in **venue time**, following 002's clock rule (FR-624)
- [ ] T090 [US3] Wire the schedule action from the contact and from the Discover profile
- [ ] T091 [US3] Hide the schedule action entirely for a contact not registered for the active
      event (FR-639a) — absence, not a refusal after the fact

**Checkpoint**: a proposal can be made, and availability provably discloses nothing.

---

## Phase 6: User Story 4 — Answer a proposal (P1)

**Goal**: accept, decline, cancel — and refuse an acceptance that would double-book the invitee.

**Independent test**: accept from the second account and see a confirmed appointment; decline
another and see the slot return to the proposer.

### Tests for User Story 4

- [ ] T092 [P] [US4] Integration test in `apps/api/tests/integration/appointments-answer.test.ts`:
      accept confirms for both parties (FR-631)
- [ ] T093 [P] [US4] Integration test: decline frees the slot **for the proposer only**, who was the
      only party it was unavailable to (FR-633)
- [ ] T094 [P] [US4] Integration test: cancelling a confirmed appointment frees the slot **for both**
      (FR-633)
- [ ] T095 [US4] Integration test for FR-633a: acceptance is refused when the invitee has since
      acquired a conflict, and the message describes **the invitee's own schedule** without naming
      the proposer's
- [ ] T096 [P] [US4] Integration test: only the invitee may accept or decline; a proposer attempting
      it is refused (FR-635)
- [ ] T097 [P] [US4] Integration test: a third party requesting the appointment gets a response
      indistinguishable from one that does not exist (FR-636)
- [ ] T098 [P] [US4] Integration test: a proposal whose slot has passed is reported **lapsed** and
      cannot be accepted (FR-634)
- [ ] T099 [P] [US4] Unit test asserting `lapsed` is **derived**, never stored, and that no
      scheduled sweep exists for it

### Implementation for User Story 4

- [ ] T100 [US4] Implement accept, decline and cancel in `apps/api/src/db/queries/appointments.ts` —
      cancel is available to **either** party on a confirmed appointment (FR-632)
- [ ] T101 [US4] Implement the FR-633a conflict check at acceptance, with the reason-carrying 409
      that describes only the reader's own schedule
- [ ] T102 [US4] Record beside it why **this** 409 carries a reason while the block 409s do not — it
      is a fact about the reader, told to the reader
- [ ] T103 [US4] Derive `lapsed` in the read path from the slot instant (FR-634)
- [ ] T104 [US4] Add the accept, decline and cancel routes in
      `apps/api/src/routes/events/appointments.ts`
- [ ] T105 [US4] Regenerate and commit `contracts/openapi.json`
- [ ] T106 [P] [US4] Build the appointments view in `apps/web/src/app/network/Appointments.tsx` with
      loading, empty and failure states per T039b (FR-657)
- [ ] T107 [US4] Route decline and cancel through the shared `ConfirmDialog`, **not** a second modal
      over the scheduling one (FR-656) — restore focus *after* closing, because an inert element
      cannot take it
- [ ] T108 [P] [US4] Component test asserting no second modal is opened over the first

**Checkpoint**: the core journey completes end to end.

---

## Phase 7: User Story 5 — Know what is waiting, from Home (P2)

**Goal**: Home surfaces confirmed appointments and proposals awaiting an answer.

**Independent test**: with one of each on the active event, load Home and see both; break the card's
source and confirm the rest of Home renders.

### Tests for User Story 5

- [ ] T109 [P] [US5] Component test: the card lists confirmed appointments chronologically (FR-644)
- [ ] T110 [P] [US5] Component test: a proposal awaiting the reader is visibly distinct and offers a
      route to answer it (FR-645)
- [ ] T111 [P] [US5] Component test: the card's failure state leaves every other Home card rendered
      (FR-646, SC-607)
- [ ] T112 [P] [US5] Component test: the card's own empty state

### Implementation for User Story 5

- [ ] T113 [US5] Create `apps/web/src/app/home/cards/Appointments.tsx` owning its three states per
      T039b (FR-646, FR-657)
- [ ] T114 [US5] Append one import and one entry to `apps/web/src/app/home/registry.ts` — nothing
      above it edited or reordered (standing decision 9)
- [ ] T115 [US5] Scope the card to the active event (FR-639)
- [ ] T116 [US5] Record in the card why it must surface pending proposals: **no notification
      announces one**, so Home is the only way an attendee learns of it (FR-643, FR-645, SC-606)

**Checkpoint**: a proposal is discoverable without any notification.

---

## Phase 8: User Story 6 — End a relationship (P3)

**Goal**: blocking and account deletion answer correctly, in both directions.

**Independent test**: block and confirm cards stop resolving and appointments are cancelled; delete
an account and confirm nothing survives on the other side.

### Tests for User Story 6

- [ ] T117 [P] [US6] Integration test in `apps/api/tests/integration/network-block.test.ts`: a block
      stops card resolution **in both directions** and refuses sharing and scheduling (FR-608,
      FR-637)
- [ ] T118 [US6] Integration test: lifting a block **restores the contact** but leaves the
      appointment cancelled (FR-637a) — the asymmetry is the point
- [ ] T119 [P] [US6] Integration test: a block cancels pending proposals and future confirmed
      appointments and frees their slots (FR-637a)
- [ ] T120 [P] [US6] Integration test: deleting an account removes the contact entirely from the
      other side — **no nameless entry**, unlike 007's conversations (FR-651, SC-609)
- [ ] T121 [P] [US6] Integration test: deleting an account removes every appointment for both
      (FR-652)
- [ ] T122 [P] [US6] Integration test: the export contains cards shared, cards held, and
      appointments in both roles (FR-653, SC-610)

### Implementation for User Story 6

- [ ] T123 [US6] Join `blocks` in the card resolution query — read-side, so lifting a block restores
      the contact with no write
- [ ] T124 [US6] Implement the cancel-on-block entry point in
      `apps/api/src/db/queries/appointments.ts`
- [ ] T125 [US6] Add **one call** to it from `apps/api/src/db/queries/blocks.ts` — the single place
      008 edits a file 007 owns, justified in research R6
- [ ] T126 [US6] Record at that call why read-time filtering was rejected: lifting a block would
      resurrect a cancelled meeting, which FR-637a forbids
- [ ] T127 [US6] Extend the export builder to cover both new tables in both roles (FR-653)
- [ ] T128 [US6] Confirm the deletion cascade needs no code — all four references cascade — by
      running the deletion tests rather than by inspection

**Checkpoint**: every safety and personal-data obligation is discharged.

---

## Phase 9: Polish & Cross-Cutting Concerns

### Layouts — the three widths, none of them optional

- [ ] T129 [P] Desktop: two-pane Network, contacts beside appointments, dialog centred
- [ ] T130 [P] Tablet: reduced rail, two-column contact cards, appointments stacked beneath
- [ ] T131 [P] Mobile: single column, full-width dialog from the bottom edge, touch-sized slot
      targets
- [ ] T132 Make contacts/appointments a **segmented control, never a horizontally scrolling strip**
      (FR-659) — the prototype's scrolling switcher is a recorded defect, not a pattern
- [ ] T133 e2e test asserting no horizontal scrolling at any supported width (SC-612)

### Accessibility

- [ ] T134 [P] Accessible label, visible focus and keyboard operation on every control (FR-658)
- [ ] T135 [P] Keyboard-only pass over the whole core journey at all three widths (SC-611)
- [ ] T136 [P] Axe pass over Network and the scheduling dialog

### Requirements whose implementation is an absence

Each needs a test, because an absence that nobody asserted is an absence the next feature deletes.

- [ ] T137 [P] Assert **no notification** is dispatched by any path in this feature, and that
      `apps/api/tests/unit/notification-triggers.test.ts` is **unedited** (FR-643)
- [ ] T138 [P] Assert there is **no card revocation route** and no delete on `shared_cards` (FR-618)
- [ ] T139 [P] Assert there is **no route** creating or editing a meeting slot (FR-623)
- [ ] T140 [P] Assert **no column was added to `attendees`** — the contact line stays withdrawn
      (FR-619–FR-622)
- [ ] T141 [P] Assert contacts are **not** derived from conversations, from appointments, or from
      any signal other than a held card (FR-610; constitution v3.2.0, N1)

### Success criteria with an explicit measurement task

- [ ] T142 SC-601 — measure the Discover-to-contact journey: under 30 seconds, at most three
      deliberate actions
- [ ] T143 SC-604 — measure proposing: under 60 seconds, and an incomplete proposal is
      *unsubmittable* rather than rejected
- [ ] T144 SC-608 — verify blocking takes effect on the **next request**, not on a cache expiry

### Documentation and closing

- [ ] T145 [P] Update `CLAUDE.md` — architectural invariants gained by this feature, and Network's
      new status
- [ ] T146 [P] Update `brainstorm/00-overview.md` delivery queue for 008
- [ ] T147 Run the full gate set: typecheck, lint, unit, component, contract, migration, integration,
      accessibility, e2e, production build
- [ ] T148 **Walk `quickstart.md` by hand, all scenarios, two browser profiles.** 007's T148 was
      left unfinished and carried forward as debt — **do not repeat that**. Scenario 3 step 4 is the
      Principle VIII measurement and cannot be skipped
- [ ] T149 Record desktop and tablet findings from T148 — those layouts remain unvalidated by the
      client, and this is the only review they will have had before 010

---

## Dependencies

### Phase dependencies

```
T001 (amendment merged) ──► Phase 1 Setup ──► Phase 2 Foundational ──┬──► Phase 3 US1 ──► Phase 4 US2
                                                                     │                        │
                                                                     ├──► Phase 5 US3 ──► Phase 6 US4
                                                                     │                        │
                                                                     │    Phase 7 US5 ◄───────┘
                                                                     │         │
                                                                     └─────────┴──► Phase 8 US6 ──► Phase 9
```

- **US2 depends on US1** — there is no contact to outlive anything until sharing exists.
- **US4 depends on US3** — nothing to answer until a proposal exists.
- **US5 depends on US4** — the card surfaces proposals and confirmed appointments.
- **US6 depends on US1 and US3** — it ends both kinds of relationship.
- **US1/US2 and US3/US4 are independent of each other** and may run in parallel after Phase 2.

### Parallel opportunities

- **Phase 2**: T005–T012 schema files, T030–T034 repositories, and T040–T042 throttle are three
  independent groups.
- **All test tasks marked [P] within a story** touch different files and may run together.
- **Phase 9 layout, accessibility and absence tasks** are almost entirely parallel.
- **The two API domains are separable**: cards (US1, US2) and appointments (US3, US4) share only
  Phase 2 and the block work in US6.

---

## Implementation Strategy

**MVP is Phase 1 + Phase 2 + Phase 3 (US1).** It delivers the whole point of the feature — a
durable contact created by a deliberate act — and it is demonstrable on its own.

**Then US2**, which is small and proves the property the model was chosen for.

**Then US3 + US4 together**, which is the appointment half and completes the core journey the
constitution requires to stay end-to-end completable.

**US5 and US6 last**, in that order. US6 is P3 only because it cannot be exercised until the earlier
stories exist — **not** because it is optional; two coverage tests fail the build without it.

### On splitting into pull requests

Deferred to the phase-split hook, against this list rather than in advance, as 007 did. The natural
seam is **cards (Phases 3–4) | appointments (Phases 5–7) | safety and polish (Phases 8–9)**, since
the two API domains share only Phase 2. Worth weighing against the fact that `develop` is
squash-merge only, so a phase's separate commits do not survive the merge — a point 002 recorded
after making the same split for review isolation and getting it only at the commit level.
