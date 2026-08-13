# Specification Quality Checklist: App fixes, mutual card exchange, and the install icon

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

## Validation notes

**Iteration 1 found four issues; all four were fixed before this checklist was marked complete.**

1. **Implementation detail leaked into three requirements.** Early drafts of FR-1001, FR-1005 and
   FR-1007 named the element type, the CSS property that causes the defect, and the polling
   mechanism by name. All three were rewritten as behaviour: what the composer does, that it is not
   resizable by direct manipulation, and that the list refreshes on an interval. The *diagnosis* of
   each defect is recorded in `brainstorm/10-app-fixes-and-install-icon.md`, which is the right place
   for it — a specification that names the fix constrains planning to it.

2. **Two success criteria were untestable as written.** "The composer is usable on mobile" and "the
   icon looks right" carry no threshold. They became SC-1001 (a stated character count, at the
   narrowest supported viewport, with the keyboard raised) and SC-1009 (a person looking at a
   physical home screen). **SC-1009 is deliberately judged by a human and that is not a defect** —
   it is the one class of acceptance this project has twice proven no gate can make.

3. **The administrative-counterpart declaration was initially wrong**, and the error is worth
   recording because it is exactly what the new row exists to catch. The first draft claimed no
   confirm-password field existed on either product and that the administrative side therefore
   needed one built. `apps/admin/src/app/auth/ReplaceCredential.tsx` has carried one since 013.
   Corrected: the administrative product is the **reference implementation** and MyNet is the gap.
   The row now answers each of the six items separately rather than as a group, because the six
   answers genuinely differ.

4. **Event scoping was initially declared by inheritance.** "Cross-event, as cards already are" is
   the shape standing decision 7 forbids — neither rule may be assumed. Restated with the reason and
   with the structural guard that enforces it.

**One open question is intentionally left and is flagged as blocking implementation** rather than
this checklist: whether a mutual exchange requires the recipient to be discoverable. Constitution
v5.0.0 requires this feature to decide it and forbids inheriting an answer, so it is carried into
`/speckit-clarify` or planning rather than guessed here. It is not a `[NEEDS CLARIFICATION]` marker
because the specification is complete and internally consistent under either answer; what it changes
is route behaviour, which is a planning input.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- All items pass as of 2026-08-12
