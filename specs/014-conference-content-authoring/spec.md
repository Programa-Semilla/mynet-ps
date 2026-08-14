# Feature Specification: Conference Content Authoring

**Feature Branch**: `spec/014-conference-content-authoring`

**Created**: 2026-08-12

**Status**: Ready for implementation — **constitution v5.2.0 RATIFIED 2026-08-12.**

**Input**: Brainstorm #10 (`brainstorm/10-conference-content-authoring.md`), decided 2026-08-12.
Licensed in principle by constitution v4.0.0 standing decision 36, which names 014 as the second
feature of the administrative programme.

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
  date, end date and timezone.
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

- **FR-1026**: A **material change** to a session an attendee has saved MUST dispatch exactly one
  notification to that attendee. Material means exactly three things: **the session is cancelled,
  its start time changes, or its room changes** (constitution v5.2.0, N1).
- **FR-1027**: A change to a session's title, summary, track or speakers MUST NOT dispatch a
  notification.
- **FR-1028**: A change to a session **no** attendee has saved MUST dispatch nothing.
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
- **FR-1030**: A materially changed saved session MUST carry an **in-app marker** on its row in
  Agenda and on Home, distinguishing it from unchanged rows, and the marker MUST clear once the
  attendee has viewed the session.
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
