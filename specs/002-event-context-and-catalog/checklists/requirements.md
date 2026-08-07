# Specification Quality Checklist: Event Context, Session Catalog & Home Composition

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-06
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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation record

Reviewed in a single pass over the written specification; no item required a corrective iteration.
What each judgement rests on, so the review gate can disagree with it:

- *No implementation details* — no functional requirement names a framework, library or vendor. The
  mechanisms chosen during brainstorming (a proof-carrying scope value, a route-table audit, a
  slot-based card registry) are deliberately confined to Assumptions and the Context note. The
  requirements state the property instead: FR-147 that a conference-scoped read cannot be performed
  with an unverified identifier, FR-149 that an automated check must fail when verification is
  absent, FR-156 that placement is one of a small fixed set of named positions.
- *Requirements are testable* — the day-context requirements name whose clock decides what: the
  venue's timezone for the conference day (FR-120, FR-121, FR-125), the attendee's device clock for
  the greeting's time of day (FR-123). "Derived from the clock" alone would not have been testable.
- *Success criteria are measurable and technology-agnostic* — every SC states a count, a percentage,
  a comparison, or a completable journey. SC-105's unit is "every route that accepts a conference
  identifier", which is verifiable without knowing what serves those routes.

**Deliberate deviations from the checklist's letter, recorded rather than silently taken.**

- *Written for non-technical stakeholders* — the "Departure from the delivery roadmap" section is
  addressed to whoever maintains the roadmap rather than to a business stakeholder. It is present
  because the roadmap requires a departing feature to say so in its specification, and omitting it
  to satisfy a readability criterion would breach that requirement.
- *No implementation details* — the Dependencies section names the CI pipeline and its current
  failure to run. Two of this feature's guarantees are enforced only there, so recording the
  dependency is a scope fact, not an implementation choice.

### Review gate record — 2026-08-06

`speckit-spex-gates-review-spec` raised five Important and four Minor findings against the spec as
first written. All nine were fixed; two required an owner decision first.

| # | Finding | Resolution |
|---|---|---|
| I1 | The spec never said which destination renders the programme | Owner decision: **Agenda**, read-only, personalised by 005. New "Where this feature's surfaces live" section, FR-137, FR-137a, US2 scenarios 4–6 |
| I2 | The relationship between the active conference and the address bar was unspecified | Owner decision: addresses stay **conference-neutral**. New FR-119, US3 scenario 8, and a Context subsection distinguishing addresses from requests |
| I3 | FR-103 required deterministic tie-breaking but gave no rule | FR-103 now states a total order — start date, end date, then a stable unique property — and forbids dependence on insertion order. US1 scenario 6 added |
| I4 | "Conference" diverged from the domain term **Event** | New "A note on vocabulary" section fixing the mapping as exact and directing the plan and implementation to use `Event` |
| I5 | Concurrent switches appeared in Edge Cases with no governing requirement | New FR-118, US3 scenario 7 |
| M1 | Per-event speakers imply the same human is two records; unstated | Consequence now stated in Key Entities, with an explicit warning to 004 |
| M2 | Nothing verified FR-183's behaviour-neutrality claim | New SC-110: identical suite passes either side, byte-identical generated contract |
| M3 | SC-107 was subjective | Rewritten as an objective test across four named dimensions plus session count |
| M4 | Unexplained gaps in requirement numbering | Note added above the functional requirements explaining the grouping gaps |

**Not resolved here, by design.** Five entries remain in the spec's Open Questions. None is a
[NEEDS CLARIFICATION] marker: each is either a client or owner decision that Principle I forbids
closing by inference, or a decision explicitly taken with a recorded alternative. Two of them —
client validation of desktop and tablet layouts, and the offline staleness policy — are worth
raising before implementation rather than after.
