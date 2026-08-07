---

description: "Task list for 002 — Event Context, Session Catalog & Home Composition"
---

# Tasks: Event Context, Session Catalog & Home Composition

**Input**: Design documents from `/specs/002-event-context-and-catalog/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/README.md), [quickstart.md](./quickstart.md)

**Tests**: **Included, because this specification explicitly requires them.** FR-149 mandates an
automated route audit, FR-150 automated isolation tests against real seeded data, FR-165 containment
demonstrated by a fault-injected card rather than asserted, SC-105 test coverage of every
event-accepting route, and SC-110 an unchanged suite either side of the split. Constitution
Principle VII independently requires the full pipeline. These are not optional here.

**Organization**: grouped by user story. Priorities order delivery; the spec records that US4 and US5
are structural obligations gating the merge of US1–US3 regardless of position.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task serves

---

## Phase 1: Setup — the shared-file split

**Purpose**: FR-180–FR-183. Lands as its own first commit so a mechanical diff never sits alongside
new architecture in the same review.

**Behaviour must not change.** Each split hides behind a barrel, so no consumer's import path moves.

- [X] T001 [P] Split `packages/data/src/interfaces/index.ts` into `interfaces/attendee.ts`, `interfaces/events.ts`, `interfaces/errors.ts`, leaving `interfaces/index.ts` as a re-exporting barrel. Carry the file-top note forbidding attendee identifiers into `attendee.ts` and `events.ts` — it is the rule, not decoration
- [X] T002 [P] Extract route registration from step 8 of `apps/api/src/app.ts` into a new `apps/api/src/routes/index.ts` exporting an ordered, append-only array of route plugins; `app.ts` iterates it. Steps 1–7 and their ordering commentary stay exactly where they are
- [X] T003 [P] Split `apps/api/src/db/seed.ts` into `apps/api/src/db/seed/{index,attendees,events}.ts`, with `index.ts` an ordered registry — order is load-bearing because of foreign keys
- [X] T004 Point the `db:seed` script in `apps/api/package.json` at the new seed entry point
- [X] T005 Prove behaviour-neutrality (SC-110): run `pnpm verify` at the commit before and the commit after, and confirm `contracts/openapi.json` is byte-identical across the split

**Checkpoint**: the split is committed on its own. Nothing below may be squashed into it.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the event-context schema and the Home composition contract. Every user story depends on
one or both.

**⚠️ No user story work begins until this phase is complete.**

- [X] T006 Add `timezone` (`text NOT NULL`, IANA) to `events` in `apps/api/src/db/schema/events.ts`
- [X] T007 Create `apps/api/src/db/schema/active-event.ts` — `active_event_selections` with `attendee_id` as primary key and the composite foreign key `(attendee_id, event_id) → registrations (attendee_id, event_id) ON DELETE CASCADE`. Comment why: this is FR-101 as a database guarantee, and it is what makes a removed registration fall back to derivation with no application logic
- [X] T008 Register both in `apps/api/src/db/schema/index.ts`
- [X] T009 Generate `apps/api/migrations/0001_event_context.sql`. Add `timezone` with `DEFAULT 'UTC'`, back-fill, then **`DROP DEFAULT` in the same migration** — a column that keeps a silent default is how a wrong day number ships unnoticed (research D11)
- [X] T010 Give the three seeded events real IANA zones in `apps/api/src/db/seed/events.ts` — `Europe/Madrid`, `Europe/Lisbon`, `Europe/Berlin`
- [X] T011 [P] Add `timezone` to `Event` and declare `ActiveEventRepository` in `packages/data/src/interfaces/events.ts`
- [X] T012 [P] Create `apps/web/src/app/home/contract.ts` — `HomeCardSlot` (`lead` | `primary` | `aside`) and the `HomeCard` union discriminated on `scope`, so an event-scoped card's component *requires* the event prop and an attendee-scoped card's *cannot accept* one (FR-158–FR-160)
- [X] T013 Create `apps/web/src/app/home/registry.ts` — the append-only array. This is the one shared file the next seven features touch; say so in the file
- [X] T014 Create `apps/web/src/app/home/HomeShell.tsx` — groups by slot, orders within slot, and wraps every card in a boundary reusing `apps/web/src/app/ErrorBoundary.tsx`. Containment is the shell's so a card author cannot forget it (FR-163)
- [X] T015 Map slots to the three widths in exactly one place inside `HomeShell.tsx` (FR-156): desktop full-width `lead` above a `primary` column and an `aside` column; tablet two columns with `aside` folded below; mobile single column
- [X] T016 Replace the body of `apps/web/src/app/destinations/Home.tsx` with `HomeShell` over the registry

**Checkpoint**: schema and composition contract exist. User stories can begin.

---

## Phase 3: User Story 1 — Arrive at the right conference (P1) 🎯 MVP

**Goal**: an attendee signs in and lands on the conference happening now, greeted by name, told which
day it is in the venue's timezone.

**Independent test**: sign in as Ada with the clock inside Product & Design Summit. Home names that
event, its location, and the correct day number. Set the device to `America/Lima` at a moment where
the venue date has rolled over and Lima's has not — the day number must follow Barcelona.

### Tests for User Story 1

- [X] T017 [P] [US1] Integration test in `apps/api/tests/integration/active-event.test.ts`: each derivation tier (in progress, next upcoming, most recently ended), and the total order under a tie — same answer across repeated reads (FR-102, FR-103)
- [X] T018 [P] [US1] Unit test in `apps/web/tests/unit/day-context.test.ts`: day number across a venue/device timezone gap, a DST transition inside the range adding no day, a one-day conference reading "day 1 of 1", and the before/during/after cases (FR-121, FR-122, FR-125)

### Implementation for User Story 1

- [X] T019 [US1] Derivation in `apps/api/src/db/queries/active-event.ts` — one SQL query using the database clock, tiering on `(now() AT TIME ZONE events.timezone)::date`, ordering `starts_on`, `ends_on`, `id`. Comment why it is not split across two clocks (research D4)
- [X] T020 [US1] `GET /workspace/active-event` in `apps/api/src/routes/workspace/active-event.ts` with a full `schema` block — 200 with the event including `timezone`, 204 when registered for none, 401. No `dayNumber` or `totalDays` in the response, ever (FR-121)
- [X] T021 [US1] Register the route in `apps/api/src/routes/index.ts`
- [X] T022 [P] [US1] `HttpActiveEventRepository` in `packages/data/src/http/active-event-repository.ts`
- [X] T023 [US1] Wire it at the composition root, `apps/web/src/app/services.ts`
- [X] T024 [US1] `apps/web/src/app/day-context.ts` — venue-local date via `Intl.DateTimeFormat` with an explicit `timeZone`, counting calendar dates rather than elapsed milliseconds. No new dependency (research D5)
- [X] T025 [US1] `apps/web/src/app/active-event.tsx` — resolves the active event above the cards, with loading, registered-for-none, and failure states
- [X] T026 [US1] `apps/web/src/app/home/cards/GreetingDayContext.tsx` — `scope: 'event'`, slot `lead`. Greeting names the signed-in attendee; time-of-day wording from the device clock (FR-123). Expose machine-readable times alongside the human wording
- [X] T027 [US1] Register the card in `apps/web/src/app/home/registry.ts`
- [X] T028 [US1] Explicit empty state for an attendee registered for no conferences in `apps/web/src/app/active-event.tsx` — a statement of what will appear, not an error and not a blank region (FR-105)
- [X] T029 [US1] Run `pnpm contract:generate` and commit `contracts/openapi.json` with the regenerated client types

**Checkpoint**: US1 is independently demonstrable and is the MVP.

---

## Phase 4: User Story 2 — See what is happening next (P2)

**Goal**: the next session and the rest of the day on Home; the whole programme in Agenda.

**Independent test**: with the clock mid-conference-day, Home names the next session with time, room,
track and speakers, and Agenda lists every session for the active event chronologically.

**Depends on**: Phase 2. Does not depend on US1 beyond the resolved active event.

### Tests for User Story 2

- [X] T030 [P] [US2] Integration test in `apps/api/tests/integration/catalog.test.ts`: sessions returned in `starts_at` order with track, room and speakers; an event with no programme returns `[]` rather than an error (FR-139)
- [X] T031 [P] [US2] Component test in `apps/web/tests/up-next.test.tsx`: no session remaining today says so rather than showing a past one; simultaneous starts resolve deterministically; a session with no speaker renders with no empty region and no placeholder name (FR-138, FR-140)
- [X] T032 [P] [US2] Component test in `apps/web/tests/agenda.test.tsx`: chronological order, track named in text as well as coded, empty state, and **no** save/add/remove control present or promised (US2 scenario 6)

### Implementation for User Story 2

- [X] T033 [US2] `apps/api/src/db/schema/catalog.ts` — `tracks`, `rooms`, `speakers`, `sessions`, `session_speakers` per data-model.md, including `CHECK (ends_at > starts_at)`, the `(event_id, starts_at)` index, and the `(event_id, name)` uniqueness on tracks and rooms. State each table's per-event scoping rule in a comment
- [X] T034 [US2] Register in `apps/api/src/db/schema/index.ts`
- [X] T035 [US2] Generate `apps/api/migrations/0002_session_catalog.sql`
- [X] T036 [US2] `apps/api/src/plugins/event-access.ts` — the branded `EventScope`, its **sole** construction site, and the `requireEventAccess` preHandler. Refuse an unregistered event identically to a nonexistent one, from a single join that produces no row in both cases (FR-148, research D2)
- [X] T037 [US2] `apps/api/src/db/queries/catalog.ts` — every function takes `EventScope`, never a bare string. A handler that skipped verification cannot call these (FR-147)
- [X] T038 [US2] `GET /events/:eventId/sessions` in `apps/api/src/routes/events/catalog.ts` with a full `schema` block. Absolute instants only; speakers an empty array rather than null (FR-124, FR-138)
- [X] T039 [US2] `GET /events/:eventId/tracks` in the same file — `name` and `colorToken`, **never** a colour value
- [X] T040 [US2] Register both in `apps/api/src/routes/index.ts`
- [X] T041 [P] [US2] `packages/data/src/interfaces/catalog.ts` — `Session`, `Track`, `Room`, `Speaker`, `CatalogRepository`
- [X] T042 [P] [US2] `HttpCatalogRepository` in `packages/data/src/http/catalog-repository.ts`
- [X] T043 [US2] Wire it at `apps/web/src/app/services.ts`
- [X] T044 [US2] Track colour tokens in `apps/web/src/theme/tokens.css`, plus a token-name→class mapping with a **defined neutral fallback** so a seed typo degrades rather than breaks (research D7). Verify contrast the way the existing tokens do
- [X] T045 [US2] `apps/api/src/db/seed/catalog.ts` — two fully disjoint programmes and one event left deliberately empty. No session title, track, room or speaker may appear in both, and session counts must differ (SC-107). The empty event is the fixture FR-139 needs (research D12)
- [X] T046 [US2] `apps/web/src/app/home/cards/UpNext.tsx` — `scope: 'event'`, slot `primary`
- [X] T047 [US2] `apps/web/src/app/home/cards/RestOfDay.tsx` — `scope: 'event'`, slot `primary`
- [X] T048 [US2] Register both cards in `apps/web/src/app/home/registry.ts`
- [X] T049 [US2] `apps/web/src/app/destinations/Agenda.tsx` — the programme, chronological, read-only, grouped by venue-local day
- [X] T050 [US2] Point `/agenda` at the real destination in `apps/web/src/app/routes.tsx`, replacing the placeholder
- [X] T051 [US2] Run `pnpm contract:generate`; commit `contracts/openapi.json` and the regenerated `packages/data/src/generated/api.ts`

**Checkpoint**: the product answers "what is happening next?" — the first of Principle III's questions.

---

## Phase 5: User Story 3 — Switch, and everything follows (P3)

**Goal**: change conference from the top bar at any width; every conference-specific surface follows;
the choice survives a device change.

**Independent test**: switch between two seeded events with visibly different programmes; confirm no
surface still shows the previous one; sign out and back in on a different browser profile.

**Depends on**: Phase 2, US1 (the read endpoint), US2 (something visible to swap).

### Tests for User Story 3

- [X] T052 [P] [US3] Integration tests in `apps/api/tests/integration/active-event.test.ts`: `PUT` records the selection; an unregistered event is refused identically to a nonexistent one; re-selecting the active event is idempotent; **and an explicit choice survives its event's end date** (FR-104, US3 scenario 3) — an implementation that re-derives once the chosen event ends has taken the alternative brainstorm #02 rejected, and only this case catches it
- [X] T053 [P] [US3] Component tests in `apps/web/tests/event-switcher.test.tsx`: offline, the switch is refused with an explanation, the previous event stays active, nothing is queued and nothing reads as succeeded (FR-112); two switches in quick succession settle on the **last** selection, displayed and recorded (FR-118); **a switch leaves the browser address unchanged** (FR-119, US3 scenario 8)
- [X] T054 [P] [US3] Extend `e2e/durability.spec.ts`: switch, sign out, sign in from a clean context, the choice persists (SC-103)

### Implementation for User Story 3

- [X] T055 [US3] `recordActiveEvent` upsert in `apps/api/src/db/queries/active-event.ts`
- [X] T056 [US3] `PUT /workspace/active-event` in `apps/api/src/routes/workspace/active-event.ts` with a full `schema` block — echoes the recorded event so the client can reconcile (research D9)
- [X] T057 [US3] `setActive` on `ActiveEventRepository` in `packages/data/src/interfaces/events.ts` and `packages/data/src/http/active-event-repository.ts`
- [X] T058 [US3] `apps/web/src/shell/EventSwitcher.tsx` — names the active event and its location; offers only registered events (FR-110, FR-111)
- [X] T059 [US3] Mount it in `apps/web/src/shell/TopBar.tsx` at all three widths: menu at desktop and tablet, full-width overlay with touch-sized targets at mobile. Must not force horizontal scrolling at 320px beside the attendee name and sign-out control
- [X] T060 [US3] Single registered event: identify it, offer no choice, in `apps/web/src/shell/EventSwitcher.tsx` (FR-114)
- [X] T061 [US3] Loading and empty states for the switcher in `apps/web/src/shell/EventSwitcher.tsx` (FR-117) — the failure state is T065; these are the other two the requirement names, and Principle IX presumes an undeclared state unmet
- [X] T062 [US3] Accessible label, visible focus, full keyboard operation, clear close, and **Escape dismissal that does not change the selection**, in `apps/web/src/shell/EventSwitcher.tsx` (FR-116)
- [X] T063 [US3] Invalidate every conference-scoped surface on a successful switch in `apps/web/src/app/active-event.tsx` — no full page reload, no surface left showing the previous event (FR-113)
- [X] T064 [US3] Sequence numbers on switch requests plus echo reconciliation in `apps/web/src/app/active-event.tsx`; re-read when the echo disagrees with the latest selection (FR-118). This reconciles **after** the server confirms — it is not an optimistic update, and the distinction belongs in the comment
- [X] T065 [US3] Failure state in `apps/web/src/shell/EventSwitcher.tsx` that leaves the previous event active and says the change did not take effect (FR-115); offline wording distinct from server-fault wording, following the sign-out precedent already in `apps/web/src/shell/TopBar.tsx`
- [X] T066 [US3] Confirm no destination address gains an event segment or query parameter — `apps/web/src/app/routes.tsx` keeps its conference-neutral shape (FR-119). The active event travels in requests, never in the address
- [X] T067 [US3] Run `pnpm contract:generate`; commit `contracts/openapi.json` and the regenerated `packages/data/src/generated/api.ts`

**Checkpoint**: the validation-checklist item "navigation and event switching" is discharged in full.

---

## Phase 6: User Story 4 — Isolation (P4)

**Goal**: no attendee can read another's data or an unregistered event's content, and the guarantee is
enforced rather than remembered.

**Independent test**: as Ada, request Grace's event's programme and a nonexistent event's. The two
responses must be identical.

**Depends on**: US2 (the guard and the content it protects).

- [ ] T068 [US4] Route audit in `apps/api/tests/unit/event-scope-audit.test.ts` — build the real app, collect every route through Fastify's `onRoute` hook, fail when a route whose URL declares an event parameter lacks `requireEventAccess` (FR-149)
- [ ] T069 [US4] **Watch the audit fail.** Remove the guard from one route in `apps/api/src/routes/events/catalog.ts`, confirm `apps/api/tests/unit/event-scope-audit.test.ts` goes red, restore. A guard never seen failing is not known to work — the `substitutability-proven-without-the-application` lesson applied to its own enforcement
- [ ] T070 [P] [US4] Isolation tests in `apps/api/tests/integration/isolation.test.ts` against real seeded rows: cross-attendee and cross-event over every route accepting an event identifier, **and refusal parity** — an unregistered-but-real event and a nonexistent one must produce identical status *and* identical body (FR-148, FR-150, SC-105)
- [ ] T071 [P] [US4] Cascade test in `apps/api/tests/integration/active-event.test.ts`: delete a registration, confirm the selection row disappears and the attendee falls back to derivation rather than erroring or seeing the event (FR-101, US4 scenario 4)
- [ ] T072 [US4] Extend the audit in `apps/api/tests/unit/event-scope-audit.test.ts` to assert **no write route exists against conference content** — no `POST`, `PUT`, `PATCH` or `DELETE` on sessions, tracks, rooms or speakers, at any privilege (FR-132, FR-134). The audit already walks the route table; this costs almost nothing and is the only automated guard on the organizer-administration exclusion
- [ ] T073 [US4] ESLint `no-restricted-syntax` rule in `eslint.config.js` rejecting type assertions to `EventScope` outside `apps/api/src/plugins/event-access.ts` — closing the brand's known escape hatch (research D2)
- [ ] T074 [US4] Confirm the rule in `eslint.config.js` actually fires on a deliberate assertion, then revert the assertion

**Checkpoint**: Principle VIII's server-side authorization is enforced at compile time, at lint time, and in CI.

---

## Phase 7: User Story 5 — A broken card does not take Home down (P5)

**Goal**: Home degrades card by card, and the attendee-scoped half of the contract has a real
consumer rather than a test double.

**Independent test**: register a deliberately throwing card alongside the real ones; every other card
still renders and Home is never blank.

**Depends on**: Phase 2, and at least one real card from US1.

- [ ] T075 [US5] `apps/web/src/app/home/cards/YourConferences.tsx` — `scope: 'attendee'`, slot `aside`. Preserves the registered-events view Home carries today rather than deleting it, and is the genuine attendee-scoped consumer brainstorm #02 flagged as this feature's likeliest weak point (FR-173)
- [ ] T076 [US5] Register it in `apps/web/src/app/home/registry.ts`
- [ ] T077 [P] [US5] Containment tests in `apps/web/tests/home-composition.test.tsx`: a card that throws while rendering is contained to its own region naming what is unavailable while every other card renders (FR-163, SC-104); a card whose data request fails shows its own failure state with a retry and affects no other card; with the active event unresolvable, event-scoped cards show unavailable while the attendee-scoped card **still renders** (FR-160); a card with nothing to show renders a visible empty state and does **not** disappear from the layout (FR-161)
- [ ] T078 [P] [US5] Per-card state matrix in `apps/web/tests/home-cards.test.tsx`: **every** card in `apps/web/src/app/home/registry.ts` renders a visible, meaningful state in all four of loading, populated, empty and failed (SC-109). T077 proves the mechanism; this proves each card actually uses it
- [ ] T079 [US5] At-most-one-`lead` test in `apps/web/tests/unit/home-registry.test.ts` plus a development-mode assertion in `apps/web/src/app/home/registry.ts` (FR-157). Record in the test why this is not a compile-time guarantee — enforcing it in the type system over an append-only array would make the registry hostile to the append it exists for (research D8)

**Checkpoint**: the composition contract is proven by use, not asserted. Seven later features can now contribute cards.

---

## Phase 8: Polish & cross-cutting concerns

- [ ] T080 [P] Extend `e2e/responsive.spec.ts` — Home and Agenda at 320px, 768px and 1280px, no horizontal scrolling anywhere, including a long event name beside the attendee name and sign-out control
- [ ] T081 [P] First-viewport measurement in `e2e/first-viewport.spec.ts` (SC-101): at each of the three widths, assert the active conference name, the day context, and the next session are all within the initial viewport height without scrolling. T080 covers the horizontal axis; nothing covered the vertical one, which is where the success criterion actually lives
- [ ] T082 [P] Extend `e2e/accessibility.spec.ts` over every control this feature introduces
- [ ] T083 [P] Extend `e2e/navigation.spec.ts` — the complete journey (arrive → read next → switch → read next) **keyboard-only**, focus visible throughout (SC-108)
- [ ] T084 Update `e2e/navigation.spec.ts` where it asserts Agenda is a placeholder — it no longer is
- [ ] T085 Revisit the Agenda `purpose` text in `apps/web/src/app/navigation.ts` now that the destination has content
- [ ] T086 Update `CLAUDE.md` — the repository-status section still says the destinations carry no product content
- [ ] T087 Record the departure in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`: 003 absorbed, migration `0002` transferred, 005's dependency moved to 002, first free pair now 005 ∥ 006
- [ ] T088 Update `brainstorm/00-overview.md` delivery-queue status for 002
- [ ] T089 Run `pnpm verify:clean` against a clean database. **Non-optional for this feature**: CI has never run on `develop`, so this is currently the only place the route audit and isolation suite are actually checked (plan.md, Complexity Tracking)

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 (split)  ──►  Phase 2 (foundational)  ──┬──►  Phase 3  US1  ──┐
                                                 │                     │
                                                 └──►  Phase 4  US2  ──┼──►  Phase 5  US3
                                                            │          │
                                                            ├──► Phase 6  US4
                                                            │
                                       Phase 2 + one card ──┴──► Phase 7  US5
                                                                        │
                                                        Phase 8 (polish) ◄┘
```

### User story dependencies

- **US1** — needs Phase 2 only. The MVP.
- **US2** — needs Phase 2 only. Independent of US1 beyond the resolved active event.
- **US3** — needs US1's read endpoint and US2's content to have something visible to swap.
- **US4** — needs US2's guard and content. Cannot be demonstrated earlier; may not ship later.
- **US5** — needs Phase 2 and at least one real card. Can run alongside US2 and US3.

### Within each story

Tests → schema → queries → routes → repository → composition root → UI → contract regeneration.

### Parallel opportunities

- **Phase 1**: T001, T002, T003 touch three separate files — fully parallel.
- **Phase 2**: T011 and T012 are parallel with each other and with T006–T010.
- **US1**: T017 and T018 in parallel; T022 parallel with T019–T021.
- **US2**: T030, T031, T032 in parallel; T041 and T042 parallel with the API work.
- **US3**: T052, T053, T054 in parallel — three different files.
- **US4**: T070 and T071 in parallel. T068, T069 and T072 all edit the audit file and must not be.
- **US5**: T077 and T078 in parallel — two different test files.
- **Phase 8**: T080, T081, T082 in parallel. T083 and T084 both edit `e2e/navigation.spec.ts` and must not be.

**A note on `[P]` and test files**: two tests in the same file are not parallel work, so same-file
test cases are folded into one task rather than split into several that a reviewer could not
meaningfully accept or reject independently. That is why US3 has three test tasks rather than six.

**US2 and US5 are the largest genuine parallel opportunity** — one owns the catalog, the other owns
composition, and they share only `registry.ts`, where the contact is one appended line each.

---

## Implementation Strategy

### MVP — User Story 1 only

Phases 1 → 2 → 3. Delivers an attendee signing in and landing on the conference happening now,
greeted by name, with a day number that is correct from any timezone. Home has one real card and the
composition contract behind it. Independently demonstrable and independently valuable.

### Incremental delivery

1. **Phase 1** — commit the split alone. Never squash anything below into it.
2. **Phase 2 + US1** — MVP.
3. **US2** — the product answers "what is happening next?", and Agenda stops being a placeholder.
4. **US3** — multi-event becomes real; the checklist item is discharged.
5. **US4 + US5** — the two structural guarantees, proven by use.
6. **Phase 8** — verification of work already done, not the place any of it first happens.

### On the single pull request

The spec records the intent as one branch and one squash-merged PR, reaffirmed after the catalog was
absorbed. That decision was taken against an estimate; it now has a concrete shape — **89 tasks, six
tables, five endpoints, two migrations, and a new destination**. The `speckit-spex-collab-phase-split`
step is the place to look at that honestly. The natural seam, if one is wanted, is after US1: Phase 1
and 2 plus US1 is a coherent, reviewable increment, and US2 onward is the catalog.

### Two things that must not slip to Phase 8

Principle IX forbids deferring accessibility, responsive, and offline work to a consolidated later
pass, and Phase 8 is verification only. The accessibility and responsive tasks inside US1, US2, US3
and US5 are where that work actually happens. If Phase 8 is the first time a focus state or a 320px
layout is considered, the obligation has been missed rather than met.
