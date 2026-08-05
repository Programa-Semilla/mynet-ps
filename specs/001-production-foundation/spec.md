# Feature Specification: Production Foundation Slice

**Feature Branch**: `spec/production-foundation`

**Created**: 2026-08-04

**Revised**: 2026-08-04 — rewritten after the owner decision that MyNet is the real product with
durable server-side state and real authentication. Supersedes the draft written against
constitution 1.x, which assumed a stateless front-end demo.

**Status**: Draft

**Constitution**: v2.0.0

**Input**: Foundation slice for MyNet as a real product. Client scaffold, design tokens, and a
responsive application shell over five individually addressable destinations. A project-owned API
service over managed PostgreSQL with versioned migrations. Real authentication with server-side
sessions and per-attendee data isolation. Repository interfaces for data access and the six device
capability interfaces. Installable PWA with bounded offline behaviour. Linux CI covering client,
API, migrations, and integration.

---

## Context and Scope Note

This is the first production slice. No production application code exists yet.

**Why this specification names technologies.** Convention says a spec states WHAT and defers HOW.
That is relaxed in one bounded direction: constitution v2.0.0 already fixes React + TypeScript, a
project-owned API, and managed PostgreSQL as ratified constraints, and records the owner decisions
behind them. Recording a constraint that already binds is not the same as inventing one. **No
functional requirement below names a framework, library, or vendor** — every FR is stated as a
capability or behaviour, so the requirement set survives a stack change. Technology names appear
only in this note, Assumptions, and Dependencies. Genuinely open choices are in Open Questions.

**What "foundation" means here.** The destinations carry no product content — no sessions, no
attendee cards, no message threads. But the slice is a true vertical slice: an attendee signs in,
the browser calls the API, the API queries PostgreSQL scoped to that attendee's identity, and the
shell renders who they are and which events they are registered for. Every layer is exercised end
to end. Content arrives in later slices through a seam that already exists.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An attendee signs in and sees their own workspace (Priority: P1)

An attendee arrives at MyNet and is asked to identify themselves. After signing in, the workspace
greets them by name and shows the events they are registered for. If they close the browser and
return, they are still signed in. If they sign out, their data is no longer reachable. Another
attendee signing in on the same machine sees their own name and their own events — never the first
attendee's.

**Why this priority**: This is the walking skeleton. It is the only story that proves the entire
stack — browser, API, database, migrations, identity, and isolation — actually connects. Everything
else in this slice is scaffolding around it. Constitution Principle VIII forbids the shortcut where
development proceeds against a single known user, because that shortcut becomes the retrofit that
leaks data.

**Independent Test**: Seed two distinct attendees with different registered events. Sign in as each
in turn and confirm each sees only their own identity and events. Attempt to read the other
attendee's data by manipulating the request directly, and confirm the server refuses.

**Acceptance Scenarios**:

1. **Given** an attendee who is not signed in, **When** they open any destination address, **Then**
   they are asked to sign in and are not shown attendee data.
2. **Given** valid credentials, **When** the attendee signs in, **Then** a server-side session is
   established and the workspace shows their name and their registered events.
3. **Given** invalid credentials, **When** sign-in is attempted, **Then** it is refused with a
   message that does not reveal whether the identifier exists.
4. **Given** a signed-in attendee, **When** they close and reopen the browser within the session
   lifetime, **Then** they remain signed in.
5. **Given** a signed-in attendee, **When** they sign out, **Then** the session is invalidated
   server-side and previously reachable data is no longer returned.
6. **Given** two attendees with different registered events, **When** each signs in, **Then** each
   sees only their own identity and only their own events.
7. **Given** a signed-in attendee, **When** a request is altered to reference another attendee's
   data, **Then** the server refuses it regardless of what the client asked for.
8. **Given** an expired or tampered session, **When** any data request is made, **Then** it is
   refused and the attendee is returned to sign-in.

---

### User Story 2 - The attendee reaches every part of the workspace on any device (Priority: P2)

The signed-in attendee moves between the five destinations of the product — Home, Agenda, Discover,
Messages, Network — through a navigation surface suited to their screen: a persistent rail on
desktop, a reduced rail on tablet, a bottom bar on mobile. Each destination has its own address, so
it can be opened directly, shared, and reached with the browser's history controls. The destinations
hold no content yet, but the structure of the product is legible and every control works by mouse,
keyboard, or touch.

**Why this priority**: It is what makes the accessibility, keyboard, responsive, and end-to-end
gates capable of doing real work. The constitution identifies focus behaviour and responsive layout
as cheap to establish now and expensive to retrofit.

**Independent Test**: Signed in, load the application at 320px, 768px, and 1280px. Confirm each
width presents its intended navigation form with no horizontal scrolling, and that every destination
is reachable. Repeat using only the keyboard, confirming a visible focus indicator at every stop.
Open each destination address directly and confirm correct rendering and navigation state.

**Acceptance Scenarios**:

1. **Given** desktop width, **When** the workspace loads, **Then** a persistent left navigation rail
   and a contextual top bar are visible and the workspace supports multi-column layout.
2. **Given** tablet width, **When** the workspace loads, **Then** the rail is present in reduced
   form and the layout is prepared for two-column cards and stacked detail areas.
3. **Given** mobile width, **When** the workspace loads, **Then** a compact header and bottom
   navigation are presented and all navigation targets meet touch-size minimums.
4. **Given** any supported width from 320px upward, **When** any destination is viewed, **Then** no
   content and no primary action requires horizontal scrolling.
5. **Given** the workspace is open, **When** the attendee presses Tab repeatedly, **Then** focus
   moves in a logical order and every focused control shows a clearly visible focus indicator.
6. **Given** focus on a navigation control, **When** it is activated with Enter or Space, **Then**
   the destination becomes active and the change is announced to assistive technology.
7. **Given** any destination, **When** an automated accessibility scan runs, **Then** zero critical
   or serious violations are reported.
8. **Given** a destination address, **When** it is opened directly, **Then** that destination is
   active with its navigation control marked current, without passing through Home.
9. **Given** several destinations have been visited, **When** the browser's Back and Forward
   controls are used, **Then** the address and the active destination stay consistent at every step.
10. **Given** an address matching no destination, **When** it is opened, **Then** a recognisable
    not-found view is presented within the shell, offering a route back to Home.

---

### User Story 3 - Every proposed change is automatically verified before it can merge (Priority: P3)

A contributor opens a pull request. An automated pipeline runs on Linux and checks the change across
both halves of the product: client types, lint, unit and component tests, API contract tests,
database migration verification, integration tests against a real database, accessibility, end-to-end
browser behaviour, a production build, and a preview deployment. Any failure is red and blocks the
merge. On success, a reviewable preview is published.

**Why this priority**: The constitution states a change is not complete until the pipeline is green,
and that completion is claimed from pipeline output rather than inspection. Adding a database and an
API adds failure modes — a migration that will not roll forward, a contract that drifts from its
consumer — that only automation catches reliably.

**Independent Test**: Open pull requests each containing one deliberate defect — a type error, a
lint violation, a failing test, an accessibility regression, a migration that cannot apply to a
clean database, and an API response that violates its declared contract. Confirm each is caught by
the pipeline and names the defect. Then confirm a clean change passes and publishes a preview.

**Acceptance Scenarios**:

1. **Given** a change introducing a type error, a lint violation, or a failing unit or component
   test, **When** the pipeline runs, **Then** it fails and identifies the defect.
2. **Given** a change whose API response violates its declared contract, **When** contract checks
   run, **Then** they fail and name the divergence.
3. **Given** a migration that cannot apply cleanly to an empty database, **When** migration
   verification runs, **Then** it fails before any environment holding real data is touched.
4. **Given** a change that breaks an identity-scoped read path, **When** integration tests run
   against a real database, **Then** they fail.
5. **Given** a change introducing a critical or serious accessibility violation on any destination,
   **When** the pipeline runs, **Then** it fails and names the violation.
6. **Given** a change that breaks navigation or sign-in, **When** end-to-end browser checks run,
   **Then** they fail.
7. **Given** all checks pass, **When** the pipeline completes, **Then** a production build is
   produced and a preview of that exact change is published at a reviewable address.
8. **Given** any check is absent, skipped, or errored, **When** the pipeline reports, **Then** it
   does not report overall success.
9. **Given** the pipeline runs, **When** it executes, **Then** it requires no Apple infrastructure
   and completes entirely on Linux.

---

### User Story 4 - The attendee installs MyNet and it behaves honestly without a connection (Priority: P4)

The attendee installs MyNet to their device home screen. In a venue with poor connectivity they
launch it and get the application shell rather than a browser error page, with an unambiguous
indication that they are offline and a clear statement of what is unavailable. Actions that need the
server are refused clearly rather than appearing to succeed. When connectivity returns, the
indication updates without intervention.

**Why this priority**: Principle VI requires an installable PWA with an offline shell and explicit
online/offline states, and conference venues are genuinely low-connectivity. It ranks below the
stack and shell because it depends on both existing. The constitution requires offline behaviour to
be **explicit and bounded** — this slice establishes that pattern rather than pretending the product
works fully offline.

**Independent Test**: Install to a home screen. Disable the network. Launch and confirm the shell
renders with a clear offline state naming what is unavailable. Attempt a server-dependent action and
confirm it is refused clearly rather than silently failing or appearing to succeed. Re-enable the
network and confirm the state updates without a manual reload.

**Acceptance Scenarios**:

1. **Given** a browser supporting installation, **When** the attendee visits, **Then** the
   application satisfies installability requirements and installs under the product name.
2. **Given** at least one prior visit, **When** launched with no connection, **Then** the shell
   renders rather than a browser error page.
3. **Given** the application is offline, **When** the attendee views the workspace, **Then** an
   explicit offline state states what is unavailable rather than implying everything works.
4. **Given** the application is offline, **When** the attendee attempts an action requiring the
   server, **Then** it is refused with a clear explanation and is not shown as having succeeded.
5. **Given** the offline state is displayed, **When** connectivity is restored, **Then** the state
   updates without a manual reload.
6. **Given** a newer version has been deployed, **When** the attendee next launches, **Then** they
   receive the new version rather than an indefinitely stale cached one.
7. **Given** the attendee has never visited before, **When** they open the application offline,
   **Then** the result is the browser's normal offline behaviour and is not presented as an
   application defect.
8. **Given** the attendee signs out, **When** cached data is inspected, **Then** no attendee-specific
   data from that session remains available on the device.

---

### User Story 5 - Capabilities and data sources can be replaced without rewriting product logic (Priority: P5)

Product code never reaches for a device capability or for the network directly. It asks a
project-owned interface. Behind that interface, an implementation decides whether the answer comes
from the browser, from a native layer added later, from the API, or from a test double.

**Why this priority**: Constitution Principle V names the device half as the decision that makes a
later native move a packaging change rather than a rewrite, and the data half as what keeps
transport details out of components once a real API exists. It is last only because it is invisible
to the attendee; it is not optional.

**Independent Test**: Replace each device capability implementation and each repository
implementation with a test double, and confirm the application runs and the substitution takes
effect with no change to feature code. Then search feature code for direct platform or network calls
and confirm there are none.

**Acceptance Scenarios**:

1. **Given** feature code needs a device capability, **When** it obtains one, **Then** it does so
   through a project-owned interface and never by calling a browser or native API directly.
2. **Given** feature code needs data, **When** it obtains it, **Then** it does so through a
   repository interface expressed in domain terms, with no knowledge of transport, endpoints, or
   serialization.
3. **Given** any interface, **When** its implementation is replaced with a test double, **Then** the
   application runs and the substitution takes effect without changes to feature code.
4. **Given** a device capability with no meaningful web implementation in this slice, **When** it is
   invoked, **Then** it returns a defined result appropriate to its contract rather than throwing or
   producing an unusable value.
5. **Given** the connectivity state shown in User Story 4, **When** its source is traced, **Then** it
   comes from the connectivity interface and not from a browser API read in feature code.

---

### Edge Cases

Each states the required behaviour. None is left as an open question.

**Navigation and layout**

- **Unknown address**, online or offline: the shell renders a recognisable not-found view with a
  route back to Home. Never a blank screen, never a raw server error.
- **Below the smallest breakpoint** (320px and narrower): the mobile layout continues to apply and
  the no-horizontal-scrolling rule still holds; content reflows rather than clipping.
- **Exact breakpoint boundaries**: each breakpoint is defined as a half-open interval so exactly one
  layout applies at every width. No width may match two layouts or none.
- **Very large viewports**: the workspace content is constrained to a readable maximum measure and
  centred; it does not stretch without limit.
- **Reduced motion**: all non-essential animation is suppressed when the attendee has requested
  reduced motion. **Text zoom to 200%**: layout reflows without loss of content or function.

**Identity and data**

- **Session expiry mid-action**: the action is refused, the attendee is returned to sign-in, and no
  partial write occurs.
- **Sign-in on a second device**: both sessions remain valid independently; signing out of one does
  not sign out the other.
- **Request for another attendee's data**: refused server-side with a response that does not
  disclose whether the referenced record exists.
- **Attendee registered for no events**: the workspace renders with an explicit empty state rather
  than an error or a blank region.

**Connectivity**

- **First visit while offline**: the browser's normal offline behaviour applies; nothing is cached
  yet and this is not presented as an application defect.
- **Connectivity flapping**: the offline indicator is debounced so that transient drops do not cause
  it to oscillate; it reflects a settled state, not every transition.
- **Server-dependent action attempted offline**: refused with a clear explanation. Never queued
  silently, never shown as succeeded.
- **Stale cached application**: versioned caching supersedes old assets, and the new version is in
  effect by the next launch at the latest.

**Operations and delivery**

- **Deployment credentials absent or invalid**: the pipeline fails loudly and does not report
  success. It never passes by skipping the step.
- **Migration fails mid-apply**: the failure is surfaced and the target database is left in a known
  state; no environment holding real data is touched by an unverified migration.
- **Provisional icons mistaken for final branding**: placeholder icons are visibly marked as
  provisional and are recorded as such in the repository, so neither a reviewer nor the client can
  mistake them for approved branding.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Project foundation and tooling

- **FR-001**: The project MUST enforce static type checking across client and API; a type error MUST
  fail verification.
- **FR-002**: The project MUST commit a dependency lockfile so every clone and pipeline run resolves
  an identical dependency set.
- **FR-003**: The production dependency set MUST be derived from actual need. The prototype's
  inherited dependency list MUST NOT be carried forward wholesale.
- **FR-004**: The project MUST provide automated linting and formatting; a violation of either MUST
  fail verification.
- **FR-005**: The project MUST provide three distinct automated test capabilities, each runnable
  locally and in the pipeline by documented commands:
  - **Unit tests** — exercise a single module in isolation with no rendering and no I/O.
  - **Component tests** — render a component and assert on its rendered output and interactions,
    with dependencies substituted.
  - **Integration tests** — exercise the API against a real database instance, with no substitution
    of the data layer.
- **FR-006**: A contributor MUST be able to install dependencies, run the client and API locally,
  apply migrations to a local database, and execute every verification command from a clean clone
  using documented commands.
- **FR-007**: Local development MUST NOT require access to any environment holding real attendee
  data.

#### Visual language

- **FR-008**: Colours, typography, spacing, and corner radii MUST be defined as named tokens in one
  place. Hardcoded colour literals MUST NOT appear outside that definition.
- **FR-009**: The approved palette MUST be expressed through those tokens: deep navy surfaces
  (`#1b2340`), warm coral accents (`#e8634d`), soft cream backgrounds (`#fdf8f3`), white content
  cards, subtle mint status cues (`#5CC9A7`), and the supporting border (`#efe8e1`), muted
  (`#8f96a8`), and body (`#525a70`) values.
- **FR-010**: A single consistent icon set MUST be adopted for interface icons. Hand-inlined one-off
  SVG MUST NOT be used except for genuinely bespoke marks.
- **FR-011**: The shell MUST present as an authenticated attendee workspace rather than a marketing
  page or a generic enterprise dashboard. **This is verified by a recorded design review against
  named criteria** — the attendee's own identity is visible; navigation is persistent and workspace-
  shaped rather than page-shaped; there is no marketing copy, hero section, or call to sign up; and
  the approved palette and typography are in use. The review outcome and its reviewer MUST be
  recorded in the pull request.

#### Application shell and navigation

- **FR-012**: The shell MUST present five destinations — Home, Agenda, Discover, Messages, Network —
  with Home as the default, and MUST allow the attendee to move between them.
- **FR-013**: Each destination MUST have its own distinct, stable, shareable address.

  > **Recorded override.** `GroundZero/requirements.md` describes a "single-route" demo and the
  > prototype switches destinations through in-memory state. Addressable routes contradict the
  > literal wording of that source. Decided by the project owner on 2026-08-04 rather than inferred,
  > as Principle I requires. Now also consistent with constitution v2.0.0's WHAT/HOW classification,
  > under which "single-route" is a HOW statement and not binding.

- **FR-014**: Opening a destination address directly MUST render that destination as active with
  correct navigation state, without first passing through Home.
- **FR-015**: An address matching no destination MUST render a recognisable not-found view within
  the shell, offering a route back to Home.
- **FR-016**: At desktop widths the shell MUST present a persistent left navigation rail, a
  contextual top bar, and a workspace area capable of multi-column layout.
- **FR-017**: At tablet widths the shell MUST present a reduced navigation rail and a layout prepared
  for two-column cards and stacked detail areas.
- **FR-018**: At mobile widths the shell MUST present a compact header, bottom navigation, capacity
  for full-width overlays, and touch-sized controls.
- **FR-019**: Breakpoints MUST be defined so exactly one layout applies at every viewport width, with
  no width matching two layouts or none.
- **FR-020**: No content and no primary action may require horizontal scrolling at any width from
  320px upward.
- **FR-021**: Every interactive control MUST expose an accessible name, MUST be keyboard operable,
  and MUST display a clearly visible focus indicator. Removing the focus indicator without an
  equivalent visible replacement is a defect.
- **FR-022**: The active destination MUST be communicated both visually and to assistive technology.
- **FR-023**: Each destination MUST render an identifiable region carrying no product content in this
  slice, sufficient for navigation and accessibility verification to target it.
- **FR-024**: Non-essential animation MUST be suppressed when reduced motion is requested, and layout
  MUST reflow without loss of content or function at 200% text zoom.

#### Identity and authentication

- **FR-025**: An attendee MUST be able to sign in, and MUST NOT reach attendee data without doing so.
- **FR-026**: Sessions MUST be established and validated server-side. A session that is expired,
  revoked, or tampered with MUST be refused.
- **FR-027**: An attendee MUST be able to sign out, and signing out MUST invalidate the session
  server-side rather than only clearing client state.
- **FR-028**: A session MUST survive the browser closing and reopening within its lifetime.
- **FR-029**: Sessions on different devices MUST be independent; ending one MUST NOT end another.
- **FR-030**: Failed sign-in MUST NOT disclose whether an identifier exists.
- **FR-031**: Credentials MUST NOT be stored in a recoverable form, and MUST never be logged.
- **FR-032**: The signed-in attendee's identity MUST be visible in the shell.

#### Data, persistence, and isolation

- **FR-033**: Attendee data MUST be stored durably server-side and MUST survive browser reload,
  sign-out, and redeployment.
- **FR-034**: Every stored record belonging to an attendee MUST be attributable to exactly one
  identity.
- **FR-035**: Every read and write path MUST be scoped by the authenticated identity, enforced
  server-side. Client-side filtering MUST NOT be relied upon for access control.
- **FR-036**: A request referencing data the authenticated attendee may not access MUST be refused
  regardless of what the client asked for, with a response that does not disclose whether the
  referenced record exists.
- **FR-037**: Schema changes MUST be expressed as versioned migrations committed to the repository
  and applied in a defined order. Ad-hoc changes to a live database are prohibited.
- **FR-038**: Every migration MUST be verified against a clean database in the pipeline before it
  reaches any environment holding real data.
- **FR-039**: The schema in this slice MUST support attendee identity, sessions, events, and the
  registration relating an attendee to the events they attend. Content entities arrive with the
  slices that own them.
- **FR-040**: An attendee registered for no events MUST be presented with an explicit empty state,
  not an error and not a blank region.
- **FR-041**: Secrets — database credentials, signing keys, provider tokens — MUST live only in
  server-side configuration and MUST NOT appear in the client bundle, the repository, or preview
  deployments.
- **FR-042**: Only fields traceable to an authoritative source or a recorded decision MUST be stored.

#### Abstraction

- **FR-043**: The project MUST define and own interfaces for six device capabilities: notifications,
  calendar, camera, contact sharing, secure storage, and connectivity.
- **FR-044**: The project MUST define and own repository interfaces for data access, expressed in
  domain terms.
- **FR-045**: Feature and presentation code MUST obtain device capabilities and data only through
  those interfaces, and MUST NOT call browser APIs, construct network requests, or know transport,
  endpoint, or serialization details.
- **FR-046**: Every interface MUST have an initial implementation that returns a defined result
  appropriate to its contract. A capability with no meaningful implementation in this slice MUST NOT
  throw or produce an unusable value; where its contract has no return value, completing without
  effect is a defined result.
- **FR-047**: Any implementation MUST be substitutable — replacing one MUST take effect without
  modifying feature code.

#### Installable delivery and bounded offline behaviour

- **FR-048**: The application MUST be installable to a device home screen under the product name with
  application icons.
- **FR-049**: The product name MUST originate from a single definition supplying the installed name,
  the document title, and the package identity. The product name is **MyNet**.
- **FR-050**: Application icons MUST be supplied at the sizes required for installation including a
  maskable variant. In this slice they are provisional placeholders drawn from the approved palette,
  and MUST be visibly marked as provisional and recorded as such so they cannot be mistaken for
  approved branding.
- **FR-051**: After a first successful visit, the application MUST render its shell when launched
  with no connection.
- **FR-052**: The offline state MUST be communicated explicitly and MUST state what is unavailable,
  rather than implying the product is fully functional.
- **FR-053**: An action requiring the server that is attempted offline MUST be refused with a clear
  explanation. It MUST NOT be queued silently and MUST NOT appear to have succeeded.
- **FR-054**: Connectivity state MUST update without a manual reload, MUST be sourced through the
  connectivity interface, and MUST be debounced so transient drops do not cause the indicator to
  oscillate.
- **FR-055**: Cached assets MUST be versioned so a newly deployed version supersedes a stale one, in
  effect by the next launch at the latest.
- **FR-056**: Signing out MUST leave no attendee-specific data from that session available on the
  device.
- **FR-057**: Optimistic updates and conflict resolution MUST NOT be introduced in this slice.

#### Error handling

- **FR-058**: Every state where data crosses the network MUST have a defined loading presentation and
  a defined failure presentation. A failure MUST NOT render as an empty success.
- **FR-059**: An error shown to an attendee MUST explain what happened and what they can do next, and
  MUST NOT expose internal detail, stack traces, or database errors.
- **FR-060**: Server-side failures MUST be recorded with enough detail to diagnose them, and those
  records MUST NOT contain credentials, session tokens, or message content.
- **FR-061**: An unexpected client-side error MUST NOT leave a blank page; the shell MUST remain and
  offer a route back to a working state.

#### Automated verification

- **FR-062**: Every change MUST be verified automatically on Linux with no dependency on Apple
  infrastructure.
- **FR-063**: Verification MUST include: type checking, linting, unit tests, component tests, API
  contract tests, migration verification against a clean database, integration tests against a real
  database instance, accessibility checks, end-to-end browser tests, a production build, and a
  preview deployment.
- **FR-064**: A check that fails, errors, is skipped, or is absent MUST NOT be reported as success.
- **FR-065**: A change whose verification is not green MUST NOT be merged.
- **FR-066**: A successfully verified change MUST publish a preview of that exact change at an
  address a reviewer can open without local setup.
- **FR-067**: Preview environments MUST NOT be connected to any data store holding real attendee
  data.
- **FR-068**: Accessibility checks MUST cover every destination. End-to-end checks MUST cover sign-in,
  sign-out, navigation between destinations at more than one viewport size, entry by direct address,
  and browser history traversal.
- **FR-069**: Integration tests MUST include at least one case asserting that one attendee cannot
  read another attendee's data.

#### Bootstrap sequence

- **FR-070**: Because FR-063 makes preview deployment a required check and FR-065 blocks merging on a
  non-green pipeline, this slice's own pull request cannot merge until deployment credentials exist.
  The order MUST therefore be: (1) the owner provisions the hosting account, the database instance,
  and the repository secrets; (2) the pipeline definition and application land in the pull request;
  (3) the pipeline runs green including preview deployment; (4) the change merges.
- **FR-071**: If provisioning in step 1 has not completed, the pull request MUST remain unmerged
  rather than the check being disabled, skipped, or made non-blocking to obtain a green result.

#### Performance

- **FR-072**: A client asset budget MUST be defined and enforced in the pipeline, so that a change
  materially increasing delivered client bytes fails rather than passing unnoticed. The budget's
  initial value is a planning decision; its existence and enforcement are the requirement.

### Key Entities

- **Attendee** — a person who uses MyNet. Has an identity, a display name, and the profile fields the
  product requires. Owns all data attributed to them.
- **Credential** — the secret by which an attendee proves identity. Stored only in a non-recoverable
  form.
- **Session** — a server-side record that an attendee is currently signed in on one device, with a
  lifetime and the ability to be revoked independently of other sessions.
- **Event** — a conference. Has a name, a location, and a span of days.
- **Registration** — the relationship establishing that an attendee attends an event. Determines
  which events appear in that attendee's workspace.
- **Destination** — one of the five primary areas. Has a name, an icon, a distinct address, an
  active state, and no content in this slice.
- **Device capability service** — a project-owned contract for a device or browser capability, with
  one interchangeable implementation active at a time.
- **Repository** — a project-owned contract for reading and writing a domain entity, hiding transport
  entirely from its callers.
- **Connectivity state** — whether the attendee is currently online or offline, observable, settled
  rather than instantaneous, and surfaced to the attendee.
- **Migration** — a versioned, ordered, reviewed schema change committed to the repository.
- **Cache version** — the identifier distinguishing one deployed set of cached assets from another.
- **Design token** — a named visual value referenced by components instead of a literal.
- **Branding constant** — the single definition of the product name.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in attendee sees their own name and their own registered events, and in
  repeated trials with multiple seeded attendees, the number of times any attendee is shown another
  attendee's data is zero.
- **SC-002**: Attempts to read another attendee's data by direct request manipulation are refused in
  100% of attempts, and the refusal does not disclose whether the record exists.
- **SC-003**: An attendee's data survives browser reload, sign-out and sign-in, and redeployment in
  100% of trials.
- **SC-004**: The complete navigation journey across all five destinations can be performed using
  only a keyboard, with a visible focus indicator present at 100% of stops.
- **SC-005**: Automated accessibility scanning reports zero critical or serious violations across all
  five destinations at desktop, tablet, and mobile widths.
- **SC-006**: No horizontal scrolling is required for any content or primary action at any width from
  320px upward.
- **SC-007**: All five destinations can be opened directly by address and shared as links, and
  history traversal keeps address and displayed destination consistent in 100% of transitions.
- **SC-008**: Direct platform API calls and direct network calls in feature code number zero; 100% of
  capability and data access goes through a project-owned interface.
- **SC-009**: Colour literals outside the token definition number zero.
- **SC-010**: Every change is subject to all eleven automated checks before merge, and a change
  introducing a type error, lint violation, failing test, contract violation, unappliable migration,
  or accessibility regression cannot be merged.
- **SC-011**: A reviewer can open a working preview of any proposed change from the change itself,
  with no local installation, and that preview is never connected to real attendee data.
- **SC-012**: After one prior visit, the application renders its shell with no connection in 100% of
  attempts, states what is unavailable, and refuses server-dependent actions rather than appearing to
  perform them.
- **SC-013**: The application can be installed to a device home screen on a current mobile browser.
- **SC-014**: A contributor starting from a clean clone can install, run both halves, apply
  migrations, and verify the project using documented commands with no undocumented manual steps and
  no access to real attendee data.
- **SC-015**: Every migration in the repository applies cleanly to an empty database in the pipeline
  before reaching any environment holding real data.

### Constitution validation checklist — items this slice discharges

Principle VII's product checklist is satisfied incrementally, and each feature states its share.
This slice discharges: **production build success**, **desktop and mobile rendering**, **navigation**
(between destinations; event *switching* awaits the event switcher), **keyboard focus visibility**,
and **accessible labels**.

It does not discharge, because the features do not exist yet: search and filter; session save, notes,
and Q&A; message composition; card-sharing feedback; meeting scheduling and appointment creation.

---

## Assumptions

Defaults chosen where sources are silent. None resolves an Open Questions Register entry.

- **Stack is pre-decided, not chosen here.** React + TypeScript as an installable PWA, a
  project-owned API, and managed PostgreSQL are fixed by constitution v2.0.0.
- **Client preview hosting is pre-decided** as Cloudflare Pages, chosen during brainstorming on
  commercial-use terms, private-repository support, build-minute caps, and preview support.
- **Account provisioning in this slice is administrative, not self-service.** Attendee accounts are
  created by a controlled path — seeding or an administrative command — because the identity model is
  an open client question. **This is an interim assumption stated explicitly, not a decision.** No
  public sign-up flow is built, and none should be inferred from the presence of sign-in.
- **Breakpoint values** are unspecified in all source material; conventional thresholds are assumed
  and fixed during planning. The three layouts are requirements; the pixel values are not.
- **Destinations render a heading and an empty region** — structurally present but content-free — so
  accessibility and end-to-end verification have legitimate targets.
- **Product empty and error states belonging to content** — no search results, no saved sessions,
  empty thread, no meeting slots, invalid input — arrive with the content that owns them.
- **The notification bell is omitted.** Notifications are out of product scope.
- **`SecureStorage` is for client-side secrets only**, not a general cache. Durable attendee data
  lives server-side.
- **Service worker updates apply by next launch** rather than interrupting with a reload prompt.
- **A single production locale (English), no internationalization layer.**
- **No analytics or third-party telemetry.** Server-side error recording under FR-060 is operational
  logging, not product analytics.
- **The prototype's hardcoded persona and dates are not carried forward**; identity comes from the
  signed-in attendee.

---

## Dependencies

- **Managed PostgreSQL instance** provisioned, with connection credentials available to the API as
  server-side configuration.
- **Client preview hosting account and repository secrets.** An owner action that cannot be performed
  from within the repository. Per FR-070 and FR-071, this blocks the merge of this slice.
- **A non-production database for preview and CI**, isolated from any store holding real attendee
  data (FR-067).
- **Local guardrail activation** (`git config core.hooksPath .githooks`) once per clone, per the
  constitution's Branching and Change Flow section.
- **Approved visual language** from `GroundZero/prototype/`, used as reference for palette and
  composition only, never as architecture.

---

## Out of Scope

- All destination content: Home dashboard, agenda list, session detail panel, Discover cards,
  Messages threads, Network contacts and appointments — and the content entities behind them.
- Search, filters, notes, Q&A, digital card sharing, meeting scheduling, appointments.
- Public self-service sign-up, password reset, and account recovery flows.
- Organizer administration and payment processing — out of *product* scope per Principle III.
- Notification delivery and calendar integration — interfaces exist but MUST NOT be wired to real
  delivery.
- Capacitor or any native wrapper — barred by Principle VI absent a documented trigger.
- Optimistic updates, offline write queuing, and conflict resolution.
- The real brand mark and final application icons.

---

## Open Questions

Not resolved by this specification. The authoritative register is in `.specify/memory/constitution.md`.

**Require a client decision**

1. **Attendee identity model.** How a person becomes an attendee — self sign-up, event invitation,
   ticket holder, organizer-provisioned — is unspecified and determines the authentication design.
   This slice proceeds on the stated interim assumption of administrative provisioning.
2. **Event scoping of data.** Whether sessions, attendees, conversations, and appointments are scoped
   per event or shared across events. Cosmetic under sample data; the schema forces an answer as soon
   as content entities arrive.
3. **The connection model behind Network contacts.** The prototype derives contacts from the
   existence of a conversation; there is no connect or accept action, so no relationship to store.
4. **What a digital-card exchange records**, and whether it is mutual.
5. **Data retention, deletion, and export obligations** for personal data. Recognised by Principle
   VIII, unspecified.
6. **Real brand mark and application icons.** No logo exists in the repository.
7. **`GroundZero/requirements.md` is knowingly out of step** with the constitution on product name,
   delivery mode, persistence, authentication, and routing. Amend it, or record the divergence?
8. **What "PS" denotes** in the repository name `mynet-ps`.
9. **Desktop and tablet layouts have never been validated by the client.** The approved prototype is
   mobile-only at a fixed 390×844 frame; this slice creates the first desktop and tablet experience
   this product has ever had.

**Require an owner or planning decision**

10. **Repository shape** — API in this repository or its own.
11. **API hosting and the managed PostgreSQL provider.**
12. **Authentication ownership** — self-implemented or a delegated provider.
13. **Abstraction layer shape** — root-injected registry versus context provider per service.
14. **Package manager.**
15. **Preview access control.** Cloudflare Pages previews are publicly reachable by default.
16. **Whether this slice still ships as a single pull request.** Single-PR delivery was agreed when
    the slice was frontend-only; it now also contains an API, a schema, migrations, an auth flow, and
    backend CI. Flagged rather than silently re-decided; a natural decision point for
    `/speckit-spex-collab-phase-split` before implementation.
17. **Server-side branch protection remains unavailable** — private repository on a free personal
    account, APIs return 403. Enforcement is client-side and bypassable, and materially more serious
    now that real attendee data is in scope.
