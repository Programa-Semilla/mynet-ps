# Brainstorm: Conference content authoring (014)

**Date:** 2026-08-12
**Status:** spec-created — `specs/014-conference-content-authoring/`; amendment **v5.2.0 ratified
2026-08-12** as standing decisions 45–49

## Problem Framing

Conference content — events, sessions, tracks, rooms, speakers — has been seeded since 001. Standing
decision 34 and the constitution's amended seed clause (v4.0.0, A4) already permit a conference
organizer to author it in the administrative product; nothing has been built. **014 is that
capability.**

It is the second feature of the administrative programme, after 013 shipped the second actor, the
admin site and the report queue in [#20](https://github.com/Programa-Semilla/mynet-ps/pull/20).
#09 chose to ship moderation first *precisely because* authoring is the largest surface — "write
paths, validation, draft/publish state, and the unanswered question of what editing a *live*
conference does to attendees who have already saved those sessions". That question is this
session's centre, and #09 named it as 014's.

**What the schema says, and it is sharper than the prose suggested.** Every table holding attendee
state about a session cascades from `sessions.id`:

| Table | Reference | On delete |
|---|---|---|
| `saved_sessions` | `sessions.id` | `cascade` |
| `session_notes` | `sessions.id` | `cascade` |
| `session_questions` | `sessions.id` | `cascade` |
| `question_votes` | `session_questions.id` | `cascade` |

So *as the database stands today*, an organizer deleting one session destroys twelve people's
agendas, four people's **private written notes**, seven published questions and thirty votes —
silently, with no confirmation and no record. Nothing in 013 could have caught this, because 013
built no write path into the catalog at all.

**A second constraint was found while framing, and it changes the feature's cost.**
`apps/api/tests/unit/notification-triggers.test.ts` walks the real source tree and names the one
file permitted to dispatch. v3.1.0 bounded engagement delivery to *a received message and nothing
else*, and CLAUDE.md records that "a second trigger has to edit the test, and **editing it is the
conversation**". Telling an attendee their saved session moved is that second trigger.

**A third, found by reading the schema:** `events.join_code` is `NOT NULL UNIQUE`, so creating a
conference means minting a join code — and #09 assigned join codes to **015**. Meanwhile a
conference organizer's authority is defined as reaching "only conferences they are assigned", which
cannot describe the act of creating one.

## Approaches Considered

### 1. When is authoring used?

#### A: Both — live editing is v1 — **chosen**
- Pros: What a real conference needs. Rooms move, speakers cancel, sessions shift an hour, and all
  of it happens after attendees have saved things. Deferring it means the product cannot run a
  conference, only prepare one.
- Cons: Forces every attendee-impact question into 014 rather than a later feature. Largest surface.

#### B: Setup only, behind a draft/publish lifecycle
- Pros: Defers every attendee-impact question; a conference is frozen once published.
- Cons: A frozen programme is not how conferences behave, so the deferral is fictional. Adds a
  lifecycle column, and therefore a migration, to buy a postponement.

#### C: Live editing with no lifecycle
- Pros: Adds no schema — exactly how the seed behaves today.
- Cons: Organizers author into a conference attendees can already see, half-built.

#### D: Setup only, no lifecycle, mid-conference change stays a reviewed seed change
- Pros: Smallest 014, and decision 34 keeps the seed route valid.
- Cons: Requires a deploy to move a room.

### 2. What happens when an organizer removes a session attendees have engaged with?

#### A: Cancel, never delete, once engaged — **chosen**
- Pros: Delete stays available while nothing is attached, so a mistyped session created a minute ago
  is still removable. The moment any attendee state exists the only act is **cancel**, and notes,
  questions and votes survive. It is also the state a real conference independently needs when a
  speaker drops out — so the column earns its place twice.
- Cons: One column, and therefore a migration. Two verbs where organizers expect one, and the
  boundary between them is a data-dependent state rather than a permission.

#### B: Cascade, with an informed confirmation
- Pros: No schema. The organizer is shown the counts and confirms.
- Cons: An organizer's routine tidy-up destroys four people's private writing. 009's precedent —
  a withdrawn question takes everybody's votes — was the **author** deleting their own words, and
  does not transfer to a third party deleting somebody else's, for the same reason 007's
  conversation answer did not transfer to 009.

#### C: Refuse while attendee state exists
- Pros: Strongest protection, no schema.
- Cons: One vote from one attendee locks a session into the programme permanently, with no cancel
  affordance — so the organizer's only remaining move is to rename it "CANCELLED" by hand, which is
  the same outcome with none of the guarantees.

#### D: Cancel always; sessions are never deleted
- Pros: One rule, trivially testable.
- Cons: A session created by mistake is in the programme forever, and organizers will work around it
  by editing it into something else — which is worse than deleting it.

### 3. How does an attendee learn their saved session changed?

#### A: In-app marker **and** a push notification for saved sessions — **chosen**
- Pros: The marker closes the quiet-failure case (without it the Agenda simply reads 14:00 and
  whoever memorised 10:00 turns up wrong), and the push closes the one with a real physical cost —
  a trip across a venue to a room with nobody in it. Together they are what an attendee would
  expect from any conference app.
- Cons: **The push is a second dispatch trigger and needs a constitution amendment.** It also puts
  a session title on a lock screen, which is the concern v3.1.0 accepted and explicitly did not
  solve for message content.

#### B: Nothing — you see it when you look
- Pros: No amendment, no new concept, smallest 014. Exactly 008's precedent, where a proposed
  appointment dispatches nothing and Home's card is the only way you learn.
- Cons: A silently moved session is indistinguishable from one you misremembered.

#### C: In-app marker only
- Pros: No dispatch, so no amendment.
- Cons: Gives the information only to somebody already looking at the app, which is not the attendee
  the cancellation hurts.

#### D: Push for cancellations only, marker for moves
- Pros: Narrowest possible second trigger.
- Cons: Still needs the amendment, and the dispatch rule stops being one sentence.

### 4. Who creates a conference?

#### A: Both tiers — **chosen**
- Pros: An organizer running their own event is not blocked on a platform operator. Removes a
  chicken-and-egg where somebody must be assigned to a conference that does not exist yet.
- Cons: **It widens the organizer tier beyond what decision 32 describes.** Creating-and-
  self-assigning is how a promoted attendee grants themselves new authority, which is a
  product-wide capability that clause did not anticipate. It survives in substance — an organizer
  still cannot reach anyone *else's* conference — but the amendment must say so rather than let it
  be inferred.

#### B: Platform operator creates the shell, organizer fills it in
- Pros: Clean tier split, matching decision 32 exactly.
- Cons: Every new conference needs two people.

#### C: 014 is programme-only; conferences and join codes both land in 015
- Pros: Smallest 014, cleanest boundary with 015.
- Cons: Until 015 ships, the admin site can only edit the three seeded conferences, so nobody can
  run a new event.

### 5. Delivery shape

#### A: One PR — **chosen**
- Pros: Matches 008, 009 and 013, each of which shipped its gating amendment and implementation as
  one merge. The two halves are genuinely one decision.
- Cons: The largest review surface in the programme, spanning two products plus an amendment that
  touches notification scope.

#### B: Two PRs — authoring, then the attendee-facing change
- Pros: PR-A touches only `apps/admin` and `apps/api`; PR-B is the first change to MyNet since 013.
  Neither half strands the other, unlike 011's collapsed split.
- Cons: Holds a complete amendment open across two merges.

#### C: Three PRs
- Pros: Most reviewable.
- Cons: Conference creation is not large enough to earn its own merge.

## Decision

Build **conference content authoring in the administrative product**, with **live editing from day
one**, gated by a **constitution amendment (v5.2.0)** carrying **two** changes, and delivered as
**one PR** reserving **migration `0011`**.

**Why v5.2.0 is MINOR.** It extends notification scope and clarifies an authority boundary. Nothing
delivered is retracted, no principle is removed, and no prior work is invalidated — the test
v3.1.0 applied to itself when it brought delivery into scope at all.

**The amendment must say both things explicitly, not one and imply the other.** v3.3.0 refused to
derive public Q&A visibility from attribution when the entailment argument was available; the same
discipline applies here. The two are:

1. **A second notification trigger exists**: a change to a session an attendee has saved. The bell
   and the in-app notification centre remain forbidden, and that half of the exclusion is unchanged.
2. **A conference organizer may create a conference and is assigned to it**, which is the only
   product-wide act the tier holds. Their authority over *existing* conferences is unchanged and
   still comes only from assignment.

**Numbering.** 013 took `0009` and 012 reserves `0010`, so 014 reserves **`0011`**. This is the
third time parallel branches have collided over a reservation; the roadmap's reserved-number table
still stops at the shipped attendee programme and must be extended to cover both in-flight
programmes at once.

**014 is the first feature since 013 to change MyNet itself.** 013's headline property was that
MyNet gained nothing — no admin surface, no privileged view, no role-dependent rendering. 014 does
not breach that: the marker and the push are attendee-facing behaviour about the attendee's own
saved sessions, visible to every attendee identically and dependent on no role. The
`admin-forbidden-surfaces` guarantees are untouched, and that should be re-asserted rather than
assumed.

## Key Requirements

Agreed during this session. These feed the spec; they are not the spec.

1. **Events, sessions, tracks, rooms and speakers are authorable** in the administrative product,
   including session↔speaker assignment.
2. **Both tiers create conferences.** A platform operator may create any; a conference organizer
   creates one and is auto-assigned to it. Reach over *existing* conferences is unchanged and still
   comes only from assignment.
3. **No draft/publish lifecycle.** A conference is reachable only by its join code, so an unfinished
   one is already private to whoever holds the code. A lifecycle would be a second gate over a gate
   that already exists.
4. **Delete is available only while nothing is attached.** Once any attendee state exists — a saved
   session, a note, a question or a vote — the only act is **cancel**.
5. **Cancellation is stored state on the session, not a deletion.** Attendee state survives intact.
   Agenda and Home render the session as cancelled. It cannot be derived, unlike 008's `lapsed`,
   because it is an organizer's act rather than a function of the clock.
6. **An attendee whose saved session is cancelled or materially changed gets both an in-app marker
   on the row and a push notification.**
7. **The marker is per-row state, never an inbox.** No bell, no notification centre. This must stay
   testable as an absence, or the amendment reopens the half of the exclusion still standing.
8. **Every authoring act and the audit entry accounting for it commit in one transaction** —
   013's FR-994 pattern, and the defect its post-review round fixed.
9. **Validation**: a session sits inside its event's day range and ends after it starts; event dates
   may not shrink to exclude existing sessions (refused, naming them); the same room at the same
   time warns rather than refuses, because conferences really do overlap during changeover.
10. **Track colours come from the five existing tokens**, not a colour picker. The visual language
    belongs to `theme/tokens.css`, not to an organizer.
11. **No tier may edit anybody's profile**, unchanged from v4.0.0. Speakers are conference content
    and are *not* attendees; 014 must not acquire an attendee-editing surface by way of them.
12. **The seed's fixture properties survive**: `assertDisjoint`'s two-fully-disjoint-programmes
    guarantee and the deliberately empty third conference that keeps the "no programme" state from
    rotting.
13. **Migration `0011`.**
14. **Constitution amendment v5.2.0 gates the first line of code**, as v3.1.0 gated 007's Phase 7,
    v3.2.0 gated 008, v3.3.0 gated 009 and v4.0.0 gated 013.

## Open Questions

To be resolved in the spec phase, or escalated to the owner where they are decisions rather than
details. **None may be silently resolved.**

- **Which changes are "material" enough to dispatch?** Cancellation certainly, and a start-time
  change certainly. A room change probably. A title, a summary or a speaker swap, probably not —
  but the amendment has to name the set rather than leave it to a handler, because the set *is* the
  scope of the second trigger.
- **A saved-session push carries a session title to a lock screen.** v3.1.0 accepted the equivalent
  for message content and explicitly did not solve whether an attendee may suppress it. 014 makes
  that unsolved question apply to a second content type, and it is now the second time it has come
  up without being answered.
- **May an attendee still ask questions on a cancelled session?** The session will not happen, and
  its existing Q&A survives by requirement 5. Whether the composer stays open is undecided.
- **Is the count that gates delete-vs-cancel a disclosure?** Showing an organizer "12 attendees
  saved this, 4 wrote notes" is an aggregate over attendee state with no identity attached, so
  probably not a Principle VIII exception. This project's habit is to record that rather than derive
  it — v3.3.0's whole point.
- **Speakers are personal data about people who are not attendees.** They already exist as seeded
  rows, so this is not new; what is new is that 014 makes them *organizer-authored*, which changes
  who is responsible for a real person's name, title and company appearing in the product.
  `deletion-coverage.test.ts` and `export-coverage.test.ts` derive from the schema, and Principle
  VIII has only ever considered attendees.
- **Does the event timezone stay editable once sessions exist?** Sessions store `timestamptz`, so
  changing it moves no absolute instant — but every displayed local time shifts, including on
  saved-session rows and Home's "Up next". Whether that is a material change under the first open
  question above is the same decision from the other end.
- **May a conference be deleted, and by whom?** Requirement 4 answers this for sessions and says
  nothing about the conference containing them. A conference with registrations is the same problem
  one level up, and worse.
- **Nothing bounds how many conferences a promoted attendee may create.** Promotion is
  platform-tier only, so it is bounded by trust rather than by a limit. Worth a deliberate decision
  rather than an accident.
- **Register entry 22 gets staler, in a new way.** A cached conference can already outlive a
  withdrawn registration by 24 hours; 014 makes an *edited* programme sit in the same device cache.
  The entry is filed against 012 and 013 did not answer it either. Whether 014 must is undecided —
  but 014 is the first feature that makes the cached copy wrong for a reason other than access.
- **The roadmap's reserved-number table stops at the attendee programme** and has now been wrong
  for two features running. Extending it is housekeeping, not a decision, but it is the third
  collision.
