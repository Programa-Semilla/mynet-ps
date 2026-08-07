# Specification Quality Checklist: Attendee Identity, Personal Data and Profile

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

**All checklist items pass.** Two [NEEDS CLARIFICATION] markers were raised and both were resolved by
the project owner on 2026-08-07, recorded in the spec's Clarifications section:

- **FR-317a / FR-317b** — the conference join code is **not a secret**. Real codes are committed in
  seed data; the public repository (register entry 16) is accepted rather than worked around, because
  the code grants registration and nothing else. FR-317b was added alongside it to forbid any later
  requirement treating registration as an authorization event, so the reasoning cannot quietly stop
  holding.
- **FR-324 / FR-325** — an unverified address prevents **nothing**. Verification establishes only
  reachability by mail, which is what makes recovery meaningful. FR-325 was added to record the
  consequence: 006 cannot assume every profile in the directory carries a confirmed address.

Each answer produced a second requirement, because in both cases the decision was safe *today* for a
reason a later feature could invalidate without noticing.

### Notes on the content-quality items

**"No implementation details"** passes with a recorded exception, consistent with 002 and 005. The
spec's "Why this specification names some technical shapes" section records that a small number of
requirements constrain structural *properties* — authorization that cannot be forgotten, deletion and
export coverage that a later feature cannot silently omit, a storage boundary that keeps an
unprovisioned vendor off the critical path. Each names the property, never the mechanism. Table names
(`sign_in_attempts`, `registrations`) appear where a requirement is about an existing record's
specific shape; that shape is the reason the requirement exists.

**Two requirements are deliberately structural guards rather than behaviours** — FR-370 (a test that
fails when a personal-data table is added with neither cascade nor retention rule) and FR-377 (a test
that fails when a field is collected without export coverage). They are stated as requirements rather
than left to the plan because constitution v2.3.0 makes deletion and export a per-feature duty owed by
every *later* feature, and a duty with no enforcement is the failure mode Principle IX exists to
prevent.

### Scope note carried to the plan

The feature is large and its size is recorded rather than hidden: it departs substantially from the
delivery roadmap, and a split into reviewable pull requests is expected after `/speckit-tasks`. The
spec also records that migration `0003` is the only number available to it, and what must happen if
implementation proves one migration insufficient.
