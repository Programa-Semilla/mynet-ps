# Specification Quality Checklist: 012 — Launch Readiness

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-16
**Revised**: 2026-08-16, after an independent spec review returned **MAJOR ISSUES**
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [ ] Written for non-technical stakeholders — **fails, deliberately.** See Notes.
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [ ] Success criteria are technology-agnostic — **fails, deliberately.** See Notes.
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

### What the first version of this checklist got wrong

**It ticked four items that plainly failed, and argued only the two it expected to be challenged
on.** The independent review named the pattern precisely: *a self-assessment that defends where it
expects scrutiny and ticks where it doesn't — the same shape as a guard that is brightest where it
is blindest.*

The four:

- **"Edge cases are identified"** was ticked against a spec with **no Edge Cases section at all**.
  Now written, with six.
- **"All acceptance scenarios are defined"** was ticked while **three of five user stories had
  none** — two of them P1. Now written for all five.
- **"Written for non-technical stakeholders"** was ticked while the Notes defended technical
  identifiers under a *different* item.
- **"All functional requirements have clear acceptance criteria"** was ticked while FR-1102,
  FR-1112, FR-1142 and FR-1143 had none. Now covered by SC-1210, SC-1211 and SC-1212.

This entry stays in the file. A checklist that quietly corrects itself teaches nothing.

### The two items now marked as failing, and why they are not being fixed

**"Written for non-technical stakeholders."** This spec names files, commands and identifiers —
`attendeeSeed.clear`, `beforeinstallprompt`, `scrollWidth`, `bootstrap.ts`. It genuinely fails this
item and the failure is correct: **those references are the subject, not the solution.** FR-1102's
requirement *is* that one specific existing coupling be removed; FR-1102a's *is* that one specific
header be corrected; SC-1204's *is* that a specific measurement be replaced, because the
constitution recorded eight days earlier that the obvious one is blind. Stating them abstractly
would make the requirements unverifiable. Recorded as a failure rather than argued into a pass.

**"Success criteria are technology-agnostic."** SC-1204 names `scrollWidth`/`clientWidth`. Same
reasoning: the original wording was technology-agnostic and **would have scored the administrative
site's scrolling navigation strip compliant**, which is exactly the defect v5.4.0 R3 carved out.
Here the technology-agnostic phrasing was the defect.

### The finding that mattered most, and how it was answered

The review asked the question that should be asked of any validation feature: *is there anything
here that would let it be declared complete without the walk actually finding anything?* The answer
for the first draft was **no requirement fails** — a walker who ticked 200 steps in an afternoon and
found nothing satisfied FR-1120, FR-1125, FR-1130, FR-1132, SC-1203 and, crucially, **SC-1208 at
`0 == 0`**.

Given the spec's own evidence — the last two humans to look at this product found a defect within
minutes — *zero defects found* is the outcome most likely to mean the walk failed, and the first
draft scored it a clean pass.

Answered by three additions rather than by rewording: **FR-1125** (an observation, not a verdict),
**FR-1126** (a capture for every layout and install step), and **FR-1127** (three seeded defects,
introduced by somebody else, revealed only afterwards; a miss voids the walk). FR-1127 borrows
001's own open T093: *a gate that does not fail when broken is not a gate*.

**FR-1127 rests on the assumption most likely to fail** — that somebody other than the walker exists
to seed the defects. That is recorded in Assumptions rather than hidden.

### Two remaining known weaknesses, recorded rather than resolved

**The artifact of a completed walk is still not specified.** FR-1125 and FR-1126 now constrain its
*content*, but not its form. Register entry 4 was closed by ratification **without** an acceptance
act, so this project has no precedent for what recording one looks like. Naming a format here would
be specifying HOW; it belongs to planning.

**SC-1201 is weaker than it reads.** It says "without consulting the source code", and the
Assumptions say the walker is the owner or somebody with equivalent product knowledge — so it
measures less than it appears to. The reviewer's proposed fix was a fresh-eyes pass by somebody who
has never worked on the product. **That was considered and not taken**, because FR-1127 was chosen
instead as the walk's floor. If a fresh pair of eyes becomes available, that pass is the cheapest
strengthening available and should be added.
