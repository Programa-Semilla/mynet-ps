# Brainstorm Overview

Last updated: 2026-08-06

The authoritative registers live elsewhere — open questions in `.specify/memory/constitution.md`,
delivery sequence in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`. This file
is the working index a brainstorm session reads first. When it disagrees with either of those, they
win and this is stale.

## Sessions

| # | Date | Topic | Status | Artifact |
|---|------|-------|--------|----------|
| 01 | 2026-08-04 (revisited same day) | foundation-slice | shipped (PR #2) | `specs/001-production-foundation/` |
| — | 2026-08-06 | delivery decomposition | recorded, ratified in constitution v2.1.0 | `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` |

## Delivery queue

Nine phases after the foundation. Full detail, dependency reasoning, and reserved migration numbers
are in the roadmap; this is the index.

| # | Phase | Status | Blocked by |
|---|-------|--------|------------|
| 002 | Event Context & Home Composition | **next** | — |
| 003 | Session Catalog | queued (∥ 004) | 002 |
| 004 | Attendee Profile & Own-Profile Editing | queued (∥ 003) | identity model; retention obligations; avatar handling |
| 005 | Agenda | queued (∥ 006) | 003 |
| 006 | Discover | queued (∥ 005) | 004 |
| 007 | Messages | queued | 004 |
| 008 | Network & Appointments | queued (∥ 009) | connection model; card-exchange semantics |
| 009 | Session Q&A | queued (∥ 008) | question attribution |
| 010 | Launch Readiness | queued | brand assets; client validation of desktop |

**002 carries the most leverage and the most risk in the queue.** It is not only the event switcher:
it commits to the Home card composition contract that all seven later phases build against, and it
performs the interface, route, and seed splits that make the parallel pairs possible. A mistake there
is inherited everywhere and has no cheap correction.

## Open Threads

### Client decisions

Each names the phase it blocks — when to ask matters as much as what to ask.

- **Attendee identity model** — self sign-up, event invitation, ticket holder, or
  organizer-provisioned. Determines the authentication design. *Blocks 004* (from #01 revisit)
- **Data retention, deletion, and export obligations** for personal data. *Blocks 004* — the first
  phase to store substantial personal data (from #01 revisit)
- **The connection model behind Network contacts** — the prototype derives contacts from
  conversations, with no connect or accept action, so there is no relationship to store.
  *Blocks 008 entirely* (from #01 revisit)
- **What a digital-card exchange records, and whether it is mutual.** *Blocks 008 entirely*
  (from #01 revisit)
- **Audience-question attribution** — attributed to the author or anonymous. Decides whether Q&A is
  a personal-data surface under Principle VIII. *Blocks 009* (added 2026-08-06)
- **Desktop and tablet layouts have never been validated by the client**; the approved prototype is
  mobile-only at a fixed 390×844. Every desktop layout built before this is answered is unreviewed
  design, so the cost compounds per phase. *Worth asking after 002 or 003* (from #01)
- **Real brand mark and application icons** — no logo exists in the repository. *Blocks 010, long
  lead time* (from #01)
- **`GroundZero/requirements.md` is knowingly out of step** with the constitution on product name,
  delivery mode, persistence, authentication, and routing. Amend it, or record the divergence?
  (from #01)
- **What "PS" denotes** in the repository name `mynet-ps`. The GitHub organisation is
  `Programa-Semilla`, which is a strong fit — but Principle I forbids closing a register entry by
  inference, so this stays open until confirmed (from #01)

### Owner and planning decisions

- **API hosting and the managed PostgreSQL provider** (from #01 revisit)
- **Authentication ownership** — self-implemented or a delegated provider (from #01 revisit)
- **Attendee avatar handling** — seeded imagery or real upload. Upload pulls in object storage and
  `CameraService` and opens a new personal-data surface. Deferring is the working assumption, not a
  decision. *Blocks 004* (added 2026-08-06)
- **Preview environments must never point at production data**; preview access control undecided
  (from #01)
- **Repository visibility.** The repository is **public** and owned by the `Programa-Semilla`
  organisation. Nothing in the constitution or `CLAUDE.md` records this, and both were written
  assuming private. Intended, or an artifact of creation on 2026-08-05? It changes the Principle VIII
  threat model either way (added 2026-08-06)
- **The CI pipeline is not running.** Runs queued since 2026-08-06 17:04 have never started, and
  **nothing currently on `develop` has ever passed CI** — PR #2 merged with all seven checks in
  `QUEUED`. Not minutes exhaustion; public repositories get unlimited Actions minutes
  (added 2026-08-06)
- **Server-side branch protection is unconfigured, not unavailable.** The earlier entry recorded
  "private repo on a free personal account, APIs return 403". Both halves were wrong: the repository
  is public, and `branches/develop/protection` returns **404 — no rule set**. Branch protection is
  free on public repositories, so this is a configuration task rather than an accepted risk
  (corrected 2026-08-06)

## Resolved

**2026-08-04, ratified in constitution v2.0.0**

- **Product name** — MyNet.
- **Demo scope versus persistence** — MyNet is the real product with durable server-side state.
- **Routing model** — five individually addressable destinations, overriding the "single-route"
  wording in `requirements.md`.
- **Backend architecture** — project-owned API over managed PostgreSQL, chosen over a managed BaaS
  and over serverless functions.
- **Authentication timing** — foundational, not deferred to a later slice.

**2026-08-06, ratified in constitution v2.1.0**

- **Event scoping** — hybrid. Conference content is per-event; relationships persist across events.
- **Content provenance** — conference content is seeded; each attendee authors their own profile.
  No administrative interface and no content import path.
- **Home composition** — a slot-based card registry built early, not a dashboard aggregated late.
- **Sequencing** — phases run mostly sequentially, in parallel only where they touch disjoint files.
- **Attendee profile view** — a profile detail view is delivered in 006, closing the gap where
  `requirements.md` says a profile can be opened and the prototype has no such screen.
- **Repository shape** — the API lives in this repository, at `apps/api` inside the pnpm workspace.

**Settled by delivering 001**

- **Foundation packaging** — it shipped as a single pull request (#2), answering the open thread
  about whether the widened scope needed splitting.
- **Abstraction layer shape** — a root-injected registry, not a context provider per service.
- **Package manager** — pnpm, with a committed lockfile.

## Parked Ideas

Seven entries in `brainstorm/idea-inbox.md`, all from the 001 deep review: session topology and
CSRF, security response headers, the production deployment path, readiness versus liveness, throttle
clock provenance, interface evolution for offline data, and substitutability proven without the
application.

Two of them — **session topology and CSRF** and **security response headers** — are the same
decision seen from two sides, and both are cheapest to settle before the first preview environment is
opened rather than after.
