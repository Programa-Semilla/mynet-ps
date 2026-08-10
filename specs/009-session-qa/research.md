# Phase 0 Research: Session Q&A

**Feature**: 009 — Session Q&A · **Date**: 2026-08-10 · **Spec**:
[spec.md](./spec.md)

Every decision below resolves something the specification left open, or something the Technical
Context could not state without looking. Each names what was rejected, because the rejected option
is what the next reader would otherwise try.

---

## R1 — The cache classification (spec Open Question 2)

**Decision: the Q&A repository is NOT decorated with `cached` at all**, and the refusal is written
beside the member in `apps/web/src/app/services.ts` rather than achieved by leaving a line out.

**Rationale.** The composition root already has exactly this pattern four times over — 004's
`profile`, 006's `directory`, 007's five members, 008's `cards` — each with the reason written in
place, because "no cache" and "nobody got round to it" look identical in a composition root. Q&A
earns it on 006's and 007's grounds unchanged: a question is **another attendee's name and words**,
and the decorator revokes on **age alone**, which is the wrong clock for content its author may have
withdrawn a second ago. A vote count is worse — it is a live number that is wrong the moment it is
stored, and the staleness stamp answers "when did this device last receive this", which is honest
about the retrieval and silent about the number.

An undecorated repository is not touched by the Proxy at all, so **FR-755 and FR-757 are satisfied
structurally rather than by classification**: there is no `reads` map to omit a read from, no write
branch to fall into, and no `args[0]` to be misread as an event id. 008's defect is not merely
avoided here — it is unreachable.

**Alternatives considered:**

- *Decorate with `reads: {}` and every method in `passThrough`.* Functionally identical to not
  decorating, and strictly worse: it adds a Proxy that does nothing, and it invites a later reader
  to "fix" the empty `reads` map.
- *Decorate and leave writes unclassified.* Purges the whole conference prefix on every question and
  **every upvote**, dropping the attendee's offline programme for a single vote. Violates FR-756.
- *Add a `purgeOnRefusalOnly` classification to the decorator.* This is what the specification
  guessed the answer would be, and it is **rejected** — see the finding below.

### FR-756a is NOT met, and the plan recommends withdrawing it

This is stated plainly rather than buried, because it is a requirement the specification carries as
a `MUST`.

FR-756a requires a **refused** Q&A action to purge the conference, on the reasoning that a refusal
invalidates the cache immediately. Not decorating means no Q&A refusal purges anything.

Meeting it would require a new decorator classification, and the argument against building one is
not cost — it is about **whose responsibility it is**. The refusal purge exists so that a decorated
repository's *own* cached resource stops being served once the server begins refusing it. Q&A caches
nothing, so what FR-756a actually asks is for Q&A to purge **other features'** caches on its
behalf — a cross-feature responsibility **no other undecorated repository in this product has**.
Messages, Discover, cards and profile all refuse without purging, and have since they shipped.

The underlying gap is real but is neither new nor 009's: **a cached conference can outlive a
withdrawn registration by up to 24 hours** if nothing decorated is written in the meantime. It is
product-wide, it predates this feature, and closing it inside 009 would fix it for Q&A alone while
leaving Messages, Discover and Network exactly as they are.

**Recommendation:** withdraw FR-756a from the specification and record the underlying gap as an
Open Questions Register entry against 010. Attempting it here produces the worst outcome — a new
mechanism in a shared file, exercising one feature's writes, that leaves the actual hole open.

---

## R2 — Two dialogs opening inside a modal panel (spec Open Question 3)

**Decision: nest.** Both the withdrawal confirmation and the report dialog open as their own
`<dialog>` with `showModal()`, on top of the session panel, which is itself a modal dialog. Neither
is reimplemented, and neither becomes an inline region.

**Rationale.** The top layer is a **stack**, not a slot: a second `showModal()` pushes onto it, the
browser renders it above, and **Escape dismisses the topmost dialog only**. That gives the correct
behaviour for free — Escape closes the confirmation and leaves the panel open — and it is the same
platform guarantee 005 relied on for the panel itself.

Two consequences must be handled explicitly, and both are 005's lessons one level down:

1. **The panel is inert while the inner dialog is open.** So focus restoration to a control *inside
   the panel* must happen **after** the inner dialog closes, never before — an inert element cannot
   take focus, the call silently succeeds, and a keyboard reader is returned to the top of the
   document. 005 wrote this reasoning into `SessionPanel.tsx`; it applies unchanged.
2. **The panel's `onCancel` must not fire for the inner dialog's Escape.** It will not, because the
   event targets the topmost dialog — but the panel's handler calls `navigate('..')`, so if this is
   ever wrong the panel closes and the address changes when the attendee meant to dismiss a
   confirmation. This is asserted rather than assumed.

**This must be verified in a browser, not in jsdom.** jsdom applies no user-agent stylesheet and has
no top layer; it is precisely the environment in which 005's `max-w-full` defect and 008's
`ScheduleDialog` mispositioning were invisible.

**Alternatives considered:**

- *An inline confirmation region inside the panel.* Loses the focus trap and Escape the platform
  gives, and re-implements them by hand — the exact thing Principle IV's rationale warns about.
- *Close the panel, confirm, reopen.* Changes the address twice and loses the reader's place.

---

## R3 — Composing the fourth panel section (spec Open Question 4)

**Decision: edit `apps/web/src/app/agenda/SessionPanel.tsx` directly — one line inside `PanelBody`,
appended after `PanelNotes`. Do NOT convert the panel to a registry.**

**Rationale.** Converting it would be a *larger* edit to 005's file than adding the line, in service
of a future contributor the roadmap says does not exist — 009 is the last feature. The append-only
rule exists so a feature is never *required* to edit a neighbour's file; here the edit is one line
in a list of four, and the section owns its own file exactly as `PanelNotes` does.

`key={session.id}` is applied for the same reason 005 applies it to `PanelNotes`: switching sessions
must give the section a fresh controller rather than carrying one session's draft question into
another's (FR-751).

**Alternative considered:** a `panel/registry.ts` mirroring `home/registry.ts`. Correct in principle,
speculative in fact. Recorded so 010 can revisit it if the panel ever gains a fifth section.

---

## R4 — Where the reused report dialog lives (spec Open Question 5)

**Decision: move `ReportDialog.tsx` from `apps/web/src/app/messages/` to
`apps/web/src/app/safety/`, and update 007's single import.**

**Rationale.** It has exactly one importer today (`messages/Thread.tsx`), so the move is one file and
one import line. Its props are already destination-agnostic — a reported attendee and an optional
list of item identifiers — so nothing about it is specific to a thread. Leaving it where it is and
importing `../messages/ReportDialog.js` from inside `agenda/` would make Agenda depend on Messages
for no reason a reader could reconstruct, and it is the kind of import that becomes a cycle later.

`safety/` is chosen over `shared/` because reporting and blocking are one concern and 007 already
treats them as one action; a later move of the block controls has somewhere obvious to go.

**Alternative considered:** import across destinations without moving. Cheaper by one file, and
leaves the codebase saying that reporting belongs to Messages, which is exactly what FR-781 stops
being true.

---

## R5 — Immediate update, deterministic order, and focus (spec Open Question 6)

**Decision: a Q&A write returns the full, freshly-ordered list, and the client replaces its state
with it. Rows are keyed on the question id so React reuses the DOM node when a question moves.**

**Rationale.** This satisfies all three constraints at once, which neither of the specification's two
candidates does alone:

- **FR-730** (the reader's own action updates immediately) — the response *is* the new state, so
  there is no second request and no interval where the count is wrong.
- **FR-726** (deterministic order) — the order comes from the server's `ORDER BY`, so it is the same
  ordering every other reader sees. A local re-sort would have to reimplement the tiebreak and could
  drift from it silently.
- **FR-780** (a count that changes must not move focus) — **reordering does not blur a focused
  element**. Focus is lost when the focused node is *unmounted*, not when it is moved. With a stable
  `key`, React reorders the existing DOM nodes and the activated control stays focused as it moves.

The write returning its own read is the one place this feature departs from the "write, then re-read"
shape used elsewhere, and it is worth the departure: a re-read is a second round trip in which the
count can change again, and the second answer is what the attendee would see flicker into place.

**Alternative considered:** re-read after write. One more request, and it re-opens the focus question
because the list unmounts and remounts between the two responses.

---

## R6 — The list query

**Decision: one query per session, returning every question with its count, the reader's own voted
state, and the author's display name. No denormalised counter column.**

```
questions for a session
  ├─ count      : aggregate over question_votes
  ├─ votedByMe  : EXISTS over question_votes for the reader
  ├─ author     : join attendees for display_name
  ├─ filter     : NOT EXISTS bidirectional block (R7)
  └─ ORDER BY count DESC, asked_at ASC
```

**Rationale for no counter column.** It is a second source of truth for a number the rows already
answer, and the one that drifted would be the one displayed. 008 records the same reasoning for
`lapsed`, which is derived rather than stored. At the volumes this product sees — a session's
questions, bounded by its audience — an aggregate is not the expensive part of the request.

The author join reads `display_name` and **nothing else** (FR-737). It deliberately does **not** go
through the directory query, which applies three conditions this must not: discoverability,
verification, and event registration. This is the same shape as 008's card resolution, and it is
worth noticing that the *third* absence differs — a card resolves across events, whereas a question
is always read inside the event scope that already refused a non-registered reader.

---

## R7 — Block filtering

**Decision: a bidirectional `NOT EXISTS` against `attendee_blocks` inside the list query, mirroring
`apps/api/src/db/queries/cards.ts` exactly. Read-side only; no write, no cancellation.**

**Rationale.** 008 established both halves of this and this feature inherits them rather than
inventing: a card is severed **read-side** so lifting the block restores it with no repair path,
while an appointment is **cancelled** by a write because somebody would otherwise turn up. A
question is a thing on a page. Nobody turns up to it, so the read-side treatment is correct and
FR-786's reversibility comes free.

**The pair must never be ordered.** `attendee_blocks` rows are directional and A-blocks-B is a
different fact from B-blocks-A; the query asks whether *either* row exists. `queries/blocks.ts`
carries a warning about this that applies verbatim.

**This does not change any count** (FR-787). The filter removes rows from one reader's list; it does
not enter the aggregate, so every other reader's counts are untouched and a vote the blocker already
cast still counts.

---

## R8 — Throttling

**Decision: two new throttle actions, `question_ask` and `question_vote`, both `mayDeny: true`. Plus
one that is not 009's: `report_submit`.**

| Action | identifier | source | mayDeny | Reasoning |
|---|---|---|---|---|
| `question_ask` | 10 | 100 | yes | The tightest of the three. It publishes free text to a whole conference, so it is this feature's `card_share` — generous enough that a curious attendee at a keynote is never refused. |
| `question_vote` | 60 | 600 | yes | Loose by an order of magnitude. Voting is a single bit and a reader may work down a long list in one sitting; a throttle here exists to bound a script, not a person. |
| `report_submit` | 5 | 50 | yes | **Closes a gap 007 left, not one 009 opens.** |

All three are authenticated and keyed on the acting attendee's own identity, so a denial can only
ever fall on the person doing the thing — the same reasoning `join_code`, `export`, `card_share` and
`appointment_propose` are configured under, and what separates all of them from `reset_request`,
whose key is a *victim's* address.

**On `report_submit`.** Reporting is **not throttled today** — verified, there is no throttle call in
`apps/api/src/routes/reports.ts`. FR-746 requires it, and the justification is stronger than
symmetry: a report **dispatches operator mail**, so unlimited reports are unlimited mail to an
address a human is supposed to read, which is a spam vector aimed at the one safety channel the
product has. Blocking being unthrottled is harmless by comparison — it writes a row and tells nobody.

This is 009 changing a route 007 owns, and it is the **fourth** such edit (after `SessionPanel.tsx`,
the `abuse_reports` column, and the `ReportDialog` move). Recorded rather than slipped in.

---

## R9 — Migration `0008`, and one column on a neighbour's table

**Decision:** two new tables plus `abuse_reports.question_ids`, all in migration `0008`.

`question_ids uuid[] NOT NULL` mirrors `message_ids` exactly, **including its deliberate absence of a
foreign key**. The reasoning in `schema/reports.ts` transfers without modification: a reported
question will frequently be gone before anyone looks, `RESTRICT` would block a deletion the erasure
right requires, and `CASCADE` would silently empty the report while leaving the row — which reads as
"they reported nothing". An array degrades honestly into a list of things that no longer exist.

`abuse_reports` already has a 90-day sweep in `RETENTION_SWEEPS`, so the new column inherits a
retention rule rather than needing one.

**The generation dance is mandatory and easy to get wrong.** `apps/api/migrations/meta/README.md`
must be moved aside before `drizzle-kit generate` runs, because it JSON-parses every file in
`meta/`; and the journal's `0003`-before-`0004` ordering with a later timestamp is **deliberate** and
must not be "corrected".

---

## R10 — Question length: 500 characters

**Decision: 500, enforced in three places.** A `CHECK` constraint
(`length(trim(body)) > 0 AND length(body) <= 500`), the route schema, and the interface's disabled
post control plus remaining-allowance counter.

**Rationale.** Three layers because Principle VIII says client-side presentation of a limit is never
the enforcement of it, and `session_notes` establishes the pattern with its own two-sided check. 500
sits far below notes' 10,000 deliberately: a note is an essay to yourself, a question is one
sentence to a room, and a list of 2,000-character questions is not scannable.

The `trim` inside the lower bound is what makes FR-703's whitespace rule structural — a body of
spaces cannot exist as a row, so "no question" has exactly one representation.

---

## R11 — Seeding, and the re-seed cascade

**Decision: nothing in this feature is seeded** (FR-762), and **both tables cascade from `sessions`**
(FR-763).

The cascade is not a convenience. `DELETE FROM events` is how the seed clears itself, and 008 met
exactly this trap: `shared_cards.event_id` was `ON DELETE NO ACTION`, so a surviving card refused the
delete and broke the re-seed **with an error naming neither table**. A question referencing a session
with anything other than `CASCADE` would reproduce it precisely.

The empty state being what a reviewer sees at first run is deliberate, following 005: the states
most likely to be skipped are the ones on screen first.

---

## R12 — Route shape and the contract

**Decision:** every route under `/events/:eventId/…`, appended to `ROUTES` in
`apps/api/src/routes/index.ts`, in its own file `apps/api/src/routes/events/questions.ts`.

```
GET    /events/:eventId/sessions/:sessionId/questions
POST   /events/:eventId/sessions/:sessionId/questions
DELETE /events/:eventId/questions/:questionId
POST   /events/:eventId/questions/:questionId/vote
DELETE /events/:eventId/questions/:questionId/vote
```

Naming the event in **every** address is FR-742, and it is what lets the **existing**
`event-scope-audit` cover this feature with no fourth audit and no fourth branded scope. 007 needed
`ConversationScope` because a conversation is cross-event and has two owners; 008 needed `CardScope`
because a card names no conference. A question always belongs to a session and a session belongs to
exactly one event, so `EventScope` reaches it — provided the address says so, which is the whole
point of the constraint.

**Append to `ROUTES`, never insert.** The generated contract lists paths in observation order, so
reordering rewrites `contracts/openapi.json` for no behavioural reason. Every route carries a
`schema` block, or Swagger never observes it and `pnpm contract:check` cannot notice something it was
never offered.

---

## R13 — Phase split (spec Open Question 7)

**Decision: two phases.**

| Phase | Contents | Why the boundary is here |
|---|---|---|
| **A — Q&A** | Migration, both tables, repository and interface, the five routes, the panel section, ask/vote/withdraw/read, ordering, deletion, export, offline refusal | A complete, shippable, reviewable surface. Every acceptance scenario in US1–US4 passes at the end of it. |
| **B — Safety** | `report_submit` throttle, the `question_ids` column, the `ReportDialog` move, report-from-question, bidirectional block filtering | Touches three files other features own and is the half a reviewer should read as a unit. It is also the half added at spec review, so keeping it separate keeps the review honest about what was specified when. |

Phase B depends on Phase A's list query existing (the block filter goes into it) but on nothing else.
**Phase A must not merge claiming completeness** — US5 is unmet until B lands, and the specification's
own Success Criteria say so.

---

## What did NOT need research

- **Event scoping** — settled by the spec and by 005's identical reasoning for `saved_sessions`.
- **A branded scope** — R12 establishes none is needed, and that is an outcome rather than an open
  choice.
- **Notification behaviour** — the requirement is an absence, and the existing audit over
  `apps/api/src` enforces it without this feature doing anything at all.
- **Dialog centring** — already fixed at the base rule in `theme/tokens.css`. This feature adds no
  `m-auto` and no local patch, which is the whole point of that rule existing.
