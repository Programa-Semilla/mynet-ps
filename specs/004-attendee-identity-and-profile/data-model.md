# Data Model: Attendee Identity, Personal Data and Profile

**Feature**: 004 · **Migration**: `0003_attendee_identity_and_profile.sql` — one migration, the only
number available (spec, Context note).

Every table below states its scoping rule and why, per the constitution's requirement that neither
per-event nor cross-event be assumed. Every table also states how it is reached by **deletion** and
by **export**, which constitution v2.3.0 makes a per-feature duty.

---

## Changes to existing tables

### `attendees` — three columns added

| Column | Type | Notes |
|---|---|---|
| `email_verified_at` | `timestamptz null` | Null means unverified. A nullable timestamp rather than a boolean: it answers "is it verified" *and* "since when" with one column, and there is no state where the two could disagree. |
| `discoverable` | `boolean not null default true` | FR-359. Defaults on (Assumptions), which is safe only because verification is also required — an account defaulted to discoverable appears to nobody until its owner proves they can receive mail. |
| `avatar_object_key` | `text null` | The `StorageService` key. Null means no avatar; the fallback renders. Not a URL — a URL would bind the row to a provider that register entry 11 has not chosen. |

**Deletion**: the row itself is deleted, so these go with it. **Export**: all three appear;
`avatar_object_key` is replaced in the export by the bytes themselves (D11).

### `events` — one column added

| Column | Type | Notes |
|---|---|---|
| `join_code` | `text not null unique` | FR-311, D7. Plain text — FR-317a disclaims confidentiality, and hashing would defeat the unique constraint. Compared after `trim().toLowerCase()`, following `normaliseEmail`'s precedent. |

**Not attendee data.** Not exported, not deleted with any account. The migration adds it with a
temporary default so existing rows stay valid, then drops the default in the same migration — the
pattern `events.timezone` established in 002, and for the same reason: a column that keeps a silent
default is how a wrong value ships unnoticed.

### `sign_in_attempts` — one column added

| Column | Type | Notes |
|---|---|---|
| `action` | `text not null default 'sign_in'` | D2, FR-307a. One of `sign_in`, `sign_up`, `join_code`, `reset_request`. Every count filters on it, so exhausting one action's allowance cannot consume another's. |

The existing indexes are extended to lead with `action`, so each action's counting query stays a
single index scan. The temporary default backfills existing rows as `sign_in` — which is what they
are — and is then dropped.

**Deletion**: deliberately **not** reached by any cascade, and deliberately not deleted on account
deletion (D10) — otherwise deleting an account becomes a way to clear one's own trail. **Retention**:
the existing two-hour sweep, which FR-382 forbids lengthening.

---

## New tables

### `attendee_profiles`

One row per attendee, created on first save rather than at sign-up — an attendee who has written
nothing has no row, so "empty profile" has exactly one representation.

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | `uuid pk → attendees.id on delete cascade` | |
| `company` | `text null` | |
| `role` | `text null` | |
| `headline` | `text null` | |
| `networking_intent` | `text null` | Constrained to stated options (Assumptions), by `CHECK` — 006 filters on it, and free text cannot be filtered on meaningfully. |
| `availability` | `text null` | Same, one of `available` / `busy`. |
| `updated_at` | `timestamptz not null default now()` | |

**Length limits are `CHECK` constraints, not only route schemas** (FR-337). `session_notes` set this
precedent deliberately: the column constrains independently of the route that also enforces it,
because client-side presentation of a limit is never the enforcement of it, and a second write path
may appear later.

**Scoping: cross-event.** A profile describes the person, not their presence at one conference. A
per-conference profile would mean a professional identity that resets when the attendee switches
events, which is not the product `requirements.md` describes.

**Deletion**: cascade. **Export**: every column.

### `attendee_interests`

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | `uuid → attendees.id on delete cascade` | |
| `interest` | `text not null` | |
| | `primary key (attendee_id, interest)` | Idempotent by construction — adding the same interest twice cannot produce a second row, the same argument `saved_sessions` makes. |

A table rather than an array column, because 006 filters on interests and a join is what makes that
an index scan. Bounded in count and in length by `CHECK`.

**Scoping: cross-event**, as the profile. **Deletion**: cascade. **Export**: as a list.

### `attendee_verifications` and `attendee_password_resets`

Two tables with the same shape, deliberately not one table with a `purpose` column — they have
different lifetimes (FR-320: 24 hours; FR-328: 1 hour), different invalidation rules (FR-329 applies
only to resets), and merging them would put a discriminator on the security-sensitive path where a
missing `WHERE` clause lets a verification link complete a password reset.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `attendee_id` | `uuid → attendees.id on delete cascade` | |
| `token_hash` | `text not null unique` | SHA-256 of an opaque 256-bit token (D4). The plaintext is never stored. |
| `expires_at` | `timestamptz not null` | |
| `consumed_at` | `timestamptz null` | Single use (FR-320, FR-328). |
| `created_at` | `timestamptz not null default now()` | |

**Scoping: cross-event** — a property of the account.

**Deletion**: cascade. **Retention**: swept once expired or consumed (FR-384), as a second line
rather than the only one.

### `stored_objects`

The development, test and preview implementation of `StorageService` (D3). The production adapter
replaces this table with a bucket and is not part of this feature.

| Column | Type | Notes |
|---|---|---|
| `key` | `text pk` | |
| `content_type` | `text not null` | |
| `bytes` | `bytea not null` | |
| `created_at` | `timestamptz not null default now()` | |

**No foreign key to `attendees`, deliberately.** The adapter is a key-value store and must not know
what its callers store — a foreign key here would make the abstraction a lie, since the production
adapter cannot have one.

**Deletion**: **not** by cascade. The delete path removes the object explicitly, before the attendee
row, so a failure orphans a row pointing at a missing object rather than bytes no row references
(D10). **This is the single case FR-370's structural guard exists to catch**, and it is why that
guard is a requirement rather than a note.

---

## What the deletion cascade covers

Deleting one `attendees` row removes, by existing or new `ON DELETE CASCADE`:

`attendee_credentials` · `auth_sessions` · `active_event` · `registrations` · `saved_sessions` ·
`session_notes` · `attendee_profiles` · `attendee_interests` · `attendee_verifications` ·
`attendee_password_resets`

Not covered, and handled explicitly:

- **`stored_objects`** — deleted by the application, first, in the same operation (D10).
- **`sign_in_attempts`** — never deleted per-account, by design. Expires on the sweep (D1).

## What withdrawing from a conference covers (FR-317c)

Deleting a `registrations` row does **not** cascade to `saved_sessions` or `session_notes`, because
both reference `sessions` rather than `registrations`. Withdrawal must delete them explicitly,
scoped to that conference, plus the `active_event` row if it names it. Recorded here because it is
precisely the kind of gap that is invisible in the schema and obvious in a data model.

## Migration notes

One migration, `0003`. Ordering within it matters in one place: `sign_in_attempts.action` and
`events.join_code` are both added with a temporary default and then have the default dropped, so
existing rows stay valid without the column keeping a default that would let a future insert omit it
silently.

Per Principle VII, `0003` must be verified in CI — applied forward against a real database with the
integration suite run against the result — before it reaches any environment holding real data.
