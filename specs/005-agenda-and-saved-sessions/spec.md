# Feature Specification: Agenda and Saved Sessions

**Feature Branch**: `spec/005-agenda-and-saved-sessions`

**Created**: 2026-08-07

**Status**: Draft

**Constitution**: v2.2.0

**Brainstorm**: `brainstorm/03-agenda-and-saved-sessions.md`

**Input**: Phase 005 of the delivery roadmap. Turn the read-only conference programme delivered by
002 into the personalised schedule `requirements.md` describes: durable saved sessions, an
All/Saved filter, an addressable session detail panel carrying Overview, Speaker info and durable
personal notes, a Home card of the attendee's own, and a per-conference cache that makes the agenda
readable without a connection.

---

## Context and Scope Note

002 shipped the programme. **Agenda carries every session for the active conference, chronological,
grouped into venue-local days, and deliberately read-only** — with a load-bearing comment in the
destination saying so and an acceptance scenario asserting the absence of a save control, on the
reasoning that a greyed-out star is an affordance for a capability that does not exist.

This feature makes the capability exist. `requirements.md` lists *session browsing* and *agenda
management* as distinct capabilities; 002 delivered the first, and this delivers the second.

### Departure from the delivery roadmap

The roadmap (`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`) is the
authoritative decomposition of the product. It is a plan rather than governance and may be revised
without a constitutional amendment, but it requires a feature that departs from it to say so. This
feature departs in two ways, both decided in brainstorm #03:

| | Roadmap | This feature |
|---|---|---|
| Home card contributed | "Up-next prefers saved sessions" | **Its own card.** `UpNext` is not edited, not read, and not depended upon |
| Scope | Saves, detail panel, notes | **Plus a per-conference cache** serving offline reads and repeat reads |
| Migration `0004` | Reserved for 005 | **Unchanged** — this feature emits `0004` |
| Phases 006–010 | — | **Unchanged** |

**Why the Home contribution changed.** "Up-next prefers saved sessions" describes editing the card
002 contributed. Standing decision 9 and the registry itself both forbid a feature editing another
feature's card — *"Do not edit another feature's card, reorder existing entries, or reach into
`HomeShell`"* — and the roadmap is a plan that cannot override a ratified decision. Taking it
literally would also set the precedent that the roadmap's card column beats decision 9 for the five
features that follow. This feature therefore appends its own card and leaves `UpNext` untouched.

**The cost, accepted and recorded.** The generic "Up next" card keeps its tie-break by session
identifier. The seeded programme already contains two sessions starting at 11:00 on day 1 of the
second conference, so on a parallel-track conference the first viewport already features a session
for a reason the attendee cannot see. This feature works around that rather than fixing it. The
alternative — making preference data-driven through the card contract, which the registry names as
the sanctioned path for exactly this — was explored in brainstorm #03 and is recorded there as the
fallback if two next-session cards prove confusing in use.

**Why the cache was added.** A personal schedule that cannot be read in a venue with no signal has
failed at the one moment it exists for. Reading the programme offline was 002's Open Question 2 and
`brainstorm/idea-inbox.md` entry `interface-evolution-for-offline-data`; 005 is the first feature
where deferring it again would ship a visibly broken product. The same cache also closes
`home-card-duplicate-reads` without touching the composition contract.

### What this feature does *not* change

**FR-164 holds unchanged.** No card depends on another card's presence or data. Cards continue to
call the repository layer independently and remain ignorant of each other; the cache is a property
of the data layer, not a shared object cards reach into. A card whose data fails still fails alone.

**The catalog stays read-only in perpetuity.** `CatalogRepository` is declared, in its own source,
never to create, update or delete anything, because a catalog write is organizer administration and
Principle III places that out of scope. Saved sessions and notes are **attendee state about
conference content**, not conference content, and they belong to their own repository. No
requirement below adds a write method to the catalog.

### A note on vocabulary

As in 002, this specification says **conference** where the domain vocabulary says **Event**. They
are the same thing and the mapping is exact; the plan, data model and implementation use `Event`.
No new domain term is introduced.

### Where this feature's surfaces live

The five destinations are fixed and this feature adds none.

- **Agenda** gains a filter, a save control on every session, and a session detail panel.
- **Home** gains one card, appended to the registry. No existing card is edited.
- Discover, Messages and Network are untouched and remain placeholders.

**One address does now name a session, and that is a considered exception.** 002 established that
destination addresses stay conference-neutral, so a link resolves against the recipient's own active
conference rather than the sender's. A session address cannot be conference-neutral — a session
identifier belongs to exactly one conference. The consequence is handled explicitly in FR-203 and
FR-204 rather than left to discovery: an address naming a session outside the reader's active
conference is refused in a way that discloses nothing, exactly as a cross-conference content request
is refused today.

### Why this specification names some technical shapes

Convention says a specification states WHAT and defers HOW, and 002 recorded the same exception for
the same reason. Four requirements here are irreducibly structural because they constrain properties
this project has already committed to and that a later feature inherits: authorization that cannot
be forgotten (FR-227–FR-232), a panel a later feature extends without editing (FR-206), a router
that no longer names addresses literally (FR-233), and file splits that keep 005 and 006 from
contending (FR-235).

Where a requirement constrains structure it constrains the **property** — "a per-conference read
cannot be performed with an unvalidated identifier", "adding a section must not edit an existing
one" — never the mechanism. The mechanisms belong to the plan.

---

## Clarifications

### Session 2026-08-07 (brainstorm #03)

- **Where do saved sessions live?** On their own repository interface. Rejected: adding write
  methods to the catalog, which is declared read-only in perpetuity because a catalog write is
  organizer administration.
- **What does Agenda show?** The whole programme with an All/Saved filter defaulting to All, per the
  approved prototype. Rejected: a saved-only screen, which would leave the programme with nowhere to
  be browsed and no place to decide what to save.
- **Does the session detail panel have an address?** Yes — rendered as an overlay at every width.
  Rejected: an overlay driven by local state as the prototype does, which leaves the browser Back
  button unable to close it on a touch device and gives a Home card no way in that decision 9
  permits; and a full page on mobile with an overlay on desktop, which doubles the layouts to build
  and keep accessible against a prototype that only ever showed the overlay.
- **When does a note persist?** Autosaved on pause, non-optimistically — nothing is reported saved
  before the server confirms. Rejected: an explicit Save control, which loses a note when the panel
  closes mid-typing; and optimistic autosave, which would incur the optimistic-update and
  conflict-resolution decisions the constitution requires be recorded individually.
- **How does saved state reach Home?** Through a card of this feature's own. Rejected: editing
  002's `UpNext`; extending the card contract so preference is data-driven; and dropping the Home
  contribution entirely.
- **What is readable offline?** The active conference's programme, saved set and notes, with a
  staleness stamp. Writes are refused, never queued. Rejected: caching nothing as 002 does; caching
  only saved sessions, which breaks the browse-to-decide flow; and a full write queue, which incurs
  two further recorded decisions.
- **How are repeated reads of the same programme handled?** From the same cache, with FR-164
  unchanged. Rejected: accepting the duplication; and amending FR-164 to permit a shared source.
- **Phase boundary?** One branch and one squash-merged pull request. Rejected: a two-PR split at the
  notes seam, a narrowed scope dropping the cache, and landing the cache first as its own change.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The attendee builds a personal agenda (Priority: P1)

An attendee reading the conference programme marks the sessions they intend to attend, and can then
see only those. The marks survive sign-out, a change of device, and a switch away to another
conference and back.

**Why this priority**: This is the feature. Everything else here decorates it, and without it Agenda
remains the read-only programme 002 shipped.

**Independent Test**: Sign in, save two sessions from the programme, switch the filter to Saved and
see exactly those two, sign out, sign in on a different browser and see the same two still saved.

**Acceptance Scenarios**:

1. **Given** the programme is displayed with the filter on All, **When** the attendee activates the
   save control on a session, **Then** that session is marked saved, the control's accessible label
   changes to describe removal, and the change is durable without any further confirming action.
2. **Given** a saved session, **When** the attendee activates its save control again, **Then** the
   session is no longer saved and the control's label describes saving.
3. **Given** two saved sessions among a larger programme, **When** the attendee switches the filter
   to Saved, **Then** exactly those two are shown, still grouped into venue-local days and still in
   chronological order.
4. **Given** the filter is on Saved and nothing is saved, **When** the attendee looks at Agenda,
   **Then** an explicit empty state invites them to explore the programme and offers a way back to
   All — never a blank list and never a spinner that never resolves.
5. **Given** saved sessions in conference A, **When** the attendee switches to conference B, **Then**
   Agenda shows conference B's programme with conference B's saved set, and switching back to A
   restores A's saves unchanged.
6. **Given** the attendee saves a session, **When** they sign out and sign in on another device,
   **Then** the session is still saved.
7. **Given** the programme is displayed, **When** the attendee moves through it with a keyboard only,
   **Then** every save control is reachable, its state is announced, and it operates without a
   pointer.

---

### User Story 2 — The attendee opens a session and reads its detail (Priority: P2)

From the programme, the attendee opens a session to read what it is about and who is speaking. The
panel has its own address, so it can be returned to, linked to, and closed with the browser's Back
control.

**Why this priority**: Deciding whether to save a session requires knowing more than a row can carry.
It is also the surface 009 later extends with audience questions, so its shape is inherited.

**Independent Test**: Open a session from the programme, confirm the address changes and the panel
shows Overview and Speaker info, press Escape, confirm the panel closes and focus returns to the row
that opened it. Reload the panel's address directly and confirm the same session opens.

**Acceptance Scenarios**:

1. **Given** the programme, **When** the attendee opens a session, **Then** the address names that
   session and the panel shows the session's title, time, room, track and summary, plus each
   speaker's name and, where present, title and company.
2. **Given** a session with no speakers, **When** its panel is opened, **Then** the Speaker section
   states plainly that the session has no listed speaker — distinct in wording from a section that
   failed to load.
3. **Given** an open panel, **When** the attendee presses Escape, **Then** the panel closes, the
   address returns to the programme, and focus returns to the control that opened it.
4. **Given** an open panel, **When** the attendee moves focus with a keyboard, **Then** focus stays
   within the panel until it is closed, and the panel has a visible, labelled close control.
5. **Given** an open panel, **When** the attendee activates the browser's Back control, **Then** the
   panel closes rather than leaving the destination.
6. **Given** a session's address, **When** it is loaded directly in a new browsing context with no
   prior programme fetch, **Then** the panel opens on that session with the programme behind it —
   not an error, and not an empty destination.
7. **Given** an address naming a session that does not belong to the reader's active conference,
   **When** it is loaded, **Then** the reader is told the session is not available to them, in
   wording that does not reveal whether the session exists.

---

### User Story 3 — The attendee keeps personal notes on a session (Priority: P3)

During or after a session the attendee writes notes against it. The notes are theirs alone, persist
without any explicit save, and are never silently lost.

**Why this priority**: Notes are the reason the detail panel is worth opening twice. They are also
this feature's only free-text personal-data surface, which is why they carry the retention
declaration below.

**Independent Test**: Open a session, type a note, stop typing, observe the status resolve to saved,
reload the page, and read the note back.

**Acceptance Scenarios**:

1. **Given** an open session panel, **When** the attendee types a note and stops, **Then** the note
   is written without any explicit save action and a visible status reports the outcome.
2. **Given** a note being written, **When** the write is in flight, **Then** the status says so, and
   it does **not** report the note as saved until the server has confirmed it.
3. **Given** a note whose write fails, **When** the failure occurs, **Then** the status says the note
   is not saved, distinguishes a connection problem from a server fault, offers a retry, and **leaves
   the attendee's text in place**.
4. **Given** a saved note, **When** the attendee reopens the session later or on another device,
   **Then** the note is shown as written.
5. **Given** a note with content, **When** the attendee clears it entirely and stops typing, **Then**
   the note is removed and reopening the session shows an empty note rather than the old text.
6. **Given** an open panel with unsaved changes, **When** the attendee closes it, **Then** the
   in-flight write still completes; no note is lost because the panel was dismissed.
7. **Given** a session the attendee has **not** saved, **When** they open it, **Then** they can still
   write a note — noting and saving are independent.

---

### User Story 4 — The attendee reads their agenda with no signal (Priority: P4)

Standing in a venue with no usable connection, the attendee opens Agenda and reads the programme and
their saved sessions, and is told plainly how current what they are reading is.

**Why this priority**: Conference venues have poor connectivity and this is where a personal schedule
is actually used. It also closes an open question carried since 001.

**Independent Test**: Load the programme while connected, go offline, reload, confirm the programme
and saved set are readable with a staleness stamp, and confirm that attempting to save is refused
with an explanation rather than appearing to succeed.

**Acceptance Scenarios**:

1. **Given** the programme has been read while connected, **When** the attendee is offline and opens
   Agenda, **Then** the programme, their saved set and their notes are readable.
2. **Given** content is being served from the cache, **When** it is displayed, **Then** the surface
   states when it was last retrieved, in wording an attendee understands.
3. **Given** the attendee is offline, **When** they attempt to save or unsave a session, **Then** the
   attempt is refused with an explanation, the session's state does not change, and nothing is
   queued or shown as having succeeded.
4. **Given** the attendee is offline, **When** they type a note, **Then** the status reports it as
   not saved because there is no connection — distinct from a server fault — and the text remains on
   screen.
5. **Given** the attendee is offline and has never read a conference's programme, **When** they open
   Agenda, **Then** they are told a connection is needed and that nothing is cached for that
   conference — not shown an empty programme.
6. **Given** the attendee comes back online, **When** they retry a refused action, **Then** it
   succeeds without a reload.

---

### User Story 5 — Nobody reads or writes another attendee's agenda (Priority: P5)

An attendee's saved sessions and notes are theirs. No request another attendee can construct reaches
them, and no request reaches a conference the requester is not registered for.

**Why this priority**: Principle VIII, and this feature's notes are the first attendee-authored free
text in the product. A failure here is a personal-data breach rather than a defect.

**Independent Test**: With two seeded attendees, attempt every saved-session and note operation as
attendee B using attendee A's identifiers, and confirm each is refused server-side with no data
disclosed.

**Acceptance Scenarios**:

1. **Given** attendee A has saved sessions and notes, **When** attendee B issues any request that
   would read or modify them, **Then** it is refused server-side and discloses nothing about whether
   the record exists.
2. **Given** an attendee registered for conference A only, **When** they issue any saved-session or
   note request naming conference B, **Then** it is refused, and the refusal does not reveal whether
   conference B or the named session exists.
3. **Given** any route accepting a conference identifier introduced by this feature, **When** the
   route audit runs, **Then** it fails the build if the route does not demand the validated
   conference scope.
4. **Given** the client, **When** it filters or hides anything for authorization reasons, **Then**
   that filtering is presentation only; the server has already refused, and an automated test proves
   the refusal without the client.
5. **Given** an attendee's account is deleted, **When** deletion completes, **Then** their saved
   sessions and notes are deleted with it.

---

### User Story 6 — Home gains a saved-session card, and nothing else on Home changes (Priority: P6)

Home shows the attendee what is next **from the sessions they chose**, as a card of this feature's
own, alongside the cards 002 contributed.

**Why this priority**: It delivers the roadmap's intent for Home without editing another feature's
card, and it is the first live test of whether the composition contract survives a second
contributor.

**Independent Test**: Save a session occurring later today, load Home, confirm a new card names it,
and confirm by inspection of the diff that no file belonging to another feature's card was modified.

**Acceptance Scenarios**:

1. **Given** saved sessions remaining today, **When** the attendee loads Home, **Then** this
   feature's card names the next one, with its time and room.
2. **Given** no saved sessions remaining today, **When** the attendee loads Home, **Then** the card
   says so explicitly and invites them to the programme — rather than showing nothing, or a past
   session, or tomorrow's session rendered as if it were today's.
3. **Given** the attendee has saved nothing at all, **When** they load Home, **Then** the card
   presents an empty state inviting them to build an agenda.
4. **Given** this feature's card is made to fail, **When** Home renders, **Then** every other card
   still renders and Home is never blank.
5. **Given** the whole feature, **When** its diff is reviewed, **Then** the only change to the card
   registry is a single appended entry, and no existing card's file is modified.

---

### Edge Cases

- **A session address shared between two attendees whose active conferences differ.** The recipient
  is refused without disclosure (FR-204). This is the accepted cost of the one address that names a
  session; 002's conference-neutral rule is otherwise unchanged.
- **A saved session that disappears from the programme** because seed data was revised. The saved
  reference must not render a broken row or crash the list; it is omitted from the Saved filter and
  from the Home card.
- **A session saved in a conference the attendee's registration is later withdrawn from.** Reads are
  refused by the same scoping predicate as everything else; no orphan is displayed.
- **A note edited on two devices at once.** The last confirmed write wins. This feature does not
  detect or merge concurrent edits — conflict resolution is a separately recorded decision the
  constitution requires, and it is not taken here.
- **A note whose write fails repeatedly.** The text stays on screen and the status keeps saying it is
  unsaved. The attendee is never told it is safe when it is not.
- **The attendee saves a session that has already ended.** Permitted. The programme is browsable in
  full and a past session may still be worth marking; the Home card and the Saved filter simply
  order it where it falls.
- **A conference with no published programme.** Unchanged from 002 — an explicit empty state, not a
  failure. The Saved filter shows the no-saved-sessions state.
- **Cached content for a conference the attendee is no longer registered for.** The cache is not an
  authorization bypass: a scoping refusal invalidates the cached content for that conference.
- **The attendee switches conference while a note write is in flight.** The write completes against
  the session it was started for; the panel and its address belong to a single session throughout.
- **A very long note.** A stated maximum length is enforced, and the limit is communicated before it
  is hit rather than by rejecting a submission.

---

## Requirements *(mandatory)*

Numbering continues from 002, which ended at FR-183.

### Saved sessions

- **FR-184**: An attendee MUST be able to mark any session in the active conference's programme as
  saved, and to unmark it.
- **FR-185**: Saved state MUST be durable server-side state attributed to exactly one attendee and
  one session, surviving sign-out, a change of device, and a conference switch away and back.
- **FR-186**: Saving MUST take effect without a separate confirming action.
- **FR-187**: Saving the same session twice MUST NOT create a second saved record; the operation is
  idempotent from the attendee's point of view.
- **FR-188**: Saved sessions MUST be readable as a set for the active conference, so that no surface
  needs to ask about sessions one at a time.
- **FR-189**: The save control MUST carry an accessible label that states what activating it will
  do, and that label MUST change with the state.
- **FR-190**: Saved state MUST NOT be exposed to, or readable by, any attendee other than its owner.
- **FR-191**: Saving MUST NOT be reachable through the catalog's read interface; the catalog MUST
  remain free of any create, update or delete operation.

### The Agenda destination

- **FR-192**: Agenda MUST continue to show the active conference's full programme, chronological and
  grouped into venue-local days, exactly as 002 delivers it.
- **FR-193**: Agenda MUST offer a filter with two states — all sessions, and saved sessions only —
  defaulting to all sessions.
- **FR-194**: The saved-only view MUST preserve the same chronological, venue-day grouping as the
  full programme.
- **FR-195**: When the saved-only view is selected and nothing is saved, Agenda MUST show an explicit
  empty state inviting the attendee to explore the programme, with an action returning to the full
  programme.
- **FR-196**: Every session presented in either view MUST carry its save control.
- **FR-197**: The filter MUST be operable by keyboard, expose its current state accessibly, and MUST
  NOT require horizontal scrolling at the narrowest supported width.

### The session detail panel

- **FR-198**: A session MUST have its own address within the Agenda destination.
- **FR-199**: The panel MUST render as an overlay at every width, full-width at mobile.
- **FR-200**: The panel MUST present the session's title, start and end times in venue-local terms,
  room, track and summary; and each speaker's name with title and company where present.
- **FR-201**: A session with no speakers MUST state that in wording distinct from a failure to load.
- **FR-202**: The panel MUST dismiss on Escape, MUST offer a visible labelled close control, MUST
  confine keyboard focus while open, and MUST return focus to the control that opened it.
- **FR-203**: Loading a session address directly, with no prior programme read, MUST open that
  session's panel rather than erroring or showing an empty destination.
- **FR-204**: A session address naming a session outside the reader's active conference MUST be
  refused without disclosing whether the session or its conference exists.
- **FR-205**: Closing the panel MUST return the address to the programme, and the browser's Back
  control MUST close the panel rather than leave the destination.
- **FR-206**: The panel MUST be structured so a later feature can add a section to it without
  editing the sections this feature contributes.

### Personal notes

- **FR-207**: An attendee MUST be able to write a free-text note against any session in the active
  conference's programme, whether or not that session is saved.
- **FR-208**: A note MUST be durable server-side state attributed to exactly one attendee and one
  session, and MUST NOT be readable by any other attendee.
- **FR-209**: A note MUST persist without any explicit save action, written after the attendee pauses
  typing. The pause MUST be short enough that a note survives an unexpected loss of the page and
  long enough that ordinary typing does not write on every keystroke: **no shorter than 500
  milliseconds and no longer than three seconds**.
- **FR-210**: The panel MUST show the note's persistence status, and MUST NOT report a note saved
  before the server has confirmed the write.
- **FR-211**: A failed note write MUST leave the attendee's text on screen, state that it is unsaved,
  distinguish absence of connection from a server fault, and offer a retry.
- **FR-212**: Clearing a note's text entirely MUST remove the note.
- **FR-213**: A note MUST NOT exceed **10,000 characters**. The attendee MUST be told they are
  approaching the limit before reaching it, and MUST NOT learn of it through a rejected write. The
  limit MUST be enforced server-side as well as presented client-side.
- **FR-214**: Where two writes to the same note conflict, the last confirmed write MUST win. This
  feature MUST NOT implement optimistic update or conflict merging.

### Offline reading and caching

- **FR-215**: The active conference's programme, the attendee's saved set for it, and the attendee's
  notes for it MUST be readable without a connection once they have been read with one.
- **FR-216**: Any surface served from cache MUST state when the content was last retrieved.
- **FR-217**: Saving, unsaving and note writes attempted without a connection MUST be refused with an
  explanation, MUST NOT change displayed state, and MUST NOT be queued for later replay.
- **FR-218**: A refusal caused by absence of connection MUST be distinguishable, in what the attendee
  reads, from a server fault.
- **FR-219**: Requesting a conference whose content has never been read, without a connection, MUST
  say a connection is needed and that nothing is cached — never present an empty programme.
- **FR-220**: The cache MUST be scoped per conference, so switching conference never shows one
  conference's content under another's name.
- **FR-221**: Cached content MUST have a **maximum age of 24 hours from retrieval**. Beyond it the
  content MUST be refused with the same wording as a conference never read, rather than shown with
  an old stamp. A server refusal on authorization grounds MUST **additionally** invalidate that
  conference's cached content immediately. Together these bound the window in which an attendee
  whose registration has been withdrawn can still read that conference's content offline — where no
  server is present to refuse, the age limit is the only thing that revokes access.
- **FR-222**: Repeated reads of the same conference's programme MUST be served from the cache rather
  than re-fetched and re-processed per caller, **without any card depending on another card's
  presence or data**. FR-164 is unchanged, and each card MUST still own its loading, empty and
  failure states independently. Specifically: removing any one card MUST leave the others working
  unchanged, and **when a shared read fails, each card MUST render its own failure state
  independently** — a shared read MUST NOT let one card's failure suppress another card's rendering,
  nor make one card wait on another card's retry.

### The Home card

- **FR-223**: This feature MUST contribute exactly one Home card, appended to the registry.
- **FR-224**: The card MUST name the attendee's next saved session remaining on the venue's current
  day, with its time and room.
- **FR-225**: The card MUST state explicitly when no saved session remains today, and MUST present a
  distinct empty state when the attendee has saved nothing at all — never showing nothing, a past
  session, or a later day's session rendered as if it were today's.
- **FR-226**: This feature MUST NOT modify any card contributed by another feature, MUST NOT reorder
  existing registry entries, and MUST NOT read another card's data.

### Conference scoping and authorization

- **FR-227**: Every saved-session and note operation MUST be bound to the authenticated attendee at
  the request boundary, from the sign-in session and never from a client-supplied identifier.
- **FR-228**: Every saved-session and note operation MUST additionally be bound to a conference for
  which that attendee holds a registration, verified server-side before any read or write.
- **FR-229**: Verification MUST be a precondition of the operation rather than an optional step, in
  the same proof-carrying form 002 established.
- **FR-230**: The route audit MUST fail the build for any route introduced here that accepts a
  conference identifier without demanding validated scope.
- **FR-231**: Refusals MUST disclose nothing about the existence of another attendee's record, of a
  session, or of a conference.
- **FR-232**: Isolation MUST be asserted by automated tests against real seeded rows, exercising the
  server directly rather than through client filtering.

### Structural preparation

- **FR-233**: A destination MUST be able to declare the element that renders it, so the router no
  longer names a destination's address literally to decide what to render. The existing literal
  special-case for Agenda MUST be retired by this change.
- **FR-234**: Saved sessions and notes MUST be reachable through repository interfaces expressed in
  domain terms; no component may call the network or know transport details.
- **FR-235**: The repository interface, API route registration and seed additions this feature makes
  MUST follow the per-domain file split 002 established, so 006 and this feature can proceed in
  parallel without contending over a shared file.

### Changes to already-shipped behaviour

- **FR-236**: 002's acceptance scenario asserting the **absence** of a save control on Agenda
  (US2 scenario 6) is superseded by this feature and MUST be updated rather than deleted, so the
  history records that the absence was deliberate and is now deliberately ended.
- **FR-237**: The load-bearing comment in the Agenda destination declaring it read-only MUST be
  replaced by an accurate one. No stale statement that saving does not exist may remain in the
  source.

### Key Entities

- **Saved session** — the fact that one attendee intends to attend one session. Carries no content
  of its own beyond the pairing and when it was made. **Per-event**, because it references a session
  that exists only within one conference.
- **Session note** — one attendee's free text against one session, private to its author.
  **Per-event**, for the same reason. This is the feature's only free-text personal-data surface.
- **Cached conference content** — a client-side record of the programme, saved set and notes last
  retrieved for one conference, with the time of retrieval. Not authoritative, never a substitute
  for server-side authorization, and discarded on refusal.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-200**: An attendee can build a personal agenda and see only it in **two interactions** from
  the programme — save, then filter.
- **SC-201**: Saved sessions and notes made on one device are present on a different device at the
  next sign-in, **100% of the time**.
- **SC-202**: A note is recoverable after an unexpected reload with **no explicit save action** ever
  having been taken, and no note is ever reported saved that the server did not confirm.
- **SC-203**: With the connection removed after one online read, the programme, saved set and notes
  remain readable, and **every** attempted write is refused with an explanation rather than appearing
  to succeed.
- **SC-204**: Every surface served from cache states its retrieval time; **no** cached surface is
  presented as if it were live, and **no** cached content older than its stated lifetime is served
  at all.
- **SC-212**: With one card's read deliberately failing, **100% of the remaining cards still
  render** — including when those cards read the same conference programme through the shared cache.
- **SC-205**: **No request an attendee can construct** reaches another attendee's saved sessions or
  notes, or any conference they are not registered for — asserted by automated tests over every
  route this feature introduces, with a failing audit blocking merge.
- **SC-206**: The complete journey — open the programme, open a session, read it, save it, write a
  note, close the panel, filter to saved — is completable **using only a keyboard**, with focus
  visible at every step and focus correctly restored after the panel closes.
- **SC-207**: The session detail panel is reachable, and returnable to, **by address alone**,
  including on a cold load with no prior programme read.
- **SC-208**: The diff for this feature modifies **no file belonging to another feature's Home
  card**, and changes the card registry by exactly **one appended entry**.
- **SC-209**: Every surface this feature introduces renders a visible, meaningful state in **all
  four** of its conditions: loading, populated, empty, and failed.
- **SC-210**: Reading Home with this feature's card present issues **no more conference-programme
  reads than before it was added**, while every card remains independently failable.
- **SC-211**: At the narrowest supported width, no content or primary action of Agenda, the filter,
  or the detail panel requires horizontal scrolling.

### Constitution validation checklist — items this feature discharges

From the whole-product validation checklist in `requirements.md`, satisfied incrementally:

- **Session save** — discharged in full.
- **Personal notes** — discharged in full.
- **Keyboard focus visibility and accessible labels** — discharged for every control this feature
  introduces, including the first true focus trap in the product.
- **Production build success** — maintained.
- **Desktop and mobile rendering** — extended to the filter and the detail panel. Explicitly *not*
  client-validated; see Open Questions.

Deliberately left to later features: audience Q&A with upvoting (009), search and filter over
attendees (006), message composition (007), card-sharing feedback and meeting scheduling (008).

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Works offline**: the installed shell and navigation, as 001 established; and — new in this feature — the active conference's programme, the attendee's saved set for it, and their notes for it, once each has been read with a connection. Every cached surface states when it was retrieved. **Does not work offline**: a conference whose content has never been read, which says so explicitly rather than showing an empty programme; and all conference-scoped surfaces belonging to features other than this one, unchanged from 002. **An action attempted offline**: saving, unsaving and note writes are each refused with an explanation, leave displayed state unchanged, and are **never queued and never shown as having succeeded**. A note's text remains on screen so nothing the attendee wrote is lost. **No write queue, no optimistic update and no conflict merging is introduced** — each would require its own recorded decision. **Cache lifetime is 24 hours from retrieval** (FR-221), as the constitution requires this be specified per feature rather than assumed. Beyond it, content is refused exactly as a conference never read. This is also the only mechanism that revokes access offline, where no server is present to refuse — an authorization refusal invalidates the cache immediately when online, and the age limit bounds the window when not. Whether 24 hours is the right value is recorded as an open question; the *absence* of a value is not deferred. |
| **Desktop layout** (Principle IV) | Persistent left rail and top bar unchanged. Agenda keeps its single chronological column with venue-day structure, gaining the filter above the programme and a save control on each session row. The session detail panel renders as a centred overlay above the programme, which stays visible behind it. Home gains one card in the declared registry order; no existing card moves. |
| **Tablet layout** (Principle IV) | Reduced rail unchanged. The filter stays above the programme and the programme stacks as in 002. The detail panel remains an overlay, wider relative to the viewport than at desktop. Home's columns are unchanged apart from the appended card. |
| **Mobile layout** (Principle IV) | Compact header and bottom navigation unchanged. The filter is a touch-sized control that does not require horizontal scrolling at 320px. Save controls meet touch-target sizing without crowding the session time, title and track on a narrow row. The detail panel is a **full-width overlay** with a clear close control and Escape dismissal. Home is a single column in declared order. |
| **Empty / loading / failure states** (Principle IV) | **Programme (Agenda)**: loading; no published programme; failure — all unchanged from 002. **Saved filter**: loading; nothing saved yet, with an action returning to the full programme; failure. **Session detail panel**: loading; session not available to this reader; failure. **Speaker section**: populated; session has no listed speaker, worded distinctly from failure. **Note**: loading; empty; saving; saved; not saved, distinguishing no-connection from server fault, with retry. **Home card**: loading; next saved session today; none remaining today; nothing saved at all; failure. **Cached content**: every cached surface carries its retrieval time. Every failure distinguishes "you are offline" from "this is a problem on our side". |
| **Accessibility** (Principle IV) | Every control introduced has an accessible label, a visible focus state and keyboard operability. Save controls state what activation will do and change that label with state. The filter exposes its current state. The detail panel dismisses on Escape, **confines focus while open**, offers a visible labelled close control, and **returns focus to the control that opened it** — the register lists Escape handling and visible focus as settled requirements the prototype failed to meet, and this feature discharges both. The note's persistence status is announced, not conveyed by colour alone. Track colour coding remains never the sole carrier of meaning. Session times remain machine-readable alongside their human wording. |
| **Validation checklist discharged** (Principle VII) | Session save (full); personal notes (full); keyboard focus visibility and accessible labels for controls introduced here, including the first focus trap; production build; desktop and mobile rendering extended to the filter and detail panel. Left to later features: audience Q&A with upvoting; attendee search and filter; message composition; card-sharing feedback; meeting scheduling and appointment creation. |
| **Identity scoping & server-side authorization** (Principle VIII) | Applies, and more heavily than in any prior feature. **Rule**: every saved-session and note operation is bound to the authenticated attendee at the request boundary **and** to a conference for which that attendee holds a registration. **Enforcement**: identity comes from the sign-in session, never from a client-supplied identifier; registration is verified server-side before any read or write, as a precondition rather than an optional step, in the proof-carrying form 002 established; the route audit fails the build when a conference-accepting route lacks it; refusals disclose nothing about the existence of a record, a session or a conference; isolation is asserted by automated tests against real seeded rows exercising the server directly. **New personal data is stored**: saved sessions, and — significantly — attendee-authored free-text notes, this product's first. See the retention position below. |
| **Event scoping** (Constraints — data scoping) | **Saved sessions — per-event.** A saved session references a session, and sessions exist only within one conference; the set must swap when the attendee switches, and a save made at one conference is meaningless at another. **Session notes — per-event**, for exactly the same reason: a note is written against a session, not against a person or a topic. Neither is cross-event, and neither could be without inventing a cross-conference notion of "the same session" that the product does not have — 002 already records that the same human speaking at two conferences is two unrelated records. **No existing table's scoping changes.** |
| **Register position** (Governance) | Assessed against constitution **v2.2.0**, which ratified the correction this row previously argued for. **Blocks this feature**: **entry 17** — the pipeline runs red and the migration, integration, accessibility and end-to-end gates have never executed. v2.2.0 states this MUST be waived or closed **before phase 005 merges**, because this feature's personal-data guarantees (FR-227–FR-232, SC-205) are enforced only by the integration suite and the route audit. Root cause is diagnosed and recorded on PR #7: `NEON_API_KEY` is unset, and `event-scope-audit.test.ts` requires `DATABASE_URL` at module load. **Does not block**: **entry 6**, data retention. That entry named 004 as "the first to store substantial personal data"; v2.2.0 corrected it to record that **005 ships first**, and that 005 proceeds on a **narrow commitment** — saved sessions and notes are **deleted with the attendee's account**, **no export path ships in 005** — as a declared limit under Principle IX rather than a silent omission. **Resolved by this feature**: none; the full retention, deletion and export obligation remains open and still blocks 004. **Escalated by this feature**: **entry 4**, client validation of desktop and tablet layouts, which now covers Home, the programme, a filter and an overlay panel before any review has taken place. **Relevant but not acted on**: **entry 16**, the repository being public, which makes this feature's seed data and migrations world-readable — it stores no secrets, so nothing here changes. **Closed as idea-inbox entries, by decision**: `interface-evolution-for-offline-data`, `home-card-duplicate-reads`, `destination-owns-its-element`. **Newly recorded**: whether 24 hours is the right cache lifetime (see Open Questions). |
| **Reserved migration number** (Branching — parallel work) | **`0004`**, as reserved by the delivery roadmap for phase 005. One migration, carrying both new tables. `0005` remains reserved for 006, which may proceed in parallel, and `0004` MUST NOT be renamed to resolve any conflict with it. Per Principle VII, `0004` MUST be verified in CI — applying forward against a real database instance, with the integration suite run against the result — before it reaches any environment holding real data. |

---

## Assumptions

Reasonable defaults taken where the brainstorm did not decide, recorded so the review gate can
challenge them.

- **A note is per attendee per session, not per attendee per session per day.** An attendee attending
  a repeated session sees one note. No requirement suggests otherwise and the prototype has one note
  field.
- **Saving a past session is permitted.** The programme is browsable in full and marking a session
  already attended is a reasonable thing to want; nothing is gained by refusing it, and refusing it
  would need a clock rule at the write boundary that this feature otherwise avoids.
- **Noting and saving are independent.** Requiring a save before a note can be written would add a
  rule the attendee must discover, and the prototype's panel offers notes on any session.
- **The last confirmed write wins for notes.** Concurrent editing from two devices is not detected or
  merged. Conflict resolution requires its own recorded decision and this feature does not take one.
- **The cache is client-side and per conference**, seeded by ordinary reads rather than by
  pre-fetching. Nothing is fetched that the attendee did not ask for, which keeps the cache honest
  about what it can serve.
- **Cached content expires 24 hours after retrieval.** The constitution requires what may be cached
  and *for how long* to be specified per feature, so a value is set rather than deferred. 24 hours
  was chosen because it spans a conference day and an overnight — an attendee offline through an
  evening still reads their agenda in the morning — while keeping the offline access-revocation
  window to a single day. Whether it is the right value is an open question; whether there is a
  value is not.
- **The staleness stamp is expressed as a time, not as a coloured badge**, so it is readable without
  relying on colour and does not require its own legend.
- **The detail panel presents Overview and Speaker info as distinct sections** rather than one body,
  so 009 can add audience questions as a third without restructuring the panel or editing this
  feature's sections.
- **Note length is bounded** at a limit generous for a session's worth of typing, communicated as it
  is approached. An unbounded free-text column attributable to an identity is both a storage and a
  personal-data hazard.
- Seed data continues to run only against local development and per-PR preview environments, never
  against an environment holding real attendee data.

---

## Dependencies

- **002 Event Context, Session Catalog & Home Composition**, merged: the active-conference
  selection, the venue-timezone clock story, the session catalog and its repository, the Agenda
  destination and its venue-day grouping, the Home card registry and composition contract, the
  proof-carrying conference scope and its route audit, and the per-domain file splits.
- **001 Production Foundation**, merged: authentication and sign-in sessions, identity binding at the
  request boundary, the responsive shell, the repository interface layer, the theme tokens, and the
  connectivity capability this feature's offline behaviour depends on.
- **The connectivity capability must be able to report the current state and its changes**, since
  FR-217 refuses writes on it and FR-216 depends on distinguishing cached from live. If the shipped
  interface cannot, extending it is part of this feature.
- **The CI pipeline must be repaired before this feature merges**, per constitution register entry
  17 and the Principle VII breach clause added in v2.2.0. Diagnosed 2026-08-07 on PR #7, and more
  specific than the earlier "runs are queued" description — the runs now complete, and fail:
  - **`NEON_API_KEY` is unset**, so `db-branch` fails with *"Cannot run interactive auth in CI"*.
    Every stage downstream of it — `migrations`, `schema-diff`, `test-integration`, `test-e2e`,
    `test-accessibility`, `deploy-api` — is skipped. **This single missing secret is why those
    gates have never executed once.**
  - **`apps/api/tests/unit/event-scope-audit.test.ts` requires `DATABASE_URL` at module load**, so
    `test-unit` fails while the other 14 files pass.

  Both bear directly on this feature. **FR-230 is the route audit**, and it is the test currently
  failing to run; **FR-232 and SC-205** are asserted by the integration suite, which is skipped.
  Until both are repaired, this feature's personal-data guarantees are documentation rather than
  enforcement — materially more serious here than in 002, because this is the first feature storing
  attendee-authored free text.

---

## Out of Scope

- **Audience questions and upvoting** — 009, which adds a section to the panel this feature builds.
- **Attendee profiles, the Discover directory, messages, contacts, exchanged cards and appointments**
  — 004, 006, 007, 008.
- **Any notification of an upcoming saved session**, of any kind, including the prototype's
  notification bell. Notification delivery stays out until a recorded decision brings it in.
- **Calendar integration**, for the same reason.
- **Any administrative interface, privileged role, or content import path.** No write path to the
  catalog is added; adding or changing a conference programme remains a reviewed change to committed
  seed data.
- **Optimistic updates, offline write queuing, and conflict resolution**, each of which the
  constitution requires be decided and recorded separately.
- **Exporting an attendee's saved sessions or notes**, and any bulk deletion interface beyond
  deletion with the account. Declared as a limit, not omitted silently.
- **Sharing a note, or a saved agenda, with another attendee.**
- **Fixing the identifier tie-break in the existing "Up next" card.** Recorded as an open question;
  the alternative approach is in brainstorm #03.

---

## Open Questions

Recorded rather than resolved, per Principle I.

1. **Client validation of desktop and tablet layouts.** Open since 001, escalated by 002, and
   escalated again here: this feature adds a filter and a modal overlay at widths the client has
   never reviewed, and the roadmap's gate has already fired. The cost of a late correction now spans
   three features.
2. **The full data retention, deletion and export obligation.** This feature declares a narrow
   commitment — deleted with the account, no export — because it stores the product's first
   attendee-authored free text and the register's entry was written expecting 004 to arrive first.
   The whole obligation is unanswered and still blocks 004.
3. **Whether 24 hours is the right cache lifetime.** A value is set rather than deferred, because
   the constitution requires it and because offline it is the only thing that revokes access after a
   registration is withdrawn (FR-221). Whether a conference day plus an overnight is the right span
   — against a multi-day conference with poor signal throughout, or against a shorter window for
   tighter revocation — is a product judgement worth revisiting once the feature is in use.
4. **Whether a session should be unsavable from the detail panel as well as from its row.** Two save
   affordances for one session may read as redundant or as convenient; this is a presentation
   question best answered against the built screen.
5. **Whether the two next-session cards on Home need any relationship.** This feature's card and
   002's "Up next" can legitimately name different sessions — the attendee's saved 11:00 talk against
   the programme's identifier-first 11:00 talk. Standing decision 9 says cards are independent;
   whether that reads as *composed* or as *contradictory* on the first viewport is worth looking at
   once both are on screen.
6. **The identifier tie-break in the existing "Up next" card survives.** The seeded programme already
   contains two sessions starting at 11:00, so the first viewport already features one arbitrarily.
   This feature works around it rather than fixing it; the recorded alternative is making preference
   data-driven through the card contract.
7. **What "PS" denotes** in the repository name, and the repository-visibility entry — both unchanged
   by this feature and both still open.
