# MyNet Constitution

This document holds the principles every MyNet specification, plan, task list and change is held
to. It is read by `/speckit-plan`, whose **Constitution Check** gate is built from the checklist at
the end of this document; by `/speckit-analyze`, where any conflict with a **MUST** here is
CRITICAL; and by every code review. Rules are numbered so a plan, a review finding or a waiver can
cite exactly one.

It deliberately contains **no history, no open questions and no reasoning essays**. Those live in
companion documents (see Governance), and none of them binds. Where a rule's reason is not obvious
from the rule, one sentence of rationale follows it; the full reasoning behind every rule, as it was
argued when adopted, is preserved in `docs/record/constitution-history.md`.

**Normative language.** MUST / MUST NOT are absolute within this repository; a departure is a
violation that needs a recorded waiver (VII.4) or an amendment. SHOULD admits a departure that is
recorded, with its reason, in the plan's Complexity Tracking table. MAY grants a permission.

## Core Principles

### I. Requirements Define the Product, Not the Delivery Mode

- **I.1** `GroundZero/requirements.md` is authoritative for **WHAT** MyNet is — actors,
  capabilities, destinations, workflows, terminology, visual direction, accessibility and responsive
  obligations, empty and error states, success criteria, and product exclusions. It is **not**
  authoritative for **HOW**: its single-route construction, in-file constants, absence of network,
  storage and authentication, and reset-on-reload describe the prototype's delivery mode and MUST
  NOT be treated as requirements.
- **I.2** Sources MUST be consulted in this order: (1) this constitution; (2) recorded owner and
  client decisions (`docs/governance/decisions.md`); (3) `requirements.md`, read for WHAT; (4) client
  reference images; (5) `GroundZero/prototype/`; (6) existing source code.
- **I.3** A conflict between sources on a WHAT MUST be recorded in `docs/governance/open-questions.md`
  and settled with the client or owner. Resolving it by assumption, inference or convenience is
  prohibited.
- **I.4** No specification, plan or implementation may introduce a capability, data field or
  business rule that is not traceable to an authoritative source or a recorded decision.
- **I.5** A decision already recorded MUST NOT be re-derived or re-litigated inside a feature; a
  feature that believes one is wrong raises it as an open question.

*Rationale*: the client approved a product; the prototype demonstrated it by the cheapest delivery
mode available. Confusing the two imports decisions nobody made.

### II. The Prototype Is Reference, Not Architecture

- **II.1** `GroundZero/prototype/` is an approved **visual and interaction** reference — flows,
  composition, copy, sample-data shape, visual language. Its architecture, file layout, state model,
  dependency list, styling technique and code quality carry no authority and MUST NOT be preserved by
  default.
- **II.2** Every structural decision the prototype embodies MUST be re-decided explicitly, and the
  decision recorded in the feature plan.
- **II.3** Its hardcoded persona and date, missing Escape handling and missing focus states are
  defects to replace, not behaviour to reproduce.

### III. Attendee Experience First

- **III.1** MyNet (`apps/web`) is an **authenticated attendee workspace**. Every feature of it MUST
  be justified by the attendee question it answers, in this order of prominence: *What is happening
  next? Who should I meet? Where are my conversations, notes, and appointments?*
- **III.2** It MUST NOT read as a marketing site or a generic enterprise dashboard. People, sessions
  and time MUST be the strongest visual elements. The first viewport MUST make the product
  understandable without scrolling.
- **III.3** The core journey — inspect the next session → discover a relevant attendee → share a
  card or message them → schedule an appointment — MUST remain completable end to end.
- **III.4** **MyNet MUST NOT contain any administrative capability**: no administrative route,
  screen or navigation entry, no privileged view, and no rendering that branches on who is looking.
  This MUST be asserted by tests as an absence. Promotion to an administrative tier MUST NOT change a
  person's MyNet experience in any observable way.
- **III.5** Administration exists only as a **separate product** (`apps/admin`) against the same API
  and database, under the rules in "Administration".
- **III.6** Payment processing is out of product scope and MUST NOT be built without an amendment.

*Rationale*: keeping MyNet free of administration is what lets a second actor exist without
changing the product the attendee uses.

### IV. Accessibility and Responsiveness Are Non-Negotiable

- **IV.1** Every interactive control MUST have an accessible label, a visible focus state and
  keyboard operability. Removing a focus indicator without an equivalent visible replacement is a
  defect.
- **IV.2** Every modal MUST have a clear close action and dismiss on Escape.
- **IV.3** **Both products** MUST deliver and verify three layouts:
  - **Desktop** — persistent left navigation rail, contextual top bar, multi-column dashboard;
  - **Tablet** — reduced rail, two-column cards, stacked detail;
  - **Mobile** — compact header, bottom navigation, single-column cards, full-width overlays,
    touch-sized controls.
- **IV.4** No content and no primary action may require horizontal scrolling at any supported width,
  **including inside a scroll container** — a layout assertion MUST NOT rely on document-level
  overflow alone.
- **IV.5** Every surface that crosses the network MUST have loading and failure states. These empty
  and invalid states MUST exist: no attendee search results (message + reset-filters action); no
  saved sessions (invitation to explore); empty thread (conversation starter); no meeting slots
  (explanation + close); empty message or meeting topic (**disabled confirmation**, never a
  post-submit error).
- **IV.6** Passing automated gates MUST NOT be cited as evidence that a layout has been reviewed.
  Visual placement is verified by a person looking, or by a test that measures position.
- **IV.7** The shipped desktop and tablet layouts are ratified as intended, including two judgements
  that MUST NOT be reopened as defects: MyNet's icon-only rail versus the administrative site's
  labelled rail at 768–1279px, and Home's two-column cards on an upright tablet.

### V. Abstraction Before Platform, Vendor and Data APIs

- **V.1** Feature and presentation code MUST NOT call browser or device APIs directly. It uses the
  project's device capabilities, of which there are exactly **eight** — `NotificationService`,
  `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`,
  `ConnectivityService`, `VisibilityService`, `InstallService` — plus the platform capability
  `StorageService` for binary content. Adding a ninth MUST be done by amending this list.
- **V.2** An interface MUST model every platform's behaviour as first-class; a platform that lacks
  an API (e.g. install on iOS Safari) is a different case, not a failure, and the type SHOULD make an
  unavailable action unrepresentable rather than merely disabled.
- **V.3** Feature and presentation code MUST NOT call the network, build requests or know transport,
  serialisation or caching details. Data is reached only through repository interfaces in domain
  terms, and swapping an implementation MUST NOT require feature changes.
- **V.4** Every external vendor SDK MUST sit behind a vendor-free port and be confined by lint to its
  adapter directory (storage, notifications, mail). The adapter MUST be selected **by configuration
  alone, identically in every environment** — credentials present selects the real adapter, absent
  selects a recording sink — so a local run exercises the production path. Push delivery goes
  through `NotificationService` over a domain shape, never the browser's `PushSubscription` type.
- **V.5** A new device, platform, vendor or network surface MUST be introduced behind its interface
  in the same change. A direct platform or network call from feature code fails the Constitution
  Check and MUST be refactored or justified in Complexity Tracking; a lint exemption for one MUST be
  per-line with a stated reason, never per-file.

*Rationale*: the device boundary makes a native move a packaging change; the data boundary keeps a
real API from leaking into every component.

### VI. Web-First Delivery, Offline by Declaration

- **VI.1** MyNet MUST be an installable PWA: manifest, icons, offline shell, versioned caching and
  explicit online/offline states. The administrative site is not bound by this, and its
  specification MUST declare that absence.
- **VI.2** Offline behaviour MUST be specified per feature: what is readable offline, what is not,
  and what happens to an action attempted offline. Every cached surface MUST show when its data was
  retrieved.
- **VI.3** **Writes are refused offline, never queued.** Optimistic updates and conflict resolution
  MUST NOT be introduced without a recorded decision naming their conflict semantics.
- **VI.4** What may be cached on the client, and for how long, MUST be specified per feature.
  Caching of repository reads happens in the caching decorator at the repository boundary, keyed by
  attendee, conference and resource; the lifetime is 24 hours from retrieval (whether that span is
  right is deferred). A read that must stay live MUST be declared (`passThrough`), and a deliberately
  uncached repository MUST declare the refusal — Discover, Messages and Q&A are declared uncached,
  and caching any of them needs a decision.
- **VI.4a** A cached conference MAY outlive a withdrawn registration for up to the lifetime; that
  residual is accepted **only because no third party can end a registration** (see P.38). The
  earlier ground — that the cached data is not other people's personal data — is false and MUST NOT
  be restated. Two mitigations are licensed: deleting an entry when it expires, and erasing, from the
  composition root, any cached conference absent from a successful read of the attendee's
  registered conferences. Three are rejected on evidence and MUST NOT be re-proposed without new
  facts: purging on a refusal, a server-sent instruction to forget, and keying the copy to the
  registration.
- **VI.5** A native wrapper (Capacitor) MUST NOT be adopted unless one trigger is documented: App
  Store distribution becomes mandatory; a required capability is inadequate on the web; or field
  testing shows PWA installation materially harms adoption. Then: Codemagic or Bitrise, TestFlight,
  Play internal testing. Xamarin and Unity are not permitted.
- **VI.6** At least one **physical iPhone** MUST be exercised — installation, safe areas, keyboard,
  gestures, permissions, WebView behaviour and notification delivery — before any production release.

### VII. Verified on Linux CI

- **VII.1** Every change MUST pass an automated Linux pipeline, with no Apple infrastructure, covering
  both products and the API: typecheck, lint, unit, component, API contract, migration verification,
  integration tests against a real PostgreSQL, accessibility, end-to-end browser tests on Chromium,
  WebKit and Firefox, the production build, and the build-output audit.
- **VII.2** Completion MUST be claimed from pipeline output, never from inspection. Failing or
  skipped checks MUST be reported explicitly.
- **VII.3** **A check that did not run has not passed.** A test that skips because an artifact is
  absent in its layer is a defect; a missing build artifact where one is expected is a failure.
- **VII.4** Merging with a required check failing, skipped, cancelled or never started is a
  governance breach unless the PR carries a **recorded waiver** naming the checks, why the merge
  could not wait, and who accepted the risk. An unwaived breach MUST be recorded as an open question
  and closed before the next feature merges.
- **VII.5** No check may be weakened, disabled or made non-blocking to get a change through. A check
  producing false positives MUST be **narrowed to the population its requirement is about**, and the
  narrowing recorded in the feature's deviations.
- **VII.6** A change reaches a deployed environment (UAT) before production. Per-change preview
  deployments are not required.
- **VII.7** The whole-product validation checklist — production build; desktop and mobile rendering;
  navigation and event switching; search and filter; session save, notes and Q&A; message
  composition; card-sharing feedback; meeting scheduling and appointment creation; keyboard focus
  visibility and accessible labels — is satisfied incrementally. Each feature MUST state which items
  it discharges, and no item may be quietly dropped.
- **VII.8** A feature's by-hand validation (its `quickstart.md`) MUST be walked by a person before
  the feature is called validated. A feature that merges without the walk MUST record it as
  outstanding, and outstanding walks MUST be discharged before a production release.

### VIII. Attendee Data Is Personal Data

- **VIII.1** Every record belonging to an attendee MUST be attributable to exactly one identity, and
  every read path MUST be scoped by that identity. No "one known user" shortcut, in any environment.
- **VIII.2** Authorization MUST be enforced server-side, as a predicate the server constructs — never
  a claim the client presents and never client-side filtering. An endpoint MUST refuse what it may
  not return, whatever the client asked for.
- **VIII.3** Secrets MUST live only in server-side configuration: never in a client bundle, the
  repository or seed data. The repository is public.
- **VIII.4** Only fields a requirement names may be collected.
- **VIII.5** **Private content stays private.** Messages, notes and appointments are visible only to
  their participants. There are exactly **four** recorded exceptions, and a fifth needs an
  amendment; an exception MUST be recorded here, never derived from another rule:
  1. An attendee's **profile** is visible to attendees registered for the same conference, and the
     attendee MUST be able to withdraw from that visibility (discoverability) without deleting
     their account.
  2. An **approved audience question** is visible to every attendee registered for its conference,
     attributed to its asker, with no opt-out, including for a non-discoverable asker (see
     "Audience questions").
  3. A **reported message and the reporter's reason** are visible to a platform operator, only in
     the report queue, only for what was reported, and the reporter is told nothing.
  4. The **names of attendees enrolled in an optional session** are visible to an organizer assigned
     to that conference (and to a platform operator, by its product-wide authority), only for that
     conference's sessions, and the attendee is told before enrolling. A route granting it MUST be
     addressed and named so its scope is legible. No saved session, note, question or vote is
     disclosed to any administrative tier.
- **VIII.6** **Deletion is self-serve, hard and cascading**: an attendee MUST be able to delete their
  own account without an intermediary, removing every record attributable to them, with no soft
  delete and no tombstone. No role, assignment or other person may make deletion conditional.
- **VIII.7** **Export is self-serve and machine-readable** and MUST cover every collected field about
  the requesting attendee. A field collected but not exported is a defect.
- **VIII.8** A personal-data record no cascade can reach MUST expire on a stated retention clock.
- **VIII.9** Every new table or column holding personal data MUST be covered by deletion, export and
  retention **in the change that introduces it**; the schema-derived coverage tests enforce this and
  an allow-list entry MUST state why; a coverage gap a feature cannot close MUST be recorded as an
  open question, never passed over. Records about people who are not attendees (operators,
  speakers) MUST have their deletion, export and retention answered explicitly, not inherited.
- **VIII.10** A refusal that would disclose another person's existence, presence or relationship
  MUST be indistinguishable from not-found. A refusal MAY carry a reason only when that reason is
  about the reader themselves.

### IX. Every Feature Declares Its Own Completeness

- **IX.1** Every specification MUST carry a **Feature Declarations** section (in
  `.specify/templates/spec-template.md`) answering each of:
  **actor and tier**; **administrative counterpart** for each capability added to MyNet (exists /
  built here / none, because…); **offline behaviour**; **three layouts** (per product touched);
  **empty, loading and failure states**; **accessibility**; **validation checklist items
  discharged**; **identity scoping and server-side authorization**; **event scoping** of every new
  table (per-event or cross-event, and why); **deletion, export and retention coverage**; **open
  questions** it depends on, resolves or opens; and **migration number**.
- **IX.2** An obligation not declared is presumed unmet. "Not applicable, because…" is a valid
  declaration; silence is not. A specification without the section MUST be returned, not planned.
- **IX.3** Each declared obligation MUST trace to at least one task, and a feature MUST NOT be marked
  complete while any is outstanding.
- **IX.4** No obligation may be deferred to a later "polish" or "hardening" pass; such a pass is
  legitimate only as verification of work already done.

### X. Invariants Are Enforced, Not Asserted

- **X.1** Every invariant this constitution or a feature establishes SHOULD have an automated guard
  that fails when it is broken; a MUST that no test can express MUST be named in the feature's
  quickstart for by-hand verification.
- **X.2** **Absences are requirements and MUST be tested as absences** (no admin surface in MyNet,
  no report-reading surface in MyNet, no bell, no third notification trigger, no attendee
  restriction route). Absence guards MUST strip comments before matching.
- **X.3** A guard over an open-ended set MUST fail **by existing**: its expectations are derived from
  the source of the set (schema, route table, manifest, enumerated constant), so a new member fails
  until it is classified. A CHECK constraint over an enumerated set MUST be derived from that set's
  source, never hand-copied, and an inventory read in two places MUST be derived in both.
- **X.4** **A comment that asserts behaviour is a claim that needs a guard.** A header stating a call
  relationship, a transaction boundary or a caller MUST be true and SHOULD be tested; a false header
  is a defect of the same severity as the behaviour it misdescribes.
- **X.5** Refusals MUST carry a distinct machine-readable code per distinct explanation, clients MUST
  classify on the code (never on the error class), and a test MUST assert the codes of one surface
  are mutually different.
- **X.6** A test double MUST have the shape of what it replaces (private fields, real constraints,
  real transactions) — a double that cannot fail the way production fails proves nothing.
- **X.7** A requirement whose subject is prose or copy MUST be verified by reading that prose, never
  by searching for the requirement's number.

## Product Rules

Binding across features. A feature departing from one needs an amendment.

### Scope

- **P.1** In scope: the five destinations (Home, Agenda, Discover, Messages, Network), each
  individually addressable; transactional account mail (verification and password reset only); the
  administrative product; engagement notifications within "Notifications".
- **P.2** Out of scope until an amendment brings them in: payment processing (including
  payment-gated access); calendar integration (`CalendarService` exists and MUST NOT be wired).
  Networking outside an event is undecided, pending the client's legal review, and MUST NOT be built
  without a decision.
- **P.3** Saved sessions, notes, Q&A, conversations, cards and appointments are durable, per-attendee,
  server-side state.

### Conferences, content and scoping

- **P.4** **Event scoping is hybrid.** Conference content — sessions, tracks, rooms, speakers, the
  directory, appointments and meeting slots — is per-event and swaps on switch. Relationships —
  contacts, exchanged cards, conversations — persist across events. **Every new table MUST declare
  which rule applies and why.** The event predicate is enforced server-side; a per-event route MUST
  name its conference in its address (`/events/:eventId/…`) so the route audit reaches it.
- **P.5** **One class of conference.** Seeded and authored conferences are identical; nothing is
  privileged or immutable, and no control renders for a conference it cannot act on. The seed is the
  development and test fixture and MUST keep its two fully disjoint programmes and its deliberately
  empty third conference.
- **P.6** **Conference content is live-edited.** There is no draft/publish lifecycle.
- **P.7** **A session any attendee has engaged with — saved it, written a note, asked or voted on a
  question — MAY be cancelled and MUST NOT be deleted.** Cancellation is stored state and leaves
  attendee state intact. The engagement check MUST run under a lock inside the deleting transaction.
  An **enrolment is not engagement**: a session with places held MAY be deleted, silently, and a
  later feature MUST NOT cite this as precedent for narrowing the four.
- **P.8** **Home is composed, not aggregated**: independent cards registered in one registry, each
  owning its loading, empty and failure states; a failing card MUST NOT blank Home; no card depends
  on another; a feature adds a card rather than editing one.
- **P.9** Contribution surfaces used by more than one feature (Home cards, destinations, route
  registration, repository interfaces, the seed, card actions) MUST be append-only registries, each contribution in
  its own file.

### Identity and profile

- **P.10** A person becomes an attendee only by **signing themselves up** (email, display name,
  password) and joins a conference with its **access code**. Email is unique product-wide — across
  attendees **and** operators — and a clash MUST produce the same refusal whichever table holds it.
- **P.11** **Each attendee authors their own profile and no one else's. No administrative tier may
  edit any profile.** A speaker record is conference content and never a route to a profile.
- **P.12** **One visibility decision per attendee**: the discoverability toggle. No feature may give
  an individual field its own audience.
- **P.13** **Verification gates exactly one thing — discoverability.** No feature may use it for
  anything else.
- **P.14** Avatars are uploaded; resizing and **EXIF stripping are mandatory**; bytes go through
  `StorageService`. Photographs of real people MUST NOT ship as seeded faces.
- **P.15** Throttling is per action. The password-reset request MAY delay but MUST NOT deny, because
  an identifier-keyed denial harms only the victim.

### Networking

- **P.16** **A contact is someone whose digital business card you hold.** There is no connect verb
  and no accept step. Contacts MUST NOT be derived from conversations or appointments.
- **P.17** **Sharing a card is a mutual exchange**: one act writes both parties' records in one
  transaction, or neither, under a guard evaluated once. The recipient MUST be discoverable at the
  moment of sharing (decided by 016, FR-1053).
- **P.18** The stored record is the exchange (sharer, recipient, instant, event). A held card MUST
  resolve the sharer's **live** profile — never a snapshot — and resolution MUST NOT apply
  discoverability, verification or shared-registration conditions. A card cannot be recalled.
  Authorization to resolve is directional: it is granted by the reader holding a row **from** the
  named attendee.
- **P.19** **An appointment is proposed, then accepted or declined**, over a slot grid. Offered
  availability MUST be a function of the reader's own commitments alone and MUST disclose nothing
  about the invitee; a received proposal consumes nothing; double-booking is refused at acceptance,
  with a reason, because it describes the reader's own diary.
- **P.20** **Blocking** suspends rather than destroys: it severs card resolution both ways
  (read-side, so unblocking restores it) and deletes no card; it also cancels live
  appointments between the pair (by a write, not restored on unblock), prevents scheduling, and makes
  the pair invisible to each other in Q&A. Withdrawing from a conference cancels the attendee's live
  appointments there in the same transaction.

### Messages

- **P.21** A conversation is 1:1, private to its participants, cross-event and permanent once
  opened; any two attendees sharing a current conference may open one with no request or acceptance.
- **P.22** Messages have no edit, delete, read receipt, delivery tick, typing indicator or presence.
- **P.23** Deleting an account removes its messages from every conversation; the survivor keeps a
  read-only thread with no identifying counterpart.

### Audience questions

- **P.24** A question is **moderated before it is public**: submit → moderate → publish → vote, and
  votes are only cast on published questions. A moderator (an organizer of that conference, or a
  platform operator) MUST be able to approve, refuse, remove, mark resolved or pending, and group
  duplicates by hand; automatic grouping is not required. Pending state survives the event. A projectable view shows approved questions in vote order
  and MUST NOT be a role-dependent mode of MyNet.
- **P.25** A published question is attributed as **first name plus surname initial ("Ana R.")**
  wherever it is displayed. The system MUST retain the true author. Attribution MUST NOT consult
  verification, MUST NOT link to the author's profile, and the attendee MUST be told what will be
  published before they submit.
- **P.26** The abbreviated attribution MUST NOT ship while any lookup lets a reader convert it into a
  full identity without rate limit; the unthrottled block lookup MUST be closed in the same feature.
- **P.27** Moderation does not replace reporting: a published question MUST remain reportable from
  the question itself.
- **P.28** Questions and votes are personal data. A refused question is stored personal data and MUST
  be covered by deletion, export and retention. A departing attendee's questions are removed, and
  everybody's votes on them with them. Vote counts are computed at read time, never stored.

### Notifications

- **P.29** **There are exactly two notification triggers**: (1) a received message; (2) a material
  change — **cancelled, start time changed, or room changed**, and nothing else — to a session the
  attendee has saved or holds a place in, coalesced to one notification per attendee per organizer
  act. **A session starting is not a trigger**, and nothing time-driven may dispatch. A third
  trigger needs an amendment and an edit to the trigger guard in the same change.
- **P.30** **No notification bell and no in-app notification centre.** A changed session is marked
  on its own row; no view in either product may present a count of changes, and activating a
  notification lands on the destination carrying the markers. A count of *remaining places* in one
  session is permitted.
- **P.31** Permission is requested only after it has been explained, by one component, and **denial
  is a complete outcome**: every surface works identically without it.
- **P.32** Subscriptions are per device, keyed on the endpoint alone and reassigned to whoever
  re-registers. Signing out MUST NOT revoke one; revoking permission and a permanent delivery
  failure MUST; a transient failure MUST NOT. The keys are excluded from the export — the device and
  its timestamps are exported, the credentials are not.
- **P.33** One VAPID pair per environment, held as an environment secret and injected at deploy; it
  MUST NOT be rotated except on compromise, and a rotation MUST be planned as a delivery outage.

### Reporting

- **P.34** Reporting blocks in the same action. A report leaves MyNet as operator mail carrying
  identifiers and a timestamp only — never message text, never the reason — and is readable from
  nowhere inside MyNet. A dispatch failure MUST NOT fail the report or the block and MUST be logged.
  Reports go to `apps@programasemilla.com`.
- **P.35** The reporter is promised nothing further: no case identifier, no status, nothing to poll.

### Administration

- **P.36** There are exactly two administrative tiers, and **neither is reachable by self sign-up**.
  A **platform operator** is seeded with **no credential** (issued out of band), holds product-wide
  authority, and is the only tier that promotes attendees or reads reports. A **conference organizer**
  is a promoted attendee whose authority reaches only conferences they are assigned — plus any
  conference they create, to which they are assigned on creation; creating is not a promotion path.
- **P.37** Administrative authority MUST be a server-constructed scope refined by tier at the type
  level, so a lower tier's scope cannot be used where a higher tier's is required.
- **P.38** An administrator acts on content and on authority, **never on a person**: no route
  suspends, removes or restricts an attendee, and every administrative write MUST be classified by a
  guard that fails for an unclassified one. **If any route lets a third party end an attendee's
  registration, VI.4a's cached residual is no longer accepted** and needs a decision.
- **P.39** Every administrative act and its audit entry commit in one transaction. Reading one report
  writes an audit entry; reading the queue does not. There is no read path over the audit trail.
- **P.40** The report queue renders *content unavailable* as a first-class state; reported ids are
  not a foreign key.
- **P.41** An organizer's authority ends with their access: deleting the account revokes every
  assignment and withdrawing from a conference revokes that one, in the same transaction. A
  conference with no organizer is explicitly **unassigned** and visible to platform operators.
- **P.42** The administrative product is bound by Principles IV, V (data half), VII, VIII and IX
  exactly as MyNet is, and takes no dependency on MyNet's platform package.

### Brand

- **P.43** Every brand asset MUST derive from a tracked source by a readable script that fails
  loudly on an unexpected input: `assets/brand/logo.png` for every in-app mark, and
  `assets/brand/new-logo.png` for install icons and favicons only. Two marks coexisting is knowingly
  accepted; no feature may replace one with the other. A source with alpha has no mechanical plate
  colour, so the plate colour chosen for it MUST be recorded where it is defined.
- **P.44** The mark ships as an image beside the live product-name text, never as a raster lockup and
  never replacing an accessible name. Colourway is chosen per surface.
- **P.45** No asset is upscaled, except one named exception (this source, this factor, these outputs,
  checked for equality). A declared icon with no file MUST fail the build. Assets the installed
  application never shows MUST NOT be precached, and install weight MUST be recorded by hand.
- **P.46** Brand navy and coral are identity constants measured from the board and do not move with
  the design tokens; every other colour is a token. No feature may repaint a token to adopt the brand
  values — that is an open question, and it repaints the whole product.

## Architecture and Deployment Constraints

- **A.1** Client: React + TypeScript with type checking enforced. Backend: a project-owned API over
  **PostgreSQL**; the API contract is owned by this project and committed as generated OpenAPI.
- **A.2** Schema changes MUST be versioned, reviewed migrations verified in CI before reaching any
  environment with data. Ad-hoc changes to a live database are prohibited. A migration MUST NOT be
  edited or regenerated once applied anywhere, and MUST NOT be renamed to resolve a conflict.
  Numbers are claimed when the migration is generated, and the claiming change MUST extend the
  roadmap's number table.
- **A.3** Generated artifacts (the contract, migration snapshots) MUST never be hand-merged: take one
  side and regenerate.
- **A.4** Authentication is real: sessions are established and validated server-side.
- **A.5** Every interactive write that serialises on a row (enrolment, question withdrawal, card
  exchange, session deletion) MUST take its lock inside the transaction that acts on it; a lock taken
  through the connection pool, outside a transaction, protects nothing. Request connections MUST
  carry `lock_timeout` below `statement_timeout`, plus an idle-in-transaction timeout.
- **A.6** Server state and client state MUST be distinguishable; server-derived data MUST NOT be
  duplicated into client state that can diverge. `SecureStorage` MUST NOT be used as a general cache.
- **A.7** Production dependencies are derived from actual need, never copied from the prototype; a
  lockfile is committed.
- **A.8** Colours, typography, spacing and radii are named design tokens defined in one place; hex
  literals in components are prohibited. The palette is deep navy surfaces, warm coral accents, soft
  cream backgrounds, white content cards and subtle mint status cues. One icon set is used; one-off
  inline SVG only for bespoke marks.
- **A.9** **Two isolated environments**, `uat` and `prod`, each with its own host, database, secrets
  and address, such that a deployment, runaway query or resource exhaustion in one cannot affect the
  other, on Azure subscription `d428f98f-a3c4-49c3-ae24-06ec3de08477` (`centralus`), which every
  script MUST pin by id.
- **A.10** **UAT MUST NOT be connected to real attendee data.** It carries seeded data only and is
  openly reachable at `mynet-dev.programasemilla.com` — access MUST NOT be restricted by credential,
  allowlist or network boundary, because each would disable the validation UAT exists for — and
  deployment tooling MUST refuse, not merely
  be configured not, to point it at production data. A production domain MUST NOT be committed until
  registered.
- **A.11** **UAT and production MUST be separate registrable domains.**
- **A.12** **Each product is served from one origin**, client and `/api/*` together, which is what
  keeps `SameSite=Lax` a CSRF defence. The administrative site is a **subdomain** of the same
  registrable domain (same-site, different-origin) with a **host-only** session cookie, so one person
  signed into both holds two independent sessions. A topology that splits client and API MUST NOT
  ship without a synchroniser-token defence.
- **A.13** Every environment serves TLS with an automatically renewed public certificate. The
  database MUST NOT be reachable from outside its host. Deployment gates on readiness, which checks
  the database; liveness does not.
- **A.14** Production is backed up at least daily, automatically, with a written schedule, retention
  and restore procedure; backups MUST be copied off the host before local pruning; the restore MUST
  have been performed successfully, from off-host artifacts, before production holds real data.
- **A.15** A written rollback procedure MUST state what happens when the schema is ahead of the
  application.

## Development Workflow and Quality Gates

- **W.1** Work follows the Spec Kit flow — specify → clarify → plan → tasks → implement — and
  implementation MUST NOT begin before a feature's spec and plan exist.
- **W.2** `main` and `develop` are protected; nothing is committed or pushed to either directly.
  Every change, including this constitution, reaches them by pull request from a
  `<type>/<short-description>` branch off `develop`, squash-merged, the branch deleted. `develop` →
  `main` is a pull request. Force-pushing to or deleting `main` or `develop` is prohibited. A PR MUST
  NOT merge with required checks failing (VII.4). Every clone activates `.githooks`; server-side
  branch protection MUST be configured. Each clone used for integration testing has its own database.
- **W.3** Before claiming any shared number — constitution version, decision, open question,
  feature, migration, brainstorm — every branch in flight MUST be checked for it.
- **W.4** A feature departing from the delivery roadmap in scope, dependencies or numbering MUST say
  so in its specification.
- **W.5** Any ambiguity found mid-feature MUST be recorded as an open question; work that depends on
  it states its assumption or stops.
- **W.6** A feature touching UI MUST produce tasks for accessibility and for each layout; a feature
  storing or reading attendee data MUST produce tasks for identity scoping, server-side
  authorization, deletion, export and migration verification.
- **W.7** Every feature ends with a review against this constitution whose findings, and the fate of
  each, are recorded in `specs/<feature>/review-findings.md`; deliberate departures from the spec are
  recorded in `deviations.md`.

### Constitution Check (for `/speckit-plan`)

A plan MUST answer every item before Phase 0 and again after Phase 1. A "no" is recorded in
Complexity Tracking with the simpler alternative and why it was rejected, or the plan is revised.

1. Is every capability, field and rule traceable to a source or recorded decision, with no open
   question silently resolved? (I.3–I.5)
2. Does MyNet stay free of any administrative surface or role-dependent rendering, and is the
   administrative counterpart declared? (III.4, IX.1)
3. Are all three layouts, keyboard, focus, Escape and the loading/empty/failure states planned for
   every product touched, with a layout assertion that measures position? (IV)
4. Does all platform, vendor and network access go through a declared interface, with no new
   capability outside V.1's list? (V)
5. Is offline behaviour declared per surface, writes refused rather than queued, and every cached or
   deliberately uncached read declared? (VI.2–VI.4)
6. Does every new table declare event scoping, identity scoping, deletion, export and retention, and
   is authorization a server-constructed scope? (P.4, VIII)
7. Does any refusal disclose another person's existence, and does each refusal carry a distinct
   code? (VIII.10, X.5)
8. Is every invariant and absence this feature relies on or creates guarded by a test that fails by
   existing, and is every behavioural header true? (X)
9. Does anything widen a bounded set — notification triggers, privacy exceptions, device
   capabilities, engagement, administrative capability over a person? If so, which amendment
   licenses it? (P.29, VIII.5, V.1, P.7, P.38)
10. Is every row lock taken inside the transaction that acts on it? (A.5)
11. Is the migration number claimed at generation and checked against every branch in flight?
    (A.2, W.3)
12. Which validation-checklist items and quickstart scenarios does the feature discharge, and who
    walks them? (VII.7, VII.8)

## Governance

- **G.1** This constitution supersedes every other practice, convention, template and tool default in
  this repository. Where anything conflicts with it, it wins.
- **G.2** **Amendment**: a pull request changing this file, ratified by the project owner merging
  it, whose description gives the rationale, the version bump and its reasoning, and — where existing
  work is invalidated — a migration note. The PR description is the Sync Impact Report; it is not
  committed into this file. On merge, the amendment's summary is prepended to
  `docs/record/constitution-history.md`.
- **G.3** **Versioning** (semantic): MAJOR — a principle or rule removed or redefined incompatibly, a
  delivered requirement withdrawn, or governance changed; MINOR — a principle, rule or section added
  or materially expanded, including narrowing a delivered requirement; PATCH — wording with no
  change in meaning.
- **G.4** **Compliance**: every plan passes the Constitution Check; `/speckit-analyze` treats any
  conflict with a MUST as CRITICAL; every code review checks Principles III, IV, V, VII, VIII, IX
  and X specifically, because a passing build can still violate them. Unjustified complexity blocks
  review.
- **G.5** **Companion documents** — records, not governance; none can override this constitution:
  - `docs/governance/decisions.md` — the numbered log of owner and client decisions, with their
    reasoning. Decisions rank directly below this constitution (I.2) and cannot override it; a
    decision that changes a rule here is also an amendment.
  - `docs/governance/open-questions.md` — the register of undecided matters. Adding an entry is
    always permitted; closing one requires a recorded owner decision, and the decision (and any
    amendment) MUST cite the entry it closes. A feature blocked on an entry MUST say so.
  - `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` — the delivery plan.
  - `docs/record/` — frozen history: every prior version's text and reasoning.
  - `CLAUDE.md` — runtime guidance for AI-assisted sessions. It MUST stay consistent with this
    document and MUST NOT carry plans, session tasks, progress updates or invented requirements.

**Version**: 6.0.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-09-24
