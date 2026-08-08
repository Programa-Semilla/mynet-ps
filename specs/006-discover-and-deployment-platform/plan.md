# Implementation Plan: Discover, and the Deployment Platform It Runs On

**Branch**: `feat/006-discover-and-deployment-platform` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-discover-and-deployment-platform/spec.md`

**Constitution**: v3.0.0 | **Brainstorm**: `brainstorm/05-discover-and-the-deployment-platform.md`

## Summary

Turn the co-attendee profile read 004 built into the directory `requirements.md` describes — attendee
cards over the active conference, server-side search and role/interest filters, shared-interest
ranking, an addressable profile view, and one appended Home card — and, in the same change, move the
product onto the platform it will actually run on.

**No new table and no new column.** Migration `0005` is indexes and one extension, exactly as the
roadmap reserved it. The directory is a *view* over records 002 and 004 already established, which is
why both structural guards — deletion coverage and export coverage — stay green without a new
allow-list entry, and why the keying decision in research D3 is load-bearing rather than incidental.

The technical shape follows what 002, 004 and 005 established rather than inventing beside it: the
branded `EventScope` and the route audit for authorization, the append-only registries for routes,
interfaces, navigation and Home cards, `useAsync` for every surface crossing the network, and 004's
decode-resize-re-encode path for the new card-sized avatar rendition.

**The platform half is the larger departure and the smaller invention.** Two isolated Azure VMs on
the `mission-control/deploy/vm` pattern — Caddy with automatic TLS in front of an API container and a
loopback-only PostgreSQL container — replace Fly, Cloudflare Pages and Neon. Caddy being both file
server and reverse proxy is what makes client and API share one origin, which is what makes
`SameSite=Lax` a real CSRF defence and `connect-src 'self'` literally true. In the configuration this
replaces, **sign-in cannot complete at all**: `fly.dev` and `pages.dev` are separate registrable
domains on the Public Suffix List.

**This feature also discharges recorded debt that 006 would otherwise multiply**: the fifteen
unchecked repository casts (research D10, done first so this feature adds none), and the two index
findings 004's review deliberately left for a feature that owns a migration number.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22 (API), ES2022 modules throughout

**Primary Dependencies**: Fastify + Drizzle (API), React 19 + react-router (web), `sharp` (image
re-encode, already present), Vitest + Playwright (tests). **PostgreSQL 17 in a container** — no
managed provider, no Neon

**Storage**: PostgreSQL on the application VM, loopback-only. Avatar bytes in `stored_objects` via
`StorageService`, on a VM volume. **No client cache** — 005's caching decorator is deliberately not
used by this feature

**Testing**: Vitest projects `unit` / `component` / `integration`; Playwright for e2e; axe for
accessibility. Integration and migration gates run against a `postgres:17` service container, as PR
#9 left them

**Target Platform**: Installable PWA (browser); Linux-hosted API. Two Azure `Standard_B2s` VMs
(`uat`, `prod`), Docker Compose, Caddy with Let's Encrypt

**Project Type**: pnpm monorepo — `apps/api`, `apps/web`, `packages/data`, `packages/platform`, plus
a new `deploy/vm`

**Performance Goals**: A directory page of 24 cards with faces is **one** request, not 25 (SC-407).
First meaningful content under 2s and filter response under 1s at 1,000 registered attendees
(FR-401c, SC-402, SC-403). Account deletion and conference join stop scanning (SC-415)

**Constraints**: Nothing cached — offline is a refusal, not a degraded read (FR-466). Ranking may
read only what the card shows (FR-413). No duplicate across pages; omissions permitted, because
forbidding them needs a snapshot FR-466 refuses (FR-410a). No horizontal scroll at 320px. No dead or
disabled 007/008 actions

**Scale/Scope**: 55 functional requirements, 16 success criteria, 4 user stories, **0 new tables**, 1
migration (5 indexes + 1 extension), 1 new endpoint, 2 new client surfaces, 1 Home card, 1 new
repository, and a deployment stack that does not exist yet

## Global Constraints

**Every task inherits this section.** Values are copied verbatim from the specification and the
constitution; where a task appears to conflict with one of these, the constraint wins and the task is
wrong.

| Constraint | Value | Source |
|---|---|---|
| Node / TypeScript | Node 22, TypeScript 5.x, ES2022 modules, `.js` extensions on relative imports | Existing workspace |
| Migration number | **`0005`**, exactly one. Never renamed to resolve a conflict. Nothing under `migrations/meta/` hand-edited | FR spec, roadmap, migration README |
| New tables / columns | **Zero.** Both structural guards must pass with no new allow-list entry | data-model.md |
| Caching | **None.** 005's caching decorator is not used, extended, or configured by this feature | FR-466 |
| Ranking inputs | Only data the card itself displays. Never saved sessions, notes, or message activity | FR-413 |
| Response contents | No `email`, no verification state, in any field, count, ordering effect or timing difference. `additionalProperties: false` on every new response | FR-406 |
| Directory disclosure | Membership of the discoverable-and-verified set, and nothing further. No total, no withheld count, no cause distinction | FR-404 |
| Pagination guarantee | No duplicate, ever. Omission permitted — forbidding it needs a snapshot FR-466 refuses | FR-410a |
| 007/008 actions | No message, share-card or schedule control ships. No dead and no permanently-disabled control | FR-434, roadmap rule |
| Responsive floor | **No horizontal scrolling at 320px**, anywhere, for any content or primary action | Principle IV |
| Modal behaviour | Native `<dialog>` + `showModal()`; Escape dismissal; focus confined while open; focus explicitly restored to the opener | Principle IV, 005 precedent |
| Home cards | Contribute one card by appending one line. Never edit, reorder, read from, or depend on another feature's card | Standing decision 9 |
| Data access | Components call repositories only. No component learns that a network exists | Principle V |
| Scale target | **1,000 registered attendees per conference** — the figure every performance criterion is measured at | FR-401c |
| Avatar production | One decode-resize-re-encode path in `images/avatar.ts`, no `withMetadata()`. No second production path | FR-458 |
| Amendment | **Discharged.** Constitution **v3.0.0** supersedes all three departures, including 001's FR-066/SC-011. Merge is no longer blocked on it | Principle I |

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — see the bottom of this section.*

| Principle | Gate | Status |
|---|---|---|
| **I. Requirements define the product** | No register entry closed by inference; departures recorded | **PASS with declared violations.** Three departures are recorded in the spec with quoted wording, and an amendment is a merge prerequisite. See Complexity Tracking |
| **II. Prototype is reference, not architecture** | No prototype structure carried forward | **PASS.** Discover's cards take the prototype's visual language; none of its state model, file layout or hardcoded data |
| **III. Attendee experience first** | Attendee remains the only actor; no organizer surface | **PASS.** The directory reads attendee-authored profiles. No admin interface, no privileged role, no content import. Seeded conference content is unchanged |
| **IV. Accessibility and responsiveness** | Three layouts, labels, focus, keyboard, Escape | **PASS.** Declared per surface in the spec's Principle IX table. The profile view reuses 005's `<dialog>` + `showModal()` pattern, including explicit focus restoration |
| **V. Abstraction before platform and data APIs** | Components call repositories, never the network | **PASS, and strengthened.** A new `DirectoryRepository` (D1); avatars stay data URLs so presentation code never learns a network exists; D10 removes fifteen casts that were eroding this boundary |
| **VI. Web-first delivery** | Offline behaviour specified per feature | **PASS.** Specified as a refusal, with the reason (FR-466–FR-468). No Capacitor trigger fires |
| **VII. Verified on Linux CI** | Full gate list runs; migration verified before real data | **PASS with a declared violation.** Every correctness gate stays and `0005` is verified against a real database. **`deploy-preview` is removed**, which supersedes 001's FR-066/SC-011 and Principle VII's "a preview deployment". See Complexity Tracking |
| **VIII. Attendee data is personal data** | Identity + event scoping server-side; deletion and export covered | **PASS.** Three conditions in one query, branded scope, route audit. No new personal-data table or column; the one new artifact is reached by the existing deletion path (FR-460). FR-404 declares the listing's bounded disclosure rather than concealing it |
| **IX. Every feature declares its completeness** | All twelve declarations filled | **PASS.** Complete in the spec; no obligation deferred to a polish pass |

**Post-Phase 1 re-check**: unchanged. Phase 1 introduced no new table, no new column, no new device
capability and no new external dependency. D3's derived object key is what keeps the Principle VIII
row at PASS — a stored key column would have made a new column collecting attendee data, firing
`export-coverage.test.ts`. The three declared violations are unchanged in nature and scope.

## Project Structure

### Documentation (this feature)

```text
specs/006-discover-and-deployment-platform/
├── plan.md              # This file
├── research.md          # Phase 0 — D1–D14
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── directory.md
├── checklists/
│   └── requirements.md  # Spec quality + review-gate record
└── tasks.md             # Phase 2 — /speckit-tasks, not created here
```

### Source Code (repository root)

```text
apps/api/
├── migrations/
│   └── 0005_directory_indexes.sql          # NEW — 5 indexes + unaccent. No table, no column
├── src/
│   ├── db/
│   │   ├── queries/
│   │   │   └── directory.ts                # NEW — the listing: 3 conditions, search, filters,
│   │   │                                   #       overlap count, keyset bound, in one query (D12)
│   │   └── schema/
│   │       ├── events.ts                   # EDIT — registrations gains an event_id index; the
│   │       │                               #        "every read is the attendee's own" comment
│   │       │                               #        is now false and must change
│   │       ├── identity-tokens.ts          # EDIT — attendee_id index in the shared column factory
│   │       └── profiles.ts                 # EDIT — attendee_interests gains an interest index
│   ├── images/avatar.ts                    # EDIT — emit the 96px card rendition too (D2)
│   ├── routes/
│   │   ├── events/directory.ts             # NEW — GET /events/:eventId/attendees (D14)
│   │   ├── index.ts                        # EDIT — one appended import + one array entry
│   │   └── health.ts                       # EDIT — add /ready (FR-482); /health unchanged
│   ├── storage/                            # EDIT — derived card key convention (D3)
│   └── app.ts                              # EDIT — security response headers on API responses (D8)
└── Dockerfile                              # EDIT — header comment; the image itself is reused

apps/web/src/app/
├── destinations/Discover.tsx               # NEW — directory, search, filters, paging
├── discover/
│   ├── AttendeeCard.tsx                    # NEW
│   ├── AttendeeProfile.tsx                 # NEW — <dialog> + showModal(), 005's pattern
│   └── useDirectory.ts                     # NEW — paging + client-side de-dup (D4)
├── home/
│   ├── cards/PeopleToMeet.tsx              # NEW — its own card
│   └── registry.ts                         # EDIT — one appended line
├── navigation.ts                           # EDIT — Discover declares its element and :attendeeId
└── services.ts                             # EDIT — DirectoryRepository into the registry

packages/data/src/
├── interfaces/directory.ts                 # NEW — DirectoryRepository (D1)
├── http/directory-repository.ts            # NEW
└── {interfaces,http}/index.ts              # EDIT — one appended export each

packages/platform/
├── package.json                            # EDIT — @mynet/data as a devDependency (D10)
└── src/registry.tsx                        # EDIT — import type the real interfaces; delete
                                            #        Promise<unknown> mirroring

deploy/vm/                                  # NEW — modelled on mission-control/deploy/vm
├── README.md                               # Operator runbook; backup + rollback (FR-487, FR-489)
├── Caddyfile                               # Auto-TLS; file_server + SPA fallback; /api proxy (D6)
├── docker-compose.yml                      # caddy + api + postgres (loopback only)
├── _common.sh  provision-vm.sh  deploy.sh
├── backup.sh  verify-backup-local.sh       # Runs on the VM under cron
├── maintenance.sh  maintenance/index.html
└── envs/{uat,prod}.env

.github/workflows/verify.yml                # EDIT — delete db-branch, deploy-api, deploy-preview,
                                            #        schema-diff, cleanup; add deploy-uat and
                                            #        deploy-prod; recompose `verify` (D13)
```

**Structure Decision**: the existing pnpm monorepo is unchanged in shape. Every new client and API
file lands in the append-only registries 002 established — `routes/index.ts`, `interfaces/index.ts`,
`home/registry.ts`, `navigation.ts` — so no shared file is edited beyond a single appended line, and
006 contends with no other feature. The one genuinely new top-level directory is `deploy/vm`, which
is operator tooling rather than application code and is therefore outside the workspace packages.

## Complexity Tracking

> Three declared violations of the constitution **as it read at v2.3.0**. All three are the same
> owner decision seen from three angles.
>
> **All three are now discharged by constitution v3.0.0** (2026-08-07), which supersedes the
> "managed PostgreSQL" constraint, narrows Principle VII's pipeline requirement, and withdraws 001's
> FR-066 and SC-011 explicitly while carrying FR-067 forward. The table is retained because the
> trade-offs it records are still the reasons — and because the third row's cost is real and
> unrecovered.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **PostgreSQL as a container, against "managed PostgreSQL"** (Technology Constraints; standing decision 4) | The owner chose the mission-control pattern, which is fixed-cost and already proven in another project of theirs. It gives per-environment isolation by construction and adds no vendor | A managed instance (Azure Database for PostgreSQL Flexible Server) would honour the wording with no amendment, at roughly $12–25/month per environment and a second thing to provision. Rejected by owner decision, not by analysis — recorded so the trade is visible rather than implied |
| **One long-lived UAT environment, against `CLAUDE.md`'s "preview deploy on every change"** | Per-PR environments on Fly + Pages are what created the cross-site cookie defect; a UAT VM identical to production means what is tested is what ships | Keeping per-PR previews *and* adding the proxy would preserve branch isolation, but preview and production would then differ in topology, hosting and database — so a preview would prove progressively less about production |
| **001's shipped FR-066 and SC-011 are withdrawn** — a reviewer no longer gets a preview of *that exact change* | `deploy-preview` is that guarantee's only implementation, and it is a Cloudflare Pages job. It cannot survive the move | **This is the one with a real, unrecovered cost.** Nothing in this plan restores per-change reviewability. The amendment must state what replaces it — review against UAT after merge, a locally reproducible stack, or an accepted reduction. This plan does not choose, because it is not the plan's to choose |

**Not a violation, recorded to prevent misreading**: the `verify` aggregate check going green is
*not* a weakened gate. Five jobs are deleted because the vendors they serve are gone; every check
that verifies correctness remains, and `test-e2e` was confirmed to run against a service container
rather than the preview. Register entry 17's remaining half is resolved by replacement (D13).
