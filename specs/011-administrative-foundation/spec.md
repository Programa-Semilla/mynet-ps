# Feature Specification: Administrative Foundation — the Second Actor, the Admin Site, and the Report Queue

**Feature**: 011
**Created**: 2026-08-11
**Status**: Draft
**Constitution**: v4.1.0 (standing decisions 31–39)
**Brainstorm**: `brainstorm/09-administrative-product.md`
**Reserved migration**: `0009`

## Context and Scope Note

### This is the first feature of a second programme

The delivery roadmap decomposes the **attendee** product, and that decomposition is complete: 001–010
are shipped and every destination `requirements.md` names answers its question. This feature opens a
second programme — 011, 012, 013 — which the roadmap does not cover and is not extended to cover.

It is also the first feature in this project built on a **reversed prohibition** rather than a filled
omission. Constitution **v4.0.0** retracted Principle III's *"the attendee is the only actor in
scope"*, lifted the administration exclusion that had stood since 1.0.0, and retracted delivered
requirements FR-132, FR-134, FR-191, FR-311 and — for the administrative product only — FR-548.
**v4.1.0** then closed the three entries v4.0.0 opened. Both were ratified on 2026-08-11.

### What forced the reversal, and why it matters to this feature's shape

The reversal was not sought for its own sake, and 011's priorities follow directly from what forced
it. The product had accumulated three obligations it had no actor to discharge:

- **Register entry 19** (open since 2026-08-07) — nobody moderates an uploaded avatar, and the
  constitution's own note says the organizer-administration exclusion "is precisely what forecloses
  the usual answer".
- **Register entry 21** (open since 2026-08-08) — the reporting dialog tells an attendee a person
  will read their report. **That sentence is not yet true.**
- **009's own record** — a public Q&A surface "needs a moderator, and a moderator is an organizer —
  the actor Principle III excludes by construction".

This is why **the report queue ships in the foundation feature rather than after it.** Reports are
already arriving from 007 and 009 with nowhere to go. A foundation that only authenticated an
operator would leave the product's one broken promise broken for another two features.

### What v4.1.0 settled, and what it left open

Settled, and binding on this feature (standing decisions 37–39):

- **Topology** — a subdomain of the same registrable domain, `/api/*` served under it, host-only
  session cookie, two independent sessions.
- **Queue disclosure** — reported content *and* the reporter's stated reason, platform tier only.
  The **third** recorded Principle VIII exception.
- **Organizer lifecycle** — assignments revoked in the same transaction as deletion and as
  withdrawal; a conference with no organizer is visibly `unassigned`.

**Still open, and this feature must not close them by inference**: register entry **19** (what
standard an avatar is moderated against) and entry **21** (who the operator actually is). v4.1.0
decided what an operator may *see*; it appointed nobody and set no standard.

### The scope line inside moderation, and why it falls here

This feature gives an operator exactly one **enforcement** action: **removing a reported audience
question**. The line is drawn there for a reason rather than for size:

- A question is **already public** to every attendee at the event (v3.3.0's exception, no opt-out).
  Removal is therefore the only act that stops exposure that is *ongoing*.
- A reported **message** needs no enforcement here, because the protective act already happened:
  reporting blocks in the same action (decision 23). An operator reading a message report is
  adjudicating after the fact, not interrupting harm.
- **Suspending or removing an attendee** is attendee management and belongs to **013**.
- **Avatar moderation** is register entry 19, whose *standard* is undecided. Building the action
  before the standard would decide the standard by inference.

### What this feature does not do

- No conference content authoring — no create, edit or delete of events, sessions, tracks, rooms or
  speakers. That is **012**, and the guards forbidding it stay in force until then.
- No join-code creation, rotation or revocation, no registration list, no attendee suspension. That
  is **013**, and FR-311's guard stays in force.
- No change to MyNet whatsoever. Not one route, screen, navigation entry or rendering branch.
- No avatar moderation, no automated classification, no appeal process.
- No notification of any kind. The trigger set stays at a received message and nothing else.
- No reporter-facing status, case identifier, or anything to poll.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A platform operator signs in, and the second actor exists (Priority: P1)

A platform operator opens the administrative site at its own address and signs in with credentials
that exist independently of any attendee account. They arrive at an administrative home that names
who they are and what tier they hold.

**Why this priority**: Nothing else in this feature or the two after it is reachable without it. It
is also what proves the topology decision works end to end — the failure this replaces is 3.0.0's,
where a split origin meant the cookie was never sent and **nobody could sign in at all**.

**Independent test**: Seed a platform operator; sign in at the administrative address; confirm an
administrative session is established, that it is a *different* session from any attendee session
held in the same browser, and that signing out of one leaves the other signed in.

**Acceptance scenarios**:

1. **Given** a seeded platform operator, **when** they sign in at the administrative address, **then**
   they reach an administrative home identifying them by name and naming their tier.
2. **Given** a person signed into MyNet as an attendee in the same browser, **when** they sign into
   the administrative site as a platform operator, **then** both sessions exist independently.
3. **Given** both sessions exist, **when** they sign out of the administrative site, **then** the
   attendee session is untouched — and the reverse also holds.
4. **Given** valid attendee credentials for an attendee who has **not** been promoted, **when** they
   are presented at the administrative site, **then** sign-in is refused with the same wording as
   any other failure.
5. **Given** no session, **when** any administrative address is opened directly, **then** it refuses
   and offers sign-in, disclosing nothing about what exists behind it.

---

### User Story 2 - An operator reads the report queue and the promise becomes true (Priority: P1)

A platform operator opens the report queue, reads the reports attendees have filed — the reported
content, the reporter's stated reason, the identifiers and the time — and records what they did
about each.

**Why this priority**: This is the obligation that forced the amendment. The reporting dialog has
been promising a human reader since 007 shipped; this is the change that makes the sentence true.

**Independent test**: File reports from both 007 (a conversation) and 009 (a question) as attendees;
sign in as a platform operator; confirm both appear with their content and reason, and that
recording an outcome removes them from the open queue without telling the reporter anything.

**Acceptance scenarios**:

1. **Given** reports exist, **when** a platform operator opens the queue, **then** they see each
   report's reporter, subject, time, stated reason, and the reported content.
2. **Given** a report whose reported messages have since been deleted, **when** it is opened, **then**
   the content area states plainly that the content is no longer available — **not** an error, and
   **not** an empty report.
3. **Given** an open report, **when** the operator records an outcome and an internal note, **then**
   it leaves the open queue and remains readable in a resolved view.
4. **Given** any report, **when** it is resolved by any route, **then** the reporter is told nothing,
   and no surface anywhere in MyNet reflects that it happened.
5. **Given** a signed-in **conference organizer**, **when** they attempt to reach the queue by any
   address, **then** it refuses — reports are platform tier only.

---

### User Story 3 - An operator removes an abusive question (Priority: P1)

A platform operator reviewing a reported audience question removes it. It disappears for every
attendee at that event, and the votes cast on it go with it.

**Why this priority**: Q&A is the product's only unmoderated many-to-many surface, and a question is
public with no opt-out. Removal is the only act in this feature that stops exposure already
happening — the queue without it is a notification, not moderation.

**Independent test**: Publish a question as one attendee, upvote it as another, report it as a third;
remove it as a platform operator; confirm it is gone for all three and the vote count reflects no
trace of it.

**Acceptance scenarios**:

1. **Given** a reported question, **when** a platform operator removes it, **then** it is no longer
   visible to any attendee at that event.
2. **Given** a question with votes from several attendees, **when** it is removed, **then** those
   votes are removed with it and no other question's count changes.
3. **Given** a removed question, **when** its author opens the session panel, **then** it is absent,
   and they are not told who removed it or why.
4. **Given** a reported **message**, **when** the operator reviews it, **then** **no** removal action
   is offered — the block already happened, and message removal is not in this feature.
5. **Given** a signed-in conference organizer, **when** they attempt removal, **then** it refuses.

---

### User Story 4 - A platform operator promotes an attendee, and the tier boundary is real (Priority: P1)

A platform operator promotes an attendee to conference organizer for a named conference. That person
can then sign into the administrative site and sees only that conference — and nothing a platform
operator sees.

**Why this priority**: The two-tier model is the load-bearing claim of v4.0.0. A tier that is
declared but not enforced is a privileged role by another name.

**Independent test**: Promote an attendee for one of two seeded conferences; sign in as them; confirm
they see the assigned conference, not the other, and not the report queue.

**Acceptance scenarios**:

1. **Given** an attendee and a conference, **when** a platform operator promotes them for it, **then**
   they may sign into the administrative site and see that conference.
2. **Given** a promoted conference organizer, **when** they sign in, **then** they see **only** their
   assigned conferences and **no** platform-tier surface — not the queue, not promotion.
3. **Given** a conference organizer, **when** they attempt to promote anybody, **then** it refuses.
4. **Given** a promoted attendee, **when** they use MyNet, **then** **nothing** about their attendee
   experience differs from before promotion.
5. **Given** a promoted attendee, **when** a platform operator demotes them, **then** their
   administrative access ends and their attendee account is untouched.
6. **Given** an attendee who has never been promoted, **when** they present valid attendee
   credentials at the administrative site, **then** it refuses.

---

### User Story 5 - Leaving takes the authority with it (Priority: P2)

An attendee who is a conference organizer deletes their account, or withdraws from the conference
they organize. Their assignment ends in the same act, and if the conference is left with nobody, a
platform operator can see that.

**Why this priority**: The alternative is authority that outlives the access it depends on — a
withdrawn organizer fails `requireEventAccess` and can no longer see the conference as an attendee,
while an assignment left standing means nobody can observe the authority being exercised. 008 closed
the same trap for appointments.

**Independent test**: Promote an attendee, then have them withdraw from that conference; confirm the
assignment is gone and the conference reports as unassigned. Repeat with account deletion.

**Acceptance scenarios**:

1. **Given** a conference organizer, **when** they delete their account, **then** their assignments
   end in the same act and deletion is **never** refused or delayed for it.
2. **Given** a conference organizer, **when** they withdraw from a conference they organize, **then**
   the assignment for that conference ends and any others are untouched.
3. **Given** a conference whose only organizer has left by either route, **when** a platform operator
   looks, **then** it is shown as **unassigned**, and its content is unchanged and intact.
4. **Given** an unassigned conference, **when** a platform operator promotes somebody for it,
   **then** it is no longer unassigned.
5. **Given** a conference organizer who has left, **when** attendees use MyNet, **then** nothing
   about the conference differs for them.

---

### Edge Cases

- A platform operator's own account is deleted while reports reference their recorded outcome — the
  resolution record must survive with the actor no longer resolvable, rather than the report
  reverting to open.
- Two platform operators resolve the same report concurrently — the second must be told it is
  already resolved rather than silently overwriting the first's note.
- A question is removed by an operator while an attendee is voting on it — the vote must fail
  cleanly, not create a vote on a removed row.
- An attendee is promoted for a conference, then removed from that conference's registration by some
  other route — the assignment must not survive the registration.
- A report names an attendee who has since deleted their account — the report must remain readable
  with the subject unresolvable, since `abuse_reports` cascades on `attendees`.
- A promoted organizer's own conduct is reported — nothing in this feature exempts them, and the
  queue must not hide it.
- An operator opens the administrative site with no conferences assigned and no reports open — both
  empty states must render as deliberate states, not as failures.
- Sign-in is attempted at the administrative address with credentials belonging to a **deleted**
  attendee who was previously an organizer.

## Requirements *(mandatory)*

### Functional Requirements

#### The second actor and its two tiers

- **FR-900**: The system MUST support exactly two administrative tiers: **platform operator** and
  **conference organizer**. No third tier and no per-capability role may be introduced.
- **FR-901**: A platform operator MUST exist only as committed, reviewed seed data. No surface
  anywhere in either product may create one.
- **FR-902**: A conference organizer MUST exist only by promotion, performed by a platform operator.
  No self sign-up, no invitation, and no request-and-approve flow into either tier.
- **FR-903**: A platform operator MUST NOT be an attendee, MUST NOT hold an attendee profile, and
  MUST NOT appear in Discover, Messages, Network or Q&A.
- **FR-904**: A conference organizer MUST be an attendee, and MUST retain every attendee capability
  unchanged.
- **FR-905**: A platform operator's authority MUST be product-wide. A conference organizer's
  authority MUST be limited to the conferences they are assigned, and MUST be otherwise identical to
  an ordinary attendee's.
- **FR-906**: Only a platform operator may promote, demote, or read the report queue. A conference
  organizer attempting any of these MUST be refused.
- **FR-907**: Administrative tier MUST NOT be derived from, or grant, any attendee attribute.
  Specifically it MUST NOT consult verification state — Principle VIII reserves verification for
  discoverability alone — and MUST NOT consult discoverability.

#### Authentication, session, and topology

- **FR-910**: The administrative product MUST be served from a subdomain of the same registrable
  domain as the attendee product, with its API served under that same subdomain so administrative
  requests are same-origin.
- **FR-911**: The administrative session cookie MUST be host-only — no `Domain` attribute — so it is
  never sent to the attendee host, and the attendee session cookie is never sent to the
  administrative host.
- **FR-912**: A person holding both an attendee session and an administrative session MUST hold two
  independent sessions. Ending one MUST NOT end the other.
- **FR-913**: `SameSite=Lax` MUST remain the CSRF defence for both products. No synchroniser-token
  scheme is introduced, and no cookie may be set `SameSite=None`.
- **FR-914**: A platform operator MUST authenticate with credentials belonging to their operator
  record. A conference organizer MUST authenticate with their existing attendee credentials.
- **FR-915**: Administrative sign-in MUST be refused, with wording indistinguishable across causes,
  when the credentials are unknown, when they belong to an attendee who holds no assignment, and
  when they are otherwise invalid.
- **FR-916**: Administrative sign-in MUST be throttled per action, using the existing per-action
  mechanism, and the throttle MUST be configured so it may delay but can never deny.
- **FR-917**: Every administrative address MUST refuse an unauthenticated request without disclosing
  whether the addressed resource exists.

#### The administrative site

- **FR-920**: The administrative site MUST be a separate application. It MUST NOT reuse MyNet's five
  destinations, Home card registry, or navigation contract.
- **FR-921**: It MUST reuse the shared design tokens and the brand mark established by 010, so that
  it reads as the same product family.
- **FR-922**: It MUST satisfy Principle IV in full — accessible labels, visible focus, keyboard
  operability, Escape-key dismissal on every modal, and three layouts with no horizontal scrolling
  for any content or primary action.
- **FR-923**: It MUST NOT be an installable PWA: no manifest, no application icons, no service
  worker, no offline shell. Principle VI binds the attendee product only, and this absence is
  declared rather than omitted.
- **FR-924**: It MUST show, on every surface, which tier the signed-in operator holds.
- **FR-925**: A conference organizer MUST NOT be shown a control for a capability they do not hold.
  Refusal is server-enforced regardless, but a control that renders and then refuses is a defect.

#### Promotion and assignment

- **FR-930**: A platform operator MUST be able to promote an attendee to conference organizer for a
  named conference, and to demote them.
- **FR-931**: Promotion MUST record who performed it and when.
- **FR-932**: An attendee MUST be promotable for more than one conference, and each assignment MUST
  be independently revocable.
- **FR-933**: Promotion MUST require the attendee to be registered for the conference. An assignment
  MUST NOT exist without the underlying registration.
- **FR-934**: Demotion MUST end administrative access and MUST leave the attendee account untouched.
- **FR-935**: The attendee MUST NOT be notified of promotion or demotion. This feature dispatches no
  notification of any kind (FR-561 is unchanged).
- **FR-936**: A conference with no current organizer assignment MUST be reported as **unassigned**
  to platform operators. This state MUST be derived from the absence of an assignment and MUST NOT
  be stored.

#### The report queue

- **FR-940**: A platform operator MUST be able to read every report, showing the reporter, the
  subject, the time, the reporter's stated reason, and the reported content.
- **FR-941**: The queue MUST render **content unavailable** as a first-class state when the reported
  content no longer exists. It MUST NOT present this as an error and MUST NOT present the report as
  empty.
- **FR-942**: Disclosure MUST be limited to what was reported. The queue MUST NOT show the
  surrounding thread, the pair's other conversations, or any other report's subject.
- **FR-943**: A platform operator MUST be able to record an outcome for a report — at minimum
  *actioned* or *dismissed* — together with an internal note, and the queue MUST separate open
  reports from resolved ones.
- **FR-944**: A resolution MUST record which operator performed it and when, and MUST survive that
  operator's own account being removed, with the actor no longer resolvable.
- **FR-945**: Concurrent resolution of the same report MUST refuse the second attempt with an
  explanation, rather than overwriting.
- **FR-946**: Nothing about a report, its content, its reason, its outcome or its existence may be
  disclosed to the reporter, to the reported attendee, or to any surface in MyNet. FR-548 is
  unchanged for the attendee product.
- **FR-947**: Operator mail MUST be unchanged — identifiers and a timestamp only, never message text
  and never the reporter's reason — and MUST continue to be dispatched, because an operator who must
  open a site to learn a report exists learns late.

#### Moderation actions

- **FR-950**: A platform operator MUST be able to remove a reported audience question.
- **FR-951**: Removing a question MUST remove every vote cast on it, and MUST change no other
  question's count.
- **FR-952**: A removed question MUST be absent for every attendee at that event, including its
  author, who MUST NOT be told who removed it or why.
- **FR-953**: No removal, edit, or redaction action may exist for a **message**. The block performed
  at report time is the protective act, and message removal is not in this feature.
- **FR-954**: No avatar moderation action may exist. Register entry 19's standard is undecided, and
  building the action would decide it by inference.
- **FR-955**: No attendee suspension, removal, or restriction action may exist. That is 013.

#### Organizer lifecycle

- **FR-960**: Deleting an attendee account MUST revoke that person's organizer assignments in the
  same transaction. Deletion MUST NOT be refused, delayed, or made conditional for any
  administrative reason.
- **FR-961**: Withdrawing from a conference MUST revoke the organizer assignment for that conference
  in the same transaction, and MUST leave assignments for other conferences untouched.
- **FR-962**: A conference losing its last organizer MUST retain all of its content unchanged. No
  conference content is attendee data and none may be removed by either act.

#### Absences in the attendee product

Each of these is a requirement to build nothing, and each MUST be enforced by a test that fails when
the absence ends.

- **FR-970**: MyNet MUST gain no administrative route, screen, navigation entry, or control.
- **FR-971**: MyNet MUST gain no rendering that branches on administrative tier.
- **FR-972**: MyNet MUST gain no report-reading surface. FR-548 survives for the attendee product.
- **FR-973**: No administrative tier may read or edit any attendee's profile.
- **FR-974**: No conference content write path may exist in this feature. FR-132, FR-134 and FR-191
  remain in force until 012.
- **FR-975**: No join-code creation, rotation or revocation surface may exist. FR-311 remains in
  force until 013.
- **FR-976**: The five code-level guards that enforced the reversed prohibition MUST each be amended
  **deliberately and narrowly**, each stating what is now permitted and to whom. None may be
  weakened to the point of checking nothing:
  `apps/api/src/db/seed/catalog.ts`, `catalog-read-only.test.ts`, `join-grants-nothing.test.ts`,
  `qa-absences.test.ts`, `no-report-read-surface.test.ts`.

#### Personal data

- **FR-980**: Administrative authority MUST be a server-enforced predicate, in the shape the existing
  branded scopes establish. It MUST NOT be a claim the client presents.
- **FR-981**: An attendee's export MUST include their organizer assignments, since an assignment is
  data about them.
- **FR-982**: Organizer assignments MUST be reached by the attendee deletion cascade.
- **FR-983**: Operator records hold personal data about a person who is not an attendee and whom no
  attendee cascade reaches. This feature MUST state, for every table it adds, how its records are
  deleted or expired, and MUST NOT satisfy the coverage tests by allow-listing without a written
  reason.
- **FR-984**: A report's resolution record MUST NOT be removed by an operator's removal (FR-944), and
  the retention rule covering it MUST be stated.

### Key Entities

- **Platform operator** — a seeded administrative identity with credentials, a display name, and
  product-wide authority. Not an attendee. Holds no profile.
- **Organizer assignment** — a link between an attendee, a conference, and the platform operator who
  created it, with the instant it was created. Per-event by construction. Revoked by demotion, by the
  attendee's deletion, and by their withdrawal from that conference.
- **Administrative session** — an authenticated administrative session, independent of any attendee
  session, established under the administrative host only.
- **Report resolution** — the outcome an operator recorded against a report, the internal note, the
  operator, and the instant. Survives the operator's removal.
- **Unassigned conference** — not an entity. A derived state: a conference with no current organizer
  assignment. Deliberately not stored, following 008's `lapsed`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-900**: A platform operator can sign in and reach the report queue in under 30 seconds from
  opening the administrative address.
- **SC-901**: A person holding both an attendee and an administrative session can sign out of either
  without affecting the other — verified in a real browser, in both directions.
- **SC-902**: 100% of reports filed by attendees since 007 shipped are readable by a platform
  operator, including those whose reported content no longer exists.
- **SC-903**: A reported question can be removed, and disappears for every attendee at that event,
  within one refresh of the surface showing it.
- **SC-904**: A conference organizer is refused on 100% of platform-tier addresses, verified by
  direct address entry rather than by absence of a control.
- **SC-905**: An attendee who is a conference organizer can delete their account with no additional
  step, no warning that blocks, and no refusal — measured as an unchanged deletion journey.
- **SC-906**: A conference whose last organizer leaves is reported as unassigned to a platform
  operator, and 100% of its sessions, tracks, rooms and speakers remain intact.
- **SC-907**: Zero administrative routes, screens, navigation entries or tier-dependent renderings
  exist in MyNet, asserted by a test that fails when one appears.
- **SC-908**: The attendee product's behaviour is unchanged — every existing test passes without
  modification, other than those amending the five named guards.
- **SC-909**: The administrative site passes the accessibility gate at all three width bands with no
  horizontal scrolling of content or primary actions.
- **SC-910**: No notification of any kind is dispatched by this feature, asserted by the existing
  source-level audit over the notification trigger set.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Actor and tier** (Principle III, added 4.0.0) | **Two actors, in two products.** The administrative product serves **platform operators** (product-wide; the only tier reaching the report queue, promotion, and question removal) and **conference organizers** (assigned conferences only). The attendee product serves attendees and **gains nothing** — FR-970 through FR-973 are absences enforced by test. A conference organizer is simultaneously an attendee, and FR-904 requires that experience to be unchanged; the two capacities are separated by which product they are exercised in and by which session is presented. |
| **Offline behaviour** (Principle VI) | **The administrative product is not offline-capable and is not installable** (FR-923) — no manifest, icons, service worker or offline shell. Principle VI binds the attendee product only, scoped explicitly in 4.1.0, and an administrator works at a desk on a connection. **No repository in this feature is cached.** The caching decorator treats any method not named as a *read* as a write that purges the whole conference prefix (008's defect), so declaring nothing cached is the safe declaration and the deliberate one: report content, tier and assignments are all authorization-sensitive, and age is the wrong clock for authority. The attendee product's offline behaviour is unchanged. |
| **Desktop layout** (Principle IV) | The administrative product's primary band. Persistent left rail naming the tier and its sections; contextual top bar; report queue as a list with a detail pane. |
| **Tablet layout** (Principle IV) | Reduced rail; queue and detail stack rather than sitting side by side. |
| **Mobile layout** (Principle IV) | Supported but not optimised-for: single column, full-width detail, touch-sized controls, no horizontal scrolling of content or primary actions. **Declared explicitly because register entry 4 is escalated by this feature** — an entire product of unreviewed desktop design — and a narrow band left undeclared is the one nobody looks at. |
| **Empty / loading / failure states** (Principle IV) | Every administrative surface crosses the network. Required: an empty open queue (a deliberate state, not a failure); a conference organizer with no assignments; **content unavailable** on a report whose messages are gone (FR-941), which is the *expected* case rather than an edge; a failed resolution due to concurrent action (FR-945), carrying its reason. |
| **Accessibility** (Principle IV) | Full Principle IV compliance (FR-922). Every modal — resolution, promotion, question removal — carries a clear close action and Escape dismissal, and **must use the base `<dialog>` centring rule in `theme/tokens.css`**, which is the invariant two features have already rediscovered by shipping dialogs in the top-left corner. |
| **Validation checklist discharged** (Principle VII) | Discharges no item of the whole-product attendee checklist, because it adds no attendee surface — and says so rather than claiming partial credit. Adds its own gates: the administrative product must pass every existing correctness gate (typecheck, lint, unit, component, contract, migrations, integration against a real database, accessibility, e2e, production build). |
| **Identity scoping & server-side authorization** (Principle VIII) | Authority is a **server-enforced predicate** (FR-980), never a client claim, in the shape `EventScope`, `ConversationScope` and `CardScope` establish. Tier is never derived from an attendee attribute, and **never from verification or discoverability** (FR-907). Refusals disclose nothing about what exists (FR-917). The report queue is the **third recorded Principle VIII exception** (4.1.0, A8), scoped to platform tier only, only what was reported, only in the queue, and nothing back to the reporter. |
| **Deletion & export coverage** (Principle VIII) | Organizer assignments cascade from `attendees` and appear in the attendee export (FR-981, FR-982). **Operator records are the case Principle VIII has never had to consider** — personal data about somebody with no `attendees` row, whom no existing cascade reaches — so this feature must state a deletion or retention rule for every table it adds (FR-983) rather than allow-list its way past the coverage tests, which fail by existing. A report resolution deliberately survives its operator's removal (FR-944) and needs its own stated rule (FR-984). |
| **Event scoping** (Standing decision D1/7) | **Both rules apply, and each table says which.** `organizer_assignments` is **per-event** — an assignment is authority over one conference. Operator records and administrative sessions are **neither**: they belong to the product, not to a conference, which is a third case decision 7 did not anticipate and which is declared here rather than defaulted. Report resolutions follow `abuse_reports`, which is **cross-event** by 007's decision that conduct is not a conference. |
| **Register position** (Governance) | **Blocked by nothing.** Licensed by **v4.0.0** (standing decisions 31–36) and unblocked by **v4.1.0** (37–39), which closed entries 24, 25 and 26 — all three of which this feature would otherwise have had to settle by inference. **Addresses but does not close entries 19 and 21**: it creates the actor capable of moderating and of reading reports, but appoints nobody (21) and sets no standard for avatars (19), and FR-954 forbids closing 19 by building the action. **Escalates entry 4** — desktop and tablet layouts have never been validated, and this adds an entire product of them. **Opens no new entry.** |
| **Reserved migration number** (Branching — parallel work) | **`0009`.** Migrations run to `0008_session_qa.sql`; 010 added no schema. The roadmap's reserved-number table covers the attendee programme only and is deliberately not extended, so `0009` is claimed here. Anyone regenerating the Drizzle snapshot must move `apps/api/migrations/meta/README.md` aside first, because `drizzle-kit generate` JSON-parses every file in `meta/`. |

## Assumptions

- **A conference organizer signs in with their existing attendee credentials.** Standing decision 33
  requires promotion not to alter their attendee experience, and issuing a second password would be
  such an alteration. Platform operators, who are not attendees, hold their own credentials. This is
  the reason the administrative site accepts two credential sources.
- **Promotion requires existing registration** (FR-933). An assignment without a registration would
  be authority over a conference the holder cannot see as an attendee — the same trap FR-961 closes
  from the other end.
- **Removing a question is the only enforcement action in this feature**, for the reasons in the
  scope note: a question is publicly exposed and removal is the only act that stops it; a message
  report's protective act already happened at report time; attendee suspension is 013; avatar
  moderation is entry 19.
- **The report queue shows reports from both 007 and 009 in one list.** `abuse_reports` is one
  cross-event table and conduct is conduct; splitting the queue by origin would be a presentation
  choice with no basis in the data.
- **The administrative site is desktop-first but not desktop-only.** All three bands are delivered
  per Principle IV, which admits no exception; the mobile band is not optimised beyond compliance.
- **Operator credentials follow the existing password rules and hashing.** No new credential
  mechanism is introduced, and no second pepper or key.
- **Seeded operator credentials must not be usable in a deployed environment as committed.** The seed
  is world-readable — the repository is public (entry 16) — so a committed operator password is a
  published administrative credential. The specification treats first-run credential establishment as
  a requirement of deployment rather than of this feature, and it is recorded in Open Questions.

## Open Questions

To be resolved at planning or escalated. **None may be silently resolved.**

1. **How a seeded platform operator's first credential is established without committing it.** The
   repository is public, so a password in the seed is a published administrative credential — a
   materially worse version of the join-code concern already recorded against 004. Candidate shapes:
   an environment-supplied secret consumed at first boot, a first-run establishment flow bound to a
   one-time token, or provisioning outside the seed entirely. **This is the one question in this
   feature with a security consequence that cannot be deferred to a later feature**, because the
   operator account exists from the first deployment.
2. **Whether a report resolution's internal note is personal data requiring its own retention rule.**
   It is an operator's free text about two attendees, held indefinitely, on a row that survives the
   operator (FR-944). 007 refused to put the reporter's reason in mail on closely related reasoning.
3. **Whether removing a question should be available from outside the report queue.** As specified,
   removal is reachable only from a report — which means an abusive question nobody reports cannot be
   removed. Widening it is a moderation-standard decision adjacent to entry 19.
4. **What happens to an assignment when a conference is removed from the seed.** Conference content is
   seeded and a re-seed clears it; 008 met the neighbouring problem when a non-cascading reference
   broke the re-seed with an error naming neither table.
5. **Whether the administrative product needs its own CI job or extends the existing ones.** Principle
   VII binds it equally; whether that is a widened matrix or a parallel set is a planning decision.
6. **Whether operator sign-in attempts belong in `sign_in_attempts`.** That table is deliberately
   unreachable by any cascade and expires on a two-hour sweep FR-382 forbids lengthening; adding a
   second subject type to it is a change to a table with unusually specific reasoning.
