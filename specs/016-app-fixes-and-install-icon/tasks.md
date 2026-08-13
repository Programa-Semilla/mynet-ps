# Tasks: App fixes, mutual card exchange, and the install icon

**Feature**: 016 | **Branch**: `feat/016-app-fixes-and-install-icon`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable: different files, no dependency on an incomplete task
- **[US1]–[US6]** — the user story this task serves. Setup, Foundational and Polish carry none.

## Path Conventions

pnpm monorepo. `apps/api` (Fastify + Drizzle), `apps/web` (MyNet PWA), `apps/admin` (administrative
site), `packages/platform` (device capabilities), `scripts/` (asset derivation and audits), `e2e/`
(Playwright).

## Things that will bite, gathered here so they are read once

| Trap | Why it matters |
|---|---|
| **US5 is blocked on a constitution amendment** | Install detection needs an eighth device capability. Principle V's list names seven, and `mynet/no-direct-platform-access` enforces the prohibition mechanically. **T045** is the amendment; nothing in US5 starts before it. |
| **`shareCard` currently autocommits** | Its statements run against the pool, so FR-1022 is a restructure onto `getDb().transaction()`, not a second insert beside the first. Same trap 013 hit with `FOR UPDATE`. |
| **Two comments become false the moment C1 lands** | `GET /cards/shared`'s summary and the export's docblock justification. Neither has a test that would fail. **T041 and T042** exist because nothing else will catch them. |
| **The reveal control is implemented twice** | No shared UI package, and `apps/admin` deliberately does not depend on `@mynet/platform`. Divergence is prevented by the same assertions running in both products, not by shared code. |
| **`resize-y` must go** | A reader-chosen composer height violates FR-1003 whatever the bound says. |
| **Absence tests strip comments before matching** | Every pattern also appears in the prose explaining the absence. Matching raw text fails on a correct implementation. |

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Confirm the working tree is clean and `pnpm verify` is green on `feat/016-app-fixes-and-install-icon` before any change, so a later failure is attributable
- [ ] T002 [P] Record the current precache manifest size and install-asset weights from `pnpm build` output, as the baseline FR-1048 compares against

---

## Phase 2: Foundational (Blocking Prerequisites)

**No user story starts before this phase completes.** Two items only — this feature inherits almost
everything.

- [ ] T003 Add a transaction-capable executor parameter to the card query layer in `apps/api/src/db/queries/cards.ts`, following the shape `apps/api/src/db/queries/admin-audit.ts` established — callers pass their transaction; the pool is the default only where there is genuinely none
- [ ] T004 [P] Extend `apps/web/src/ui/` with a `PasswordField` module boundary (file created empty in this phase; behaviour arrives in US3) so US3's two products have a named home before either is written

---

## Phase 3: User Story 1 — Send a message from a phone (Priority: P1) 🎯 MVP

**Goal**: The composer grows to a bound and stops; the send control is always reachable.

**Independent test**: At 390×844 with a keyboard raised, type 500 characters and send. Delivers a
working mobile composer with nothing else in this feature built.

### Tests for User Story 1

- [ ] T005 [P] [US1] Component test in `apps/web/tests/component/composer-bound.test.tsx` — the composer grows with content and stops at its bound; content scrolls past it; the field is **not** resizable by direct manipulation (FR-1001, FR-1004, FR-1005)
- [ ] T006 [P] [US1] Component test in `apps/web/tests/component/composer-disabled.test.tsx` — whitespace-only content leaves send **disabled** rather than producing a post-submit error (FR-1006)
- [ ] T007 [P] [US1] E2E test in `e2e/responsive.spec.ts` — at all three width bands, with the composer at maximum height, the send control's bounding box is **fully within the viewport** (FR-1003, SC-1001). This measures *position*, which is the class of defect this project has twice shipped past every behavioural gate

### Implementation for User Story 1

- [ ] T008 [US1] Bound the composer in `apps/web/src/app/messages/Composer.tsx` as a **proportion of the visible thread area**, remove `resize-y`, and place the send control **outside** the bounded region so FR-1003 holds by construction rather than by a value staying true (FR-1001, FR-1002, FR-1005)
- [ ] T009 [US1] Record the chosen proportion and its reasoning in `Composer.tsx`'s header — the value is a planning decision, the *kind* of rule is constitutional (FR-1002)

---

## Phase 4: User Story 2 — The conversation list stays current (Priority: P2)

**Goal**: The list refreshes while on screen, and pauses when it is not.

**Independent test**: Sit on the list; have another attendee send a message; see it appear within 15
seconds without navigating.

### Tests for User Story 2

- [ ] T010 [P] [US2] Component test in `apps/web/tests/component/conversation-list-refresh.test.tsx` — the list refreshes on its interval, preserves scroll position and focus, and a response arriving **after navigation** does not alter what is displayed (FR-1011, FR-1012)
- [ ] T011 [P] [US2] Component test in `apps/web/tests/component/conversation-list-visibility.test.tsx` — refreshing stops while the document is hidden and refreshes **immediately** on becoming visible, not at the next tick (FR-1008)
- [ ] T012 [P] [US2] Component test in `apps/web/tests/component/conversation-list-backoff.test.tsx` — consecutive failures increase the interval to a ceiling, three failures surface a notice worded distinguishably from offline, and recovery needs no reload (FR-1009, FR-1010)
- [ ] T013 [P] [US2] Component test in `apps/web/tests/component/conversation-list-pause.test.tsx` — refreshing pauses when the layout has replaced the list with a thread, and continues when both are visible. **Assert on what is on screen, not on the width band** (FR-1054)
- [ ] T014 [P] [US2] E2E test in `e2e/messages.spec.ts` — two browser contexts: a message sent by one appears in the other's list, with its unread indicator, without navigation (SC-1002, SC-1003)

### Implementation for User Story 2

- [ ] T015 [US2] Extract the poll shape from `apps/web/src/app/messages/useConversation.ts` into a reusable hook, or reimplement it deliberately — visible-only, jittered, backing off to a ceiling, three-failure threshold. **Copy the reasoning, not only the code**: each of those four properties is argued in that file's header
- [ ] T016 [US2] Refresh the conversation list in `apps/web/src/app/messages/Messages.tsx` at **10 seconds**, replacing the mount-only effect (FR-1007)
- [ ] T017 [US2] Add the on-screen pause condition in `Messages.tsx`, expressed as a condition on **list visibility** rather than on layout band, so a future layout change cannot silently re-enable a poll against a list nobody can see (FR-1054)
- [ ] T018 [US2] Add the repeated-failure notice to `apps/web/src/app/messages/MessagesEmptyStates.tsx`, distinguished from the existing offline state (FR-1010)
- [ ] T019 [US2] Assert in `apps/web/tests/unit/repository-casts.test.ts` (or a sibling composition-root test) that the conversation repository remains **undecorated** — FR-1013 keeps Messages uncached, and a refresh loop is the change most likely to tempt somebody into caching it

---

## Phase 5: User Story 3 — Enter a password correctly, on both products (Priority: P3)

**Goal**: Reveal on all five password fields; confirmation on MyNet's two credential-setting forms.

**Independent test**: On each of five screens, reveal and re-mask by keyboard; mismatch blocks
submission before any request.

### Tests for User Story 3

- [ ] T020 [P] [US3] Component test in `apps/web/tests/component/password-field.test.tsx` — reveal toggles, state is **not** remembered across remount, the control announces action and state, and it is keyboard operable (FR-1014, FR-1015, FR-1016)
- [ ] T021 [P] [US3] Component test in `apps/web/tests/component/password-confirm.test.tsx` — mismatch **disables submit** and describes the mismatch, associated with its field for assistive technology; **no request is made** (FR-1018)
- [ ] T022 [P] [US3] Component test in `apps/admin/tests/component/password-field.test.tsx` — **the same assertions as T020**, run against the administrative implementation. This file is what prevents divergence, since no shared code enforces it (FR-1049, FR-1050)

### Implementation for User Story 3

- [ ] T023 [P] [US3] Implement the reveal control in `apps/web/src/ui/PasswordField.tsx` — a per-field toggle whose revealed state is never persisted (FR-1014, FR-1015, FR-1016)
- [ ] T024 [P] [US3] Implement the equivalent in `apps/admin/src/app/ui/PasswordField.tsx`, with a header stating **why it is a deliberate duplicate**: `apps/admin` depends on `@mynet/data` and `@mynet/config` only, and a shared UI package would give the administrative site its first dependency on shared presentation
- [ ] T025 [US3] Adopt the field in `apps/web/src/app/auth/SignUp.tsx` and add the confirmation field with disabled-submit mismatch handling (FR-1017, FR-1018)
- [ ] T026 [US3] Adopt the field in `apps/web/src/app/auth/ResetPassword.tsx` and add its confirmation field (FR-1017, FR-1018)
- [ ] T027 [P] [US3] Adopt the field in `apps/web/src/auth/SignInScreen.tsx` — reveal only; sign-in sets no credential
- [ ] T028 [P] [US3] Adopt the field in `apps/admin/src/app/auth/SignIn.tsx` — reveal only (FR-1049)
- [ ] T029 [US3] Adopt the field in `apps/admin/src/app/auth/ReplaceCredential.tsx` and align its **existing** confirmation field with MyNet's behaviour. This screen has carried confirmation since 013 and is the reference implementation, not new work (FR-1050)
- [ ] T030 [US3] Assert in `apps/api/tests/unit/` that no route accepts a confirmation field — it is never transmitted or stored (FR-1019), and the credential policy is unchanged (FR-1020)

---

## Phase 6: User Story 4 — Cards exchange mutually (Priority: P4)

**Goal**: One share, both parties hold a card, atomically, with the guard that keeps C1 true.

**Independent test**: A shares with B; B does nothing; both contact lists contain the other.

**This is the only story with server-side risk and the only one whose failure mode is silent.**

### Tests for User Story 4

- [ ] T031 [P] [US4] Integration test in `apps/api/tests/integration/cards.test.ts` — one share yields **both** records; the recipient acts not at all; a repeat share creates no duplicate and leaves the original instant intact (FR-1021, FR-1023, FR-1025)
- [ ] T032 [P] [US4] Integration test in `apps/api/tests/integration/cards-atomicity.test.ts` — **induce a failure on the second insert** and assert neither record exists. Contacts are mutual or absent, never one-sided (FR-1022, SC-1007). This is the shape 013 used to prove an act and its audit entry commit together, and a passing happy path cannot demonstrate it
- [ ] T033 [P] [US4] Integration test in `apps/api/tests/integration/cards-guard.test.ts` — the exchange is refused where the recipient is undiscoverable, unverified, or not registered, and **all five refusals are indistinguishable from each other** (FR-1053, FR-1028). Assert the outcomes differ from *each other* only where a reason is deliberately given
- [ ] T034 [P] [US4] Integration test extending `apps/api/tests/integration/blocks.test.ts` — a block severs both directions; lifting it restores both **with no write** (FR-1026)
- [ ] T035 [P] [US4] Integration test asserting card resolution is **unchanged**: no discoverability condition, no verification condition, no registration join (FR-1027). These three absences look like forgotten `WHERE` clauses and are the feature
- [ ] T036 [P] [US4] Extend `apps/api/tests/unit/` notification-trigger audit coverage to assert the card exchange dispatches nothing (FR-1029)
- [ ] T037 [P] [US4] E2E test in `e2e/network.spec.ts` — two browser profiles: A shares, B never acts, both see each other in Network (SC-1006)

### Implementation for User Story 4

- [ ] T038 [US4] Restructure `shareCard` in `apps/api/src/db/queries/cards.ts` onto `getDb().transaction()`, evaluating the guard **once** and writing both rows inside it (FR-1021, FR-1022, FR-1053). Evaluating the guard per-insert would let the two rows disagree about whether the exchange was permitted
- [ ] T039 [US4] Keep the outcome read back from `shared_cards` rather than `attendees` — `ON CONFLICT DO NOTHING` erases "already shared" from "not reachable", and asking whether the *card* exists answers it without asking whether the *attendee* does (FR-1028)
- [ ] T040 [US4] Record in `apps/api/src/db/queries/cards.ts`'s header **why the guard is load-bearing**: C1 licenses mutual exchange because a card resolves only what its owner already published, and against a non-discoverable recipient that ground does not exist. Relaxing it needs an amendment (FR-1053)
- [ ] T041 [US4] Redefine `GET /cards/shared` as **"people who hold your card"** in `apps/api/src/routes/cards.ts`, its docblock, and the generated contract. Query, rows and guard unchanged (FR-1051)
- [ ] T042 [US4] Rewrite every comment citing the one-directional rule, **including the export's justification** in `apps/api/src/db/queries/account.ts` which cites v3.2.0 N2 — the clause C1 reverses (FR-1052)
- [ ] T043 [US4] Regenerate and commit the OpenAPI contract at `contracts/`; **verify the redefined summary in the diff** rather than assuming it followed from the code
- [ ] T044 [US4] Re-check `card_share` throttling — mutual exchange doubles rows written per call at the same request rate, so the existing limit now admits twice the write volume

---

## Phase 7: User Story 5 — Learn how to install, and why (Priority: P5)

> **⛔ BLOCKED on T045.** No task in this phase starts before the amendment lands.

**Goal**: An uninstalled phone is told that installing enables notifications, and how.

**Independent test**: Uninstalled mobile browser shows guidance; installed instance and desktop do not.

### Amendment (blocking)

- [ ] T045 [US5] Amend the constitution to **v5.1.0**, adding the eighth device capability to Principle V's enumerated list, following `VisibilityService`'s precedent — the listing is the ratification act. MINOR: a section is materially expanded; no prohibition lifted, nothing delivered retracted

### Tests for User Story 5

- [ ] T046 [P] [US5] Substitution test in `packages/platform/tests/substitution.test.ts` extended for the eighth capability, so it is **declared rather than added quietly** — the mechanism that forced `VisibilityService` to be declared
- [ ] T047 [P] [US5] Component test in `apps/web/tests/component/install-guidance.test.tsx` — guidance renders for an uninstalled mobile device and **not** for desktop or an installed instance (FR-1031)
- [ ] T048 [P] [US5] Component test in `apps/web/tests/component/install-guidance-platforms.test.tsx` asserting the platform halves are asymmetric — a real control where the platform offers one, written steps and **no dead control** where it does not (FR-1033, FR-1034)
- [ ] T049 [P] [US5] Component test in `apps/web/tests/component/install-guidance-dismissal.test.tsx` — dismissal is remembered per device (FR-1035), guidance never requests notification permission (FR-1036), and never blocks or delays sign-in (FR-1037)
- [ ] T050 [P] [US5] Unit test asserting `NotificationPrompt.tsx` remains the **only** caller of `requestPermission` in the client — 007's assertion, which this feature must not break (FR-1036)

### Implementation for User Story 5

- [ ] T051 [US5] Declare the eighth capability in `packages/platform/src/interfaces/index.ts` with a header arguing why it exists, as `VisibilityService`'s does. **Model both platform halves**: an install mechanism the page may invoke, and the case where none exists (FR-1031, FR-1034)
- [ ] T052 [US5] Implement it for the web in `packages/platform/src/web/`, and register it in the platform registry — one line, per the append-only extension point
- [ ] T053 [US5] Build the guidance in `apps/web/src/auth/` — stating that installing is what enables notifications rather than asking to be installed for its own sake (FR-1032), dismissible and remembered per device (FR-1035)
- [ ] T054 [US5] Render it in `apps/web/src/auth/SignInScreen.tsx` without blocking, obscuring or delaying sign-in (FR-1037)

---

## Phase 8: User Story 6 — The installed icon is the new mark (Priority: P6)

**Goal**: Install icons and MyNet's favicon derive from the new source; nothing else changes.

**Independent test**: Regenerate, build, install on a device, look at it.

### Tests for User Story 6

- [ ] T055 [P] [US6] Extend `scripts/brand-audit.mjs` — the recorded upscale exception names **this file, this factor and these outputs**, so a *second* upscale still fails. A missing worker or a missing declared icon remains a **failure, not a skip** (FR-1045, FR-1046)
- [ ] T056 [P] [US6] Test in `scripts/` asserting regeneration from unchanged inputs is **byte-identical** (FR-1042)
- [ ] T057 [P] [US6] Test in `scripts/generate-install-icons.test.mjs` asserting the maskable icon places the mark entirely inside the circular safe zone — a circle of 80% **diameter**, not 80% of the side, which 010's planning corrected (FR-1043)
- [ ] T058 [P] [US6] Test asserting every **in-app** mark still derives from `assets/brand/logo.png`, and the administrative favicons are untouched (FR-1039, FR-1040, SC-1010)

### Implementation for User Story 6

- [ ] T059 [US6] Write `scripts/generate-install-icons.mjs` — a **separate path beside** the board pipeline, with its own dimension assertion for a 114×133 source and its own crop. Do **not** parameterise `generate-brand-assets.mjs`: its crop rectangle, plate derivation and safe-zone maths are measured against one specific image, and a flag-selected constant set is how the wrong constants apply silently
- [ ] T060 [US6] Crop the wordmark away in `scripts/generate-install-icons.mjs` — an icon derives from the mark, never the mark plus rendered text (FR-1041)
- [ ] T061 [US6] Choose the maskable plate colour in `scripts/generate-install-icons.mjs` **deliberately and record the choice**, because the board's navy was derived mechanically from an alpha-free source and this source has alpha (FR-1044)
- [ ] T062 [US6] Generate install icons and MyNet's favicon into `apps/web/public/` from the new source, at the existing names and sizes (FR-1038)
- [ ] T063 [US6] Keep install icons and favicons **out of the precache set** in `apps/web/vite.config.ts` (`includeManifestIcons: false`, which is what governs them rather than `globIgnores`) — those requests are issued by the browser process and never reach the service worker (FR-1047)
- [ ] T064 [US6] Record the changed install-asset weights against T002's baseline in `specs/016-app-fixes-and-install-icon/plan.md` (FR-1048)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Run `pnpm verify` — all ten correctness gates plus the brand audit after the build
- [ ] T066 [P] Confirm the Feature Declarations table in `spec.md` still describes what was built, especially the **Administrative counterpart** row, which is this feature's first use of it
- [ ] T067 Walk `quickstart.md` scenarios 1–7 by hand, two browser profiles
- [ ] T068 **Walk `specs/016-app-fixes-and-install-icon/quickstart.md` scenario 8 on a physical phone** — install, judge the icon's legibility, and repeat the composer test with a real keyboard (SC-1001, SC-1009). **No gate substitutes for this**, and this feature exists because a person found what the gates could not
- [ ] T069 [P] Update `CLAUDE.md` — the card invariant, the Messages refresh behaviour, the eighth capability, and the two-source brand rule
- [ ] T070 [P] Confirm in `specs/016-app-fixes-and-install-icon/spec.md` that register entries **4** (escalated, not closed), **28** (opened, must stay open) and **23** (untouched) are stated correctly in the spec's Register position row

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 → Phase 2 → Phases 3–8 → Phase 9**
- **Phases 3, 4, 5, 6 and 8 are mutually independent** and may run in any order or concurrently
- **Phase 7 (US5) is blocked on T045**, its own amendment task, and on nothing else

### User Story Dependencies

None between stories. Each is independently testable and independently shippable, which is what makes
the phase split below viable.

### Within Each User Story

Tests before implementation. Within implementation, follow the listed order — later tasks in each
phase depend on earlier ones except where marked `[P]`.

### Parallel Opportunities

- **T005, T006, T007** — US1's three tests, different files
- **T010–T014** — US2's five tests, different files
- **T020, T021, T022** — US3's tests; T023 and T024 (the two implementations) are also parallel
- **T031–T037** — US4's seven tests, different files
- **T055–T058** — US6's four tests
- **Whole phases**: US1, US2, US3, US4 and US6 touch disjoint files and can proceed concurrently

---

## Implementation Strategy

### MVP

**US1 alone.** The composer defect removes a capability rather than degrading one — a sufficiently
long message cannot be sent at all on a phone, which is the product's primary context. Four tasks,
one file, and it is independently shippable.

### Incremental delivery

1. **US1** — messaging works on a phone again
2. **US2** — the list stops lying about what has arrived
3. **US3** — five password screens across two products
4. **US4** — the reversal, with the atomicity test given room to be got right
5. **US6** — the icon
6. **US5** — last, because it is gated on ratification and is the only additive story

### Sequencing recommendations, and why

- **US4 should not be last.** It is the only story with server-side risk and the only one whose
  failure mode is silent. T032's induced-failure test is the one that matters most and the one most
  likely to be rushed against a deadline.
- **US5 last is a consequence, not a preference.** T045 gates it, and writing the capability before
  ratifying its listing inverts an order this project has followed four times.
- **Whether 016 splits into reviewable PRs** is for `speckit-spex-collab-phase-split` against this
  list. The natural seam is **server (US4, 14 tasks)** against **client (US1, US2, US3, US5, US6)**.
  The argument against splitting: US4 is four requirements of query change, while the client half is
  the whole visible feature — and 013 shipped one PR after planning two.

---

## Notes

- **T032 and T068 are the two tasks most likely to be skipped and least safe to skip.** One proves
  atomicity under failure, which no happy path demonstrates; the other is a person looking at a
  screen, which no gate replaces.
- **No migration.** `0010` stays reserved for 012.
- **Two comments have no test that would fail** (T041, T042). They are tasks precisely because
  nothing else will catch them.
