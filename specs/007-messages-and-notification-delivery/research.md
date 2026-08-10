# Phase 0 Research: Messages, and the Notification Delivery Platform

**Feature**: 007 | **Date**: 2026-08-07 | **Plan**: [plan.md](./plan.md)

Fourteen items. Nine resolve unknowns the plan raised; five close spec open questions that could not
be carried into implementation. Three open questions remain **deliberately unresolved** and are
listed at the end — all three are owner decisions.

---

## R1 — `NotificationService` cannot express Web Push as it stands

**Decision**: Extend the existing interface with three subscription members rather than adding a
second port. The new shape is:

```
isSupported()          — unchanged, but now returns a real answer
requestPermission()    — unchanged signature, real implementation
show(...)              — unchanged; local display, used by the service worker path
subscribe()            — NEW. Returns an opaque device subscription, or null if refused.
unsubscribe()          — NEW. Drops this device's subscription.
currentSubscription()  — NEW. What this device currently holds, if anything.
```

**Rationale**: `packages/platform/src/interfaces/index.ts:26` defines the interface with exactly
three members, all concerned with *displaying a notification from the running page*. Web Push is a
different shape: the client's job is to obtain and surrender a subscription, and delivery is
initiated by the server. Nothing in the current interface can carry that.

Extending is right rather than adding a `PushService` sibling, because the constitution fixes the
six capability names and states they are "not open to restyling". Notification delivery is one
capability; a device that can receive a push and a device that can show a notification are the same
device. Two ports would also mean two permission states that could disagree.

**The interface's own comment must be rewritten, not left standing.** It currently reads: *"the
implementation MUST NOT be wired to real delivery."* That sentence is a restatement of register
entry 10, and it lapses with the entry — but only once the amendment lands. Leaving it in place
above a real implementation would make the file lie about itself.

**Alternatives considered**: A separate `PushService` (rejected: splits one capability, invents a
seventh name the constitution does not sanction). Passing the raw `PushSubscription` browser object
through the port (rejected: leaks a browser type into `@mynet/data` consumers, and
`mynet/no-direct-platform-access` exists to prevent exactly that).

---

## R2 — The service worker strategy has to change

**Decision**: Switch `vite-plugin-pwa` from its default `generateSW` to `strategies:
'injectManifest'`, with a project-owned source worker at `apps/web/src/sw.ts`.

**Rationale**: `apps/web/vite.config.ts:70` configures VitePWA with a `workbox` block and no
`strategies` key, so it generates the worker. A `push` event listener and a `notificationclick`
listener cannot be expressed in generated-worker configuration — they are code, and the generated
worker is not ours to edit.

`injectManifest` preserves everything the current configuration buys: `navigateFallback:
'index.html'` (FR-051), the API exclusion from every cache, and content-hashed precache eviction
(FR-055). Those move from config into the source worker and must be carried across deliberately —
**this is the highest-risk mechanical change in the feature**, because silently dropping the API
cache exclusion would start serving the HTML shell for API requests.

`registerType: 'prompt'` stays. A push-capable worker still must not seize control mid-session.

**Alternatives considered**: A second service worker registered at a different scope (rejected: one
scope per worker, and two workers would contend for control of the same clients). Doing push
entirely from the page with the page open (rejected: defeats the entire point of M4, which is
delivery when the application is closed).

---

## R3 — Report retention *(closes spec open question 4)*

**Decision**: `abuse_reports` **cascades from both attendees** — reporter and reported — and is
additionally swept after **90 days**. The durable record of a report is the operator's mail, not the
row.

**Rationale**: The row exists to carry a report out of the product, not to be an archive inside it.
FR-547 dispatches operator mail at submission time, and FR-548 forbids anything in the product from
ever reading a report back. Once the mail is sent, the row's only remaining job is done.

That is what makes the cascade safe. Standing decision 12 requires hard deletion with no tombstone,
and a report row names two attendees — retaining it past either one's erasure request would keep one
person's data alive because *another* person filed a complaint. Cascading loses nothing the operator
needs, because the operator already has it.

The 90-day sweep is the second line, for the ordinary case where neither party ever deletes. It
follows the `RETENTION_SWEEPS` pattern in `apps/api/src/maintenance.ts:55` and, like every entry
there, states its reason in the table.

**Accepted residual, recorded rather than hidden**: FR-549 requires the report and block to succeed
even when mail dispatch fails. If dispatch fails *and* the reported attendee then deletes their
account, the report is lost entirely. The alternative — retaining it — means a departed attendee's
data survives their erasure request on the strength of a complaint they cannot see or contest. The
erasure right wins. Dispatch failure is logged and visible, which is the mitigation.

**Alternatives considered**: Retain reports indefinitely (rejected: keeps two attendees' data with
no reader and no expiry). Cascade from the reporter only (rejected: the reported attendee's
identifier and their quoted message content are the substantial personal data in the row).

---

## R4 — Open-thread freshness mechanism *(closes spec open question 6)*

**Decision**: Poll while, and only while, **a thread is open and the document is visible**, at a
**3-second interval**. Stop entirely when the document is hidden; refetch once immediately on
becoming visible again. The conversation list and Home's unread indicator poll **never** — they
refresh on navigation and on regaining visibility.

**Rationale**: SC-502 fixes five seconds as the outcome, so the interval must leave room for the
request itself; three seconds gives comfortable margin without being chatty. The scope restriction
is where the real saving is — a conference attendee has the application open far more than they have
a thread open, and an interval that runs on Home would multiply cost across every destination for no
benefit anyone asked for.

Stopping on hidden rather than backing off is simpler and strictly better here: there is no
correctness requirement to satisfy while nobody is looking, and push already covers the
application-closed case. `visibilitychange` is the trigger, and the immediate refetch on return is
what makes stopping invisible to the attendee.

**Alternatives considered**: Server-sent events (rejected earlier by owner decision in favour of Web
Push; and with push in place a persistent connection for the open-thread case would be a third
mechanism). Exponential backoff while hidden (rejected: strictly more code than stopping, for a case
with no requirement). Polling the conversation list (rejected: FR-531's indicator has no freshness
requirement attached, and navigation-triggered refresh satisfies US4 as written).

---

## R5 — Throttling sends and conversation creation

**Decision**: Add two actions to the existing `THROTTLE_ACTIONS` table in
`apps/api/src/auth/throttle.ts`, keyed on a hash of the **acting attendee's identifier** rather than
an email:

| Action | `mayDeny` | Why |
|---|---|---|
| `message_send` | **false** | FR-511a. May delay, never denies. Mirrors `reset_request`. |
| `conversation_create` | **true** | FR-504a. Must actually bound how many distinct people one account can open a conversation with. |

Both use `recordRequest` — the every-request counter documented at `throttle.ts:268` — because the
server does the work regardless of outcome.

**Rationale**: The asymmetry looks inconsistent and is not. `reset_request` is configured
never-deny because it is keyed on the *victim's* identifier: an attacker who triggers a denial
denies the victim, so denial is the attack. Here both actions are keyed on the **actor's own
authenticated identity**, so a denial can only ever harm the actor. That is what makes an actual cap
legitimate on conversation creation, and it is why the two rows differ.

Sending stays never-deny because a delayed message is a working product and a denied one is not,
while creation is where mass-contact actually happens — one account opening a thread with every
attendee at the conference is the abuse FR-504a names.

**Alternatives considered**: A new bespoke rate limiter (rejected: `throttle.ts` already carries the
window, the two dimensions, the timing-safe delay service and the sweep). Throttling only send
(rejected: the harm in M1 is breadth of contact, not volume within one thread).

---

## R6 — Message paging

**Decision**: Keyset pagination descending on `(sent_at, id)`, newest first, page size 50. The client
reverses for display and requests older pages as the reader scrolls back.

**Rationale**: 006 established keyset over offset for the directory and the reasoning transfers
directly, minus the hard part — the directory's cursor was difficult because rows are ordered by a
computed rank that can change under the cursor. A message's `sent_at` is immutable and its ordering
is total, so this is keyset in its easy form: **no duplicates and no omissions**, not 006's
asymmetric guarantee.

Newest-first is the natural read: a thread opens at the bottom.

**Alternatives considered**: Offset paging (rejected: shifts under concurrent inserts, which is
exactly what a live thread does). Loading whole threads (rejected: SC-518).

---

## R7 — Asset budget and code splitting

**Decision**: The Messages destination is **lazily loaded**, following Discover. The Home unread
card stays eager, as every Home card must.

**Rationale**: `apps/web/src/app/navigation.ts` records that 004 went 5.1 KB over the budget and 006
went 2.9 KB over, and that the rule is now "the destinations needed to render the workspace stay
eager" — Home and Agenda. Messages fails that test for the same reason Discover did: it is reached
by a deliberate navigation, not part of the workspace. Adding a thread view, composer, two
confirmation dialogs and the push permission surface eagerly would fail
`scripts/asset-budget.mjs`, and the file's own message says not to raise the budget to make a red
build green.

**Alternatives considered**: Eager loading and raising the budget (rejected explicitly by the
budget's own instructions).

---

## R8 — The push dispatch port

**Decision**: A new `apps/api/src/notifications/` module mirroring `apps/api/src/mail/` exactly —
`service.ts` (vendor-free `PushService` interface), `dispatch.ts` (timeout and failure isolation),
`sink-adapter.ts` (development and test adapter that records rather than sends).

**Rationale**: The mail module already solved this problem, and its solution is documented at
`apps/api/src/mail/service.ts:19`: no provider is chosen, so **an unprovisioned provider must be the
expected state rather than an exceptional one**. Push is in exactly that position — spec open
question 2 blocks the real adapter and nothing else. With a sink adapter, User Story 5 is fully
buildable and testable today, and choosing a provider later is one new file plus configuration.

Delivery failure must never fail the send that triggered it, exactly as FR-318a established for
verification mail.

**Alternatives considered**: Importing a push library directly into route handlers (rejected:
Principle V, and it would hard-couple the feature to a vendor before one is chosen).

---

## R9 — Participation needs its own audit and its own branded scope

**Decision**: Mirror the event-scope machinery for participation:

1. A branded `ConversationScope` type constructible **only** by a `requireParticipation` guard,
   demanded by every conversation and message query — the same shape as `EventScope` and
   `requireEventAccess`.
2. A new `apps/api/tests/unit/participation-audit.test.ts`, modelled on
   `event-scope-audit.test.ts`, walking the real route table and failing any route that accepts a
   conversation or message identifier without the guard.

**Rationale**: This is the most important structural finding in the research, because the existing
protection **does not extend here and silently appears to**. `event-scope-audit.test.ts:27` matches
routes by `:eventId` in the path or an event-naming property in the schema. Conversation routes name
no event — correctly, since FR-507 makes them cross-event — so **the audit will pass them without
inspecting anything**. A future feature adding `/conversations/:conversationId/something` without a
guard would fail no test.

The event audit's own header states why it exists: *"seven features after this one will add exactly
that shape of route, and each of them will be written by someone who has not read this file."* The
same argument applies to participation, and 008's appointments will be the first to inherit it.

**Alternatives considered**: Widening the event audit to also match conversation identifiers
(rejected: it would conflate two different predicates in one test and make the failure message
misleading). Relying on code review (rejected: the whole point of the pattern is that review is not
the enforcement).

---

## R10 — Enforcing one conversation per pair in the store *(FR-502)*

**Decision**: A `conversation_pairs` table holding `(lower_attendee_id, higher_attendee_id,
conversation_id)` with a unique constraint on the ordered pair and `ON DELETE CASCADE` on both
attendee foreign keys. Creating a conversation inserts here; the unique violation *is* the
enforcement.

**Rationale**: FR-502 requires store-level enforcement, and the obvious approach — a normalised
`pair_key` column on `conversations` — **breaks FR-573**. If it holds both attendee identifiers and
one attendee deletes their account, the surviving conversation row still contains the departed
person's identifier. That is a retained trace of a deleted attendee, which standing decision 12
forbids and FR-573 restates.

A separate pair table with real foreign keys does not have that problem: the pair row cascades away
with the attendee, leaving the conversation and the survivor's messages intact and nothing of the
departed attendee anywhere. It is also correct going forward — once a counterpart is gone, no new
conversation with them is possible, so the pair slot should be empty.

Ordering the two identifiers (lower, higher) makes the constraint direction-independent, so A→B and
B→A collide as they must.

**Alternatives considered**: A generated `pair_key` on `conversations` (rejected: retains a deleted
attendee's identifier). A partial unique index over `conversation_participants` (rejected: cannot
express "these two rows together are unique" without a pair-shaped row somewhere).

---

## R11 — The third `MailService` method

**Decision**: Add `sendAbuseReport(to: string, report: { reportId, reportedAt, messageIds })`. No
generic send. The method carries **identifiers and a timestamp, never message text or a reason
string**.

**Rationale**: `apps/api/src/mail/service.ts:5` states that the interface has exactly two methods
*so that a third requires editing this file* — the guard worked as designed, and this is the
deliberate act it was built to force. What must be argued is that this does not breach the boundary
the guard protects, and it does not: the guard exists to keep **engagement notifications to
attendees** out. This message goes to the **operator**, is operational rather than engagement, and
is not addressed to a user of the product at all.

Carrying identifiers rather than content is a second decision and a deliberate one. Putting reported
message text into an email would copy two attendees' personal data into an external mail provider's
systems and into an inbox with its own retention — for a recipient who can query the database
directly. The mail's job is to say *a report exists, here is its identifier*; the operator looks up
the rest out-of-band. This also keeps the method's shape close to the existing two.

**Alternatives considered**: A generic `send(to, subject, body)` (rejected: dissolves the guard
entirely). A separate `OperatorMailService` (rejected: two ports, two adapters, two configurations,
one provider — the split buys nothing and doubles the unprovisioned surface).

---

## R12 — Maximum message length *(closes spec open question 5)*

**Decision**: **2,000 characters.** The notification body truncates to fit the push payload budget,
with an ellipsis.

**Rationale**: This turned out to be a constraint rather than a taste question. **Web Push payloads
are capped at roughly 4 KB after encryption**, and M7 puts message content in the payload. A
2,000-character message is comfortably under that in the common case and leaves room for the sender's
name, the conversation identifier and encryption overhead; multi-byte content is why the margin is
this wide rather than tighter.

2,000 characters is also generous for the domain — a networking message that runs longer than that
wants to be an email — so the limit binds the payload without binding the attendee in practice.

FR-517 requires the attendee to see the limit approaching rather than discover it on rejection: a
counter appears at 90% of the limit.

**Alternatives considered**: 4,000 or unbounded with server-side truncation (rejected: pushes the
truncation decision into the notification path where it is invisible and lossy). A signal-only push
payload, which would remove the constraint entirely (rejected by owner decision M7).

---

## R13 — Unread counting

**Decision**: Unread is derived, never stored as a counter. `conversation_participants` carries
`last_read_message_id` (nullable), and unread is `messages` in the conversation after that message,
authored by the other participant. Home's indicator needs only existence, so it asks a cheaper
question — `EXISTS`, not `COUNT`.

**Rationale**: A stored counter is a second source of truth that drifts, and it needs updating on
every send to every participant. Deriving costs an indexed range scan and cannot disagree with the
messages themselves. Using `last_read_message_id` rather than a timestamp avoids ties between
messages sent in the same millisecond.

FR-529's requirement that sending does not by itself mark things read falls out for free: sending
appends a message, it does not move the reader's pointer.

**Alternatives considered**: `last_read_at` timestamp (rejected: millisecond ties). A materialised
unread count per participant (rejected: drift, and write amplification on the hot path).

---

## R14 — Export shape

**Decision**: The export gains a `messages` section containing only messages the attendee authored,
each with its conversation identifier, timestamp and content; a `blocks` section; and a
`push_subscriptions` section listing device registrations without their cryptographic material. It
also gains a **stated note** that received messages are excluded and why, per FR-578.

**Rationale**: `assembleExport` in `apps/api/src/db/queries/account.ts:109` is the single place this
is assembled, and `export-coverage.test.ts` fails on any collected column with no coverage — so the
sections are not optional. Subscription keys are excluded as credentials, not content; they grant
delivery to a device and exporting them would hand over a capability rather than a record.

**Alternatives considered**: Including received messages (rejected by FR-578, which now carries the
reasoning). Omitting subscriptions (rejected: they are per-device personal data and the coverage
guard would fail).

---

## Deliberately unresolved — all three are owner decisions

These are **not** research gaps. No amount of investigation closes them.

1. **The constitution amendment bringing engagement notification delivery in.** Gates merge of this
   branch. Everything else in this document assumes it lands.
2. **The Web Push provider and VAPID key custody.** Gates the real adapter in R8 only. The sink
   adapter makes every other part of User Story 5 buildable and testable now.
3. **The operator address abuse reports are mailed to.** Gates R11's configuration. The method, the
   record and the block are all buildable without it.

Spec open question 8 — the exact copy for a departed-counterpart thread — is left to implementation
against the built screen, as 005 did for its equivalent. Spec open question 9 — whether 007 splits
into reviewable phases — is answered after tasks are generated, by `speckit-spex-collab-phase-split`.
Spec open question 10 — an event-less cache key — remains moot for 007 under FR-563 and is left for
008.
