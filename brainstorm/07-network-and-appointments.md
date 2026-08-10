# Brainstorm: Network — contacts, exchanged cards, and appointments

**Date:** 2026-08-10
**Status:** active
**Phase:** 008 · migration `0007` reserved · ∥ 009

## Problem Framing

008 is the first phase in the queue whose gate was never a dependency. 004 and 007 both shipped, so
nothing technical blocked it — what blocked it were **two client decisions in the constitution's
register**, entries 7 and 8, each of which says in its own words that it *blocks the Network feature
entirely*. This session exists to settle them, and it did.

Four facts framed the session before any option was put on the table.

**The prototype answers the contact question by not having one.** `App.tsx:1174` is literally
`ATTENDEES.filter((a) => conversations.some((c) => c.attendeeId === a.id))` — the Contacts tab is a
view over the conversation list with no storage behind it. There is no connect action, no accept
action, and therefore no relationship. That is precisely what register entry 7 records.

**#06 had already foreclosed the prototype's answer, and this session found that out late.** The
overview's narrowing of entry 7 reads: under open send a conversation is a *unilateral* act, so
**008 must not derive contacts from conversations**, because doing so lets a stranger insert
themselves into another attendee's Network by sending one message. Half of entry 7 was decided in
007 as a consequence of a different decision. The remaining half is what a contact *is* instead.

**Discover is the ephemeral half of the product, deliberately.** 006's directory is per-event, and
its refusal to cache is a declared architectural invariant rather than an omission — age is the
wrong clock for a discoverability setting, and a cached directory is other people's personal data
ageing on a device after they chose to be invisible. The consequence nobody had written down: when
the conference ends or the attendee switches events, **nothing durable is left behind**. Standing
decision 7's own rationale promises that "a contact made at last year's conference must not vanish
because the attendee is now at a different one", and as of 007 that promise is not kept by anything.

**Discover shipped with both of this phase's actions deliberately unbuilt.** `AttendeeProfile.tsx`
carries a *Message* link and nothing else; 006 declared the action boundary and rendered nothing in
it, on the recorded grounds that a disabled button promising a feature is worse than its absence. So
there is no placeholder to retrofit around and no prototype affordance to preserve — 008 builds both
actions from the boundary outward.

Taken together these reframe the phase. Network is not a third rendering of people the attendee
already knows about. **It is the only durable half of a product whose discovery surface is
deliberately transient**, and the question "what is a contact" is really the question "what survives
the event".

## Approaches Considered

### What a contact is

#### A: A contact is someone whose card you hold *(chosen)*

The two blocked register entries collapse into one model: sharing a card is the only
relationship-forming act in the product, and holding one is what makes somebody a contact.

- Pros: closes entries 7 and 8 with a single decision rather than two independent ones. Invents no
  verb — *share a card* is already in `requirements.md`, the prototype, and the core journey, whereas
  *connect* and *accept* appear in none of them. Gives Network a job that is not already done
  elsewhere. Makes the durability promise in standing decision 7 true for the first time.
- Cons: the contact list is empty until somebody shares with you, so the destination has a colder
  start than a derived list would. Ties two features' fates together — a defect in card sharing is a
  defect in contacts.

#### B: Derived from conversations

The prototype's model, unchanged: your contacts are the people you have a thread with.

- Pros: stores nothing new, ships fastest, matches the approved reference exactly.
- Cons: **already ruled out by #06** — a conversation is unilateral under open send, so a stranger
  who sends one message appears in your Network. It also makes the Contacts tab a second rendering
  of Messages, and leaves entry 8 unanswered and still blocking.

#### C: An explicit save — a one-sided bookmark

*Save to my network* from a profile, no consent from the other side, in the shape of a follow.

- Pros: simple, honest about being one-sided, no coordination between two accounts.
- Cons: invents a verb that exists in neither `requirements.md` nor the prototype. A saved person is
  a private list of other people's data assembled without their knowledge, which is a worse
  Principle VIII story than an exchange the other party performed deliberately.

#### D: The union of both signals

A contact is anyone you have messaged **or** whose card you hold.

- Pros: widest list, matches the prototype and adds cards on top.
- Cons: a list assembled from two rules is hard to explain and harder to leave — removing somebody
  means answering "removed from which rule?". Inherits B's defect wholesale.

### What sharing a card creates

#### A: One-directional — sharing gives them *your* card *(chosen)*

You get theirs when they share back. Two acts, as with a physical card.

- Pros: **nothing about a person becomes durable without that person's own act.** In a product with
  public self sign-up and no moderator by construction, that is the property worth protecting. A
  contact list under this rule means "people who chose to give themselves to me", which is a
  meaningful list rather than a scrape.
- Cons: the affordance has to read *Share my card with X* rather than sitting on their card as an
  action about them, and tapping it does not grow your own Network — which is a genuine mismatch
  with the prototype's placement and needs deliberate copy.

#### B: Mutual on send

One tap, both parties hold each other's card.

- Pros: matches the word *exchanged* in `requirements.md` and the prototype's interaction, where
  tapping *Share* on someone's card produces immediate reciprocal value.
- Cons: captures a person's details permanently on somebody else's say-so. The usual defence — that
  co-attendees can already see each other, so nothing new is disclosed at that instant — fails on the
  time axis, which is the whole point of the feature: the capture **survives their discoverability
  toggle and the end of the event**, and they never acted.

#### C: Request and accept

Neither card moves until the recipient accepts.

- Pros: the strongest consent story available.
- Cons: reintroduces exactly the pending state and acceptance step that 007 refused for
  conversations, for a smaller imposition than a message. Worse, a pending request wants a
  notification to be useful, and the constitution locks the trigger set to a received message and
  nothing else — so the feature would be born wanting an amendment.

#### D: One-directional into a tray, kept or discarded

- Pros: consent at both ends.
- Cons: makes a rejected card something the product must hold and hide, for very little over plain
  one-directional.

### What a held card resolves to

#### A: A live pointer to the profile *(chosen)*

The row records *that* the card was handed over. Name, company, role, headline and interests resolve
from the sharer's current profile at read time.

- Pros: stores no duplicated personal data, so nothing goes stale and an edit propagates everywhere
  it should. Keeps one source for a person, which is the drift this codebase refuses elsewhere.
- Cons: requires an explicit rule that **a shared card outlives the discoverability toggle** —
  without it, one person going invisible blanks every card they ever handed out, which would make
  the durability the feature exists for illusory. That rule has to be written down, because it is a
  read path that deliberately bypasses 006's visibility conditions.

#### B: A snapshot at exchange

The card freezes who they were when you met.

- Pros: immune to the toggle by construction rather than by rule. "Met at DevConf, then at Acme" is
  arguably the more useful record, and it needs no new predicate.
- Cons: a copy of somebody's personal data that outlives their own edits, and a second source for a
  person. It goes stale in exactly the way a contact record must not.

#### C: Snapshot plus live resolution

- Pros: the richest record — where you met them, and where they are now.
- Cons: two sources for one person and **both** of the rules above rather than one.

### What a card carries

#### A: Exactly the profile the directory already shows

- Pros: no new personal data, so `export-coverage` and `deletion-coverage` need nothing new, and the
  card is purely a durability mechanism.
- Cons: a "business card" with no way to reach the person off-platform. Messages is permanent and
  cross-event, which softens this but does not answer it.

#### B: The profile plus an attendee-authored contact line *(chosen)*

An optional field the attendee writes themselves, which appears **only on a shared card** and never
in the directory.

- Pros: makes the artifact genuinely a business card rather than a bookmark, and the thing being
  disclosed is chosen and authored by the person disclosing it.
- Cons: **in tension with standing decision 16**, which settled that profile visibility is
  all-or-nothing and recorded that per-field permissions were considered and rejected. It is also a
  new personal-data field, which fails two coverage tests by existing until covered. *Carried to the
  register as an open question rather than resolved here — see Open Questions.*

#### C: The profile plus the account email

- Pros: the simplest "real card".
- Cons: that address is the login identifier, and 004 already treats disclosing whether it exists as
  a threat-model question. Rejected on its face.

### Where meeting slots come from

The roadmap assigns this decision to this phase and offers two candidates. One of them was
eliminated on Principle VIII grounds before it was put to the client.

#### A: An event slot grid, minus the reader's own conflicts *(chosen)*

Slot times belong to the event day as seeded conference content, in venue time. Slots are removed
where the reader already holds a saved session or an appointment.

- Pros: discloses nothing whatever about the invitee, while still preventing the reader
  double-booking themselves against the Agenda 005 already built. Consistent with standing decision
  8 — the grid is conference content, so it is seeded.
- Cons: the reader can still propose a slot the invitee is busy for; that surfaces as a decline.

#### B: A fixed grid with no subtraction

The prototype's literal `MEETING_SLOTS` constant, minus slots the reader already booked.

- Pros: the least to build and the easiest to explain.
- Cons: cheerfully offers a slot the reader is sitting in a keynote for, when 005 already knows
  otherwise.

#### C: Derived from gaps in the programme

- Pros: no slot data to seed.
- Cons: a conference programme is nearly continuous, so the gaps are lunch and the coffee breaks —
  possibly too few slots to be usable — and it couples appointments to catalog shape.

#### D: Derived from **both parties'** saved sessions — rejected

The roadmap's other candidate, and the one a calendar product would choose.

- Cons: **it discloses the invitee's private Agenda by omission.** A saved session is private
  per-attendee state; if the invitee's commitments grey out slots, the reader learns where that
  person will be all day by reading the gaps. This is a personal-data leak through absence, and it
  is why the "both parties" variant is not available to this product at any level of polish.

### Whether an appointment is proposed or imposed

#### A: Proposed, then accepted or declined *(chosen)*

Scheduling creates a proposal. It becomes an appointment when the invitee accepts.

- Pros: an appointment claims a slot of another person's time, which is categorically different from
  a message or a card — those impose nothing. The roadmap already lists `status` among an
  appointment's fields, so the shape was anticipated.
- Cons: **breaks consistency with two prior refusals of an acceptance step** (007 for conversations,
  and this session for cards), so the asymmetry has to be written down or it reads as drift. And
  because no notification may be raised, the invitee learns of a proposal only by opening the
  product.

#### B: Unilateral, cancellable by either party

The prototype's model.

- Pros: consistent with the no-handshake precedent, and the fewest states.
- Cons: anyone who signs themselves up can drop entries into a stranger's schedule, in a product
  with no moderator.

#### C: Unilateral where the invitee's intent permits

Book directly when the profile says *Open to meetings*; do not offer it otherwise.

- Pros: treats 004's shipped intent field as the standing consent it arguably is.
- Cons: turns a self-description into a booking permission the attendee may not have realised they
  were granting.

#### D: Proposed, with server-side auto-decline on conflict

- Cons: the auto-decline reveals that the invitee was busy at that time — the same Agenda leak as
  approach D above, arriving through the response instead of the slot list.

### Whether a shared card can be taken back

#### A: No recall, but 007's block severs it *(chosen)*

- Pros: one control, already built and already server-enforced, rather than a second
  half-overlapping verb. Account deletion still removes the card entirely by cascade.
- Cons: an attendee who wants to withdraw from one person without blocking them has no move.

#### B: An explicit per-contact revoke

- Pros: the strongest personal-data story, and independent of blocking, which is a much heavier act.
- Cons: a new verb, a new inert state for the holder, and an asymmetry where somebody's contact list
  silently shrinks.

#### C: Discoverability off revokes everything

- Cons: contradicts the standing-consent rule that makes the live pointer work at all. Rejected.

## Decision

**A contact is someone whose card you hold.** Sharing a digital business card is the only
relationship-forming act in MyNet, and it settles constitution register entries 7 and 8 together.

- **Sharing is one-directional.** It gives the recipient *your* card. You hold theirs only when they
  share back. Nothing about a person becomes durable without that person's own act.
- **A held card is a live pointer, not a copy.** The stored row records that the exchange happened,
  where, and when; the details resolve from the sharer's current profile at read time.
- **A shared card is standing consent that outlives both the event and the discoverability toggle.**
  This is the rule that makes the live pointer viable, and it is deliberate rather than incidental:
  discoverability governs being *found*, not being *remembered*.
- **A card carries the directory profile plus an optional, attendee-authored contact line** that
  appears only on a shared card. *Subject to the register question below.*
- **Meeting slots come from an event slot grid in venue time, minus the reader's own conflicts.**
  Never the invitee's — that leaks their Agenda by omission.
- **An appointment is proposed, then accepted or declined.** Reserving another person's time is a
  different act from messaging them, which is why this feature takes the acceptance step that
  conversations and cards both refused.
- **A card cannot be recalled; blocking severs it.** 007's block is the control, in both directions,
  and it also prevents scheduling.

**What this buys.** Network stops being a second rendering of Messages, and standing decision 7's
promise — that a contact made at last year's conference does not vanish — becomes true for the first
time, because Discover is per-event and uncached and nothing else in the product survives the event.

## Key Requirements

**Cards and contacts**

- Sharing a card is available from the attendee profile view in Discover, alongside the *Message*
  link 006 left as the sole occupant of that boundary. Its accessible name says whose card moves.
- The exchange records the sharer, the recipient, the instant, and the event it happened at. The
  event is a historical fact about where you met, **not** a scoping predicate — cards are
  cross-event, per standing decision 7, and the table must say so and say why.
- Resolving a held card reads the sharer's current profile **without** the directory's visibility
  conditions and **without** re-checking verification. Re-checking verification would use
  verification for a second thing, which the shipped invariant forbids: it gates discoverability and
  nothing else.
- Sharing the same card twice is idempotent — it does not create a second contact, and it must not
  become a way to poke somebody repeatedly.
- Blocking severs card resolution in both directions and prevents a new share.
- Network's contacts view lists held cards. Its empty state invites the attendee to Discover, in the
  shape `requirements.md` mandates for an empty list.

**Appointments**

- An appointment is per-event, and the table says so. It carries both participants, the event, the
  slot, a short topic, and a status.
- Proposing requires a selected slot **and** a non-empty topic; the confirm control is **disabled**
  until both are present, never a post-submit error. This is a binding constraint, not a preference.
- The invitee may accept or decline. Either party may cancel a confirmed appointment.
- Declining and cancelling free the slot for the reader who proposed it.
- The no-slots state is an explanation plus a close action, per the required empty states.
- The scheduling surface is the modal `<dialog>` with `showModal()` that 005 established and 007
  reused — the platform gives the focus trap, background inertness and Escape, and focus is restored
  to the opener explicitly, after closing.
- **No notification is dispatched for a proposal, an acceptance, or a decline.** The constitution
  locks the trigger set to a received message and nothing else, and `apps/api/src` carries a
  source-level audit that fails if a second trigger appears. 008 does not edit that test.

**Where this phase's surfaces live**

- `navigation.ts`: the Network entry gains its `element` and its nested addresses, appended to its
  own line and to no neighbour's. Its `purpose` — *"Saved contacts, exchanged cards, and scheduled
  appointments"* — is already accurate and needs no correction, unlike Agenda's did.
- Home gains **its own card** for the appointment summary, registered in `home/registry.ts`. It must
  surface proposals awaiting the attendee, since no notification will announce one. It never edits
  another feature's card, per standing decision 9.
- New repository interfaces and route registration go in their own per-domain files.

**Coverage that fails by existing**

- Every new table fails `deletion-coverage.test.ts` until it declares a cascade from `attendees` or
  a retention rule, and the contact-line column fails `export-coverage.test.ts` until covered. Both
  derive expectations from the Drizzle schema, so this is a build failure rather than a review note.
- The contact line must be provably absent from 006's directory query, which is deliberately one
  query. A test should assert that, because the field's whole meaning is that it does not appear
  there.

**Migration `0007`** is reserved. Anyone regenerating the Drizzle snapshot must move
`apps/api/migrations/meta/README.md` aside first — `drizzle-kit generate` JSON-parses every file in
`meta/` — and must not "fix" the journal's deliberate `0003`/`0004` ordering.

## Open Questions

**For the register — needs the project owner**

- **Does the card-only contact line breach standing decision 16?** That decision settled profile
  visibility as all-or-nothing and recorded that per-field permissions were *considered and
  rejected*. The reading this session proceeded under is that decision 16 governs **the profile in
  the directory**, which stays all-or-nothing, while the contact line is a distinct artifact that
  moves only by a deliberate share — so it is a second surface rather than a permission on the
  first. That reading is defensible but it is a WHAT-level conflict between the constitution and
  this design, and `CLAUDE.md` is explicit that those are recorded rather than resolved by
  assumption. **Everything else in this decision holds either way**; only the field's existence
  turns on it.
- **Whether entries 7 and 8 are closed by this session or need ratification.** Both are client
  decisions in the constitution's register, and precedent cuts both ways: #04's client decisions
  were treated as binding immediately, while #06's amendment landed as v3.1.0 before the
  specification was written. The contact-line question above probably decides which.

**For the specification and its review gate**

- **Whether Network caches anything offline, and how.** #06 explicitly deferred this here: the
  decorator is keyed `(attendeeId, eventId, resource)` and cross-event contacts have no escape from
  the mismatch the way threads did. The leaning this session records, for the spec to confirm or
  overturn: **appointments are cacheable** — they are the attendee's own commitments, per-event, and
  the existing key fits them exactly as it fits saved sessions — while **contacts are not**, because
  resolving them reads other people's live profile data, which is the same argument that made
  Discover uncached. If that holds, the key needs no event-less variant and the deferred question is
  answered by refusal rather than by extension.
- **Whether card resolution needs its own branded scope and a fourth route audit.** Cards are
  cross-event, so `EventScope` cannot reach them and the event-scope audit would *silently pass* a
  route naming no conference — which is exactly the hole 007 found and closed with
  `ConversationScope`, `requireParticipation` and a second audit. Appointments are per-event and may
  be able to compose `EventScope` with a participant check instead. Worth deciding deliberately,
  because the failure mode is silence.
- **What the slot grid actually is as seed data** — slot length, how many per day, and whether it
  varies by event. It is conference content under standing decision 8, so it is seeded and versioned
  rather than configured.
- **Whether a proposal expires.** A proposal for a slot that has already passed is not an
  appointment and should not sit in a list forever, but nothing here decides what happens to it.
- **How many pending proposals one attendee may send another.** Proposing is unilateral and cheap;
  without a bound it is a contact path that blocking closes only after the fact. 007's per-action
  throttle is the existing mechanism.
- **Whether an appointment survives the proposer leaving the conference**, and what a held card
  shows when the sharer has withdrawn from every event you share. Neither is deletion — the account
  still exists.
- **Copy for a contact whose card resolves to nothing** because the sharer deleted their account.
  The state is decided by cascade; the words are not, and 007 left the analogous
  departed-counterpart copy open too.
- **Whether the contacts list needs pagination.** 006 needed a keyset cursor for a thousand
  attendees; a held-card list is bounded by deliberate human acts and is probably small enough not
  to. Worth stating either way rather than discovering it.
- **Whether 008 splits into reviewable phases.** It carries two subsystems that share only a
  destination. Worth deciding after planning, against the concrete task list, as 007 did.
