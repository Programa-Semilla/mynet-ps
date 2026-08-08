# Phase 1 Data Model: Discover, and the Deployment Platform It Runs On

**Feature**: 006 | **Date**: 2026-08-07 | **Migration**: `0005`

## The headline: nothing is added

**No new table. No new column.** This is the first feature since 001 to store no new shape of
attendee data, and it is what keeps the two structural guards green without an allow-list entry:

- `tests/unit/deletion-coverage.test.ts` fails when a table storing attendee data has neither a
  cascade from `attendees` nor a declared retention rule. **No new table, so nothing new to reach.**
- `tests/unit/export-coverage.test.ts` fails when a column is collected without export coverage.
  **No new column, so nothing new to export.**

Both derive their expectations from the Drizzle schema, so a new table or column would fail *by
existing*. Research D3's derived-key decision is what preserves this — a stored
`avatar_card_object_key` column would have been a new column collecting attendee data, and would have
required either exporting a second copy of an already-exported image or writing an allow-list entry
justifying the omission.

## Entities read, not created

| Entity | Table | Role in this feature |
|---|---|---|
| Attendee | `attendees` | Identity, `email_verified_at`, `discoverable`, `avatar_object_key` |
| Attendee profile | `attendee_profiles` | Company, role, headline, networking intent, availability |
| Attendee interest | `attendee_interests` | One row per interest. **Both** the filter and the ranking signal |
| Registration | `registrations` | Bounds the directory to one conference, on both sides |
| Event | `events` | The active conference; also the join-code index finding |
| Stored object | `stored_objects` | Avatar bytes, under keys `storage/service.ts` defines |

`attendee_interests` being a table rather than an array column is not this feature's decision — 004
made it, and its schema comment names the reason: *"because 006 filters a directory on interests and
a join is what makes that an index scan rather than a sequential unnest of every attendee."* This
feature is the one that collects on that.

## Derived entity: the directory entry

Not stored. It exists only as a row of the listing query, and its lifetime is that response.

| Field | Source | Notes |
|---|---|---|
| `attendeeId` | `attendees.id` | Also the keyset tie-break and the client's de-duplication key (D4) |
| `displayName` | `attendees` | Searchable |
| `company`, `role`, `headline` | `attendee_profiles` | Searchable; `role` is also a filter |
| `networkingIntent`, `availability` | `attendee_profiles` | Displayed; never a ranking input |
| `interests` | `attendee_interests` | Displayed and filterable |
| `sharedInterestCount` | computed | `LEFT JOIN` of the candidate's interests against the reader's, counted. Zero is valid and ranks last |
| `avatar` | `stored_objects` | Card rendition, base64, embedded (FR-456). `null` when none |

**Never present, at any point, in any field**: `email`, `email_verified_at`, `discoverable`, password
material, verification or reset material. These are excluded by the query's projection *and* by
`additionalProperties: false` on the response schema — two mechanisms for one property, matching what
004 did for the single-profile response, because this is the response where getting it wrong is
silent.

## The visibility predicate

Three conditions, one `WHERE`, evaluated server-side before any field is produced — the same
predicate 004 established, applied to a set instead of a row.

1. **The reader is registered for this conference** — proven by the branded `EventScope` that only
   `requireEventAccess` can construct. The route names `:eventId`, so the route audit **fails the
   build** if the guard is absent.
2. **The target is registered for the same conference** — `registrations` join.
3. **The target is discoverable and verified** — `discoverable = true AND email_verified_at IS NOT
   NULL`.

An attendee excluded by any of the three is **absent from the response entirely**, not withheld from
display (FR-402). A response carrying a hidden attendee for the client to filter has already
disclosed them.

### What this predicate discloses, deliberately

FR-404. A listing cannot preserve the single-profile read's four-way indistinguishability: absence
from the directory tells a reader who knows someone is here that they are not registered, not
discoverable, or not verified. That is the inherent cost of the capability.

The narrowing is **bounded**: the direct profile read keeps its single indistinguishable refusal
unchanged, and the listing adds no *further* signal — no withheld-count, no total that differs from
what is shown, no distinction between a hidden attendee and a nonexistent one.

## The ranking

```
LEFT JOIN attendee_interests candidate_interest
       ON candidate_interest.attendee_id = candidate.id
      AND candidate_interest.interest IN (reader's interests)
GROUP BY candidate.id, …
ORDER BY count(candidate_interest.interest) DESC, candidate.id
```

`LEFT JOIN`, so zero-overlap attendees still appear and simply rank last. `candidate.id` as the
tie-break makes the order total and stable, which is what FR-411 requires and what the keyset cursor
needs.

**FR-413 holds structurally rather than by discipline**: the query's only input from outside the
conference is the reader's own interest set. It has no join to saved sessions, notes or messages, so
a ranking derived from private data could not be written without adding a join that review would see.

## Pagination

Keyset on `(sharedInterestCount DESC, attendeeId)`; the cursor is the last row's pair.

The one case keyset does not cover is a candidate whose score *falls* below the cursor after being
shown — they would be returned again. The server cannot fix this without snapshotting the result set,
which **FR-466 forbids**. The client de-duplicates by `attendeeId` against the list it is already
rendering (D4). That is not a cache: it is the rendered list, and it disappears with the view.

Hence FR-410a's declared asymmetry — **no duplicates ever; omissions permitted** — and its stated
reason.

## Avatar renditions

| Rendition | Size | Key | Served by |
|---|---|---|---|
| Profile | 512px (`AVATAR_DIMENSION_PX`) | `attendees.avatar_object_key` | `GET /profile/avatar`, `GET /events/:id/attendees/:id/avatar` |
| **Card** | **96px** | **Derived from the profile key** (D3) | Embedded in the directory listing |

Both are produced by `images/avatar.ts` from the uploaded bytes, through `rotate()` → `resize()` →
re-encode with no `withMetadata()`. **The card rendition must not be produced by any other path**:
FR-458 requires metadata absence to remain a property of the operation, and a second production path
is a second place EXIF stripping could regress.

**Deletion**: the existing account-deletion routine removes avatar bytes before the attendee row. It
derives and removes **both** keys (FR-460). A rendition outliving the account would silently regress
a guarantee 004 shipped.

**Backfill is a non-issue**: the product has never been deployed, so no production avatar exists. The
read-path repair (D2) exists for developer databases seeded before the change.

## Migration `0005`

Generated by `drizzle-kit generate` with **no hand-editing of `migrations/meta/`** — the migration
README confirms 006 diffs against `0004_snapshot.json` and takes index 5, and warns against
hand-writing a `0003_snapshot.json` to "fix" the gap.

| Object | Table | Serves |
|---|---|---|
| `registrations_event_id_idx` | `registrations` | The directory's primary access path. Only `attendee_id` is indexed today, and the composite unique leads with the wrong column |
| `attendee_interests_interest_idx` | `attendee_interests` | The interest filter and the overlap join |
| `attendee_verifications_attendee_id_idx` | `attendee_verifications` | 004 review finding — deletion cascade-scans it today |
| `attendee_password_resets_attendee_id_idx` | `attendee_password_resets` | Same finding, other table. One factory, so one change written twice |
| `events_join_code_lower_btrim_idx` | `events` | 004 review finding — the lookup normalises, the unique constraint does not |
| `CREATE EXTENSION IF NOT EXISTS unaccent` | — | Accent-insensitive search (D5) |

**A schema comment becomes false and must change.** `registrations` currently reads *"Every read of
this table is 'the authenticated attendee's registrations'."* This feature reads it by event.

## Event scoping

| Data | Rule | Reason |
|---|---|---|
| The directory listing | **Per-event** | It is a view over conference registrations. Standing decision 7 names the Discover directory explicitly as conference content. It swaps entirely on conference switch (FR-401a) |
| The card avatar rendition | **Cross-event** | A property of the person, not of any conference — the same rule the profile it belongs to follows. Re-encoding per conference would be storage without meaning |

**No existing table's scoping changes.**
