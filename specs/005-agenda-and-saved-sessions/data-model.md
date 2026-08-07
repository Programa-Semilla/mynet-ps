# Phase 1 Data Model: Agenda and Saved Sessions

**Feature**: 005 | **Migration**: `0004_saved_sessions_and_notes.sql` | **Constitution**: v2.2.0

Two tables. Both **per-event** under standing decision 7, and both state why — neither rule is a
default that may be assumed.

---

## `saved_sessions`

The fact that one attendee intends to attend one session.

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | `uuid` | FK → `attendees.id`, **`ON DELETE CASCADE`** |
| `session_id` | `uuid` | FK → `sessions.id`, `ON DELETE CASCADE` |
| `saved_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- **Primary key**: `(attendee_id, session_id)` — composite. This *is* FR-187's idempotency: saving
  twice cannot create a second row, enforced by the schema rather than by handler logic.
- **Index**: `(attendee_id, session_id)` is the PK and serves the per-attendee read. A secondary
  index on `session_id` is **not** added — no query in this feature reads "who saved this session",
  and adding one would anticipate a feature nobody has specified.

**Event scoping — per-event, and why**: a saved session references a `session`, and sessions exist
only within one conference. The set must swap when the attendee switches (FR-185, US1 scenario 5).
There is no cross-conference notion of "the same session" to make this cross-event — 002 already
records that the same human speaking at two conferences is two unrelated records, and the same
reasoning applies here.

**The event is reached through the session, not stored again.** Denormalising `event_id` onto this
table would create a second source of truth that could disagree with `sessions.event_id`. Queries
join through `sessions` and filter on the `EventScope`'s event.

**Retention**: `ON DELETE CASCADE` from `attendees` is the mechanism behind the narrow commitment
declared in the spec — saves are deleted with the account. It is schema-level, so it cannot be
forgotten by a future deletion path.

---

## `session_notes`

One attendee's private free text against one session. **This is the product's first
attendee-authored personal content.**

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | `uuid` | FK → `attendees.id`, **`ON DELETE CASCADE`** |
| `session_id` | `uuid` | FK → `sessions.id`, `ON DELETE CASCADE` |
| `body` | `text` | `NOT NULL`, `CHECK (length(body) > 0 AND length(body) <= 10000)` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- **Primary key**: `(attendee_id, session_id)` — one note per attendee per session (Assumptions).
- **The `CHECK` carries both halves of FR-212 and FR-213.** `length > 0` means an emptied note
  cannot exist as a blank row: clearing the text **deletes** the row, so "no note" has exactly one
  representation. `length <= 10000` is D9's limit at the last line of defence, independent of the
  route schema.

**Event scoping — per-event, and why**: identical reasoning to `saved_sessions`. A note is written
against a session, not against a person or a topic. It has no meaning outside the conference that
scheduled the session.

**Privacy**: no column identifies any attendee other than the author. Nothing in this feature reads
a note the requester did not write (FR-208), and the query layer cannot express such a read because
every function takes the `EventScope`, which carries the authenticated attendee.

---

## Query layer

`apps/api/src/queries/agenda.ts`. **Every exported function takes an `EventScope` as its first
parameter** — the branded value only `requireEventAccess` can construct. A handler that skipped
verification has nothing to pass and does not compile. This is the 002 pattern, unchanged.

| Function | Returns | Notes |
|---|---|---|
| `listSavedSessionIds(scope)` | `string[]` | Joined through `sessions`, filtered to `scope.eventId` |
| `saveSession(scope, sessionId)` | `void` | `INSERT … ON CONFLICT DO NOTHING`, guarded by `WHERE EXISTS (session in this event)` |
| `unsaveSession(scope, sessionId)` | `void` | `DELETE` scoped identically |
| `listNotes(scope)` | `Array<{sessionId, body, updatedAt}>` | The attendee's notes for this conference |
| `upsertNote(scope, sessionId, body)` | `{updatedAt}` | `INSERT … ON CONFLICT DO UPDATE` |
| `deleteNote(scope, sessionId)` | `void` | Clearing the text takes this path |

**A session identifier from the client is never trusted to belong to the conference.** Each write
folds the check into the statement itself — `WHERE EXISTS (SELECT 1 FROM sessions WHERE id = $2 AND
event_id = $3)` — rather than reading the session first and then writing. A separate read-then-write
is a race, and it is also the pattern that makes a "does this exist" refusal distinguishable from a
"you may not" refusal, which FR-231 forbids.

---

## Client-side cache (not a database)

`packages/platform` `LocalCache`, backed by IndexedDB. **Not authoritative, never a substitute for
server-side authorization** (research D1, D2, D10).

| Field | Notes |
|---|---|
| key | `(attendeeId, eventId, resource)` — attendee included so a shared device cannot leak across sign-ins |
| `payload` | The domain objects, already parsed |
| `retrievedAt` | Timestamp; entries older than **24 hours** are treated as absent (FR-221) |

Purged entirely for an attendee on sign-out; purged for one `(attendee, event)` pair on an
authorization refusal.

`resource` is one of `programme`, `saved`, `notes` — three entries per conference, not one per
session, so a switch invalidates a bounded set.

---

## Seed data

**None.** Saved sessions and notes are attendee-authored, and seeding them would fabricate personal
data attributed to a real identity. The seed registry is untouched by this feature — which is also
what keeps it free of contention with 006.

The two seeded demo attendees begin with an empty agenda, which means the **empty states are what a
reviewer sees first** (FR-195, FR-225). That is deliberate: the states most likely to be skipped are
the ones on screen at first run.
