# Feature Specification: Session Q&A — Audience Questions and Upvotes

**Feature Branch**: `009-session-qa`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Feature 009 — Session Q&A (audience questions and upvotes), the last
feature on the delivery roadmap. Reserved migration number 0008."

## Context and Scope Note

This is the **last feature on the delivery roadmap**. After it, every panel section
`GroundZero/requirements.md` names exists, the last behavioural item on the whole-product
validation checklist is discharged, and what remains is 010's sweep and the deployment decisions
the owner holds.

### What register entry 9 was, and what answered it

Entry 9 asked whether audience questions are **attributed to their author or anonymous**. It was
opened in constitution v2.1.0 and named phase 009 as the thing it blocked. It was answered on
2026-08-10 by owner decision N3 and closed by **constitution v3.2.0**, which moved the rule into
binding text under "Audience questions":

> An audience question is attributed to its author. Anonymous questions were the alternative and
> were not chosen. A question therefore carries the asking attendee's identity, and so does a vote.

The consequence is the operative half. Attribution makes Q&A a **personal-data surface under
Principle VIII** — not a note about it, a full inheritance. Questions and votes carry identity
scoping enforced server-side, are reached by the deletion cascade, and appear in the export,
exactly as every other attendee-authored record does. The two coverage tests 004 built fail this
feature's build until each is declared.

### The three decisions this phase had to take, and did

v3.2.0 deliberately left one problem unsolved and **forbade this phase from assuming an answer**:

> A departing attendee's question may sit on a session other attendees have upvoted. 007 settled
> the analogous problem for conversations — the departing party's words vanish, the survivor keeps
> their own — but the three options do not resolve the same way for a question with other people's
> votes attached to it. **The phase that builds Q&A MUST decide and declare this.**

All three were put to the project owner on 2026-08-10 and answered. They are recorded here as
settled, not as assumptions:

1. **A departing attendee's question is deleted with the account, and the votes on it go too.** The
   cascade from `attendees` reaches the question; the cascade from the question reaches every vote
   cast on it. 007's answer does **not** transfer and was not adopted — a conversation's survivor
   keeps *their own words*, whereas the only content in a question is the departing attendee's. The
   cost is real and is stated rather than glossed: **a session can lose a well-upvoted question, and
   other attendees' votes on it disappear with it.** That is what Principle VIII's "no soft delete
   and no tombstone" costs when the record other people invested in *is* the departing person's
   words.
2. **A question may be withdrawn by its author until it receives its first vote, and not after.**
   This diverges from 007, which refused message deletion outright (FR-516). The divergence is
   deliberate: a message goes to one person, a question is **published under your name to everyone
   at that session**, and without withdrawal the only retraction available is deleting your whole
   account. The vote is the cut-off because a vote is another attendee's act, and withdrawing a
   question after somebody has backed it destroys their record, not only yours.
3. **Attribution is unconditional, including for an attendee who has turned discoverability off.**
   Following 008's rule that **discoverability governs being *found*, not being *remembered***, and
   following decision 26, which attributes questions without qualification. Asking is a deliberate
   public act. The consequence is stated so nobody meets it as a surprise: **a hidden attendee's
   name appears on the session panel to every co-attendee, while their profile still refuses to
   open.**

### Two further decisions, taken at spec review

The spec review on 2026-08-10 raised two issues the draft had not settled. Both were put to the
owner and both are now binding.

4. **A question is reportable from the question itself, and a block hides questions both ways**
   (FR-781–FR-787). The draft was silent, and silence would have shipped a public unmoderated
   surface whose only report path ran through opening a conversation with your harasser.
5. **Public Q&A visibility is a third recorded exception to Principle VIII, and requires a
   constitution amendment ratified before implementation begins.** The draft asserted the exception
   and claimed no amendment was needed, reasoning that decision 26's attribution entails visibility.
   The owner ruled otherwise, following 008's precedent rather than the entailment argument: the two
   existing exceptions — profile visibility (D10, v2.3.0) and card resolution (N2, v3.2.0) — were
   each recorded by amendment, and *"any exception requires a recorded client decision"* means a
   recorded one. **This is a precondition on implementation, not on planning.** See Open Question 1.

### The property this feature exists to create

Every other destination answers a question about *people you might meet* or *content somebody else
scheduled*. Q&A is the only surface in MyNet where **attendees address the room** — where what one
attendee wants asked becomes visible to everyone else at that session, and where the audience's own
ranking decides what rises. It is the product's first many-to-many surface.

That is also why it is the riskiest small feature on the roadmap. Every prior personal-data surface
was either private to one attendee (notes, saved sessions), private to two (messages,
appointments), or a directory somebody can opt out of (Discover). **A question is public to a
conference under a real name, with no opt-out**, and decision 3 above makes that true even for
somebody who has hidden from the directory.

### Departure from the approved prototype

The prototype implements Q&A in `GroundZero/prototype/src/app/App.tsx` and gets four things wrong
that are **not** open questions:

- **It has no way to ask a question at all.** Questions are fixed sample data on the session
  constant; only upvoting is interactive. The empty-state copy it does carry — *"No questions yet.
  Be the first to ask!"* — invites an action the prototype cannot perform. Asking is in scope here.
- **Its panel is a tab strip** (`overview | notes | qa | speaker`). **005 shipped stacked sections
  instead**, and that decision stands. Q&A is a section, not a tab.
- **Votes increment without limit**, in root `useState`, keyed by question id. One attendee can add
  a hundred. One vote per attendee per question is the requirement.
- **Votes are local and reset on reload.** Prototype delivery-mode artifact, per Principle I.

Its interaction shape, its empty-state copy, and the count-beside-an-arrow presentation are
legitimate reference and are carried forward.

### Departure from the delivery roadmap

The roadmap's 009 entry says Q&A "**Adds a tab** to 005's session detail panel". **There are no
tabs.** 005 delivered `SessionPanel.tsx` as stacked sections — `PanelOverview`, `PanelSpeakers`,
`PanelNotes` — and Q&A is a fourth. The roadmap also names attribution as "the decision this phase
must take"; v3.2.0 took it, so this phase takes the three above instead.

**One further departure matters for planning.** The roadmap and the constitution both describe
extension points as append-only registries a feature contributes to without editing a neighbour's
file. **The session detail panel is not one.** `SessionPanel.tsx` composes its sections literally,
so this feature must edit a file 005 owns. That is stated rather than worked around, and whether the
panel should become a registry is Open Question 1.

### What this feature does not do

- **No notification, of any kind, for anything.** Not a new question on a session you saved, not a
  vote on your question. The trigger set stays at a received message and nothing else.
- **No answers, no "answered" marker, no moderation, no pinning.** Every one of those is an act by
  somebody running the conference, and the organizer is the actor Principle III excludes by
  construction. **Reporting is not moderation** and is in scope (FR-781): it removes the question
  from the reporter's view and sends the matter to a human outside the product, which is exactly
  what "no moderator inside the product" leaves available.
- **No downvote, and no way to see who voted.** A count and your own state, nothing more.
- **No Home card.** Home's seventh and last card shipped in 008.
- **No polling.** The thread in 007 polls; this does not, and the reasoning is in FR-731.
- **No seeded questions.** Nothing here is seed data (FR-762).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask the room's question (Priority: P1)

An attendee is sitting in a session and wants something asked. They open the session from Agenda,
find the Q&A section beneath the session's details, type their question, and post it. It appears
immediately in the list with their name against it, visible to every other attendee at that
conference who opens the same session.

**Why this priority**: It is the feature. Without asking, Q&A is a read-only list of nothing —
because nothing is seeded, an unbuilt asking path leaves every session permanently empty.

**Independent Test**: Sign in as an attendee registered for an event, open any session's panel, post
a question, and confirm it is listed with the author's display name. Sign in as a second attendee
registered for the same event, open the same session, and confirm the question is visible with the
first attendee's name.

**Acceptance Scenarios**:

1. **Given** a session panel is open and the session has no questions, **When** the attendee reads
   the Q&A section, **Then** it invites them to ask the first one and offers a way to do so.
2. **Given** the question field is empty or contains only whitespace, **When** the attendee looks at
   the post control, **Then** it is **disabled** — never enabled-then-rejected.
3. **Given** the attendee has typed a question, **When** they post it, **Then** it appears in the
   list attributed to them, and the field clears.
4. **Given** the attendee's text exceeds the length limit, **When** they look at the post control,
   **Then** it is disabled and the remaining allowance is visible before they reach the limit.
5. **Given** a second attendee at the same event, **When** they open the same session, **Then** they
   see the question and its author's name.
6. **Given** an attendee not registered for that event, **When** they address the same session,
   **Then** they are refused in wording that discloses nothing about whether the session exists.
7. **Given** the device is offline, **When** the attendee tries to post, **Then** the action is
   **refused with an explanation, never queued**, and the typed text is not lost.

---

### User Story 2 - Push a question up (Priority: P1)

An attendee reads the questions others have asked and finds one they want asked too. They upvote it.
The count rises by one, the control shows that they have voted, and the question moves up the list
if the vote has changed the order.

**Why this priority**: The upvote is what makes the list a ranking rather than a transcript, and
ranking is the whole reason the audience's questions are worth collecting. It is also the only part
of Q&A the prototype demonstrates, so it is the part the client has already approved.

**Independent Test**: With a session carrying questions from two other attendees, upvote one and
confirm the count rises, the control reflects the voted state, and the order reflects the new count.
Reload and confirm both the count and the voted state survived.

**Acceptance Scenarios**:

1. **Given** a question the attendee has not voted on, **When** they upvote it, **Then** the count
   rises by exactly one and the control shows a voted state.
2. **Given** a question the attendee has already voted on, **When** they activate the control again,
   **Then** their vote is withdrawn and the count falls by exactly one.
3. **Given** a slow connection, **When** the attendee activates the upvote twice in quick
   succession, **Then** the outcome is the same as activating it once — no second vote can exist.
4. **Given** several questions with differing counts, **When** the list is read, **Then** they are
   ordered by count, highest first, with ties broken by which was asked first.
5. **Given** the attendee reloads the panel, **When** the list renders, **Then** their own voted
   state is shown against each question they have voted on.
6. **Given** the attendee's own question, **When** they look at its upvote control, **Then** it is
   unavailable to them (Assumptions).
7. **Given** the device is offline, **When** the attendee tries to vote, **Then** the action is
   refused with an explanation and no local count changes.

---

### User Story 3 - Take back a question asked in error (Priority: P2)

An attendee posts a question, immediately sees a typo — or thinks better of it — and withdraws it.
It disappears for everyone. Once another attendee has upvoted it, the option is gone, and the
attendee is told why rather than finding the control silently missing.

**Why this priority**: It is the retraction path decision 2 exists to provide, and without it the
only way to unpublish your name and words from a public surface is deleting your account. It is P2
rather than P1 because the surface functions without it.

**Independent Test**: Post a question, withdraw it, and confirm it is gone for a second attendee.
Post another, upvote it from a second attendee's account, and confirm the first attendee can no
longer withdraw it and is told the reason.

**Acceptance Scenarios**:

1. **Given** the attendee's own question with no votes, **When** they withdraw it, **Then** it is
   removed and no longer visible to anybody.
2. **Given** withdrawal is requested, **When** the attendee activates the control, **Then** a
   confirmation is required before the question is removed.
3. **Given** the attendee's own question with at least one vote, **When** they view it, **Then** the
   withdrawal control is **absent, with the reason stated** — not present-and-failing.
4. **Given** a question authored by somebody else, **When** the attendee views it, **Then** no
   withdrawal control is offered, and a request made directly is refused server-side.
5. **Given** a vote is cast between the panel rendering and the withdrawal being submitted,
   **When** the withdrawal reaches the server, **Then** it is refused **with the reason** — it
   describes the reader's own question to the reader, so it discloses nothing.
6. **Given** every vote on a question is later withdrawn, **When** the author views it, **Then**
   withdrawal is available again, because the condition is again true.

---

### User Story 4 - Leaving takes your questions with you (Priority: P3)

An attendee deletes their account. Every question they asked disappears from every session, and so
does every vote anybody cast on those questions, along with every vote they themselves cast on other
people's questions. Nothing of theirs is left behind under a placeholder name.

**Why this priority**: It is the decision v3.2.0 required this phase to take, and it is a
correctness obligation rather than a capability — but it is only observable through 004's existing
deletion path, so it is exercised last.

**Independent Test**: With two attendees, have one ask a question and the other upvote it. Delete the
asking attendee's account and confirm the question is absent from the session for the surviving
attendee, that the surviving attendee's vote on it is gone, and that no placeholder or de-attributed
row remains.

**Acceptance Scenarios**:

1. **Given** an attendee who has asked questions, **When** their account is deleted, **Then** every
   question they asked is gone from every session.
2. **Given** other attendees had voted on those questions, **When** the account is deleted, **Then**
   those votes are gone too, and no count anywhere refers to a question that no longer exists.
3. **Given** the attendee had voted on other people's questions, **When** their account is deleted,
   **Then** those votes are removed and each affected count falls accordingly.
4. **Given** the attendee requests their data export, **When** they read it, **Then** it contains
   every question they asked and every vote they cast, each naming the session it belongs to.
5. **Given** a session whose only question was asked by the departing attendee, **When** a survivor
   opens it, **Then** they see the empty state, not a gap or an error.

---

### User Story 5 - Make an abusive question stop (Priority: P2)

An attendee opens a session and finds a question that is abusive, or aimed at them. They report it
from the question itself. The author is blocked in the same act, the question disappears from their
view, and the matter leaves the product as mail to a human who acts outside it. Nothing in the
product tells them a case number, because there is nothing inside the product that could answer one.

**Why this priority**: Q&A is the product's first many-to-many surface, and the organizer exclusion
means there is no moderator inside it by construction. P2 rather than P1 because the surface
functions without it — but it does not function *safely* without it, which is why it is not P3.

**Independent Test**: With two attendees, have one ask a question. From the second attendee's
account, report it from the question. Confirm the question is gone from the second attendee's view,
that the first attendee is blocked, that the first attendee's other questions are also gone from the
second attendee's view, and that no surface anywhere in the product can read the report back.

**Acceptance Scenarios**:

1. **Given** a question by another attendee, **When** the reader opens its report control, **Then**
   they can report it **without opening a conversation with its author**.
2. **Given** the report dialog is open with a blank reason, **When** the reader looks at the
   confirmation, **Then** it is **disabled**.
3. **Given** the report is submitted, **Then** the author is blocked in the same act, and the
   reader is not asked to block separately.
4. **Given** the report is submitted, **When** the Q&A section next renders, **Then** that question
   and every other question by that author are absent from the reader's view.
5. **Given** the report is submitted, **When** any third attendee opens the same session, **Then**
   they see the question unchanged, with its count unchanged.
6. **Given** the reader had already upvoted the now-hidden question, **Then** their vote still
   counts for everyone else.
7. **Given** the reader lifts the block, **When** the Q&A section next renders, **Then** the
   author's questions are visible again, with no other action required.
8. **Given** a report has been filed, **When** anybody looks anywhere in the product, **Then** there
   is no route, screen or method that reads it back.
9. **Given** the operator mail is dispatched, **Then** it carries identifiers and a timestamp only —
   never the question text and never the reporter's reason.

---

### Edge Cases

- **A question is asked on a session that has already ended.** Permitted. No requirement gates Q&A
  on the clock, and a conference's questions outlive the slot (Assumptions).
- **The same attendee asks two questions on one session.** Permitted. Nothing limits it, and a
  per-session cap is not named by any source.
- **An attendee withdraws from the conference after asking.** Their questions remain — the account
  exists, and the question belongs to the session's record. They lose the ability to read or act on
  the session at all, because `requireEventAccess` refuses them. This mirrors 008's FR-637a
  reasoning in the opposite direction: there, a live *commitment between two people* had to be
  cancelled; here nothing is owed to anyone.
- **Two attendees vote on the same question at the same instant.** Both succeed; the count is the
  number of rows.
- **The last vote on a question is withdrawn while its author is looking at it.** Withdrawal becomes
  available again on the next read. Harmless: the condition "nobody has backed this" is true again.
- **A question's author blocks, or is blocked by, a reader.** Each becomes invisible to the other in
  Q&A, read-side and reversibly (FR-785, FR-786). Nobody else's view changes.
- **Two attendees ask the same question.** Both stand. There is no de-duplication, no merge and no
  "this has already been asked" refusal — deciding two questions are the same is a judgement, and
  the only actor who could make it is an organizer. The upvote is the mechanism that sorts it out.
- **A reader blocks the author of a question they had already upvoted.** The question disappears
  from their view; their vote stands and continues to count for everyone else (FR-787). Withdrawing
  a vote they can no longer see is not offered, and is not needed — deleting their account removes
  it, as it removes every other vote.
- **The panel is open when the reader's registration is withdrawn elsewhere.** The next Q&A action is
  refused by the event guard, in the same indistinguishable wording 002 and 005 established.
- **A session is re-seeded.** Questions cascade away with the session. This is not incidental — see
  FR-763.

## Requirements *(mandatory)*

### Functional Requirements

#### Asking

- **FR-701**: An attendee registered for an event MUST be able to ask a question against any session
  in that event, from the session detail panel.
- **FR-702**: A question MUST be attributed to its author, and the author's display name MUST be
  shown against it to every reader (constitution v3.2.0, "Audience questions").
- **FR-703**: A question MUST carry a non-empty body after whitespace trimming, and MUST NOT exceed
  a stated maximum length.
- **FR-704**: The post control MUST be **disabled** while the body is empty or over length. An
  invalid question MUST NOT be submittable and then rejected (Principle IV, required states).
- **FR-705**: The length limit MUST be enforced independently at the database, at the route, and
  surfaced in the interface — the interface's version is presentation, never enforcement
  (Principle VIII).
- **FR-706**: The remaining allowance MUST be visible to the attendee before they reach the limit.
- **FR-707**: A posted question MUST appear in the reader's own list without a page reload, and the
  input MUST clear.
- **FR-708**: Asking MUST NOT be gated on the author's discoverability setting, on verification
  state, or on whether the author has saved the session.
- **FR-709**: There MUST be no editing of a question after it is asked — no route, no column, no
  control (following 007's FR-516; withdrawal under FR-711 is the retraction path).
- **FR-710**: Nothing in this feature may write to `CatalogRepository`, which is read-only in
  perpetuity. Questions and votes are attendee state *about* conference content and belong to their
  own repository.

#### Withdrawing

- **FR-711**: An author MUST be able to withdraw their own question **while it has no votes**, and
  MUST NOT be able to once it has at least one.
- **FR-712**: Withdrawal MUST require a confirmation step, and that step MUST reuse the existing
  confirmation dialog rather than introducing a second one (007's precedent).
- **FR-713**: Where withdrawal is unavailable because a vote exists, the control MUST be absent and
  the reason stated — never present and failing on activation.
- **FR-714**: A withdrawal that races a vote MUST be refused server-side by re-checking the
  condition in the same transaction, and the refusal MUST carry its reason. This is one of the two
  refusals in this feature that explains itself, because it describes the reader's own question to
  the reader.
- **FR-715**: A withdrawal request for a question the requester did not author MUST be refused
  server-side, regardless of what the interface offered.
- **FR-716**: Withdrawing a question MUST remove it for every reader. No tombstone, no "withdrawn"
  placeholder.

#### Voting

- **FR-717**: An attendee MUST be able to upvote a question on a session in an event they are
  registered for.
- **FR-718**: **One vote per attendee per question**, enforced by the schema rather than by handler
  logic, so a repeated request cannot produce a second vote (following 005's `saved_sessions`).
- **FR-719**: An attendee MUST be able to withdraw their own vote, returning the count to what it
  was.
- **FR-720**: A reader MUST be able to see, for each question, the total count and **their own**
  voted state.
- **FR-721**: A reader MUST NOT be able to learn **who** voted, by any route or surface. The
  identity on a vote exists for one-per-attendee enforcement, deletion and export — not for display.
- **FR-722**: An attendee MUST NOT be able to vote on their own question (Assumptions).
- **FR-723**: There MUST be no downvote, no reaction other than the upvote, and no vote weighting.
- **FR-724**: A vote MUST NOT be gated on discoverability or verification state.

#### Reading and ordering

- **FR-725**: The Q&A section MUST list every question on the session, ordered by **vote count
  descending**.
- **FR-726**: Ties MUST be broken **deterministically by ask time, earliest first**, so the order is
  stable across reads and two readers see the same list.
- **FR-727**: The section MUST show an empty state inviting the reader to ask the first question when
  a session has none.
- **FR-728**: The section MUST distinguish loading, failure-from-absence-of-connection, and
  failure-on-our-side, in the wording 005's panel established.
- **FR-729**: A failure in the Q&A section MUST NOT prevent the rest of the session panel — overview,
  speakers, notes — from rendering.
- **FR-730**: Counts are **as of the read**. The reader's own action MUST update immediately; another
  attendee's does not appear until the next read.
- **FR-731**: There MUST be no polling. 007's thread polls because a conversation is a live exchange
  between two people who are both waiting; a vote count is not, and adding a second polling surface
  would put every open session panel on a timer for a number that does not need to be exact.
- **FR-732**: The list MAY be returned whole, without pagination, on the assumption that a session's
  question volume stays small (Assumptions). This is permissive rather than prohibitive on purpose:
  if the assumption fails at a keynote, adding pagination MUST NOT require amending this
  requirement — but it MUST preserve FR-726's deterministic order, which is the part a naive keyset
  bound over a mutable count would break.

#### Attribution, privacy and visibility

- **FR-733**: A question is visible to **every attendee registered for the event the session belongs
  to**, and to nobody else. This is a **recorded exception** to Principle VIII's "private content
  stays private", authorised by decision 26 and by `requirements.md`'s "Audience questions and
  upvoting" — the second such exception in the product, after profile visibility.
- **FR-734**: Attribution MUST be unconditional. A question by an attendee who has turned
  discoverability off MUST still carry their display name (decision 3 above).
- **FR-735**: Attribution MUST NOT consult verification state, following the shipped invariant that
  verification gates discoverability and nothing else.
- **FR-736**: The author's name on a question MUST NOT become a route around the directory. Opening
  the author's profile MUST be governed by the existing profile rules exactly as it is from Discover
  — so a non-discoverable author's name is shown and their profile still refuses to open.
- **FR-737**: A question MUST NOT carry, and MUST NOT be joined to, any attendee field beyond what
  is required to render an attribution — no company, role, interests, intent, or availability. The
  question surface is not a second directory.
- **FR-738**: This feature MUST NOT add any column to the attendee record, and MUST NOT give any
  existing field a new audience (standing decision 16 as sharpened in v3.2.0).
- **FR-739**: The consequence of FR-734 — that hiding from Discover does not hide you here — MUST be
  visible to the attendee at the moment they ask, not discovered afterwards.
- **FR-740**: No surface may derive a relationship from a question or a vote. Contacts come from held
  cards alone (constitution v3.2.0, N1), and asking on the same session as somebody is not an act
  toward that person.

#### Reporting and blocking

*Added at spec review on 2026-08-10, by owner decision. Numbered out of sequence because the section
did not exist when the requirements above were written.*

The review established, by inspection rather than inference, that `ReportDialog` is imported by
exactly one file — `apps/web/src/app/messages/Thread.tsx` — so **the only entry point to reporting
in the whole product is an open conversation**. On a public surface that would have meant reporting
an abusive question required opening a conversation with its author first. Three requirements
compounded it: FR-709 forbids editing, FR-711 makes a question non-withdrawable once upvoted, and
this is the product's first many-to-many surface in a product with no moderator by construction.

- **FR-781**: A reader MUST be able to report a question from the question itself, without opening a
  conversation with its author.
- **FR-782**: Reporting MUST reuse the existing report action, which **blocks the reported attendee
  in the same act** — the attendee's protection lands first. This feature introduces no second
  reporting mechanism, no new operator channel, and **no report-reading surface anywhere**, which
  remains forbidden.
- **FR-783**: A report raised from a question MUST identify **which** question, stored in the same
  shape the existing report record uses for messages — a list of identifiers with no foreign key,
  degrading honestly into a list of things that no longer exist once the question is gone. A report
  naming only a person, on a surface where that person may have asked twenty questions, gives the
  operator nothing to act on.
- **FR-784**: Operator mail MUST continue to carry identifiers and a timestamp only — **never the
  question text and never the reporter's reason**, exactly as for messages.
- **FR-785**: Where a block exists in **either** direction between two attendees, each MUST be
  invisible to the other in Q&A: neither sees the other's questions. This mirrors 008's rule that a
  block severs card resolution in both directions, and it is what makes FR-781 meaningful — a report
  that blocks but leaves the reported question on screen has not helped anybody.
- **FR-786**: That invisibility MUST be **read-side and reversible**. Lifting a block restores the
  questions with no write, and nothing is deleted or cancelled. This is the opposite of 008's
  treatment of appointments, and the difference is the reason 008 gave: a *commitment* had to be
  ended because somebody would otherwise turn up, whereas a question is a thing on a page and
  restoring it harms nobody.
- **FR-787**: Hiding a question MUST NOT change any other question's count, and MUST NOT change what
  anybody else sees. A block is one reader's decision about one other person, not an edit to the
  conference's ranking. A vote the blocker already cast on a now-hidden question **stands** and
  continues to count for everyone else.

#### Authorization and refusals

- **FR-741**: Every read and write in this feature MUST be scoped per-event server-side through the
  branded `EventScope` that only `requireEventAccess` can construct, reached through the session the
  question belongs to.
- **FR-742**: Every route this feature adds MUST be registered under `/events/:eventId/…`, naming
  its conference in the address, so the **existing** event-scope audit covers it. A route named for
  a question alone — `/questions/:id/votes` — is forbidden, and the reason is settled rather than
  cautionary: `event-scope-audit` examines a route only if it names an event and **reports success
  otherwise**, so such a route ships unguarded and the gate says nothing. 007 met this with
  conversations, 008 met it again with cards, and 008 additionally had to correct 007's written
  prediction that appointments would inherit its guard. This feature introduces **no fourth branded
  scope and no fourth audit**, and FR-742 is the requirement that makes that safe rather than lucky.
- **FR-743**: A refusal MUST disclose nothing about conferences the reader is not registered for. A
  question in another event, and a question that does not exist, MUST be indistinguishable.
- **FR-744**: Within a conference the reader can see, authorship is already public on the panel, so a
  refusal for acting on somebody else's question MAY carry its reason. It MUST NOT thereby become
  distinguishable from FR-743's refusal.
- **FR-745**: Client error classification MUST branch on the error's **code**, never on its class —
  every non-2xx throws the same error type, so an `instanceof` check catches 400, 404, 429 and 500
  alike and would swallow the reasons FR-714 and FR-744 exist to deliver.
- **FR-746**: Asking, voting and reporting MUST each be throttled **per action**, following the
  established rule that a throttle is configured per action rather than shared. Asking is the one
  that matters — it is the write that publishes free text to a whole conference — and it is assumed
  to be the tightest of the three (Assumptions). A throttle here MUST only ever delay the actor
  themselves; it MUST NOT be keyed on anything another attendee controls, because a denial keyed
  that way only ever harms the victim.
- **FR-747**: **No action in this feature may dispatch a notification.** The trigger set stays at a
  received message and nothing else, and the existing source-level audit over `apps/api/src` MUST
  continue to pass **unedited**. Editing it to admit a Q&A trigger is a constitution amendment, not
  an implementation detail.

#### The panel section and addressability

- **FR-748**: Q&A MUST be delivered as a **section on the existing session detail panel**, alongside
  overview, speakers and notes — not a tab strip, and not a separate destination.
- **FR-749**: The section MUST own its own file, and the edit to `SessionPanel.tsx` MUST be limited to
  composing it — one line, in the manner of the existing sections.
- **FR-750**: Q&A MUST NOT change the panel's existing addressability. The panel's address names a
  session; no question gets an address of its own.
- **FR-751**: Switching between sessions MUST NOT carry one session's Q&A state into another's,
  following the same reasoning that keys the notes editor on the session id.
- **FR-752**: The section MUST NOT introduce a second modal on top of the panel, other than the
  reused confirmation of FR-712.
- **FR-753**: This feature MUST NOT add a Home card, and MUST NOT add a navigation destination.

#### Offline and client behaviour

- **FR-754**: **Nothing in this feature is cached**, and the refusal MUST be **declared per member at
  the composition root** rather than left to omission — following the rule 008 established at its
  own cost.
- **FR-755**: Q&A reads MUST be declared as live pass-through reads. A read left unclassified falls
  into the write branch, which **purges the whole conference prefix** — the exact defect that
  silently destroyed the cached programme, saved sessions and notes every time 008's scheduling
  dialog opened.
- **FR-756**: A **successful** Q&A action MUST NOT destroy cached data belonging to other features.
  Nothing in Q&A invalidates the programme, saved sessions, notes or appointments, so a question or
  a vote has nothing legitimate to purge, and purging the conference on every upvote would drop the
  attendee's offline programme for a number that does not need to be exact.
- **FR-756a**: A Q&A action **refused** by the server MUST still invalidate that conference, as
  every other refused write does. The two halves are separated deliberately: the refusal purge is
  what stops a cached programme staying readable after the server begins refusing a withdrawn
  registration, and it is the half that would be silently lost by classifying these methods as
  pass-through to satisfy FR-756. Satisfying one and not the other is the failure mode; Open
  Question 2 is about **how**, not whether.
- **FR-757**: Any repository method here that takes an identifier as its first argument MUST NOT be
  allowed to reach the cache's write branch, which reads `args[0]` as an event id and would purge a
  prefix assembled from a question id — a purge that silently matches nothing and reads as correct.
- **FR-758**: Every write MUST be **refused offline, never queued**. No write queue, no optimistic
  update, no conflict merging.
- **FR-759**: An offline refusal MUST NOT discard what the attendee typed.

#### Deletion, export and retention

- **FR-760**: A question MUST cascade from `attendees` on its author reference, so deleting an
  account removes every question that account asked (decision 1).
- **FR-761**: A vote MUST cascade from **both** `attendees` on its voter reference **and** from the
  question it was cast on — so deleting the author of a question removes every vote anybody cast on
  it, and deleting a voter removes their votes wherever they were cast.
- **FR-762**: Neither table is seeded. Seeding a question would fabricate attendee-authored personal
  data attributed to a real identity, which is the reasoning 005 recorded for saved sessions and
  notes. The consequence is deliberate: **the empty state is what a reviewer sees first**.
- **FR-763**: Both tables MUST cascade from `sessions` so that re-seeding conference content
  succeeds. A non-cascading reference to seeded content makes `DELETE FROM events` fail and breaks
  the re-seed with an error naming neither table — which is exactly what 008 met with
  `shared_cards.event_id`.
- **FR-764**: The export MUST cover every question the attendee asked and every vote they cast, each
  naming the session it belongs to. Completeness MUST be established from the schema itself, so a
  column added later and left uncovered fails the build rather than passing silently.
- **FR-765**: **No retention rule is required**, and that MUST be true by cascade rather than by
  assertion: every record this feature introduces is reachable from `attendees`. Nothing here needs
  the sweep that exists for records no cascade can reach.

#### Absences, asserted rather than assumed

Each of the following is a requirement that something does **not** exist, and each is verified, in
the style 007 and 008 established. An absence nobody tests is an absence the next feature adds
back.

- **FR-766**: No notification is dispatched by any Q&A action (FR-747).
- **FR-767**: No notification bell and no in-app notification centre.
- **FR-768**: No answer, reply, "answered" marker, pin, or moderation control — each is an organizer
  act (Principle III).
- **FR-769**: No route, repository method or surface that reveals who voted (FR-721).
- **FR-770**: No question edit route or column (FR-709).
- **FR-771**: No downvote (FR-723).
- **FR-772**: No write method added to `CatalogRepository` (FR-710).
- **FR-773**: No Q&A content on Home, and no seventh-plus Home card (FR-753).
- **FR-773a**: No report-reading surface — no route, no repository method, no screen — extending the
  existing prohibition to this feature's reports (FR-782). The existing test asserting that nothing
  reads a report MUST continue to pass unmodified.
- **FR-773b**: No de-duplication of questions, no merge, and no "already asked" refusal (Edge Cases).

#### Layout, accessibility and states

- **FR-774**: The section MUST render correctly at desktop, tablet and mobile widths, inside the
  panel's existing overlay behaviour.
- **FR-775**: No content and no primary action may require horizontal scrolling at any supported
  width. A long question MUST wrap.
- **FR-776**: The upvote control MUST have an accessible label naming what it acts on, MUST convey
  its pressed/voted state to assistive technology, and MUST be at touch size on mobile.
- **FR-777**: Every control MUST have a visible focus state, and the whole section — ask, post,
  upvote, withdraw, confirm — MUST be operable by keyboard alone.
- **FR-778**: The confirmation dialog MUST dismiss on Escape and MUST restore focus to the control
  that opened it, **after** closing rather than before.
- **FR-779**: The confirmation dialog MUST be centred by the shared base rule and MUST NOT re-patch
  centring locally. Two dialogs have already shipped pinned to the top-left corner because Tailwind's
  Preflight removes the user agent's `margin: auto`, and it is invisible to every behavioural test.
- **FR-780**: A count that changes MUST NOT move focus. Re-ordering the list after a vote MUST leave
  the reader's focus on the control they just activated.

### Key Entities

- **Session question** — one attendee's question against one session: the author, the session, the
  body, and when it was asked. **Per-event**, reached through the session. It stores no copy of the
  author beyond the reference; the display name resolves live, as a held card's profile does.
- **Question vote** — the fact that one attendee upvoted one question, and when. **Per-event**,
  reached through the question to its session. The pair is unique, and that uniqueness *is* FR-718.
- **Vote count** — not a stored entity. It is the number of vote rows, computed at read time. A
  denormalised counter column is **forbidden**: it is a second source of truth for a number the rows
  already answer, and the one that drifted would be the one displayed.

*There is deliberately no "answer" entity, no "answered" flag, and no moderation state.* All three
require an organizer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-701**: An attendee can go from an open session panel to a posted question in **under 20
  seconds**, with **exactly two control interactions** — focus the field, activate the post control.
  The count excludes typing, which is the attendee composing rather than the product asking; stated
  so the criterion is measurable without argument about what counts as an action.
- **SC-702**: An invalid question cannot be submitted at all — the confirmation is unavailable rather
  than rejecting — verified for empty, whitespace-only, and over-length input.
- **SC-703**: A question asked by one attendee is visible, with its author's name, to a second
  attendee at the same event on their next read, **100% of the time**.
- **SC-704**: An attendee cannot cast more than one vote on a question by any sequence of actions,
  including repeated rapid activation on a slow connection.
- **SC-705**: For a fixed set of questions and votes, two different readers see the **same order**.
  Verifiable by comparison, including where counts tie.
- **SC-706**: A reader can determine their own voted state on every question without any action, and
  cannot determine **anybody else's** by any action.
- **SC-707**: An attendee who has turned discoverability off is still named on their question, and
  their profile still refuses to open from it. Both halves verified together, because either alone
  would look like a defect.
- **SC-708**: A question is withdrawable by its author while it has no votes and by nobody else,
  ever; and a withdrawal that races a vote is refused **with its reason** rather than silently.
- **SC-709**: After an account is deleted, **no** question it asked and **no** vote cast on those
  questions is reachable by any surviving attendee, and no count refers to a question that is gone.
- **SC-710**: An export contains every field this feature collects, with completeness established
  from the data model itself rather than from a hand-maintained list.
- **SC-711**: No **successful** Q&A action changes what is available offline for any other feature.
  Verifiable by reading a cached programme, asking a question, and reading it again. A **refused**
  Q&A action still clears that conference, verifiable by the same walk with the registration
  withdrawn — both halves tested, because passing one by breaking the other is the likely failure.
- **SC-711a**: A reader can report a question **without opening a conversation with its author**,
  and the reported question is gone from their view immediately afterwards. Both halves, because the
  first without the second files paperwork and changes nothing on screen.
- **SC-711b**: A block makes two attendees invisible to each other in Q&A in both directions, is
  reversed by lifting the block with no other action, and changes **nothing** about what any third
  attendee sees — including every vote count.
- **SC-712**: Every action in this feature is refused offline with an explanation, and nothing the
  attendee typed is lost.
- **SC-713**: The whole section is operable by keyboard alone at all three widths, with every focus
  position visible, and no surface requires horizontal scrolling.
- **SC-714**: No notification is dispatched by any action in this feature, established by the
  existing audit passing **unmodified**.
- **SC-715**: A failure in the Q&A section leaves the session panel's overview, speakers and notes
  rendered and interactive.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Nothing in this feature is cached, and the refusal is declared per member at the composition root** (FR-754) — following Messages and Discover rather than Agenda. Two reasons, both structural: a **vote count is a live number** that is wrong the moment it is stored, and a stale count carrying a "retrieved at" stamp is worse than no count at all; and a question is **another attendee's name and words**, which must not linger on a device after they withdraw it or delete their account. Reads are declared **live pass-through** rather than left unclassified, because omission enrols a read in the write branch and purges the whole conference (FR-755, FR-757). Writes must satisfy **both halves**: a success purges nothing (FR-756), a refusal still clears that conference (FR-756a). Neither existing classification does both, which is Open Question 2. **Every write is refused offline, never queued** (FR-758), and the typed text survives the refusal (FR-759). |
| **Desktop layout** (Principle IV) | Persistent left rail and contextual top bar unchanged. The panel remains a centred overlay; Q&A is a fourth stacked section within it, with the ask field full-width above the list and the vote control on the leading edge of each question. |
| **Tablet layout** (Principle IV) | Reduced rail. The panel keeps its constrained width; the Q&A list stays single-column — questions are text, and a two-column list of prose is harder to scan, not easier. |
| **Mobile layout** (Principle IV) | Compact header, bottom navigation, the panel full-width from the bottom edge as 005 established. Vote and withdraw controls at touch size (FR-776). A long question wraps; nothing scrolls horizontally (FR-775). |
| **Empty / loading / failure states** (Principle IV) | Q&A list: empty invites the first question (FR-727); loading, and failure distinguishing absence of connection from fault on our side (FR-728). Ask field: **disabled post control** for empty, whitespace-only and over-length input (FR-704) — never a post-submit error. Report dialog: **disabled confirmation while the reason is blank**, inherited from the dialog being reused. Vote: an offline or refused vote leaves the count untouched. Withdrawal: unavailable-with-reason rather than present-and-failing (FR-713). A Q&A failure leaves the rest of the panel intact (FR-729). |
| **Accessibility** (Principle IV) | Upvote control carries an accessible label naming its question and conveys pressed state (FR-776). Whole section keyboard-operable with visible focus (FR-777). **Two modals, both reused, neither new** — the withdrawal confirmation and 007's report dialog. Each takes Escape, focus trap and background inertness from the platform and restores focus to its opener *after* closing (FR-778), and each is centred by the shared base rule and MUST NOT re-patch centring locally (FR-779). **Both open from inside the session panel, which is itself a modal `<dialog>`** — a dialog opened over a dialog is the one arrangement 007 avoided by reusing rather than nesting, and it is the sharpest layout risk in this feature. Re-ordering after a vote must not move focus (FR-780). |
| **Validation checklist discharged** (Principle VII) | Discharges the **Q&A half of "session save + notes + Q&A"** — 005 discharged save and notes. **This is the last outstanding behavioural item on the whole-product checklist.** Also contributes to keyboard focus visibility and accessible labels. Leaves to 010: the full end-to-end sweep at three widths, the accessibility sweep across all five destinations, the physical iPhone test, brand assets, and the performance pass. |
| **Identity scoping & server-side authorization** (Principle VIII) | Every read and write is bound to the requesting identity server-side and scoped per-event through the branded `EventScope`, reached through the session (FR-741). Authorship is checked server-side for withdrawal regardless of what the interface offered (FR-715). Refusals disclose nothing about conferences the reader is not in (FR-743). **No new branded scope is expected** — unlike 007's conversations and 008's cards, a question always belongs to a session and a session always belongs to one event, so the existing predicate reaches it. FR-742 makes that safe by requiring every route to name its conference in the address, rather than leaving it to a fourth audit to catch afterwards. **Reporting and blocking reuse 007's server-side enforcement unchanged** (FR-782); the block predicate is read at Q&A read time in both directions (FR-785), which is a read this feature adds to a rule 007 owns rather than a new rule. |
| **Deletion & export coverage** (Principle VIII) | **Questions**: cascade from `attendees` on the author reference (FR-760) — decision 1, taken as v3.2.0 required. **Votes**: cascade from `attendees` on the voter reference *and* from the question (FR-761), which is what makes other people's votes vanish with the question they backed. **Both** additionally cascade from `sessions` so re-seeding works (FR-763). Export covers questions asked and votes cast, each naming its session, established from the schema (FR-764). **No retention rule is needed and that is true by cascade, not by assertion** (FR-765). **No column is added to the attendee record** (FR-738). **One column is added to an existing table**: FR-783 stores the reported question identifiers on 007's report record, in the same foreign-key-free shape it already uses for messages — so it degrades honestly when the question is gone, and it inherits that table's existing 90-day sweep rather than needing a rule of its own. So: two new tables, one new column on a neighbour's table, and nothing on the attendee record. |
| **Event scoping** (Constraints — data scoping) | **Session questions — per-event.** A question is asked against a session, and a session exists only within one conference; there is no cross-conference notion of "the same session", exactly as 005 recorded for saved sessions and notes. **Question votes — per-event**, inherited through the question. **For both, the event is reached through the session and is deliberately NOT denormalised** — a stored `event_id` would be a second source of truth that could disagree with `sessions.event_id`, and the one that disagreed would be the one authorization read. Neither rule is assumed; both are stated here and again in the schema. |
| **Register position** (Governance) | **Blocked by no open register entry.** Entry 9 — audience-question attribution — was **resolved 2026-08-10 by owner decision N3 and closed by constitution v3.2.0**, which also wrote the attribution rule and its Principle VIII consequence into binding text. The one problem v3.2.0 left explicitly open for this phase — a departing attendee's upvoted question — is **decided and declared here** (decision 1) rather than filed, which is what the "Audience questions" block requires. This feature **resolves no register entry** and **raises none**. Unaffected by entries 20 and 21, which block deployment rather than code. **BUT: a constitution amendment IS required, and it is a precondition on implementation.** Reversed at spec review on 2026-08-10 — the draft claimed none was needed. Public Q&A visibility is a **third exception** to Principle VIII's "private content stays private", and Principle VIII requires an exception to be *recorded*, not entailed. The two existing exceptions were each recorded by amendment (D10 in v2.3.0, N2 in v3.2.0), and this follows 008's precedent: **planning may proceed; the first line of implementation may not until the amendment is ratified.** See Open Question 1. |
| **Reserved migration number** (Branching — parallel work) | **`0008`**, from the delivery roadmap. Anyone regenerating the Drizzle snapshot must move `apps/api/migrations/meta/README.md` aside first — `drizzle-kit generate` JSON-parses every file in `meta/` — and must not "correct" the journal's deliberate `0003`/`0004` ordering. |

## Assumptions

- **Question length limit**: assumed to be **500 characters**. Long enough for a real question,
  short enough that the list stays scannable, and far below the 10,000 that session notes allow —
  a note is an essay to yourself, a question is one sentence to a room. The number is a stated
  assumption, not a requirement derived from a source, and may be changed at planning without
  touching any other requirement.
- **No pagination** (FR-732): a session's question list is assumed to stay small enough to return
  whole, as the notes set is. This is the assumption most likely to be wrong at a keynote, which is
  why it is written down rather than left implicit — the directory needed keyset pagination and this
  is the same shape of risk at a smaller scale.
- **An attendee may not vote on their own question** (FR-722). Not named by any source. Chosen
  because it removes a footgun rather than for propriety: with FR-711 keying withdrawal on "no votes
  yet", an author who upvotes their own question **locks themselves out of withdrawing it** by their
  own act, which nothing on screen would explain.
- **Votes are withdrawable, and withdrawability of a question follows the current count** (FR-719,
  Edge Cases). The alternative — a monotonic "has ever been voted" marker — needs a stored column to
  survive the vote rows being deleted, and buys only the avoidance of a harmless re-opening.
- **Q&A does not close.** A question may be asked on a session that has already ended, and questions
  persist for the life of the conference record. No source names a cut-off, and inventing one would
  make the surface unusable for exactly the session an attendee just walked out of.
- **Section placement**: Q&A is appended as a **fourth** section without disturbing the existing
  order. `requirements.md` lists the panel as overview → notes → Q&A → speakers, while 005 shipped
  overview → speakers → notes. **That divergence is pre-existing and is not introduced or corrected
  here** — reordering a shipped panel is a change to 005's delivered surface and is out of scope.
- **Display name is the attribution**, the same field the directory and messages already show. No
  new field, and no company or role alongside it (FR-737).
- **Asking is throttled more tightly than voting or reporting** (FR-746). Asking publishes free text
  to a conference; a vote is a single bit and a report already blocks. Concrete values are a planning
  decision, taken against the existing per-action throttle configuration rather than invented here.
- **Existing infrastructure is reused**: 002's event scoping and its indistinguishable refusal shape,
  005's session detail panel and its dialog and focus-restoration patterns, 004's account deletion
  and export and their two coverage guards, 007's per-action throttling and its reused confirmation
  dialog, and 008's `passThrough` cache classification.

## Open Questions

**1. The constitution amendment recording public Q&A visibility — A PRECONDITION ON IMPLEMENTATION,
not on planning.** Decided at spec review on 2026-08-10: it is required. What is open is only its
drafting. It must record a **third exception** to Principle VIII's "private content stays private" —
a question is visible to every attendee registered for the event, under a real name, **with no
opt-out**, and specifically including an attendee who has turned discoverability off. It should
carry the three consequences alongside it, because an exception recorded without them is the half
that gets re-litigated: attribution does not consult verification state (FR-735), the author's name
is not a route into their profile (FR-736), and asking tells the attendee what it will publish
before they do it (FR-739). It should also record that this feature is the product's first
many-to-many surface and that reporting from a question (FR-781) is what makes the absence of a
moderator survivable there. **Nothing else in this feature is blocked by it, and planning may
proceed in full.** Follows 008's precedent exactly, where v3.2.0 gated the first line of code.

**2. What a Q&A write should do to the cache, given a success invalidates nothing and a refusal
invalidates everything.** FR-756 and FR-756a state both halves; **no existing classification
satisfies both.** Leaving writes unclassified purges the conference on every question and every
upvote — it satisfies FR-756a and violates FR-756, dropping the attendee's offline programme for a
single vote. Declaring them pass-through satisfies FR-756 and violates FR-756a, silently giving up
the purge that stops a cached programme staying readable after the server begins refusing a
withdrawn registration. The answer is most likely a **third classification — purge on refusal, not
on success** — which does not exist yet and which would be useful to more than this feature. A
planning decision, and the one most likely to produce a defect that no unit test sees, because 008's
version of exactly this reached a browser.

**3. Nesting two modal dialogs.** The withdrawal confirmation (FR-712) and the report dialog
(FR-781) both open from **inside** the session panel, which is itself a `<dialog>` opened with
`showModal()`. 007 deliberately avoided this by reusing `ConfirmDialog` rather than opening a second
dialog over the thread, and the ordering it had to get right — restore focus *after* closing,
because an inert element cannot take focus — becomes harder with two layers. Whether the top layer
handles this cleanly, and whether Escape dismisses only the inner dialog, must be established **in a
browser** rather than in jsdom. This is a layout-and-focus risk of exactly the kind no behavioural
test has ever caught in this project.

**4. Should the session detail panel become an append-only registry, as Home cards and navigation
are?** It is not one today: `SessionPanel.tsx` composes its sections literally, so this feature must
edit a file 005 owns (FR-749). One edit is not a problem; the *pattern* is, because the constitution
names extension points as append-only precisely so a feature is never required to edit a
neighbour's file. 009 is the last feature on the roadmap, so converting the panel now buys nothing
for a future contributor who does not exist — which is the argument for **not** doing it, and it is
worth someone deciding rather than defaulting. A planning decision, not a client one.

**5. Where the reused report dialog should live.** `ReportDialog` is currently at
`apps/web/src/app/messages/ReportDialog.tsx` and is imported by one file. FR-781 gives it a second
caller in a different destination. Moving it to a shared location is the obvious answer and means
editing a second file 007 owns — the third neighbour's file this feature touches, after
`SessionPanel.tsx` and the report record. Importing it across destinations without moving it is the
alternative and is worse. A planning decision.

**6. Whether the ordering should be re-read after the reader's own vote, or re-sorted locally.**
FR-730 says the reader's own action updates immediately and FR-780 says focus must not move; a
re-read satisfies the first and threatens the second, while a local re-sort satisfies both and
briefly diverges from the server. A planning decision, and the kind that is cheap now and annoying
later.

**7. Whether 009 splits into reviewable phases.** It was the smallest feature on the roadmap — two
tables, one panel section — and the reporting requirements added at review make it less so. Worth
confirming against the concrete task list, as 007 and 008 each did.

**~~8. Should blocking hide a blocked attendee's questions?~~ ANSWERED 2026-08-10 — yes, both ways,
read-side and reversibly** (FR-785–FR-787). Retained rather than deleted, because the *reasoning*
corrects something the draft got wrong and a later feature would get wrong the same way. The draft
defaulted to "no" partly on the ground that hiding would make one reader's vote counts disagree with
everybody else's. **That is false**: hiding a whole question removes it from one reader's list and
changes no other question's count at all. The real argument was the one for hiding — a report that
blocks but leaves the reported question on screen has not helped anybody — and it only became
visible once FR-781 made reporting reachable from the question.
