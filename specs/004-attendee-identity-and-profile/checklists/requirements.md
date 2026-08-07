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

## Review gate — 2026-08-07

`speckit-spex-gates-review-spec` returned **needs work**, and all findings were resolved. Recorded
because two of them were contradictions the author could not see in their own draft.

**Important, all fixed:**

1. **FR-303 and FR-306 could not both hold.** Non-disclosure at sign-up is unachievable alongside
   auto-sign-in — the outcomes are distinguishable whatever the wording says. Resolved by the owner:
   **disclosure is accepted** and stated as accepted; the reset path keeps its genuine non-disclosure
   guarantee (FR-327).
2. **FR-317b contradicted FR-357 and 002's shipped architecture.** As drafted it forbade treating
   registration as an authorization event at all, which is precisely what the event-scoping predicate
   does. Narrowed to: registration is evidence of **presence, not vetting**.
3. **Three sound decisions compounded into an impersonation surface.** Public join code + verification
   gating nothing + co-attendee visibility would have let anyone appear in a directory under an
   address they do not own. Resolved by the owner: **verification now gates discoverability**
   (FR-325, FR-359). The consequence for 006 reverses — it may now assume every readable profile
   carries a verified address.
4. **Three dangling cross-references** — FR-372, FR-380, FR-392 were cited in prose ranges, including
   in the Feature Declarations table, and none existed.
5. **SC-301 overclaimed**, asserting unaided recovery for a population FR-324 permits to be
   unrecoverable. Scoped to verified accounts.

**Minor, all fixed:** no way to leave a conference once joined (FR-317c, FR-317d); four throttled
actions sharing one counter, so a sign-up storm could lock its target out of signing in (FR-307a);
and unstated behaviour when verification mail fails to send, which register entry 18 makes the
expected state rather than an exceptional one (FR-318a).

**Challenged and upheld:** the structural guards FR-370 and FR-377 are not governance overreach — they
implement a duty constitution v2.3.0 already imposes. The cross-event scoping call for profiles is
sound, and the visibility-rule-versus-scoping-rule distinction is stated clearly enough that a later
feature cannot confuse them. The single-migration constraint is sound and its escape hatch is stated.

Counts after review: **97 functional requirements, 13 success criteria**.

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
