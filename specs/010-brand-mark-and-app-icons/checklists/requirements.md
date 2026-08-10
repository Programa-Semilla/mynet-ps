# Specification Quality Checklist: Brand Mark and Application Icons

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

## Validation Notes

**Iteration 1 findings, all addressed before this checklist was marked complete:**

1. **Existing-file naming is not an implementation leak here, but it was checked.** The spec names
   `icon-192.png`, `apps/web/index.html`, `scripts/generate-provisional-icons.mjs`,
   `readColourToken`, `tokens.css` and `assets/brand/`. These are retained deliberately: this
   feature's deliverable *is* a set of files at specific paths replacing named existing ones, and
   FR-810's "at their existing names and sizes" is unverifiable without the names. This matches the
   register of 001 and 007's specs, which name manifest fields and worker files for the same reason.
   No language, framework or library API is prescribed anywhere in the requirements — `sharp` appears
   once, in Assumptions, as a statement that no *new* dependency is needed.

2. **Success criteria were re-checked for technology leakage.** SC-812 mentions "initial shell
   JavaScript" — kept, because it names an existing, already-specified budget (FR-072) rather than
   introducing an implementation choice, and the user-facing meaning (the download an attendee
   receives does not grow) is stated alongside it.

3. **Two brainstorm premises were corrected against the source rather than inherited.** The claim
   that all five auth screens carry `<h1>MyNet</h1>` is false — only `SignInScreen` does; three carry
   no product name at all. And the claim that the tablet band has brand presence is false — the rail
   is desktop-only, so tablet has none today. Both corrections are recorded in the spec's Context
   section and change the wording of FR-823 and FR-826.

4. **Every measurement in the spec was sampled from the brand board directly**, not copied from the
   brainstorm: board 1254×1254 with no alpha, coral mark bounding box 283×300 at (172,162)–(454,461),
   brand navy `#0d1942`, brand coral `#fe6551`. All four agree with the brainstorm; the no-alpha
   finding is new and is what makes the plate colour a constraint rather than a preference (FR-809).

5. **One open question was answered by reading code rather than left as an assumption.** The
   brainstorm asked whether the asset budget counts `public/` assets. It does not —
   `scripts/asset-budget.mjs` walks the Vite manifest's entry chunk and filters to `.js`. Recorded in
   Assumptions, and it is why FR-815 requires the number to be stated by hand.

6. **Zero [NEEDS CLARIFICATION] markers.** Four scope questions were put to the owner before drafting
   and are marked **OWNER DECISION** in the spec (extras scope, brand source location, mobile top bar,
   auth lockup arrangement). The one inference beyond those answers — extending the top-bar mark to
   the tablet band — is flagged as an assumption and marked reviewable rather than buried.

**Iteration 2 — the `review-spec` gate. Verdict: NEEDS WORK, six findings, all six fixed.**

| # | Severity | Finding | Fix |
|---|---|---|---|
| I1 | Important | **Manifest screenshots were in the owner-approved scope but appeared nowhere in the spec** — zero occurrences of the word. Scope silently dropped. They are also the one asset class not derived from the brand board, so FR-804's pipeline requirement did not reach them. | FR-815a–FR-815e added: real current surfaces, regenerable, **excluded from the precache set** (owner decision, following the reasoning that deferred the splash matrix), and no real account's data. US1 gained two acceptance scenarios; SC-815 added. |
| I2 | Important | **The constitution amendment had no requirement.** It appeared only in the Input line and the declarations table. Every FR could pass with the constitution still saying no logo exists. | FR-846–FR-850 added: draft and ratify before implementation, carry the standing decision and the four owner answers, **do not** close register entry 4, keep the struck entry in place for numbering stability. SC-816 added. |
| I3 | Important | **The mark's colourway per surface was unspecified.** The rail is the inverse surface; a navy mark there is invisible while passing every available assertion. Also unspecified: the in-app mark must carry no plate, which a naive crop of an alpha-less board would give it. | FR-820a–FR-820c added; the layout declarations now name the colourway per band; two edge cases and SC-814 added. |
| M1 | Minor | FR-815's install-payload figure had no named home and would have died in a PR description. | Recorded in the rewritten icons README (FR-837), asserted by SC-817. |
| M2 | Minor | FR-818 stated 16px legibility as though a gate could check it. | Split: FR-818 keeps the mechanical half (resampling filter preserving round caps); FR-818a assigns the judgement to human review explicitly, against the board's own scale tests. |
| M3 | Minor | FR-802 forbade references to `seeds/` but let the empty directory survive. | FR-802 now requires the directory gone; SC-813 extended. |

**Three open questions remain and are deliberate**: token palette adoption (must not be resolved
here, FR-831), whether the favicon set includes an `.ico` container (a planning decision), and the
unvalidated desktop/tablet layouts (register entry 4, escalated by this feature and not resolved by
it).
