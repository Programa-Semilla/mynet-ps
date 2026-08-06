<!--
SYNC IMPACT REPORT
Version change: 2.0.0 → 2.1.0
Rationale: MINOR. One principle added, two sections materially expanded, three Open Questions
Register entries resolved. No principle is removed or redefined, and no work performed under 2.0.0
is invalidated.

Owner decisions cited by this amendment (all 2026-08-06, recorded in
docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md):
  D1. Event scoping is hybrid. Conference content — sessions, tracks, speakers, the Discover
      directory, appointments — is per-event. Relationships — contacts, exchanged cards, message
      threads — persist across events. (Resolves register entry "Event scoping of data".)
  D2. Conference content is seeded; each attendee authors their own profile. No administrative
      interface, and no content import path.
  D3. Home is a slot-based card registry built early, not a dashboard aggregated late.
  D4. Phases run mostly sequentially, in parallel only where they touch disjoint files.

Added principles:
  - IX. Every Feature Declares Its Own Completeness
Expanded sections:
  - Technology and Architecture Constraints → new "Data scoping, content provenance, and
    composition" block recording D1, D2, D3 as binding constraints.
  - Branching and Change Flow → new "Parallel work and shared artifacts" block recording D4's
    coordination protocol.
  - Governance → the delivery roadmap is named as the authoritative decomposition.
  - Governance → Open Questions Register (three entries resolved, two added, all renumbered).

Resolved register entries:
  - "Event scoping of data" (was #6) — by D1.
  - "Attendee profile view" (was #9) — a profile detail view is delivered in phase 006.
  - "Repository shape" (was #12) — the API lives in this repository at apps/api.

Added register entries:
  - Audience-question attribution (client decision) — blocks phase 009.
  - Attendee avatar handling (owner decision) — blocks phase 004.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — updated. Principle IX makes a per-feature declaration
     mandatory, so the template now carries a "Feature Declarations" section.
  ✅ .specify/templates/tasks-template.md — task categories already accommodate the declared
     obligations; no edit required.
  ✅ CLAUDE.md — updated in this change. Its open-questions summary listed the three now-resolved
     entries, and its constraints did not carry D1–D3.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — the decision record this
     amendment cites. Unchanged by it.
  ✅ specs/001-production-foundation/ — unaffected. Nothing in 2.1.0 contradicts the delivered
     slice; Principle IX applies to specifications written after this amendment.

Deferred TODOs:
  - GroundZero/requirements.md remains knowingly out of step (open question, client decision).
    Unchanged by this amendment.

--- PRIOR REPORT: 2.0.0 ---
Version change: 1.1.0 → 2.0.0
Rationale: MAJOR. The project owner decided on 2026-08-04 that MyNet is the real product, not a
front-end demo, and that durable persistence and real authentication are foundational rather than
deferred. This redefines principles in a backward-incompatible way: the "no external services, no
real authentication, no durable storage" boundary is removed, Principle I is reframed, Principle V
is widened, and Principle VI's backend bar is lifted. Work performed under 1.x that assumed a
stateless front-end demo is invalidated.

Owner decisions cited by this amendment (all 2026-08-04):
  1. Product name is MyNet. (Resolves a 1.x Open Questions Register entry.)
  2. MyNet is the real product. The demo framing is withdrawn.
  3. requirements.md is authoritative for WHAT the product is, not HOW it is delivered.
  4. Durable persistence is foundational. Architecture: custom API over managed PostgreSQL.
  5. Real authentication is foundational, not a later slice.
  6. Five destinations are individually addressable (overrides the "single-route" wording).

Modified principles:
  - I. "Requirements Are the Source of Truth" → "Requirements Define the Product, Not the Delivery
    Mode". Adds the WHAT/HOW classification that the owner decision requires.
  - III. Attendee Experience First — "authenticated attendee workspace" is now literal, not a feel.
  - V. "Platform Abstraction Before Platform APIs" → "Abstraction Before Platform and Data APIs".
    Extended to cover data access, which 1.x left uncovered.
  - VI. Web-First Delivery — the bar on backends and synchronization is lifted; native-only-on-
    trigger is retained unchanged.
  - VII. Verified on Linux CI — extended to cover the API, database migrations, and integration
    tests.
Added principles:
  - VIII. Attendee Data Is Personal Data
Rewritten sections:
  - Technology and Architecture Constraints (Data and boundaries; Persistence; new Backend and API;
    new Data access)
  - Governance → Open Questions Register (one entry resolved, five added)
Removed: the demo-scope boundary in all its forms.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — structure remains compatible.
  ✅ .specify/templates/tasks-template.md — task categories accommodate backend, migration, and
     security task types.
  ⚠️ CLAUDE.md — MUST be updated in the same change; its Business rules, Technology stack, and Open
     questions sections all still describe the 1.x demo scope.
  ⚠️ specs/001-production-foundation/ — written under 1.x. Invalidated by this amendment and being
     rewritten.
  ⚠️ brainstorm/01-foundation-slice.md — decision recorded under 1.x. A dated revisit section is
     required rather than a silent edit.

Deferred TODOs:
  - GroundZero/requirements.md still says "EventLink", still describes a front-end demo, and still
    lists persistent databases and real authentication as out of scope. Whether it is amended or
    the divergence is simply recorded is an open question requiring the client, not the owner.

--- PRIOR REPORT: 1.1.0 ---
Added the "Branching and Change Flow" section. Enforcement artifacts: .githooks/pre-commit,
.githooks/pre-push, .githooks/README.md. Known gap: GitHub server-side branch protection returns
403 on a private free-tier repository.

--- PRIOR REPORT: 1.0.0 ---
Initial ratification. Principles I–VII, Technology and Architecture Constraints, Development
Workflow and Quality Gates, Governance with Open Questions Register and Amendment Procedure.
-->

# MyNet Constitution

## Core Principles

### I. Requirements Define the Product, Not the Delivery Mode

`GroundZero/requirements.md` is the authoritative statement of **what MyNet is**: who it serves,
what it does, how it looks, and what "finished" means. It is **not** authoritative on how the
product is built, hosted, or persisted.

Every statement in an authoritative source MUST be classified before it is relied upon:

- **WHAT (binding)** — actors, capabilities, destinations, workflows, domain terminology, visual
  direction, accessibility obligations, responsive obligations, empty and error states, success
  criteria, and anything explicitly excluded from the *product*.
- **HOW (not binding)** — statements describing the original demo delivery mode: single-route
  construction, in-file constants, absence of network requests, absence of durable storage,
  absence of authentication, and state resetting on reload.

Sources MUST be consulted in this priority order:

1. Recorded owner or client decisions (this document, and decisions cited by its amendments)
2. `GroundZero/requirements.md`, read for WHAT
3. Client-provided reference images
4. `GroundZero/prototype/` (approved interaction and presentation reference)
5. Existing source code (implementation reference only)

When sources conflict on a **WHAT**, the conflict MUST be recorded in the Open Questions Register
and resolved with the client. Resolving a WHAT conflict by assumption, inference, or convenience is
prohibited. No specification, plan, or implementation may introduce capabilities, data models, or
business rules that are not traceable to an authoritative source or to an explicitly recorded
decision.

**Rationale**: The client approved a product, and the prototype demonstrated it through the
cheapest available delivery mode. Treating that delivery mode as a requirement confused an artifact
of prototyping with a decision the client made. Separating the two lets the product stay
authoritative while the architecture serves it. The register still binds: this principle widens
what may be decided, it does not permit deciding silently.

### II. The Prototype Is Reference, Not Architecture

`GroundZero/prototype/` is an approved **visual and interaction** reference. Its architecture, file
layout, state model, dependency list, styling technique, and code quality carry no authority and
MUST NOT be preserved by default.

Legitimate uses: interaction flows, screen composition, copy, sample-data *shape*, visual language.
Every structural decision the prototype embodies MUST be re-decided explicitly for production, and
the decision recorded in the feature plan.

**Rationale**: Client approval of the prototype validates product direction only. Treating a
1,400-line single-file Figma Make export as a starting architecture would import decisions nobody
made.

### III. Attendee Experience First

The attendee is the only actor in scope. Every feature MUST be justified by how it answers one of
the attendee's three questions, in this order of prominence:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

The product IS an authenticated attendee workspace — literally, not as an aesthetic. It MUST NOT
read as a marketing site and MUST NOT read as a generic enterprise dashboard. People, sessions, and
time MUST be the strongest visual elements. The first viewport MUST make the product understandable
without scrolling, and the core journey — inspect the next session → discover a relevant attendee →
share a card or message them → schedule a networking appointment — MUST remain completable end to
end.

Organizer administration and payment processing are out of **product** scope and MUST NOT be built
without an amendment. Their exclusion is a WHAT, not a delivery-mode artifact.

**Rationale**: This is the stated success criterion. A feature that does not serve it is scope creep
regardless of its merit.

### IV. Accessibility and Responsiveness Are Non-Negotiable

Every interactive control MUST have an accessible label, a visible focus state, and keyboard
operability. Modals MUST have a clear close action and Escape-key dismissal. Focus states MUST NOT
be removed (`focus:outline-none` without an equivalent visible replacement is a defect).

Three layouts MUST be delivered and verified:

- **Desktop**: persistent left navigation rail, contextual top bar, multi-column dashboard
- **Tablet**: reduced rail, two-column cards, stacked detail areas
- **Mobile**: compact header, bottom navigation, single-column cards, full-width overlays,
  touch-sized controls

No content and no primary action may require horizontal scrolling at any supported width.

The required empty and error states MUST exist: no attendee search results (message + reset action),
no saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting
slots (explanation + close), and invalid empty message or meeting topic (**disabled confirmation**,
never a post-submit error). Now that data is fetched rather than embedded, **loading and failure
states are equally required** wherever data crosses the network.

**Rationale**: The prototype implements none of the focus or Escape behavior and has no desktop or
tablet layout at all. These are requirements, not enhancements, and they are cheap to keep and
expensive to retrofit.

### V. Abstraction Before Platform and Data APIs

Application code MUST call project-owned interfaces, never external APIs directly. This applies in
two dimensions:

**Device and browser capabilities** — `NotificationService`, `CalendarService`, `CameraService`,
`ContactShareService`, `SecureStorage`, and `ConnectivityService`. Initial implementations MAY be
web-based or no-op stubs.

**Data access** — feature and presentation code MUST NOT call the network, construct requests, or
know transport details. It MUST obtain data through project-owned repository interfaces expressed
in domain terms. Swapping the implementation behind a repository MUST NOT require changes to
feature code.

Any new capability that touches a device, platform, or network surface MUST be introduced behind an
interface in the same change that introduces it. A direct call to a platform API or to the network
from feature code is a Constitution Check failure and MUST be recorded in Complexity Tracking with
justification, or refactored.

**Rationale**: The device half is what makes a later native move a packaging change rather than a
rewrite. The data half is the same argument applied where it now matters more — with a real API,
transport details leaking into components is the defect that makes every future change expensive.
Version 1.x mandated the first and omitted the second; that omission is corrected here.

### VI. Web-First Delivery, Native Only on Trigger

The client product MUST be built as an installable PWA: web app manifest, application icons,
offline shell, versioned caching, and explicit online/offline states.

MyNet is a networked product with durable server-side state. Offline behaviour MUST therefore be
**explicit and bounded**: what is available offline, what is not, and what happens to an action
attempted offline MUST be specified per feature rather than assumed. Optimistic updates and
conflict resolution MUST NOT be introduced speculatively — each requires a recorded decision naming
the conflict semantics it adopts.

Capacitor or another native wrapper MUST NOT be adopted unless at least one trigger is documented as
having occurred:

1. App Store distribution has become mandatory, or
2. A required capability is not adequately available on the web platform, or
3. Field testing shows PWA installation materially harms adoption.

When a trigger fires, use Codemagic or Bitrise for iOS builds and signing, TestFlight for beta, and
Google Play internal testing for Android. Reconsider React Native + Expo only if the roadmap becomes
app-store-first with multiple native integrations; reconsider Flutter only if rich animation or
bespoke rendering becomes a defining requirement; .NET MAUI only for a strongly C#/.NET team.
Xamarin and Unity are not permitted.

At least one **physical iPhone** MUST be exercised before any production release — installation,
safe areas, keyboard behavior, gestures, permissions, and WebView behavior.

**Rationale**: The ranked recommendation exists so the stack is chosen by evidence rather than by
preference at an inconvenient moment. Version 1.x additionally barred backends and synchronization;
that bar is lifted by owner decision. What replaces it is not permission to synchronize freely but a
requirement to decide offline semantics deliberately, per feature.

### VII. Verified on Linux CI

Every change MUST pass an automated pipeline that runs on Linux with no Apple infrastructure. The
pipeline MUST cover both the client and the API: type checking, linting, unit tests, component
tests, **API contract tests**, **database migration verification**, **integration tests against a
real database instance**, accessibility checks, end-to-end browser tests, a production build, and a
preview deployment.

A change is not complete until the pipeline is green. Completion MUST NOT be claimed from
inspection; it MUST be claimed from pipeline output. Failing or skipped checks MUST be reported
explicitly, never silently tolerated.

The requirements validation checklist — production build success, desktop and mobile rendering,
navigation and event switching, search and filter, session save + notes + Q&A, message composition,
card-sharing feedback, meeting scheduling and appointment creation, keyboard focus visibility, and
accessible labels — applies to the **product as a whole**, and is satisfied incrementally as the
features it names are delivered. Each feature MUST state which checklist items it discharges. It
MUST NOT be treated as a gate on slices that do not yet contain the named features, and it MUST NOT
be quietly dropped.

**Rationale**: The prototype has no lint, test, typecheck, or lockfile. Establishing the gate before
the code exists is the only time it is free. Adding a database and an API adds failure modes — a
migration that cannot roll forward, a contract that drifts from its consumer — that only automation
catches reliably.

### VIII. Attendee Data Is Personal Data

MyNet stores attendee profiles, private conversations, personal notes, and meeting appointments.
This is personal data about identifiable people, and it MUST be treated as such from the first
migration.

- **Identity is required for isolation.** Every stored record that belongs to an attendee MUST be
  attributable to exactly one identity, and every read path MUST be scoped by that identity. There
  is no development shortcut in which "one known user" stands in — that shortcut becomes the
  retrofit that leaks data.
- **Authorization is enforced server-side.** Client-side filtering is a presentation concern and
  MUST NOT be relied upon for access control. An endpoint MUST reject data it would not be
  permitted to return, independently of what the client requested.
- **Secrets never reach the client.** Database credentials, signing keys, and provider tokens MUST
  live only in server-side configuration and MUST NOT appear in the client bundle, the repository,
  or preview deployments.
- **Collect only what a requirement names.** Fields not traceable to an authoritative source MUST
  NOT be stored merely because they might be useful.
- **Private content stays private.** Messages, notes, and appointments are visible only to their
  participants. Any exception requires a recorded client decision.
- **Deletion and export are recognised obligations**, not features to be invented later. Their
  absence in a given slice MUST be recorded in the Open Questions Register rather than passed over.

**Rationale**: Version 1.x had no such principle because it stored nothing. The decision to persist
real attendee data created a privacy surface in one step, and the failure modes there are not
recoverable by a later patch — leaked data stays leaked.

### IX. Every Feature Declares Its Own Completeness

The obligations in Principles IV, VI, VII, and VIII apply to every feature. They are stated in four
different places, which is how they get missed. Each feature specification MUST therefore carry an
explicit, reviewable declaration covering all of the following:

- **Offline behaviour** — what works offline, what does not, and what happens to an action attempted
  offline (Principle VI).
- **Layout** — how the feature renders at desktop, tablet, and mobile widths (Principle IV).
- **Empty, loading, and failure states** — for every surface that crosses the network (Principle IV).
- **Accessibility** — accessible labels, visible focus, keyboard operability, and Escape-key
  dismissal where the feature introduces a modal (Principle IV).
- **Validation checklist items discharged** — which of the requirements checklist this feature
  satisfies, and which it deliberately leaves to a later feature (Principle VII).
- **Identity scoping and server-side authorization** — mandatory for any feature that stores or
  reads attendee data (Principle VIII).
- **Register position** — which Open Questions Register entries block this feature, and which it
  resolves.

**An obligation that is not declared is presumed unmet.** An explicit "not applicable, because…" is
a valid declaration; silence is not. A specification missing this declaration MUST NOT pass its
review gate, and a feature MUST NOT be marked complete while any declared obligation is outstanding.

These obligations MUST NOT be deferred to a consolidated later pass. A feature that postpones its
accessibility, responsive, or offline work to a future "polish" or "hardening" activity has not
discharged it. Such an activity is legitimate only as verification of work already done.

**Rationale**: The prototype failed Principle IV in exactly the way this prevents — Escape handling
and focus states were requirements from the beginning, were never anyone's stated responsibility in
any particular screen, and so were built by nobody. Scattering an obligation across four principles
makes it everyone's job in the abstract and no one's in the concrete. A per-feature declaration makes
the omission visible at spec review, which is the cheapest moment it can be caught, and it removes
the failure mode where a hardening phase becomes a rubber stamp for work that was never done.

## Technology and Architecture Constraints

- **Client stack**: React + TypeScript, built as an installable PWA. Type checking MUST be enabled
  and enforced (the prototype has no `tsconfig.json`; production MUST).
- **Backend and API**: MyNet has a project-owned API service over a managed **PostgreSQL** database.
  The API contract is owned by this project — not generated by a vendor and not dictated by a
  third-party platform. This was decided by the owner on 2026-08-04 in preference to a managed
  backend-as-a-service, for portability and contract control; the operational cost of that choice is
  accepted.
- **Schema changes** MUST be expressed as versioned, reviewed migrations committed to the
  repository. Ad-hoc changes to a live database are prohibited. Every migration MUST be verified in
  CI before it reaches an environment that holds real data.
- **Data access**: feature code reaches data only through repository interfaces (see Principle V).
  Transport, serialization, and caching details MUST NOT leak into components.
- **Authentication**: real authentication is in scope. Sessions MUST be established and validated
  server-side. Whether identity is self-owned or delegated to a provider is an open question, not a
  default.
- **Dependencies**: The production dependency set MUST be derived from actual need. The prototype's
  inherited Figma Make dependency list (MUI, recharts, react-dnd, react-slick, embla, react-router,
  and the unused shadcn/ui scaffold) carries no authority and MUST NOT be copied forward wholesale.
  A lockfile MUST be committed.
- **Design tokens**: Colors, typography, spacing, and radii MUST be defined as named tokens in one
  place. Hardcoded hex literals scattered through components are prohibited. The approved palette —
  deep navy surfaces, warm coral accents, soft cream backgrounds, white content cards, subtle mint
  status cues — MUST be expressed through those tokens.
- **Icons**: A single consistent icon set MUST be used. Hand-inlined one-off SVG is prohibited
  except for genuinely bespoke marks.
- **Product boundaries**: organizer administration and payment processing remain out of scope
  (Principle III). Notification delivery and calendar integration remain out of scope until a
  recorded decision brings them in; the interfaces for them exist (Principle V) but MUST NOT be
  wired to real delivery without that decision.
- **State**: server state and client state MUST be distinguishable. Server-derived data MUST NOT be
  duplicated into ad-hoc client state where the copy can silently diverge from its source.
- **Persistence**: attendee data is durable and server-side. `SecureStorage` covers client-side
  secrets and MUST NOT be used as a general cache. What may be cached on the client, and for how
  long, MUST be specified per feature rather than assumed.

### Data scoping, content provenance, and composition

Decided by the project owner on 2026-08-06. Binding on every subsequent feature.

- **Event scoping is hybrid.** Conference **content** is per-event and swaps when the attendee
  switches events: sessions, tracks, speakers, rooms, the Discover directory, and appointments.
  **Relationships** persist across every event: contacts, exchanged digital cards, and message
  threads. Every new table MUST state which of the two rules applies to it and why; neither rule is
  a default that may be assumed. The scoping predicate is enforced server-side, as part of the same
  identity binding required by Principle VIII — an attendee MUST NOT be able to read another
  event's content by manipulating a request.

  *Rationale*: MyNet is a professional networking product. A contact made at last year's conference
  must not vanish because the attendee is now at a different one. But discovering people means
  discovering people who are present, and an appointment is a time and a place at a specific event.

- **Conference content is seeded; profiles are attendee-authored.** Events, sessions, tracks, rooms,
  and speakers ship as committed, versioned seed data. Each attendee authors their own profile —
  company, role, interests, networking intent, availability — and MUST NOT be able to edit anyone
  else's. Networking intent and availability are decisions a person makes, not facts an organizer
  records.

  Seed data MUST NOT become a route around the organizer-administration exclusion in Principle III.
  No administrative interface, no privileged role, and **no content import path** may be built
  without an amendment. Adding a conference is a reviewed change to committed seed data.

- **Home is composed, not aggregated.** Home is a registry of independent cards. Each card owns its
  own loading, empty, and failure states, and a card that fails MUST NOT blank the dashboard or
  prevent any other card from rendering. No card may depend on another card's presence, ordering, or
  data. A feature contributing to Home does so by adding a card and registering it, never by editing
  another feature's card.

  *Rationale*: Home is the first viewport, and Principle III makes the first viewport a success
  criterion. It is also the one surface every feature wants to touch. Composition keeps it improving
  continuously without becoming a shared file that every change contends for.

## Branching and Change Flow

`main` and `develop` are protected. **No commit and no push may be made directly to either
branch.** Every change — code, specification, documentation, configuration, migrations, and this
constitution — MUST reach them through a pull request.

- `main` holds released, production-ready state.
- `develop` is the integration branch and the **default base for pull requests**.
- Work happens on a short-lived branch created from `develop`, named `<type>/<short-description>`
  where type is one of `feat`, `fix`, `chore`, `docs`, `spec`, or `refactor`.
- Pull requests targeting `develop` MUST be merged with **squash**, keeping one commit per unit of
  work and a linear history. The source branch is deleted on merge.
- Promotion from `develop` to `main` is itself a pull request. Force-pushing to and deleting `main`
  or `develop` are prohibited.
- A pull request MUST NOT be merged while its required checks (Principle VII) are failing.

**Enforcement**: versioned hooks in `.githooks/` block direct commits and pushes. Each clone MUST
activate them once with `git config core.hooksPath .githooks` — `core.hooksPath` is local
configuration and cannot be committed. These hooks are a guardrail against mistakes, not a security
control: they are bypassable with `--no-verify`. Authoritative enforcement is server-side GitHub
branch protection, which is currently **unavailable** on this repository (private repository on a
free personal account; the branch-protection and ruleset APIs both return 403). Making the
repository public or upgrading to GitHub Pro, then applying the configuration recorded in
`.githooks/README.md`, is required to close this gap. Until then the gap is a known, accepted risk —
not a resolved one. **With real attendee data now in scope, this gap is materially more serious than
it was under 1.x.**

### Parallel work and shared artifacts

Features run mostly one at a time, in parallel only where they touch disjoint files. Where two do
run in parallel, the following apply.

- **Migration numbers are reserved, not discovered.** A feature claims its migration number when its
  specification is written, from the sequence recorded in the delivery roadmap. Two open pull
  requests MUST NOT introduce the same migration number, and a migration file MUST NOT be renamed to
  resolve a conflict — renaming a migration that another branch has already applied is how a
  database and its history diverge.
- **Generated artifacts are never hand-merged.** The published API contract and any other generated
  file MUST be resolved by taking one side wholesale and regenerating, never by editing the merged
  result. A hand-reconciled generated file is indistinguishable from a correct one until it is wrong
  in production.
- **Extension points are append-only registries.** Where more than one feature will contribute to
  the same surface — Home cards, API route registration, repository interfaces, seed data, card
  actions — the surface MUST be a registry that features append to, with each contribution in its
  own file. A feature MUST NOT be required to edit another feature's file in order to be included.
- **Each clone stands alone.** `core.hooksPath` is local configuration and MUST be activated in
  every clone, not only the first. Each clone used for integration testing MUST have its own
  database branch; two suites sharing one database overwrite each other's fixtures and produce
  failures that reproduce nowhere.

## Development Workflow and Quality Gates

- Work follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Implementation MUST NOT begin before the spec and plan
  exist for that feature.
- Every plan MUST complete the **Constitution Check** gate before Phase 0 research and re-check it
  after Phase 1 design. Violations MUST be recorded in the plan's Complexity Tracking table with the
  simpler alternative and why it was rejected — never left implicit.
- Any ambiguity discovered mid-feature MUST be recorded in the Open Questions Register. Work that
  does not depend on the answer proceeds; work that does states its assumption explicitly or stops
  for a client decision.
- Accessibility and responsive verification are task categories in their own right, not finishing
  touches. A feature touching UI MUST produce tasks for both.
- **A feature that stores or reads attendee data MUST produce tasks for identity scoping,
  server-side authorization, and migration verification.** These are not implied by "make it work".
- **The Principle IX declaration is a spec review gate.** A specification without it is incomplete
  and MUST be returned rather than planned. Each declared obligation MUST be traceable to at least
  one task, and the feature MUST NOT be marked complete while any of them is outstanding.

## Governance

This constitution supersedes all other development practices, conventions, and habits for this
repository. Where a tool default, a template, or prior code conflicts with it, this document wins.

**Amendment procedure**: Amendments MUST be proposed as an explicit change to this file, carrying a
written rationale and, where the change invalidates existing work, a migration note. Amendments that
resolve an entry in the Open Questions Register MUST cite the decision that resolved it.

**Delivery decomposition**: `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` is
the authoritative decomposition of the product into features, and records their dependency order,
reserved migration numbers, and gate schedule. It is a plan, not governance: it does not bind
conduct, and it may be revised without an amendment. But a feature whose scope, dependencies, or
migration number departs from it MUST say so in its specification, because the roadmap is what the
next session reads to know what has been decided and what has not.

**Versioning policy** (semantic):

- **MAJOR** — a principle is removed or redefined in a backward-incompatible way, or governance
  itself changes.
- **MINOR** — a principle or section is added, or existing guidance is materially expanded.
- **PATCH** — clarification, wording, or typo fixes with no change in meaning.

**Compliance review**: Every plan verifies compliance at its Constitution Check gate. Every code
review verifies compliance against Principles III, IV, V, VII, VIII, and IX specifically, because
those are the ones a passing build can still violate. Unjustified complexity is a review blocker.

### Open Questions Register

Recorded discrepancies and undecided matters. Adding is always permitted; removing requires a
decision cited in an amendment.

**Resolved in 2.0.0**

- ~~Product name (EventLink vs. MyNet)~~ — **RESOLVED 2026-08-04 by owner decision: the product is
  MyNet.** Consequence: `GroundZero/requirements.md` and the prototype UI now carry a stale name.
- ~~Demo scope vs. the PWA persistence recommendation~~ — **RESOLVED 2026-08-04 by owner decision:
  MyNet is the real product with durable server-side persistence.**

**Resolved in 2.1.0**

- ~~Event scoping of data~~ — **RESOLVED 2026-08-06 by owner decision D1: hybrid.** Conference
  content is per-event; relationships persist across events. Recorded as a binding constraint under
  "Data scoping, content provenance, and composition".
- ~~Attendee profile view~~ — **RESOLVED 2026-08-06: a profile detail view is delivered**, closing
  the gap where `requirements.md` says a profile can be opened and the prototype has no such screen.
- ~~Repository shape~~ — **RESOLVED 2026-08-06: the API lives in this repository**, at `apps/api`
  inside the pnpm workspace, alongside the client.

**Open — require a client decision**

1. **What "PS" denotes** in the repository name `mynet-ps`.
2. **Real brand mark and application icons.** No logo exists in the repository; the only images are
   avatar photographs used as prototype sample data. Long lead time — it blocks release readiness,
   not any single feature.
3. **`GroundZero/requirements.md` is now knowingly out of step** with this constitution on product
   name, delivery mode, persistence, authentication, and routing. Whether it is amended or the
   divergence is recorded is undecided.
4. **Desktop and tablet layouts have never been validated by the client.** The approved prototype is
   mobile-only at a fixed 390×844 frame. Every desktop layout built before this is answered is
   unreviewed design, so the cost of leaving it open compounds with each feature.
5. **Attendee identity model.** How a person becomes an attendee — self sign-up, event invitation,
   ticket holder, organizer-provisioned — is unspecified, and it determines the authentication
   design. Blocks the attendee profile feature.
6. **Data retention, deletion, and export obligations** for personal data (Principle VIII) are
   recognised but unspecified. Blocks the attendee profile feature, which is the first to store
   substantial personal data.
7. **The connection model behind Network contacts.** The prototype derives contacts from the
   existence of a conversation; no explicit connect or accept action is defined, so there is no
   relationship to store. Blocks the Network feature entirely.
8. **What an exchanged digital card records, and whether the exchange is mutual.** Requirements
   place exchanged cards in Network; the prototype shows a transient confirmation and stores
   nothing. Blocks the Network feature entirely.
9. **Audience-question attribution.** Whether a question asked in a session's Q&A is attributed to
   its author or anonymous. It determines whether Q&A is a personal-data surface under Principle
   VIII. Blocks the Q&A feature.
10. **Notifications.** The prototype header shows a notification bell; notifications are out of
    product scope until a recorded decision brings them in. The bell MUST NOT be reproduced before
    then.

**Open — require an owner or planning decision**

11. **API hosting and the managed PostgreSQL provider.**
12. **Authentication ownership** — self-implemented versus a delegated provider.
13. **Attendee avatar handling** — seeded imagery versus real upload. Upload pulls in object storage
    and `CameraService` and creates a new personal-data surface; deferring it is the current
    working assumption but is not a decision. Blocks the attendee profile feature.
14. **Public preview URLs.** Cloudflare Pages previews are publicly reachable by default; with real
    data in scope, preview environments MUST NOT be pointed at production data, and preview access
    control is undecided.
15. **Server-side branch protection remains unavailable** (private repository, free personal
    account; APIs return 403). Enforcement is client-side and bypassable.

**Runtime guidance**: `CLAUDE.md` provides durable project context for AI-assisted sessions. It MUST
stay consistent with this constitution and MUST NOT contain implementation plans, session tasks,
progress updates, or invented requirements.

**Version**: 2.1.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-06
