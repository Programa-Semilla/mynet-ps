# Data Model: Conference Content Authoring (014)

Phase 1 output. **Migration `0011_conference_authoring.sql`.**

**No new table.** Four columns, two indexes, and one comment-level correction. This is the smallest
schema change of any feature since 010, and the reason is that authoring writes to tables that have
existed since 002 — what 014 adds is *who may write them*, which is code, not schema.

## Reserved number

**`0011`.** 013 holds `0009` and 012 reserves `0010`. The delivery roadmap's reserved-number table
stops at the shipped attendee programme and does not cover either in-flight programme; extending it
is recorded in the spec's departure note.

**Before regenerating anything**, move `apps/api/migrations/meta/README.md` aside —
`drizzle-kit generate` JSON-parses every file in `meta/`, and that README explains why the journal
lists `0003` before `0004` while carrying a later timestamp. Both halves of that oddity are
load-bearing and must not be "fixed".

---

## Columns

### `sessions.cancelled_at` — `timestamptz NULL`

Conference content. Null means the session is happening; a value means an organizer cancelled it,
and when.

**Stored, not derived, and the distinction is deliberate.** 008 derived `lapsed` from the slot
instant precisely so the feature would need no background job. Cancellation is the opposite case: it
is an organizer's *act*, not a function of the clock, so there is nothing to derive it from. A
derived cancellation would have to consult something that recorded the act — which is this column.

**Reversible** (FR-1024): setting it back to null reinstates the session and dispatches nothing.

### `sessions.logistics_changed_at` — `timestamptz NULL`

Conference content. Set whenever a **material** change lands — cancellation, start-time change, or
room change (FR-1026). Deliberately **not** set by a title, summary, track or speaker edit
(FR-1027).

Half of the marker predicate (R7). It carries no history: it is the instant of the most recent
material change, not a log of them. There is nothing here to list, which is what keeps FR-1031's
absence structural rather than a matter of restraint.

### `sessions.last_change_act_id` — `uuid NULL`, references the audit entry

Conference content. The audit entry of the act that last materially changed this session — the
coalescing key (R4).

**No foreign key constraint**, following 013's precedent for reported message ids: the audit trail
is swept on retention, so the entry can legitimately disappear while the session remains. A dangling
value is a normal state, not an error, and a foreign key would either block the sweep or cascade a
null in a way that reads like data loss.

### `saved_sessions.viewed_at` — `timestamptz NOT NULL DEFAULT now()`

**Attendee data.** The other half of the marker predicate. Set to the save instant on insert, and
updated when the attendee opens the session.

**The default is load-bearing and is not a convenience.** `saved_sessions` is
`(attendee_id, session_id)` and nothing else — there is no `created_at` to compare against — so
without defaulting to the save instant, an attendee saving a session that changed last week would
see a marker for a change that predates their interest in it (R7).

---

## Indexes

```sql
CREATE INDEX sessions_event_cancelled_idx ON sessions (event_id, cancelled_at);
CREATE INDEX saved_sessions_session_id_idx ON saved_sessions (session_id);
```

The first serves the programme read, which now filters or flags on cancellation for every attendee
surface.

**The second is the one that matters, and it closes a defect this feature would otherwise
introduce.** `saved_sessions` is keyed `(attendee_id, session_id)`, so the primary key serves
*"what has this attendee saved"* and cannot serve *"who saved this session"* — which is the query
the notification fan-out runs on every material change. Without it, cancelling one session
sequentially scans every saved session in the product. This is the same shape as the two unclaimed
defects from 004's review, where neither token table indexed `attendee_id` because PostgreSQL does
not create one for a foreign key.

---

## Deletion, export, and retention

Both coverage tests derive expectations from the Drizzle schema, so **each new column fails by
existing** until it is declared. FR-1018a adds a third schema-derived guard alongside them.

| Column | Classification | Deletion | Export |
|---|---|---|---|
| `sessions.cancelled_at` | Conference content | Not attendee data. No cascade from `attendees`, and none is wanted — a cancelled session survives every attendee leaving | Not exported |
| `sessions.logistics_changed_at` | Conference content | As above | Not exported |
| `sessions.last_change_act_id` | Conference content | As above. Swept with the audit trail it points at, leaving a dangling value that is a normal state | Not exported |
| `saved_sessions.viewed_at` | **Attendee data** | Already covered: `saved_sessions` cascades from `attendees` **and** from `sessions`. The column adds no new reachability problem | **Exported**, alongside the saved session it belongs to. A new column on an exported table must appear or `export-coverage.test.ts` fails |

**No retention rule is needed.** Nothing here is a record no cascade can reach, which is what
`RETENTION_SWEEPS` exists for.

---

## The engagement predicate

Not a column — a **query shape with a guard**, and the guard is what FR-1018a actually asks for.

A session is *engaged with* when any row exists in a table that references both `sessions` and
`attendees`. Today:

| Table | Reference to `sessions` | Reference to `attendees` |
|---|---|---|
| `saved_sessions` | direct, `cascade` | direct, `cascade` |
| `session_notes` | direct, `cascade` | direct, `cascade` |
| `session_questions` | direct, `cascade` | direct, `cascade` |
| `question_votes` | **one hop**, via `session_questions` | direct, `cascade` |

`engagement-coverage.test.ts` derives this set from the schema and fails when a table matching the
shape is absent from the predicate (R5). **The one-hop case is enumerated explicitly rather than
computed by transitive closure**, because closure over the whole schema sweeps in tables that are
merely reachable rather than genuinely attendee state about a session.

**Every one of these cascades from `sessions.id` today**, which is exactly why FR-1019 exists: the
database will happily destroy all four, silently, on one `DELETE`. The cascades are *not* removed —
they remain correct for the case FR-1018 still permits, where nothing is attached — and the
protection is the refusal plus the lock (R6), not a change to the referential rules.

---

## What is deliberately absent

- **No `session_changes` table.** It is the notification centre's data model, and building it would
  put the surface one small ask away (R7).
- **No per-attendee delivery record.** The fan-out reads `saved_sessions` and dispatches; nothing
  records that it did. A delivery log is a read surface FR-1031 forbids.
- **No draft or published column** (FR-1040, v4.2.0 N4). The join code is already the gate.
- **No `cancelled_by` column.** The audit entry records who acted, and duplicating it on the row
  would be a second source of truth for a fact the trail already answers — 009's reasoning for
  refusing a denormalised vote counter.
- **No conference deletion** (FR-1011), so no soft-delete column on `events`.
