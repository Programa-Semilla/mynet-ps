# Phase 1 Data Model: Messages, and the Notification Delivery Platform

**Feature**: 007 | **Date**: 2026-08-07 | **Migration**: `0006` (reserved)

## The headline: seven tables, and every one of them fails the build until it is classified

006 added no table. 007 adds seven — the largest schema addition since 004 — and each arrives with
two guards already pointed at it. `tests/unit/deletion-coverage.test.ts` and
`tests/unit/export-coverage.test.ts` derive their expectations from the Drizzle schema, so **a new
table fails by existing** and a new collected column fails by existing. The classification table at
the end of this document is therefore not documentation of a decision made elsewhere; it is the
decision, and the tests are its enforcement.

The spec names six tables. This model has seven. `conversation_pairs` is the addition, and research
R10 is why: the obvious way to enforce one-conversation-per-pair retains a deleted attendee's
identifier, and this table is how the constraint is expressed without doing that.

---

## `conversations`

The exchange itself. Deliberately almost empty — it carries no title, no topic, no membership list,
and **no participant identifiers**.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `created_at` | timestamptz, not null | |
| `last_message_at` | timestamptz, null | Denormalised for FR-508's ordering. Null only in the instant between insert and first message, inside one transaction |

**Holds no attendee data.** That is the point of its emptiness: after both participants delete, a
row here would name nobody. It is still removed rather than retained (FR-575), because an
unreferenced row is litter rather than a record.

`last_message_at` is the one denormalisation in this model. Ordering the conversation list by a
subquery over `messages` is correct but pages badly; this column is written in the same transaction
as the message insert, so it cannot drift.

---

## `conversation_pairs`

The uniqueness constraint of FR-502, given a row so that it can also be cascaded.

| Column | Type | Notes |
|---|---|---|
| `conversation_id` | uuid, FK → `conversations.id`, **cascade** | |
| `lower_attendee_id` | uuid, FK → `attendees.id`, **cascade** | The numerically smaller of the two identifiers |
| `higher_attendee_id` | uuid, FK → `attendees.id`, **cascade** | The larger |

**Unique on `(lower_attendee_id, higher_attendee_id)`.** Ordering the pair makes the constraint
direction-independent, so an attempt by A to open a conversation with B collides with an existing
B–A conversation, as FR-502 requires. The unique violation *is* the enforcement — no read-then-write
check, so two simultaneous first messages cannot both win (edge case: *simultaneous first messages*).

`CHECK (lower_attendee_id < higher_attendee_id)` enforces both the ordering and FR-506 — an
attendee cannot pair with themselves, because no identifier is less than itself.

**Why not a `pair_key` column on `conversations`**: it would hold both identifiers, and when one
attendee deletes their account the surviving conversation would still contain the departed person's
identifier. FR-573 forbids retaining anything of them. Here the pair row cascades away with either
attendee and nothing is left.

---

## `conversation_participants`

One attendee's presence in one conversation, and their own read position. **This is the scoping
predicate** (FR-523) — every authorization decision in this feature resolves to the existence of a
row here.

| Column | Type | Notes |
|---|---|---|
| `conversation_id` | uuid, FK → `conversations.id`, cascade | |
| `attendee_id` | uuid, FK → `attendees.id`, **cascade** | |
| `joined_at` | timestamptz, not null | |
| `last_read_message_id` | uuid, FK → `messages.id`, null, **set null** on delete | Null until first read |

Primary key `(conversation_id, attendee_id)`. Index on `attendee_id` for the conversation-list read
— **explicitly, because Postgres does not create one for a foreign key**, which is exactly the
finding 004's review left unclaimed on its two token tables.

`last_read_message_id` rather than a timestamp: research R13, avoiding ties between messages sent in
the same millisecond. It is `ON DELETE SET NULL` rather than cascade, because the message it points
at may be the departed counterpart's and vanish under M3 — that must reset the pointer, not delete
the participation.

**A participant row is private.** FR-530 forbids disclosing a read position to the other
participant, so no read path ever projects another attendee's `last_read_message_id`.

---

## `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `conversation_id` | uuid, FK → `conversations.id`, cascade | |
| `author_id` | uuid, FK → `attendees.id`, **cascade** | The cascade that implements M3 |
| `body` | text, not null | |
| `sent_at` | timestamptz, not null | |

`CHECK (length(body) BETWEEN 1 AND 2000)` — research R12. The lower bound is FR-512's
whitespace-only refusal made structural; the body is trimmed before insert, so an all-whitespace
message cannot reach the table at all.

Index on `(conversation_id, sent_at DESC, id DESC)` — the keyset page of research R6, in its easy
form: `sent_at` is immutable, so this cursor has **no duplicates and no omissions**, unlike 006's
directory cursor.

**`author_id` cascading is the whole of M3.** Deleting an attendee removes their messages from every
conversation they participated in, including from the other person's view (FR-570), while the other
person's own rows are untouched (FR-572). Nothing renders the departed attendee because nothing
retains them (FR-573).

---

## `attendee_blocks`

| Column | Type | Notes |
|---|---|---|
| `blocker_id` | uuid, FK → `attendees.id`, **cascade** | |
| `blocked_id` | uuid, FK → `attendees.id`, **cascade** | |
| `created_at` | timestamptz, not null | |

Primary key `(blocker_id, blocked_id)`. `CHECK (blocker_id <> blocked_id)`.

**Directional, and deliberately not ordered like `conversation_pairs`.** A block by A on B and a
block by B on A are two independent rows (FR-540). Ordering the pair here would be a bug: it would
make the two indistinguishable and unblocking one would release both.

Index on `blocked_id` as well as the PK's leading `blocker_id`, because the send path asks the
reverse question — *does the recipient block me?* — on every message.

---

## `abuse_reports`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `reporter_id` | uuid, FK → `attendees.id`, **cascade** | |
| `reported_id` | uuid, FK → `attendees.id`, **cascade** | |
| `reason` | text, not null | Supplied by the reporter. Non-empty (FR-546) |
| `message_ids` | uuid[], not null | The reported messages. Deliberately **not** a foreign key |
| `created_at` | timestamptz, not null | |

**Nothing in this product may read this table** (FR-548). No route, no repository method, no screen.
It is written and then left alone; the operator reaches it out-of-band.

`message_ids` is an array rather than a join table with foreign keys, and that is deliberate: the
reported messages will frequently be deleted before anyone looks — either by M3's cascade or by the
reporter's own departure — and a foreign key would either block that deletion or silently empty the
report. An array of identifiers degrades honestly into a list of things that no longer exist.

**Cascades from both attendees and is swept at 90 days** — research R3. The durable record is the
operator's mail, not this row, which is what makes discarding it safe.

---

## `push_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `attendee_id` | uuid, FK → `attendees.id`, **cascade** | |
| `endpoint` | text, not null, **unique** | The push service's delivery address for this device |
| `p256dh_key` | text, not null | Client public key. A **credential** |
| `auth_key` | text, not null | Client auth secret. A **credential** |
| `created_at` | timestamptz, not null | |
| `last_delivered_at` | timestamptz, null | |

Unique on `endpoint`, because a device re-subscribing must replace rather than accumulate — and
because the same browser profile signed into two accounts must not deliver one attendee's messages
using the other's registration.

Index on `attendee_id`: the send path fans out to every subscription for the recipient.

**Per device, not per session** (FR-555). Signing out does not drop a subscription; revoking
permission does, and so does a permanent delivery failure (FR-557).

**The two key columns are credentials, not content.** They grant delivery to a device. They appear
in the export's subscription section **only as a redacted presence**, never as values — research
R14. Exporting them would hand over a capability rather than a record.

---

## State transitions

**A conversation has exactly two lifecycle events**, and neither is a status column:

```
(nothing)  ──first message sent──▶  open
   open    ──one participant deletes──▶  one-sided, read-only
one-sided  ──other participant deletes──▶  removed
```

There is **no `status` column**, because every state is derivable and a stored status could disagree
with the rows it summarises. "Open to sending" means two participant rows exist; "one-sided" means
one does; "removed" means none do, and FR-575 removes it. The composer's availability
(FR-574) and the choice between the starter prompt and the closed-thread explanation (FR-519 versus
FR-519a) both read that count.

**A block has no lifecycle** — the row exists or it does not. Unblocking deletes it; the history it
never touched is unaffected (FR-538).

---

## Validation rules, from the requirements

| Rule | Where enforced |
|---|---|
| Body 1–2,000 characters after trimming (FR-512, FR-517) | `CHECK` on `messages.body`, plus client-side disable |
| Exactly one conversation per pair (FR-502) | Unique constraint on `conversation_pairs` |
| No self-conversation (FR-506) | `CHECK (lower < higher)` |
| No self-block | `CHECK (blocker_id <> blocked_id)` |
| Co-attendance at creation only (FR-504, FR-505) | Query-time `EXISTS` at insert; never re-checked |
| Report reason non-empty (FR-546) | `CHECK`, plus client-side disable |
| Recipient does not block sender (FR-536) | `EXISTS` on the send path, before insert |

---

## Deletion and export coverage *(FR-576, FR-577 — the guards fail by existence)*

| Table | Deletion classification | Export |
|---|---|---|
| `conversations` | **Not attendee data.** Holds no identifier. Removed when its last participant row goes (FR-575) | Conversation identifiers appear as context on exported messages |
| `conversation_pairs` | **Cascade** from both attendee foreign keys | Not exported — it is a constraint, not a record |
| `conversation_participants` | **Cascade** from `attendee_id` | Not exported directly; `last_read_message_id` is a read position, and FR-530 makes it private even from the other participant |
| `messages` | **Cascade** from `author_id`. This cascade *is* M3 | **Authored messages only** (FR-578), with the stated exclusion note |
| `attendee_blocks` | **Cascade** from both | Blocks the attendee created |
| `abuse_reports` | **Cascade** from both, **plus a 90-day sweep** (research R3) | Reports the attendee filed |
| `push_subscriptions` | **Cascade** from `attendee_id` | Device presence and timestamps; **keys redacted** |

**No allow-list entry is required for any of them.** Every table is reached by a real foreign key
cascade, which is the outcome M3 was chosen to produce — and it is why `conversation_pairs` exists
in this form rather than as a column.

---

## Event scoping *(the constraint requires a per-table declaration; neither rule is a default)*

**All seven are cross-event**, under standing decision 7 and D1.

- `conversations`, `conversation_pairs`, `conversation_participants`, `messages` — relationships. A
  contact made at one conference must not vanish at the next (FR-507).
- `attendee_blocks` — the contact being refused is cross-event, so a block that lapsed on event
  switch would not be a block.
- `abuse_reports` — concern conduct, not a conference.
- `push_subscriptions` — a device does not attend a conference.

**Co-attendance appears exactly once in the whole model**, as an `EXISTS` at conversation creation
(FR-504), and is never stored, never re-evaluated, and never a column.

---

## Migration `0006`

Seven `CREATE TABLE`s, six foreign-key indexes Postgres does not create for us, one keyset index,
two unique constraints and four check constraints. **No table is altered and no existing column is
touched**, so the volatile-default rewrite hazard that 004's review recorded against migration
`0003` does not arise here.

`apps/api/migrations/meta/README.md` must be moved aside before regenerating, because
`drizzle-kit generate` JSON-parses every file in `meta/` — and put back afterwards.
