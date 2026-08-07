# Feature Specification: Event Context, Session Catalog & Home Composition

**Feature Branch**: `spec/002-event-context-and-catalog`

**Created**: 2026-08-06

**Status**: Draft

**Constitution**: v2.1.0

**Brainstorm**: `brainstorm/02-event-context-and-catalog.md`

**Input**: Phase 002 of the delivery roadmap, enlarged. Make the active event durable per-attendee
state; establish the per-event scoping predicate server-side; put the event switcher at all three
widths; derive day context from event dates, the venue's timezone and the clock; define the Home
card composition contract; and deliver the session catalog — schema, read API, repository, screens,
track colour coding and the clock story — absorbed from roadmap phase 003.

---

## Context and Scope Note

The production foundation shipped. An attendee signs in, the browser calls the API, the API queries
PostgreSQL scoped to that attendee's identity, and the shell renders who they are and which events
they are registered for. **No destination carries product content.** This feature is the first that
does.

### Departure from the delivery roadmap

The roadmap
(`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`) is the authoritative
decomposition of the product. It is a plan rather than governance and may be revised without a
constitutional amendment, but it requires a feature that departs from it to say so. This feature
departs, by owner decision recorded in brainstorm #02:

| | Roadmap | This feature |
|---|---|---|
| Phase 003, Session Catalog | Its own phase, after 002 | **Absorbed into 002 entirely** — schema, read API, repository, screens, track colours, and the clock story |
| Migration `0002` | Reserved for 003 | **Transfers to 002.** This feature emits `0001` (event context) and `0002` (session catalog) |
| Phases 004–010 | — | **Numbers unchanged.** 003 is retired, not reassigned, so the roadmap and this specification can still be read against each other |
| Phase 005 Agenda, hard dependency | 003 | **002** |
| First free parallel pair | 003 ∥ 004 | **005 ∥ 006.** 004 has no partner and runs alone |
| Gate: client review of desktop and tablet | "After 002–003 lands" | **After 002 alone** — and against more surface than it was scheduled against, because the catalog screens now land in the same phase |

**Why the absorption was chosen.** Under the roadmap's boundary, this feature would have committed
to the per-event scoping predicate with no per-event content to scope, and to the Home card contract
with a single card. Both would have been proven by shape rather than by use — the failure recorded
in `brainstorm/idea-inbox.md` as `substitutability-proven-without-the-application`, where the 001
device-substitution tests compared method names and never ran application code. Real catalog content
makes the predicate provable by a real query and the card contract provable by real consumers.

**The cost, accepted.** This is by a wide margin the largest phase in the plan, and it removes the
roadmap's first free parallel pair.

### A note on vocabulary

This specification says **conference** where the project's domain vocabulary says **Event**. They are
the same thing, and the mapping is exact: every "conference" below is an `Event` as defined in
`CLAUDE.md` → Domain terminology and used by `specs/001-production-foundation`, its functional
requirements, and the shipped source that cites them. "Conference" is used here because the reader of
a specification is not necessarily reading code, and because "event" is overloaded in a codebase that
also has interface events. **The plan, the data model, and the implementation use `Event`.** No new
domain term is being introduced.

### Where this feature's surfaces live

The five destinations are fixed and this feature adds none.

- **Home** gains the four cards in FR-170–FR-173 and the composition contract that carries them.
- **Agenda** stops being a placeholder and renders the conference programme: every session for the
  active conference, in chronological order, read-only. `requirements.md` lists *session browsing*
  and *agenda management* as distinct capabilities; this feature delivers the first. Feature 005 then
  adds saved state, add and remove, and the session detail panel to the surface that already exists,
  turning the programme into the personalised schedule `requirements.md` describes.
- **The top bar** gains the event switcher, at all three widths.
- Discover, Messages and Network are untouched and remain placeholders.

**Addresses stay conference-neutral.** `/agenda` means "the programme of whichever conference is
active for me". No destination address names a conference, so a link shared between two attendees
resolves to each one's own active conference rather than the sender's. This follows from the active
conference being durable server-side state: the address identifies the destination, the session
identifies the attendee, and the attendee's stored selection identifies the conference. The
consequence, accepted: an attendee cannot link someone directly to a particular conference's
programme, and cannot hold two conferences open in two tabs. Note that this is a decision about
**addresses**, not about requests — FR-145 still requires every request for conference content to
name its conference explicitly.

### Why this specification names some technical shapes

Convention says a specification states WHAT and defers HOW. Two of this feature's requirements are
irreducibly structural: an authorization mechanism that cannot be forgotten, and a composition
contract seven later features inherit. Where a requirement below constrains structure, it constrains
the **property** — "a per-event read cannot be performed with an unvalidated identifier" — never the
mechanism that delivers it. The mechanisms chosen during brainstorming (a proof-carrying scope value,
a route-table audit, a slot-based card registry) belong to the plan, and appear here only in
Assumptions.

---

## Clarifications

### Session 2026-08-06 (brainstorm #02)

- **How does a per-event request name its event?** Explicitly, with server-side validation of the
  attendee's registration — not implicitly from stored server state. Rejected: implicit resolution,
  and implicit-with-override.
- **What makes the predicate hard to get wrong?** Both a compile-time obligation at the point data
  is read, and an automated audit of the route surface. Rejected: either alone, and convention plus
  per-feature discipline.
- **How does a Home card declare placement?** Named slots with an order inside each. Rejected: a
  flat weighted list, and per-width column spans.
- **How does a card receive the active event?** The card declares its scoping rule and the shell
  delivers accordingly. Rejected: an ambient hook, and a nullable event passed to every card.
- **What is active before anyone chooses?** Derived while unset, honoured indefinitely once chosen.
  Rejected: re-deriving when the chosen event ends, and requiring an explicit choice first.
- **Which clock decides the conference day?** The venue's. Rejected: the device's date, and a
  server-computed day counter sent to the client.
- **Phase boundary?** One branch and one squash-merged pull request, with the shared-file split as
  its own first commit. The session catalog is absorbed.

### Session 2026-08-06 (spec review gate)

- **Where does the programme render?** In the **Agenda** destination, read-only and chronological.
  005 later adds saved state, add and remove, and the session detail panel to that surface. Rejected:
  Home cards only, which would have left the seeded programme largely invisible; and a programme view
  inside Home, which 005 would then duplicate.
- **Does the address bar name the conference?** No. Destination addresses stay conference-neutral and
  resolve against the requesting attendee's own active conference. Rejected: conference-bearing
  addresses, which would have made links deep-linkable at the cost of a rule for reconciling an
  address and a stored selection that disagree.

---

## User Scenarios & Testing *(mandatory)*

Priorities order **delivery**, not importance. US4 and US5 are structural obligations that gate the
merge of US1–US3 regardless of their position: neither may be deferred to a later feature, and
Principle IX presumes an undeclared obligation unmet.

### User Story 1 - The attendee arrives at the conference that is happening now (Priority: P1)

An attendee registered for several conferences signs in. Without choosing anything, they land on the
one happening today, greeted by name, told which day of the conference it is and where it is being
held. If nothing is running today, they land on the one starting next.

**Why this priority**: Home is the first viewport, and Principle III makes the first viewport a
success criterion. It also replaces the prototype's hardcoded *"Good morning, Sarah" / "Tuesday,
March 18"*, which greeted everyone identically regardless of who was looking or what day it was.

**Independent Test**: Sign in as a seeded attendee whose registrations span a conference in progress
and one in the future, with the clock set inside the first. Home names that conference, its location,
the correct day number, and the attendee's own display name. Delivers a working first viewport with
no other story implemented.

**Acceptance Scenarios**:

1. **Given** an attendee registered for a conference running today and one starting next month, and
   no recorded choice, **When** they sign in, **Then** the conference running today is active and
   Home shows its name, location and correct day number.
2. **Given** an attendee whose registered conferences have all ended, **When** they sign in, **Then**
   the most recently ended conference is active and Home says it has ended rather than showing a day
   number.
3. **Given** an attendee registered for no conferences at all, **When** they sign in, **Then** Home
   shows an explicit empty state explaining what will appear there, and no error.
4. **Given** an attendee whose device is set to a timezone several hours from the venue's, **When**
   the venue's local date has rolled over but the device's has not, **Then** the day number reflects
   the venue's date.
5. **Given** any signed-in attendee, **When** Home renders, **Then** the greeting names that
   attendee and its time-of-day wording follows their device clock.
6. **Given** an attendee registered for two conferences that start on the same date and have never
   been switched between, **When** they sign in repeatedly, on more than one device, **Then** the
   same one is active every time.

---

### User Story 2 - The attendee sees what is happening next (Priority: P2)

The attendee looks at Home and sees the session that is next, with its time, room, track and
speakers, followed by a compact view of what remains of the day. They can open the conference
programme and read it in chronological order.

**Why this priority**: It is the first of the three questions the product exists to answer, and the
first product content any destination has carried. It is also what makes the switcher in US3
demonstrably swap something real.

**Independent Test**: With catalog content seeded for the active conference and the clock set to the
middle of a conference day, Home names the next session and lists the rest of the day; the programme
lists every session for that conference in chronological order. Testable without US3.

**Acceptance Scenarios**:

1. **Given** a conference day with sessions before and after the current time, **When** the attendee
   views Home, **Then** the next session by start time is shown with its time, room, track and
   speakers.
2. **Given** the last session of the day has ended, **When** the attendee views Home, **Then** the
   next-session card says so explicitly rather than showing nothing or a stale session.
3. **Given** a session with no speaker assigned, **When** it is displayed, **Then** it renders
   completely, with no empty speaker area and no placeholder name.
4. **Given** the active conference has a programme, **When** the attendee opens the Agenda
   destination, **Then** every session for that conference appears in chronological order with its
   track visually coded, and the coding is consistent everywhere a track appears.
5. **Given** a conference with no sessions seeded, **When** the attendee opens Agenda, **Then** an
   explicit empty state explains that, rather than a blank region.
6. **Given** the Agenda destination, **When** the attendee views it, **Then** no control offers to
   save, add or remove a session — those arrive with feature 005 and their absence is not presented
   as an error or a disabled promise.

---

### User Story 3 - The attendee switches conference and everything follows (Priority: P3)

The attendee changes which conference they are looking at, from the top bar, on a phone, a tablet or
a desktop. Everything conference-specific changes with it; nothing conference-specific keeps showing
the old one. The choice sticks — on the next sign-in, and on a different device.

**Why this priority**: MyNet is a multi-event product, and this is the mechanism that makes it one.
It is also the validation-checklist item this feature is scheduled to discharge.

**Independent Test**: Sign in as a seeded attendee registered for two conferences with visibly
different programmes, switch, and confirm every conference surface reflects the new one. Sign out,
sign in on a different browser profile, and confirm the choice survived.

**Acceptance Scenarios**:

1. **Given** an attendee registered for two conferences, **When** they switch, **Then** the greeting
   day context, the next-session card, the rest-of-day view and the programme all show the newly
   selected conference, and none continues showing the previous one.
2. **Given** a switch has been made, **When** the attendee signs out and signs in again on another
   device, **Then** the chosen conference is still active.
3. **Given** the attendee has switched to a conference that has since ended, **When** they sign in
   later, **Then** that conference is still active — an explicit choice is not overridden.
4. **Given** the attendee is offline, **When** they attempt to switch, **Then** the attempt is
   refused with an explanation, the previously active conference remains active, and the interface
   does not show the switch as having succeeded.
5. **Given** an attendee registered for exactly one conference, **When** they view the top bar,
   **Then** the active conference is identified but no choice is offered.
6. **Given** a keyboard-only attendee, **When** they operate the switcher, **Then** it is reachable
   by keyboard, its control has an accessible label, focus is visible throughout, and Escape closes
   it without changing the selection.
7. **Given** the attendee selects one conference and then quickly selects another before the first
   has completed, **When** both requests have settled, **Then** the conference selected last is the
   one recorded and the one displayed, with no further action required to reconcile them.
8. **Given** an attendee viewing the Agenda destination, **When** they switch conference, **Then**
   the programme shown is the newly selected conference's, and the address in the browser is
   unchanged because it never named a conference.

---

### User Story 4 - Nobody reads another attendee's data or another conference's content (Priority: P4)

Every request for conference content names the conference it is asking about. The server refuses any
request naming a conference the requesting attendee is not registered for, and refuses it in a way
that reveals nothing about whether that conference exists.

**Why this priority**: Constitution Principle VIII and the hybrid event-scoping constraint both
require the predicate to be enforced server-side. It is placed after the stories it protects because
it cannot be demonstrated before there is content to protect — not because it may ship later. It may
not.

**Independent Test**: Sign in as attendee A and attempt to read the catalog of a conference only
attendee B is registered for. The response is indistinguishable from one naming a conference that
does not exist. Automated tests assert this across every route that accepts a conference identifier.

**Acceptance Scenarios**:

1. **Given** attendee A and a conference A is not registered for, **When** A requests that
   conference's content, **Then** the request is refused, and the refusal is identical to one for a
   conference identifier that matches nothing.
2. **Given** any route that accepts a conference identifier, **When** the automated route audit runs,
   **Then** it fails if that route can read conference content without validating registration first.
3. **Given** the automated isolation suite, **When** it runs against real seeded rows, **Then** it
   asserts that neither attendee can obtain the other's data or an unregistered conference's content
   through any request they can construct.
4. **Given** an attendee whose registration for the active conference is removed, **When** they next
   read conference content, **Then** the request is refused and the active conference falls back to a
   conference they are registered for.

---

### User Story 5 - A broken card does not take Home down (Priority: P5)

Home is assembled from independent cards. If one cannot load its data, or fails outright, it says so
in its own region and every other card carries on rendering.

**Why this priority**: Seven later features contribute cards to this surface. The guarantee has to
exist before they arrive, because a contract established after its consumers is not a contract. Like
US4, its position reflects when it can be demonstrated, not whether it is optional.

**Independent Test**: Register a card that throws deliberately, alongside the real ones. Home renders
every other card, the failing card shows a contained failure region, and the dashboard is never
blank. The failing card exists only in tests.

**Acceptance Scenarios**:

1. **Given** a card that throws while rendering, **When** Home loads, **Then** every other card
   renders normally and the failing card shows a contained failure region naming what is unavailable.
2. **Given** a card whose data request fails, **When** Home loads, **Then** that card shows its own
   failure state with a way to retry, and no other card is affected.
3. **Given** the active conference cannot be resolved at all, **When** Home loads, **Then**
   conference-scoped cards show that they are unavailable while cards that do not depend on a
   conference still render.
4. **Given** a card with nothing to show, **When** Home loads, **Then** it renders a visible empty
   state — it does not silently disappear from the layout.
5. **Given** two cards claiming the single most-prominent position, **When** the registry is
   assembled, **Then** the conflict is detected and surfaced rather than resolved silently.

---

### Edge Cases

- **Two conferences run on the same day.** Derivation must be deterministic, or the same attendee
  sees different answers on different devices.
- **A conference spans a daylight-saving transition** in the venue's timezone. Day numbering counts
  calendar days in that timezone, so the transition does not add or drop a day.
- **The device clock is wrong.** Relative times and the greeting are computed from it, so they will
  be wrong. The product does not attempt to detect or correct clock skew.
- **A session crosses midnight** in the venue's timezone. It belongs to the day it starts.
- **Two sessions start at the same instant.** "Next" must resolve deterministically.
- **The attendee's registration is removed while they are signed in**, including for the conference
  they had explicitly chosen.
- **A recorded choice points at a conference that no longer exists.** Falls back to derivation.
- **The attendee is offline when Home first loads.** Nothing conference-specific is available; every
  affected card says so rather than showing a blank or stale region.
- **A switch is requested while an earlier switch is still in flight.**
- **A very long conference name or venue location** at 320px, where the top bar also carries the
  attendee's name and a sign-out control.
- **A conference lasting exactly one day** — "day 1 of 1" must not read as a defect.
- **A session whose room is missing**, and a track with no sessions.
- **A conference the attendee is registered for that has no catalog content at all.**

---

## Requirements *(mandatory)*

Requirement identifiers begin at **FR-100** and success criteria at **SC-100**. Requirements
FR-001–FR-069 belong to `specs/001-production-foundation`, and shipped source comments cite them by
number; restarting from FR-001 here would make those citations ambiguous.

### Functional Requirements

Numbering leaves deliberate gaps between groups (106→110, 125→130, 140→145, 151→155, 165→170,
173→180) so that a later requirement can join the group it belongs to without renumbering the rest.
Nothing is missing at a gap.

#### Active conference

- **FR-100**: The system MUST record, per attendee, which conference is active, and MUST persist it
  server-side so it survives sign-out and a change of device.
- **FR-101**: The active conference MUST NOT resolve to a conference the attendee is not registered
  for, under any sequence of events including removal of a registration.
- **FR-102**: When the attendee has recorded no choice, the system MUST derive the active conference:
  a registered conference in progress on the current date in that conference's venue timezone; else
  the next one to start; else the most recently ended.
- **FR-103**: Derivation MUST impose a **total order** on candidates, so that the same attendee
  resolves to the same conference on every device at the same moment. Within a tier — several in
  progress, or several starting on the same date — the order is: earliest start date first; then
  earliest end date; then a stable, unchanging property of the conference that is unique across
  conferences. No tier of the ordering may depend on insertion order, or on anything that can change
  without the conference itself changing.
- **FR-104**: Once the attendee explicitly switches, the system MUST record that choice and honour it
  indefinitely, including after the chosen conference has ended.
- **FR-105**: An attendee registered for no conferences MUST receive an explicit empty state, not an
  error and not a blank region.
- **FR-106**: Resolving the active conference MUST NOT require the client to supply an attendee
  identifier, in keeping with the identity binding established in 001.

#### Switching

- **FR-110**: The event switcher MUST be present in the top bar at desktop, tablet and mobile widths,
  and MUST identify the active conference and its location.
- **FR-111**: The switcher MUST offer only conferences the attendee is registered for.
- **FR-112**: Switching MUST be a server-recorded change. Attempted offline it MUST be refused with
  an explanation, MUST NOT be queued, and MUST NOT be presented as having succeeded.
- **FR-113**: After a successful switch, every conference-scoped surface MUST reflect the newly
  selected conference without a full page reload, and none MUST continue to display the previous
  conference's content.
- **FR-114**: When the attendee is registered for exactly one conference, the switcher MUST identify
  it without offering a choice.
- **FR-115**: A failed switch MUST leave the previously active conference in place and MUST say that
  the change did not take effect.
- **FR-116**: The switcher MUST have an accessible label, a visible focus state, full keyboard
  operability, and — where it presents an overlay — a clear close action and Escape dismissal that
  does not change the selection.
- **FR-117**: The switcher MUST have declared loading, empty and failure states.
- **FR-118**: When a switch is requested while an earlier one is still in flight, the outcome MUST be
  the conference the attendee selected last, on the server and on every surface. The system MUST NOT
  come to rest showing one conference while having recorded another, and MUST NOT require the
  attendee to switch again to reconcile them.
- **FR-119**: Destination addresses MUST NOT name a conference. A destination address denotes the
  destination for whichever conference is active for the requesting attendee, so the same address
  resolves differently for two attendees with different active conferences. This constrains addresses
  only; FR-145 governs requests.

#### Day context and the clock

- **FR-120**: Each conference MUST carry the timezone of its venue.
- **FR-121**: Day context MUST be derived from the conference's dates, its venue timezone, and the
  current time. It MUST NOT be stored, and MUST NOT be transported as a precomputed counter.
- **FR-122**: Day context MUST distinguish three cases: before the conference starts, during it
  ("day N of M"), and after it has ended.
- **FR-123**: The greeting MUST name the signed-in attendee, and its time-of-day wording MUST follow
  the attendee's own device clock rather than the venue's.
- **FR-124**: Session times MUST be conveyed as absolute instants, so that any relative rendering
  ("starts in 15 minutes") is derived at the moment of display rather than transported.
- **FR-125**: Day numbering MUST count calendar days in the venue timezone, so a daylight-saving
  transition during a conference neither adds nor removes a day.

#### Session catalog

- **FR-130**: The system MUST hold a conference programme comprising sessions, tracks, rooms,
  speakers, and the association between sessions and speakers.
- **FR-131**: All conference programme content MUST be scoped per conference.
- **FR-132**: Programme content MUST arrive as committed, versioned seed data. The system MUST NOT
  provide an administrative interface, a privileged role, or a content import path.
- **FR-133**: Seed data MUST cover at least two conferences with genuinely different programmes, so
  that switching demonstrably changes what is shown.
- **FR-134**: The programme MUST be read-only in this feature. Saving a session to a personal agenda,
  personal notes, and audience questions are not part of it.
- **FR-135**: A session MUST carry a title, an absolute start and end, a room, and a track, and MAY
  carry speakers.
- **FR-136**: Each track MUST carry a visual coding that is applied consistently everywhere the track
  appears, drawn from the shared theme rather than from literal colour values at each use.
- **FR-137**: The programme MUST be presented in the **Agenda** destination, in chronological order,
  for the active conference only. It MUST NOT introduce a sixth destination.
- **FR-137a**: The programme MUST show, for each session, the attributes named in FR-135 that it
  carries — time, title, room, track, and speakers where present. Saved state is not among them; it
  arrives with feature 005.
- **FR-138**: A session with no speaker MUST render completely, with no empty region and no
  placeholder identity.
- **FR-139**: A conference with no programme content MUST produce an explicit empty state.
- **FR-140**: "Next" MUST resolve deterministically when two sessions start at the same instant, and
  MUST state explicitly when no session remains today rather than showing nothing or a past session.

#### Conference scoping and authorization

- **FR-145**: Every request for conference-scoped content MUST name the conference it concerns.
- **FR-146**: The server MUST verify that the authenticated attendee is registered for the named
  conference before any conference-scoped content is read.
- **FR-147**: A conference-scoped read MUST NOT be performable with an unverified conference
  identifier. The verification MUST be a precondition of reading, not a step a reader may omit.
- **FR-148**: A request naming a conference the attendee is not registered for MUST be refused
  identically to one naming a conference that does not exist, disclosing nothing about its existence.
- **FR-149**: An automated check over the registered route surface MUST fail when a route accepting a
  conference identifier can read conference content without that verification.
- **FR-150**: Automated isolation tests MUST run against real seeded data and assert that neither of
  two attendees can obtain the other's data, nor an unregistered conference's content, through any
  request they can construct.
- **FR-151**: Authorization MUST NOT be implemented by filtering on the client.

#### Home composition

- **FR-155**: Home MUST be assembled from a registry of independent cards. A feature contributes by
  adding a card and registering it, never by editing another feature's card.
- **FR-156**: Each card MUST declare its placement as one of a small fixed set of named positions,
  plus an order within that position. The mapping from those positions to the desktop, tablet and
  mobile layouts MUST be defined in exactly one place.
- **FR-157**: At most one card may occupy the most prominent position. A second claim MUST be
  detected and surfaced rather than silently resolved.
- **FR-158**: Each card MUST declare whether it is conference-scoped or attendee-scoped, and why —
  the same obligation the constitution places on every new table.
- **FR-159**: A conference-scoped card MUST receive the resolved active conference and MUST NOT be
  asked to render before it resolves.
- **FR-160**: An attendee-scoped card MUST render regardless of whether the active conference
  resolves, so a conference-resolution failure degrades only the conference-scoped part of Home.
- **FR-161**: Every card MUST render something visible in every state. A card MUST NOT withdraw
  itself from the layout when it has nothing to show; it renders an empty state.
- **FR-162**: Each card MUST own its own loading, empty and failure states.
- **FR-163**: A card that fails, including one that fails while rendering, MUST be contained to its
  own region. It MUST NOT blank Home and MUST NOT prevent any other card from rendering. Containment
  MUST be provided by the composition, not left to each card's author to remember.
- **FR-164**: No card may depend on another card's presence, ordering, or data.
- **FR-165**: Containment MUST be demonstrated by a deliberately failing card exercised in tests, not
  asserted in prose.

#### Cards contributed by this feature

- **FR-170**: A conference-scoped card presenting the greeting and day context, in the most prominent
  position.
- **FR-171**: A conference-scoped card presenting the next session.
- **FR-172**: A conference-scoped card presenting what remains of the current conference day.
- **FR-173**: An attendee-scoped card presenting the attendee's conferences, which does not depend on
  which one is active. This card exercises the attendee-scoped half of FR-158–FR-160 with a real
  consumer rather than a test double, and preserves the registered-events view that Home carries
  today.

#### Structural preparation for later features

- **FR-180**: Repository interfaces MUST be organised per domain, so a later feature adds a file
  rather than editing a shared one.
- **FR-181**: Server route registration MUST be append-only, so a later feature adds a registration
  rather than editing a composition sequence.
- **FR-182**: Seed data MUST be organised per domain behind a registry, for the same reason.
- **FR-183**: The reorganisation in FR-180–FR-182 MUST NOT change behaviour, and MUST be separable in
  review from the rest of this feature.

### Key Entities

- **Conference (Event)**: A conference the attendee is registered for. Carries name, location, start
  and end dates, and — new in this feature — the timezone of its venue. Day context is derived from
  these and the clock, never stored.
- **Registration**: The attendee-attends-conference relationship. Already exists. It remains the
  entire basis on which conference content is reachable.
- **Active conference selection**: Which conference an attendee is currently working in. Durable,
  per-attendee, and constrained so it can never denote a conference the attendee is not registered
  for. Absent until the attendee first switches, at which point it is recorded.
- **Session**: A scheduled item in a conference programme — title, absolute start and end, room,
  track, and zero or more speakers. Per-conference.
- **Track**: A category of session with a consistent visual coding. Per-conference.
- **Room**: Where a session takes place. Per-conference.
- **Speaker**: A person presenting one or more sessions. Per-conference, and distinct from an
  attendee profile, which is a later feature. A speaker is seeded conference content, not a person
  who signs in. **Consequence, stated deliberately**: because speakers are conference content under
  the hybrid scoping rule, the same human speaking at two conferences is two speaker records with no
  link between them. That is what per-event scoping means here, and it is accepted. Feature 004 must
  not assume a speaker and an attendee profile are the same entity, nor that speakers are unique
  across conferences.
- **Session–speaker association**: Which speakers present which session. Per-conference.
- **Home card**: A registered contribution to Home, declaring its position, its order, and whether it
  is conference-scoped or attendee-scoped.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-100**: A returning attendee reaches the conference happening today with **zero interactions**
  after signing in.
- **SC-101**: From the first viewport, at all three widths, an attendee can name the conference they
  are in, which day of it today is, and which session is next — **without horizontal scrolling and
  without scrolling past the fold to find any of the three**.
- **SC-102**: Switching conference updates every conference-specific surface, with **no surface
  showing the previous conference** once the switch has completed.
- **SC-103**: A switch made on one device is still in effect on a different device at the next
  sign-in, **100% of the time**.
- **SC-104**: With one card deliberately failing, **100% of the remaining cards still render**, and
  Home is never blank.
- **SC-105**: **No request an attendee can construct** returns another attendee's data or the content
  of a conference they are not registered for — asserted by automated tests covering **every** route
  that accepts a conference identifier, with a failing audit blocking merge.
- **SC-106**: Day context is correct for an attendee whose device timezone differs from the venue's,
  including on a date that has rolled over in one and not the other.
- **SC-107**: The two seeded conferences differ in programme content by **every** observable
  dimension a reviewer can check: no session title, no track name, no room name and no speaker name
  appears in both, and the two programmes differ in session count.
- **SC-108**: The complete journey — arrive, read what is next, switch conference, read what is next
  again — is completable **using only a keyboard**, with focus visible at every step.
- **SC-109**: Every card contributed by this feature renders a visible, meaningful state in **all
  four** of its conditions: loading, populated, empty, and failed.
- **SC-110**: The structural reorganisation required by FR-180–FR-183 changes **no** observable
  behaviour: the full automated suite that passes immediately before it passes immediately after it,
  unchanged, and the generated API contract is byte-identical across it.

### Constitution validation checklist — items this feature discharges

From the whole-product validation checklist in `requirements.md`, satisfied incrementally:

- **Navigation and event switching** — discharged in full.
- **Production build success** — maintained.
- **Desktop and mobile rendering** — discharged for Home and Agenda. Explicitly *not* client-
  validated; see Open Questions.
- **Keyboard focus visibility and accessible labels** — discharged for every control this feature
  introduces.

Deliberately left to later features: search and filter (006), session save, notes and Q&A (005, 009),
message composition (007), card-sharing feedback and meeting scheduling (008).

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Works offline**: the installed shell, navigation between destinations, and the sign-in state already established by 001. **Does not work offline**: every conference-scoped surface — day context, next session, rest of day, the programme, and the attendee's conference list. Each says it needs a connection, distinguishing that from a server fault, as 001 established. **An action attempted offline**: switching conference is refused with an explanation; it is not queued and is never shown as having succeeded. **No response caching is introduced** — reading the programme offline is deliberately out of scope and is recorded as an open question, because a staleness policy is a decision the constitution requires to be recorded rather than assumed. |
| **Desktop layout** (Principle IV) | Persistent left rail unchanged from 001. Top bar carries the destination name and gains the event switcher. Home becomes a multi-column dashboard: the greeting and day context span the full width above a main column carrying the next session and the rest of the day, with the attendee's conferences in a secondary column. The **Agenda** destination renders the programme as a single chronological column with the day's structure visible. |
| **Tablet layout** (Principle IV) | Reduced rail unchanged from 001. The switcher remains in the top bar. Home collapses to two columns, and the secondary column folds beneath the main one. The programme stacks. |
| **Mobile layout** (Principle IV) | Compact header and bottom navigation unchanged from 001. The switcher is reachable from the compact header and presents its choices as a full-width overlay with touch-sized targets and Escape/close dismissal. Home is a single column in declared order. No content or primary action requires horizontal scrolling at 320px, including a long conference name beside the attendee's name and sign-out control. |
| **Empty / loading / failure states** (Principle IV) | **Event switcher**: loading; single conference (identified, no choice); no conferences; failure leaving the previous selection in place. **Greeting and day context**: loading; before/during/after the conference; failure. **Next session**: loading; none remaining today; no programme for this conference; failure. **Rest of day**: loading; nothing further today; failure. **Attendee's conferences**: loading; registered for none; failure. **Agenda (programme)**: loading; no sessions for this conference; failure. Every failure distinguishes "you are offline" from "this is a problem on our side". |
| **Accessibility** (Principle IV) | Every control introduced has an accessible label, a visible focus state, and keyboard operability. The switcher's overlay has a clear close action and dismisses on Escape without changing the selection. Track colour coding is never the sole carrier of meaning — the track is also named in text. Day context and session times are exposed as machine-readable times alongside their human wording. A card entering a failure state announces it. |
| **Validation checklist discharged** (Principle VII) | Navigation and event switching (full); production build; desktop and mobile rendering for Home and Agenda; keyboard focus visibility and accessible labels for controls introduced here. Left to later features: search and filter; session save, notes and Q&A; message composition; card-sharing feedback; meeting scheduling and appointment creation. |
| **Identity scoping & server-side authorization** (Principle VIII) | Applies. **Rule**: every conference-scoped read is bound to the authenticated attendee at the request boundary, and additionally to a conference for which that attendee holds a registration. **Enforcement**: identity comes from the sign-in session, never from a client-supplied identifier (unchanged from 001). Registration is verified server-side before any conference content is read, verification is a precondition of reading rather than an optional step, an automated audit fails when a conference-accepting route lacks it, and refusals disclose nothing about whether the conference exists. Isolation is asserted by automated tests against real seeded rows. **No new personal data is stored**: the programme is seeded conference content, and the active-conference selection is a workspace preference. |
| **Event scoping** (Constraints — data scoping) | **Active conference selection — cross-event by nature**: it names an event but belongs to the attendee, and there is exactly one per attendee rather than one per event. **Sessions, tracks, rooms, speakers, session–speaker association — per-event**: they are conference programme content in the constitution's own enumeration, they have no meaning outside the conference that scheduled them, and they must swap when the attendee switches. **Events and registrations** are unchanged by this feature except for the venue timezone added to events, which is a property of the conference itself. |
| **Register position** (Governance) | **Blocks this feature**: none. The two entries that gate 004 — the attendee identity model, and data retention, deletion and export obligations — do not bite, because this feature stores no new personal data. **Resolved by this feature**: none; no register entry is closed. **Escalated by this feature**: client validation of desktop and tablet layouts, which now covers Home *and* the programme before any review has taken place. **Made concrete but not resolved**: offline staleness policy for conference content. |
| **Reserved migration number** (Branching — parallel work) | **`0001` and `0002`, both.** `0001` carries the event context change — the venue timezone and the active-conference selection. `0002` carries the session catalog. `0002` was reserved for roadmap phase 003 and transfers here with the absorbed scope; it is not reused by any other feature. |

---

## Assumptions

Reasonable defaults taken where the brainstorm did not decide, recorded so the review gate can
challenge them.

- **The clock story.** Session times are conveyed as absolute instants and relative wording is
  computed at display time from the attendee's device clock. The product does not attempt to detect,
  report, or correct device clock skew; an attendee with a badly wrong clock sees wrong relative
  times, and that is accepted rather than engineered around. This settles the decision the roadmap
  assigned to phase 003.
- **Two migrations, not one.** The reserved numbers are honoured as two separate migrations so the
  event-context change and the catalog remain separable in history and in review, matching the
  commit separation FR-183 requires.
- **Sessions inherit the conference's venue timezone** rather than carrying their own. A satellite
  session held in another city would break this; none is seeded, and none is in scope.
- **Speakers are seeded content, not people who sign in.** A speaker is not an attendee profile and
  carries no credentials. Whether the two ever converge is a question for 004, not this feature.
- **Rooms are catalog entities rather than free text**, so that a later feature can present a room
  without re-modelling it, and so a typo cannot create a phantom room.
- **The attendee's-conferences card is the genuine attendee-scoped consumer.** It preserves what Home
  shows today rather than deleting it, and it means the attendee-scoped half of the card contract
  ships proven by a real card rather than by a test double — which the brainstorm flagged as the
  likeliest weakness in this feature.
- **"In progress today" is evaluated against the conference's own venue timezone**, so an attendee
  registered for conferences in different timezones gets a consistent answer.
- **The switcher presents a menu at desktop and tablet and a full-width overlay at mobile**, matching
  the responsive obligations in Principle IV rather than introducing a new pattern.
- Seed data continues to run only against local development and per-PR preview environments, never
  against an environment holding real attendee data.

---

## Dependencies

- **001 Production Foundation**, merged: authentication and sign-in sessions, identity binding at the
  request boundary, the `events` and `registrations` tables, the responsive shell and top bar, the
  repository interface layer, the theme tokens, and the CI pipeline.
- **The theme tokens** must be able to express track colour coding without literal colour values at
  each use site. If they cannot today, extending them is part of this feature.
- **The CI pipeline must actually run.** The overview records that runs have been queued since
  2026-08-06 17:04 and that nothing on `develop` has ever passed CI. Two of this feature's guarantees
  — the route audit and the isolation suite — are enforced only by CI. Until it runs, they are
  documentation.

---

## Out of Scope

- Saving a session to a personal agenda, personal notes, and audience questions with upvoting — 005
  and 009.
- Attendee profiles, own-profile editing, the Discover directory, messages, contacts, exchanged
  cards and appointments — 004, 006, 007, 008.
- Any administrative interface, privileged role, or content import path. Adding a conference remains
  a reviewed change to committed seed data.
- Notifications of any kind, including the prototype's notification bell.
- Caching conference content for offline reading.
- Optimistic updates and conflict resolution, each of which the constitution requires to be decided
  and recorded separately.
- Attendee avatars and any image upload.
- Calendar integration.

---

## Open Questions

Recorded rather than resolved, per Principle I.

1. **Client validation of desktop and tablet layouts.** Still open from 001, and this feature makes
   it more expensive: Home's dashboard and Agenda's programme are both built at widths the client
   has never reviewed, and the roadmap's gate — scheduled for "after 002–003" — now falls after this
   feature alone. Worth asking before implementation rather than after.
2. **Offline staleness policy for conference content.** This feature deliberately caches nothing, so
   offline shows only the shell. The first attendee standing in a venue with no signal wanting to
   read the programme turns this into a decision about what may be shown, how old it may be, and how
   the attendee is told. Tracked in `brainstorm/idea-inbox.md` as
   `interface-evolution-for-offline-data`.
3. **Whether an explicit conference choice should ever expire.** Decided for now as "never" (FR-104).
   An attendee who switches to a past conference and forgets stays there indefinitely. If that proves
   confusing in use, the alternative — falling back to derivation once the chosen conference ends —
   was explored and rejected in brainstorm #02 and can be revisited without reopening anything else.
4. ~~**Whether the enlarged scope still wants a single pull request.**~~ **Closed 2026-08-06** at the
   phase-split step, put to the owner against the concrete task list — 89 tasks, 8 phases, 6 tables,
   5 endpoints, 2 migrations, a new destination — alongside a two-PR split at the US1 seam and a
   three-PR split isolating the shared-file split. **One squash-merged pull request into `develop`,
   reaffirmed a third time.** Recorded with it: because `develop` is squash-merge only, the
   shared-file split's "own first commit" (FR-180–FR-183, Phase 1) lives on the feature branch and
   does not survive the merge, so its stated purpose — a mechanical diff never sitting beside new
   architecture *in the same review* — is met at the commit level but **not** at the review level.
   Accepted as the cost of landing the feature atomically.
5. **What "PS" denotes** in the repository name, and the repository-visibility entry — both unchanged
   by this feature and both still open.
