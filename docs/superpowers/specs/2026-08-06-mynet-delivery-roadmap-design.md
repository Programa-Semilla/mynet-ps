# MyNet Delivery Roadmap — Foundation to Complete Product

**Date**: 2026-08-06
**Status**: Approved (design session, project owner)
**Constitution**: v2.0.0
**Supersedes**: nothing. First roadmap-level design for MyNet.

> ## Departure recorded: 002 absorbed 003 (2026-08-06)
>
> **Feature 002 absorbed phase 003 entirely.** The constitution requires a feature whose scope,
> dependencies or migration number departs from this roadmap to say so in its specification, and
> `specs/002-event-context-and-catalog/spec.md` does. This note records the knock-on effects here,
> because the roadmap is what the next session reads to know what has been decided.
>
> **Why.** Owner decision in `brainstorm/02-event-context-and-catalog.md`. Without real per-event
> content, 002's `EventScope` would have had nothing to carry and its Home card contract would have
> had one consumer — both proven by shape rather than by use, which is the
> `substitutability-proven-without-the-application` finding from the 001 review repeated on a
> surface seven features inherit. Keeping the boundary was explored across four rounds; each
> smaller version left either the predicate or the contract unvalidated, or split the catalog's
> schema from its readers so that 003 would have altered a table it did not design.
>
> **Consequences, all four:**
>
> 1. **003 is retired.** There is no Session Catalog phase; it shipped inside 002.
> 2. **Migration `0002` transferred to 002**, which emitted both `0001_event_context.sql` and
>    `0002_session_catalog.sql`. Numbers `0003` onward are unchanged, so no later reservation moved.
> 3. **005 now depends on 002** rather than on 003.
> 4. **The first free parallel pair is now 005 ∥ 006**, not 003 ∥ 004. 004 has no partner and runs
>    alone.
>
> **What this costs.** 002 became by far the largest feature in the plan — 89 tasks, six tables,
> five endpoints, two migrations and a new destination — and the plan lost its first opportunity to
> run two branches at once. Both were accepted deliberately; see `plan.md`'s Complexity Tracking.
>
> The tables below are left as originally approved rather than rewritten, so the departure stays
> visible as a departure. Read them with this note.

---

## Purpose

`specs/001-production-foundation/` delivered a walking skeleton. Every layer connects, and no layer
carries product content. This document decomposes the remaining product into nine phases, fixes
their dependency order, and defines how they are worked.

It is a **decomposition, not a specification**. Each phase gets its own brainstorm → spec → plan →
implement cycle. Nothing here substitutes for that. What this document fixes is scope boundaries,
ordering, and the coordination rules between phases — the decisions that are expensive to change
once phases are in flight.

---

## Starting line — what 001 already delivered

| Layer | Delivered |
|---|---|
| Identity | Attendees, credentials, sign-in sessions with sliding idle expiry, brute-force throttling |
| Schema | `attendees`, `attendee_credentials`, `auth_sessions`, `events`, `registrations`, `sign_in_attempts` (migration `0000`) |
| API | Fastify over managed PostgreSQL, Drizzle, versioned migrations, generated and committed OpenAPI contract |
| Client | Five individually addressable routes, desktop rail / tablet rail / mobile bottom nav, error boundary, offline banner, route announcer |
| Abstractions | `AttendeeRepository`, `EventsRepository`; the six device-capability interfaces |
| Delivery | Installable PWA shell, Linux CI with integration tests against a real database |

Home renders the attendee's name and their registered events. Agenda, Discover, Messages, and
Network are honest placeholders. The seam exists everywhere; nothing is behind it.

**Design constraint inherited from 001, and non-negotiable:** no repository method accepts an
attendee identifier. Identity binds server-side from the sign-in session. Every phase below extends
this pattern rather than working around it.

---

## Decisions recorded in this session

Four decisions were taken by the project owner. Each changed the shape of the roadmap; none is
re-openable by inference.

### D1 — Event scoping is hybrid

Conference **content** is per-event: sessions, tracks, speakers, the Discover directory, and
appointments belong to one event and swap when the attendee switches. **Relationships** persist
across every event: contacts, exchanged cards, and message threads.

*Rationale.* MyNet is a professional networking product. A contact made last year must not vanish
because the attendee is now at a different conference. But discovering people means discovering
people who are *here*, and an appointment is a time and a place at a specific event.

*Cost accepted.* Two scoping rules rather than one. Every new table needs an explicit, recorded
decision about which rule applies to it.

*Resolves* the register entry "Event scoping" (`CLAUDE.md` → data-model questions the database
forces).

### D2 — Seeded catalog, attendee-authored profile

Conference content — events, sessions, tracks, rooms, speakers — ships as committed, versioned seed
data. There is no administrative interface, so organizer administration stays out of scope.

Each attendee authors **their own** profile in-app: company, role, interests, networking intent,
availability.

*Rationale.* Networking intent and availability are things a person decides, not facts an organizer
types. Discover has no value if every profile is a fixed fiction.

*Cost accepted.* A profile-editing surface that neither `requirements.md` nor the prototype
describes. It becomes phase 004.

*Explicitly rejected:* a content import path (JSON/CSV ingest). It is the thin end of organizer
administration, which the constitution places out of scope, and it would need its own recorded
decision.

### D3 — Home is a slot-based composition shell, built early

Home is a card registry. Each later phase contributes a self-contained card in a new file plus a
one-line registration. Each card owns its own loading, empty, and failure states; one card failing
must not blank the dashboard.

*Rationale.* The only option where Home improves continuously *and* two parallel branches never
contend for the same file. Directly serves the success criterion that a viewer understands the
product within the first viewport.

*Cost accepted.* The composition contract must be designed up front, in 002, before any card exists
to validate it against.

### D4 — Mostly sequential, parallel only where it is free

Phases run one at a time except where two touch genuinely disjoint files. Quality and reviewability
are preferred over wall-clock throughput.

*Rationale.* The owner works across multiple clones of the repository rather than worktrees.
Aggressive slicing would make a strict shared-artifact protocol mandatory and raise integration
cost exactly where quality matters most.

---

## Approach

**Chosen: substrate first, then surfaces.** Shared data spines — event context, session catalog,
attendee profile — are built as their own phases. Each destination then becomes a comparatively thin
phase, because the data it needs already exists and is stable.

*Considered and rejected:*

- **One destination per phase, full stack each.** Every phase ships something visible, but Discover
  would invent the attendee profile model mid-flight and Home would invent it again for
  recommendations. The same tables get opened and re-migrated three or four times.
- **Core journey end-to-end, thin, then deepen.** Proves the product story earliest and matches the
  success criterion exactly. But every area is built twice, and thin-then-deep reliably leaves
  surfaces half-finished for long stretches.

The usual objection to substrate-first — that early phases ship nothing visible — does not apply
here. Under D3, the catalog phase lights up "Up next" the day it lands and the profile phase lights
up "people to meet".

---

## Phase map

```
        ┌─────────────────────────────────────┐
        │ 001 Production Foundation  ✓ merged │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────▼───────────────────┐
        │ 002  Event Context & Home Composition│   ← the spine. blocks everything.
        └───────┬──────────────────────┬───────┘
                │                      │
     ┌──────────▼─────────┐  ┌─────────▼──────────┐
     │ 003 Session Catalog│  │ 004 Attendee Profile│   ∥ free parallel pair
     └──────────┬─────────┘  └─────────┬──────────┘
                │                      │
     ┌──────────▼─────────┐  ┌─────────▼──────────┐
     │ 005 Agenda         │  │ 006 Discover       │   ∥ free parallel pair
     └──────────┬─────────┘  └─────────┬──────────┘
                │                      │
                │            ┌─────────▼──────────┐
                │            │ 007 Messages       │
                │            └─────────┬──────────┘
                │                      │
     ┌──────────▼─────────┐  ┌─────────▼──────────────────┐
     │ 009 Session Q&A    │  │ 008 Network & Appointments │   ∥ free parallel pair
     └──────────┬─────────┘  └─────────┬──────────────────┘
                └──────────┬───────────┘        ▲
                           │          core journey closes here
        ┌──────────────────▼──────────────────┐
        │ 010 UAT Deploy + Hardening          │
        │ 011 Launch Readiness + Production   │
        └─────────────────────────────────────┘
```

Arrows in the diagram show **execution order** under D4. The table below shows **hard data
dependencies** — a phase cannot be specced until these have landed. The two differ in one place, and
that difference is the scheduling slack available if D4 is ever relaxed.

| # | Phase | Hard dependency | Migration | Home card contributed |
|---|---|---|---|---|
| 002 | Event Context & Home Composition | 001 | `0001` | Event switcher, greeting + day context |
| 003 | Session Catalog | 002 | `0002` | "Up next" + rest-of-day timeline |
| 004 | Attendee Profile & Own-Profile Editing | 002 | `0003` | — |
| 005 | Agenda | 003 | `0004` | Up-next prefers saved sessions |
| 006 | Discover | 004 | `0005` | Recommended people to meet |
| 007 | Messages | 004 | `0006` | Unread indicator |
| 008 | Network & Appointments | 004, 007 | `0007` | Appointment summary |
| 009 | Session Q&A | 005 | `0008` | — |
| 010 | UAT Deployment and Pre-Public Hardening | all | — | — |
| 011 | Launch Readiness and Production | 010 | — | — |

**Messages (007) is the one difference.** Its hard dependency is 004 alone — it needs profiles to
render participants, not Discover. It is scheduled after 006 because Discover is where a conversation
is started in practice, so building it second lets 007 wire that entry point rather than 006 shipping
an inert control that 007 later revisits. If throughput ever matters more than sequence, 007 can move
alongside 006 at the cost of that revisit.

Migration numbers are **reserved here**. A phase claims its number when its spec is written, not
when its migration is generated, so two parallel branches never generate the same filename and no
file is ever renamed during a rebase.

### Three properties of this shape worth stating explicitly

**Home's requirement list is complete at 008, not 010.** Every element `requirements.md` names for
the Home dashboard — event switcher, greeting with day context, "Up next", rest-of-day timeline,
recommended people, appointment summary, unread indicator — is contributed at or before 008. That is
the same point at which the core journey closes, so the product is demonstrable end to end with two
phases still in hand.

**Q&A is deliberately late.** `requirements.md` places it in the session panel, which suggests
building it with Agenda. It is not on the success-criterion journey, and it is the one feature where
an attendee's content becomes visible to other attendees outside of messaging — a distinct
authorization surface deserving its own spec rather than a tab bolted onto Agenda's.

**Offline behaviour, responsive layout, and accessibility are not phases.** The constitution requires
each feature to state its own. A consolidated "make it accessible" phase at the end is how that
obligation becomes a rubber stamp. 010 is a sweep and a validation pass over work already done, not
the place any of it first happens.

---

## Phase detail

### 002 — Event Context & Home Composition · migration `0001`

Establishes the per-event scoping predicate once, server-side, so no later phase re-decides it.

- Active event as **durable per-attendee state**, not local component state — it must survive a
  device change, which is precisely the constitution's distinction.
- Event switcher in the top bar at all three widths.
- "Day N of M" derived from event dates and the clock. Never stored, never transported — it goes
  stale the moment the clock moves.
- Greeting with real day context, replacing the prototype's hardcoded *"Good morning, Sarah" /
  "Tuesday, March 18"*.
- The Home card contract from D3.

**Targeted refactor included in this phase.** Split `packages/data/src/interfaces/index.ts` into
per-domain files, and give API route registration and `apps/api/src/db/seed.ts` the same treatment.
Every later phase then appends a file rather than editing a shared one. This removes three of the
four predictable merge conflicts structurally rather than by protocol.

**Discharges** (validation checklist): navigation and event switching.

**Gates**: none blocking.

### 003 — Session Catalog · migration `0002` · ∥ 004

- Sessions, tracks, rooms, speakers, session↔speaker association. All per-event under D1.
- Read-only API and `SessionsRepository`.
- Seed data for **at least two events with genuinely different content** — this is what proves 002's
  switcher switches something real.
- Track colour coding (Design, Product, Tech, Keynote, Main Event in the prototype's data).
- Home cards: "Up next" and the rest-of-day timeline.

**Decision this phase must take:** the clock story. The prototype's "Starts in 15m" is static text.
Real relative time needs a decided source — server time or client time — and defined behaviour when
they disagree.

**Gates**: none blocking. Session, room, and speaker shape is derivable from the prototype.

### 004 — Attendee Profile & Own-Profile Editing · migration `0003` · ∥ 003

- Extend the attendee with company, role, interests, networking intent, availability, headline,
  avatar.
- The per-event directory falls out of the existing `registrations` table — no new join needed.
- Own-profile view and edit surface. Validation is **disabled confirmation**, never a post-submit
  error, per `requirements.md`.

**Blocking gates — must be resolved before this phase is specced.** This is the first phase to store
substantial personal data, so two register entries bite here:

- **Attendee identity model.** How a person becomes an attendee — self sign-up, event invitation,
  ticket holder, organizer-provisioned. Unresolved, and it determines whether an onboarding surface
  exists at all.
- **Data retention, deletion, and export obligations.** Recognised by constitution Principle VIII,
  unspecified.

**Decision this phase must take:** avatar handling. Seeded URLs, or real upload — upload pulls in
object storage and `CameraService`, and deferring it is recommended.

### 005 — Agenda · migration `0004` · ∥ 006

- Saved sessions; the personalised schedule in chronological order; add and remove.
- Session detail panel: Overview, Speaker info, and durable personal Notes.
- Empty state: no saved sessions → invitation to explore.
- **Escape-key handling and a real focus trap on the panel.** The register lists these as settled
  requirements the prototype failed to meet — defects to fix, not questions to answer.

**Discharges**: session save, notes, keyboard focus visibility.

### 006 — Discover · migration `0005` (indexes) · ∥ 005

- Attendee cards over the active event's directory; search; role and interest filters.
- Empty state: no results → message plus reset-filter action.
- **Profile detail view.** Resolves the register entry where `requirements.md` says the attendee can
  "open a profile" but the prototype has no such screen.
- Interest-overlap ranking, feeding Home's "people to meet". Simple and explainable in preference to
  clever.

**Dependency wrinkle, accepted deliberately.** Discover's cards carry *message*, *share card*, and
*schedule* actions, but Messages is 007 and Network is 008. Rule: an action appears only once its
owning phase has landed, registered the same way as Home cards. No dead or permanently-disabled
control ships. 007 and 008 each register their action when they arrive.

**Discharges**: attendee search and filter behaviour.

### 007 — Messages · migration `0006`

- Conversations, participants, messages. Persistent across events under D1.
- Thread view, compose, send. Send disabled on empty input rather than erroring after submission.
- Empty thread → conversation-starter prompt.
- Unread tracking, feeding Home's indicator.
- Wires Discover's *message* action.

**This is the highest-risk authorization surface in the product.** Message content is private to its
participants, enforced server-side, never by client-side filtering, with integration tests proving a
non-participant is refused.

Delivery stays in-product. Notifications remain out of scope and the notification bell stays absent
until a recorded decision brings it in.

**Discharges**: message composition.

### 008 — Network & Appointments · migration `0007` — **SHIPPED** (PR #15)

> Delivered as specified, with migration `0007` as reserved. Both questions its spec left to
> planning were answered yes: card resolution needed a third branded scope, and the slot grid is
> six 30-minute slots per conference day in venue-local time. **009 is now the only feature
> remaining on this roadmap**, and the suggested `develop → main` promotion below is due.


- Appointments: participants, event, time slot, topic, status.
- Scheduling modal: slot selection, short topic field, disabled confirm when empty, clear success
  feedback, Escape and focus trap.
- No-slots empty state: explanation plus close action.
- Network destination brings together contacts, exchanged cards, and appointments.
- Wires Discover's *share card* and *schedule* actions.

**Blocking gates — the register flags both as needing a client decision.**

- **The connection model behind Network contacts.** The prototype derives contacts from the
  existence of a conversation. There is no connect or accept action, so there is no relationship to
  store. What a contact *is* must be decided before this phase can be specced.
- **What a card exchange records, and whether it is mutual.** The prototype shows a transient
  two-second confirmation and persists nothing.

**Decision this phase must take:** slot availability. Derived from the event schedule and both
parties' saved sessions, or a fixed grid. The prototype hardcodes `MEETING_SLOTS`.

**Discharges**: digital-card sharing feedback; meeting scheduling and appointment creation.

### 009 — Session Q&A · migration `0008` · ∥ 008 — **SHIPPED**

- Questions and votes. One vote per attendee per question. Ordered by upvotes.
- Empty state.
- Adds a tab to 005's session detail panel.

**Decision this phase must take:** whether questions are attributed to their author or anonymous.

**Discharges**: Q&A behaviour.

> ═══════════════════════════════════════════════════════════════════════════════════════════
> **009 SHIPPED, AND WITH IT THE ROADMAP IS COMPLETE.** Every feature 001–009 is delivered, and
> **every destination `requirements.md` names now answers its question.** What remains is 010,
> which adds no schema and no feature — it is the validation pass.
>
> Four things landed differently from the sketch above, and each is recorded in the feature's
> own artifacts rather than only here:
>
> - **Not a tab — a fourth stacked section.** 005 built the panel with sections rather than a
>   tab strip, and `PanelNotes` says in its own header that it is the third "so 009 can add
>   audience questions as a fourth". The prototype's tab strip is HOW, superseded.
> - **The attribution decision was taken before this phase, not in it.** Constitution v3.2.0
>   (N3) settled it: questions are attributed to their author. What 009 had to decide was the
>   problem v3.2.0 left explicitly open — *what happens to a departing attendee's question that
>   other people have upvoted* — answered by owner decision 1: it goes, and their votes go with
>   it, with nothing left de-attributed.
> - **It needed a constitution amendment after all.** Public Q&A visibility is the **second**
>   recorded exception to Principle VIII's "private content stays private", ratified as v3.3.0
>   on 2026-08-10. The spec's first draft claimed no amendment was needed; spec review reversed
>   that, and implementation was gated on ratification exactly as 008's was on v3.2.0.
> - **Safety came with it.** A question is reportable from the question itself (FR-781), which
>   the sketch does not mention and which the spec review added — this is the product's first
>   unmoderated many-to-many surface, and reporting is what makes it survivable without an
>   organizer. That half shipped as PR-B.
>
> **Unlike 007 and 008 it introduced no new architectural concept**: no branded scope, no fourth
> route audit, no cache classification, no notification trigger. Every mechanism it needed
> already existed.
> ═══════════════════════════════════════════════════════════════════════════════════════════

### 010 — UAT Deployment and Pre-Public Hardening · no schema

> **THIS ENTRY WAS SPLIT IN TWO, AND THE ROADMAP DESCRIBED THE UNSPLIT VERSION UNTIL NOW.**
>
> It read "010 — Launch Readiness": one phase carrying a deployment, a validation sweep and
> production. Brainstorm #08 and constitution **v3.4.0** split it, because the two halves have
> different blockers — and keeping them together would have held a working UAT hostage to a brand
> mark. 010's own spec states that it departs from this roadmap; this is the roadmap catching up.

**Shipped 2026-08-11.** `https://mynet-dev.programasemilla.com` serves the product over a
Let's Encrypt certificate, with a seeded conference somebody can join.

- Six security-and-abuse findings closed, all of which get worse the moment a URL is public: the
  throttle now bounds a **burst** and not only a sustained rate; read bounds on the directory and
  the message poll that may delay and may never deny; card sharing requires the **sharer** to be
  verified; one clock for the throttle window and the served delay.
- A real SMTP mail adapter behind the existing port — no vendor SDK in the tree at all.
- Provision, DNS, automatic TLS, a VAPID pair, seed, and a UAT environment marker.
- Just-in-time SSH admission for the deploy job, with unconditional teardown **and** a start-of-run
  assertion that no rule from a previous run survived.

**What it did NOT do, and why**:

- **Backups were descoped for UAT** by owner decision — the environment carries seeded data that
  `db:seed` recreates in seconds. **The restore obligation carries to production unchanged.**
- **`AZURE_CREDENTIALS` is outstanding**, so continuous delivery is written and unexercised. The
  operator is a guest in the Azure tenant and may be unable to register an application.

---

### 011 — Launch Readiness and Production · no schema

**Blocked on register entries 2 and 4**, which is why it is a separate phase.

- The full `requirements.md` validation checklist, end to end.
- Accessibility sweep across all five destinations: labels, visible focus, Escape, keyboard journey.
- Core-journey end-to-end test at desktop, tablet, and mobile widths.
- PWA caching versioned against real data volumes; offline states consolidated and consistent.
- Physical iPhone test (constitution requirement).
- Performance pass.
- **Register entry 22** — a cached conference can outlive a withdrawn registration by up to 24
  hours. Product-wide, older than 009, and answerable once for every repository at once.
- Production: `mynetcr.com` registered, provisioned, and **a restore actually performed** before it
  holds real attendee data.

**Two gates with long lead times — raise them early, not here.**

- ~~**No real brand mark or application icons exist** anywhere in this repository.~~ **ANSWERED
  2026-08-10.** The owner supplied a brand board, closing constitution register entry 2 by
  amendment **v3.4.0**. Raising it early worked exactly as this line intended.

  **The brand half of 010 has been split out and specified on its own**, at
  `specs/010-brand-mark-and-app-icons/` — a departure from this section that its spec declares. It
  takes the brand gate and nothing else; **every other item in the list above remains outstanding
  and still belongs to this phase.** It claims no migration, so it does not contend with 009's
  reserved `0008`.

  **It is now built.** The mark reaches every surface that identifies the product: the three
  install icons, an opaque 180px apple-touch icon, a favicon set and `favicon.ico`, the head links
  `index.html` had never carried, the desktop rail, the top bar, all five authentication screens,
  and manifest screenshots. Every asset is derived from `assets/brand/logo.png` by
  `scripts/generate-brand-assets.mjs`, byte-identically. A new gate,
  `apps/web/tests/unit/icon-declarations.test.ts`, fails a declared icon that has no file — the
  hole where a manifest could name a missing path while all ten gates stayed green.

  **Three items are booked, not done**, and are recorded per-item in
  `specs/010-brand-mark-and-app-icons/follow-ups.md`: the iOS `apple-touch-startup-image` splash
  matrix (FR-840), the `purpose: "monochrome"` variant (FR-841), and the vector redraw (FR-842).
  The redraw's reason is **resolution independence for sizes not yet asked for, not present
  degradation** — planning corrected the spec's "1.37× upscale" claim, and nothing 010 ships is
  upscaled.
- **The desktop and tablet experience has never been validated by the client.** The approved
  prototype is a mobile-only 390×844 frame. Every desktop layout built across 003–009 is unreviewed
  design, and discovering a mismatch here is the expensive outcome. **Escalated twice and now
  cheapened once.** 008 turned it from a risk into an observed defect when a dialog was found
  rendering in the top-left corner having passed every gate; the brand work then added a visible
  element to both unreviewed bands. But **011 changed it from unanswerable to merely unanswered** —
  reviewing a layout needs a running product at a real screen width, and there now is one.

---

## Working model

### Free parallel pairs

Free means the two branches touch disjoint **files**, not merely disjoint features.

| Pair | Why it is free |
|---|---|
| 003 Catalog ∥ 004 Profile | Different schema files, routes, repositories, screens |
| 005 Agenda ∥ 006 Discover | One owns sessions and saves; the other owns people and search |
| 008 Network ∥ 009 Q&A | One owns appointments and contacts; the other owns questions and votes |

### Coordination protocol

Four collision points. 002 removes three of them structurally.

1. **Migration numbers** — reserved in the phase table above. The second branch to merge rebases;
   the number never changes, so no file is renamed mid-rebase.
2. **`contracts/openapi.json`** — generated. **Never hand-merge.** Take either side wholesale,
   regenerate, commit.
3. **Registry files** — Home cards, API routes, repository interfaces, seed modules, Discover card
   actions. Append-only. Conflicts are one line and mechanical.
4. **`apps/api/src/db/seed.ts`** — one file today that both branches of a pair would rewrite. 002
   splits it into per-domain seed modules behind a registry.

Both branches of a pair start from the same `develop` commit. The second to finish rebases before
opening its pull request. Never two open pull requests touching one migration.

### Per-clone setup

The owner works across multiple clones rather than git worktrees. Each clone needs:

- `git config core.hooksPath .githooks` — per-clone, and the only thing preventing a direct push to
  `develop` or `main`. Server-side branch protection is unavailable on this account, so this is the
  whole enforcement mechanism.
- Its own database branch for integration tests. Two sessions running the suite against one database
  will overwrite each other's fixtures.

### Per-phase cycle

One phase, one branch `feat/<nnn>-<name>`, one squash-merged pull request into `develop`.

```
brainstorm → /speckit-specify → review-spec gate → /speckit-plan
  → /clear → /speckit-implement → review-code → /speckit-spex-finish → PR to develop
```

Suggested `develop → main` promotions: after **008**, when the core journey is complete and the
product is genuinely demonstrable, and after **010**.

### What every phase spec must state

So that 010 does not become a dumping ground, each phase spec states:

- Its **offline behaviour**: what works offline, what does not, and what happens to an action
  attempted offline.
- Its **layout** at desktop, tablet, and mobile widths.
- **Empty, loading, and failure states** for every surface that crosses the network.
- Its **accessibility obligations**: labels, focus, keyboard support, Escape where modal.
- Which items of the `requirements.md` **validation checklist** it discharges.

---

## Gate schedule

When to ask matters as much as what to ask.

| When | Gate | Blocks | Owner |
|---|---|---|---|
| **Now** | Attendee identity model | 004 | Client |
| **Now** | Data retention, deletion, export obligations | 004 | Client |
| ~~**Now**~~ | ~~Real brand mark and application icons~~ — **ANSWERED 2026-08-10** (board supplied, v3.4.0, built) | — | Client |
| After 002–003 lands | Client review of desktop and tablet experience | 003–009 build unreviewed desktop design | Client |
| Before 008 | Connection model behind Network contacts | 008 entirely | Client |
| Before 008 | What a card exchange records; whether it is mutual | 008 entirely | Client |
| Before 010 | API hosting and managed PostgreSQL provider | 010 | Owner |
| Before 010 | Authentication ownership — self-implemented or delegated | 010 | Owner |
| Before 010 | Preview-environment access control and data isolation | 010 | Owner |

---

## Register impact

**Resolved by this design** — recorded in constitution **v2.1.0**, which cites the decisions below:

- *Event scoping* — resolved by D1.
- *Attendee profile view* — resolved: a profile detail view is built in 006.
- *Repository shape* — settled in practice. The API lives here, in `apps/api`, inside the pnpm
  workspace.

**Carried forward unchanged** — do not resolve by assumption: attendee identity model; data
retention, deletion and export; the connection model behind Network contacts; card exchange
semantics; brand mark; desktop validation; API hosting and PostgreSQL provider; authentication
ownership; preview data isolation; what "PS" denotes; whether `requirements.md` is amended or its
divergence merely recorded.

**Added to the register by v2.1.0**: audience-question attribution (client decision, blocks 009) and
attendee avatar handling (owner decision, blocks 004). Both surfaced while detailing the phases above.

**Added by this design**: the Home card composition contract (D3) is a new architectural commitment
that later phases depend on. If 002 gets it wrong, every subsequent phase inherits the mistake. It is
recorded as a binding constraint in v2.1.0 under "Data scoping, content provenance, and composition",
alongside D1 and D2.

**Also added by v2.1.0**: Principle IX, *Every Feature Declares Its Own Completeness*. The
obligations this roadmap assigns to each phase — offline behaviour, three layouts, empty/loading/
failure states, accessibility, checklist items discharged — are now a mandatory declaration in every
specification rather than a convention of this document, and the spec template carries the section.

---

## Non-goals

Unchanged from the constitution, and not reopened by this roadmap:

- Organizer administration, in any form — including content import.
- Payment processing.
- Notification delivery and calendar integration. Their interfaces exist; they must not be wired to
  real delivery. The prototype's notification bell must not be reproduced.
- Capacitor and native packaging, until one of the three recorded triggers occurs.
- Optimistic updates and conflict resolution, each of which requires its own recorded decision.
