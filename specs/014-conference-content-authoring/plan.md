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
| **V. Abstraction before platform/data APIs** | PASS | PASS — **no device capability**. The marker is server-computed state on an existing payload, so `substitution.test.ts` is untouched (R7) |
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

---

# Part II — Tranche 2 implementation plan

**Branch**: `spec/014-conference-content-authoring-tranche-2` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md) Part II
**Constitution**: **v5.3.0 (O1–O4) — RATIFIED 2026-08-14.**
**Input**: brainstorm #12, and Part II of the specification (FR-1045–FR-1099, SC-1013–SC-1026)

> **THE RATIFICATION GATE IS CLOSED.** v5.3.0 was **ratified 2026-08-14**, after this plan was
> written and before any line of code — the same order v5.2.0 took for tranche 1, v4.0.0 for 013,
> v3.3.0 for 009 and v3.2.0 for 008. **Implementation is licensed from T106.** The Constitution Check
> below recorded Principle VIII as CONDITIONAL while the gate was open rather than passing silently,
> and that condition is now discharged rather than deleted — a gate that was never seen to be open is
> a gate nobody can tell was checked.

## Summary

Close 014. Three rows in one change: a conference gains a **modality** that governs what its sessions
must carry, a session may be **optional with a limited number of places**, and a profile gains a
**controlled vocabulary** for describing what somebody does.

**The shape is the opposite of tranche 1's, and of what the scope list suggests.** Tranche 1 was
inheritance on the administrative side and new construction on the attendee side. Tranche 2 is
**new construction on the administrative side** — a fifth destination, a vocabulary subsystem, a
roster — and **surgery on the attendee side**, because enrolment does not sit beside saving: it
*replaces* it on optional sessions, which means the read path every attendee-facing surface already
depends on changes underneath them.

**Six of the nine Phase 0 findings changed the shape of the work, and two overturned the premise they
were given.** Each would otherwise have been discovered during implementation:

1. **Interests must NOT become foreign keys, and `attendee_interests` needs no migration at all**
   (R18). The vocabulary is a reference table of **labels**; membership is enforced at the *write*,
   not by referential integrity. The premise the research was handed — "interests become controlled
   values, so the ranking join and the keyset cursor change" — does not survive contact with the
   code: the list ships **empty** (FR-1086), so on day one there is nothing to reference, and the
   mapping migration a foreign key would need is the act FR-1093 forbids. **Discover's ranking,
   filter options and cursor are untouched.** This is the one finding that makes the tranche smaller.
2. **The migration number is `0012`, not `0010`** (R19). Both are free once O4 voids the
   reservations, and `0010` is the literal reading of "next free". It is wrong here: tranche 2 must
   redefine the same named CHECK constraint `0011` drops and re-adds, so numbering it `0010` puts a
   dependent migration *before* its dependency in filename order.
3. **Enrolment belongs on the EXISTING repository, renamed — not a new one** (R13). Every recent
   feature that added a domain added a repository, so "add `EnrolmentRepository`" is the natural
   guess and it is a silent staleness bug: only the repository that owns the cached commitment read
   can purge the entry an enrolment invalidates. No unit or component test would see it — 008's
   defect exactly.
4. **The disclosure guard does not catch a roster route at all** (R16). `enrolments` matches none of
   its seven nouns, so a roster ships green with no exemption and no record — a pass by omission,
   indistinguishable from no coverage. The work is **widen the detector, watch the route fail, then
   exempt it by name**, in that order.
5. **`hasEngagement` has zero callers and zero importers** (R15). The live delete predicate is
   `countEngagement`, whose boolean is a sum of four counts. FR-1077b's held-places figure therefore
   **cannot** be plumbed through it — doing so makes places-held sessions undeletable, which is the
   opposite of O2, and no existing guard catches it.
6. **Placement cannot solve the time-driven guard** (R14). Its population predicate is `\.push\b`,
   which matches every `Array.prototype.push`, so fifteen files are already in scope — including two
   that must compute the closing derivation. The answer is a **naming constraint**, not a location.

**Two findings confirmed an assumption and are load-bearing anyway**: tier-hiding for a
platform-only destination already exists (`platformOnly`, R20), and capacity must take the **same
`FOR UPDATE` on the session row** that three organizer paths already take — making it a fourth
caller of one lock rather than a new concurrency mechanism (R12).

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22, React 19
**Primary Dependencies**: Fastify + Drizzle (API), React + Vite (both clients). **No new runtime
dependency**, in either client or the API
**Storage**: PostgreSQL 17. Migration **`0012`**, claimed at generation per O4 — four new tables
(enrolments, sectors, subsectors, interest options), new columns on `events`, `sessions` and
`attendee_profiles`, and one nullable-ing of `sessions.room_id`. **`attendee_interests` is untouched**
**Testing**: Vitest (unit, component, integration), Playwright (e2e, accessibility)
**Target Platform**: Linux; two browser origins behind one Caddy instance
**Project Type**: Web — two clients, one API
**Performance Goals**: None beyond existing gates, with one bound worth naming: the enrolment
critical section is **three indexed statements and nothing that does I/O of its own**, because the
pool is small and the lock is exclusive (R12)
**Constraints**: The administrative product still caches nothing and queues nothing. The attendee
product gains **one cached read grown in place** (the commitment set) and **one live `passThrough`
read** (remaining places) — deliberately opposite, and the opposition is the design
**Scale/Scope**: 93 functional requirements, 15 success criteria, 4 user stories, 4 new tables

**No `NEEDS CLARIFICATION` remains.** All nine unknowns are resolved by R12–R20.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes recorded.*

| Principle | Pre-design | Post-design |
|---|---|---|
| **I. Requirements define the product** | PASS — every requirement traces to v5.3.0's O1–O4 or Part II | PASS |
| **II. Prototype is reference only** | PASS — the prototype has no optional session, no capacity and no taxonomy | PASS |
| **III. Attendee experience first** | PASS — administration stays in the second product under v4.0.0's four conditions | PASS — **with one thing to watch**: enrolment changes the attendee read path, so FR-1003's absence must be re-asserted rather than assumed still true, exactly as tranche 1 had to |
| **IV. Accessibility & responsiveness** | PASS — FR declarations bind both products | PASS, **with two flagged risks**: see Complexity Tracking |
| **V. Abstraction before platform/data APIs** | PASS | PASS — **no new device capability**. The commitment set rides an existing payload and remaining places is an ordinary read, so `substitution.test.ts` is untouched (R13) |
| **VI. Web-first delivery** | PASS | PASS — admin stays non-installable. One cached read grown in place, one live read declared `passThrough` (R13) |
| **VII. Verified on Linux CI** | PASS — every gate binds both products | PASS — **five guards amended deliberately** (R14, R15, R16, R17, R20) and one added. Every amendment is a widening followed by a named exemption, never a weakened pattern |
| **VIII. Attendee data is personal data** | **CONDITIONAL when written** — the roster is the fourth recorded privacy exception and needed v5.3.0 ratified | **PASS — condition discharged 2026-08-14.** v5.3.0 is ratified, O1 records the exception, and its four bounds are asserted separately (FR-1073a, T145) |
| **IX. Feature declares completeness** | PASS — all 13 rows discharged a second time | PASS |

**One gate was CONDITIONAL and is now discharged.** Principle VIII requires a privacy exception to be
**recorded, not derived**. O1 records the fourth one — the named enrolment roster — and the owner
**ratified v5.3.0 on 2026-08-14**. The condition is left in the table rather than erased, because the
record of a gate having been open is what shows it was checked.

**No violation requiring justification.** Three risks are tracked below rather than waived.

**Governance**: **blocked by nothing.** Constitution v5.3.0 ratified 2026-08-14. **Resolves**
no register entry. **Escalates** entry **4** (a fifth administrative destination plus a new
attendee-side control at the width that already truncates) and entry **22** (remaining places gives
the cached conference a third way to be wrong, which is why that read is live). **Opens** entry **31**,
which v5.3.0 opens. Migration **`0012`**, claimed at generation.

**Two departures this plan must state, per CLAUDE.md's roadmap rule.** The roadmap reserves `0012`
for 015 and directs 012 to `0010`; O4 voids both reservations, and the CHECK-constraint dependency on
`0011` rules out filling `0010`. The roadmap's number table is extended in the same change, and
`apps/api/migrations/meta/README.md` gains a fourth section recording why `0010` stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-conference-content-authoring/
├── spec.md                          # Part I (tranche 1) + Part II (tranche 2, 93 FRs, 15 SCs)
├── plan.md                          # this file — Part I + Part II
├── research.md                      # R1–R11 (tranche 1) + R12–R20 (tranche 2)
├── data-model.md                    # migration 0011 + Part II for 0012
├── contracts/authoring.md           # tranche 1
├── contracts/tranche-2.md           # NEW — enrolment, vocabulary, conference editor
├── quickstart.md                    # 9 scenarios + Part II scenarios
├── checklists/requirements.md       # tranche 1
├── checklists/requirements-tranche-2.md   # tranche 2, plus the review-gate record
└── tasks.md                         # Part II NOT created by /speckit-plan
```

### Source code (repository root)

```text
apps/api/src/
├── db/
│   ├── schema/
│   │   ├── vocabulary.ts               # NEW — sectors, subsectors, interest options (R17)
│   │   ├── agenda.ts                   # session_enrolments + its viewed state (R13, R15)
│   │   ├── catalog.ts                  # kind, capacity, closing offset, access link, nullable room
│   │   ├── events.ts                   # modality, format
│   │   └── profiles.ts                 # sector, subsector, activity, company. attendee_interests UNTOUCHED (R18)
│   └── queries/
│       ├── enrolments.ts               # NEW — the FOR UPDATE critical section (R12)
│       ├── admin-vocabulary.ts         # NEW — platform-tier authoring (R17)
│       ├── agenda.ts                   # listSaved grows a commitment discriminator (R13)
│       ├── session-changes.ts          # attendeesToNotify unions enrolments; countEngagement gains a separate held-places field (R15)
│       ├── admin-catalog.ts            # conference editor; capacity/kind refusals under the same lock (R12)
│       └── account.ts                  # withdrawal and deletion release places
└── routes/admin/
    └── vocabulary.ts                   # NEW — requirePlatformOperator (R20)

apps/admin/src/app/
├── shell/AdminShell.tsx                # one appended literal: { to: '/vocabulary', platformOnly: true } (R20)
├── vocabulary/                         # NEW — the fifth destination
├── conferences/ConferenceEditor.tsx    # NEW — modality and format, correctable (FR-1059)
├── conferences/SessionForm.tsx         # kind, capacity, closing offset, access link
├── conferences/EnrolmentRoster.tsx     # NEW — the fourth privacy exception (O1)
└── conferences/CancelDialog.tsx        # FR-1077c — must stop asserting nothing is attached

apps/web/src/app/
├── agenda/                             # enrol replaces save on optional sessions; roster-visibility notice
├── destinations/Agenda.tsx             # the filter, renamed (FR-1066a)
├── home/cards/NextSavedSession.tsx     # reads places as well as saves (FR-1066), renamed
└── profile/                            # sector, subsector, activity, company, controlled interests

apps/api/tests/unit/
├── no-attendee-state-disclosure.test.ts  # WIDENED, then exempted by name (R16)
├── engagement-coverage.test.ts           # one NOT_ENGAGEMENT entry; the four-table pin never fires (R15)
├── no-session-start-trigger.test.ts      # naming constraint, not a location change (R14)
├── no-draft-state.test.ts                # file list gains vocabulary.ts (R17)
├── profile-uneditable.test.ts            # PERSONAL_TABLES is hand-maintained, not derived (R17)
└── admin-destinations-mirror.test.ts     # NEW — the e2e list has no mirror today (R20)
```

**Structure Decision**: no new package, no new application, no new device capability. One new schema
file, one new query module for enrolment, one for the vocabulary, one new administrative destination.
**`attendee_interests` and `listDirectory` are not touched at all** (R18), which is the single
largest simplification Phase 0 produced.

## Complexity Tracking

> Three risks tracked rather than waived. None is a constitution violation.

| Risk | Why it is accepted | What would go wrong |
|---|---|---|
| **Enrolment serialises on an exclusive session-row lock, and the pool is small with a short `lock_timeout`** | There is no lock-free shape that expresses a *cardinality* bound: the throttle's insert-then-judge admits an over-count under commit reordering and would require deleting a committed row, which FR-1068 forbids by name; a unique index enforces a key, not a count. The critical section is three indexed statements, and an advisory pre-check keeps the common refusals off the lock entirely (R12) | A keynote-scale rush on one optional session exhausts the pool and **every route stops serving** — 016's recorded failure. The residual is bounded by a `session_enrol` throttle and surfaces as a 500 that must **never** be classified as "full" |
| **Enrolment replaces saving, so the read path every attendee surface depends on changes underneath them** | The alternative — a second parallel commitment concept — is the "saved but no place" state FR-1064 forbids, and it doubles every read | A commitment set that is correct on the server and stale on the device, or an Agenda filter still labelled "Saved" that contains sessions the attendee cannot save (FR-1066a) |
| **A fifth administrative destination and a new attendee control, with register entry 4 still open** | Entry 4 has never been answerable without a running product at a real width, and UAT exists. Building it and looking at it is the only thing that advances the entry | A vocabulary editor nobody has seen at 1280px, and a remaining-places figure that truncates the session title at 390px — the width failure entry 4 already records against the top bar |
