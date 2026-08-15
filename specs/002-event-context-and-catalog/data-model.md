# Data Model: Event Context, Session Catalog & Home Composition

**Feature**: 002-event-context-and-catalog | **Constitution**: v2.1.0

Every table below states which scoping rule applies to it and why, as the constitution requires.
Neither rule is a default.

---

## Scoping rules in force

| Rule | Applies to | Meaning |
|---|---|---|
| **Per-event** | Conference content | Belongs to one event, swaps when the attendee switches, unreachable without a verified registration for that event |
| **Cross-event** | Relationships and attendee-owned state | Belongs to the attendee and persists across every event |

---

## Changed: `events`

| Column | Type | Notes |
|---|---|---|
| `timezone` | `text NOT NULL` | **New.** IANA zone of the venue, e.g. `Europe/Madrid` |

**Scoping**: unchanged. An event is reachable only through the requesting attendee's registrations.

**Why the column is here and not on sessions** (FR-120, research D5, D6): the timezone is a property
of where the conference is held, not of each item on its programme. Sessions inherit it. The spec
records the limit of that assumption — a satellite session in another city would break it, and none
is in scope.

**Migration note** (research D11): added with `DEFAULT 'UTC'` so existing rows are valid, back-filled
by the seed with real zones, then the default is **dropped in the same migration**. A column that
keeps a silent default is how a wrong day number ships unnoticed.

**Validation**: must be a zone the runtime recognises. Enforced at the seed boundary rather than by a
check constraint — PostgreSQL's `pg_timezone_names` is not usable in a `CHECK`, and a wrong-but-valid
zone would pass such a constraint anyway.

---

## New: `active_event_selections`

Which event an attendee is currently working in.

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | `uuid PRIMARY KEY` | → `attendees.id`, on delete cascade |
| `event_id` | `uuid NOT NULL` | Constrained by the composite key below |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Constraints**

- `PRIMARY KEY (attendee_id)` — at most one selection per attendee. FR-100's singularity, structural.
- `FOREIGN KEY (attendee_id, event_id) → registrations (attendee_id, event_id) ON DELETE CASCADE` —
  the row **cannot** name an event the attendee is not registered for, and it disappears the moment
  the registration does. This is FR-101 as a database guarantee rather than a rule every read path
  must remember, and it is what makes US4 scenario 4 fall out without application logic. The target
  is already unique: `registrations_attendee_event_unique`.

**Scoping**: **cross-event.** It names an event but belongs to the attendee — there is exactly one
per attendee, not one per event, and it must survive a device change (FR-100). Placing it per-event
would mean an attendee could be "active" in several events at once, which is not what an active event
is.

**Absent by design**: no history of past selections, and no timestamp of first activation. Neither is
named by a requirement (Principle VIII, collect only what a requirement names).

**Derivation when absent** (FR-102, FR-103, research D4). No row means "never chosen", and the active
event is derived in SQL over the attendee's registrations:

1. **Tier**: an event in progress — `(now() AT TIME ZONE events.timezone)::date` between `starts_on`
   and `ends_on`; else the next to start; else the most recently ended.
2. **Within the tier**: `starts_on` asc, then `ends_on` asc, then `id` asc.

`id` is a generated UUID — stable, unique, unchanging — which is what FR-103 requires, and the
ordering depends on nothing that can change without the event changing.

---

## New: `tracks`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `event_id` | `uuid NOT NULL` | → `events.id` |
| `name` | `text NOT NULL` | Also rendered as text, so colour is never the sole carrier of meaning |
| `color_token` | `text NOT NULL` | A theme token **name**, e.g. `track-design` — never a colour value |

**Constraints**: `UNIQUE (event_id, name)`. Index on `event_id`.

**Scoping**: **per-event.** The constitution enumerates tracks as conference content. Two conferences
naming a track "Design" are naming two different things, categorising two different programmes.

**Why `color_token` and not a colour** (research D7): the constitution prohibits hex literals and
requires one place for the palette. A colour in the database would put the palette in two places and
let a seed change alter the design system. An unrecognised token renders as a defined neutral — a
seed typo degrades rather than breaks.

---

## New: `rooms`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `event_id` | `uuid NOT NULL` | → `events.id` |
| `name` | `text NOT NULL` | |

**Constraints**: `UNIQUE (event_id, name)`. Index on `event_id`.

**Scoping**: **per-event.** A room is a place at a venue, and the venue belongs to the conference.

**Why a table rather than free text on a session** (spec Assumptions): so a later feature can present
a room without re-modelling it, and so a typo cannot create a phantom room that appears to be a real
one.

---

## New: `speakers`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `event_id` | `uuid NOT NULL` | → `events.id` |
| `name` | `text NOT NULL` | |
| `title` | `text` | Nullable — role or headline, as the prototype shows |
| `company` | `text` | Nullable |

**Constraints**: index on `event_id`.

**Scoping**: **per-event.** The constitution enumerates speakers as conference content.

**The consequence, stated deliberately** (spec Key Entities): the same human speaking at two
conferences is **two rows with no link between them**. That is what per-event scoping means here, and
it is accepted. A speaker is seeded content and carries no credentials — it is not an attendee
profile, and feature 004 must not assume the two are the same entity or that speakers are unique
across events.

**Absent by design**: no email, no avatar, no attendee reference. None is named by a requirement, and
each would open a personal-data surface this feature has declared it does not open.

---

## New: `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `event_id` | `uuid NOT NULL` | → `events.id` |
| `track_id` | `uuid NOT NULL` | → `tracks.id` |
| `room_id` | `uuid NOT NULL` | → `rooms.id` |
| `title` | `text NOT NULL` | |
| `summary` | `text` | Nullable |
| `starts_at` | `timestamptz NOT NULL` | Absolute instant (research D6) |
| `ends_at` | `timestamptz NOT NULL` | Absolute instant |

**Constraints**

- `CHECK (ends_at > starts_at)` — a session that ends before it begins cannot exist, regardless of
  which code path inserts it. The same reasoning as the shipped `events_ends_on_after_starts_on`.
- Index on `(event_id, starts_at)` — every read is "this event's programme, in time order".

**Scoping**: **per-event.** The clearest case in the constitution's enumeration.

**Why `timestamptz` and not a local time plus the event's zone** (FR-124, research D6): the
programme is read by attendees in other timezones, and relative wording must be computed at display
time. Storing an absolute instant makes "starts in 15 minutes" a subtraction rather than a
reconstruction. Grouping into venue-local days uses the event's timezone at read time.

**A session crossing venue-local midnight** belongs to the date it starts — a consequence of grouping
by the venue-local date of `starts_at`, not a separate rule.

**`track_id` and `room_id` are NOT NULL** because FR-135 makes both required attributes of a session.
Speakers are the only optional part.

**Absent by design**: no saved state, no notes, no questions, no capacity, no attendance. 005 and 009
own the first three; the last two are not named by any requirement.

---

## New: `session_speakers`

| Column | Type | Notes |
|---|---|---|
| `session_id` | `uuid NOT NULL` | → `sessions.id`, on delete cascade |
| `speaker_id` | `uuid NOT NULL` | → `speakers.id`, on delete cascade |

**Constraints**: `PRIMARY KEY (session_id, speaker_id)`. Index on `speaker_id`.

**Scoping**: **per-event**, transitively — both sides are per-event, and a row may only join a session
and a speaker belonging to the same event. That is not expressible as a simple foreign key; it is
asserted by an integration test over the seeded data rather than claimed.

**Why many-to-many**: FR-135 says a session *may* carry speakers, and the prototype's data shows
panels with more than one. A nullable `speaker_id` on `sessions` would have made FR-138's
no-speaker case indistinguishable from a missing join.

---

## Access paths

Every per-event read follows the same shape. There is no path to conference content that does not
pass through it.

```
request  ──►  requireAttendee          identity from the session cookie (001, unchanged)
                    │                  request.attendee — never client-supplied
                    ▼
              requireEventAccess       verifies a registration for :eventId
                    │                  refuses identically to a nonexistent event (FR-148)
                    ▼
               EventScope              the only value the query layer accepts
                    │                  constructible nowhere else (research D2)
                    ▼
          listSessions(scope) …        every per-event query
```

A handler that skips the middle step has no `EventScope` and does not compile (FR-147). A route that
declares an event parameter without the guard fails the route audit (FR-149).

**Refusal semantics** (FR-148): "not registered" and "no such event" return the same status and the
same body. The verification query is a single join over `registrations`; an event that exists but is
not the attendee's produces no row, exactly as an event that does not exist produces no row, so the
two are indistinguishable without a second query nobody makes.

---

## Seed data

Per research D12, and replacing today's single `seed.ts` with per-domain modules run in declared
order (research D10).

| Event | Programme | Registered |
|---|---|---|
| Product & Design Summit (Barcelona, `Europe/Madrid`) | Full, disjoint from the other | Ada, Grace |
| Frontend Horizons (Lisbon, `Europe/Lisbon`) | Full, disjoint, **different session count** | Ada |
| Systems & Scale (Berlin, `Europe/Berlin`) | **None** | Grace |

- The two populated programmes share **no** session title, track name, room name or speaker name, and
  differ in session count — SC-107, verifiable rather than impressionistic.
- The empty event is deliberate: it is the fixture FR-139 and US2 scenario 5 need. Without it the
  empty state is untested.
- The shared event is preserved from 001, where it proves isolation follows the **registration**
  rather than the event.
- Ada's two events span one populated and one empty programme, so a single sign-in exercises both the
  populated and empty paths through a switch.

Seed data continues to run only against local development and per-PR preview databases, never against
an environment holding real attendee data.

---

## What this feature does not store

Stated so the review gate can check it against Principle VIII's "collect only what a requirement
names":

- No new personal data. The catalog is seeded conference content; the active-event selection is a
  workspace preference naming an event, not a fact about a person.
- No attendee profile fields — 004.
- No saved sessions, notes, or questions — 005 and 009.
- No selection history, no analytics, no view counts.
