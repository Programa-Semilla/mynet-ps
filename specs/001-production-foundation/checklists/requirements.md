# Specification Quality Checklist: Production Foundation Slice

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-04
**Revised**: 2026-08-04 (iteration 3 — spec rewritten against constitution v2.0.0)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs) — **accepted deviation D-1**
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [ ] Success criteria are technology-agnostic — **accepted deviation D-2**
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified **and each states required behaviour**
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [ ] No implementation details leak into specification — **accepted deviation D-1**

## Personal Data (constitution Principle VIII)

Added at iteration 3, when persistence brought a privacy surface into existence.

- [x] Every stored record is attributable to exactly one identity (FR-034)
- [x] Every read and write path is identity-scoped, enforced server-side (FR-035)
- [x] Client-side filtering is explicitly excluded as an access-control mechanism (FR-035)
- [x] Cross-attendee access is refused without disclosing record existence (FR-036, SC-002)
- [x] Secrets are barred from the client bundle, repository, and previews (FR-041)
- [x] Field collection is limited to what a source or decision names (FR-042)
- [x] Preview environments are barred from real attendee data (FR-067, SC-011)
- [x] Isolation is covered by an automated test, not review alone (FR-069)
- [x] Credentials are non-recoverable and never logged (FR-031, FR-060)
- [ ] Retention, deletion, and export obligations specified — **deliberately open, Question 5**

## Validation History

**Iteration 1** — 1 blocker, 2 accepted deviations. Blocker: `[NEEDS CLARIFICATION]` on the routing
model, a conflict between authoritative sources that Principle I forbids resolving by assumption.

**Iteration 2** — blocker resolved by owner decision (addressable routes). Spec updated with the
override recorded inline, direct-entry and unknown-address requirements, extended end-to-end
coverage, three acceptance scenarios, and SC-012.

**Iteration 3 — spec rewritten.** The owner decided MyNet is the real product with durable
server-side state and real authentication, ratified in constitution v2.0.0 (MAJOR). The iteration-2
spec was written against 1.x's stateless-demo premise and was invalidated wholesale rather than
patched. Counts after rewrite: 5 user stories, 72 functional requirements (sequential, no gaps or
duplicates), 15 success criteria, 0 clarification markers, 0 template placeholders.

### Review findings from the iteration-2 gate, and their disposition

| # | Finding | Disposition |
|---|---|---|
| I1 | Six of eleven edge cases were unanswered questions, effectively TBDs | **Fixed.** Every edge case now states required behaviour, grouped by concern. |
| I2 | FR-010 and SC-001 were subjective with no measurement method | **Fixed.** FR-011 now specifies a recorded design review against four named criteria with the outcome captured in the PR; SC-001 is now a countable outcome over seeded attendees. |
| I3 | Empty destinations conflicted with "viewer identifies an attendee workspace" | **Dissolved by the pivot.** With authentication, the shell shows the attendee's own name and registered events, so it reads as a workspace without needing destination content. |
| I4 | Preview-deploy requirement made the slice's own PR unmergeable, with no bootstrap order | **Fixed.** FR-070 states the four-step order explicitly; FR-071 forbids disabling or skipping the check to obtain a green result. |
| I5 | Principle VII's product validation checklist was never reconciled with the slice | **Fixed.** Constitution v2.0.0 now states the checklist is satisfied incrementally; the spec has a section naming the five items this slice discharges and the six it does not. |
| M1 | FR-021 required stubs to "not return undefined", which a no-op cannot satisfy | **Fixed.** FR-046 requires a defined result appropriate to the contract, and states that completing without effect is a defined result where the contract has no return value. |
| M2 | "unit" and "component" tests counted as separate gates without definition | **Fixed.** FR-005 defines unit, component, and integration tests distinctly. |
| M3 | No dedicated Error Handling section | **Fixed.** FR-058 through FR-061, covering loading and failure presentation, attendee-facing error content, server-side recording, and blank-page prevention. |
| M4 | FR-036 restated constitution governance as a feature requirement | **Fixed.** Removed; governance lives in the constitution. |
| M5 | Dependencies contained session-specific state | **Fixed.** The "already active in this clone" claim is gone. |
| M6 | No performance or bundle budget for an offline-first PWA | **Fixed.** FR-072 requires a defined, pipeline-enforced client asset budget. |

## Accepted Deviations

### D-1: The specification names a technology stack

**Items affected**: "No implementation details", "No implementation details leak into specification"

**What is present**: React, TypeScript, PWA, PostgreSQL, and Cloudflare Pages appear in the Context
and Scope Note, Assumptions, and Dependencies.

**Why it is not removed**: Constitution v2.0.0 fixes these as ratified constraints, citing owner
decisions of 2026-08-04. Removing them would not make the spec more technology-agnostic; it would
make it less accurate by hiding constraints that already bind.

**Containment**: **No functional requirement (FR-001 through FR-072) names a framework, library, or
vendor.** Every FR is stated as a capability or behaviour and would survive a stack change.

**Status**: Accepted. Not scheduled for remediation.

### D-2: Two success criteria are measured by code inspection

**Items affected**: "Success criteria are technology-agnostic"

**What is present**: SC-008 counts direct platform and network calls in feature code; SC-009 counts
colour literals outside the token definition.

**Why it is not removed**: These measure Principle V and the design-token constraint — properties a
passing build cannot demonstrate, and which the constitution names among those "a passing build can
still violate." No user-observable proxy exists, because their purpose is to constrain internal
structure.

**Containment**: The other thirteen success criteria are user-, reviewer-, or pipeline-observable and
name no technology.

**Status**: Accepted. Not scheduled for remediation.

## Notes

- No outstanding blockers. The specification is ready for `/speckit-plan`.
- Seventeen open questions are carried deliberately. Nine need a client decision; eight need an owner
  or planning decision. None is a specification ambiguity, so `/speckit-clarify` would add little.
- **Question 1 (attendee identity model) is the one to watch.** The slice proceeds on an explicit
  interim assumption of administrative account provisioning. If the client answers "self sign-up",
  the sign-up flow, verification, and recovery paths are new work — not a change to what is built here.
- **Question 16** asks whether this still ships as a single pull request. It was agreed when the
  slice was frontend-only and now includes an API, schema, migrations, auth, and backend CI.
  `/speckit-spex-collab-phase-split` before implementation is the natural place to settle it.
