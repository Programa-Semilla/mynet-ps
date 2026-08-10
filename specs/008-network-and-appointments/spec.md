# Feature Specification: Network — Contacts, Exchanged Cards, and Appointments

**Feature Branch**: `feat/008-network-and-appointments`

**Created**: 2026-08-10

**Status**: Draft

**Input**: Brainstorm #07 (`brainstorm/07-network-and-appointments.md`), which settled constitution
register entries 7 and 8. Delivery roadmap phase 008, reserved migration `0007`, parallel with 009.

## Context and Scope Note

This feature fills the fifth and last empty destination. It depends on 004 (profiles) and 007
(blocking), both shipped, and it was blocked for the whole life of the project by two client
decisions rather than by any dependency.

### What the two register entries were, and what answered them

Register entry 7 asked what a Network **contact** is; entry 8 asked what an exchanged **card**
records and whether the exchange is mutual. Each says in its own words that it *blocks the Network
feature entirely*. Brainstorm #07 closed both with a single decision: **a contact is someone whose
card you hold.** Sharing a digital business card becomes the only relationship-forming act in MyNet,
and the two entries stop being independent questions.

### The property this feature exists to create

**Discover is per-event and deliberately uncached.** 006 refused to cache the directory on the
ground that age is the wrong clock for a discoverability setting and that a cached directory is
other people's personal data ageing on a device after they chose to be invisible. The consequence,
unwritten until #07: when the conference ends or the attendee switches events, **nothing durable is
left behind**. Standing decision 7's own rationale promises that "a contact made at last year's
conference must not vanish because the attendee is now at a different one", and as of 007 nothing
keeps that promise.

Network is the durable half of a product whose discovery surface is transient by design. That is the
job, and it is why a held card resolves a **live pointer** to the sharer's current profile rather
than a snapshot: one source for a person, no duplicated personal data, and no record that silently
goes stale.

### The property this feature cannot inherit

**`EventScope` cannot reach a shared card**, for exactly the reason it could not reach a
conversation. A card is cross-event by standing decision 7, so a route that resolves one names no
conference — and `event-scope-audit` **silently passes** a route naming no conference rather than
failing it. 007 found this hole and closed it with a branded `ConversationScope`, a
`requireParticipation` guard and a *second* route audit. This feature meets the same hole with
cards, and its own answer is Open Question 2 rather than an assumption.

Appointments are different: they are per-event and name a conference, so they may be able to compose
the existing event scope with a participant check.

### Departure from the approved prototype

The prototype answers almost none of this, and one of its answers is now forbidden.

- **Contacts are derived from conversations** (`App.tsx:1174`) — literally
  `ATTENDEES.filter((a) => conversations.some((c) => c.attendeeId === a.id))`. **007 made this
  unavailable**: under open send a conversation is a unilateral act, so deriving contacts from
  conversations would let a stranger insert themselves into another attendee's Network by sending
  one message.
- **Card sharing is a two-second confirmation that stores nothing** (`App.tsx:828`).
- **Meeting slots are a hardcoded module constant** (`MEETING_SLOTS`, `App.tsx:144`).
- **Appointments are created unilaterally** (`App.tsx:1313`) with no second party and no status.
- The scheduling sheet has **no Escape handling and no visible focus states**, which Principle IV
  settles as a defect to fix rather than an open question.

### Departure from the delivery roadmap

The roadmap assigns this phase the slot-availability decision and offers two candidates. One is
**rejected on Principle VIII grounds rather than on taste**: deriving slots from *both parties'*
saved sessions discloses the invitee's private Agenda by omission, because greying out their
committed slots lets the reader learn where that person will be all day by reading the gaps. A saved
session is private per-attendee state. That candidate is unavailable to this product at any level of
polish, and the same objection kills a server-side auto-decline on conflict.

### Departure from two prior refusals of an acceptance step

007 refused a request-then-accept handshake for conversations, and #07 refused one for cards. **This
feature takes one for appointments**, and the asymmetry is deliberate rather than drift: a message
and a card impose nothing on the other person, whereas an appointment claims a slot of their time,
and reserving another person's time without consent is a different act.

### What this feature does not do

- **No notification is dispatched for anything here.** The constitution locks the trigger set to a
  received message and nothing else; `apps/api/src` carries a source-level audit that fails if a
  second trigger appears, and **this feature does not edit that test**. A proposal is discovered by
  opening the product.
- **No calendar integration.** `CalendarService` exists and stays unwired until a recorded decision
  brings it in.
- **No card revocation verb.** A shared card cannot be recalled; blocking severs it.
- **No connect, follow, or accept action for contacts**, and no contact groups, tags, or notes.
- **No organizer or administrative surface** of any kind, including for the seeded slot grid.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep someone you just met (Priority: P1)

An attendee finds somebody relevant in Discover, opens their profile, and shares their own card.
The recipient opens Network and finds a new contact there: the sharer's name, photograph, company,
role, headline, and interests, resolved live from that person's profile.

**Why this priority**: it is the whole feature in one act. Without it Network has nothing to show,
and the core journey's "share a card" step still produces nothing that lasts.

**Independent Test**: with two accounts registered for the same conference, share a card from one
and confirm the other's Network lists the sharer, while the sharer's own Network is unchanged.

**Acceptance Scenarios**:

1. **Given** two attendees registered for the same conference, **When** attendee A shares their card
   from attendee B's profile, **Then** B's Network lists A as a contact and A's Network does not
   list B.
2. **Given** A has shared their card with B, **When** A shares it again, **Then** B still has exactly
   one contact for A and nothing is duplicated.
3. **Given** A has shared their card with B, **When** A later edits their company and role,
   **Then** B's contact entry shows the edited values without B doing anything.
4. **Given** an attendee with no contacts, **When** they open Network, **Then** they are told the
   list is empty and offered a way to reach Discover.
5. **Given** the share succeeds, **When** the confirmation is shown, **Then** it names whose card
   moved, and the control's accessible name says so before it is activated.

---

### User Story 2 - A relationship that outlives the conference (Priority: P1)

The conference ends, or the attendee switches to a different event. Their contacts are still there,
and each still resolves to a current profile — including for people who have since turned their
discoverability off.

**Why this priority**: it is the reason the model was chosen over the alternatives, and it is the
promise standing decision 7 already makes and nothing yet keeps. It is also the property most easily
lost by a later change, so it needs its own test.

**Independent Test**: switch the reader to a second event that the contact is not registered for,
and confirm the contact still resolves; then turn the contact's discoverability off and confirm the
contact still resolves while they vanish from Discover.

**Acceptance Scenarios**:

1. **Given** B holds A's card from event 1, **When** B switches to event 2, **Then** A is still
   listed in B's Network with current details.
2. **Given** B holds A's card, **When** A turns discoverability off, **Then** A disappears from
   Discover for everybody but remains a resolvable contact for B.
3. **Given** B holds A's card, **When** the card is resolved, **Then** verification state is not
   consulted at any point in the resolution. Verified by inspecting the resolution path rather than
   by producing an unverified state — no un-verify action exists, and this scenario exists to stop
   one being *added* as a second use of verification.
4. **Given** B holds A's card, **When** B looks at the contact, **Then** B can see which event they
   exchanged at and when.

---

### User Story 3 - Propose a meeting (Priority: P1)

From a contact or a profile, the attendee opens a compact scheduling dialog, picks one of the
event's meeting slots, types a short topic, and sends a proposal.

**Why this priority**: it is the final step of the core journey the constitution requires to remain
completable end to end, and it discharges two of the whole-product checklist items.

**Independent Test**: open the dialog, confirm the confirm control is disabled until both a slot and
a topic are present, send a proposal, and confirm it appears as pending for both parties.

**Acceptance Scenarios**:

1. **Given** the scheduling dialog is open, **When** no slot is selected or the topic is empty or
   only whitespace, **Then** the confirm control is **disabled** rather than producing an error
   after submission.
2. **Given** the reader already holds a saved session or an appointment overlapping a slot, **When**
   the dialog lists slots, **Then** that slot is not offered.
3. **Given** every slot for the event day is unavailable to the reader, **When** the dialog opens,
   **Then** it shows an explanation and a close action, and offers no selection.
4. **Given** a proposal is sent, **When** either party looks, **Then** it appears as pending, showing
   the other person, the slot in venue time, and the topic.
5. **Given** the dialog is open, **When** Escape is pressed or the close control is activated,
   **Then** the dialog closes and focus returns to the control that opened it.
6. **Given** the invitee has blocked the proposer, or the proposer has blocked the invitee, **When**
   scheduling is attempted, **Then** it is refused without a reason being disclosed.

---

### User Story 4 - Answer a proposal (Priority: P1)

The invitee opens Network, sees a proposal waiting, and accepts or declines it. Either party can
cancel a confirmed appointment afterwards.

**Why this priority**: without it a proposal never becomes an appointment, so User Story 3 produces
a permanently pending record and the journey does not complete.

**Independent Test**: send a proposal from one account, accept it from the other, confirm both see a
confirmed appointment; repeat with a decline and confirm the slot is available to the proposer again.

**Acceptance Scenarios**:

1. **Given** a pending proposal, **When** the invitee accepts, **Then** both parties see a confirmed
   appointment at that slot.
2. **Given** a pending proposal, **When** the invitee declines, **Then** both parties see it as
   declined and the slot becomes selectable again for the proposer.
3. **Given** a confirmed appointment, **When** either party cancels, **Then** both see it cancelled
   and the slot is selectable again for both.
4. **Given** a proposal or appointment, **When** an attendee who is neither participant requests it,
   **Then** the response is indistinguishable from one that does not exist.
5. **Given** a destructive answer — decline or cancel — **When** it is chosen, **Then** it is
   confirmed through the shared confirmation dialog rather than a second modal opened over the
   first.
6. **Given** a proposal whose slot has already passed, **When** it is displayed, **Then** it is shown
   as lapsed and can no longer be accepted.
7. **Given** the invitee acquired a conflicting commitment after the proposal arrived, **When** they
   accept, **Then** acceptance is refused and they are told they already have something at that
   time — a statement about their own schedule, disclosed to nobody else.

---

### User Story 5 - Know what is waiting, from Home (Priority: P2)

Home shows the attendee's appointment summary for the active event: confirmed appointments, and
proposals awaiting their answer.

**Why this priority**: it is the roadmap's Home contribution for this phase, and it is the **only**
way an attendee learns a proposal exists, because no notification may be raised for one.

**Independent Test**: with a pending proposal and a confirmed appointment on the active event, load
Home and confirm both are represented; then break the card's data source and confirm the rest of
Home renders.

**Acceptance Scenarios**:

1. **Given** confirmed appointments on the active event, **When** Home loads, **Then** the summary
   card lists them in chronological order.
2. **Given** a proposal awaiting the reader's answer, **When** Home loads, **Then** the card makes it
   visible as needing an answer and offers a route to answer it.
3. **Given** the card's data cannot be loaded, **When** Home renders, **Then** the card shows its own
   failure state and no other card is affected.
4. **Given** no appointments and no proposals, **When** Home renders, **Then** the card shows its own
   empty state.

---

### User Story 6 - End a relationship (Priority: P3)

An attendee blocks somebody, or closes their account. Cards and appointments answer for it in both
directions.

**Why this priority**: it is the safety and personal-data half. It is P3 only because it cannot be
exercised until the earlier stories exist, not because it is optional — two coverage tests fail the
build without it.

**Independent Test**: block a contact and confirm the card stops resolving both ways and scheduling
is refused; delete an account and confirm the card and every appointment are gone from the other
person's view.

**Acceptance Scenarios**:

1. **Given** A and B hold each other's cards, **When** either blocks the other, **Then** neither
   card resolves for either party and neither can share again or schedule.
2. **Given** a block is later lifted, **When** it is, **Then** the card resolves again — blocking
   suspends the relationship rather than destroying the record.
2a. **Given** a pending proposal or a future confirmed appointment between two attendees, **When**
   either blocks the other, **Then** both are cancelled and the slots freed; and **When** the block
   is later lifted, **Then** they stay cancelled and a new one must be proposed.
3. **Given** B holds A's card, **When** A deletes their account, **Then** the contact is gone from
   B's Network entirely rather than becoming a nameless entry.
4. **Given** A and B have appointments, **When** either deletes their account, **Then** those
   appointments are gone for both.
5. **Given** any attendee, **When** they export their data, **Then** it contains the cards they have
   shared, the cards they hold, and their appointments in both roles.

---

### Edge Cases

- **Sharing with yourself** — not offered, and refused server-side.
- **Sharing with someone not registered for any event you share** — refused, and the refusal is
  indistinguishable from that person not existing, inheriting 006's four-way indistinguishability.
- **Two proposals for the same slot with different people** — the second is not offered, because the
  reader's own *sent* pending proposals remove a slot (FR-625).
- **Both parties propose to each other for the same slot** — both are offered it, because a
  *received* proposal reserves nothing. Each is a separate record; whoever accepts first creates the
  appointment, and the other's acceptance is then refused by FR-633a, which tells them they already
  have a commitment then.
- **A block arriving between proposal and acceptance** — FR-637a cancels the proposal and frees the
  slot. The invitee sees it cancelled rather than silently vanished.
- **Being blocked while holding an appointment tomorrow** — the appointment is cancelled, not
  hidden. A meeting you would otherwise turn up to must not disappear quietly.
- **A proposal to somebody who then leaves the conference** — the appointment is per-event; what
  happens to it is Open Question 4.
- **A held card whose sharer has left every event you share** — the card still resolves, because
  standing consent does not depend on co-attendance. This is the same rule as User Story 2 and is
  stated so that a later reader does not "fix" it.
- **A contact list rendering many avatars** — the directory's avatar revalidation gap
  (`avatar-serving-has-no-revalidation-story` in the idea inbox) applies here too and is recorded
  rather than solved by this feature.
- **Whitespace-only topic** — treated as empty; the confirm control stays disabled.
- **Slot boundaries across midnight or outside the conference day** — the grid is seeded per event
  day in venue time, so no slot exists outside it.
- **Clock skew between proposal and slot** — a slot is an absolute instant derived from the event's
  timezone at seed time, and all relative wording is computed at display time, following 002.

## Requirements *(mandatory)*

### Functional Requirements

#### Sharing a card

- **FR-601**: An attendee MUST be able to share their own card with another attendee from that
  attendee's profile view, alongside the existing message action.
- **FR-602**: Sharing MUST be **one-directional**. It gives the recipient the sharer's card and MUST
  NOT give the sharer anything.
- **FR-603**: The control's accessible name and its confirmation MUST both state whose card moves,
  so the act is not mistaken for taking the other person's card.
- **FR-604**: Sharing MUST be idempotent — repeating it MUST NOT create a second contact, and MUST
  NOT become a mechanism for repeatedly signalling somebody.
- **FR-605**: The system MUST record the sharer, the recipient, the instant, and the event at which
  the exchange happened.
- **FR-606**: An attendee MUST NOT be able to share a card with themselves.
- **FR-607**: Sharing MUST be refused when the two attendees share no current event, with a refusal
  indistinguishable from the recipient not existing.
- **FR-608**: Sharing MUST be refused when either party has blocked the other, **without disclosing
  a reason**, in the shape 007 established for a blocked send.
- **FR-609**: Sharing MUST be subject to a per-action throttle, because it is a unilateral write
  against another attendee's records.

#### Holding a card

- **FR-610**: A contact MUST be defined as an attendee whose card the reader holds. The system MUST
  NOT derive contacts from conversations, from appointments, or from any other signal.
- **FR-611**: A held card MUST resolve the sharer's **current** profile at read time — display name,
  avatar, company, role, headline, interests — rather than a copy stored at exchange time.
- **FR-612**: Card resolution MUST NOT apply the directory's discoverability condition. A shared
  card is standing consent that outlives the toggle, because discoverability governs being *found*,
  not being *remembered*.
- **FR-613**: Card resolution MUST NOT consult verification state. Verification gates
  discoverability and nothing else, and re-checking it here would be a second use of it.
- **FR-614**: Card resolution MUST NOT require the two attendees to share a current event.
- **FR-615**: A held card MUST show which event it was exchanged at and when.
- **FR-616**: A request for a card the reader does not hold MUST be refused indistinguishably from
  one that does not exist.
- **FR-617**: Network MUST list held cards as the attendee's contacts, with an empty state that
  offers a route to Discover.
- **FR-618**: The system MUST NOT provide any means to recall or revoke a shared card.

#### What a card carries — settled 2026-08-10

**The card-only contact line is WITHDRAWN.** The project owner ruled that it *does* breach standing
decision 16, which settled profile visibility as all-or-nothing and recorded that per-field
permissions were considered and rejected. The reading this specification originally proceeded under
— that decision 16 governs only the profile in the directory — is **not** the governing one.

- **FR-619**: A card MUST carry **exactly** the profile fields the directory already shows —
  display name, avatar, company, role, headline, interests. It MUST NOT carry any field that is
  not visible in the directory.
- **FR-620**: This feature MUST NOT introduce any attendee-authored field whose visibility differs
  from the rest of the profile. There is one visibility decision per attendee and it is the
  discoverability toggle.
- **FR-621**: Consequently this feature introduces **no new personal-data field**. It adds no column
  to the attendee record, needs no new export coverage beyond its own tables, and requires no test
  asserting a field's absence from the directory — the field does not exist.
- **FR-622**: A card's value is **durability, not disclosure**. It makes a person reachable after
  the conference that introduced them has ended; it does not reveal anything about them that a
  co-attendee could not already see.

#### Meeting slots

- **FR-623**: Meeting slots MUST be conference content, seeded and versioned with the event, per
  standing decision 8. There MUST be no interface for creating or editing them.
- **FR-624**: Slots MUST be expressed in the venue's timezone, following the rule 002 established
  for day context.
- **FR-625**: The slots offered to a reader MUST exclude those overlapping the **reader's own**
  saved sessions, the reader's own **sent** pending proposals, and the reader's confirmed
  appointments. A proposal the reader has **received** MUST NOT remove a slot — otherwise anybody
  could consume another attendee's whole day by proposing into it, and the throttle would bound that
  without preventing it.
- **FR-626**: The slots offered MUST NOT be filtered by the invitee's saved sessions, appointments,
  or any other private state. Availability MUST disclose nothing about the invitee.
- **FR-627**: When no slot is available to the reader, the scheduling surface MUST show an
  explanation and a close action, and MUST offer no selection.

#### Proposing and answering

- **FR-628**: An attendee MUST be able to propose a meeting to another attendee registered for the
  same event, choosing one slot and writing a short topic.
- **FR-629**: The confirmation control MUST be **disabled** until both a slot and a non-whitespace
  topic are present. An empty topic MUST NOT produce an error after submission.
- **FR-630**: A proposal MUST record both participants, the event, the slot, the topic, and a status.
- **FR-631**: The invitee MUST be able to **accept** or **decline** a pending proposal.
- **FR-632**: Either party MUST be able to **cancel** a confirmed appointment.
- **FR-633**: Declining or cancelling MUST return the slot to availability for whoever it was
  unavailable to — the proposer in the case of a declined proposal, and both parties in the case of
  a cancelled confirmed appointment.
- **FR-633a**: Because a received proposal does not reserve anything (FR-625), acceptance MUST be
  refused when the slot now conflicts with a saved session or confirmed appointment the **invitee**
  holds. The refusal MUST tell the invitee they already have a commitment then. This discloses
  nothing: it describes the reader's own schedule to the reader.
- **FR-634**: A proposal whose slot has passed MUST be shown as lapsed and MUST NOT be acceptable.
  Lapsed MUST be **derived** from the slot instant at read time, never stored — a stored value would
  require a scheduled sweep to maintain, and this feature introduces no background job.
- **FR-635**: Only the invitee may accept or decline; a proposer attempting it MUST be refused.
- **FR-636**: A request for a proposal or appointment by an attendee who is neither participant MUST
  be refused indistinguishably from one that does not exist.
- **FR-637**: Proposing MUST be refused, without a reason, when either party has blocked the other.
- **FR-637a**: A block placed **after** a proposal or appointment already exists MUST cancel it —
  any pending proposal and any future confirmed appointment between the two, in either direction —
  and MUST free the affected slots. The records MUST be marked cancelled rather than deleted,
  following 007, where blocking destroys nothing and is reversible. Lifting a block MUST NOT
  resurrect them: a cancelled appointment stays cancelled, and a new one may be proposed.
- **FR-638**: Proposing MUST be subject to a per-action throttle, bounding how many pending
  proposals one attendee may direct at another.
- **FR-638a**: The throttles in FR-609 and FR-638 **may deny**, not merely delay. This is the
  opposite of the reset-request rule, and deliberately so: there, an identifier-keyed denial only
  harms the victim, whereas here the throttled action is the actor's own and denying it protects
  the person being shared with or proposed to.
- **FR-639**: Appointments MUST be scoped to their event and MUST NOT appear when a different event
  is active.
- **FR-639a**: A contact who is not registered for the **active** event MUST NOT offer a scheduling
  action at all. Appointments are per-event, so the action would have nowhere to go; its absence is
  the visible consequence of FR-628 and must not be left to a refusal after the fact.

#### Authorization and privacy

- **FR-640**: Every read and write in this feature MUST be authorized server-side against the
  requesting identity. Client-side filtering MUST NOT be relied upon.
- **FR-641**: Because a shared card names no conference, the existing event-scope route audit
  **silently passes** its routes. This feature MUST therefore introduce an authorization predicate
  that covers card routes, and an audit that fails a card route lacking it.
- **FR-642**: A refusal MUST NOT disclose the existence of a relationship. Not holding a card, and
  the card not existing, MUST be indistinguishable.
- **FR-643**: This feature MUST NOT dispatch a notification for any event — proposal, acceptance,
  decline, cancellation, or card share — and MUST NOT modify the audit that enforces the single
  permitted trigger.

#### Addressability

- **FR-643a**: Network MUST be individually addressable as a destination, and any surface opened
  over it — the contacts and appointments views, and the scheduling dialog — MUST register its own
  nested address through the append-only navigation registry, on Network's own entry. The router
  MUST NOT name any of these addresses literally, and no neighbouring destination's entry may be
  edited. This inherits the rule 005 established and 006 and 007 each followed.

#### Home

- **FR-644**: This feature MUST contribute its **own** Home card for the appointment summary,
  registered through the append-only registry. It MUST NOT edit another feature's card.
- **FR-645**: The card MUST surface proposals awaiting the reader's answer, since no notification
  announces one, and MUST offer a route to answer them.
- **FR-646**: The card MUST own its loading, empty, and failure states, and its failure MUST NOT
  blank Home or affect any other card.

#### Offline and client behaviour

- **FR-647**: Appointments for the active event MUST be readable offline from the existing cache,
  with the retrieval time stated on the surface, expiring on the established lifetime.
- **FR-648**: Contacts MUST NOT be cached, and the refusal MUST be **declared** at the composition
  root rather than achieved by omission — resolving a held card reads another person's live profile
  data, which is the argument that made the directory uncached.
- **FR-649**: Every write in this feature MUST be **refused** when offline, never queued. No write
  queue, no optimistic update, no conflict merging.
- **FR-650**: All data access MUST go through repository interfaces in domain terms; no component
  may call the network or know transport details.

#### Deletion, export and retention

- **FR-651**: Deleting an account MUST remove every card it shared and every card it holds, in both
  directions, leaving no nameless entry in anybody's Network.
- **FR-652**: Deleting an account MUST remove every proposal and appointment it is party to, for
  both participants.
- **FR-653**: An attendee's export MUST include cards they have shared, cards they hold, and every
  proposal and appointment in both roles, with slot, topic, status, and event.
- **FR-654**: The seeded slot grid is conference content, not attendee data. Its exclusion from
  deletion and export coverage MUST be recorded with the reason rather than left implicit.

#### Layout, accessibility and states

- **FR-655**: The scheduling surface MUST be a modal dialog that traps focus, renders the background
  inert, closes on Escape, and restores focus to the control that opened it **after** closing.
- **FR-656**: Destructive answers — decline and cancel — MUST reuse the shared confirmation dialog
  rather than opening a second modal over the scheduling one.
- **FR-657**: Every surface crossing the network MUST have declared loading, empty, and failure
  states, distinguishing a connectivity failure from a server fault.
- **FR-658**: Every interactive control MUST have an accessible label, a visible focus state, and
  keyboard operability.
- **FR-659**: No content or primary action in this feature may require horizontal scrolling at any
  supported width. Switching between contacts and appointments is a primary action.

### Key Entities

- **Shared card** — the record that an exchange happened: who shared, who received, when, and at
  which event. **Cross-event.** It stores no copy of the sharer; details resolve live. The event is
  a historical fact about where the two met, not a scoping predicate.
- **Contact** — not a stored entity. A contact is the resolved view of a held shared card, which is
  what makes register entries 7 and 8 one decision rather than two.
- **Meeting slot** — a bookable interval belonging to an event day, in the venue's timezone. Seeded
  conference content.
- **Appointment** — a proposed or confirmed meeting: both participants, the event, the slot, a short
  topic, and a **stored** status of pending, confirmed, declined, or cancelled. **Per-event.**
  *Lapsed is not among them*: it is derived from the slot instant at read time (FR-634), so no
  scheduled job is needed to maintain it.
*There is deliberately no "contact line" entity.* It was specified, then withdrawn on 2026-08-10 as
a breach of standing decision 16. A card carries the directory profile and nothing more.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-601**: An attendee can go from finding somebody in Discover to holding a durable record of
  them in **under 30 seconds** and no more than three deliberate actions.
- **SC-602**: A contact remains visible and current **100% of the time** after the reader switches
  events, after the conference ends, and after the contact turns discoverability off.
- **SC-603**: A contact's details reflect an edit the contact makes on their next viewing, with no
  action by the holder.
- **SC-604**: An attendee can propose a meeting in **under 60 seconds** from a contact or profile,
  and cannot submit an incomplete one at all — the confirmation is unavailable rather than
  rejecting.
- **SC-605**: The slots offered to a reader reveal nothing about the invitee: for a fixed reader,
  the offered set is identical regardless of what the invitee has saved or booked. Verifiable by
  comparison.
- **SC-606**: An invitee learns of a pending proposal on their next visit to Home, without any
  notification being dispatched.
- **SC-607**: A failure in the appointment summary leaves every other Home card rendered and
  interactive.
- **SC-608**: Blocking stops card resolution and scheduling in both directions **immediately**, on
  the next request rather than on a cache expiry, and leaves **no** pending proposal or future
  confirmed appointment standing between the two parties.
- **SC-608a**: No attendee's slot availability can be reduced by another attendee's action. For a
  fixed reader, the set of slots offered is a function of the reader's own commitments alone —
  verifiable by proposing repeatedly into a reader's day and observing their offered set unchanged.
- **SC-609**: After an account is deleted, **no** trace of its cards or appointments is reachable by
  the other party.
- **SC-610**: An export contains every field this feature collects, with completeness established
  from the data model itself rather than from a hand-maintained list — so a field added later and
  left uncovered fails rather than passing silently.
- **SC-611**: The complete journey — inspect the next session, discover an attendee, share a card,
  schedule a meeting — is completable end to end at desktop, tablet, and mobile widths, by keyboard
  alone, with every focus position visible.
- **SC-612**: No surface in this feature requires horizontal scrolling at any supported width.
- **SC-613**: A route added in this feature without its authorization guard **fails the build**
  rather than shipping — including card routes, which the existing event-scope check passes
  silently and which therefore need coverage of their own.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Appointments for the active event are cached**, stamped with retrieval time, expiring on the established 24-hour lifetime — they are the attendee's own commitments, per-event, so the existing `(attendeeId, eventId, resource)` key fits them exactly as it fits saved sessions. **Contacts are not cached, declared per member at the composition root**: resolving a held card reads another person's live profile data, which is the argument that made Discover uncached. **Every write is refused offline, never queued.** This answers the cache-key question 007 deferred to this feature — by refusal, so no event-less key variant is needed. |
| **Desktop layout** (Principle IV) | Persistent left rail, contextual top bar. Network is a two-pane workspace: contacts and appointments side by side rather than behind a tab switch, with the scheduling dialog centred over it. The Home summary card sits in the multi-column dashboard. |
| **Tablet layout** (Principle IV) | Reduced rail, two-column contact cards, appointments stacked beneath rather than beside. The scheduling dialog remains centred and does not become full-bleed. |
| **Mobile layout** (Principle IV) | Compact header, bottom navigation, single-column contact cards, the scheduling dialog full-width from the bottom edge, touch-sized slot targets. Contacts and appointments are a segmented control, not a horizontally scrolling strip (FR-659). |
| **Empty / loading / failure states** (Principle IV) | Contacts list: empty invites the reader to Discover; loading and failure distinguish connectivity from server fault. Appointments list: same three. Scheduling dialog: no-slots explanation plus close action (FR-627); a failed proposal states so without closing the dialog. Home summary card: its own three, failing alone (FR-646). |
| **Accessibility** (Principle IV) | Scheduling and confirmation are native modal dialogs — focus trap, inert background and Escape from the platform, focus restored to the opener explicitly after closing (FR-655). Slot selection is a keyboard-operable group with visible focus. Every control has an accessible label; the share control names whose card moves (FR-603). The prototype's missing Escape and focus states are corrected, not reproduced. |
| **Validation checklist discharged** (Principle VII) | Discharges **digital-card sharing feedback** and **meeting scheduling and appointment creation** — the last two behavioural items outstanding. Also contributes to keyboard focus visibility and accessible labels. Leaves to 009: session Q&A. Leaves to 010: the full end-to-end sweep and brand assets. |
| **Identity scoping & server-side authorization** (Principle VIII) | Every read and write is bound to the requesting identity server-side (FR-640). **Appointments** compose event scope with a participant check. **Cards cannot use event scope at all** — they are cross-event, so a card route names no conference and the existing audit silently passes it; this feature introduces a predicate covering card routes and an audit that fails a route lacking it (FR-641). Refusals never disclose that a relationship exists (FR-642). |
| **Deletion & export coverage** (Principle VIII) | **Shared cards**: cascade from `attendees` on both the sharer and recipient references, so deleting either party removes the record in both directions (FR-651) — no nameless survivor, unlike 007's conversations, because a card with no subject has nothing to preserve. **Appointments**: cascade from `attendees` on both participant references (FR-652). **Slot grid**: conference content, not attendee data — allow-listed with the reason written down (FR-654). Export covers cards shared, cards held, and appointments in both roles (FR-653). No retention clock is needed: every new record is reachable by a cascade. **No column is added to the attendee record** — the contact line was withdrawn (FR-619–FR-622), so this feature's coverage obligation is two new tables and nothing else. |
| **Event scoping** (Constraints — data scoping) | **Shared cards — cross-event.** Standing decision 7 names exchanged cards among the relationships that persist, and the durability is the feature's purpose. The event reference is a historical fact about where the exchange happened, explicitly **not** a scoping predicate. **Appointments — per-event.** Decision 7 names appointments among per-event content: an appointment is a time and a place at a specific conference (FR-639). **Meeting slots — per-event.** They belong to an event day and are seeded with it. |
| **Register position** (Governance) | **Resolves entry 7** (the connection model behind Network contacts) and **entry 8** (what a card exchange records and whether it is mutual), both by brainstorm #07. **Blocked by neither.** The one question this feature raised — whether a card-only contact line breaches standing decision 16 — was **answered on 2026-08-10: it does**, and the field is withdrawn (FR-619–FR-622). This feature therefore raises **no** open register entry. **Its resolutions land by constitution amendment**, ruled by the owner on 2026-08-10, so the amendment must be ratified before implementation begins. Unaffected by entries 20 and 21. |
| **Reserved migration number** (Branching — parallel work) | **`0007`**, from the delivery roadmap. Anyone regenerating the Drizzle snapshot must move `apps/api/migrations/meta/README.md` aside first — `drizzle-kit generate` JSON-parses every file in `meta/` — and must not "correct" the journal's deliberate `0003`/`0004` ordering. |

## Assumptions

- **Slot grid shape**: seeded slots are assumed to be uniform-length intervals across each event day,
  a handful per day, identical in shape for every event. Length and count are a seed-data decision
  recorded in Open Question 3 rather than a requirement here.
- **Proposal lapse**: a proposal whose slot has passed is assumed to become non-acceptable and to be
  displayed as lapsed rather than deleted, so both parties can see what happened (FR-634).
- **Block semantics**: blocking **suspends** card resolution rather than deleting the card, so
  lifting a block restores the contact — following 007, where a block is reversible and destroys
  nothing. Appointments are treated differently and deliberately: a block **cancels** any pending
  proposal and any future confirmed appointment (FR-637a), because a meeting you would otherwise
  turn up to must be ended rather than hidden, and cancellation is a visible state rather than a
  deletion. Lifting the block does not resurrect them.
- **No co-attendance requirement for resolution**: a held card resolves even when the two attendees
  no longer share any event. This is the feature's purpose, not an oversight.
- **Contacts list size**: a held-card list is bounded by deliberate human acts, so it is assumed not
  to need the keyset pagination the thousand-attendee directory required. Stated so that the
  assumption is visible if it turns out wrong.
- **Existing infrastructure is reused**: 004's profiles and account deletion, 006's profile view and
  its indistinguishable-refusal shape, 007's block and its per-action throttle, 005's saved sessions
  for conflict detection and its modal dialog pattern, and 002's venue-timezone rule.
- **Scheduling does not require holding a card**. A meeting can be proposed from a profile in
  Discover as well as from a contact, keeping the core journey intact.

## Open Questions

**~~1. Does the card-only contact line breach standing decision 16?~~ ANSWERED 2026-08-10 — yes, it
does.** The field is withdrawn and FR-619 through FR-622 are rewritten accordingly: a card carries
exactly the directory profile, this feature introduces no new personal-data field, and there is one
visibility decision per attendee. Retained here rather than deleted, because the *reasoning* is the
governing one for any later feature tempted to give a field its own audience — a card is durability,
not disclosure.

**2. Does card resolution need its own branded scope and a fourth route audit, or can something
existing be extended?** The hole is certain — `event-scope-audit` silently passes a route naming no
conference, which is exactly what 007 found — and FR-641 requires it closed. What is open is the
shape: a third branded scope alongside `EventScope` and `ConversationScope`, or a generalisation of
the participation guard 007 built. A planning decision, not a client one.

**3. What the slot grid is as seed data** — interval length, how many per day, and whether it varies
by event. Conference content under standing decision 8, so seeded and versioned rather than
configured.

**4. What happens to an appointment when a participant withdraws from the conference** — not
deletion, since the account still exists, and the appointment is per-event while the two people
remain contacts.

**5. Copy for a contact whose card resolves to nothing** because the sharer deleted their account.
The state is decided by cascade (the entry disappears); what, if anything, the holder is told is
not. 007 left the analogous departed-counterpart copy open too.

**6. Whether 008 splits into reviewable phases.** It carries two subsystems sharing only a
destination. Worth deciding after planning against the concrete task list, as 007 did.

**~~7. Whether closing register entries 7 and 8 needs a constitution amendment.~~ ANSWERED
2026-08-10 — yes, by amendment.** Following #06's precedent rather than #04's. **This is a
precondition on implementation, not on planning**: the amendment must resolve entries 7 and 8, carry
the withdrawal in Open Question 1 above, and be ratified before the first line of 008 is written.
Entry 9 (audience-question attribution, answered *attributed* on the same day) belongs in the same
amendment, since it unblocks 009 — this feature's parallel partner.
