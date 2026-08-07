# Brainstorm: Event Context, Session Catalog & Home Composition

**Date:** 2026-08-06
**Status:** active

## Problem Framing

The production foundation shipped (PR #2). The five destinations are addressable, an attendee signs
in, and the client reaches PostgreSQL through a project-owned API — but the destinations carry no
product content. The delivery roadmap names **002 Event Context & Home Composition** as the next
phase and as the spine the remaining seven build on.

Seeded from `brainstorm/idea-inbox.md` → `phase-002-event-context-and-home-composition`. The six
deep-review entries from 001 were left in the inbox, untouched.

Three things make this phase unusual, and they set the agenda for the session:

**It commits to contracts before it has consumers.** The Home card composition contract (owner
decision D3) and the per-event scoping predicate (D1) are both inherited by every later phase.
The roadmap's own words: *"If 002 gets it wrong, every subsequent phase inherits the mistake."*
Neither has a cheap correction.

**It has nothing of its own to validate those contracts against.** Conference content arrives in
003. A scoping predicate with no scoped content, and a card contract with one card, would be proven
the way 001's device-substitution tests proved substitutability — by comparing shapes rather than
running application code. That finding is sitting in the inbox right now
(`substitutability-proven-without-the-application`), which made it the session's recurring test:
*is this claim proven by use, or only asserted?*

**Two shipped design notes constrain the answer.** `packages/data/src/interfaces/index.ts` states
that no repository method accepts an attendee identifier, because identity is bound server-side
from the session cookie — cross-attendee reads are structurally impossible rather than
test-enforced. And the same file states that `dayNumber`/`totalDays` are absent by design, because
transporting a derived day counter goes stale the moment the clock moves. Any event-scoping design
either extends the first note's logic or departs from it, and any day-context design has to respect
the second or reopen it explicitly.

A fourth constraint arrived from the existing schema: `events` stores `starts_on` and `ends_on` as
bare dates with **no timezone**. "Day 2 of 4" is undefined until that is settled — at 20:00 in Lima
it is already the next day in Barcelona.

## Approaches Considered

Eight decisions, explored in sequence. The first two fix the server contract, the next two the
composition contract, the next two the product semantics, and the last two the phase boundary.

### 1. How a per-event request names its event

#### A: Server-resolved, implicit
No method and no route takes an event id; the server reads the attendee's stored active event from
the session, exactly as it already reads identity.
- Pros: mirrors the shipped no-`attendeeId` rule, so cross-event reads become structurally
  impossible; thin interfaces; one place enforces the predicate.
- Cons: a response depends on server state the request does not name, so the client must invalidate
  every per-event cache on switch, and two tabs cannot show two events.

#### B: Explicit event id, server-validated *(chosen)*
Every per-event request names its event and every handler validates registration. The active event
becomes the default the client builds requests from.
- Pros: requests are self-describing, cacheable, and deep-linkable per event; no hidden state.
- Cons: every repository method grows an `eventId`; every new route must remember to validate —
  precisely the Principle VIII failure mode the attendee-id rule exists to make impossible.

#### C: Implicit by default, explicit override
- Pros: thin interfaces for the common case, room for a future shared per-event link.
- Cons: two code paths reach the same data, so authorization has two places to be wrong.

### 2. What makes the predicate hard to get wrong

Choosing B above moved the risk: the predicate is no longer enforced by the absence of a parameter,
so 002 has to build the thing that enforces it.

#### A: Proof-carrying scope *and* route audit *(chosen)*
A validator turns a raw `:eventId` into an `EventScope` value that only it can construct; every
per-event query function takes `EventScope`, never a bare string, so a handler that skips validation
does not compile. Plus a test that walks the built Fastify route table, finds every route declaring
`:eventId`, and fails CI when the guard is absent.
- Pros: compile-time where data is read, CI-time where routes are declared; covers both the query
  layer and the route surface.
- Cons: the most machinery of the four, and under the original phase boundary it would have been
  built before any content existed to use it.

#### B: Proof-carrying scope only
- Pros: sits exactly where the danger is, enforced by the compiler.
- Cons: nothing stops a new route resolving a scope for the wrong id or omitting the guard entirely.

#### C: Guard preHandler + route audit test
- Pros: follows the shipped `requireAttendee` pattern in `plugins/auth-context.ts`.
- Cons: enforcement is test-time only; a wrong route type-checks cleanly.

#### D: Guard preHandler + per-feature isolation tests
- Pros: no new machinery; rides on the constitution's existing per-feature obligation.
- Cons: depends on nine future specs each remembering — the failure mode 002 exists to remove.

### 3. How a Home card declares where it belongs

Three properties were treated as already settled by the constitution and were not re-opened: each
card owns its own loading, empty and failure states; a failing card must not blank the dashboard or
prevent another rendering, which forces shell-owned containment rather than per-author discipline;
and a feature contributes by adding a card file plus a registration, never by editing another card.

#### A: Named slots *(chosen)*
The shell defines a small fixed vocabulary — `lead` (first viewport, full width, at most one card),
`primary` (main column), `aside` (secondary column at desktop, folded below at tablet and mobile) —
and a card declares its slot plus an order within it.
- Pros: intent survives every width because slots map to widths in one place; "must be in the first
  viewport" is expressible rather than implied by a number.
- Cons: the vocabulary is fixed in 002, and adding a slot later touches the shell — the shared file
  the design exists to avoid.

#### B: Flat ordered registry with a numeric weight
- Pros: the simplest possible contract; adding a card is genuinely one line.
- Cons: nothing distinguishes first-viewport from below-the-fold except a number, and desktop column
  placement is whatever the flow produces.

#### C: Per-width column span
- Pros: closest to what a designer would specify; most control over the desktop dashboard.
- Cons: three layout decisions per phase, made against a desktop design the client has never
  reviewed — the register entry that bites hardest here.

### 4. What the shell hands a card

The hybrid scoping rule makes this less obvious than it looks: under D1 the unread-messages
indicator is a **relationship** card that persists across events, while "Up next" is **conference
content** that swaps on switch. Not every Home card wants an event.

#### A: The card declares its scope *(chosen)*
The descriptor states `scope: 'event' | 'attendee'`, mirroring the constitution's rule that every
new table declares which scoping rule applies and why. Event-scoped cards receive the resolved event
as a non-nullable prop and render only once it resolves; attendee-scoped cards receive none and
render regardless. Every card renders something visible — an empty state, never `null`.
- Pros: carries D1 into the composition layer, so every later phase must state its card's scoping;
  a failure resolving the event degrades only the per-event half of Home.
- Cons: two card kinds and two render paths in the shell.

#### B: Ambient `useActiveEvent()` hook, one card kind
- Pros: one kind, one path; a card changing scope needs no descriptor change.
- Cons: the not-yet-resolved guard is reimplemented in every per-event card, scoping goes
  undeclared, and unit-testing any card requires a provider.

#### C: Nullable event passed to every card
- Pros: the simplest signature.
- Cons: `null` handled at every call site, scoping unreviewable, and the compiler cannot distinguish
  a forgotten check from a deliberate one.

### 5. What the active event is before anyone chooses

The storage mechanism was deliberately left to the spec as a HOW. The invariant was fixed instead:
**the active event is durable per-attendee state that survives a device change, and can never be an
event the attendee is not registered for.**

#### A: Derive while unset, then honour forever *(chosen)*
While no choice is recorded the server derives one on every read — the registered event in progress
today, else the next upcoming, else the most recently ended. The moment the attendee switches, that
choice is recorded and honoured indefinitely.
- Pros: the attendee lands on something real with no interaction, and the derived answer follows the
  calendar; an explicit choice is never overridden.
- Cons: an attendee who switches to a past conference to look something up stays there until they
  switch back, including across sign-ins on a new device.

#### B: Derive while unset, re-derive once the chosen event ends
- Pros: nobody is ever parked on a finished conference.
- Cons: the active event changes without the attendee acting, and a deliberate return to a past
  event is undone.

#### C: Never derive — the attendee chooses
- Pros: nothing is implicit.
- Cons: the first viewport becomes a chooser rather than the product, working against the success
  criterion, and every per-event card owes a "no event selected" state on top of its empty state.

### 6. Which clock decides the conference day

#### A: Venue timezone, added in 002 *(chosen)*
Events gain an IANA timezone; "day N of M" is computed in it, because the conference day is a fact
about the conference rather than about where the attendee is standing. Time-of-day greeting still
comes from the device clock — morning is the attendee's, not the venue's.
- Pros: correct for remote and travelling attendees; session start times need the same timezone.
- Cons: 002 carries a schema change and seed data for it.

#### B: Device-local date now, timezone later
- Pros: keeps the migration smaller and defers to the phase the roadmap assigns the clock story to.
- Cons: ships a known-wrong answer on the first viewport, then rewrites the derivation.

#### C: Server computes and sends the day context
- Pros: one clock, no disagreement to define.
- Cons: contradicts the shipped design note that `dayNumber`/`totalDays` are absent by design.
  Reopening that would have to be recorded, not assumed.

### 7. Phase boundary

Started as "does the shared-file split ship separately", and escalated three times as the
consequences of each answer surfaced.

#### Round 1 — split as its own PR, or its own commit? *(chosen: one PR, split as first commit)*
Two PRs would keep a ~300-line mechanical diff away from the phase's real design work, at the cost
of two rebases across the owner's multiple clones. One PR matches the roadmap's per-phase cycle.

#### Round 2 — contract-complete spine, minimum spine, or pulled-forward content?
*(chosen: pulled-forward content)*
The objection to pulling content forward was that 003 owns sessions. The compensating argument was
stronger: without real per-event content, `EventScope` has nothing to carry and the switcher swaps
only a name and a date range. The predicate would be proven by a synthetic route — the 001 finding
again.

#### Round 3 — how much content? *(chosen: the full catalog schema)*
A deliberately thin sessions table would have let 003 extend it, at the cost of 003 altering a table
it did not design. The full catalog schema in one migration avoids that, but leaves 002 holding five
tables with no read path.

#### Round 4 — what proves the predicate, then? *(chosen: absorb the catalog entirely)*
Schema-with-no-reader put rounds 2 and 3 in direct conflict: the content was pulled forward to make
the switch visible, and then the screens were left in 003. Resolved by moving the whole of 003 into
002 — schema, API, repository, screens, track colours, and the clock story.

## Decision

**Phase 002 becomes Event Context, Session Catalog & Home Composition, absorbing roadmap phase 003
entirely.** It ships as one branch and one squash-merged pull request into `develop`, with the
shared-file split as its own first commit.

Server contract:

- Per-event requests name their event explicitly; the server validates the attendee's registration.
- A proof-carrying `EventScope`, constructible only by the validator and required by every per-event
  query, plus a CI route-table audit that fails when a route declaring `:eventId` lacks the guard.

Composition contract:

- Cards declare a named slot — `lead`, `primary`, `aside` — and an order within it. The shell maps
  slots to the three widths in one place and owns the error boundary.
- Cards declare `scope: 'event' | 'attendee'`. Event-scoped cards receive the resolved event as a
  non-nullable prop; attendee-scoped cards receive none and survive an event-resolution failure.
  Every card renders something visible; none may return `null`.

Product semantics:

- The active event is durable per-attendee state that survives a device change and can never be an
  unregistered event. Derived while unset — in progress today, else next upcoming, else most
  recently ended — and honoured indefinitely once chosen.
- Events carry an IANA venue timezone. "Day N of M" is computed in it; time-of-day greeting comes
  from the device clock.

### Departure from the delivery roadmap

The roadmap is a plan and may be revised without a constitutional amendment, but it requires a
feature departing from it to say so in its specification. 002's spec must record:

- **003 dissolves.** Its reserved migration `0002` transfers to 002.
- **004–010 keep their numbers.** No renumbering; 003 is marked absorbed.
- **005's hard dependency moves** from 003 to 002.
- **The first free parallel pair becomes 005 ∥ 006**, not 003 ∥ 004. 004 has no partner and runs
  alone.
- **The gate "after 002–003 lands → client review of desktop and tablet experience" now fires after
  002 alone**, and fires against considerably more surface than it was scheduled against.
- **The clock story**, assigned to 003 by the roadmap, is now 002's to decide.

### What this does not change

004's two blocking gates — the attendee identity model, and data retention/deletion/export
obligations — are unaffected. This phase stores no new personal data: the catalog is seeded
conference content, and the active-event pointer is a preference, not a personal-data surface. The
organizer-administration exclusion also holds: content arrives as committed seed data, with no
administrative interface, no privileged role, and no import path.

## Key Requirements

**Data**

- Active event: durable, per-attendee, survives device change; never resolvable to an event the
  attendee is not registered for.
- `events` gains an IANA venue timezone.
- Session catalog: sessions, tracks, rooms, speakers, and the session↔speaker association. All
  per-event under D1; each table states that rule and why.
- Seed data covering **at least two events with genuinely different catalog content**, so the
  switcher demonstrably swaps something real.
- Seed becomes per-domain modules behind a registry, replacing today's single `seed.ts`.

**Server**

- `EventScope` validator; every per-event query requires one.
- CI route-table audit for `:eventId` routes.
- Read-only catalog API. No write path — saving a session to a personal agenda is 005.
- Cross-attendee and cross-event isolation tests that run real queries against real seeded rows.
- API route registration becomes an append-only registry.

**Client**

- Event switcher in the top bar at all three widths, with its own loading, empty (one event → no
  switcher affordance, or a disabled indicator) and failure states.
- Switching is a server-dependent write. Offline it is refused with an explanation, never queued and
  never shown as succeeded — the FR-053 precedent already set by sign-out in `TopBar.tsx`.
- Home card registry with slots, scope kinds, and shell-owned containment.
- Home cards contributed by this phase: greeting with day context, "Up next", rest-of-day timeline.
- Catalog screens, with track colour coding drawn from the theme tokens rather than hex literals.
- `packages/data/src/interfaces/index.ts` splits into per-domain files.
- Every surface crossing the network declares loading, empty and failure states; all three layouts;
  offline behaviour; and accessibility obligations, per Principle IX.

**Proof obligations** — the session's recurring test, made explicit so the spec cannot discharge
them by assertion:

- A card that throws degrades to its own tile while every other card still renders. Demonstrated by
  a fault-injected card in tests, not asserted in prose.
- The scoping predicate is exercised by real product code against real seeded rows, not by a
  synthetic route built for the test.
- The switcher visibly swaps catalog content, not just a name and a date range.

## Open Questions

- **Which 002 card exercises the attendee-scoped path?** All three cards this phase contributes are
  event-scoped. The attendee-scoped branch of the contract may end up proven only by test doubles —
  the exact weakness this session kept flagging. Either find a genuine attendee-scoped card, or
  state plainly that this half ships proven by test only.
- **The clock story**, inherited from 003: is relative time ("starts in 15m") computed from server
  time or client time, and what happens when they disagree? The venue-timezone decision settles the
  date basis but not this.
- **Do sessions carry their own timezone, or inherit the event's?** Inheritance is almost certainly
  right, but a satellite session in another city would break it.
- **One migration or two?** `0001` and `0002` are both now 002's. Whether the phase emits one
  combined migration or keeps the reserved boundary is a spec decision.
- **What happens when two cards claim the `lead` slot?** A compile-time impossibility, a startup
  assertion, or last-registration-wins. Later phases will collide here eventually.
- **Offline reading of catalog content.** API responses are never cached today, so offline shows
  only the shell. An agenda readable on a conference floor with no signal is the first real demand
  for a staleness policy, which is the inbox entry `interface-evolution-for-offline-data` arriving
  from the product side. This phase makes it concrete without necessarily resolving it.
- **Does the enlarged 002 still want one PR?** The decision was reaffirmed after the catalog was
  absorbed. The `spex-collab` phase-split hook will ask again against a concrete task list; the
  recorded intent is one PR.
- **Client review of desktop and tablet.** This phase builds substantially more unreviewed desktop
  design than the roadmap anticipated at this point, because it now carries the catalog screens too.
  The register entry stays open and the gate is worth pulling forward.
