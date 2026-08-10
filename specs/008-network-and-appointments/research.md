# Phase 0 Research: Network — Contacts, Exchanged Cards, and Appointments

**Feature**: 008 · **Date**: 2026-08-10 · **Spec**: [spec.md](./spec.md)

Resolves the specification's Open Questions 2–6 and the technical unknowns behind them. Every
decision here is checked against code that exists rather than against recollection.

---

## R1 — Card routes need a third branded scope and a third audit

**Decision**: add `apps/api/src/plugins/card-access.ts` defining a nominal `CardScope` and a
`requireHeldCard` guard, plus `apps/api/tests/unit/card-audit.test.ts` as a **third** route audit.
Mirror `plugins/participation.ts` and `tests/unit/participation-audit.test.ts` in shape.

**Rationale**: this judgement was already made one level up and recorded, so following it is cheaper
than re-litigating it. `participation.ts` says in its own header why widening was rejected: two
predicates in one test would "conflate two different predicates in one test and make the failure
message name the wrong requirement". The same argument applies again, and the danger is identical —
`event-scope-audit.test.ts` matches a route by `:eventId` in the path or an event-naming schema
property, so **a card route naming no conference is never examined, and the audit reports success.**

**A correction 008 must make to 007's own comments.** Both `plugins/participation.ts` and
`tests/unit/participation-audit.test.ts` state that *"008's appointments are the first feature that
will inherit this"*, and `participation-audit.test.ts` elaborates: *"008's appointments — which are
also cross-event and also two-party"*. **Appointments are not cross-event.** Standing decision 7,
now reinforced by constitution v3.2.0, puts appointments on the per-event side; it is **cards** that
are cross-event and two-party. The prediction was reasonable when written and is wrong, and leaving
it would send the next reader to the wrong guard. 008 corrects both comments in place.

**The predicate is directional, unlike participation.** Conversation participation is symmetric —
either owner may read. A card is held by exactly one side: `requireHeldCard` asks "does the reader
hold a card *from* this attendee", never the reverse. This is why it is a distinct guard rather than
`requireParticipation` with a different table.

**Alternatives considered**:

- *Generalise `participation.ts` into a parameterised two-party relation scope.* Rejected on 007's
  own recorded reasoning, and because the predicate is directional here while participation is
  symmetric — the generalisation would have to carry a direction flag, which is the conflation the
  original refusal was about.
- *Widen `event-scope-audit`.* Rejected in 007 and still rejected. It is the audit whose silent pass
  created this whole class of problem.
- *No guard; scope inside each query.* Rejected. `participation-audit` keeps a short allow-list for
  exactly this, and each entry must state why; a whole feature is not an allow-list entry.

---

## R2 — Appointment routes name their event, so the existing audit covers them

**Decision**: register appointment routes **beneath the event** — `/events/:eventId/appointments`
and `/events/:eventId/appointments/:appointmentId` — guarded by `requireEventAccess`, with a
participant check inside the query. No new audit.

**Rationale**: appointments are per-event (FR-639, decision 7). A route naming `:eventId` is
*examined* by `event-scope-audit`, so the guarantee that already exists applies unchanged. This is
the cheapest correct answer and it needs nothing new.

**The trap this avoids, stated so nobody undoes it**: registering them as `/appointments/:id`
instead would name no conference, and the event audit would **silently pass** them — the exact hole
R1 exists to close for cards. Appointment routes are per-event *and must look it in the URL*. The
route shape is load-bearing, not cosmetic.

`requireEventAccess` alone is insufficient — it proves the reader is registered for the conference,
not that they are party to this appointment. FR-636 needs both, and the second half is a condition
in the query returning 404 rather than 403, matching the four-way indistinguishability 006
established and 007 inherited.

---

## R3 — Meeting slots are seeded rows, not generated arithmetic

**Decision**: a `meeting_slots` table holding `(event_id, starts_at, ends_at)`, seeded per event day
in `apps/api/src/db/seed/`. Uniform 30-minute intervals across the conference day, a handful per
day, identical in shape for every seeded event.

**Rationale**: FR-623 requires slots to be seeded, versioned conference content with no interface
for creating or editing them, which rows satisfy directly. Rows also make availability a **join**
against saved sessions and appointments rather than arithmetic generated at request time and then
compared — and FR-625's exclusion is a set difference, which SQL does well and application code does
verbosely.

Storing a slot *definition* on the event (start, end, duration) and generating instances was
considered. It stores less, but every consumer must then generate identically, and the availability
query becomes generate-then-subtract in application code. The seed is committed and versioned
either way, so the saving is not real.

Slots are absolute instants derived from the event's timezone at seed time, following 002's rule
that session times are stored as instants and all relative wording is computed at display time
(FR-624).

**Seed data is per event and lives in its own file** — `seed/network.ts` — following the per-domain
seed split 002 established. It touches no neighbour's file.

---

## R4 — Offline: appointments cached, contacts refused, no new cache key

**Decision**: wrap the appointments repository with the existing `cached` decorator under
`conferencePrefix`; leave the cards/contacts repository **out** of the decorator entirely, with the
refusal written as a comment at the composition root beside the member it applies to.

**Rationale**: this answers by refusal the question 007 deferred here. The decorator is keyed
`(attendeeId, eventId, resource)`; appointments are per-event and are the attendee's own
commitments, so the key fits them exactly as it fits saved sessions. Contacts are cross-event and
resolving one reads **another person's live profile** — the argument that made Discover uncached in
006. Refusing means **no event-less key variant is needed**, and the deferred question closes
without widening the cache contract.

`packages/data/src/http/cached.ts` already passes through every method not named in `reads`, and
writes are never cached and never queued, so FR-649 needs no new mechanism.

**The declaration must be per member and visible**, following 007, which declared its refusal at the
composition root rather than achieving it by omission. An omission looks identical to an oversight.

---

## R5 — Idempotency needs a plain directional unique, not the ordered-pair trick

**Decision**: `shared_cards` carries `unique (sharer_id, recipient_id)`.

**Rationale**: worth recording because the neighbouring table looks like a precedent and is not.
`conversationPairs` normalises to `(lower_attendee_id, higher_attendee_id)` with a check constraint
enforcing the ordering, because a conversation is **symmetric** — A–B and B–A are the same
conversation, and without normalisation the unique index permits both rows.

A shared card is **directional** (FR-602). A→B and B→A are two different, both-valid facts: each
person has shared with the other. So the ordering machinery is not merely unnecessary here, it would
be **wrong** — it would make a reciprocal exchange impossible.

FR-604's idempotency is then the plain unique plus an upsert that leaves the original `shared_at`
intact, so re-sharing does not refresh a timestamp and cannot be used as a repeated signal.

---

## R6 — Blocking must write, and this is the one place 008 edits 007's code

**Decision**: `apps/api/src/db/queries/blocks.ts` gains a call into an appointments function that
cancels pending proposals and future confirmed appointments between the pair (FR-637a). Recorded as
a deliberate cross-feature edit with the reason.

**Rationale**: FR-637a requires cancellation, which is a write, and the only moment we know a block
happened is when it is created. The read-time alternative — treating appointments between blocked
parties as cancelled when displayed — was considered and rejected on two grounds: it leaves stored
state disagreeing with displayed state, and lifting a block would **resurrect** the appointment,
which FR-637a forbids.

This is the smallest possible contact surface: one call, in the module that owns blocking, to a
function 008 owns. It does not touch the block route, the block schema, or any 007 test.

**Card severing needs no write.** FR-608, FR-612 and FR-616 are read-side conditions — resolution
joins against `blocks` — which is also what makes a lifted block restore the contact automatically,
as the spec's Assumptions require. The asymmetry between cards (read-side, reversible) and
appointments (write-side, permanent) is exactly the asymmetry the spec declares.

---

## R7 — Migration `0007`: two attendee tables, one content table

**Decision**: one migration adding `shared_cards`, `appointments`, and `meeting_slots`, plus the
indexes each needs.

**Coverage consequences, which fail the build by existing**:

- `shared_cards` and `appointments` reference `attendees` on **two** columns each, all four
  `ON DELETE CASCADE` — satisfying `deletion-coverage.test.ts` without an allow-list entry.
- `meeting_slots` holds no attendee data and must be added to **`NOT_ATTENDEE_DATA`** in
  `deletion-coverage.test.ts` **with a stated reason** — the test asserts that every allow-list entry
  states a reason and that every entry names a table that still exists (FR-654).
- `export-coverage.test.ts` needs the new columns covered; no new column is added to `attendees`,
  because the contact line was withdrawn.
- No `RETENTION_SWEEPS` entry: every new attendee row is reachable by cascade.

**Regeneration hazard**: `apps/api/migrations/meta/README.md` must be moved aside before
`drizzle-kit generate`, which JSON-parses every file in `meta/`, and the journal's deliberate
`0003`/`0004` ordering must not be "corrected".

---

## R8 — `lapsed` is derived, so 008 introduces no scheduled job

**Decision**: the stored status is `pending | confirmed | declined | cancelled`. Lapsed is computed
from the slot instant at read time (FR-634).

**Rationale**: a stored `lapsed` would need a sweep to maintain, and `RETENTION_SWEEPS` is the only
scheduled machinery in the product — it exists for data a cascade cannot reach, which is not this.
Deriving keeps the feature free of background work entirely.

---

## R9 — Client extension points are all append-only, and none is shared with 009

**Decision**:

- `apps/web/src/app/navigation.ts` — append `element` and `children` to the **Network entry only**.
  Its `purpose` already reads "Saved contacts, exchanged cards, and scheduled appointments" and is
  accurate, so unlike Agenda's it needs no correction.
- `apps/web/src/app/home/registry.ts` — one import, one array entry, for the appointment summary
  card. Nothing above it is edited or reordered.
- `packages/data/src/interfaces/` — new `cards.ts` and `appointments.ts`, per the per-domain split.
- `packages/platform` `Repositories` — two lines; `registry.tsx` untouched.

**Parallel-safety with 009**: 009 extends the Agenda entry in `navigation.ts` and adds a section to
005's session panel; 008 extends the Network entry and adds a Home card. The only file both touch is
`navigation.ts`, on **different lines of different entries** — a one-line-against-one-line conflict
at worst, which is the registry design working as intended.

---

## R10 — Availability is one query, and its inputs are the reader's alone

**Decision**: offered slots = `meeting_slots` for the event day, minus slots overlapping the
reader's saved sessions, the reader's **sent** pending proposals, and the reader's confirmed
appointments in either role.

**Rationale**: FR-625 and FR-626 together, and SC-608a makes the guarantee testable — for a fixed
reader the offered set must be a function of that reader's commitments alone. Writing it as one
query with only reader-keyed inputs makes the property structural rather than something a later
`AND` could quietly break. A received proposal contributes nothing, which is what stops one attendee
consuming another's day; double-booking is caught instead at acceptance (FR-633a).

---

## Resolved specification questions

| Spec Open Question | Resolution |
|---|---|
| 2 — card scope and a fourth audit | **R1**: third branded scope, third audit, mirroring 007. Appointments need neither (**R2**). |
| 3 — slot grid seed shape | **R3**: seeded rows, uniform 30-minute intervals, own seed file. |
| 4 — appointment when a participant withdraws | Deferred to design: see [data-model.md](./data-model.md). The record is per-event and survives; the surface stops offering actions on it. |
| 5 — copy for a card resolving to nothing | Not a research question. The entry disappears by cascade (FR-651), so there is no state needing copy — this closes rather than defers. |
| 6 — reviewable phase split | Deferred to after `/speckit-tasks`, against the real task list, as 007 did. |

## Remaining unknowns

**None blocking.** No `NEEDS CLARIFICATION` survives into Phase 1.
