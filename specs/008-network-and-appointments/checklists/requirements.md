# Specification Quality Checklist: Network — Contacts, Exchanged Cards, and Appointments

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

**All items pass as of 2026-08-10.** The single outstanding marker was answered rather than waived.

**The one marker is resolved: the card-only contact line breached standing decision 16 and is
withdrawn.** FR-619 through FR-622 are rewritten — a card carries exactly the directory profile,
this feature introduces no new personal-data field, and there remains one visibility decision per
attendee. The question was carried rather than assumed away precisely because it was a WHAT-level
conflict between the constitution and this design, and the answer went against the reading the
specification had provisionally taken. That is the mechanism working, not a defect.

**Two consequences worth noting for planning**: this feature's deletion and export obligation is now
**two new tables and no new column**, and the test asserting a field's absence from the directory
query is no longer needed, because the field does not exist.

**One precondition remains, and it is not a spec defect.** The owner ruled that entries 7 and 8
close by **constitution amendment**. Planning may proceed; **implementation may not begin until that
amendment is ratified.**

**Two scoped qualifications on items marked as passing**, recorded so a later reader is not misled:

1. **Implementation detail.** The user scenarios, functional requirements, and success criteria are
   behavioural throughout. The **Feature Declarations** table is not, and cannot be: Principle IX
   requires it to name offline behaviour, cascade coverage, event scoping, and the reserved
   migration number. That section is constitutionally mandated to be implementation-aware, so it is
   not counted against this item.
2. **Non-technical readability.** The user stories and acceptance scenarios read plainly. The
   Feature Declarations table and Open Question 2 assume familiarity with the project's shipped
   authorization invariants. Judged acceptable for the same reason as above.

**Validation iterations**: two.

*Iteration 1 (authoring)* — two success criteria (SC-610, SC-613) named internal tooling rather than
the outcome it guarantees, and were rewritten.

*Iteration 2 (review gate)* — three Important and four Minor findings, all fixed. The two that were
decisions rather than wording:

- **A received proposal reserves nothing** (FR-625), so no attendee's availability can be reduced by
  another attendee's action. Double-booking is instead prevented at **acceptance** (FR-633a), where
  the invitee is told about a conflict in *their own* schedule — which discloses nothing, unlike the
  server-side auto-decline this specification already rejected. SC-608a makes the guarantee
  testable.
- **A block arriving after the fact cancels** any pending proposal and any future confirmed
  appointment (FR-637a), rather than hiding them. Cards suspend and resume, following 007;
  appointments cancel, because a meeting somebody would otherwise turn up to must be ended visibly.

Also added: FR-643a (Network's addressability and nested addresses, which 005–007 each declared and
this specification had omitted), FR-638a (these throttles may deny, the opposite of reset-request,
because here the throttled action is the actor's own), FR-639a (no scheduling action for a contact
absent from the active event), and FR-634's derivation rule for *lapsed*, which is what keeps this
feature free of a scheduled job.
