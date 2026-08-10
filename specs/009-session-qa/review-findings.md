# 009 — Code review against the specification

**Spec**: [spec.md](./spec.md) · **Date**: 2026-08-10 · **Reviewer**: `speckit.spex-gates.review-code`

## Compliance summary

**89 of 89 in-force requirements implemented — 100%.**

| Group | In force | Compliant |
|---|---|---|
| Functional requirements (FR-701–FR-787) | 89 | 89 |
| Withdrawn by owner decision (FR-756a) | — | n/a |
| Success criteria (SC-701–SC-715) | 17 | 17 |

**FR-756a is withdrawn, not unmet.** The owner accepted the plan's recommendation on 2026-08-10
(tasks.md T003): a refused Q&A action does not purge the conference cache, because meeting it would
give one feature a cross-feature responsibility no other undecorated repository has. The conceded
gap — a cached conference outliving a withdrawn registration by up to 24 hours — is **register
entry 22** against 010, and is product-wide rather than 009's.

## Gate output, not inspection

`pnpm verify` — **exit 0**, all ten gates:

| Gate | Result |
|---|---|
| typecheck | clean, five packages |
| lint | clean at `--max-warnings=0` |
| format | clean |
| unit | **416 passed**, 45 files |
| component | **554 passed**, 56 files |
| contract | up to date |
| integration | **897 passed**, 103 files |
| build | production build |
| asset budget | 96.4 KB of 150 KB |
| e2e | **141 passed** |

## Requirements with no identifier citation in source

Ten requirements are implemented but not cited by identifier in a comment. Each was checked
against the code rather than assumed, because an uncited requirement is exactly where a gap hides.

| Requirement | Where it is satisfied | Evidence |
|---|---|---|
| FR-711 withdraw only while unvoted | `db/queries/questions.ts` `withdrawQuestion` | `questions-withdraw.test.ts` — succeeds unvoted, 403 once voted |
| FR-716 removed for every reader, no tombstone | same | same file — asserted from a second account |
| FR-733 visible to every registered attendee and nobody else | list query + `requireEventAccess` | `questions-ask.test.ts` — the crossing, and four indistinguishable refusals |
| FR-749 own file, one-line composition | `agenda/PanelQuestions.tsx`; one element in `SessionPanel.tsx` | the diff |
| FR-750 no question gets an address | no client route added | `qa-absences.test.ts` — `DESTINATIONS` still 5; no question route in `routes.tsx` |
| FR-756a | **withdrawn** | spec.md, tasks.md T003, register entry 22 |
| FR-758 writes refused offline, never queued | undecorated repository + `HttpClient` | `panel-questions-errors.test.tsx` offline case; no queue exists to fall into |
| FR-766 no notification dispatched | absence | `notification-triggers.test.ts` passes **unmodified** (`git diff` empty) |
| FR-778 Escape dismisses, focus restored after closing | `ConfirmDialog` | `e2e/session-qa.spec.ts` Escape test |
| FR-779 centred by the base rule, no local patch | `theme/tokens.css` | `panel-questions-vote.test.tsx` asserts no `m-auto`; e2e measures centring at 390/900/1440 |

## Deviations from the planning artifacts

Three, each recorded where it was made rather than only here.

1. **`useSessionQuestions`'s writes resolve to `Promise<boolean>`, not `Promise<void>`.**
   tasks.md's Interfaces block sketched `void`, on the assumption that a caller could read `error`
   afterwards. It cannot: a handler closes over the `error` value from the render that created it,
   which is `null` because the write has not failed yet — so **every** outcome looked like success
   and a refused post destroyed the attendee's typed question. Method names and arguments are
   unchanged; only the fulfilment value narrows.

2. **Withdrawal answers `200` with the re-ordered list, not `204`. RESOLVED — the owner kept the
   `200` at the code-review gate on 2026-08-10, and `contracts/questions.md` is corrected.**
   `contracts/questions.md` contradicts itself: its Writes preamble says "all four write routes
   return the full re-ordered list", and the `DELETE` block then says `204 → no content`. The
   preamble, tasks.md's Interfaces block and research R5 all agree on the list; the lone `204` is
   the outlier, and a `204` would force the second round trip R5 exists to remove. **This is worth
   an explicit owner confirmation** — it is the one place implementation chose between two
   statements in the same document — and the owner has now confirmed which.

3. **`event-scope-audit`'s conference-content predicate was narrowed.**
   It matched any path *containing* `/sessions`, so it flagged `POST …/sessions/:id/questions` — a
   write to attendee state about conference content, which is 005's distinction. It now asks what
   a path *addresses*. The narrowing is checked against a table of paths that must still be
   caught, so the guard cannot silently stop guarding.

## Defects found during implementation

Four, all fixed. Listed because each is the shape of mistake the next feature would repeat, and
three were findable only by a test written for the purpose.

1. **PostgreSQL `trim()` strips spaces only.** `length(trim(body)) > 0` accepted `"\n\t \n"` while
   the route — using JavaScript's Unicode-aware `trim` — refused it. The two layers disagreed and
   the weaker one was the last line of defence. Found by `questions-validation.test.ts` driving the
   column with the route bypassed. Now `btrim(body, E' \t\n\r')`.
2. **Stale closure over hook state.** See deviation 1 above.
3. **A late success wiped text typed since.** The field cleared unconditionally on the response, so
   an attendee starting their next question while the first was in flight lost it. Now clears only
   if the field still holds what was posted.
4. **React delivers a nested dialog's `cancel` to ancestor handlers, and research R2 predicted the
   opposite.** R2 said the platform sends `cancel` to the topmost dialog alone and that the point
   was worth asserting rather than assuming — the assertion found the reasoning wrong. One Escape
   closed the confirmation **and** the panel, changing the address. `SessionPanel` now compares
   `event.target` against its own dialog.

Two further defects were in the generated migration and were caught by hand review (T012):
`ADD COLUMN … NOT NULL` with no default, which fails on any database already holding a report; and
the regeneration silently dropping that fix, which is now warned about in the file.

## Extra behaviour not named by the spec

- **The question list carries an accessible name** (`aria-label="Questions, most upvoted first"`).
  Added so a screen-reader user is told how the list is ordered — the ordering is the point of
  upvoting and is not otherwise perceivable without reading every count. Not scope creep; it is
  FR-777's accessibility obligation applied to the list element.
- **`writeReport` accepts `questionIds` with an empty default.** The column ships in `0008` with
  PR-A while the route that supplies it lands in PR-B; without the default every report written in
  between would insert a null and fail.

## Outstanding

- **T097 — the by-hand `quickstart.md` walkthrough was NOT done**, and cannot be from here. It
  joins 007's and 008's. What is covered: two real browser profiles asking, seeing, attributing and
  upvoting; both nested dialogs measured at three widths; Escape and focus behaviours; an
  accessibility scan of the populated section and the nested dialog. What is not: a person looking
  at it, which is how 008's top-left dialog was found after passing every gate.

## Conclusion

**100% compliance against the in-force specification, from pipeline output rather than
inspection.** The one question referred to the owner — the withdrawal route's `200`-versus-`204`
contradiction inside `contracts/questions.md` — was resolved in favour of `200`, and the contract
document now says so with the reasoning attached.

---

# Deep Review Findings

**Date:** 2026-08-10 · **Branch:** `spec/009-session-qa` · **Rounds:** 1 · **Gate Outcome:** PASS
**Invocation:** quality gate (`after_implement`), owner-authorised — CLAUDE.md forbids dispatching
agents unless asked, so the deep review was offered rather than run automatically.

## Summary

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| Important | 9 | 8 | 1 (referred to the owner) |
| Minor | 14 | 11 | 3 |
| Notable | 8 | — | 8 (captured to `brainstorm/idea-inbox.md`) |
| **Total** | **31** | **19** | **12** |

37 raw findings across five agents; 31 after dedup. **Agents completed: 5/5.** External tools:
CodeRabbit and Copilot both **skipped (CLI not installed)**.

| Agent | Found | Fixed | Remaining |
|---|---|---|---|
| Correctness | 5 | 3 | 2 |
| Architecture & Idioms | 10 | 7 | 3 |
| Security | 4 | 2 | 2 |
| Production Readiness | 6 | 2 | 4 |
| Test Quality | 12 | 10 | 2 |

**MVP: Test Quality (12 findings)** — and deservedly: five of the nine Important findings were
tests that did not test what they claimed.

## The one Important finding NOT fixed — an owner decision

**A question's payload carries `authorId`, which makes this the first surface handing a
co-attendee the attendee identifier of somebody who has turned discoverability off.**

The chain was verified in source, not inferred:

1. `authorId` is returned for every question, unconditionally — attribution has no opt-out
   (FR-734), which is what constitution v3.3.0 records.
2. `POST /blocks` accepts any attendee identifier whose owner shares a current conference — true
   of every question author by construction.
3. `GET /blocks` joins `attendees` **live**, with no discoverability, verification or
   registration condition, and the route embeds the target's **card-rendition avatar bytes**
   alongside their current display name. The block row persists and is never re-checked.

So any attendee can take a non-discoverable author's identifier, block them, and thereafter read
their live name **and their photograph** — a field the directory query one file over deliberately
withholds from exactly that attendee. `POST /conversations` uses the same shared-registration
predicate, so they can also be messaged.

**Checked and NOT true**: the profile route itself still refuses. `questions-ask.test.ts` now
asserts that a non-discoverable author is named on her question **and** that
`GET /events/:eventId/attendees/:id` answers 404 for her — both halves of SC-707, which were not
tested together before this review. FR-736's own wording is about the profile, and the profile
holds.

**Why it was not fixed here.** Both available fixes are decisions rather than repairs:

- *Remove `authorId`, add `isMine`, and have `POST /reports` resolve the author server-side from
  the question.* This closes it cleanly, and it changes the payload shape `tasks.md` fixed for
  implementers and redesigns the report path.
- *Stop `listBlocks` returning the avatar for targets the caller could not otherwise see.* This
  alters a guarantee 007 owns, from inside 009.

This is the same shape as 008's unresolved question about whether proposing a meeting should
require discoverability: recorded rather than resolved, because either answer contradicts
something already written down. **The product behaves as specified today.**

## Important findings fixed

1. **Reporting a question left it on screen.** The block is applied server-side and the block
   filter lives in the list query, so nothing changed in the reader's view until the panel was
   closed and reopened — SC-711a's second half, without which "the first files paperwork and
   changes nothing on screen". Added `refresh()` to the hook, called after a successful report.
2. **Operator mail carried no question identifiers.** `question_ids` was stored on the row but
   never passed to `sendAbuseReport`, whose signature had no parameter for it — so a Q&A report
   left the product naming a person and nothing else, on a surface where that person may have
   asked twenty questions. Since no route reads a report back and the row is swept at 90 days,
   the mail is the only artifact anybody can act on. Added to the port, both adapters and the
   call. Identifiers only; the text and the reason still have nowhere to go.
3. **Migration `0008` had no `lock_timeout`.** It takes `ACCESS EXCLUSIVE` on `abuse_reports` and
   `SHARE ROW EXCLUSIVE` on `attendees` and `sessions`, inside one transaction, while the previous
   API container is still serving. Nothing rewrites a table — but a lock request that cannot be
   satisfied *queues, and every later conflicting request queues behind it*, so one unrelated long
   transaction turns a millisecond migration into a write outage. Added `SET lock_timeout = '3s'`,
   closing the gap 004's review recorded against `0003`.
4. **The cache test proved nothing about the shipped wiring.** It built its own repository, so the
   property it asserted was true by construction. The line that actually makes SC-711 true is one
   line in `services.ts`, and decorating it would have left every test in the feature green.
   Added a composition-root assertion — and **falsified it**: decorating the member makes it fail
   with the right message.
5. **Three of the section's four read states were unreachable from any test.** The double always
   resolved, so loading, both failure wordings, the retry control, and SC-715 were uncovered;
   `panel-questions-errors.test.tsx` looked like it covered failure and rejects *writes*, which is
   the opposite branch. Extended the double with held and failing reads, added
   `panel-questions-states.test.tsx`. **It immediately found a real defect**: a failed read
   rendered the same sentence in two separate alert regions.
6. **The withdrawal race was never interleaved.** Every case committed the vote before issuing the
   withdrawal, so an implementation that checked the count outside any transaction passed all of
   them — on the one requirement whose failure silently destroys another attendee's upvote. Added
   a genuine interleaving: a vote held uncommitted on a second connection, the withdrawal asserted
   **not to resolve** while the lock is held, then refused once it commits. Plus the negative
   control — a rolled-back vote lets the withdrawal succeed.
7. **The report dialog's centring assertion never executed.** Guarded by
   `if (await report.count() > 0)`, and the condition was never true: the control renders only on
   somebody else's question and only Ada asks anywhere in the suite. A test named "both dialogs"
   measured one — for the dialog newly opened over an already-modal panel, which is the exact
   arrangement 008 shipped in the top-left corner. Grace now asks; the assertion is unconditional.
8. **FR-746 had no behavioural test.** Every 009 integration file clears the throttle in
   `beforeEach` and again inside each helper, so deleting both `throttle(...)` calls from the
   routes left the whole suite green. Added `questions-throttle.test.ts` — refusal with a wait,
   keyed on the acting attendee, and asking and voting counted separately.

## Minor findings fixed

- **A vote racing a withdrawal answered 500, not 404.** `ON CONFLICT` absorbs a duplicate, not a
  foreign-key violation — and the withdrawal's `FOR UPDATE` makes exactly this interleaving
  happen. Now returns the uniform refusal.
- **`question_vote`'s source threshold of 600 was dead configuration.** `countFailures` read at
  most 200 rows, so the count could never reach it and the source dimension — the one an attacker
  occupies — never engaged. 007's `message_send: 300` was already in the same state. Raised the
  scan bound above every threshold and added an invariant assertion so the next entry fails the
  build instead of quietly not binding.
- **Six requirement citations pointed at the wrong requirement** (FR-748 for FR-728, FR-724 for
  FR-776 and FR-725, FR-705 for FR-703, FR-757 for FR-758, and a rule with no FR at all).
  Verified each against the spec text and corrected them.
- **Two comments cited test files that do not exist** (`qa-no-polling.test.ts`,
  `session-qa-keyboard.spec.ts`), sending a reader looking for a guarantee to nothing.
- **A read failure rendered two identical alerts.** The hook carries one `error`, so a failed list
  set it and the composer announced it a second time.
- **The client-side absence guards scanned a hand-written two-file list**, so a poller added in a
  new file would be invisible. Now derived from the directory.
- **FR-751 had no test** — the whole mechanism is one `key`, and removing it carries a
  typed-but-unposted *public* question into the next session's composer.
- **SC-707's second half had no test**, and the client half of FR-736 had none either: the author
  name is rendered as text, and `getByText` would pass just as happily if somebody wrapped it in a
  link.
- **`writeReport`'s `questionIds` was still optional**, with a comment explaining a PR-B gap that
  has closed.
- **The focus-preservation e2e collected `aria-labelledby` and never asserted it.** With index
  keys React reuses the node at each position, so "a button is still focused" still passes; only
  the identity assertion is unambiguous. Now asserted.
- **Three comment claims were factually wrong** about counts ("this feature's two" for three
  actions, "the tightest entry in this table" when four entries are tighter).

## Minor findings NOT fixed

- **No request sequencing in the hook.** Two overlapping writes resolve in arbitrary order and the
  last to settle wins, so a display divergence can persist until the next action. Server-side
  correctness is unaffected (the composite primary key makes votes idempotent).
- **The question limit is a bare `500` in three unlinked places.** 007 solved the same problem by
  exporting `MESSAGE_MAX_LENGTH` and pinning it against the contract. Two of the three copies are
  required by FR-705's independent-enforcement rule; the client's is the one that could be shared.
- **The over-length disabled predicate is implemented by `maxLength` rather than by the
  condition**, so SC-702's third case is satisfied vacuously and cannot be exercised through the
  interface.

## Notable observations

Eight captured to `brainstorm/idea-inbox.md`: the unpaginated list being returned per write, the
throttle's write volume on `sign_in_attempts`, whole-list re-renders, the throttle's non-atomic
read-then-write, and the withdrawal confirmation's missing pending state.

## Gate

**PASS after one fix round.** Re-verified end to end: `pnpm verify` green across all ten gates —
typecheck, lint, format, **unit 418**, **component 562**, contract, **integration 902**, build,
asset budget, **e2e 141**. One pre-existing flake (`durability.spec.ts`, which redeploys the API
mid-run) failed in one full run of three and passes in isolation; it is unrelated to this feature.
