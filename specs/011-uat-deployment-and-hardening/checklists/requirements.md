# Specification Quality Checklist: UAT Deployment and Pre-Public Hardening

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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation record

One validation pass was run over the written specification. It found **one** failure, which was
fixed; everything else passed on first reading. Recorded plainly because a validation record that
narrates a longer struggle than actually happened is worth less than no record at all.

**Failure found and fixed — "No implementation details".** User Story 2's narrative said the web
server "obtains a certificate without anyone touching it", naming the specific server. Rewritten to
"a publicly trusted certificate is obtained without anyone touching it". The product name survives
in the Context section, where it describes what already exists, and in the plan, where it belongs.

**Counts after the review gate**: 73 functional requirements, 19 success criteria, 12 of 12 Feature
Declaration rows filled, 0 `[NEEDS CLARIFICATION]` markers, 5 open questions.

### Review gate: 6 Important and 4 Minor issues, all fixed

The `speckit-spex-gates-review-spec` gate ran after this checklist's first pass and **found six
Important issues the checklist pass had missed**, which is worth recording as a fact about the two
instruments: the checklist validated the document against itself, and the gate validated it against
the repository. Four of the six were **absences** — things the spec did not say — and a checklist
asking "are requirements testable" cannot find a requirement that is not there.

**Important — fixed:**

1. **Nothing covered how a change reaches UAT.** Standing decision 20 binds a change to reach UAT on
   merge to `develop`. An environment deployed by hand would have satisfied every other requirement
   while leaving that rule unmet. Added FR-831–FR-838 and SC-816–SC-819.
2. **The deployment path cannot reach the host as things stand**, and it is a design problem rather
   than a configuration step: provisioning locks administrative access to the operator's address,
   and a hosted runner has no stable one. Added FR-833 requiring the resolution to be chosen and
   costed, and promoted it to **Open Question 1** — it is the only question here whose obvious
   answer quietly weakens a guarantee.
3. **Nothing required the deployed environment to be seeded**, though two acceptance scenarios and
   SC-802 depend on a joinable conference existing. Migrating is not seeding. Added FR-884, FR-885.
4. **Only the two new secrets were covered.** The database password and name, both authentication
   secrets, the certificate-registration address and the sender address all predate this feature and
   all must be present. Added FR-837, which cites register entry 17 — where two authentication
   secrets were never set in the workflow at all and were "invisible only because `db-branch` failed
   first."
5. **FR-803 named no route set.** Narrowed to the two client-driven polls, with FR-803a requiring
   the set to be enumerated so a later poll cannot silently sit outside it.
6. **FR-828's meaning was an open question.** Narrowed to a concrete, testable requirement.

**Minor — fixed:** FR-812 over-promised automated assertions for requirements governing mail copy
(split into FR-812/FR-812a, with the weaker guarantee named as weaker); SC-814 was unverifiable with
one operator (rewritten to walk the written procedure against the built environment); no requirement
exercised **rollback**, which the constitution requires alongside restore (FR-838, SC-819); FR-806
said nothing about cards already shared by unverified accounts (FR-806a — vacuous today, and
deliberately so).

**One correction the fixes forced, recorded because it was a real error rather than an
elaboration**: narrowing FR-828 made the environment indication a persistent element on every view,
which **is** a layout change. Three declaration rows said "No layout change". They now say what it
costs, and mobile — where vertical space is scarcest and Principle III puts a success criterion on
the first viewport — is named as the width where it may not be free (Open Question 5).

### Deliberate exceptions to "no implementation details"

Three named things survive inside requirements. Each is a **ratified owner decision** rather than an
implementation choice this specification is making, and in each case the requirement is untestable
without it. A reviewer should confirm they agree, not assume they are leaks:

- **The Azure subscription identifier** (FR-820). Constitution v3.4.0 binding text. "Pin to the
  configured subscription" is not checkable without knowing which.
- **The two addresses** (FR-820, FR-823). Same. FR-823's whole content is that one of them must
  *not* be committed yet.
- **The operator address** (FR-860). Same, and it is the entire substance of register entry 21.

Everything else is described by obligation: "a publicly trusted certificate", "a real transactional
mail adapter behind the existing mail port", "a signing key pair held as a repository environment
secret", "storage outside the host". The vendors sit in Assumptions and in the constitution.

### Where judgement was applied rather than a rule

- **FR-828 is deliberately loose, and its looseness was promoted rather than hidden.** It requires
  that the environment be *evident* as UAT, not that it be a banner. Whether that is a product
  surface or a deployment artifact genuinely changes the work — a persistent element on every screen
  would be the first in nine features — so it is Open Question 1 rather than a requirement pretending
  to have settled it.
- **SC-802 carries a time bound** because the thing most likely to fail in that journey is mail
  *arriving*, and an unbounded "a person can complete sign-up" passes even when it takes an hour.

### Two observations for the review gate

Neither is a checklist failure. Both are places where this specification is shaped unlike its
predecessors, and a reviewer applying the normal reading would be right to stop:

- **The actor is the operator, not the attendee.** Every prior feature's user stories are an
  attendee's. The constitution's sole-actor rule governs the *product*, not who operates it, and
  this feature builds no product surface — but the divergence is deliberate, and it is stated in the
  User Scenarios preamble rather than left to be noticed.
- **Six of the seven user stories deliver nothing an attendee can see**, and SC-815 makes that a
  criterion: nothing attendee-facing may behave differently, except that some requests are delayed
  and an unverified account cannot share a card. That is the opposite shape from every other
  feature's success criteria, and it is the point.
