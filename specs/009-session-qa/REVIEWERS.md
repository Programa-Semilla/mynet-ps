# Review Guide: Session Q&A — Audience Questions and Upvotes

**Generated**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Why This Change

`GroundZero/requirements.md` says the session detail panel supports "Audience questions and
upvoting". It is the **last unbuilt capability in the product** — the panel has Overview, Speakers
and Notes, and the Q&A section has never existed. Register entry 9, which asked whether questions are
attributed or anonymous, blocked this phase from being specced for the life of the project until the
owner closed it on 2026-08-10.

This is also the **last feature on the delivery roadmap**. After it, every destination
`requirements.md` names answers its question, and the last behavioural item on the whole-product
validation checklist is discharged.

## What Changes

An attendee can ask a question against any session in an event they are registered for, and every
other attendee at that event sees it **with the asker's name on it**. Anyone can upvote — one vote
each — and the list ranks by votes. An author can withdraw their own question **until somebody
upvotes it**, after which it stands. Deleting your account takes your questions with you, **and
takes other people's votes on them with it**. A question is reportable from the question itself,
which blocks its author and makes the two attendees invisible to each other in Q&A.

**No breaking changes.** Nothing existing behaves differently. One file is moved
(`ReportDialog.tsx`) with its single import updated, and one column is added to an existing table.

## How It Works

Two new tables — `session_questions` and `question_votes` — both **per-event**, reached through
`sessions`, with the event deliberately **not** denormalised. One query per session returns the whole
list: the vote count as an aggregate, the reader's own voted state, the author's display name, and a
bidirectional block filter. **No denormalised counter column** — it would be a second source of truth
for a number the rows already answer.

Five routes, all under `/events/:eventId/…`. This feature introduces **no new branded scope and no
new route audit**, because a question always belongs to one session in one event, so the existing
`EventScope` reaches it. Every write returns the **full re-ordered list**, which is what makes the
reader's own action update without a second round trip.

On the client, one new section on the existing session panel, one hook, and a repository that is
**never wrapped in the cache decorator at all**.

Delivered as **two PRs**: PR-A is everything except reporting; PR-B is the safety half.

## When It Applies

**Applies when**:

- An attendee is registered for the event a session belongs to — reading, asking, and voting are all
  inside that predicate.
- The session detail panel is open. There is no other surface: no Home card, no destination, no
  address of its own for a question.

**Does not apply when**:

- The reader is not registered for the event. The refusal is **indistinguishable** from a question
  that does not exist.
- Either attendee has blocked the other — each is invisible to the other in Q&A, read-side and
  reversibly.
- Anything an organizer would do. No answers, no "answered" marker, no pinning, no moderation — the
  actor Principle III excludes by construction.

## Key Decisions

1. **A departing attendee's question is deleted, and other people's votes go with it.** Alternatives
   were keeping the text de-attributed, or keeping it only when voted. Chosen because Principle VIII
   says hard deletion with no tombstone, and the only content in a question is the departing
   attendee's own words — unlike 007's conversations, where the survivor keeps *their* words. **The
   cost is real and is stated rather than glossed**: a session can lose a well-upvoted question.

2. **A question is withdrawable until its first vote.** 007 refused message deletion outright.
   Diverged deliberately: a message goes to one person, a question is published under your name to a
   whole room, and without this the only retraction is deleting your account. The vote is the cut-off
   because withdrawing after somebody backs you destroys their record, not only yours.

3. **Attribution is unconditional, including for a non-discoverable attendee.** Follows 008's rule
   that discoverability governs being *found*, not being *remembered*. **Consequence, stated
   plainly**: a hidden attendee's name appears to every co-attendee while their profile still
   refuses to open.

4. **Report-from-question was added at spec review, not specified up front.** The review verified
   that `ReportDialog` had exactly one importer, so reporting an abusive question would have required
   opening a conversation with its author first. Alternatives were declaring the gap, or hiding
   blocked questions without a report path. Chosen because Q&A is the product's first unmoderated
   many-to-many surface.

5. **The Q&A repository is not decorated with the cache at all.** Follows 006, 007 and 008 rather
   than 005. A vote count is a live number that is wrong the moment it is stored, and a question is
   another person's words. **This also makes two requirements structural rather than declared**:
   with no Proxy there is no `reads` map to omit from and no `args[0]` to be misread as an event id,
   so 008's cache defect is unreachable here rather than merely avoided.

6. **A write returns its own read.** The alternative was write-then-re-read. Chosen because it
   satisfies immediate update, server-side deterministic ordering, and focus preservation at once —
   and because a re-read is a second round trip in which the count can change again.

## Areas Needing Attention

**Two modal dialogs now open inside an already-modal panel.** The session panel is a `<dialog>` with
`showModal()`; the withdrawal confirmation and the report dialog each open on top of it. 007
deliberately avoided stacking by reusing `ConfirmDialog` rather than nesting. The top layer is a
stack so Escape should dismiss only the topmost — but the panel is **inert** while an inner dialog is
open, so focus restoration must happen *after* closing. **This cannot be verified in jsdom**, and it
is the single most likely place for a defect that every automated gate passes.

**Focus when a row reorders after a vote.** The design relies on React reusing the DOM node via a
stable `key`, so the focused control moves rather than unmounting. If that reasoning is wrong, every
upvote throws a keyboard user back to the top of the panel. T082 asserts it in a browser.

**Error classification by `error.code`, never by class.** `ApiError extends RequestRefusedError` and
every non-2xx throws `ApiError`, so an `instanceof` check catches 400, 404, 429 and 500 alike. In 008
this rendered the reasonless refusal for all of them and swallowed every message the routes were
written to deliver. This feature has **two** refusals that exist to be read, so the same mistake makes
both invisible. Added as T043a during plan review — it had no task at all until then.

**Four files belonging to other features are edited.** `SessionPanel.tsx` (005, one line — the panel
is deliberately *not* converted to a registry), `schema/reports.ts` and `routes/reports.ts` (007),
and `Thread.tsx` (007, one import from the dialog move). Each is named rather than left for a
reviewer to discover.

**`report_submit` throttling closes a gap 007 left, not one 009 opens.** Reporting is unthrottled
today and dispatches operator mail, so unthrottled reports are unthrottled mail to the product's only
safety channel. Reasonable to argue this belongs in its own change.

**Deliberate deviation, in plan.md Complexity Tracking: FR-756a is not met.** A refused Q&A action
does not purge the conference cache. Meeting it would give Q&A a cross-feature responsibility no
other undecorated repository has. **The plan recommends withdrawing the requirement**, and T003 puts
that to the owner before implementation.

## Open Questions

**Two gate implementation and must be closed before the first line of code:**

1. **The constitution amendment** recording public Q&A visibility as a **third exception** to
   Principle VIII's "private content stays private". Principle VIII requires an exception to be
   *recorded*, not entailed, and both existing exceptions were recorded by amendment. Decided at spec
   review: an amendment is required. Planning proceeded; implementation may not. (T001, T002)

2. **Whether FR-756a is withdrawn**, per the deviation above. Implementing against an unresolved
   `MUST` is what T003 exists to prevent.

**Four are planning-level and block nothing**: where the reused report dialog lives, whether the
panel should become a registry, nested-dialog behaviour to be confirmed in a browser, and whether the
two-PR split holds against the concrete task list.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **The constitution amendment is present in this PR and acceptable** — nothing here is licensed
      by an amendment a reviewer has not accepted
- [ ] **The FR-756a recommendation has been answered**, not carried forward silently
- [ ] Migration `0008` matches the reserved number, and the journal's deliberate `0003`/`0004`
      ordering is untouched
- [ ] Every route names `:eventId` — a route naming no conference passes the existing audit silently
- [ ] `notification-triggers`, `no-report-read-surface`, `deletion-coverage` and `export-coverage`
      all pass **unmodified**
- [ ] No dialog re-patches centring locally; `theme/tokens.css` owns it
- [ ] The four edits to other features' files are each minimal and intended

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
