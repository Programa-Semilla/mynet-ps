---
description: "Task list for 009 — Session Q&A: audience questions and upvotes"
---

# Tasks: Session Q&A — Audience Questions and Upvotes

**Input**: Design documents from `/specs/009-session-qa/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/questions.md](./contracts/questions.md),
[quickstart.md](./quickstart.md)

**Tests**: **included and not optional.** Principle VII requires ten correctness gates, and this
feature has an unusual density of guarantees that are *only* expressible as tests: eleven of its
requirements are **absences** (FR-766–FR-773b), three existing guards must keep passing
**unmodified**, and two of its properties — that a block changes nobody else's counts, and that
reordering does not move focus — are invisible to inspection.

**Organization**: grouped by user story. Phase order follows the **two-PR split** from
[plan.md](./plan.md), not raw priority: US5 is P2 but lands last because it is PR-B.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task serves

---

## Global Constraints

**Every task inherits this section.** Values are copied verbatim from `spec.md`, `research.md` and
`data-model.md` so no task has to go and find them, and so two tasks cannot pick different numbers.

| Constant | Value | Source |
|---|---|---|
| Question body length | **1–500 characters after trimming** | FR-703, research R10 |
| Session notes length, for contrast | 10,000 — **do not copy it here** | 005 |
| Migration number | **`0008`** — reserved, not discovered | roadmap, FR declaration table |
| Throttle `question_ask` | identifier **10**, source **100**, `mayDeny: true` | research R8 |
| Throttle `question_vote` | identifier **60**, source **600**, `mayDeny: true` | research R8 |
| Throttle `report_submit` | identifier **5**, source **50**, `mayDeny: true` | research R8 |
| Ordering | `votes DESC, asked_at ASC` — **deterministic, never count alone** | FR-725, FR-726 |
| Cache | **nothing in this feature is cached**; the repository is not decorated at all | research R1 |
| Route prefix | **every** route under `/events/:eventId/…`, with no exception | FR-742, contracts |

**Four rules that bind every task and are easy to breach by accident:**

1. **Append, never insert** — `routes/index.ts`, `Repositories`, `services.ts`. The generated
   contract lists paths in observation order.
2. **No local dialog centring.** `theme/tokens.css` centres every modal `<dialog>`; adding `m-auto`
   or any equivalent is what this rule exists to stop.
3. **Four existing tests must keep passing unmodified**: `notification-triggers`,
   `no-report-read-surface`, `deletion-coverage`, `export-coverage`. Editing one is the
   conversation, not the fix.
4. **Every route carries a `schema` block**, or Swagger never observes it and it is *silently
   absent* from `contracts/openapi.json`.

---

## Interfaces

Declared once here because **a task's implementer sees only their own task**. Later tasks must use
these names and shapes exactly.

**`QuestionsRepository`** — `packages/data/src/interfaces/questions.ts` (T027), consumed by T029
(HTTP implementation), T031 (composition root) and T033 (client hook):

```ts
interface QuestionListItem {
  readonly id: string
  readonly body: string
  readonly askedAt: string          // ISO 8601
  readonly authorId: string
  readonly authorDisplayName: string
  readonly votes: number            // computed, never stored
  readonly votedByMe: boolean       // the reader's own state only
  readonly canWithdraw: boolean     // authorId === reader && votes === 0
}

interface QuestionsRepository {
  list(eventId: string, sessionId: string): Promise<QuestionListItem[]>
  ask(eventId: string, sessionId: string, body: string): Promise<QuestionListItem[]>
  withdraw(eventId: string, questionId: string): Promise<QuestionListItem[]>
  vote(eventId: string, questionId: string): Promise<QuestionListItem[]>
  unvote(eventId: string, questionId: string): Promise<QuestionListItem[]>
}
```

**`eventId` is the first argument of every method**, mirroring the addresses. **Every write returns
the full re-ordered list** (research R5) — that is what makes the reader's own action update without
a second round trip.

**`useSessionQuestions`** — `apps/web/src/app/agenda/useSessionQuestions.ts` (T033), consumed by
T034/T040/T048/T055/T073:

```ts
useSessionQuestions(eventId: string, sessionId: string): {
  status: 'loading' | 'ready' | 'failed'
  offline: boolean                  // carried, not re-derived — 005's rule
  questions: readonly QuestionListItem[]
  ask(body: string): Promise<void>
  withdraw(questionId: string): Promise<void>
  toggleVote(questionId: string, voted: boolean): Promise<void>
  error: { code: string; message: string } | null   // classified by CODE, never by class — T043a
}
```

**Query-layer names** — `apps/api/src/db/queries/questions.ts` (T017–T019), used by T020's routes:
`listQuestions`, `askQuestion`, `withdrawQuestion`, `voteOnQuestion`, `unvoteQuestion`. Each takes
the branded `EventScope` as its first parameter, as every function in `queries/agenda.ts` does.

---

## ⚠️ Blocking precondition, before Phase 1

Public Q&A visibility is a **third exception** to Principle VIII's "private content stays private",
and Principle VIII requires an exception to be **recorded**, not entailed. The owner ruled on
2026-08-10 that this closes by **constitution amendment**, following 008's precedent rather than the
entailment argument.

**Planning did not wait for it. Implementation must.** Nothing below is licensed by an amendment a
reviewer has not accepted.

- [ ] T001 Draft the amendment to `.specify/memory/constitution.md` adding an exception clause under
      Principle VIII covering public Q&A visibility — a question is visible to every attendee
      registered for the event, under a real name, **with no opt-out**, including an attendee who
      has turned discoverability off. Carry the three consequences with it (FR-735 verification is
      not consulted, FR-736 the name is not a route into the profile, FR-739 the attendee is told
      before they publish), and record that reporting from a question is what makes the absence of a
      moderator survivable on the product's first many-to-many surface
- [ ] T002 Confirm the amendment travels in this branch and PR, as 008's did, and that
      `.specify/memory/constitution.md` reads its new version before any implementation task begins
      (re-check after any rebase — that is when it is lost) (FR-733)
- [ ] T003 Raise the **FR-756a withdrawal** recorded in plan.md Complexity Tracking with the owner:
      the refusal-purge requirement is not met, meeting it would give Q&A a cross-feature
      responsibility no other undecorated repository has, and the underlying gap is product-wide.
      Either amend `spec.md` to withdraw FR-756a, or reject the recommendation — **do not implement
      against an unresolved MUST**

---

## Phase 1: Setup

**Purpose**: nothing to install. This feature adds **no dependency** — no package, no vendor, no
external service. Confirming that is the task.

- [ ] T004 Verify `pnpm install && pnpm start` brings up a clean database and that the service worker
      registers in dev (007), so nothing here needs a production build
- [ ] T005 [P] Move `apps/api/migrations/meta/README.md` aside before any `drizzle-kit generate`, and
      restore it after — `generate` JSON-parses every file in `meta/`
- [ ] T006 [P] Confirm the journal's deliberate `0003`/`0004` ordering is untouched after
      regeneration, per `apps/api/migrations/meta/README.md` — it carries a later timestamp on
      purpose and must not be "fixed"

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: everything every user story needs. **No story may start until this phase completes.**

### Schema and migration `0008`

- [ ] T007 [P] Create `apps/api/src/db/schema/questions.ts` with `session_questions` per
      [data-model.md](./data-model.md) — `id`, `session_id` → `sessions` **ON DELETE CASCADE**,
      `attendee_id` → `attendees` **ON DELETE CASCADE**, `body`, `asked_at`. File header states
      **per-event scoping and why**, and that the event is reached through `sessions` and
      deliberately **not** denormalised (FR-760, FR-762, FR-763)
- [ ] T008 [P] Add the `CHECK (length(trim(body)) > 0 AND length(body) <= 500)` constraint to
      `session_questions` in `apps/api/src/db/schema/questions.ts` — both halves of FR-703 at the
      last line of defence, with the `trim` making a whitespace-only question unrepresentable (FR-705)
- [ ] T009 [P] Add indexes on `session_questions(session_id)` and `session_questions(attendee_id)` in
      `apps/api/src/db/schema/questions.ts` — Postgres creates neither, and 004's review left exactly
      the `attendee_id` one missing on two token tables as a recorded unclaimed defect
- [ ] T010 Add `question_votes` to `apps/api/src/db/schema/questions.ts` — composite
      `PRIMARY KEY (question_id, attendee_id)` **which IS FR-718**, both cascades, `voted_at`, and an
      index on `attendee_id`. Comment states that the cascade from `session_questions` is what
      removes *other people's* votes with a deleted author's question (FR-761)
- [ ] T011 Add `question_ids uuid[] NOT NULL` to `apps/api/src/db/schema/reports.ts` (**007's file**)
      mirroring `message_ids` including its **deliberate absence of a foreign key**; ships in this
      migration though PR-B is what uses it, because schema ahead of code is the safe direction for
      rollback
- [ ] T012 Generate migration `0008` covering T007–T011 with `drizzle-kit generate`, having done T005
      first; review the SQL by hand before committing

### Coverage classification — the guards that fail by existence

- [ ] T013 Run `apps/api/tests/unit/deletion-coverage.test.ts` and confirm it **fails** on the two
      new tables before classifying them — a guard that was already green proves nothing
- [ ] T014 Confirm both new tables pass `deletion-coverage` by their **cascade from `attendees`**,
      requiring **no** allow-list entry and **no** `RETENTION_SWEEPS` rule (FR-765)
- [ ] T015 Extend the personal-data export in `apps/api/src/db/queries/account.ts` to cover questions
      asked and votes cast, each naming its session by title (FR-764)
- [ ] T016 Cover the new `abuse_reports.question_ids` column in the export alongside `message_ids`,
      and confirm `apps/api/tests/unit/export-coverage.test.ts` passes without an allow-list entry

### Query layer

- [ ] T017 Create `apps/api/src/db/queries/questions.ts` with the single list query per
      [data-model.md](./data-model.md) — count aggregate, `votedByMe` EXISTS, author `display_name`
      join, `ORDER BY votes DESC, asked_at ASC`, returning the whole set unpaginated (FR-732 — permissive, so
      adding pagination later needs no requirement change but must preserve FR-726's order). Comment
      states that the author join applies
      **none** of the directory's three conditions and that each absence is the feature (FR-725, FR-726, FR-733, FR-737)
- [ ] T018 Implement `ask`, `vote` and `unvote` in `apps/api/src/db/queries/questions.ts`, each
      returning the freshly-ordered list (research R5), with the vote insert `ON CONFLICT DO NOTHING`
      so a double-tap is the same request twice (FR-717, FR-719, FR-730)
- [ ] T019 Implement `withdraw` in `apps/api/src/db/queries/questions.ts` re-checking
      "no votes exist" **inside the same transaction as the delete** — checking before the
      transaction is the race FR-714 exists to close

### Routes and the audit that already covers them
 (FR-711, FR-715, FR-716)
- [ ] T020 Create `apps/api/src/routes/events/questions.ts` with all five routes under
      `/events/:eventId/…` per [contracts/questions.md](./contracts/questions.md), each carrying
      `requireEventAccess` and a `schema` block — a route without one is **silently absent** from
      `contracts/openapi.json` and `pnpm contract:check` cannot notice it (FR-741, FR-743, FR-744)
- [ ] T021 Append `questionRoutes` to `ROUTES` in `apps/api/src/routes/index.ts` — **append, never
      insert**: the generated contract lists paths in observation order
- [ ] T022 Confirm `apps/api/tests/unit/event-scope-audit.test.ts` covers all five routes and that
      **no fourth branded scope and no fourth route audit is introduced**; add a test asserting no
      route in this feature omits its `:eventId`, because the audit reports success on a route that
      names no event (FR-742)
- [ ] T023 Regenerate `contracts/openapi.json` and run `pnpm contract:check`; resolve any conflict by
      regenerating wholesale, **never by hand-editing the merged result**

### Throttling

- [ ] T024 Add `question_ask` and `question_vote` to `THROTTLE_ACTIONS` in
      `apps/api/src/db/schema/sign-in-attempts.ts`, with a comment stating both are keyed on the
      acting attendee so a denial can only fall on the person doing the thing (FR-746)
- [ ] T025 Add `THRESHOLDS` entries in `apps/api/src/auth/throttle.ts` — `question_ask` 10/100,
      `question_vote` 60/600, both `mayDeny: true` (research R8), each stating why voting is looser
      by an order of magnitude
- [ ] T026 Wire both throttles into `apps/api/src/routes/events/questions.ts`

### Repository interface and wiring

- [ ] T027 [P] Create `packages/data/src/interfaces/questions.ts` declaring `QuestionsRepository`
      with `eventId` as the **first argument of every method**, mirroring the addresses
- [ ] T028 [P] Append `questions: QuestionsRepository` to `Repositories` in
      `packages/data/src/interfaces/index.ts` — one line, no edit to any neighbour's declaration
- [ ] T029 Create `packages/data/src/http/questions.ts` implementing `HttpQuestionsRepository`
- [ ] T030 Confirm **nothing is added to `CatalogRepository`**, which is read-only in perpetuity and
      asserted by name-shape over its exports (FR-710, FR-772)
- [ ] T031 Register `questions` in `apps/web/src/app/services.ts` **undecorated**, with the refusal
      written **beside the member** (research R1): nothing here is cached, because a question is
      another attendee's words and a vote count is a live number the staleness stamp cannot describe.
      Note that being undecorated makes FR-755 and FR-757 structural — there is no `reads` map to
      omit from and no `args[0]` to misread (FR-754, FR-758)
- [ ] T032 Confirm `apps/web/tests/unit/repository-casts.test.ts` still passes with the new member

### Client foundation

- [ ] T033 Create `apps/web/src/app/agenda/useSessionQuestions.ts` holding the list, replacing state
      wholesale from each write's response (research R5)
- [ ] T034 Create `apps/web/src/app/agenda/PanelQuestions.tsx` as the section shell with its three
      states — empty inviting the first question, loading, and failure distinguishing absence of
      connection from a fault on our side (FR-727, FR-728, FR-729, FR-748)
- [ ] T035 Compose `PanelQuestions` in `apps/web/src/app/agenda/SessionPanel.tsx` (**005's file**) —
      **one line** inside `PanelBody`, after `PanelNotes`, with `key={session.id}` for the reason
      005 keys `PanelNotes`. The panel is deliberately **not** converted to a registry (research R3)

**Checkpoint**: schema, routes, repository and the panel section exist. User stories can begin.

---

## Phase 3: User Story 1 — Ask the room's question (P1) 🎯 MVP

**Goal**: an attendee posts a question on a session and every co-attendee sees it, attributed.

**Independent Test**: post a question as one account; confirm a second account registered for the
same event sees it with the first attendee's display name.

### Tests for User Story 1
 (FR-749, FR-750, FR-751)
- [ ] T036 [P] [US1] Integration test in `apps/api/tests/integration/questions-ask.test.ts` — a
      question crosses between two accounts, attributed; a non-registered reader is refused
      indistinguishably from a session that does not exist
- [ ] T037 [P] [US1] Integration test in `apps/api/tests/integration/questions-validation.test.ts` —
      empty, whitespace-only and over-500 bodies are refused at the route **and** by the `CHECK`
      constraint independently
- [ ] T038 [P] [US1] Component test in `apps/web/tests/component/panel-questions-ask.test.tsx` — the
      post control is **disabled** for empty and whitespace input, and the remaining allowance
      appears before the limit is reached
- [ ] T039 [P] [US1] Component test asserting the empty state invites the first question rather than
      rendering a blank area

### Implementation for User Story 1

- [ ] T040 [US1] Implement the ask form in `apps/web/src/app/agenda/PanelQuestions.tsx` — disabled
      post control (FR-704), visible remaining allowance (FR-706), field clears on success (FR-707) (FR-701, SC-701, SC-702)
- [ ] T041 [US1] Render the attributed list in `apps/web/src/app/agenda/PanelQuestions.tsx` showing
      the author's display name for **every** question, including a non-discoverable author's (FR-702, FR-708, FR-734, SC-703)
- [ ] T042 [US1] Ensure opening an author's profile from a question goes through the **existing**
      profile rules unchanged, so a non-discoverable author's name shows and their profile still
      refuses to open (FR-736)
- [ ] T043 [US1] Tell the attendee, at the point of asking, that their question will carry their name
      to everyone at the session (FR-739) — a consequence they must not meet afterwards
- [ ] T043a [US1] **Classify every refusal in `apps/web/src/app/agenda/useSessionQuestions.ts` on
      `error.code`, never on the error class** (FR-745). `ApiError extends RequestRefusedError` and
      **every** non-2xx throws `ApiError`, so an `instanceof` check catches 400, 404, 429 and 500
      alike. In 008 this rendered the deliberately reasonless refusal for all of them and **swallowed
      every message the routes were written to deliver** — and this feature has two refusals that
      exist to be read (FR-714, FR-722), so the same mistake makes both invisible
- [ ] T043b [P] [US1] Component test in `apps/web/tests/component/panel-questions-errors.test.tsx`
      asserting each code renders its own message: the withdrawal-refused reason, the
      own-question reason, the indistinguishable 404, the throttle, and the generic server fault —
      **five distinct outcomes, not one** (FR-744, FR-745)

**Checkpoint**: US1 works independently. This is the MVP.

---

## Phase 4: User Story 2 — Push a question up (P1)

**Goal**: upvoting ranks the list, one vote per attendee, durable and reversible.

**Independent Test**: upvote another attendee's question; confirm the count rises, the order changes,
and both survive a reload.

### Tests for User Story 2

- [ ] T044 [P] [US2] Integration test in `apps/api/tests/integration/questions-vote.test.ts` — one
      vote per attendee enforced by the schema; a repeated request is idempotent; withdrawal returns
      the count exactly (SC-704)
- [ ] T045 [P] [US2] Integration test asserting an attendee **cannot vote on their own question**
      (FR-722) and that the refusal carries its reason
- [ ] T046 [P] [US2] Integration test asserting two readers with the same data receive the **same
      order**, including where counts tie (SC-705)
- [ ] T047 [P] [US2] Component test in `apps/web/tests/component/panel-questions-vote.test.tsx` — the
      voted state renders, and no surface anywhere names another voter (FR-721)

### Implementation for User Story 2

- [ ] T048 [US2] Implement the upvote control in `apps/web/src/app/agenda/PanelQuestions.tsx` with an
      accessible label naming its question and a pressed state conveyed to assistive technology (FR-720, FR-724, SC-706)
- [ ] T049 [US2] Key list rows on the question id so a row that **moves does not unmount** — this is
      what keeps focus on the control the reader just activated (FR-780, research R5)
- [ ] T050 [US2] Hide the upvote control on the reader's own question, matching the server's refusal

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Take back a question asked in error (P2)

**Goal**: an author withdraws their own question until somebody upvotes it.

**Independent Test**: withdraw an unvoted question and confirm it is gone for a second account; then
have the second account upvote another, and confirm withdrawal is no longer offered or accepted.

### Tests for User Story 3

- [ ] T051 [P] [US3] Integration test in `apps/api/tests/integration/questions-withdraw.test.ts` —
      withdrawal succeeds with no votes, is refused **with a reason** once a vote exists, and is
      refused for a question the caller did not author regardless of what any interface offered (SC-708)
- [ ] T052 [P] [US3] Integration test for the **race**: a vote cast between render and submission
      causes the transaction-internal re-check to refuse (FR-714)
- [ ] T053 [P] [US3] Integration test asserting withdrawal becomes available again when every vote is
      withdrawn (Edge Cases)
- [ ] T054 [P] [US3] Component test asserting the control is **absent with the reason stated** rather
      than present-and-failing (FR-713)

### Implementation for User Story 3

- [ ] T055 [US3] Implement the withdrawal control in `apps/web/src/app/agenda/PanelQuestions.tsx`,
      driven by the server's `canWithdraw` while the server remains the enforcement (FR-713)
- [ ] T056 [US3] Wire the confirmation through the existing `ConfirmDialog`, opened **inside** the
      session panel (research R2) — restore focus to the opener **after** closing, because the panel
      is inert while the inner dialog is open (FR-712, FR-752, FR-778)
- [ ] T057 [US3] Confirm the confirmation adds **no local centring class** — `theme/tokens.css`
      centres every modal dialog, and re-patching it is what this rule exists to stop

**Checkpoint**: US1–US3 work independently.

---

## Phase 6: User Story 4 — Leaving takes your questions with you (P3)

**Goal**: deleting an account removes every question asked, every vote on those questions, and every
vote cast — with nothing left de-attributed.

**Independent Test**: with two accounts, one asking and one voting, delete the asking account and
confirm both the question and the other attendee's vote on it are gone.

### Tests for User Story 4
 (FR-779)
- [ ] T058 [P] [US4] Integration test in `apps/api/tests/integration/questions-deletion.test.ts` —
      deleting an author removes their questions **and every vote anybody cast on them**; deleting a
      voter removes their votes wherever cast (SC-709)
- [ ] T059 [P] [US4] Integration test asserting **no placeholder, no de-attributed row and no
      tombstone** survives anywhere (owner decision 1)
- [ ] T060 [P] [US4] Integration test in `apps/api/tests/integration/questions-export.test.ts` — the
      export contains every question asked and every vote cast, each naming its session (SC-710)
- [ ] T061 [P] [US4] Integration test asserting a session whose only question was the departing
      attendee's renders the **empty state**, not a gap or an error

### Implementation for User Story 4

- [ ] T062 [US4] Confirm deletion needs **no application code at all** — both cascades are
      schema-level from T007 and T010, which is the point of putting them there
- [ ] T063 [US4] Verify the re-seed path: `DELETE FROM events` must succeed with questions present
      (FR-763). 008 met this exact trap with a non-cascading reference and broke the re-seed with an
      error naming neither table

**Checkpoint**: PR-A is complete. **Do not merge claiming the feature is done** — US5 is unmet and
the Success Criteria say so.

---

## Phase 7: User Story 5 — Make an abusive question stop (P2) — PR-B

**Goal**: a question is reportable from the question, and a block makes two attendees invisible to
each other in Q&A.

**Independent Test**: report a question without opening a conversation; confirm it and every other
question by that author vanish for the reporter, that the author is blocked, that no third party's
view or counts changed, and that unblocking restores everything.

### Tests for User Story 5

- [ ] T064 [P] [US5] Integration test in `apps/api/tests/integration/questions-blocks.test.ts` — a
      block in **either** direction hides each attendee's questions from the other, and the pair is
      **never ordered** (A-blocks-B and B-blocks-A are independent facts)
- [ ] T065 [P] [US5] Integration test asserting a block changes **no other reader's list and no
      count at all**, including a vote the blocker had already cast (FR-787, SC-711b)
- [ ] T066 [P] [US5] Integration test asserting unblocking restores visibility **with no write**
      (FR-786) — the deliberate opposite of 008's appointment cancellation
- [ ] T067 [P] [US5] Integration test in `apps/api/tests/integration/reports-questions.test.ts` — a
      report carrying `questionIds` blocks in the same act, and operator mail carries identifiers and
      a timestamp only, never the question text and never the reason
- [ ] T068 [P] [US5] Confirm `apps/api/tests/unit/no-report-read-surface.test.ts` passes
      **unmodified** with the new field

### Implementation for User Story 5
 (FR-773a)
- [ ] T069 [US5] Add the bidirectional `NOT EXISTS` block filter to the list query in
      `apps/api/src/db/queries/questions.ts`, mirroring `apps/api/src/db/queries/cards.ts` (FR-785)
- [ ] T070 [US5] Accept and store `questionIds` in `apps/api/src/routes/reports.ts` (**007's file**) (FR-783)
- [ ] T071 [US5] Add `report_submit` to `THROTTLE_ACTIONS` and `THRESHOLDS` (5/50, `mayDeny: true`)
      and wire it into `apps/api/src/routes/reports.ts` — **this closes a gap 007 left**, since a
      report dispatches operator mail and unthrottled reports are unthrottled mail to the product's
      only safety channel
- [ ] T072 [US5] Move `apps/web/src/app/messages/ReportDialog.tsx` to
      `apps/web/src/app/safety/ReportDialog.tsx` and update the single import in
      `apps/web/src/app/messages/Thread.tsx` (**007's file**)
- [ ] T073 [US5] Add a report control to each question in
      `apps/web/src/app/agenda/PanelQuestions.tsx`, opening the moved dialog **inside** the session
      panel with the same focus ordering as T056 (FR-781, SC-711a)
- [ ] T074 [US5] Confirm the report dialog's confirmation is **disabled while the reason is blank**,
      inherited from the dialog rather than reimplemented

**Checkpoint**: all five user stories work. PR-B is complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

### Layouts — the three widths, none of them optional
 (FR-782, FR-784)
- [ ] T075 [P] Desktop: the panel stays centred with the section beneath the existing three;
      nothing scrolls horizontally (FR-774)
- [ ] T076 [P] Tablet: reduced rail, constrained panel width, **single-column** question list —
      questions are prose and a two-column list of prose is harder to scan
- [ ] T077 [P] Mobile at 390×844: panel full-width from the bottom edge, vote and report controls at
      touch size, a long question **wraps** (FR-775) (FR-776)
- [ ] T078 Extend `e2e/responsive.spec.ts` to measure that **both** dialogs this feature opens are
      centred at every width — the assertion exists because two dialogs shipped in the corner, and
      this feature opens two more

### Accessibility

- [ ] T079 [P] Accessible labels on every control; the upvote names its question and conveys pressed
      state
- [ ] T080 [P] Visible focus on every control, and the whole section operable by keyboard alone (FR-777, SC-713)
- [ ] T081 E2E in `e2e/session-qa-keyboard.spec.ts`: **Escape dismisses only the inner dialog**,
      leaving the panel open and the address unchanged; a second Escape closes the panel. This is
      research R2's risk and **cannot be verified in jsdom**
- [ ] T082 E2E asserting focus **stays on the upvote control as its row moves up the list** (FR-780)
      — the assertion most likely to fail
- [ ] T083 Extend `e2e/accessibility` coverage to the Q&A section

### Requirements whose implementation is an absence

- [ ] T084 [P] Confirm `apps/api/tests/unit/notification-triggers.test.ts` passes **unmodified** —
      no Q&A action dispatches a notification (FR-747, FR-766, SC-714). Editing this test to admit a
      Q&A trigger is a constitution amendment, not an implementation detail
- [ ] T085 [P] Assert by test the absence of any question edit route or column (FR-709, FR-770)
- [ ] T086 [P] Assert by test the absence of any downvote or reaction (FR-723, FR-771)
- [ ] T087 [P] Assert by test that no route or repository method reveals **who** voted (FR-721,
      FR-769)
- [ ] T088 [P] Assert by test the absence of any answer, `answered` flag, pin or moderation route
      (FR-768) — each is an organizer act
- [ ] T089 [P] Assert by test that no Home card and no navigation destination is added (FR-753,
      FR-773)
- [ ] T090 [P] Assert by test that no de-duplication or "already asked" refusal exists (FR-773b)
- [ ] T090a [P] Assert by test that **nothing in this feature polls** (FR-731) — no interval, no
      timer, and no use of `VisibilityService` in the Q&A surface. 007's thread poller is one import
      away, and an absence nobody tests is one the next reader adds back
- [ ] T090b [P] Assert over `apps/api/src` that **no contact, connection or relationship is derived
      from a question or a vote** (FR-740, constitution v3.2.0 N1). Contacts come from held cards
      alone; the analogous assertion for conversations already exists and this is its Q&A twin
- [ ] T090c [P] Assert by test that no notification bell and no in-app notification centre is
      introduced (FR-767), and that no column is added to the attendee record (FR-738)

### Success criteria with an explicit measurement task

- [ ] T091 [P] SC-711: read a cached programme, ask a question and vote, read it again — **the
      cached programme, saved sessions and notes must still be there.** This is the assertion 008's
      equivalent defect would have failed
- [ ] T092 [P] SC-712: every write refused offline with an explanation, **and the typed text still
      present** (FR-759)
- [ ] T093 [P] SC-707: a non-discoverable author is named on their question **and** their profile
      still refuses to open — both halves together, because either alone looks like a defect
- [ ] T094 [P] SC-715: a Q&A failure leaves overview, speakers and notes rendered and interactive

### Documentation and closing

- [ ] T095 [P] Update `CLAUDE.md` — current state, the Q&A architectural invariants, and the
      standing decisions this feature settled
- [ ] T096 [P] Record in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` that
      009 shipped and that **the roadmap is complete**
- [ ] T097 **Walk `quickstart.md` by hand, all eight scenarios, in two browser profiles.** T148's
      equivalent was skipped for 007 **and** for 008, and the one time a human looked at 008 they
      found a dialog in the top-left corner that had passed 135 e2e tests, five review agents and
      CodeRabbit. Scenario 6 is the one that must not be skipped
- [ ] T098 Run every gate: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:component &&
      pnpm contract:check && pnpm test:integration && pnpm test:e2e && pnpm build`. **Completion is
      claimed from pipeline output, never from inspection**

---

## Dependencies

### Phase dependencies

- **Blocking precondition (T001–T003)** → blocks *everything*. The amendment gates implementation;
  T003 gates implementing against an unresolved MUST.
- **Setup (T004–T006)** → no dependencies beyond the precondition.
- **Foundational (T007–T035)** → blocks all user stories.
- **US1 (T036–T043)** → depends only on Foundational. **MVP.**
- **US2 (T044–T050)** → depends on Foundational; independent of US1 at the API, but the panel section
  from T034 is shared.
- **US3 (T051–T057)** → depends on Foundational and on US2 existing, because "no votes yet" is only
  meaningful once votes exist.
- **US4 (T058–T063)** → depends on Foundational only. Verifies cascades rather than adding code.
- **US5 (T064–T074)** → **PR-B.** Depends on T017's list query existing, and on nothing else.
- **Polish (T075–T098)** → depends on all stories.

### Within Phase 2

- T007 → T008, T009, T010 (same file)
- T007–T011 → T012 (migration generates from all of them)
- T012 → T013–T016 (coverage guards read the generated schema)
- T017 → T018, T019 (same file)
- T020 → T021 → T023
- T027, T028 → T029 → T031

### Parallel opportunities

- T005, T006 together
- T007, T027, T028 together — different packages entirely
- All tests within any one user story: T036–T039, T044–T047, T051–T054, T058–T061, T064–T068
- All of T075–T077, T079–T080, T084–T090, T091–T094

---

## Parallel Example: User Story 2

```bash
# All four US2 tests together — different files, no shared state:
Task: "Integration test one-vote-per-attendee in apps/api/tests/integration/questions-vote.test.ts"
Task: "Integration test author cannot vote on own question"
Task: "Integration test two readers see the same order (SC-705)"
Task: "Component test voted state in apps/web/tests/component/panel-questions-vote.test.tsx"
```

---

## Implementation Strategy

### MVP first

1. Precondition T001–T003 — **the amendment, or nothing**
2. Phase 1 Setup, Phase 2 Foundational
3. Phase 3 US1 — **stop and validate**: a question crosses between two accounts, attributed
4. Phase 4 US2 — the ranking that makes the list worth having

### Incremental delivery

- **PR-A** = Foundational + US1 + US2 + US3 + US4. Complete, shippable, reviewable. Touches one
  neighbour's file (`SessionPanel.tsx`).
- **PR-B** = US5. Touches three more files other features own, and is the half added at spec review —
  keeping it separate keeps the review honest about what was specified when.

**PR-A must not claim feature completeness.** US5 is unmet until PR-B lands.

### Notes

- `[P]` = different files, no dependency on an incomplete task
- Verify tests fail before implementing — T013 makes that explicit for the coverage guards
- **Three existing tests must keep passing unmodified**: `notification-triggers`,
  `no-report-read-surface`, and both coverage guards. Modifying one is the conversation, not the fix
- Commit after each task or logical group
