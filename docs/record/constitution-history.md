# MyNet Constitution — Amendment History

**This file is a record, not governance.** It binds nothing. The constitution
(`.specify/memory/constitution.md`) is authoritative, and where this file and the constitution
disagree about a rule currently in force, the constitution wins.

It was split out of the constitution in **5.4.1**, with no change in meaning, because the
constitution had grown to 304KB and roughly 60% of it was history: every Sync Impact Report since
1.0.0, and the Open Questions Register's per-amendment narratives and original entry texts. Both are
preserved here **verbatim**, exactly as they stood in 5.4.0. When the constitution says "see the
2.3.0 sync report" or "see this amendment's sync report", the report is here.

A new amendment's Sync Impact Report goes at the top of the constitution as before; when the next
amendment replaces it, the outgoing report is **prepended** to Part 1 below rather than deleted.

## Part 1 — Sync Impact Reports, 5.4.0 back to 1.0.0 (verbatim)

SYNC IMPACT REPORT
Version change: 5.3.0 → 5.4.0

RATIFICATION STATUS: **RATIFIED 2026-08-15 by the project owner**, in a working session that took
all three decisions in sequence after reading `brainstorm/13-blocked-entries-decision-packets.md`.
That document records no decision; it is the research this amendment is taken on, and it stays as
written so the reasoning outlives the conclusions.

**This is the first amendment whose entire subject is closing questions rather than licensing
work.** It gates no feature's first line of code. It closes **three** register entries — 22, 27 and
4 — which is the largest number closed at once since 4.1.0 closed the three it had opened, and it
unblocks **both** remaining blocked features: 017 (blocked on 27) and 012 (blocked on 22 and 4).

**What ratification does NOT do.** Entries 19, 21, 23, 28, 29, 30 and 31 are untouched, and 19 and
21 remain the oldest live entries. It decides nothing about `authorId` or `listBlocks` — R2 makes
that question **more** urgent rather than resolving it. It does not price the cache lifetime, which
R1 defers deliberately. And it does not appoint anybody: R3 ratifies layouts without a client
acceptance act, which is a decision to proceed without one, not a substitute for one.

NUMBERING CHECKED BEFORE CLAIMING, per the rule 5.2.0's rebase produced and 5.3.0 restated. At
drafting, `5.4.0` was claimed by nothing; no branch other than
`docs/close-register-entries-22-27-04` was in flight; the register high-water mark was 31 and this
amendment opens **no new entry**; the standing-decision high-water mark was 53, so this claims
**54–56**; and the decision prefix `R` was unused (`A`, `B`, `C`, `D`, `L`, `M`, `N`, `O` and `Q`
are taken).

Rationale: **MINOR, and as in 5.3.0 the judgement is made explicitly because a real MAJOR argument
exists.** Two of these decisions touch delivered requirements, and 3.0.0 and 5.0.0 were both MAJOR
for exactly that.

*Why it is not MAJOR.* The practised test — which is narrower than the policy's wording and has
been applied consistently — is that **withdrawing** a delivered requirement is MAJOR while
**narrowing** one is MINOR, the judgement 5.3.0 made against FR-1042. R2 narrows FR-702's
*rendered form* and withdraws nothing: attribution survives, FR-734's unconditionality survives
verbatim, and SC-707 stays true — an attendee who has turned discoverability off is still named on
their question, as "Ana R.". Principle VIII's second recorded exception gets **smaller**, and no
prior amendment has treated a *reduction* in what an exception discloses as backward-incompatible.
R3 is MINOR for a reason that turns entirely on how it is worded, and the wording is therefore
load-bearing: **it does not claim that passing tests validated a layout.** Had it done so it would
retract 5.0.0's rule that no feature may be read as having validated a layout because its gates are
green, and retracting a governance rule is MAJOR under the first clause. It claims instead that the
owner ratifies the shipped layouts *in the absence of* validation. That is a weaker and more honest
act, and the rule it declines to use survives untouched.

*Why it is not PATCH.* Each of the three changes what the product may do or what somebody may rely
on. 3.3.0 and 4.1.0 both gave this reason for the same call.

────────────────────────────────────────────────────────────────────────────────────────────────
R1 — **Entry 22 is CLOSED. The 24-hour residual is accepted; the ground it was tolerated on is
corrected; two mechanisms are built.**

The entry is closed as **accepted**, not as fixed. A device may keep *showing* a conference the
person has left for up to 24 hours from retrieval, and that is ratified.

**The register's stated ground for tolerating it was false when it was written, and five features
carried the entry as low-severity on the strength of it.** The entry says the data is *"the
conference programme, not another attendee's personal data"*. The cached `appointments` payload
carries the other party's display name and the agreed meeting topic, and that caching shipped in
008 — **before** the sentence was written in 009. The cached `programme` embeds every speaker's
name, title and company, which entry 30 classifies as personal data about people who are not
attendees. The sentence is struck. **The residual is accepted on a different and true ground**: no
third party can end a registration today, and the only way one ends is an act the attendee performs
on their own device, which purges that device in the same action.

**That true ground is protected by a naming convention, and this is the most fragile thing this
amendment ratifies.** `apps/api/tests/unit/no-attendee-restriction.test.ts` selects routes by the
URL regex `/suspend|ban\b|mute|restrict|disable|block|silence/i`. A route named
`DELETE /admin/conferences/:eventId/registrations/:id` matches none of those words and **passes
green**. Feature 015 is named "registration and attendee management". **The guard MUST be widened to
the concept before 015 is specified**, and if 015 does add such a route, R1's ground evaporates and
entry 22 must be reopened rather than reasoned around.

**Two mechanisms are licensed, and neither needs a further amendment to build.** First, an entry is
**deleted at the moment it stops being readable** — today nothing evicts, so "24 hours" has always
bounded serving and never retention, and this is the only change that reduces what a disconnected
device *holds*. Second, a successful online read of the conferences the attendee is registered for
**erases the stored copy of any conference absent from it**; this lives in the composition root
rather than in the caching decorator, which sidesteps the exact objection that withdrew 009's
FR-756a.

**Three options are rejected on evidence rather than on cost**, and they are named so they are not
re-proposed: reinstating FR-756a fires on a refusal that frequently never arrives; a server-sent
"forget this" message **cannot be built** — subscriptions are registered `userVisibleOnly: true`,
so no silent message exists, and a new dispatcher would be a third notification trigger and
therefore another amendment; and keying the stored copy to the registration is ineffective, because
a disconnected device cannot learn the registration ended and matches its own stale label.

**Whether 24 hours is the right span is DEFERRED, not decided, and the reason is stated rather than
implied.** Since 014 an organizer can cancel a session, move a room or change a start time, so a
day-old programme can be *wrong* rather than merely old. That argues for shortening on grounds of
**usefulness**, not privacy. It is deferred because the cost — offline usefulness at a venue with
poor signal — **cannot be priced from this repository**, which is what 005 said when it set the
value and which remains true because nothing has reached production. It returns as a product
judgement once a real conference has been run, and it is not a register entry.

**Two shipped defects are fixed regardless of any of the above, because neither is a choice.**
Account deletion computes its purge prefix from a no-argument call, yielding `attendee:<id>|event:|`
— a range that cannot match `attendee:<id>|event:<uuid>|…`, since every UUID first character sorts
below `|`. **A second device therefore keeps everything, including private session notes,
permanently, while the deletion screen promises in bold that no copy is kept.** And the reconnection
purge does not fire on a cold start at all: `GET /workspace/active-event` answers a de-registered
attendee with **204, a success**, so the client never addresses that conference again. An
already-open tab does purge, but only when somebody next navigates — there is no poll, no focus
refetch and no reconnect refetch of the active event. The comment claiming *"online, an
authorization refusal purges the conference's entries immediately"* is true of the mechanism and
silent on whether the refusal arrives. **That is this project's documented false-header class, in
the file the entry is about.**

────────────────────────────────────────────────────────────────────────────────────────────────
R2 — **Entry 27 is CLOSED. A published question is attributed as first name plus surname initial —
"Ana R.".**

Applies wherever a question is displayed: the phone, the moderation queue, and the projected screen
5.0.0 ratified.

**This was decided on the client's behalf, and that is recorded rather than glossed.** The owner has
spoken for the client five times before and does so here. It reads REQ-062 and REQ-063 as being
about **register and tone** — that a full legal name makes a casual question feel like a filing —
rather than about the surname as such. **It is in tension with her literal words**, *"únicamente el
primer nombre, sin apellidos"*, because an initial is a fragment of an apellido. **She must be told,
not left to discover it at an event.** If her concern proves to be findability rather than tone, the
decision was wrong on its own reasoning and should be revisited; that is the stated condition, and
it is cheap to act on, because this option is the easiest of the six to move in either direction.

**The framing this entry was carried under was incomplete, and correcting it is the transferable
part.** The register offered three options. Six existed. Two of the missing ones — this one, and a
collision-aware form showing an initial only where first names collide — cost exactly what the
cheapest listed option costs and **dissolve the deciding case**, which is two attendees named Ana
at one conference whose questions appear together on a hall wall. An entry that has blocked a
feature since 5.0.0 looked like a hard trade because half the board was missing. **A register entry
that enumerates its options is asserting that the enumeration is complete**, and this one was not.

**What it narrows.** FR-702's rendered form only. FR-734 survives verbatim — attribution stays
unconditional, and a non-discoverable attendee is still named. SC-707 survives and stays true.
Principle VIII's second recorded exception is **narrowed**, which is why this is MINOR.

**One thing MUST ship with it or the change buys nothing.** `POST /blocks` carries no throttle and
`GET /blocks` returns the target's live display name **and card-rendition avatar bytes**. Under any
abbreviated attribution, blocking becomes a one-request, unrate-limited way to convert "Ana R." into
a full name with a photograph — so an abbreviated name without that closure **relocates disclosure
rather than reducing it**. `blocks.ts` asserts the caller *"already knows exactly who these people
are, having blocked them by hand"*, a claim this decision falsifies in a file it does not otherwise
touch.

**Not resolved, and made more urgent.** Whether a question's payload should carry `authorId`, and
whether `listBlocks` should be narrowed, were raised at 009's deep-review gate and are untouched
here. Any abbreviated attribution increases the value of the identifier, so 017 MUST NOT treat this
as settled by R2.

**Left to 017, deliberately.** What "Ana R." renders as for a mononym, and whether a multi-token
given name yields "María R." or "María José R.". `display_name` is one free-text field, so the
surname half is a derivation and its edge cases are implementation, not governance. `initialsOf`
already performs this split with `Intl.Segmenter` rather than `slice`, and is the precedent to
follow.

────────────────────────────────────────────────────────────────────────────────────────────────
R3 — **Entry 4 is CLOSED by owner ratification, without a client acceptance act.**

The shipped desktop and tablet layouts are ratified as intended. This closes the oldest live
question about the product's appearance and unblocks 012.

**What this is NOT, and the distinction is what keeps this amendment MINOR.** It is **not** a claim
that the layouts were validated, and **not** a claim that green gates validated them. 5.0.0's rule —
that no feature may be read as having validated a layout because its tests pass — **stands
unamended and unused here.** The owner ratifies in the acknowledged absence of validation. Anybody
citing R3 as evidence that the layouts were reviewed has misread it.

**The cost is ratified with it rather than softened.** Desktop use is the client's own stated
requirement (REQ-108, REQ-110), and she has never seen the product at a desk. Closing removes the
entry that kept each new feature's unreviewed desktop design visible, so **the debt resumes
compounding silently**, and it is paid by whoever meets the first defect in production. The two
defects this entry produced were each found within minutes by the first person to look at a screen,
which is the honest measure of what is being given up.

**One item is CARVED OUT and is a defect, not a ratified layout.** `AdminShell` presents **two**
layouts where Principle IV requires three: below 768px the administrative site's only navigation is
a horizontally scrolling strip, and at 768–1023px the rail is labelled rather than reduced.
**Fiat may close a judgement; it cannot make a non-compliance compliant**, so this is excluded from
the ratification and MUST be fixed. It is checkable today with no client and no UAT. The end-to-end
sweep **cannot see it by construction** — it measures document-level overflow, which an inner
`overflow-x-auto` container is designed to keep at zero — so the fix must carry an assertion that
does not depend on that measurement.

**Two judgement questions ARE ratified as-is**, and are named so they are not reopened as defects:
the rail divergence between the two products at 768–1279px, where MyNet shows an icon-only rail and
the administrative site shows a labelled one; and Home's two-column card arrangement on an upright
tablet. Both were unrecorded choices rather than constraints — the administrative app imports
MyNet's tokens and then uses none of its breakpoints — and both are now choices.

**One gap is closed at no cost and is not a layout question at all.** Playwright declares a single
Chromium project, so **Safari layout is unverified at every width**, not only on desktop, and the
physical-iPhone test 012 already carries is otherwise the only WebKit evidence this project will
ever produce. Adding WebKit and Firefox projects needs no client, no UAT and no decision.
────────────────────────────────────────────────────────────────────────────────────────────────

REGISTER HYGIENE, applied in this amendment. The register is a hand-maintained numbering table, and
this project has recorded four collisions across such tables. A full pass found nine defects, all
corrected here. The most consequential is that **entry 22 had no list item at all** — its heading
was concatenated onto the end of entry 21's final paragraph with no newline, so the ordered list ran
11–21 then 23–26, and because CommonMark renderers ignore written ordinals and renumber
sequentially, **every entry after 21 displayed one number low on any rendered page.** That is the
exact failure the register warns about twice in its own text, and it is almost certainly the origin
of the second defect: three sites number the design-token question 22 when it is 23. Also corrected:
entries 27–31 appeared in no register list, so a reader of the two "Open —" sections saw a register
that stopped at 4.1.0 and missed the only entry then blocking a feature; entry 2 was named a live
blocker on 012 though it is resolved; entry 4 still said it blocked shipped 011; entry 22 was still
filed against phase 010, never updated for the 010→011/012 split; ten sites attributed decisions
L1–L6 to 3.4.0 when they belong to 3.5.0; five entries were classified differently by CLAUDE.md than
by this file, with entry 19 listed twice there; and one sync report carried the brand-mark decision
as 27 when it is 30.

SYNC IMPACT: Principle IV gains R3's ratification and its carve-out. Principle VIII's second
recorded exception is narrowed by R2. "Audience questions" carries the new attribution rule.
"Data scoping, content provenance, and composition" carries R1. Standing decisions **54–56** added.
Register entries **22, 27 and 4** closed; **no entry opened**. `CLAUDE.md` updated to match,
including the five classification drifts and the two contradictions it carried against itself.

────────────────────────────────────────────────────────────────────────────────────────────────

SYNC IMPACT REPORT
Version change: 5.2.0 → 5.3.0

RATIFICATION STATUS: **RATIFIED 2026-08-14 by the project owner**, on reading the drafted amendment
together with the specification, plan and task list it gates. Drafted the same day at their request
following brainstorm #12 (`brainstorm/12-conference-content-authoring-tranche-2.md`), which scoped
**014 tranche 2** — the change that closes feature 014. This amendment gated its first line of code,
as 5.2.0 gated tranche 1, 4.0.0 gated 013, 3.3.0 gated 009 and 3.2.0 gated 008.

It was drafted first and ratified second, because this project does not let an amendment ratify
itself. **Feature 014 tranche 2 is licensed from this point**, including its first line of code.

**What ratification does NOT do**: entry 31 remains open and blocks nothing. Entries 19, 21, 4, 22,
27, 28, 29 and 30 are untouched. Ratifying a named enrolment roster did not decide whether a deletion
should notify the attendees it strands — that is entry 31, and answering it needs a third
notification trigger and therefore another amendment.

**O2 was ratified with its cost stated rather than softened, and that is deliberate.** A session with
places held may be deleted, those attendees hold no saved row, and so they receive no notification and
no marker. The owner took that decision after the consequence was put to them and reaffirmed it. It is
**not** precedent for a second `NOT_ENGAGEMENT` entry, and a later feature citing it as one has
misread it.

**NUMBERING CHECKED BEFORE CLAIMING, WHICH IS THE RULE 5.2.0'S REBASE PRODUCED.** At drafting, `5.3.0`
was claimed by nothing but brainstorm #12 itself, and no branch other than
`spec/014-conference-content-authoring-tranche-2` was in flight. The register high-water mark was 30,
so this amendment opens **31**. The decision prefix `O` was unused. This paragraph exists because the
fourth collision — recorded at the head of the 5.2.0 report below — established that a shared
numbering table must be checked and extended in the same change, and the register is now known to be
such a table.

Rationale: **MINOR, and the judgement was made explicitly rather than defaulted, because there is a
real argument for MAJOR.**

*For MINOR, which is what this is.* No principle is removed or redefined. No actor is redefined and
no Principle-level prohibition is lifted. Governance itself does not change. Principle VIII gains a
**fourth** recorded exception, which is precisely what 3.3.0 did in adding the second and 4.1.0 did in
adding the third — **both MINOR, both with this same rationale.** It is **not PATCH** for the reason
those two gave: an exception to a privacy rule is a change in what the product may do, not a
clarification of what it already did. No work performed under 5.0.0, 5.1.0 or 5.2.0 is invalidated.

*For MAJOR, and why it does not carry.* This amendment narrows **FR-1042**, which 014 tranche 1
shipped and guarded, and 3.0.0's stated reason for being MAJOR was retracting a delivered requirement
— *"001's shipped FR-066 and SC-011 — the first delivered requirement this project has retracted,
which is why 3.0.0 is a major version."* The distinction is that FR-1042 is **narrowed, not
withdrawn**: it survives intact for saved sessions, private notes, questions and votes, and yields
only for **enrolment**, only to an organizer **assigned to that conference**. 3.0.0's FR-066 ceased to
exist; nothing here ceases to exist. The written policy is also explicit and narrow, and a version
number that departs from its own stated rule teaches the next reader that the rule is advisory.

Owner decisions cited by this amendment (all 2026-08-14, from brainstorm #12):
  O1. A NAMED ENROLMENT ROSTER IS VISIBLE TO AN ASSIGNED CONFERENCE ORGANIZER. This is the
      **FOURTH** recorded Principle VIII exception, and Principle VIII's own closing sentence
      predicted the shape of this moment: *"Three exceptions are recorded; a fourth needs a fourth
      amendment."* This is that amendment. It is recorded rather than argued out of scope, and that
      choice is deliberate — an enrolment is arguably not "messages, notes, and appointments" as the
      private-content clause enumerates them, so a feature could have reasoned it in without an
      amendment. **The cost of over-recording is a paragraph; the cost of under-recording is a
      disclosure nobody accepted.** Motivated by REQ-086: an organizer told to close enrolment early
      because materials must be prepared cannot prepare them for people they cannot name.
  O2. ENROLMENT IS NOT ENGAGEMENT, AND A SESSION WITH LIVE ENROLMENTS MAY BE DELETED. N5's set stays
      at four — a saved session, a private note, a question, a vote — and a fifth attachment type is
      declared **outside** it. **The consequence is recorded rather than softened, because the owner
      took this decision after it was put to them and reaffirmed it**: tranche 2 must write the first
      entry into `NOT_ENGAGEMENT`, a list that is empty by design and whose comment requires each
      entry to *"say whose data it is and why losing it silently is acceptable"*; and because
      enrolling **replaces** saving on an optional session, an enrolled attendee holds no
      `saved_sessions` row, so deleting that session destroys held seats with no notification, no
      marker and no trace. This sits against N5's own rationale, which is that one delete must not
      silently destroy what other attendees attached to a session. **It is an accepted cost, not an
      oversight, and a later feature MUST NOT cite it as precedent for narrowing N5's four.**
  O3. AN ATTENDEE MAY BE SHOWN THE NUMBER OF REMAINING PLACES. "4 places left" is permitted. It is
      **not** the count N2 forbids — N2's subject is a count of *changes*, and this is a count about
      one session's availability — but it is the same family, so it is ratified deliberately rather
      than inherited by silence. N2 is untouched and unweakened.
  O4. MIGRATION NUMBERS ARE CLAIMED AT GENERATION, NOT RESERVED IN ADVANCE. The reserving feature
      MUST extend the roadmap's reserved-number table in the same change. Reserve-in-advance has
      collided three times and currently holds `0010` for a phase that adds no schema at all.

Consequences recorded, which are NOT new grants and MUST NOT be read as any:
  - **The notification POPULATION widens; the TRIGGER SET does not.** N1's second trigger is worded
    "a session the attendee has SAVED", and enrolling replaces saving — so without this, an attendee
    holding a seat in a **cancelled or moved** session would be told nothing, which is the exact
    stranding N1 exists to prevent. The three material changes are unchanged and **no third trigger
    is added**. The population/set distinction was written down nowhere before this amendment.
  - **FR-336 is UNCHANGED.** Taxonomy fields are optional like every other profile field, and
    REQ-027's mandatory-profile-at-sign-up is **NOT ratified**. A profile row is still created on
    first save so that "empty profile" has exactly one representation.

Added binding constraints:
  - "VIII. Attendee Data Is Personal Data" — the fourth recorded exception, with its four scoping
    conditions; the exception count and the closing "a fifth needs a fifth amendment".
  - "Notification delivery" — trigger 2's population becomes saved **or enrolled**, with the
    population-versus-set distinction stated.
  - "Data scoping, content provenance, and composition" — N5 gains O2's explicit exclusion.
  - "Administration, and the second actor" — the organizer's second bounded capability.
  - "Parallel work and shared artifacts" — O4's claim-at-generation rule.

Register changes:
  - 31. OPENED. **Whether deleting a session should notify the attendees enrolled in it.** O2 makes a
    deletion destroy held seats silently, and those attendees hold no saved row to be marked. The
    remedy would be a **third** notification trigger and therefore another amendment, so it is opened
    rather than solved. **Blocks nothing**; the product behaves exactly as O2 ratifies.
  - **No entry is closed.** 19 and 21 remain ADDRESSED-not-closed; 4 and 22 remain open and still
    block 012; 27 remains open and still blocks 017; 28, 29 and 30 are untouched.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ⚠ **updated locally but NOT committed, because
    `.specify/templates/` is gitignored.** The Feature Declarations row "Reserved migration number"
    became "Migration number" and now states O4's claim-at-generation rule, since the old wording
    instructed every future spec to do the thing O4 abolishes. **The edit does not propagate to any
    other clone**, so a spec authored elsewhere will still be told to reserve a number in advance.
    Whether the templates directory should be tracked is a question this amendment surfaces and does
    not answer — it is recorded here rather than fixed, because tracking a previously-ignored
    directory is a repository decision. plan-template.md and tasks-template.md — ✅ no change
    required; the actor/tier and administrative-counterpart rows this amendment relies on already
    exist.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ✅ updated. It carried the
    replaced rule in binding voice — *"A phase claims its number when its spec is written, not when
    its migration is generated"* — which O4 directly reverses. **This is the artifact O4 is about**,
    so leaving it stale would have left the abolished scheme stated authoritatively in the one
    document a feature reads to find a number.
  - CLAUDE.md — ✅ updated on ratification: standing decisions 50–53 and register entry 31. It was
    held until then deliberately, following 5.2.0's practice, because a working brief that describes a
    decision as binding before the owner has taken it is the drift Principle I exists to prevent.
  - brainstorm/12-conference-content-authoring-tranche-2.md, brainstorm/00-overview.md — ✅ current.
  - specs/014-conference-content-authoring/ — ✅ tranche 2 specified, planned and tasked (93 FRs,
    15 SCs, 109 tasks T106–T214). **Ratification lifts the gate on T106.**

Deferred: none. Tranche 2 has no blocking register entry.

A NOTE ON WHAT THIS AMENDMENT COSTS. 5.2.0's note observed that widening the trigger set cost the
ability to verify "one trigger" by reading one sentence. This one costs something comparable in a
different place: **Principle VIII's exception list is now four long, and its readability was always
the argument for keeping exceptions few.** The mitigation is that all four are scoped by the same
shape — who may read, what exactly, where, and what the subject is told — and O1 is written to that
shape deliberately so the list stays comparable rather than becoming four unlike things.

PRIOR REPORT (5.1.0 → 5.2.0):
Version change: 5.1.0 → 5.2.0

**REBASED 2026-08-14, FROM 4.1.0 → 4.2.0, AND THE RENUMBERING IS THE RECORD OF A COLLISION.** This
amendment was drafted and ratified on 2026-08-12 as **4.2.0**, on a branch taken from 4.1.0. On the
same day and from the same base, a parallel branch produced 5.0.0 and 5.1.0 and merged first. Nothing
in this amendment's substance changes; its **base** moves from 4.1.0 to 5.1.0 and its number with it,
because 4.2.0 is not above 5.1.0 and a version that sorts below its own predecessor is not a version.

**This is the fourth collision of this kind, and the first to hit the register rather than a file
name.** The register entries this amendment opened were **27 and 28**; 5.0.0 opened its own 27 and 28
hours earlier, on different subjects. They are renumbered here to **29 and 30** — the same
merged-first-keeps-the-number rule this project applied when 009 and the brand mark were both drafted
as 3.3.0, and when 013 took the next free feature number rather than the next in its own programme.
**The rule that comes out of it is the one 014 already wrote for migrations, generalised**: a phase in
a parallel programme must extend the shared numbering table in the same change, and the register is
now known to be such a table. A branch cannot see a reservation made on a branch it cannot see.

RATIFICATION STATUS: **RATIFIED 2026-08-12 by the project owner**, on reading the drafted amendment
together with the specification, plan and task list it gates. Drafted the same day at his request
following brainstorm #10 (`brainstorm/10-conference-content-authoring.md`), which decided the shape
of feature 014 — conference content authoring.

It was drafted first and ratified second, because this project does not let an amendment ratify
itself. 3.2.0 and 3.3.0 were each ratified by the owner at the gate of the feature they licensed,
3.4.0 by the act of supplying the asset it recorded, and 4.0.0 on reading the drafted text.
**Feature 014 is licensed from this point**, including its first line of code.

**What ratification does NOT do**: entries 29 and 30 remain open, and neither blocks 014. Ratifying
a second notification trigger did not decide whether an attendee may suppress its content, nor who
answers for a speaker's personal data. Entries 19, 21, 4 and 22 are untouched.

Rationale: MINOR. Notification scope is materially expanded — from one trigger to two — and one
authority boundary is stated that 4.0.0 left implicit. No principle is removed or redefined, nothing
delivered is retracted, and no work performed under 4.0.0, 4.1.0, 5.0.0 or 5.1.0 is invalidated. It
is the same test 3.1.0 applied to itself when it brought delivery into scope at all, and for the same
reason it is **not PATCH**: widening a trigger set changes what the product may do to somebody's
phone, and that is not a clarification of what it already did.

**ONE SENTENCE IN 5.1.0 IS SUPERSEDED BY THIS AMENDMENT, AND IT IS LEFT STANDING DELIBERATELY.**
5.1.0's report states *"nothing about notification triggers moves. A received message remains the
only thing that dispatches"*. That was true when it was written and is false once this lands. It is
**not edited**, because a prior sync report is a record of what was decided when, and rewriting one
to agree with a later decision destroys the only evidence that the two were taken independently. The
binding statement is the "Notification delivery" section, which this amendment amends in place.

**5.0.0 refused two candidate triggers and this grants a third, distinct one — the refusals stand.**
Its "deliberately NOT decided" block declines REQ-095 (a push when a Q&A document is published) and
REQ-112 (a push when a session is about to start), and REQ-112 is refused here too and by name: a
session *starting* remains forbidden, because a reminder is something an attendee can set themselves.
Neither refusal touches N1's set. 5.0.0 also restates the mechanism this amendment used —
*"'Notification delivery' already requires an amendment per trigger"* — so the two agree on process
and were, without either knowing it, applying the same rule on the same day.

Owner decisions cited by this amendment (all 2026-08-12):
  N1. A SECOND NOTIFICATION TRIGGER EXISTS: a material change to a session the attendee has SAVED.
      The set is **named rather than described** — cancellation, a change of start time, and a
      change of room — and the principle it follows from is stated with it: a push fires when a
      change affects **where or whether** the attendee must be somewhere. Title, summary and speaker
      changes are content, and content does not strand anybody in the wrong corridor.
      This is the first widening of a rule that has held since 3.1.0. The set is closed rather than
      open-ended precisely because a boundary a later feature can argue about is a boundary that
      moves.
  N2. THE IN-APP MARKER IS PER-ROW STATE, NOT AN INBOX. 014 marks a changed saved session on the row
      itself, in Agenda and on Home. The bell and the in-app notification centre remain forbidden,
      unchanged and unweakened, and the distinction MUST be testable as an absence.
      **The prohibition governs surfaces INSIDE the product**, and that scope is stated rather than
      assumed: a single organizer act may materially change several of one attendee's saved sessions
      at once, and it dispatches **one coalesced notification** whose body carries a count. A
      notification is a single interruption by nature, and twelve interruptions for one act is the
      outcome 3.1.0's exclusion existed to prevent — so the count is permitted in the payload and
      **forbidden everywhere it could become a surface**. Activating it MUST land on the destination
      holding the per-row markers, never on a list of changes.
  N3. A CONFERENCE ORGANIZER MAY CREATE A CONFERENCE and is assigned to it. A2's "authority reaches
      only the conferences they are assigned" cannot describe the act of creating one. This is the
      **only** product-wide capability the tier holds; authority over conferences it did not create
      still comes only from assignment by a platform operator.
  N4. CONFERENCE CONTENT IS LIVE-EDITED, WITH NO DRAFT/PUBLISH LIFECYCLE. A conference is reachable
      only by its join code, so an unfinished one is already private to whoever holds that code. A
      lifecycle would be a second gate over a gate that already exists.
  N5. A SESSION ANY ATTENDEE HAS ENGAGED WITH MAY BE CANCELLED BUT NOT DELETED. Saved sessions,
      private notes, questions and votes survive an organizer's act. This is a **correction of a
      live hazard rather than a preference**: `saved_sessions`, `session_notes`, `session_questions`
      and `question_votes` each cascade from `sessions.id` today, so one delete would destroy other
      people's private writing silently, with no confirmation and no record. 013 could not have
      caught it, because 013 built no write path into the catalog at all.

Added binding constraints:
  - "Notification delivery" — the trigger set becomes two, enumerated; the marker-is-not-an-inbox
    rule; the lock-screen consequence extended to a second content type.
  - "Data scoping, content provenance, and composition" — the 4.0.0 seed clause gains the
    live-editing rule and the cancel-not-delete rule.
  - "Administration, and the second actor" — the organizer's one product-wide capability, stated
    rather than left to be inferred from its absence.

Register changes (**drafted as 27 and 28, renumbered on the rebase** — see the head of this report):
  - 29. OPENED. Whether an attendee may suppress content in notifications. **Promoted** from a
    deferral recorded in prose since 3.1.0 to a numbered entry, because 5.2.0 makes it apply to a
    second content type and it has now gone undecided across two amendments. Blocks nothing.
    **It now shares a subject boundary with 5.0.0's entry 27**, which asks how a question is
    attributed: both are about what the product discloses about a person without asking them, and a
    reader settling one should read the other. They are not the same question and are not merged.
  - 30. OPENED. Speakers are personal data about people who are not attendees, and 5.2.0 makes them
    organizer-authored rather than seeded. Blocks nothing today; blocks any claim that Principle
    VIII's coverage is complete.
  - **No entry is closed.** 19 and 21 remain ADDRESSED-not-closed; 4 and 22 remain open and still
    block 012. 5.0.0's entries 27 and 28 are untouched by this amendment.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ⚠ **changed by 5.0.0, not by this amendment**: Feature
    Declarations gains C3's administrative-counterpart row. 014's spec predates the row and is
    brought into compliance on this rebase rather than left as the one feature that never declared
    it. plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ✅ updated on ratification: standing decisions 45–49 (drafted as 40–44), register
    entries 29 and 30.
  - brainstorm/00-overview.md, brainstorm/10-conference-content-authoring.md — ✅ current.
  - specs/014-conference-content-authoring/{spec,plan,tasks}.md — ✅ ratification gate lifted.

Deferred: none. Feature 014 has no blocking register entry.

A NOTE ON WHAT THIS AMENDMENT COSTS, because the trade is not obvious: 3.1.0's trigger rule was
written to be narrow **by construction** — "a feature that wants a second trigger MUST amend this
block" — and 014 is the first feature to take it up. The rule worked exactly as designed. What
widening it costs is that "one trigger" was a property anybody could verify by reading one sentence,
and "two triggers, the second bounded by three named changes" is not. That is why N1 enumerates the
set instead of describing it, and why the set is logistics rather than content.

PRIOR REPORT (5.0.0 → 5.1.0), the amendment this one was rebased onto:

Version change: 5.0.0 → 5.1.0

RATIFICATION STATUS: **RATIFIED 2026-08-12**, on the same standing this project has used four
times before: an implementation surfaced a platform dependency, and Principle V's own text requires
the interface to be introduced *in the same change that introduces the capability* while forbidding
the enumeration that names them from going stale. Drafted by the implementing session for 016's
US5, which does not start before this lands.

Rationale: MINOR. **A section is materially expanded and nothing is retracted.** Principle V's
device-capability list gains an eighth entry, `InstallService`, and the paragraph explaining why it
had to be an interface rather than a lint exemption. No prohibition is lifted, no principle is
removed or redefined, and **no work performed under 5.0.0 is invalidated** — which is the versioning
policy's own test for MINOR against MAJOR.

**3.1.0 is the precedent and it is exact.** That amendment added `VisibilityService` as the seventh
device interface for the same reason in the same shape: a poll had to stop while the tab was hidden,
the only way to ask was a browser API feature code may not call, and the alternatives were an
interface or an exemption. It was MINOR, and it recorded that *"the listing is the ratification
act"* — which is why this is an amendment at all rather than a line of code somebody adds quietly.

What forced it: FR-1031 requires the sign-in screen to explain that installing is what enables
notifications, **when and only when** the reader is on a mobile-class device that has not installed
the application. Notification delivery on iOS is available only to an installed application, so an
attendee on an uninstalled iPhone can grant permission and receive nothing. Detecting that state
needs `matchMedia('(display-mode: standalone)')` and a `beforeinstallprompt` listener on `window`,
and `mynet/no-direct-platform-access` refuses both in feature code — the rule's `DOM` set names
`matchMedia` and `window` explicitly, added after it was found reporting zero violations because its
detector was too narrow.

Alternatives considered and rejected, from 016's research R2:
  - **A lint exemption for one call site.** Rejected on the constitution's own reasoning for
    `VisibilityService`: an exemption would trade a structural boundary for a poll interval, and the
    same trade here buys an install banner.
  - **Detect via the service worker.** A worker cannot report whether the page is running standalone.
  - **Always show the guidance.** Contradicts FR-1031's "when, and only when", and nags an attendee
    who has already installed.

**Deliberately NOT decided here**: nothing about notification triggers moves. A received message
remains the only thing that dispatches (3.1.0, and 016's FR-1029 restates it for the card exchange).
The guidance explains a capability; it does not request permission, and FR-1036 keeps
`NotificationPrompt.tsx` the only caller of `requestPermission` in the client.

Templates and downstream artifacts requiring updates: none. No template names the capability list,
and `packages/platform/tests/substitution.test.ts` derives its expectations from `DeviceServices`
rather than from a restated list, so the eighth capability is covered by that test the moment it is
declared.

PRIOR REPORT (4.1.0 → 5.0.0), retained because it is the amendment that gates 016 and 017:

Version change: 4.1.0 → 5.0.0

RATIFICATION STATUS: **RATIFIED 2026-08-12 by the project owner.**

Rationale: MAJOR. **Two delivered, shipped guarantees are retracted** — the one-directional card
exchange (3.2.0, N2) and the instantly-published Q&A model (3.3.0, Q1) — and the second of those
reverses a recorded Principle VIII exception **forty-eight hours after it was ratified**. The written
versioning policy scopes MAJOR to principles and governance, and strictly neither reversal removes a
principle; the **operative** rule here was set by precedent twice and binds: 3.0.0 was MAJOR for
withdrawing a single delivered requirement (001's FR-066), and 4.0.0 named retraction of delivered
requirements as one of its three MAJOR triggers. This is the project's **third MAJOR** and the
**first to reverse an amendment younger than a week**.

**This is the first amendment driven by the client using the running product and reporting what is
wrong**, rather than by a design session. That is why it is one amendment and not two, though its two
reversals are independent and gate different features (016 and 017): they have one cause and one
date. 4.0.0/4.1.0 is the only precedent for same-day paired amendments, and there 4.1.0 closed
entries 4.0.0 had opened — a sequential dependency absent here. Issuing two would also produce 5.0.0
and 6.0.0 on one day from one conversation, since each half independently triggers MAJOR.

Sources: `brainstorm/10-app-fixes-and-install-icon.md`, `brainstorm/11-client-feedback-programme.md`,
and `assets/feedback-1.md` — an exhaustive extraction from a 52-minute client conversation on
2026-08-12 (118 requirements, 19 functional areas, 7 explicitly unresolved threads).

Owner decisions cited by this amendment (all 2026-08-12):
  C1. **Sharing a digital business card is a MUTUAL EXCHANGE.** One act, and both parties hold each
      other's card; the recipient is not asked. **Reverses N2 (3.2.0) and the sentence that carried
      it** — "Nothing about a person may become durable without that person's own act."
      The reasoning is deliberately NOT the physical-card metaphor, which was available and is
      insufficient: N2 was never argued from metaphor, so a metaphor cannot unmake it. The
      operative ground is that a card resolves only what its owner already published to co-attendees
      under D-16's single visibility decision — the client states the same independently at REQ-046
      of the feedback extraction — so a mutual exchange discloses **nothing that discoverability had
      not already disclosed to the same audience**. The escape hatch predates the change: 007's block
      already severs card resolution in both directions.
  C2. **The Q&A model is replaced by the client's**, in full: a question is moderated before it is
      public, carries resolved/pending lifecycle state that survives the event, may be grouped
      manually with its duplicates, and is projectable in vote order. **Reverses Q1 (3.3.0)** and
      retracts shipped 009 requirements.
      The reasoning is the one 009 recorded against itself: *"a public Q&A surface needs a moderator,
      and a moderator is an organizer — the actor Principle III excludes by construction."* 4.0.0
      created that actor, so the premise that kept Q&A unmoderated has expired. The same shape forced
      the administration reversal three days earlier.
      **ATTRIBUTION IS NOT RATIFIED HERE.** The client asks for first-name-only (REQ-062, REQ-063);
      3.3.0 binds full real name; the client's own extraction records the thread as unresolved
      (OPEN-002) and the transcript contains both positions. Opened as register entry 27 rather than
      settled — see below.
  C3. **Every feature MUST declare its administrative counterpart**, including where it is
      explicitly none. A new Principle IX obligation and a new Feature Declarations row. No reversal.
      It paid for itself the day it was set: "add a confirm-password field" is five screens across
      two products, and the naive reading was one.
  C4. **The install icon derives from a SECOND brand source**, `assets/brand/new-logo.png`, and the
      resulting ~4× upscale is a **measured, named exception** recorded in the audit rather than a
      weakened check. Icon only — explicitly **NOT a rebrand**; the in-app coral mark is untouched
      and register entry 23 is unaffected.

Modified binding constraints:
  - VIII. Attendee Data Is Personal Data — the **second** exception changes SHAPE (publication is now
    conditional on approval, not immediate) and its attribution clause is marked UNDER REVIEW against
    entry 27, with the shipped full-name behaviour standing until that entry closes. Pre-publication
    moderator visibility is explained in place rather than left to be derived — it is **not** a fourth
    exception, and the reasoning for why is stated so nobody has to reconstruct it.
  - IX. Every Feature Declares Its Own Completeness — gains the administrative-counterpart obligation.
  - "Networking relationships and appointments" — the one-directional rule is superseded IN PLACE.
  - "Audience questions" — the moderation model replaces instant publication; *"there is no moderator
    and there will not be one"* is now false and is rewritten rather than deleted.
  - "Brand identity and application icons" — "One source" becomes two, bounded and named.

Register changes:
  - 27. OPENED. Q&A attribution: first name, full name, or attendee-chosen. Blocks feature 017.
  - 28. OPENED. Two brand marks now coexist — which one is MyNet's. Blocks nothing.
  - 22 unchanged and still blocks 012. 19 and 21 remain ADDRESSED-not-closed. 23 unaffected by C4.
  - 4 ESCALATED again, and this time by observation rather than by argument: a second layout defect
    invisible to every gate was found by a person using the product.
  - No entry is closed by this amendment.

Deliberately NOT decided here, and each MUST NOT be read as settled:
  - Notification triggers 2 and 3 (REQ-095, REQ-112) are present in the source conversation and are
    **not** granted. "Notification delivery" already requires an amendment per trigger, and REQ-112
    additionally needs a scheduled-work mechanism this product has never had.
  - Payment-gated event access (REQ-024). Payments did not move at 4.0.0 and do not move here.
  - Networking outside an event (REQ-047, REQ-048) — blocked on the client's own legal review
    (REQ-049), and contradicts D1's per-event discovery.

Templates and guidance requiring updates:
  ✅ .specify/templates/spec-template.md — Feature Declarations gains the C3 row
  ✅ CLAUDE.md — standing decisions, invariants, and open questions
  ⚠ scripts/brand-audit.mjs — C4's named exception is feature 016's implementation work, not this
    amendment's; the amendment states the rule, the feature encodes it

PRIOR REPORT (4.0.0 → 4.1.0):

Version change: 4.0.0 → 4.1.0

RATIFICATION STATUS: **RATIFIED 2026-08-11 by the project owner**, in the same session that ratified
4.0.0 and immediately after it. 4.0.0 opened entries 24, 25 and 26 and declared all three blockers on
feature 013; this amendment closes all three. **Feature 013 is now unblocked.**

Rationale: MINOR. Principle VIII's "private content stays private" clause gains a **third** recorded
exception, two binding-constraint blocks are extended, and three register entries close. No principle
is removed or redefined, nothing delivered is retracted, and no work performed under 4.0.0 is
invalidated. **It is not PATCH** for the reason 3.3.0 gave when adding the second exception: an
exception to a privacy rule is a change in what the product may do, not a clarification of what it
already did.

Owner decisions cited by this amendment (all 2026-08-11):
  A7. The administrative site is served from a SUBDOMAIN of the same registrable domain, with
      `/api/*` reverse-proxied under it so its calls stay same-origin, and its session cookie is
      HOST-ONLY — so an operator signed into both products holds two independent sessions.
      (Resolves register entry 26.)
      The reasoning turns on a distinction the entry warned against assuming either way:
      **`SameSite` is evaluated against the registrable domain, not the origin.** A subdomain is
      same-SITE and different-ORIGIN, so D11's CSRF defence survives untouched *and* the
      administrative app gets its own service-worker scope, its own storage and its own CSP. Neither
      alternative offers both: a path shares the origin (and the attendee service worker, registered
      at root scope, would intercept `/admin`), and a separate registrable domain is the exact shape
      of the 3.0.0 failure where `SameSite=Lax` stopped being sent and nobody could sign in.
  A8. The report queue DISCLOSES THE REPORTED CONTENT and the reporter's stated reason, to platform
      operators only. (Resolves register entry 24. **This is the third Principle VIII exception**,
      and 4.0.0 predicted it would be one.)
      Ruled on the argument the entry recorded as available: a moderator cannot judge conduct they
      cannot see, and the honest alternative is not "no access" but an operator querying the database
      directly — unbounded, unscoped and unaudited. The reason field is included because the
      rationale for keeping it out of the mail **does not transfer**: it was excluded to stop the
      text living in "an inbox nobody in this project controls", and a queue reading the row is the
      one-row case that rationale contrasts against.
  A9. A conference organizer's ASSIGNMENTS ARE REVOKED IN THE SAME TRANSACTION as account deletion,
      and as withdrawal from that conference. A conference left with no organizer enters an explicit
      UNASSIGNED state that platform operators can see and act on. (Resolves register entry 25.)
      Deletion is never made conditional, so D6 holds absolutely. The shape is 008's precedent —
      withdrawing from a conference cancels the live meetings you had at it, in the same transaction,
      because authority must not outlive the access it depends on.

Added binding constraints:
  - VIII. Attendee Data Is Personal Data — the **third** recorded exception, with its four scoping
    conditions, and the 4.0.0 paragraph that predicted it superseded in place rather than deleted.
  - "Deployment environments" — D11's one-origin rule extended to cover the administrative host.
  - "Reporting conduct out of the product" — the disclosure question it deferred to entry 24 is
    answered in place.
  - "Administration, and the second actor" — gains the topology rule, the queue-disclosure rule, and
    the organizer-lifecycle rule.

Register changes:
  - 24. RESOLVED by A8. Struck through in place; numbering stable.
  - 25. RESOLVED by A9. Struck through in place; numbering stable.
  - 26. RESOLVED by A7. Struck through in place; numbering stable.
  - 19 and 21 remain ADDRESSED-not-closed, unchanged by this amendment. A8 gives an operator what
    they need to *judge* a report; it does not decide who that operator is (21) or what standard
    they moderate an avatar against (19).
  - No entry is opened. **This is the first amendment since 3.1.0 to open none**, and it is worth
    noting rather than passing over: 4.0.0 opened three and closed none, which is the expected shape
    when an actor is introduced; this one is the settling-up.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ✅ updated: standing decisions 37–39, and the three entries moved from blockers to
    resolved.
  - brainstorm/00-overview.md, brainstorm/09-administrative-product.md — ✅ updated.

Deferred: none. Feature 013 has no blocking register entry.

A NOTE ON WHAT THIS AMENDMENT COST, recorded because the sequence is the lesson: 4.0.0 was ratified
with three known blockers and 013 could not have started under it. Answering them took one session
and produced a **third privacy exception**, a **CSRF-adjacent topology decision**, and a **deletion
rule that touches D6** — none of which is a spec detail, and all three of which would have been
decided by inference inside a feature specification had the entries not been opened deliberately.
That is the argument for opening entries you cannot yet answer.

PRIOR REPORT (3.5.0 → 4.0.0):

═══════════════════════════════════════════════════════════════════════════════════════════════
**RESTACKED FROM 3.4.0 ONTO 3.5.0, BY THIS CONSTITUTION'S OWN RULE.**

4.0.0 and 4.1.0 were drafted and ratified on 2026-08-11 from a branch based on 3.4.0, while the UAT
deployment amendment was in flight in a parallel branch. That amendment merged first and holds
3.5.0, so this one restacks onto it — the same treatment 3.5.0 itself received when it and the brand
mark were both drafted as 3.4.0, and the same treatment 3.3.0 received before that. Three occurrences
now, which is a pattern rather than an accident: **parallel branches cannot see each other's version
numbers, so the number is settled at merge and not at drafting.**

**The version numbers themselves are unchanged, and only the base moves.** 4.0.0 is above 3.5.0
either way, so nothing renumbers — unlike 3.5.0, which had to move because it collided. What changes
is what 4.0.0 is an amendment *to*.

**Nothing in 3.5.0 is contradicted, and the two are orthogonal.** 3.5.0 settles deployment: the two
domains, the Azure subscription, Mailgun, VAPID custody, the operator mailbox, and UAT's openness.
4.0.0 reverses the administration prohibition and admits a second actor. They touch one entry in
common — entry 21, the operator address — and they touch it from opposite ends without conflict:
3.5.0 names the mailbox, and 4.0.0/4.1.0 give the report a reader inside the product. Both are true
at once, which is why neither is withdrawn here.
═══════════════════════════════════════════════════════════════════════════════════════════════

RATIFICATION STATUS: **RATIFIED 2026-08-11 by the project owner**, on reading the drafted amendment.
Drafted the same day at his request during brainstorm #09
(brainstorm/09-administrative-product.md), which decided the shape of the administrative product.

It was drafted first and ratified second — a gap of one exchange rather than one release — because
this project does not let an amendment ratify itself: 3.2.0 and 3.3.0 were each ratified by the
owner at the gate of the feature they licensed, and 3.4.0 by the act of supplying the asset it
recorded. **Features 013, 014 and 015 are licensed from this point.** The owner accepted, in
particular, the four decisions labelled A1–A4 below, each of which retracts something this document
previously forbade.

*What ratification does NOT do*: entries 24, 25 and 26 remain open and each blocks feature 013.
Ratifying the actor did not answer what the report queue discloses, what happens when a sole
organizer deletes their account, or where the administrative site is served from.

Rationale: **MAJOR.** Three independent triggers, any one of which would suffice under the
versioning policy's "a principle is removed or redefined in a backward-incompatible way":

  1. **Principle III is redefined.** "The attendee is the only actor in scope" — the sentence that
     opens it and that every feature since 1.0.0 has been justified against — is retracted. A second
     actor exists.
  2. **An explicit prohibition is reversed.** Principle III's "Organizer administration ... MUST NOT
     be built without an amendment" and D2's "No administrative interface, no privileged role, and
     no content import path" are the strongest exclusions in this document. This is the amendment
     they each named as their own precondition.
  3. **Delivered guarantees are retracted.** FR-132, FR-134, FR-191, FR-311 and — for the
     administrative product only — FR-548. This is the second time this project has retracted
     delivered requirements; the first was 3.0.0 withdrawing 001's FR-066 and SC-011, and it was
     MAJOR for that reason.

**What is NOT retracted, and the distinction matters**: payment processing remains excluded, and
Principle III's exclusion of it is untouched. The two were named in one sentence and are not one
decision.

Owner decisions cited by this amendment (all 2026-08-11, recorded in
brainstorm/09-administrative-product.md):
  A1. Administration enters product scope. The prohibition in Principle III is reversed for
      administration and retained for payment processing. (Reverses the exclusion standing since
      1.0.0.)
  A2. A SECOND ACTOR exists, in TWO TIERS. A *platform operator* is seeded, holds product-wide
      authority, and is the only tier that may promote or read the report queue. A *conference
      organizer* is a promoted attendee whose authority reaches only conferences they are assigned.
      **No self sign-up into either tier**: platform operators are committed seed data, conference
      organizers exist only by promotion. This is the mirror of D5 — self sign-up was chosen for
      attendees precisely because it was the only model leaving the attendee sole actor, and it is
      unavailable here because anyone who can sign themselves up as an administrator is not one.
  A3. Administration is a SEPARATE WEBSITE against the same API and database. MyNet itself gains no
      administrative surface, no privileged view, and no role-dependent rendering. This is what
      keeps Principle III's *product* framing intact while its actor clause is redefined, and it is
      why this amendment is smaller than the prohibition it reverses.
  A4. The seed REMAINS the development and test fixture, and seeded conferences become ORDINARY
      EDITABLE conferences. One class of conference; no privileged or immutable content. D2's
      "adding a conference is a reviewed change to committed seed data" ceases to be the only route
      and remains a valid one.
  A5. A report becomes readable inside the ADMINISTRATIVE product by a platform operator. FR-548's
      prohibition survives unchanged for MyNet itself. **What the queue may disclose is NOT decided
      here** and is register entry 24 — an in-product report surface that shows reported message
      text would need a third recorded exception under Principle VIII, and this amendment
      deliberately does not grant one.
  A6. Delivery is three features behind this one amendment: 013 (administrative foundation and the
      report queue), 014 (conference content authoring), 015 (registration and attendee
      management). 013 reserves migration 0009.

Five code-level guards enforce the reversed prohibition today. Each MUST be amended deliberately by
the feature that reaches it, and none may be weakened until it stops checking anything — the failure
mode 009 named for its own absence guards:
  - apps/api/src/db/seed/catalog.ts — its header asserts there is no write path and no import path
    at any privilege.
  - apps/api/tests/unit/catalog-read-only.test.ts — CatalogRepository declares no write method
    (FR-191), asserted by name-shape over its exports, so a write method fails by existing.
  - apps/api/tests/integration/join-grants-nothing.test.ts — a registration grants no write over
    conference content (FR-132, FR-134) and no surface creates, changes or revokes a join code
    (FR-311).
  - apps/api/tests/unit/qa-absences.test.ts — no answer, pin or moderation route on Q&A.
  - apps/api/tests/unit/no-report-read-surface.test.ts — no report read surface anywhere (FR-548).

Added binding constraints:
  - III. Attendee Experience First — the actor clause is redefined and the administration exclusion
    reversed, in place, with payment processing retained.
  - VI. Web-First Delivery — scoped explicitly to the attendee product, so the administrative site
    not being an installable PWA is a recorded absence rather than a silent breach.
  - VIII. Attendee Data Is Personal Data — records that this amendment grants NO third exception,
    and that a report surface disclosing message text would require one.
  - "Data scoping, content provenance, and composition" — D2's seed clause redefined per A4.
  - "Reporting conduct out of the product" — the in-product prohibition is narrowed to the attendee
    product rather than lifted, per A5.
  - "Administration, and the second actor" — NEW block, where A1–A6 live. It binds the two tiers,
    the separate-site rule, the absence rules MyNet must keep, and the obligations the
    administrative product inherits from Principles IV, VII, VIII and IX.

Register changes:
  - 19. ADDRESSED, not closed. 013 introduces the first actor in this project capable of moderating
    an avatar. The entry stays open because a capability is not a policy: who moderates, on what
    standard, and with what appeal is undecided.
  - 21. CHANGED, not closed. The question stops being "which mailbox" and becomes "who is the
    operator and what does the queue disclose". The mail path survives; what changes is that the
    dialog's promise can now be kept by a surface rather than only by an address.
  - 24. ADDED — what the administrative report queue may disclose. Created by A5.
  - 25. ADDED — what happens when a promoted conference organizer deletes their own account.
    Standing decision D6 guarantees self-serve hard deletion; a sole organizer exercising it orphans
    a conference whose content survives.
  - 26. ADDED — the administrative site's origin and session topology, against D11.
  - 4. ESCALATED again, without being answered. A second website is an entire product of unreviewed
    desktop design, and this entry has never been closed.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ UPDATED, and the update uncovered a pre-existing drift
    with a cause worth recording. Principle IX's "Feature Declarations" section has been mandatory
    since 2.1.0, the delivery roadmap states that "the spec template carries the section", and **it
    did not**. Every shipped spec from 002 to 010 added it by hand, which worked only because each
    session read a neighbouring spec rather than the template.

    **The cause is that `.specify/templates/` is gitignored** — `.gitignore:29` ignores
    `**/.specify/**`, and `constitution.md` is tracked only because it was force-added past that
    rule. So the template was never shared, the roadmap's claim about it was never verifiable by
    anybody, and a fix to it could not have reached a second machine. **The template is therefore
    now force-added and tracked, exactly as `constitution.md` is**, because a mandatory section in
    an unshared file is not a requirement — it is a convention that survives only as long as
    somebody keeps copying it. *This changes what the repository tracks and is flagged for the
    owner to reverse if unintended.*

    The section now carries the twelve existing obligations plus a new first row: **Actor and
    tier**. Every feature through 010 had exactly one actor and never had to say so; from 013
    silence about the actor is an undeclared obligation.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required. Both are
    actor-agnostic; the plan template's Constitution Check reads "[Gates determined based on
    constitution file]" and so inherits this amendment without edit.
  - CLAUDE.md — ✅ FULLY updated at ratification. It carries A1–A6 as standing decisions **31–36**,
    entries 24, 25 and 26 as blockers on feature 013, and the five code-level guards. **Four
    pre-existing errors were corrected while reconciling it**, and they are listed because three
    were invisible until something depended on them: it cited the constitution as v3.3.0 (actual
    3.4.0); it said migrations run to 0007 (actual 0008); it **numbered the brand-mark decision 27,
    which the Q&A block already used** — the duplicate had stood since 3.4.0, and the brand mark is
    now decision 30; and it attributed the brand mark to **v3.3.0**, which is the Q&A amendment,
    where the constitution records **v3.4.0**. Its "no open question blocks any remaining feature,
    and there are no remaining features" claim was true only while administration was prohibited
    and is replaced rather than deleted.
  - brainstorm/00-overview.md — ✅ updated by brainstorm #09 on 2026-08-11.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ✅ updated. Its Non-goals
    entry for organizer administration is struck through and annotated as reopened-pending-
    ratification. **Its reserved-migration table is deliberately NOT extended**: that document
    decomposes the attendee product and is complete, and administration is a second programme
    rather than its continuation. Recording 013–015 there would misrepresent a finished plan as
    unfinished.

Deferred: three register entries (24, 25, 26) are opened rather than answered, following 3.2.0's
precedent of leaving a question explicitly open for the phase told to answer it. Each is named above
with what it blocks.

PRIOR REPORT (3.4.0 → 3.5.0):
Version change: 3.4.0 → 3.5.0


═══════════════════════════════════════════════════════════════════════════════════════════════
**RENUMBERED FROM 3.4.0 TO 3.5.0, AND THE RULE APPLIED IS THIS CONSTITUTION'S OWN.**

This amendment and the brand-mark amendment below were **both drafted as 3.4.0 and both ratified on
2026-08-10**, in parallel branches neither of which could see the other. The brand mark merged
first, so it keeps 3.4.0 and its new register entry 23; this one renumbered to 3.5.0.

That is not an ad-hoc choice. The 3.4.0 report below records the identical thing happening one
version earlier — 009 and the brand mark were both drafted as 3.3.0, 009 merged first and kept the
number. **Merge order decides, nothing published is rewritten, and the two remain separate
decisions because that is what they are.** Applying the same rule twice is what makes it a rule.

The feature renumbered with it: `specs/010-uat-deployment-and-hardening` became **011**, and the
validation-and-production phase became **012**.
═══════════════════════════════════════════════════════════════════════════════════════════════


RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who took five decisions in
brainstorm #08 (`brainstorm/08-uat-deployment-and-hardening.md`) and asked for them to be ratified
before this phase's specification is written. Follows the precedent of 3.2.0 and 3.3.0 — the
amendment precedes the code it licenses — with one difference worth naming: **this amendment gates
a deployment rather than a feature.** Nothing here changes what the product does. It changes where
it runs, who may reach it, and who holds the keys.

Rationale: MINOR. Four register entries are resolved, one binding-constraint block gains concrete
values it had deliberately left blank, and two blocks are extended. **No principle is removed or
redefined, nothing delivered is retracted, and no work performed under 3.4.0 is invalidated.** It is
not PATCH because four entries close and new binding constraints are added — a named address, a
named subscription, a named provider and a named key-custody rule are rules a later change can
violate, which a clarification is not.

Owner decisions cited by this amendment (all 2026-08-10, from brainstorm #08):
  L1. **The UAT environment is `mynet-dev.programasemilla.com`, openly reachable, carrying seeded
      data only.** Resolves entry 14's remaining half. FR-067 is satisfied by the *data* rather than
      by the access control. Basic auth and an IP allowlist were both considered and rejected for
      the same reason: each breaks the two things the validation phase depends on — handing the
      client a link for the entry-4 layout review, and installing the PWA on a physical iPhone over
      cellular.
  L2. **The production address is `mynetcr.com`, provisionally.** Not registered, not final,
      documented rather than committed. Recorded because a consequence travels with it: UAT and
      production are **separate registrable domains**, so a UAT session cookie is structurally
      incapable of reaching production. That is the strongest available form of the isolation
      FR-067 demands, and it arrived by accident of naming rather than by design — which is exactly
      why it is written down before somebody "tidies" UAT onto a production subdomain.
  L3. **The Azure subscription is `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv),
      `centralus`, for both environments.** Entry 11 was already resolved in 3.0.0; it never named
      a subscription, and `deploy/vm/envs/*.env` left `SUBSCRIPTION` blank for that reason.
  L4. **The transactional email provider is Mailgun.** Resolves entry 18.
  L5. **VAPID key custody: one pair per environment, generated once, held as a GitHub Actions
      environment secret and injected into the VM's `.env` by `deploy.sh`; rotation only on
      compromise.** Resolves entry 20's custody half. **The entry's other half is withdrawn as
      never having existed**: Web Push signs with the project's own key pair and posts to whatever
      endpoint the browser issued — there is no provider, no account and no third party to choose.
      The entry has been worded as "the push provider" since 3.1.0 and that wording was wrong.
  L6. **Abuse reports are dispatched to `apps@programasemilla.com`.** Resolves entry 21.

Added and amended binding constraints:
  - "Deployment environments" — gains the two addresses, the subscription, and the UAT access rule,
    plus the separate-registrable-domain constraint L2 makes explicit. The backup obligation gains
    the off-host requirement: an artifact on the same disk as the database it protects does not
    survive the event it exists for, and a restore drill run against such artifacts proves the
    wrong thing.
  - "Notification delivery" — the vendor-free port rule is corrected (there is no push vendor) and
    gains the custody and rotation rule from L5.
  - "Reporting conduct out of the product" — the "operator address is undecided" bullet is replaced
    by the address, with the obligation that travels with it stated rather than discharged by
    naming it.

Register changes:
  - 14. RESOLVED by L1. 18. RESOLVED by L4. 20. RESOLVED by L5, with its "push provider" half
    withdrawn as never having existed. 21. RESOLVED by L6.
  - 11. Already resolved in 3.0.0; annotated in place with the subscription L3 names.
  - 19. NOT resolved, and **escalated a third time**: L1 makes a permanent, openly reachable
    environment with public self sign-up and avatar upload a present fact rather than a prospect.
    Recorded so that this amendment cannot be read as having closed it by proximity. L6 supplies
    the operator address the nearest-available answer needs, which narrows it without answering it.
  - 2. **Already RESOLVED by 3.4.0**, which this amendment follows rather than precedes. An
    earlier draft of this block said entry 2 still blocked the validation phase; it does not, and
    the correction is recorded rather than made silently.
  - 4. Unchanged in substance; it blocks the validation phase rather than this one. Entry 4 becomes
    materially cheaper once UAT exists — it has never been answerable without a running product at
    a real screen width, and after this amendment there is one.

Delivery-plan change recorded here because it changes which entries block what, not because the
roadmap is governance:
  - The roadmap's **010 — Launch Readiness** is split. **011** becomes UAT deployment and
    pre-public hardening, and is fully unblocked by this amendment. **012** becomes the validation
    pass and production, and remains blocked by entry 4. The halves were split because
    their blockers differ, and keeping them together would have held a working UAT hostage to a
    brand mark.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md — ✅ no change
    required. plan-template.md's Constitution Check derives its gates from this file and pins no
    version; the other two carry no constitution reference.
  - CLAUDE.md — ✅ updated in the same change. **3.3.0's report recorded it as pending across two
    amendments and that was stale when written**: CLAUDE.md carries 3.2.0's and 3.3.0's content in
    full. Corrected here rather than repeated, because a propagation checklist that reports a
    false pending is worse than one that reports nothing.
  - brainstorm/00-overview.md — ✅ updated by session #08 in the same change.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ⚠ pending: it still
    describes 010 as the validation pass and has no 011.
  - deploy/vm/envs/uat.env — ⚠ pending: `SUBSCRIPTION` and `APP_DOMAIN` are blank by design, and
    this amendment is what licenses filling them. That is phase 010's work, not this command's.

Deferred: none. No placeholder tokens remain in this document.

PRIOR REPORT (3.2.0 → 3.3.0):

Version change: 3.2.0 → 3.3.0

───────────────────────────────────────────────────────────────────────────────────────────────

Version change: 3.3.0 → 3.4.0
RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who supplied the brand board on
that date and ratified this amendment during the specification of feature 010. Drafted at his
request. The supply of the mark IS the client decision register entry 2 has been waiting for since
1.0.0 — no mark is invented here, and Principle I's prohibition on answering unasked questions is
what kept one from being invented earlier.

Rationale: MINOR. One register entry is resolved, one binding-constraint block is added, and one new
entry is opened. No principle is removed or redefined, nothing delivered is retracted, and **no work
performed under 3.2.0 is invalidated**.

**FR-050 is satisfied differently, not withdrawn.** 001 required icons at the sizes installation
needs and got them; the provisional set has always declared itself provisional, in a README titled
"PROVISIONAL, NOT BRANDING" and in an amber diagonal band drawn specifically so the placeholder could
not be mistaken for a decision. Replacing it is that plan completing, not a retraction — which is the
distinction from 3.0.0, where a delivered and verified requirement was actually withdrawn.

Owner decisions cited by this amendment (all 2026-08-10, recorded in
brainstorm/08-brand-mark-and-app-icons.md and in the four scope answers given during
specs/010-brand-mark-and-app-icons):
  B1. The supplied brand board is the brand source of truth. The mark is carried into the product by
      cropping from it; a vector redraw is a later change of input to the same pipeline.
      (Resolves register entry 2.)
  B2. Brand assets are DERIVED BY A READABLE SCRIPT, not committed as opaque binaries — preserving
      the convention the provisional generator established, so that a reviewer verifies crop
      geometry and plate colour by reading code.
  B3. The icon plate carries the BRAND's navy, not the design token's. Measured, not preferred: the
      board has no alpha channel, so the mark's antialiased edges are blends against its own navy
      and any other plate colour leaves a halo.
  B4. Whether the UI palette adopts the brand's navy and coral is DEFERRED, and the resulting seam
      between the icon plate and the token-derived theme_color is knowingly accepted. (Opens
      register entry 23.)
  B5. Scope is core-only: install icons, apple-touch icon, favicons, the in-app mark and manifest
      screenshots. The iOS splash matrix, the monochrome variant and the vector redraw are booked
      follow-ups, not silent omissions.

Added binding constraints:
  - "Brand identity and application icons" — where entry 2 now lives, on the same principle 3.1.0
    and 3.2.0 applied to entries 10, 7, 8 and 9: a struck-through entry is not where anybody looks
    for a rule. It binds the single source, derivation by readable script, the brand constants as a
    reasoned exception to the token rule, the prohibition on a raster lockup, and the requirement
    that a declared icon with no file fails the build.

Register changes:
  - 2. RESOLVED by B1. Struck through in place; numbering stable.
  - 4. NOT closed, and deliberately so. Feature 010 adds a visible element to the desktop and tablet
    bands, which ESCALATES this entry rather than answering it. An amendment that quietly took it
    would answer a question nobody asked (Principle I). The escalation is recorded on the entry.
  - 22. ADDED — whether the design tokens adopt the brand's navy and coral. Created by B4. Adding is
    permitted without a decision; this is an undecided matter that outlives feature 010, and leaving
    it in a feature specification alone would make it invisible to this register.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ no change required.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Standing decisions list gains 27; open questions and current state
    understate what is settled.
  - brainstorm/00-overview.md — ⚠ pending, same reason.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ⚠ pending. Its 010 section
    lists the brand mark as an unmet long-lead gate.
  - apps/web/public/icons/README.md — ⚠ pending, and superseded by feature 010 rather than edited
    here: its "Replacing them" checklist is what that feature executes.

Deferred: none as governance. Three product follow-ups are booked by feature 010 rather than by this
document — the iOS splash matrix, the monochrome variant, and the vector redraw — because each is a
scope decision inside a feature, not a rule of conduct.

PRIOR REPORT (3.1.0 → 3.2.0):
PRIOR REPORT (3.2.0 → 3.3.0), which landed on `develop` in feature 009 while this amendment
was in flight. **Both were ratified on 2026-08-10 and both were drafted as 3.3.0.** 009 merged
first, so it keeps that number and its register entry 22; this amendment renumbered to 3.4.0
and its open question became entry 23. Nothing published was rewritten, and the two remain
separate decisions because that is what they are — one licenses a Principle VIII exception for
audience Q&A, the other closes the brand-mark entry.

RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who accepted the Principle VIII
exception on reading it at 009's implementation gate. Phase 009 is licensed from this point; the
phase's own task list (T002) carried that precondition on the first line of code, and its plan
recorded the gate as BLOCKED rather than conditional. Follows 3.2.0's precedent: the amendment
travels in the feature branch and PR, so a reviewer reads the rule and the code that relies on it
together — which means a rebase that drops it un-licenses the code, and T002 says to re-check.

Rationale: MINOR. One recorded exception is added to an existing principle and one binding-constraint
block is extended. No principle is removed or redefined, nothing delivered is retracted, and **no
work performed under 3.2.0 is invalidated**. It is not PATCH because Principle VIII's "private
content stays private" clause gains a second exception, and an exception to a privacy rule is a
change in what the product may do — not a clarification of what it already did.

Owner decisions cited by this amendment (both 2026-08-10):
  Q1. Public Q&A visibility is a further exception to "private content stays private" and closes by
      amendment rather than by entailment. Ruled at 009's spec review: Principle VIII requires an
      exception to be *recorded*, not derived, and the one existing exception was recorded by
      amendment. The entailment argument — that attribution (N3, 3.2.0) already implies public
      visibility — was available and was not taken.
      **Count corrected at ratification**: 009's artifacts called this the *third* exception, on the
      reading that 3.2.0's N2 was a second. It was not. N2 makes a held card resolve the sharer's
      live profile past the **discoverability toggle** under a standing consent — an exception to
      being *found*, recorded under "Audience questions"' neighbouring blocks, never under "private
      content stays private", which enumerates its exceptions in place. This is the **second**.
  Q2. FR-756a is withdrawn from 009. A refused Q&A action does not purge the conference cache,
      because meeting that would give one feature a cross-feature responsibility no other
      undecorated repository has. The gap it named is real, product-wide, and older than 009, so it
      becomes register entry 22 rather than 009's to fix alone.

Added binding constraints:
  - VIII. Attendee Data Is Personal Data — "Private content stays private" gains its **second
    recorded exception**: audience questions are visible to every attendee registered for the event,
    under a real name, with **no opt-out**. Recorded with the thing that makes it different from the
    first: the profile exception (2.3.0, D10) is withdrawable and this one is not.
  - "Audience questions" — extended with the visibility rule and the three consequences that travel
    with it, so an exception is not recorded without its consequences and re-litigated later:
    attribution does not consult verification state, the author's name is not a route into their
    profile, and the attendee is told what will be published before they publish it. Records that
    reporting from a question is what makes the absence of a moderator survivable on the product's
    first many-to-many surface.
  - "Audience questions" — the deletion question this block left explicitly unsolved in 3.2.0 is
    **now answered by the phase that was told to answer it**, and the answer is recorded here rather
    than only in the spec: a departing attendee's question is removed, and other people's votes on it
    go with it. The obligation to decide is discharged, not deleted.

Register changes:
  - 22. CREATED by Q2. A cached conference can stay readable for up to 24 hours after the server
    begins refusing a withdrawn registration, because no undecorated repository purges on refusal.
    Against 010. This is the first entry created since 3.1.0, and it is created deliberately rather
    than absorbed: 009 declined to fix a product-wide gap from inside one feature, and an undeclared
    decline is indistinguishable from an oversight.
  - No entry is resolved by this amendment. Entry 9 was already resolved in 3.2.0; this amendment
    records the *consequence* the resolution carried, which is a different act.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Its standing-decisions list and open-questions summary do not yet carry
    Q1, Q2 or entry 22. Already flagged as pending by 3.2.0 and still not reconciled.
  - brainstorm/00-overview.md — ⚠ pending, same reason, since 3.2.0.

Deferred: none. No placeholder tokens remain in this document.

PRIOR REPORT (3.1.0 → 3.2.0), retained because it is the precedent this amendment follows on both
counts — an owner ruling that closes by amendment, and an amendment travelling in the feature branch
whose code it gates:

Version change: 3.1.0 → 3.2.0

RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who answered three register
entries directly and ruled that they close by amendment rather than as immediately-binding client
decisions — following 3.1.0's precedent rather than 2.3.0's. Drafted at his request.

Rationale: MINOR. Three register entries are resolved and two binding-constraint blocks are added.
No principle is removed or redefined, nothing delivered is retracted, and **no work performed under
3.1.0 is invalidated**. The sharpening of standing decision 16 is not a redefinition: it makes
explicit a prohibition the clause already carried, and the only thing built against the other
reading was an unimplemented requirement in a draft specification, withdrawn before any migration
was written.

**This amendment closes the last register entries blocking a queued phase.** After it, entries 7, 8
and 9 are struck through and **no open entry blocks any remaining feature**. What stays open blocks
deployment (a domain, an Azure subscription, VAPID custody, the operator address) and release (brand
assets, desktop validation) — not code. That is a milestone worth recording, because for the life of
this project until now at least one queued phase has been unbuildable by governance.

Owner decisions cited by this amendment (all 2026-08-10; 7 and 8 recorded in
brainstorm/07-network-and-appointments.md):
  N1. A contact is someone whose digital business card you hold. No connect verb, no accept step.
      Contacts MUST NOT be derived from conversations. (Resolves register entry 7.)
  N2. Card sharing is one-directional and records the exchange, not the person. A held card resolves
      the sharer's live profile under a standing consent that outlives the event and the
      discoverability toggle. (Resolves register entry 8.)
  N3. Audience questions are attributed to their author, making Q&A a personal-data surface under
      Principle VIII. (Resolves register entry 9, unblocking 009 alongside 008.)
  N4. A card-only contact line WOULD breach standing decision 16. The field is withdrawn, and the
      clause is sharpened so the next feature does not re-litigate it.

Modified constraints:
  - "Attendee identity, personal data, and profile" — the profile-visibility clause is SHARPENED by
    N4. One visibility decision per attendee; no feature may give an individual field its own
    audience, however that audience is reached. Phase 008's rejected reading is recorded by name,
    because a rejected reading is more useful to the next reader than the rule alone.

Added binding constraints:
  - "Networking relationships and appointments" — where entries 7 and 8 now live, on the same
    principle 3.1.0 applied to entry 10: a resolved entry is not where anybody looks for a rule. It
    binds the contact model, one-directional sharing, live resolution under standing consent, the
    block as the only severing control, the proposed-then-accepted appointment, and the prohibition
    on slot availability disclosing anything about the invitee.
  - "Audience questions" — where entry 9 now lives. Attribution, the Principle VIII consequence
    stated as operative rather than noted, and an explicit refusal to let the Q&A phase assume 007's
    deletion answer transfers to a question other people have upvoted.

Register changes:
  - 7. RESOLVED by N1. Struck through in place; numbering stable.
  - 8. RESOLVED by N2. Struck through in place; numbering stable.
  - 9. RESOLVED by N3. Struck through in place; numbering stable.
  - No entry is created by this amendment. Phase 008's specification raised one candidate — the
    contact-line question — and it was answered in the same sitting rather than filed.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ no change required. Its "Register position" and
    "Event scoping" rows already carry these obligations generically.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Its standing-decisions list and open-questions summary are a working
    summary of this register and now understate what is settled.
  - brainstorm/00-overview.md — ⚠ pending, same reason.

Deferred: none. No placeholder tokens remain in this document.

PRIOR REPORT (3.0.0 → 3.1.0), retained because its reasoning about MINOR versus MAJOR is the
precedent this amendment relies on:

Version change: 3.0.0 → 3.1.0

RATIFICATION STATUS: **RATIFIED 2026-08-08 by the project owner**, who directed the implementing
session to proceed with phase 007's Web Push half on the strength of it. Drafted at his request; it
records decisions he had already taken (M4, M5, M7, M8, recorded 2026-08-07 in
brainstorm/06-messages.md) and one the implementation forced (the visibility capability).

Two values it deliberately does NOT invent — the push provider with its key custody, and the
operator address — are opened as register entries 20 and 21 rather than guessed. **Neither blocks
implementation**: the port is vendor-free and the sink adapter needs no provider, exactly as
`SinkMailService` needs none for entry 18. What entry 20 blocks is the real adapter, and therefore
delivery in a deployed environment.

Rationale: MINOR. A prohibition is lifted, Principle V's capability list gains a seventh device
interface, and a new binding-constraints block is added. No principle is removed or redefined, and
**no work performed under 3.0.0 is invalidated** — which is the distinction from 3.0.0 itself, where
two DELIVERED requirements were withdrawn and a shipped guarantee retracted.

The counter-argument was considered and rejected. Register entry 10 has bounded product scope since
1.0.0, and lifting it could be read as a redefinition of what MyNet *is*. That reading is wrong on
the versioning policy's own test: lifting a prohibition cannot make previously-compliant work
non-compliant, nothing built under it is invalidated, and the entry's operative half — the bell —
survives untouched. 2.3.0 is the closer precedent: it added `StorageService` as a seventh interface
and widened a product boundary, and was MINOR.

Owner decisions cited by this amendment (all 2026-08-07, recorded in brainstorm/06-messages.md):
  M4. Web Push is brought in, reversing the engagement-notification exclusion. `NotificationService`
      is wired to real delivery for the first time. (Resolves register entry 10, in part.)
  M5. Unread is a private per-participant read position. No read receipts, delivery ticks, typing
      indicators or presence.
  M7. Push payloads carry message content. Push and open-thread polling are two independent
      freshness paths, and the product is complete with only the second.
  M8. Reporting auto-blocks, records, and emails a configured operator address.

Modified principles:
  - V. Abstraction Before Platform and Data APIs — EXPANDED by one device capability,
    `VisibilityService`. Not a product decision: research R4 requires the open thread's poll to stop
    while the tab is hidden, the only way to ask is `document.visibilityState`, and
    `mynet/no-direct-platform-access` correctly refuses that in feature code. The alternatives were
    a lint exemption — trading a structural boundary for a poll interval — or dropping the
    condition, leaving a background tab polling forever. `packages/platform/tests/substitution.test
    .ts` is what forced this to be declared rather than added quietly: it asserted the list was
    exactly six and said a seventh "without an amendment is a decision nobody recorded".

Added binding constraints:
  - A new "Notification delivery" block. Entry 10's surviving half is written into binding text
    rather than left in a register entry that is about to be struck through — a resolved entry is
    not where anybody looks for a rule. It binds three things: no bell and no notification centre, a
    received message as the ONLY trigger, and the lock-screen consequence of M7 recorded as accepted
    rather than solved.

Register changes:
  - 10. RESOLVED IN PART, and the part that survives is PROMOTED to binding text. Engagement
    notification delivery enters product scope for a received message only. The prohibition on the
    notification bell is unchanged and now lives in "Notification delivery" above.
  - 18. UNCHANGED in substance, WIDENED in consequence. The transactional email provider now also
    carries operator abuse mail (M8), so an entry that blocked verification and recovery now also
    blocks a safety obligation.
  - 20. ADDED. The push provider and VAPID key custody — the project's second pending external
    dependency and secret, created by this amendment.
  - 21. ADDED. The operator address abuse reports are dispatched to, and the response expectation
    attached to it. M8 creates an obligation the owner personally holds.
  - 19. ESCALATED again. Open send plus permanent reachability means an unmoderated avatar is now
    also visible to anyone who can open a conversation, not only to conference co-attendees.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required.
  ✅ .specify/templates/tasks-template.md — no edit required.
  ⚠️ CLAUDE.md — MUST be updated in the same change. Its standing-decision list ends at 20 and needs
     the three this amendment ratifies; its "Out of product scope" line still excludes engagement
     notification delivery outright; and its open-questions summary needs resynchronising.
  ⚠️ packages/platform/src/interfaces/index.ts — `NotificationService`'s comment states the
     implementation "MUST NOT be wired to real delivery", which restates the entry this amendment
     reverses. It MUST be rewritten in the change that wires it, or the file contradicts itself.
  ✅ specs/007-messages-and-notification-delivery/ — this amendment is what its plan.md Constitution
     Check names as outstanding and what tasks.md Global Constraint 7 gates Phase 7 on.
  ⚠️ GroundZero/requirements.md — NOT edited. Its notification bell is prototype reference, and the
     bell remains forbidden regardless.

Deferred TODOs:
  - **Whether an attendee may suppress message content in notifications.** M7 puts message text on a
    lock screen; a per-attendee preference is the usual mitigation and was NOT decided. Recorded in
    "Notification delivery" as accepted rather than solved, and left open deliberately.
  - The push provider and the transactional email provider may well be answered together. Entries 18
    and 20 interact.

--- PRIOR REPORT: 3.0.0 ---
Version change: 2.3.0 → 3.0.0
Rationale: MAJOR. Principle VII's mandatory pipeline element "a preview deployment" is redefined in
a way that invalidates work performed under 2.x, and two DELIVERED requirements of phase 001 —
FR-066 and SC-011 — are withdrawn outright. The versioning policy's MAJOR test is "a principle is
removed or redefined in a backward-incompatible way", and the 2.0.0 precedent applied that test by
asking whether prior work is invalidated. It is: the `deploy-api` and `deploy-preview` jobs are
deleted, and a shipped guarantee to reviewers is retracted.

The counter-argument was considered and rejected. Relaxing a requirement cannot make
previously-compliant work non-compliant, so this could be read as MINOR. That reading is wrong here
because the change is not a relaxation of a rule nobody relied on: FR-066 and SC-011 were built,
verified, and are what a reviewer was promised. Retracting a delivered guarantee is a
backward-incompatible redefinition from the standpoint of everyone who relied on it, and recording
it as MINOR would understate what is being given up.

Decisions cited by this amendment (all 2026-08-07, recorded in
brainstorm/05-discover-and-the-deployment-platform.md):
  D11. Client and API share one origin. The topology decision and the CSRF defence are one decision.
       (Underlies the Principle VII and deployment changes.)
  D12. Production and UAT are Azure VMs on the mission-control/deploy/vm pattern — Caddy with
       automatic TLS in front of an API container and a loopback-only PostgreSQL container.
       (Resolves register entry 11.)
  D13. Preview becomes one long-lived UAT environment rather than per-pull-request ephemeral
       environments. (Supersedes 001 FR-066 and SC-011; changes register entry 14; resolves the
       remainder of entry 17 by replacement.)

Modified principles:
  - VII. Verified on Linux CI — REDEFINED. The pipeline's required elements no longer include a
    per-change preview deployment. A deployment to a long-lived UAT environment on merge to
    `develop` satisfies the requirement. Every correctness gate is unchanged, and the breach clause
    added in 2.2.0 is unchanged.

Modified binding constraints:
  - Technology and Architecture Constraints, "Backend and API" — the database is no longer required
    to be MANAGED. PostgreSQL itself is unchanged, as are the project-owned API contract, versioned
    reviewed migrations verified in CI before reaching real data, and repository-interface data
    access. Only who provisions the database changes.
  - A new "Deployment environments" block records what replaces the per-change preview: two isolated
    environments, the data-separation rule carried forward from 001 FR-067, and the backup and
    restore obligation.

Withdrawn requirements from a shipped feature:
  - specs/001-production-foundation/spec.md FR-066 and SC-011 are SUPERSEDED. What replaces the
    reviewer-facing guarantee is stated in the "Deployment environments" block: review against UAT
    after merge, plus a locally reproducible stack, with the reduction in per-change reviewability
    recorded as accepted rather than solved. 001's FR-067 SURVIVES and is carried forward by 006's
    FR-485.

Register changes:
  - 11. RESOLVED. API hosting, the PostgreSQL provider and object storage — Azure VMs, PostgreSQL in
    the stack, StorageService on a VM volume.
  - 14. CHANGED, not closed. Cloudflare Pages previews are withdrawn; a long-lived, publicly
    reachable UAT replaces them, so the access-control question survives in a sharper form.
  - 17. Remainder RESOLVED BY REPLACEMENT rather than by provisioning. `db-branch`, `schema-diff`,
    `deploy-api` and `deploy-preview` are deleted, so NEON_API_KEY, NEON_PROJECT_ID, FLY_API_TOKEN
    and the three Cloudflare values are no longer needed. NO CHECK WAS WEAKENED — the jobs removed
    verify nothing about correctness, and all ten that do are unchanged.
  - 4. ESCALATED. Discover is card-dense at all three widths and adds a second overlay.
  - 19. ESCALATED. Discover broadcasts avatar images to every co-attendee, converting an unmoderated
    upload from a private artifact into a published one.

Register numbering remains STABLE, per 2.3.0. Resolved entries are struck through IN PLACE.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required. The Principle IX declaration rows are
     unchanged by this amendment. The 2.3.0 tracking caveat still applies: `**/.specify/**` is
     gitignored except `memory/`, so any template edit lives in one clone until `spex init
     --refresh` overwrites it.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected.
  ✅ CLAUDE.md — updated in this change. Four restatements of "managed PostgreSQL" and the CI
     requirement's "preview deploy on every change" are corrected, and the register summary is
     resynchronised.
  ⚠️ specs/001-production-foundation/spec.md — NOT edited. FR-066 and SC-011 are superseded by this
     amendment, not rewritten. A shipped specification records what was decided and built at the
     time; editing it retroactively would destroy the very record that makes this supersession
     legible. The supersession is recorded here and in 006's specification.
  ✅ specs/006-discover-and-deployment-platform/ — this amendment is what its T001 requires and what
     its Complexity Tracking names as a merge prerequisite.
  ✅ brainstorm/00-overview.md — updated on the brainstorm branch ahead of this amendment.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — NOT edited. It is a plan
     rather than governance; 006 departs from it and says so in its specification.

Deferred TODOs:
  - No domain name exists. Caddy cannot obtain a certificate until an A record resolves. Blocks the
    first deploy, not this amendment.
  - UAT access control is undecided — register entry 14, in its new form.
  - The 2.0.0 report above states "Architecture: custom API over managed PostgreSQL" at decision 4.
    That line is a HISTORICAL RECORD of what was decided on 2026-08-04 and is deliberately NOT
    edited. It was true then. This amendment supersedes it; falsifying the record would be worse
    than leaving it superseded.

--- PRIOR REPORT: 2.3.0 ---
Version change: 2.2.0 → 2.3.0
Rationale: MINOR. Three register entries are resolved by client and owner decision, one principle is
materially expanded, one gains a seventh interface, one product-boundary statement is narrowed, and a
new binding-constraints block is added. No principle is removed or redefined, and no work performed
under 2.2.0 is invalidated.

This amendment records real decisions rather than corrections of fact. They were taken on 2026-08-07
in brainstorm #04 (brainstorm/04-attendee-identity-and-profile.md). The project owner confirmed at
the outset of that session that he speaks for the client on the two client-owned entries, so entries
5 and 6 are closed as client decisions rather than as owner assumptions.

Decisions cited by this amendment (all 2026-08-07, recorded in
brainstorm/04-attendee-identity-and-profile.md):
  D5. Attendee identity model — self sign-up with an event join code carried on the seeded event
      row, delivered entirely within phase 004. No issuer, no privileged role, no import path.
      (Resolves register entry 5.)
  D6. Data retention, deletion and export — full self-serve. Hard deletion with cascade and no
      tombstone, machine-readable export, and a retention clock for records no cascade can reach.
      (Resolves register entry 6.)
  D7. Attendee avatar handling — real upload, with resizing and EXIF stripping mandatory.
      (Resolves register entry 13.)
  D8. Transactional account mail is in scope and is distinct from notification delivery.
  D9. Avatar bytes go through a StorageService platform interface; the provider folds into entry 11.
  D10. Profile visibility — co-attendees at the same event, with a single discoverability toggle.

Modified principles:
  - IX. Every Feature Declares Its Own Completeness — expanded by one declaration: "Deletion and
    export coverage". D6 makes deletion and export a per-feature duty owed in the change that
    introduces the data, and Principle IX exists precisely because an obligation stated in one place
    and owed in another gets built by nobody.
  - V. Abstraction Before Platform and Data APIs — expanded. StorageService joins the capability
    list as a seventh interface, with a note that it is a platform capability rather than a device
    one, so the list is not read as closed to non-device surfaces.
  - VIII. Attendee Data Is Personal Data — materially expanded. Deletion and export were stated as
    "recognised obligations" whose absence must be recorded. D6 turns them into concrete standing
    commitments: self-serve, hard, cascading deletion; machine-readable export; and a retention
    clock for personal-data records that no cascade can reach. A new clause records co-attendee
    profile visibility as the exception "private content stays private" requires to be recorded.

Expanded sections:
  - Technology and Architecture Constraints → Product boundaries. The notification exclusion is
    narrowed to engagement notifications; transactional account mail is in scope per D8. The
    notification bell remains forbidden, which is the thing the exclusion was protecting.
  - Technology and Architecture Constraints → new "Attendee identity, personal data, and profile"
    block recording D5–D10 as binding constraints, in the same form as the D1–D3 block added by
    2.1.0.

Resolved register entries — moved to a new "Resolved in 2.3.0" block:
  - 5. Attendee identity model — by D5. Recorded with it: three of the entry's four candidates
    (event invitation, organizer-provisioned, ticket holder) were never available under Principle
    III or under the seed-data clause of the content-provenance constraint. The entry overstated the
    choice from the day it was written.
  - 6. Data retention, deletion and export — by D6. This supersedes the narrow declared commitment
    phase 005 shipped under, and it makes 005's ON DELETE CASCADE reachable for the first time:
    that cascade has been operationally unreachable since it shipped, because no delete-account
    route exists anywhere in apps/api.
  - 13. Attendee avatar handling — by D7.

Added register entries — numbered 18 and 19, continuing the sequence:
  - 18. The transactional email provider (owner/planning). D8 settles that account mail is sent, not
    by whom.
  - 19. Nobody moderates uploaded avatar images. Public sign-up plus image upload, with no admin
    actor, and the organizer-administration exclusion forecloses the usual answer.

Register numbering is now STABLE. Version 2.1.0 renumbered the register when it resolved entries;
this amendment does not, and the practice is discontinued. The reason is citability: entries are now
referenced by number in CLAUDE.md, in brainstorm/00-overview.md, and in commit messages that cannot
be edited, and a register whose numbers move under those references cannot be cited reliably.

Resolved entries are struck through IN PLACE rather than deleted, with the detail moved to the
"Resolved in 2.3.0" block. Leaving gaps was tried first and is wrong: Markdown renderers ignore
explicit ordinals in an ordered list and renumber sequentially, so a source gap at 5 and 6 would
render entry 7 as "5" — the stable numbering would hold in the source and be false on the page.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ⚠️ .specify/templates/spec-template.md — edited locally with a matching "Deletion & export
     coverage" row, but the edit is NOT COMMITTED AND CANNOT BE. .gitignore ignores `**/.specify/**`
     and un-ignores only `memory/` and `memory/constitution.md`, so every template is untracked and
     the change lives in this clone alone until `spex init --refresh` overwrites it.

     Worth recording plainly, because it applies retroactively: the 2.1.0 and 2.2.0 reports above
     both carry ✅ entries for template files, and none of those edits were committed either. Any
     ✅ against a `.specify/templates/` path in this file describes a working-copy edit, not a
     versioned artifact.

     The obligation is therefore carried in **Principle IX**, which is committed, rather than
     resting on the template. Where the two disagree, Principle IX is what binds — the template is a
     convenience that renders it.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected. Same
     tracking caveat applies had one been needed.
  ✅ CLAUDE.md — updated in this change. Its open-questions summary listed all three now-resolved
     entries as blocking 004, and its constraints did not carry D5–D10.
  ✅ brainstorm/00-overview.md — updated in this change, on the same branch, ahead of this
     amendment. Records the same six decisions and the twelve questions left open.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — NOT edited. The roadmap is
     a plan rather than governance and may be revised without an amendment; 004 now departs from it
     substantially, and per Governance that departure is stated in 004's specification rather than
     by rewriting the roadmap retroactively.
  ✅ specs/005-agenda-and-saved-sessions/ — unaffected as a specification. Its narrow declared
     commitment was correct under 2.2.0 and is superseded rather than invalidated; 004 is the phase
     that discharges the fuller obligation.

Deferred TODOs:
  - Entry 17 (the preview path — Fly, Cloudflare and Neon provisioning) remains open and unchanged.
  - GroundZero/requirements.md remains knowingly out of step (register entry 3). Unchanged.
  - Which jurisdiction's data-protection regime applies is NOT recorded as a register entry. D6
    deliberately builds to the strict standard so that settling it is not a precondition for 004;
    it is carried in brainstorm #04 as a design question against the retention window.

--- PRIOR REPORT: 2.2.0 ---
Version change: 2.1.0 → 2.2.0
Rationale: MINOR. Principle VII is materially expanded with a breach clause, and three register
entries are corrected against verified evidence while two are added. No principle is removed or
redefined, and no work performed under 2.1.0 is invalidated.

This amendment records no new owner decision. It corrects statements of fact that were wrong, and
adds entries for facts that were true but unrecorded. Evidence was gathered from the GitHub API on
2026-08-07 rather than from any prior document, because two prior documents disagreed.

Modified principles:
  - VII. Verified on Linux CI — expanded. The principle stated "a change is not complete until the
    pipeline is green" without naming the consequence of merging anyway. It now defines merging with
    a failing, skipped, cancelled, or never-started required check as a governance breach, requires
    a recorded waiver naming the unsatisfied checks and who accepted the risk, and states that
    skipped later stages MUST NOT be read as absence of problems.

Corrected sections (factual errors, verified 2026-08-07):
  - Branching and Change Flow → Enforcement. Said server-side branch protection was "unavailable
    (private repository on a free personal account; the branch-protection and ruleset APIs both
    return 403)" and that making the repository public or upgrading to GitHub Pro was required.
    Every part of that was false: the repository is PUBLIC and organisation-owned, the protection
    endpoints return 404 (no rule set), rulesets returns [], and protection is free on public
    repositories. The gap is unconfigured, not unavailable — a configuration task, not a risk to
    accept.
  - Register entry 6 (data retention/deletion/export). Justified blocking 004 by calling it "the
    first to store substantial personal data". It is not first; 005 ships first and stores the
    product's first attendee-authored free text as personal session notes. The block on 004 stands
    on other grounds; the justification was corrected and 005's narrow declared commitment recorded.
  - Register entry 15 (branch protection). Same false premise as the Enforcement paragraph.

Added register entries:
  - 16. Repository visibility — public and organisation-owned, previously unrecorded anywhere in
    this constitution. Changes the Principle VIII threat model; interacts with entry 14.
  - 17. (Substantially closed 2026-08-07 — the correctness gates now run; the preview path remains
    unprovisioned.) The pipeline runs red and most Principle VII checks have never executed. Features 001 and
    002 merged in this state. Must be waived or closed before 005 merges.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required. Its Principle IX declaration table
     already carries the rows this amendment touches; nothing in 2.2.0 adds a declaration category.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected.
  ✅ CLAUDE.md — updated in this change. Carried the same false branch-protection claim in two
     places and the same "first to store substantial personal data" error.
  ✅ .githooks/README.md — updated in this change. Carried the false claim and additionally named
     the repository as `daperezu/mynet-ps`, which is no longer where it lives.
  ⚠️ brainstorm/00-overview.md — pending, and deliberately not edited here. Its CI entry says runs
     have "never started", which was true when written and is now wrong in a new way: they run and
     fail. The file self-declares as subordinate to this register, so it is stale rather than
     conflicting. It is corrected on the branch carrying brainstorm #03.
  ✅ specs/001-production-foundation/, specs/002-event-context-and-catalog/ — unaffected as
     specifications. Both features merged in breach of the clause added to Principle VII; that is
     recorded as register entry 17 rather than retro-applied to their specs.
  ✅ specs/005-agenda-and-saved-sessions/ — unaffected. Its Register position declaration already
     states the entry-6 correction this amendment ratifies, and its Dependencies section already
     states that its guarantees are documentation until CI runs.

Deferred TODOs:
  - Entry 17 requires a waiver or a fix. This amendment records the breach; it does not resolve it,
    and resolving it is code and pipeline work outside a constitution amendment.
  - GroundZero/requirements.md remains knowingly out of step (register entry 3). Unchanged.

--- PRIOR REPORT: 2.1.0 ---
Version change: 2.0.0 → 2.1.0
Rationale: MINOR. One principle added, two sections materially expanded, three Open Questions
Register entries resolved. No principle is removed or redefined, and no work performed under 2.0.0
is invalidated.

Owner decisions cited by this amendment (all 2026-08-06, recorded in
docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md):
  D1. Event scoping is hybrid. Conference content — sessions, tracks, speakers, the Discover
      directory, appointments — is per-event. Relationships — contacts, exchanged cards, message
      threads — persist across events. (Resolves register entry "Event scoping of data".)
  D2. Conference content is seeded; each attendee authors their own profile. No administrative
      interface, and no content import path.
  D3. Home is a slot-based card registry built early, not a dashboard aggregated late.
  D4. Phases run mostly sequentially, in parallel only where they touch disjoint files.

Added principles:
  - IX. Every Feature Declares Its Own Completeness
Expanded sections:
  - Technology and Architecture Constraints → new "Data scoping, content provenance, and
    composition" block recording D1, D2, D3 as binding constraints.
  - Branching and Change Flow → new "Parallel work and shared artifacts" block recording D4's
    coordination protocol.
  - Governance → the delivery roadmap is named as the authoritative decomposition.
  - Governance → Open Questions Register (three entries resolved, two added, all renumbered).

Resolved register entries:
  - "Event scoping of data" (was #6) — by D1.
  - "Attendee profile view" (was #9) — a profile detail view is delivered in phase 006.
  - "Repository shape" (was #12) — the API lives in this repository at apps/api.

Added register entries:
  - Audience-question attribution (client decision) — blocks phase 009.
  - Attendee avatar handling (owner decision) — blocks phase 004.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — updated. Principle IX makes a per-feature declaration
     mandatory, so the template now carries a "Feature Declarations" section.
  ✅ .specify/templates/tasks-template.md — task categories already accommodate the declared
     obligations; no edit required.
  ✅ CLAUDE.md — updated in this change. Its open-questions summary listed the three now-resolved
     entries, and its constraints did not carry D1–D3.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — the decision record this
     amendment cites. Unchanged by it.
  ✅ specs/001-production-foundation/ — unaffected. Nothing in 2.1.0 contradicts the delivered
     slice; Principle IX applies to specifications written after this amendment.

Deferred TODOs:
  - GroundZero/requirements.md remains knowingly out of step (open question, client decision).
    Unchanged by this amendment.

--- PRIOR REPORT: 2.0.0 ---
Version change: 1.1.0 → 2.0.0
Rationale: MAJOR. The project owner decided on 2026-08-04 that MyNet is the real product, not a
front-end demo, and that durable persistence and real authentication are foundational rather than
deferred. This redefines principles in a backward-incompatible way: the "no external services, no
real authentication, no durable storage" boundary is removed, Principle I is reframed, Principle V
is widened, and Principle VI's backend bar is lifted. Work performed under 1.x that assumed a
stateless front-end demo is invalidated.

Owner decisions cited by this amendment (all 2026-08-04):
  1. Product name is MyNet. (Resolves a 1.x Open Questions Register entry.)
  2. MyNet is the real product. The demo framing is withdrawn.
  3. requirements.md is authoritative for WHAT the product is, not HOW it is delivered.
  4. Durable persistence is foundational. Architecture: custom API over managed PostgreSQL.
  5. Real authentication is foundational, not a later slice.
  6. Five destinations are individually addressable (overrides the "single-route" wording).

Modified principles:
  - I. "Requirements Are the Source of Truth" → "Requirements Define the Product, Not the Delivery
    Mode". Adds the WHAT/HOW classification that the owner decision requires.
  - III. Attendee Experience First — "authenticated attendee workspace" is now literal, not a feel.
  - V. "Platform Abstraction Before Platform APIs" → "Abstraction Before Platform and Data APIs".
    Extended to cover data access, which 1.x left uncovered.
  - VI. Web-First Delivery — the bar on backends and synchronization is lifted; native-only-on-
    trigger is retained unchanged.
  - VII. Verified on Linux CI — extended to cover the API, database migrations, and integration
    tests.
Added principles:
  - VIII. Attendee Data Is Personal Data
Rewritten sections:
  - Technology and Architecture Constraints (Data and boundaries; Persistence; new Backend and API;
    new Data access)
  - Governance → Open Questions Register (one entry resolved, five added)
Removed: the demo-scope boundary in all its forms.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — structure remains compatible.
  ✅ .specify/templates/tasks-template.md — task categories accommodate backend, migration, and
     security task types.
  ⚠️ CLAUDE.md — MUST be updated in the same change; its Business rules, Technology stack, and Open
     questions sections all still describe the 1.x demo scope.
  ⚠️ specs/001-production-foundation/ — written under 1.x. Invalidated by this amendment and being
     rewritten.
  ⚠️ brainstorm/01-foundation-slice.md — decision recorded under 1.x. A dated revisit section is
     required rather than a silent edit.

Deferred TODOs:
  - GroundZero/requirements.md still says "EventLink", still describes a front-end demo, and still
    lists persistent databases and real authentication as out of scope. Whether it is amended or
    the divergence is simply recorded is an open question requiring the client, not the owner.

--- PRIOR REPORT: 1.1.0 ---
Added the "Branching and Change Flow" section. Enforcement artifacts: .githooks/pre-commit,
.githooks/pre-push, .githooks/README.md. Known gap: GitHub server-side branch protection returns
403 on a private free-tier repository.

--- PRIOR REPORT: 1.0.0 ---
Initial ratification. Principles I–VII, Technology and Architecture Constraints, Development
Workflow and Quality Gates, Governance with Open Questions Register and Amendment Procedure.

## Part 2 — Register as of 5.4.0 (verbatim)

The Open Questions Register exactly as it stood in 5.4.0, before 5.4.1 restructured it into one
list in number order. Original entry texts, escalations and annotations live here.

Recorded discrepancies and undecided matters. Adding is always permitted; removing requires a
decision cited in an amendment.

**Resolved in 2.0.0**

- ~~Product name (EventLink vs. MyNet)~~ — **RESOLVED 2026-08-04 by owner decision: the product is
  MyNet.** Consequence: `GroundZero/requirements.md` and the prototype UI now carry a stale name.
- ~~Demo scope vs. the PWA persistence recommendation~~ — **RESOLVED 2026-08-04 by owner decision:
  MyNet is the real product with durable server-side persistence.**

**Resolved in 2.1.0**

- ~~Event scoping of data~~ — **RESOLVED 2026-08-06 by owner decision D1: hybrid.** Conference
  content is per-event; relationships persist across events. Recorded as a binding constraint under
  "Data scoping, content provenance, and composition".
- ~~Attendee profile view~~ — **RESOLVED 2026-08-06: a profile detail view is delivered**, closing
  the gap where `requirements.md` says a profile can be opened and the prototype has no such screen.
- ~~Repository shape~~ — **RESOLVED 2026-08-06: the API lives in this repository**, at `apps/api`
  inside the pnpm workspace, alongside the client.

**Resolved in 2.3.0**

All three entries that blocked phase 004, closed on 2026-08-07 by brainstorm #04. The project owner
confirmed he speaks for the client, so 5 and 6 are closed as client decisions.

- ~~5. Attendee identity model~~ — **RESOLVED by D5: self sign-up with an event join code**,
  delivered entirely within phase 004. Recorded as a binding constraint under "Attendee identity,
  personal data, and profile". Worth carrying forward: three of this entry's four candidates were
  never actually available, having been foreclosed by Principle III and the seed-data clause before
  the entry was written. The entry overstated the choice for its whole life, which is a caution about
  how the remaining entries are phrased rather than a criticism of this one.
- ~~6. Data retention, deletion, and export obligations~~ — **RESOLVED by D6: full self-serve.**
  Hard deletion with cascade and no tombstone, machine-readable export, and a retention clock for
  records no cascade can reach. Written into Principle VIII as three binding rules. Built to the
  strict standard deliberately, so that settling which regime applies is not a precondition. This
  supersedes phase 005's narrow declared commitment, and it gives 005's `ON DELETE CASCADE` something
  to trigger it — that cascade has been operationally unreachable since it shipped, because no
  delete-account route exists anywhere in `apps/api`.
- ~~13. Attendee avatar handling~~ — **RESOLVED by D7: real upload**, with resizing and EXIF
  stripping mandatory rather than optional.

**Resolved in 3.0.0**

Owner decisions taken on 2026-08-07 in brainstorm #05
(`brainstorm/05-discover-and-the-deployment-platform.md`).

- ~~11. API hosting, the managed PostgreSQL provider, and object storage~~ — **RESOLVED by D12: two
  isolated Azure VMs.** Each environment is one `Standard_B2s` running a Compose stack of Caddy
  (automatic TLS, and the reverse proxy that puts client and API on one origin), the API container,
  and a **loopback-only PostgreSQL container**. `StorageService` is backed by a volume on the same
  host. Fixed-cost, no vendor, isolation by construction. The trade is recorded rather than implied:
  a managed instance would have honoured the previous wording with no amendment, at additional cost
  per environment and a second thing to provision — it was rejected by owner decision, not by
  analysis. **The consequence is a new governance obligation**: backups, retention, and an
  *exercised* restore are now this project's responsibility, and are written into "Deployment
  environments".
- ~~17 (remainder). The preview path awaiting seven vendor secrets~~ — **RESOLVED by D13, by
  replacement.** The jobs are deleted rather than provisioned. See the annotation on entry 17 for
  why this is not a weakened gate, and Principle VII for what is given up.

**Withdrawn in 3.0.0, from a shipped feature**

- **001 FR-066 and SC-011** — the guarantee that a reviewer can open a preview of *that exact
  change*. Superseded by Principle VII as amended. This is the first time this project has retracted
  a delivered, verified requirement, and it is the reason this amendment is MAJOR rather than MINOR.
  **001 FR-067 is not withdrawn** and binds UAT unchanged.

**Resolved in 3.1.0**

- ~~Engagement notification delivery is out of product scope.~~ — **RESOLVED IN PART 2026-08-08 by
  owner decision M4**: delivery enters scope **for a received message and nothing else**. See
  "Notification delivery" under Technology and Architecture Constraints, which is now the binding
  statement; register entry 10 is struck through in place.

  Three things survive the reversal unchanged, and they are what keep it narrow:
  **the bell and the notification centre stay forbidden**; a received message is the *only* trigger,
  so a later feature wanting a second one must amend the constitution; and permission is deniable,
  so an attendee who refuses gets a complete product rather than a degraded one.

**Resolved in 3.2.0**

Owner decisions taken on 2026-08-10. Entries 7 and 8 come from brainstorm #07
(`brainstorm/07-network-and-appointments.md`); entry 9 was answered alongside them so that 008 and
009 — a free parallel pair — are unblocked by the same amendment.

**This is the first amendment to close the last entries blocking a queued phase.** With 7, 8 and 9
resolved, no register entry blocks any remaining feature. What remains open blocks *deployment* and
*release*, not code.

- ~~7. The connection model behind Network contacts~~ — **RESOLVED: a contact is someone whose card
  you hold.** Written into "Networking relationships and appointments". No connect verb and no
  accept step were invented, because neither appears in `requirements.md` or the prototype; and
  contacts MUST NOT be derived from conversations, which 007's open send had already made
  untenable.
- ~~8. What an exchanged digital card records, and whether the exchange is mutual~~ — **RESOLVED:
  one-directional, recording the exchange rather than the person.** Sharing gives the recipient the
  sharer's card and gives the sharer nothing. A held card resolves the sharer's live profile under a
  **standing consent that outlives the event and the discoverability toggle**, which is what makes
  Network the durable half of a product whose discovery surface is deliberately transient.
- ~~9. Audience-question attribution~~ — **RESOLVED: attributed.** Q&A is therefore a personal-data
  surface under Principle VIII, with identity scoping, deletion cascade and export coverage. The
  phase building it must still decide what happens to a departing attendee's question that other
  people have upvoted — 007's answer for conversations does not transfer, and that is stated in
  "Audience questions" rather than left to be discovered. **Decided 2026-08-10 by phase 009 and
  recorded in 3.3.0**: the question goes, and other people's votes on it go with it. There is no
  one-sided survivor, because a vote holds nothing of the voter's but agreement with something that
  no longer exists.

**Recorded in 3.3.0**

Owner decisions taken 2026-08-10 at phase 009's spec review and during its planning. **Neither
resolves a register entry** — one records a consequence a resolved entry carried, the other creates
an entry — which is why they sit here rather than above.

- **Q1. Public Q&A visibility is a recorded exception to Principle VIII, not a derived one.**
  Attribution was settled in 3.2.0 and *entails* that a question is seen, under a name, by the room
  — so the exception could have been treated as already made. The owner ruled that it could not:
  Principle VIII says an exception requires a *recorded* decision, both existing exceptions were
  recorded by amendment, and **an exception nobody had to accept is one nobody has accepted.** It is
  written into Principle VIII as the second recorded exception and into "Audience questions" with
  the three consequences that bound it. **It differs from the first exception in the way that
  matters**: profile visibility is withdrawable and this is not.
- **Q2. FR-756a is withdrawn from phase 009, and the gap it named becomes register entry 22.** The
  requirement asked a refused Q&A action to purge the conference cache. Meeting it would have given
  one feature a cross-feature responsibility no other undecorated repository has, by way of a new
  mechanism in a file every feature shares. **What was conceded is written down rather than lost**:
  a cached conference stays readable for up to 24 hours after the server begins refusing a withdrawn
  registration. That is product-wide, predates 009, and is not one feature's to fix alone.

**Sharpened in 3.2.0, without a decision being reversed**

- **Standing decision 16 — profile visibility is all-or-nothing** — gains an explicit prohibition on
  giving any individual field its own audience. Nothing is reversed: the clause meant this already.
  It is sharpened because phase 008 specified a contact line carried only by a shared card, on the
  reading that "all-or-nothing" governed the directory rather than the attendee. **The owner
  rejected that reading and the field was withdrawn** before any migration was written. Recorded
  because the *next* feature will meet the same temptation, and the specification that raised it did
  the right thing by refusing to resolve it silently.

  What it costs is recorded rather than glossed: M7 puts message content on a lock screen, and
  whether an attendee may suppress it **was not decided**. It is deferred, not closed.

  Consequence: the project acquires a second pending external dependency and secret — register
  entry 20, the push provider and VAPID key custody.

- ~~Feature code has no way to ask whether the attendee is looking at the page.~~ — **RESOLVED
  2026-08-08**: `VisibilityService` joins Principle V's device capabilities as a seventh.

  This is the first capability added by an *implementation* rather than by a product decision, and
  it reached this register because a test refused to let it in quietly:
  `packages/platform/tests/substitution.test.ts` asserted the list was exactly six and recorded that
  a seventh "without an amendment is a decision nobody recorded". It was right, and the guard is
  what turned a silent addition into this paragraph.

- ~~Reports have no stated disposal path.~~ — **RESOLVED 2026-08-08 by owner decision M8**: a report
  leaves the product as operator mail carrying identifiers and a timestamp only, blocks the reported
  attendee in the same action, and is readable from nowhere inside the product. See "Reporting
  conduct out of the product". **The address itself is NOT resolved** — register entry 21 — and the
  rule is binding without it: a report still blocks and still records, and the skipped dispatch is
  logged rather than silently dropped.

**Resolved in 3.4.0**

Owner decision taken on 2026-08-10, recorded in brainstorm #08
(`brainstorm/08-brand-mark-and-app-icons.md`) and in the four scope answers given while
`specs/010-brand-mark-and-app-icons` was written.

- ~~2. Real brand mark and application icons~~ — **RESOLVED: the owner supplied a brand board.**
  Written into "Brand identity and application icons". This entry needed no analysis and never had a
  candidate list — it needed an asset only the client could provide, which is why it outlived every
  entry opened after it and why nothing here could close it sooner.

  **What it cost to hold open honestly is worth recording.** The placeholder built under it is a
  navy square with a coral disc struck through by an amber diagonal band, and its README says why:
  *"a tasteful placeholder is the dangerous kind: it looks finished, so it ships and nobody notices
  for a year."* That instinct is the reusable part. An unanswered question is safest when the
  stand-in for it is impossible to mistake for an answer.

**Opened in 3.4.0**

- **23. Whether the design tokens adopt the brand's navy and coral.** Created by B4. See the entry
  below. Deliberately not answered by the amendment that created it: the two values involved are the
  primary surface and the accent, so adopting them repaints the product and re-opens every contrast
  ratio the accessibility gate checks.

**Escalated in 3.4.0, without being answered**

- **4. Desktop and tablet layouts have never been validated by the client.** Feature 010 puts a
  brand mark in the desktop rail and the tablet top bar, which is unreviewed design added to
  unreviewed design. Position, size and colourway are precisely the class of defect no behavioural
  gate can see — and 008 turned this entry from a risk into an observed one when the first human to
  look at a dialog found it rendering in the top-left corner, having passed 135 end-to-end tests,
  five review agents and CodeRabbit. **This amendment does not close it**, and feature 010 must not
  be read as having validated anything.

### 3.5.0 — UAT deployment addressing, secret custody, four entries closed

Owner decisions taken on 2026-08-10 in brainstorm #08
(`brainstorm/08-uat-deployment-and-hardening.md`). **This is the first amendment that gates a
deployment rather than a feature** — nothing here changes what the product does, only where it runs,
who may reach it, and who holds the keys. With entries 14, 18, 20 and 21 closed, **no register entry
blocks phase 011**, and what remains open blocks phase 012 or nothing.

- ~~14. Public non-production URLs~~ — **RESOLVED: `mynet-dev.programasemilla.com`, openly
  reachable, seeded data only.** FR-067 is satisfied by the data rather than by the access control.
  Two rejected alternatives are recorded because they read as safer and are not: basic auth breaks
  service-worker registration and push, an IP allowlist breaks a physical-device test on cellular,
  and both buy secrecy over data that does not need it by disabling the validation the environment
  exists for. **Does not resolve entry 19, and escalates it.**
- ~~18. The transactional email provider~~ — **RESOLVED: Mailgun.** DNS verification lands on
  `programasemilla.com`, the same records as UAT's address. `MailService` stays a vendor-free port
  with the adapter chosen by configuration identically in every environment, following the shape 007
  proved for `PushService`.
- ~~20. The push provider, and VAPID key custody~~ — **RESOLVED, its two halves differently.** The
  provider half is **withdrawn as never having existed**: Web Push signs with the project's own key
  pair and posts to the endpoint the browser issued, so there is no vendor to choose and the entry's
  wording has misdescribed it since 3.1.0. The custody half is resolved: one pair per environment, a
  repository environment secret injected into the VM's `.env`, **rotation only on compromise**.
- ~~21. The operator address abuse reports are dispatched to~~ — **RESOLVED:
  `apps@programasemilla.com`.** The address closes the entry and does not discharge the obligation
  behind it, which was filed as something the owner personally holds.

**Annotated rather than resolved**: entry 11 gains the Azure subscription it never named
(`d428f98f-a3c4-49c3-ae24-06ec3de08477`, LinaSys-DevEnv, `centralus`, both environments) — it was
correctly closed in 3.0.0 and lacked a value, not a decision.

**Two cautions this amendment adds to the ones 2.3.0 and 3.2.0 already record about how entries are
phrased.** Entry 20 was phrased by analogy to entry 18, its neighbour, and imported a vendor that
did not exist along with its urgency — half an entry described nothing for two versions. And entries
18 and 20 *were* answered together as 3.1.0 predicted, but for none of the reasons it gave.

**Opened in 4.0.0**

Owner decisions taken on 2026-08-11, recorded in brainstorm #09
(`brainstorm/09-administrative-product.md`). All three are opened rather than answered, following
3.2.0's precedent of leaving a question explicitly open for the phase told to answer it.

- **24. What the administrative report queue may disclose.** Created by A5. See the entry below.
- **25. What happens when a promoted conference organizer deletes their own account.** Created by
  the collision between A2 and D6. See the entry below.
- **26. The administrative site's origin and session topology.** Created by A3, against D11. See the
  entry below.

**Addressed but NOT closed in 4.0.0**

Both have been open specifically because no administrative actor existed. 4.0.0 creates the actor;
it does not answer either question, and neither may be read as closed by feature 013 shipping.

- **19. Nobody moderates uploaded avatar images.** A capability is not a policy.
- **21. The operator address abuse reports are dispatched to.** The address question is half
  obsolete; the "somebody has to be that operator" question is not.

**Resolved in 4.1.0**

Owner decisions taken on 2026-08-11, in the session that ratified 4.0.0 and immediately after it.
**All three entries 4.0.0 opened are closed, and the administrative programme is unblocked.**

- ~~24. What the administrative report queue may disclose~~ — **RESOLVED by A8**: the reported
  content and the reporter's stated reason, to platform operators only. Written into Principle VIII
  as its **third** recorded exception, with four scoping conditions. **4.0.0 predicted this would be
  an exception and refused to grant it by inference**, which is the point — the alternative was an
  operator's need-to-know reasoned into a privacy exception inside a feature specification.
- ~~25. What happens when a promoted conference organizer deletes their own account~~ — **RESOLVED
  by A9**: assignments revoked in the same transaction, deletion never conditional, conference
  visibly `unassigned`. Also answers the adjacent question the entry carried, about withdrawal.
- ~~26. The administrative site's origin and session topology~~ — **RESOLVED by A7**: a subdomain,
  same-site and different-origin, with host-only session cookies.

**Not closed by this amendment**, and this must not be read as tidying them away: entries **19** and
**21** remain ADDRESSED-not-closed. 4.1.0 tells an operator what they may see; it does not appoint
one or set the standard they judge by.

**Escalated in 4.0.0, without being answered**

- **4. Desktop and tablet layouts have never been validated by the client.** 3.4.0 escalated this
  for a brand mark on two surfaces. 4.0.0 escalates it by **an entire second product**: three
  features' worth of desktop-first administrative design, in a project whose only approved visual
  reference is a mobile-only 390×844 prototype frame. The administrative product is desk work, so it
  is *predominantly* the width band nobody has ever reviewed. **This amendment does not close it.**

**Opened in 5.0.0**

Owner decisions taken on 2026-08-12, recorded in brainstorms #10 and #11
(`brainstorm/10-app-fixes-and-install-icon.md`, `brainstorm/11-client-feedback-programme.md`). Both
entries are opened rather than answered, following the precedent 3.2.0 set and 4.0.0 followed of
leaving a question explicitly open for the phase told to answer it.

- ~~**27. Q&A attribution: full name, first name alone, or attendee-chosen.**~~ **RESOLVED
  2026-08-15 in 5.4.0 by R2: first name plus surname initial — "Ana R.".** 017 is unblocked.
  **Decided on the client's behalf**, reading REQ-062/063 as being about register and tone rather
  than the surname as such, and **in tension with her literal words** (*"sin apellidos"* — an
  initial is a fragment of an apellido). She must be told rather than left to discover it. **The
  enumeration in this entry was incomplete and that is the transferable lesson**: it offered three
  options, six existed, and the two missing ones cost what the cheapest listed option costs and
  dissolve the deciding case — two attendees named Ana whose questions appear together on a hall
  wall. **A register entry that enumerates its options asserts the enumeration is complete.** This
  one did not, and it blocked a feature for three days on a trade that was never as hard as it
  looked. *Original entry:* Created by C2, against
  Q1. **Blocks feature 017.** 3.3.0 bound the asker's full real name with no opt-out and argued it
  at length; the client asks for the first name alone (REQ-062, REQ-063); **the client's own
  extraction records the thread as unresolved** (OPEN-002), and the source transcript contains both
  positions in the same conversation. REQ-061 adds a requirement neither position states — that the
  system MUST know the true author whatever is displayed — which is compatible with all three
  answers and is worth carrying into whichever is chosen.

  **Opened rather than settled because settling it would be the exact failure Principle I forbids.**
  The client's stated preference was available and would have made 017 unblocked today; taking it
  would have closed by inference a thread the client herself recorded as open. The practical case
  that decides it is mundane and should be put to her directly: two attendees named Ana at one event.

- **28. Two brand marks now coexist, and which one is MyNet's is undecided.** Created by C4. **Blocks
  nothing**, and the product behaves as the owner directed. The install icon derives from
  `assets/brand/new-logo.png` — a gradient disc — while every in-app mark derives from the board's
  coral N. The owner ruled explicitly that this is an icon change and not a rebrand, so the
  divergence is **accepted knowingly** rather than overlooked.

  Recorded because a knowingly accepted divergence and an unnoticed one look identical six months
  later, and because the resolution in either direction is expensive: adopting the gradient mark
  in-app repaints five authentication screens, the rail and the top bar, and interacts with entry 23,
  which concerns the board's values and not this mark's. **No feature may resolve it by quietly
  replacing one mark with the other.**

**Escalated in 5.0.0, without being answered**

- **4. Desktop and tablet layouts have never been validated by the client.** *Escalated a third
  time, and this time by observation rather than argument.* 3.4.0 escalated it for a brand mark;
  4.0.0 for a second product. 5.0.0 escalates it because **a person using the product found a second
  layout defect that every gate had passed**: the message composer grows without a bound until its
  send control leaves the viewport, on the mobile width band that *is* the approved prototype's only
  frame. The first was 008's dialog rendering in the top-left corner. Two instances is a pattern, and
  the pattern is that this project's ten correctness gates verify that a control exists, is labelled,
  is focusable and works — and none of them looks at where it is. **This amendment does not close
  it**, and no feature may be read as having validated a layout because its tests are green.

**Opened in 5.2.0**

Both are opened rather than answered, following 3.2.0's precedent of leaving a question explicitly
open for whoever is told to answer it. **Neither blocks feature 014.**

**These two were drafted as entries 27 and 28** and are renumbered here, because 5.0.0 opened its own
27 and 28 on the same day from a parallel branch. See this amendment's sync report for why the
collision was possible and what it costs; the entries themselves are unchanged in substance.

- **29. Whether an attendee may suppress content in notifications.** **Promoted** from a deferral
  that has sat in prose since 3.1.0 — it was recorded there as "accepted rather than solved" and
  never given a number. 5.2.0 makes it apply to a **second** content type: a saved-session
  notification carries a session title, so what somebody chose to attend is now visible on their
  locked device alongside what somebody said to them. Two amendments have now accepted the same cost
  without deciding the mitigation, and the usual one — a per-attendee content preference — has never
  been weighed. It is numbered now because a consequence recorded twice in the same words is a
  consequence nobody is going to act on. **Blocks nothing.**

- **30. Speakers are personal data about people who are not attendees.** A speaker row carries a
  real person's name, title and company. This is not new — the rows have been seeded since 002 — but
  5.2.0 makes them **organizer-authored**, which moves responsibility from a reviewed commit to a
  promoted attendee typing into a form. Principle VIII has only ever considered attendees, and both
  coverage tests derive their expectations from the schema, so the question they cannot ask is who
  answers for a person who never signed up. **Blocks nothing today; it blocks any claim that
  Principle VIII's coverage is complete.**

**Opened in 5.3.0**

- **31. Whether deleting a session should notify the attendees enrolled in it.** O2 places an
  enrolment outside N5's engagement set, so a session with live enrolments may be deleted — and
  because enrolling *replaces* saving on an optional session, those attendees hold no `saved_sessions`
  row and are therefore reached by no marker and no push. **A held seat can disappear with no trace,
  and the person learns by arriving.** The obvious remedy is to notify them, and that is exactly what
  cannot be done cheaply: a deletion is not one of N1's three material changes, so notifying on it is
  a **third trigger** and needs its own amendment. Opening this rather than solving it is deliberate,
  on the same reasoning 4.0.0 gave when it predicted the third privacy exception and refused to grant
  it by inference. **Blocks nothing**; the product behaves exactly as O2 ratifies.

  *It shares a boundary with entry 29 and is not merged with it.* Both are about what the product
  fails to tell somebody about their own commitments — 29 about what a notification discloses, 31
  about a notification that is never sent — but a suppression preference and a missing trigger are
  different mechanisms with different costs.

**Open — require a client decision**

*Numbering is stable.* Resolved entries are **struck through in place** rather than removed, and
their successors are not renumbered — see the 2.3.0 sync report for why. They are kept in the list
rather than left as gaps because Markdown renderers ignore explicit ordinals and renumber sequentially,
so a gap in the source would silently render as the wrong number against a neighbouring entry.

1. **What "PS" denotes** in the repository name `mynet-ps`.
2. ~~**Real brand mark and application icons.**~~ **RESOLVED 2026-08-10 in 3.4.0** — the project
   owner supplied a brand board, and the supply is the client decision this entry was waiting for.
   See "Brand identity and application icons" under Technology and Architecture Constraints, which
   is now the binding statement. Carried forward from this entry's life: it was right that no mark
   was drawn here in the meantime, and the deliberately ugly placeholder — a coral disc struck
   through by an amber band — is why the gap stayed visible for the whole of it.
3. **`GroundZero/requirements.md` is now knowingly out of step** with this constitution on product
   name, delivery mode, persistence, authentication, and routing. Whether it is amended or the
   divergence is recorded is undecided.
4. ~~**Desktop and tablet layouts have never been validated by the client.**~~ **RESOLVED
   2026-08-15 in 5.4.0 by R3 — CLOSED BY OWNER RATIFICATION, without a client acceptance act.** 012
   is unblocked. **This is not a claim that the layouts were validated**, and specifically not a
   claim that green gates validated them: 5.0.0's rule on that stands unamended and is deliberately
   unused here. The owner ratifies in the acknowledged absence of validation, and **the cost is
   ratified with it** — desktop use is the client's own requirement (REQ-108, REQ-110), she has
   never seen the product at a desk, and closing this entry removes the thing that kept each new
   feature's unreviewed desktop design visible, so the debt resumes compounding silently. Ratified
   as-is: the 768–1279px rail divergence between the two products, and Home's two-column cards on an
   upright tablet — both unrecorded choices, now choices. **Carved out as a defect rather than
   ratified**: `AdminShell` presents two layouts where Principle IV requires three, which fiat
   cannot make compliant. *This entry outlived every question opened after it except 19 and 21, was
   escalated three times, and was closed without the act it asked for.* Retained in place so the
   numbering stays stable. *Original entry:* The approved prototype is
   mobile-only at a fixed 390×844 frame. Every desktop layout built before this is answered is
   unreviewed design, so the cost of leaving it open compounds with each feature. *Escalated
   2026-08-07 in 3.0.0*: phase 006 adds a card-dense multi-column directory grid and a second modal
   overlay, making it the largest single addition of unreviewed desktop design so far.

   **Narrowed and made answerable 2026-08-10 in 3.4.0.** It blocks phase **011**, not 010. More
   usefully: it has never been answerable, because reviewing a layout requires a running product at
   a real screen width and there has never been one. L1's openly reachable UAT is what makes it a
   question somebody can actually be asked, which is a reason to sequence 010 first rather than a
   reason to keep waiting. **008 turned this entry from a risk into an observed defect** — the first
   dialog a person looked at was rendering in the top-left corner, having passed 135 end-to-end
   tests, five review agents and an automated reviewer — so the compounding cost it warns about is
   demonstrated rather than hypothetical.
5. ~~**Attendee identity model.**~~ **RESOLVED 2026-08-07 in 2.3.0** — self sign-up with an event
   join code. Retained in place so the numbering stays stable; see "Resolved in 2.3.0" above.
6. ~~**Data retention, deletion, and export obligations.**~~ **RESOLVED 2026-08-07 in 2.3.0** — full
   self-serve, written into Principle VIII. Retained in place; see "Resolved in 2.3.0" above.
7. ~~**The connection model behind Network contacts.**~~ **RESOLVED 2026-08-10 in 3.2.0** — a
   contact is someone whose digital business card you hold. No connect verb, no accept step, and
   contacts MUST NOT be derived from conversations. Now binding text under "Networking relationships
   and appointments" above. Retained in place so the numbering stays stable; see "Resolved in 3.2.0"
   below. Worth carrying forward: **half of this entry was closed by a different feature's decision**
   — 007's open send made a conversation unilateral, which eliminated the prototype's answer before
   anybody ruled on the entry itself. An entry can be narrowed by work that never names it.
8. ~~**What an exchanged digital card records, and whether the exchange is mutual.**~~ **RESOLVED
   2026-08-10 in 3.2.0** — one-directional, and it records the exchange rather than the person. Now
   binding text under "Networking relationships and appointments" above. Retained in place; see
   "Resolved in 3.2.0" below. **Entries 7 and 8 closed together with one decision**, having been
   filed as two, which is a caution about how the remaining entries are phrased rather than a
   criticism of these.
9. ~~**Audience-question attribution.**~~ **RESOLVED 2026-08-10 in 3.2.0** — questions are
   **attributed** to their author. The entry asked whether this makes Q&A a personal-data surface
   under Principle VIII; it does, and that consequence is now binding text under "Audience
   questions" above. Retained in place; see "Resolved in 3.2.0" below.
10. ~~**Notifications.**~~ **RESOLVED IN PART 2026-08-08 in 3.1.0** by M4 — engagement
    notification delivery enters product scope **for a received message and nothing else**, and is
    now binding text under "Notification delivery" above rather than a register entry. **The bell
    remains forbidden**, along with an in-app notification centre: that half of this entry is
    carried forward unchanged and unweakened, which is why the entry is resolved *in part* rather
    than closed. Retained in place so the numbering stays stable; see "Resolved in 3.1.0" above.
    Creates entry 20.

**Open — require an owner or planning decision**

11. ~~**API hosting, the managed PostgreSQL provider, and object storage.**~~ **RESOLVED 2026-08-07
    in 3.0.0** by D12 — two isolated Azure VMs (`uat`, `prod`), each running Caddy with automatic
    TLS in front of an API container and a **loopback-only PostgreSQL container**, with
    `StorageService` backed by a volume on the same host. All three halves of this entry close
    together, which is what the 2.3.0 widening anticipated. Retained in place so the numbering stays
    stable; see "Resolved in 3.0.0" below.

    **ANNOTATED 2026-08-10 in 3.5.0 by L3.** The resolution named a topology and no subscription,
    which is why `deploy/vm/envs/*.env` shipped with `SUBSCRIPTION` blank for three phases. It is
    `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv), `centralus`, for both environments —
    now binding text under "Deployment environments". Recorded as an annotation rather than a
    reopening: the entry was correctly closed, and what it lacked was a value rather than a decision.
12. **Authentication ownership** — self-implemented versus a delegated provider. *Still open, and
    worth stating what "open" now means*: authentication is self-implemented and has been shipped
    since 004. The question is whether that is the settled answer or an unratified default, and
    nothing is blocked on it.
13. ~~**Attendee avatar handling.**~~ **RESOLVED 2026-08-07 in 2.3.0** — real upload, with resizing
    and EXIF stripping mandatory. Retained in place; see "Resolved in 2.3.0" above.
14. **Public non-production URLs.** *Changed, not closed, 2026-08-07 in 3.0.0 by D13.* The original
    entry read "Public preview URLs" and named Cloudflare Pages previews, which are withdrawn. It is
    replaced by something **sharper, not milder**: a single long-lived UAT environment, publicly
    reachable, carrying realistically-shaped attendee data, and persisting between changes rather
    than being destroyed with each pull request. The data-separation half is now settled and binding
    (Deployment environments, above, carrying 001's FR-067 forward). **Access control remains
    undecided**, and it is now a question about a permanent address rather than a transient one.
    Interacts with entries 16 and 19.

    **RESOLVED 2026-08-10 in 3.5.0 by L1: openly reachable, seeded data only.** The address is
    `mynet-dev.programasemilla.com`. Access is not restricted by credential, allowlist or network
    boundary, because **the separation FR-067 demands is carried by the data and not by the door** —
    nothing that must be kept from a stranger is ever present. Basic auth and an IP allowlist were
    considered and rejected for the same reason: each disables the validation the environment exists
    to make possible (service-worker registration and push; a physical-device test on cellular) in
    exchange for secrecy over data that does not need it. Now binding text under "Deployment
    environments". **Entry 19 is not resolved with it and is escalated by it** — see below.
15. **Server-side branch protection is unconfigured** — a configuration task, not an accepted risk.
    *Corrected 2026-08-07*: this entry previously recorded it as "unavailable (private repository,
    free personal account; APIs return 403)". **Both halves were wrong.** The repository is public
    and organisation-owned; the protection endpoints return **404 — no rule set** — and `rulesets`
    returns an empty list. Branch protection is free on public repositories. Until it is applied,
    enforcement is client-side only and bypassable with `--no-verify`.
16. **The repository is public and organisation-owned** — `Programa-Semilla/mynet-ps` — and nothing
    in this constitution recorded that. Whether it was intended, or is an artifact of how the
    repository was created, is undecided. It changes the Principle VIII threat model either way:
    committed seed data, migrations, workflow configuration, and the generated API contract are all
    world-readable, and preview deployments are reachable by anyone who finds them. This interacts
    with entry 14. *Added 2026-08-07*.
17. **The pipeline runs red, and most of the checks Principle VII names have never executed.**
    *Verified 2026-08-07*: every pull-request run of the `verify` workflow has concluded in failure,
    and every `develop` push run was cancelled. On the most recent run `lint`, `typecheck`, `build`,
    `contract` and `test-component` pass, while `test-unit` and `cleanup` fail — and `db-branch`,
    `schema-diff`, `migrations`, `test-integration`, `test-e2e`, `test-accessibility` and
    `deploy-api` are all **skipped**. Migration verification, integration tests against a real
    database, accessibility checks and end-to-end browser tests are therefore specified by Principle
    VII but have never once run. Features 001 and 002 both merged in this state. Under the breach
    clause added to Principle VII in 2.2.0 this MUST be waived or closed, and it MUST be closed
    before phase 005 merges, because 005's personal-data guarantees are enforced only by the
    integration suite. *Added 2026-08-07*.

    **Substantially closed 2026-08-07**, in two changes, and the remainder is narrower than the
    entry above describes. 005 gave the `unit` Vitest project the configuration
    `event-scope-audit.test.ts` needed, and `test-unit` passed in CI for the first time — so
    FR-230's route audit, the thing that fails the build when a conference-accepting route lacks
    its guard, now actually executes. PR #9 then found the real cause of the rest: the four
    database gates were bound to `db-branch`, so **one unset repository secret skipped every check
    that tests correctness**. They never needed a vendor — Principle VII asks for a real database,
    not a particular one — and they now run on per-job PostgreSQL service containers, which is
    stricter isolation than the shared branches they replace and depends on no secret at all. Run
    `31192787746` records `migrations`, `test-integration`, `test-accessibility` and `test-e2e`
    all passing for the first time.

    A second fault was found in the same change and is worth recording, because it would have
    outlived the first: `AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY` were **never set in the
    workflow**, so these jobs would have failed one line further on even had the Neon secret been
    present. It was invisible only because `db-branch` failed first.

    **What remains open** is the preview path alone — `db-branch`, `schema-diff`, `deploy-api` and
    `deploy-preview` — which needs `NEON_API_KEY`, `NEON_PROJECT_ID`, `FLY_API_TOKEN` and the three
    Cloudflare values, plus a `preview-base` branch in the Neon project. The aggregate `verify`
    check stays red until those exist, which is the honest signal for missing provisioning. **No
    check was weakened to reach this state**; four that were skipped were made to run, which is the
    opposite of the shortcut FR-071 forbids.

    005 merged under a recorded waiver naming the then-unsatisfied checks (PR #8), before PR #9
    landed. *Annotated 2026-08-07.*

    **CLOSED 2026-08-07 in 3.0.0 — the remainder is resolved BY REPLACEMENT, not by provisioning.**
    D13 retires Fly, Cloudflare Pages and Neon, so `db-branch`, `schema-diff`, `deploy-api` and
    `deploy-preview` are **deleted**. The seven secrets they awaited are no longer needed, and the
    aggregate check can go green because its blocker no longer exists.

    **This is not the shortcut FR-071 forbids, and the distinction is worth stating precisely**: the
    four jobs removed verify nothing about correctness — they build environments. Every check that
    does verify correctness is unchanged and still runs: `typecheck`, `lint`, `test-unit`,
    `test-component`, `contract`, `migrations`, `test-integration`, `build`, `test-accessibility`
    and `test-e2e`. `test-e2e` was checked specifically and runs against a `postgres:17` service
    container, never against the preview. **Zero checks were weakened, disabled, or made
    non-blocking.**

    What *is* given up is the reviewer-facing guarantee, and it is recorded under Principle VII
    rather than buried here.

18. **The transactional email provider.** D8 settles that account mail is sent — verification and
    password reset — and that it is distinct from the excluded engagement notifications. By whom it
    is sent is undecided, and it brings one external dependency and one secret. Needed by phase 004.
    *Added 2026-08-07.*

    **WIDENED 2026-08-08 in 3.1.0.** M8 adds a third message to this dependency: operator abuse
    mail. The entry is unchanged in substance and larger in consequence — an unprovisioned provider
    now leaves a **safety** obligation undelivered as well as verification and recovery. It is not
    a blocker for the reporting feature, which blocks and records regardless and logs the skipped
    dispatch, but it means nobody is currently told a report was filed. Interacts with entry 21,
    which is the address rather than the sender, and with entry 20 — the push provider and the mail
    provider may well be answered together.

    **RESOLVED 2026-08-10 in 3.5.0 by L4: Mailgun.** Its sender verification is DNS records on
    `programasemilla.com`, the same records as UAT's address, which is why the two were settled in
    one session. **The speculation that this and entry 20 would be answered together turned out to
    be half right and instructively so**: they were answered together, but not because they shared a
    vendor — entry 20 had no vendor to share. Worth carrying forward as a caution about how an entry
    is phrased, alongside the same note on entries 5, 7 and 8.

    Two consequences bind: `MailService` MUST stay a vendor-free port with the adapter selected by
    configuration in every environment identically — the shape 007 proved for `PushService`, so a
    local run exercises the production path — and the vendor SDK MUST stay confined to
    `apps/api/src/mail/` by the same lint boundary that confines storage and push. **Real mail is
    not optional for a usable environment**: verification gates discoverability, so with only the
    sink adapter every attendee is invisible to every other one.
19. **Nobody moderates uploaded avatar images.** D5 opens public self sign-up and D7 admits image
    upload, in a product with no administrative actor by construction — and the
    organizer-administration exclusion in Principle III is precisely what forecloses the usual
    answer. Whether this is handled by automated classification, by a reporting path, by restricting
    who may upload, or by accepting the exposure is undecided. Cheapest to settle before the first
    publicly reachable preview, and interacts with entries 14 and 16. *Added 2026-08-07.*

    **ESCALATED 2026-08-07 in 3.0.0.** When this entry was written, an uploaded image was visible on
    one profile page to whoever navigated to it. Phase 006 renders co-attendee faces **in a
    directory, to every attendee of the conference, by default** — which converts an unmoderated
    upload from a private artifact into a published one. The entry is unchanged in substance and
    materially larger in consequence. Now interacts with entry 14 in its new form: a permanent,
    publicly reachable UAT carrying real-shaped profile images.

    **ESCALATED AGAIN 2026-08-08 in 3.1.0.** Phase 007's open send means any attendee sharing a
    conference may open a conversation with any other, with no request and no acceptance step, and
    a conversation once open is permanent. An unmoderated avatar is therefore now visible in a
    thread header to somebody the attendee never chose to be seen by — and the closest thing to a
    moderation answer this project has is the block and report path 007 ships, which is
    per-person, after the fact, and routes to an operator who does not yet exist (entries 18, 21).
    Still unchanged in substance.

    **ESCALATED A THIRD TIME 2026-08-10 in 3.5.0, and NOT resolved.** L1 makes UAT permanently and
    openly reachable with public self sign-up and avatar upload, so this stops being a description
    of a future environment. The entry is unchanged in substance and is now a present fact. **This
    is recorded explicitly so that 3.4.0 cannot be read as having closed it by proximity** — it
    resolves the entry beside it (14) and deliberately does not resolve this one.

    L4 and L6 **narrow it without answering it**: the operator mailbox that entries 18 and 21 left
    unprovisioned now exists, so the nearest thing this project has to a moderation answer — 007's
    report-to-an-operator path, on the reading that Principle III forecloses organizer
    administration *inside the product* but not an operator acting out-of-band — is now actually
    available rather than merely argued for. Whether avatars follow that route is undecided. What is
    materially better than at 3.1.0 is that UAT carries **seeded data only**, so the exposure is
    bounded to whoever finds an unpublished URL and uploads an image of their own.

    **ADDRESSED, NOT CLOSED, 2026-08-11 in 4.0.0 by A1.** This entry has been unanswerable for its
    whole life for a reason it states itself: the organizer-administration exclusion "is precisely
    what forecloses the usual answer". That exclusion is now reversed, and feature 013 introduces the
    first actor in this project capable of acting on an uploaded image. **A capability is not a
    policy**, which is why this stays open: who moderates, against what standard, on whose complaint,
    with what appeal, and whether a removed avatar is replaced or blanked are all undecided. What has
    changed is that the answer is now buildable. *This entry MUST NOT be read as closed by the
    existence of feature 013.*
20. **The push provider, and VAPID key custody.** *Added 2026-08-08 in 3.1.0, created by M4.* The
    project's second pending external dependency and secret after entry 18, and the two may well be
    answered together. Two halves, and the second is the one that needs a person rather than a
    vendor comparison: **who holds the VAPID private key**, where it lives for each of the two
    environments, and what happens when it is rotated — a rotated key invalidates every existing
    subscription, so every attendee silently stops receiving until their browser re-registers.
    Blocks only the real adapter: the port, the sink adapter and every test against it are buildable
    without it, exactly as `SinkMailService` is for entry 18.

    **RESOLVED 2026-08-10 in 3.4.0, in two different ways for its two halves.**

    The **provider half is withdrawn as never having existed.** Web Push signs with the project's own
    VAPID pair and posts to whatever endpoint the browser issued — `fcm.googleapis.com` for
    Chromium, Mozilla's for Firefox — with no account, no SDK, no bill and no third party to select.
    007 discovered this while implementing `WebPushService` and delivered against it end to end;
    the entry's wording has been wrong since 3.1.0 and is corrected here rather than left to mislead
    a reader into shopping for a vendor. **This is the first register entry this project has closed
    by finding that half of it described nothing**, and it is worth the words: an entry phrased by
    analogy to a neighbour — entry 18, which does have a vendor — imported that neighbour's shape
    along with its urgency.

    The **custody half is RESOLVED by L5**: one pair per environment, generated once, held as a
    repository environment secret and injected into the VM's `.env` by `deploy.sh` — the same path as
    every other secret, chosen so that key custody is not a second mechanism — and **rotated only on
    compromise**, because rotation is a silent delivery outage for every attendee until their browser
    re-registers. Now binding text under "Notification delivery".
21. **The operator address abuse reports are dispatched to, and the response expectation attached to
    it.** *Added 2026-08-08 in 3.1.0, created by M8.* Not a vendor question — **an obligation the
    owner personally holds.** Somebody has to read that inbox, and the product deliberately promises
    the reporter nothing it cannot keep: no case identifier, no status, nothing to poll, because
    FR-548 forbids the surface that would answer any of them. What the reporting dialog says today
    is that a person will read it. **That sentence is only true once this entry is answered.**
    Interacts with entry 18 (who sends it) and entry 19 (it is the nearest thing to a moderation
    path this product has).

    **RESOLVED 2026-08-10 in 3.5.0 by L6: `apps@programasemilla.com`.** Now binding text under
    "Reporting conduct out of the product". **The address closes the entry; it does not discharge
    the obligation**, and the entry's own wording is what makes that distinction survive its
    resolution — this was filed as an obligation the owner personally holds, not as a configuration
    value, and naming a mailbox does not make somebody read it. The response expectation the entry
    also named remains exactly as the product states it: a person reads the report, and nothing
    further is promised, because FR-548 forbids the surface that would report back.

    **CHANGED, NOT CLOSED, 2026-08-11 in 4.0.0 by A5.** The entry was written as a question about an
    address, and half of that framing is now obsolete: a platform operator reading a queue keeps the
    dialog's promise without any mail being sent. What survives is the harder half, unchanged in
    force — **somebody has to be that operator.** A queue nobody opens is exactly as empty a promise
    as an inbox nobody reads, and this remains an obligation the owner personally holds rather than a
    vendor question. Two consequences: the mail path is **not** deleted, because an operator who must
    open a site to learn a report exists learns late; and what the queue may disclose becomes its own
    entry (24) rather than part of this one.

22. ~~**A cached conference outlives a withdrawn registration by up to 24 hours.**~~ **RESOLVED
    2026-08-15 in 5.4.0 by R1 — ACCEPTED, not fixed.** The 24-hour readable window is ratified. The
    ground on which it was tolerated is **struck as false**: the original text below says the data
    is *"the conference programme, not another attendee's personal data"*, and the cached
    `appointments` payload has carried the other party's display name and the agreed meeting topic
    since 008 — **before this entry was written**. It is accepted instead on a true ground: no third
    party can end a registration today, and the only way one ends is an act the attendee performs on
    their own device, which purges that device in the same action. **That ground is protected by a
    naming convention** — `no-attendee-restriction.test.ts` selects routes by URL keyword, and a 015
    route named `DELETE /admin/conferences/:eventId/registrations/:id` passes green — so the guard
    MUST be widened to the concept before 015 is specified, and **if 015 adds such a route this
    entry reopens.** Two mechanisms are licensed (evict at expiry; erase any conference absent from
    a live registered-conferences read), three are rejected on evidence, and the lifetime figure is
    **deferred as a product judgement that cannot be priced without a real conference**. Retained in
    place so the numbering stays stable. *Original entry, with its false sentence left visible:*

    *Added 2026-08-10
    in 3.3.0, created by Q2. Against phase 012 — refiled from 010 in 5.4.0, having never been
    updated for the 010→011/012 split.* The offline caching decorator revokes on **age
    alone** — a 24-hour lifetime keyed `(attendeeId, eventId, resource)` — so when the server begins
    refusing an attendee who has withdrawn from a conference, or been removed from it, the
    programme, saved sessions and notes already on their device stay readable until the entry
    expires. **A refused write is the only moment the client learns the answer changed**, and no
    undecorated repository purges on one: Messages, Discover, cards, profile and now Q&A all refuse
    without purging, and have since each shipped.

    **This entry exists because 009 declined to fix it, and the decline is deliberate.** 009 had a
    requirement for it — FR-756a, that a refused Q&A action must invalidate that conference — and
    withdrew it, because what the requirement asks of Q&A is to purge **other features'** caches: a
    cross-feature responsibility no other undecorated repository carries, discharged from whichever
    feature happened to notice. Building `purgeOnRefusalOnly` into
    `packages/data/src/http/cached.ts` would add a mechanism to a file every feature shares,
    exercise it from exactly one, and leave the hole open everywhere else. **The gap is
    product-wide and older than 009**, and an undeclared decline is indistinguishable from an
    oversight — which is the whole reason this is written down rather than absorbed.

    What it is **not** is a data-retention breach: the data is the conference programme, not another
    attendee's personal data, and Discover and Messages are uncached precisely so that other
    people's data is never what ages on a device. It is a **stale-authorization** window, bounded at
    24 hours, on content the attendee was legitimately shown.

23. **Whether the design tokens adopt the brand's navy and coral.** *Added 2026-08-10 in 3.4.0,
    created by B4.* Measured from the supplied board, the brand and the tokens disagree: brand navy
    `#0d1942` against `navy-800 #1b2340`, brand coral `#fe6551` against `coral-500 #e8634d`. Cream
    agrees and is not at issue. Adopting the brand values would make the board the single source of
    truth for colour and remove the seam between the icon plate and the token-derived `theme_color`
    on the splash screen. **The cost is that it repaints the entire product**: `navy-800` is the
    primary surface and `coral-500` is both the accent and the focus ring, so every contrast ratio
    the accessibility suite asserts must be re-verified on new values. **Blocks nothing** — the
    product behaves as specified either way, and feature 010 is explicitly forbidden from resolving
    it. What it costs to leave open is one visible seam on one surface.

24. ~~**What the administrative report queue may disclose.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A8** — the reported content **and** the reporter's stated reason, to platform operators only,
    under four scoping conditions now recorded as the **third** Principle VIII exception. Retained
    in place so the numbering stays stable. The entry's own framing below was right that this needed
    an amendment rather than a specification, and it is preserved because the reasoning is the
    artifact. *Original entry, as written in 4.0.0:*

    *Added 2026-08-11 in 4.0.0, created by
    A5. Blocks feature 013’s report surface, and nothing else.* 3.1.0 bound operator mail to
    identifiers and a timestamp — never message text, never the reporter's reason — on the ground
    that both are two attendees' personal data and an inbox sits outside every retention rule this
    project controls. **An in-product queue is not an inbox**, so the second half of that reasoning
    does not transfer, and the question is genuinely open rather than settled by analogy.

    The floor is fixed and needs no decision: the queue MUST NOT show more than the mail does until
    this entry is answered. What needs one is whether it may show more. **A queue showing reported
    message text would be a THIRD recorded exception under Principle VIII** — and 3.3.0 established
    that an exception must be *recorded* rather than derived, on an entailment argument that was
    available and deliberately not taken. The available argument here is that a moderator cannot
    judge conduct they cannot see, and it must not be taken silently either.

    Interacts with entry 21 (who the operator is) and entry 19 (an avatar is content a moderator must
    see to act on, which is the same question in a different medium).

25. ~~**What happens when a promoted conference organizer deletes their own account.**~~ **RESOLVED
    2026-08-11 in 4.1.0 by A9** — assignments are revoked in the same transaction, deletion is never
    made conditional, and the conference enters an explicit `unassigned` state that platform
    operators can see. **The same rule applies to withdrawal**, which answers the adjacent question
    this entry carried. Now binding text under "Administration, and the second actor". Retained in
    place so the numbering stays stable. *Original entry:*

    *Added
    2026-08-11 in 4.0.0. Blocks feature 013.* Two commitments collide, and neither yields cleanly.
    D6 and Principle VIII make deletion **self-serve, hard, and cascading, with no tombstone** — an
    attendee MUST be able to delete their own account without an intermediary. A conference organizer
    is an attendee. So the sole organizer of a conference can orphan it by exercising a right this
    document guarantees, and the sessions they authored are **conference content**, not attendee
    data, so they survive with nobody assigned to them.

    The obvious repairs each break something recorded. Refusing the deletion breaks D6. Requiring a
    second organizer first breaks it more subtly, by making the right conditional on somebody else's
    action. Cascading the conference away destroys content belonging to every attendee registered for
    it — the shape 3.3.0 rejected for Q&A votes and then accepted anyway for a different reason,
    which is precisely why it must be argued rather than copied. **Do not resolve this by analogy to
    008's or 009's deletion answers**: both concerned data the departing person authored about
    themselves, and a conference is not that.

    The adjacent question travels with it: whether withdrawing from a conference revokes an organizer
    assignment for it. 008 established that withdrawal cancels live meetings in the same transaction;
    whether the same reasoning reaches an assignment is undecided.

26. ~~**The administrative site's origin and session topology.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A7** — a subdomain of the same registrable domain, `/api/*` reverse-proxied under it, and a
    host-only session cookie giving two independent sessions. Now binding text under "Deployment
    environments". Retained in place so the numbering stays stable. **What closed it was a
    distinction, not a preference**: `SameSite` is evaluated against the registrable domain rather
    than the origin, so a subdomain is same-site *and* different-origin — the only shape that keeps
    D11's CSRF defence while giving the administrative app its own service-worker scope, storage and
    CSP. *Original entry:*

    *Added 2026-08-11 in 4.0.0, created by
    A3. Blocks feature 013.* D11 binds client and API to **one origin**, and the block above states
    why in terms that forbid casual reinterpretation: it "is what keeps the session cookie's
    `SameSite` attribute a genuine CSRF defence rather than a nominal one, and it is why no
    synchroniser-token scheme is required. A topology that splits them MUST NOT ship without one."

    A second website is a second origin unless deliberately arranged otherwise, and **the
    administrative product MUST NOT inherit D11's reasoning unexamined**. This is the exact failure
    3.0.0 was written to escape: `fly.dev` and `pages.dev` are separate registrable domains on the
    Public Suffix List, the `SameSite=Lax` cookie was therefore never sent, and **the configuration
    could not sign anyone in** — a defect that survived because the topology was assumed rather than
    decided.

    Open in three parts: whether administration is a subdomain, a path, or a separate registrable
    domain; whether an administrative session is a distinct session from the attendee one held by the
    same person; and, if the origins differ, what replaces `SameSite=Lax`. Two long-parked idea-inbox
    entries meet this directly — `session-topology-and-csrf` and `security-response-headers`, both
    filed on 2026-08-05 as cheapest to settle before the first environment is opened, and both still
    unsettled.

