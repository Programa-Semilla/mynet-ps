# API Contract Changes — 016

**Date**: 2026-08-12
**Spec**: [spec.md](../spec.md) · **Data model**: [data-model.md](../data-model.md)

The contract at `contracts/` (repository root) is **generated and committed**. This document states
what must change in it, so a reviewer can check the generated diff against an intention rather than
reading it cold.

**Two routes are affected. One changes behaviour, one changes only what it claims to mean.
No route is added and no route is removed.**

---

## 1. `POST /events/:eventId/cards` — share a card

### Behaviour change

One call now writes **two** records rather than one (FR-1021). The request is unchanged; the
response shape is unchanged; what changes is the state the call establishes.

| | Before | After |
|---|---|---|
| Records written | sharer → recipient | sharer → recipient **and** recipient → sharer |
| Atomicity | single statement | **one transaction, both rows or neither** (FR-1022) |
| Recipient acts | to reciprocate | **never** (FR-1023) |
| Guard | recipient discoverable + verified, both registered | **unchanged** (FR-1053) |

### The guard is unchanged, and that is a requirement rather than an omission

FR-1053 keeps `discoverable = true AND email_verified_at IS NOT NULL AND both registered`. It is what
keeps constitution C1's licence true — the amendment permits mutual exchange because a card resolves
only what its owner already published to co-attendees, and against a non-discoverable recipient there
is nothing published. **Relaxing it later requires an amendment, not a code review.**

### Refusals — all unchanged, and their indistinguishability is load-bearing

| Outcome | Status | Body | Note |
|---|---|---|---|
| Shared (either or both rows new) | `200` | the exchange | Idempotent; `shared_at` never refreshed |
| Blocked, either direction | `409` | **no reason** | Unchanged. FR-1028. |
| Recipient unreachable — absent, undiscoverable, unverified, or not registered | `409` | **no reason** | Identical to blocked, by construction |
| Self-share | `400` | named | A mistake worth naming |
| Not registered for `:eventId` | `403` | — | Event scope guard, unchanged |

**The outcome is read back from `shared_cards`, never from `attendees`.** `ON CONFLICT DO NOTHING`
erases the difference between "already shared" and "not reachable", so a second read is required —
and asking whether the *card* exists answers it without asking whether the *attendee* does. That
oracle-closing move is 008's and must survive.

**No notification is dispatched** (FR-1029). The trigger set stays at a received message and nothing
else, and the source-level audit enforcing it is not edited.

### Throttling — worth re-checking, not assuming

`card_share` already bounds this route. Mutual exchange doubles the **rows written per call** at the
same request rate, so the existing limit now admits twice the write volume. Whether that matters is a
question for implementation; silently inheriting the number is what this note exists to prevent.

---

## 2. `GET /cards/shared` — redefined, not changed

**Query unchanged. Rows unchanged. Guard unchanged. Description wrong.** (FR-1051)

| | Before | After |
|---|---|---|
| Summary | "Cards you have given away" | **"People who hold your card"** |
| Rows | `shared_cards WHERE sharer_id = me` | identical |
| Guard | unchanged | unchanged |

Under mutual exchange this route returns rows the reader never consciously gave, so its old summary
became false the moment C1 landed. Withdrawal was considered and rejected: it has no consumer, but it
is the only route its branded scope guard covers, and the guard is what makes adding a card-named
route safe by default.

**Nothing would have caught this.** With no consumer there is no test that fails — which is why it is
a requirement rather than a cleanup, and why the generated contract's summary must be verified in the
diff rather than assumed to follow from the code.

---

## 3. Unchanged, and each verified rather than assumed

Listed because each is a plausible casualty of this change.

- **`GET /cards/held`** — the contacts list. Returns more rows because more exist; no shape change.
- **`GET /cards/held/:attendeeId`** — card resolution. **The three absences survive**: no
  discoverability condition, no verification condition, no registration join (FR-1027). A reader
  arriving from the directory query will see this as incomplete; it is not.
- **`GET /account/export`** — both card directions already exported by two separate queries. The
  *reasoning* in its docblock changes (FR-1052); the payload does not.
- **Every Messages route.** The conversation-list refresh is a client change only — it re-calls
  `GET /conversations`, which is unchanged in every respect.
- **Every auth route.** Password reveal and confirmation are entirely client-side; the confirmation
  value is never transmitted (FR-1019), and the credential policy is untouched (FR-1020).

---

## 4. No contract change at all for four of the six stories

US1 (composer), US2 (list refresh), US3 (passwords) and US5 (install guidance) add **no route, no
parameter and no field**. US6 (icons) changes build output, not the API.

That is the expected shape: this feature is mostly client repair, and its one server-side change is
four requirements of query work behind an unchanged interface.
