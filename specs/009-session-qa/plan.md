# Implementation Plan: Session Q&A — Audience Questions and Upvotes

**Branch**: `spec/009-session-qa` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-session-qa/spec.md`

## Summary

Audience questions on a session, attributed to their authors, ranked by upvotes, delivered as a
fourth stacked section on the session detail panel 005 built. Two new tables reached per-event
through `sessions`, five routes all naming their conference, one repository never touched by the
cache, and a report path so the product's first unmoderated many-to-many surface is survivable.

**The technical approach is almost entirely inheritance.** Every mechanism this feature needs already
exists and has a shipped precedent: 005's panel and its dialog ordering, 005's `saved_sessions`
composite key for one-vote-per-attendee, 002's event scope and indistinguishable refusal, 004's two
coverage guards, 007's report-and-block, 008's bidirectional block predicate and its `passThrough`
lesson. **This feature introduces no new architectural concept** — no branded scope, no route audit,
no cache classification, no notification trigger. Where research found a temptation to invent one, it
records why not.

**Implementation is gated on a constitution amendment** (spec Open Question 1). Planning is not.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22, React 19

**Primary Dependencies**: Fastify + Drizzle ORM (API), React + React Router + Tailwind (client),
`@mynet/data` repository interfaces, `@mynet/platform` capability registry

**Storage**: PostgreSQL 17. Migration **`0008`**, reserved from the delivery roadmap. Two new tables
(`session_questions`, `question_votes`) plus one column on `abuse_reports`.

**Testing**: Vitest (unit, component, integration against a real `postgres:17` service container),
Playwright (e2e), plus the project's structural guards — `deletion-coverage`, `export-coverage`,
`event-scope-audit`, `notification-triggers`, `no-report-read-surface`, `substitution`,
`repository-casts`

**Target Platform**: Installable PWA — desktop, tablet, mobile. Linux CI, no Apple infrastructure.

**Project Type**: pnpm workspace monorepo — `apps/api`, `apps/web`, `packages/data`,
`packages/platform`, `packages/config`

**Performance Goals**: One query per session for the whole list, including counts, the reader's own
voted state, the author join and the block filter (research R6). Vote counts are aggregated at read
time; **no denormalised counter**.

**Constraints**: Nothing in this feature is cached (research R1). Every write is refused offline,
never queued. No horizontal scrolling at any supported width. Two modal dialogs open **inside** an
already-modal panel, which is this feature's sharpest risk and is invisible to jsdom (research R2).

**Scale/Scope**: A session's question list, bounded by its audience. No pagination, permissively
(FR-732). Two new tables, one new column, five new routes, one new repository, one new panel section,
one file moved, three neighbours' files edited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see the second column.*

| Principle | Pre-research | Post-design |
|---|---|---|
| **I. Requirements define the product** | PASS — `requirements.md` names "Audience questions and upvoting" as a panel capability. The prototype's tab strip, local votes and absent ask control are HOW, superseded. | PASS |
| **II. Prototype is reference, not architecture** | PASS — its interaction shape and empty-state copy are carried; its `useState` vote map and unbounded increments are not. | PASS |
| **III. Attendee experience first** | PASS — answers "what is happening next?" by deepening the session surface. **No organizer capability**: no answer, no moderation, no pinning (FR-768). | PASS — reporting was added and is *not* moderation: it removes and protects for one reader and sends the matter **out** of the product to a human. |
| **IV. Accessibility and responsiveness** | PASS — declared in full in the spec's Principle IX table. | **PASS with a named risk.** Two dialogs now nest inside the panel (R2). Escape must dismiss only the topmost and focus must restore *after* closing. Quickstart Scenario 6 exists for this and **must not be skipped, as it was for 007 and 008**. |
| **V. Abstraction before platform and data APIs** | PASS — a new `QuestionsRepository` interface; no component touches the network. **Nothing added to `CatalogRepository`**, which is read-only in perpetuity. | PASS — no new device capability, so `substitution.test.ts`'s count is untouched and no amendment is owed on that ground. |
| **VI. Web-first, offline explicit** | PASS — nothing cached, every write refused rather than queued. | **PASS — the one deviation is resolved.** FR-756a was not met; the owner **withdrew it** on 2026-08-10 rather than build a cross-feature purge from one feature. Nothing is cached, every write is refused rather than queued, and the conceded gap is recorded against 010 (T003a). |
| **VII. Verified on Linux CI** | PASS — all ten gates apply unchanged. | PASS — discharges the **Q&A half of "session save + notes + Q&A"**, the last outstanding behavioural item on the whole-product checklist. |
| **VIII. Attendee data is personal data** | **CONDITIONAL** — public Q&A visibility is a further exception to "private content stays private", and Principle VIII requires an exception to be *recorded*. | **PASS — the condition is discharged.** v3.3.0 was **ratified 2026-08-10**, recording public Q&A visibility as the **second** exception under Principle VIII with its three binding consequences. Everything else passes as before: identity scoping through `EventScope`, both tables cascade-covered, both exported, no retention rule needed. |
| **IX. Every feature declares its own completeness** | PASS — all twelve rows of the spec's declaration table are filled. | PASS — the reporting requirements added at review are reflected in the Accessibility, Empty-states, Identity-scoping and Deletion rows. |

**Gate result: PASS.** Planning and tasks proceeded ahead of the amendment; implementation was
BLOCKED until the Principle VIII amendment was ratified, and **it was — v3.3.0, 2026-08-10**. This
mirrors 008 exactly, where v3.2.0 gated the first line of code and planning ran ahead of it. The
amendment travels in this branch, so a rebase that drops it re-opens the gate (tasks T002).

## Project Structure

### Documentation (this feature)

```text
specs/009-session-qa/
├── plan.md                     # This file
├── research.md                 # Phase 0 — R1–R13
├── data-model.md               # Phase 1 — two tables, one column, read shapes
├── quickstart.md               # Phase 1 — eight by-hand scenarios
├── contracts/
│   └── questions.md            # Phase 1 — route shapes and the guard each carries
├── checklists/
│   └── requirements.md         # Spec quality checklist + review findings
└── tasks.md                    # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/
├── migrations/0008_*.sql                     # NEW — two tables, one column
├── src/db/schema/questions.ts                # NEW — session_questions, question_votes
├── src/db/schema/reports.ts                  # EDIT (007's) — question_ids column
├── src/db/schema/sign-in-attempts.ts         # EDIT (001/007's) — 3 throttle actions
├── src/db/queries/questions.ts               # NEW — list, ask, withdraw, vote, unvote
├── src/db/queries/account.ts                 # EDIT — export coverage for both tables
├── src/auth/throttle.ts                      # EDIT — 3 THRESHOLDS entries
├── src/routes/events/questions.ts            # NEW — five routes, all naming :eventId
├── src/routes/reports.ts                     # EDIT (007's) — questionIds + throttle
└── src/routes/index.ts                       # APPEND ONLY — one entry, at the end

packages/data/
├── src/interfaces/questions.ts               # NEW — QuestionsRepository
├── src/interfaces/index.ts                   # APPEND — one line on Repositories
└── src/http/questions.ts                     # NEW — HttpQuestionsRepository

apps/web/src/app/
├── agenda/PanelQuestions.tsx                 # NEW — the fourth section
├── agenda/useSessionQuestions.ts             # NEW
├── agenda/SessionPanel.tsx                   # EDIT (005's) — ONE line in PanelBody
├── safety/ReportDialog.tsx                   # MOVED from messages/ (research R4)
├── messages/Thread.tsx                       # EDIT (007's) — one import path
└── services.ts                               # APPEND — one undecorated member + why

contracts/openapi.json                        # REGENERATED, never hand-merged
```

**Structure Decision**: the established per-domain split, unchanged. Every genuinely shared surface
is appended to rather than edited — `routes/index.ts`, `Repositories`, `services.ts`.

**Four files belonging to other features are edited, and each is deliberate**: `SessionPanel.tsx`
(one line — the panel is not a registry, research R3), `schema/reports.ts` and `routes/reports.ts`
(the report path FR-781 requires), and `Thread.tsx` (one import, from the dialog move). 008 set the
precedent of naming these explicitly rather than letting a reviewer discover them.

## Phasing

Two phases (research R13). **Phase A must not merge claiming completeness** — US5 is unmet until B
lands, and the Success Criteria say so.

| Phase | Contents | Independently reviewable because |
|---|---|---|
| **A — Q&A** | Migration, both tables, repository + interface, five routes, panel section, ask/vote/withdraw/read, ordering, deletion cascade, export, offline refusal | Every acceptance scenario in US1–US4 passes at the end of it. Touches one neighbour's file. |
| **B — Safety** | `report_submit` throttle, `question_ids` column, `ReportDialog` move, report-from-question, bidirectional block filter | Touches three more files other features own, and is the half added at spec review — keeping it separate keeps the review honest about what was specified when. |

## Complexity Tracking

> One deviation, recorded rather than resolved by assumption. **The owner resolved it on 2026-08-10
> by withdrawing FR-756a** (tasks.md T003), so what follows is the reasoning that produced the
> decision, kept because the conceded gap outlives this feature.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **FR-756a is not met.** A refused Q&A action does not purge the conference cache. | Meeting it needs a new decorator classification in `packages/data/src/http/cached.ts`, a file shared by every feature. What FR-756a actually asks is for Q&A to purge **other features'** caches — a cross-feature responsibility **no other undecorated repository has**. Messages, Discover, cards and profile all refuse without purging, and have since they shipped. | The alternatives are worse, not simpler. *Leaving writes unclassified* purges the whole conference on every upvote, violating FR-756 and dropping the offline programme for a single vote. *Building `purgeOnRefusalOnly`* adds a mechanism to a shared file, exercises it from one feature, and still leaves the real hole open everywhere else. **Recommendation: withdraw FR-756a and record the underlying gap — a cached conference outliving a withdrawn registration by up to 24 hours — as a register entry against 010.** It is product-wide, it predates this feature, and it is not 009's to fix alone. **ACCEPTED by the owner on 2026-08-10.** FR-756a is struck in `spec.md`, Open Question 2 is closed with it, the writes are declared pass-through, and the conceded gap is T003a. |

**Not violations, recorded because a reviewer will reach for them:**

- **No fourth branded scope and no fourth route audit.** 007 and 008 each needed one; this feature
  does not, because a question always belongs to a session and a session to exactly one event. The
  safety comes from FR-742's naming rule (contracts), not from a new guard — and *tidying* an address
  to `/questions/:id` would silently defeat the existing audit.
- **A write returns its own read.** The four write routes return the full re-ordered list. It is the
  only shape satisfying immediate update, deterministic server-side ordering, and focus preservation
  at once (research R5).
- **`report_submit` throttling is new and is not 009's gap.** Reporting is unthrottled today and
  dispatches operator mail, so unthrottled reports are unthrottled mail to the product's only safety
  channel. Fixed here because FR-746 requires it and because it is four lines.
