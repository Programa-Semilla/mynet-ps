# Implementation Plan: Agenda and Saved Sessions

**Branch**: `spec/005-agenda-and-saved-sessions` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-agenda-and-saved-sessions/spec.md`

**Constitution**: v2.2.0 | **Brainstorm**: `brainstorm/03-agenda-and-saved-sessions.md`

## Summary

Turn the read-only programme 002 delivered into the personalised schedule `requirements.md`
describes. Two new per-event tables behind one migration (`0004`), a repository of their own that is
never the catalog's, an All/Saved filter and a save control on Agenda, an addressable session detail
panel with a real focus trap, non-optimistically autosaved personal notes, one appended Home card,
and a per-conference cache that serves both offline reads and repeat reads.

The technical shape follows what 002 established rather than inventing alongside it: the branded
`EventScope` for authorization, the append-only registries for routes, interfaces, seed and Home
cards, and `useAsync` for every surface crossing the network. The one genuinely new mechanism is the
cache, and it is placed at the repository boundary so no component learns that it exists.

**This feature also repairs the route audit** (`apps/api/tests/unit/event-scope-audit.test.ts`),
which currently fails in CI. That is not incidental scope: the audit is the enforcement behind
FR-230, so shipping 005 while it cannot run would ship the requirement unenforced.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22 (API), ES2022 modules throughout

**Primary Dependencies**: Fastify + Drizzle (API), React 19 + react-router (web), Vitest +
Playwright (tests), Neon PostgreSQL

**Storage**: Managed PostgreSQL for durable state; **IndexedDB** for the client cache — see research
D2. `SecureStorage` is explicitly *not* used, because the constitution forbids it as a general cache

**Testing**: Vitest projects `unit` / `component` / `integration`; Playwright for e2e; axe for
accessibility

**Target Platform**: Installable PWA (browser), Linux-hosted API

**Project Type**: pnpm monorepo — `apps/api`, `apps/web`, `packages/data`, `packages/platform`

**Performance Goals**: Repeat reads of one conference's programme parse and sort **once**, not once
per caller (SC-210). Formatter caching from 002 is preserved

**Constraints**: Offline reads with a 24-hour cache lifetime; no write queue; no optimistic update;
no conflict merging; no horizontal scroll at 320px; FR-164 independence preserved over the shared
cache

**Scale/Scope**: 54 functional requirements, 6 user stories, 2 tables, 1 migration, ~5 endpoints,
1 new destination route, 1 Home card

## Global Constraints

**Every task inherits this section.** These values are decided, not discretionary — an implementer
handed one task in isolation needs them without reading the whole spec. Copied verbatim from
`spec.md` and `research.md`.

| Constraint | Value | Source |
|---|---|---|
| Note maximum length | **10,000 characters** — enforced at the column, the route schema, *and* surfaced in the editor before it is reached | FR-213, research D9 |
| Cache lifetime | **24 hours from retrieval.** Beyond it, content is refused exactly as a conference never read | FR-221, research D10 |
| Cache key | **`(attendeeId, eventId, resource)`** where `resource ∈ {programme, saved, notes}` | research D10 |
| Autosave debounce | **1200 ms**, and it MUST stay within **500 ms–3 s** | FR-209, research D5 |
| Narrowest supported width | **320 px** — no content or primary action may require horizontal scrolling | FR-197, SC-211 |
| Reserved migration | **`0004`**, exactly one. Never renamed to resolve a conflict; `0005` belongs to 006 | Roadmap, FR/plan |
| Panel mechanism | Native **`<dialog>` + `showModal()`**, overlay at every width, full-width at mobile | FR-199, research D3 |
| Forbidden by governance | No write method on `CatalogRepository`; no optimistic update; no write queue; no conflict merging; **`SecureStorage` is not a cache** | FR-191, FR-214, FR-217, constitution |

## Interfaces

Names and types crossing task boundaries, so a task's implementer learns them without reading
neighbouring tasks. Full detail in [data-model.md](./data-model.md) and
[contracts/agenda-api.md](./contracts/agenda-api.md).

**Query layer** — `apps/api/src/queries/agenda.ts`. Every function takes `EventScope` first:

```
listSavedSessionIds(scope: EventScope): Promise<string[]>
saveSession(scope: EventScope, sessionId: string): Promise<void>
unsaveSession(scope: EventScope, sessionId: string): Promise<void>
listNotes(scope: EventScope): Promise<Array<{ sessionId: string; body: string; updatedAt: string }>>
upsertNote(scope: EventScope, sessionId: string, body: string): Promise<{ updatedAt: string }>
deleteNote(scope: EventScope, sessionId: string): Promise<void>
```

**Repository interfaces** — `packages/data/src/interfaces/agenda.ts`. No method accepts an attendee
identifier; identity comes from the session:

```
SavedSessionRepository.listSaved(eventId: string): Promise<string[]>
SavedSessionRepository.save(eventId: string, sessionId: string): Promise<void>
SavedSessionRepository.unsave(eventId: string, sessionId: string): Promise<void>
SessionNotesRepository.listNotes(eventId: string): Promise<SessionNote[]>
SessionNotesRepository.writeNote(eventId: string, sessionId: string, body: string): Promise<SessionNote>
SessionNotesRepository.deleteNote(eventId: string, sessionId: string): Promise<void>
```

**Cache decorator** — `packages/data/src/http/cached.ts`:

```
cached<T extends object>(repo: T, store: LocalCache, scope: { attendeeId: string }): T
LocalCache.read<T>(key: string): Promise<{ payload: T; retrievedAt: string } | null>
LocalCache.write<T>(key: string, payload: T): Promise<void>
LocalCache.purge(keyPrefix: string): Promise<void>
```

**Note autosave status** — `apps/web/src/app/agenda/useNoteAutosave.ts`:

```
type NoteStatus = 'idle' | 'saving' | 'saved' | 'failed'
```

`'saved'` is entered **only** from a resolved write. Entering it from a keystroke makes this
optimistic and incurs two decisions the constitution requires be recorded separately.

## Constitution Check

*GATE: evaluated against v2.2.0 before Phase 0, re-checked after Phase 1.*

| Principle | Gate | Status |
|---|---|---|
| **I** — Requirements define the product | Every capability traceable to an authoritative source or recorded decision | **PASS.** All 54 FRs trace to `requirements.md` (agenda management, notes), the approved prototype (All/Saved filter, panel), or brainstorm #03. No open question closed by inference |
| **II** — Prototype is reference, not architecture | Structural decisions re-decided explicitly | **PASS.** The prototype's `useState` panel and `Set<string>` saves are replaced by durable server state and an addressable route, both decided in #03 |
| **III** — Attendee experience first | Serves one of the three questions | **PASS.** "What is happening next?" — this is the phase that makes the answer *personal* |
| **IV** — Accessibility and responsiveness | Labels, visible focus, keyboard, Escape, three layouts, empty/loading/failure | **PASS by construction.** FR-189, FR-197, FR-202 and the declaration table. The panel is the product's **first real focus trap** |
| **V** — Abstraction before platform and data APIs | No component calls the network or a platform API | **PASS.** New repository interfaces in domain terms (FR-234); the cache lives *behind* them, so no component learns caching exists. IndexedDB is reached through a platform-layer interface, not directly |
| **VI** — Web-first, offline explicit and bounded | Offline behaviour specified; no speculative optimistic update | **PASS.** FR-215–FR-222 specify it exactly. Non-optimistic autosave and refused-not-queued writes are chosen *precisely* to avoid incurring decisions the constitution requires be recorded separately |
| **VII** — Verified on Linux CI | Pipeline green; breach clause (new in 2.2.0) | **⚠ BLOCKED AT MERGE, not at plan.** Register entry 17. This plan repairs one of the two causes (the audit's `DATABASE_URL`); the other (`NEON_API_KEY` unset) is a repository secret only the owner can set. See Complexity Tracking |
| **VIII** — Attendee data is personal data | Identity scoping, server-side authz, secrets, minimal collection, private content, deletion/export recorded | **PASS with a declared limit.** FR-227–FR-232. Notes are this product's first attendee-authored free text; the narrow retention commitment is declared and register entry 6 records what remains open |
| **IX** — Every feature declares its completeness | Declaration table complete; each obligation traceable to ≥1 task | **PASS.** The table is filled with no silent rows; `/speckit-tasks` must produce at least one task per row |

**Gate result: PASS to Phase 0.** The single ⚠ is a pre-existing environmental breach recorded in
the register, not a design violation introduced here, and it gates merge rather than planning.

## Project Structure

### Documentation (this feature)

```text
specs/005-agenda-and-saved-sessions/
├── plan.md              # This file
├── spec.md              # Already written, review gate passed
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist, passing
```

### Source Code (repository root)

Files marked **new** are this feature's own; **append** means a one-line addition to an append-only
registry; **edit** means genuinely modifying existing content, and every one is justified below.

```text
apps/api/
├── migrations/
│   └── 0004_saved_sessions_and_notes.sql        new — reserved number, two tables
├── src/
│   ├── db/
│   │   ├── schema/agenda.ts                     new — Drizzle tables
│   │   └── seed/                                 (untouched — no seeded personal data)
│   ├── routes/
│   │   ├── index.ts                             append — one plugin entry
│   │   └── events/agenda.ts                     new — saves + notes, all under :eventId
│   └── queries/agenda.ts                        new — every function takes EventScope
└── tests/
    ├── unit/event-scope-audit.test.ts           edit — repair DATABASE_URL (research D7)
    └── integration/agenda.test.ts               new — isolation against real seeded rows

packages/data/
├── src/interfaces/
│   ├── agenda.ts                                new — SavedSessionRepository, NotesRepository
│   └── index.ts                                 append — two exports + two Repositories members
└── src/http/
    ├── agenda-repository.ts                     new — HTTP implementation
    ├── cached.ts                                new — the cache decorator (research D1)
    └── index.ts                                 append

packages/platform/
├── src/interfaces/local-cache.ts                new — the storage interface (Principle V)
└── src/web/local-cache.ts                       new — IndexedDB implementation

apps/web/src/app/
├── navigation.ts                                edit — optional `element` on Destination (FR-233)
├── routes.tsx                                   edit — retire the '/agenda' literal (FR-233)
├── destinations/Agenda.tsx                      edit — filter + save control + panel outlet
├── SessionPresentation.tsx                      edit — save control on the row
├── agenda/                                      new — panel, notes editor, filter, hooks
├── home/
│   ├── registry.ts                              append — ONE line
│   └── cards/NextSavedSession.tsx               new — this feature's card
└── (UpNext.tsx, RestOfDay.tsx, …)               UNTOUCHED — decision 9

apps/web/tests/
├── component/                                   new + edit (002's US2 scenario 6 — FR-236)
└── unit/
e2e/                                             new — save → filter → panel → note journey
```

**Structure Decision**: the existing pnpm monorepo, unchanged. This feature adds no package and no
destination. Four files are genuinely edited outside this feature's own directories —
`navigation.ts` and `routes.tsx` (FR-233, which *removes* a special case rather than adding one),
`Agenda.tsx` and `SessionPresentation.tsx` (the surfaces 002 built expressly for 005 to extend).
Each is named in the spec, so none is a surprise at review.

## Parallel-safety with 006

006 (Discover) may run alongside this. The three files both features would otherwise contend over
were split per domain by 002, and this feature honours the split: it **appends** to
`routes/index.ts`, `interfaces/index.ts` and `home/registry.ts` and writes its own file for
everything else. The seed is untouched entirely — saved sessions and notes are attendee-authored, so
seeding them would fabricate personal data.

Migration `0004` is claimed here; `0005` stays reserved for 006. Neither may be renamed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **A cache layer, which the roadmap did not scope into 005** | A personal schedule unreadable in a venue with no signal has failed where it is used. Closes 002's Open Question 2 and two idea-inbox entries | Caching nothing (002's behaviour) ships a visibly broken feature. Caching only saved sessions breaks browsing-to-decide, which is the main reason to open Agenda |
| **`/agenda/<sessionId>` names a session, where 002 made addresses conference-neutral** | The panel must be linkable and Back-dismissable, and a Home card must reach it without touching Agenda's state, which decision 9 forbids | A state-driven overlay (the prototype's shape) leaves Back unable to close it on a touch device and gives the Home card no permitted route in. FR-204 handles the cross-conference case explicitly |
| **Editing `navigation.ts` and `routes.tsx`, which are shared** | FR-233. The router currently branches on the literal `'/agenda'`; four later features would each add a branch | Leaving it means 006–009 each edit `routes.tsx` — the contention this change removes. It is a net *reduction* in shared-file editing |
| **Repairing `event-scope-audit.test.ts`, which 002 owns** | It is FR-230's enforcement and it currently fails in CI. Shipping 005 with it red means shipping the scoping guarantee unenforced | Leaving it to a separate change means 005's own new routes are never audited before merge — the audit exists precisely to catch the routes this feature adds |
| **⚠ Merging under register entry 17** | Not a design decision — a pre-existing environmental fault. `NEON_API_KEY` is unset, skipping every database-dependent stage | Cannot be resolved in code. Requires the owner to set a repository secret. Under Principle VII as amended, merging 005 needs that fixed or a recorded waiver |

## Phase status

- [x] Phase 0 — research complete → [research.md](./research.md)
- [x] Phase 1 — design complete → [data-model.md](./data-model.md), [contracts/](./contracts/),
      [quickstart.md](./quickstart.md)
- [x] Constitution re-check after Phase 1 — no new violations; the table above stands unchanged
- [ ] Phase 2 — `/speckit-tasks` (not produced by this command)
