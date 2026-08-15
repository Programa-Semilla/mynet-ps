# Brainstorm: Conference content authoring — tranche 2, and the change that closes 014

**Date:** 2026-08-14
**Status:** active

## Problem Framing

014 is **open**. Tranche 1 — tracks, rooms, speakers, sessions, the second notification trigger and
the per-row change marker — merged to `develop` on 2026-08-14 in PR
[#23](https://github.com/Programa-Semilla/mynet-ps/pull/23) with migration `0011` and constitution
v5.2.0. The owner decided the same day that **014 stays open and grows** rather than closing at what
was built, honouring brainstorm #11's *"rescoped and kept whole"* literally.

Tranche 2 is that growth, and it is **the change that closes 014**. Its scope note in
`specs/014-conference-content-authoring/spec.md` is emphatic that it must not be started by
inference: *"It needs the same route every feature takes — requirements written against the REQ
ranges above, a plan, a task list, and the Feature Declarations rows discharged a second time."*
This document is the first step of that route.

**The spec's own account of what blocks tranche 2 is out of date, and correcting it is the first
finding.** The scope note says the profile taxonomy *"waits on the client's interest, sector and
subsector lists, which do not exist."* Two things cut against that:

1. **REQ-035 supplies the sector list verbatim** — Servicios, Comercio, Industria, Agro.
2. **Brainstorm #11 decision item 6 already ruled** that *"the taxonomy is authored or seeded data,
   not a spec constant, so 014 is not held hostage to it."*

What is actually missing is the **subsector** lists (REQ-036) and the **interests** list (REQ-033) —
*content for a surface*, not a prerequisite for building one. So the row is not blocked, and
tranche 2 can carry all three rows and close the feature.

### What is already built, and is therefore not tranche 2's work

Verified against source, not inferred:

- **REQ-012's "short description" already exists** as `sessions.summary`
  (`apps/api/src/db/schema/catalog.ts:176`), bounded at 2000 characters by the authoring route
  (`apps/api/src/routes/admin/catalog.ts:691`) and already projected to attendees.
- **REQ-014's "presenters" already exist as `speakers`** — a per-event table
  (`catalog.ts:125-138`), many-to-many through `session_speakers` (`catalog.ts:290-304`), with
  `createSpeaker`/`updateSpeaker`/`deleteSpeaker` and their routes shipped in tranche 1.

REQ-014 is satisfied unless the client means something beyond name, title and company.

### What collides with shipped code

Every one of these is a specific file asserting something tranche 2 contradicts. They are listed
because this project's discipline is that **the comment is the record**, and 016's most transferable
review finding was that a requirement whose subject is prose *"is brightest exactly where it is
blindest."*

| Collision | Location |
|---|---|
| `sessions` header declares *"no capacity, no attendance… not named by any requirement"* | `apps/api/src/db/schema/catalog.ts:155` |
| `room_id` is `NOT NULL` — a virtual session has nowhere to go | `apps/api/src/db/schema/catalog.ts:171` |
| Taxonomy refused because *"a fixed taxonomy would be an organizer-authored artifact, and Principle III puts that out of scope"* — **premise reversed by v4.0.0** | `apps/api/src/db/schema/profiles.ts:147-149` |
| `ENGAGEMENT_TABLES` pinned to **exactly four**; a table referencing `sessions` and `attendees` fails the build by existing | `apps/api/tests/unit/engagement-coverage.test.ts:246-261` |
| `attendeesToNotify` fans out over `saved_sessions` **alone** | `apps/api/src/db/queries/session-changes.ts:223-225` |
| `no-draft-state.test.ts` bans `status\|state\|stage\|phase` columns in `catalog.ts`/`events.ts` | `:107-121` |
| `no-attendee-state-disclosure.test.ts` fails any `/admin` route matching `attendees\|saves\|notes\|votes` — *"a path is a promise"* | `:277-300` |
| `profile-uneditable.test.ts` forbids the string `profile` appearing **at all** in `administration.ts` | `:179-192` |
| **REQ-027 (mandatory profile at sign-up) contradicts shipped FR-336** — *"an incomplete profile is valid"* | `specs/004-attendee-identity-and-profile/spec.md:592-593` |
| `patchConference` has **no caller** in `apps/admin/src` — an event type would be uncorrectable | verified by grep |

### Seeds folded in from the idea inbox

At the owner's direction, three inbox groups tagged `spec/014-conference-content-authoring` are
carried into this brainstorm rather than left to a later session:

- **`migration-lock-window-under-live-traffic`** — `0011` held `ACCESS EXCLUSIVE` on `sessions` and
  `saved_sessions` for the duration of unrelated index builds in the same transaction. Tranche 2
  alters `sessions` again.
- **`migration-number-reservation-policy`** — reserve-in-advance has now collided three times.
- **`admin-conference-list-is-unpaginated`** — its own words: *"014 is the feature that makes
  `events` grow at runtime."* Tranche 2 adds per-session enrolment reads on top.
- **`cancelled-session-time-edits-still-notify`** and **`coalescing-is-structurally-unreachable`** —
  both bear on how enrolment interacts with the second notification trigger.

## Approaches Considered

### A: One amendment, three sequential PRs onto `develop`

- Pros: matches every prior amendment-gated feature (v3.2.0/008, v3.3.0/009, v4.0.0/013,
  v5.2.0/tranche 1); each PR reviewable as a unit; avoids the held-branch cost that made tranche 1
  reconcile five separate numbering tables in one session.
- Cons: three migrations, three reviews, three merge windows; the feature's reasoning is read across
  three diffs.

### B: Two waves, amendment drafted in parallel

- Pros: the event model and taxonomy need no amendment, so two thirds of the work moves immediately
  while v5.3.0 is drafted; the amendment stays off the critical path.
- Cons: splits the feature's reasoning across a gap, and puts the row that motivated the whole
  tranche last.

### C: Single PR, single migration — **chosen**

- Pros: closes 014 in one act; the whole feature reads as one unit, as tranche 1 did; one migration
  number, one review, one merge.
- Cons: a very large diff touching `sessions`, `attendee_profiles`, the Discover ranking join and
  its keyset cursor, a new repository, and a fifth administrative destination. It bundles hot-table
  locks with index builds in one transaction — the exposure `migration-lock-window-under-live-traffic`
  records. **Accepted knowingly; the mitigation is a requirement below rather than a shape change.**

## Decision

Tranche 2 carries **all three rows** and closes 014, as a **single PR with a single migration**,
gated on **constitution v5.3.0**.

### 1. Event model

- **Two orthogonal axes, not one list.** REQ-010 enumerates *seminarios, hackatones, desayunos,
  eventos empresariales, congresos, talleres, eventos virtuales, eventos presenciales* in one breath,
  but that is a **format** axis and a **modality** axis collapsed together. Modelled as one field,
  "virtual hackathon" is unsayable.
- **Modality** (in-person / virtual / hybrid) is controlled and **governs behaviour**: it decides
  whether a session carries a room or an access link.
- **Format** (seminar, hackathon, workshop, congress, breakfast, corporate) is a **descriptive
  label** with no behavioural consequence.
- **`room_id` becomes nullable** so a virtual session has a representation. `catalog.ts:166-167`'s
  claim that *"Speakers are the only optional part of a session's identity"* is thereby false and
  must be rewritten in the same change.
- **The access link gets its own validated column**, not `sessions.summary`. The client proposed the
  description field (REQ-013), but `summary` is 2000 unparsed characters rendered as a bare
  paragraph, and v5.2.0 N1 enumerates it as content that **does not notify** — so a moved join URL
  would reach nobody. A dedicated column can be validated, and can be added to the material-change
  set deliberately if that is wanted.
- **A conference editor ships with it.** `patchConference` has no caller in `apps/admin/src`, so an
  event type set at creation would be permanently uncorrectable — the same defect class D20 fixed
  for room names.
- **No neutral default.** Both columns previously added to `events` used a temporary default dropped
  in the same migration, because *"a column that keeps a silent default is how a wrong value ships
  unnoticed"* (`events.ts:36-39`, `:86-91`). Modality on existing seeded conferences gets the same
  treatment.

### 2. Optional sessions, capacity and enrolment

- **Enrol replaces save on optional sessions.** A session is either mandatory (save it, as today) or
  optional (enrol, capacity-bounded). One control per session, determined by the session's own type.
  No "saved but no seat" state can exist, so nobody can misread a bookmark as a reservation. Cost
  accepted: there is no way to bookmark an optional session you have not committed to.
- **The closing deadline is relative — N hours before start — and derived, never stored.** REQ-084
  says *"fecha/hora límite"* (absolute) while REQ-085 says *"2, 3, 5 o 24 horas"* (relative); they
  are not the same, and REQ-086's materials-prep rationale is inherently relative. Relative also
  follows a rescheduled session with no repair path, which matters because tranche 1 made a start-time
  change a notification trigger. Derived rather than stored follows 008's `lapsed`
  (`appointments.ts:56-66`) and `questions.ts:167-175` (*"THE VOTE COUNT IS NOT A COLUMN, AND MUST
  NOT BECOME ONE"*). Cost accepted: moving a session later re-opens enrolment for someone previously
  locked out.
- **Consequently tranche 2 adds no scheduler and no sweep.** The derivation must live in SQL against
  the database's `now()`, never in JavaScript inside a dispatching path — `no-session-start-trigger.test.ts:133-149`
  forbids comparing `startsAt` against `Date.now()` there, and its patterns would fire even if the
  deadline never notified.
- **No `status`/`state` column.** `no-draft-state.test.ts:107-121` bans lifecycle-shaped columns on
  conference content. Capacity is an integer and a close offset; open/closed is derived.
- **Capacity is enforced under a lock inside the writing transaction**, not by an
  application-level count-then-insert. 016's lesson is that statements handed the pool autocommit.
  **But the pool is `max: 10` with a 3s `lock_timeout`** (`client.ts:29-34`), and serialising every
  enrolment for a popular session is the traffic shape that turns that ceiling into user-visible
  500s. The lock-free alternative already in this codebase — the throttle's insert-then-count-strictly-earlier
  (`throttle.ts:927-941`) — exists for exactly this reason and should be weighed at the planning gate.
- **A capacity-full refusal carries its own error code.** 014's own recorded lesson is that
  *"classifying on the code is worth nothing unless the code says which refusal it is."* "This
  session is full" and "enrolment has closed" are facts about the reader's own action, so they are
  explained rather than folded into the agenda routes' indistinguishable 404.
- **Attendees see remaining seats** — "4 places left". Decided deliberately: it passes every existing
  guard (the change-marker count prohibition is scoped to *change* counts), but it is a count of
  other attendees' committed state, which is the family v5.2.0 N2 legislated about, so it is recorded
  rather than inherited by silence.
- **Organizers see a named roster**, and this **requires the amendment**. It reverses FR-1042 and the
  shipped `no-attendee-state-disclosure` guard, bounded to organizers assigned to the conference. It
  is what makes REQ-086 serviceable — an organizer preparing materials needs to know for whom.
- **Enrolment is NOT an engagement type for decision 49.** A session with live enrolments may be
  deleted. This is the owner's explicit decision, taken after the consequence was put to them, and
  the consequence is recorded rather than hidden: tranche 2 writes the **first `NOT_ENGAGEMENT`
  entry** into a list that is deliberately empty and whose comment requires each entry to *"say whose
  data it is and why losing it silently is acceptable."* Because enrol replaces save, an enrolled
  attendee has no `saved_sessions` row, so a deleted optional session destroys held seats with no
  notification, no marker and no trace. See Open Questions.
- **Enrolment must nevertheless join the notification fan-out.** `attendeesToNotify` reads
  `saved_sessions` alone, so without a union an attendee holding a seat in a **cancelled or moved**
  session is told nothing — the exact stranded-in-the-wrong-corridor case v5.2.0 N1 exists to
  prevent. This widens the trigger's **population**, not the trigger **set**: N1's three material
  changes are unchanged, and no third trigger is added. The distinction between population and set
  is not written down anywhere today and this feature must state it.
- **Lowering capacity below current enrolment refuses the organizer's edit**, following
  `would_orphan_sessions` and `timezone_frozen`, rather than evicting anyone. This answers the
  question brainstorm #11 left open.
- **Withdrawal from a conference must delete enrolments by hand.** Neither `saved_sessions` nor
  `session_notes` cascades from `registrations`; `account.ts:925-941` calls the gap *"invisible in
  the schema."* An enrolment left behind is a held seat nobody occupies, and `deletion-coverage`
  would report the table as fully covered.

### 3. Profile taxonomy

- **Product-wide, not per-conference.** `attendee_profiles` is deliberately cross-event because *"a
  profile describes the person, not their presence at one conference"* (`profiles.ts:9-27`), so a
  per-conference sector list would make somebody's sector reset on event switch. Cost accepted: it is
  platform-tier reference data, so `requireConferenceAuthority` (scoped to `(principal, eventId)`)
  cannot authorise it — it needs a **fifth administrative destination** at platform tier.
- **Seeded with REQ-035's four sectors** — Servicios, Comercio, Industria, Agro — and authorable, so
  the client's missing subsector and interest lists become data entry rather than a blocker.
- **All taxonomy fields stay optional. FR-336 holds and REQ-027 does not.** Shipped design creates
  the profile row on first save so *"empty profile"* has exactly one representation and
  `GET /profile` answers 200 rather than 404. Making sector or interests mandatory would retract a
  shipped requirement, need its own amendment, and render every existing attendee non-compliant.
- **`profiles.ts:147-149` must be rewritten, not deleted quietly.** Its stated reason — Principle
  III's organizer exclusion — was reversed by v4.0.0.
- **No administrative tier may write an attendee's own selections.** `profile-uneditable.test.ts`
  lists `attendees`, `attendeeProfiles`, `attendeeInterests` as personal tables. Maintaining a
  vocabulary is fine; correcting somebody's chosen sector for them is not. **Retiring a vocabulary
  value must therefore be expressible without writing to any attendee row.**
- **Naming constraint:** `administration.ts` must not contain the string `profile` at all,
  case-insensitively, comments stripped. A `ProfileTaxonomyRepository` would fail that guard even
  though a vocabulary is not a person.

### 4. Migrations

- **Numbers are claimed at generation, and the roadmap's reserved-number table is extended in the
  same change.** This ends the reserve-in-advance scheme, which has now collided three times and
  which currently reserves `0010` for 012 — a feature the working brief says adds no schema at all.
- **The lock window is mitigated rather than accepted**, since approach C bundles the work:
  a `statement_timeout` on the migration connection, `CREATE INDEX CONCURRENTLY` issued outside the
  transaction where the runner allows it, and a note in the deploy runbook. `lock_timeout` bounds
  waiting for a lock, not holding one or building an index.
- `apps/api/migrations/meta/README.md` must be moved out of `meta/` before `pnpm db:generate` runs,
  or drizzle-kit aborts JSON-parsing it. The snapshot filename follows `idx`, not the tag.

## Key Requirements

1. Modality (in-person/virtual/hybrid) is controlled and behavioural; format is a descriptive label.
2. `room_id` becomes nullable; a virtual session carries a dedicated, validated access-link column.
3. A conference editor exists, so event type and modality are correctable after creation.
4. A session is mandatory or optional; optional sessions carry an integer capacity and a relative
   close offset.
5. Enrolment replaces saving on optional sessions and appears in the Agenda identically.
6. Enrolment open/closed is derived in SQL from the database clock; no scheduler, no sweep, no stored
   lifecycle column.
7. Capacity is enforced race-safely inside the writing transaction; over-capacity must be
   unreachable, and the refusal carries its own error code.
8. Attendees see remaining seats; organizers assigned to the conference see a named roster.
9. Enrolment is excluded from the engagement set via the first `NOT_ENGAGEMENT` entry, with a written
   justification.
10. `attendeesToNotify` unions enrolments so cancelled and moved sessions reach enrolled attendees.
11. Lowering capacity below current enrolment refuses the edit.
12. Withdrawal from a conference deletes that attendee's enrolments explicitly.
13. A product-wide sector/subsector/interest vocabulary exists, seeded with REQ-035's four sectors,
    authorable at platform tier on a fifth administrative destination.
14. Taxonomy fields are optional; FR-336 is unchanged.
15. A live capacity read declares itself `passThrough`, or it silently wipes the offline cache.
16. Every comment this feature falsifies is rewritten in the same change — at minimum
    `catalog.ts:155`, `catalog.ts:166-167`, `profiles.ts:147-149`, `agenda.ts:38`, and
    `SessionPanel.tsx:311-323`'s *"a fifth section the roadmap says will never arrive"*.
17. Constitution v5.3.0 is ratified before the first line of code.

## Open Questions

- **Constitution v5.3.0 is not drafted.** It must ratify the named organizer roster (a bounded
  reversal of FR-1042), enrolment's exclusion from the engagement set, and the attendee-visible seat
  count. It gates the first line of code.
- **Deleting an optional session destroys held seats silently.** Accepted by owner decision, and the
  reason it is recorded here rather than closed: enrolled attendees have no `saved_sessions` row, so
  they receive no notification and no marker. Whether a deletion should at least notify enrollees —
  which would be a **third** notification trigger and therefore another amendment — is undecided.
- **The client's subsector and interest lists do not exist.** No longer a blocker, but the product
  ships with an empty vocabulary until they are supplied.
- **Moving interests from free text to controlled values changes the Discover ranking join and its
  keyset cursor.** The join compares text today (`directory.ts:275-284`), the ORDER BY key and the
  cursor payload derive from it, and the cursor is validated strictly and refused rather than
  ignored. In-flight cursors need a migration story.
- **Controlled interests remove the stated reason for Discover's accumulate-what-you-have-seen filter
  options**, which exists because a conference-wide list *"would disclose the shape of the
  population"* (`Discover.tsx:71-83`). A closed vocabulary is not population data, so a filter-options
  endpoint becomes defensible — but that is a behaviour change to a shipped, argued design.
- **`no-draft-state.test.ts` covers only `catalog.ts` and `events.ts`.** A new taxonomy schema file
  is outside it, so an `active`/`retired` flag on a vocabulary row would pass green. If retirement
  semantics are needed, the guard's file list must be extended in the same change.
- **No administrative read paginates**, and this feature adds per-session enrolment reads on top of
  an already-unpaginated conference list. The ceiling is worth deciding while the read paths are
  being designed.
- **Whether changing capacity or the close offset counts as a "material change"** for the second
  notification trigger. v5.2.0 N1's set is exactly three; neither is in it.
- **Carried from the idea inbox, folded into this brainstorm's framing but NOT decided here** — a
  cancelled session still dispatches *"this session has moved to a new time"* when its time or room
  is edited, because `materialChangeOf` does not qualify the trigger set by cancellation state, while
  `SessionRow` suppresses the in-app marker for cancelled rows. The push and the marker are supposed
  to agree and here they cannot. Tranche 2 touches the same fan-out (requirement 10), so it is the
  natural place to settle it — but narrowing N1 by cancellation state is a judgement about the
  amendment's scope rather than a bug fix.
- **Carried from the idea inbox, likewise not decided** — the multi-session coalescing path is
  structurally unreachable: `stampMaterialChange` is only ever called with a single session id, so
  `payloadFor`'s multi-session branch, its `count` field and the `agenda-<eventId>` tag are dead in
  the shipped product, and SC-1012's stated verification method exercises nothing. Tranche 2's
  enrolment fan-out widens the recipient population but still stamps one session at a time, so it
  does **not** on its own give the coalescing path an exerciser. A bulk edit would; none is in scope.
- **Pre-existing defect, unrelated to this scope:** `hasEngagement` has no caller in the delete path.
  `admin-catalog.ts:682-684` nominates it as *"the predicate of record"* while `:686` calls
  `countEngagement`. Same class as the four emphatic-header defects 013's review found. A tranche-2
  author extending "the predicate of record" would edit dead code.
