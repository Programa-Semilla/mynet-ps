# Feature Specification: Messages, and the Notification Delivery Platform It Needs

**Feature Branch**: `feat/007-messages-and-notification-delivery`

**Created**: 2026-08-07

**Status**: Draft

**Input**: Brainstorm #06 (`brainstorm/06-messages.md`), eight owner decisions M1–M8. Delivery
roadmap phase 007 (`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md:322`).
Reserved migration `0006`.

## Context and Scope Note

007 delivers the fourth of the five destinations. An attendee who has found someone worth meeting in
Discover can now reach them, hold a conversation that outlives the conference, and — for the first
time in this product — be told about it when the app is closed.

The roadmap scopes this phase in six lines: conversations, participants and messages; thread view,
compose and send; the empty-thread prompt; unread tracking feeding Home's indicator; and wiring
Discover's *message* action. **As specified here it also carries the whole Web Push notification
platform, plus block and report.** Both enlargements are owner decisions taken in brainstorm #06,
and both are declared below rather than absorbed silently.

### The property this feature cannot inherit

Every prior phase read or wrote data belonging to **one** attendee. Saved sessions, notes, the
active event, a profile — each is reached by exactly one identity, and the event-scope guard plus
the session-bound identity are between them sufficient.

A message has **two** owners and they are not interchangeable. The sender authored it; the recipient
received it; either may later erase themselves; neither may read a third person's copy. The roadmap
calls this "the highest-risk authorization surface in the product," and the reason is precisely that
the existing guards do not compose to cover it. A conversation is not per-event, so
`requireEventAccess` does not apply to it. Participation is the scoping predicate, and 007
introduces it.

### Departure from the constitution — engagement notification delivery

**Open Questions Register entry 10 currently reads:** *"Notifications. The prototype header shows a
notification bell; notifications are out of product scope until a recorded decision brings them in.
The bell MUST NOT be reproduced before then."*

**M4 is that recorded decision, and at the time of writing it has not been ratified by a constitution
amendment.** This specification is therefore knowingly ahead of the constitution on one point, and
says so rather than omitting it.

What the decision brings in, and what it does not:

- **In**: Web Push delivery of new-message notifications to a device, including when the application
  is closed. `NotificationService` — a platform interface that has existed since 001 as a deliberate
  no-op — is wired to real delivery for the first time.
- **Still out, unchanged**: the notification bell and any in-app notification centre. Push delivery
  and a notification inbox are separable concerns, and nothing in M4 implies the second. Entry 10's
  prohibition on reproducing the bell survives this feature intact.
- **Still out, unchanged**: calendar integration, and notifications for anything other than a new
  message. 008's appointments and 009's Q&A may adopt the platform later; 007 does not deliver
  notifications for them.

**Why the departure was accepted rather than deferred.** Polling was specified and recommended; the
owner rejected it in favour of push, on the judgement that a networking product whose whole value is
a timely reply is not served by a message an attendee discovers an hour later. The platform was then
recommended as a separate follow-on feature and the owner chose to fold it into 007 as one feature
and one PR.

**The consequence is recorded, not hidden.** This feature must not merge before the constitution
carries a numbered standing decision bringing engagement notification delivery in, with the version
bump it warrants. Ratifying it is an owner action listed under Open Questions.

### Departure from the delivery roadmap — block and report

The roadmap does not scope any safety mechanism into 007. This specification adds two, and they are
not enhancements.

M1 permits any attendee sharing a current event to open a conversation with any other, with no
consent step. M2 makes that conversation permanent and independent of any later event. Together they
create a contact path that the recipient cannot close, in a product with **public self sign-up and
no administrative actor by construction**. 007 is the feature that creates the exposure, so 007 is
where it is answered.

**Report resolves to an operator, not to an organizer**, and the distinction is what keeps it inside
Principle III. What the constitution forecloses is organizer administration *inside the product*: no
admin interface, no privileged role, no content import path. It does not forbid the project's
operator — standing decisions 17 and 18 already put that operator in charge of two hosts, backups,
secrets and an exercised restore. A report leaves the product by mail and is acted on out-of-band.
**No screen, role, or route in this product may read a report.**

### Departure from the approved prototype

The prototype's conversation switcher is a horizontally-scrolling strip of avatars
(`GroundZero/prototype/src/app/App.tsx:971`). Switching conversation is a primary action, and
Principle IV forbids a primary action requiring horizontal scrolling. This is a prototype defect in
the same category as its missing Escape handling and focus states — corrected here, not raised as a
question.

The prototype's unread rule — "the last message is not mine" (`App.tsx:977`) — is also not carried
forward. It cannot represent an unread message in a thread you last spoke in, and it silently marks a
thread read the moment you reply.

### What this feature does not do

Group conversations · attachments or images in messages · editing or deleting an individual message
· message search · presence, online status, typing indicators, delivery ticks or read receipts · an
in-app notification centre or bell · notifications for anything but a new message · deriving
Network contacts from the existence of a conversation, which **M1 makes unsafe and which 008 is
bound not to do**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach someone you just found (Priority: P1)

An attendee browsing Discover finds a person worth meeting and opens their profile. They choose
*Message*, land in an empty thread with that person, type a first line, and send it. The conversation
now exists.

**Why this priority**: This is the third step of the core journey named in `requirements.md` —
inspect the next session, discover a relevant attendee, **share a card or message them**, schedule a
meeting. Discover shipped in 006 with its *message* action deliberately absent rather than inert;
this story is what fills that gap. Without it the journey has a hole in the middle.

**Independent Test**: Sign in as an attendee, open a co-attendee's profile in Discover, choose
*Message*, send one line, and confirm it appears in the thread and in the recipient's conversation
list. Delivers the entire outbound half of Messages on its own.

**Acceptance Scenarios**:

1. **Given** two attendees registered for the same event, **When** one opens the other's profile and
   chooses *Message*, **Then** a thread with that person opens, showing the conversation-starter
   prompt rather than an error or a blank panel.
2. **Given** an open empty thread, **When** the attendee has typed nothing or only whitespace,
   **Then** the send control is disabled — never enabled-then-rejected.
3. **Given** an open empty thread, **When** the attendee sends a first message, **Then** the
   conversation is created, the message appears in the thread, and the composer clears.
4. **Given** a conversation already exists with that person, **When** the attendee chooses *Message*
   from their profile again, **Then** the existing thread opens with its history — a second
   conversation is never created.
5. **Given** an attendee and a person who share no current event, **When** conversation creation is
   attempted, **Then** the server refuses it, regardless of what the client offered.

---

### User Story 2 - Hold a conversation (Priority: P1)

An attendee opens Messages, sees who they have been talking to, opens a thread, reads what arrived,
and replies. Coming back later, the conversation is still there — including at a different conference
next year.

**Why this priority**: A send path with no read path is not a messaging feature. This story is what
makes the destination real, and it carries the persistence guarantee that standing decision 7 makes
about relationships.

**Independent Test**: With two accounts, send messages in both directions and confirm each sees the
other's, in order, in a thread reachable from the conversation list. Switch the active event and
confirm the conversation list is unchanged.

**Acceptance Scenarios**:

1. **Given** an attendee with several conversations, **When** they open Messages, **Then** each
   conversation appears with the other person's name, avatar and most recent message, ordered by
   most recent activity first.
2. **Given** a conversation list longer than the viewport, **When** the attendee moves between
   conversations, **Then** no horizontal scrolling is required at any supported width.
3. **Given** an open thread, **When** messages are displayed, **Then** they appear oldest to newest
   with the attendee's own messages visually distinguished from the other person's, each carrying a
   time.
4. **Given** the attendee switches the active event, **When** Messages is opened, **Then** the
   conversation list and every thread are identical to before the switch.
5. **Given** a conversation with someone not registered for the attendee's current event, **When**
   the attendee opens it, **Then** they can read the history and send a new message.
6. **Given** an attendee who is not a participant, **When** they attempt to read a conversation or
   its messages by any means, **Then** the server refuses — the refusal is not a client-side filter.

---

### User Story 3 - Stop unwanted contact (Priority: P1)

An attendee receiving messages they do not want blocks the sender, who can no longer reach them. If
the messages were abusive, the attendee reports them; reporting also blocks, and the report reaches
the operator.

**Why this priority**: **P1 because US1 creates the exposure.** Open send plus permanent
reachability means an attendee met once at one conference can message someone indefinitely, in a
product with public self sign-up and no moderator. Shipping the contact path without the means to
close it would leave a known harassment route open from the first day the product is reachable.

**Independent Test**: With two accounts, block from one and confirm the other's send is refused by
the server; report from one and confirm the block takes effect, a report record exists, and operator
mail is dispatched.

**Acceptance Scenarios**:

1. **Given** an attendee viewing a profile or a thread, **When** they choose *Block*, **Then** they
   are asked to confirm, and on confirmation the block takes effect immediately.
2. **Given** a block is in effect, **When** the blocked person attempts to send into the
   conversation, **Then** the server refuses it and no message is stored.
3. **Given** a block is in effect, **When** the blocked person attempts to start a new conversation
   with the blocker, **Then** the server refuses it.
4. **Given** a block is in effect, **When** the blocker opens the conversation, **Then** the history
   remains readable and the composer is unavailable, with an explanation and a way to unblock.
5. **Given** an attendee choosing *Report*, **When** they submit a reason, **Then** the reported
   person is blocked in the same action, a report record is stored identifying the reported
   messages, and mail is dispatched to the operator address.
6. **Given** the report reason is empty, **When** the attendee attempts to submit, **Then** the
   confirmation control is disabled rather than the submission being rejected afterwards.
7. **Given** any attendee of this product, **When** they look for a way to read reports, **Then**
   none exists — no screen, no role, no route.

---

### User Story 4 - Know something is waiting (Priority: P2)

An attendee opening the app sees on Home that they have unread messages, and in Messages which
conversations they are. Opening a thread clears its unread state; replying does not by itself change
what is unread elsewhere.

**Why this priority**: `requirements.md` names the unread-message indicator as one of Home's seven
elements, and the roadmap assigns it to this phase. It is not on the critical send/read path, so it
follows US1–US3.

**Independent Test**: Receive a message as one account, confirm Home's indicator and the
conversation's unread marker both appear, open the thread, and confirm both clear.

**Acceptance Scenarios**:

1. **Given** an attendee with at least one message received after their last read of that
   conversation, **When** they open Home, **Then** an unread indicator is shown.
2. **Given** an attendee with no unread messages, **When** they open Home, **Then** the indicator is
   absent — not shown at zero.
3. **Given** an unread conversation, **When** the attendee opens it, **Then** its unread state
   clears and Home's indicator updates accordingly on next display.
4. **Given** an attendee who replies in a thread with older unread messages above their reply,
   **When** the thread is opened, **Then** unread state reflects what has actually been read, not
   who spoke last.
5. **Given** the unread indicator's data cannot be retrieved, **When** Home renders, **Then** the
   card shows its own failure state and every other Home card renders normally.
6. **Given** an attendee has read a conversation, **When** the other person checks the thread,
   **Then** nothing indicates it was read — no receipt, no tick, no timestamp.

---

### User Story 5 - Be reached when the app is closed (Priority: P2)

An attendee grants permission to receive notifications. When a message arrives while the application
is closed or in the background, a notification appears on their device carrying the sender and the
message. Opening it takes them to that conversation.

**Why this priority**: The reason the owner rejected polling — a reply that arrives while the
attendee is in a session is worthless if discovered an hour later. It follows US1–US3 because
Messages must be complete and correct without it: permission is deniable, and an attendee who
declines gets a fully working product.

**Independent Test**: Grant permission on one account, close the application, send a message from
the other, and confirm a notification arrives and opens the correct conversation. Repeat with
permission denied and confirm Messages works throughout.

**Acceptance Scenarios**:

1. **Given** an attendee who has not been asked, **When** they first open Messages, **Then** they
   are told what notifications are for before any permission prompt is raised — never a cold prompt
   on first load of the application.
2. **Given** permission is granted, **When** a message arrives while the application is closed,
   **Then** a notification appears identifying the sender and carrying the message content.
3. **Given** a notification is shown, **When** the attendee activates it, **Then** the application
   opens directly on that conversation.
4. **Given** permission is denied or unavailable, **When** the attendee uses Messages, **Then**
   every capability except notifications behaves identically, and an open thread still shows new
   messages without manual reload.
5. **Given** an attendee signs in on a second device, **When** they grant permission there, **Then**
   both devices receive notifications, and revoking on one does not affect the other.
6. **Given** a device's subscription is no longer valid, **When** delivery to it fails permanently,
   **Then** the subscription is discarded and no further attempts are made to it.
7. **Given** an attendee has blocked someone, **When** that person's earlier messages exist, **Then**
   no notification is ever raised for a blocked sender.

---

### User Story 6 - A conversation outlives the other person (Priority: P3)

An attendee's correspondent deletes their MyNet account. The attendee opens the conversation and
finds their own messages still there, the other person's gone, and the thread explained and closed
to new messages.

**Why this priority**: It has no daily frequency, but it is the case that decides whether deletion is
honest. It is P3 only because it cannot be exercised until deletion and messaging both exist.

**Independent Test**: With two accounts holding a conversation, delete one via the self-serve
deletion path, then confirm as the survivor that their own messages remain, none of the other
person's do, and no name, avatar or identifying trace of them is rendered.

**Acceptance Scenarios**:

1. **Given** a conversation between two attendees, **When** one deletes their account, **Then**
   every message they authored is removed and their participation is removed.
2. **Given** the same conversation, **When** the surviving attendee opens it, **Then** their own
   messages are all still present and readable.
3. **Given** the same conversation, **When** it is rendered anywhere, **Then** the departed person's
   name, avatar and profile details are absent — nothing is retained to display.
4. **Given** the same conversation, **When** the surviving attendee attempts to send, **Then** the
   composer is unavailable with an explanation, and the server refuses a send with no counterpart.
5. **Given** an attendee deletes their account, **When** the deletion completes, **Then** their
   messages are gone from every conversation they participated in, not only from their own view.

---

### Edge Cases

- **Both participants delete their accounts.** The conversation has no participants left and no
  messages; it is removed rather than retained as an empty shell.
- **An attendee attempts to message themselves.** Refused — a conversation has two distinct
  participants.
- **Two conversations between the same pair.** Impossible by construction: a pair has at most one
  conversation, enforced by the store rather than by a check the client performs.
- **A message is sent while the recipient is blocking the sender.** Refused server-side; the sender
  is not told a block exists, only that the message could not be sent, since disclosing the block is
  itself information about the recipient.
- **An attendee blocks someone who has blocked them.** Both blocks stand independently; unblocking
  one does not affect the other.
- **A blocked attendee is unblocked.** New messages become possible again; the history was never
  removed.
- **A reported attendee deletes their account before the operator acts.** Their messages cascade
  away, so the report may reference messages that no longer exist. The report's disposition in this
  case is an open question below.
- **The departed counterpart authored every message in the conversation.** The survivor is left with
  a conversation containing none of their own messages. It shows the closed-thread explanation, not
  the conversation-starter prompt (FR-519a) — the survivor must not be invited to start something
  they are forbidden to send into.
- **A thread is opened but nothing is sent.** No conversation is created, nothing is stored, and the
  other person has no way to learn it happened (FR-503a).
- **A message arrives for a conversation while its thread is open.** It appears without the attendee
  reloading, and does not count as unread once displayed.
- **Simultaneous first messages between the same pair.** One conversation results, not two; the
  second send joins the first conversation.
- **Notification permission granted, then revoked at the operating-system level.** Delivery fails
  permanently and the subscription is discarded; the attendee is not repeatedly re-prompted.
- **The device is offline when a message is composed.** The send fails with a clear explanation and
  the text is not queued — it is not sent later.
- **Messages is opened offline.** The destination shows the standard offline state; no conversation
  or message is served from a cache, because none is retained.
- **A message consisting only of whitespace.** The send control is disabled; whitespace-only content
  is never stored.
- **An extremely long message.** Rejected against a stated maximum, with the limit visible before
  the attendee reaches it rather than on submission.

## Requirements *(mandatory)*

### Functional Requirements

#### Conversations

- **FR-501**: A conversation MUST have exactly two distinct participants. Group conversations are
  out of scope.
- **FR-502**: At most one conversation MUST exist for any pair of attendees, enforced by the data
  store rather than by a client-side or application-level check alone.
- **FR-503**: A conversation MUST be created by the sending of its first message. There MUST be no
  request, acceptance, invitation, or any other consent step (M1).
- **FR-503a**: Choosing *Message* for a person with no existing conversation MUST open a composable
  thread **without creating anything**. No conversation, participation, or other record MUST come
  into being until the first message is actually sent. An attendee who opens a thread and leaves
  without sending MUST leave no trace, and the other person MUST NOT be able to tell it happened.
  This is the state FR-519 describes; a conversation that exists always has at least one message,
  except as FR-519a provides.
- **FR-504**: Creating a conversation MUST require that both attendees are registered for at least
  one event in common at the moment of creation.
- **FR-504a**: Conversation creation MUST be throttled per acting attendee, bounding how many
  distinct people one account may open a conversation with in a period. Open send (M1) means a
  single account holding a join code can otherwise reach every attendee at a conference, and block
  is per-person and after the fact, so it does not bound this.
- **FR-504b**: Messaging MUST NOT be gated on the recipient's discoverability setting. **This is a
  deliberate divergence from 006's visibility rule and is declared rather than omitted**: reading a
  profile requires co-attending, verified and discoverable, while messaging requires co-attendance
  alone. The alternative was specified and rejected by owner decision, on the ground that
  discoverability governs whether a person is *listed*, and silently closing existing and
  reachable-by-other-means conversations is not what that setting means. The consequence is
  accepted: an attendee who has turned discoverability off can still be messaged by anyone holding
  a route to them.
- **FR-505**: The co-attendance condition in FR-504 MUST NOT be re-evaluated after the conversation
  exists. A conversation, once created, is permanent (M2).
- **FR-506**: An attendee MUST NOT be able to open a conversation with themselves.
- **FR-507**: Conversations MUST NOT be scoped to an event. Switching the active event MUST NOT
  change which conversations are listed, their order, or their contents (M2, standing decision 7).
- **FR-508**: The conversation list MUST be ordered by most recent message first.
- **FR-509**: Each conversation in the list MUST show the other participant's display name, avatar,
  and a preview of the most recent message.
- **FR-510**: Opening a profile's *Message* action for a person with an existing conversation MUST
  open that conversation, never create a second.

#### Messages

- **FR-511**: An attendee MUST be able to send a text message into a conversation they participate
  in.
- **FR-511a**: Message sending MUST be throttled per acting attendee. The throttle MUST be
  configured so that it may delay a legitimate sender but never denies them outright, following the
  pattern established for reset-request in 004.
- **FR-512**: The send control MUST be disabled when the composer is empty or contains only
  whitespace. An empty message MUST NOT be submittable and then rejected (`requirements.md` required
  error states).
- **FR-513**: Message content MUST be plain text. Attachments, images and rich formatting are out of
  scope.
- **FR-514**: A message MUST record its author, its conversation, and the time it was sent.
- **FR-515**: Messages MUST be displayed oldest first, with the attendee's own messages visually
  distinguished from the other participant's.
- **FR-516**: A message, once sent, MUST NOT be editable or deletable individually. Deletion happens
  only through account deletion (FR-570).
- **FR-517**: A maximum message length MUST be enforced, and the attendee MUST be able to see they
  are approaching it before submission rather than discovering it on rejection.
- **FR-518**: Message history MUST be retrievable in pages, so that a long conversation does not
  require transferring its entire history to display its most recent messages.
- **FR-519**: A thread with no messages that is **open to sending** MUST show the
  conversation-starter prompt rather than a blank panel (`requirements.md` required empty states).
  In practice this is the not-yet-created thread of FR-503a.
- **FR-519a**: A thread with no messages that is **closed to sending** MUST show the closed-thread
  explanation of FR-574, NOT the conversation-starter prompt. This arises when the departed
  counterpart authored every message in the conversation, leaving the survivor with none of their
  own. Inviting someone to start a conversation they are forbidden to send into is the one outcome
  this state must not produce.

#### Authorization and privacy

- **FR-520**: Every read of a conversation or its messages MUST be authorized server-side by the
  reader's participation in that conversation. Client-side filtering MUST NOT be any part of the
  enforcement (Principle VIII).
- **FR-521**: Every write into a conversation MUST be authorized server-side by the writer's
  participation in it.
- **FR-522**: An integration test against a real database MUST prove that a non-participant is
  refused both read and write, for conversations, messages, and unread state.
- **FR-523**: Participation MUST be the scoping predicate for conversations and messages. The
  per-event scope guard MUST NOT be applied to them, because they are not per-event (FR-507).
- **FR-524**: No response served to a participant MUST disclose anything about a conversation they
  do not participate in, including its existence.
- **FR-525**: An attendee's identity for every message operation MUST be bound from the sign-in
  session server-side. No message, conversation, or unread operation MUST accept an attendee
  identifier from the client (inherited from 001, non-negotiable).

#### Unread state

- **FR-526**: Each participant MUST have their own read position within each conversation,
  independent of the other participant's (M5).
- **FR-527**: A conversation MUST be considered unread for a participant when it contains at least
  one message sent after that participant's read position by the other participant.
- **FR-528**: Opening a conversation MUST advance the reader's read position to the most recent
  message displayed.
- **FR-529**: Sending a message MUST NOT by itself change what is unread for the sender beyond
  messages actually displayed to them.
- **FR-530**: A participant's read position MUST NOT be disclosed to the other participant in any
  form — no read receipts, no delivery indicators, no "last seen", no typing indicator (M5).
- **FR-531**: Home MUST show an unread-message indicator when the attendee has at least one unread
  conversation, and MUST show nothing when they have none.
- **FR-532**: The Home unread indicator MUST be contributed through the append-only Home card
  registry, adding its own file and one registration line, editing no existing card (standing
  decision 9).
- **FR-533**: The Home unread indicator MUST own its loading, empty and failure states. Its failure
  MUST NOT prevent any other Home card from rendering.

#### Block

- **FR-534**: An attendee MUST be able to block another attendee from a profile view and from within
  a conversation.
- **FR-535**: Blocking MUST require a confirmation step before taking effect.
- **FR-536**: While a block is in effect, the blocked attendee MUST be refused, server-side, both
  sending into an existing conversation with the blocker and creating a new one with them.
- **FR-537**: A refusal caused by a block MUST NOT disclose to the refused attendee that a block
  exists, since the existence of a block is information about the blocker.
- **FR-538**: Blocking MUST NOT delete any message. History remains readable to the blocker.
- **FR-539**: While a block is in effect, the blocker's composer for that conversation MUST be
  unavailable, with an explanation and an unblock action.
- **FR-540**: Blocks MUST be directional and independent. A block by A on B MUST NOT imply a block by
  B on A, and unblocking one MUST NOT affect the other.
- **FR-541**: An attendee MUST be able to see and reverse the blocks they have created.
- **FR-541a**: The list of blocks required by FR-541 MUST live on an existing account or profile
  surface rather than becoming a sixth destination, MUST be individually addressable, and MUST
  declare its own loading, empty ("you have not blocked anyone") and failure states like every other
  surface crossing the network (FR-581).
- **FR-542**: No notification MUST be raised for a message from an attendee the recipient has
  blocked.

#### Report

- **FR-543**: An attendee MUST be able to report another attendee from within a conversation.
- **FR-544**: Submitting a report MUST block the reported attendee in the same action (M8).
- **FR-545**: A report MUST record the reporting attendee, the reported attendee, a reason supplied
  by the reporter, the identifiers of the reported messages, and the time.
- **FR-546**: The report confirmation control MUST be disabled while the reason is empty, rather than
  the submission being rejected afterwards.
- **FR-547**: Submitting a report MUST dispatch mail to a configured operator address.
- **FR-548**: This product MUST NOT provide any interface, role, or route by which a report can be
  read from within the application. Reports leave by mail and are acted on out-of-band (Principle
  III).
- **FR-549**: Failure to dispatch operator mail MUST NOT cause the report or the block to fail. The
  attendee's protection MUST NOT depend on an external service succeeding.

#### Notification delivery

- **FR-550**: The product MUST deliver a notification to an attendee's device when they receive a
  message, including when the application is closed (M4).
- **FR-551**: Notification delivery MUST be requested only after the attendee has been told what
  notifications are for. A permission prompt MUST NOT be raised on first load of the application.
- **FR-552**: The product MUST remain fully functional when notification permission is denied,
  revoked, or unavailable. Every capability except notification delivery MUST behave identically
  (M7 fallback).
- **FR-553**: A notification MUST identify the sender and carry the message content (M7).
- **FR-554**: Activating a notification MUST open the application on the conversation it concerns.
- **FR-555**: Notification subscriptions MUST be per device. An attendee signed in on several
  devices MUST receive notifications on each that has granted permission.
- **FR-556**: Revoking permission on one device MUST NOT affect any other device.
- **FR-557**: A subscription that fails delivery permanently MUST be discarded, and no further
  delivery attempted to it.
- **FR-558**: Notification delivery MUST NOT be attempted for a message whose recipient has blocked
  its sender (FR-542). The block MUST be evaluated at the moment of dispatch, not at the moment the
  message was sent. A notification already handed to the delivery service before the block was
  applied MAY still arrive; a block MUST take effect for every dispatch decision made after it.
- **FR-559**: Notification delivery MUST go through the existing platform notification interface.
  Feature code MUST NOT call a push vendor or browser notification API directly (Principle V).
- **FR-560**: This feature MUST NOT introduce a notification bell, notification centre, notification
  history, or any in-app notification inbox (Register entry 10, unchanged by M4).
- **FR-561**: This feature MUST NOT deliver notifications for anything other than a received
  message.
- **FR-562**: An open conversation MUST show newly arrived messages without the attendee reloading,
  and MUST do so whether or not notification permission was granted (M7 second path).

#### Offline and client behaviour

- **FR-563**: Conversations and messages MUST NOT be cached for offline reading. This refusal is
  declared, not omitted (M6, and the precedent 006 established).
- **FR-564**: Opening Messages while offline MUST show the standard offline state, disclosing no
  conversation or message content.
- **FR-565**: A message composed while offline MUST fail with a clear explanation and MUST NOT be
  queued for later delivery. There is no write queue, no optimistic update, and no conflict
  resolution (inherited invariant).
- **FR-566**: Data access for conversations, messages, unread state, blocks, reports and
  notification subscriptions MUST go through repository interfaces in domain terms. No component
  MUST know transport details (Principle V).
- **FR-567**: The repository added by this feature MUST be registered through the existing
  append-only platform registry, adding one line and editing no neighbour.
- **FR-568**: Discover's *message* action MUST be wired by this feature, following the roadmap's
  rule that an action appears only once its owning phase has landed.
- **FR-569**: Messages MUST be individually addressable as a destination, and an open conversation
  MUST be addressable within it, registering its own nested address through the append-only
  navigation declaration.

#### Deletion, export and retention

- **FR-570**: Deleting an account MUST remove every message that account authored, from every
  conversation, not only from the deleting attendee's view (M3).
- **FR-571**: Deleting an account MUST remove that account's participation in every conversation.
- **FR-572**: A conversation whose other participant has deleted their account MUST retain the
  surviving participant's own messages and remain readable to them (M3).
- **FR-573**: A conversation with a departed counterpart MUST NOT render that person's name, avatar,
  or any other identifying attribute. Nothing is retained for display — there is no tombstone
  (standing decision 12).
- **FR-574**: A conversation with a departed counterpart MUST be closed to new messages, with an
  explanation, and the server MUST refuse a send into it.
- **FR-575**: A conversation with no remaining participants MUST be removed rather than retained.
- **FR-576**: Every table introduced by this feature MUST be classified by the deletion-coverage
  guard: reached by the cascade, swept by a stated retention rule, explicitly deleted with a named
  integration test as proof, or declared to hold no attendee data with a written reason. This
  covers conversations, participation, messages, blocks, reports and notification subscriptions,
  **and any further table the design introduces** — planning added a seventh to satisfy FR-502
  without retaining a departed attendee's identifier. The guard admits no unclassified table, so
  the obligation follows the schema rather than this list.
- **FR-577**: Message content, block records, and notification subscription records MUST appear in
  the attendee's machine-readable export. Every collected column MUST have export coverage.
- **FR-578**: The export MUST include the messages the attendee authored. It MUST NOT include
  messages authored by the other participant. **This exclusion is a declared position, not an
  omission, and the reasoning is recorded because standing decision 12 requires an export "covering
  every field collected" and a bare exclusion would read as an oversight.** A received message is
  primarily its author's personal data; exporting it would hand one attendee a durable, portable
  copy of another's words on request, which no participant consented to and which the deletion rule
  in FR-570 exists to prevent. The asymmetry is deliberate and matches M3: on deletion an attendee's
  messages leave every conversation, and on export they leave with only their own. **The export
  MUST state that received messages are excluded and why**, so that an attendee reading it knows
  the omission is a rule rather than a defect.
- **FR-579**: Report records MUST have a declared deletion and retention rule covering the case
  where either the reporting or the reported attendee deletes their account.

#### Layout, accessibility and states

- **FR-580**: The conversation switcher MUST NOT require horizontal scrolling at any supported
  width, correcting the prototype (Principle IV).
- **FR-581**: Every surface introduced by this feature that crosses the network MUST have a declared
  loading state, empty state, and failure state.
- **FR-582**: Every interactive control introduced MUST have an accessible label, a visible focus
  state, and full keyboard operability.
- **FR-583**: Any modal introduced by this feature MUST have a clear close action, MUST dismiss on
  Escape, and MUST restore focus to the control that opened it.
- **FR-584**: A thread MUST be operable by keyboard alone, including reaching the composer, sending,
  and moving between conversations.
- **FR-585**: New messages arriving in an open thread MUST be announced to assistive technology
  without moving the reader's focus.
- **FR-586**: No content or primary action in this feature MUST require horizontal scrolling at
  desktop, tablet, or mobile widths.

### Key Entities

- **Conversation**: A private exchange between exactly two attendees. Not scoped to an event;
  persists for as long as at least one participant remains. Carries no title, topic, or membership
  beyond its two participants.
- **Participation**: One attendee's presence in one conversation, carrying that attendee's own read
  position. Removed when the attendee deletes their account. The scoping predicate for every read
  and write.
- **Message**: One plain-text contribution by one participant to one conversation, with the time it
  was sent. Belongs to its author for deletion and export purposes, and to both participants for
  reading.
- **Block**: A directional refusal by one attendee against another, preventing the blocked attendee
  from sending to or opening a conversation with the blocker. Independent of any block in the
  reverse direction.
- **Report**: A record that one attendee reported another, with a reason and the messages concerned.
  Written by the product, read only outside it.
- **Notification subscription**: One device's registration to receive notifications for one
  attendee. Per device, discardable on permanent delivery failure, and never shared between
  attendees.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-501**: An attendee who has found someone in Discover can send them a first message without
  leaving the flow, in no more than three actions from the open profile.
- **SC-502**: A message sent by one attendee is visible to the other in an already-open thread within
  five seconds, without either attendee reloading.
- **SC-503**: A message sent while the recipient's application is closed reaches their device as a
  notification within thirty seconds, when permission has been granted.
- **SC-504**: An attendee who denies notification permission can complete every scenario in User
  Stories 1 through 4 with no functional difference.
- **SC-505**: 100% of attempts by a non-participant to read a conversation, read its messages, send
  into it, or read its unread state are refused, proven by integration tests against a real
  database.
- **SC-506**: Blocking takes effect immediately: the first send attempted by the blocked attendee
  after the block is refused.
- **SC-506a**: One account cannot open conversations with an entire conference: attempts to create
  conversations beyond the configured rate are refused, and no legitimate sender is ever denied a
  message outright rather than delayed.
- **SC-507**: 100% of reports result in a stored report record and an effective block, including when
  operator mail dispatch fails.
- **SC-508**: No interface exists anywhere in the product by which a report can be read.
- **SC-509**: After an attendee deletes their account, 0 messages authored by them remain in any
  conversation, and 100% of the surviving participant's own messages remain readable.
- **SC-510**: After an attendee deletes their account, no name, avatar, or profile attribute of
  theirs is rendered in any surviving conversation.
- **SC-511**: The conversation list and every thread are byte-for-byte identical before and after
  switching the active event.
- **SC-512**: Nothing an attendee does in Messages discloses to another attendee when, or whether,
  they read a message.
- **SC-513**: Messages opened without connectivity discloses no conversation or message content, and
  no message content is retrievable from device storage after the application is closed.
- **SC-514**: A message composed offline is never delivered later; the attendee is told it was not
  sent.
- **SC-515**: Every destination, thread, modal and control introduced is fully operable by keyboard,
  with a visible focus state, at desktop, tablet and mobile widths.
- **SC-516**: No content or primary action requires horizontal scrolling at any supported width.
- **SC-517**: A failure of the Home unread indicator leaves every other Home card rendering
  normally.
- **SC-518**: A conversation of 1,000 messages displays its most recent messages without transferring
  the whole history.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Nothing in Messages works offline, and the refusal is deliberate** (FR-563, FR-564). Conversations and messages are not cached: message content is the most sensitive data in the product, a 24-hour-stale conversation is misleading in a way a stale programme is not, and the existing cache key is event-scoped while conversations are not. Opening Messages offline shows the standard offline state. Composing offline **fails and is never queued** (FR-565) — no write queue, no optimistic update. The alternative, caching with a retrieved-at stamp, was specified and rejected by owner decision M6. |
| **Desktop layout** (Principle IV) | Persistent left rail; Messages renders as a two-pane workspace — conversation list in a fixed-width column, selected thread filling the remainder, composer pinned to the bottom of the thread pane. Contextual top bar carries the other participant's name and avatar. Block and report reachable from the thread header. The block list (FR-541a) sits on the existing account surface, **not** as a sixth destination. No horizontal scrolling (FR-580, FR-586). |
| **Tablet layout** (Principle IV) | Reduced rail; the two-pane layout is retained with a narrower list column at wider tablet sizes and collapses to the stacked mobile behaviour below the breakpoint. Detail stacks rather than compressing below legibility. |
| **Mobile layout** (Principle IV) | Compact header, bottom navigation. Conversation list and thread are **separate full-width views** with an explicit back affordance, replacing the prototype's horizontally-scrolling avatar strip, which Principle IV forbids for a primary action (FR-580). Composer is pinned above the bottom navigation; controls are touch-sized. Block, report and unblock confirmations are full-width overlays. |
| **Empty / loading / failure states** (Principle IV) | **Conversation list**: loading skeleton; empty — an invitation to find someone in Discover; failure — explanation with retry. **Thread**: loading skeleton; empty *and open to sending* — the conversation-starter prompt (FR-519); empty *and closed* — the closed-thread explanation, never the prompt (FR-519a); failure — explanation with retry. **Home unread indicator**: loading, empty (renders nothing at zero, FR-531), failure isolated to the card (FR-533). **Send**: disabled while empty (FR-512); failure — explanation, message retained in the composer, never queued; throttled — explanation that the send is delayed, never that it is denied (FR-511a). **Offline**: standard offline state for the whole destination (FR-564). **Departed counterpart**: explanatory closed-thread state (FR-574). **Blocked**: explanatory composer-unavailable state with unblock (FR-539). **Block list**: loading; empty — "you have not blocked anyone"; failure — explanation with retry (FR-541a). |
| **Accessibility** (Principle IV) | Accessible labels on every control including send, block, report, unblock and conversation selection (FR-582). Visible focus throughout. Full keyboard operability of list, thread, composer and send (FR-584). Block, report and unblock confirmations are modals with a clear close action, Escape dismissal, and focus restoration to the opener (FR-583) — the native modal dialog pattern 004 and 005 established, with explicit focus restoration because the platform does not do it reliably. Newly arrived messages announced to assistive technology without stealing focus (FR-585). |
| **Validation checklist discharged** (Principle VII) | **Discharges "message composition"** from the whole-product validation checklist. Contributes to keyboard focus visibility and accessible labels, and to correct desktop and mobile rendering, for its own surfaces. **Leaves to later features**: digital-card sharing feedback and meeting scheduling (008), session Q&A (009). |
| **Identity scoping & server-side authorization** (Principle VIII) | **Participation is the scoping predicate, and it is new to this feature.** Every read and write of a conversation, its messages, or its unread state is authorized server-side by the acting attendee's participation (FR-520, FR-521), never by client-side filtering. Identity binds from the sign-in session; no route accepts an attendee identifier from the client (FR-525). The per-event guard does **not** apply, because conversations are not per-event (FR-523) — this is the first feature whose personal data is not reachable by that guard, which is why FR-522 requires an integration test proving a non-participant is refused. Blocks, reports and notification subscriptions are each scoped to the owning attendee's session identity. |
| **Deletion & export coverage** (Principle VIII) | **Cascade from `attendees`**: messages (by author), participation, blocks (both directions), notification subscriptions. **Deleting an account removes its messages from every conversation, not just the deleter's view** (FR-570), removes its participation (FR-571), and leaves the surviving participant's own messages intact and readable in a closed thread (FR-572, FR-574) with no identifying trace of the departed attendee (FR-573). A conversation with no participants left is removed (FR-575). **Conversations themselves hold no attendee data** beyond their participants and are removed when empty. **Reports are the one record needing an explicit rule** (FR-579), because cascading them destroys the evidence of the report while retaining them keeps one attendee's data past their erasure request — carried as an open question below, and it MUST be settled before implementation since the deletion-coverage guard admits no unclassified table. **Export** covers message content the attendee authored, blocks they created, and their notification subscriptions (FR-577); messages authored by the other participant are excluded as that person's data (FR-578). |
| **Event scoping** (Constraints — data scoping) | **Cross-event, all six tables.** Conversations, participation and messages are relationships under standing decision 7 and D1 — a contact made at one conference must not vanish at the next (FR-507). Blocks are cross-event because the contact they refuse is cross-event; a block that lapsed on event switch would not be a block. Reports are cross-event because they concern conduct, not a conference. Notification subscriptions are per device and per attendee, not per event, because a device does not attend a conference. **Co-attendance appears exactly once**, as the precondition for creating a conversation (FR-504), and is never re-evaluated (FR-505). |
| **Register position** (Governance) | **Resolved: entry 10 (Notifications)**, in part — its delivery half only. M4 was the recorded decision the entry awaited, and **constitution v3.1.0 ratified it**: delivery is in scope for a received message and nothing else. The prohibition on reproducing the bell is **unchanged and carried forward** (FR-560), and is now asserted by two source-level audits rather than only stated. This specification was ahead of the constitution while it was written, and Phase 7 was implemented only after the amendment landed. **Narrows but does not resolve entry 7 (connection model)** — M1 deliberately leaves it to the client, while making binding on 008 that contacts MUST NOT be derived from the existence of a conversation. **Newly blocked by entry 18 (transactional email provider)**, which previously blocked 004 only: operator report mail (FR-547) now depends on it. **Supplies a precedent for entry 19 (nobody moderates)** — the operator route — without resolving avatars. **Adds to entry 4 (desktop and tablet unvalidated)**: a two-pane workspace is further unreviewed desktop design. **Adds two new register entries**: the push provider and key custody (entry 20), and the operator report address (entry 21) — both added by v3.1.0, both still open, and **neither blocks implementation**: the sink adapter and the stored-and-blocked report path make an unconfigured deployment a complete product minus delivery. |
| **Reserved migration number** (Branching — parallel work) | **`0006`**, reserved for this phase by the delivery roadmap. |

## Assumptions

- **The project owner speaks for the client on M1 through M8.** This was confirmed for the identity
  and data decisions in brainstorm #04 and is assumed to hold for these.
- **Conference-scale volume.** A conversation is assumed to hold hundreds of messages, not hundreds
  of thousands, and an attendee to hold tens of conversations. Paging (FR-518) is required
  regardless; extreme-scale optimisation is not.
- **Both participants are on the same deployment.** There is no federation and no external
  messaging interoperability.
- **Text is the only content type.** No attachment, image, link preview, or formatting requirement is
  assumed.
- **Notification permission is commonly denied.** The fallback path (FR-552, FR-562) is treated as a
  primary path, not a degraded one.
- **The operator is a person, not a service.** Report mail (FR-547) reaches a human who acts
  out-of-band; no automated moderation, classification, or enforcement is assumed.
- **`NotificationService` as it exists is a suitable seam.** It was defined in 001 as a no-op and is
  assumed to be shaped adequately for real delivery, or extendable without disturbing its consumers.
- **A conversation preview in the list is not a cache.** FR-509's preview is served with the list,
  not retained on the device, so it does not contradict FR-563.
- **Existing throttling patterns extend to sending.** Per-action throttling is assumed available for
  the send and conversation-creation paths without new mechanism.

## Open Questions

Carried from brainstorm #06. The first three **block implementation** and are owner decisions; the
rest are for planning and the review gate.

1. **The constitution amendment bringing engagement notification delivery in.** M4 reverses an
   exclusion held since 001. It needs a numbered standing decision and a version bump. **This
   feature must not merge before it lands** — see the Register position declaration. *Owner.*
2. **The Web Push provider and key custody.** The project's second external dependency and secret
   after transactional email. Plausibly settled together with entry 18. *Owner; blocks
   implementation of User Story 5.*
3. **The operator address reports are sent to, and the response expectation attached to it.** FR-547
   requires a destination; FR-548 forbids one inside the product. A report button promising review
   that never happens is worse than no button. *Owner; blocks implementation of User Story 3.*
4. **Whether a report record survives either attendee deleting their account** (FR-579). Cascading
   destroys the evidence; retaining keeps one attendee's data past an erasure request. The
   deletion-coverage guard admits no unclassified table, so this must be settled before
   implementation even though it is not an owner decision.
5. **The maximum message length** (FR-517).
6. **The mechanism behind FR-562, and its behaviour when the tab is hidden.** The user-facing
   target is *not* open — SC-502 fixes it at five seconds. What is open is how that is achieved and
   what it costs on a phone at a venue: how the mechanism backs off when the tab is hidden, and
   whether it stops entirely when the attendee is not looking at a thread.
7. **Whether an attendee may suppress message content in notifications.** M7 puts message text on
   lock screens; a per-attendee preference is the usual mitigation and was not decided either way.
8. **The exact copy for the departed-counterpart thread** (FR-573, FR-574). The state is specified;
   the words are not.
9. **Whether 007 splits into reviewable phases.** 004's expectation that it would need to was wrong;
   this feature is larger and carries two subsystems. Best decided after planning.
10. **Whether the offline cache key gains an event-less variant.** FR-563 makes this moot for 007,
    but 008's cross-event contacts meet the same shape with no such escape.
