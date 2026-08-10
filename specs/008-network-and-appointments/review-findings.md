# Deep Review Findings

**Date:** 2026-08-10
**Branch:** feat/008-network-and-appointments
**Rounds:** 1
**Gate Outcome:** PASS
**Invocation:** quality-gate (via `speckit-spex-gates-review-code`, at the owner's explicit request)

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0 | 0 | 0 |
| Important | 16 | 15 | 1 |
| Minor | 18 | 12 | 6 |
| Notable | 6 | — | 6 |
| **Total** | **40** | **27** | **13** |

**Agents completed:** 5/5. **External tools:** none (neither CLI installed; `--no-external`).

**Stage 1 spec compliance was reported as 100% and was wrong.** Two requirements were unmet and
the review found both — see *Corrections to the Stage 1 claim* below. Real compliance at the start
of this review was **57/59**; it is 59/59 now.

## A regression the fix loop introduced, and the gate that caught it

**FINDING-41 — the fix for FINDING-1 shipped a `TypeError` to every attendee.**

`passThrough` was added so a live read is neither cached nor treated as a write. Its handler
returned the method itself, and every other branch of the decorator calls `.apply(target, …)`.
The difference is invisible against the object-literal doubles this package's unit tests use —
and fatal against the real thing: each HTTP repository holds its client in a `#private` field,
which lives on the instance and not on the Proxy wrapping it. Calling the bare method with the
Proxy as `this` throws `TypeError: Cannot read private member`.

The consequence was total, not marginal: `GET /events/{id}/slots` never left the browser, and the
scheduling dialog rendered *"Times could not be loaded. This is a problem on our side"* for
everybody. Nothing could be scheduled at all.

Unit and component suites passed. Integration passed — it exercises the API, and the API was
fine. **The e2e walkthrough is what failed**, on T143, and it failed on the assertion *before* the
one it was written for: the confirm button was not merely enabled, it did not exist, because the
dialog was in its failure state.

Fixed by binding to `target`, and the decorator's test now uses a class with a private field
rather than an object literal — the double's shape is the assertion. Reverting the bind makes it
fail with the exact `TypeError`, which was checked rather than assumed.

**What this is worth carrying forward**: the deep review found a real defect, the fix was correct
in its reasoning and wrong in its mechanics, and only the slowest gate in the chain could tell.
A fix loop that had stopped at "unit and component are green" would have shipped it.

## FINDING-42 — reported by the owner, after the gate passed

**The scheduling dialog rendered in the top-left corner of the viewport.**

A modal `<dialog>` is centred by the user-agent rule `dialog { margin: auto }`, acting inside the
`position: fixed; inset: 0` containing block `showModal()` establishes. Tailwind's Preflight sets
`margin: 0` on every element and removes it. 005's `SessionPanel` and 006's `AttendeeProfile` had
each rediscovered this and patched it locally with `m-auto`; 004's `ConfirmDialog` never did, and
008's `ScheduleDialog` was written from `ConfirmDialog`'s class string and inherited the omission.
So **two** dialogs were affected, both reachable from Network.

**No test could see it, and that is the point worth keeping.** The dialog opened, trapped focus,
closed on Escape, exposed the right accessible names, and refused to scroll sideways. T131, T133
and T135 all passed on it. `e2e/responsive.spec.ts` even measured the panel's *width* at three
widths — and never its *position*, so a dialog flush against the left edge satisfied it exactly.
Five review agents and CodeRabbit did not raise it either: nothing in the source is wrong to read.

Fixed once in the base layer rather than in four class strings, so the fifth dialog cannot repeat
it, and `responsive.spec.ts` now asserts the gaps on either side match. Reverting the rule makes
it fail with *"0px to its left and 928px to its right"* — checked, not assumed.

**This is the T148 argument, made by the thing itself.** The by-hand walkthrough is outstanding for
007 and 008 precisely because layout is what automation does not check, and the first defect a
human found was a layout defect that had passed every gate.

## Corrections to the Stage 1 claim

Recorded first, because the compliance figure was asserted confidently before the review ran.

1. **FR-647 was half-implemented.** The requirement is "readable offline from the existing cache,
   **with the retrieval time stated on the surface**". Appointments were cached; no surface
   rendered a staleness stamp, so a cache-served list was presented as if it were live — which
   SC-204 forbids outright and which is the only thing that makes an age-based cache honest.
   `StalenessStamp` now renders on the Network pane.

2. **SC-604 and User Story 3 were unmet.** Both say a meeting may be proposed "from a contact **or
   profile**", and the spec's Assumptions state plainly that *scheduling does not require holding a
   card*. Scheduling existed only in Network. Because sharing is one-directional (FR-602), the core
   journey — discover → share a card → schedule a meeting — **dead-ended at step three**: the person
   you just shared with does not become your contact, so no surface offered to schedule with them.
   `AttendeeProfile` now carries the action.

Both were found by the correctness agent. Neither was visible from the requirement-to-code
traceability matrix Stage 1 used, because both requirements *had* implementations — just not
complete ones.

## The four defects worth a reviewer's attention

### FINDING-1 — the scheduling dialog silently destroyed the offline cache

- **Severity:** Important · **Confidence:** 92 · **Category:** correctness
- **File:** `apps/web/src/app/services.ts`, `packages/data/src/http/cached.ts`
- **Source:** correctness-agent, also reported by production-readiness-agent
- **Resolution:** fixed (round 1)

**What was wrong.** `AppointmentRepository.slots` is a read that must stay live, so it was left out
of the decorator's `reads` map. The decorator classifies **everything unnamed as a write**, and a
write purges the entire `attendee:<id>|event:<id>|` prefix on success. Opening the scheduling dialog
therefore wiped the cached programme, tracks, saved sessions, notes **and** appointments for the
active conference.

**Why it matters.** It broke 005's FR-215 and this feature's own FR-647, silently. Nothing failed,
nothing was logged, the dialog worked — and the loss only appeared on the next disconnection as "a
connection is needed and nothing is stored". Every previous unnamed method really was a write, so
`slots` was the first read to fall through and the classification had no way to express it.

**How it was resolved.** `CacheOptions` gained `passThrough`, and the composition root declares
`passThrough: ['slots']`. A pass-through method is not served from the cache, not written to it, and
**purges nothing**. A unit guard asserts the declaration exists, because the failure mode is an
omission and an omission has no other signature.

### FINDING-2 — proposing was an enumeration oracle for another attendee's presence

- **Severity:** Important · **Confidence:** 88 · **Category:** security
- **File:** `apps/api/src/db/queries/appointments.ts`
- **Source:** security-agent
- **Resolution:** fixed (round 1)

**What was wrong.** When the insert affected zero rows, the follow-up query asked whether the
**invitee** was registered — 400 if they were, 404 if not. The caller controls the slot completely,
so passing any well-formed UUID that is not a slot of the event holds the reader's half constant and
the branch is selected *solely* by the invitee's registration state.

**Why it matters.** `POST /events/:eventId/appointments` with a random `slotId` became a clean probe:
400 means "this person is at this conference", 404 means they are not. No row written, nobody
notified, and it works against somebody who has turned discoverability off — the precise disclosure
Discover refuses and that `queries/blocks.ts` records having closed once already on its own route.

**How it was resolved.** The follow-up question is now asked about the **reader's own availability**.
Every other zero-row cause collapses into the same indistinguishable 404, so the 400 genuinely
describes only the caller's own diary. An integration test compares status *and body* across a
registered and an unregistered invitee.

### FINDING-3 — every server refusal rendered as the deliberately reasonless one

- **Severity:** Important · **Confidence:** 88 · **Category:** correctness
- **File:** `apps/web/src/app/network/ScheduleDialog.tsx`, `ShareCardAction.tsx`
- **Source:** correctness-agent, also reported by architecture-agent
- **Resolution:** fixed (round 1)

**What was wrong.** `ApiError extends RequestRefusedError`, and `HttpClient` throws `ApiError` for
**every** non-2xx response. Branching on `instanceof RequestRefusedError` therefore caught the 409
block, the 400, the 404, the 429 and a 500 alike.

**Why it matters.** The route writes "That time is no longer free in your schedule. Choose another
slot." specifically to be read — its own comment argues it discloses nothing because it describes the
reader's diary — and the client replaced it with the reasonless block wording. A 500 was rendered as
a refusal rather than the "problem on our side" FR-657 requires to be distinguishable. The feature was
internally inconsistent: `Appointments.tsx` got it right for the acceptance conflict.

**How it was resolved.** Both surfaces branch on `error.code`, which is the idiom `auth/Verify.tsx`
established. `refused` keeps the reasonless treatment; `validation_failed` and `too_many_attempts`
surface the server's wording verbatim; everything else is a fault on our side.

### FINDING-4 — acceptance could double-book the invitee

- **Severity:** Important · **Confidence:** 85 · **Category:** correctness
- **File:** `apps/api/src/db/queries/appointments.ts`
- **Source:** correctness-agent
- **Resolution:** fixed (round 1)

**What was wrong.** The conflict check looked only for `confirmed` rows, while availability also
subtracts the reader's own **sent pending** proposals. Reachable sequence: R proposes slot X to P;
Q proposes slot X to R; R accepts Q's — no confirmed clash exists yet — and P later accepts R's,
leaving R confirmed twice at one instant. The partial unique index cannot catch it, being keyed on
the proposer.

**How it was resolved.** The conflict predicate now mirrors `listOfferableSlots` exactly. Separately,
all three answer paths carried `AND status = '<expected>'` and **discarded the affected-row count**,
so a decline landing in the window still answered 200 "accepted" with a declined appointment; they
now use `RETURNING id` and branch on it.

## Other fixes applied

| # | Finding | Severity | Source |
|---|---|---|---|
| 5 | `contactRefused()` said "That message could not be sent." for card shares and meeting proposals — a false statement in the body and in the committed contract. Message parameterised; the `code` is untouched, which is where the reasonless-ness actually lives. | Important | architecture, correctness |
| 6 | Appointments embedded a base64 counterpart avatar that **no surface renders**, paid on Home's first viewport for every attendee on every load. Removed end to end. 007 built `/conversations/unread` as its own address for this exact reason. | Important | production-readiness |
| 7 | `NetworkOffline` hard-coded contacts' "nothing is stored on this device" and was rendered by the appointments pane, where appointments **are** cached — both halves false. The explanation is now a prop. | Important | architecture |
| 8 | A failed appointment-cancellation after a block was swallowed: the block stands, the meetings survive, no read path filters them, and nothing records it. Now logged via the request logger, following `dispatchToDevices`. | Important | production-readiness |
| 9 | The `attendeeId` query parameter on `…/slots` had no consumer at either end, put an attendee identifier into access logs and browser history, and left a plausible hook for a future author to wire into the availability computation. Removed from route, interface, repository and call site — the guarantee is stronger when the value cannot cross the wire. | Important | architecture, security |
| 10 | `Contacts.afterScheduling` re-fetched the entire contacts list — the heaviest response in the feature — after every proposal, justified by reasoning that did not describe the code. Removed. | Minor | architecture, production-readiness |
| 11 | `schema/appointments.ts` named `card-audit.test.ts` as asserting the no-slot-write guarantee; it is in `network-absences.test.ts`. In a codebase where absences-with-tests are load-bearing, a misfiled pointer is worse than none. | Minor | architecture |
| 12 | `AttendeeProfile`'s header claimed features could "register actions without editing this file". Three features have edited it; it is not a registry. Corrected. | Minor | architecture |
| 13 | `navigation.ts` still said Discover, Messages and Network "remain placeholders" and "legitimately have no element yet", twelve lines from its own entry announcing Network has content. Corrected. | Minor | architecture |
| 14 | Dead `'rejected'` state in `ScheduleDialog`'s union — now wired, as FINDING-3's fix. | Minor | architecture |
| 15 | T074/T075 vacuity: both loops were driven by fetched lists with no non-emptiness guard, so an empty list would have made each compare an unchanged set with itself. Guards added, plus an assertion that T075's proposed slots actually intersect the reader's offered set. | Minor | test-quality |
| 16 | `GET /cards/held/:attendeeId` had no test for the refusal it exists for — a card **not held** versus one that does not exist (FR-616, FR-642). The share route's equivalent was tested carefully; the read route's was not. Added, comparing bodies. | Minor | test-quality |

## Remaining findings

None blocking. One Important and six Minor are deliberately not fixed, each with a reason.

### Not fixed — Important

**Proposing does not require holding the invitee's card, and a docblock claimed it did.**
(security-agent FINDING-2, correctness-agent FINDING-6.) The claim was false and is now removed —
but the agents' suggested *fix* (enforce the card predicate) would **contradict the spec**, whose
Assumptions state that scheduling does not require holding a card and whose User Story 3 is titled
"From a contact or a profile". The security concern is real and narrower than the agents framed it:
any co-attendee holding a UUID can write a topic string into a stranger's Network and obtain a
durable live read of their display name. That is bounded by the `appointment_propose` throttle and by
the invitee being a co-attendee, and it is the behaviour the spec asks for.

**This is a product decision, not a code fix**, and it is recorded here rather than resolved:
should proposing require the invitee to be *discoverable* (as sharing does), or to have shared a
card? Either narrows the spec. Left for the owner.

### Not fixed — Minor

- **Three surfaces hand-roll the async machinery `useAsync` provides** (architecture FINDING-12).
  Real, and the split is real too: `useAsync` collapses offline and failed into one state, which
  FR-657 forbids. The right fix is extending `useAsync` with the classification — a change to a
  005-owned hook used by every card, which is not a change to make inside a review fix loop.
- **The Home card's empty copy is duplicated across two branches** (architecture FINDING-11).
  Extraction was **attempted and reverted**: it destabilised two component tests in a way that was
  not understood, and shipping a cosmetic dedup nobody can explain is worse than two copies somebody
  can read. The reason is recorded in the code.
- **The seed's `instantAt`/`zoneOffsetMs` are duplicated from `seed/catalog.ts` and have already
  diverged** (architecture FINDING-3): `asUtc - instant.getTime()` versus a second-truncating form.
  Both are correct for zero-millisecond inputs, which is all either receives. Extracting to a shared
  `venue-time.ts` is right and touches a 002-owned file; deferred rather than done unreviewed.
- **Three `appointments` predicates filter without `event_id`**, so the composite indexes do not
  apply and the planner scans (production FINDING-7). Single-digit milliseconds at this scale.
- **The export now issues fourteen parallel statements against a pool of ten** (production
  FINDING-9). 008 made an existing pattern three statements worse; bounding the fan-out is a change
  to a 004-owned path.
- **Test gaps that remain**: no integration assertion on appointment *ordering* (component test
  delegates to one that does not exist); `isolation.test.ts`'s three answer routes cannot fail on
  event scope; no axe scan of the scheduling dialog; `e2e/network.spec.ts` tests depend on each
  other's writes. All are real (test-quality FINDINGS 2, 4, 5, 7) and none masks a known defect.

## Notable observations

Captured to `brainstorm/idea-inbox.md`.

- **No proposer-side withdrawal.** A pending proposal consumes the proposer's slot with no product
  action to release it until the slot lapses. Propose to somebody who never opens the app and the
  slot is gone for the day. Consistent with FR-632 as written, and the reverse of FR-633's own
  reasoning that a slot should return to whoever it was unavailable to.
- **`getHeld` and `listShared` have no product consumer.** `GET /cards/held/:attendeeId` is the only
  route `requireHeldCard` guards, so a branded scope, a route audit and a WeakSet exist for one
  unreached route. Arguably correct — it makes the next card route safe by default — but worth a
  recorded decision. Relatedly: an attendee cannot see what they have irrevocably given away.
- **Appointments cache another attendee's display name.** Justified as "the attendee's own
  commitments", which the counterpart field is not. Now smaller (the avatar is gone) but the name
  still ages on the device for 24 hours where the contacts list refuses the same field.
- **An unverified account can share its card**, installing a live-resolving profile into a verified
  attendee's Network irrevocably. `shareCard` checks the *recipient* is discoverable and verified but
  places no verification requirement on the *sharer*. The project invariant is that "any profile that
  can be read already carries a verified address" — this is the first path where that may not hold.
- **`blockAttendee` runs three dependent statements outside a transaction**, where
  `withdrawFromConference` deliberately runs its equivalent inside one.
- **The unpaginated contacts list** degrades with no back-pressure at a scale the spec's "bounded by
  deliberate human acts" assumption does not actually bound — the *rate* is throttled, the *total*
  accumulates across every conference forever and rows can never be deleted.

## Test Suite Results

| Round | Command | Failures | Status |
|-------|---------|----------|--------|
| 1 | `pnpm verify` (ten gates) | see below | re-run after fixes |

Two component assertions failed mid-round and were repaired within it: the Home card's empty-state
extraction (reverted, above) and two fixtures carrying a `counterpart.avatar` field the payload no
longer has.

## Post-Fix Spec Coverage

Code was removed in this round (the avatar payload, the `attendeeId` query parameter, the
invitee-dependent branch), so coverage was re-checked.

| Requirement | Implementation | Status |
|---|---|---|
| FR-626 slots disclose nothing about the invitee | `listOfferableSlots` — invitee not a parameter of the query **or the route** | ✓ stronger |
| FR-628 propose a meeting | `proposeAppointment` + `POST /events/:eventId/appointments` | ✓ |
| FR-633a acceptance conflict | `acceptAppointment`, now mirroring availability | ✓ stronger |
| FR-647 appointments cached, retrieval time stated | `services.ts` + `StalenessStamp` in `network/Appointments.tsx` | ✓ **newly complete** |
| FR-652 deletion cascade | unchanged | ✓ |
| SC-604 propose from a contact **or profile** | `Contacts.tsx` + `AttendeeProfile.tsx` | ✓ **newly complete** |
| All others | unchanged by the fix round | ✓ |

**59/59 requirements verified after the fix loop.** No requirement was dropped by the removals.
