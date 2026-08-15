# Review Guide: Conference Content Authoring

**Generated**: 2026-08-12 | **Updated**: 2026-08-14 (merge of `develop`) | **Spec**: [spec.md](spec.md)

> **Read this first.** This PR carries **constitution v5.2.0**, drafted for this feature and
> **ratified by the owner on 2026-08-12** before any code was written — the same arrangement 008,
> 009 and 013 each shipped under. It is standing decisions **45–49**, and it is two decisions rather
> than one: a second notification trigger, and an organizer's authority to create a conference.
> Both are in Key Decisions below.
>
> ### Two things about the numbers, before you go looking for them
>
> **1. The amendment was drafted as v4.2.0 and its decisions as 40–44.** While this branch was open,
> `develop` ran 4.1.0 → 5.0.0 → 5.1.0 from the same base (feature 016, authored in parallel and
> merged first). 4.2.0 does not sort above 5.1.0, so on **2026-08-14** this rebased to **v5.2.0**,
> its standing decisions to **45–49**, and its register entries — drafted as 27 and 28 — to **29 and
> 30**, because 5.0.0 had already opened its own 27 and 28 on different subjects. **Nothing changed
> in substance**; the merge commit and `deviations.md` **D22** carry the full account. If you are
> reviewing against notes written before that date, subtract five from every decision number.
>
> **2. This PR is tranche 1 of an open feature, not a finished one.** Brainstorm #11 rescoped 014
> from the same parallel branch, and the owner decided on 2026-08-14 that 014 **stays open and
> grows** rather than closing here. Tranche 2 — event types, optional sessions with capacity and
> enrolment, the profile taxonomy — is specified in `spec.md`'s header and **has no tasks and no
> code**. Review this as a complete, self-contained body of work; do **not** review it as the whole
> of 014, and do not expect the spec to claim completeness.
>
> **What to distrust in this diff.** Fifteen code files auto-merged from `develop` without a
> conflict. One guard genuinely broke — `marker-not-cached.test.ts` froze the device-capability
> count at seven and 016 ratified an eighth — and it was **rewritten rather than patched to eight**,
> for reasons D22 gives. That fix exposed a latent defect in `branchPoint`, which preferred a stale
> local `develop` over `origin/develop`. Both are worth a second reader.

## Why This Change

Conference content has been seeded since 001. To move a room, somebody edits committed data and
deploys. That was tolerable while administration was out of scope; it stopped being tolerable when
v4.0.0 brought the second actor in, and it is the capability the owner asked about **first** —
013 shipped moderation ahead of it only because moderation is the smaller subsystem and proves the
architecture where being wrong costs least.

There is a sharper reason than convenience. **The database will currently destroy attendee data on
one `DELETE`.** `saved_sessions`, `session_notes`, `session_questions` and `question_votes` all
cascade from `sessions.id`, so the first authoring feature to ship a delete button — with no other
change — silently erases other people's private notes. Nothing in 013 could have caught that,
because 013 built no write path into the catalog at all.

## What Changes

An organizer authors a conference programme — tracks, rooms, speakers, sessions — in the
administrative site, for conferences they are assigned to. Both tiers can create a conference; an
organizer is assigned to what they create. Editing is **live**: there is no draft state, because a
conference is already private to whoever holds its join code.

**Deletion is replaced by cancellation the moment anyone has engaged.** A session nobody has touched
can be deleted; a session anyone has saved, noted, questioned or voted on can only be **cancelled**,
and every one of those records survives.

**MyNet changes for the first time since 013**, and only in ways every attendee sees identically: a
cancelled session reads as cancelled, "Up next" skips it, and a materially changed saved session
carries a marker and dispatches a notification.

**Breaking change**: none delivered is retracted. **New capability**: a **second notification
trigger**, the first since v3.1.0 bounded delivery to a received message.

## How It Works

**The administrative half is mostly wiring; the genuinely new mechanisms are both on the attendee
side.** That is the opposite of what the size of the diff suggests, and it is worth knowing before
you start reading.

- **A fifth branded scope.** `ConferenceAuthorityScope`, minted only by
  `requireConferenceAuthority`. 013 shipped `requireOperator` (any tier) and
  `requirePlatformOperator` (platform only); neither answers *"may this operator write to **this**
  conference"*. The write layer demands the scope, so a handler that skipped the guard does not
  compile. This is the largest piece of new construction here.
- **The write path is a new file, not a widened one.** `db/queries/admin-catalog.ts` takes the new
  scope; `catalog.ts` keeps its `EventScope` signatures and stays the attendee read path.
  **`catalog-read-only.test.ts` loses none of its assertions** — see Key Decision 3.
- **The marker is two timestamps and a comparison.** `sessions.logistics_changed_at >
  saved_sessions.viewed_at`, computed in the agenda read and carried on the existing payload. No new
  repository member, no new cached read, nothing stored per change.
- **Coalescing is keyed on the audit entry id.** One organizer act produces at most one notification
  per attendee. The act id already exists, is unique per act, and commits with it.
- **Migration `0011`: no new table.** Four columns and two indexes.

## When It Applies

**Applies when**

- A platform operator or conference organizer authors content in the administrative site
- An attendee has **saved** a session that is then cancelled, moved in time, or moved to another room
- A session with any attendee engagement is targeted for removal

**Does not apply when**

- The change is to a title, summary, track or speakers — content rather than logistics, so no
  notification (FR-1027)
- The attendee did not save the session — no marker, no dispatch (FR-1028)
- A session merely **starts** — reminders remain forbidden and are not part of the new trigger
- The reader is any attendee in MyNet — there is no authoring surface there at all (FR-1003)

## Key Decisions

1. **The trigger set is enumerated, not described.** Material means **cancelled, start time moved,
   room moved** — three cases. The principle behind them (*a push fires when a change affects where
   or whether you must be somewhere*) generated the set, but the amendment names the cases anyway.
   *Alternatives*: "any change to a saved session" — rejected, a summary typo would buzz 400 phones
   and the trigger stops being narrow by construction; adding speaker changes — rejected, it makes
   the boundary a list rather than a rule.

2. **One notification per organizer act, not per changed session.** *Alternative*: per session, the
   literal reading of the trigger — rejected because an afternoon reshuffle buzzes a phone twelve
   times. **This forced an amendment to the amendment**: a coalesced body carries a count, which is
   an aggregate over changes, and N2 as first drafted forbade that shape. N2 now states it governs
   **surfaces inside the product** — the payload may count, no view may.

3. **The catalog write path is a new file, so the read-only guard keeps every assertion.**
   *Alternative*: widen `catalog.ts` behind a scope union — rejected because the name-shape assertion
   would have to be narrowed to a permitted-write list, which is the "weakened until it stops
   checking anything" failure its own comment warns about. The invariant *"CatalogRepository is
   read-only in perpetuity"* survives **literally**, not by reinterpretation.

4. **Cancel replaces delete once engaged; the cascades are not removed.** *Alternative*: cascade with
   an informed confirmation — rejected because 009's precedent (a withdrawn question takes
   everybody's votes) was the **author** erasing their own words, and does not transfer to a third
   party erasing somebody else's.

5. **An organizer may create a conference.** v4.0.0 defined the tier's authority as reaching "only
   conferences they are assigned", which cannot describe creating one. *Alternative*: platform
   operator creates the shell — rejected as needing two people for every event. The amendment states
   the widening explicitly rather than letting it be inferred.

6. **No draft/publish lifecycle.** The join code already gates visibility; a lifecycle would be a
   second gate over a gate that exists, plus a state every read path must consult.

## Areas Needing Attention

**Three tasks are where this feature is most likely to go wrong, and all three were found during
planning rather than implementation.**

1. **T020 — the new dispatch caller must not live under `notifications/`.**
   `notification-triggers.test.ts` **excludes that directory from its scan**, because it *is* the
   dispatcher. A second trigger implemented as `notifications/session-change.ts` would pass the very
   gate written to catch it, with a green suite. The tidy placement is the one that defeats the
   guard. It belongs in `routes/admin/catalog.ts`.

2. **T024 — the act must roll back when its audit entry fails.** This project has shipped that
   defect once: 013's `appendAuditEntry` took a transaction parameter from the start and **no caller
   passed one**, so a failing entry left the act committed and unrecorded. 013 guarded it twice
   after review. Check that both guards exist here, for all five act categories.

3. **T044 — the engagement check must hold a lock.** An attendee saving a session between the check
   and the delete must not lose their row. `SELECT … FOR UPDATE` conflicts with the `FOR KEY SHARE` a
   child insert takes — 009's FR-714 mechanism. **This is the only property no layer above a real
   database can test**, so a green unit suite proves nothing about it.

**Two things to weigh rather than verify:**

- **The marker is one design decision away from the forbidden notification centre.** A per-row badge
  is correct; an "N changed" count in the top bar would satisfy every functional requirement here and
  breach N2. Absence guards run in both clients — check they strip comments before matching, or they
  fail on their own justification.
- **The programme editor is the largest desktop-first surface built since 013, and register entry 4
  is still open.** No desktop or tablet layout in this product has ever been validated by the client.
  008 turned that from a risk into an observed defect when the first dialog a human looked at was
  rendering in the top-left corner.

**Reading order**: the seven phases in `tasks.md` are a reading order for you, **not a merge
schedule**. Per brainstorm #10 this lands as one PR, matching 008, 009 and 013. Phase 2 is the
foundation and the densest; Phase 5 is the part that needs the amendment most directly.

## Open Questions

- **Register entry 29 — whether an attendee may suppress notification content.** Opened by v5.2.0,
  **promoted** from a deferral that has sat in prose since v3.1.0. A saved-session push carries a
  session title to a lock screen, so what somebody chose to attend is now visible alongside what
  somebody said to them. Accepted twice, never decided. Blocks nothing.
- **Register entry 30 — speakers are personal data about people who are not attendees.** The rows
  have existed since 002; v5.2.0 makes them organizer-authored, which moves responsibility from a
  reviewed commit to a promoted attendee typing into a form. Blocks nothing today; blocks any claim
  that Principle VIII's coverage is complete.
- **Register entry 22 gets a second cause.** A cached conference could already outlive a withdrawn
  registration by 24 hours; now an *edited* programme sits in the same cache. Still filed against
  012, and 014 does not close it.
- **Engagement counts are thin at small scale.** "1 attendee wrote a note" at a three-registrant
  conference is close to a name. Recorded in Assumptions with the mitigation (a threshold rather than
  a count) if the owner reads FR-1025 as a disclosure.

## Review Checklist

- [ ] **The code matches v5.2.0 as ratified** — both decisions, not just the notification one
- [ ] The trigger set is exactly three cases, and a session *starting* still dispatches nothing
- [ ] The dispatch caller is **not** under `notifications/` (T020)
- [ ] Act and audit entry commit together, and the act rolls back when the entry fails (T023–T025)
- [ ] The engagement check holds `FOR UPDATE` inside the deleting transaction (T044, T047)
- [ ] The engagement predicate derives from the schema, so a new table fails by existing (T017–T018)
- [ ] Every refusal without a reason is a 404, indistinguishable from a missing conference
- [ ] Explained refusals render **differently from each other** — classified on `error.code`, never
      on the class (T094)
- [ ] No aggregate count or change list in either client; no bell (T066)
- [ ] MyNet's absence guards re-proved, not assumed still true (T089)
- [ ] Both new dialogs are centred, Escape-dismissible, and restore focus (T052, T086, T096)
- [ ] The seed's two disjoint programmes and empty third conference survive (T098)
- [ ] Migration `0011`, and `meta/README.md` was moved aside before generation and restored (T001, T005)

---

# Review Guide: Conference Content Authoring — Tranche 2

**Date**: 2026-08-14 | **Spec**: [spec.md](spec.md) Part II | **Branch**: `spec/014-conference-content-authoring-tranche-2`

Everything above is tranche 1's guide, for the work merged in PR #23. This covers **tranche 2**, which
closes 014: 109 tasks (T106–T214), 93 requirements (FR-1045–FR-1099), 15 success criteria
(SC-1013–SC-1026), four user stories, one PR, one migration (`0012`).

> ## ⛔ Do not approve for implementation yet
>
> **Constitution v5.3.0 is DRAFTED and NOT RATIFIED.** It records the **fourth** Principle VIII
> privacy exception — the named enrolment roster. Reviewing the specification and plan is exactly
> what should happen now; **no line of implementation may be written until the owner ratifies it**,
> as v5.2.0 gated tranche 1 and v4.0.0 gated 013.

## Why This Change

014 shipped an organizer's ability to author a programme, and stopped there. A workshop with twenty
places, a virtual conference, and a profile that says what somebody actually does were all in the
client's original conversation and none of them exists. Attendees cannot commit to a bounded session,
organizers cannot cap one, and a conference that happens online has no way to say so — its sessions
are required to name a room nobody will walk to.

## What Changes

A conference gains a **modality** that governs what its sessions must carry, so a virtual session can
hold a joining link instead of a room. A session may be **optional with a limited number of places**,
which attendees take and release, which organizers cap and close on a deadline, and whose holders
appear to that conference's organizers by name. A profile gains a **controlled vocabulary** —
sector, subsector, interests — plus a free-text description of what somebody makes or does.

**One behaviour changes for existing attendees**: on an optional session, enrolling **replaces**
saving. There is one commitment control, not two, and no state in which somebody has bookmarked a
session without holding a place in it.

## How It Works

The administrative side is new construction — a fifth destination for the vocabulary, a conference
editor, a roster — and the attendee side is **surgery**, because enrolment does not sit beside saving:
it replaces it, so the read path every attendee surface already depends on changes underneath them.
That is the opposite of tranche 1's shape and is worth holding in mind while reading the diff.

Enrolment's correctness core is a three-statement critical section: `SELECT … FOR UPDATE` on the
session row, then a count, then the insert. Enrolment-closing derives in SQL from the session's start
and a stored hours offset — nothing is scheduled, swept, or stored as an instant.

## When It Applies

**Applies when** a conference is authored with a modality; a session is marked optional; an attendee
takes or releases a place; an organizer caps, closes, cancels or deletes such a session; or anybody
edits a profile's taxonomy fields.

**Does not apply when** a session is mandatory (saving is unchanged), or to Discover's directory —
see the note under Areas Needing Attention.

## Key Decisions

1. **Enrolment replaces saving on optional sessions**, rather than sitting beside it. The alternative
   permits "saved but holds no place", which is the state somebody glances at and believes they have
   a seat. Cost accepted: there is no way to bookmark an optional session you have not committed to.
2. **Capacity is enforced under an exclusive session-row lock, not lock-free.** Both lock-free shapes
   were evaluated and neither expresses a *cardinality* bound: insert-then-judge admits an over-count
   under commit reordering and would require deleting a committed row, which FR-1068 forbids by name;
   a unique index enforces a key, not a count.
3. **Enrolment is deliberately NOT engagement** (O2), so a session with places held may be deleted.
   This is an owner decision taken after the consequence was put to them and reaffirmed, and the
   consequence is recorded rather than softened.
4. **The enrolment deadline is relative and derived**, never stored as an instant, so it follows a
   rescheduled session with no repair step — 008's `lapsed` precedent.
5. **The taxonomy vocabulary is product-wide, not per-conference**, because a profile describes the
   person rather than their presence at one conference.

## Areas Needing Attention

**Read these first. They are where this is most likely to be wrong, or most expensive to get wrong.**

1. **T135 — the critical section is three statements and deliberately NOT one CTE.** A
   `WITH locked AS (… FOR UPDATE), held AS (SELECT count(*) …)` looks like the right shape and is
   wrong: every part of one statement shares one snapshot, so two writers serialise on the lock and
   then both compute the same **pre-lock** count. If you see this collapsed into one statement during
   implementation, that is the bug.
2. **T144–T147 — the roster is the first administrative read of attendee state this project has ever
   permitted.** All four bounds must be individually testable: only enrolment, only an assigned
   organizer, only that conference's sessions, and the attendee told before they enrol.
3. **T121 must FAIL before T122 is written.** The shipped disclosure guard does not match `enrolments`
   today, so a roster route ships green. An exemption written before the guard is widened is a
   decorative constant beside a check that never fires.
4. **T148 — a separate held-places field, never a fifth engagement count.** `countEngagement`'s
   boolean is a sum of four; adding places to it makes places-held sessions **undeletable**, which is
   the opposite of O2, and no existing guard catches it.
5. **T149 and T212 — the delete confirmation currently lies.** It decides "is anything attached?" from
   the four engagement counts, so a session with twenty places held renders *"Nobody has saved this
   session… It can be deleted outright."* This was the Critical finding at the spec-review gate.
6. **T196/T197 — the commitment set rides the EXISTING cached payload; remaining places is a SEPARATE
   live `passThrough` read.** A new `EnrolmentRepository` is the natural guess and is a silent
   staleness bug: only the repository owning the cached read can purge what an enrolment invalidates.
7. **Anything reintroducing a scheduler, a stored open/closed state, or a third notification trigger.**
   All three are forbidden and each has a guard, but two of the guards are weaker than they look.

**A note for reviewers expecting a Discover migration: there isn't one, and that is deliberate.**
Phase 0 (R18) found that interests must **not** become foreign keys — the vocabulary is a reference
table of labels, membership enforced at the write. `attendee_interests` needs **no migration** and
`listDirectory` is **not touched**. This shrank the tranche; it was not forgotten.

## Open Questions

- **Register entry 31** — whether deleting a session should notify the attendees enrolled in it. Open,
  blocking nothing, and answerable only by a third notification trigger and therefore another
  amendment.
- **Register entry 4** — desktop and tablet layouts remain unvalidated, and this tranche escalates it
  again with a fifth administrative destination and a new attendee control at the width that already
  truncates.

## Review Checklist

- [ ] Constitution v5.3.0 read, and its fourth privacy exception judged on its merits
- [ ] The critical section is three statements, not one
- [ ] The roster's four bounds are each asserted separately
- [ ] The guard widening lands before its exemption
- [ ] Held places are counted in their own field, never in the engagement sum
- [ ] The delete confirmation no longer claims nothing is attached
- [ ] No new repository for enrolment; remaining places declared `passThrough`
- [ ] No scheduler, no stored open/closed state, no third trigger
- [ ] Every falsified comment rewritten, and attendee-visible copy with it
