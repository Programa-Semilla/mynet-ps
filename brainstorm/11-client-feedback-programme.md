# Brainstorm: The client feedback programme — decomposing `assets/feedback-1.md`

**Date:** 2026-08-12
**Status:** active
**Feeds:** features **017**, **014** (rescoped), **015** (rescoped), **018**, **019**

## Problem Framing

`assets/feedback-1.md` is an exhaustive extraction from a 52-minute requirements refinement between
the owner and the client on 2026-08-12: **118 numbered requirements across 19 functional areas,
plus 7 explicitly unresolved threads.** It is a raw translation of a transcript, deliberately
un-consolidated — the extraction preserves apparent duplicates rather than merging them, because a
duplicate might be a distinct intention.

It is not a feature. It is a second body of requirements arriving against a product whose delivery
roadmap completed four days ago, and it collides with decisions ratified in the last three days.

**Three structural facts shape everything below.**

**First, most of it has an administrative half.** Moderation needs a queue. Invitations need an
issuer. Optional sessions need capacity configuration. The post-event document needs an upload
surface. This is why it absorbs into the administrative programme rather than running beside it:
two programmes authoring the same conference-content tables is the implicit coupling this project
has had to correct twice already.

**Second, the owner set a new rule in the same breath**, and it is governance rather than a
preference: *anything requested to happen in the App must be checked for whether its administrative
counterpart exists or must be created.* It is ratified with 016 and applies from there on.

**Third, several requirements were unavailable when the current design was chosen, and are now
available.** They should be read as decisions becoming possible rather than as the client changing
their mind — the distinction matters, because the second reading makes shipped work look like drift.

## The collisions, and how each resolves

### Q&A: the client's model contradicts a feature that shipped two days ago

009 ships questions published **instantly**, attributed to the author's **full real name with no
opt-out** — ratified as constitution v3.3.0, standing decision 27 — with **no moderation route at
all**, guarded by `apps/api/tests/unit/qa-absences.test.ts`.

The client asks for the opposite on three axes: moderator approval before anything is public
(REQ-066–070), **first name only** (REQ-062–063), and lifecycle states — resolved, pending, carried
past the event for later answering (REQ-055–057, REQ-089, REQ-093).

**Resolved by the owner: the client's model wins in full.** The reasoning is the same one that
forced the administration reversal three days earlier, and 009 wrote it down itself — *a public
Q&A surface needs a moderator, and a moderator is an organizer.* An unscreened many-to-many surface
at a live event with a projector pointed at it is a liability, and now that the actor exists the
argument that kept it unmoderated has expired.

It is worth stating plainly that **v3.3.0 is being reversed 48 hours after ratification**, and that
this is the correct outcome rather than an embarrassment: v3.3.0 recorded a *deliberate* exception
after refusing to grant it by inference, which is precisely what made it cheap to revisit when new
information arrived. A decision derived silently would have been much harder to find and undo.

**Not resolved, and it must not be resolved silently**: the client's own OPEN-002 says the
first-name/anonymity thread was never closed with her. The transcript contains both positions.
017's spec must confirm rather than pick.

### Invitations: decision 11 said this was unavailable, and it no longer is

REQ-017–023 and REQ-025 ask for email invitations carrying **a unique code bound to one person and
one event**, with access refused to anyone not invited, not registered, or not authorised.

Standing decision 11 chose self sign-up with a **shared** join code carried on the event row, and
its reasoning is explicit: *event invitation* and *organizer-provisioned* both need an issuer who is
not an actor in this product, so neither was available. **v4.0.0 created that issuer.**

015 therefore delivers what decision 11 wanted and could not have. Its spec must say so in those
terms, or it reads as reversing a standing decision when it is completing one. Self sign-up does not
necessarily disappear — an event can plausibly be open or invitation-only — and which of those the
product supports is 015's central question rather than a detail.

### Payment-gated access stays out

REQ-024 asks that someone who has not paid cannot enter the event. **Payment processing did not move
at v4.0.0** — it shared a sentence with administration in Principle III and was explicitly named as
not the same decision. It stays out until its own amendment.

Worth separating: *gating on an externally-recorded payment* is not the same as *processing a
payment*, and a per-person invitation code issued only to people who paid elsewhere satisfies
REQ-024 without any payment capability. 015 can discharge it that way, and should say so.

### Networking outside events is blocked on the client, not on us

REQ-047–048 want networking and a general community directory to work independently of any event.
This contradicts standing decision 7's hybrid scoping, under which Discover is per-event by
construction and deliberately uncached. **REQ-049 is the client's own note that this needs her
lawyers first**, so it is blocked externally and is not scheduled here.

Recorded because it is a large latent change: relationships already persist across events by design
— contacts, cards and conversations survive — so what is actually being asked for is a
*discovery* surface outside an event, which is the one half decision 7 made transient on purpose.

### Notification triggers 2 and 3 are hiding in the transcript

REQ-095 (notify when the post-event Q&A document is published) and REQ-112 (notify that a session
starts in 15 minutes) each add a notification trigger. The trigger set is **a received message and
nothing else**, enforced by a source-level audit over `apps/api/src` that exists for exactly this
moment — `CLAUDE.md` records its purpose as stopping features adopting the platform *without a
decision*, and says outright that *a second trigger has to edit the test, and editing it is the
conversation.*

**This is that conversation.** Each needs an amendment, and REQ-112 needs more than that: it is a
**scheduled** notification, and nothing in this product has ever run work on a clock. There is no
job runner. `RETENTION_SWEEPS` is the closest thing and is deliberately narrow.

### The event lifecycle question 009 and #09 both parked

REQ-087–090 ask that the agenda, and possibly the whole event, stop being available once an event
ends — while REQ-089 and REQ-093 require pending questions to survive for later answering. The
client's own OPEN-001 says she did not settle whether an ended event disappears or becomes history.

#09 named the adjacent problem — *what does editing a live conference do to attendees who saved the
affected sessions?* — as 014's central problem. This is its mirror: what happens to saved sessions,
notes, Q&A and appointments when the conference they belong to ends. Neither has defined behaviour
today.

## Approaches Considered

### A: Absorb into the administrative programme and re-plan the queue — **chosen**
- Pros: The two features #09 already reserved are exactly where most of this belongs, so they grow
  rather than being duplicated. Each feature then carries both halves by construction, which is the
  owner's new rule enforced structurally rather than remembered. No renumbering of anything on
  `develop`.
- Cons: 014 and 015 become substantially larger than #09 scoped them, and #09's own scoping text
  has to be read as superseded.

### B: A parallel client-feedback programme
- Pros: #09's programme stays exactly as brainstormed.
- Cons: Two programmes writing the same conference-content tables, with the admin-counterpart rule
  degrading into cross-programme coordination. This is the implicit-coupling failure mode this
  project has already had to fix twice.

### C: Re-plan everything from scratch, superseding the roadmap and #09
- Pros: One authoritative sequence built from all three inputs; the clearest end state.
- Cons: Most work before any delivery, and it retires a roadmap document still cited as
  authoritative by `CLAUDE.md`.

## Decision

**Absorb the client feedback into the administrative programme, growing 014 and 015, and add three
features for what does not fit.** The delivery queue below replaces the administrative programme's
three-feature table from #09.

| # | Feature | Carries | Migration |
|---|---|---|---|
| **016** | App fixes, mutual card exchange, install icon | Brainstorm #10 | none |
| **017** | **Q&A rebuilt** — moderation, identity, lifecycle, projection | REQ-050–077, 093 | yes |
| **014** | **Conference content authoring** (rescoped, kept whole) | REQ-010–014, 027–042, 078–086, 113–115 | yes |
| **015** | **Registration and invitations** (rescoped) | REQ-015–023, 025 | yes |
| **018** | **Profile QR** | REQ-098–104 | probably none |
| **019** | **Event lifecycle and post-event material** | REQ-087–097, 112 | yes |

**014 is kept whole at the owner's direction.** Splitting optional-session enrolment and the profile
taxonomy into separate features was proposed and rejected. The cost is recorded: it is the largest
feature in the programme, and it is **blocked on an external input** — REQ-033 and REQ-036 have the
client supplying the interest list and the depurated subsector lists, and neither exists. The
mitigation is to specify the taxonomy as authored or seeded data so the schema and the
administrative surface do not wait on the content; the lists then arrive as data rather than as a
spec change.

**017 ships before 014**, though authoring is the larger client motivation. Same reasoning #09 used
to put moderation first and it has strengthened: the reports queue proved the architecture, and Q&A
is where the client's stated need and an existing unmoderated surface meet. It also has the
narrowest dependency — questions already exist.

### Deliberately not scheduled

Each with the reason, because an unscheduled requirement with no reason reads as an oversight.

- **REQ-024 — payment-gated access.** Payments did not move at v4.0.0. Reachable via 015's
  invitation codes without any payment capability; see above.
- **REQ-047–049 — networking outside events.** Blocked on the client's legal review, by her own
  note. Contradicts decision 7's per-event Discover.
- **REQ-053 — automatic grouping of similar questions.** The client accepted manual consolidation
  for a first version (her OPEN-003). 017 ships REQ-054's manual grouping; automatic grouping is a
  later question and is an ML-shaped problem this product has no precedent for.
- **REQ-091–092 — event summary publication.** The client frames both as a future phase.
- **REQ-105–107 — the external company QR.** She clarified in the same exchange that this is a
  conventional QR pointing at a catalogue or website and *not* something MyNet should manage.
- **REQ-117 — streaming.** Explicitly named as outside the product.
- **REQ-001–009 — pilot logistics, induction, manuals, staff training.** Process rather than
  product. **REQ-009 is the exception worth revisiting**: capturing pilot feedback could be a small
  in-app affordance, and her OPEN-005 leaves the mechanism undecided.

## Key Requirements

Agreed in this session. These feed the specs; they are not the specs.

1. **The client's Q&A model replaces 009's in full** — moderation before publication, first-name
   attribution, resolved/pending lifecycle, manual grouping, and a projectable view ordered by
   votes. Gated by an amendment reversing v3.3.0's attribution decision and retracting the shipped
   FRs it changes.
2. **Every guard that currently enforces the old model is amended deliberately**, never weakened
   until it stops checking anything — `qa-absences.test.ts` above all, which asserts the absence of
   the moderation routes 017 adds. Same discipline v4.0.0 applied to the five administration
   guards.
3. **Invitations complete standing decision 11 rather than reverse it.** 015's spec states this
   explicitly, in those terms.
4. **The administrative counterpart of every attendee-facing capability is stated in its spec**,
   including where it is *none*. Ratified as a standing decision with 016.
5. **A notification trigger beyond a received message requires an amendment**, per feature, and the
   scheduled-notification case additionally requires deciding whether this product gains a job
   runner.
6. **The taxonomy is authored or seeded data, not a spec constant**, so 014 is not held hostage to
   lists that do not exist yet.
7. **One class of conference survives** (v4.0.0 decision 34). Nothing here introduces a privileged
   or immutable event.
8. **Where the transcript and a ratified decision disagree, the spec records the conflict and its
   resolution.** It may not resolve one silently in either direction — Principle I, and the reason
   this document exists rather than a task list.

## Open Questions

Ordered by what they block. **None may be silently resolved.**

### Blocking 017

- **First name only, or full name, or attendee-chosen?** The client asks for first name
  (REQ-062–063); v3.3.0 ratified full real name with no opt-out; her own OPEN-002 says the thread
  was never closed. REQ-061 adds that the *system* must always know the real author whatever is
  displayed, which no current requirement states. Two attendees named Ana at one event is the
  practical case that decides it.
- **What does moderation do to 009's guarantees?** 009 settled that a *withdrawn* question takes
  everybody's votes with it. A **rejected** question was never public and has no votes. A question
  removed *after* publication is the genuinely new case and is not obviously either.
- **Who moderates?** Platform operator, conference organizer, or a third per-session role — REQ-065
  says an event may have several coordinators, which no current model expresses.
- **Does the projectable view (REQ-075–077) need authentication?** A screen in a hall, showing live
  reordering, is a fourth surface with a fourth audience and possibly no logged-in reader at all.
- **Is the projectable view part of MyNet, the admin site, or a third thing?** It is a display
  rather than a workspace. Standing decision 33 forbids MyNet growing a privileged view.

### Blocking 014

- **What does editing a live conference do to attendees who saved the affected sessions?** Named by
  #09 as 014's central problem and still unanswered. Moving or deleting a session sitting in
  somebody's Agenda or on Home's "Up next" card has no defined behaviour.
- **Do the sector and subsector taxonomies apply globally or per conference?** REQ-034–037 imply
  one controlled list; different events plausibly want different ones.
- **What happens to enrolment when a capacity-limited session is edited downward?** REQ-080–081
  set a cap and close enrolment at it. Lowering the cap below current enrolment has no answer.
- **Are the interest and sector lists administratively editable, or committed data?** Decides
  whether 014 needs an admin surface for them or only a seed.

### Blocking 015

- **Does self sign-up survive alongside invitations?** Decision 11 is load-bearing for the attendee
  actor model. An event that is invitation-only and an event that is open are both coherent; whether
  both exist is the question.
- **What does a per-person code do that an account does not?** REQ-021 binds a code to a person and
  an event, but the person may not have an account yet (REQ-020), so the code identifies somebody
  the system has never met.
- **Is an invitation revocable, and what does revocation do to a registration already made?**

### Blocking 019

- **Does an ended event disappear or become history?** The client's OPEN-001, unresolved by her.
  REQ-087 says the agenda should go; REQ-089 and REQ-093 say pending questions must stay.
- **What happens to saved sessions, notes, appointments and Q&A when their conference ends?**
  The mirror of 014's central problem, and equally undefined.
- **Does this product gain a job runner?** REQ-112's 15-minute reminder cannot be delivered without
  one, and nothing here has ever run work on a clock.

### Not blocking anything

- **REQ-009 — how pilot feedback is captured.** Her OPEN-005. An in-app affordance is one option
  among several and none is decided.
- **REQ-101 / OPEN-007 — "download contact" from a card.** Mentioned as a possibility, never
  confirmed. It is a vCard export, and the card's data is already resolved live.
- **REQ-013 — the virtual session link lives in the description field.** Proposed in the
  conversation as a workaround. A real field is the obvious alternative and was never weighed.
