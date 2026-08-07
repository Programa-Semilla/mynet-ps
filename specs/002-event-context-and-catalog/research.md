# Phase 0 Research: Event Context, Session Catalog & Home Composition

**Feature**: 002-event-context-and-catalog | **Constitution**: v2.1.0

Every Technical Context unknown, resolved. Decisions the brainstorm already took are not re-litigated
here; what follows is how each one becomes something buildable, plus the decisions the brainstorm
deliberately left to this phase.

---

## D1 — Where the active-event selection lives

**Decision**: a dedicated table, `active_event_selections`, with `attendee_id` as its primary key and
a **composite foreign key** `(attendee_id, event_id) → registrations (attendee_id, event_id)`, on
delete cascade.

**Rationale**: FR-101 says the active event may never resolve to an unregistered event *under any
sequence of events*. A composite foreign key makes that a database guarantee rather than a rule every
read path has to remember. `registrations` already carries the unique constraint the reference needs
(`registrations_attendee_event_unique`), so nothing new is required to support it. When a
registration is removed, the selection row is deleted by cascade and the attendee falls back to
derivation — which is exactly the behaviour US4 scenario 4 asks for, obtained for free.

`attendee_id` as the primary key gives "at most one selection per attendee" structurally, so FR-100's
singularity needs no application check.

**Alternatives considered**:

- **A nullable `active_event_id` column on `attendees`.** Direct and readable, one fewer table. The
  composite key would have to point from `attendees (id, active_event_id)` into `registrations`,
  which creates a circular reference between the two tables — resolvable but awkward, and it puts a
  mutable column on the row that `auth-context` reads on nearly every request. Rejected for both
  reasons.
- **A column on `registrations`** — an `activated_at` timestamp, most recent wins. Correct by
  construction too, but "active" becomes an inference from an ordering rather than a statement, and
  ties need their own rule. Rejected as less direct for no gain.
- **A general `attendee_preferences` table.** A table for a future that has not been specified.
  Rejected under Principle VIII's "collect only what a requirement names".

---

## D2 — Making the scope predicate impossible to forget

**Decision**: two mechanisms, as the brainstorm chose.

**A branded `EventScope` value.** A TypeScript branded type carrying `attendeeId` and `eventId`,
whose only constructor lives in one module and is not exported. Every query function that reads
per-event data takes `EventScope` instead of a bare string. A handler that skips verification has no
way to obtain one, so it does not compile.

```
resolveEventScope(request)  ──►  EventScope  ──►  listSessions(scope)
       │                                              ▲
       └── verifies registration; the only            │
           construction site in the codebase ─────────┘
```

**A route audit test.** A test builds the real application and collects every registered route
through Fastify's `onRoute` hook, which exposes each route's URL and its `preHandler` list. It fails
when a route whose URL contains an event parameter does not carry the access guard.

**Why both**: the branded type protects the point where data is read; the audit protects the point
where routes are declared. A route could still be written that resolves a scope for the wrong
identifier, or that reads nothing but leaks existence through its status code — the audit is what
notices a route that never verified at all.

**The known gap, recorded rather than hidden**: a branded type can be defeated by a type assertion.
Mitigated by an ESLint `no-restricted-syntax` rule rejecting assertions to `EventScope` outside its
defining module, which turns the bypass into a lint failure rather than an invisible one. This is a
guard against forgetting, not against a determined author.

**Alternatives considered**: a guard `preHandler` alone, in the style of the shipped `requireAttendee`
— familiar, but enforcement would be entirely test-time. Per-feature isolation tests alone — depends
on eight future specs each remembering.

---

## D3 — How the client learns and changes the active event

**Decision**: two endpoints on a workspace resource, plus explicit event identifiers everywhere else.

- `GET /workspace/active-event` → the resolved active event, whether recorded or derived. Returns the
  full event including its timezone, so the client can compute day context without a second call.
- `PUT /workspace/active-event` with `{ eventId }` → records the selection. Refuses an event the
  attendee is not registered for, identically to a nonexistent one.
- `GET /events/:eventId/sessions` and the rest of the catalog → explicit identifier, guarded.

**Rationale**: it separates *which event is mine* (a property of the attendee, no identifier needed,
consistent with 001's identity binding) from *give me this event's content* (an explicit, verified
identifier, per the brainstorm decision). Neither endpoint accepts an attendee identifier, so 001's
rule survives intact.

**Alternatives considered**: folding the active event into `GET /auth/me`. Rejected — it would couple
the authentication response to workspace state and make the sign-in payload grow with every future
workspace preference.

---

## D4 — Where derivation is computed

**Decision**: in SQL, in a single query, using the database clock.

**Rationale**: the derivation is "the registered event whose venue-local current date falls within its
range". PostgreSQL expresses that directly — `(now() AT TIME ZONE e.timezone)::date BETWEEN
e.starts_on AND e.ends_on` — and doing it in one place means the tier test and the ordering share one
clock. The inbox entry `throttle-clock-provenance` records what happens when a decision straddles two
clocks: the API process's clock and the database's `now()` were mixed in 001's throttle, and nothing
in the code established that they were comparable. Computing derivation entirely in SQL avoids
repeating that.

**The total order required by FR-103**, applied within the selected tier: `starts_on` ascending, then
`ends_on` ascending, then `id` ascending. `id` is a generated UUID — stable, unique, and unchanging
for the life of the event — which satisfies FR-103's "stable, unchanging property, unique across
conferences" and its prohibition on depending on insertion order.

**Alternatives considered**: fetching all registered events and deriving in application code. Simpler
to unit-test, but it re-introduces the two-clock problem and moves work that scales with registration
count into the API process.

---

## D5 — Where day context is computed

**Decision**: on the client, from the event's `startsOn`, `endsOn` and `timezone` plus the device
clock, using the platform's own `Intl.DateTimeFormat` with an explicit `timeZone`.

**Rationale**: FR-121 forbids storing or transporting a day counter, and the shipped
`packages/data/src/interfaces/index.ts` records the same rule. `Intl.DateTimeFormat` with a `timeZone`
option resolves "what is today's date at the venue" without a date library and without a new
dependency — the constitution requires the dependency set to be derived from actual need.

FR-125's daylight-saving requirement follows from counting **calendar dates** in the venue zone
rather than dividing elapsed milliseconds: a 23-hour or 25-hour day is still one date.

**Alternatives considered**: adding a date/time library. Not yet justified — one formatter call and a
date difference is the whole computation. Revisit if 005's schedule work needs more.

---

## D6 — Session times

**Decision**: `timestamptz` for `starts_at` and `ends_at`; absolute instants over the wire; all
relative wording computed at display time.

**Rationale**: FR-124 requires it, and it settles the clock story the roadmap assigned to phase 003.
The event's timezone is used for grouping sessions into venue-local days and for display, never for
storage. A session crossing venue-local midnight belongs to the date it starts, which falls out of
grouping by the venue-local date of `starts_at`.

**Accepted, per the spec's Assumptions**: an attendee with a badly wrong device clock sees wrong
relative times. The product does not detect or correct clock skew.

---

## D7 — Track colour coding without hex literals

**Decision**: a track row carries a **token name** (for example `track-design`), not a colour. The
theme defines the tokens; the client maps token name to token.

**Rationale**: the constitution prohibits hardcoded hex literals and requires colours to be named
tokens in one place. Storing a colour in the database would put the palette in two places and let a
seed change alter the design system. Storing a token name keeps the palette in `tokens.css` where
contrast is already reasoned about.

An unknown token name must render as a defined neutral rather than an unstyled element — a seed typo
should degrade, not break. And per FR/accessibility, the track is always named in text as well, so
colour is never the sole carrier of meaning.

---

## D8 — The Home card contract

**Decision**: a discriminated union keyed on scope, in an append-only registry.

```ts
type HomeCardSlot = 'lead' | 'primary' | 'aside'

type HomeCard =
  | { id; title; slot: HomeCardSlot; order: number; scope: 'event';    Component: FC<{ event: Event }> }
  | { id; title; slot: HomeCardSlot; order: number; scope: 'attendee'; Component: FC }
```

**Rationale**: the discriminant is what makes FR-158–FR-160 checkable by the compiler. An
event-scoped card's component *requires* an `event` prop, so the shell cannot render it before the
event resolves, and an attendee-scoped card's component *cannot accept* one, so it cannot quietly
grow a dependency on the active event. Both halves of FR-160 hold by typing rather than by review.

**Containment (FR-163) is the shell's**: each registered card is rendered inside a boundary the shell
supplies, reusing the existing `ErrorBoundary`. A card author cannot forget it because a card author
never writes it.

**FR-157's single-lead rule** is enforced by a unit test over the registry, plus a development-mode
assertion. It cannot be a type-level guarantee over an array of arbitrary length without contorting
the registry into a shape later features would find hostile to append to — the trade is recorded
here rather than glossed.

**Alternatives considered**: one card kind with an ambient hook. Rejected in brainstorm #02; the
compiler could not then distinguish a card that legitimately ignores the event from one that forgot
to handle its absence.

---

## D9 — Concurrent switches (FR-118)

**Decision**: the server's `PUT` is an idempotent set with no ordering logic; the client sequences.
Each switch request carries a monotonically increasing local sequence number, and the client applies
only the outcome of the highest-numbered request it has issued. Once all requests settle, the client
holds the last-selected event, and it matches what the server recorded because the last request
issued is the last one the server processed for that session.

**Rationale**: FR-118 requires the system not to come to rest displaying one event while having
recorded another. Sequencing on the client is sufficient and keeps the endpoint simple.

**The residual risk, stated**: two requests can in principle arrive at the server out of order under
adverse network conditions, leaving the stored selection behind the displayed one. Detection is
cheap — the response echoes the recorded event — and the client reconciles by re-reading if the echo
disagrees with its latest selection. This is reconciliation, not an optimistic update: nothing is
shown as saved before the server confirms it, so no recorded decision under Principle VI is required.

**Alternatives considered**: disabling the switcher while a switch is in flight. Simpler, but it makes
a quick second choice feel broken, and FR-118 explicitly requires the last selection to win rather
than the first.

---

## D10 — Splitting the three shared files

**Decision**, all three behind the same pattern — a barrel that re-exports, so no consumer's import
path changes and FR-183's behaviour-neutrality is easy to demonstrate:

| File today | Becomes |
|---|---|
| `packages/data/src/interfaces/index.ts` | `interfaces/{attendee,events,catalog,errors}.ts` + `index.ts` re-exporting |
| Route registration inside `apps/api/src/app.ts` | `routes/index.ts` exporting an ordered array of route plugins; `app.ts` iterates it |
| `apps/api/src/db/seed.ts` | `db/seed/{attendees,events,catalog}.ts` + `seed/index.ts` running them in declared order |

**Rationale**: the roadmap's coordination protocol names all three as registry files whose conflicts
should be one mechanical line. Seed order matters because of foreign keys, so the seed registry
declares an order rather than discovering one.

**`app.ts` keeps its numbered composition comments.** Only step 8 becomes a loop; the ordering
commentary on steps 1–7 is load-bearing and stays exactly where it is.

---

## D11 — Migrations

**Decision**: two migrations, `0001` and `0002`, matching the spec's Assumptions and the reserved
numbers the roadmap transferred here.

- `0001_event_context.sql` — `events.timezone`, `active_event_selections`.
- `0002_session_catalog.sql` — `tracks`, `rooms`, `speakers`, `sessions`, `session_speakers`.

**Rationale**: it keeps the event-context change reviewable apart from the catalog, matching the
commit separation FR-183 asks for, and it honours the reservation rather than silently retiring a
number.

**`events.timezone` needs a value for existing rows.** It is added with a default of `'UTC'`,
back-filled by the seed with real IANA zones, and then the default is dropped in the same migration
so no future event can be created without a deliberate timezone. A column that silently defaults is
how a wrong day number ships unnoticed.

---

## D12 — Seeded catalog content

**Decision**: two of the three seeded events receive full, deliberately disjoint programmes; the
third keeps none.

**Rationale**: SC-107 requires no session title, track name, room name or speaker name to appear in
both, and requires the session counts to differ. The third event with no programme is not an
oversight — it is the fixture FR-139 and US2 scenario 5 need, and without it the empty state is
untested. Ada is registered for one populated and one empty event; Grace for the other populated one
and the shared event, which preserves 001's overlap proving that isolation follows the registration
rather than the event.

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Where the active-event selection is stored | D1 |
| How the scope predicate is enforced | D2 |
| How the client learns and sets the active event | D3 |
| Which clock derives the active event | D4 |
| Where day context is computed, and with what | D5 |
| How session times are stored and rendered | D6 |
| How track colours avoid hex literals | D7 |
| The exact Home card descriptor | D8 |
| Concurrent switch semantics | D9 |
| The shape of the three registry splits | D10 |
| Migration numbering and the timezone back-fill | D11 |
| What the seed must contain to satisfy SC-107 | D12 |

No `NEEDS CLARIFICATION` remains.
