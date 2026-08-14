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
