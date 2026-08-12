# Specification Quality Checklist: Conference Content Authoring

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-12
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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### Iteration 1 — 2026-08-12

**One [NEEDS CLARIFICATION] marker remains**, at **FR-1034**: whether a single organizer action that
materially changes several of an attendee's saved sessions produces one notification per session or
one coalesced notification. It is retained rather than defaulted because the two readings have
materially different user experiences **and** the coalesced form brushes against constitution v4.2.0
N2, which forbids an aggregate over changes. Defaulting it would resolve a governance boundary by
inference, which is the failure mode v3.3.0 exists to prevent.

**Everything else was defaulted and recorded in Assumptions** rather than marked, per the
three-marker limit and the scope > security/privacy > UX > detail priority: the cancelled-session
Q&A composer, whether engagement counts are a disclosure, timezone editability, join-code minting,
the conference-creation limit, lock-screen content, and speaker provenance.

### Iteration 2 — 2026-08-12

**The FR-1034 marker is resolved and all items now pass.** The owner chose coalescing: one
organizer action produces at most one notification per attendee. Three things changed as a
consequence, and the third is the one worth noticing.

1. FR-1034 rewritten, with FR-1034a and FR-1034b added to hold the boundary; FR-1029 narrowed to
   the single-session case; FR-1031 and SC-1009 scoped to surfaces inside the product; Story 3
   gained acceptance scenario 1a; SC-1012 added to count dispatches.
2. **Constitution v4.2.0's N2 was amended in its draft** rather than stacked as a later version,
   because a coalesced body carrying a count is an aggregate over changes and N2 as first drafted
   forbade exactly that shape. N2 now states that the prohibition governs surfaces **inside** the
   product, with two rules holding the line: activation must land on the destination carrying the
   per-row markers, and no view in either product may present the count.
3. **This is the second time in one session that answering a question moved governance rather than
   a detail** — the first being the material-change set. Both were reachable by inference and both
   would have been settled inside a specification had they not been asked. That is the argument the
   4.1.0 report makes about entries 24, 25 and 26, arriving again one amendment later.

### Iteration 3 — 2026-08-12 (review-spec gate)

**Eight findings, all fixed.** Five Important, three Minor. The two that mattered both defeated the
feature's central safety guarantee, and both had an established precedent in this codebase that the
first draft failed to cite.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Important | The engagement check had no transactional or locking rule, so an attendee saving a session between the check and the delete lost their row — SC-1002 was false under concurrency | **FR-1019a**, citing 009's FR-714 and the same lock-conflict mechanism |
| 2 | Important | Engagement was enumerated over four tables, so a later attendee-state table referencing a session would silently stop counting and deletes would resume destroying data with every test green | **FR-1018a**, a schema-derived predicate in the shape of the two coverage tests |
| 3 | Important | FR-1022 forced a cancelled session into Home's "Up next", which answers *where do I go now* | **FR-1022a** — "Up next" skips it; the rest-of-day timeline shows it cancelled |
| 4 | Important | Nothing excluded the acting principal, so an organizer notified themselves | **FR-1028a** |
| 5 | Important | Coalescing was per action, but nothing said so — an implementer could read it as per attendee per time window, which would suppress a cancellation because a room moved earlier | **FR-1028b** |
| 6 | Minor | FR-1039 required per-action throttling and named no actions | Five named |
| 7 | Minor | Engagement counts approach identification at seed and pilot scale | Stated in Assumptions with the threshold-not-count mitigation |
| 8 | Minor | SC-1004 had no metric | One minute, subscription-conditional |

Four acceptance scenarios were added to carry findings 1, 3, 4 and 5 — the race, the "Up next"
skip, self-notification, and two-acts-two-notifications — so each is testable rather than only
asserted.

**Two items to re-examine at the plan gate rather than here:**

1. *"No implementation details"* passes, but the Feature Declarations table names concrete
   artefacts — `CatalogRepository`, `theme/tokens.css`, `passThrough`, branded scope types. This is
   deliberate and matches every shipped spec in this project: Principle IX's declarations are
   verified against real mechanisms, and a declaration naming no mechanism cannot be checked. The
   body of the spec (Requirements, Success Criteria) stays free of them.
2. *"Scope is clearly bounded"* passes for the feature, but the spec is **gated on constitution
   v4.2.0, which is drafted and not ratified.** Five requirements cite N1–N5 directly. If the
   amendment is reworded at ratification, FR-1026/1027/1031/1040 and the cancellation block change
   with it. Recorded in the spec header as a blocking condition.
