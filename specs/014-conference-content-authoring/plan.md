# Implementation Plan: Conference Content Authoring

**Branch**: `spec/014-conference-content-authoring` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)
**Constitution**: v5.2.0 (N1–N5) — **RATIFIED 2026-08-12, unchanged from the drafted text.**
**Input**: Feature specification from `specs/014-conference-content-authoring/spec.md`

## Summary

Give the second actor a write path into the conference catalog, and give the attendee a way to find
out when that write changes something they were relying on.

**The approach is inheritance for the administrative half and new construction for the attendee
half**, which is the opposite of the split anyone would guess. Authoring looks like the big new
thing and is mostly wiring: 013 built the site, the shell, the session, the audit trail and the
tier model, and this feature adds forms and routes behind them. The genuinely new mechanisms are
both small and both on the *attendee* side — a second notification trigger, and a marker that must
not become an inbox.

**Three findings from Phase 0 changed the shape of the work**, and each is the kind of thing that
would otherwise have been discovered during implementation:

1. **`catalog-read-only.test.ts` does not need weakening at all** (R1). Its subject is the
   *attendee* read path, and the administrative write path is a different file with a different
   scope type. The invariant "CatalogRepository is read-only in perpetuity" survives **literally**,
   not by reinterpretation. Only a header comment changes.
2. **There is no per-conference authority guard, and this feature needs one** (R2). 013 built
   `requireOperator` (any tier) and `requirePlatformOperator` (platform only). Neither answers
   *"may this operator write to this conference"*, which is the predicate every authoring route
   needs. This is a **fifth guard**, and it is the largest single piece of new construction here.
3. **Putting the dispatch in `notifications/` would make it invisible to its own gate** (R3).
   `notification-triggers.test.ts` excludes `notifications/**` from the scan, because that
   directory *is* the dispatcher. A second trigger placed there would pass a test designed to catch
   exactly that trigger.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22, React 19
**Primary Dependencies**: Fastify + Drizzle (API), React + Vite (both clients). **No new runtime
dependency**, in either client or the API
**Storage**: PostgreSQL 17. Migration **`0011`** — no new table; four columns and two indexes
**Testing**: Vitest (unit, component, integration), Playwright (e2e, accessibility)
**Target Platform**: Linux; two browser origins behind one Caddy instance
**Project Type**: Web — two clients, one API
**Performance Goals**: None beyond existing gates, with one bound worth naming: a single organizer
act must produce **at most one notification per attendee** (FR-1034), so dispatch is O(attendees who
saved something) rather than O(changed sessions × savers)
**Constraints**: The administrative product caches nothing and queues nothing; authoring offline is
refused. The attendee product gains no new cached read
**Scale/Scope**: 56 functional requirements, 13 success criteria, 4 user stories, 0 new tables

**No `NEEDS CLARIFICATION` remains.** One was raised at specification and resolved by the owner
(FR-1034, coalescing); the rest are resolved by research R1–R11 below.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes recorded.*

| Principle | Pre-design | Post-design |
|---|---|---|
| **I. Requirements define the product** | PASS — every requirement traces to v5.2.0's N1–N5 or the spec | PASS |
| **II. Prototype is reference only** | PASS — the prototype has no authoring surface and no changed-session state | PASS |
| **III. Attendee experience first** | PASS — authoring is confined to the second product under v4.0.0's four conditions | PASS — **with one thing to watch**: 014 is the first feature since 013 to change MyNet, so FR-1003's absence must be re-asserted rather than assumed still true |
| **IV. Accessibility & responsiveness** | PASS — FR declarations bind both products | PASS, **with a flagged risk**: see Complexity Tracking |
| **V. Abstraction before platform/data APIs** | PASS | PASS — **no eighth device capability**. The marker is server-computed state on an existing payload, so `substitution.test.ts` is untouched (R7) |
| **VI. Web-first delivery** | PASS | PASS — admin stays non-installable; no new cached read in the attendee client (R7) |
| **VII. Verified on Linux CI** | PASS — every gate binds both products | PASS — three guards are amended deliberately (R1, R3, R11) and one is added (R5) |
| **VIII. Attendee data is personal data** | PASS — no new privacy exception is needed; the coalesced payload is bounded by N2 as amended | PASS — one new attendee-data column, with its deletion and export answer stated (data-model.md) |
| **IX. Feature declares completeness** | PASS — all 13 rows filled, including Actor and tier | PASS |

**No violation requiring justification.** Two risks are tracked below rather than waived.

**Governance**: **blocked by nothing.** Resolves no register entry. **Escalates**
entry **4** (a substantial new administrative surface at desktop width) and entry **22** (the cached
programme gains a second way to be wrong). Opens none beyond **27** and **28**, which v5.2.0 opens.
Reserved migration **`0011`**.

## Project Structure

### Documentation (this feature)

```text
specs/014-conference-content-authoring/
├── spec.md                      # 56 FRs, 13 SCs, 4 user stories
├── plan.md                      # this file
├── research.md                  # R1–R11
├── data-model.md                # migration 0011
├── contracts/authoring.md       # routes, guards, refusals, absences
├── quickstart.md                # 9 scenarios; 6–9 need a person
├── checklists/requirements.md   # complete, plus the review-gate record
└── tasks.md                     # NOT created by /speckit-plan
```

### Source code (repository root)

```text
apps/api/src/
├── admin/
│   └── require-conference-authority.ts   # NEW — the fifth guard (R2)
├── db/
│   ├── queries/
│   │   ├── admin-catalog.ts              # NEW — the write path; catalog.ts stays read-only (R1)
│   │   └── session-changes.ts            # NEW — who to notify, and the marker predicate (R4)
│   ├── schema/
│   │   ├── catalog.ts                    # cancellation + logistics-change columns
│   │   └── agenda.ts                     # saved_sessions.viewed_at
│   └── migrations/0011_conference_authoring.sql
└── routes/admin/
    └── catalog.ts                        # NEW — authoring routes; named in DISPATCH_CALLERS (R3)

apps/admin/src/app/conferences/
├── ProgrammeEditor.tsx                   # NEW — the programme, per conference
├── SessionForm.tsx                       # NEW
├── CatalogForms.tsx                      # NEW — tracks, rooms, speakers
├── CancelDialog.tsx                      # NEW — delete-vs-cancel, with counts
└── CreateConferenceDialog.tsx            # NEW

apps/web/src/app/
├── sessions.ts                           # nextSession() skips cancelled — ONE change point (R8)
├── agenda/                               # cancelled presentation + the marker on the row
└── home/cards/{UpNext,NextSavedSession,RestOfDay}.tsx   # inherit from sessions.ts

apps/api/tests/unit/
├── notification-triggers.test.ts         # AMENDED — a second permitted caller (R3)
├── catalog-read-only.test.ts             # header amended; assertions UNCHANGED (R1)
├── engagement-coverage.test.ts           # NEW — the schema-derived predicate (R5)
└── authoring-absences.test.ts            # NEW — FR-1040 to FR-1044
```

**Structure Decision**: no new package, no new application, no new device capability. The
administrative half extends `apps/admin` and `apps/api/src/routes/admin`, both of which 013
established. The attendee half touches three existing directories in `apps/web` and adds nothing to
`packages/platform`.

## Complexity Tracking

> Two risks tracked rather than waived. Neither is a constitution violation.

| Risk | Why it is accepted | What would go wrong |
|---|---|---|
| **The programme editor is the largest desktop-first surface built since 013, and register entry 4 is still open** | Entry 4 has never been answerable without a running product at a real width, and UAT now exists. Deferring the surface does not answer the entry; building it and looking at it might | A time-grid editor that has never been seen at 1280px, in a project where the first dialog a human looked at was rendering in the top-left corner |
| **The marker is one design decision away from being the notification centre v3.1.0 forbids** | It is per-row state derived from two timestamps, with no store, no list and no count anywhere in either client (R7). FR-1031 is asserted as an absence | An "N changed" badge in the top bar would satisfy every functional requirement here and breach N2 |
