# Data Model: 011 Administrative Foundation

**Phase 1 output.** Migration **`0009`**. Five new tables, two altered.

Every table states **which event-scoping rule applies and why** (standing decision 7 / D1 — neither
rule is a default), and **how its records are deleted or expired** (Principle VIII, and the coverage
tests derive from the schema so a new table fails by existing).

---

## New tables

### `operators`

A platform-operator identity. Not an attendee, holds no profile, appears in no attendee surface.

| Column | Notes |
|---|---|
| `id` | uuid, pk |
| `email` | citext, **unique**, and see the cross-table constraint below |
| `display_name` | text, not null |
| `password_hash` | text, **nullable** — null means no usable credential (FR-990, FR-991) |
| `credential_is_initial` | boolean, not null, default true — false once replaced (FR-992) |
| `deactivated_at` | timestamptz, nullable — non-null ends access permanently (FR-908) |
| `created_at` | timestamptz, not null |

**Scoping**: *neither per-event nor cross-event.* An operator belongs to the **product**, not to a
conference. This is the third case standing decision 7 did not anticipate, and it is declared here
rather than defaulted — the decision demands every new table state which rule applies, and "neither,
because the subject is not conference-related" is a statement rather than a gap.

**Deletion / retention**: no attendee cascade reaches this table, because an operator has no
`attendees` row. There is **no self-serve deletion** — Principle VIII's erasure right is an
*attendee's*, and an operator is not one. Deactivation (FR-908) is the terminal state, and a
deactivated record is retained while any `admin_audit_entries` or `report_resolutions` row names it
(FR-909), then cleared by the retention sweep in `RETENTION_SWEEPS`.

**Cross-table uniqueness (FR-918)**: an address must identify at most one principal product-wide.
Postgres cannot express uniqueness across two tables with a constraint, so this is enforced by
*both* insert paths checking the other table inside their transaction, **plus** a test that drives
both paths concurrently. Recorded as a real weakness: this is application-enforced where every other
uniqueness rule in the product is database-enforced.

---

### `operator_sessions`

An administrative session. Deliberately **not** `auth_sessions` (research R3).

| Column | Notes |
|---|---|
| `id` | uuid, pk |
| `operator_id` | uuid, nullable, → `operators.id` `ON DELETE CASCADE` |
| `attendee_id` | uuid, nullable, → `attendees.id` `ON DELETE CASCADE` |
| `token_hash` | text, not null, unique |
| `created_at` | timestamptz, not null |
| `last_used_at` | timestamptz, not null |
| `idle_expires_at` | timestamptz, not null — advanced on use |
| `absolute_expires_at` | timestamptz, not null — **fixed at establishment**, never advanced |
| `revoked_at` | timestamptz, nullable |

**Exactly one of `operator_id` / `attendee_id` is non-null**, enforced by a check constraint. The two
subjects are the two tiers: a platform operator signs in as an `operators` row, a conference
organizer signs in with attendee credentials (FR-914) but still receives an *administrative* session
— which is what makes FR-912's independence from `auth_sessions` true.

**Why the absolute cap is stored rather than derived**: a configuration change must not retroactively
extend or truncate a live session. The value that applied when the session opened governs it. This is
the deliberate opposite of 008's `lapsed`, which is derived precisely because it must track the
*current* slot grid.

**Scoping**: neither. A session belongs to a principal.

**Deletion / retention**: cascades from whichever subject it names. Expired rows are cleared by the
existing session sweep.

---

### `organizer_assignments`

Authority over one conference, held by one attendee.

| Column | Notes |
|---|---|
| `id` | uuid, pk |
| `attendee_id` | uuid, not null, → `attendees.id` **`ON DELETE CASCADE`** |
| `event_id` | uuid, not null, → `events.id` **`ON DELETE NO ACTION`** (FR-937) |
| `assigned_by` | uuid, not null, → `operators.id` `ON DELETE NO ACTION` |
| `assigned_at` | timestamptz, not null |
| `revoked_at` | timestamptz, nullable |

**Unique on `(attendee_id, event_id)` where `revoked_at is null`** — a partial unique index. One live
assignment per person per conference; revoked ones are history.

**Scoping**: **per-event**, explicitly. An assignment *is* authority over one conference.

**The two references differ deliberately, and that is the design.**
`attendee_id` cascades because an attendee's erasure must take their authority with it (FR-960).
`event_id` does **not** cascade (FR-937): a surviving assignment refuses `DELETE FROM events`, so the
seed must name assignments among the things it clears (FR-938). This mirrors `shared_cards.event_id`
exactly, and the constitution predicted this feature would meet it — *"The next feature with a
non-cascading reference to seeded content will meet this."*

The reason a cascade is wrong here is stated in FR-939 and is worth repeating: **a cascade is not an
administrative write, so `admin_audit_entries` would not record it.** A re-seed would silently strip
every organizer's authority with no trace.

**Deletion / export**: reached by the attendee cascade (FR-982) and included in the attendee export
(FR-981) — an assignment is data about the attendee who holds it.

**Derived state — `unassigned`**: a conference with no live assignment. **Not stored** (FR-936),
following 008's `lapsed`. A stored flag would need a sweep to keep it true, and the one that drifted
would be the one displayed.

---

### `report_resolutions`

What an operator did about a report.

| Column | Notes |
|---|---|
| `id` | uuid, pk |
| `report_id` | uuid, not null, unique, → `abuse_reports.id` `ON DELETE CASCADE` |
| `resolved_by` | uuid, not null, → `operators.id` `ON DELETE NO ACTION` (FR-944) |
| `outcome` | text, not null, check in (`actioned`, `dismissed`) |
| `note` | text, not null |
| `resolved_at` | timestamptz, not null |

**`report_id` is unique** — this *is* FR-945's concurrency guarantee. A second resolution is a
duplicate-key violation rather than a read-then-write race, so no code path exists that could
overwrite the first by forgetting to check. Same reasoning as 009's composite primary key on
`question_votes`.

**Scoping**: follows `abuse_reports`, which is **cross-event** — 007's rule that conduct is not a
conference. Someone's behaviour does not become acceptable because they switched events.

**Deletion / retention**: cascades with its report, which itself cascades from **both** the reporter
and the reported attendee. So it needs **no retention clock** — an attendee's erasure already reaches
it. This is the deliberate contrast with `admin_audit_entries` below, and the difference is the
point: a resolution is *about a report about attendees*, while an audit entry is *about an
operator's act*.

---

### `admin_audit_entries`

Append-only record of administrative writes and of message-content disclosures.

| Column | Notes |
|---|---|
| `id` | uuid, pk |
| `operator_id` | uuid, nullable, → `operators.id` `ON DELETE SET NULL` |
| `action` | text, not null — `promote`, `demote`, `resolve_report`, `remove_question`, `deactivate_operator`, `disclose_report_content` |
| `subject_attendee_id` | uuid, **nullable, NO foreign key** — cleared on erasure (FR-997a) |
| `subject_resource_id` | uuid, nullable, no foreign key |
| `subject_kind` | text, nullable |
| `occurred_at` | timestamptz, not null |

**`subject_attendee_id` is a plain column, not a foreign key**, and this is the same shape and the
same reasoning as `abuse_reports`' reported-message array. A real FK leaves only bad options:
`CASCADE` destroys the operator's accountability record, `RESTRICT` blocks a deletion the erasure
right requires, and `SET NULL` would work but couples a retention *decision* to a constraint rather
than to a written rule.

**Pseudonymisation is an explicit statement in the account-deletion transaction**, not a database
behaviour: `UPDATE admin_audit_entries SET subject_attendee_id = NULL WHERE subject_attendee_id = $1`.
FR-997b forbids a soft-delete flag or a sentinel row, and a cleared nullable column is neither —
there is no row meaning "deleted attendee" and nothing is reconstructible. **Hashing was rejected**:
a hash of a UUID drawn from a known set is reversible by enumeration, which is a tombstone in
disguise.

**Append-only (FR-996)** is enforced by there being no update or delete path in the repository
interface, asserted by name-shape over its exports — the mechanism `CatalogRepository` already uses
for FR-191. The retention sweep is the single exception and lives outside that interface.

**Scoping**: neither. An entry belongs to the product's accountability record.

**Deletion / retention**: **no cascade reaches this table, by design.** Pseudonymised entries are
personal data about nobody identifiable, in exactly the sense `sign_in_attempts` is — pseudonymous
rather than anonymous — so Principle VIII's third rule applies and a **retention window in
`RETENTION_SWEEPS`** is the only thing that can clear them (FR-998). The window must not be shorter
than the retention of the records it explains. `deletion-coverage.test.ts` **will fail by existing**
when this table appears; its allow-list entry must record the pseudonymise-plus-clock rule, not
merely assert an exemption.

---

## Altered tables

### `abuse_reports`

No column changes. What changes is the **header comment**, which currently reads *"NOTHING IN THIS
PRODUCT MAY READ THIS TABLE (FR-548)"* and explains at length that a report-reading surface needs a
moderator, and a moderator is an organizer, the actor Principle III excludes by construction.

That comment is now **half wrong and must be amended rather than deleted**: FR-548 survives for
MyNet (FR-972), and the reading surface exists only in the administrative product, only for the
platform tier, under the third Principle VIII exception. Leaving the comment would make the next
reader believe the guard is stronger than it is; deleting it would lose the reasoning that still
governs the attendee product.

### `events`

No column changes. The `unassigned` state is derived (FR-936).

---

## Guards this migration trips, and what each must become

| Guard | Why it trips | Required amendment |
|---|---|---|
| `deletion-coverage.test.ts` | Five new tables; three not reached by the attendee cascade | Allow-list entries stating **pseudonymise-plus-clock** (audit), **deactivate-plus-clock** (operators), and cascade-from-subject (sessions) |
| `export-coverage.test.ts` | New columns collected about attendees | `organizer_assignments` enters the export (FR-981). Operator and audit records are **not** attendee data and are declared so |
| `event-scope-audit.test.ts` | Administrative routes name no conference and it **reports success otherwise** | Unchanged — the gap is closed by a *fourth* audit, not by widening this one (R5) |
| `catalog-read-only.test.ts` | Untouched by 011 | **Must stay failing-on-write.** 012 amends it, not this feature (FR-974) |
| `join-grants-nothing.test.ts` | Untouched by 011 | **Must stay in force.** 013 amends it (FR-975) |
| `qa-absences.test.ts` | 011 adds one moderation route | Narrow **by path** to permit removal under the administrative prefix only. **Do not weaken the pattern** — 009 recorded that as the natural, wrong repair |
| `no-report-read-surface.test.ts` | 011 adds a read surface | Narrow to `apps/web` + attendee API. The absence survives where FR-972 requires it |
| `repository-casts.test.ts` | New repositories | No new unchecked casts; `apps/admin` takes `@mynet/data` types directly |

---

## Retention sweeps added

| Record | Rule | Why no cascade reaches it |
|---|---|---|
| `admin_audit_entries` (pseudonymised) | Clock, ≥ retention of records explained | Subject id is deliberately not an FK (above) |
| `operators` (deactivated, unreferenced) | Clock, after no record names them | An operator has no `attendees` row |
| `operator_sessions` (expired) | Existing session sweep shape | — |
