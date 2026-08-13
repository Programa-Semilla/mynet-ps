# Data Model — 016

**Date**: 2026-08-12
**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## There is no schema change

**No new table, no new column, no migration.** `0010` remains reserved for 012, and the
administrative programme's reservations are untouched.

That is worth stating rather than assuming, because this feature reverses a data-model *decision*
(C1) without changing the data model. What changes is **how many rows one act writes**, and what
those rows mean.

## `shared_cards` — unchanged shape, changed semantics

The existing table is sufficient, and three of its properties turn out to have been designed for
exactly this — which is why mutual exchange costs no migration.

| Column | Type | Role under mutual exchange |
|---|---|---|
| `id` | uuid pk | Unchanged. A surrogate key with no meaning outside the database. |
| `sharer_id` | uuid → `attendees` **cascade** | **Whose card it is.** Still accurate: in the reciprocal row this is the original recipient, and it *is* their card. |
| `recipient_id` | uuid → `attendees` **cascade** | **Who holds it.** |
| `event_id` | uuid → `events`, **`ON DELETE NO ACTION`** | Where they met. A historical fact, never a scoping predicate (FR-1024). Both rows carry the same conference. |
| `shared_at` | timestamptz | When the card moved. **Set once, never refreshed.** |

### Three existing properties that make this work

**The unique constraint is directional and unnormalised** — `(sharer_id, recipient_id)` in that
order. Its docblock says normalising *"would be a bug rather than a tidy-up"*, and mutual exchange is
the case that proves it: A→B and B→A are two distinct pairs, so both rows coexist with no constraint
conflict and no schema change. Had the constraint been normalised to an unordered pair, this feature
would have needed a migration.

**`ON CONFLICT DO NOTHING` already delivers FR-1025.** Sharing where a relationship exists in one or
both directions completes without duplicating and without failing, because the constraint absorbs it.
`shared_at` stays intact for the same reason it did before — the docblock notes that refreshing it
*"would turn re-sharing into a way to signal somebody repeatedly."*

**Both foreign keys cascade from `attendees`**, so a second row is reached by deletion coverage
automatically, and export already runs **one query per direction** (`account.ts:467` and `:473`).
Coverage is satisfied by existing declarations rather than by new ones — verified rather than
assumed.

### What a row means now, and the one place it reads differently

Under one-directional sharing, every row recorded a deliberate act by `sharer_id`. Under mutual
exchange, **half the rows are written by the other party's act**: when A shares with B, the row
`(sharer=B, recipient=A)` exists although B did nothing.

The column meanings survive this — `sharer_id` is still "whose card it is", and it is still B's card.
What does not survive is the **English attached to one read path**: `GET /cards/shared` has been
documented since 008 as *cards you have given away*, and it would now return rows the reader never
gave. FR-1051 redefines it as **"people who hold your card"** — same query, same rows, corrected
meaning. See [contracts/api-changes.md](./contracts/api-changes.md).

The export's docblock has the same problem and FR-1052 covers it: it justifies disclosing held cards
by citing *"the standing consent constitution v3.2.0 (N2) established"*, and C1 reverses N2. The
behaviour is still right; the stated reason is not.

## Write path

One act, two rows, one transaction (FR-1022).

```text
shareCard(sharerId, recipientId, eventId)
  │
  ├─ reject self-share                          → 'self'      (CHECK constraint also refuses)
  ├─ reject malformed recipient                 → 'unreachable'
  │
  └─ BEGIN
       ├─ block check, BOTH directions          → 'refused'   (reasonless 409, unchanged)
       ├─ guard: recipient discoverable
       │         AND verified
       │         AND both registered for event  → FR-1053
       ├─ INSERT (sharer → recipient)  ON CONFLICT DO NOTHING
       ├─ INSERT (recipient → sharer)  ON CONFLICT DO NOTHING
       └─ COMMIT          ← both rows or neither (FR-1022)
```

**The guard is evaluated once and governs both inserts.** Evaluating it per-insert would let the two
rows disagree about whether the exchange was permitted.

**The guard is load-bearing for the amendment, not inherited convention** (FR-1053). C1 licenses
mutual exchange because a card resolves only what its owner already published to co-attendees; against
a recipient who is not discoverable, that ground does not exist. Removing the condition would need
another amendment.

**Refusals stay indistinguishable** (FR-1028). The outcome is read back from `shared_cards` rather
than from `attendees` — the oracle-closing move `blockAttendee` records — because `ON CONFLICT DO
NOTHING` erases the difference between "already shared" and "not reachable", and asking whether the
*card* exists answers it without asking whether the *attendee* does.

## Read paths

| Path | Change |
|---|---|
| Contacts — "whose cards do I hold" | **None.** Returns more rows because more exist. |
| Card resolution | **None.** Still resolves the sharer's live profile; still no discoverability condition, no verification condition, no registration join (FR-1027). |
| "Cards you have shared" | **Description only** (FR-1051). Query, rows and guard unchanged. |
| Export, both directions | **Reasoning only** (FR-1052). Both queries unchanged. |

## Client-side state (no persistence)

Two pieces of state this feature introduces, neither of which is a cache and neither of which reaches
the database.

- **Conversation list refresh state** — the rendered list, its status, and the consecutive-failure
  count. Lives for the mount, keyed by nobody, never written to disk. The same distinction
  `useConversation` and 006's `useDirectory` both had to draw. FR-1013 keeps Messages uncached.
- **Install-guidance dismissal** — remembered **per device, not per account** (FR-1035), because it
  is a fact about the device and because it must work before anybody has signed in. It stores a
  boolean and nothing about a person.

## Entities NOT introduced

Named because each is a plausible reading of the requirements that would have been wrong.

- **No "exchange" entity** pairing the two rows. The pair is derivable and a linking row would be a
  second source of truth for a fact the two rows already answer — the reasoning 009 records for vote
  counts and 008 for `lapsed`.
- **No column distinguishing an initiated share from a received one.** Considered and rejected during
  clarification: it would preserve "cards you gave" literally at the cost of the migration this
  feature otherwise avoids.
- **No stored confirm-password value** (FR-1019). It never leaves the client.
- **No stored install state.** Whether the application is installed is asked at render time, not
  recorded — it can change between sessions and a stored answer would go stale silently.
