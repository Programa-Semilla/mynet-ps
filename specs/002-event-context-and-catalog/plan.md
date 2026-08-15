# Implementation Plan: Event Context, Session Catalog & Home Composition

**Branch**: `spec/002-event-context-and-catalog` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-event-context-and-catalog/spec.md`

**Constitution**: v2.1.0

---

## Summary

Make the active event durable per-attendee state, enforce the per-event scoping predicate
server-side, put the event switcher at all three widths, derive day context from the venue's
timezone, define the Home card composition contract, and deliver the session catalog — schema, read
API, repository, Agenda screen and track colours — absorbed from roadmap phase 003.

**Technical approach.** The active-event selection becomes its own table whose composite foreign key
into `registrations` makes "never an unregistered event" a database guarantee rather than a rule
every read path must remember. Per-event content is reached through a branded `EventScope` value that
only the access guard can construct and that every per-event query requires, so a handler skipping
verification does not compile; a route-table audit covers the routes themselves. Home becomes a
registry of cards discriminated on scope, so the compiler distinguishes a card that needs the active
event from one that must survive without it, and the shell — not each card author — supplies
containment. Day context is computed on the client from the event's IANA timezone, never stored and
never transported. Three shared files are split into per-domain modules behind barrels in a separate
first commit, so later features append rather than edit.

Full reasoning in [research.md](./research.md); schema and scoping rules in
[data-model.md](./data-model.md); endpoints in [contracts/README.md](./contracts/README.md);
validation scenarios in [quickstart.md](./quickstart.md).

---

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (API) and React 19 (client), ESM throughout

**Primary Dependencies**: Fastify + `@fastify/swagger` (API and generated contract), Drizzle ORM,
React + React Router, Tailwind over the token layer in `apps/web/src/theme/tokens.css`,
`lucide-react` for icons. **No new runtime dependency is added by this feature** — day context uses
the platform's own `Intl.DateTimeFormat` (research D5).

**Storage**: managed PostgreSQL, via versioned SQL migrations in `apps/api/migrations/`. This feature
emits `0001_event_context.sql` and `0002_session_catalog.sql`.

**Testing**: Vitest across four projects (`unit`, `component`, `integration`) plus Playwright
(`test:e2e`). Integration tests run against a real database. Existing commands are unchanged:
`pnpm verify` and `pnpm verify:clean`.

**Target Platform**: installable PWA in evergreen browsers, 320px upward; Linux CI, no Apple
infrastructure.

**Project Type**: pnpm workspace — web client, API service, and shared packages.

**Performance Goals**: no numeric target is set by the spec, and none is invented here. The
constraints that do bind are user-facing: the first viewport must answer three questions without
scrolling (SC-101), and a switch must leave no surface showing the previous event (SC-102).

**Constraints**: no content or primary action may require horizontal scrolling at any supported
width; nothing is cached for offline use in this feature; no optimistic updates; no new personal data
is stored.

**Scale/Scope**: two new API resource groups (5 endpoints total including the two workspace ones),
six new tables, one new destination screen (Agenda), four Home cards, three registry splits, two
migrations. This is the largest feature in the delivery plan.

---

## Global Constraints

**Every task inherits this section.** These are project-wide rules copied verbatim from the
specification and the constitution, gathered here so no task has to re-derive them and no task may
plead ignorance of them.

1. **No endpoint accepts an attendee identifier** — no path parameter, query parameter, header, or
   body field. Identity comes from the sign-in session cookie. (001, FR-106, unchanged.)
2. **Every per-event request names its event, and the server verifies registration before any read.**
   The verification is a precondition of reading, not a step a reader may omit. (FR-145–FR-147.)
3. **A refusal discloses nothing about existence.** Not-registered and no-such-event return identical
   status *and* identical body. (FR-148.)
4. **No content and no primary action may require horizontal scrolling at any supported width**, from
   320px upward. (Constitution Principle IV.)
5. **Colours come only from named tokens** in `apps/web/src/theme/tokens.css`. Hex literals in
   components are prohibited, and no colour value is ever stored in the database. (Constitution,
   design tokens; FR-136.)
6. **Colour is never the sole carrier of meaning** — a track is always named in text as well.
7. **No new runtime dependency** is added by this feature. Day context uses the platform's own
   `Intl.DateTimeFormat`. (Constitution: the dependency set is derived from actual need.)
8. **Nothing is cached for offline use.** Every conference-scoped surface states that it needs a
   connection, distinguishing that from a server fault. (Spec Feature Declarations, offline row.)
9. **No optimistic updates and no conflict resolution.** Each would require its own recorded decision
   under Principle VI. Nothing is shown as saved before the server confirms it.
10. **No write path to conference content at any privilege**, and no content import path. Both are
    organizer administration, which Principle III places out of scope. (FR-132, FR-134.)
11. **Every interactive control** has an accessible label, a visible focus state, and keyboard
    operability; anything modal has a clear close action and Escape dismissal. (Principle IV.)
12. **Every surface crossing the network** declares loading, empty, and failure states. An
    obligation not declared is presumed unmet. (Principle IX.)
13. **Every new route carries a `schema` block.** A route without one is invisible to the contract
    generator and therefore silently absent from `contracts/openapi.json`.

### Two requirements verified structurally rather than by a test

Stated plainly, because "no task covers it" and "nothing can cover it" look identical in a coverage
matrix and are not the same thing.

- **FR-151, authorization is never client-side filtering.** There is no test that proves a negative
  across a whole codebase. What makes it hold is that the client never receives data it may not see:
  every per-event response is already filtered by `EventScope` server-side (constraint 2), and the
  isolation suite asserts the server refuses rather than that the client hides. A component filtering
  for presentation is fine; it is simply not what is standing between an attendee and someone else's
  data.
- **FR-164, no card may depend on another card's presence, ordering, or data.** Enforced by the card
  contract's shape rather than by assertion: a card receives its declared scope's props and nothing
  else — no registry handle, no sibling reference, no shared store. There is no expression a card
  author could write to reach another card, which is why no test tries.

## Shared interfaces

Named here because a task's implementer sees only their own task. Any task consuming another's output
uses exactly these names and shapes.

```ts
// apps/api/src/plugins/event-access.ts — T036. The ONLY construction site.
declare const brand: unique symbol
export type EventScope = { readonly attendeeId: string; readonly eventId: string; readonly [brand]: true }
export const requireEventAccess: (request, reply) => Promise<void>   // sets request.eventScope

// apps/api/src/db/queries/active-event.ts — T019, T056
export const resolveActiveEvent: (attendeeId: string) => Promise<EventRow | null>
export const recordActiveEvent: (attendeeId: string, eventId: string) => Promise<EventRow | null>

// apps/api/src/db/queries/catalog.ts — T037. Bare strings are not accepted.
export const listSessions: (scope: EventScope) => Promise<SessionRow[]>
export const listTracks: (scope: EventScope) => Promise<TrackRow[]>

// packages/data/src/interfaces/events.ts — T011
export interface ActiveEventRepository {
  getActive(): Promise<Event | null>          // null === registered for no events
  setActive(eventId: string): Promise<Event>
}

// packages/data/src/interfaces/catalog.ts — T041
export interface CatalogRepository {
  listSessions(eventId: string): Promise<Session[]>
  listTracks(eventId: string): Promise<Track[]>
}
export interface Session {
  id; title; summary: string | null; startsAt: string; endsAt: string
  track: Track; room: Room; speakers: Speaker[]   // [] when none — never null (FR-138)
}
export interface Track { id: string; name: string; colorToken: string }   // token NAME, never a colour

// apps/web/src/app/home/contract.ts — T012
export type HomeCardSlot = 'lead' | 'primary' | 'aside'
export type HomeCard =
  | { id: string; title: string; slot: HomeCardSlot; order: number; scope: 'event';    Component: FC<{ event: Event }> }
  | { id: string; title: string; slot: HomeCardSlot; order: number; scope: 'attendee'; Component: FC }
```

`Event` gains `timezone: string` (IANA) in T011 and carries **no** `dayNumber` or `totalDays`, now or
ever (FR-121).

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Verdict | Basis |
|---|---|---|
| **I** — Requirements define the product | **PASS** | No capability, data model or business rule is introduced that is not traceable to `requirements.md` or a recorded decision. The roadmap departure is recorded in the spec, as the roadmap requires. No register entry is closed by inference. |
| **II** — Prototype is reference, not architecture | **PASS** | The prototype supplies interaction shape, copy and track names only. Its single-file state model, hex literals and inline SVG are not carried forward. Its hardcoded persona and static day counter are the defects this feature removes. |
| **III** — Attendee experience first | **PASS** | Answers question 1, "What is happening next?", which is the highest-prominence question. Organizer administration stays out: the catalog is seeded, with no write path at any privilege and no import path. |
| **IV** — Accessibility and responsiveness | **PASS** | Three layouts and the accessibility obligations are declared per surface in the spec's Feature Declarations. The switcher's overlay carries a close action and Escape dismissal. Track colour is never the sole carrier of meaning — the track is also named in text. |
| **V** — Abstraction before platform and data APIs | **PASS** | New repository interfaces in domain terms; no component constructs a request or knows about HTTP. The composition root in `apps/web/src/app/services.ts` remains the only module naming implementations. |
| **VI** — Web-first, bounded offline | **PASS** | Offline behaviour is declared per surface. Switching offline is refused, not queued, and never shown as succeeded. **No optimistic update is introduced** — the concurrent-switch handling in research D9 reconciles after the server confirms, which is not the same thing and needs no separate recorded decision. |
| **VII** — Verified on Linux CI | **PASS with a recorded risk** | Every gate this feature relies on already exists in `pnpm verify`. **The risk**: the route audit and the isolation suite are enforced only by CI, and the brainstorm overview records that runs have been queued since 2026-08-06 with nothing on `develop` having ever passed. Recorded in Complexity Tracking; it is a project condition, not a design flaw. |
| **VIII** — Attendee data is personal data | **PASS** | Identity binding is unchanged from 001 and no endpoint accepts an attendee identifier. Event scoping is verified server-side before any read, and refusals disclose nothing about existence. No new personal data is stored. Secrets are unaffected. |
| **IX** — Every feature declares its own completeness | **PASS** | The spec's Feature Declarations table is complete on every row, including register position and both reserved migration numbers. No obligation is deferred to a later polish pass. |

**Re-check after Phase 1 design**: unchanged. The design added one thing worth naming — the branded
`EventScope` is defeatable by a type assertion, which is why research D2 pairs it with an ESLint rule
rather than presenting the type alone as a guarantee. That is a stated limit, not a violation.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-event-context-and-catalog/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 — twelve decisions, no NEEDS CLARIFICATION remaining
├── data-model.md        # Phase 1 — six tables, each declaring its scoping rule
├── quickstart.md        # Phase 1 — eight validation scenarios
├── contracts/
│   └── README.md        # Phase 1 — what this feature adds to the generated contract
├── checklists/
│   └── requirements.md  # Spec quality checklist + review gate record
└── tasks.md             # Phase 2 — created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
apps/api/
├── migrations/
│   ├── 0001_event_context.sql        # events.timezone; active_event_selections
│   └── 0002_session_catalog.sql      # tracks, rooms, speakers, sessions, session_speakers
└── src/
    ├── app.ts                        # step 8 becomes a loop over the route registry; steps 1–7 unchanged
    ├── auth/                         # unchanged
    ├── db/
    │   ├── schema/
    │   │   ├── events.ts             # + timezone
    │   │   ├── active-event.ts       # new
    │   │   └── catalog.ts            # new — tracks, rooms, speakers, sessions, session_speakers
    │   ├── queries/
    │   │   ├── events.ts             # unchanged
    │   │   ├── active-event.ts       # new — derivation in SQL, and recording a selection
    │   │   └── catalog.ts            # new — every function takes EventScope, never a bare string
    │   └── seed/
    │       ├── index.ts              # new — ordered registry, replaces seed.ts
    │       ├── attendees.ts          # new
    │       ├── events.ts             # new
    │       └── catalog.ts            # new
    ├── plugins/
    │   ├── auth-context.ts           # unchanged
    │   └── event-access.ts           # new — requireEventAccess; sole construction site of EventScope
    └── routes/
        ├── index.ts                  # new — append-only ordered array of route plugins
        ├── workspace/active-event.ts # new — GET and PUT
        └── events/catalog.ts         # new — sessions and tracks, both guarded

packages/data/src/
├── interfaces/
│   ├── index.ts                      # becomes a re-exporting barrel
│   ├── attendee.ts                   # split out
│   ├── events.ts                     # split out; + ActiveEventRepository
│   ├── catalog.ts                    # new — Session, Track, Room, Speaker, CatalogRepository
│   └── errors.ts                     # split out
└── http/
    ├── active-event-repository.ts    # new
    └── catalog-repository.ts         # new

apps/web/src/
├── app/
│   ├── services.ts                   # + the two new repositories at the composition root
│   ├── home/
│   │   ├── contract.ts               # new — HomeCardSlot, HomeCard, the discriminated union
│   │   ├── registry.ts               # new — APPEND-ONLY. Later features add one line here
│   │   ├── HomeShell.tsx             # new — slots → widths in one place; owns containment
│   │   └── cards/                    # greeting-day-context, up-next, rest-of-day, your-conferences
│   ├── active-event.tsx              # new — resolves the active event above the cards
│   └── destinations/
│       ├── Home.tsx                  # becomes the shell + registry
│       └── Agenda.tsx                # new — the programme, chronological, read-only
├── shell/
│   └── EventSwitcher.tsx             # new — in TopBar, all three widths
└── theme/tokens.css                  # + track colour tokens
```

**Structure Decision**: the existing pnpm workspace is kept exactly as 001 established it. This
feature adds directories rather than reshaping any, with one deliberate exception — the three splits
in FR-180–FR-182, each done behind a barrel so no consumer's import path changes and FR-183's
behaviour-neutrality is demonstrable by an unchanged test suite and a byte-identical generated
contract.

`apps/web/src/app/home/registry.ts` is the file the next seven features touch. It is the only shared
file this design leaves in their path, and by construction their change to it is a single line.

---

## Complexity Tracking

Three departures that need justifying rather than assuming.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Per-event requests carry an explicit event identifier**, weakening 001's structural rule that no endpoint accepts *any* identifier | Owner decision in brainstorm #02. Self-describing requests, cacheable and independently verifiable, with the active event as a default rather than hidden request state | Server-resolved implicit scoping was explored and rejected: it keeps interfaces thinner but makes a response depend on state the request does not name, forbids two events in two tabs, and requires the client to invalidate every per-event cache on switch. The cost of the choice taken — every handler must remember to verify — is what `EventScope` and the route audit exist to pay down |
| **A branded `EventScope` type plus a route-table audit**, where a single guard `preHandler` would be the familiar pattern | FR-147 requires verification to be a *precondition of reading*, not a step a reader may omit. A `preHandler` alone is enforced at test time; the branded type moves it to compile time, at the point where data is actually read | A guard alone was rejected: a route can be written, type-check cleanly, and only fail once the audit runs — and the audit only covers routes, not the query layer. The two together cover both surfaces. The residual gap, a type assertion, is closed by lint rather than left unstated (research D2) |
| **This feature absorbs roadmap phase 003 entirely**, making it by far the largest in the plan and removing the first free parallel pair | Owner decision in brainstorm #02. Without real per-event content, `EventScope` would have nothing to carry and the card contract would have one consumer — both proven by shape rather than by use, which is the `substitutability-proven-without-the-application` finding from the 001 review repeated on a surface seven features inherit | Keeping the roadmap boundary was explored across four rounds. Each smaller version left either the predicate or the contract unvalidated, or split the catalog's schema from its readers so that 003 would alter a table it did not design |

### One project condition, recorded because it changes what "verified" means here

**CI is not running.** Runs have been queued since 2026-08-06 and nothing on `develop` has ever
passed. Two of this feature's central guarantees — the route audit (FR-149) and the isolation suite
(FR-150) — are enforced only there. Until CI runs, `pnpm verify:clean` locally is the only place they
are checked, which is why quickstart.md makes running it before opening the pull request
non-optional. This is not a design flaw and needs no justification in the design; it is a condition
that must not be discovered at merge time.
