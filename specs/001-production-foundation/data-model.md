# Phase 1 Data Model: Production Foundation Slice

**Feature**: 001-production-foundation | **Date**: 2026-08-04 | **Constitution**: v2.0.0

Six tables. Content entities — conference sessions, attendee profiles beyond identity, conversations,
appointments — belong to the slices that own them and are **not** created here (FR-039).

Every table is justified by a requirement. FR-042 forbids storing fields merely because they might
be useful, so several obvious-looking columns are deliberately absent; those omissions are called out.

---

## Entity overview

```
attendees ──1:1── attendee_credentials
    │
    ├──1:N── auth_sessions
    │
    └──1:N── registrations ──N:1── events

sign_in_attempts   (no foreign key — must record attempts against identifiers
                    that do not correspond to any attendee)
```

---

## `attendees`

The person. Identified product-wide by email (FR-025a).

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `id` | uuid | PK | — |
| `email` | citext | **UNIQUE**, not null | FR-025a, FR-025b |
| `display_name` | text | not null | FR-032 (identity visible in shell) |
| `created_at` | timestamptz | not null, default now | — |
| `updated_at` | timestamptz | not null, default now | — |

**Validation**

- Email is normalised before storage and before comparison: surrounding whitespace trimmed, compared
  case-insensitively (FR-025b). Using `citext` puts that rule in the database rather than trusting
  every call site to remember it.
- The unique constraint is **global, not per event** (FR-025a) — this is what makes one account work
  across every event and is the whole basis of the event switcher.

**Deliberately absent**: company, role, interests, networking intent, availability, avatar. All are
real product concepts from `requirements.md`, and all belong to the Discover/profile slice. Adding
them now would violate FR-042 and would guess at shapes that Open Questions 2–4 have not settled.

---

## `attendee_credentials`

Credential material, isolated in its own table.

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `attendee_id` | uuid | PK, FK → `attendees.id` ON DELETE CASCADE | — |
| `password_hash` | text | not null | FR-031 |
| `updated_at` | timestamptz | not null, default now | — |

**Why a separate table rather than a column on `attendees`**: the attendee row is read on nearly every
request to render identity; the credential hash is read only during sign-in. Separating them means the
hash never rides along in a general attendee query, so it cannot be accidentally serialised into an
API response. That is a structural defence for FR-031, not a stylistic preference.

**Validation**

- `password_hash` holds an Argon2id encoded hash including its parameters and salt (D8). The plaintext
  credential is never stored, never logged (FR-031), and never appears in `sign_in_attempts` (FR-031c).

---

## `auth_sessions`

One row per signed-in device (FR-029). Named `auth_sessions`, never `sessions`, because a *session* in
MyNet's domain language is a conference talk — clarification 1.

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `id` | uuid | PK | — |
| `attendee_id` | uuid | FK → `attendees.id` ON DELETE CASCADE, not null | FR-034 |
| `token_hash` | text | **UNIQUE**, not null | FR-026 |
| `created_at` | timestamptz | not null, default now | — |
| `last_used_at` | timestamptz | not null, default now | FR-028a |
| `expires_at` | timestamptz | not null | FR-028a, FR-028b |
| `revoked_at` | timestamptz | nullable | FR-027 |

**Validation and behaviour**

- The cookie carries an opaque high-entropy token. **Only its hash is stored**, so a database read
  does not yield usable credentials — the same reasoning as password hashing, applied to sessions.
- **Sliding expiry** (FR-028a): each authenticated request sets `last_used_at = now()` and
  `expires_at = now() + 14 days` (D17).
- A session is valid when `revoked_at IS NULL AND expires_at > now()`. Evaluated **server-side on every
  request** (FR-028b) — the client's belief about validity is never consulted.
- Sign-out sets `revoked_at` (FR-027). Rows are retained briefly for attack diagnosis, then pruned.
- Independence across devices (FR-029) is a natural consequence of one row per sign-in; no additional
  mechanism is required.

**Deliberately absent**: user agent, device name, IP. FR-029 needs sessions to be *independent*, which
separate rows already provide. A device label would be a product feature ("your active devices") that
no requirement asks for, and it is additional personal data (FR-042).

**Index**: `(attendee_id)` for revoking an attendee's sessions; `(expires_at)` for pruning.

---

## `events`

A conference.

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `id` | uuid | PK | — |
| `name` | text | not null | Key Entities |
| `location` | text | not null | Key Entities |
| `starts_on` | date | not null | Key Entities ("a span of days") |
| `ends_on` | date | not null, `>= starts_on` | Key Entities |
| `created_at` | timestamptz | not null, default now | — |

**Note**: the prototype shows "day N of M", which is derived from `starts_on`, `ends_on`, and the
current date rather than stored. Storing a day counter would go stale the moment the clock moved —
one of the prototype artifacts `CLAUDE.md` flags as not to be carried forward.

---

## `registrations`

The attendee-attends-event relationship. Determines which events appear in the workspace (FR-040).

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `id` | uuid | PK | — |
| `attendee_id` | uuid | FK → `attendees.id` ON DELETE CASCADE, not null | FR-034 |
| `event_id` | uuid | FK → `events.id`, not null | — |
| `created_at` | timestamptz | not null, default now | — |

**Constraints**

- **UNIQUE `(attendee_id, event_id)`** — an attendee attends an event once.
- Many per attendee and many per event, which is what makes multi-event switching coherent (D1 of the
  identity decision, FR-025a).

**Empty case**: an attendee with no registrations is valid and MUST render an explicit empty state,
not an error (FR-040).

---

## `sign_in_attempts`

Throttling and attack detection (FR-031a, FR-031c).

| Column | Type | Constraints | Requirement |
|---|---|---|---|
| `id` | bigserial | PK | — |
| `identifier_hash` | text | not null, indexed | FR-031a |
| `source_hash` | text | not null, indexed | FR-031a |
| `occurred_at` | timestamptz | not null, default now, indexed | FR-031a |
| `succeeded` | boolean | not null | FR-031c |

**Why hashes rather than the values**

An attempt must be recorded even when the identifier belongs to no attendee — otherwise an attacker
enumerating addresses is invisible. But storing raw email addresses that were merely *typed at* the
service would accumulate personal data about people who may not even be attendees. Storing a keyed
hash preserves the ability to count per identifier while holding no readable address. The same applies
to the request source. This is FR-042 and Principle VIII applied to a table that exists purely for
defence.

**No foreign key** to `attendees`, deliberately — attempts against non-existent identifiers are the
ones that matter most.

**Behaviour**

- Counted over a rolling window, separately by `identifier_hash` and by `source_hash` (FR-031a).
- Delay escalates with consecutive failures; **no row ever causes a permanent lock** (FR-031b).
- Source thresholds are set an order of magnitude above identifier thresholds, because a conference
  venue puts hundreds of legitimate attendees behind one address — the edge case the spec names.
- Contains no credential material (FR-031c).
- Pruned beyond the window; retention is otherwise pointless and adds risk.

**Index**: `(identifier_hash, occurred_at)`, `(source_hash, occurred_at)`.

---

## Identity scoping rule

FR-035 requires every read and write path to be scoped by the authenticated identity, enforced
server-side. Concretely, for this slice:

| Table | Scoping |
|---|---|
| `attendees` | A request may read only the row matching the authenticated `attendee_id` |
| `attendee_credentials` | Never read outside the sign-in path; never serialised |
| `auth_sessions` | Only the authenticated attendee's rows |
| `registrations` | Filtered by `attendee_id` — never by an identifier supplied by the client |
| `events` | Reachable only through the authenticated attendee's `registrations` |
| `sign_in_attempts` | Never exposed through the API at all |

**The rule that makes this testable**: no repository method in this slice accepts an `attendee_id`
argument from a caller. The authenticated identity is bound at the request boundary and threaded
through, so a handler *cannot* express "read another attendee's data" — which is why FR-036 holds
regardless of what the client asks for, and what FR-069's isolation test asserts.

---

## Migration ordering

One initial migration creates all six tables plus the `citext` extension. Generated by
`drizzle-kit generate`, committed as reviewable SQL, applied by `drizzle-kit migrate` (D6).

`drizzle-kit push` MUST NOT be used anywhere, including local development — it changes a database
without producing a reviewable artifact, which is exactly what the constitution prohibits.

## Seed data

Administrative provisioning only (spec Assumptions — interim, pending Open Question 1). A seed script
creates at least **two** attendees with **different** event registrations, because FR-069's isolation
test and User Story 1's independent test both require two identities to be meaningful. Seed data is
for local development and per-PR preview branches; it never runs against an environment holding real
attendee data.
