# Tasks: Messages, and the Notification Delivery Platform It Needs

**Input**: Design documents from `/specs/007-messages-and-notification-delivery/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Required, not optional.** FR-522 names an integration test as a requirement, SC-505
demands proof by integration tests against a real database, and Principle VII runs ten gates in CI.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths in every description

## Path Conventions

Monorepo: `apps/api/`, `apps/web/`, `packages/data/`, `packages/platform/`, `e2e/`.

---

## Global Constraints

These bind every task below. A task that breaches one is wrong even if it satisfies its own
description.

1. **No route accepts an attendee identifier for the actor.** Identity binds from the session
   (FR-525). `POST /conversations` names a *recipient*, which is the narrowing exception 004 and 006
   already recorded.
2. **Nothing in this feature is cached.** FR-563. New repositories are registered **without** the
   `cached()` decorator, and the composition root says so where the wiring happens — the same
   declaration 006 made for the directory.
3. **No component calls the network or a browser API.** Principle V.
   `mynet/no-direct-platform-access` must still count zero.
4. **Two guards fail by existence.** `deletion-coverage` and `export-coverage` will go red the moment
   the schema lands, before any coverage exists. That is them working. T017–T019 close them.
5. **`requireParticipation` is not optional anywhere.** The branded `ConversationScope` is the only
   thing the query layer accepts, and T015's audit fails the build when a route skips it.
6. **404, never 403,** for a conversation the caller does not participate in (FR-524). A 403 confirms
   existence.
7. **Merge is gated on the constitution amendment.** Nothing in Phase 7 may ship before register
   entry 10 is amended. Every other phase is unaffected.

---

## Interfaces

The ports this feature adds or changes. Contract detail lives in
[`contracts/safety-and-notifications-api.md`](./contracts/safety-and-notifications-api.md).

| Port | Change | Gated on |
|---|---|---|
| `NotificationService` (`packages/platform`) | **Extended** — `subscribe`, `unsubscribe`, `currentSubscription`. Its "MUST NOT be wired to real delivery" comment is rewritten | Constitution amendment |
| `MailService` (`apps/api`) | **Extended** — a third method, `sendAbuseReport`, carrying identifiers only | Operator address (config only) |
| `PushService` (`apps/api`) | **New** — vendor-free, with a sink adapter | Provider (real adapter only) |
| `ConversationRepository`, `MessageRepository`, `BlockRepository`, `ReportRepository`, `PushSubscriptionRepository` (`packages/data`) | **New**, three files, appended to `Repositories` | — |

---

## Phase 1: Setup

**Purpose**: Prepare the workspace for a schema change and a new external dependency.

- [X] T001 Add the Web Push encryption dependency to `apps/api/package.json` and lockfile
- [X] T002 [P] Add push and operator-mail configuration to `apps/api/src/env.ts` and `apps/api/src/config.ts` — VAPID keys and operator address, **all optional, absence is the expected state** per research R8
- [X] T003 Record the pre-change asset budget baseline by running `pnpm budget` and noting the headroom in the task log
- [X] T004 Move `apps/api/migrations/meta/README.md` aside, because `drizzle-kit generate` JSON-parses every file in `meta/`

**T001 note**: `web-push@^3.6.7` plus `@types/web-push`. Added as a dependency of `@mynet/api`
only; nothing in the client imports it.

**T002 note**: added to `config.ts` alone, **not** `env.ts`. That file's own header states it
"loads variables; it does not declare or validate them", and names `config.ts` as the single
declaration site so the "every secret is read here and nowhere else" sentence stays true. A second
site would have falsified it. `.env.example` documents all four new variables, commented out,
because absence is the expected state for every one.

**T003 baseline** — `pnpm budget`, before any 007 code:

```
133.2 KB  assets/index-DEIvqql-.js
 16.2 KB  assets/errors-CBoq-edY.js
149.4 KB  total
150.0 KB  budget          →  0.6 KB to spare
```

> ### ⚠️ T003 correction (recorded at T031) — **that baseline is wrong, and so is everything derived from it.**
>
> **The real figure the CI gate measures is 91.7 KB, with 58.3 KB to spare.**
>
> `apps/web/vite.config.ts` sets `envDir: '../..'`, so Vite loads the **repository-root `.env`**
> when building the client — and that file (gitignored, seeded from `.env.example:130`) sets
> `NODE_ENV=development`. Vite honours `NODE_ENV` from a loaded env file, so a local `pnpm build`
> resolves React, React DOM, React Router and the scheduler to their **development** builds. The
> emitted sourcemaps name them outright: `react-dom.development.js`, `react-router/dist/development/…`.
>
> CI has no `.env`, so its build resolves `react-dom.production.js` and the shell is roughly
> **40% of the size** measured here. Both numbers were confirmed on the same tree by toggling one
> variable:
>
> | Build | Shell JS, gzipped | Against a 150 KB budget |
> |---|---|---|
> | `pnpm build` with the local `.env` (what T003 measured) | 150.5 KB *after* Phase 2's client code | **0.5 KB over** |
> | `NODE_ENV=production pnpm build` (what CI measures) | **91.7 KB** | 58.3 KB to spare |
>
> **Three consequences, none of them cosmetic:**
>
> 1. **Research R7's claim that lazy-loading Messages is "structural rather than a preference" is
>    void.** T031 still splits Messages, and should — the established rule ("the destinations needed
>    to render the workspace stay eager") decides it on its own. But the feature is not operating on
>    0.6 KB of headroom, and no later task should be planned as though it is.
> 2. **`pnpm budget` is not a meaningful local gate as things stand.** It answers a question about a
>    bundle no attendee receives. T142 must run it as `NODE_ENV=production pnpm build && pnpm budget`,
>    or the discrepancy must be fixed first.
> 3. **A local production build, and the local end-to-end suite that runs against it, exercise a
>    development React.** That is a wider defect than this feature and it is **left unclaimed here
>    deliberately**: fixing it means deciding whether the web build should ignore the root `.env`'s
>    `NODE_ENV`, whether `.env.example` should stop seeding it, and whether local e2e *wants* the dev
>    build's diagnostics. Each is a decision, not a refactor, and none belongs inside T031.

T142 re-runs the budget and must not raise it — now with the production-mode caveat above.

**T004 note**: moved to `apps/api/migrations/META-README.md` with `git mv`, so the reasoning stays
in the tree and under review while `meta/` holds only JSON. It goes back in T013.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, guards, coverage classification and repository seams. **No user story can begin
until this phase completes** — every story reads or writes through it.

**⚠️ CRITICAL**: T017–T019 must land in the same change as T005–T013. The coverage guards fail the
build the moment the tables exist, and leaving them red "until later" is how a personal-data table
ships unclassified.

### Schema and migration `0006`

- [X] T005 Define `conversations`, `conversation_pairs` and `conversation_participants` in `apps/api/src/db/schema/conversations.ts`, with the unique constraint on the ordered pair and `CHECK (lower_attendee_id < higher_attendee_id)` per data-model R10
- [X] T006 [P] Define `messages` in `apps/api/src/db/schema/messages.ts` with `CHECK (length(body) BETWEEN 1 AND 2000)` and the `(conversation_id, sent_at DESC, id DESC)` keyset index
- [X] T007 [P] Define `attendee_blocks` in `apps/api/src/db/schema/blocks.ts`, directional, with an index on `blocked_id` for the send-path question
- [X] T008 [P] Define `abuse_reports` in `apps/api/src/db/schema/reports.ts` with `message_ids` as a uuid array and **no** foreign key to `messages`, per data-model
- [X] T009 [P] Define `push_subscriptions` in `apps/api/src/db/schema/push-subscriptions.ts`, unique on `endpoint`, indexed on `attendee_id`
- [X] T010 Export all five new schema modules from `apps/api/src/db/schema/index.ts`
- [X] T011 Add explicit indexes on every new `attendee_id`-shaped foreign key, because **Postgres does not create one for a foreign key** — the finding 004's review left unclaimed on its two token tables
- [X] T012 Generate migration `0006` with `pnpm db:generate` and review the emitted SQL by hand
- [X] T013 Restore `apps/api/migrations/meta/README.md` (undoes T004)

### The participation guard — the core of this feature's authorization

- [X] T014 Implement the branded `ConversationScope` type and `requireParticipation` guard in `apps/api/src/plugins/participation.ts`, mirroring `EventScope`/`requireEventAccess` in `apps/api/src/plugins/event-access.ts`
- [X] T015 Write `apps/api/tests/unit/participation-audit.test.ts`, modelled on `apps/api/tests/unit/event-scope-audit.test.ts`, walking the real route table and failing any route that accepts a conversation or message identifier without the guard (research R9)
- [X] T016 Extend the existing lint rule that closes `EventScope`'s type-assertion escape hatch to cover `ConversationScope` as well

### Coverage classification — the guards that fail by existence

- [X] T017 Classify all **seven** new tables in `apps/api/tests/unit/deletion-coverage.test.ts` per the data-model table; **no allow-list entry is required**, every one is cascade-reached
- [X] T018 Extend `apps/api/tests/unit/export-coverage.test.ts` expectations for every collected column on the new tables, with subscription key columns declared as credentials rather than content
- [X] T019 Add the 90-day `abuse_reports` sweep to `RETENTION_SWEEPS` in `apps/api/src/maintenance.ts`, with its reason stated in the table as every existing entry does (research R3)

**T012 note** — the emitted SQL, reviewed by hand: seven `CREATE TABLE`s, and **no `ALTER` against
any existing table**, so the volatile-default rewrite hazard 004's review recorded against migration
`0003` does not arise. Four check constraints, two unique constraints, nine indexes (two more than
the data model's count — `abuse_reports` has two attendee foreign keys plus the sweep's
`created_at`). Every `attendee_id`-shaped foreign key cascades; `last_read_message_id` alone is
`SET NULL`, so an M3 cascade resets the pointer instead of evicting the survivor from their own
conversation. Renamed from the generated `0006_jazzy_swarm` to `0006_conversations_and_notifications`
to match the convention `0004_saved_sessions_and_notes` and `0005_directory_indexes` set; the journal
tag was updated with it.

**T017 correction — one allow-list entry IS required, and both the data model and this task said
none would be.** data-model.md's classification table calls `conversations` *"Not attendee data"*
and then concludes "No allow-list entry is required for any of them. Every table is reached by a real
foreign key cascade" — the two sentences contradict each other, and the second is wrong.
`conversations` holds **no attendee foreign key at all** (that emptiness is research R10's whole
point), so no cascade reaches it and `deletion-coverage` classified it as unclassified. It is now in
`NOT_ATTENDEE_DATA` with its reasoning. The other six need nothing: every one cascades. The spec's
requirement is unaffected — this is a defect in the count, not in the design.

**T018 note — T136 and T137 were pulled forward from Phase 9, because T018 cannot be satisfied
without them.** `EXPORTED_COLUMNS` maps each column to a named field of `AccountExport`, and
`tests/integration/export.test.ts` walks those entries against a real export requiring every named
field to be present. Declaring 007's columns while leaving `assembleExport` untouched would have
traded a red unit guard for a red integration guard. Both halves therefore land together: four new
export sections (`messages`, `blocks`, `reports`, `pushSubscriptions`), the `exclusions` note, and
the two `push_subscriptions` key columns declared as credentials exported as a redacted presence.
`Record<keyof AccountExport, true>` in the shape test is what caught the omission — adding a section
without acknowledging it there fails to compile.

### Repository interfaces and wiring

- [X] T020 [P] Define `ConversationRepository` and `MessageRepository` in `packages/data/src/interfaces/messages.ts`, with the no-actor-identifier rule stated in the file as every sibling states it
- [X] T021 [P] Define `BlockRepository` and `ReportRepository` in `packages/data/src/interfaces/safety.ts`, with `ReportRepository` exposing **write only** — no read method exists, per FR-548
- [X] T022 [P] Define `PushSubscriptionRepository` in `packages/data/src/interfaces/notifications.ts`
- [X] T023 Append the five new members to `Repositories` in `packages/data/src/interfaces/index.ts`, each with a comment declaring it is **not cached** and why (FR-563)
- [X] T024 [P] Implement `packages/data/src/http/messages-repository.ts`
- [X] T025 [P] Implement `packages/data/src/http/safety-repository.ts`
- [X] T026 [P] Implement `packages/data/src/http/push-repository.ts`
- [X] T027 Wire the three into the composition root in `packages/data/src/http/index.ts`, explicitly **without** `cached()`, with the refusal declared at the wiring site
- [X] T028 Confirm `apps/web/tests/unit/repository-casts.test.ts` still reports zero casts after the additions

**T022 note — `DeviceRegistration` is declared in `@mynet/data` and `DeviceSubscription` in
`@mynet/platform`, structurally identical and deliberately not shared.** The contract names one
shape; two packages need it, and the dependency runs *platform → data*, type-only. Importing back
the other way would close a cycle, so the shape is declared on both sides and structural typing
lets the composition root hand one straight to the other with no cast. `repository-casts.test.ts`
still counts zero.

**T027 correction — the task names `packages/data/src/http/index.ts`, which is a barrel, not the
composition root.** The composition root is `apps/web/src/app/services.ts`, where `cached()` is
applied and where 004 and 006 each recorded their refusal to use it. Both files were edited: the
barrel exports the five implementations, and `services.ts` constructs them **undecorated**, with
the refusal argued per member rather than once — conversations and messages because a cached thread
is somebody else's personal data ageing on a device with no offline capability bought in exchange,
blocks because SC-506 makes age the wrong clock for a refusal, reports because they are write-only,
and push subscriptions because they are credentials.

**T028 note** — passing, and two test registries needed the five new members before it could run:
`apps/web/tests/support/services.tsx` (defaults: an attendee who has spoken to nobody) and
`apps/web/tests/sign-in.test.tsx` (every method rejects, because nothing on that screen may reach
them). The registry is substituted whole (FR-047), so absent members do not compile — which is the
guard working.

### Throttling

- [X] T029 Add `message_send` (`mayDeny: false`) and `conversation_create` (`mayDeny: true`) to `THROTTLE_ACTIONS` in `apps/api/src/auth/throttle.ts`, keyed on the acting attendee's identifier, with the asymmetry's reasoning recorded in place (research R5)
- [X] T030 [P] Unit-test the two new throttle actions in `apps/api/tests/unit/throttle-actions.test.ts`, asserting that `message_send` can never deny

**T029 note — two files, not one.** `THROTTLE_ACTIONS` lives in
`apps/api/src/db/schema/sign-in-attempts.ts` (the action is a column value); the `THRESHOLDS` table
the task describes lives in `apps/api/src/auth/throttle.ts`. Both were edited. `THRESHOLDS` is now
exported **for T030 and nothing else**: `mayDeny: false` is a requirement rather than a setting, and
a guarantee only one integration test happens to exercise is one an edit can silently withdraw.

Allowances: `message_send` 30/300, `conversation_create` 5/60 (identifier/source). The gap is
asserted by T030 rather than left to a comment — research R5's whole point is that the harm is
breadth of contact, not volume within a thread, so the day the two converge somebody has tuned a
number without revisiting the reasoning.

### Client foundation

- [X] T031 Register the Messages destination and its nested thread address in `apps/web/src/app/navigation.ts`, **lazily loaded** per research R7 — append only, edit no existing entry
- [X] T032 Create the Messages destination shell at `apps/web/src/app/messages/Messages.tsx` rendering nothing yet

**T031 note — the nested address needed something to render, so `apps/web/src/app/messages/Thread.tsx`
was created here as scaffolding and T043 replaces it whole.** Registering `:conversationId` without
an element does not compile, and deferring the child registration to Phase 3 would have left T031
half-done. The placeholder renders an honest "not built yet" panel rather than an empty div, for the
reason `destinations/Placeholder.tsx` records: 005 shipped the first nested address and the top bar
read "Not found" over a working panel until `destinationFor` learned to resolve nested addresses —
a screen-reader user was told the page did not exist. That resolution now covers `/messages/<id>`
with no change to it.

**The thread is deliberately NOT split separately**, which is the opposite of what 006 did with
Discover's profile view. Both `lazy` entries resolve to `messages/Messages.js`, which re-exports
`Thread`. The profile view is an overlay reached once by somebody who has decided to look at one
person; the thread is this destination's primary content, rendered *beside* the list on the
two-pane layout T062 builds — splitting it would put a spinner in that pane on nearly every visit.

**T031 also turned up the asset-budget measurement defect recorded against T003 above.** Chasing an
apparent 0.5 KB overrun is what surfaced it: the local build ships development React because
`envDir` points Vite at the repository-root `.env`. The real CI figure is 91.7 KB against a 150 KB
budget. R7's urgency argument for splitting is withdrawn; the split itself stands on the rule 004
and 006 established.

**Checkpoint reached, with one designed-red exception stated rather than glossed.** Typecheck, lint,
format, `pnpm test:component` (361) and every unit suite pass — except
`tests/unit/participation-audit.test.ts`, which asserts *at least one* conversation-scoped route
exists and cannot pass until T039/T042 register them. It has been red since T015 landed. That is the
same fail-by-existence discipline the coverage guards use, with one difference worth recording: T017–T019
could close theirs inside Phase 2 and this one **structurally cannot**, because the routes it audits
belong to Phase 3. The task list's claim that `pnpm test:unit` passes at this checkpoint was
optimistic.

---

## Phase 3: User Story 1 — Reach someone you just found (P1) 🎯 MVP

**Goal**: An attendee in Discover can open a thread with a co-attendee and send a first message,
creating the conversation.

**Independent Test**: Open a co-attendee's profile in Discover, choose *Message*, send one line,
confirm it appears in the thread and in the recipient's list. Quickstart scenario 1.

### Tests for User Story 1

- [X] T033 [P] [US1] Integration test in `apps/api/tests/integration/conversation-create.test.ts`: first message creates exactly one conversation, one pair row and two participant rows
- [X] T034 [P] [US1] Integration test in `apps/api/tests/integration/conversation-pair-uniqueness.test.ts`: a second `POST /conversations` for the same pair returns 200 and appends, never creating a second conversation (FR-502, FR-510), including concurrently
- [X] T035 [P] [US1] Integration test in `apps/api/tests/integration/conversation-co-attendance.test.ts`: creation without a shared event returns 404, **indistinguishable** from a nonexistent attendee (FR-504)
- [X] T036 [P] [US1] Integration test in `apps/api/tests/integration/message-validation.test.ts`: empty, whitespace-only and over-2,000-character bodies are all refused
- [X] T037 [P] [US1] Component test in `apps/web/tests/component/composer-disabled.test.tsx`: send is disabled for empty and whitespace-only input (FR-512)

### Implementation for User Story 1

- [X] T038 [US1] Implement `createConversationWithFirstMessage` in `apps/api/src/db/queries/conversations.ts` as one transaction, catching the pair unique violation and appending rather than checking first
- [X] T039 [US1] Implement `POST /conversations` in `apps/api/src/routes/conversations.ts`, with the co-attendance `EXISTS`, the block check, and 404/409/429 responses per contract
- [X] T040 [US1] Register `apps/api/src/routes/conversations.ts` in `apps/api/src/routes/index.ts` — **not** under `routes/events/`, because these routes are cross-event (plan, Structure Decision 1)
- [X] T041 [US1] Implement `appendMessage` in `apps/api/src/db/queries/messages.ts`, trimming the body and updating `conversations.last_message_at` in the same transaction
- [X] T042 [US1] Implement `POST /conversations/{conversationId}/messages` in `apps/api/src/routes/conversations.ts` behind `requireParticipation`
- [X] T043 [P] [US1] Build the thread view at `apps/web/src/app/messages/Thread.tsx` with the conversation-starter prompt for a not-yet-created thread (FR-519, FR-503a)
- [X] T044 [P] [US1] Build the composer at `apps/web/src/app/messages/Composer.tsx` — send disabled while empty, character counter from 90% of the limit (FR-512, FR-517)
- [X] T045 [US1] Wire Discover's *message* action in `apps/web/src/app/discover/AttendeeProfile.tsx` to open the thread (FR-568) — the action appears now that its owning phase has landed
- [X] T045a [US1] E2E test in `e2e/messages-journey.spec.ts` counting the actions from an open profile to a sent first message and asserting **three or fewer** (SC-501)
- [X] T046 [US1] Ensure opening a thread performs **no write** — no conversation, participation or any other record until the first message is sent (FR-503a)
- [X] T047 [US1] Regenerate the contract with `pnpm contract:generate` and commit `contracts/openapi.json`

**T033–T036 note** — the four integration files pass, and one of them records a **framework
behaviour rather than a defect**. Fastify configures Ajv with `coerceTypes: 'array'`, the
configuration every route in this product uses, so `{"body": 42}` and `{"body": ["hello"]}` arrive
as ordinary strings and are stored as ordinary messages. `null`, an object and a multi-element
array are still refused. It is left as it is deliberately — the stored value is exactly what the
sender would see rendered, and turning coercion off for these two routes alone would make their
validation behave differently from the rest of the product. `message-validation.test.ts` asserts
the behaviour so it is a decision a reader can find rather than something discovered later.

**T038 note — a lost pair race leaves a conversation row that must be removed, and only the
transaction can know it.** `conversation_pairs`'s primary key *is* the conversation identifier, so
a conversation has to exist before the pair can be claimed. When `ON CONFLICT DO NOTHING` declines,
that conversation is deleted inside the same transaction before anybody can observe it — an
orphan has no participants, so no product surface could ever reach it, and it would accumulate one
row per contended first message with nothing to notice. `conversation-pair-uniqueness.test.ts`
asserts the absence of orphans directly, because nothing else would.

**T043/T044 note — `/messages/new/<attendeeId>` is a second nested address, and it is what FR-503a
required.** Choosing *Message* for somebody with no conversation must create nothing, so there is
no identifier to address the thread by until the first message is sent. `navigation.ts` declares
both children; React Router ranks the static `new/` segment above `:conversationId`, so the two
cannot collide. The alternative — `/messages/new?attendee=…` — would make `new` a reserved value of
`:conversationId` hiding inside a parameter.

> ### ⚠️ Phase 4 and parts of Phase 6 were pulled forward into this change, and that is recorded
> rather than discovered later.
>
> **T056–T059, T060–T065, and T093/T094/T096/T097 landed here**, because Phase 3's thread cannot
> exist without them: sending a first message navigates to `/messages/<id>`, and a destination that
> answered that address with a failure state would make "US1 is demonstrable alone" untrue. This is
> the same call T018 made when it pulled T136 and T137 forward from Phase 9 — a task that cannot be
> satisfied without a later one takes the later one with it.
>
> **Their tasks stay unticked until their own tests land in Phase 4 and Phase 6.** The code is
> here; the proof is not, and ticking a task whose test has not been written is how a coverage gap
> becomes invisible.

> ### ⚠️ A **seventh device capability** was added, and it is an outstanding governance item.
>
> `VisibilityService` joins the six the constitution's Principle V names. It is needed by research
> R4's poll, which must not run in a background tab — and the only way to ask is
> `document.visibilityState`, which `mynet/no-direct-platform-access` correctly refuses in feature
> code (SC-008 requires that count to be zero).
>
> **`packages/platform/tests/substitution.test.ts` is what caught it**, exactly as designed: its
> comment said a seventh appearing "without an amendment is a decision nobody recorded". The
> addition is therefore argued in place — in the interface, in the test, and here — and belongs in
> the same review as this feature's push amendment. The alternative was a lint exemption on
> `useConversation.ts`, which would have traded a structural boundary for a poll interval.

**Checkpoint**: An attendee can reach someone from Discover and send. US1 is demonstrable alone.
Verified: typecheck, lint, format, 285 unit, 371 component, 583 integration, contract check, and
`e2e/messages-journey.spec.ts` — including SC-501's action count, measured at **three**.

---

## Phase 4: User Story 2 — Hold a conversation (P1)

**Goal**: The list, the thread, replies, persistence across events, and the authorization that makes
all of it private.

**Independent Test**: Two accounts exchange messages, both see the thread, switching the active event
changes nothing. Quickstart scenario 2.

### Tests for User Story 2

- [X] T048 [P] [US2] **The FR-522 test** — `apps/api/tests/integration/conversation-isolation.test.ts`: a non-participant is refused read of the conversation, its messages and its unread state, with **404 not 403**, indistinguishable from a nonexistent conversation
- [X] T049 [P] [US2] Integration test in `apps/api/tests/integration/conversation-cross-event.test.ts`: the list and threads are identical before and after an event switch, and a conversation with a non-co-attendee stays fully sendable (FR-505, FR-507)
- [X] T050 [P] [US2] Integration test in `apps/api/tests/integration/message-paging.test.ts`: keyset paging over 1,000 messages returns every message exactly once, with no duplicates and no omissions
- [X] T050a [P] [US2] Unit test in `apps/api/tests/unit/no-message-mutation-routes.test.ts`: **no registered route edits or deletes an individual message** (FR-516). The implementation of FR-516 is an absence, and an absence needs a test or it erodes — the same reasoning `no-report-read-surface` uses for FR-548
- [X] T051 [P] [US2] Component test in `apps/web/tests/component/messages-states.test.tsx`: loading, empty and failure states for both list and thread
- [X] T052 [P] [US2] Component test in `apps/web/tests/component/messages-responsive-mobile.test.tsx`: list and thread are separate full-width views with a back affordance, and **no horizontal scrolling** (FR-580)
- [X] T053 [P] [US2] Component test in `apps/web/tests/component/messages-responsive-desktop.test.tsx` and tablet: two-pane workspace, list column plus thread
- [X] T054 [P] [US2] E2E test in `e2e/messages-journey.spec.ts`: the full send-and-reply journey across two sessions
- [X] T055 [P] [US2] E2E test in `e2e/messages-conference-switch.spec.ts`: event switching leaves Messages untouched

### Implementation for User Story 2

- [X] T056 [US2] Implement `listConversations` in `apps/api/src/db/queries/conversations.ts`, ordered by `last_message_at` desc, projecting `counterpart: null` for a departed participant
- [X] T057 [US2] Implement `GET /conversations` in `apps/api/src/routes/conversations.ts`
- [X] T058 [US2] Implement keyset `listMessages` in `apps/api/src/db/queries/messages.ts`, newest first, opaque cursor over `(sent_at, id)` (research R6)
- [X] T059 [US2] Implement `GET /conversations/{conversationId}/messages` behind `requireParticipation`, projecting `mine` and **never an author identifier**
- [X] T060 [P] [US2] Build the conversation list at `apps/web/src/app/messages/ConversationList.tsx` — vertical, never a horizontally-scrolling strip (FR-580)
- [X] T061 [P] [US2] Build the empty and failure states at `apps/web/src/app/messages/MessagesEmptyStates.tsx`, including the invitation to find someone in Discover
- [X] T062 [US2] Implement the two-pane desktop and tablet layout and the stacked mobile layout in `apps/web/src/app/messages/Messages.tsx`
- [X] T063 [US2] Implement `useConversation` in `apps/web/src/app/messages/useConversation.ts` with the **3-second poll, only while a thread is open and the document is visible**, stopping on hidden and refetching immediately on becoming visible (research R4)
- [X] T063a [US2] E2E test in `e2e/messages-journey.spec.ts` measuring wall-clock time from one session's send to the message appearing in the other's open thread, asserting **under five seconds** (SC-502). Research R4 chose the 3-second interval specifically to reach this number; without this task the number is a claim rather than a result
- [X] T064 [US2] Implement older-page loading as the reader scrolls back, reversing the newest-first page for display
- [X] T065 [US2] Announce newly arrived messages to assistive technology without moving focus (FR-585)
- [X] T066 [US2] Refuse composing while offline with a clear explanation, and **never queue** (FR-565); show the standard offline state for the destination (FR-564)
- [X] T067 [US2] Regenerate the contract and commit `contracts/openapi.json`

> ### ⚠️ Two real defects were found by these tests, and both were **intermittent or invisible**
> without them.
>
> **1. The keyset cursor truncated `sent_at` to milliseconds** while PostgreSQL stores
> microseconds, so the `<` bound landed *before* every row sharing the page boundary's
> millisecond and skipped them. The symptom was silent omission, not an error — and it failed
> only when the stored microseconds happened to be non-zero, so `message-paging.test.ts` failed on
> one run and passed on the next from the same tree. Fixed by carrying a second,
> microsecond-precision rendering of the instant in the cursor only; the wire format is unchanged.
> A burst of messages or any batch insert shares a millisecond routinely, so this would have lost
> real messages.
>
> **2. A failed first read of a thread rendered "Loading this conversation…" forever.**
> `useConversation` had two effects — a loud initial read and a quiet poll — and both fired on
> mount. The poll's read claimed the newest sequence number, so the initial read's rejection was
> discarded as superseded and no failure state was ever set. Fixed by merging them into one effect
> and deciding what a failure does to the screen from **whether anything has ever loaded**, not
> from which effect issued the read. `messages-states.test.tsx` caught it.

**T052/T053 note** — both responsive files assert **structure**, not measurement, and say so at
length in their headers. jsdom computes no layout, so a component test claiming "no horizontal
scrolling at 320px" would assert nothing. `e2e/responsive.spec.ts` measures at real widths (T140).

**T054/T063a note — every thread assertion is scoped to the thread region**, because a message's
text legitimately appears twice on the two-pane layout: once as its row's preview (FR-509) and once
as the message. An unscoped `getByText` fails Playwright's strict mode, which is the tooling
reporting a genuinely ambiguous page rather than an inconvenience.

**Checkpoint**: Messages is a working destination. US1 and US2 together are a demonstrable product.
Verified: typecheck, lint, format, 292 unit, 401 component, 612 integration, contract check, and
six end-to-end scenarios — including **SC-502 measured under five seconds** with no reload and no
notification permission.

---

## Phase 5: User Story 3 — Stop unwanted contact (P1)

**Goal**: Block and report, both server-enforced, with reports leaving the product by mail and
readable by nothing inside it.

**Independent Test**: Block from one account, confirm the other's send is refused; report and confirm
block, record and dispatch. Quickstart scenario 3.

### Tests for User Story 3

- [X] T068 [P] [US3] Integration test in `apps/api/tests/integration/block-enforcement.test.ts`: a blocked attendee is refused both sending into an existing conversation and creating a new one (FR-536)
- [X] T069 [P] [US3] Integration test in `apps/api/tests/integration/block-non-disclosure.test.ts`: the refusal carries **no indication that a block exists** (FR-537)
- [X] T070 [P] [US3] Integration test in `apps/api/tests/integration/block-directional.test.ts`: A-blocks-B and B-blocks-A are independent, and unblocking one leaves the other (FR-540)
- [X] T070a [P] [US3] Integration test in `apps/api/tests/integration/block-preserves-history.test.ts`: blocking deletes **no message**, the blocker's history is intact and unchanged, and unblocking restores sending without having lost anything (FR-538)
- [X] T071 [P] [US3] Integration test in `apps/api/tests/integration/report-effects.test.ts`: reporting blocks, writes a row, and dispatches mail — **and still blocks and writes when dispatch fails** (FR-549)
- [X] T072 [P] [US3] Integration test in `apps/api/tests/integration/report-mail-contents.test.ts`: the dispatched mail carries identifiers and a timestamp only — **no message text and no reason string** (research R11)
- [X] T073 [P] [US3] Unit test in `apps/api/tests/unit/no-report-read-surface.test.ts`: **no route in the registered table reads `abuse_reports`**, and `ReportRepository` exposes no read method (FR-548, SC-508)
- [X] T074 [P] [US3] Component test in `apps/web/tests/component/block-report-dialogs.test.tsx`: both dialogs dismiss on Escape and restore focus to the opener (FR-583); report submit is disabled while the reason is empty (FR-546)

### Implementation for User Story 3

- [X] T075 [P] [US3] Implement block queries in `apps/api/src/db/queries/blocks.ts` — create, delete, list, and the `EXISTS` the send path calls
- [X] T076 [US3] Add the block check to both `POST /conversations` and `POST /conversations/{id}/messages`, returning the reasonless 409 (FR-536, FR-537)
- [X] T077 [P] [US3] Implement `POST /blocks`, `DELETE /blocks/{attendeeId}` and `GET /blocks` in `apps/api/src/routes/blocks.ts`, all idempotent
- [X] T078 [P] [US3] Implement report write in `apps/api/src/db/queries/reports.ts` — **write only, no read function exists**
- [X] T079 [US3] Add `sendAbuseReport` to `MailService` in `apps/api/src/mail/service.ts`, carrying identifiers only, with the justification recorded in the file header alongside the existing guard's reasoning (research R11)
- [X] T080 [P] [US3] Implement `sendAbuseReport` in `apps/api/src/mail/sink-adapter.ts`
- [X] T081 [US3] Implement `POST /reports` in `apps/api/src/routes/reports.ts` — block first, write second, dispatch third, with dispatch failure isolated exactly as verification mail is
- [X] T082 [P] [US3] Build the block confirmation at `apps/web/src/app/messages/BlockConfirm.tsx` as a native `<dialog>` with `showModal()`, Escape dismissal and explicit focus restoration
- [X] T083 [P] [US3] Build the report dialog at `apps/web/src/app/messages/ReportDialog.tsx`, submit disabled while the reason is empty
- [X] T084 [US3] Add the blocked-composer state with its explanation and unblock action to `apps/web/src/app/messages/Thread.tsx` (FR-539)
- [X] T085 [US3] Build the block-management list at `apps/web/src/app/profile/Blocks.tsx` on the existing account surface — **not a sixth destination** — with its loading, empty and failure states (FR-541a)
- [X] T086 [US3] Add block and report entry points to the thread header and the attendee profile view
- [X] T087 [US3] Regenerate the contract and commit `contracts/openapi.json`

> ### ⚠️ **`DELETE /blocks/{attendeeId}` was amended to `DELETE /blocks` with the target in the
> body, because the contract's shape fails a shipped guard.**
>
> `tests/unit/event-scope-audit.test.ts` forbids outright any route naming an attendee identifier
> in its URL with a write method — *"a write route naming an attendee is a route that can act on
> somebody else"* (FR-385). 004 narrowed 001's rule to permit a **read** naming an attendee, under
> the event guard and behind three server-side conditions, and explicitly kept writes closed.
> Unblocking is a write.
>
> The body form is what the neighbouring routes already use: `POST /blocks`, and the contract's own
> `DELETE /push/subscriptions`. Recorded in the contract page and in the route file. **The audit
> caught this, not a reviewer.**

> ### ⚠️ Two more defects the tests found.
>
> **1. A malformed recipient identifier answered 500 instead of 404.** Adding the block check ahead
> of conversation creation put an unvalidated identifier into a `::uuid` cast — and a 500 is
> distinguishable from the 404 a nonexistent attendee gets, which makes the route an oracle for
> "is this even a well-formed identifier". `blockExistsBetween` now matches before it casts.
>
> **2. `identity-isolation.test.ts` rested on a premise 007 falsified.** Its stricter "answers 401"
> assertion selected `GET` and `DELETE` by method, on the reasoning that neither carries a body. Two
> of this feature's DELETEs do — precisely *because* of the amendment above. It now reads
> bodylessness from the route's own schema, which is the fact the assertion actually depends on.

**T079 note — the third `MailService` method is the deliberate act the interface was shaped to
force.** Its header says two methods exist *so that adding a third requires editing this file*. The
case is argued in place: the message goes to the **operator** rather than to an attendee, it carries
identifiers and a timestamp only — never message text and never the reason string (research R11) —
and there is still no generic `send`, so a fourth would require the same act again.
`report-mail-contents.test.ts` searches the whole captured call for content that must not be there.

**T082/T083 note — both dialogs reuse 004's `ConfirmDialog` rather than opening a second
`<dialog>`.** The task describes the native modal treatment, which is exactly what that component
already is — including the part that is easy to get wrong and invisible in the source: **the
ordering**, because everything behind a modal dialog is inert and an inert element cannot take
focus, so restoring before closing succeeds silently and drops a keyboard reader to the top of the
document. A duplicate would be a second place for that to drift. `ConfirmDialog` gained one optional
prop (`confirmDisabled`) so the report dialog can satisfy FR-546 without reimplementing anything.

**Checkpoint**: Open send is safe to ship. US1–US3 are the smallest responsible release.
Verified: typecheck, lint, format, 300 unit, 416 component, 656 integration, contract check.

---

## Phase 6: User Story 4 — Know something is waiting (P2)

**Goal**: Private per-participant unread state, the conversation-list marker, and Home's indicator.

**Independent Test**: Receive a message, see the indicator on Home and the marker in the list, open
the thread, see both clear. Quickstart scenario 4.

### Tests for User Story 4

- [X] T088 [P] [US4] Integration test in `apps/api/tests/integration/unread-read-position.test.ts`: unread follows the read position, **not who spoke last** — a thread the attendee last replied in with newer messages above still reads unread (FR-527)
- [X] T089 [P] [US4] Integration test in `apps/api/tests/integration/unread-privacy.test.ts`: no response anywhere projects another attendee's read position (FR-530, SC-512)
- [X] T090 [P] [US4] Integration test in `apps/api/tests/integration/read-position-monotonic.test.ts`: naming an older message does not move the position backwards
- [X] T090a [P] [US4] Integration test in `apps/api/tests/integration/unread-send-isolation.test.ts`: **sending a message does not by itself advance the sender's read position** beyond messages actually displayed to them — a reply must not silently mark older unread messages read (FR-529)
- [X] T091 [P] [US4] Component test in `apps/web/tests/component/unread-card-independence.test.tsx`: the unread card's failure leaves every other Home card rendering (FR-533, SC-517)
- [X] T092 [P] [US4] E2E test in `e2e/messages-unread.spec.ts`: indicator appears, opening clears it

### Implementation for User Story 4

- [X] T093 [US4] Implement unread derivation in `apps/api/src/db/queries/conversations.ts` using `last_read_message_id`, and a cheap `EXISTS` for the Home question (research R13)
- [X] T094 [P] [US4] Implement `PUT /conversations/{conversationId}/read`, idempotent and monotonic, writing **only the caller's own participant row**
- [X] T095 [P] [US4] Implement `GET /conversations/unread` returning `{ hasUnread }` — a boolean, not a count, and its own route so the Home card need not fetch the list
- [X] T096 [US4] Add the unread marker to `apps/web/src/app/messages/ConversationList.tsx`
- [X] T097 [US4] Advance the read position when a thread is opened and as new messages are displayed (FR-528)
- [X] T098 [P] [US4] Build the Home card at `apps/web/src/app/home/cards/UnreadMessages.tsx`, owning its loading, empty and failure states, rendering **nothing at zero** (FR-531)
- [X] T099 [US4] Append the card to `HOME_CARDS` in `apps/web/src/app/home/registry.ts` — **one import, one entry, nothing above touched**
- [X] T100 [US4] Confirm nothing anywhere renders a read receipt, delivery tick, typing indicator or presence (M5)
- [X] T101 [US4] Regenerate the contract and commit `contracts/openapi.json`

> ### ⚠️ **FR-531 conflicts with a shipped invariant, and the conflict is resolved by a declared
> exception rather than by weakening either side.**
>
> `home-cards.test.tsx` holds every card to SC-109: four distinguishable, non-empty bodies —
> loading, populated, empty, failed. FR-531 requires this card to render **nothing** at zero, and
> its loading state is silent for the same reason (a skeleton resolving to nothing is a flicker in
> the first viewport on every load).
>
> The card is therefore listed in `ABSENT_WHEN_NOTHING_TO_SAY` and held to its **own** matrix:
> nothing when loading, nothing when empty, something when populated, and — the half that
> matters — a real retryable failure state, because an indicator that vanished on failure would
> let an attendee conclude nobody had messaged them (FR-533, SC-517).
>
> `home-card-independence.test.ts` needed the same care: its "every read fails" scenario had left
> `hasUnread` at the quiet default, so the card would have been absent for the *wrong reason*. It
> now fails that read too.

**T099 note — a fragile assertion was retired rather than moved on again.** `home-registry.test.ts`
asserted "006's card is last, because it was appended", having previously asserted the same of
005's. That is a claim only the most recent contributor can satisfy, so every future feature
inherits an edit to somebody else's assertion — in the one file whose whole purpose is that
features do not edit each other's lines. What FR-226 protects is that the **established prefix** is
unchanged, which the assertions above it already check.

**T100 note — the M5 absences got a test, because a confirmation without one is a comment.**
`apps/web/tests/unit/messages-absences.test.ts` refuses read receipts, delivery ticks, typing
indicators and presence by name across the destination's source, with comments stripped first so the
reasoning can name what it forbids. It immediately caught a ref called `lastSeen` — an announcement
high-water mark, not presence, but named indistinguishably from it. Renamed to `announcedThrough`.

**Checkpoint**: Home's requirement list gains its unread indicator. US1–US4 complete the destination.
Verified: typecheck, lint, format, 306 unit, 426 component, 684 integration, contract check, and
`e2e/messages-unread.spec.ts` walking arrival → indicator → open → cleared.

---

## Phase 7: User Story 5 — Be reached when the app is closed (P2)

**Goal**: Web Push delivery, permission handled honestly, and a product that is complete without it.

**⚠️ GATED**: This phase implements M4, which register entry 10 currently forbids. **It must not
merge before the constitution amendment lands.** The provider decision blocks only T110's real
adapter; everything else here is buildable and testable against the sink.

**Independent Test**: Grant permission, close the app, send from the other account, confirm dispatch
and that activating the notification opens the conversation. Then deny permission and run US1–US4
unchanged. Quickstart scenario 5.

### Tests for User Story 5

- [X] T102 [P] [US5] Integration test in `apps/api/tests/integration/push-dispatch.test.ts`: a send dispatches to every subscription the recipient has, carrying sender name and body (M7)
- [X] T103 [P] [US5] Integration test in `apps/api/tests/integration/push-subscription-lifecycle.test.ts`: re-registering an endpoint replaces rather than accumulates; revoking one device leaves others (FR-555, FR-556)
- [X] T104 [P] [US5] Integration test in `apps/api/tests/integration/push-gone.test.ts`: a permanently failing subscription is **discarded**, not retried forever (FR-557)
- [X] T105 [P] [US5] Integration test in `apps/api/tests/integration/push-blocked-sender.test.ts`: **no dispatch** for a sender the recipient blocks, evaluated at dispatch time (FR-542, FR-558)
- [X] T106 [P] [US5] Component test in `apps/web/tests/component/push-permission.test.tsx`: the attendee is told what notifications are for **before** any permission prompt (FR-551)
- [X] T107 [P] [US5] Component test in `apps/web/tests/component/push-denied-fallback.test.tsx`: with permission denied, every US1–US4 surface behaves identically (FR-552, SC-504)

### Implementation for User Story 5

- [X] T108 [P] [US5] Define the vendor-free `PushService` port in `apps/api/src/notifications/service.ts`, returning `'delivered' | 'gone' | 'failed'` so the caller can tell a finished device from a retryable failure
- [X] T109 [P] [US5] Implement `apps/api/src/notifications/dispatch.ts` with timeout and failure isolation, mirroring `apps/api/src/mail/dispatch.ts`
- [X] T110 [P] [US5] Implement `apps/api/src/notifications/sink-adapter.ts` recording rather than sending — **this is what makes the phase buildable without a provider**
- [X] T111 [US5] Implement subscription queries in `apps/api/src/db/queries/push-subscriptions.ts` — upsert by endpoint, list by attendee, delete
- [X] T112 [P] [US5] Implement `POST /push/subscriptions` and `DELETE /push/subscriptions` in `apps/api/src/routes/push.ts`, binding the endpoint to the calling session
- [X] T113 [US5] Fan out dispatch on the send path, truncating the body to the payload budget, after the block check
- [X] T113a [US5] Integration test in `apps/api/tests/integration/push-latency.test.ts` measuring elapsed time from message accepted to dispatch handed to the sink, asserting **well inside thirty seconds** (SC-503)
- [X] T114 [US5] Extend `NotificationService` in `packages/platform/src/interfaces/index.ts` with `subscribe`, `unsubscribe` and `currentSubscription` over a domain `DeviceSubscription` shape — **not** the browser's `PushSubscription`
- [X] T115 [US5] **Rewrite the interface's "MUST NOT be wired to real delivery" comment**, which restates the register entry M4 reverses; leaving it above a real implementation would make the file contradict itself
- [X] T116 [US5] Implement the real notification service in `packages/platform/src/web/devices.ts`, replacing the deliberate no-op and its "do not finish this" comment
- [X] T117 [US5] Switch `apps/web/vite.config.ts` from `generateSW` to `strategies: 'injectManifest'` (research R2)
- [X] T118 [US5] Write the source service worker at `apps/web/src/sw.ts`, **carrying across `navigateFallback`, the API cache exclusion and precache eviction** — the highest-risk mechanical step in this feature, since dropping the API exclusion would serve the HTML shell for API requests
- [X] T119 [US5] Implement the `push` and `notificationclick` handlers in `apps/web/src/sw.ts`, opening the application on the conversation (FR-554)
- [X] T120 [US5] Build the permission explanation surface in `apps/web/src/app/messages/NotificationPrompt.tsx` — shown before any browser prompt
- [X] T121 [US5] Register and surrender subscriptions through the repository as permission changes
- [X] T122 [US5] Confirm `mynet/no-direct-platform-access` still reports zero violations after the service-worker work (SC-008)
- [X] T123 [US5] Confirm **no notification bell and no in-app notification centre** exist anywhere (FR-560)
- [X] T123a [US5] Unit test in `apps/api/tests/unit/notification-triggers.test.ts`: **a received message is the only thing that dispatches a notification** (FR-561). Distinct from T123, which covers the bell — this covers the trigger set, and it is the guard that stops 008 and 009 quietly adopting the platform for appointments and Q&A without a decision
- [X] T124 [US5] Regenerate the contract and commit `contracts/openapi.json`

**Checkpoint**: Push works, and denying it costs nothing but push.

> ### Phase 7 notes
>
> **The gate opened rather than being bypassed.** Constitution **v3.1.0** resolved register entry 10
> in part — delivery in for a received message, the bell and an in-app notification centre still
> out — and ratified the two smaller items alongside it: `VisibilityService` as a seventh capability,
> and the operator address. Phase 7 was written before that and is unchanged by it.
>
> **T117/T118 — `injectManifest` needed its own TypeScript program, and finding that out was the
> whole risk of the step.** `src/sw.ts` carries `/// <reference lib="webworker" />`, and TypeScript
> merges lib references across a *program*, not a file. Inside the application's `tsconfig.json` the
> worker's globals merged into the DOM ones and `globalThis.addEventListener('keydown', …)` in
> `tests/setup.ts` stopped inferring `KeyboardEvent`. That error was the visible half; the invisible
> half was every DOM global in the client quietly acquiring a worker meaning. `tsconfig.sw.json`
> typechecks the worker against `["ES2023", "WebWorker"]` and the application excludes it — both
> programs run in `typecheck` and `build`, so the worker is no less checked, only checked correctly.
> It has **no `DOM` lib** on purpose: a reference to `document` in a service worker must fail to
> compile rather than fail on somebody's phone.
>
> **T120 — the permission surface is in Messages, and it renders nothing once answered.** FR-551's
> ordering cannot be enforced inside the capability, so it is enforced by construction:
> `NotificationPrompt.tsx` is the only caller of `requestPermission` in the client, and
> `no-notification-surface.test.ts` asserts that. Its resting state is *absent* — no badge, no
> count, no chrome — which is FR-560 carried forward rather than merely not-yet-violated.
>
> **T121 — surrendering a registration needs a record of what was registered.** When permission is
> revoked the browser discards the subscription, so by the time the revocation is observable the
> endpoint that needs deleting server-side is already gone from the device. The endpoint is kept in
> `SecureStorage`, which makes `clear()` at sign-out do exactly the right thing on a shared browser:
> the next account sees no known endpoint, re-registers the same one, and the server reassigns it.
>
> **T122 — the service worker is declared an adapter rather than accidentally passing.**
> `mynet/no-direct-platform-access` reported zero before and after, but only because it does not
> look at `self.*`. A service worker has no registry to reach through — `self.registration`,
> `self.clients` and `caches` are the only way to do anything inside one — so `eslint.config.js`
> now exempts `apps/web/src/sw.ts` explicitly, on the same reasoning as the composition root. An
> exemption that rests on a detector's blind spot is not an exemption.
>
> **Not a task, done anyway: the deployment platform could not be configured for any of this.**
> `deploy/vm/.env.example` and `docker-compose.yml` named neither `MAIL_OPERATOR_ADDRESS` nor the
> three `PUSH_VAPID_*` variables, so a deployed environment had no way to turn on either the
> operator mail or delivery. Both files now carry them, blank, with what a blank value costs. This
> is configuration wiring for `config.ts` values T002 already added — it chooses nothing and
> settles neither open register entry.
>
> **An e2e failure that was ours and pre-existing.** `agenda-saved.spec.ts` read
> `allTextContents()` — a snapshot, which does not auto-wait — immediately after a helper that
> waits only for the `<h1>`. It passed on timing until the service-worker change shifted that
> timing, then failed with "the seeded programme has fewer than two sessions" against a page whose
> failure snapshot shows the whole programme. One retrying assertion first fixes both it and the
> identical read in `agenda-offline.spec.ts`.

---

## Phase 8: User Story 6 — A conversation outlives the other person (P3)

**Goal**: The M3 cascade, proven, and the surviving one-sided conversation rendered honestly.

**Independent Test**: Delete one account, confirm the survivor keeps their own messages and nothing
of the departed attendee is rendered. Quickstart scenario 6.

### Tests for User Story 6

- [X] T125 [P] [US6] Integration test in `apps/api/tests/integration/conversation-deletion.test.ts`: deleting an account removes their messages from **every** conversation, not only their own view (FR-570, SC-509)
- [X] T126 [P] [US6] Integration test in `apps/api/tests/integration/conversation-no-tombstone.test.ts`: no name, avatar or identifier of the departed attendee survives anywhere — asserted against the **API response**, where `counterpart` must be `null` (FR-573, SC-510)
- [X] T127 [P] [US6] Integration test in `apps/api/tests/integration/conversation-empty-removal.test.ts`: a conversation with no participants left is removed (FR-575)
- [X] T128 [P] [US6] Integration test in `apps/api/tests/integration/conversation-closed-send.test.ts`: sending into a one-sided conversation is refused server-side (FR-574)
- [X] T129 [P] [US6] Integration test in `apps/api/tests/integration/report-retention.test.ts`: reports cascade from both attendees and the 90-day sweep clears the rest (research R3)
- [X] T130 [P] [US6] Component test in `apps/web/tests/component/departed-counterpart.test.tsx`: **the empty-and-closed thread shows the closed explanation, never the conversation-starter prompt** (FR-519a) — the case where the departed attendee wrote every message

### Implementation for User Story 6

- [X] T131 [US6] Extend `deleteAccount` in `apps/api/src/db/queries/account.ts` so the message and participation cascades are exercised and the empty-conversation removal runs
- [X] T132 [US6] Derive conversation state from the participant count in `apps/api/src/db/queries/conversations.ts` — **no `status` column**, per the data model
- [X] T133 [US6] Refuse sends into a one-sided conversation on the server, with 403 rather than the reasonless 409 used for blocks (contract)
- [X] T134 [US6] Render the closed-thread state in `apps/web/src/app/messages/Thread.tsx`, choosing it over the starter prompt whenever the thread is closed (FR-519a)
- [X] T135 [US6] Render a departed counterpart in the conversation list from `counterpart: null` and `state`, with no placeholder name or avatar

**T131 note — the empty-conversation removal is the one thing M3's cascades cannot do for
themselves, and the one nobody would ever notice.** `conversations` holds no attendee foreign key
at all — deliberately, since a row naming a departed attendee would breach FR-573, which is the
entire reason `conversation_pairs` exists (research R10). So when *both* participants leave, every
other row cascades away and the conversation itself stays: unreachable by every product surface,
therefore never reported, accumulating one row per pair who both left.

**T133 note — the closed refusal is 403 with an explanation, and it is checked BEFORE the block
check.** Ordering matters: `blockExistsInConversation` resolves the counterpart from the participant
rows and correctly finds none for a one-sided conversation, so it would answer "no block" and let
the send through. The two refusals differ deliberately (contract) — a closed conversation is a fact
about a thread the caller can already see every message of, so explaining it discloses nothing about
another attendee, while a block must say nothing at all (FR-537).

**Checkpoint**: Deletion is honest in both directions. All six stories complete.
Verified: typecheck, lint, format, 306 unit, 435 component, 713 integration, contract check.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T136 [P] Add the export sections for authored messages, blocks and subscriptions to `assembleExport` in `apps/api/src/db/queries/account.ts`, with subscription keys **redacted** (research R14)
- [X] T137 [P] Add the stated note to the export explaining that received messages are excluded and why (FR-578)
- [X] T138 [P] Integration test in `apps/api/tests/integration/messages-export.test.ts`: authored messages present, received messages absent, keys absent
- [X] T139 [P] Accessibility pass in `e2e/accessibility.spec.ts` covering the list, thread, composer, both dialogs and the block list (FR-582, FR-584, SC-515)
- [X] T140 [P] Responsive pass in `e2e/responsive.spec.ts` asserting **no horizontal scrolling** at any supported width (FR-586, SC-516)
- [X] T141 [P] Offline e2e in `e2e/messages-offline.spec.ts`: the destination shows the offline state, discloses no content, and a composed message is never sent later (FR-563–FR-565, SC-513, SC-514)
- [X] T142 Run `pnpm budget` and confirm the asset budget passes with Messages code-split; **do not raise the budget** (research R7)
- [X] T143 [P] Performance check that a 1,000-message conversation renders its most recent page without transferring the whole history (SC-518)
- [X] T144 [P] Add seed data for a conversation between the two seeded accounts in `apps/api/src/db/seed/`, so the destination is not empty on a fresh clone
- [X] T145 Update `CLAUDE.md` — current state, the new architectural invariants (participation scope, the two extended ports), and migrations claimed through `0006`
- [X] T146 Update `brainstorm/00-overview.md` with 007's delivered state
- [X] T147 Run the full `pnpm verify` and confirm all ten gates pass
- [ ] T148 Walk every scenario in [`quickstart.md`](./quickstart.md) by hand, with two browser profiles
      — **PARTIALLY DONE, and carried forward past the merge.** Scenario 5 was walked twice against
      a real push service, which found two genuine defects (see the note below). Scenarios 1–4 and 6
      were not walked. This remains the outstanding validation for 007 and the only review the
      desktop and tablet layouts have had.
      — **outstanding, and it needs a person.** Every scenario has automated coverage (the six
      end-to-end specs walk the journeys, including two-session exchange and the unread round
      trip), but by-hand review is the step that catches what passing tests cannot: whether the
      two-pane workspace *reads* well, whether the copy is right, and whether the closed-thread and
      blocked states feel honest. It is also the only check on the desktop and tablet layouts,
      which register entry 4 leaves unvalidated.

> ### ⚠️ **Scenario 5 was walked for real, and the walk itself found two defects.**
>
> The by-hand run that T148 asks for was done for scenario 5 only, and it paid for itself twice:
>
> 1. **`pnpm start` could not test notifications at all.** `vite.config.ts` carried
>    `devOptions: { enabled: false }` from 001 — correct while the worker only cached the shell,
>    and a wall once Web Push depended on a registered worker. Enabling it was not sufficient:
>    `injectRegister: 'auto'` injects registration **at build time only**, so `main.tsx` now
>    registers explicitly. The workaround before that was a two-terminal build-and-preview dance
>    for what is otherwise a one-command project.
> 2. **A private/incognito window cannot hold a push subscription**, and the product said the wrong
>    thing about it. Permission is granted, the subscribe that follows fails, and the attendee was
>    told "you can try again" about a permanent condition. The failure message now names the cause.
>    This is exactly how the feature was first mis-diagnosed as broken.
>
> Both were invisible to all ten gates. Neither would have been found by any test in this
> repository, because both are about what happens in a real browser a person is holding — which is
> the argument for T148 rather than an argument against it.

> ### ⚠️ **`quickstart.md` was reviewed against the built feature, and asked for two things the code
> could not do.**
>
> The document was written during planning and had never been walked. Reviewing it found the usual
> drift — `pnpm db:migrate` and `pnpm db:seed` that `pnpm start` already calls, `/api/...` paths that
> only exist behind Caddy, `messages.sender_id` for a column named `author_id`, block and report
> placed on the profile rather than in the thread header, and a scenario 1 that checks
> `conversations` is empty when T144's seed guarantees it is not. Those are documentation defects and
> were fixed as such.
>
> **Two were not documentation defects.** Each is a case of a walkthrough step being impossible, and
> in both the impossibility was the interesting part:
>
> 1. **"Inspect the push sink" had no referent.** `SinkPushService` recorded into a private field and
>    a *successful* dispatch logged nothing — no response change, no database change, no line
>    anywhere. The one path in this feature that cannot be seen in the interface was also the one
>    path that left no trace. It now logs the recorded delivery, **in development only** (message
>    bodies are content, not diagnostics) and at **`warn`**, because `app.ts` sets the development
>    level to `warn` and an `info` line would have been written to nowhere — the same failure again,
>    one layer down.
>
> 2. **`navigator.serviceWorker.ready` never resolves when nothing is registered.** It does not
>    reject and does not resolve to `null`; it waits forever. Production always has a worker, so this
>    is invisible there — but `devOptions: { enabled: false }` means **`vite dev` registers none**,
>    so granting permission on the development server left `subscribe()` pending for the lifetime of
>    the page, with the button disabled and no error. Bounded at three seconds, resolving to the
>    `null` the rest of the file already handles. The quickstart now also says plainly that scenario
>    5 needs a `preview` build rather than the dev server.
>
> **And one latent race in the end-to-end harness, unrelated to 007.** `redeployApi()` waited on
> `/health` before returning — the exact mistake `deploy/vm/README.md` warns about in its own words:
> *a container with an unreachable database answers `/health` perfectly and every attendee request
> with a failure*. The restarted API could be "healthy" with its pool still connecting, and the next
> `page.reload()` would load a workspace whose reads had failed. `durability.spec.ts` failed on a
> missing greeting once in a full `pnpm verify` and passed in isolation, which is the signature. It
> now waits on `/ready`. **The fix is correct on its own terms; a single intermittent failure does
> not prove it was the cause.**

---

> ### ⚠️ **T142 — the asset budget gate was answering the wrong question, and now refuses to.**
>
> `pnpm verify` runs `pnpm build` without `NODE_ENV=production`, so the repository-root `.env`
> (loaded because `envDir: '../..'`) sets `NODE_ENV=development` and Vite emits **development**
> React. A local verify therefore failed at **150.4 KB** against a 150 KB budget — a figure CI, which
> has no `.env`, never computes. In production mode the same tree measures **91.7 KB, with 58.3 KB
> to spare**: unchanged from T003's corrected baseline, because Messages is code-split.
>
> `scripts/asset-budget.mjs` now **detects a development build and declines to judge it**, naming
> the cause and the one-line fix. It does not fail: a red result about a bundle nobody receives is
> as useless as a green one. This deliberately settles none of the three decisions T003 left
> unclaimed — whether the web build should ignore the root `.env`, whether `.env.example` should
> stop seeding `NODE_ENV`, and whether local e2e *wants* the development diagnostics.

**T139/T140 note — two real accessibility defects, both found by the browser and neither visible in
source.** The timestamp on a *sent* message used `text-inverse/80` on the accent (below 4.5:1 at
every width), and the conversation preview used `text-muted`, which `tokens.css` documents as
passing on `cream-100` — but the **selected** row's background is `cream-200`, where it fails. Both
fixed by choosing a documented-passing pair; hierarchy comes from size, which it already did.

**T140 note — two pre-existing responsive assertions needed narrowing, not weakening.** They queried
`getByRole('link', { name: destination.label })`, which Playwright matches by substring — and Home's
new unread card is a link named "You have unread messages…", which matched the *Messages*
destination. Both now use `exact`, which is what they always meant.

**e2e note — `threadOf` is selected structurally rather than by name.** The thread's accessible name
is the counterpart's display name once loaded, so a name-matching helper silently stopped matching
when Phase 5 put the counterpart in the header. It is now "the region nested inside the Messages
region", which no header change can break.

## Requirement coverage

| Requirement group | Tasks |
|---|---|
| Conversations (FR-501–FR-510) | T005, T029, T033–T035, T038–T040, T046, T056–T057, T060 |
| Messages (FR-511–FR-519a) | T006, T029, T036–T037, T041–T044, T050a, T058–T059, T064, T134 |
| Authorization (FR-520–FR-525) | T014–T016, T040, T042, T048, T059, T133 |
| Unread (FR-526–FR-533) | T088–T101, T090a |
| Block (FR-534–FR-542) | T007, T068–T070, T070a, T075–T077, T082, T084–T086, T105 |
| Report (FR-543–FR-549) | T008, T071–T073, T078–T081, T083 |
| Notifications (FR-550–FR-562) | T009, T102–T124, T113a, T123a |
| Offline & client (FR-563–FR-569) | T020–T027, T031, T045, T060, T066, T141 |
| Deletion & export (FR-570–FR-579) | T017–T019, T125–T131, T136–T138 |
| Layout & a11y (FR-580–FR-586) | T052–T053, T062, T065, T074, T139–T140 |

### Success criteria with an explicit measurement task

Every SC that states a number now has a task that measures it, rather than a task that implements
something intended to achieve it.

| Criterion | Measured by |
|---|---|
| SC-501 — three actions to a first message | T045a |
| SC-502 — five seconds in an open thread | T063a |
| SC-503 — thirty seconds to a device | T113a |
| SC-505 — non-participant refused | T048 |
| SC-509 / SC-510 — deletion completeness | T125, T126 |
| SC-518 — 1,000-message conversation | T143 |

### Requirements whose implementation is an absence

These four state that something must **not** exist. An absence has no implementing task by nature,
so each gets a test that fails if the absence ever ends — the pattern `no-report-read-surface`
establishes for FR-548.

| Requirement | Guarded by |
|---|---|
| FR-516 — no individual message edit or delete | T050a |
| FR-538 — blocking deletes nothing | T070a |
| FR-548 — no in-product report reader | T073 |
| FR-560 — no bell, no notification centre | T123 |
| FR-561 — a received message is the only notification trigger | T123a |

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies.
- **Phase 2 (Foundational)** — blocks every story. T004 must precede T012; T013 must follow it.
  T017–T019 must land with T005–T013, not after.
- **Phase 3 (US1)** — the MVP. Depends on Phase 2 only.
- **Phase 4 (US2)** — depends on Phase 2. Reads what US1 writes but is independently testable with
  seeded rows.
- **Phase 5 (US3)** — depends on Phase 2. T076 touches routes US1 created, so it follows Phase 3.
- **Phase 6 (US4)** — depends on Phase 2 and on messages existing.
- **Phase 7 (US5)** — depends on Phase 2 and on the send path. **Also gated on the constitution
  amendment**, which is not a code dependency.
- **Phase 8 (US6)** — depends on Phase 2's cascades and Phases 3–4's surfaces.
- **Phase 9 (Polish)** — depends on everything intended for the release.

### Story dependencies

US1 and US2 are the pair that must ship together to be worth shipping. **US3 must ship with them** —
it is not an enhancement, it is what makes open send responsible. US4, US5 and US6 are each
independently deliverable afterwards.

### Parallel opportunities

- T005–T009 (five schema files) are fully parallel; T010–T012 serialise behind them.
- T020–T022 and T024–T026 are parallel within each triple.
- Every `### Tests for …` block is parallel within itself.
- T108–T110 (the push port trio) are parallel.
- Phases 6, 7 and 8 can proceed in parallel once Phases 3–5 are done, if staffed.

---

## Implementation Strategy

### MVP

**US1 alone** is the template's MVP and it is technically demonstrable. **It is not a responsible
release**: it opens a contact path with no way to close it. The smallest release this feature should
actually produce is **US1 + US2 + US3**.

### Incremental delivery

1. Phases 1–2 → foundation, coverage green, guards in place.
2. Phase 3 → US1, demonstrable.
3. Phases 4–5 → **the first responsible release.**
4. Phase 6 → Home's indicator; the destination is complete.
5. Phase 7 → push, **after the amendment**.
6. Phase 8 → deletion honesty proven end to end.
7. Phase 9 → polish, export, full verify.

### On splitting into PRs

Spec open question 9 asks whether 007 splits. With 148 tasks — more than 004's 131 and 006's 110 —
and two subsystems, the natural boundary is **after Phase 6**: Messages complete and safe, then push
as its own reviewable change gated on the amendment. Run `speckit-spex-collab-phase-split` to decide
it properly.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks.
- The coverage guards go red as soon as the schema lands. That is designed behaviour, not a
  regression — close them in the same change.
- Commit after each task or logical group.
- Every checkpoint is a place to stop and validate a story on its own.
