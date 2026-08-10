# Phase 1 Data Model: Network — Contacts, Exchanged Cards, and Appointments

**Feature**: 008 · **Migration**: `0007_network_and_appointments.sql` · **Date**: 2026-08-10

Three tables. Two hold attendee data and cascade; one is seeded conference content and is
allow-listed with a reason. Every table states its **event-scoping rule and why**, because neither
rule is a default (standing decision 7).

---

## `shared_cards` — the exchange, not the person

**Event scoping: CROSS-EVENT.** Standing decision 7 names exchanged cards among the relationships
that persist, and durability is the entire purpose of the feature. `event_id` records **where the
exchange happened** and is a historical fact, explicitly **not** a scoping predicate — no query may
filter contacts by the active event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `sharer_id` | uuid → `attendees` **ON DELETE CASCADE** | Whose card it is |
| `recipient_id` | uuid → `attendees` **ON DELETE CASCADE** | Who holds it |
| `event_id` | uuid → `events` | Where they met. Historical, not a predicate |
| `shared_at` | timestamptz | Set once; **never refreshed** by a repeat share |

**Constraints**

- `unique (sharer_id, recipient_id)` — FR-604's idempotency.
- `check (sharer_id <> recipient_id)` — FR-606, enforced in the schema rather than only in a route.
- Index on `recipient_id` for the contacts list; index on `sharer_id` for the cascade.

**Why there is no ordered-pair normalisation here, unlike `conversation_pairs`.** A conversation is
symmetric, so 007 normalises to `(lower, higher)` with a check constraint or the unique index would
permit both A–B and B–A. **A card is directional**: A→B and B→A are two different, both-valid facts
— each person shared with the other. Copying the ordered-pair trick would make a reciprocal exchange
*impossible*. The neighbouring table looks like a precedent and is not.

**No copy of the sharer is stored.** Name, avatar, company, role, headline and interests resolve
from the sharer's current profile at read time (FR-611). A snapshot would duplicate personal data,
outlive the subject's own edits, and create a second source for one person.

**Resolution rule** (FR-612–FR-614): reading a held card joins `profiles` **without** the
directory's discoverability condition, **without** consulting verification state, and **without**
requiring shared current registration. It joins `blocks` and yields nothing while a block exists in
either direction — read-side, so lifting a block restores the contact automatically.

**Deletion**: both references cascade, so either party's departure removes the row for both
(FR-651). Unlike 007's conversations there is **no one-sided survivor**, and the asymmetry is
deliberate — a conversation holds the survivor's own words, which are theirs to keep, whereas a card
whose subject is gone has nothing to preserve.

**Export**: appears twice, as *cards you have shared* and *cards you hold* (FR-653).

---

## `appointments` — a time and a place at a specific conference

**Event scoping: PER-EVENT.** Standing decision 7 names appointments among per-event content: an
appointment is a time and a place at a specific conference. Every read is scoped by `event_id`
through `requireEventAccess` (FR-639).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `event_id` | uuid → `events` **ON DELETE CASCADE** | The scoping predicate |
| `slot_id` | uuid → `meeting_slots` | The chosen slot |
| `proposer_id` | uuid → `attendees` **ON DELETE CASCADE** | Who asked |
| `invitee_id` | uuid → `attendees` **ON DELETE CASCADE** | Who answers |
| `topic` | text | Short, non-whitespace (FR-629) |
| `status` | enum | `pending` \| `confirmed` \| `declined` \| `cancelled` |
| `created_at`, `answered_at` | timestamptz | |

**`lapsed` is NOT a status.** It is derived at read time from the slot instant (FR-634). A stored
value would need a scheduled sweep to maintain it, and this feature deliberately introduces **no
background job**.

**Constraints**

- `check (proposer_id <> invitee_id)`.
- `check (btrim(topic) <> '')` — the disabled-confirm rule is a client obligation (FR-629); this is
  the server refusing to store what the client must not send.
- Partial unique on `(proposer_id, slot_id)` where `status in ('pending','confirmed')` — one live
  claim per proposer per slot, which is what makes FR-625's exclusion sound.
- Indexes on `(event_id, proposer_id)` and `(event_id, invitee_id)`.

**State transitions**

```
                    ┌──────────► confirmed ──────► cancelled
                    │  accept    (invitee)  cancel  (either party)
pending ────────────┤
(proposer creates)  │
                    └──────────► declined
                       decline
                       (invitee)

Blocking (either direction), at any time:  pending → cancelled,  confirmed → cancelled
                                           Lifting the block does NOT resurrect them.
Slot instant passes:  pending is DERIVED as lapsed and can no longer be accepted.
```

- Only the invitee may accept or decline (FR-635). A proposer attempting it is refused.
- Declining frees the slot **for the proposer**, who was the only party it was unavailable to.
  Cancelling a confirmed appointment frees it **for both** (FR-633).
- Acceptance is refused when the invitee has since acquired a conflict (FR-633a), and the message
  describes **the reader's own schedule to the reader**, so it discloses nothing.

**Deletion**: both attendee references cascade (FR-652). **Export**: appointments in both roles,
with slot, topic, status and event (FR-653).

---

## `meeting_slots` — seeded conference content

**Event scoping: PER-EVENT.** It belongs to an event day and is seeded with it.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `event_id` | uuid → `events` **ON DELETE CASCADE** | |
| `starts_at`, `ends_at` | timestamptz | Absolute instants, derived from the venue timezone at seed time (FR-624) |

- `unique (event_id, starts_at)`; index on `(event_id, starts_at)`.
- Seeded in `db/seed/network.ts` as uniform 30-minute intervals across each conference day.
- **No route creates, edits or deletes a slot** — FR-623 and Principle III.

**Coverage**: holds no attendee data, so it must be added to `NOT_ATTENDEE_DATA` in
`deletion-coverage.test.ts` **with a stated reason** (FR-654). The test asserts both that every
entry states a reason and that every entry names a table that still exists — a new table fails the
build by existing until it is classified.

---

## Availability — one query, reader-keyed inputs only

Offered slots for a reader proposing within an event:

```
meeting_slots for the event
  MINUS slots overlapping the reader's saved sessions
  MINUS slots of the reader's own PENDING proposals they SENT
  MINUS slots of the reader's CONFIRMED appointments (either role)
```

**Every input is keyed to the reader.** Nothing about the invitee enters this query — no saved
sessions, no appointments, no availability flag (FR-626). This is what SC-608a makes testable: for a
fixed reader the offered set must be identical regardless of what the invitee has saved or booked.

**A received proposal contributes nothing**, and that is load-bearing rather than an omission. If it
did, anyone could consume a stranger's whole day by proposing into it, and the throttle would bound
that without preventing it. Double-booking is caught at acceptance instead (FR-633a).

Writing it with only reader-keyed inputs makes the privacy property **structural**: a later `AND`
against invitee state would have to be added deliberately, not reached by accident.

---

## Open item carried from research — **RESOLVED during implementation (2026-08-10)**

**R4 in the spec — an appointment when a participant withdraws from the conference.**

The design position recorded here was that the record survives and *"the surface stops offering
actions on it"*. Implementation showed that doing nothing was **not safe**, and the resolution is
the opposite: **withdrawing from a conference cancels the live appointments you had at it.**

The reasoning is FR-637a's, arriving through a second door. The record is per-event and the account
still exists, so nothing cascades — but every read of an appointment passes through
`requireEventAccess`, which the departing attendee now fails. So without a write:

- the person who left **cannot see the meeting at all**, and therefore cannot cancel it; and
- the **other party still sees it as pending or confirmed**, can still accept it, and would turn up
  to meet somebody who is no longer at the conference.

That is precisely what FR-637a forbids for blocking — *a meeting you would otherwise turn up to must
be ended rather than hidden*. Cancelling is also the honest state: it happened, and it is over.

**Pending and future confirmed only**, matching `cancelAppointmentsBetween`; a meeting that has
already taken place is a fact about the past, and rewriting it would be the mistake blocking avoids
by deleting no message (FR-538). **Rejoining is not an undo**, exactly as lifting a block is not.

Implemented inline in `withdrawFromConference` rather than by calling 008's own function, because it
must run **inside that transaction**: a cancellation surviving a rolled-back withdrawal would be
worse than either outcome alone. Proven by
`tests/integration/network-block.test.ts` — *"cancels live meetings when a participant withdraws
from the conference"*.

**This makes `withdrawFromConference` the second place 008 writes into a file another feature owns**,
after `db/queries/blocks.ts`. Both are one statement, both are cancellations, and both exist for the
same reason.
