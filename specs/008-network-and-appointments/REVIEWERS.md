# Review Guide: Network — Contacts, Exchanged Cards, and Appointments

**Generated**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Why This Change

MyNet's discovery surface is **per-event and deliberately uncached** — 006 refused to cache the
directory because a cached directory is other people's personal data ageing on a device after they
chose to be invisible. The consequence nobody had written down: **when a conference ends, nothing
durable is left behind.** Standing decision 7 has promised since 2026-08-06 that "a contact made at
last year's conference must not vanish", and as of 007 nothing kept that promise.

Network was also the last of the five destinations with no content, and it was blocked for the
entire life of the project — not by any dependency, but by two client decisions in the
constitution's register that each said in their own words that they *block the Network feature
entirely*.

## What Changes

Network becomes the durable half of the product. **A contact is someone whose digital business card
you hold** — sharing a card is now the only relationship-forming act in MyNet, and it closes register
entries 7 and 8 with a single decision. Sharing is one-directional: it gives the recipient your
card and gives you nothing. A held card resolves the sharer's **live** profile under a standing
consent that outlives both the event and their discoverability toggle.

Alongside it, appointments: per-event, proposed then accepted or declined, over a seeded slot grid.
Home gains an appointment summary card, and Discover's long-empty action boundary finally gets its
share and schedule actions.

**No breaking change to shipped behaviour.** One requirement was withdrawn *before implementation*:
a card-only contact line, cut as a breach of standing decision 16.

## How It Works

**The central technical decision is a split, and it is the opposite of what 007 predicted.**

- **Cards are cross-event**, so a card route names no conference — and `event-scope-audit` does not
  fail such a route, it **never examines it and reports success**. Cards therefore get a third
  branded scope (`CardScope`), a `requireHeldCard` guard, and a **third route audit**, mirroring
  what 007 built for conversations. The predicate is **directional** ("do you hold a card *from*
  this attendee"), unlike symmetric participation.
- **Appointments are per-event**, so they register beneath `/events/:eventId/appointments` and sit
  inside the guarantee that already exists. No new machinery.

Three tables in migration `0007`: `shared_cards` (cross-event, storing the exchange and not the
person), `appointments` (per-event), and `meeting_slots` (seeded conference content). Availability is
**one query whose every input is keyed to the reader**. Offline: appointments cached under the
existing key, contacts refused, every write refused rather than queued.

Client extension is entirely through declared append-only points — one line in `navigation.ts`, one
import and one entry in `home/registry.ts`, two lines on `Repositories`.

## When It Applies

**Applies when**:

- Two attendees share a current event and one chooses to share their card (sharing requires
  co-attendance).
- A card is already held — resolution requires **no** shared event, **no** discoverability, and
  **no** verification. This asymmetry is the feature's entire purpose.
- An appointment is proposed within a single event, by attendees both registered for it.

**Does not apply when**:

- The two attendees have blocked each other, in either direction — cards stop resolving and
  scheduling is refused.
- A contact is not registered for the **active** event: the schedule action is absent entirely
  rather than refused after the fact.
- Anything wants a notification. Nothing here dispatches one.

## Key Decisions

1. **A contact is a held card** (closes register entries 7 and 8 together). Alternatives: derive
   contacts from conversations (the prototype's model — **foreclosed by 007**, since open send makes
   a conversation unilateral, so a stranger could insert themselves into your Network with one
   message); an explicit one-sided save (invents a verb in neither `requirements.md` nor the
   prototype); the union of both (a list assembled from two rules is hard to leave).

2. **Sharing is one-directional.** Alternative: mutual on send, which matches the word "exchanged"
   and the prototype's interaction. Rejected because it captures a person's details permanently on
   somebody else's say-so, and the usual defence — that co-attendees already see each other — fails
   on the time axis, which is exactly what this feature adds.

3. **A held card is a live pointer, not a snapshot.** A snapshot needs no standing-consent rule, but
   duplicates personal data, outlives the subject's own edits, and creates a second source for one
   person. The cost is accepted and written down: resolution deliberately bypasses the directory's
   discoverability condition.

4. **Appointments take an acceptance step that conversations and cards both refused.** Deliberate
   asymmetry, not drift: a message and a card impose nothing on the other person, whereas an
   appointment claims a slot of their time.

5. **Slot availability discloses nothing about the invitee.** The delivery roadmap proposed deriving
   slots from *both parties'* saved sessions by name, and it was **rejected on Principle VIII
   grounds** — greying out somebody's committed slots tells you where they will be all day. A saved
   session is private state. The same objection killed a server-side auto-decline on conflict.

6. **A received proposal reserves nothing.** Emerged from the spec review. Both obvious readings are
   bad: if a received proposal blocks the invitee's slot, anyone can consume a stranger's day; if it
   does not, an invitee can double-accept. Fixed by separating them — availability is reader-keyed
   only, and double-booking is caught at **acceptance**, where the invitee is told about a conflict
   in *their own* schedule and nothing leaks.

7. **The card contact line was withdrawn.** The spec specified an attendee-authored field carried
   only by a shared card, on the reading that decision 16's "all-or-nothing" governed the directory
   rather than the attendee. **The owner rejected that reading.** Constitution v3.2.0 now says
   explicitly that no feature may give an individual field its own audience.

## Areas Needing Attention

**The blocking precondition.** Implementation may not begin until
`docs/unblock-008-network-and-appointments` merges — it carries constitution **v3.2.0**, which is
what closes entries 7 and 8. T001 exists to check this. Reviewing the spec against v3.1.0 will
mislead you.

**Two comment corrections in 007's files** (T023, T024). Both `plugins/participation.ts` and
`participation-audit.test.ts` state that "008's appointments are the first feature that will inherit
this", with the audit adding "which are also cross-event and also two-party". **Appointments are
per-event.** The prediction was reasonable when written and is wrong; left alone it sends the next
reader to the wrong guard. Worth confirming the correction is accurate rather than a different
mistake.

**The one cross-feature edit.** `db/queries/blocks.ts` gains a single call into
`cancelAppointmentsBetween` (T125). Blocking must *write*, because FR-637a requires cancellation.
The read-time alternative was rejected because lifting a block would resurrect a cancelled meeting.
This is the only file 008 touches that 007 owns.

**Cards and appointments treat a block differently, deliberately.** Cards **suspend** and resume on
unblock; appointments **cancel** permanently. Reasonable people could argue this is inconsistent.
The argument for it: a meeting somebody would otherwise turn up to must be ended visibly, whereas a
card is a fact about the past.

**Two success criteria read alike and guard opposite failures.** SC-605 is privacy (the invitee's
state cannot change what you are offered); SC-608a is anti-griefing (nobody can reduce your
availability). T074 and T075 each test one. The plan review found them mislabelled once already —
worth checking they have not re-converged.

**No pagination on contacts.** Assumed bounded by deliberate human acts, unlike 006's directory
which needed a keyset cursor for a thousand attendees. Stated as an assumption so it is visible if
wrong.

**Desktop and tablet remain unvalidated by the client.** The approved prototype is mobile-only at
390×844. This feature adds a two-pane Network and another modal to a growing pile of unreviewed
design.

## Open Questions

**None block implementation.** Two are recorded for the implementing session:

1. ~~**What happens to an appointment when a participant withdraws from the conference**~~ —
   **RESOLVED during implementation, and the answer is the opposite of the design position.**
   Leaving the record alone was not safe: the departing attendee fails `requireEventAccess`, so they
   cannot see or cancel the meeting, while the other party can still accept it and turn up.
   Withdrawing now **cancels** live meetings at that conference, in the same transaction, on
   FR-637a's reasoning. See `data-model.md` and the integration test that proves it.
2. **Whether 008 splits into reviewable PRs.** Deferred to the phase-split hook against the real
   task list, as 007 did. The natural seam is cards | appointments | safety and polish, since the
   two API domains share only Phase 2. Weigh it against `develop` being squash-merge only, so a
   phase's separate commits do not survive the merge — a point 002 recorded after making the same
   split and getting review isolation only at the commit level.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **v3.2.0 has merged before any implementation commit** (T001)
- [ ] **Card routes carry `requireHeldCard`** and the third audit fails without it — the existing
      event audit passes them silently
- [ ] **Appointment routes name `:eventId`** in the URL; `/appointments/:id` would land in that same
      blind spot
- [ ] **The availability query reads no invitee state** — the Principle VIII property
- [ ] **No column added to `attendees`**; the contact line stays withdrawn
- [ ] **`notification-triggers.test.ts` is unedited** — a second trigger requires an amendment
- [ ] Every new table declares its event-scoping rule *and the reason*; neither rule is a default

---

<!-- Code phase sections are appended below this line by the phase-manager command -->

## Code Review — implementation (2026-08-10)

**149 of 151 tasks complete.** T148 (the by-hand `quickstart.md` walk with two browser profiles) and
T149 (recording desktop and tablet findings from it) are **not done**, and they are the same two 007
left open. Everything the walkthrough covers is asserted automatically; the walk itself is not a
formality, because 007's scenario 5 found two defects nothing else could.

### The deep review changed this branch — read its findings first

[review-findings.md](./review-findings.md) records 40 findings from five agents, 27 fixed in one
round. **Two corrected the compliance claim**: FR-647 was half-implemented and SC-604 was unmet, so
the core journey did not complete. Three defects were serious and silent — a cache purge on opening
the scheduling dialog, an enumeration oracle on proposing, and an error classification that swallowed
every server message. One Important finding is **deliberately not fixed** and is a decision for the
owner: whether proposing should require the invitee to be discoverable.

### Where to start reading

Read these three in order — they are the feature's argument:

1. `apps/api/src/plugins/card-access.ts` — why a **third** branded scope exists, and why the
   predicate is *directional* where participation is symmetric.
2. `apps/api/src/db/queries/cards.ts` — the three **absences** that are the feature (no
   discoverability, no verification, no registration join), and why the neighbouring directory
   query having all three is not evidence that this one is incomplete.
3. `apps/api/src/db/queries/appointments.ts` — availability, and the two properties that read alike
   and guard opposite failures.

### Four gates fired during implementation, and each was the gate working

None was a surprise, and all four are worth a reviewer's attention because each records a decision
rather than a fix:

1. **`event-scope-audit.test.ts` had to be widened**, not satisfied. It demanded
   `requireEventAccess` on every attendee-naming read, and `GET /cards/held/:attendeeId` is
   cross-event by design. The acceptable predicates are now **enumerated** — event access *or* a
   held card — with the reasoning beside 004's own narrowing. **A third entry there is a third way
   to read another attendee**, which is the thing to push back on if one ever appears.
2. **The seed broke on `DELETE FROM events`.** `shared_cards.event_id` is deliberately
   `ON DELETE NO ACTION`, so a surviving card refuses the events delete with an error naming neither
   table. `seed/network.ts` clears the whole Network domain rather than only what it seeded.
3. **Home's four-state matrix failed rather than passing green.** `home-cards.test.tsx` warns that a
   card left reading an undriven default records one state four times; 008's card actually failed,
   because its empty state renders text.
4. **An end-to-end run found a real gap**: proposing a meeting from the contacts pane left the
   appointments pane beside it unchanged until a reload, which reads as the proposal having failed.
   `Network.tsx` now tells the second pane to re-read.

### The two cross-feature edits, both cancellations

008 writes into a file another feature owns in exactly **two** places, and a reviewer should be
satisfied with both:

- `db/queries/blocks.ts` — one call, cancelling live meetings on a block (FR-637a, research R6).
- `db/queries/account.ts` — one statement in `withdrawFromConference`, cancelling live meetings at
  the conference being left. **This was not in the plan**; it resolves the open question above, and
  it is inline rather than a call to 008's own function because it must share that transaction.

### What is asserted, and where

| Property | Where |
|---|---|
| Sharing is one-directional; the sharer gains nothing | `cards-share.test.ts` |
| Discoverability governs being found, not remembered | `cards-durability.test.ts` |
| Verification is never consulted in resolution | `cards-durability.test.ts`, by source inspection |
| Availability discloses nothing about the invitee (SC-605) | `appointments-slots.test.ts` |
| A received proposal consumes nothing (SC-608a) | `appointments-slots.test.ts` — **kept separate** |
| The conflict 409 describes only the reader's own diary | `appointments-answer.test.ts` |
| `lapsed` is derived and no sweep exists | `appointments-answer.test.ts` |
| Lifting a block restores the contact, not the meeting | `network-block.test.ts` |
| Contacts are never derived from conversations | `apps/web/tests/unit/network-absences.test.ts` |
| No notification is dispatched by any path | both `network-absences` files |
| A block binds on the next request (SC-608) | `e2e/network.spec.ts` |
