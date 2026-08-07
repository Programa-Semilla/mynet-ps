# Specification Quality Checklist: Agenda and Saved Sessions

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-07
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

### Review gate — 2026-08-07

`speckit-spex-gates-review-spec` found **3 Important and 3 Minor** issues. All were fixed; the
recommendation moved from *needs work* to *ready for planning*.

**I1 — the cache had no specified lifetime, which was both a governance failure and an authorization
hole.** The constitution requires under *Persistence* that "what may be cached on the client, **and
for how long**, MUST be specified per feature rather than assumed"; the spec deferred the bound to an
open question, which Principle IX presumes unmet. Worse, it interacted with FR-221: an authorization
refusal invalidates the cache, but **offline there is no server to refuse**, so with no expiry an
attendee whose registration was withdrawn could read that conference's content indefinitely. FR-221
now sets a **24-hour maximum age** and states explicitly that it is the only mechanism revoking
access offline. The open question was reframed from *whether there is a bound* to *whether 24 hours
is the right one*.

**I2 — FR-213 mandated a "stated maximum length" and stated none.** Untestable, and it bounds both
storage and a personal-data field. Now **10,000 characters**, enforced server-side as well as
presented client-side.

**I3 — FR-222 was silent on shared-read failure semantics.** It asserted FR-164 survives the cache
without requiring it at the point it could break. It now requires each card to render its own
failure state independently when a shared read fails, and forbids one card waiting on another's
retry. SC-212 was added to make it measurable.

**M1** — FR-209's autosave pause gained a lower bound (500ms–3s). **M2** — the reserved-migration
declaration now states the Principle VII obligation to verify `0004` forward against a real database
in CI. **M3** — scope size (54 requirements, 6 stories, one PR) was noted and is not a defect: the
single-PR shape is a recorded owner decision in the Clarifications.

### First validation pass

Two items failed on the first validation pass and were fixed before this checklist was marked
complete.

**"No implementation details" — failed, then fixed.** FR-206, FR-227–FR-232, FR-233 and FR-235
constrain structure: an extensible panel, proof-carrying authorization, a router that does not name
addresses literally, and per-domain file splits. A *Why this specification names some technical
shapes* section was added, mirroring the equivalent section in 002's specification, stating that
these requirements constrain the **property** and never the mechanism, and that mechanisms belong to
the plan. This is a recorded, bounded exception rather than leakage.

**"Requirements are testable and unambiguous" — failed, then fixed.** FR-209 originally said a note
is written "after the attendee pauses typing", with no bound, which is not testable. It now bounds
the pause at no longer than three seconds, tied to the property that matters — that a note survives
an unexpected loss of the page.

**Two conventions this specification follows deliberately, which a reviewer may read as
deviations.**

1. **Open Questions instead of [NEEDS CLARIFICATION] markers.** Constitution Principle I forbids
   closing a register entry by inference and requires open questions be recorded rather than
   resolved. Five carried-forward uncertainties therefore appear in the Open Questions section with
   their reasoning, not as inline markers. Items 1, 2 and 3 are genuine blockers-in-waiting: client
   validation of desktop and tablet layouts, the full data retention obligation, and an upper bound
   on cache staleness.

2. **SC-208 and SC-210 reference the diff and the card registry.** Both are measurable statements of
   standing decision 9 compliance and of FR-164 holding under a second contributor. There is no
   technology-agnostic phrasing that tests "this feature did not edit another feature's card". 002
   set the same precedent with SC-110.

**One declaration a reviewer should challenge deliberately.** The Register position row records that
the data-retention entry names 004 as the blocked feature but bites here first, and that this
feature proceeds on a **narrow declared commitment** — deleted with the account, no export — rather
than on a resolved obligation. That is a judgement made in brainstorm #03 to avoid stalling the only
unblocked phase. It is the single most consequential thing in this specification that is not
settled.
