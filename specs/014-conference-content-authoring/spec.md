# Feature Specification: Conference Content Authoring

**Feature Branch**: `spec/014-conference-content-authoring`

**Created**: 2026-08-12

**Status**: **OPEN — tranche 1 of 2 MERGED to `develop` 2026-08-14 (PR #23, squash); tranche 2
SPECIFIED 2026-08-14 in Part II below, with no plan, no tasks and no code.** Constitution v5.2.0
RATIFIED 2026-08-12; **v5.3.0 RATIFIED 2026-08-14 — it gated tranche 2's first line of code and no
longer blocks it.** **This feature is not complete and this document does not claim it is.**
Tranche 2 is being written on `spec/014-conference-content-authoring-tranche-2`, branched from
`develop`, against this same directory, and it is the change that closes 014.

**Input**: Brainstorm #10 (`brainstorm/10-conference-content-authoring.md`), decided 2026-08-12,
**and brainstorm #11** (`brainstorm/11-client-feedback-programme.md`), which rescoped this feature
on 2026-08-12 from a parallel branch. Licensed in principle by constitution v4.0.0 standing decision
36, which names 014 as the second feature of the administrative programme.

> ### This feature carries two scopes, and the second arrived after the first was built
>
> Everything below the "Requirements" heading is **tranche 1** — brainstorm #10's scope, authored
> before #11 existed, implemented in full and green on thirteen of thirteen gates. **Tranche 2 is
> #11's rescope**, and the owner decided on **2026-08-14** that 014 stays open and grows to carry it
> rather than being closed and succeeded. #11's own words are *"rescoped and kept whole"*, and that
> is honoured literally: this feature closes when both tranches are built.
>
> **The cost is recorded rather than hidden.** A complete, reviewed body of work waits, and the wait
> has no known end because part of what it waits for is a list only the client can supply.
>
> | Tranche 2 | Requirements | Status |
> |---|---|---|
> | Multiple event types; agenda items with base information; virtual sessions carrying an access link; presenters in the event model | REQ-010–014 | **specified in Part II.** REQ-012 and REQ-014 were found **already shipped** — see below |
> | The profile taxonomy — sector, subsector, short productive-activity description, networking interests from predefined options, optional company name | REQ-027–042 | **specified in Part II.** ~~Blocked on the client's lists~~ — **that was overstated**, see below |
> | Optional sessions with a maximum capacity, explicit enrolment, and per-activity closing rules and deadlines | REQ-078–086 | **specified in Part II** |
> | An administrative interface for creating events | REQ-113–115 | **satisfied by tranche 1** |
>
> **This table said two of three rows were unblocked and the taxonomy waited on the client.
> Brainstorm #12 (2026-08-14) found that wrong on both counts, and Part II carries the correction:**
> REQ-035 names the four sectors verbatim, brainstorm #11 had already ruled the taxonomy to be
> authored data rather than a spec constant, and REQ-012 and REQ-014 turned out to be **already
> shipped** — as a session's summary field and as speakers respectively. **All three rows are
> therefore in scope**, and tranche 2 closes 014.
>
> Tranche 2 claims **no migration number here**: under constitution v5.3.0 (O4) numbers are claimed
> **at generation**, not reserved in advance. `0011` covers tranche 1 alone.
>
> **Tranche 2 was not started by inference from this note.** It took the same route every feature
> takes — brainstorm #12, then the requirements in Part II written against the REQ ranges above, then
> a plan, a task list, and the Feature Declarations rows discharged a second time.

> **v5.2.0 was ratified on 2026-08-12, unchanged from the drafted text**, so every requirement citing
> N1–N5 stands as written. The amendment gated the first line of code, as v3.1.0 gated 007's Phase 7,
> v3.2.0 gated 008, v3.3.0 gated 009 and v4.0.0 gated 013. **Nothing now blocks implementation.**

**Departure from the delivery roadmap** (Governance, "Delivery decomposition"): the roadmap's
reserved-number table stops at the shipped attendee programme and does not cover this feature. 013
took `0009` and 012 reserves `0010`, so **014 reserves `0011`**. This is the third collision between
parallel branches over a reservation, and the roadmap must be extended rather than corrected.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author the programme of a conference you are assigned (Priority: P1)

A conference organizer signs in to the administrative site, opens a conference they are assigned to,
and builds its programme: tracks, rooms, speakers, and the sessions that reference them. They can
correct anything they typed wrong and remove anything nobody has touched yet.

This is the capability the whole administrative programme was opened for. Until now a conference
programme could only come from a reviewed change to committed seed data, which means a deploy to
move a room.

**Why this priority**: It is the stated motivation for reversing the administration exclusion, and
it is the only story here that delivers value on its own. Everything else in this feature either
protects it or reacts to it.

**Independent Test**: Sign in as an organizer assigned to a seeded conference, add a track, a room,
a speaker and a session referencing all three, edit each, and delete the session. Then open MyNet as
an attendee registered for that conference and confirm the session appears in Agenda with the right
time, track, room and speaker.

**Acceptance Scenarios**:

1. **Given** an organizer assigned to a conference, **When** they create a session with a title,
   start and end time, track and room, **Then** it appears in that conference's programme and is
   visible in the Agenda of every attendee registered for it.
2. **Given** a session nobody has saved, noted, questioned or voted on, **When** the organizer
   deletes it, **Then** it is removed from the programme entirely.
3. **Given** an organizer assigned to conference A, **When** they attempt to read or write the
   content of conference B, **Then** the attempt is refused server-side and discloses nothing about
   whether B exists.
4. **Given** a platform operator, **When** they open any conference, **Then** they may author its
   content on the same terms as an assigned organizer.
5. **Given** an organizer editing a speaker record, **When** that speaker is also a registered
   attendee, **Then** the attendee's profile is unchanged and no route exists from the speaker form
   to it.

---

### User Story 2 - Change a live session without destroying what attendees have written (Priority: P2)

The conference is running. A speaker drops out, so a session must be cancelled; a room floods, so
another must move. Twelve attendees have saved these sessions, four have written private notes on
them, and there are questions with votes.

The organizer makes the change. Nobody's notes, questions or votes are destroyed.

**Why this priority**: Without it, User Story 1 is actively dangerous. Every table holding attendee
state about a session cascades from the session row, so a single delete would silently destroy other
people's private writing. This story is what makes live editing safe rather than merely possible.

**Independent Test**: Have two attendee accounts save a session, write notes on it, and ask and
upvote a question. Cancel the session as the organizer. Confirm every one of those records still
exists and is readable, and that the session is presented as cancelled rather than missing.

**Acceptance Scenarios**:

1. **Given** a session that at least one attendee has saved, noted, questioned or voted on,
   **When** the organizer attempts to delete it, **Then** deletion is refused with an explanation
   and cancellation is offered instead.
2. **Given** the organizer cancels that session, **Then** the saved-session rows, private notes,
   questions and votes all survive unchanged.
3. **Given** a cancelled session, **When** an attendee who saved it opens Agenda, **Then** it is
   presented as cancelled rather than removed, and their own notes remain readable.
4. **Given** the organizer moves a session's start time, **Then** the programme, every attendee's
   Agenda and Home's "Up next" reflect the new time.
5. **Given** an organizer is deciding between deleting and cancelling, **Then** they are shown how
   many attendees have engaged with the session, as counts only, with no attendee identified.
6. **Given** an untouched session the organizer is deleting, **When** an attendee saves it after the
   engagement check has read zero and before the delete commits, **Then** the attendee's row
   survives — either the delete is refused or the save blocks until the transaction ends, and in no
   ordering is the row destroyed.
7. **Given** a cancelled session that was the attendee's next, **When** they open Home, **Then**
   "Up next" names the next session actually happening, and the cancelled one appears in the
   rest-of-day timeline marked as cancelled.

---

### User Story 3 - Be told when a session you saved is cancelled or moved (Priority: P3)

An attendee saved the 09:00 keynote. It is cancelled overnight. They find out before crossing the
venue to an empty room.

**Why this priority**: It is the half of this feature that reaches attendees, and it is what makes
the organizer's edit useful rather than merely recorded. It is third because Stories 1 and 2 must
both be true before there is anything to be told about.

**Independent Test**: Save a session as an attendee with notification permission granted. Cancel it
as the organizer. Confirm a notification is delivered, that activating it opens the session, and
that the Agenda row carries a marker until the attendee has looked at it.

**Acceptance Scenarios**:

1. **Given** an attendee has saved a session and granted notification permission, **When** the
   session is cancelled, its start time changes, or its room changes, **Then** they receive one
   notification naming the session and what changed.
1a. **Given** one organizer action materially changes four sessions the same attendee saved,
   **Then** they receive exactly one notification stating that four of their saved sessions
   changed, and activating it opens Agenda rather than a list of changes.
2. **Given** the same change, **When** the attendee opens Agenda or Home, **Then** the row carries a
   marker distinguishing it from unchanged rows, and the marker clears once they have viewed it.
3. **Given** an attendee who has denied notification permission, **Then** they still receive the
   in-app marker and every other surface behaves identically to an attendee who granted it.
4. **Given** an attendee who has **not** saved the session, **Then** they receive no notification
   and no marker, whatever changed.
5. **Given** a change to a session's title, summary or speakers, **Then** no notification is
   dispatched, because those changes are content rather than logistics.
6. **Given** an organizer who is registered for their own conference and has saved the session they
   are changing, **Then** they receive no notification and no marker for their own act.
7. **Given** two separate organizer actions an hour apart, each materially changing a session the
   same attendee saved, **Then** that attendee receives two notifications, not one.

---

### User Story 4 - Create a new conference (Priority: P4)

A platform operator, or a conference organizer running their own event, creates a conference: name,
location, dates, timezone. A join code is minted so attendees can register for it. An organizer who
creates a conference is assigned to it.

**Why this priority**: Last because the three seeded conferences already give Stories 1–3 something
to act on, and because creation is the smallest surface of the four. It is in scope rather than
deferred to 015 so that a real organizer is not blocked on somebody else to stand up their event.

**Independent Test**: Create a conference as an organizer, confirm the creator is assigned to it,
confirm the join code works from MyNet's join-by-code flow, and confirm the creator cannot reach any
conference they were not assigned to.

**Acceptance Scenarios**:

1. **Given** a platform operator or conference organizer, **When** they create a conference with a
   name, location, start and end date and timezone, **Then** the conference exists with a unique
   join code and an empty programme.
2. **Given** an organizer creates a conference, **Then** they are assigned to it, and their reach
   over conferences they did not create is unchanged.
3. **Given** an attendee enters the new conference's join code in MyNet, **Then** they are
   registered for it and it appears in their event switcher.
4. **Given** a newly created conference with no sessions, **When** an attendee registered for it
   opens Home and Agenda, **Then** the existing empty states render rather than an error.

---

### Edge Cases

- **An organizer shrinks a conference's date range so existing sessions fall outside it.** Refused,
  naming the sessions that would be orphaned. Moving or cancelling them first is the organizer's
  act, not the system's.
- **A session is given an end time at or before its start.** Refused at both the surface and the
  database, which already carries the constraint.
- **Two sessions are placed in the same room at the same time.** Permitted, with a warning.
  Conferences genuinely overlap sessions during changeover, and a refusal would be a rule the
  product invented.
- **An organizer deletes a track or room a session references.** Refused while any session
  references it.
- **A session is cancelled, then the organizer wants it back.** Cancellation is reversible by the
  organizer; reinstating dispatches nothing, because the notification rule names cancellation and
  not its reversal, and an attendee whose session returns has lost nothing by not being told.
- **An attendee saved a session, then withdrew from the conference.** They receive no notification
  and no marker: withdrawal removes their registration, and the saved-session row goes with it.
- **An attendee is offline when a session changes.** They see the cached programme with the
  retrieval time every cached surface already states, and the marker appears when connectivity
  returns. This is register entry 22's territory and 014 does not close it.
- **A conference has no organizer** because its only one deleted their account or withdrew. It
  enters the `unassigned` state v4.1.0 already defines; a platform operator may still author it.
- **A session is cancelled while an attendee has its detail panel open.** The panel reflects the
  cancellation on its next read; no live push into an open panel is required.

## Requirements *(mandatory)*

### Functional Requirements

#### Authoring surface

- **FR-1001**: The administrative product MUST allow a conference organizer to create, read, update
  and delete **tracks**, **rooms**, **speakers** and **sessions** within a conference they are
  assigned to, and to assign speakers to sessions.
- **FR-1002**: A platform operator MUST hold the same authoring capability over every conference.
- **FR-1003**: Every authoring surface MUST live in the administrative product only. **MyNet MUST
  gain no authoring surface, no privileged view and no rendering that branches on administrative
  tier**, and this MUST be asserted as an absence.
- **FR-1004**: A track's colour MUST be chosen from the existing design tokens. The product MUST NOT
  offer a free colour input.
- **FR-1005**: A session MUST be able to reference a track and a room belonging to the same
  conference, and MUST NOT be able to reference either belonging to another.
- **FR-1006**: The administrative product MUST NOT offer any route that edits an attendee's profile,
  and a speaker record MUST NOT be a route to one, even where the same person holds both.

#### Conference creation

- **FR-1007**: A platform operator MUST be able to create a conference with a name, location, start
  date, end date and timezone. *Extended by tranche 2, not contradicted (FR-1059b): creation now
  also collects an explicit **modality** — refused with its own named code when absent, because
  FR-1048 forbids a default — and an optional **format**.*
- **FR-1008**: A conference organizer MUST be able to create a conference, and MUST be assigned to
  the conference they create, in the same transaction.
- **FR-1009**: Creating a conference MUST mint a join code that is unique product-wide and usable
  immediately by MyNet's existing join-by-code flow.
- **FR-1010**: Creating a conference MUST NOT grant the creator any authority over any other
  conference, and MUST NOT grant any platform-operator capability.
- **FR-1011**: The product MUST NOT offer conference **deletion** at any tier in this feature. A
  conference with registrations, saved sessions and conversations attached is a larger question than
  this feature answers.

#### Validation and integrity

- **FR-1012**: A session's start and end MUST fall within its conference's date range, interpreted
  in the conference's timezone.
- **FR-1013**: A session's end MUST be after its start.
- **FR-1014**: A conference's date range MUST NOT be changed so that an existing session falls
  outside it. The refusal MUST name the sessions concerned.
- **FR-1015**: A conference's timezone MUST be editable only while the conference has no sessions.
- **FR-1016**: Two sessions in the same room at overlapping times MUST be permitted, and the
  organizer MUST be warned before confirming.
- **FR-1017**: A track or room MUST NOT be deleted while any session references it.

#### Cancellation, and attendee state

- **FR-1018**: A session that **no** attendee has engaged with MUST be deletable. Engagement means a
  saved session, a private note, a question, or a vote on a question.
- **FR-1018a**: The engagement predicate MUST be **derived from the schema, not enumerated in a
  handler.** Any table holding attendee data that references a session MUST count as engagement by
  existing, in the shape `deletion-coverage.test.ts` and `export-coverage.test.ts` already
  establish — a new such table MUST fail the build until it is either covered by the predicate or
  allow-listed with a written reason. **An enumerated list is a list that ages**, and the failure
  mode is silent: deletions resume destroying attendee data with every existing test still green.
- **FR-1019**: A session that **any** attendee has engaged with MUST NOT be deletable. The refusal
  MUST explain why and MUST offer cancellation.
- **FR-1019a**: The engagement check MUST be performed **inside the deleting transaction, with the
  session row locked**, so that engagement arriving between the check and the delete blocks rather
  than being destroyed. This is **009's FR-714 precedent** and it is the same mechanism: the lock a
  reader takes on the parent row MUST conflict with the lock a child insert takes on it, so an
  attendee saving the session mid-delete waits for the transaction to end rather than losing their
  row. **Checking before the transaction is the race this requirement exists to close**, and it is
  the one property no layer above a real database can test.
- **FR-1020**: Cancellation MUST be stored state on the session, not a deletion and not a value
  derived from the clock.
- **FR-1021**: Cancelling a session MUST leave every saved-session row, private note, question and
  vote attached to it intact and readable.
- **FR-1022**: A cancelled session MUST be presented as cancelled — rather than disappearing —
  wherever an attendee would otherwise see it: the programme, Agenda, the session detail panel, and
  Home's rest-of-day timeline.
- **FR-1022a**: **Home's "Up next" MUST skip a cancelled session** and name the attendee's next
  session that is actually happening. "Up next" answers *where do I go now*, and a cancelled session
  is not an answer to it. This is the one surface where presenting the cancellation would be worse
  than omitting it, and it is the product's most prominent viewport.
- **FR-1023**: An attendee MUST be able to remove a cancelled session from their own saved list.
- **FR-1024**: Cancellation MUST be reversible by an organizer, and reinstating a session MUST NOT
  dispatch a notification.
- **FR-1025**: The organizer MUST be shown engagement as **counts only** when choosing between
  deletion and cancellation. No attendee may be identified, and no note, question or vote content
  may be disclosed to any administrative tier by this feature.

#### Telling the attendee

- **FR-1026**: A **material change** to a session an attendee has saved *— or, since tranche 2,
  holds a place in (FR-1079; reworded by T161 under FR-1079b so Part I and Part II cannot
  disagree inside one document) —* MUST dispatch exactly one notification to that attendee.
  Material means exactly three things: **the session is cancelled, its start time changes, or its
  room changes** (constitution v5.2.0, N1).
- **FR-1027**: A change to a session's title, summary, track or speakers MUST NOT dispatch a
  notification.
- **FR-1028**: A change to a session **no** attendee has saved *— and, since tranche 2, no
  attendee holds a place in (FR-1079b): as shipped this sentence read "no attendee has saved",
  which FR-1079 directly contradicted, and the guard enforcing it was re-scoped AND renamed to
  `dispatch-no-commitments.test.ts` in the same change —* MUST dispatch nothing.
- **FR-1028a**: The **acting principal MUST NOT be notified of their own act.** An organizer who is
  also an attendee registered for their own conference, and who has saved the session they are
  changing, receives no notification and no marker for that change. They already know.
- **FR-1028b**: **Each organizer act dispatches independently.** Two acts an hour apart that each
  materially change the same attendee's saved sessions produce **two** notifications. Coalescing is
  per **action** (FR-1034), never per attendee per time window — a time-window rule would suppress a
  cancellation because a room moved earlier, which is the failure this whole trigger exists to
  prevent.
- **FR-1029**: A notification covering a **single** changed session MUST name that session and what
  changed, and activating it MUST open that session.
- **FR-1030**: A materially changed saved session *— or held place: tranche 2 widens the marker to
  both commitments (FR-1080), with the held place carrying its own `viewed_at` because an enrolled
  attendee holds no saved row (reworded by T161 under FR-1079b) —* MUST carry an **in-app marker**
  on its row in Agenda and on Home, distinguishing it from unchanged rows, and the marker MUST
  clear once the attendee has viewed the session.
- **FR-1031**: The marker MUST be **per-row state about one saved session**. Neither product may
  gain an aggregate count of changes, a list of changes, a notification bell, or any surface whose
  subject is "things that happened" (constitution v5.2.0, N2). This MUST be asserted as an absence.
  The coalesced notification body of FR-1034 is outside this rule and is the single stated
  exception to it.
- **FR-1032**: An attendee who has denied notification permission MUST receive the in-app marker and
  MUST find every other surface unchanged.
- **FR-1033**: A session **starting** MUST NOT dispatch a notification. This feature adds no
  reminder, no countdown and no "starting soon" alert.
- **FR-1034**: When a single organizer action materially changes several sessions an attendee has
  saved, that attendee MUST receive **exactly one notification covering the whole action**, whose
  body states how many of their saved sessions changed. One organizer act produces at most one
  notification per attendee, however many of their saved sessions it touched.
- **FR-1034a**: The coalesced body is the **only** aggregate over changes this feature may produce.
  It is permitted because N2's prohibition governs **in-app surfaces**, where an aggregate becomes
  the notification centre the rule forbids; a notification is a single interruption by nature, and
  twelve interruptions for one organizer act is the outcome v3.1.0's exclusion existed to prevent.
  **The in-app marker stays strictly per-row** (FR-1031), and no surface inside either product may
  present the count that the notification body carries.
- **FR-1034b**: Activating a coalesced notification MUST open the attendee's Agenda, where the
  changed rows carry their individual markers. It MUST NOT open a list of changes, because that list
  is the surface FR-1031 forbids.

#### Authorization and accountability

- **FR-1035**: Authority to author MUST be a server-enforced predicate over the authenticated
  administrative principal and the named conference, never a claim the client presents.
- **FR-1036**: An attempt to reach a conference the principal has no authority over MUST be refused
  identically to an attempt to reach one that does not exist, disclosing nothing about which.
- **FR-1037**: Every authoring act MUST write an audit entry, and **the act and its entry MUST
  commit in one transaction** (013, FR-994). A failed entry MUST leave the act undone.
- **FR-1038**: An audit entry MUST record the principal, the conference, the act, the entity acted
  on and the instant. There MUST remain **no read path over the audit trail** in either product
  (013, FR-999).
- **FR-1039**: Authoring routes MUST be throttled **per action**, in the shape the product already
  applies to every other write path, and each action MUST be named rather than covered by a generic
  bucket: `conference_create`, `session_write`, `session_cancel`, `session_delete`, and
  `catalog_write` for tracks, rooms and speakers. `conference_create` and `session_cancel` are the
  two that matter — the first is the only product-wide act an organizer holds, and the second is the
  only authoring act that reaches attendees' phones.

#### Absences

- **FR-1040**: There MUST be no draft or published state on a conference, and no lifecycle gate
  between authoring and attendee visibility (constitution v5.2.0, N4).
- **FR-1041**: There MUST be no administrative route that suspends, removes or restricts an
  attendee. An administrative tier acts on content and on authority, never on a person (013).
- **FR-1042**: There MUST be no administrative read of a private note, a message, or the identity of
  anyone who saved, questioned or voted on a session.
- **FR-1043**: The seed MUST remain the development and test fixture, and its fixture properties
  MUST survive unchanged: the two fully disjoint programmes, and the deliberately empty third
  conference.
- **FR-1044**: Nothing in this feature may derive a contact, a conversation or an appointment from
  an authoring act.

### Key Entities

- **Conference (event)** — gains no new attribute for authoring itself; its existing name, location,
  date range, timezone and join code become editable within the rules above.
- **Session** — gains a **cancellation state**: whether it is cancelled, and when. Conference
  content, not attendee data.
- **Session change record** — what the marker and the notification are computed from: which session
  changed materially, and when. Conference content.
- **Saved session** — gains per-attendee state recording when the attendee last viewed the session,
  which is what makes the marker clear. Attendee data, cascading from both the attendee and the
  session.
- **Track, room, speaker** — unchanged in shape; they gain authorship rather than attributes. A
  **speaker** is conference content describing a real person who is not necessarily an attendee, and
  is the subject of register entry 30.
- **Organizer assignment** — unchanged in shape; creation becomes a second way one comes to exist,
  alongside promotion-then-assignment.
- **Audit entry** — unchanged in shape; gains authoring acts as a new category of recorded act.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1001**: An organizer can build a complete one-day programme — a track, two rooms, three
  speakers and six sessions — without leaving the administrative site and without any change to
  committed data or any deployment.
- **SC-1002**: A session an attendee has saved, noted, questioned or voted on cannot be destroyed by
  any administrative act available in the product. Verified by attempting every authoring path
  against such a session.
- **SC-1003**: After a session is cancelled, 100% of the notes, questions and votes attached to it
  remain readable by the attendees who wrote them.
- **SC-1004**: An attendee who saved a session that is cancelled or moved learns of it **without
  opening the application and within one minute of the organizer confirming the change**, provided
  they granted permission and hold a live subscription.
- **SC-1005**: An attendee who denied notification permission completes every task in Agenda, Home
  and the session panel identically to one who granted it.
- **SC-1006**: A change to a session's title, summary, track or speakers produces zero
  notifications.
- **SC-1007**: An organizer assigned to one conference can reach no content belonging to another,
  and cannot distinguish a conference they lack authority over from one that does not exist.
- **SC-1008**: MyNet contains no authoring surface, no administrative route and no rendering that
  branches on administrative tier, demonstrated as an absence over the source.
- **SC-1009**: No surface **inside** either product presents an aggregate of changes, a change list,
  or a notification bell. The coalesced notification body is the only place a change count exists,
  and activating it lands on Agenda rather than on a list.
- **SC-1012**: One organizer action produces at most one notification per attendee, however many of
  that attendee's saved sessions it materially changed. Verified by changing four saved sessions in
  one act and counting dispatches.
- **SC-1010**: Every authoring act that succeeds has exactly one audit entry, and every authoring
  act whose audit entry fails leaves no trace of the act.
- **SC-1011**: An attendee registers for a newly created conference using its join code and reaches
  its Home and Agenda, including their empty states, on the first attempt.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Actor and tier** (Principle III, added 4.0.0) | **Two actors, in two products.** The authoring surfaces (US1, US2, US4) serve the **conference organizer** and the **platform operator**, and live **only** in `apps/admin`. The marker and notification (US3) serve the **attendee** and live **only** in `apps/web`; they are visible to every attendee identically and depend on no role, so FR-1003's absence holds. No surface serves both actors. |
| **Offline behaviour** (Principle VI) | **The administrative product caches nothing**, as 013 established — authoring offline would be a write queue, which the product refuses product-wide. Every authoring action attempted offline is **refused, never queued**. On the attendee side, `CatalogRepository` remains a cached read and the marker travels on the **existing agenda payload** rather than a new repository member, so no new cached read is introduced and `passThrough` is not needed. The one new attendee-side write — marking a session viewed, which clears the marker — is a **write** and purges the conference prefix, which is correct: the programme it purges is the one that just changed. |
| **Desktop layout** (Principle IV) | Administrative: persistent left rail, contextual top bar, multi-column — the shell 013 built, gaining a programme editor as a new destination. Attendee: unchanged; the marker is a row-level treatment inside existing layouts. |
| **Tablet layout** (Principle IV) | Administrative: reduced rail, two-column, stacked detail; the session editor stacks its form below the programme list. Attendee: unchanged. |
| **Mobile layout** (Principle IV) | Administrative: compact header, single-column, full-width overlays, touch-sized controls. **Authoring is desk work and is not expected to be a mobile-primary surface, but it MUST remain fully operable at 390px**, and no content or primary action may require horizontal scrolling — including the programme's time grid, which must reflow rather than scroll sideways. Attendee: unchanged. |
| **Empty / loading / failure states** (Principle IV) | Administrative: a conference with no programme (invitation to add the first session), no tracks, no rooms, no speakers; loading for the programme list and every editor; failure for every save, with the server's explanation surfaced rather than a generic message. Attendee: the existing Agenda and Home states are unchanged; a cancelled session is a **state, not an empty state**. |
| **Accessibility** (Principle IV) | Every control accessibly labelled, visible focus, keyboard operable. Any modal introduced — the delete-versus-cancel confirmation, the overlap warning — is a native `<dialog>` opened with `showModal()`, dismissible with Escape, **centred by the base rule in `theme/tokens.css` rather than by a local `m-auto`**, with focus restored to the opener after closing. The marker MUST be conveyed to assistive technology by text, never by colour alone. |
| **Validation checklist discharged** (Principle VII) | Discharges **session save + notes + Q&A** end-to-end under content change, and **keyboard focus visibility and accessible labels** for the new administrative surfaces. Explicitly does **not** discharge desktop and mobile rendering review (register entry 4, and this feature escalates it), the physical iPhone test, or the by-hand quickstart walkthroughs outstanding from 007, 008, 009 and 013. |
| **Identity scoping & server-side authorization** (Principle VIII) | Authoring authority is a **server-enforced predicate** over the administrative principal and the named conference, in the shape `EventScope`, `ConversationScope`, `CardScope` and `VerifiedOperatorScope` establish. A conference the principal has no authority over is refused **identically to one that does not exist**. On the attendee side, the marker and notification are scoped to the attendee's own saved sessions and disclose nothing about anyone else's. |
| **Deletion & export coverage** (Principle VIII) | **Session cancellation state** and **session change records** are conference content, not attendee data: no cascade from `attendees` and no export coverage, declared with that reason rather than allow-listed silently. **The per-attendee viewed-state on a saved session IS attendee data**: it cascades from `attendees` and from `sessions`, and appears in the personal-data export alongside the saved session it belongs to. Both coverage tests derive from the schema, so each new column fails by existing until declared. **A third schema-derived guard joins them** (FR-1018a): the engagement predicate that governs whether a session may be deleted MUST also be derived from the schema, so a later feature adding an attendee-state table referencing a session cannot silently fall outside it. |
| **Event scoping** (Standing decision D1/7) | **Per-event, throughout, and this is not a default being assumed.** Conference content is per-event by D1. Organizer assignments are already per-event. The marker is per-event because it is about a session. The one cross-event thing this feature touches is the **push subscription**, which is per device and already cross-event by 007's design — it carries delivery, not content. |
| **Administrative counterpart** (Principle IX, added 5.0.0) | **Declared retrospectively on the 2026-08-14 merge of `develop`, and the retrospection is the point.** This row did not exist when 014 was specified — 5.0.0 added it on a parallel branch — so 014 would otherwise have been the one feature that never answered it. **014 adds exactly one attendee-facing capability: the per-row changed marker and the notification that accompanies it (US3).** Its administrative counterpart is **explicitly NONE, and that is a decision rather than an omission.** The marker is not a thing an attendee *does*; it is the product telling them what an organizer already did, and the organizer's side of it is the authoring act itself — which is this feature's other three user stories, already administrative. There is nothing for an operator to see, undo, or answer for: no marker state is addressable by an administrator, no view in either product may present a count of markers (FR-1031), and clearing one is the attendee's own act on their own row. **The inverse direction is where the obligation bit, and 014 already satisfies it**: every administrative capability here — cancel, reschedule, move rooms, delete — has an attendee-visible consequence specified with it, which is why decision 49 exists at all. |
| **Register position** (Governance) | **Blocked by**: constitution v5.2.0, drafted and not yet ratified — nothing else. **Resolves**: none. **Escalates**: entry **4** (desktop and tablet unvalidated) by adding a substantial new administrative surface; entry **22** (a cached conference outliving its registration) by giving the cached programme a **second** way to be wrong — it can now be stale rather than merely unauthorised — which 014 does not close and which remains filed against 012. **Opens**: none beyond entries **29** and **30**, which v5.2.0 opens. |
| **Reserved migration number** (Branching — parallel work) | **`0011`.** 013 holds `0009` and 012 reserves `0010`. The roadmap's reserved-number table does not cover the administrative programme and MUST be extended; this spec's departure note records that. |

## Assumptions

Reasonable defaults chosen where the brainstorm left a detail open. Each is a decision that can be
reversed without re-specifying the feature.

- **A cancelled session's Q&A composer is closed; existing questions stay readable.** A question is
  asked of a speaker at a session, and a session that will not happen has no reader. Nothing is
  destroyed — FR-1021 governs — but nothing new is invited.
- **Engagement counts shown to an organizer are an aggregate with no identity attached**, and are
  therefore not a Principle VIII disclosure requiring a recorded exception. This is written down
  rather than derived, following v3.3.0's discipline; if the owner reads it as a disclosure, FR-1025
  is where it changes.

  **The aggregate is thin at small scale, and that is stated rather than glossed.** At a conference
  with three registrants, "1 attendee wrote a note on this" is close to a name, and an organizer can
  see who is registered. It holds at conference scale and it does not hold at seed or pilot scale.
  The mitigation available without a decision is to present engagement as a **threshold rather than
  a count** — "attendees have saved this" versus a number — and that is the shape to reach for if
  the owner reads FR-1025 as a disclosure.
- **The event timezone is frozen once a session exists** (FR-1015), which sidesteps the question of
  whether a timezone change is a "change of start time" under N1. Structurally no instant moves, but
  every displayed local time shifts — so freezing it is the answer that needs no new rule.
- **A conference's join code is minted by the product, not chosen by the organizer.** Managing codes
  — rotating, revoking, viewing — remains 015's, per brainstorm #09. 014 mints one because
  `join_code` is required for a conference to exist at all.
- **Nothing bounds how many conferences an organizer may create.** Accepted in v5.2.0's N3 text as
  bounded by trust, since promotion is platform-tier only.
- **A saved-session notification carries the session title**, so what an attendee chose to attend is
  visible on a locked device. Accepted on v3.1.0's reasoning and **not solved** — this is register
  entry 29, which 014 does not close.
- **A speaker record is not verified against any real person.** An organizer types a name, title and
  company. Register entry 30 records that this is personal data about somebody who never signed up;
  this feature does not decide who answers for it.
- **The administrative product remains non-installable** — no manifest, no service worker, no PWA
  behaviour — as 013 established structurally rather than by configuration.
- **Existing seeded conferences are ordinary editable conferences** (v4.0.0, decision 34). No
  privileged content, no immutable content, and no control that renders for a conference it cannot
  act on.

---

# Part II — Tranche 2

**Added 2026-08-14.** Everything above this line is **tranche 1**, merged to `develop` in PR #23 with
migration `0011` on constitution v5.2.0. Everything below is **tranche 2**, and it is the change that
**closes 014**. It is specified into this document rather than a new one because the owner decided on
2026-08-14 that 014 stays open and grows — brainstorm #11's *"rescoped and kept whole"*, honoured
literally.

**Tranche 2 was gated on constitution v5.3.0**, drafted and **RATIFIED 2026-08-14**. Its
decisions O1–O4 are cited throughout. As v5.2.0 gated tranche 1, v4.0.0 gated 013, v3.3.0 gated 009
and v3.2.0 gated 008: **no line of implementation may be written until it is ratified.** This
specification may be written, reviewed and planned meanwhile, which is the same order 008 and 009
followed.

> ### Two things the record had wrong, corrected here
>
> The scope note at the head of this document says the profile taxonomy *"waits on the client's
> interest, sector and subsector lists, which do not exist."* Brainstorm #12 found that overstated:
>
> 1. **REQ-035 supplies the sector list verbatim** — Servicios, Comercio, Industria, Agro.
> 2. **Brainstorm #11 decision item 6 had already ruled** the taxonomy to be *"authored or seeded
>    data, not a spec constant, so 014 is not held hostage to it."*
>
> What is genuinely missing is the **subsector** lists (REQ-036) and the **interests** list
> (REQ-033) — *content for a surface*, not a prerequisite for building one. **The taxonomy is
> therefore in scope**, all three rows are carried, and 014 closes in one change.
>
> **Two requirements in tranche 2's range are already shipped and are NOT respecified.** REQ-012's
> "short description" is a session's existing summary field, and REQ-014's "presenters" are speakers
> — already organizer-authored, already many-to-many with sessions, with create, update and delete
> shipped in tranche 1. REQ-014 is satisfied unless the client means more than a name, title and
> company.

## User Scenarios & Testing — Tranche 2 *(mandatory)*

### User Story 5 - Run a workshop with a limited number of places (Priority: P1)

An organizer authoring a hands-on workshop marks it **optional**, sets a maximum of 20 places, and
sets enrolment to close 24 hours before it starts because materials must be prepared. Attendees
enrol until the places run out or the deadline passes. The day before, the organizer opens the
session and reads the list of people who will be there, and prepares 20 kits.

**Why this priority**: it is the row that motivated the whole tranche, it is the only genuinely new
mechanism in it, and it is the one an attendee can be harmed by if it is wrong — two people believing
they hold the same seat is worse than either of them being refused.

**Independent test**: create an optional session with capacity 2, enrol three attendees from three
browser profiles, confirm the third is refused with an explanation naming fullness rather than a
generic failure, and confirm the organizer's roster names exactly the two who succeeded.

**Acceptance scenarios**:

1. **Given** an optional session with 3 of 20 places taken, **When** an attendee opens it, **Then**
   they see a control to take a place and are told how many remain.
2. **Given** an optional session with every place taken, **When** an attendee opens it, **Then** the
   control is unavailable and they are told the session is full — not that something went wrong.
3. **Given** an optional session whose closing offset has passed, **When** an attendee opens it,
   **Then** they are told enrolment has closed, and that is distinguishable from being full.
4. **Given** two attendees taking the last place at the same instant, **When** both act, **Then**
   exactly one succeeds and the other is told the session is full. **Neither** may end up holding a
   place that does not exist.
5. **Given** an attendee holding a place, **When** they change their mind, **Then** they can release
   it and the place returns to the pool.
6. **Given** an organizer assigned to the conference, **When** they open an optional session,
   **Then** they see the names of the attendees enrolled in it — and no saved sessions, notes,
   questions or votes for any session.
7. **Given** an organizer not assigned to that conference, **When** they attempt the same, **Then**
   they are refused identically to a conference that does not exist.

### User Story 6 - Be told when a session you hold a place in moves (Priority: P1)

An attendee holds a place in a workshop. The organizer moves it to a different room. The attendee is
notified and the change is marked on the row, exactly as it would be for a session they had saved.

**Why this priority**: it shares P1 with User Story 5 because it is not a separate feature — it is
the half of User Story 5 that stops enrolment being a trap. Enrolling *replaces* saving, so without
this an attendee who took a place would be the **only** person in the conference told nothing when
the room changed.

**Independent test**: enrol an attendee in an optional session, change its room as an organizer, and
confirm the attendee receives the same notification and the same per-row marker that a saved session
produces.

**Acceptance scenarios**:

1. **Given** an attendee enrolled in a session, **When** an organizer changes its room, **Then** the
   attendee is notified and the row is marked.
2. **Given** an attendee enrolled in a session, **When** an organizer cancels it, **Then** the
   attendee is notified and the session is shown as cancelled wherever it appears.
3. **Given** an attendee enrolled in a session and another who saved a different one, **When** one
   organizer act changes both, **Then** each receives one notification and neither learns anything
   about the other.
4. **Given** an organizer changes a session's title or description, **When** the change is saved,
   **Then** **no** notification is dispatched to anybody — the material set is unchanged at three.

### User Story 7 - Describe what you do, and find people who match (Priority: P2)

An attendee editing their profile chooses a sector and a subsector from a controlled list, writes a
short description of what they actually make or do, picks their networking interests from a list, and
optionally names their company. Another attendee in Discover sees that context on their card.

**Why this priority**: it improves discovery for every attendee, and it is the row the client
described at greatest length — but nobody is blocked or harmed while it is absent, and its content
lists do not exist yet.

**Independent test**: with an empty interest list seeded, confirm a profile can still be completed and
saved; then author two subsectors and two interests as a platform operator and confirm they become
selectable without a deploy.

**Acceptance scenarios**:

1. **Given** an attendee editing their profile, **When** they open the sector field, **Then** they
   choose from a controlled list rather than typing.
2. **Given** an attendee who leaves every taxonomy field empty, **When** they save, **Then** the
   profile saves and the product works fully — **an incomplete profile remains valid**.
3. **Given** an attendee who has named a company, **When** another attendee views their card,
   **Then** the company appears; **Given** one who has not, **Then** no empty company line appears.
4. **Given** a platform operator, **When** they add a subsector, **Then** it becomes selectable to
   attendees with no deployment.
5. **Given** a conference organizer, **When** they attempt to author the vocabulary, **Then** they
   are refused — it is product-wide reference data and their authority is not.
6. **Given** any administrative tier, **When** they attempt to change an attendee's chosen sector,
   **Then** there is no path by which they can — a person is not authorable at any tier.

### User Story 8 - Run a virtual conference (Priority: P3)

An organizer creates a conference, marks it **virtual**, and authors sessions that carry a joining
link instead of a room. Attendees see the link on the session rather than a room name.

**Why this priority**: it widens who can use the product, and the client named it first — but every
conference in the product today is in person, and the mechanism is additive rather than corrective.

**Independent test**: create a virtual conference, author a session with no room and a joining link,
and confirm the attendee sees the link and no empty room line; then correct the conference's format
after creation and confirm the correction holds.

**Acceptance scenarios**:

1. **Given** a virtual conference, **When** an organizer authors a session, **Then** they may give it
   a joining link and are not required to give it a room.
2. **Given** an in-person conference, **When** an organizer authors a session, **Then** a room is
   still required.
3. **Given** an organizer who set the wrong format at creation, **When** they edit the conference,
   **Then** they can correct it — no value set at creation is permanently uncorrectable.
4. **Given** a conference described as a hackathon, **When** it is also virtual, **Then** both are
   expressible at once — format and modality are independent.

### Edge Cases — Tranche 2

**An organizer switches an in-person conference to virtual while its sessions carry rooms.** Refused, naming every session that would be left invalid (FR-1059a) — and **the remedy is not "clear the rooms first", because that is itself forbidden**: FR-1050a requires a room on every session of an in-person conference and forbids a link on one. The reachable route is **in-person → hybrid** (permitted with no further act), then give each session a link and drop its room, then **hybrid → virtual**. Stating the impossible remedy was the defect; hybrid is the transitional value (FR-1059a).
**An organizer switches an in-person conference to hybrid.** Permitted with no further act, because hybrid requires *at least* one of a room and a link and every existing session already carries a room. Switching back to in-person is then refused if any session has since gained a link.
**A session in a hybrid conference is saved with neither a room nor an access link.** Refused (FR-1050). It is the one refusal that does not depend on modality, and it is the failure the previously mandatory room was preventing by accident.
**An organizer pastes a link with a scheme the product does not expect, or a fragment that is not a link at all.** Refused with the named code of FR-1053, at the surface and at the boundary — and the product never requests the URL to find out whether it works.
**An access link is corrected two minutes before the session starts.** The new value is what every attendee reads the next time they open the session, nothing is notified (FR-1058) and nothing is queued. There is no window in which some attendees hold the old link because the product deferred publication (FR-1056).
**A virtual session is cancelled.** It is presented as cancelled wherever an attendee would see it (FR-1022) and its access link is **not** cleared: the cancellation marking is what tells an attendee not to join, and clearing the field would be a second act with no record of who took it.
**An attendee is offline and opens a virtual session.** They see the cached programme with the retrieval time every cached surface already states, and the link they hold may be stale. This is register entry 22's territory and this row does not close it.
**Two attendees attend the same hybrid session, one in the room and one on the link.** Nothing records which either chose (FR-1057). The session carries both and the attendee decides at the time.
**A conference created before this change is read before it is re-seeded.** It carries the back-filled modality of FR-1048, which is the value its existing programme already satisfies, so no session is invalid and no read fails — and the default is gone, so the next conference created without an explicit value fails rather than inheriting one.
**The client later renames a format, or asks for a seventh.** It is a change to one enumerated set and affects nothing else, precisely because FR-1047 forbids anything branching on it.
**Two attendees take the last place at the same instant.** Exactly one holds it and the other is refused as full. There is no ordering in which both succeed, and no moment at which both are shown as enrolled.
**An organizer raises capacity on a session that had filled.** The freed places become takeable immediately if enrolment has not closed. Nobody is notified: capacity is not one of the three material changes.
**An organizer lowers capacity below the number of places held.** Refused, naming how many are held. Nobody is evicted — releasing a place is the attendee's act, and choosing which attendees lose theirs is not something the product may do.
**An organizer moves a session later, past a deadline that had already closed.** Enrolment re-opens for the new deadline. Accepted cost (FR-1071c); the attendees who were locked out are not told it re-opened, because a re-opening is not one of the three material changes.
**An organizer moves a session earlier so its deadline is already past.** Enrolment closes at once and those already holding places keep them. They receive the start-time notification they would have received anyway; nobody receives a separate "enrolment closed" message.
**An attendee withdraws from an optional session after enrolment has closed.** Permitted. The place is released and stays untakeable while enrolment is closed — the honest state, rather than a place quietly reserved for nobody.
**An attendee holding a place has the session cancelled.** They are notified and their row is marked, exactly as a saver is. Nothing of theirs is destroyed; the place is simply meaningless.
**An optional session with places held is deleted.** Permitted (FR-1077). The organizer is shown the number of places first, and that is the only warning: the attendees are told nothing, their rows carry no marker, and nothing survives to explain the session's absence.
**An attendee holding places withdraws from the conference, or deletes their account.** Every place is released in the same act. No seat is held by somebody who has left.
**An attendee opens an optional session while offline.** The remaining-places figure is omitted rather than served stale, and enrolling is refused rather than queued.
**An organizer converts a mandatory session with saves on it to optional, or an optional session with places held to mandatory.** Refused in both directions, with its own explanation.
**An organizer sets a closing offset longer than the conference's own length.** Permitted, and the session simply reads as closed to enrolment from the moment it exists — visibly, to organizer and attendee alike. Refusing would be a rule the product invented, and the closed state is legible where an invented rule would not be.
**An organizer sets a capacity of zero.** Refused. A session nobody may take a place in is a cancelled session, and cancellation already exists and preserves everything.
**An attendee takes places in two optional sessions that overlap in time.** Permitted, and unremarked. The product already permits overlapping saved sessions, and refusing here would apply a rule to enrolment that it does not apply to saving.
**An attendee re-enrols in a session they withdrew from.** Permitted while a place remains and enrolment is open, on exactly the same terms as the first time. Nothing remembers that they left.
**A session the attendee holds a place in is one they have also written a private note on.** Both survive independently: the note is engagement and protects the session from deletion, the place is not and does not.
**A platform operator retires a sector that attendees already hold.** Their profiles are untouched: the sector still displays, still exports, and still reads back on the next edit as the value they hold. It is simply not on offer to anybody choosing now (FR-1094a).
**A platform operator tries to delete a value outright while attendees hold it.** Refused, naming that attendees hold it, with retirement offered instead — the delete-versus-cancel shape FR-1017 and FR-1019 already establish. Deleting is available only while nobody holds it.
**An attendee clears a retired value and then wants it back.** They cannot choose it again, because it is no longer offered. Accepted and stated rather than repaired: the alternative is a per-attendee exception list, which is a second vocabulary.
**An attendee changes their sector while holding a subsector belonging to the old one.** The subsector cannot remain attached to a sector it does not belong to (FR-1087). Resolving it is the attendee's own act inside their own save — no administrative repair path exists, and none may be added.
**The vocabulary has no interests at all**, because the client's list has not arrived. The interest chooser renders its empty state explaining none are defined yet, the profile saves normally without any, and Discover's interest filter renders its own empty state rather than an error (FR-1086).
**An attendee whose only interests are retained free text.** They rank exactly as they did before this row shipped, appear in Discover unchanged, and are never prompted to convert. Their values are visible to nobody as a choice (FR-1095).
**An attendee holds the maximum number of interests, all retained free text.** The existing count bound applies to the whole set, controlled and retained together, so adding a chosen interest requires removing one — the attendee's own act, refused at the write with an explanation rather than silently truncated.
**A conference organizer opens the administrative site looking for the vocabulary.** No such destination exists for their tier, and a direct attempt is refused server-side (FR-1089). Their conference-authoring reach is unchanged.
**A conference organizer is also an attendee with a sector and interests.** Their own selections are theirs to edit in MyNet like anybody else's; nothing about their promotion changes what they may set on themselves, and nothing about the vocabulary destination reaches their own row.
**An attendee saves a profile with a sector, no subsector, no interests and no company.** Valid, complete, and indistinguishable in behaviour from a fully filled profile everywhere except what the card displays (FR-1091, FR-1092).
**An attendee deletes their account.** Their sector, subsector, activity description and every interest selection go with them, including any retained free text, and no per-sector aggregate anywhere retains a trace (FR-1098).
**A reader is paging Discover when a value is retired mid-scroll.** They see no attendee twice; an omission is permitted, as it already is. The retired value continues to rank for those who hold it, so no page silently re-scores (FR-1095a).
**A value is retired and then un-retired.** It becomes choosable again with no repair to any attendee record, because retirement never wrote to one (FR-1094, FR-1094b).

## Requirements — Tranche 2 *(mandatory)*

### Functional Requirements — Tranche 2

**The event model (REQ-010–014) — event types as two orthogonal axes, the optional room, and the virtual session's access link. FR-1045 through FR-1059.**
- **FR-1045**: **Event type MUST be two independent attributes, never one.** A conference MUST carry a **modality** and, separately, a **format**, and the product MUST NOT collapse them into a single field or a single enumerated list. REQ-010 names *seminarios, hackatones, desayunos, eventos empresariales, congresos, talleres, eventos virtuales, eventos presenciales* in one breath, but two of those describe **how a conference is delivered** and the rest describe **what kind of thing it is** — modelled as one field, **"virtual hackathon" is unsayable**. This is directly testable: a conference that is both virtual and a hackathon MUST be expressible.
- **FR-1046**: **Modality is controlled and it governs behaviour.** Exactly three values — **in-person**, **virtual**, **hybrid** — chosen from a fixed set with no free-text input, following FR-1004's precedent for a track's colour. What it governs is **what each of that conference's sessions must carry** (FR-1050a) and nothing else: no read path in either product may gate an attendee's visibility of a conference or a session on it, because a visibility gate is the lifecycle N4 forbids wearing a different name.
- **FR-1047**: **Format is a descriptive label with no behavioural consequence, and that MUST be asserted as an absence.** It is optional and chosen from the product's enumerated set — seminar, hackathon, workshop, congress, networking breakfast, corporate event — and nothing in either product may branch on it: no filter, no ordering, no ranking, no validation rule, no notification, no visibility condition. A label that quietly acquires behaviour is a second modality nobody declared.
- **FR-1048**: **Modality MUST have no neutral default and no fourth value meaning "nobody chose".** Every conference — including every conference that already exists — MUST carry an explicit value, in the shape a conference's timezone and join code each established: a temporary value applied so existing rows stay valid and its default **dropped in the same change**, because *"a column that keeps a silent default is how a wrong value ships unnoticed"*. **The back-filled value MUST be `in-person`**, named here rather than left to be derived. Stating only "the value every existing programme already satisfies" is insufficient, because **hybrid satisfies it too** — and back-filling hybrid would disable FR-1050a's forbidding half for every conference that exists, while being false about all of them.
- **FR-1049**: **A session's room MUST become optional**, so that a virtual session has a representation rather than a room nobody goes to. **The shipped comment asserting the opposite MUST be rewritten in the same change**: the session record declares its room mandatory on the stated ground that *"Speakers are the only optional part of a session's identity"*, and this requirement makes that sentence false. This is 016's FR-1055 lesson applied before the fact — the comment is the record, and a comment left asserting a retracted rule is the rule as far as the next reader is concerned.
- **FR-1050**: **A session MUST carry a room, an access link, or both, and MUST NOT carry neither**, whatever its conference's modality. This is the one rule that survives every modality change: a session with neither is a session nobody can attend, and it is the failure the mandatory room was accidentally preventing before FR-1049 relaxed it.
- **FR-1050a**: **Modality decides which of the two, and it FORBIDS as well as REQUIRES.** In an **in-person** conference a session MUST carry a room and MUST NOT carry an access link. In a **virtual** conference a session MUST carry an access link and MUST NOT carry a room — a room displayed on a session nobody attends in person is a place shown to people who cannot go there, which is the stranding FR-1022a exists to prevent. In a **hybrid** conference each session MUST carry at least one of the two and MAY carry both, and **hybrid MUST NOT require both**: hybrid means the conference mixes, not that every session is delivered twice. A modality that only ever required and never forbade would drift out of agreement with the programme silently, and a conference that streams one session **is** hybrid — saying so is one edit.
- **FR-1050b**: The modality row's refusals MUST be **mutually different**, asserted as difference from each other rather than as each mapping to some explanation — FR-1069a's shape, and the property this feature's own recorded lesson says a per-code check would otherwise pass while checking nothing. At minimum "carries neither a room nor a link" and "carries a field this conference's modality forbids" MUST carry distinct named codes.
- **FR-1051**: **Whether a session is in person, virtual or both MUST be derived from what it carries, and MUST NOT be stored on the session.** A stored per-session delivery attribute is a second source of truth for what the room and the access link already answer, and the one that drifted would be the one displayed — 009's rule for a vote count and 008's for `lapsed`, applied to the same shape of fact.
- **FR-1052**: **A virtual session's access link MUST live in its own dedicated, validated field, and MUST NOT be carried in the session's summary.** REQ-013 proposed the description field and it is refused on three grounds that each stand alone: the summary is long free text **nothing parses**, so nothing can validate it or address it; it is enumerated in the notification rules as content that **does not notify** (FR-1027), so a join link moved into it would reach nobody when it changed; and rendering organizer-authored free text as clickable markup would be a **new injection surface authored by a promoted attendee**.
- **FR-1053**: **A malformed access link MUST be refused with its own named error code**, distinct from every other refusal this feature can produce, because 014's own recorded lesson is that *"classifying on the code is worth nothing unless the code says which refusal it is"*. Validation MUST be well-formedness and scheme only, and **the permitted scheme set is `https:` alone** — named here, because "an expected scheme" is not something anybody can write a test against. `javascript:` and `data:` MUST be refused by name, since they are the two the check exists for. A value presented to an attendee MUST only ever be one whose scheme passed this check, so the rendering rule and the validation rule cannot drift apart. **The product MUST NOT fetch the link to check it**, because that is a server-side request to a URL a promoted attendee typed.
- **FR-1054**: **Neither product may render a session's summary as clickable markup.** It stays a plain paragraph, which is what makes FR-1052's dedicated field the only route by which a link reaches an attendee — and what stops FR-1052's refusal being undone one component at a time. **This MUST be asserted as an absence** over both products' session surfaces, covering markdown rendering, autolinking and any raw-HTML rendering path.
- **FR-1055**: **An access link is published to every attendee holding the conference's join code the moment it is written**, and the organizer MUST be told so where they type it. Conference content is live-edited and there is no draft state (N4), so there is no moment between writing and publishing. The disclosure is stated rather than left implied because a join link reads like something private and is not.
- **FR-1056**: **There MUST be no timed release, no per-attendee gating and no reveal condition on an access link.** Withholding it until the session starts needs either a lifecycle state, which N4 forbids, or a scheduler, which this feature does not add and which nothing time-driven may dispatch from — so the honest design is FR-1055's: it is visible from the moment it exists.
- **FR-1057**: **The product MUST NOT record whether, when or from where an attendee used an access link.** No attendance record, no join event, no click record — that would be new attendee data collected by a surface nobody asked for, and the enrolment roster ratified in v5.3.0 (O1) is the **only** thing this feature makes visible about who is going to a session. This MUST be asserted as an absence.
- **FR-1058**: **Changing a session's access link MUST NOT dispatch a notification.** N1's material set is exactly three — cancelled, start time, room — and a fourth needs another amendment; v5.3.0 restates in terms that a feature widening the notified **population** is not thereby licensed to widen the **set**. The consequence is bounded rather than hidden: unlike a room, a link is not somewhere an attendee travels to in advance, so a **corrected** link is correct at the moment they open the session and nobody is left in the wrong corridor.
- **FR-1058a**: **That argument reaches correction and does not reach removal**, so removal is decided separately: **clearing an access link MUST be refused while any attendee holds a place or a save on that session**, naming them, in FR-1059a's organizer-acts-first shape. A link that disappears from a session somebody is committed to **does** strand them, and notifying instead would be a fourth material change requiring another amendment.
- **FR-1059**: **The administrative product MUST carry a conference editor, and the conference update path MUST be extended to accept modality and format**, so that modality, format and every other already-updatable conference attribute are correctable after creation. That path today has **no caller in the administrative site**, so a modality chosen wrongly at creation would be permanently uncorrectable — the same defect class this feature has already corrected once, where a mistyped room name could not be renamed and FR-1017 refused deletion while a session referenced it.
- **FR-1059b**: **Conference creation MUST collect an explicit modality** (format optional), and a creation attempt carrying none MUST be refused with its own named code rather than failing generically. Shipped FR-1007's field list is **extended by this tranche rather than contradicted**, and MUST be reworded in the same change — the obligation FR-1049 states for the room comment and FR-1088 for the interests comment. Without this, FR-1048's no-default rule has no write path that honours it.
- **FR-1059a**: **A modality change that would leave an existing session violating FR-1050a MUST be refused, naming the sessions concerned** — FR-1014's shape for the date range, for FR-1014's reason: moving or cancelling them first is the organizer's act, not the system's. A **format** change MUST always be permitted, because nothing depends on it (FR-1047). **Hybrid is the transitional modality by construction**, and that MUST be stated wherever a modality change is described: it is the only value satisfied by both room-only and link-only sessions, so every move between in-person and virtual routes through it. A direct in-person→virtual change is **unreachable by design** rather than merely refused — FR-1050a forbids adding a link *and* forbids clearing the room while the conference is still in-person, so there is no order of operations that reaches virtual directly. Neither change may dispatch a notification for the conference attribute itself; **FR-1058a governs the session-level consequence**, which is where an attendee can actually be stranded.
**Optional sessions, capacity, enrolment and closing deadlines (FR-1060 – FR-1084)**
- **FR-1060**: Every session MUST be either **mandatory** or **optional**, chosen by the organizer who authors it, and a session created without a stated kind MUST be mandatory — as MUST every session that exists today. The shipped programme has exactly one kind of session and every attendee's Agenda was built against it, so the new kind is the one that must be asked for.
- **FR-1061**: An optional session MUST carry a **maximum number of places**, a whole number of at least one, and MUST NOT exist without one (REQ-080). Capacity is what makes a session optional in this product's sense; an optional session with unlimited places is a saved session under a different word, and would give the attendee two ways to bookmark the same thing.
- **FR-1061a**: Capacity MUST NOT be lowered below the number of places already held. The edit is **refused, naming how many places are held**, and nobody is evicted — following the refusals this feature already makes when a date change would orphan sessions and when a timezone is frozen. Raising capacity MUST always be permitted; it takes nothing from anybody. **The count of held places MUST be read inside the updating transaction with the session row locked**, so an enrolment arriving between the check and the write blocks rather than slipping past it — FR-1019a's clause, for FR-1019a's reason, and the one property no layer above a real database can test. Without it a place can be taken over the new cap and FR-1068's invariant is false with nobody having enrolled over a limit.
- **FR-1062**: An optional session MUST carry an **enrolment-closing offset** expressed as a number of hours before that session starts, chosen per session (REQ-085). A session whose materials must be printed closes earlier than one that does not (REQ-086), so the offset belongs to the session rather than to the conference.
- **FR-1062a**: A mandatory session MUST carry neither a capacity nor a closing offset, and neither MUST be presented on it. A field that is meaningless on the kind of session being edited is a field somebody will fill in.
- **FR-1063**: An optional session MUST offer **enrolment in place of saving** (REQ-079, REQ-082). There MUST be exactly **one** commitment control per session and its identity MUST be determined by the session's own kind, never by the reader, the surface or a preference.
- **FR-1064**: There MUST be **no state in which an attendee has saved an optional session but holds no place in it**, and no route by which one can arise. This MUST be asserted as an absence rather than argued: a bookmark sitting beside a reservation is read as a reservation, and the person who reads it that way finds out by arriving at a full room.
- **FR-1064a**: The cost is accepted and stated rather than mitigated: **there is no way to bookmark an optional session you have not committed to.** An attendee who wants to keep it in view must take a place or take none.
- **FR-1065**: A session's kind MUST NOT be changed while any attendee holds a save or a place on it. The refusal MUST carry its own explanation, because there is no honest answer to forty saves becoming twenty places, and inventing one would make the product choose which twenty. **The check MUST run inside the updating transaction with the session row locked** (FR-1019a): a save landing in the window between check and write produces exactly the saved-optional state FR-1064 says has no route.
- **FR-1066**: A session an attendee is **enrolled in** MUST appear in their Agenda exactly as a saved session does — the same chronological placement, the same All/Saved treatment, the same session detail panel with its notes and questions, the same cancelled presentation — and MUST be treated identically by **the Home card that composes the attendee's own programme, which MUST read held places as well as saves**. Home's "Up next" and its rest-of-day timeline need no change and MUST NOT be cited as discharging this: they read the whole programme and never the commitment set, so naming them satisfies the requirement by changing nothing. Enrolment is a stronger commitment than saving, so it MUST NOT be a weaker presence.
- **FR-1066a**: **Every attendee-visible string asserting that a commitment is a *save* MUST be made true of both commitments in the same change.** This is the half of 016's lesson tranche 2 would otherwise drop: FR-1049, FR-1088 and FR-1096a each order a falsified *comment* rewritten, and 016's review found that the identical rule *"was scoped to comments and never reached product copy"*. At minimum: the Agenda's All/Saved filter label, the saved-filter empty state, the Home card's heading and label, and the wording of commitment-write refusals. **The filter and the card MUST be renamed in this specification rather than at implementation**, because FR-1066 as worded otherwise mandates a label that lies about what it contains. The check MUST **read** prose rather than strip it, following 016's card-model-record precedent.
- **FR-1067**: An attendee MUST be able to **withdraw from an optional session**, and the place MUST return to that session's availability immediately. A commitment somebody cannot undo is one they will make by not making it.
- **FR-1068**: **It MUST be impossible for more attendees to hold places in an optional session than its capacity**, including when two attendees take the last place at the same instant. This is stated as an outcome and MUST be verified as one: exactly one of them holds the place and the other is refused, in every ordering, with no interval in which both appear to have succeeded.
- **FR-1069**: A refusal to enrol MUST carry its **own** explanation. "This session is full" and "enrolment for this session has closed" are different facts about the reader's own action, they lead to different next steps, and they MUST be distinguishable by the reader rather than folded into one another or into the indistinguishable refusal the agenda routes give.
- **FR-1069a**: Every refusal this row introduces MUST be **different from every other**, and that MUST be asserted as mutual difference rather than as each one mapping to some explanation. **This feature has already made this exact mistake**: four distinct conflicts and two distinct rejections were written with two shared classifications, so six carefully-written refusals rendered as two sentences, and a test asserting that each mapped to *a* message would have passed.
- **FR-1070**: An attendee MUST be able to see the **number of remaining places** in an optional session while deciding whether to take one — "4 places left" (constitution v5.3.0, O3).
- **FR-1070a**: That figure is a fact about **one session's availability at the moment of deciding**, and it is **not** the count of changes N2 forbids — N2's subject is *things that happened*, which is what turns a per-row marker into an inbox. **N2 is untouched and unweakened**, and the boundary MUST hold in both directions: no surface may aggregate remaining places across sessions, present "how many of my sessions have places", or name or count *who* holds a place to an attendee.
- **FR-1070b**: A remaining-places figure MUST NOT be presented from cached data. A stale number reads as a promise of a place; where the figure cannot be read live it MUST be omitted, and enrolling offline MUST be **refused, never queued**, as every write in this product already is.
- **FR-1071**: The moment enrolment closes MUST be **derived** from the session's start instant and its offset, and MUST NOT be stored as an instant. A session that moves carries its deadline with it and needs no repair step — which matters precisely because this feature made a change of start time something attendees are notified about.
- **FR-1071a**: Whether enrolment is open MUST likewise be derived at the moment somebody asks, and MUST NOT become stored open/closed state on the session. A stored open flag is how a lifecycle arrives without being called one, which is what the no-draft-state rule forbids on conference content (constitution decision 48, N4); capacity is a number and the offset is a number, and everything else about enrolment is derived from them and the clock.
- **FR-1071b**: An attendee already holding a place MUST keep it after enrolment closes. The deadline governs **taking** a place, not holding one. Withdrawal MUST remain available after closing, and a place released after closing MUST NOT become takeable — releasing it is honest about the seat, not an invitation to fill it.
- **FR-1071c**: The accepted cost is stated rather than repaired: **moving a session later re-opens enrolment for somebody previously locked out**, and moving it earlier can close enrolment that was open a moment ago with nobody told. This MUST NOT be answered by storing the deadline, because a stored deadline detaches from the session it belongs to and the detachment is silent.
- **FR-1072**: Enrolment closing MUST require **no scheduled work of any kind** — no job, no sweep, no background timer, nothing that runs when nobody asked. Open or closed MUST be answered against the server's own clock at the moment of the request.
- **FR-1072a**: A closing deadline MUST dispatch nothing. Passing it is not a notification, and it MUST NOT become one: a session approaching its start is the reminder the trigger rules forbid, and a deadline is measured from that same instant.
- **FR-1073**: A conference organizer **assigned to that conference** MUST be able to read the **names of the attendees holding places** in an optional session of it, and a platform operator MUST hold the same read by the product-wide authority they already have (constitution v5.3.0, O1 — the **fourth** recorded Principle VIII exception). An organizer told to close enrolment early because materials must be prepared cannot prepare them for people they cannot name (REQ-086).
- **FR-1073a**: Four bounds MUST hold and MUST be testable: **only enrolment** — no saved session, private note, question or vote is disclosed to any administrative tier; **only an assigned organizer**, for their own conferences; **only that conference's sessions**, so it is not a directory, not a cross-conference view of one attendee and not a route into anybody's profile; and **the attendee is told before they enrol** (FR-1074).
- **FR-1074**: An attendee MUST be told, **before** they take a place, that holding one makes their name visible to the organizers of that conference. This is the only one of the product's four privacy exceptions the subject can decline by not acting, and that is only true if they know before they act.
- **FR-1075**: **FR-1042 survives unnarrowed for everything except enrolment**, and the narrowing MUST be expressed as a named exemption for enrolment alone rather than by relaxing the rule. The shipped guard refuses any administrative address about attendee state on the reasoning that *"a path is a promise"*, so the exemption MUST name enrolment, and every administrative read of who saved, noted, questioned or voted on a session MUST continue to fail.
- **FR-1075a**: **Shipped FR-1025 is narrowed by name, not contradicted.** It survives unnarrowed for saved sessions, private notes, questions and votes — those stay counts-only with nobody identified — and yields for **enrolment alone**, which FR-1073 discloses by name under O1. The shipped confirmation's comment claiming the product *has no route that would* identify anybody becomes false and MUST be rewritten in the same change (FR-1049's obligation). **The delete-versus-cancel confirmation shows the count and not the roster** (FR-1077b), because the act being confirmed is about the session rather than about who is in it, and the roster is one deliberate control away.
- **FR-1076**: No administrative tier may take, release or move a place on an attendee's behalf, and no administrative surface may offer it. An administrative tier acts on content and on authority, never on a person (013), and enrolling somebody is acting on a person.
- **FR-1077**: An enrolment MUST NOT count as engagement for the purposes of deletion, and **an optional session with places held MUST remain deletable** (constitution v5.3.0, O2). The engagement set stays at exactly four — a saved session, a private note, a question, a vote — and this fifth kind of attachment is declared **outside** it.
- **FR-1077a**: The consequence MUST be recorded rather than softened: because enrolling **replaces** saving, an enrolled attendee holds no saved row, so deleting such a session **destroys every held place with no notification, no marker and no trace**, and the person who reserved one finds out by arriving. It is an accepted cost taken by the owner after it was put to them; whether such a deletion should notify the enrolled is **register entry 31**, and it MUST NOT be cited as precedent for narrowing the four.
- **FR-1077b**: Before deleting an optional session, the organizer MUST be shown **how many places are held**. That confirmation is the only warning anybody in the product receives, which is exactly why it cannot be omitted. **The figure MUST be read live and re-read inside the deleting transaction under the same lock FR-1019a takes**, refusing and re-presenting if it has risen since the organizer was shown it.
- **FR-1077c**: **The delete-versus-cancel confirmation MUST NOT assert that nothing is attached to a session that has places held.** The shipped confirmation decides that sentence from the four engagement counts alone, and FR-1077 keeps enrolment outside them — so an optional session with twenty places held renders *"Nobody has saved this session, written a note on it, asked a question or voted. It can be deleted outright"*, which is false at the one moment it matters most. Adding a count line beside that paragraph satisfies FR-1077b and leaves the falsehood standing. The confirmation MUST state the number of places held, that those attendees **will not be notified and their rows will carry no marker**, that nothing will survive to explain the session's absence, and that **cancellation is the preserving alternative**. This is FR-1052/FR-1055's shape applied to prose rather than to comments, and it exists because the guard is brightest where the work was done and blindest where it was missed.
- **FR-1078**: The reason enrolment is excluded from engagement MUST be **written down where the exclusion lives** — whose data it is, and why losing it silently is acceptable — rather than merely configured. The list this feature writes its first entry into is empty by design and demands that sentence; an exclusion that exists only as a setting is one nobody accepted, and the next reader cannot tell it from an oversight. The written reason MUST additionally record that this is an **owner decision under constitution v5.3.0 (O2)**, that it is **not precedent for a second entry**, and that **register entry 31 is open against it** — because this entry will be the template the second one is copied from.
- **FR-1079**: An attendee holding a place in a session MUST be notified when that session is **cancelled, its start time changes, or its room changes**, on exactly the same terms as an attendee who saved it — the same single notification per organizer act, the same coalescing, the same silence for their own act if they are the organizer. Without this, taking a place would mean being told less than bookmarking, which is the stranding the trigger exists to prevent.
- **FR-1079a**: This widens the notification **population** and not the **trigger set**, and the distinction MUST be stated wherever the fan-out is described, because it is written down nowhere in the shipped product. There are still exactly **two** triggers and the second still means exactly those three changes. **The set of session facts the material-change predicate reads MUST be pinned by name to exactly the three N1 changes — cancelled, start time, room — asserted over the source** in the shape the schema-derived engagement guard establishes, so that a fourth logistics field admitted to that input **fails by existing**. Without that, this requirement is documentary: the shipped guard counts *caller modules*, not the material set, so a fourth change added to the predicate would keep the module count at two and pass. **Enrolling, withdrawing, enrolment closing, a capacity change and a change of closing offset MUST all dispatch nothing** — none of them changes where or whether the attendee must be somewhere, and a third trigger needs another amendment.
- **FR-1079b**: **Three shipped Part I requirements say "saved" where this tranche means "saved or holds a place", and MUST be reworded in the same change** — FR-1026, FR-1028 and FR-1030. FR-1028 as shipped says a session **no attendee has saved** dispatches nothing, which FR-1079 directly contradicts; leaving it standing makes Part I and Part II disagree inside one document. The shipped integration test asserting the savers-only behaviour MUST be re-scoped to "no saver and no holder of a place" **and renamed**, so a guard written for one rule cannot be mistaken for enforcement of the other.
- **FR-1080**: A materially changed session an attendee holds a place in MUST carry the same **per-row marker** in Agenda and on Home as a changed saved session, clearing once they have viewed the session. The marker MUST stay per-row: no aggregate over enrolments, no list of changes, and no surface whose subject is what happened (constitution v5.2.0, N2). **Clearing it writes per-attendee viewed state on the held place**, which the Held place entity declares under the same cascade and export coverage as the place itself — without it the marker has nowhere to be recorded and no way to clear. The shipped viewed route MUST stamp whichever commitment the attendee holds on that session, and an organizer's own act MUST NOT mark their own row.
- **FR-1081**: Withdrawing from a conference MUST **release that attendee's places** in it, in the same act. Nothing cascades from a registration — the shipped withdrawal path calls that gap *"invisible in the schema"* and deletes saves and notes by hand for the same reason — and a place left behind is held by somebody who is no longer at the conference and can no longer release it.
- **FR-1081a**: Deleting an account MUST release every place it holds, everywhere. A held place is **attendee data**: it is reachable by the deletion cascade and covered by the personal-data export, declared in the change that introduces it rather than allow-listed.
- **FR-1082**: There MUST be **no waitlist**. A full session refuses and says so; it does not record who wanted in, because a waitlist is a queue that has to notify somebody when it moves, and that is a third notification trigger.
- **FR-1083**: There MUST be **no automatic enrolment** — nothing may take a place on an attendee's behalf from a saved session, a recommendation, an interest, a track, a profile or a previous conference. A place is taken by an explicit act or it is not taken (REQ-082).
- **FR-1084**: There MUST be **no attendance, check-in, or no-show record** of any kind. Holding a place is a claim on capacity, not a statement that somebody turned up, and a record of who attended is a different disclosure about a person than the one this amendment ratified.
**The profile taxonomy — a product-wide controlled vocabulary of sectors, subsectors and networking interests, and the profile fields that draw on it (REQ-027–REQ-042). Range: FR-1085 through FR-1099.**
- **FR-1085**: The product MUST hold **one controlled vocabulary of sectors, subsectors and networking interests, shared by the whole product**. It is **cross-event, and the reason is stated rather than inherited** (standing decision 7): a profile describes the person rather than their presence at one conference, so a per-conference vocabulary would make somebody's sector reset when they switch events — the same argument that already puts the profile itself on the cross-event side.
- **FR-1085a**: The vocabulary itself is **reference data, not attendee data**: it names no attendee, cascades from no attendee, and appears in no personal-data export. This MUST be declared with that reason rather than allow-listed silently, in the shape both schema-derived coverage guards already require.
- **FR-1086**: The vocabulary MUST be seeded with exactly four sectors — **Servicios, Comercio, Industria, Agro** (REQ-035) — and its subsector and interest lists MUST start **empty and authorable**. The client's lists do not exist, so the product MUST be complete and usable without them: an attendee MUST be able to finish and save a profile, and every surface reading the vocabulary MUST render an empty state rather than an error or a blocked form.
- **FR-1087**: Every subsector MUST belong to exactly one sector, and an attendee's subsector MUST be one belonging to the sector they chose. Sector and subsector MUST NOT accept typed values — no free-text entry and no "other, please specify" — because REQ-034 and REQ-037 ask for a curated list, and an escape hatch is how a list stops being curated.
- **FR-1088**: A networking interest MUST be chosen from the vocabulary rather than typed (REQ-032). **This reverses what the shipped schema comment asserts as current fact** — that interests are "a bounded list of short free-text values, not a controlled vocabulary", because "a fixed taxonomy would be an organizer-authored artifact, and Principle III puts that out of scope". **That premise was reversed by constitution v4.0.0**, and the comment MUST be rewritten in the same change rather than quietly contradicted: in this codebase the comment is the record.
- **FR-1089**: The vocabulary MUST be authorable **at platform tier only**, on its own administrative destination. A conference organizer MUST NOT create, rename, retire or reorder any value: their authority reaches only the conferences they are assigned, and this is product-wide reference data no conference owns. The refusal MUST be server-enforced rather than a hidden control.
- **FR-1089a**: Every vocabulary act MUST write an audit entry, and **the act and its entry MUST commit in one transaction** (013, FR-994). There MUST remain no read path over the audit trail in either product.
- **FR-1090**: An attendee profile MUST be able to carry a **sector**, a **subsector**, a short free-text **description of productive activity**, **networking interests chosen from the vocabulary**, and the **optional company name it already holds** (REQ-028–REQ-031, REQ-038, REQ-042). None of them replaces the display name, which remains the only required identity value.
- **FR-1091**: **Every one of those fields MUST be optional, and an incomplete profile MUST remain valid** — shipped FR-336 holds unchanged. No capability may be gated on profile completeness: signing up, joining a conference, appearing in Discover (subject only to the existing discoverability and verification conditions), messaging, sharing a card and scheduling all MUST behave identically for an empty profile. **REQ-027 — a profile that must be completed at sign-up — is explicitly NOT granted**: it would retract a shipped requirement, render every existing attendee non-compliant, and needs its own amendment.
- **FR-1091a**: There MUST be no profile-completeness score, percentage, meter, badge, checklist or interstitial in either product, and no repeated prompt to finish one. Asserted as an absence, because a completeness surface is how an optional field becomes mandatory without anybody deciding it was.
- **FR-1092**: Where a company name is given it MAY appear on the networking card (REQ-040); **where it is absent the card MUST show no company line at all** — no empty row, no placeholder, no dash (REQ-041). The same rule binds sector, subsector and productive activity: an unset field is absent from the card rather than present and blank. The shipped card already omits an absent company, and this requirement exists so that behaviour is guarded rather than incidental.
- **FR-1093**: **No administrative tier may create, change or remove an attendee's own taxonomy selections.** Maintaining the vocabulary is permitted; correcting somebody's chosen sector for them is not. The shipped guard asserting that a person is not authorable at any tier MUST survive and MUST extend to these new fields — conference content is authorable, a person is not (v4.0.0).
- **FR-1093a**: The vocabulary surface MUST be addressed and named as reference data, never as a profile surface, **because a path is a promise** — the guard reading those promises cannot tell a vocabulary from a person by intent, and a name that reads as profile editing is indistinguishable from the thing FR-1093 forbids.
- **FR-1094**: **Retiring a vocabulary value MUST be expressible without writing to any attendee's record**, because an administrative write to an attendee record is forbidden (FR-1093). Retirement is therefore the mechanism, and outright deletion of a value any attendee holds MUST be refused, naming that attendees hold it — the shape FR-1017 already uses for a track or room a session references.
- **FR-1094a**: A retired value MUST NOT be offered as a new choice anywhere — not in the profile editor, not in Discover's filters. Attendees who already hold it **keep it**: it continues to display on their profile and card, and continues to count toward the shared-interest ranking, because retiring a label is an administrative act and must not silently rewrite what somebody said about themselves. The cost is stated rather than hidden: an attendee who clears a retired value cannot choose it again.
- **FR-1094b**: Retirement MUST be reversible, and it MUST NOT become a draft or publication lifecycle: a value is choosable from the moment it exists, there is no unpublished vocabulary value, and no further state may be added to one. The shipped draft-state guard covers conference content only and would pass a lifecycle-shaped flag here green, so **its reach MUST be extended in the same change** or this requirement ships unguarded.
- **FR-1094c**: **Renaming a vocabulary value any attendee holds MUST be refused**, naming that attendees hold it, with retire-plus-create offered instead — the same delete-versus-retire asymmetry FR-1094 draws. A rename changes what every holder's profile and card assert about them **without writing to any attendee record**, which is precisely the act FR-1093 forbids and which FR-1094a exists to prevent; it is forbidden here because it reaches the same outcome by a route that looks like editing content. Correcting spelling or case in a value **nobody** holds remains permitted.
- **FR-1095**: **Existing free-text interests MUST NOT be destroyed, rewritten or reassigned** by the move to controlled values. An attendee keeps every interest they wrote; it displays as it always has and continues to count toward the shared-interest ranking. It MUST NOT be offered as a choice to anybody else, and no administrative act may map it onto a vocabulary value — that is an administrative write to an attendee's record, which FR-1093 forbids. Replacing a retained value with a chosen one is the attendee's own act, at their own pace, with no prompt and no deadline.
- **FR-1095a**: The shared-interest ranking MUST continue to be computed over the interests two attendees actually hold — controlled and retained free text alike — matched exactly rather than approximately, so no attendee's rank changes because of how a value was authored. **Discover's paging guarantee MUST be unchanged**: no attendee ever appears twice and omissions are permitted, including for a reader paging while the vocabulary or their own interests change underneath them.
- **FR-1095b**: **A profile write MUST accept every sector, subsector and interest value the writing attendee ALREADY HOLDS** — retained free text and retired vocabulary values alike — and MUST refuse only values that are neither held by that attendee nor currently choosable. FR-1088's controlled-choice rule binds what may be **added**, not what may be **kept**; without this, an attendee holding a retired value cannot save an unrelated change to their own profile. Whole-profile semantics are unchanged, so a save omitting a held value removes it — therefore the editor MUST present held-but-unchoosable values as present and removable, never silently drop them.
- **FR-1096**: Discover's **interest** filter MAY offer the whole vocabulary rather than only the values the reader has already seen, and **the relaxation is stated rather than assumed**: the accumulate-what-you-have-seen design exists because a conference-wide list "would disclose the shape of the population", and a closed vocabulary the product publishes is not population data. Two bounds hold it: no option may carry a count or any other signal of how many attendees hold it, and every value MUST be offered whether or not anybody at the conference holds it — an option list that shrinks to what exists is population data again.
- **FR-1096a**: The **role** filter MUST keep accumulating from what the reader has already seen, because a role is still free text and therefore still population data. The shipped comment arguing that accumulation MUST be rewritten to say which half of it still governs — a comment that is half true is worse than one that is false, because the half that is wrong is the half nobody re-reads.
- **FR-1097**: Sector, subsector, productive activity, interests and company MUST be governed by the **one existing visibility decision per attendee** (standing decision 16). No field may gain its own audience, its own toggle or its own opt-out — 008 specified a contact line carried only by a shared card and it was withdrawn for exactly this reason.
- **FR-1098**: An attendee's sector, subsector, productive activity and interest selections are **attendee data**: they cascade from the attendee and appear in the personal-data export, and each new field fails the two schema-derived coverage guards by existing until it is declared. **Nothing survives a deletion de-attributed** — no retained per-sector count, no anonymised aggregate, no tombstone — following the rule 009 established for a departing attendee's questions.
- **FR-1099**: No external institutional taxonomy may be imported wholesale. REQ-037 asks for a curated, manageable list precisely because larger official ones exist; importing one is how the list stops being curated, and it would put thousands of values in front of an attendee filling in one field.
- **FR-1099a**: Sector, subsector and productive activity MUST NOT become inputs to the recommendation ranking. The shared-interest count remains the only ranking signal, and adding a second one is a decision about who the product suggests, not a consequence of storing a new field.
- **FR-1099b**: The administrative product MUST gain no view of who holds which value: no per-sector attendee count, no roster, no directory-shaped read, and no ability to reach one attendee's profile from a vocabulary value. **A vocabulary surface must not become a census.** Asserted as an absence.
- **FR-1099c**: Nothing in this row may dispatch a notification. The trigger set stays at **two** — a received message, and a material change to a session the attendee has saved or enrolled in — and neither a vocabulary change nor a profile edit is in it. A third trigger needs another amendment.

### Key Entities — Tranche 2

- **Conference modality** — which of in-person, virtual and hybrid describes how a conference is delivered. **Per-event, and not a default being assumed**: it is an attribute *of* one conference, so there is no cross-event reading of it to weigh (standing decision 7). Conference content rather than attendee data — no cascade from an attendee and no export coverage, declared with that reason rather than allow-listed silently.
- **Conference format** — a descriptive label naming what kind of event it is. **Per-event, for the same reason as modality**: it describes one conference. Optional, conference content, no cascade and no export coverage.
- **Session access link** — where a virtual or hybrid session is attended. **Per-event, because it addresses one session of one conference and means nothing outside it** — carrying it across events would be a link to a session the attendee is no longer at. Conference content rather than attendee data: it is authored by an organizer, describes the session, and identifies nobody.
- **Session room** — unchanged in shape and unchanged in scoping (per-event conference content); it becomes **optional** (FR-1049), and the comment declaring it mandatory is rewritten in the same change.
- **No new entity holds attendee data in this row, and that is stated rather than left to inference.** Nothing here cascades from an attendee, nothing joins the personal-data export, and FR-1057 forbids the one record that would have — a note of who used a link. A row adding no coverage must say it looked.
- **Session kind** — whether a session is mandatory or optional. **Conference content, per-event**, because it is an attribute of a session and a session belongs to exactly one conference (standing decision 7). Not attendee data: no cascade from the attendee, no export coverage, declared with that reason rather than allow-listed silently.
- **Capacity** — the maximum number of places in an optional session. **Conference content, per-event**, for the same reason as the session it belongs to. Organizer-authored, and bounded below by the number of places currently held (FR-1061a).
- **Enrolment-closing offset** — how many hours before its start a session stops accepting new places. **Conference content, per-event.** Stored as an offset and never as an instant, so that it follows a rescheduled session (FR-1071).
- **Held place (enrolment)** — which attendee holds a place in which optional session, when they took it, **and when they last viewed it, which is what makes FR-1080's marker able to clear**. **Attendee data, and per-event, because a session belongs to exactly one conference and a place in it cannot mean anything at another** (standing decision 7). This is deliberately the opposite of a held card, which is cross-event because it describes a relationship between two people rather than a presence at one conference. It is reachable by the deletion cascade from the attendee and from the session, covered by the personal-data export, and released explicitly on withdrawal from the conference because nothing cascades from a registration (FR-1081).
- **Remaining places** — capacity minus the places currently held. **Derived at read time and stored nowhere**, following the vote count that must not become a column and 008's `lapsed`: a stored counter is a second source of truth for a number the rows already answer, and the one that drifts is the one on the screen.
- **Enrolment deadline** — the instant enrolment closes, derived from the session's start and its offset. **Derived, never stored**, and never compared against the clock anywhere that dispatches (FR-1072).
- **Enrolment roster** — the names of the attendees currently holding places in one optional session. **A read rather than a stored thing**, per-event by construction because it is scoped to one session of one conference, and readable only by an organizer assigned to that conference or a platform operator (FR-1073). It has no history: who withdrew is not part of it.
- **Saved session** — unchanged in shape, and unchanged in meaning: it continues to cover mandatory sessions alone. What changes is that it is no longer the only way an attendee's own programme is composed, so every surface that reads it must read places too (FR-1066, FR-1079).
- **Session change record** — unchanged in shape. Its recipient population widens from savers to savers **and** holders of places; the three material changes it covers are unchanged (FR-1079a).
- **Sector** — a value in the product-wide controlled vocabulary, seeded with the client's four (Servicios, Comercio, Industria, Agro) and authorable at platform tier. **Cross-event**, per standing decision 7, **because a profile describes the person rather than their presence at one conference**: a per-conference list would make somebody's sector reset when they switch events. Reference data, not attendee data — no cascade from an attendee and no export coverage, declared with that reason.
- **Subsector** — a value belonging to exactly one sector, authorable at platform tier, starting empty because the client's lists do not exist. **Cross-event, for the same reason as its sector** — it is a refinement of the same person-level statement, and splitting the two scoping rules would let a subsector outlive the sector it qualifies in one conference and not another. Reference data.
- **Networking interest (vocabulary value)** — what an attendee may say they are looking for, chosen rather than typed. **Cross-event, because interests are read cross-conference by the Discover ranking of every event the attendee attends** and a per-conference list would make the same person's stated intent incomparable between two conferences. Reference data.
- **Retirement of a vocabulary value** — an attribute of the value, not a separate record: whether it is still offered as a new choice. **Cross-event with the value it belongs to.** Deliberately not a draft/publish lifecycle (FR-1094b): it withdraws a value from future choice and does nothing else, and it exists specifically so a value can be withdrawn **without writing to any attendee's record**.
- **Attendee profile** — gains sector, subsector and a short productive-activity description, alongside the company, role and headline it already carries. **Cross-event, unchanged and for the reason already recorded on it**: it describes the person, not their presence at one conference. Attendee data — cascades from the attendee, covered by the personal-data export, governed by the single visibility decision (FR-1097, FR-1098).
- **Attendee interest selection** — the link between an attendee and either a vocabulary interest or a retained free-text value from before this change. **Cross-event, because it belongs to the profile it describes**, and per-event selections would mean the same person wanting different things at two conferences in the same week. Attendee data — cascades from the attendee, exported, and destroyed entirely on deletion with nothing retained de-attributed.

- **FR-1099d**: **The productive-activity description MUST join Discover's existing free-text search predicate**, alongside display name, company, role and headline, matched with the same unaccented case-insensitive comparison — it is the field REQ-030 exists for, and a description nobody can search for is a description nobody reads. **Sector and subsector MUST NOT join it**: they are controlled values whose route into Discover is the filter question this row leaves open, and putting them in free-text search would answer that question by accident.

## Success Criteria — Tranche 2 *(mandatory)*

### Measurable Outcomes

- **SC-1013**: An attendee can take a place in an optional session in **one action** from the session
  as it appears in the programme, without opening a second screen.
- **SC-1014**: When more attendees act on the last place than there are places, **exactly one
  succeeds**, verified by concurrent attempts rather than by sequential ones.
- **SC-1015**: An attendee refused a place can tell **from the message alone** whether the session was
  full or enrolment had closed, with no second request and no guessing.
- **SC-1016a**: An attendee holding a **save on one session and a place in another**, both changed by a single
  organizer act, receives **exactly one** notification whose count is saves plus places — the mixed case, which is
  the one the coalescing arithmetic can get wrong without any single-commitment test noticing.
- **SC-1016**: An attendee holding a place receives the same notification and the same on-row marker
  for a cancellation, a time change or a room change as an attendee who saved the session — verified
  by running the tranche 1 scenario twice, once with a save and once with a place.
- **SC-1017**: **No notification is dispatched by anything time-driven**, verified as an absence over
  the source rather than by observation, so that "it did not fire during the test" cannot be mistaken
  for "it cannot fire".
- **SC-1018**: An organizer preparing materials can obtain the list of people attending an optional
  session **in their own conference** in one action, and can obtain nothing equivalent for saved
  sessions, notes, questions or votes in any conference.
- **SC-1019**: A profile with **every** taxonomy field left empty saves successfully and leaves every
  destination fully usable.
- **SC-1020**: A platform operator can add a subsector or an interest and see it selectable by an
  attendee **without a deployment**.
- **SC-1021**: An attendee's existing free-text interests survive the move to a controlled vocabulary
  — none is silently discarded.
- **SC-1022**: A virtual session presents its joining link and **no empty room line**; an in-person
  session presents its room and no empty link line.
- **SC-1023**: Every value an organizer can set at conference creation can afterwards be corrected by
  an organizer assigned to it.
- **SC-1024**: No view in either product presents a count of *changes* — **SC-1009's** guarantee is
  re-verified against the new surfaces, and the criterion MUST keep the two counts apart: **remaining places in one
  session is permitted** (FR-1070/FR-1070a) and **a count of changes is forbidden** (FR-1031, N2). Tranche 2 puts
  both on the same rows, which is exactly why the distinction is verified rather than assumed.

- **SC-1025**: An organizer deleting an optional session with places held is shown the number held **and told those
  attendees will not be notified**, before the act completes; the attendees who held places then receive no
  notification and no on-row marker — the silence verified **as an absence over the source** rather than by
  observing that nothing arrived, in SC-1017's shape. This is the tranche's only irreversible act and was the only
  one with no success criterion.
- **SC-1026**: After the notified population widens, the **trigger set is still two and the material set is still
  three**, verified over the source. Counting dispatching modules is not sufficient evidence — a fourth material
  change added to the predicate leaves that count unchanged.

## Feature Declarations — Tranche 2 *(mandatory — Constitution Principle IX)*

**Discharged a second time, as the scope note at the head of this document requires.** These rows
answer for tranche 2 alone; tranche 1's answers stand unchanged above.

| Obligation | Declaration |
|---|---|
| **Actor and tier** (Principle III, added 4.0.0) | **Both actors, in both products, and tranche 2 is the first part of 014 where an administrative surface reads attendee data.** Authoring — conference modality and format, optional sessions, capacity, closing offsets — serves the **conference organizer** and the **platform operator** in `apps/admin`. The **enrolment roster** serves an **assigned conference organizer only**, and is the narrowest surface in either product: it is the first administrative read of attendee state this project has ever permitted. The **vocabulary editor** serves the **platform operator only** — a conference organizer MUST NOT reach it, because it is product-wide reference data and their authority is per-conference. Enrolment, remaining places and the taxonomy profile fields serve the **attendee** in `apps/web`, identically for everybody, depending on no role — so tranche 1's FR-1003 absence holds unchanged. |
| **Offline behaviour** (Principle VI) | **The administrative product still caches nothing**, unchanged from 013 and tranche 1: every authoring action attempted offline is **refused, never queued**. On the attendee side there are **two** new reads and they are deliberately opposite. **The attendee's own enrolment set is a CACHED read**, carried alongside the saved set — ideally on the same payload, as tranche 1 carried the marker on the saved-session read — so an offline Agenda still shows the sessions they are committed to, in chronological place, under the existing staleness stamp. **Remaining places is a LIVE read and MUST declare itself as one.** The caching decorator treats any method not named as a read as a *write*, and a write purges the whole conference prefix — 008's defect. A stale seat count is worse than no seat count, because it invites an attendee to act on a place that is gone. Enrolling and withdrawing are **writes**: refused offline, never queued, and their purge of the conference prefix is correct, because the programme they clear is the one whose availability just changed. The taxonomy vocabulary is a read; whether it is cached is a plan-stage decision that MUST be declared either way rather than defaulted. |
| **Desktop layout** (Principle IV) | Administrative: the shell 013 built, gaining a **fifth destination** for the vocabulary and gaining capacity, closing-offset and roster controls inside the existing programme editor. Attendee: existing layouts; enrolment replaces the save control in place, and remaining places sits with it. |
| **Tablet layout** (Principle IV) | Administrative: reduced rail, two-column, stacked detail; the roster stacks below the session form rather than beside it. Attendee: unchanged in structure. |
| **Mobile layout** (Principle IV) | Administrative: compact header, single-column, full-width overlays, touch-sized controls, **fully operable at 390px** with no horizontal scrolling — including the roster, which MUST reflow rather than scroll sideways. Attendee: the enrolment control and the remaining-places figure MUST fit the existing row at 390px without truncating the session title, which is the width failure register entry 4 already records against the top bar. |
| **Empty / loading / failure states** (Principle IV) | **New states this tranche must carry**, none of which exists today: an optional session with **no places left** (a state, not an error); an optional session whose **enrolment has closed** (distinct from full — SC-1015); an optional session with **nobody enrolled** (the organizer's roster, which must read as "nobody yet" rather than as a failure); an **empty vocabulary** (the shipped condition, since the client's lists do not exist — it MUST invite authoring rather than look broken); a **conference with no modality set**, which existing seeded conferences will be in until migrated; and **an optional session with places held, being deleted** — the destructive confirmation FR-1077c governs, which this row previously omitted while enumerating five harmless states. Failure on enrol MUST surface the server's own explanation, never a generic message — this feature's recorded lesson. |
| **Accessibility** (Principle IV) | Every new control accessibly labelled, visible focus, keyboard operable. **Remaining places MUST be conveyed as text**, never by colour or by a bar alone, and the difference between "full" and "closed" MUST be in the text rather than in styling. Any modal — the capacity-reduction refusal, the withdraw-from-session confirmation — is a native `<dialog>` opened with `showModal()`, Escape-dismissible, **centred by the base rule in `theme/tokens.css` rather than a local `m-auto`**, focus restored to the opener after closing. |
| **Validation checklist discharged** (Principle VII) | Discharges **session save** end-to-end under a second attendee-state relation, and **keyboard focus visibility and accessible labels** for the new administrative and attendee controls. Explicitly does **not** discharge desktop and mobile rendering review (entry 4, which this tranche escalates again by adding a fifth administrative destination), the physical iPhone test, or the by-hand quickstart walkthroughs outstanding from 007, 008, 009, 013, 014 tranche 1 and 016. |
| **Identity scoping & server-side authorization** (Principle VIII) | Three predicates, all server-enforced, all refusing identically to a thing that does not exist. Authoring authority stays the tranche 1 predicate over principal and named conference. **The roster adds a second, narrower predicate**: assigned organizer, that conference, enrolment only. **The vocabulary adds a platform-tier predicate**, because the per-conference predicate cannot express product-wide authority. An attendee's own enrolments are scoped to that attendee and disclose nothing about anybody else's — the remaining-places figure is an aggregate over a bounded resource, not a window onto who holds it. |
| **Deletion & export coverage** (Principle VIII) | **An enrolment IS attendee data.** It cascades from the attendee, appears in the personal-data export, and is released by **withdrawal from the conference** as well as by account deletion — the second needs writing by hand, because nothing cascades from a registration and that gap is invisible in the schema. **Capacity, the closing offset, modality, format and the access link are conference content**: no cascade, no export coverage, declared with that reason rather than allow-listed. **The taxonomy vocabulary is reference data, not attendee data** — no cascade, no export — while an attendee's *chosen* sector, subsector, activity description and interests **are** attendee data and must be exported with the profile. **Enrolment is deliberately NOT engagement** (v5.3.0 O2), which requires the first entry in the exclusion list, with the justification written down rather than configured. |
| **Event scoping** (Standing decision D1/7) | **Mixed, deliberately, and neither side is a default.** Optional-session configuration, enrolments and the roster are **per-event**, because a session belongs to exactly one conference. **The taxonomy vocabulary is product-wide** and an attendee's taxonomy selections are **cross-event**, because a profile describes the person rather than their presence at one conference — the same reason the profile has always been cross-event. That asymmetry is the point: a per-conference sector list attached to a cross-event profile field would make somebody's sector change when they switched events. |
| **Administrative counterpart** (Principle IX, added 5.0.0) | **Tranche 2 adds two attendee-facing capabilities, and each has a different answer.** (1) **Enrolling in an optional session** — its counterpart **exists and is built here**: the organizer sets the capacity and the deadline that bound it, and reads the roster that results. This is the row that forced constitution v5.3.0's O1, because the counterpart could not exist without a privacy exception. (2) **Choosing taxonomy values on a profile** — its counterpart is **partly built here and partly explicitly NONE**. A platform operator authors the *vocabulary* an attendee chooses from, which is the administrative half; but **no administrative tier may see, correct or override an attendee's selections**, and that absence is deliberate and guarded. "None, because a person is not authorable at any tier" is the answer, and it is the same answer tranche 1 gave for profile editing. |
| **Register position** (Governance) | **Blocked by**: nothing. Constitution **v5.3.0** was its only gate and was **ratified 2026-08-14**. **Resolves**: none. **Escalates**: entry **4** again, by adding a fifth administrative destination and a new attendee-side control at the width that already truncates; entry **22**, by giving the cached conference a third way to be wrong — remaining places can now be stale, which is why that read must be live. **Opens**: entry **31** (whether deleting a session should notify the attendees enrolled in it), opened by v5.3.0 as the recorded consequence of O2. |
| **Migration number** (Branching — parallel work; rule changed 5.3.0 by O4) | **None claimed here, deliberately.** Tranche 2 adds schema and will take the **next free number at generation**, extending the delivery roadmap's number table in the same change. Reserving one in this document is exactly what O4 abolished, after the scheme collided three times. |

## Assumptions — Tranche 2

- **One format per conference, and no format on a session.** A set of labels would be a second decision with no behaviour behind it (FR-1047), and a session-level label would invite the branching FR-1047 forbids.
- **The format vocabulary is a fixed product-side set, not organizer-authored.** Adding one is a change to an enumerated list, which is cheap precisely because nothing branches on it; free text would be a rendering surface authored by a promoted attendee, which FR-1052 refuses elsewhere for the same reason.
- **Modality lives on the conference alone; a session's delivery is derived from what it carries** (FR-1051). An organizer wanting per-session control sets the conference to hybrid — which is what hybrid means.
- **An in-person conference forbids an access link**, on the reading that a conference streaming any session *is* hybrid and that saying so is one edit. This is the one place FR-1050a could reasonably be read the other way, and it is where it changes if the owner reads it differently — nothing else in this row depends on it.
- **One access link per session, not a list, and no separate passcode field.** A meeting passcode is carried in the link; a second field would be a second disclosure under FR-1055's publication rule with no second reason to exist.
- **Validation is well-formedness and scheme only.** Reachability is deliberately not checked (FR-1053), because checking it turns an authoring save into a server-side request to a URL somebody typed.
- **A cancelled session keeps its access link.** FR-1022's cancellation marking is what tells an attendee not to join; clearing the field would be a second act nothing records.
- **Capacity is required on an optional session, and "optional with unlimited places" is deliberately unsayable.** It would be a saved session under a different word, and would give the attendee two controls that mean the same thing on sessions that look alike. Reversible without re-specifying: if the owner wants an uncapped optional session, FR-1061 is where it changes.
- **The closing offset is a whole number of hours**, which is the unit the client used (REQ-085 enumerates 2, 3, 5 and 24). An offset of zero — enrolment open until the session starts — is permitted, and is REQ-083's "even a few minutes before".
- **Remaining places are shown as a number rather than as a threshold.** At conference scale a number is a fact about availability; at seed or pilot scale it is close to a statement about identifiable people, exactly as tranche 1 recorded for engagement counts. The mitigation available without a decision is to present availability as "places available" versus a number, and FR-1070 is where that changes.
- **The roster is names and nothing else.** No contact detail, no route into a profile, no export, no message action, no bulk act. The organizer is preparing materials, not networking, and the exception was granted for the first.
- **An organizer sees who holds a place, never who released one.** A withdrawal history is a record of somebody changing their mind, and O1 licenses the roster rather than its past.
- **Withdrawing and re-enrolling are not separately bounded** beyond the per-action throttling every write in this product already carries. A churn limit is a rule the product would be inventing, and nothing in the client conversation asks for one.
- **Enrolling is an attendee's own act and needs no organizer approval.** REQ-079 and REQ-082 describe a button, not a request; a proposal-and-acceptance shape exists in this product for appointments, and it exists there because an appointment claims another person's time, which a place in a room does not.
- **A session's kind is set when it is authored and is effectively permanent once anybody commits to it** (FR-1065). This is stated as an assumption rather than a prohibition: the refusal is what makes it safe, and an organizer who genuinely needs the change can create the session they meant while nothing is attached to the old one.
- **Cancelling an optional session leaves its places held rather than releasing them**, exactly as it leaves saves, notes, questions and votes intact. Nothing is destroyed, the attendee is notified and marked, and reinstating the session finds its places where they were — which is the behaviour cancellation's reversibility already promises for everything else attached to a session.
**Retained free-text interests are kept as held values rather than mapped onto vocabulary entries.** Mapping would be a write to an attendee's record by somebody who is not that attendee, which FR-1093 forbids, and a machine mapping would be that write made silently. The cost is that two attendees may hold what a reader would call the same interest under two different values, and they rank as different values.
**The existing interest count and length bounds carry across unchanged**, and apply to the whole set — controlled and retained together. Nothing in this row raises or lowers them.
**The productive-activity description is short bounded free text**, in the shape of the profile's existing bounded fields, enforced both where it is written and on the stored value, so the two layers cannot disagree.
**This row adds no sector or subsector filter to Discover.** It makes the existing interest filter's options complete (FR-1096) and stops there. Filtering or ranking on sector is a decision about who the product suggests, and is deliberately left to be asked rather than inferred from the fields existing (FR-1099a).
**Sector, subsector and productive activity are displayed alongside company and role wherever a profile is shown**; their exact placement on the card and in the profile view is a design matter, not a requirement, subject only to FR-1092's rule that an unset field is absent rather than blank.
**The vocabulary is ordered by its authors, not alphabetically by the product.** An operator curating a short list will want Servicios before Agro or not, and imposing an order would be a rule the product invented; if no order is authored, a stable one is used so the chooser does not shuffle between reads.
**Retirement is chosen over deletion as the normal way to withdraw a value**, and deletion survives only for the case where nobody holds it — the same asymmetry FR-1019 draws between cancelling and deleting a session, and for the same reason: the destructive option must be unavailable exactly when it would destroy somebody else's data.
