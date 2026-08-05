# Feature Specification: Production Foundation Slice

**Feature Branch**: `spec/production-foundation`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Production foundation slice for MyNet, per brainstorm/01-foundation-slice.md. Deliver a walking-skeleton foundation in a single PR: scaffold with strict typechecking and a committed lockfile; lint, format, unit and component test runners; design tokens for the approved palette plus typography, spacing and radii with no hex literals in components; a single consistent icon set; a responsive application shell (desktop persistent left rail + contextual top bar, tablet reduced rail, mobile bottom nav) routing between five empty destinations Home, Agenda, Discover, Messages, Network, with accessible labels, visible focus states and keyboard operability and no horizontal scrolling at any width; six platform abstraction interfaces with web or no-op stubs, called only through the interfaces; a full PWA layer (manifest naming the product MyNet from a single branding constant, provisional placeholder icons, service worker with versioned caching, offline shell, explicit online/offline state); and a Linux CI pipeline running typecheck, lint, unit tests, component tests, accessibility checks, end-to-end browser tests, production build, and preview deployment. Out of scope: all destination content and sample data, search, filters, notes, Q&A, card sharing, meeting scheduling, appointments, real auth, any backend, durable persistence, organizer admin, native wrappers, and the real brand mark."

---

## Context and Scope Note

This feature is the first production slice. No production application exists — the repository has
held only the approved requirements, the approved prototype, and the initialization brief.

**A note on technology in this specification.** Spec Kit convention is that a spec states WHAT and
avoids naming a technology stack. That convention is relaxed here in exactly one direction: the
project constitution has *already* fixed the stack as an authoritative, ratified constraint
(Principle VI and the Technology and Architecture Constraints section). Recording a constraint
that already binds is not the same as a specification inventing one. Where this document names a
technology, it is **citing a prior decision**, never making a new one. Every genuinely open
technical choice is left to `/speckit-plan`, and the ones that matter are listed under Open
Questions.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attendee reaches any part of the workspace on any device (Priority: P1)

An attendee opens MyNet and immediately sees something that reads as an authenticated attendee
workspace rather than a marketing page. A navigation surface appropriate to their screen — a
persistent rail on desktop, a reduced rail on tablet, a bottom bar on mobile — lets them move
between the five destinations of the product: Home, Agenda, Discover, Messages, and Network. The
destinations hold no content yet, but the structure of the product is legible, and every control
can be reached and operated with a mouse, a keyboard, or a touch target.

**Why this priority**: This is the smallest thing that makes the product a product rather than a
build configuration. It is also the only part of the slice that makes the accessibility,
keyboard, responsive, and end-to-end verification gates capable of doing real work — a scaffold
that renders nothing gives those gates nothing to check. The constitution identifies focus
behaviour and responsive layout as cheap to establish now and expensive to retrofit later.

**Independent Test**: Load the application at 320px, 768px, and 1280px widths. Confirm each width
presents its intended navigation form, that no horizontal scrolling is required at any of them,
and that every destination can be reached. Then complete the same journey using only the keyboard,
confirming a visible focus indicator at every stop. Finally, open each destination's address
directly and confirm it renders with the correct navigation state.

**Acceptance Scenarios**:

1. **Given** a viewport at desktop width, **When** the attendee opens the application, **Then** a
   persistent left navigation rail and a contextual top bar are visible, and the workspace area is
   capable of multi-column layout.
2. **Given** a viewport at tablet width, **When** the attendee opens the application, **Then** the
   navigation rail is present in reduced form and the layout is prepared for two-column cards and
   stacked detail areas.
3. **Given** a viewport at mobile width, **When** the attendee opens the application, **Then** a
   compact header and a bottom navigation bar are presented, and all navigation targets meet
   touch-size minimums.
4. **Given** any supported viewport width, **When** the attendee views any destination, **Then**
   no content and no primary action requires horizontal scrolling.
5. **Given** the application is open, **When** the attendee presses Tab repeatedly, **Then** focus
   moves through every interactive control in a logical order and each focused control shows a
   clearly visible focus indicator.
6. **Given** focus is on a navigation control, **When** the attendee activates it with Enter or
   Space, **Then** the corresponding destination becomes the active workspace and the change is
   announced to assistive technology.
7. **Given** any destination is active, **When** an automated accessibility scan runs against it,
   **Then** zero critical or serious violations are reported.
8. **Given** any navigation control, **When** it is inspected by assistive technology, **Then** it
   exposes an accessible name and its current selected state.
9. **Given** a destination's address, **When** the attendee opens it directly in a new browser tab,
   **Then** that destination is the active workspace and its navigation control is marked current,
   without passing through Home first.
10. **Given** the attendee has moved through several destinations, **When** they use the browser's
    Back and Forward controls, **Then** the active destination and the address stay consistent with
    each other at every step.
11. **Given** an address matching no destination, **When** it is opened, **Then** a defined outcome
    is presented rather than a blank screen or a raw error.

---

### User Story 2 - Every proposed change is automatically verified before it can merge (Priority: P2)

A contributor opens a pull request. Without anyone asking, an automated pipeline runs on Linux and
checks the change from every angle the constitution requires: types, lint, unit tests, component
tests, accessibility, end-to-end browser behaviour, and a production build. If any check fails,
the pipeline is red and the change cannot merge. If all pass, a working preview of the change is
published at a URL the reviewer can open without installing anything.

**Why this priority**: The constitution states a change is not complete until the pipeline is
green, and that completion is claimed from pipeline output rather than from inspection. The
rationale it gives is decisive on timing — the prototype has no lint, test, typecheck, or
lockfile, and establishing the gate before the code exists is the only moment it costs nothing.

**Independent Test**: Open a pull request containing a deliberate type error. Confirm the pipeline
fails and reports the type error. Correct it and confirm the pipeline turns green and publishes a
preview URL. Repeat with a deliberate lint violation, a failing test, and an accessibility
regression.

**Acceptance Scenarios**:

1. **Given** a pull request that introduces a type error, **When** the pipeline runs, **Then** it
   fails and identifies the offending code.
2. **Given** a pull request that introduces a lint violation, **When** the pipeline runs, **Then**
   it fails and identifies the violation.
3. **Given** a pull request with a failing unit or component test, **When** the pipeline runs,
   **Then** it fails and reports which test failed.
4. **Given** a pull request that introduces a critical or serious accessibility violation on any
   destination, **When** the pipeline runs, **Then** it fails and names the violation.
5. **Given** a pull request that breaks navigation between destinations, **When** the end-to-end
   browser checks run, **Then** they fail.
6. **Given** a pull request where every check passes, **When** the pipeline completes, **Then** a
   production build is produced and a preview of that exact change is published at a reviewable
   URL.
7. **Given** the pipeline runs, **When** it executes, **Then** it requires no Apple infrastructure
   and completes entirely on Linux.
8. **Given** the deployment credentials are absent or invalid, **When** the pipeline runs, **Then**
   it reports the deployment failure explicitly and does not report overall success.

---

### User Story 3 - Attendee installs MyNet and it still works without a connection (Priority: P3)

An attendee installs MyNet to their device home screen. Later, in a conference venue with poor
connectivity, they launch it. Rather than a browser error page, they get the application shell
and an unambiguous indication that they are offline. When connectivity returns, that indication
updates without them having to do anything.

**Why this priority**: Principle VI requires the product to be an installable PWA with a manifest,
icons, an offline shell, versioned caching, and explicit online/offline states. Conference venues
are a realistic low-connectivity environment, so this is product-relevant rather than ceremonial.
It ranks below navigation and verification because it depends on the shell existing first, and
because caching strategy is most cheaply decided alongside the deployment step, which is also in
this slice.

**Independent Test**: Install the application to a home screen. Disable the network. Launch from
the home screen and confirm the shell renders and an offline state is clearly communicated.
Re-enable the network and confirm the state updates without a manual reload.

**Acceptance Scenarios**:

1. **Given** a browser that supports installation, **When** the attendee visits the application,
   **Then** it satisfies installability requirements and can be added to the home screen under the
   product name.
2. **Given** the application has been visited at least once, **When** the attendee launches it with
   no network connection, **Then** the application shell renders rather than a browser error page.
3. **Given** the application is running, **When** connectivity is lost, **Then** an explicit
   offline state is communicated to the attendee.
4. **Given** the application is displaying an offline state, **When** connectivity is restored,
   **Then** the state updates to reflect being online without requiring a manual reload.
5. **Given** a new version of the application has been deployed, **When** the attendee next
   launches it, **Then** they receive the new version rather than an indefinitely stale cached one.
6. **Given** the attendee has never visited the application before, **When** they open it with no
   network connection, **Then** the failure is a normal browser offline result and is not
   presented as an application defect.

---

### User Story 4 - Device capabilities can be swapped without rewriting product logic (Priority: P4)

The application needs device and browser capabilities — notifications, calendar, camera, contact
sharing, secure storage, connectivity. Product code never reaches for those directly. It asks a
project-owned interface, and something behind that interface decides whether the answer comes from
the browser, from a native layer added later, or from a stub that does nothing at all.

**Why this priority**: Principle V names this as the single decision that makes a later move to
native packaging a packaging change rather than a rewrite — and states plainly that it only holds
if enforced from the first commit. It is last in priority only because it is invisible to the
attendee today; it is not optional.

**Independent Test**: For each of the six capabilities, substitute a test double for the real
implementation and confirm the application still runs and the substitution is observable. Then
search the feature code for direct platform API usage and confirm there is none.

**Acceptance Scenarios**:

1. **Given** the application is running, **When** feature code needs a platform capability,
   **Then** it obtains that capability through a project-owned interface and never by calling a
   browser or native API directly.
2. **Given** any one of the six capability interfaces, **When** its implementation is replaced with
   a test double, **Then** the application continues to run and the replacement takes effect
   without changes to feature code.
3. **Given** a capability that has no meaningful web implementation in this slice, **When** feature
   code invokes it, **Then** it receives a well-defined no-op or stub response rather than an error
   or an undefined result.
4. **Given** the connectivity state shown to the attendee in User Story 3, **When** its source is
   traced, **Then** it is supplied by the connectivity interface and not read directly from a
   browser API in feature code.

---

### Edge Cases

- **Unknown address.** What happens when an address matching no destination is opened — including
  offline, resolved by the cached shell rather than by a server? Covered by FR-011b; the defined
  outcome must not be a blank screen or a raw error.
- **Back and Forward across destinations.** What happens when the attendee navigates through
  several destinations and then uses the browser's history controls — does navigation state stay
  consistent with the address?
- **Extreme narrow width.** What happens below the smallest designed breakpoint — at 320px and
  narrower? The no-horizontal-scrolling rule must still hold.
- **Exact breakpoint boundaries.** What renders at precisely the desktop/tablet and tablet/mobile
  thresholds? Boundary behaviour must be defined rather than accidental.
- **Very large viewports.** What happens on an ultra-wide display — does the workspace stretch
  without limit, or is content constrained to a readable measure?
- **Stale cached application.** What happens when a returning attendee holds a cached version and a
  newer one has shipped? Versioned caching must resolve this without leaving them stranded on old
  code.
- **First visit while offline.** What happens when nothing has ever been cached and there is no
  connection?
- **Connectivity flapping.** What happens when the connection drops and returns repeatedly — does
  the offline indicator thrash?
- **Reduced motion and zoom.** What happens for an attendee who has requested reduced motion, or
  who zooms text to 200%? Layout must not break and no content may be lost.
- **Missing deployment credentials.** What happens to the pipeline when the preview host
  credentials are absent — does it fail loudly or pass silently? It must not pass silently.
- **Placeholder icons mistaken for final.** What prevents provisional branding from being taken for
  approved branding by a reviewer or the client?

---

## Requirements *(mandatory)*

### Functional Requirements

#### Project foundation

- **FR-001**: The project MUST enforce static type checking, and a change containing a type error
  MUST fail verification.
- **FR-002**: The project MUST commit a dependency lockfile so that any clone and any pipeline run
  resolves an identical dependency set.
- **FR-003**: The production dependency set MUST be derived from actual need. The prototype's
  inherited dependency list MUST NOT be carried forward wholesale.
- **FR-004**: The project MUST provide automated linting and formatting, and a change violating
  either MUST fail verification.
- **FR-005**: The project MUST provide a unit test capability and a component test capability, both
  runnable locally and in the pipeline by documented commands.
- **FR-006**: A contributor MUST be able to install dependencies, run the application locally, and
  execute every verification command from a clean clone using documented commands.

#### Visual language

- **FR-007**: Colours, typography, spacing, and corner radii MUST be defined as named tokens in one
  place. Hardcoded colour literals outside that definition MUST NOT appear in components.
- **FR-008**: The approved palette MUST be expressed through those tokens: deep navy surfaces
  (`#1b2340`), warm coral accents (`#e8634d`), soft cream backgrounds (`#fdf8f3`), white content
  cards, subtle mint status cues (`#5CC9A7`), plus the supporting border (`#efe8e1`), muted
  (`#8f96a8`), and body (`#525a70`) values.
- **FR-009**: A single consistent icon set MUST be adopted and used for interface icons.
  Hand-inlined one-off SVG MUST NOT be used except for genuinely bespoke marks.
- **FR-010**: The shell MUST read as an authenticated attendee workspace and MUST NOT read as a
  marketing page or a generic enterprise dashboard.

#### Application shell

- **FR-011**: The shell MUST present five destinations — Home, Agenda, Discover, Messages, and
  Network — with Home as the initial destination, and MUST allow the attendee to move between them.
  Each destination MUST have its own distinct address, so that it can be opened directly, shared,
  bookmarked, and reached with the browser's Back and Forward controls.

  > **Recorded override.** `GroundZero/requirements.md` — the priority-1 authoritative source —
  > describes a "single-route" demo, and the approved prototype switches destinations through
  > in-memory state with no address change. Addressable routes therefore **contradict the literal
  > wording of the highest-priority source.** This was decided by the project owner on 2026-08-04
  > rather than inferred, which is what Principle I requires. See Open Question 11.

- **FR-011a**: Opening any destination's address directly MUST render that destination as the
  active workspace, with the correct navigation state, without first passing through Home.
- **FR-011b**: An address that matches no destination MUST resolve to a defined outcome rather than
  a blank screen or a raw server error — including when the application is launched offline from
  its cached shell.
- **FR-012**: At desktop widths the shell MUST present a persistent left navigation rail, a
  contextual top bar, and a workspace area capable of multi-column layout.
- **FR-013**: At tablet widths the shell MUST present a reduced navigation rail and a layout
  prepared for two-column cards and stacked detail areas.
- **FR-014**: At mobile widths the shell MUST present a compact header, a bottom navigation bar,
  the capacity for full-width overlays, and touch-sized controls.
- **FR-015**: No content and no primary action may require horizontal scrolling at any supported
  viewport width.
- **FR-016**: Every interactive control MUST expose an accessible name, MUST be operable by
  keyboard, and MUST display a clearly visible focus indicator. Removing the focus indicator
  without an equivalent visible replacement is a defect.
- **FR-017**: The currently active destination MUST be communicated both visually and to assistive
  technology.
- **FR-018**: Each destination MUST render an identifiable region that carries no product content
  in this slice, sufficient for navigation and accessibility verification to target it.

#### Platform capability abstraction

- **FR-019**: The project MUST define and own interfaces for six capabilities: notifications,
  calendar, camera, contact sharing, secure storage, and connectivity.
- **FR-020**: Feature code MUST obtain these capabilities only through those interfaces and MUST
  NOT call browser or native platform APIs directly.
- **FR-021**: Each interface MUST have an initial implementation, which MAY be web-based or a
  well-defined no-op stub, and MUST NOT return undefined or throw for an unimplemented capability.
- **FR-022**: Any interface implementation MUST be substitutable — replacing one MUST take effect
  without modifying feature code.

#### Installable, offline-capable delivery

- **FR-023**: The application MUST be installable to a device home screen, presenting the product
  name and application icons.
- **FR-024**: The product name MUST originate from a single definition that supplies the installed
  name, the document title, and the package identity. The product name is **MyNet**.
- **FR-025**: Application icons MUST be supplied at the sizes required for installation, including
  a maskable variant. In this slice they are provisional placeholders drawn from the approved
  palette and MUST be visibly identifiable as provisional so they cannot be mistaken for approved
  branding.
- **FR-026**: After a first successful visit, the application MUST render its shell when launched
  with no network connection.
- **FR-027**: Cached application assets MUST be versioned such that a newly deployed version
  replaces a stale one rather than leaving a returning attendee permanently on old code.
- **FR-028**: The attendee's connectivity state MUST be communicated explicitly, MUST update when
  connectivity changes without a manual reload, and MUST be sourced through the connectivity
  interface defined in FR-019.
- **FR-029**: Complex data synchronization MUST NOT be implemented. It is barred until persistent
  accounts and a backend are recorded requirements.

#### Automated verification

- **FR-030**: Every proposed change MUST be verified automatically on Linux, with no dependency on
  Apple infrastructure.
- **FR-031**: Verification MUST include all eight checks: type checking, linting, unit tests,
  component tests, accessibility checks, end-to-end browser tests, a production build, and a
  preview deployment.
- **FR-032**: A failing or skipped check MUST be reported explicitly and MUST NOT be silently
  tolerated or reported as success.
- **FR-033**: A change whose verification is not green MUST NOT be merged.
- **FR-034**: A successfully verified change MUST publish a preview of that exact change at a URL a
  reviewer can open without local setup.
- **FR-035**: Accessibility checks MUST run against every destination, and end-to-end checks MUST
  exercise navigation between destinations at more than one viewport size, including entry by
  direct address and traversal using the browser's history controls.

#### Governance

- **FR-036**: All work MUST reach `develop` through a pull request from a branch named
  `<type>/<short-description>`, merged by squash. Direct commits and pushes to `main` and `develop`
  are prohibited.

### Key Entities

- **Destination**: One of the five primary areas of the product — Home, Agenda, Discover, Messages,
  Network. Has a name, an icon, a distinct address, an active/inactive state, and in this slice no
  content.
- **Platform capability service**: A named project-owned contract for a device or browser
  capability, with one interchangeable implementation active at a time.
- **Connectivity state**: Whether the attendee is currently online or offline, observable and
  changing over time, surfaced to the attendee.
- **Cache version**: The identifier distinguishing one deployed set of cached assets from another,
  enabling stale assets to be superseded.
- **Design token**: A named visual value — colour, type, spacing, radius — referenced by components
  instead of a literal.
- **Branding constant**: The single definition of the product name consumed by the installed name,
  the document title, and the package identity.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time viewer can identify the product as an attendee workspace and reach any
  of the five destinations within 10 seconds of first render.
- **SC-002**: The complete navigation journey across all five destinations can be performed using
  only a keyboard, with a visible focus indicator present at 100% of stops.
- **SC-003**: Automated accessibility scanning reports zero critical or serious violations across
  all five destinations, at desktop, tablet, and mobile widths.
- **SC-004**: No horizontal scrolling is required for any content or primary action at any width
  from 320px upward.
- **SC-005**: 100% of platform capability usage in feature code goes through a project-owned
  interface; direct browser or native API calls in feature code number zero.
- **SC-006**: Colour literals appearing outside the token definition number zero.
- **SC-007**: Every proposed change is subject to all eight automated checks before merge, and a
  change that introduces a type error, a lint violation, a failing test, or an accessibility
  regression cannot be merged.
- **SC-008**: A reviewer can open a working preview of any proposed change from the change itself,
  with no local installation.
- **SC-009**: After one prior visit, the application renders its shell with no network connection
  in 100% of attempts, and communicates the offline state unambiguously.
- **SC-010**: The application can be installed to a device home screen on a current mobile browser.
- **SC-011**: A contributor starting from a clean clone can install, run, and verify the project
  using documented commands, with no undocumented manual steps.
- **SC-012**: All five destinations can be opened directly by address and shared as links, and
  browser history traversal keeps the address and the displayed destination consistent in 100% of
  transitions.

---

## Assumptions

Reasonable defaults chosen where the source material was silent. Each is a decision that can be
revisited cheaply; none resolves an item in the Open Questions Register.

- **Stack is pre-decided, not chosen here.** React and TypeScript built as an installable PWA are
  fixed by the constitution's Technology and Architecture Constraints and Principle VI. This
  specification records that constraint rather than selecting it.
- **Preview hosting is pre-decided.** Cloudflare Pages was selected during brainstorming after
  comparing commercial-use terms, private-repository support, build-minute caps, and per-change
  preview support. Recorded, not re-opened here.
- **Destination addresses are readable and stable.** The specific address for each destination is a
  planning detail; that each has one, and that it is shareable, is the requirement.
- **Breakpoint values are unspecified in all source material.** Conventional thresholds are assumed
  and will be fixed during planning. The three named layouts are requirements; the exact pixel
  values at which they switch are not.
- **Destinations render a heading and an empty region.** "Empty" is taken to mean structurally
  present but content-free, not blank, so that accessibility and end-to-end verification have
  something legitimate to target.
- **The required product empty states are out of scope.** The empty and error states mandated by
  the requirements — no search results, no saved sessions, empty thread, no meeting slots, invalid
  input — belong to the destinations that own them and arrive with that content, not here.
- **The notification bell is omitted.** The prototype header shows one, but notifications are listed
  as out of scope in the requirements. The conflict is already in the Open Questions Register;
  this slice omits the control rather than resolving the conflict.
- **Secure storage does not persist in this slice.** Demo scope states that browser reload resets
  state. The secure storage stub therefore holds nothing durably; its real semantics are an open
  question.
- **Service worker updates apply on next launch** rather than interrupting the attendee with a
  reload prompt.
- **A single production locale (English) and no internationalization layer** are assumed, matching
  all existing source material.
- **No analytics, telemetry, or error-reporting service** is introduced. The scope bars external
  services, and none is required to satisfy any requirement here.
- **The attendee persona, greeting, and dates** that are hardcoded in the prototype are not carried
  forward; this slice renders no such content.

---

## Dependencies

- **Cloudflare account plus deployment credentials** configured as repository secrets. This is an
  owner action that cannot be performed from within the repository, and **the preview-deployment
  check cannot pass until it is done** — which by FR-033 means no change can merge until it is done.
- **Local guardrail activation** (`git config core.hooksPath .githooks`) once per clone. Already
  active in the current working clone.
- **Approved visual language** from `GroundZero/prototype/`, used as reference for the palette and
  composition only, never as architecture.

---

## Out of Scope

Explicitly excluded from this slice:

- All destination content — the Home dashboard, agenda list, session detail panel, Discover cards,
  Messages threads, and Network contacts and appointments.
- Sample data of any kind; search and filters; session notes; audience Q&A; digital business card
  sharing; meeting scheduling and appointments.
- Real authentication, any backend, and durable persistence beyond demo scope.
- Organizer administration, which Principle III bars without an amendment.
- Capacitor or any other native wrapper, which Principle VI bars absent a documented trigger.
- The real brand mark and final application icons.
- Complex data synchronization.

---

## Open Questions

Carried forward from `brainstorm/01-foundation-slice.md` and **not resolved by this specification**.
The constitution prohibits resolving a source conflict by assumption, inference, or convenience.

1. **Real brand mark and application icons.** No logo exists anywhere in the repository — the only
   images present are five avatar photographs used as prototype sample data. This slice ships
   visibly provisional placeholders; the client must supply the real mark.
2. **What "PS" denotes** in the repository name `mynet-ps`. Not inferred.
3. **Constitution amendment required** to record the MyNet product-name decision and strike the
   product-name entry from the Open Questions Register, citing the owner decision that resolved it.
4. **Stale product naming.** `GroundZero/requirements.md` and the prototype UI both say "EventLink".
   Requirements is the priority-1 authoritative source, so correcting it is not a casual edit and
   the correction path is undecided.
5. **Abstraction layer shape** — a root-injected registry versus a context provider per service.
   Deferred to `/speckit-plan`, behind the Constitution Check gate.
6. **Secure storage semantics.** Demo scope resets on reload, but the capability's name implies
   durability. The constitution records durable storage as an open question, not a default.
7. **Package manager.** The prototype carries a workspace file pinning Linux/x64+arm64/glibc but no
   lockfile. The production choice is unmade.
8. **Public preview URLs on a private repository.** Cloudflare Pages previews are publicly reachable
   by default, which would expose preview builds of a private client repository unless access
   control is placed in front of them. Undecided.
9. **Desktop and tablet layouts have never been validated by the client.** The approved prototype is
   mobile-only, at a fixed 390×844 frame. This slice creates the first desktop and tablet experience
   this product has ever had, and the client has approved neither.
10. **Server-side branch protection remains unavailable** — private repository on a free personal
    account, with the branch-protection and ruleset APIs returning 403. Enforcement is client-side
    and bypassable. Recorded in the constitution as a known, accepted risk.
11. **Addressable routes override the priority-1 source.** `GroundZero/requirements.md` specifies a
    "single-route" demo; FR-011 specifies five addressable destinations. This was an explicit owner
    decision on 2026-08-04, not an inference — but it means the authoritative requirements document
    is now knowingly out of step with the specification on this point. Whether `requirements.md`
    should be amended, or the divergence simply recorded, is undecided and needs the client. **New
    entry — belongs in the constitution's Open Questions Register.**
