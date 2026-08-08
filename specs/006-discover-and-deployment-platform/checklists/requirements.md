# Specification Quality Checklist: Discover, and the Deployment Platform It Runs On

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-07
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *with a recorded exception, see Notes*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — *within this project's established house style*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details) — *one recorded exception*
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — *with the recorded exceptions above*

## Notes

### Spec review gate — passed after fixes (2026-08-07)

The `speckit-spex-gates-review-spec` gate found **4 Important and 5 Minor** issues. All nine were
fixed in place; the gate re-ran clean. What changed:

| | Finding | Fix |
|---|---|---|
| I1 | An **undeclared third departure**: 001's shipped **FR-066** and **SC-011** guarantee a reviewer a preview of *that exact change*, and FR-490 removes the mechanism. The spec declared only the constitution and `CLAUDE.md` departures | The departure section is retitled and carries a third row; the amendment scope is widened in the *Register position* declaration. **This is the finding that mattered** — the other two departures are governance prose, this one is a delivered, verified requirement |
| I2 | No behaviour defined for an attendee with **no active conference** — the state of every attendee before their first join code | FR-401b, an edge case, US1 scenario 8, and an entry in the empty-states declaration |
| I3 | FR-410's stability guarantee was weaker than the edge case it had to satisfy | FR-410a bounds it **asymmetrically and says why**: no duplicates ever; omissions permitted, because forbidding them would require a snapshot FR-466 forbids. SC-403a makes it measurable |
| I4 | Home card size unspecified, so FR-447 was untestable | FR-447 bounds it at five, with the reason; FR-447a adds the route into the full directory |
| M1 | SC-402/SC-403 cited a 500-attendee scale no requirement established | FR-401c establishes 1,000; both criteria now reference it |
| M2 | FR-487's "stated schedule" stated no schedule | At least daily, automated, recorded in the runbook, restore exercised once |
| M3 | FR-402 leaked HOW ("in the query that produces the listing") | Rewritten to the observable property: an excluded attendee is absent from the response entirely, not withheld from display |
| M4 | Two P1 stories strained the template's one-story-MVP reading | A note above the stories states why they share P1 and that US2/US3 depend on US1 |
| M5 | US1 scenario 7 (conference switch) had no traceable FR | FR-401a |

### Initial validation

Validated in one iteration. Two success criteria were rewritten during validation rather than
passed as written:

- **SC-407** said "costs one request, not 25". Rewritten to the user-observable outcome — every face
  renders at once, with no per-card placeholders resolving individually.
- **SC-415** said "no longer performs a sequential scan… uses an index". Rewritten to the
  observable property — deletion and join do not slow as the system grows.

### Recorded exceptions

**Vendor and technology names appear in three places, deliberately, and in none of them is a
requirement.** They appear in *Departure from the constitution*, in the *Register position*
declaration, and in the Key Entities note on environments — all three of which exist to record which
governance statement is being departed from and which register entry is being closed, and Principle I
forbids doing that by inference. Naming the decision is the point of those sections.

**Every functional requirement is written to the observable property instead.** FR-476 says "one
origin", not a proxy product; FR-479 says "a publicly trusted certificate obtained and renewed
without manual intervention", not an ACME client; FR-484 says "two isolated environments", not a
host; FR-486 says "not reachable from outside its own host", not a bind address. A different platform
satisfying the same properties would satisfy the specification.

**SC-414 ("zero unchecked repository casts remain in feature code") is an accepted exception** to the
technology-agnostic rule. This feature carries recorded engineering debt as declared scope, and the
measurable outcome of discharging that debt is necessarily stated in code terms. Making it vague
would make it unverifiable, which is the worse failure.

**On non-technical readability**: this specification is dense and cross-references requirement
identifiers from features 001–005. That matches the established house style of
`specs/004-attendee-identity-and-profile/spec.md` and `specs/005-agenda-and-saved-sessions/spec.md`,
both of which were written and reviewed the same way. Judged against that baseline rather than
against a generic one.

### Not a checklist failure, but the reviewer should know

- **The specification requires a constitutional amendment before merge**, not before planning. Two
  written statements are departed from: "managed PostgreSQL", and "preview deploy on every change".
  Both are named in *Departure from the constitution* with the exact wording quoted.
- **Two open questions block the first deployment** — no domain name exists, and UAT will be publicly
  reachable. Both are owner decisions, both are recorded, and neither blocks planning.
- **Zero [NEEDS CLARIFICATION] markers is a deliberate result, not an absence of uncertainty.** Eight
  genuinely open items are carried in the *Open Questions* section, per explicit instruction not to
  invent answers for them. Eight assumptions are recorded separately where a reasonable default did
  exist.
