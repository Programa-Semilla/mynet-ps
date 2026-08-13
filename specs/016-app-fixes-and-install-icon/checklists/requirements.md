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

**Iteration 1 found four issues (all fixed). The `review-spec` gate then found seven more — five Important, two Minor — and all seven were fixed.**

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

## review-spec gate, 2026-08-12

Seven findings, all fixed. **Four of the five Important ones share a root cause worth naming: mutual
exchange alters the meaning of things 008 built, and the first draft described the new behaviour
without describing what it invalidated.** That is the failure mode to watch for in 017, which
rebuilds a shipped feature rather than adding one.

- **I1** — `GET /cards/shared` silently changes meaning and has no consumer, so nothing would catch
  it. Now FR-1051.
- **I2** — the export's own docblock justifies disclosure by citing v3.2.0 N2, which C1 reverses;
  behaviour and the record of why must change together. Now FR-1052.
- **I3** — FR-1030 named a Home surface for contacts that does not exist. Home's eight cards were
  checked one by one. Rewritten with the real answer and its accepted cost.
- **I4** — FR-1024 read as "omit the conference", contradicting a `notNull` column and the spec's
  own Assumptions. Reworded to separate *recording* from *scoping by*.
- **I5** — the open question named discoverability but the live check is discoverable **and**
  verified. Verification now named, with why it does not conflict with FR-1027.
- **M1, M2** — the pool-autocommit restructure and the fault injection, recorded under Dependencies.

**Verified as already correct**, against the schema and queries rather than against the spec's own
claims: no implementation leakage across all 50 original requirements; deletion and export coverage
(both foreign keys cascade, export runs one query per direction); and the unique constraint, which is
directional by construction and accommodates a reciprocal row with no change.

## clarify session, 2026-08-12

Five questions asked and answered; checklist re-validated **16/16 → 16/16**, no regressions.

Two answers changed more than they settled:

- **FR-1053 turned an open question into a load-bearing one.** Requiring the recipient to be
  discoverable and verified is not inherited convention — it is what keeps constitution C1's licence
  true. C1 permits mutual exchange because "a card resolves only what its owner already published to
  co-attendees"; against a non-discoverable recipient that ground does not exist. Removing the
  condition would need another amendment, and the spec now says so.
- **SC-1002 was arithmetically unsatisfiable and is now correct.** A 10-second poll cannot guarantee
  a 10-second bound — worst case is the interval plus jitter plus the request. The bound moved to 15
  seconds. Caught while integrating the answer rather than by the checklist, which is worth noting:
  "success criteria are measurable" passed against a criterion that was measurable and impossible.
