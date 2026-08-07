# Brainstorm Overview

Last updated: 2026-08-07

The authoritative registers live elsewhere — open questions in `.specify/memory/constitution.md`,
delivery sequence in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`. This file
is the working index a brainstorm session reads first. When it disagrees with either of those, they
win and this is stale.

## Sessions

| # | Date | Topic | Status | Artifact |
|---|------|-------|--------|----------|
| 01 | 2026-08-04 (revisited same day) | foundation-slice | shipped (PR #2) | `specs/001-production-foundation/` |
| — | 2026-08-06 | delivery decomposition | recorded, ratified in constitution v2.1.0 | `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` |
| 02 | 2026-08-06 | event-context-and-catalog | shipped (PR #6) | `specs/002-event-context-and-catalog/` |
| 03 | 2026-08-07 | agenda-and-saved-sessions | active | — |

## Delivery queue

Eight phases after the foundation — the roadmap's nine, less 003, absorbed into 002 by brainstorm
#02. Full detail, dependency reasoning, and reserved migration numbers are in the roadmap; this is
the index, and it now differs from the roadmap in the ways #02 records.

| # | Phase | Status | Blocked by |
|---|-------|--------|------------|
| 002 | Event Context, Session Catalog & Home Composition | **shipped** — 89/89 tasks, squash-merged to `develop` ([#6](https://github.com/Programa-Semilla/mynet-ps/pull/6)) | — |
| 003 | ~~Session Catalog~~ | **absorbed into 002** (#02); migration `0002` transfers | — |
| 004 | Attendee Profile & Own-Profile Editing | **next up**, no parallel partner — still blocked | identity model; retention obligations; avatar handling |
| 005 | Agenda | **brainstormed** (#03) — specification next | 002 ✓ |
| 006 | Discover | queued (∥ 005) | 004 |
| 007 | Messages | queued | 004 |
| 008 | Network & Appointments | queued (∥ 009) | connection model; card-exchange semantics |
| 009 | Session Q&A | queued (∥ 008) | question attribution |
| 010 | Launch Readiness | queued | brand assets; client validation of desktop |

**002 carries the most leverage and the most risk in the queue, and #02 enlarged it further.** It is
not only the event switcher: it commits to the Home card composition contract and the per-event
scoping predicate that every later phase builds against, performs the interface, route, and seed
splits that make the remaining parallel pairs possible, and — after #02 — carries the whole session
catalog as well. A mistake there is inherited everywhere and has no cheap correction.

Numbers are **not** reassigned: 004–010 keep theirs, and 003 stays in the table struck through so
that the roadmap and this index can still be read against each other. The first free parallel pair is
now 005 ∥ 006 rather than 003 ∥ 004.

**005 departs from the roadmap in two recorded ways** (#03), and its specification must say so.
Its Home contribution is **its own card** rather than the roadmap's "Up-next prefers saved
sessions", because that phrasing means editing 002's `UpNext` and standing decision 9 forbids a
feature editing another feature's card. And it carries a **per-conference cache** the roadmap did
not scope into this phase, which is what closes two idea-inbox entries at once.

## Open Threads

### Client decisions

Each names the phase it blocks — when to ask matters as much as what to ask.

- **Attendee identity model** — self sign-up, event invitation, ticket holder, or
  organizer-provisioned. Determines the authentication design. *Blocks 004* (from #01 revisit)
- **Data retention, deletion, and export obligations** for personal data. *Blocks 004* (from #01
  revisit) — **but it bites a phase earlier than recorded.** That entry assumed 004 ran first. It is
  not running first, and 005's durable personal notes are attendee-authored free text, more
  open-ended than anything a profile form collects. #03 decided not to stall on it: 005 declares a
  **narrow commitment** — notes and saves are deleted with the account, no export path ships — as a
  declared limit under Principle IX. The full obligation is still unanswered and still blocks 004
  (revised 2026-08-07 by #03)
- **The connection model behind Network contacts** — the prototype derives contacts from
  conversations, with no connect or accept action, so there is no relationship to store.
  *Blocks 008 entirely* (from #01 revisit)
- **What a digital-card exchange records, and whether it is mutual.** *Blocks 008 entirely*
  (from #01 revisit)
- **Audience-question attribution** — attributed to the author or anonymous. Decides whether Q&A is
  a personal-data surface under Principle VIII. *Blocks 009* (added 2026-08-06)
- **Desktop and tablet layouts have never been validated by the client**; the approved prototype is
  mobile-only at a fixed 390×844. Every desktop layout built before this is answered is unreviewed
  design, so the cost compounds per phase. **Now more urgent than when it was written**: absorbing
  the catalog means 002 builds the Home dashboard *and* the catalog screens before any desktop review
  happens, and the roadmap's gate — scheduled for "after 002–003" — now fires after 002 alone.
  *Worth pulling forward* (from #01, escalated by #02)
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

### Design questions carried into 005's specification — open

From #03. Not client or owner decisions — these are for `/speckit-specify` and its review gate.

- **How long a cached programme may be shown before it is refused rather than stamped.** #03 decided
  the staleness *stamp*; it did not decide an upper bound. A programme cached a week ago is probably
  worse than no programme at all.
- **Whether a saved session is removable from the detail panel as well as from its row**, or whether
  one save affordance per session is clearer.
- **Whether the two next-session cards on Home need any relationship.** 005's card and 002's
  `UpNext` can legitimately disagree — the attendee's saved 11:00 talk against the programme's
  id-first 11:00 talk. Decision 9 says they are independent; whether that reads as *composed* or as
  *contradictory* on the first viewport is worth looking at once both are on screen.
- **The arbitrary tie-break in `nextSession()` survives** on the generic Up next card. The seed
  already contains two sessions starting at 11:00, so the first viewport is already featuring one
  for reasons the attendee cannot see. 005 works around it rather than fixing it; the recorded
  alternative is preference through `contract.ts` (#03 approach B).

### Design questions carried into 002's specification — all settled

Not client or owner decisions — these were for `/speckit-specify` and its review gate to settle.
All from #02, and all now answered by the delivered feature.

- ~~**Which 002 card exercises the attendee-scoped path?**~~ **`YourConferences`** (T075), which is
  the registered-conferences view Home already carried rather than a card invented for the purpose.
  It is a real card on the real dashboard, so the half of the contract the session kept flagging is
  proven by use rather than by a test double.
- ~~**The clock story**~~ — **two clocks, deliberately, each for the thing it is actually about.**
  The day number follows the **venue's** zone, because it is a fact about the conference; the
  time-of-day greeting follows the **device's**, because it is about the reader. Session times are
  stored as absolute instants and all relative wording is computed at display time.
- ~~**Do sessions carry their own timezone or inherit the event's?**~~ **Inherit.** The timezone is
  a property of where the conference is held, not of each item on its programme. The limit is
  recorded: a satellite session in another city would break it, and none is in scope.
- ~~**One migration or two**~~ — **two.** `0001_event_context.sql` and `0002_session_catalog.sql`,
  which keeps the event-context change reviewable apart from the catalog and honours the
  reservation rather than silently retiring a number.
- ~~**What happens when two cards claim the `lead` slot**~~ — **a unit test plus a development-mode
  assertion**, not compile-time impossibility. Recorded rather than glossed: a type-level guarantee
  would need a tuple or a narrowing builder, either of which makes the registry hostile to the
  one-line append it exists for (research D8).
- ~~**Offline reading of catalog content**~~ — **nothing is cached, and that is declared rather
  than defaulted.** Every conference-scoped surface says it needs a connection, distinguished from
  a server fault. The staleness policy remains genuinely open (see Open questions below); 002 makes
  the question concrete without answering it.
- ~~**Whether the enlarged 002 still wants one pull request**~~ — **yes, reaffirmed a third time**
  at the phase-split hook against the concrete 89-task list, alongside a two-PR split at the US1
  seam and a three-PR split isolating the shared-file split. Recorded with it: because `develop` is
  squash-merge only, Phase 1's separate commit does not survive the merge, so its review-isolation
  purpose is met at the commit level but not at the review level.

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

Ten entries in `brainstorm/idea-inbox.md` — six from the 001 deep review, four from 002's.

From 001: session topology and CSRF, security response headers, the production deployment path,
readiness versus liveness, throttle clock provenance, and substitutability proven without the
application. From 002: platform-registry structural typing, the seed production guard, the route
audit's inability to see `$ref` schemas, and integration-test isolation coupling.

Two of them — **session topology and CSRF** and **security response headers** — are the same
decision seen from two sides, and both are cheapest to settle before the first preview environment is
opened rather than after.

**Consumed and removed by #03**, each closed with a decision rather than deferred again:

- `interface-evolution-for-offline-data` → 005 caches the active conference's programme, saved set
  and notes; reads carry a staleness stamp; writes are refused offline rather than queued, so no
  write queue, optimistic update or conflict resolution is incurred.
- `home-card-duplicate-reads` → repeat reads are served from that same cache. Cards still call the
  repository independently and **FR-164 holds unchanged**; identical reads are parsed and sorted
  once rather than once per caller.
- `destination-owns-its-element` → an optional `element` moves onto the `Destination` entry, so the
  router's `path === '/agenda'` special-case becomes an append on Agenda's own line. 005's new
  `/agenda/<sessionId>` route needs this regardless.

The delivery-queue seed for phase 002 was consumed by #02 and removed.
