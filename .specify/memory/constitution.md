<!--
SYNC IMPACT REPORT
Version change: 5.4.0 → 5.4.1

Rationale: PATCH — a restructuring with no change in meaning. No principle, constraint, standing
decision, register entry or workflow rule is added, removed or reworded. Every rule in force is
carried byte-for-byte; only history moved and the register was re-sorted.

What changed:
  - The Sync Impact Reports for 5.4.0 back to 1.0.0 (~124KB, ~40% of the file) moved verbatim to
    `docs/record/constitution-history.md`, Part 1. References in the binding text to "the 2.3.0
    sync report" and similar now resolve there.
  - The Open Questions Register was one list for entries 1–26, with entries 27–31 living only in
    per-amendment "Opened in X" sections, and with 14, 17, 18 and 20 carrying resolutions in their
    text but not struck through. It is now ONE list, 1–31 in number order, each entry stating its
    current status once. Open entries keep their text verbatim, except 19 and 21, whose five and
    three accreted status paragraphs are condensed into one current statement. Resolved entries are
    summarised with the decision that closed them and a pointer to the binding text. The register as
    it stood in 5.4.0 — every original entry and every per-amendment narrative — is preserved
    verbatim in the history file, Part 2.
  - Two indexes added to the register, both derived from existing text: the unnumbered matters
    resolved before numbering stabilised, and the delivered requirements withdrawn by amendment.
  - One dating inconsistency recorded rather than silently fixed: entry 20's text said "RESOLVED in
    3.4.0" while the 3.5.0 amendment section records its resolution; the summary gives 3.5.0 and
    says so.

Numbering: no version, decision number, decision prefix or register entry is claimed. The register
high-water mark stays 31 and the standing-decision high-water mark stays 56.

Templates and dependent artifacts: none require updates. No test, script or workflow reads this file.
CLAUDE.md was rewritten in the same change to comply with the Runtime guidance clause below, which
it had been violating (it carried progress updates and a second copy of the decision register).

Deferred TODOs (carried forward unchanged):
  - GroundZero/requirements.md still says "EventLink", still describes a front-end demo, and still
    lists persistent databases and real authentication as out of scope. Whether it is amended or
    the divergence is simply recorded is an open question requiring the client, not the owner.
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

The attendee is the **primary** actor, and MyNet — the attendee product — has no other. *Amended
4.0.0 by A1 and A2: from 1.0.0 until this amendment this clause read "the attendee is the only actor
in scope", and every feature through 010 was justified against it. A second actor now exists, and it
does not act in this product.* What survives unchanged is the rule that gave the original clause its
force: **no administrative capability may appear in MyNet itself** — no admin surface, no privileged
view, no role-dependent rendering — so an attendee's experience of this product is exactly what it
was. The second actor and its own product are defined under "Administration, and the second actor".

Every feature of the attendee product MUST be justified by how it answers one of the attendee's
three questions, in this order of prominence:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

The product IS an authenticated attendee workspace — literally, not as an aesthetic. It MUST NOT
read as a marketing site and MUST NOT read as a generic enterprise dashboard. People, sessions, and
time MUST be the strongest visual elements. The first viewport MUST make the product understandable
without scrolling, and the core journey — inspect the next session → discover a relevant attendee →
share a card or message them → schedule a networking appointment — MUST remain completable end to
end.

**Payment processing** is out of **product** scope and MUST NOT be built without an amendment. Its
exclusion is a WHAT, not a delivery-mode artifact.

**Administration is IN scope as of 4.0.0** (A1), and the exclusion that stood here since 1.0.0 is
reversed. *(**RATIFIED 2026-08-11.** The amendment travels on the feature branch to `develop` — the
pattern 3.2.0 established, so that a reviewer reads the rule and the code relying on it together,
which also means a rebase dropping it un-licenses that code.)* The two were named in one sentence and were never one decision; reversing one does not
weaken the other. Administration enters under four conditions, each binding and stated in full under
"Administration, and the second actor": it lives in a **separate product**, it is exercised by a
**second actor in two tiers**, **neither tier is reachable by self sign-up**, and **MyNet gains no
administrative surface**. An administrative capability that fails any one of those four is outside
this reversal and needs its own amendment.

**Rationale**: This is the stated success criterion, and it is unchanged for the attendee. A feature
of the attendee product that does not serve it is scope creep regardless of its merit. The reversal
was forced by obligations the product had already accumulated and could not discharge: register
entry 19 has been open since 2026-08-07 because nobody moderates an uploaded avatar, entry 21 since
2026-08-08 because the reporting dialog promises a human reader the product cannot supply, and 009
recorded that a public Q&A surface "needs a moderator, and a moderator is an organizer — the actor
Principle III excludes by construction". An exclusion that makes a safety promise unkeepable is an
exclusion that has to be paid for or reversed.

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

**The shipped desktop and tablet layouts are RATIFIED as intended, by owner decision 56 (5.4.0,
R3), closing register entry 4 — and ratified WITHOUT a client acceptance act.** This is not a claim
that they were validated. **5.0.0's rule that no feature may be read as having validated a layout
because its gates are green stands unamended, and is deliberately not used here**; anybody citing
R3 as evidence that these layouts were reviewed has misread it. The cost is ratified with the
decision: desktop use is the client's own requirement (REQ-108, REQ-110), she has never seen the
product at a desk, and closing entry 4 removes the thing that kept each feature's unreviewed
desktop design visible.

**Two judgement questions are ratified as-is and MUST NOT be reopened as defects**: the rail
divergence at 768–1279px, where MyNet presents an icon-only rail and the administrative site a
labelled one; and Home's two-column card arrangement on an upright tablet. Both were unrecorded
choices rather than constraints — `apps/admin` imports MyNet's tokens and uses none of its
breakpoints — and both are now choices.

**Ratification does not reach a non-compliance, and one is carved out.** `AdminShell` presents
**two** layouts where the three above are required: below 768px the administrative site's only
navigation is a horizontally scrolling strip, and at 768–1023px its rail is labelled rather than
reduced. **Fiat may close a judgement; it cannot make a non-compliance compliant.** This MUST be
fixed, and its fix MUST carry an assertion that does not depend on document-level overflow
measurement — the existing sweep cannot see it, because an inner `overflow-x-auto` container is
designed to keep that measurement at zero.

**Rationale**: The prototype implements none of the focus or Escape behavior and has no desktop or
tablet layout at all. These are requirements, not enhancements, and they are cheap to keep and
expensive to retrofit. **That the layouts are now ratified does not make them reviewed**, and the
distinction is the whole of what entry 4 was about.

### V. Abstraction Before Platform and Data APIs

Application code MUST call project-owned interfaces, never external APIs directly. This applies in
two dimensions:

**Device and browser capabilities** — `NotificationService`, `CalendarService`, `CameraService`,
`ContactShareService`, `SecureStorage`, `ConnectivityService`, `VisibilityService` (added 3.1.0;
whether the attendee is actually looking at this tab), and `InstallService` (added 5.1.0; whether
the application is running installed, and how it may be installed on this device). Initial
implementations MAY be web-based or no-op stubs.

`VisibilityService` is listed for a reason worth stating, because it is the first capability added
by an implementation rather than by a product decision. A surface that polls MUST NOT poll a tab
nobody is looking at — a backgrounded tab has its timers throttled unpredictably, so a poll that
"runs" there fires in bursts when the tab wakes, on a phone, on cellular data. The only way to ask
is `document.visibilityState`, and this principle forbids feature code from asking it directly. The
choice was therefore an interface or an exemption, and an exemption would have traded a structural
boundary for a poll interval.

`InstallService` is the **second** capability added by an implementation rather than by a product
decision, and it is listed on `VisibilityService`'s precedent rather than by analogy to it — the
listing is the ratification act, and leaving the enumeration stale is what this clause exists to
prevent. Notification delivery on iOS is available **only** to an installed application, so an
attendee on an uninstalled iPhone can grant permission and still receive nothing; telling them so
requires knowing whether the application is installed. The only way to ask is
`matchMedia('(display-mode: standalone)')` together with a `beforeinstallprompt` listener on
`window`, and `mynet/no-direct-platform-access` refuses both in feature code. The choice was again
an interface or an exemption, and the same answer follows: an exemption would trade a structural
boundary for an install banner.

**The interface MUST model both platform halves as first-class, not one as a failure of the
other.** Chromium fires `beforeinstallprompt` and can present a real system prompt; iOS Safari
fires nothing and exposes no install API to the page at all, so its half is instructional copy and
cannot be anything else. An interface shaped only around the Chromium case would make the iOS path
look like an error rather than a different platform, and would invite a control that cannot work.

**Platform capabilities** — `StorageService`, for durable binary content that does not belong in the
database (added 2.3.0 by D9, for avatar images). This is a *platform* capability rather than a device
one, and it is listed separately so the capability set is not read as closed to surfaces that are
neither device nor data-access. Its initial implementation MAY be filesystem- or database-backed for
development, test, and preview; the production provider is a separate, recorded decision.

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

The **attendee** client product MUST be built as an installable PWA: web app manifest, application
icons, offline shell, versioned caching, and explicit online/offline states.

*Scoped explicitly in 4.0.0 by A3.* Until this amendment there was one client and the word needed no
qualifier. The administrative product is a second client, and this principle does **not** bind it:
an administrator works at a desk on a connection, not in a venue on a phone, so an offline shell and
an install prompt would be ceremony rather than capability. **Whether the administrative site is
installable MUST nevertheless be stated in its specification as a declared absence** under Principle
IX — an obligation that is not declared is presumed unmet, and "this principle does not apply" is
exactly the kind of claim that must be made out loud rather than inferred from silence.

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
real database instance**, accessibility checks, end-to-end browser tests, and a production build.

**A per-change preview deployment is NOT required** (amended 3.0.0, decision D13). A change MUST
reach a **deployed environment** before it reaches production, but that environment is the
long-lived UAT described under "Deployment environments" below, deployed on merge to `develop` —
not an ephemeral environment built for each pull request.

This supersedes phase 001's **FR-066** and **SC-011**, which are the strongest form of the earlier
reading: *"a preview of that exact change at an address a reviewer can open without local setup"*.
Both are withdrawn. **What is given up is stated plainly rather than glossed**: a reviewer no longer
sees the change they are reviewing, deployed, before approving it. What replaces it is review
against UAT *after* merge plus a locally reproducible stack, and the residual reduction in
per-change reviewability is **accepted, not solved**.

001's **FR-067** — no environment holding real attendee data may back a non-production deployment —
is **unaffected and survives**. It binds UAT exactly as it bound previews.

A change is not complete until the pipeline is green. Completion MUST NOT be claimed from
inspection; it MUST be claimed from pipeline output. Failing or skipped checks MUST be reported
explicitly, never silently tolerated.

**Merging with a required check failing, skipped, cancelled, or never started is a governance
breach.** A check that did not run has not passed, and a pipeline whose later stages are skipped
because an earlier stage failed has verified nothing beyond the point of failure — the skipped
stages MUST NOT be read as absence of problems. Where such a merge is nevertheless judged
necessary, it MUST carry a **recorded waiver** naming the checks not satisfied, why the merge could
not wait, and who accepted the risk. An unwaived breach MUST be recorded in the Open Questions
Register and MUST be closed before the next feature merges. Silence is not a waiver, and a green
subset is not a green pipeline.

*Rationale*: this principle previously stated the standard without naming the consequence of
breaking it, and the standard was then broken twice — features 001 and 002 both merged with the
migration, integration, accessibility and end-to-end stages unexecuted. A rule with no stated breach
condition is guidance; this makes it a gate.

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
  participants. Any exception requires a recorded client decision. **Four such exceptions are
  recorded.**
  - *First* (2.3.0, D10): an attendee's profile is visible to attendees registered for the same
    event, enforced server-side by the event-scoping predicate, and the attendee MUST be able to
    withdraw from that visibility without deleting their account.
  - *Second* (3.3.0, Q1; **shape amended 5.0.0 by C2**): an **audience question is visible to every
    attendee registered for the event it was asked at, attributed to the asker, and there is no
    opt-out** — including for an attendee who has turned discoverability off, because discoverability
    governs being *found* in the directory, not being *seen* having spoken in a room. Enforced
    server-side by the same event-scoping predicate as the first.

    **5.0.0 changed when this exception takes effect, not what it discloses.** Publication is now
    conditional on a moderator approving the question, where from 3.3.0 until 2026-08-12 it was
    immediate on asking. The disclosure is unchanged and the no-opt-out is unchanged; what moved is
    that a question now has a state in which it exists and is not yet public.

    **The attribution clause is SETTLED as of 5.4.0 (R2): first name plus surname initial — "Ana
    R." — wherever a question is displayed**, including the moderation queue and the projected
    screen. Entry 27 is closed. This **narrows** the exception rather than widening it: what is
    disclosed is smaller, attribution is unchanged, and a non-discoverable attendee is still named.
    That a question is attributed at all was never under review — anonymity was considered in 3.2.0
    and not chosen.

    **A moderator reading a question before it is public is not a further exception**, because
    content submitted for publication was never private. The reasoning is written out under
    "Audience questions" rather than left here to be reconstructed, along with the one case that
    genuinely needs a rule: a *refused* question is stored personal data that never became public.

    **The two exceptions are not the same shape and the difference is the point**: the first is
    withdrawable and the second is not, so an attendee who wants to say nothing publicly must not
    ask, rather than ask and then retreat. What bounds it is stated with it under "Audience
    questions" — the attendee is told before they publish, the name is not a route into the profile,
    and the question is reportable *after* publication as well as screened before it.
  - *Third* (4.1.0, A8): **a reported message and the reporter's stated reason are visible to a
    platform operator in the administrative report queue.** Four conditions scope it, and all four
    bind:
    - **Only the platform tier.** A conference organizer MUST NOT read reports at all. A report
      names two attendees who may share no conference with that organizer.
    - **Only what was reported.** The specific messages the reporter identified, never the
      surrounding thread, never the pair's other conversations, and never a second report's subject.
    - **Only in the queue.** This grants no general read of message content anywhere else in either
      product.
    - **The reporter is told nothing.** FR-548's absence of a reporter-facing surface is untouched;
      a queue existing MUST NOT become a status anybody can poll.

    **The reported content will frequently be absent, and that is a designed state rather than a
    fault.** `abuse_reports` stores reported message identifiers as a plain array, deliberately not
    a foreign key, because "the reported messages will frequently be gone before anyone looks at the
    report" — by the reported attendee's deletion cascade or the reporter's own departure. A real
    foreign key left only bad options: `RESTRICT` blocks a deletion the erasure right requires, and
    `CASCADE` silently empties the report while leaving the row, which reads as "they reported
    nothing". The queue MUST therefore render *content unavailable* as a first-class state and MUST
    NOT present it as an error or as an empty report.

    *Why this one was granted where 4.0.0 withheld it*: the alternative to a scoped surface is not
    an operator who sees nothing. It is an operator who queries the database directly — unbounded,
    unscoped, and unaudited — which this document already concedes they can do. The exception buys a
    narrower disclosure than the status quo it replaces.

  - *Fourth* (5.3.0, O1): **the attendees enrolled in an optional session are visible, by name, to a
    conference organizer assigned to that conference.** Four conditions scope it, and all four bind:
    - **Only an assigned conference organizer, and only for their own conferences.** A platform
      operator holds this by the product-wide authority it already has; nobody else holds it at all.
    - **Only enrolment.** This grants no read of a saved session, a private note, a question, or a
      vote. Those remain undisclosed to every administrative tier, and FR-1042 survives for them
      **unnarrowed**. An enrolment is disclosed because it is a claim on a bounded resource the
      organizer is responsible for providing; the other four are not.
    - **Only the sessions of that conference.** It is not a directory, not a cross-conference view of
      one attendee, and not a route into anybody's profile.
    - **The attendee is told before they enrol.** Enrolling is an explicit act, so the disclosure is
      knowable at the moment it is chosen — which is what makes this the *least* invasive of the four
      exceptions and the only one the subject can decline by not acting.

    *Why this was granted.* REQ-086 requires that some sessions close enrolment early **because
    materials must be prepared**. An organizer who cannot name the people they are preparing for
    cannot discharge the requirement, and a bare count does not survive contact with a workshop that
    needs a check-in list. The alternative considered and rejected was a count alone, which satisfies
    the arithmetic of materials and not the act of running the room.

    *Why it is recorded rather than reasoned away.* An enrolment is arguably not "messages, notes, and
    appointments" as this clause enumerates them, so a feature could have concluded no exception was
    needed and shipped the roster without one. **That is exactly the shortcut 3.3.0 and 4.1.0 each
    refused.** The cost of recording an exception that may not strictly have been required is a
    paragraph; the cost of the reverse is a disclosure nobody accepted.

  An exception MUST be recorded here rather than **derived** from a rule elsewhere in this document,
  and **the second, the third and the fourth were all derivable and none was derived.** The second could have
  been reasoned from attribution, already binding (3.2.0, N3), plus the plain fact that a question on
  a shared session is visibly public; the owner ruled on 2026-08-10 that derivation is not recording.
  The third could have been reasoned from an operator's evident need to judge what they are asked to
  act on; it was ruled on 2026-08-11 instead. **A privacy exception nobody had to accept is one
  nobody has accepted.**

  **4.0.0 granted no third exception and predicted this one** (A5): *"A report surface that showed
  the reported message text WOULD be a third exception, and it is register entry 24 rather than a
  consequence of A5."* **4.1.0 answers that entry, and the prediction is the point** — the exception
  was recorded by amendment rather than reasoned into existence inside a feature specification,
  which is what Principle VIII requires and what 3.3.0 ruled when the same shortcut was available for
  Q&A. What 4.0.0's restraint still binds: administration reads attendee data by definition, and the
  arrival of a second actor is **not** a standing licence over everything. **Four exceptions are
  recorded; a fifth needs a fifth amendment.**

  *That sentence read "three… a fourth needs a fourth amendment" until 5.3.0, and 5.3.0 is that
  fourth amendment.* The prediction held twice running — 4.0.0 forecast the third and 4.1.0 delivered
  it — which is the strongest available evidence that stating the next threshold in advance is what
  stops a feature crossing one without noticing.

  **Operator records are personal data about somebody who may not be an attendee**, which is a case
  this principle has never had to consider: "every stored record that belongs to an attendee MUST be
  attributable to exactly one identity" is written around a table that a platform operator has no row
  in. The deletion, export and retention obligations below therefore need an explicit answer for the
  new tables rather than an inherited one — see "Administration, and the second actor".
- **Deletion and export are standing commitments**, not features to be invented later. *Stated as
  recognised obligations in 2.0.0 and made concrete in 2.3.0 by D6.* Three rules bind every feature
  that stores attendee data:
  - **Deletion is self-serve, hard, and cascading.** An attendee MUST be able to delete their own
    account without an intermediary, and doing so MUST remove every record attributable to them. No
    soft delete and no tombstone row — a record marked deleted is a record still held. Any feature
    storing attendee data MUST make its records reachable by that cascade in the same change that
    introduces them.
  - **Export is self-serve and machine-readable**, and MUST cover every table holding data about the
    requesting attendee. A field that is collected but not exported is a defect.
  - **Personal-data records no cascade can reach MUST expire on a clock.** Some records are
    deliberately not attributable to an attendee row — `sign_in_attempts` holds keyed hashes with no
    foreign key, so that attempts against addresses belonging to nobody are still recorded. Such
    records are pseudonymous rather than anonymous, and a stated retention window is the only thing
    that can clear them.

  These are built to the strict standard deliberately, so that settling which data-protection regime
  applies is not a precondition for shipping. An absence in a given slice MUST still be recorded in
  the Open Questions Register rather than passed over.

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
- **Deletion and export coverage** — mandatory for any feature that stores attendee data. How each
  new record is reached by the deletion cascade, and how it appears in the export; and for any record
  no cascade can reach, the retention window that clears it (Principle VIII, added 2.3.0). A field
  that is collected but does not appear in both answers is a defect, not an omission to fix later.
- **Register position** — which Open Questions Register entries block this feature, and which it
  resolves.
- **Administrative counterpart** *(added 5.0.0 by C3)* — for every capability the feature adds to
  MyNet, whether an administrative counterpart already exists, must be built here, or is explicitly
  **none**. A feature adding no attendee-facing capability declares that and is done.

  **"None" is a valid and common answer; silence is not.** The obligation is to have looked. It was
  set the day a request to add a confirm-password field turned out to span **five screens across two
  products** — three in MyNet and two in the administrative site — where the natural reading of the
  request was one screen, and the two nobody was looking at were the ones guarding the tier that
  reads the report queue.

  *Rationale*: since 4.0.0 this product has had two actors and two websites against one database, and
  the failure mode that creates is asymmetric capability — a thing attendees can do that no
  administrator can see, undo, or answer for. That asymmetry is invisible in the product that has the
  capability, which is precisely why it needs declaring rather than noticing.

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
- **Backend and API**: MyNet has a project-owned API service over a **PostgreSQL** database. The API
  contract is owned by this project — not generated by a vendor and not dictated by a third-party
  platform. This was decided by the owner on 2026-08-04 in preference to a managed
  backend-as-a-service, for portability and contract control; the operational cost of that choice is
  accepted.

  **The database need not be a managed service** (amended 3.0.0, decision D12). Until 3.0.0 this
  clause read "a managed **PostgreSQL** database"; PostgreSQL now runs as a container in the
  application's own stack, reachable only from its host. **What is unchanged is most of what the
  original clause was protecting**: the engine is still PostgreSQL, the API contract is still owned
  by this project, schema changes are still versioned reviewed migrations verified in CI before
  reaching real data, and data access still goes through repository interfaces. Only *who provisions
  and operates the database* changes — and with it, the obligation below.
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
  (Principle III). **Engagement** notification delivery and calendar integration remain out of scope
  until a recorded decision brings them in; the interfaces for them exist (Principle V) but MUST NOT
  be wired to real delivery without that decision. The prototype's notification bell MUST NOT be
  reproduced.

  *Narrowed in 2.3.0 by D8.* **Transactional account mail is in scope** — email address verification
  and password reset, and nothing else. The exclusion above was written to keep an engagement surface
  out of the product; it was never about the messages that make an account usable, and reading it
  that way would have made self sign-up impossible to deliver safely. The boundary is: mail the
  attendee's own account lifecycle requires is in; mail that tells them something happened in the
  product is out.
- **State**: server state and client state MUST be distinguishable. Server-derived data MUST NOT be
  duplicated into ad-hoc client state where the copy can silently diverge from its source.
- **Persistence**: attendee data is durable and server-side. `SecureStorage` covers client-side
  secrets and MUST NOT be used as a general cache. What may be cached on the client, and for how
  long, MUST be specified per feature rather than assumed.

### Deployment environments

Added in 3.0.0 by decision D12/D13. This block is what replaces the per-change preview deployment
Principle VII no longer requires.

- **Two environments, isolated by construction**: `uat` and `prod`. Each MUST have its own host, its
  own database, its own secrets, and its own address. A deployment, a runaway query, or resource
  exhaustion in one MUST NOT be able to affect the other.
- **UAT MUST NOT be connected to any data store holding real attendee data.** This is 001's FR-067,
  unchanged in substance and unchanged in force — the environment it binds has changed, the rule has
  not. **Separate configuration is not sufficient**: the separation MUST be enforced, and a
  deployment tool that can be pointed at the wrong database MUST refuse rather than proceed.

*The following four rules were added in 3.5.0 by decisions L1–L3. Until then this block described a
topology with no addresses in it, and `deploy/vm/envs/*.env` left `SUBSCRIPTION` and `APP_DOMAIN`
blank because naming them was a decision no feature was entitled to take.*

- **Both environments run in Azure subscription `d428f98f-a3c4-49c3-ae24-06ec3de08477`
  (LinaSys-DevEnv), region `centralus`.** Scripts MUST pin every call to this subscription by id
  rather than inherit whatever is active; a name is mutable and an inherited default silently
  provisions into the wrong place. Sharing one subscription does not weaken the isolation rule
  above — that rule is about hosts, databases, secrets and addresses, and each environment MUST
  still have its own of all four.
- **UAT is `mynet-dev.programasemilla.com`. Production is `mynetcr.com`**, provisionally: it is not
  registered, and it MUST NOT be committed to `prod.env` until it is, because a blank value is what
  makes the deploy jobs' refusal honest.
- **UAT and production MUST remain separate registrable domains.** Not a naming preference — it is
  what makes a UAT session cookie structurally incapable of reaching production, which is a stronger
  guarantee than configuration can offer and the one form of the FR-067 separation that cannot be
  undone by a mistake. A change that moves UAT onto a subdomain of the production domain MUST amend
  this rule, and would be trading a structural guarantee for a convention.
- **UAT is openly reachable and carries seeded data only.** Public self sign-up stays open; access
  is not restricted by credential, allowlist or network boundary. **FR-067 is satisfied by the data
  rather than by the access control**, and that is the whole of the reasoning: nothing that must be
  kept from a stranger is ever present. The rejected alternatives are recorded because they look
  safer and are not — basic auth in front of everything breaks service-worker registration and push,
  and an IP allowlist breaks a physical-device test on cellular, so each buys secrecy for data that
  does not need it by disabling the validation the environment exists to make possible.

  *Consequence, stated rather than left to be discovered*: an openly reachable environment with
  public sign-up and image upload makes register entry 19 — that nobody moderates uploaded avatars —
  a present fact rather than a prospect. That entry is **not** resolved by this rule, and this rule
  MUST NOT be cited as having resolved it.
- **The client and the API MUST be served from one origin.** This is not an implementation
  preference: it is what keeps the session cookie's `SameSite` attribute a genuine CSRF defence
  rather than a nominal one, and it is why no synchroniser-token scheme is required. A topology that
  splits them MUST NOT ship without one.

  **The administrative site is a SUBDOMAIN of the same registrable domain** (*added 4.1.0 by A7*),
  with `/api/*` reverse-proxied under it so its own calls remain same-origin. The rule above is
  therefore satisfied twice rather than bent once: each product is served from one origin, and
  neither reaches the other's.

  The distinction this rests on MUST NOT be re-derived carelessly, because getting it backwards in
  either direction is expensive. **`SameSite` is evaluated against the registrable domain, not the
  origin.** A subdomain is therefore **same-site** — so `SameSite=Lax` survives entirely intact and
  no synchroniser token is needed — while being **different-origin**, which is what gives the
  administrative app its own service-worker scope, its own storage, and its own Content-Security-
  Policy. No other topology provides both. A path on the attendee origin shares the origin, and the
  attendee service worker is registered at **root scope**, so it would intercept administrative
  navigations. A separate registrable domain stops `SameSite=Lax` being sent at all, which is
  precisely the 3.0.0 failure: `fly.dev` and `pages.dev` are separate registrable domains on the
  Public Suffix List, the cookie was never sent, and **the configuration could not sign anyone in.**

  **The administrative session cookie MUST be host-only** — no `Domain` attribute — so it is never
  sent to the attendee host and the attendee session is never sent to the administrative one. One
  person signed into both holds **two independent sessions**: an elevated session does not ride
  along with casual attendee browsing, and signing out of one does not sign out of the other.
- **Every deployed environment MUST serve over TLS** with a publicly trusted certificate obtained
  and renewed without manual intervention.
- **The database MUST NOT be reachable from outside its own host.**
- **Backups are a governance obligation, not an operational nicety.** Now that the project
  provisions its own database, no vendor provides point-in-time recovery. Production MUST be backed
  up at least daily on an automated schedule; the schedule, the retention period, and the restore
  procedure MUST be written down; and **the restore MUST have been performed successfully at least
  once before production holds real attendee data.** A documented restore that has never been run is
  a hope, not a procedure.

  **A backup MUST be copied off the host before local artifacts are pruned**, and local pruning MUST
  be conditional on that copy being confirmed. *Added 3.4.0.* Every artifact currently lives on the
  same VM and the same disk as the database it protects, so the most likely event a daily backup
  exists for destroys the database and every backup of it together — which discharges the schedule
  and the retention period while leaving the *purpose* undischarged. This is binding on the restore
  drill too: **a drill run against artifacts that share a failure domain with their source proves
  the wrong thing**, and would convert an untested procedure into a false one.
- **A rollback procedure MUST exist and MUST state what happens when the schema has moved ahead of
  the application.** A rollback path that assumes the database can always follow the code backwards
  is the one that fails when it is needed.

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

  *Amended 4.0.0 by A4.* This clause previously read: "Seed data MUST NOT become a route around the
  organizer-administration exclusion in Principle III. No administrative interface, no privileged
  role, and no content import path may be built without an amendment. Adding a conference is a
  reviewed change to committed seed data." **That amendment is this one.** What replaces it:

  - **Conference content MAY be authored by a conference organizer** in the administrative product,
    within the conferences they are assigned. This is the content-import path the old clause
    forbade, and it is now permitted only through the second actor and only there.
  - **A reviewed change to committed seed data remains a valid route** and is not deprecated. It
    stops being the *only* route.
  - **There is ONE CLASS OF CONFERENCE.** A seeded conference is an ordinary editable conference. No
    privileged content, no immutable content, and no control that renders for a conference it cannot
    act on. Two classes would put two rules in one table and give an organizer affordances that
    silently do nothing.
  - **The seed remains the development and test fixture**, and its fixture properties are load-
    bearing rather than incidental: `assertDisjoint`'s two-fully-disjoint-programmes guarantee, and
    the deliberately empty third conference that exists so the "no programme" state cannot rot. A
    feature that makes authoring the real path MUST NOT take these with it.
  - **A profile is still not conference content.** Each attendee authors their own, and **no
    administrative tier may edit anybody's profile** — the sentence above is unchanged and is now
    load-bearing in a way it was not when no organizer existed. Networking intent and availability
    remain decisions a person makes, not facts an organizer records.

    *Sharpened 5.2.0.* **A speaker is conference content; a speaker is not an attendee.** 014 makes
    speaker records organizer-authored rather than seeded, and an organizer editing a speaker row
    MUST NOT become a route to editing a person's profile — not even where the same human being
    holds both. The two are different records about different things, and the rule above governs the
    profile whatever the speaker row says.

  *Extended 5.2.0 by N4 and N5.* Authoring is live, and it has one prohibition attached:

  - **Conference content is LIVE-EDITED. There is no draft/publish lifecycle**, and a feature MUST
    NOT add one without an amendment. A conference is reachable only by its join code, so an
    unfinished conference is already private to whoever holds that code — a lifecycle would be a
    second gate over a gate that already exists, and a second state for every read path to consult.
    The consequence is accepted rather than hidden: an organizer authors into a conference their
    attendees can already see.

  - **A session ANY attendee has engaged with MAY BE CANCELLED, and MUST NOT BE DELETED.**
    Engagement means a saved session, a private note, a question, or a vote. Deletion stays
    available only while nothing is attached. Cancellation is **stored state** on the session — it
    cannot be derived, unlike 008's `lapsed`, because it is an organizer's act rather than a
    function of the clock — and the attendee state survives it intact.

    This is a **correction of a live hazard, not a preference.** `saved_sessions`, `session_notes`,
    `session_questions` and `question_votes` each cascade from `sessions.id`, so before 014 a single
    delete would have destroyed other people's private writing with no confirmation and no record.
    **009's precedent does not license it**: a withdrawn question takes everybody's votes because
    the *author* exercised erasure over their own words, and that reasoning does not transfer to a
    third party deleting somebody else's — the same non-transfer 009 itself found when 007's answer
    for conversations did not carry across.

    *Bounded 5.3.0 by O2.* **An ENROLMENT in an optional session is NOT engagement, and a session
    with live enrolments MAY be deleted.** The set above stays at exactly four; a fifth kind of
    attachment is declared outside it by owner decision, taken on 2026-08-14 after the consequence
    below was put to the owner and reaffirmed.

    **The consequence is recorded here rather than left to be discovered.** Because enrolling
    *replaces* saving on an optional session, an enrolled attendee holds no `saved_sessions` row —
    so deleting such a session destroys held seats **with no notification, no marker, and no trace**,
    and the person who reserved one finds out by arriving. Delivering this also requires the first
    entry in `NOT_ENGAGEMENT`, a list that is empty by design and whose comment demands each entry
    *"say whose data it is and why losing it silently is acceptable"* — a sentence deliberately made
    hard to write.

    **This sits against the rationale immediately above it, and that tension is the point of writing
    it down.** The rule exists because one delete must not silently destroy what other attendees
    attached to a session, and an enrolment is the strongest such attachment the product has: an
    explicit claim on a bounded resource rather than a bookmark. **It is an accepted cost, not an
    oversight.** A later feature MUST NOT cite O2 as precedent for narrowing the four, and whether a
    deletion should at least notify the enrolled is **register entry 31** — open, blocking nothing,
    and answerable only by a third notification trigger and therefore another amendment.

- **A cached conference may outlive the registration that licensed it, for up to 24 hours, and that
  residual is ACCEPTED** — owner decision 54 (5.4.0, R1), closing register entry 22. Accepted, not
  fixed. Three things bind alongside it.

  **The ground it is accepted on is that no third party can end a registration.** The only way one
  ends today is an act the attendee performs on their own device, which purges that device in the
  same action. **The earlier ground — that the cached data is conference content rather than another
  attendee's personal data — is STRUCK as false**: the cached appointments payload has carried the
  counterpart's display name and the agreed meeting topic since 008, and the cached programme
  carries every speaker's name, title and company. A feature MUST NOT restate it.

  **That ground is protected by a naming convention, and this is the fragile part.** The guard
  asserting no route restricts an attendee selects routes by URL keyword, so a registration-removal
  route passes it green. **The guard MUST be widened to the concept before feature 015 is
  specified**, and **if any feature gives a third party the power to end a registration, entry 22
  reopens** rather than being reasoned around.

  **Two mechanisms are licensed and need no further amendment**: an entry is deleted at the moment
  it stops being readable, so the lifetime bounds retention and not merely serving; and a successful
  online read of the attendee's registered conferences erases the stored copy of any conference
  absent from it, implemented at the composition root rather than in the caching decorator. **Three
  are rejected on evidence** and MUST NOT be re-proposed without new facts: a refusal in any
  repository purging the conference (it fires on a refusal that frequently never arrives), a
  server-sent instruction to forget (impossible — subscriptions are `userVisibleOnly`, and a new
  dispatcher would be a third notification trigger), and keying the stored copy to the registration
  (a disconnected device cannot learn the registration ended).

  **Whether 24 hours is the right span is DEFERRED, not decided.** Since 014 a cached programme can
  be *wrong* rather than merely old, which argues for shortening on grounds of usefulness rather
  than privacy. It is deferred because the cost cannot be priced from this repository — it needs a
  real conference at a real venue, which is what 005 said when it set the value. It returns as a
  product judgement, **not** as a register entry.

- **Home is composed, not aggregated.** Home is a registry of independent cards. Each card owns its
  own loading, empty, and failure states, and a card that fails MUST NOT blank the dashboard or
  prevent any other card from rendering. No card may depend on another card's presence, ordering, or
  data. A feature contributing to Home does so by adding a card and registering it, never by editing
  another feature's card.

  *Rationale*: Home is the first viewport, and Principle III makes the first viewport a success
  criterion. It is also the one surface every feature wants to touch. Composition keeps it improving
  continuously without becoming a shared file that every change contends for.

### Attendee identity, personal data, and profile

Decided on 2026-08-07 and recorded in `brainstorm/04-attendee-identity-and-profile.md`. Binding on
every subsequent feature. These close the last three register entries that blocked phase 004.

- **A person becomes an attendee by signing themselves up.** Account creation is self-serve — email,
  display name, and a password — and registration for a conference happens by entering an access code
  carried on the seeded event row. Email is unique product-wide, not per event, which is what makes
  one account work across every conference.

  This does **not** breach the organizer-administration exclusion, and the reasoning MUST NOT be
  re-litigated by inference. The register offered four candidate models; Principle III and the
  seed-data clause above had already eliminated three of them. *Event invitation* and
  *organizer-provisioned* both require an issuer who is not an actor in this system, and *ticket
  holder* requires an external integration nobody has decided on. Self sign-up is the only model
  under which the attendee remains the sole actor. A join code on a seeded row is seed data, not an
  administrative interface, not a privileged role, and not a content import path.

  *Consequence*: a password recovery flow is now in scope. `attendee_credentials` deliberately holds
  no recovery material, on the strength of this question being open; it is open no longer.

  *Annotated 4.0.0, and DELIBERATELY NOT REWRITTEN.* The premise above — "self sign-up is the only
  model under which the attendee remains the sole actor" — was true when it was reasoned and is now
  historical, because A2 creates a second actor. **D5 is unchanged and MUST NOT be reopened**: how a
  person becomes an *attendee* is untouched by this amendment, and the three rejected models are
  still rejected for reasons that never depended on the sole-actor premise (two need an issuer this
  product still does not have, one needs an undecided integration). The paragraph is preserved as
  written because the reasoning is the artifact, and because 4.0.0's own A2 leans on it directly:
  **self sign-up is unavailable for administrators for the mirror-image reason it was mandatory for
  attendees.**

- **Retention, deletion, and export are self-serve and complete**, per Principle VIII as expanded in
  2.3.0. This supersedes the narrow commitment phase 005 shipped under — notes and saves deleted with
  the account, no export path — which was a correct declared limit at the time and is now discharged
  rather than merely restated.

- **Attendee avatars are uploaded, not seeded or generated.** Resizing and **EXIF stripping are
  mandatory, not optional**: photographs taken on a phone carry GPS coordinates, so storing one
  unstripped publishes where it was taken. An avatar is attendee personal data and MUST be covered by
  both the deletion cascade and the export file.

  Recorded with this: the Unsplash photographs in the prototype are pictures of **real people** used
  as sample data. They MUST NOT ship as seeded attendee faces — the repository is public, and doing
  so would attribute real likenesses to fictional attendees.

- **Image bytes go through `StorageService`** (Principle V), never through a storage SDK called from
  feature code. The production provider is deferred into register entry 11 alongside API hosting and
  the database provider, so no feature is blocked on provisioning it.

- **A profile is visible to attendees registered for the same event**, enforced server-side by the
  existing event-scoping predicate rather than by client-side filtering, and every attendee has a
  single discoverability toggle that removes them from Discover. Visibility is all-or-nothing by
  design; per-field permissions were considered and rejected as disproportionate.

  *Rationale*: this is the exception Principle VIII requires to be recorded rather than assumed. A
  networking product in which nobody can see anybody does not work, but "you registered, so you are
  discoverable, permanently" is not a defensible position next to a self-serve deletion commitment.

  **SHARPENED 3.2.0, after a feature tried to work around it.** There is **one visibility decision
  per attendee**, and it is the discoverability toggle. **No feature may give an individual field
  its own audience** — not a field shown only to some readers, not a field carried only by some
  artifact, not a field disclosed only by some action. Phase 008 specified an attendee-authored
  contact line carried **only** by a shared card and never by the directory, on the reading that
  this clause governs the profile *in the directory* while a card is a second surface. **That
  reading is rejected and the field was withdrawn.** A per-field audience is a per-field permission
  however it is reached, and "all-or-nothing" means what it says.

### Networking relationships and appointments

*Added 3.2.0 by owner decisions taken 2026-08-10 and recorded in
`brainstorm/07-network-and-appointments.md`. This block is where register entries 7 and 8 now live:
both are struck through, and a struck-through entry is not where anybody looks for a rule.*

- **A contact is someone whose digital business card you hold.** There is no connect verb and no
  accept step, because neither appears in `GroundZero/requirements.md` or the prototype. Holding a
  card is the whole relationship, which is why entries 7 and 8 close together rather than
  separately.

  **Contacts MUST NOT be derived from conversations.** Phase 007 made a conversation a *unilateral*
  act — open send, no request, no acceptance — so deriving contacts from threads would let a
  stranger insert themselves into another attendee's Network by sending one message. This half was
  settled by 007 as a consequence of open send, before entry 7 itself was answered.

- ~~**Sharing a card is one-directional.**~~ **SUPERSEDED 2026-08-12 in 5.0.0 by C1. Sharing a card
  is a MUTUAL EXCHANGE.** One act, and both parties hold each other's card. The recipient is not
  asked, and there is no pending state.

  *The original rule, kept because a reader must see what was reversed*: "It gives the recipient the
  sharer's card and gives the sharer nothing; you hold theirs when they share back. **Nothing about a
  person may become durable without that person's own act** — the property worth protecting in a
  product with public self sign-up and no moderator by construction."

  **The metaphor is not the argument, and MUST NOT be cited as one.** That a physical card exchange
  is mutual was available to N2 and was not what N2 was argued from, so it cannot be what unmakes it.
  The operative reasoning is narrower and is the whole licence for this reversal: **a card resolves
  only what its owner already published to co-attendees** under D-16's one-visibility-decision rule,
  so a mutual exchange discloses nothing that discoverability had not already disclosed to the same
  audience. It moves *when* a co-attendee sees those fields, not *whether*. The client reached the
  same position independently, at REQ-046 of the 2026-08-12 extraction.

  **Three things bound it, and an implementation carrying the reversal without them has not
  implemented this rule:**
  - **The exchange writes both records in one transaction, or neither.** A half-completed exchange is
    a state this model has no name for, and the party it would favour is arbitrary.
  - **The escape hatch predates the change and MUST remain.** 007's block already severs card
    resolution in both directions, so the control that answers an unwanted exchange existed before
    the exchange could be unwanted. A block MUST continue to sever both directions.
  - **Everything else about a card is unchanged.** It still cannot be recalled, still resolves the
    sharer's live profile rather than a snapshot, still bypasses discoverability and MUST NOT consult
    verification. This amendment changes the *direction* of the act and nothing else about it.

  **What is NOT decided**: whether a mutual exchange requires the *recipient* to be discoverable at
  the moment of sharing. Sharing checks it today; resolution deliberately does not. A first
  acquisition is neither case, and the feature that builds this MUST decide and declare it rather
  than inherit either answer.

- **The stored record is the exchange, not the person**: sharer, recipient, the instant, and the
  event it happened at. A held card MUST resolve the sharer's **current** profile at read time. A
  snapshot is forbidden: it duplicates personal data, outlives the subject's own edits, and creates
  a second source for one person.

- **A shared card is standing consent that outlives both the event and the discoverability toggle.**
  Resolution MUST therefore bypass the directory's discoverability condition, and MUST NOT require
  the two attendees to share a current event. **Discoverability governs being *found*, not being
  *remembered*.**

  Resolution MUST NOT consult verification state. Verification gates discoverability and nothing
  else, and re-checking it here would be a second use of it — which Principle VIII's shipped
  invariant forbids.

  *Rationale*: Discover is per-event **and deliberately uncached**, so before this nothing durable
  survived a conference at all — while D1's own rationale already promised that "a contact made at
  last year's conference must not vanish". Network is the durable half of a product whose discovery
  surface is transient by design, and this clause is what makes the older promise true.

- **A card cannot be recalled.** Blocking is the control: a block MUST sever card resolution in both
  directions and MUST also prevent scheduling. Following 007, a block suspends and is reversible; it
  destroys nothing.

- **An appointment is proposed, then accepted or declined.** This takes an acceptance step that 007
  refused for conversations and that this amendment refuses for cards, and **the asymmetry is
  deliberate rather than drift**: a message and a card impose nothing on the other person, whereas
  an appointment claims a slot of their time, and reserving another person's time is a different
  act.

- **Meeting-slot availability MUST disclose nothing about the invitee.** Deriving offered slots from
  the invitee's saved sessions, appointments, or any other private state is **forbidden**, as is
  auto-declining on their conflicts. Both leak a private schedule *by omission* — greying out
  somebody's committed slots tells the reader where that person will be all day. Availability MUST
  be a function of the reader's own commitments alone.

  *Rationale*: this is a Principle VIII violation that looks like a feature, which is why it is
  written down. The delivery roadmap proposed the forbidden variant by name, and a calendar product
  would do exactly it.

- **No appointment raises a notification.** Not a proposal, not an acceptance, not a decline, not a
  cancellation. The trigger set stays at **a received message and nothing else**, per "Notification
  delivery" below, and a feature wanting a second trigger MUST amend that block.

### Audience questions

*Added 3.2.0 by an owner decision taken 2026-08-10. This block is where register entry 9 now lives.*
*Extended 3.3.0 by Q1, taken the same day at 009's spec review, with the visibility exception that
attribution turned out to carry and the three consequences that bound it.*

- **An audience question is attributed to its author.** Anonymous questions were the alternative and
  were not chosen. A question therefore carries the asking attendee's identity, and so does a vote.

- **A question becomes public to the event ONCE A MODERATOR APPROVES IT**, with no opt-out from that
  publication. *Amended 2026-08-12 in 5.0.0 by C2: publication was immediate on asking from 3.3.0
  until then.* This is the second recorded exception to Principle VIII's "private content stays
  private", and it is recorded there as well as here. Every attendee registered for the event sees
  every **approved** question asked at it, with the asker's name attached, **including questions
  asked by an attendee who has turned discoverability off**.

  **That name is the asker's first name plus the initial of their surname — "Ana R." — decided
  2026-08-15 in 5.4.0 by R2, closing register entry 27.** It applies wherever a question is
  displayed: the attendee's phone, the moderation queue, and the projected screen. 3.3.0 had bound
  the full real name; the client asked for the first name alone (REQ-062, REQ-063) and her own
  extraction recorded the thread as unresolved (OPEN-002). **The chosen form is neither of those
  two**, and was absent from the entry's own list of options — it answers the case that decides the
  question, which is two attendees named Ana whose questions appear together on a hall wall, while
  putting no surname on that wall.

  **Two obligations travel with it and an implementation lacking either has not implemented this
  rule.** The unthrottled block lookup MUST be closed in the same feature: `POST /blocks` carries no
  throttle and `GET /blocks` returns the target's live display name and avatar bytes, so an
  abbreviated name without that closure **relocates disclosure rather than reducing it**. And the
  client MUST be told that her stated wording was read as being about register and tone rather than
  about the surname as such — **the decision is in tension with her literal words**, and if her
  concern proves to be findability instead, it was wrong on its own reasoning and should be
  revisited.

  Attribution itself was never in question: a question is attributed, and anonymity remains
  unchosen. **The system MUST still know the true author whatever is displayed** (REQ-061), which is
  unchanged and compatible with this form.

  Three consequences bind alongside it, and an implementation that carries
  the exception without them has not implemented this rule:
  - **Attribution MUST NOT consult verification state.** Verification gates exactly one thing —
    discoverability — and this constitution has held since 2.3.0 that no feature may use it for
    anything else. A question is not a profile, and re-checking verification here would be a second
    use of it.
  - **The author's name MUST NOT be a route into their profile.** The name attributes the question;
    it does not open the person. Q&A publishes that somebody spoke, not who they are — and a name
    that navigates would hand the directory's own visibility decision to whoever reads a session.
  - **The attendee MUST be told what will be published, before they publish it.** An exception with
    no opt-out is only defensible if nobody meets it by surprise. The warning is part of asking, not
    a setting somebody could have read beforehand.

  *Rationale*: the exception is what the attribution decision actually cost, and it was nearly not
  written down — attribution entails it, and entailment is exactly how an unaccepted privacy
  exception ships. The three consequences are here rather than only in a feature specification
  because a specification governs one phase and this governs every phase after it.

- **A question is moderated before it is public.** *Added 2026-08-12 in 5.0.0 by C2.* The sequence is
  **submit → moderate → publish → vote**, and votes are only ever cast on published questions. A
  moderator MUST be able to approve a question, refuse it, and remove one already published; MUST be
  able to mark a published question **resolved** or **pending**; and MUST be able to group manually
  identified duplicates. Pending questions MUST survive the end of the event they were asked at, and
  automatic grouping of similar questions is **not** required — the client accepted manual
  consolidation for a first version.

  **The premise that forbade this has expired, and that is the whole justification.** This block used
  to read: *"organizer administration is excluded by construction, so there is no moderator and there
  will not be one."* Every word of that was true when written and the second clause is now false —
  **4.0.0 created the actor**. 009 recorded the cost of the exclusion against itself in exactly these
  terms, which is why this reads as a premise expiring rather than as a change of mind. It is the
  same shape that forced the administration reversal three days earlier: an exclusion whose price is
  an unkeepable safety promise gets paid for or reversed.

  **Moderation does not replace reporting; the two cover different moments and both MUST ship.**
  Moderation is pre-publication and catches what should never have been shown. Reporting is
  post-publication and catches what a moderator approved and should not have. A question MUST
  therefore remain reportable from the question itself, on the disposal path 3.1.0 made binding — the
  report leaves the product as operator mail, blocks in the same action, and is readable from nowhere
  inside MyNet. Blocking MUST continue to make the two attendees invisible to each other in Q&A, in
  both directions. **A public surface with no moderator and no report control MUST NOT ship** — and
  it now has both rather than only the second.

- **A moderator reading an unpublished question is NOT a fourth Principle VIII exception**, and the
  reasoning is recorded here so that nobody has to derive it and nobody mistakes its absence for an
  oversight. Content submitted **for publication** was never private: the act of asking is a request
  to be read by the room, and whoever decides publication is necessarily among the first readers.
  There is no expectation of privacy to except from.

  **A refused question is the case that needs a rule, and it does not get one by inference.** It is
  attendee-authored content that never became public and is still stored, so it is personal data
  under Principle VIII like any other: it MUST be reached by the deletion cascade, MUST appear in the
  export, and its retention MUST be declared by the feature that introduces it. The two coverage
  tests will fail that feature's build until it is, which is the mechanism working as designed.

- **Who moderates follows from 4.0.0's authority scoping and is not a new grant.** A question belongs
  to a session, a session to exactly one conference, and a **conference organizer's** authority
  reaches the conferences they are assigned — so Q&A moderation falls inside authority that already
  exists, and a platform operator retains the product-wide authority they already hold. What is
  **not** settled by that: the client describes an event having several coordinators (REQ-065), and
  whether one conference may carry multiple organizer assignments is a question for the feature that
  builds this rather than a licence it inherits.

- **The projected view is a display, not a workspace, and MUST NOT become a privileged view in
  MyNet.** A screen in a hall showing approved questions in live vote order has a fourth audience —
  a room, possibly with no signed-in reader at all. Standing decision A2 forbids MyNet growing an
  administrative or role-dependent surface, and that is untouched here: wherever this view lives, it
  MUST NOT be a mode that MyNet renders for some readers and not others. Which product hosts it, and
  what it requires of an unauthenticated reader, are for the feature to decide and declare.

- **Q&A is consequently a personal-data surface under Principle VIII**, and this is the operative
  consequence rather than a note. Questions and votes MUST carry identity scoping enforced
  server-side, MUST be reached by the deletion cascade, and MUST appear in the export — exactly like
  any other attendee data. The feature that introduces them declares each, and the two coverage
  tests fail its build until it does.

  *Rationale*: entry 9 was phrased as deciding *whether* Q&A is a personal-data surface. It is now
  decided that it is, so the phase building it inherits the full weight of Principle VIII rather
  than a lighter regime for "just content".

- **Deletion is harder here than the register anticipated, and 3.2.0 did not solve it.** A departing
  attendee's question may sit on a session other attendees have upvoted. 007 settled the analogous
  problem for conversations — the departing party's words vanish, the survivor keeps their own — but
  the three options do not resolve the same way for a question with other people's votes attached to
  it. **The phase that builds Q&A MUST decide and declare this**; it is not licensed to assume 007's
  answer transfers.

  **DECIDED in 3.3.0 by phase 009, which is the phase that was told to decide it.** A departing
  attendee's question is **removed**, and **other people's votes on it are removed with it** — the
  question cascades from `attendees` on its author reference, and a vote cascades from **both** the
  voter and the question. There is **no one-sided survivor here, and that is where this parts
  company with 007**: a conversation holds the survivor's own words, so something of theirs remains
  to preserve; a vote holds nothing but agreement with a question that is gone. An orphaned count on
  a vanished question would be a record of what somebody said, kept after they left, which is the
  one thing Principle VIII's deletion rule exists to forbid. The obligation above is **discharged**,
  and it is left standing rather than struck so the next reader sees what was asked as well as what
  was answered.

### Notification delivery

*Added 3.1.0 by M4, M5 and M7. This block is where register entry 10's surviving half now lives:
the entry is struck through, and a struck-through entry is not where anybody looks for a rule.*
*Extended 5.2.0 by N1 and N2 — the trigger set becomes two, and the second is bounded by a named set
of changes rather than by a description.*

**Engagement notification delivery is in product scope, for TWO triggers and nothing else.** Until
3.1.0 it was excluded outright; from 3.1.0 to 5.2.0 there was exactly one trigger. The boundary is
narrow by construction rather than by convention, and widening it cost something that is named at
the end of this block rather than glossed.

- **There are exactly TWO triggers, and they are enumerated here.**

  1. **A received message.** *3.1.0, M4.*
  2. **A material change to a session the attendee has SAVED or is ENROLLED IN.** *5.2.0, N1;
     population extended 5.3.0.* **Material means exactly three things: the session is cancelled, its
     start time changes, or its room changes.** The principle the set follows from MUST be applied
     when reading it — a notification is raised when a change affects **where or whether the attendee
     must be somewhere**. A title, a summary, or a change of speaker is content, and content does not
     strand anybody in the wrong corridor.

     **5.3.0 widened this trigger's POPULATION and not the trigger SET, and the distinction is
     load-bearing.** 014 tranche 2 makes enrolling **replace** saving on an optional session, so an
     attendee holding a seat has no saved row — and under N1 as originally worded they would have
     been told nothing when that session was cancelled or moved. That is the precise stranding this
     trigger exists to prevent, so the fix is to widen *who is notified*, not *what notifies*. **The
     three material changes are unchanged and no third trigger is added.**

     **A feature widening the population is not thereby licensed to widen the set**, and the reverse
     also holds. The two are separate questions and this is the first amendment that has had to say
     so: the set governs what the product may interrupt somebody about, and the population governs
     whose attachment to a session counts as being affected. A new way of attaching to a session
     raises the second question and MUST NOT be read as answering the first.

  **A session STARTING is not a trigger and remains forbidden**, and so do an appointment, an
  audience question, and an announcement. The distinction between a session *starting* and a session
  being *changed by an organizer* is load-bearing rather than pedantic: the first is a reminder the
  attendee could set for themselves, the second is information only the product holds. Reading N1 as
  licensing "starting soon" alerts would reverse 3.1.0's entire reasoning while appearing to follow
  it.

  **A feature that wants a third trigger MUST amend this block.** Enforced by test, not by
  convention: a trigger set that can only be widened deliberately is the difference between a
  bounded capability and a channel every later feature helps itself to.
  `apps/api/tests/unit/notification-triggers.test.ts` is that test — it walks the real source tree
  and names the files permitted to dispatch — and an amendment widening the set MUST edit it in the
  same change. **Editing that test IS the conversation**, and a feature that finds itself editing it
  without an amendment has already gone wrong.

- **The notification bell MUST NOT be reproduced, and neither MUST an in-app notification centre.**
  This is entry 10's original prohibition, carried forward **unchanged and unweakened**. Delivery
  and an inbox are separable, and bringing the first in does not bring the second. The prototype
  header's bell with its unread dot remains forbidden.

  *Extended 5.2.0 by N2.* 014 marks a changed saved session **on the row itself**, in Agenda and on
  Home. That marker is **per-row state about one session the attendee saved**, and it MUST NOT
  become an inbox: no aggregate count, no list of changes, no surface whose subject is "things that
  happened" rather than "this session". The distinction MUST be testable as an absence, in the shape
  009's and 013's absence guards already establish. It is written down because a per-row marker is
  the natural first step toward the centre this rule forbids, and the second step would not feel
  like a decision at the time somebody took it.

  **This prohibition governs surfaces INSIDE the product, and that scope is deliberate.** One
  organizer act may materially change several of an attendee's saved sessions at once, and it
  dispatches **one coalesced notification whose body carries a count** rather than one notification
  per session. A notification is a single interruption by its nature, and a dozen interruptions from
  one act is precisely the product 3.1.0's exclusion existed to prevent — so a count is permitted
  **in the payload** and forbidden everywhere it could become something to look at. Two rules make
  that boundary hold rather than blur: **activating such a notification MUST land on the destination
  carrying the per-row markers**, never on a list of what changed; and **no view inside either
  product may present that count**. The moment a screen answers "how many things changed", this rule
  has been broken regardless of what the payload does.

  *Bounded 5.3.0 by O3, which is a different count and is permitted.* **An attendee MAY be shown the
  number of remaining places in an optional session** — "4 places left". This is **not** the count N2
  forbids, and the difference is the subject rather than the arithmetic: N2's subject is *things that
  happened*, which is what turns a marker into an inbox, while a remaining-places figure is a fact
  about **one session's availability** at the moment the attendee is deciding whether to take a seat.
  It is written down because it is the same *family* — a number about other attendees' state on a
  screen — and inheriting that by silence is what this project records rather than does. **N2 is
  untouched and unweakened**: no aggregate of changes, no list of changes, and no surface whose
  subject is what happened.

- **Delivery MUST go through `NotificationService`** (Principle V), over a domain shape rather than
  the browser's own `PushSubscription` type. The signing key is a secret and MUST NOT appear in
  feature code; the server-side port MUST stay vendor-free.

  *Corrected in 3.4.0.* This rule read "a push provider is an external dependency and a secret".
  **There is no push provider and there never was one** — Web Push signs with the project's own
  VAPID pair and posts to whatever endpoint the browser issued, with no account, no SDK and no third
  party. The vendor-free requirement is unchanged and was met by 007; what is corrected is the
  premise, which had been carried since 3.1.0 and had a register entry attached to it.

- **The VAPID private key is held as one pair per environment**, generated once, stored as a
  repository *environment* secret and injected into that host's `.env` at deploy time — the same
  path as every other secret this project holds, deliberately, so that key custody is not a second
  mechanism to reason about. **It MUST NOT be rotated except on compromise.** *Added 3.5.0 by L5.*
  Rotation invalidates every existing subscription, so every attendee silently stops receiving until
  their browser re-registers — and nothing in the product tells them to, or could. A routine
  rotation schedule would therefore be a routine outage of a capability nobody would notice failing.
  A rotation that does become necessary MUST be treated as a delivery outage and planned as one.

- **Permission is deniable, so notification delivery MUST NOT be the only path to freshness.** Every
  capability except delivery itself MUST work identically for an attendee who refuses permission,
  and refusing MUST NOT degrade any other surface. An attendee who says no gets a complete product.

- **Notification content is personal data on a lock screen, and that consequence is ACCEPTED rather
  than solved.** M7 puts message text in the payload, on the reasoning that a notification saying
  only "you have a message" makes the attendee open the application to learn whether it mattered —
  which is most of the value gone. The cost is real: message content becomes visible on a locked
  device to whoever is holding it. **Whether an attendee may suppress content in notifications was
  not decided**, and it is recorded here as outstanding rather than closed. Principle VIII's
  collect-only-what-a-requirement-names rule is unaffected: nothing new is stored.

  *Extended 5.2.0 by N1.* The same consequence now reaches a **second** content type: a
  saved-session notification carries a session title, which discloses what the attendee chose to
  attend to whoever is holding the device. It is accepted on the same reasoning — a notification
  saying only "something changed" sends them into the app to find out what, which is most of the
  value gone — and it is still **not solved**. Because it has now gone undecided across two
  amendments, it is promoted from a deferral in prose to **register entry 29**. Recording it a
  second time in the same words is how it would have stopped being noticed.

- **Subscriptions are per device, not per session.** Signing out MUST NOT revoke one; revoking
  permission and a permanent delivery failure MUST. A subscription record holds credentials rather
  than content, and MUST NOT be reproduced in the personal-data export — the presence of a device
  and its timestamps are a record, the keys are a capability.

*Rationale*: a networking product's value is a timely reply, and a message discovered an hour after
a session ended is worth very little. That is the whole of what M4 buys, and it is why the reversal
is narrow: the exclusion existed to keep MyNet from becoming a product that interrupts people, and
one trigger tied to a message somebody actually sent does not make it one.

*Rationale for the second trigger (5.2.0)*: 014 lets an organizer change a programme attendees are
already relying on, and the two failure modes it creates are physical rather than informational —
walking to a room that moved, and arriving for a session that was cancelled. Neither is discoverable
by an attendee who has no reason to re-open the app, which is precisely the case a notification
exists for. **What keeps this consistent with M4's reasoning rather than a departure from it**: both
triggers are somebody else's act, addressed to this attendee, that the attendee cannot learn any
other way in time. A session starting is none of those things, which is why it stays out.

*What widening it cost, recorded because the property was load-bearing*: "there is exactly one
trigger" could be checked by reading one sentence. "There are two, the second bounded by three named
changes" cannot. The enumeration above is what replaces that property, and it is only as good as its
refusal to be reasoned wider — which is why N1 names the three cases instead of stating the
principle alone, even though the principle is what generated them.

### Reporting conduct out of the product

*Added 3.1.0 by M8.*

*Narrowed 4.0.0 by A5 — narrowed, not lifted. The heading still says "out of the product" and that
is now true of the **attendee** product only.*

**A report MUST leave the attendee product as mail to a configured operator, and MUST NOT be
readable from inside MyNet.** No route, no repository method, no screen, no privileged role, in the
attendee product. FR-548 and `no-report-read-surface.test.ts` survive for MyNet unchanged, and the
reasoning that produced them is unchanged with it: a reporter is told nothing it cannot keep — no
case identifier, no status, nothing to poll.

**A platform operator MAY read reports in the administrative product.** The original clause rested
on an argument that no longer holds — "a report-reading surface needs a moderator, and a moderator is
an organizer — the actor Principle III excludes by construction" — and the excluded actor now exists.
Three conditions bind that surface:

- **Only the platform tier.** A conference organizer MUST NOT read reports. A report names two
  attendees who may share no conference with the organizer, and conduct reported at one event is not
  an assigned conference's business.
- **It discloses the reported content and the reporter's stated reason** (*decided 4.1.0 by A8,
  resolving register entry 24*), under the four conditions recorded with the **third** Principle VIII
  exception: platform tier only, only what was reported, only in the queue, and nothing back to the
  reporter. **The operator-mail rule below is unchanged** — mail still carries identifiers and a
  timestamp and nothing else, because the reason it was written that way was that an inbox lives
  outside every retention rule this project controls, and a queue reading the row does not.

  **The queue MUST render *content unavailable* as a first-class state.** Reported message
  identifiers are stored as a plain array rather than a foreign key precisely because the messages
  are often gone before anyone looks, so an empty content pane is the expected case and MUST NOT be
  presented as an error or as a report of nothing.
- **The reporter is still promised nothing.** A queue existing MUST NOT become a status the reporter
  can see. FR-548's absence of a reporter-facing surface is not what this amendment narrows.

- **Reporting MUST also block**, in the same action. Somebody reporting conduct wants it to stop
  now; a report that only files paperwork leaves them reachable by the person they just reported.
- **Operator mail MUST carry identifiers and a timestamp only** — never message text and never the
  reporter's reason. Both are two attendees' personal data, and an inbox is outside every retention
  rule this project controls, for a recipient who can query the database directly.
- **A failure to dispatch MUST NOT fail the report or the block.** Safety cannot depend on an
  external service succeeding. This rule is unchanged now that a provider and an address exist:
  Mailgun being unreachable MUST still leave the block applied and the report recorded, and the
  failed dispatch MUST be logged rather than silently dropped.
- **Reports are dispatched to `apps@programasemilla.com`**, sent through Mailgun. *Added 3.5.0 by L4
  and L6, resolving entries 18 and 21.* **Naming the address does not discharge the obligation
  attached to it.** The reporting dialog tells the attendee that a person will read it, and the
  product deliberately promises nothing further — no case identifier, no status, nothing to poll,
  because FR-548 forbids the surface that would answer any of them. That sentence becomes true only
  when somebody actually reads the inbox, and keeping it true is an ongoing obligation the project
  owner personally holds rather than a configuration value that has now been set.
  *Changed 4.0.0*: the obligation is no longer discharged by mail alone. A platform operator reading
  the queue keeps the dialog's promise without any message being sent — so what entry 21 now asks is
  **who that operator is**, which remains an obligation the owner personally holds. The mail path is
  not deleted, and must not be: an operator who has to open a site to learn a report exists is an
  operator who learns late.

### Brand identity and application icons

*Added 3.4.0 by B1–B5. This block is where register entry 2's answer now lives: the entry is struck
through, and a struck-through entry is not where anybody looks for a rule.*

**The project owner's brand board is the single source of every brand asset**, supplied 2026-08-10.
Until then no mark existed here, and none was invented — Principle I forbids answering a question
nobody asked, and a mark is exactly such a question.

- **Two sources as of 5.0.0, each bound to named surfaces**, and derived assets rather than delivered
  ones either way. *Amended 2026-08-12 by C4; there was one source from 3.4.0 until then.*
  `assets/brand/logo.png` — the owner's board — remains the source for **every in-app mark**.
  `assets/brand/new-logo.png` is the source for **the install icons and favicons only**.

  **This is an icon change and explicitly NOT a rebrand.** The owner ruled so on 2026-08-12. The
  in-app coral mark is untouched, on the rail, the top bar and the five authentication screens, and
  **register entry 23 is unaffected** — the token-adoption question concerns the board's navy and
  coral, which this change does not alter.

  **The consequence is that MyNet now shows one mark on a home screen and a different one inside the
  app, and that is knowingly accepted rather than overlooked.** It is recorded so that a later reader
  does not "fix" it, and it is why register entry **28** exists: which of the two marks is this
  product's is now an open question, and no feature may answer it by quietly replacing the other.

  **The second source is a raster of a lockup and needs three things said about it, because each
  contradicts something this block already binds.** It is 114×133 pixels against a board of
  1254×1254; it carries an alpha channel where the board carries none; and it depicts a wordmark
  beneath a mark.
  - **The wordmark MUST be cropped away.** "A raster lockup is forbidden" is unchanged and applies
    here: what an icon derives from is the mark, never the mark plus rendered text.
  - **The plate colour MUST be chosen deliberately and its choice recorded**, because the derivation
    that produced the board's navy does not transfer. That derivation was mechanical — the board has
    no alpha, so the mark's edges are blends against its own navy and any other plate haloes. A
    source *with* alpha has no such constraint and therefore no such answer.
  - **The upscale MUST be a measured, named exception rather than a relaxed check.** Filling a 512px
    icon from this source is roughly a fourfold enlargement, and the audit that fails a build on any
    upscale is deliberate — 010 established it after finding one asset drawn at 1.06× and fixed the
    *asset*. The rule that replaces it MUST name this file, this factor and these outputs, so that a
    second upscale arriving later still fails. **Weakening the check until it stops checking anything
    is forbidden**, which is the discipline 4.0.0 applied to the five administration guards.

  **The derivation rule itself is unchanged and now applies twice over.** Every icon, favicon and
  in-app mark MUST derive from its tracked brand source **by a readable script**, not be committed as
  an opaque binary of unknown provenance. A reviewer MUST be able to verify the crop geometry, the plate colour
  and the maskable safe-zone inset by **reading code**, and the script MUST fail loudly rather than
  emit a plausible asset from an unexpected source. This is the convention the provisional generator
  established and it is retained deliberately: it is what makes a later vector redraw a change of
  *input* to one pipeline rather than a second, divergent mechanism.

- **The brand constants are a reasoned exception to the single-colour-definition rule, and the only
  one.** FR-008 puts every colour in the token file and the manifest gets no exemption — the
  manifest's two values are *read from* the tokens at build time rather than written beside them.
  The brand's navy and coral are different in kind: they are **identity, not palette**, they are
  measured from the board rather than chosen, and they deliberately do **not** move when a token
  moves. The reason is mechanical rather than aesthetic and MUST be recorded where they are defined:
  the board carries no alpha channel, so the mark's antialiased edges are blends against its own
  navy, and any other plate colour leaves a visible halo around every curve.

- **Whether the design tokens adopt the brand's values is undecided** — register entry 23, corrected
  from 22 in 5.4.0's hygiene pass; 22 is the cache gap, closed by R1 — and
  until it is settled the icon plate and the token-derived `theme_color` differ visibly on the
  splash screen. That seam is **accepted knowingly**, not overlooked. No feature may resolve it by
  quietly repainting a token: the primary surface and the accent are involved, so it repaints the
  whole product and every contrast ratio must be re-verified.

- **The mark ships as an image beside live text. A raster lockup is forbidden.** The product name
  stays real text from the single branding constant (FR-049), so it remains selectable, searchable,
  translatable and legible to assistive technology at any size.

- **The mark is decorative and MUST NOT replace an accessible name.** Adding it to a surface MUST
  leave every existing heading, label and landmark exactly as it is — a mark is recognition, never
  the only way a surface identifies itself.

- **Colourway is chosen per surface, and getting it wrong is an absence rather than a degradation.**
  A dark-on-light mark placed on the inverse surface is invisible while remaining present in the
  DOM, correctly sized, and passing every behavioural assertion available. The board supplies two
  colourways precisely because this choice has to be made.

- **A declared icon with no file MUST fail the build.** Expectations MUST derive from the
  declarations themselves — the manifest and the document head — so that a **newly declared icon
  fails by existing** rather than waiting for someone to remember to extend a check. This is the
  technique Principle VIII's deletion and export coverage tests use, applied to the one class of
  asset whose failure is invisible to every other gate: a manifest may name a missing file while
  typecheck, lint, unit, component, contract, migration, integration, accessibility, end-to-end and
  the production build all pass, and the failure appears only when a real device tries to install.

- **Install weight has no gate, and MUST therefore be stated by hand.** The asset budget measures
  the initial shell JavaScript — the entry chunk and what it statically imports — so static files
  never enter it, while the service worker precaches every image it finds. Any feature adding
  install assets MUST record their weight in a durable place and MUST exclude from the precache set
  anything the *installed* application never shows.

*Rationale*: the placeholder this replaces was struck through with an amber band on the reasoning
that "a tasteful placeholder is the dangerous kind: it looks finished, so it ships and nobody
notices for a year." The same instinct governs here. A brand mark is the one deliverable in this
product whose defects are invisible to every automated gate this project has — wrong colourway,
wrong size, wrong position, illegible at 16px — and the discipline that replaces those gates is a
readable derivation and a human who looks.

### Administration, and the second actor

*Added 4.0.0 by A1–A6. This block is where the reversal of Principle III's administration exclusion
lives, and it is written as binding text rather than as a resolved register entry for the reason
3.1.0, 3.2.0 and 3.4.0 each gave: a struck-through entry is not where anybody looks for a rule.*

**Administration is a SEPARATE PRODUCT.** It is its own website, served against the same API and the
same database. MyNet MUST NOT gain an administrative surface, a privileged view, or rendering that
branches on who is looking. This is not a packaging preference — it is what keeps Principle III's
attendee-workspace framing true while its actor clause is redefined, and it MUST be enforced as an
absence in the attendee product rather than asserted in prose.

**There are exactly TWO administrative tiers, and neither is reachable by self sign-up.**

- **Platform operator.** Seeded as committed, reviewed data, because the tier has to exist before
  any conference does and there is no issuer to invite the first one. Authority is product-wide. It
  is the **only** tier that may promote an attendee, and the **only** tier that may read the report
  queue.
- **Conference organizer.** An attendee promoted by a platform operator. Authority reaches **only
  the conferences they are assigned**, and is otherwise that of an ordinary attendee.

  A conference organizer **is** an attendee, with a real profile, who continues to use MyNet as one.
  **Promotion MUST NOT alter their attendee experience** in any observable way — it grants capability
  in the administrative product and nothing in this one.

  *Extended 5.2.0 by N3.* **A conference organizer MAY CREATE a conference, and is assigned to the
  conference they create.** This is the **only product-wide capability the tier holds**, and it is
  stated here rather than inferred because the clause above — "authority reaches only the conferences
  they are assigned" — cannot describe the act of creating one. Two bounds travel with it and are
  what keep A2 true in substance:

  - **Authority over a conference they did not create still comes only from assignment** by a
    platform operator. Creating grants authority over the new conference and reaches no existing one.
  - **It is not a promotion path.** Creating a conference does not widen the tier, does not grant
    any platform-operator capability, and gives no route to promote anybody — promotion remains
    platform-tier only, and A2's no-self-sign-up rule is untouched.

  **Nothing bounds how many conferences an organizer may create**, which is bounded by trust rather
  than by a limit, because promotion is itself platform-tier only. That is recorded as accepted
  rather than overlooked.

  *Extended 5.3.0 by O1.* **A conference organizer MAY read the names of the attendees enrolled in an
  optional session of a conference they are assigned to.** This is the tier's **second** bounded
  capability over attendee data and the **only** one that reads it at all, so it is stated here as
  well as under Principle VIII, where the exception and its four scoping conditions live.

  **It narrows FR-1042 and does not withdraw it.** No administrative tier may read a saved session, a
  private note, a question, or a vote — that absence is untouched, and its guard MUST continue to
  fail any administrative route addressing them. What changes is one path, for one relation, for one
  tier, over its own conferences. **A route granting this MUST be addressed and named so that its
  scope is legible**, because the guard it edits was written on the reasoning that *"a path is a
  promise"*, and a promise narrowed silently is a promise broken.

**No self sign-up into either tier** is the load-bearing rule, and it is the exact mirror of D5.
Self sign-up was chosen for attendees because it was the only model that left the attendee sole
actor; it is unavailable here because anyone who can sign themselves up as an administrator is not
an administrator. A tier reachable by self sign-up would be a privilege escalation with a form.

**What MyNet MUST NOT gain**, and each MUST be testable as an absence in the same way 007's and
009's absence guards are:

- No administrative route, screen, or navigation entry in the attendee client.
- No rendering that branches on administrative tier.
- No report-reading surface (FR-548 survives for the attendee product; see "Reporting conduct out of
  the product").
- **No administrative edit of any attendee profile, by either tier.** Conference content is
  authorable; a person is not.

**The administrative product inherits obligations rather than escaping them.** Being a second site
is not a second standard:

- **Principle IV** binds it. Accessible labels, visible focus, keyboard operability, Escape-key
  dismissal, and three layouts. Register entry 4 — desktop and tablet layouts have never been
  validated — is **escalated** by an entire product of new desktop design, not answered by it.
- **Principle VII** binds it. Every gate that runs for the attendee client MUST run for this one.
- **Principle VIII** binds it, and reaches further here than anywhere else: an administrative read is
  still a read of personal data, still scoped server-side, still refused rather than filtered in the
  client. **Authority MUST be a server-enforced predicate**, in the shape `EventScope`,
  `ConversationScope` and `CardScope` already establish — never a claim the client presents.
- **Principle IX** binds it, and its completeness declaration MUST additionally state **which actor
  and which tier** each surface serves. Every feature through 010 had one actor and never had to say
  so; from 013 silence about the actor is an undeclared obligation.
- **Deletion, export, and retention MUST be answered explicitly for every new table**, not inherited.
  A platform operator has no `attendees` row, so the cascade that covers every existing personal-data
  table does not reach one. Both coverage tests derive expectations from the schema, so a new table
  fails by existing — which is the mechanism working, and the answer must be written down rather than
  allow-listed.

**Three things 4.0.0 deliberately did NOT decide are now decided, by 4.1.0.** They were opened as
register entries 24, 25 and 26 rather than left as gaps, and each turned out to be governance rather
than a specification detail — which is the argument for opening entries you cannot yet answer.

- **Where administration is served, and whose session it uses** (A7, entry 26). A **subdomain** of
  the same registrable domain, `/api/*` reverse-proxied under it, and a **host-only** session cookie
  so an operator holds two independent sessions. Stated in full under "Deployment environments",
  because it is a topology rule and belongs where D11 lives.
- **What the report queue discloses** (A8, entry 24). The **reported content and the reporter's
  stated reason**, to platform operators only. This is the **third** recorded Principle VIII
  exception; its four scoping conditions and the *content unavailable* requirement are stated with
  the exception itself, under Principle VIII.
- **An organizer's assignments end with their access** (A9, entry 25). **Deletion is never
  conditional** — D6 holds absolutely, and no administrative role may make an attendee's erasure
  right depend on another person existing. Instead:
  - **Deleting an account revokes that person's organizer assignments in the same transaction.**
  - **Withdrawing from a conference revokes the organizer assignment for that conference**, in the
    same transaction, for the reason 008 established when withdrawal began cancelling live meetings:
    **authority MUST NOT outlive the access it depends on.** A withdrawn organizer fails
    `requireEventAccess` and can no longer see the conference as an attendee, so an assignment left
    standing is authority nobody can observe being exercised.
  - **A conference left with no organizer enters an explicit `unassigned` state**, and platform
    operators MUST have a surface that shows it. The conference and its content survive untouched —
    conference content is not attendee data and no cascade reaches it — so the failure mode being
    prevented is not data loss but **silence**: an orphaned conference that nobody is prompted to
    adopt. Reverting ownership implicitly to the platform tier was considered and rejected for
    exactly that reason; it produces a tidier invariant and hides the event.

**Register entries 19 and 21 remain ADDRESSED but NOT closed**, and 4.1.0 does not change that. A8
gives an operator what they need to *judge* a report; it does not decide **who that operator is**
(21) or **what standard an avatar is moderated against** (19). A feature MUST NOT read either as
closed — Principle I applies to this block exactly as it applies to everything else.

*Rationale*: this reversal was not sought for its own sake. The product accumulated three
obligations it had no actor to discharge — an unmoderated avatar (entry 19), a reporting dialog
promising a human reader (entry 21), and a public many-to-many Q&A surface with no moderator (009) —
and each was traced back in writing to this exclusion. An exclusion whose cost is a safety promise
the product cannot keep must be paid for or reversed. What makes reversing it affordable is A3: the
attendee product is left exactly as it was, so the thing Principle III protects is not what changes.

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
branch protection, which is **unconfigured** on this repository — not unavailable. Verified
2026-08-07: `branches/main/protection` and `branches/develop/protection` both return **404, meaning
no rule is set**, and the `rulesets` endpoint returns an empty list. The repository is public and
organisation-owned (`Programa-Semilla/mynet-ps`), and branch protection is free on public
repositories, so **nothing external prevents closing this gap**. Applying the configuration recorded
in `.githooks/README.md` is a configuration task that MUST be completed. Until it is, the gap is a
known and *unnecessary* risk rather than an accepted one. **With real attendee data now in scope,
this gap is materially more serious than it was under 1.x.**

### Parallel work and shared artifacts

Features run mostly one at a time, in parallel only where they touch disjoint files. Where two do
run in parallel, the following apply.

- **Migration numbers are claimed at generation, not reserved in advance.** *Replaced 5.3.0 by O4;
  the rule until then was that a feature claimed its number when its specification was written, from
  a sequence recorded in the delivery roadmap.* A feature takes the next free number **when it
  generates its migration**, and MUST extend the roadmap's reserved-number table in the same change.
  Two open pull requests MUST NOT introduce the same migration number, and a migration file MUST NOT
  be renamed to resolve a conflict — renaming a migration that another branch has already applied is
  how a database and its history diverge.

  *Why the reservation scheme was abandoned.* It collided three times, and each collision left a
  permanent artifact rather than a one-off fix: the journal now carries `idx: 10` against tag
  `0011_conference_authoring` and snapshot `0010_snapshot.json`, a three-way skew that every future
  generation must be told about. It also reserved `0010` for a phase that, by its own scope, adds no
  schema at all — so the sequence held a gap for a migration nobody was going to write. **Reserving
  in advance only works when branches can see each other's reservations, and the recurring lesson of
  this project is that they cannot.** Claiming late costs a rename never; claiming early cost one
  three times.
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

*Restructured in 5.4.1 with no change in meaning.* Entries are listed once, in number order, with
their **current** status. Every entry's original wording, its escalations and annotations, and each
amendment's narrative of what it opened, resolved or escalated are preserved verbatim in
`docs/record/constitution-history.md` ("Register as of 5.4.0"). **Where a summary here and the
binding text above disagree, the binding text wins**; where a summary and the history disagree on
what was *decided*, the history is the record and this summary is a defect to correct.

*Numbering is stable.* Resolved entries are struck through in place rather than removed, and their
successors are not renumbered. A new entry takes the next number after **31**, checked against
every branch in flight before it is claimed (see "Parallel work and shared artifacts").

**Open — require a client decision**

1. **What "PS" denotes** in the repository name `mynet-ps`.
2. ~~**Real brand mark and application icons.**~~ **RESOLVED 2026-08-10 in 3.4.0** — the owner
   supplied a brand board. Binding text: "Brand identity and application icons".
3. **`GroundZero/requirements.md` is now knowingly out of step** with this constitution on product
   name, delivery mode, persistence, authentication, and routing. Whether it is amended or the
   divergence is recorded is undecided.
4. ~~**Desktop and tablet layouts have never been validated by the client.**~~ **RESOLVED
   2026-08-15 in 5.4.0 by R3 — CLOSED BY OWNER RATIFICATION, without a client acceptance act.**
   **Not a claim that the layouts were validated**, and specifically not a claim that green gates
   validated them: 5.0.0's rule on that stands unamended. Ratified as-is: the 768–1279px rail
   divergence between the two products, and Home's two-column cards on an upright tablet. **Carved
   out as a defect rather than ratified**: `AdminShell` presenting two layouts where Principle IV
   requires three. Escalated three times (3.4.0, 4.0.0, 5.0.0) before closing.
5. ~~**Attendee identity model.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D5** — self sign-up with an
   event join code. Binding text: "Attendee identity, personal data, and profile".
6. ~~**Data retention, deletion, and export obligations.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D6**
   — full self-serve: hard deletion with cascade and no tombstone, machine-readable export, and a
   retention clock for what no cascade reaches. Binding text: Principle VIII.
7. ~~**The connection model behind Network contacts.**~~ **RESOLVED 2026-08-10 in 3.2.0** — a
   contact is someone whose digital business card you hold; no connect verb, no accept step, and
   contacts MUST NOT be derived from conversations. Binding text: "Networking relationships and
   appointments".
8. ~~**What an exchanged digital card records, and whether the exchange is mutual.**~~ **RESOLVED
   2026-08-10 in 3.2.0 (N2)** as one-directional, recording the exchange rather than the person —
   **and that answer was REVERSED 2026-08-12 in 5.0.0 by C1: sharing is a mutual exchange.**
   Binding text: "Networking relationships and appointments".
9. ~~**Audience-question attribution.**~~ **RESOLVED 2026-08-10 in 3.2.0** — questions are
   attributed, making Q&A a personal-data surface under Principle VIII. *The rendered form was later
   settled by entry 27.* Binding text: "Audience questions".
10. ~~**Notifications.**~~ **RESOLVED IN PART 2026-08-08 in 3.1.0 by M4** — delivery enters scope
    for a received message; **the bell and an in-app notification centre remain forbidden**, which
    is why it is resolved *in part*. Widened by 5.2.0 (N1) to a second, enumerated trigger. Binding
    text: "Notification delivery". Created entry 20.

**Open — require an owner or planning decision**

11. ~~**API hosting, the managed PostgreSQL provider, and object storage.**~~ **RESOLVED 2026-08-07
    in 3.0.0 by D12** — two isolated Azure VMs, each running Caddy in front of an API container and
    a loopback-only PostgreSQL container, with `StorageService` on a host volume. **Annotated in
    3.5.0 by L3** with the subscription it never named: `d428f98f-a3c4-49c3-ae24-06ec3de08477`
    (LinaSys-DevEnv), `centralus`. Binding text: "Deployment environments".
12. **Authentication ownership** — self-implemented versus a delegated provider. *Still open, and
    worth stating what "open" now means*: authentication is self-implemented and has been shipped
    since 004. The question is whether that is the settled answer or an unratified default, and
    nothing is blocked on it.
13. ~~**Attendee avatar handling.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D7** — real upload, with
    resizing and EXIF stripping mandatory.
14. ~~**Public non-production URLs.**~~ **RESOLVED 2026-08-10 in 3.5.0 by L1** —
    `mynet-dev.programasemilla.com`, openly reachable, **seeded data only**; FR-067 is satisfied by
    the data rather than by the door. Basic auth and an IP allowlist were rejected as safer-looking
    but worse. Binding text: "Deployment environments". *Did not resolve entry 19, and escalated it.*
15. **Server-side branch protection is unconfigured** — a configuration task, not an accepted risk.
    *Corrected 2026-08-07*: this entry previously recorded it as "unavailable (private repository,
    free personal account; APIs return 403)". **Both halves were wrong.** The repository is public
    and organisation-owned; the protection endpoints return **404 — no rule set** — and `rulesets`
    returns an empty list. Branch protection is free on public repositories. Until it is applied,
    enforcement is client-side only and bypassable with `--no-verify`.
16. **The repository is public and organisation-owned** — `Programa-Semilla/mynet-ps` — and nothing
    in this constitution recorded that. Whether it was intended, or is an artifact of how the
    repository was created, is undecided. It changes the Principle VIII threat model either way:
    committed seed data, migrations, workflow configuration, and the generated API contract are all
    world-readable, and preview deployments are reachable by anyone who finds them. This interacts
    with entry 14. *Added 2026-08-07*.
17. ~~**The pipeline runs red, and most of the checks Principle VII names have never executed.**~~
    **CLOSED 2026-08-07 in 3.0.0** — substantially closed by 005 and PR #9 (the database gates moved
    to per-job PostgreSQL service containers and ran for the first time), and the remainder resolved
    **by replacement** under D13: the four preview-path jobs were deleted, not provisioned. **Zero
    correctness checks were weakened, disabled, or made non-blocking.** What is given up is recorded
    under Principle VII.
18. ~~**The transactional email provider.**~~ **RESOLVED 2026-08-10 in 3.5.0 by L4: Mailgun.**
    `MailService` stays a vendor-free port with the adapter selected by configuration identically in
    every environment, and the SDK stays confined to `apps/api/src/mail/`. **Real mail is not
    optional for a usable environment**: verification gates discoverability.
19. **Nobody moderates uploaded avatar images.** *Added 2026-08-07. ADDRESSED, NOT CLOSED.* Public
    self sign-up (D5) plus image upload (D7), shown by default in a directory to every attendee of a
    conference (006), in a thread header to anybody who opens a conversation (007), on a permanent,
    openly reachable UAT (3.5.0, L1). **4.0.0 (A1) reversed the exclusion that foreclosed the usual
    answer, and 013 built the first actor capable of acting on an uploaded image — but a capability
    is not a policy**: who moderates, against what standard, on whose complaint, with what appeal,
    and whether a removed avatar is replaced or blanked are all undecided. Bounded meanwhile by UAT
    carrying seeded data only. *This entry MUST NOT be read as closed by the existence of feature
    013*, nor by the proximity of any entry resolved beside it. Escalated in 3.0.0, 3.1.0 and 3.5.0.
20. ~~**The push provider, and VAPID key custody.**~~ **RESOLVED 2026-08-10 in 3.5.0, its two halves
    differently.** The provider half is **withdrawn as never having existed** — Web Push signs with
    the project's own VAPID pair and posts to whatever endpoint the browser issued. The custody half
    is resolved by L5: one pair per environment, a repository environment secret injected into the
    VM's `.env` by `deploy.sh`, **rotated only on compromise**. Binding text: "Notification
    delivery". *The 5.4.0 text of this entry dated the resolution "3.4.0"; the 3.5.0 amendment
    section records it, and 3.5.0 is correct.*
21. **The operator address abuse reports are dispatched to, and the response expectation attached to
    it.** *Added 2026-08-08 in 3.1.0. ADDRESSED, NOT CLOSED.* The address was **resolved in 3.5.0 by
    L6: `apps@programasemilla.com`**, and **changed, not closed, in 4.0.0 by A5**: a platform
    operator reading the queue now keeps the reporting dialog's promise without any mail. What
    survives is the harder half, unchanged in force — **somebody has to be that operator.** A queue
    nobody opens is as empty a promise as an inbox nobody reads, and this remains an obligation the
    owner personally holds. The mail path is not deleted, because an operator who must open a site
    to learn a report exists learns late.
22. ~~**A cached conference outlives a withdrawn registration by up to 24 hours.**~~ **RESOLVED
    2026-08-15 in 5.4.0 by R1 — ACCEPTED, not fixed.** The 24-hour readable window is ratified; the
    ground it was tolerated on (*"not another attendee's personal data"*) is **struck as false**, and
    it is accepted instead because no third party can end a registration today. **That ground is
    protected by a naming convention**: the attendee-restriction guard MUST be widened to the concept
    before 015 is specified, and **if 015 adds a route ending a registration this entry reopens.**
    Two mechanisms licensed, three rejected on evidence, the lifetime figure deferred. Binding text:
    "Data scoping, content provenance, and composition".
23. **Whether the design tokens adopt the brand's navy and coral.** *Added 2026-08-10 in 3.4.0,
    created by B4.* Measured from the supplied board, the brand and the tokens disagree: brand navy
    `#0d1942` against `navy-800 #1b2340`, brand coral `#fe6551` against `coral-500 #e8634d`. Cream
    agrees and is not at issue. Adopting the brand values would make the board the single source of
    truth for colour and remove the seam between the icon plate and the token-derived `theme_color`
    on the splash screen. **The cost is that it repaints the entire product**: `navy-800` is the
    primary surface and `coral-500` is both the accent and the focus ring, so every contrast ratio
    the accessibility suite asserts must be re-verified on new values. **Blocks nothing** — the
    product behaves as specified either way, and feature 010 is explicitly forbidden from resolving
    it. What it costs to leave open is one visible seam on one surface.
24. ~~**What the administrative report queue may disclose.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A8** — the reported content and the reporter's stated reason, to platform operators only: the
    **third** Principle VIII exception, under four scoping conditions.
25. ~~**What happens when a promoted conference organizer deletes their own account.**~~ **RESOLVED
    2026-08-11 in 4.1.0 by A9** — assignments revoked in the same transaction, deletion never
    conditional, the conference visibly `unassigned`; the same rule applies to withdrawal. Binding
    text: "Administration, and the second actor".
26. ~~**The administrative site's origin and session topology.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A7** — a subdomain of the same registrable domain, `/api/*` reverse-proxied under it, and a
    host-only session cookie giving two independent sessions: same-site *and* different-origin.
    Binding text: "Deployment environments".
27. ~~**Q&A attribution: full name, first name alone, or attendee-chosen.**~~ **RESOLVED 2026-08-15
    in 5.4.0 by R2: first name plus surname initial — "Ana R."**, wherever a question is displayed.
    **Decided on the client's behalf and in tension with her literal words**; she must be told. **The
    entry's enumeration was incomplete** — three options were listed and six existed — which is the
    transferable lesson. Binding text: "Audience questions".
28. **Two brand marks now coexist, and which one is MyNet's is undecided.** Created by C4 in 5.0.0.
    **Blocks nothing**, and the product behaves as the owner directed. The install icon derives from
    `assets/brand/new-logo.png` — a gradient disc — while every in-app mark derives from the board's
    coral N. The owner ruled explicitly that this is an icon change and not a rebrand, so the
    divergence is **accepted knowingly** rather than overlooked.

    Recorded because a knowingly accepted divergence and an unnoticed one look identical six months
    later, and because the resolution in either direction is expensive: adopting the gradient mark
    in-app repaints five authentication screens, the rail and the top bar, and interacts with entry
    23, which concerns the board's values and not this mark's. **No feature may resolve it by
    quietly replacing one mark with the other.**
29. **Whether an attendee may suppress content in notifications.** Opened in 5.2.0 (drafted as 27).
    **Promoted** from a deferral that has sat in prose since 3.1.0 — it was recorded there as
    "accepted rather than solved" and never given a number. 5.2.0 makes it apply to a **second**
    content type: a saved-session notification carries a session title, so what somebody chose to
    attend is now visible on their locked device alongside what somebody said to them. Two
    amendments have now accepted the same cost without deciding the mitigation, and the usual one —
    a per-attendee content preference — has never been weighed. It is numbered now because a
    consequence recorded twice in the same words is a consequence nobody is going to act on.
    **Blocks nothing.**
30. **Speakers are personal data about people who are not attendees.** Opened in 5.2.0 (drafted as
    28). A speaker row carries a real person's name, title and company. This is not new — the rows
    have been seeded since 002 — but 5.2.0 makes them **organizer-authored**, which moves
    responsibility from a reviewed commit to a promoted attendee typing into a form. Principle VIII
    has only ever considered attendees, and both coverage tests derive their expectations from the
    schema, so the question they cannot ask is who answers for a person who never signed up.
    **Blocks nothing today; it blocks any claim that Principle VIII's coverage is complete.**
31. **Whether deleting a session should notify the attendees enrolled in it.** Opened in 5.3.0. O2
    places an enrolment outside N5's engagement set, so a session with live enrolments may be
    deleted — and because enrolling *replaces* saving on an optional session, those attendees hold no
    `saved_sessions` row and are therefore reached by no marker and no push. **A held seat can
    disappear with no trace, and the person learns by arriving.** The obvious remedy is to notify
    them, and that is exactly what cannot be done cheaply: a deletion is not one of N1's three
    material changes, so notifying on it is a **third trigger** and needs its own amendment. Opening
    this rather than solving it is deliberate, on the same reasoning 4.0.0 gave when it predicted the
    third privacy exception and refused to grant it by inference. **Blocks nothing**; the product
    behaves exactly as O2 ratifies.

    *It shares a boundary with entry 29 and is not merged with it.* Both are about what the product
    fails to tell somebody about their own commitments — 29 about what a notification discloses, 31
    about a notification that is never sent — but a suppression preference and a missing trigger
    are different mechanisms with different costs.

**Unnumbered matters resolved before numbering stabilised** (details in the history): the product
name is MyNet (2.0.0); MyNet is the real product with durable server-side persistence (2.0.0); event
scoping is hybrid, a profile detail view is delivered, and the API lives in this repository (all
2.1.0); `VisibilityService` is a seventh device capability, and reports leave the product as operator
mail (both 2026-08-08); standing decision 16 was sharpened to forbid any per-field audience (3.2.0).

**Delivered requirements withdrawn by amendment** — the retractions that made 3.0.0 and 5.0.0 MAJOR,
listed so none is rediscovered as a regression: **001 FR-066 and SC-011** (per-change previews,
3.0.0; FR-067 survives and binds UAT); **009 FR-756a** (refusal purges the conference cache, 3.3.0
Q2 — the gap it named became entry 22); **008's one-directional sharing rule** (5.0.0 C1); **009's
publish-on-asking Q&A model** (5.0.0 C2).

**Runtime guidance**: `CLAUDE.md` provides durable project context for AI-assisted sessions. It MUST
stay consistent with this constitution and MUST NOT contain implementation plans, session tasks,
progress updates, or invented requirements.

**Version**: 5.4.1 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-09-24
