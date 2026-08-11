# Specification Quality Checklist: Administrative Foundation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — **passed with a declared deviation,
      see Notes**
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
- [x] No implementation details leak into specification — **same declared deviation**

## Notes

**The "no implementation details" item is passed with a deliberate, declared deviation**, and it is
recorded here rather than quietly resolved either way.

The specification names specific files, tables and mechanisms in five places:
`apps/api/src/db/seed/catalog.ts` and four test files (FR-976); `abuse_reports` and
`organizer_assignments` (Key Entities, Event scoping); `theme/tokens.css` and the native `<dialog>`
centring rule (Accessibility); `sign_in_attempts` (Open Question 6); and the Drizzle snapshot
regeneration hazard (Reserved migration number).

Each is load-bearing rather than incidental:

- **FR-976 cannot be written without naming the files.** Constitution v4.0.0 requires the five
  code-level guards that enforced the reversed prohibition to be "amended deliberately... and none
  may be weakened until it stops checking anything". A requirement to amend a guard that does not
  name the guard is not testable, which fails a different item on this list.
- **Principle IX's declarations are written against a real codebase by design.** Event scoping
  requires every new table to state which rule applies; deletion and export coverage require naming
  how each record is reached. Both are table-level statements by construction.
- **Three named invariants exist because they were violated before.** The `<dialog>` centring rule
  is recorded in `CLAUDE.md` precisely because two features rediscovered it by shipping dialogs in
  the top-left corner, and a third would have without the reference.

The alternative — describing these obliquely — would trade traceability the constitution demands for
a template item, and would make the spec less testable rather than more abstract. Every *behavioural*
requirement in the specification is stated in terms of what an operator or attendee can observe, with
no framework, language, endpoint shape, or algorithm named.

**Six Open Questions are recorded rather than marked `[NEEDS CLARIFICATION]`**, following this
project's established spec structure (007, 008, 009 and 010 all use an Open Questions section). One
of them — Open Question 1, how a seeded platform operator's first credential is established without
committing it to a public repository — carries a security consequence that cannot be deferred past
this feature, and it is flagged in the completion report rather than left to be found at planning.

**Register position is declared and is unusually clean**: blocked by nothing, opens nothing, closes
nothing, addresses entries 19 and 21 without closing them, and escalates entry 4.

## Review gate — `/speckit-spex-gates-review-spec`, 2026-08-11

**Result: PASSED after fixes.** Six findings — three Important, three Minor — all applied to the
spec. None was a contradiction or a constitution violation; every one was a **gap where an
implementer would have had to invent a rule**, which is what this gate exists to catch.

| # | Severity | Finding | Fix |
|---|---|---|---|
| I1 | Important | Email uniqueness across the two credential sources was unspecified, so FR-914's two stores made authentication ambiguous and **FR-915's indistinguishable refusal unachievable** | **FR-918** — one address identifies at most one principal product-wide, extending decision 11 across both stores rather than creating a second uniqueness domain; collision refusal worded as an ordinary address-taken refusal so it is not an oracle |
| I2 | Important | FR-936 required the unassigned state to be "reported to platform operators", but no requirement created a surface for it — a state nobody can observe | **FR-926** — a platform-operator conference surface showing organizers or unassigned, which 012 extends rather than replaces |
| I3 | Important | Operator removal was referenced by FR-944, FR-983 and an edge case, but operators were seed-only with no defined lifecycle, so FR-983's Principle VIII obligation could not be discharged | **FR-908/FR-909** — deactivation as the terminal state, with identity resolvable for as long as any record attributes an action to it. Deactivation ends access; it does not erase the audit |
| M1 | Minor | The conference-organizer tier ships with no capability, and the spec never said why | New scope-note section: the boundary is 012's foundation and must be independently testable before a large write surface depends on it |
| M2 | Minor | SC-902 measured "reports filed since 007 shipped" — an empty corpus, since nothing is deployed | Rewritten to measure against reports created during the test |
| M3 | Minor | No sign-out requirement, though FR-912 and US1 scenario 3 both depend on it | **FR-919** |

Three supporting additions travelled with the fixes: the operator entity gained its active/deactivated
state, four edge cases were added (sign-up colliding with an operator address, a deactivated
operator signing in, the last operator being deactivated), and an assumption records that
deactivating the last operator is recoverable only by re-seed and that this is accepted rather than
guarded.

**Not a finding**: Open Question 1 — how a seeded operator's first credential is established without
committing it to a public repository. It is correctly recorded as an open question, and it carries
the one security consequence in this feature that cannot be deferred past it.
