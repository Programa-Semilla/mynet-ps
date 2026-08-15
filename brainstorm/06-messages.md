# Brainstorm: Messages, and bringing notification delivery in

**Date:** 2026-08-07
**Status:** active
**Phase:** 007 · migration `0006` reserved · no parallel partner

## Problem Framing

007 is the first phase in the queue whose dependencies were both already satisfied when the session
opened — 004 shipped the profiles that render participants, 006 shipped the directory where a
conversation is started in practice. Nothing blocked it. The roadmap scopes it in six lines:
conversations, participants and messages; thread view, compose and send; the empty-thread prompt;
unread tracking feeding Home's indicator; and wiring Discover's *message* action. It also calls it
**"the highest-risk authorization surface in the product."**

Three things shaped the session before any option was put on the table.

**The prototype answers almost none of it.** `App.tsx:940` is a single-user simulation: `Conversation`
holds one `attendeeId` and an array of messages, `onSendMessage` appends to local state, and there is
no second party anywhere. Unread is inferred as "the last message isn't mine" (`App.tsx:977`) — a
rule that flips back to read the moment you reply and cannot represent an unread message in a thread
you last spoke in. Every question about *two* people talking is unanswered by construction.

**Deletion was already flagged as harder here than anywhere prior.** Overview thread from #04: notes
and saved sessions cascade cleanly because they are private, but "a deleted attendee's messages sit
in someone else's thread." `apps/api/tests/unit/deletion-coverage.test.ts` turns that from a design
preference into a build failure — it derives expectations from the Drizzle schema and admits exactly
four outcomes per table, so **007's three new tables fail the build by existing** until each is
classified.

**Two register entries meet in this feature and pull in opposite directions.** *The connection model
behind Network contacts* is a client decision that blocks 008 entirely, and it is open precisely
because the prototype derives contacts from the existence of a conversation
(`App.tsx:1174`). Whatever 007 decides about how a conversation begins either pre-empts that
decision or deliberately leaves it open. It cannot be neutral.

The session also reopened a fence. The owner rejected the polling model on the table and asked for
push instead, which moves *engagement notification delivery* — excluded since 001, with
`NotificationService` deliberately unwired — into scope. That is a constitution amendment, and it is
recorded here as one.

## Approaches Considered

### How a conversation begins

#### A: Open send — anyone co-attending may message anyone *(chosen)*

The first message creates the conversation. No request, no accept, no consent step.

- Pros: matches the prototype exactly; keeps 007 at its planned size; no new relationship concept,
  so 008's connection model stays genuinely open rather than answered by inference.
- Cons: a conversation becomes a **unilateral** act, so 008 must not derive contacts from
  conversations — under this rule that would let a stranger insert themselves into your Network.
  Unsolicited contact becomes possible in a product with public self sign-up and no moderator,
  which is the same shape as the unresolved avatar-moderation entry.

#### B: Request-then-accept

The first message creates a pending request; the thread opens on acceptance.

- Pros: safer against unsolicited contact; gives 008 a real relationship to store.
- Cons: **this is the connection model** — a decision reserved for the client. It also enlarges 007
  with a request inbox, decline and ignore states, and a second Home indicator.

#### C: Open send, gated on discoverability

Messaging permitted only where 006's three-condition visibility query already permits reading a
profile.

- Pros: one visibility rule rather than two.
- Cons: turning discoverability off would silently close existing threads to new messages, which is
  a surprising consequence of a setting whose documented meaning is "appear in the directory".

### What "threads persist across events" means at the boundary

D1 and standing decision 7 place message threads on the relationship side of the hybrid scoping
rule. Open send makes co-attendance the precondition to *start*. The two meet in a case the
prototype cannot have: a thread with someone who is not at the event you are now attending.

#### A: Fully live — read and send, indefinitely *(chosen)*

- Pros: the plainest reading of "relationships persist"; the Messages destination never re-renders
  on event switch, so there is no second scoping concept in the UI.
- Cons: an attendee can be messaged indefinitely by someone they met once. This is what escalated
  block from a nice-to-have to a requirement.

#### B: Read-only without current co-attendance

- Pros: bounds the contact window to events both people are actually at.
- Cons: contradicts D1's promise — a contact you cannot write to is a weaker relationship than the
  decision describes — and needs a co-attendance check on every send plus a disabled-composer state.

#### C: Live, but the list filters to the active event by default

- Pros: keeps the destination legible once threads accumulate across years.
- Cons: introduces a UI scoping concept the storage layer does not have.

### Account deletion, and someone else's thread

Standing decision 12 forecloses part of the space: hard deletion with cascade, **no tombstone**,
built to the strict standard. What it does not settle is whose data a sent message is — your
outbound message is your personal data, and it is simultaneously sitting in someone else's inbox.

#### A: The departing attendee's messages vanish; the other keeps their own *(chosen)*

Cascade removes their messages and their participant row. The conversation survives with one
participant, holding only the remaining attendee's words, read-only.

- Pros: honours decision 12 strictly — nothing of the departing attendee is retained, not even a
  name — without destroying data belonging to someone who never asked for it to go. Gives all three
  tables a cascade classification, so `deletion-coverage` is satisfiable with no allow-list entry.
- Cons: leaves a genuinely odd artifact — a half-conversation with an unnamed absence — whose copy
  the specification has to write. Where the departed attendee did most of the talking, the remaining
  attendee is left with a near-empty shell.

#### B: The whole conversation is deleted for both

- Pros: no half-threads, one cascade rule, nothing to explain in the UI.
- Cons: one attendee's erasure right silently destroys another's authored messages — messages that
  decision 12's export obligation arguably says the other attendee should be able to keep.

#### C: Messages stay, authorship severed

- Pros: by a wide margin the best reading experience.
- Cons: retains the departed attendee's authored content after they asked to be erased. Message text
  is free-form and routinely self-identifying, so severing a foreign key does not de-identify it.
  Expected to fail a Principle VIII review.

### Freshness, and the push decision

`requirements.md:35` excludes "live chat delivery, notifications, or calendar integrations". That
exclusion list is not authoritative on its own — it is the same list that excluded real
authentication and persistent databases, both reversed by standing decisions 5 and 4. CLAUDE.md
states the actual rule: engagement notification delivery "stays out until a **recorded decision**
brings it in."

Polling was proposed and recommended. **The owner rejected it and asked for push.** The distinction
that mattered was then drawn explicitly, because two different things go by that name:

- **Server-sent events to a running client** — in-app delivery only. Leaves the notification fence
  intact, needs no Caddy change, reconnects natively.
- **WebSocket** — full duplex, of which 007 needs only one direction, since sending is an ordinary
  authenticated request.
- **Web Push** *(chosen)* — reaches the device with the app closed. **This is engagement
  notification delivery.** It wires `NotificationService` to real delivery for the first time since
  001 declared it a deliberate no-op, requires a push provider and VAPID key custody, and needs a
  permission surface.

The cost of the third option was put in front of the owner before it was chosen, and chosen anyway.

#### Where the push platform lives

Recommended as its own feature after 007, on the grounds that it is comparable in size to the
messaging feature itself, that push subscriptions are per-device personal data arriving with their
own deletion and export obligations, and that the deniable-permission fallback should exist and be
proven before push sits on top of it.

**The owner chose to fold it into 007 as one feature and one PR.** 004 shipped as a single 131-task
PR and this is larger. `speckit-spex-collab-phase-split` remains available to split the
*implementation* into sequential reviewable PRs without touching the scope decision.

#### Composition and payload

Push permission is deniable, so a non-push path is required regardless — push is an addition, never
a replacement.

- **A: Signal-only push, service worker as the single path** *(recommended, not chosen)*. Payload
  carries sender name and conversation id, never message text; the lock screen reads "New message
  from Ana Ruiz" and content appears only after the app opens and authenticates. One delivery path
  to test. Rejected in favour of B.
- **B: Content-carrying push, two independent paths** *(chosen)*. The payload includes message text,
  so the notification is useful without opening the app; polling handles the open-app case
  independently of the service worker. **Accepted cost, recorded deliberately:** the most sensitive
  content in the product appears on lock screens and travels inside push payloads, and two freshness
  paths can disagree and must both be tested.
- **C: Signal-only push, no polling.** Smallest surface, but denying a permission prompt degrades
  Messages to a mailbox — the least-privileged attendee gets the worst product.

### Unread state

- **A: Private per-participant last-read marker** *(chosen)*. One column; unread is messages after
  the marker. Survives replying, which the prototype's rule does not. The sender learns nothing — no
  delivery ticks, no read receipts, no typing indicators, no presence.
- **B: Last-read marker plus visible read receipts.** Publishes reader behaviour to another
  attendee, needing its own Principle VIII justification and realistically an opt-out — a second
  privacy control beside 006's discoverability toggle, which was deliberately kept singular and
  all-or-nothing.
- **C: Explicit per-message read rows.** Most precise, and the only model that survives group threads
  unchanged — but 007 is strictly 1:1 with no group threads planned, and it is the largest version
  of the same privacy surface.

### Offline

Two shipped invariants bind: offline reads come from a caching decorator at the repository boundary,
keyed `(attendeeId, eventId, resource)` with a 24-hour lifetime and a retrieved-at stamp on every
cached surface; and writes are refused, never queued. 006 established that declining to cache is a
decision that must be **declared**, not omitted.

A structural wrinkle applies whichever way this goes: **that cache key contains an `eventId`, and
threads are not event-scoped.** Messages is the first resource whose key does not fit the shape.

- **A: Cache conversations and history, 24h, stamped** *(recommended, not chosen)*. Unlike Discover
  this is the attendee's own conversation rather than other people's data ageing after they chose to
  be invisible, so 006's refusal reasoning does not transfer.
- **B: Cache the conversation list only.** A half-offline destination, and the list preview leaks
  message bodies into the cache anyway.
- **C: Do not cache — declare the refusal** *(chosen)*. Messages requires connectivity. Smallest
  attack surface, no stale-conversation confusion, no new cache-key shape. **Accepted cost:** the
  destination is unavailable on bad venue wifi, which is exactly where a conference attendee is —
  and a push notification can now wake the app faster than the network can serve the thread behind
  it.

### Stopping unwanted contact

Open send plus indefinite reachability means any attendee who once shared an event with you can
message you forever, with no consent step and no moderator anywhere in the product by construction.
Raised as the safety floor for the feature rather than a polish item.

- **A: Block only, in 007.** One table, one check on the send path, one control on the profile view
  006 already built.
- **B: Block and report, both in 007** *(chosen)*. Raised with the objection that a report needs a
  recipient and the organizer exclusion forecloses the usual one. Chosen anyway, which forced the
  destination question below.
- **C: Neither — defer to a later feature.** Rejected: 007 is the feature that creates the exposure.

#### Where a report lands

The constraint is narrower than it first appears. The constitution forecloses organizer
administration **inside the product** — no admin interface, no privileged role, no content import
path. It does not forbid an *operator*: standing decisions 17 and 18 put the project owner in charge
of two VMs, backups and secrets, and transactional mail is already in scope.

- **A: Auto-block, record, and email the operator** *(chosen)*. Reporting blocks immediately so the
  attendee gets relief without waiting on anyone; a report row stores the reported messages'
  identifiers and a reason; a transactional email reaches a configured operator address. No admin UI,
  no privileged role, no reader inside the app — the operator acts out-of-band.
- **B: Auto-block and record, no notification.** Nobody is told, so nothing is acted on — a report
  button promising review that never happens.
- **C: Record only, block kept separate.** The common case needs two actions to reach safety.

## Decision

007 delivers Messages **and** the Web Push platform, as one feature and one PR, on migration `0006`.

| # | Decision |
|---|---|
| M1 | **Open send.** Co-attendance gates the first message only. The first message creates the conversation. No request, no accept. |
| M2 | **Threads are permanent and event-independent.** Messages does not change on event switch; co-attendance is never re-checked after the first message. |
| M3 | **Deletion cascades to the departing attendee's messages and participant row.** The other participant keeps their own words in a surviving one-sided, read-only conversation. |
| M4 | **Web Push is brought in**, reversing the engagement-notification exclusion, and folded into 007. `NotificationService` is wired to real delivery for the first time. |
| M5 | **Unread is a private per-participant last-read marker.** No read receipts, delivery ticks, typing indicators or presence. |
| M6 | **No offline caching.** The refusal is declared in the spec, as 006 established. Composing offline fails; it never queues. |
| M7 | **Push payloads carry message content.** Push and open-thread polling are two independent freshness paths. |
| M8 | **Block and report both ship in 007.** Reporting auto-blocks, records, and emails a configured operator address. |

**M4 is a constitution amendment, not a feature choice.** It brings engagement notification delivery
into scope, adds a push provider and VAPID key custody as the project's second pending external
dependency after transactional email, and needs its own numbered standing decision and version bump.
The notification **bell remains unbuilt** — push delivery and an in-app notification centre are
separable, and CLAUDE.md's "must not be reproduced" is not implied by this decision.

**M1 deliberately leaves 008's connection model open.** It also makes one thing binding on 008:
contacts must **not** be derived from the existence of a conversation, because under open send that
would let a stranger insert themselves into another attendee's Network.

## Key Requirements

**Conversations and messages**

- 1:1 only. No group conversations.
- A conversation is created by its first message; starting one requires the two attendees to share a
  current event. That check never runs again.
- Message content is private to its participants, enforced server-side, never by client-side
  filtering, with an integration test proving a non-participant is refused.
- Send is disabled on empty or whitespace-only input — never a post-submit error.
- An empty thread shows the conversation-starter prompt.
- The Messages destination is unaffected by event switching.

**Deletion and export**

- `conversations`, `conversation_participants` and `messages` are each cascade-classified in
  `deletion-coverage`, as are block records, report records and push subscriptions.
- A conversation whose counterpart has deleted their account survives with the remaining
  participant's own messages, read-only, with an explanatory empty-counterpart state.
- Message text, block records and push subscription endpoints all appear in the account export;
  `export-coverage` fails any collected column that does not.

**Unread and Home**

- Each participant row carries a last-read marker; unread is messages after it.
- Home's unread indicator registers through the append-only card registry and owns its own loading,
  empty and failure states. It must not blank the dashboard on failure.

**Push**

- Web Push, permission-gated, degrading to the polling path when denied or unsupported.
- Push subscriptions are per-device, attendee-scoped, cascade-deleted, and exported.
- Payload carries message content.
- No notification bell, no in-app notification centre.

**Safety**

- Block is server-enforced on both send and conversation creation.
- Report auto-blocks, stores the reported message identifiers and a reason, and emails a configured
  operator address.
- Report records hold two attendees' data and need their own deletion and retention rules.

**Client**

- Messages requires connectivity; the refusal to cache is stated in the spec.
- The conversation switcher **must not require horizontal scrolling** — the prototype's
  horizontally-scrolling avatar strip (`App.tsx:971`) contradicts a binding constraint, since
  switching conversations is a primary action. A prototype defect to correct, not a question.
- All three layouts, both empty and failure states, accessible labels, visible focus, and Escape
  handling on any modal, declared in the spec rather than deferred.

**Out of scope**

Group conversations · attachments · editing or deleting an individual message · message search ·
presence and typing indicators · an in-app notification centre or bell · deriving 008's contacts
from conversations.

## Open Questions

- **The push provider, and VAPID key custody.** An owner decision. The project's second pending
  external dependency and secret after the undecided transactional email provider — and the two may
  well be answered together.
- **The constitution amendment number and version** for bringing engagement notification delivery in
  (M4). Decision 20 made the last retraction a major version; this is at minimum a minor bump.
- **The operator address a report is emailed to**, and the response expectation attached to it. M8
  creates an obligation the owner personally holds.
- **The polling interval**, and its backoff when the tab is hidden.
- **A maximum message length.**
- **Whether an attendee may suppress message content in notifications.** M7 puts message text on the
  lock screen; a per-attendee preference is the usual mitigation and was not decided.
- **Copy for the departed-counterpart half-thread** (M3) — what the remaining attendee is told.
- **Whether a report record is retained after either attendee deletes their account**, and for how
  long. Cascade would destroy the evidence of the report; retention would keep one attendee's data
  past their erasure request.
- **Whether the cache key gains an event-less variant** or Messages simply never touches the
  decorator. M6 makes this moot for 007 but 008's cross-event contacts will meet it again.
- **Whether 007 splits into reviewable phases.** 004's expectation that it would need to was wrong;
  this feature is larger and carries two subsystems.
