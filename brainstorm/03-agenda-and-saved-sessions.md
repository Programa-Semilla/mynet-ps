# Brainstorm: Agenda and Saved Sessions

**Date:** 2026-08-07
**Status:** active
**Phase:** 005 · migration `0004` reserved · ∥ 006

## Problem Framing

Feature 002 shipped Agenda as the conference programme — chronological, grouped into venue-local
days, and **deliberately read-only**. `Agenda.tsx` carries a load-bearing comment saying so, and
002's US2 scenario 6 asserts the absence of a save control, on the reasoning that a greyed-out star
is an affordance for a capability that does not exist.

005 is the phase that makes it exist. `requirements.md` calls Agenda "the personalized schedule",
and until saved state lands, the destination carries the programme but not the person.

Three things made this larger than "add a star", and all three surfaced before any approach was
proposed.

**Saved sessions cannot live on `CatalogRepository`.** That interface is declared read-only in
perpetuity — "No method creates, updates or deletes anything here, and none ever may" — because a
catalog write is organizer administration, which Principle III puts out of scope. Saved sessions are
attendee state about conference content, not conference content. They need their own repository.

**"Up next" is already picking arbitrarily.** The seed contains two sessions starting at 11:00 on
day 1 of the second conference. `nextSession()` breaks the tie by session id: deterministic across
devices and reads, which is correct, but arbitrary as a *choice*. On any parallel-track conference
the first viewport is already featuring a session for reasons the attendee cannot see. This is the
real case for the roadmap's "Up-next prefers saved sessions" — and it runs straight into standing
decision 9.

**005, not 004, is the first phase to store attendee-authored personal content.** The register
records data retention, deletion and export as blocking *the attendee profile feature*, "the first
to store substantial personal data". That assumed 004 ran first. It is not running first, and
durable personal notes are more open-ended than anything a profile form collects. The obligation
arrived a phase early, attached to a feature nobody had assigned it to.

Three entries were also carried in from `brainstorm/idea-inbox.md`, all of which name 005 or Agenda
directly: `home-card-duplicate-reads`, `destination-owns-its-element`, and
`interface-evolution-for-offline-data`.

## Approaches Considered

### The Home contribution — how saved state reaches the first viewport

The roadmap's card column assigns 005 "Up-next prefers saved sessions", which means editing 002's
`UpNext` card. Standing decision 9 and `registry.ts` both forbid a feature editing another
feature's card.

#### A: 005 contributes its own card, `UpNext` untouched — **chosen**

- Pros: honours decision 9 literally; zero contact with 002's files; the merge surface stays the
  one-line append the registry was built for.
- Cons: Home can show two next-session cards that disagree; the generic Up next keeps its arbitrary
  tie-break, so the defect above is worked around rather than fixed.

#### B: Extend `contract.ts` so preference is data-driven

- Pros: `registry.ts` names exactly this as the sanctioned path — "a change to `contract.ts` and a
  conversation". Fixes the tie-break at its source for every card.
- Cons: first real coupling between cards; the composition contract starts carrying cross-feature
  state, which is the property that keeps one failing card from blanking Home.

#### C: Drop the preference; Up next stays programme-wide

- Pros: simplest. Neither `requirements.md` nor the prototype says Home filters by saved state, so
  the roadmap's card column is an invention of the roadmap.
- Cons: leaves the arbitrary tie-break on the first viewport.

#### D: 005 edits `UpNext.tsx` directly

- Pros: delivers the roadmap's stated intent with the least work.
- Cons: overrides a ratified constitutional decision by roadmap fiat, and sets the precedent that
  the card column beats decision 9 for the six features that follow. Rejected.

### The session detail panel — addressable or not

#### A: `/agenda/<sessionId>`, rendered as an overlay at every width — **chosen**

- Pros: matches the responsive rule that mobile uses full-width overlays; browser Back closes it; a
  Home card opens it by link rather than by reaching into Agenda's state, which decision 9 forbids;
  009's Q&A tab becomes linkable.
- Cons: must handle a cold load where Agenda has not fetched the programme yet.

#### B: Overlay only, no URL — the prototype's shape

- Pros: no routing work; copies the approved reference exactly.
- Cons: Back does not close it on mobile, which is a real usability failure on a touch device; no
  deep link; a Home card needs some other way in.

#### C: Addressable, full page on mobile and overlay on desktop

- Pros: most native-feeling on a phone.
- Cons: two layouts to build, test and keep accessible, against a prototype that only ever showed
  the overlay.

### Personal data, arriving a phase early

#### A: A narrow commitment declared in 005 — **chosen**

- Pros: 005 commits only to what it can honour now — notes and saves are deleted with the account,
  no export path ships — stated as a declared limit under Principle IX. The full obligation is still
  settled before 004. The one unblocked phase keeps moving without the question being treated as
  closed.
- Cons: a partial answer to an obligation that deserves a whole one, and 004 inherits the rest.

#### B: Ship 005 without notes

- Pros: 005 stores no free text at all; the obligation stays with 004 where it was written.
- Cons: departs from the roadmap, which has 005 discharging notes, and leaves 009's Q&A tab landing
  on a panel with no personal-data story.

#### C: Treat it as genuinely blocking

- Pros: constitutionally cleanest.
- Cons: the delivery queue then has no unblocked phase at all, and everything stalls.

#### D: Not blocking — proceed as scoped

- Pros: saved-session rows are already identity-attributable data that 002's model anticipated.
- Cons: treats free-text notes as a difference of degree from a save toggle, which is hard to
  sustain.

### When a note persists

#### A: Autosave on pause, non-optimistic — **chosen**

- Pros: typing pauses → write → status reads *Saving…*, then *Saved*, or *Couldn't save* with a
  retry. Nothing is claimed saved before the server confirms, so this is **not** an optimistic
  update and incurs none of the recorded decisions the constitution attaches to one. Correct
  behaviour for notes taken mid-session, where losing input is the actual failure.
- Cons: more states to render than a button.

#### B: Explicit Save, disabled until changed

- Pros: matches the disabled-confirmation pattern the requirements already mandate for empty
  messages and meeting topics; fully deterministic.
- Cons: closing the panel mid-note loses it, and a confirm-on-close guard is friction in exactly the
  moment the attendee is trying to look at the stage.

#### C: Autosave, optimistic

- Pros: smoothest feel.
- Cons: pulls in the optimistic-update *and* conflict-resolution decisions the constitution requires
  be recorded individually.

### Offline — the `interface-evolution-for-offline-data` question, now concrete

002 caches nothing and says so honestly on every conference-scoped surface. A personal schedule that
cannot be read in a venue basement has failed at the one moment it exists for.

#### A: Cache the programme, saves and notes; reads work, writes refused — **chosen**

- Pros: one cache per active conference. Offline reads show a staleness stamp. Save, unsave and note
  edits are refused offline with a clear message **rather than queued**, so there is no write queue,
  no optimistic update and no conflict resolution. Closes the inbox item with a decision instead of
  deferring it a third time.
- Cons: introduces a cache layer the roadmap did not scope into this phase.

#### B: Cache only saved sessions

- Pros: smaller surface.
- Cons: any unsaved session's detail panel fails offline, and browsing the programme to decide what
  to save — the main reason to look — does not work. More per-session logic for less benefit.

#### C: Cache nothing, as 002 does

- Pros: perfectly consistent with shipped behaviour; adds no new decisions.
- Cons: leaves the register question open for a third phase, and the feature is unusable exactly
  where conferences have the worst signal.

#### D: Full offline with a write queue

- Pros: best experience by a distance.
- Cons: requires both the optimistic-update and conflict-resolution decisions, on top of everything
  else 005 now carries.

### Repeated reads of the same programme — `home-card-duplicate-reads`

#### A: Serve repeat reads from the per-conference cache — **chosen**

- Pros: the cache built for offline also answers repeat reads. Every card still calls the repository
  independently and knows nothing about other cards, so **FR-164 holds unchanged** — but identical
  reads are parsed and sorted once rather than once per caller. The inbox item's goal, obtained as a
  side effect of a decision already made.
- Cons: the sharing is real but implicit in the cache rather than stated in the contract.

#### B: Accept the duplication

- Pros: transport-level coalescing already collapses the duplicate wire request, and this is not a
  measured problem.
- Cons: leaves the item open for a fourth phase, and the cost grows with every conference-scoped
  card 006–009 adds.

#### C: Amend FR-164 to permit a shared data source

- Pros: more honest about what is happening.
- Cons: reopens the contract 002 spent the phase establishing, and weakens the independence
  guarantee that keeps one failing card from blanking Home.

### Delivery shape

005 is larger than the roadmap scoped it, because the offline and shared-read decisions add a cache
layer that was not in its plan.

#### A: One phase, one pull request — **chosen**

- Pros: 002 did this and it worked, reaffirmed three times there. The cache layer is what makes the
  saves and the reads correct, so splitting it out ships a half-feature.
- Cons: a large review again; and because `develop` is squash-merge only, internal commit boundaries
  do not survive into it — the same limitation 002 recorded.

#### B: Two pull requests, split at the notes seam

- Pros: puts the only personal-data surface in its own review, where the declared retention limit
  gets read on its own terms.
- Cons: two review cycles on one phase.

#### C: Narrow 005 back to the roadmap's scope

- Cons: reverses the offline and shared-read decisions and defers both inbox items again.

#### D: Land the cache layer first, as its own change

- Cons: an infrastructure pull request with no user-visible feature, on a branch whose CI has never
  run.

## Decision

005 delivers the personalised Agenda as **one phase in one squash-merged pull request**, comprising:

1. **Saved sessions** on their own repository interface — never on `CatalogRepository`, which stays
   read-only in perpetuity.
2. **Agenda keeps the full programme** with an **All / Saved filter** defaulting to All and a
   per-row save toggle, following the approved prototype rather than becoming a saved-only screen.
   `No saved sessions yet` is the Saved-filter empty state.
3. **A session detail panel at `/agenda/<sessionId>`**, rendered as an overlay at every width, with
   Overview, Speaker info and personal Notes — plus Escape handling and a real focus trap, which the
   register lists as settled requirements the prototype failed to meet.
4. **Notes autosaved on pause, non-optimistically**, with visible *Saving… / Saved / Couldn't save*
   status.
5. **Its own Home card**, leaving `UpNext.tsx` untouched. This departs from the roadmap's card
   column and the specification must say so.
6. **A per-conference cache** serving both offline reads and repeat reads. Offline reads carry a
   staleness stamp; offline writes are refused with a clear message, never queued.
7. **A narrow, declared retention commitment**: notes and saves are deleted with the account, and no
   export path ships in 005. The full obligation is still settled before 004.
8. **`destination-owns-its-element`**, folded in: an optional `element` moves onto the `Destination`
   entry, so the router's `path === '/agenda'` special-case becomes an append on Agenda's own line.
   The new `/agenda/<sessionId>` route needs this anyway.

Reserved migration `0004`. Under standing decision 7 both new tables are **per-event**, because they
reference per-event sessions — the specification must state this and its reasoning per table.

## Key Requirements

- Saved sessions are durable, per-attendee, per-event server-side state, scoped by identity **and**
  by the branded `EventScope` predicate 002 established. A route declaring an event parameter
  without the guard fails the route audit.
- Agenda shows the whole programme by default, grouped into venue-local days as it does today, with
  a filter for saved sessions only.
- Every session row carries a save control with an accessible label reflecting its state, a visible
  focus state and keyboard operation.
- The detail panel is addressable, closes on Escape, traps focus while open, and returns focus to
  the control that opened it.
- Notes are private to their author, autosaved without an explicit action, and never silently lost.
- Empty states: no saved sessions → an invitation to explore; no published programme → the existing
  002 state, unchanged.
- Offline: the active conference's programme, saved set and notes are readable with an explicit
  staleness stamp; writes are refused with a message distinguishing "no connection" from a server
  fault, as 002 already distinguishes them.
- 002's US2 scenario 6 asserts the absence of a save control on Agenda. 005 changes a shipped test,
  not only application code, and the specification must call that out rather than letting it surface
  as a surprise failure.
- Discharges from the `requirements.md` validation checklist: **session save, personal notes,
  keyboard focus visibility**.
- Explicitly **not** in 005: audience Q&A (009 adds a tab to this panel), any organizer-facing
  write path to the catalog, any notification of an upcoming saved session.

## Open Questions

- **Client validation of desktop and tablet layouts.** Open since 001 and escalated by 002, which
  built both Home and Agenda at widths the client has never reviewed. 005 adds a detail panel and a
  filter to those same widths, so the cost compounds again. The roadmap's gate has already fired.
- **The full data retention, deletion and export obligation.** 005 declares a narrow commitment;
  the whole question still needs a client decision before 004.
- **How long a cached programme may be shown before it is refused rather than stamped.** The
  staleness *stamp* is decided; an upper bound on staleness is not. A programme cached a week ago is
  probably worse than no programme.
- **Whether a saved session should be removable from the detail panel as well as the row**, or
  whether one save affordance per session is clearer. A presentation question for the spec phase.
- **Whether the two next-session cards on Home need any relationship at all.** 005's card and 002's
  `UpNext` can legitimately disagree — the attendee's saved 11:00 talk versus the programme's
  id-first 11:00 talk. Decision 9 says they are independent; whether that reads as *composed* or as
  *contradictory* on the first viewport is worth looking at once both are on screen.
- **The arbitrary tie-break in `nextSession()` remains** on the generic Up next card. 005 works
  around it rather than fixing it. If it proves confusing in use, approach B above — preference
  through `contract.ts` — is the recorded alternative.
