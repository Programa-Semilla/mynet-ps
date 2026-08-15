# Specification Quality Checklist: Conference Content Authoring — Tranche 2

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-14
**Feature**: [spec.md](../spec.md) — Part II — Tranche 2 (FR-1045–FR-1099, SC-1013–SC-1026)

**Scope note**: this checklist covers **tranche 2 only**. Tranche 1's checklist is
[`requirements.md`](./requirements.md) and its result stands unchanged.

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

## Review gate — passed 2026-08-14, after fixes

`speckit-spex-gates-review-spec` ran as five adversarial dimension reviewers, each of whose findings
was then put to a **skeptic instructed to refute it**. Only findings that survived refutation were
reported. **25 survived — 1 Critical, 15 Important, 9 Minor — and all 25 were fixed.**

**The Critical finding is the one worth carrying forward, because it is a defect this project has
already made once and did not recognise in a new shape.** The shipped delete-versus-cancel
confirmation decides "is anything attached?" from the four engagement counts alone. FR-1077 keeps
enrolment deliberately outside that set — so an optional session with twenty places held would have
rendered *"Nobody has saved this session, written a note on it, asked a question or voted. It can be
deleted outright"*, which is false at the one moment it matters most, on the **only** warning before
the **only** irreversible destruction of attendee state in the product. FR-1077b as first written was
satisfied by adding a count line *beside* that paragraph, leaving the falsehood standing.

It is 016's FR-1055 defect exactly: tranche 2 ordered a falsified **comment** rewritten three times
(FR-1049, FR-1088, FR-1096a) and never ordered the falsified **product copy** rewritten. **FR-1077c**
and **FR-1066a** now close both halves.

Four others changed the specification materially rather than clarifying it:

- **FR-1079b** — shipped FR-1026, FR-1028 and FR-1030 say "saved" where this tranche means "saved or
  holds a place". FR-1028 as shipped says a session **no attendee has saved** dispatches nothing,
  which FR-1079 contradicts outright. Part I and Part II disagreed inside one document, and a shipped
  integration test enforced the old rule.
- **FR-1048** — the back-filled modality is now named (`in-person`). The stated property alone was
  satisfied by **hybrid** too, and back-filling hybrid would have disabled FR-1050a's forbidding half
  for every conference in existence while being false about all of them.
- **FR-1059a and Edge Case 1** — the recorded remedy for a refused in-person→virtual change was
  **impossible**: FR-1050a forbids adding a link *and* forbids clearing the room while the conference
  is still in-person. Hybrid is now stated as the transitional modality.
- **FR-1061a and FR-1065** — both were check-then-write refusals written without tranche 1's own
  locked-in-transaction clause. Tranche 2 was applying a weaker standard than the tranche it extends,
  in the same document.

Requirements after fixes: **93** (FR-1045–FR-1099, ten added by the review). Success criteria: **15**
(SC-1013–SC-1026, three added).

## Validation evidence

Checked mechanically over Part II rather than by reading impression alone:

| Check | Result |
|---|---|
| `[NEEDS CLARIFICATION]` markers | **0** |
| Requirements defined | **93**, FR-1045 → FR-1099 (83 as written, +10 from the review gate) |
| Duplicate FR numbers | **none** |
| FR numbers outside the tranche's range | **none** |
| Unused numbers inside the range | **none** |
| Table or column names (snake_case) | **0** |
| SQL keywords, engine or framework names | **0** |
| Test filenames | **0** |
| Success criteria | **15**, SC-1013 → SC-1026 (12 as written, +3 from the review gate) |
| Edge cases | **39** |
| Assumptions recorded | **23** |
| Key entities, each declaring per-event vs cross-event scoping and why | **20** |

## Notes

**Two deliberate conventions, recorded so a reviewer does not read them as leakage.**

1. **The Feature Declarations table names products and one platform mechanism** — `apps/admin`,
   `apps/web`, and a native dialog's `showModal()`. Tranche 1's declarations use exactly the same
   language, and the section's whole purpose is answering Principle IX's constitutional obligations,
   which are stated in those terms. Making tranche 2's rows technology-free would have made them
   inconsistent with tranche 1's rows on the same page.

2. **SC-1017 names its verification method** ("verified as an absence over the source rather than by
   observation"). The criterion itself — *no notification is dispatched by anything time-driven* — is
   technology-agnostic; the method is stated because this is a guarantee that **cannot** be
   established by observing a test run. "It did not fire during the test" is not evidence that it
   cannot fire, and this project has a shipped guard built on precisely that reasoning.

**Requirement numbering collides with feature 016 across the FR-10xx band, and this is pre-existing
and tolerated rather than introduced here.** 014 tranche 1's FR-1022 and 016's FR-1022 already name
different requirements, because both features were authored in parallel from a shared band. FR numbers
are scoped to the specification that defines them. This is the **fifth** shared numbering table this
project has collided on — after constitution versions, migration numbers, feature numbers, brainstorm
numbers and register entries — and it is recorded here rather than corrected, because renumbering
tranche 1 would break citations already written into a merged PR, a review-findings document and the
constitution.

**One thing the checklist cannot assert, and the plan must.** Tranche 2 is gated on **constitution
v5.3.0**, drafted and **ratified 2026-08-14**. A passing checklist meant the specification was sound,
not that implementation was licensed; ratification granted the licence separately. Both are now done.
