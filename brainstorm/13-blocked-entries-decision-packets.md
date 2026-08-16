# 13 — Three blocked register entries, prepared for decision

> ## The session happened. All three were decided on 2026-08-15.
>
> **This document was written as preparation and is preserved as written.** It is the research the
> decisions were taken on; the decisions themselves are binding text in **constitution v5.4.0**
> (R1, R2, R3 — standing decisions 54–56). Where this document poses a question, the constitution
> answers it, and **the constitution wins**. Nothing below was edited after the fact to agree with
> what was chosen, which is the point: two of the three decisions went against the leaning recorded
> here, and a packet rewritten to match its outcome would have hidden that.
>
> | Entry | Blocked | Decided |
> |---|---|---|
> | **27** — Q&A attribution | 017 | **"Ana R."** — first name plus surname initial. Option **E**, which was *not in the register's option list*. Taken on the client's behalf; **she must be told.** |
> | **22** — cached conference outliving a registration | 012 | **Accepted, not fixed.** 24-hour window ratified, the register's false justification struck, two mechanisms licensed, the lifetime figure deferred. |
> | **4** — desktop and tablet layouts | 012 | **Closed by owner ratification, without a client acceptance act.** One item carved out as a defect rather than ratified. |
>
> **All three blocked features are unblocked.** Before this session only 015 was startable; 012, 015
> and 017 now all are.
>
> Two things in this document were *not* decided and remain open: whether 24 hours is the right
> span, deferred until a real conference can price it, and everything under *"What this document
> does not cover"* at the end.

**This file recorded no decision when it was written.** Every other file in `brainstorm/` records
what was decided in a session; this one was preparation for a session that had not happened. It
exists so that entries 27, 22 and 4 could be answered in one sitting rather than rediscovered a
fourth time — which is what then happened.

**Date**: 2026-08-15. **Constitution in force at drafting**: v5.3.0, ratified 2026-08-14. **Superseded
the same day by v5.4.0**, which these packets produced.

Three entries are covered, in the order of what they block: **27** blocked feature 017; **22** and
**4** both blocked feature 012. They were the only open entries blocking anything.

---

## Entry 27 — Q&A attribution

### The question

When a moderated audience question is published — on a phone, and on the projected screen at the
front of the hall — what name appears against it: the author's full display name (ratified in
v3.3.0, shipped in 009), their first name alone (asked for by the client in REQ-062/REQ-063), a name
the attendee chooses, or something the register does not currently list?

### Who decides

**The client decides the values question. The owner decides everything around it, and the owner has
already decided one of those things once.**

Entry 27 sits in the list headed **`Open — require a client decision`**
(`.specify/memory/constitution.md:3372`, entry at `:3292`), and Principle VIII requires a privacy
exception to rest on a recorded client decision (`:1751`). What the name on a question exposes a
person to is hers.

Three adjacent acts are the owner's, and they must not be blurred into hers: **widening the option
list** (the register's three options are not exhaustive — see below), **drafting the amendment**, and
**choosing its version rating**. So is a fourth: **routing the question to her at all**. The register
carries a live precedent for the owner closing a client-decision entry himself — *"The project owner
confirmed he speaks for the client, so 5 and 6 are closed as client decisions"* (`:3028`) — and entry
2 closed when the owner supplied the brand board, *"and the supply is the client decision this entry
was waiting for"* (`:3380`). Routing 27 to her rather than speaking for her was itself an owner
decision, taken on 2026-08-12, and it is re-openable.

### Why it is still open

Two governing texts disagree, and **the owner declined to resolve the disagreement by taking the more
recent one**, which he could have done in the same session in which he took every other Q&A axis from
her.

v3.3.0's Q1 bound the full real name with no opt-out and argued it at length. Forty-eight hours later
the client asked for the first name alone. v5.0.0's C2 then reversed the entire Q&A model in her
favour — moderation, resolved/pending, grouping, projection — and stopped:
**`ATTRIBUTION IS NOT RATIFIED HERE.`** (`.specify/memory/constitution.md:361`). The stated reason is
that **her own extraction records the thread as unresolved** (OPEN-002, `assets/feedback-1.md:712`),
so adopting her stated preference would have closed by inference a thread she herself recorded as
open. Principle VIII carries the marker in place: *"The attribution clause is UNDER REVIEW against
register entry 27 and MUST NOT be resolved by inference"* (`:1767`), and *"Until entry 27 closes, the
shipped full-name behaviour stands"* (`:1769`).

`brainstorm/11-client-feedback-programme.md:57-59` is where the owner declined: *"Not resolved, and
it must not be resolved silently… 017's spec must confirm rather than pick."*

**Anonymity is not under review, twice over.** *"That a question is attributed at all is not under
review — anonymity was considered in 3.2.0 and not chosen"* (`:1769-1770`, restated `:2364`). An
answer that permits a blank name reopens register entry 9.

**The register's option list is incomplete, and this is the most consequential finding in this
section.** Entry 27 offers *"full name, first name alone, or attendee-chosen"* (`:3292`). OPEN-002
asks her to confirm one of *"1. siempre se muestra el primer nombre; o 2. privacidad de tarjeta
permite anonimato adicional"* (`assets/feedback-1.md:713-716`). **Neither of her two options is "full
name", and her second is anonymity** — foreclosed twice. Worse, REQ-064 conditions the whole thread
on whether card privacy and question identity *"quedan desacopladas"* (`:381-386`), and that lever no
longer exists as she described it: C1 made card exchange mutual and one-sided, delivered by 016. So
asking her entry 27's three options will not close OPEN-002, and answering OPEN-002 as she wrote it
cannot be done without a further reversal. **Whoever convenes this must reconcile the two framings in
one conversation, or entry 27 will close and immediately reopen.**

**A source neither the constitution nor the client has ever cited already answers the question.** The
approved prototype renders Q&A authors as `"Jamie L."`, `"Priya S."`, `"Tom R."`, `"Alex M."`,
`"Sara K."`, `"Wei C."` — six of six abbreviated to first name plus surname initial
(`GroundZero/prototype/src/app/App.tsx:96-98, 101, 103-104`, rendered at `:653`) — while rendering
**full** names on Discover cards in the same file (`:109-113`). The distinction between the directory
and the room predates the entire dispute. CLAUDE.md names the prototype as the authority for
interaction flows, screen composition and copy; it carries no authority over architecture, so this is
evidence rather than governance. It is evidence both v3.3.0's argument and v5.0.0's opening were made
without.

### The deciding case

Two women at the conference are both called Ana. During the keynote both ask a question through the
app, the moderator approves both, and both go up on the screen at the front of the hall with their
vote counts beside them.

- If the screen says **"Ana"** twice, the speaker cannot call on the right one, and the person
  sitting beside the wrong Ana believes she asked it.
- If it says **"Ana Molina"** and **"Ana Ramírez"**, everyone in the hall reads both surnames —
  including people who are not attending, and any camera in the room.
- If it says **"Ana M."** and **"Ana R."**, the room can tell them apart and neither surname is on
  the wall.

The projected screen is ratified, not hypothetical: *"A screen in a hall showing approved questions
in live vote order has a fourth audience — a room, possibly with no signed-in reader at all"*
(`.specify/memory/constitution.md:2440-2447`), delivering REQ-075–077
(`assets/feedback-1.md:447-459`). **The client asked for that screen herself**, which makes it the
right frame to put the question in.

**A second case belongs to the owner, not the client, because it turns on mechanics.** A reader who
sees only "Ana" and wants to report one of the two has nothing on screen to tell them apart: the name
is plain text and not a link (`apps/web/src/app/agenda/PanelQuestions.tsx:391-396`), the row carries
no photograph, company or role, and the list is vote-ordered so the two are not adjacent. Reporting
is throttled (`apps/api/src/routes/reports.ts:51, 146`, FR-746) — but `POST /blocks` is **not**
(`apps/api/src/routes/blocks.ts:117-120`, no throttle imported in the file), and `GET /blocks`
returns the target's live display name **and card-rendition avatar bytes** (`:37-113`). So under any
abbreviated form, blocking becomes a one-request, unrate-limited way to convert "Ana" into a full
name with a photograph. `blocks.ts:44` asserts the caller *"already knows exactly who these people
are, having blocked them by hand"* — a claim any abbreviated option falsifies in a file it does not
touch. **That claim is already partly false today**: 009's own review records the avatar chain, and a
photograph is not a name (`specs/009-session-qa/review-findings.md:169-180`).

### The options

| | What it means in the room | Argument for | Cost, in named files | Contradicts | Reversible? |
|---|---|---|---|---|---|
| **A. Full display name** (status quo) | Your name as you typed it at sign-up, under your question, on the phone and on the hall wall. No opt-out, no recall. | The only option with a written, stress-tested argument behind it (v3.3.0 Q1, `:863-895`), and the only one under which two Anas are distinguishable with no further action. | No schema, no payload, no client, no test churn. **Not zero, though**: an amendment is still needed to strike `UNDER REVIEW` from `:1767`, and 017's two new surfaces — the moderation queue and the projection — inherit nothing, so A must still say what they show. | Nothing ratified; this *is* the ratified position. It contradicts REQ-062/063 (`assets/feedback-1.md:371-380`), which stand unanswered. | Cheapest. One SQL projection to move later. |
| **B. First name alone** | The screen shows "Ana". Two Anas are indistinguishable to every reader, including the moderator's room. | What the client asked for, twice, in her words. Reduces what a casual reader absorbs about somebody who spoke once. | `apps/api/src/db/queries/questions.ts:147, 218`; the response schema at `apps/api/src/routes/events/questions.ts:160-198`; `contracts/openapi.json`; `packages/data/src/generated/api.ts`; FR-739 warning copy and the report label at `PanelQuestions.tsx:209-210, 435`. **"First name" is a derivation from unstructured free text** — `attendees.display_name` is one 1–120-character field typed once (`apps/api/src/db/schema/attendees.ts:20`), so a whitespace split gets "Ana" right, "María José" wrong, and a mononym nothing. **It relocates disclosure rather than reducing it** — see the block chain above. | Retracts shipped FR-702 (`specs/009-session-qa/spec.md:348`), narrows FR-734 and SC-707. Falsifies `blocks.ts:44`. | Same as A mechanically. Hard to reverse socially. |
| **C. First name from a structured name field** | Sign-up asks for a first name and a surname separately. | The only option under which "first name" means what it says for everyone. | Everything B costs, plus a migration (next free number is `0013`, claimed at generation per decision 53), plus a backfill produced by exactly the whitespace split B is criticised for. Fails `apps/api/tests/unit/deletion-coverage.test.ts` and `export-coverage.test.ts` **by existing**, so both need amending with written justification. **It lands in 015's surface, not 017's** — 015 owns sign-up and per-person invitation codes (`brainstorm/11-client-feedback-programme.md:60-73`) and is the only startable feature; deciding C after 015 ships buys a second migration on the same column. | FR-738 as written for 009 (`specs/009-session-qa/spec.md:440`). | Least reversible. A schema split is a migration in and a migration out. |
| **D. Attendee-chosen** | Three different questions wearing one name. D1: chosen per question. D2: a Q&A-specific name set once in the profile. D3: make the existing display name editable. | The only family that lets the person bearing the consequence make the trade-off; closest to OPEN-002's second branch. | **D3 is not free and is not available**: `display_name` is write-once — the only two `.update(attendees)` sites in the API are `setDiscoverable` and `setAvatarObjectKey`, and the profile PUT body is `additionalProperties: false` without it (`apps/api/src/routes/profile.ts:129-155`). Making it editable is a product-wide identity change touching Discover search, cards, threads, blocks and the shell. **D2 gives one field its own audience**, which decision 16 as sharpened in v3.4.0 forbids. **D1 with a blank is anonymity.** | FR-734's unconditional attribution directly; D1-with-blank reopens entry 9; D2 contradicts decision 16. | Worst. Revoking a choice retroactively republishes people under names they declined. |
| **E. First name plus surname initial** — "Ana R." | The room can tell two Anas apart; no surname is on the wall. | Answers the deciding case exactly where it arises, and removes the *motive* for the block chain rather than the chain. The only option with evidence from the approved reference behind it. The product already ships this exact string operation for another purpose — `initialsOf` splits on whitespace with `Intl.Segmenter` rather than `slice` (`apps/web/src/app/profile/AvatarFallback.tsx:28-40`). | Identical to B mechanically. Inherits B's derivation fragility for the surname half only. Does not close the block-chain disclosure, which is independent either way. | Retracts the same shipped text as B. **Is not in the register's option list** (`:3292`), so choosing it means the framing was incomplete. **It is in tension with REQ-062's own words** — *"únicamente el primer nombre, sin apellidos"* — because an initial is a fragment of an apellido. | Same as B. Easiest to move in either direction. |
| **F. Collision-aware** | "Ana" when the first name is unique among that conference's published authors; "Ana R." only where it collides. | Satisfies REQ-062 literally in the common case and answers the deciding case exactly where it arises. Buildable with no schema: `questionSelect` is already **one query per session** (`apps/api/src/db/queries/questions.ts:141-160`), so a window function over the joined authors adds no round trip. | Same file set as B and E. **The rendered name becomes a function of the population rather than of the person**, so the same attendee reads differently in two sessions, and on the projection the name can change as questions are approved. | Same as B and E. Also not in the register's list. | Same as B. |

**Neither the register's three options nor this table should be presented as closed.** Two of the six
were absent from the entry as written.

### What it forces

- **An amendment, under every option**, including A — which must strike `UNDER REVIEW` from
  `.specify/memory/constitution.md:1767` and close the entry.
- **Predicted rating: MINOR, under all six.** The on-point precedent is v5.3.0, which ruled MINOR
  while narrowing a requirement 014 had already shipped and guarded, on the test *"FR-1042 is
  **narrowed, not withdrawn**… 3.0.0's FR-066 ceased to exist; nothing here ceases to exist"*
  (`:43-51`). Attribution survives every option (`:2364`), so FR-702's name-*form* is narrowed. The
  MAJOR trigger has already been spent on this surface: v5.0.0 C2 *"reverses Q1 (3.3.0) and retracts
  shipped 009 requirements"* (`:353-356`). The amendment must still make the judgement explicitly
  rather than inherit this paragraph.
- **The projected view needs its own audience ruling in the same amendment, under every option.**
  Principle VIII's second exception bounds disclosure to *"every attendee registered for the event it
  was asked at"* (`:1757-1762`); a hall screen exceeds that population however the name is spelled.
  Under A this is a full legal name in front of an audience the ratified clause does not describe.
- **Retracted requirements** under B, C, D and E: FR-702 (`specs/009-session-qa/spec.md:348`), and
  narrowings of FR-734, FR-737 and SC-707.
- **Five assertion sites, amended deliberately and never relaxed**:
  `apps/api/tests/integration/questions-ask.test.ts:139` and `:170-171` (the two halves of SC-707),
  `apps/api/tests/integration/questions-blocks.test.ts:224`, `e2e/session-qa.spec.ts:101`,
  `apps/web/tests/component/panel-questions-vote.test.tsx:97-105` (which must keep asserting FR-736's
  not-a-link property whatever string it renders).
- **A fixture that does not exist.** The seed is Ada Lovelace, Grace Hopper, Alan Turing
  (`apps/api/src/db/seed/attendees.ts:57-60`) — no two share a first name, so the deciding case is
  unwalkable and untestable today. Under B, E or F the disambiguation property *is* the requirement
  and would ship asserted by nothing, which is 010's *"a check that did not execute has not passed"*
  exactly.
- **A moderator-disclosure question under B, C, E and F, and it is priced.** The published form would
  be "Ana" while the moderator reads "Ana Molina" — content that was never submitted for publication,
  which is the ground the constitution's *"a moderator reading an unpublished question is not a
  fourth exception"* argument rests on (`:2408-2412`). The novel actor is a **conference organizer**
  — a promoted attendee at the same conference — not the platform tier the third exception covers.
  Shipped precedent exists: the enrolment roster projects full display names to an assigned organizer
  under the fourth exception (`apps/api/src/db/queries/admin-enrolments.ts:31, 70-80`), granted MINOR
  by v5.3.0. Principle VIII already predicts the shape: *"Four exceptions are recorded; a fifth needs
  a fifth amendment"* (`:1848`).
- **Decision 42's administrative-counterpart row, under every option.** 017's Feature Declarations
  must state what the moderation queue and the projection display and whether an organizer's view of
  an unpublished question differs from the room's.
- **A correction to a claim this document must not repeat.** An administrative surface **already**
  names a question's author in full: `listReports` and `readReport` both select the reported
  attendee's `displayName` and return it as `reportedName`, declared required on both routes, with
  `kind` including `'questions'` (`apps/api/src/db/queries/admin-reports.ts:103, 193-194`;
  `apps/api/src/routes/admin/reports.ts:59, 103`). REQ-061's *"organización"* half is therefore
  partly satisfied today, at the platform tier, under the third exception.
- **What A does not force, and what nobody may claim it does**: a question is **not** short-lived.
  *"Pending questions MUST survive the end of the event they were asked at"* (`:2385-2390`), so under
  017 every option's residual disclosure is durable and cross-event.

### Recommendation

**On the values question there is no recommendation to give, and saying so is the honest position.**
Whether a person's surname belongs on a hall wall in a Costa Rican professional-networking room is
the client's judgement, and Principle VIII requires it to be hers on the record. What follows is
about the *framing*, which is the owner's.

1. **Do not put the register's three options to her as exhaustive.** E and F both exist, both cost
   what B costs, and both dissolve the deciding case. Presenting three options when six are available
   makes her answer look like a choice she did not have.
2. **Reconcile entry 27 with OPEN-002 in the same conversation.** They are not the same question, and
   OPEN-002's second branch is premised on a card model 016 replaced. Restate it in terms of the
   mutual exchange or drop it and say why.
3. **Frame it on the projection, because she asked for the projection.** REQ-075/076 are hers, the
   screen is ratified, and the two-Anas case on a hall wall needs no product knowledge to picture.
4. **Ask the one question that separates the two readings of REQ-063.** If her concern is that a
   surname makes somebody *findable* outside the event, then "Ana R." still hands over an identifying
   token and B plus a narrowed `listBlocks` is the honest answer. If her concern is register and tone
   — that a full legal name makes a casual question feel like a filing — then E or F is strictly
   better and there is nothing to trade. **The extraction cannot distinguish them**, and both
   REQ-062 and REQ-063 are hedged in the original Spanish (*pueden mostrar*, *no debería
   mostrarse*, lowercase in the source at `assets/feedback-1.md:372, 378`), which is consistent with
   a conversation that genuinely did not conclude. The question: *"If we showed 'Ana R.' instead of
   'Ana Molina', would that solve it, or is any part of the surname the problem?"*
5. **Put REQ-065 on the same agenda.** Whether one conference may carry several organizer assignments
   is handed to 017 rather than licensed (`:2434-2438`; `assets/feedback-1.md:391-394`). It is not a
   register entry and blocks nothing, but she is the only source and she is being convened once.

**What would change the framing above**: if the owner intends to exercise the authority he has
already used five times and speak for the client here, then steps 1–4 are his to answer directly and
the conversation is unnecessary. That is a decision, not a shortcut — but it has precedent, and the
packet should not pretend otherwise.

**Timing, stated plainly**: nothing orders 017 before production. Entry 27 blocks 017 and 017 alone;
012 is blocked on 22 and 4. So the product can reach real attendees carrying today's Q&A —
instantly published, unmoderated, full real name — which is the surface brainstorm #11 called *"an
unscreened many-to-many surface at a live event with a projector pointed at it"* (`:46-48`). Whether
that is acceptable is a sequencing decision this document does not take.

---

## Entry 22 — a cached conference outliving a registration

### The question

Two questions have been filed under one number, and separating them is most of the answer.

1. **What may a device keep SHOWING** a person from a conference they are no longer registered for,
   and for how long? Today: everything it had already downloaded, for 24 hours from the moment of
   download.
2. **What may a device keep HOLDING?** Today: everything, indefinitely. **The 24-hour figure bounds
   serving, not retention.**

The second half has never been asked. It is not new analysis — the codebase states it against itself:
*"`WebLocalCache` has no eviction: `write` puts an entry and only `purge` ever removes one. The
24-hour lifetime stops a stale entry being **served**; it does not delete the bytes"*
(`apps/web/src/app/services.ts:492-495`), and 004's deep review ranked it FINDING-1 and fixed it only
for the device the deletion was performed on
(`specs/004-attendee-identity-and-profile/review-findings.md:52-56`).

### Who decides

**The owner, on the constitution's own filing — and CLAUDE.md disagrees with the constitution about
that.** Entry 22 sits after `:3432`, inside `Open — require an owner or planning decision`;
CLAUDE.md:1779 files it under `### Require a client decision`. That drift is a hygiene item, not a
substantive dispute, and it is item 8 below.

Three parts, three owners: **is the residual acceptable** and **what is the lifetime figure** are
register-class decisions, ratified as every closure has been; **Home's missing retrieval notice** is
neither — it is a shipped requirement not being met, and it should be fixed under any option without
being put to anybody as a choice.

### Why it is still open

**It was declined, not overlooked.** 009 carried FR-756a — *"a Q&A action refused by the server MUST
still invalidate that conference"* — and the owner withdrew it on 2026-08-10; it is struck through in
place at `specs/009-session-qa/spec.md:546`. The reasoning is recorded verbatim: meeting it *"would
give one feature a cross-feature responsibility no other undecorated repository has… The gap it named
is real, product-wide, and older than 009, so it becomes register entry 22 rather than 009's to fix
alone"* (`.specify/memory/constitution.md:875-878`).

011 declined it explicitly (`specs/011-uat-deployment-and-hardening/spec.md:89`). 013 caches nothing,
so it neither worsened nor answered it. 014 added a second cause and declined it again
(`specs/014-conference-content-authoring/REVIEWERS.md:183-185`). Separately, 005 recorded when it set
the 24-hour value that whether that is the right span *"is a product judgement worth revisiting once
the feature is in use"* (`specs/005-agenda-and-saved-sessions/spec.md:707`). That judgement has never
been made.

**The entry's stated ground for tolerating this does not describe the code, and five features have
carried it as low-severity on the strength of that sentence.** Entry 22 says: *"What it is **not** is
a data-retention breach: the data is the conference programme, not another attendee's personal
data"* (`:3686-3689`). The cached `appointments` payload carries the other party's display name and
the agreed meeting topic (`packages/data/src/interfaces/appointments.ts`), wired in at
`apps/web/src/app/services.ts:204-225`; the cached `programme` embeds every speaker's name, title and
company (`packages/data/src/interfaces/catalog.ts`), which register entry 30 classifies as personal
data about people who are not attendees. The appointments caching landed in PR #15 (`8ae2f27`), which
`git merge-base --is-ancestor` confirms precedes PR #17 (`6b30bb4`) where the entry text was written.
**The sentence was inaccurate when it was written.** Whatever is decided, it must not survive the
decision.

**The entry also already contemplates third-party removal**, which is worth quoting because it
changes the sequencing advice: *"when the server begins refusing an attendee who has withdrawn from a
conference, **or been removed from it**"* (`:3658-3661`). This is not a future contingency 015 might
introduce; the ratified text assumes it.

### The deciding case

Ana deletes her MyNet account from her phone. The screen tells her, in bold, that no copy is kept —
there is no grace period and nothing to restore, not by her and not by anyone else
(`apps/web/src/app/profile/Account.tsx`, FR-367).

Her old tablet is in a drawer. It still holds her private session notes, her meeting with Luis and
the subject the two of them agreed, and her own name and email address. After a day the tablet stops
showing them. **It never deletes them.** Next year they are still there.

A second case, for the withdrawal half: Ana leaves a conference on her phone, and the tablet is in
flight mode. On Wednesday it shows the programme, her notes, her saved sessions and her meeting with
Luis, under a notice reading *"Showing what was saved on this device. Last updated Tue 09:14."*

**The obvious next sentence — "and the moment the tablet reconnects, all of it vanishes" — is
false, and correcting it is the most consequential finding in this section.** The purge fires only
inside a *refused read for that specific conference*
(`packages/data/src/http/cached.ts:284, 306-313`). **Whether such a read is ever issued depends on
whether the tab was already open**, and the two branches were traced separately:

- **Cold start, or any full reload, while online — the purge never fires.** `GET
  /workspace/active-event` answers an attendee registered for nothing with **204 and no body** —
  *"204 says exactly what is true"* (`apps/api/src/routes/workspace/active-event.ts:56-60, 74-77`)
  — and `HttpActiveEventRepository.getActive` maps that to `null` as a **success**, not a refusal
  (`packages/data/src/http/active-event-repository.ts:18-28`). Every conference-scoped read in the
  client is gated behind that one resolving to `ready` — Home (`home/HomeShell.tsx:171-187`), Agenda
  (`destinations/Agenda.tsx:64-69`), Discover (`discover/useDirectory.ts:57, 132-141`), meetings
  (`network/Appointments.tsx:67`) — and no route carries an `:eventId` param, so **no destination
  holds a remembered event id it could fire with.** `isRefusal` never fires and `purgeConference`
  never runs.
- **A tab already open at `status: 'ready'` — the purge does fire, eventually.** The next gated
  surface to mount, re-mount on navigation, or run its `retry` (`AsyncState.tsx:68-96`) issues a
  read that is refused, and that refusal purges. But **nothing forces it**: the provider does not
  poll, and there is no focus, `visibilitychange` or reconnect refetch of the active event anywhere
  in `apps/web` — the only reconnect handler re-runs `getCurrent` and only when `status ===
  'offline'` (`auth/useAuth.tsx:117-123`). So the tablet coming out of flight mode does not purge on
  reconnection; it purges when somebody navigates.

`cached.ts:47-51` asserts neither branch — *"Online, an authorization refusal purges the
conference's entries immediately"* — which is true of the mechanism and silent on whether the
refusal arrives. That is this project's documented false-header class, in the file the entry is
about.

**Two refusals that arrive and still purge nothing**, both traced: `commitments.places` and
`appointments.slots` are `passThrough`, and the passthrough branch purges on nothing
(`services.ts:180, 223`; `cached.ts:251-253`); and the undecorated repositories — `directory` and
`questions` among them, both `/events/{id}/…` reads that *will* be refused — have no purge to fire
(`services.ts:236, 266, 288-292`).

**Account deletion has the same defect on a second device.** The refusals that arrive there are 401s
on `attendee.getCurrent()` and `activeEvent.getActive()`, both no-argument calls, so
`const eventId = typeof args[0] === 'string' ? args[0] : ''` yields `''` and the purge runs against
prefix `attendee:<id>|event:|`. Under `prefixBounds` that range cannot match
`attendee:<id>|event:<uuid>|programme` — every uuid first character sorts below `|` (0x7C)
(`cached.ts:100-102, 284`; `packages/platform/src/web/local-cache.ts:120-123`). Only `self` and
`active-event` are dropped. **The bold promise on the deletion screen is not kept on a second
device**, and that is a shipped-requirement defect independent of which option is chosen.

### The options

| | What it means | Argument for | Cost, in named files | Contradicts | Reversible? |
|---|---|---|---|---|---|
| **A. Accept, correct the record, disclose everywhere** | Behaviour unchanged. The entry's justification is corrected, an accurate inventory of what a device holds is written down once, and the "saved on this device" notice appears on every surface that shows stored content. | Every way a registration ends today is an act the person performs on their own device, and that device purges in the same action (`services.ts:466-485, 535-538, 545-556`). Nobody else can end a registration: `apps/api/src/routes/admin/conferences.ts` has three routes and its only DELETE ends an **organizer assignment** (`:173`); `admin/enrolments.ts:33` is a GET. | Documentation, plus the Home notice on five registered cards — `UpNext.tsx`, `RestOfDay.tsx`, `NextSavedSession.tsx`, `home/cards/Appointments.tsx` — none of which imports `StalenessStamp`, whose only two importers are `destinations/Agenda.tsx:228` and `network/Appointments.tsx:197`. | Nothing ratified. Retires the sentence the project has relied on since 2026-08-10. | Very cheap. Nothing structural is built. |
| **B. Shorten the lifetime** | 24 hours becomes 12 or 8. Past the limit the device refuses in the same words it uses for a conference it never downloaded. | The only lever that touches 014's cause: since an organizer can cancel a session, move a room or change a start time, a day-old cached programme can be **wrong**, not merely old — and can send somebody to a room that changed yesterday. 005 said the figure was to be revisited. | One constant, `cached.ts:60`, and its tests. Narrows delivered FR-221 (`specs/005-agenda-and-saved-sessions/spec.md:462`). **Buys zero on the retention axis** — nothing evicts, so it shortens the readable window and changes nothing about what the device holds. | Narrows FR-221 without withdrawing it — MINOR on v5.3.0's precedent. | Trivial. One number. |
| **C. Any refusal anywhere purges that conference** (the withdrawn FR-756a) | The twelve uncached repositories wipe the six cached ones' copy on refusal. | Tightest online answer, if the concern is a borrowed device. | The option the owner already rejected, in a file every feature shares (`cached.ts`), rewiring twelve written non-caching declarations in `services.ts:236-377` and re-arguing four absence guards (`messages-`, `network-`, `qa-absences.test.ts`, `marker-not-cached.test.ts`). **And it fires on a refusal that never arrives** — see the deciding case. | Reverses a recorded owner decision (v3.3.0 Q2). | Expensive both ways; every future feature inherits the classification obligation. |
| **D. Server tells the device to forget** | A push message instructs the device to erase. | The only option that could act on a closed app. | **Cannot be built as described.** Subscriptions are registered `userVisibleOnly: true` — *"a subscription that may be used for silent background work is refused outright"* (`packages/platform/src/web/notifications.ts:222-228`) — so no silent message exists. And a new dispatcher is a **third notification trigger**, pinned at two by `apps/api/tests/unit/notification-triggers.test.ts:77` plus two further guards. | Decision 45 (enumerated trigger set) and decision 21 (a declined permission is a complete product). | Recommend against building it. |
| **E. Key the copy to the registration id** | The stored copy is labelled with the registration it belongs to. | Sounds structural: no timer, no signal. | **Ineffective.** A disconnected device cannot learn the registration ended; it holds the old label and matches itself. Solves a different problem (leave-and-rejoin). Rewrites every stored key (`cached.ts:76-85`). | Nothing. It simply does not answer this question. | Moot. |
| **F. Evict on expiry** | Delete the entry at the moment it stops being readable, rather than leaving it. | **The only option that reduces what a disconnected device HOLDS.** Makes the phrase "24 hours" true for the first time. Strictly stronger than B on retention, orthogonal to it on readability. | A `purge` call in the existing stale branch (`cached.ts:314-330`, which today does `freshness?.record(key, null); throw error`) plus a test beside `packages/data/tests/cached-repository.test.ts:395-404`. No amendment, no contract change, no new shared mechanism, no absence guard re-argued. **Not option C**: it acts inside the decorator's own already-classified read path and gives no repository responsibility for another's cache. | Nothing. | Cheap. |
| **G. Purge conferences absent from a live `listRegistered()`** | On any successful online read of "the conferences I am registered for", erase the stored copy of any conference not in it. | **On the corrected facts, the only mechanism that erases a withdrawn conference from a second device at all.** `EventsRepository.listRegistered()` is live and deliberately uncached (`services.ts:236`) and runs on every online Home load via the registered `YourConferences` card. | Lives in the composition root, not in `cached.ts` — which sidesteps the exact objection that withdrew FR-756a. | Nothing. | Cheap; delete the hook. |
| **H. Per-resource lifetimes** | A short clock for `appointments`, `notes` and `self`; a long one for `programme`. | `CacheOptions` is already per-call-site — six distinct `cached()` calls in `services.ts` — so this costs roughly what B costs while avoiding B's whole stated harm, since `programme` is the resource carrying the least sensitive data and the most offline value. | Six call sites and their tests. | Narrows FR-221 as B does. | Cheap. |
| **I. Stop caching appointments** (reverse FR-647) | The meeting topic and the other party's name stop being stored on the device. | **Makes the register's sentence true rather than correcting it.** It also resolves a live inconsistency: 008 declared cards uncached because *"a cached contact is a second copy of somebody else's name, company, role and face ageing on this device"* (`services.ts:296-308`) and cached appointments carrying `counterpart.displayName` and `topic` in the same feature. One feature answered the same question two ways. | One `cached()` call removed; the appointments surface loses offline reads. | Retracts FR-647. | Moderate — restoring it is a decision about somebody else's data again. |

### What it forces

- **An amendment under every option that closes or narrows the entry.** Options A and F/G/H/I are
  MINOR: correcting the ground on which a residual was tolerated **changes meaning**, so it is not
  PATCH (`:2997`), and adding or narrowing on this axis was MINOR in v3.3.0 and v4.1.0. B is MINOR
  as a narrowing of a delivered requirement (v5.3.0's precedent, against v3.0.0's MAJOR for a
  retraction). C is an amendment reversing a recorded owner decision. D widens the trigger set.
- **A stated judgement, in the amendment, on whether this is a fifth Principle VIII exception.**
  Principle VIII closes *"Four exceptions are recorded; a fifth needs a fifth amendment"* (`:1848`)
  and has twice refused to grant one by entailment. The reading here is that it is **not** one — no
  new audience is disclosed to, the reader was already lawfully shown every field, and this is a
  staleness window. **That sentence must be in the amendment, not inferred from this document.**
- **The corrected inventory of what a device holds**, which is the deliverable option A promises:
  seven resource keys across six repositories — `self` (id, email, display name), `active-event`,
  `programme` (including `cancelled`, `room`, session kind, `accessLink`, and every speaker's name,
  title and company), `tracks`, `saved` (saved sessions **and held places**), `notes`
  (attendee-authored free text), `appointments` (counterpart display name and topic).
- **`accessLink` is not stale content.** `Session.accessLink` is a validated `https:`-only joining
  URL added by 014 tranche 2 (FR-1052), and it is on the cached `programme`. A URL is transcribable
  and usable later from any device, and the access control behind it belongs to a third-party
  platform. The residual includes a **live route into a conference the person has left** — the
  single strongest concrete argument for F or B.
- **Two shipped-requirement defects that are not choices.** FR-216 — *"Any surface served from cache
  MUST state when the content was last retrieved"* (`specs/005-agenda-and-saved-sessions/spec.md:453`)
  — is unmet on five Home cards, and T066 is marked `[X]` claiming *"Render the staleness stamp on
  **every cached surface**"* (`specs/005-agenda-and-saved-sessions/tasks.md:204`), with FR-216 mapped
  to that task alone (`:313`). `specs/014-conference-content-authoring/spec.md:219-221` then asserts
  the compliant behaviour as fact. Separately, the deletion promise is unkept on a second device.
  Both should be fixed under any option.
- **An intersection with register entry 31 that neither entry mentions.** The cached commitment set
  carries held places (`services.ts:170-182`), and decision 51 permits deleting a session with places
  held, silently. Offline, the cached copy is then the only thing telling that attendee about the
  session — **and it tells them they hold a place in something that no longer exists.**
- **A delivery vehicle, which does not currently exist.** The roadmap files entry 22 against 012
  (`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md:493-495`), 012 has no spec
  directory, and no feature in flight owns MyNet client code — 015 is administrative and 017 is
  blocked. **Closing entry 22 removes scope from 012; it does not unblock it**, because entry 4
  remains.

### Recommendation

**A + F + G, with B or H as a separately-timed product judgement — and take it now, on today's
facts, writing into the answer that 015 must re-examine it.**

The reasoning, in order of weight.

**The privacy residual is genuinely small, and not for the reason the register gives.** No third
party can end a registration today. That is established by route inspection, not by
`apps/api/tests/unit/no-attendee-restriction.test.ts` — which is a regex over route URLs matching
`/suspend|ban\b|mute|restrict|disable|block|silence/i` and a permitted list filtered by
`/attendee|organizers?/i`, and which a 015 route named `DELETE /admin/conferences/:eventId/registrations/:id`
would pass green. If the answer rests on that premise, **the guard should be widened to the concept
before 015 is specified**, or the premise is protected by a naming convention.

**F and G are the two mechanisms that actually move.** F is the only one that reduces what a device
holds; G is the only one that erases a withdrawn conference from a second device that has been
reloaded or restarted — the case the reconnection purge is now known not to cover. (A second device
left *open* does purge, but only when somebody next navigates, and nothing prompts them to.) Both
are cheap, neither requires an amendment to build, and
neither touches the shared classification mechanism that killed FR-756a. **They were absent from the
option list this entry has been carried under for five features**, which is why the entry has looked
like a choice between doing nothing and re-opening a rejected requirement.

**Reject C, D and E on the evidence.** C fires on a refusal that never arrives. D cannot be built —
`userVisibleOnly` means no silent message exists, and a third trigger is another amendment. E is
ineffective offline, which is where the entire residual lives.

**B and H answer a different problem and should be decided as one.** Since 014 the cached programme
can be *wrong* rather than old, and for a session somebody has not saved there is no notification and
no marker. That argues for shortening on grounds of **usefulness**, not privacy, and the honest cost
is that offline usefulness shrinks by exactly the amount the window shrinks — an attendee at a venue
with poor signal who last connected the previous evening sees nothing rather than yesterday's
programme. H buys most of B's benefit without that cost, because the resource carrying the least
sensitive data is the one carrying the most offline value. **This half cannot be priced from the
repository**: it needs a real venue at a real conference, which is precisely the input 005 said was
required and which does not exist, because nothing has reached production.

**What would change this**: if 015 lets an organizer revoke somebody's access, a registration can end
by another person's act, on a device with no reason to check, belonging to somebody who has not been
told. That is a materially different question, and it would push toward F plus a substantially
shorter window and a reconsideration of C's online half. **015's ratified name is "registration and
attendee management"** (decision 36, `:570`; roadmap `:211`), and only
`brainstorm/11-client-feedback-programme.md:152` rescopes it to "Registration and invitations", so
the possibility is live rather than speculative.

---

## Entry 4 — desktop and tablet layouts, never validated

### The question

Two products, roughly 28 addresses and sixteen modal surfaces render at three width bands, and no
non-mobile rendering has ever been reviewed by anybody who will use it. **What act constitutes
validation, who performs it, and what must be true before 012 may be called complete?**

### Who decides

**The client, on the register's own filing — with the same live precedent for the owner speaking for
her.** Entry 4 is at `.specify/memory/constitution.md:3389`, inside the list headed `Open — require a
client decision` (`:3372`). CLAUDE.md agrees (`:1723`, `:1787`), which makes this the one entry of
the three whose classification is not in drift.

But the flat claim that *an owner walk cannot discharge it* is not established. The owner has closed
client-decision entries five times: entries 5, 6, 7 and 8 because *"the project owner confirmed he
speaks for the client"* (`:3028`), and entry 2 because he supplied the brand board and *"the supply
is the client decision this entry was waiting for"* (`:3380`). What an owner walk **cannot** produce
is the client's judgement about surfaces she will personally work at — and unlike entries 5–8, this
entry's substance is a preference rather than a model. That is the real argument, and it is a
different one.

### Why it is still open

**It was structurally unanswerable until eleven days ago, and it has been escalated three times by
amendments that each explicitly refused to close it.**

- v3.4.0 put a brand mark in the desktop rail and the tablet top bar, and wrote: **"This amendment
  does not close it, and feature 010 must not be read as having validated anything"** (`:3192-3197`).
- v4.0.0 escalated it *"by an entire second product"* — *"The administrative product is desk work, so
  it is predominantly the width band nobody has ever reviewed. **This amendment does not close it.**"*
  (`:3279-3283`).
- v5.0.0 escalated it *"by observation rather than argument"* and stated the reason no gate can
  answer it: *"this project's ten correctness gates verify that a control exists, is labelled, is
  focusable and works — and none of them looks at where it is… **no feature may be read as having
  validated a layout because its tests are green**"* (`:3324-3328`).

The reason it stayed open is stated in the entry itself: *"it has never been answerable, because
reviewing a layout requires a running product at a real screen width and there has never been one"*
(`:3395`). 011 changed that; the roadmap records it as going *"from unanswerable to merely
unanswered"* (`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md:531-532`). As of
2026-08-15 both hosts are live, including `admin.mynet-dev.programasemilla.com` — the first time
`apps/admin` has ever been served anywhere (`deploy/vm/OPERATIONS-LOG.md:379-455`).

**Two defects reached people after every gate passed**, and that is the evidence rather than the
argument. The scheduling dialog rendered in the top-left corner of the viewport, having passed 135
e2e tests, five review agents and CodeRabbit — *"T131, T133 and T135 all passed on it… nothing in the
source is wrong to read"* (`specs/008-network-and-appointments/review-findings.md:52-75`). Then a
message composer grew until its send control left the viewport, on the one band the prototype does
cover.

**What is NOT missing is a standard.** Principle IV states *"Three layouts MUST be delivered and
verified"* and prescribes each band's composition — desktop: persistent left rail, contextual top
bar, multi-column dashboard; tablet: reduced rail, two-column cards, stacked detail; mobile: compact
header, bottom navigation, single-column, touch-sized — plus the absolute *"No content and no primary
action may require horizontal scrolling at any supported width"* (`:1563-1571`). Principle IX makes
it a per-feature declaration and forbids deferral (`:1893`, `:1922`, `:1929-1931`). The act is
scripted too: `specs/013-administrative-foundation/quickstart.md:178-190` and
`specs/014-conference-content-authoring/quickstart.md:157-172`, the latter saying in its own text
*"This is the scenario register entry 4 is about, and 014 escalates that entry rather than closing
it."* **What has never existed is a client acceptance act and an artifact recording her verdict.**
The gap is narrower than "nobody knows what validated means", and stating it narrowly is what makes
the entry closeable.

### The deciding case

She opens MyNet on her laptop. The menu down the left shows the names of the five sections. She drags
the window to half the screen so she can keep her email beside it — and the menu turns into a narrow
strip of icons with no words. Then she opens the organizer site at that same half-screen size, and
its menu keeps its words.

**Same product, same window size, two different menus. Nobody has ever decided which is right, and no
test can tell us, because both of them work.**

Grounded: `apps/web/src/shell/DesktopRail.tsx:23` (15rem labelled rail, `desktop:` = 1280px) versus
`apps/web/src/shell/TabletRail.tsx:20` (4.5rem icon rail, 768–1279px) versus
`apps/admin/src/app/shell/AdminShell.tsx:112` (`md:w-56 lg:w-64` — a 224px labelled sidebar from
768px). **The divergence band is 768–1279, not 1366**: at 1366 both products show a labelled left
rail and agree.

The divergence is an **unrecorded choice, not a constraint**: `apps/admin/src/theme/index.css:27`
imports the web token file, so `tablet:` and `desktop:` are available in the administrative app — and
grep finds **zero** uses of either in `apps/admin/src`, which uses Tailwind's defaults throughout.

A second, purely judgemental case for the same sitting: on a tablet held upright, Home's seven cards
split into two columns. Nobody has ever approved that arrangement, and nothing is broken if it is
wrong.

**A candidate Principle IV non-compliance, checkable today with no client**: `AdminShell` has **two**
layouts where the principle requires three. Below 768px the administrative navigation is
`flex gap-1 overflow-x-auto` (`AdminShell.tsx:127`) — a horizontally scrolling strip of the site's
only navigation — and at 768–1023px the rail is `md:w-56` labelled, not reduced. `horizontalOverflow`
measures `documentElement.scrollWidth - clientWidth` (`e2e/responsive.spec.ts:23-42`), which an inner
`overflow-x-auto` container is designed to keep at zero, so the admin sweep at `:442` cannot see it by
construction.

### The options

| | What it means | Argument for | Cost | Contradicts | Reversible? |
|---|---|---|---|---|---|
| **A. The client walks UAT against a written script** | One walkthrough covering every screen at each width; she works through it on her own laptop and phone; her verdict is written down and becomes the reference. | The act the entry's wording asks for, and the only one producing a client verdict rather than an engineering opinion. Both hosts are live now. Catches what no test and no reference can: whether the product does what she expects at the width she works at. | A new `specs/012-*/quickstart.md`, an operations-log entry, an amendment recording her verdict. Roughly 84 page views plus sixteen dialogs at five widths. Plus the UAT prerequisites below. | Nothing ratified. Strains decision 30's "seeded data only", already recorded as *"drift rather than fact"* with four genuine accounts present (`deploy/vm/OPERATIONS-LOG.md:436-441`). | Cheap to redo. What is expensive is what her verdict may demand. |
| **B. The owner walks it first** | He walks every width and fixes or files what he finds; she is asked afterwards. | Cheapest thing that finds real defects, and both observed defects were found exactly this way. Spends no client attention on faults findable without her. | 2–3 hours plus fixes. Same UAT prerequisites. | The entry's filing — but the owner has discharged five client-decision entries. It may or may not discharge this one; entry 2's closure is the precedent that would decide it. | Fully. It is a pre-pass whose findings survive into whatever follows. |
| **C. Produce desktop and tablet design references first** | Somebody draws what the product should look like on a laptop and a tablet; she approves the drawings; the built product is then compared against them. | The only option addressing the stated risk. The roadmap names it: *"Every desktop layout built across 003–009 is unreviewed design, and discovering a mismatch here is the expensive outcome"* (roadmap `:526-528`). A walk asks "does this look wrong"; a reference asks "is this what it should be". | By far the most expensive: weeks of design work and client review before a line of 012 is written, with no owner today — this repository contains no designer and no design source beyond `GroundZero/prototype/`. Costs less than "28 addresses plus 16 dialogs" suggests, because references are drawn per component and per layout pattern: the sixteen modal surfaces come from **six** dialog components. | Nothing ratified. Implicitly reopens the standing of the prototype as the approved visual reference, by admitting it covers one third of the width range. | Least reversible. Approved references bind every subsequent feature. |
| **D. Automated visual regression** | The build photographs every screen at every width and fails when a picture changes. | Closes the mechanical gap: no such tooling exists — no `toHaveScreenshot` in `e2e/`, no percy/chromatic/backstop/storybook in any `package.json`. | 1–2 days plus permanent baseline maintenance; a twelfth CI job; image artifacts. **Baselines must be captured against seed data, never UAT** — the repository is public, and a UAT-captured baseline publishes four real people's names and avatars permanently into git history. | The entry's premise, if offered as an answer to it: **a baseline records what IS**, so it would have enshrined the top-left dialog on the day it was born and reported nothing. | Fully. Its value is conditional on some other option producing an answer worth protecting. |
| **E. Close by fiat: ratify the shipped layouts** | Declare that what is built is what was intended. | Zero calendar cost; unblocks 012 immediately. | None today; the cost lands on whoever meets the first defect in production. **And it may ratify a non-compliance**: `AdminShell.tsx:127`'s scrolling navigation strip is a candidate violation of the very principle doing the ratifying. | REQ-108 and REQ-110 (`assets/feedback-1.md:640-652`) — desktop use is the client's own stated requirement, alongside REQ-109's mobile, so there is no reading in which desktop is the weaker half. And v5.0.0's *"no feature may be read as having validated a layout because its tests are green"* would have to be **retracted**, not narrowed. | Nominally cheap; practically not. Closing removes the thing that keeps each new feature's unreviewed design visible, and the debt resumes compounding silently. |
| **F. Add WebKit and Firefox projects to Playwright** | The suite runs in more than one browser engine. | `playwright.config.ts:98-102` declares **one** `chromium` project, so **Safari layout is unverified at every width, not only desktop** — and the physical iPhone test 012 already carries is otherwise the only WebKit evidence this project will ever have. A few lines of config; no client, no UAT. | Config plus whatever it finds. | Nothing. | Fully. |
| **G. Split the entry** | An attendee half and an administrative half, or a compliance half (owner, existing scripts) and a judgement half (client). | They have different readiness — MyNet is walkable today, admin is not until an operator exists — different escalation histories, and different Principle IV exposure. Precedent exists for narrowing and for withdrawing half an entry (entry 20, `:3606`). | One amendment, no engineering. | Nothing. | Cheap. |
| **H. Send her current desktop screenshots** | Regenerate the manifest screenshots and show her 1280×800 renderings of Home, Agenda and Discover. | Needs no UAT, no credential and no script. The committed set (`apps/web/public/screenshots/`, six PNGs dated 2026-08-11) predates 013, 014 and 016, and the capture tool's own header calls the wide frame *"register entry 4 territory… the first time it is depicted anywhere the owner will see it"* (`e2e/support/capture-screenshots.ts:50-60`). | One command. | Nothing. | Fully. |
| **I. Ask her the framing question first** | Ten minutes: *"Do you want to look at it and tell us what is wrong, or do you want someone to draw what it should look like first?"* and *"Do you and your organizers actually work on a laptop, or is this a phone product with a desk exception?"* | The cheapest act available, and it re-prices every other option. | Ten minutes. | Nothing. | n/a. |

### What it forces

- **An amendment closing the entry, which must also define the act.** MINOR on entry 2's precedent
  — unless her verdict contradicts Principle IV's prescribed composition of any band, in which case
  it is **MAJOR under governance's first clause**: *"a principle is removed or redefined in a
  backward-incompatible way"* (`:2994-2995`). A verdict of the form *"I do not want an icon-only rail
  when the window is narrow"* redefines a principle whether or not any FR is retracted. **That is the
  plausible outcome, and it is a sharper trigger than the retraction test.**
- **An expiry and recurrence ruling.** Is the verdict one-time, covering what existed on the day, or
  standing — a new Principle IX row every later feature owes? Principle IX's *"MUST NOT be deferred
  to a consolidated later pass… legitimate only as verification of work already done"* (`:1929-1931`)
  is what makes a single 012 walk lawful, and also what caps what it can be claimed to discharge.
  **015 adds administrative addresses afterwards**, so a walk performed now covers seven admin
  addresses out of the release set.
- **A ruling on whether the band model stays at three.** 017's projected view
  (`assets/feedback-1.md:449-461`; `:2440-2447`) is a fourth surface — a projector or television —
  that no reference approved under C and no verdict given under A would speak to.
- **A UAT prerequisite, which is an engineering task rather than the owner decision the operations
  log describes.** `operators = 0`, so administrative sign-in is impossible and the half v4.0.0
  escalated this entry for cannot be looked at (`deploy/vm/OPERATIONS-LOG.md:444-455`). The log calls
  the only route `pnpm db:seed`, which is genuinely destructive — *"One `pnpm db:seed` against a
  deployed environment destroys **every account on it**"* (`apps/api/src/db/seed/index.ts:118-122`).
  **But the seed is modular and `operatorSeed` touches no attendee table**: its `clear` deletes only
  `admin_audit_entries`, `report_resolutions`, `organizer_assignments` and `operators`
  (`apps/api/src/db/seed/operators.ts:90-119`), and its `run` takes no `SeedContext` (`:131`). What
  is missing is a module argument on the runner (`index.ts:58-80`), or a direct insert of two
  operator rows followed by `pnpm admin:bootstrap`. So the real choices are: seed the operator module
  alone; or dump, seed and restore (a pre-migration dump exists, `OPERATIONS-LOG.md:441-443`); or
  accept the loss. **Only the third is destructive, and it touches decision 12** — four real people's
  records, destroyed administratively to enable a layout walk, which is an act this project has no
  rule for.
- **UAT seed currency.** Migrations `0009`/`0011`/`0012` were applied 2026-08-15 but the seed has not
  run since 011, so 014 tranche 2's optional sessions, enrolment, roster and vocabulary have schema
  and no content. Those surfaces would be walked empty.
- **Two files if the bands are unified**, not five: `apps/admin/src/app/shell/AdminShell.tsx` and
  `apps/admin/src/app/reports/ReportQueue.tsx` are the only files in `apps/admin/src` using `md:` or
  `lg:`. If the divergence is ratified instead, **it must be written down**, because nothing explains
  it today.
- **`apps/web/src/shell/TopBar.tsx:103-108`.** 010 measured the mobile product-name truncation and
  deferred all three candidate fixes here explicitly.
- **A false header inside the fix this entry's history is built on.**
  `apps/web/src/theme/tokens.css:350-351` claims `e2e/responsive.spec.ts` asserts an open dialog is
  centred *"at every width"*. Both centring tests run at 1440×900 and only 1440×900
  (`responsive.spec.ts:252, 288, 342, 445`). Either the comment or the test must change.
- **An issuing decision that half-answers open entry 21.** Whoever receives the operator credential to
  look at the administrative site becomes the first holder of platform authority on a deployed
  environment — the tier that reads the report queue (third exception) and, via 014, an assigned
  organizer's roster (fourth). No new exception is created, but a walk **exercises** two of them
  against an environment carrying four real accounts. The amendment should either name that operator
  deliberately or state that the credential is walk-scoped and revoked.
- **Closing entry 4 does not release the product.** Entry 22 remains against 012.

### Recommendation

**I first, then B, then A. Build F and H immediately because they are nearly free. Do not do C first.
G if the credential question proves slow.**

Three parts are usually conflated, and separating them is most of the answer. **Defects** — things
wrong by anybody's standard, like a dialog in the corner — are the owner's to find and fix, and both
historical instances were found in minutes by one person opening one screen; spending her attention
on them is waste. **Judgements** — is a 72px icon-only rail right at 900px, does a truncated "M…"
belong beside the mark — are hers, and only hers. **Definition** — what artifact records the verdict
— is missing, and writing the script is what makes the finite list exist.

**I costs ten minutes and re-prices everything else.** The recommendation to walk rather than draw
rests on a guess about whether her objections will be *"this is broken"* or *"this is not what I
pictured"*, and one question settles it. It belongs in the option list, not in an epilogue.

**Do not do C first.** It is the theoretically correct answer to the question as worded and the wrong
first move: it costs weeks before anyone has looked at a single screen, and the cheapest way to learn
whether a design pass is needed is to show her the product. C stays available and gets far better
targeted after A.

**Build D after, never instead.** A baseline records what is.

**On whether the shipped desktop layouts are good, there is no recommendation — and neither has
anybody else got one, which is the entry.** The choice between "she walks it" and "we draw it first"
is hers to make once she knows what each costs: one takes an afternoon and finds what is broken, the
other takes weeks and finds what is wrong.

**The one calendar fact in the repository.** `assets/feedback-1.md:750-751` records *"Desayunos
empresariales del 26/27 de agosto como posibles espacios de validación"* and a mid-November Invicta
event, both listed under *"Elementos explícitamente contextuales, no convertidos en requerimientos"*
— so neither is a commitment. But today is 2026-08-15: that is eleven days of runway, C cannot
complete before either date, and A has a natural deadline and a natural occasion.

**What would change this**: if her actual use is phone-only, the entry splits and the attendee half
could close near option E while the administrative half — desk work by nature — stays open on its
own. REQ-108 and REQ-110 currently say the opposite. If the credential problem proves expensive to
solve without destroying the four accounts, invert the sequence: walk MyNet with her first, and hold
the admin half. If a designer is engaged for anything else, C becomes cheap enough at the margin to
run in parallel with A rather than after it.

---

## Register hygiene

Nine corrections, ranked by consequence. **They are not applied here.** Each names the file and line
and what the corrected text should say.

1. **`.specify/memory/constitution.md:3656` — entry 22 has no list item.** Its heading is
   concatenated onto the end of entry 21's final paragraph, at continuation indentation, with no
   newline: `…rather than part of this one.22. **A cached conference outlives a withdrawn
   registration…**`. So the ordered list runs 11–21, then 23–26, and no `^22. ` exists in the source.
   **CommonMark renderers ignore written ordinals and renumber sequentially**, so on any rendered
   page entry 23 displays as 22, 24 as 23, 25 as 24 and 26 as 25. **The register predicted this
   exact failure, twice, in its own words** (`:1237-1239`, `:3374-3377`). Restore the newline. This
   is almost certainly the cause of correction 2.
2. **Three sites number the design-token question 22; it is 23.** `.specify/memory/constitution.md:824`
   (inside the 3.4.0 sync report, seventeen lines below `:807` which says *"(Opens register entry
   23.)"*), `.specify/memory/constitution.md:2726` (binding text, forty-two lines below `:2684` which
   says *"register entry 23 is unaffected"*), and `CLAUDE.md:1217` (which `CLAUDE.md:1812` contradicts
   correctly). Authoritative: `:3127`, `:897`, `:3185`, `:3680`, `:846-847`.
3. **Entries 27–31 appear in no register list.** They are declared only inside their amendment blocks
   — `:3292`, `:3305` (5.0.0), `:3338`, `:3347` (5.2.0), `:3357` (5.3.0). Both numbered lists end at
   26. **A reader of the two "Open —" sections sees a register that stops at 4.1.0, missing the only
   entry that currently blocks a feature.**
4. **`CLAUDE.md:263` names entry 2 as a live blocker on 012.** Entry 2 is RESOLVED (`:3380`), and the
   constitution explicitly corrected the identical sentence in itself: *"An earlier draft of this
   block said entry 2 still blocked the validation phase; it does not, and the correction is recorded
   rather than made silently"* (`:739-741`). CLAUDE.md contradicts itself at `:1723`, which is right.
   012's blocker set is **{22, 4}**.
5. **Entry 4's own text says it blocks 011** (`:3395`; `CLAUDE.md:1789`), which is shipped.
   `:750` and `CLAUDE.md:1723` say 012, correctly.
6. **Entry 22 is still filed "Against phase 010"** (`:3657`, `:899`), never updated for the
   010→011/012 split recorded at `:748-752`.
7. **Ten sites attribute decisions L1–L6 to 3.4.0; they belong to 3.5.0.** The UAT amendment was
   renumbered (`:663-668`, heading `:3200`) for the same parallel-branch reason that renumbered the
   token entry. Sites: `:2003`, `:2069`, `:2552`, `:2561`, `:2655-2656`, `:3441`, `:3461`, `:3549`,
   `:3584`, `:3615`, `:3641`. `CLAUDE.md` carries the same split at `:136`, `:1145`, `:1830`,
   `:1838`, `:1845`, `:1848` against `:1679`, `:1818`, `:1822`.
8. **Classification drift between the two files, five entries.** The constitution files 19, 20, 21,
   22 and 23 under `Open — require an owner or planning decision`; CLAUDE.md files all five under
   `### Require a client decision` (`:1760`, `:1818`, `:1760`/`:1822`, `:1779`, `:1812`). **Entry 19
   is listed twice in CLAUDE.md**, in both sections (`:1760` and `:1848`). Entries 2, 4, 11, 12, 14,
   15, 16 and 18 are aligned.
9. **`.specify/memory/constitution.md:830` carries a stale standing-decision number**, saying the
   brand-mark decision is 27; `CLAUDE.md:1200-1202` corrected it to **30** and records why. The
   constitution's sync report was never updated.

Two further notes, not corrections. **Entries 1, 3, 12, 15 and 16 are stated in CLAUDE.md without
their numbers** (`:1826`, `:1841`, `:1849`, `:1855`, `:1857`) — a number-free citation cannot go
stale, and also cannot be cross-checked, which is how correction 4 survived. And **five resolved
entries predate numbering entirely** (`:3010`, `:3012`, `:3017`, `:3020`, `:3022`), referenced in
prose by name only — so "entry 1" is not the first question this project asked.

---

## What this document does not cover

- **Entry 19** — nobody moderates uploaded avatar images. Addressed by 013's capability, **not
  closed**: who moderates, against what standard, on whose complaint, with what appeal, and whether a
  removed avatar is replaced or blanked (`:3597-3603`). Oldest live entry.
- **Entry 21** — somebody has to *be* the platform operator. The address closed; the obligation did
  not, and it is one the owner personally holds (`:3672-3675`). **Entry 21 is entry 19's nearest
  available answer, so it must be answered first if 19 is to be answered through the report path.**
- **Entry 23** — whether `navy-800` and `coral-500` adopt the brand's `#0d1942` and `#fe6551`.
  Blocks nothing; repaints the whole product and every contrast ratio if taken.
- **Entry 28** — two brand marks coexist and which one is MyNet's is undecided. Blocks nothing, and
  **no feature may resolve it by quietly replacing one with the other**.
- **Entry 29** — whether an attendee may suppress content in notifications. Promoted from prose that
  had sat unacted-on since v3.1.0.
- **Entry 30** — speakers are personal data about people who are not attendees, and v5.2.0 moved
  authorship of those rows from a reviewed commit to a promoted attendee typing into a form.
- **Entry 31** — whether deleting a session should notify the attendees enrolled in it. Intersects
  entry 22 above; the remedy is a third notification trigger and therefore another amendment.
- **Entries 1, 3, 12, 15, 16** — what "PS" denotes; whether `requirements.md` is amended or its
  divergence merely recorded; authentication ownership; server-side branch protection unconfigured;
  the repository being public.
- **The audit trail's retention clock**, which two comments claim starts at pseudonymisation while
  the predicate measures `occurred_at` (013 `deviations.md` D11). Needs a column, so it is a decision
  about the rule rather than a repair.
- **Whether a question's payload should carry `authorId`**, and whether `listBlocks` should be
  narrowed. Raised at 009's deep-review gate; both fixes contradict something written down. **Entry
  27 does not resolve it and any abbreviated answer makes it more urgent.**
- **Whether proposing a meeting should require the invitee to be discoverable**, as sharing a card
  does. 008's spec assumes not.
- **Whether the residual C1 leaves is accepted** — a card acquired by mutual exchange outlives the
  discoverability toggle that licensed it, indefinitely and unrecallable. Raised by 016's deep
  review, unnumbered; **promoting it to a register entry is an owner act**.
- **The 25 outstanding by-hand validation tasks across eight features**, 64 scenarios, of which only
  five are the three-widths scenarios entry 4 is about. They are a delivery debt, not a decision.
