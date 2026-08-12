# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Feature Declarations *(mandatory — Constitution Principle IX)*

<!--
  ACTION REQUIRED: Every row MUST be filled. An obligation that is not declared is
  PRESUMED UNMET, and a specification missing this section MUST NOT pass its review gate.

  "Not applicable, because <reason>" is a valid declaration. Silence is not. State the
  reason structurally — why the obligation cannot arise — rather than asserting it does not.

  Added to this template 2026-08-11 during the 4.0.0 amendment. The section has been
  mandatory since constitution v2.1.0 and every shipped spec carried it by hand; the
  template did not, which is why it is here now.
-->

| Obligation | Declaration |
|---|---|
| **Actor and tier** (Principle III, added 4.0.0) | [Which actor does each surface serve — attendee, platform operator, or conference organizer? Which product does it live in? A feature serving more than one actor MUST say which surface serves which. **Silence about the actor is an undeclared obligation.**] |
| **Offline behaviour** (Principle VI) | [What works offline, what does not, what happens to an action attempted offline. Name each repository member as a live read or a cached one — the caching decorator treats an undeclared method as a WRITE, and a write purges the whole conference prefix.] |
| **Desktop layout** (Principle IV) | [Persistent left rail, contextual top bar, multi-column.] |
| **Tablet layout** (Principle IV) | [Reduced rail, two-column cards, stacked detail.] |
| **Mobile layout** (Principle IV) | [Compact header, bottom navigation, single-column, full-width overlays, touch-sized controls. No content or primary action may require horizontal scrolling.] |
| **Empty / loading / failure states** (Principle IV) | [For every surface that crosses the network.] |
| **Accessibility** (Principle IV) | [Accessible labels, visible focus, keyboard operability, Escape-key dismissal for any modal introduced.] |
| **Validation checklist discharged** (Principle VII) | [Which whole-product checklist items this feature satisfies, and which it deliberately leaves to a later feature.] |
| **Identity scoping & server-side authorization** (Principle VIII) | [How every read path is scoped by identity and refused server-side. Authority MUST be a server-enforced predicate, never a claim the client presents.] |
| **Deletion & export coverage** (Principle VIII) | [How each new record is reached by the deletion cascade and appears in the export; for any record no cascade can reach, the retention window that clears it. Both coverage tests derive expectations from the schema, so a new table or column FAILS BY EXISTING.] |
| **Event scoping** (Standing decision D1/7) | [Per-event or cross-event, and why. Neither is a default that may be assumed.] |
| **Administrative counterpart** (Principle IX, added 5.0.0) | [For every capability this feature adds to MyNet: does an administrative counterpart already exist, must it be built here, or is it explicitly NONE? "None, because…" is a valid and common answer — the obligation is to have looked. A feature adding no attendee-facing capability declares that and is done. Since 4.0.0 there are two actors and two websites against one database, and the failure mode is a thing attendees can do that no administrator can see, undo, or answer for.] |
| **Register position** (Governance) | [Which Open Questions Register entries block this feature, which it resolves, which it escalates, and which it opens.] |
| **Reserved migration number** (Branching — parallel work) | [The number claimed, or "none claimed" with the reason.] |

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
