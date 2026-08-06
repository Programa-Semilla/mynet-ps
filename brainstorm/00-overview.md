# Brainstorm Overview

Last updated: 2026-08-04

## Sessions

| # | Date | Topic | Status | Spec | Issue |
|---|------|-------|--------|------|-------|
| 01 | 2026-08-04 (revisited same day) | foundation-slice | active | 001-production-foundation | - |

## Open Threads

### Client decisions

- Attendee identity model — self sign-up, event invitation, ticket holder, or organizer-provisioned.
  Determines the authentication design (from #01 revisit)
- Event scoping of data — are sessions, attendees, conversations, and appointments per-event or
  shared across events? Cosmetic under sample data; a real schema forces the answer (from #01 revisit)
- The connection model behind Network contacts — the prototype derives contacts from conversations,
  with no connect or accept action, so there is no relationship to store (from #01 revisit)
- What a digital-card exchange actually records, and whether it is mutual (from #01 revisit)
- Data retention, deletion, and export obligations for personal data (from #01 revisit)
- Real brand mark and application icons — no logo exists in the repository; the slice ships visibly
  provisional placeholders (from #01)
- `GroundZero/requirements.md` is now knowingly out of step with the constitution on product name,
  delivery mode, persistence, authentication, and routing. Amend it or record the divergence? (from #01)
- What "PS" denotes in the repository name `mynet-ps` (from #01)
- Desktop and tablet layouts have never been validated by the client; the approved prototype is
  mobile-only at a fixed 390×844 (from #01)

### Owner and planning decisions

- Repository shape — API in this repository or its own (from #01 revisit)
- API hosting and the managed PostgreSQL provider (from #01 revisit)
- Authentication ownership — self-implemented or a delegated provider (from #01 revisit)
- Whether the foundation still ships as a single pull request, now that scope includes an API,
  a schema, migrations, an auth flow, and backend CI (from #01 revisit)
- Preview environments must never point at production data; preview access control undecided (from #01)
- Abstraction layer shape — root-injected registry versus context provider per service; deferred to
  the plan phase (from #01)
- Package manager choice (from #01)
- Server-side branch protection unavailable — private repo on a free personal account, APIs return
  403. Materially more serious now that real attendee data is in scope (from #01)

## Resolved

- **Product name** — MyNet. Owner decision 2026-08-04, ratified in constitution v2.0.0.
- **Demo scope versus persistence** — MyNet is the real product with durable server-side state.
  Owner decision 2026-08-04, ratified in constitution v2.0.0.
- **Routing model** — five individually addressable destinations. Owner decision 2026-08-04,
  overriding the "single-route" wording in `requirements.md`.
- **Backend architecture** — project-owned API over managed PostgreSQL, chosen over a managed BaaS
  and over serverless functions. Owner decision 2026-08-04.
- **Authentication timing** — foundational, not deferred to a later slice. Owner decision 2026-08-04.

## Parked Ideas

None.
