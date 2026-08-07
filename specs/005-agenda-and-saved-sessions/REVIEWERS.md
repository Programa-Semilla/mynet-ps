# Review Guide: Agenda and Saved Sessions

**Generated**: 2026-08-07 | **Spec**: [spec.md](spec.md) | **Constitution**: v2.2.0

> **Read this first — three things will look wrong if you review them against the wrong document.**
>
> 1. **This feature departs from the delivery roadmap in two ways**, both recorded in the spec's
>    *Departure* table. The roadmap assigns 005 the Home contribution *"Up-next prefers saved
>    sessions"*; this feature contributes **its own card** and leaves `UpNext` untouched, because
>    that phrasing means editing another feature's card and standing decision 9 forbids it. It also
>    carries a **per-conference cache** the roadmap did not scope here.
> 2. **It changes a test that 002 deliberately shipped.** 002's US2 scenario 6 asserts the *absence*
>    of a save control on Agenda. FR-236 supersedes it. A changed assertion there is planned work,
>    not a regression.
> 3. **It ships under a recorded governance breach.** Constitution register entry 17 — see *Areas
>    Needing Attention*. Do not approve the merge without reading it.

## Why This Change

002 shipped the conference programme, and shipped it **deliberately read-only** — with a
load-bearing comment in `Agenda.tsx` saying so and an acceptance test asserting no save control
exists, on the reasoning that a greyed-out star is an affordance for a capability that doesn't.

So Agenda today carries the conference but not the person. `requirements.md` calls it *"the
personalized schedule"* and lists session browsing and agenda management as distinct capabilities;
002 delivered the first and this delivers the second.

There is a sharper reason too. The seeded programme already contains **two sessions starting at
11:00** on day one of the second conference, and Home's "Up next" breaks that tie by session
identifier — deterministic, but arbitrary as a *choice*. On any parallel-track conference the first
viewport already features a session for a reason the attendee cannot see. Saved state is what makes
"what is happening next" answerable about *them*.

## What Changes

An attendee marks the sessions they intend to attend and can filter Agenda to just those. They open
a session to read what it is about and who is speaking, at an address they can return to and close
with the Back button. They keep private notes against a session, saved without ever pressing save.
Home gains a card naming their next saved session. And all of it is **readable with no signal**,
stamped with when it was fetched.

Underneath: two per-event tables behind migration `0004`, a repository of their own — never the
catalog's — five endpoints all under the conference scope guard, and a cache at the repository
boundary.

**Breaking changes**: none to behaviour. One shipped *test* changes (FR-236) and one load-bearing
comment is replaced (FR-237), both named in the spec.

**New personal data**: yes, and it is the product's first attendee-authored free text. See *Areas
Needing Attention*.

## How It Works

**Saved sessions and notes are not on the catalog.** `CatalogRepository` is declared read-only in
perpetuity — *"no method creates, updates or deletes anything here, and none ever may"* — because a
catalog write is organizer administration, which Principle III excludes. These are *attendee state
about conference content*, so they get their own interfaces. **T084 guards this by test**, because
the natural mistake for a later contributor is to add `saveSession` where the sessions already live.

**Authorization is 002's mechanism, unchanged.** Every query function takes the branded `EventScope`
that only `requireEventAccess` can construct, so a handler that skipped verification has nothing to
pass and does not compile. Every write folds the session-belongs-to-this-conference check into the
statement itself rather than reading first — a separate read is both a race and a way to make "does
not exist" distinguishable from "you may not", which FR-231 forbids.

**The panel is a native `<dialog>` with `showModal()`**, as a nested route under Agenda. The platform
supplies the focus trap, background inertness and Escape — deliberately, because the register lists
Escape and focus as *settled requirements the prototype failed to meet*, and getting them from the
platform is the least likely route to failing them twice. Nesting keeps the programme mounted
behind, so Back closes the panel rather than leaving the destination.

**Notes autosave non-optimistically.** 1200 ms after typing stops, then write; the status enters
*Saved* **only from a resolved response**. That is the whole design constraint — an optimistic
version would incur the optimistic-update *and* conflict-resolution decisions the constitution
requires be recorded separately.

**The cache is a decorator over the repositories**, keyed `(attendeeId, eventId, resource)`, entries
expiring at 24 hours. Nothing above it knows it exists.

## When It Applies

**Applies when** an attendee is signed in and has an active conference: on Agenda at every width, on
the session panel, and on Home through this feature's single card. Offline, it applies to any
conference whose content has been read within the last 24 hours.

**Does not apply when**:

- The attendee is offline and has never read that conference — they are told a connection is needed
  and nothing is cached, rather than shown an empty programme.
- A write is attempted offline — refused with an explanation, **never queued**, never shown as
  succeeded.
- The session named by an address is outside their active conference — refused without disclosing
  whether it exists.

**Deferred deliberately**: audience Q&A (009 adds a section to this panel), any notification of an
upcoming saved session, exporting saves or notes, and sharing either with another attendee.

## Key Decisions

1. **005 contributes its own Home card; `UpNext` is untouched.** Alternatives: extend `contract.ts`
   so preference is data-driven (the path `registry.ts` itself names as sanctioned); edit `UpNext`
   directly; drop the Home contribution. Chosen because decision 9 is ratified governance and the
   roadmap is a plan — and because taking it literally would set the precedent that the card column
   beats decision 9 for the five features after this. **Accepted cost**: the generic Up next keeps
   its arbitrary tie-break, and Home can show two next-session cards that disagree.
2. **A cache, at the repository boundary.** Alternatives: cache nothing as 002 does; a query library;
   a service-worker response cache. Chosen because a decorator keeps Principle V intact and makes the
   offline path and the repeat-read path the same code. A response cache was rejected specifically
   because repeat readers would still re-parse and re-sort — the cost the inbox entry says transport
   coalescing does *not* fix.
3. **IndexedDB, behind a platform interface.** `SecureStorage` is forbidden by the constitution as a
   general cache; `localStorage` is synchronous and too small for a 500-session programme.
4. **24-hour cache lifetime.** Originally deferred to an open question; the spec review found that
   deferral was both a governance failure (the constitution requires "for how long" specified per
   feature) *and* an authorization hole — see *Areas Needing Attention*.
5. **`PUT`/`DELETE` on the pairing's own address.** Idempotency comes from the method, so a
   double-tap on a slow connection is simply the same request twice.
6. **One squash-merged PR.** Reaffirmed in brainstorm #03 against the concrete task list, alongside
   a two-PR split at the notes seam.

## Areas Needing Attention

**1. Does FR-164 genuinely survive the cache?** This is the question worth the most of your review
time. The composition contract says no card may depend on another card's presence or data, and a
shared cache is exactly the thing that could quietly break it. The design keeps each caller on its
**own promise**, so one card's rejection cannot fail another, and removing any card leaves the
others working. **T058 and T078 test it, SC-212 states it.** If you think the implementation
couples two cards' fates — through a shared in-flight rejection, a shared retry, or a shared error
object — say so; that is the failure this whole contract exists to prevent.

**2. The retention commitment is narrow, and it stands in for an obligation nobody has answered.**
Register entry 6 recorded that retention/deletion/export blocks *004*, "the first to store
substantial personal data". 004 is not running first — **this is**, and personal notes are more
open-ended than anything a profile form collects. Rather than stall the only unblocked phase, 005
commits to what it can honour now: **notes and saves are deleted with the account** (an
`ON DELETE CASCADE`, so it cannot be forgotten), and **no export path ships**. Principle VIII
permits this — it requires such an absence be *recorded*, which Open Question 2 does. **Constitution
v2.2.0 corrected entry 6 to say so.** If you think a narrow commitment is not good enough here, this
is the place to argue it.

**3. FR-236 changes a test 002 shipped on purpose.** The absence of a save control was asserted, not
overlooked. T023 **updates rather than deletes** it, so history records that the absence was
deliberate and is now deliberately ended. A reviewer seeing a changed assertion in
`agenda.test.tsx` should read it as intent, not drift.

**4. ⚠ The isolation suite that proves the personal-data guarantees is in the CI layer that does not
run.** `NEON_API_KEY` is unset, so `db-branch` fails and `migrations`, `test-integration`,
`test-e2e`, `test-accessibility` and `deploy-api` all **skip**. T069–T071 — attendee isolation,
conference isolation, deletion cascade — live in `test-integration`. **Under Principle VII as
amended in v2.2.0, a check that did not run has not passed**, and register entry 17 requires this
waived or closed *before 005 merges*. T093 is the task that stops the merge. Do not treat a green
subset as a green pipeline.

**5. One address now names a session**, where 002 established that destination addresses stay
conference-neutral. A session identifier cannot be conference-neutral. FR-204 handles the
cross-conference case explicitly rather than leaving it to discovery, but it is a real narrowing of
002's rule and is called out in the spec's scope note.

**6. Four files outside this feature's own directories are edited**: `navigation.ts` and
`routes.tsx` (FR-233, which *removes* a special case that four later features would each have
extended — a net reduction in shared-file contention), plus `Agenda.tsx` and
`SessionPresentation.tsx`, which 002 built expressly for 005 to extend.

## Open Questions

Recorded rather than resolved, per Principle I. None blocks implementation.

1. **Client validation of desktop and tablet layouts** — open since 001, escalated again here.
2. **The full retention, deletion and export obligation** — still blocks 004.
3. **Whether 24 hours is the right cache lifetime** — a value is set; only its correctness is open.
4. **Whether a session should be unsavable from the panel as well as its row.**
5. **Whether the two next-session cards on Home need any relationship** — worth looking at once both
   are on screen.
6. **The arbitrary tie-break in `nextSession()` survives** on the generic Up next card.

## Review Checklist

- [ ] **FR-164 survives the cache** — cards independently failable; no shared rejection or retry
- [ ] `CatalogRepository` gained no create, update or delete method (T084 guards it)
- [ ] Every new route nests under `:eventId`, carries both guards, and declares a `schema` block
- [ ] The route audit **runs** (not skips) and passes
- [ ] Note status never reads *Saved* before the server confirms
- [ ] Offline writes are refused, not queued, and never shown as succeeded
- [ ] Cache keys include the attendee — a second sign-in on one device reads nothing of the first's
- [ ] `home/registry.ts` changed by **exactly one appended line**; no other card's file touched
- [ ] Escape closes the panel, focus is trapped while open, and returns to the opening control
- [ ] No horizontal scrolling at 320 px on Agenda, the filter, or the panel
- [ ] Migration `0004` is not renamed; `0005` still free for 006
- [ ] Every Feature Declarations row traces to at least one task
- [ ] **The CI position is waived or closed** (register entry 17) before merge
