# Specification Quality Checklist: Session Q&A — Audience Questions and Upvotes

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Three items warrant a reviewer's attention rather than a silent tick.

**1. "No implementation details" is ticked with a stated qualification.** Several requirements name
existing project constructs by name — `EventScope`, `requireEventAccess`, `CatalogRepository`,
`SessionPanel.tsx`, the cache's write branch and `args[0]`, `apps/api/src`. These are **not
technology choices being made here**; they are named architectural invariants this project has
already established and which the constitution and CLAUDE.md treat as binding on later features. The
house style set by 005, 006, 007 and 008 names them in specifications for exactly this reason: an
invariant a spec does not name is one the next reader does not know they inherit. FR-757 is the
sharpest case — it describes a defect mechanism precisely because the correct-looking behaviour is
the broken one, and stating it only at plan time is how 008 shipped it.

**2. No [NEEDS CLARIFICATION] markers remain because all three were resolved before drafting.** The
project owner answered them on 2026-08-10:

- A departing attendee's upvoted question → **deleted with the account, votes go too**. Constitution
  v3.2.0 required this phase to decide it and forbade assuming 007's answer transferred.
- Author withdrawal of their own question → **permitted until its first vote**.
- Attribution for a non-discoverable attendee → **unconditional**.

They are recorded in "The three decisions this phase had to take, and did", not as assumptions.

**3. Seven Open Questions remain. One blocks implementation; none blocks planning.** Open Question 1
— the constitution amendment recording public Q&A visibility as a third Principle VIII exception —
is a **precondition on the first line of code**, following 008's precedent. The other six are
planning decisions (cache-write classification, nested modal dialogs, panel registry, where the
reused report dialog lives, re-read versus local re-sort, phase split). An eighth is struck through
as answered.

## Review Findings — `/speckit-spex-gates-review-spec`, 2026-08-10

Reviewed against the constitution v3.2.0, CLAUDE.md's architectural invariants, and the delivery
roadmap. **Verdict: NEEDS WORK on first pass, resolved.** Four Important and four Minor findings.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| I1 | Important | FR-742 contradicted itself — it permitted a route naming a question rather than an event, then forbade a route naming no conference. `/questions/:id/votes` is both. | **Fixed.** Rewritten to require every route be registered under `/events/:eventId/…`, following 008's treatment of appointments, so the existing audit covers them and no fourth branded scope is needed. |
| I2 | Important | FR-756 was an unqualified MUST that forbade what Open Question 3 offered as a live option. | **Fixed.** Split into FR-756 (a success purges nothing) and FR-756a (a refusal still clears the conference). The open question is now about *how* to satisfy both, and records that no existing classification does. |
| I3 | Important | An abusive question had no proportionate report path. Verified by inspection: `ReportDialog` is imported only by `messages/Thread.tsx`, so reporting a question's author required opening a conversation with them first — compounded by FR-709 (no edit), FR-711 (non-withdrawable once upvoted) and the absence of any moderator. | **Owner decision, 2026-08-10: add report-from-question.** New requirements FR-781–FR-787 and User Story 5. Forced the block-visibility question to be answered rather than defaulted (struck-through Open Question 8). |
| I4 | Important | FR-733 asserted a new Principle VIII exception while the Register row claimed no amendment was needed. Principle VIII requires an exception to be *recorded*; both existing ones were recorded by amendment. | **Owner decision, 2026-08-10: an amendment is required and gates implementation.** Register row reversed; Open Question 1 rewritten as the precondition. |
| M1 | Minor | FR-732's `MUST NOT be paginated` over-constrained planning from an assumption. | **Fixed.** Made permissive, with the deterministic-ordering constraint that any later pagination must preserve. |
| M2 | Minor | FR-746 named no throttle values. | **Fixed.** Ordering stated (asking tightest), values recorded as a planning decision in Assumptions. |
| M3 | Minor | Duplicate questions unstated. | **Fixed.** Edge case plus FR-773b — no de-duplication, because deciding two questions are the same is an organizer's judgement. |
| M4 | Minor | SC-701 counted typing as an "action", making it arguable. | **Fixed.** Restated as exactly two control interactions, excluding typing, with the reason. |

One finding was raised *by* the fixes rather than found in the draft, and is recorded as Open
Question 3: FR-712's confirmation and FR-781's report dialog both open from inside the session
panel, which is itself a modal `<dialog>`. Two stacked modals is an arrangement 007 deliberately
avoided, and it must be established in a browser rather than in jsdom.

## Validation Result

**PASS** after one fix iteration. The Principle IX declaration table is complete with every row
filled, which is the spec review gate the constitution names. **Implementation is gated on the
Open Question 1 amendment; planning is not.**
