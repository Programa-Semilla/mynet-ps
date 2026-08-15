# Specification Quality Checklist: Messages, and the Notification Delivery Platform It Needs

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

**Review gate: passed on the second pass.** The first pass raised five Important and three Minor
findings, all fixed before the gate was marked. Recorded here because the findings are the useful
part, not the verdict:

| # | Finding | Resolution |
|---|---|---|
| I1 | FR-503 makes a conversation exist only once its first message is sent, but US1 and FR-519 both depend on an empty thread existing before that. The same defect at the other end: a conversation whose departed counterpart wrote every message is both "empty" (show the starter prompt) and "closed" (refuse sending). | FR-503a states the pre-creation thread creates nothing and leaves no trace. FR-519 narrowed to threads open to sending; FR-519a covers the closed-and-empty case explicitly. |
| I2 | SC-502 fixed five seconds while Open Question 6 declared the same value undecided. | SC-502 kept — the user-facing outcome is decided. Open question 6 narrowed to the mechanism and its hidden-tab cost. |
| I3 | Nothing bounded sending. Under M1 one account with a join code could open a conversation with every attendee at a conference; block is per-person and after the fact. | FR-504a throttles conversation creation, FR-511a throttles sending on 004's may-delay-never-deny pattern, SC-506a measures it. |
| I4 | Messaging is gated on co-attendance alone while 006 gates profile reads on co-attending *and* verified *and* discoverable. Deliberate, but undeclared — and 006 itself established that a divergence must be declared. | FR-504b declares it with its reasoning and names the accepted consequence. |
| I5 | FR-578 excluded received messages from the export with no argument, against decision 12's "covering every field collected". | FR-578 now carries the reasoning and requires the export itself to state the exclusion, so an attendee knows it is a rule and not a defect. |
| M1 | FR-516 cross-referenced FR-541 (block management) for deletion. | Corrected to FR-570. |
| M2 | FR-541 implied a block-management surface no story, layout row, or state declaration covered. | FR-541a places it on an existing account surface with its three states; declaration rows updated. |
| M3 | FR-558's no-notification-for-blocked-senders guarantee was not time-bounded. | Evaluated at dispatch; an already-dispatched notification may arrive, every later decision honours the block. |

Structural validation after the fixes: 92 functional requirements, 19 success criteria, no duplicate
identifiers, no cross-reference pointing at an undefined requirement.

Every checklist item passes, with four qualifications recorded honestly rather than glossed — none
of them is a spec defect, but two of them gate implementation.

**On "no implementation details".** The specification names Web Push, and the Context section names
`NotificationService`. This is the same latitude 006 took in naming Caddy, Azure and PostgreSQL: the
technology choice *is* the owner decision being recorded (M4), so omitting it would misrepresent
what was decided. No requirement prescribes how delivery is built — FR-559 deliberately routes it
through the platform interface rather than naming a vendor, and the provider itself is open question
2. Success criteria name no technology at all.

**Two open questions block implementation and are not deferrable.**

- **Open question 1 — the constitution amendment.** Register entry 10 currently places notification
  delivery out of scope. M4 is the decision that reverses it, and it has not been ratified. The
  specification declares this as a departure in its own section and in the Register position row,
  and states that the feature MUST NOT merge before the amendment lands. A reviewer should treat
  this as the single largest thing to check.
- **Open question 4 — report retention.** FR-579 requires a declared rule for what happens to a
  report record when either attendee deletes their account. `deletion-coverage` admits no
  unclassified table, so this is not a question that can be carried into implementation and answered
  later — it will fail the build.

**Two requirements carry a stated value gap, deliberately.** FR-517 requires a maximum message
length without fixing the number (open question 5), and SC-502 fixes five seconds for an open thread
to reflect a new message while the mechanism's cost is left to planning (open question 6). Both are
testable once the value is chosen; neither is ambiguous about what must be true.

**Owner decisions 2 and 3** — the push provider and key custody, and the operator report address —
block User Stories 5 and 3 respectively at implementation time, not at planning time. Planning can
proceed without them.
