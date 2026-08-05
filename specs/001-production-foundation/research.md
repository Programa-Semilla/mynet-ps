# Phase 0 Research: Production Foundation Slice

**Feature**: 001-production-foundation | **Date**: 2026-08-04 | **Constitution**: v2.0.0

Resolves every technical unknown left open by `spec.md`. Each decision names what was chosen, why,
and what was rejected. Decisions are marked **sticky** (expensive to reverse after data or code
exists) or **reversible** (a later change costs little).

Three decisions were verified against current vendor documentation rather than recalled, because
they are load-bearing and the platforms move: Neon branching, Drizzle migrations, and Fastify
OpenAPI generation. Sources are cited inline.

---

## D1 — Repository shape: single repository, workspace-based *(sticky)*

**Decision**: One repository containing `apps/web`, `apps/api`, and shared packages, using package-manager workspaces.

**Rationale**: FR-044b requires the pipeline to fail when the committed API contract does not match
what the server generates. That check needs client and server in one CI run, on one commit. Splitting
repositories would mean cross-repository contract synchronisation on the first day of the project,
for a team of one. The constitution's PR-only flow also assumes a single review surface.

**Alternatives rejected**: Separate `mynet-web` and `mynet-api` repositories — genuine independence,
but the contract check becomes a scheduled cross-repo job and every contract change becomes two PRs.
Revisit if the API acquires consumers beyond this client.

Resolves Open Question 10.

---

## D2 — Package manager: pnpm *(reversible)*

**Decision**: pnpm with workspaces. Lockfile committed (FR-002).

**Rationale**: Workspace support is first-class, the store is content-addressed so a monorepo with two
apps installs quickly in CI, and the prototype already carries a `pnpm-workspace.yaml`. Strict
by default about phantom dependencies, which suits a project that must justify every dependency
(FR-003).

**Alternatives rejected**: npm workspaces (viable, slower installs, laxer hoisting); Yarn (no
advantage here); Bun (attractive but adds runtime risk to the one thing that must be boring).

Resolves Open Question 14.

---

## D3 — Client: React + TypeScript on Vite, with a routing library *(sticky for React/TS, reversible for build tool)*

**Decision**: React + TypeScript, bundled by Vite, with a client-side router providing five
addressable routes (FR-013).

**Rationale**: React + TypeScript is fixed by the constitution. Vite is the prototype's build tool,
has first-class PWA and test integration, and produces the static output Cloudflare Pages serves.
A router is required by FR-013/FR-014/FR-015 — direct address entry, history traversal, and a
not-found view.

**Note on framework choice**: a meta-framework (Next.js, Remix) was considered and rejected. MyNet's
API is a separate service by constitutional decision, so the server-rendering and server-action
features that justify a meta-framework would sit unused, while adding a second server to deploy.

---

## D4 — API: Node + TypeScript + Fastify *(sticky)*

**Decision**: A Node runtime API service written in TypeScript using Fastify.

**Rationale**: Three requirements pushed this decision together.

1. **FR-044a wants the contract derived from the implementation.** Fastify routes declare JSON Schema
   for params, body, and responses; `@fastify/swagger` transforms those registered route definitions
   into a complete OpenAPI document via `fastify.swagger()`. The contract is therefore *generated
   from the server*, which is exactly the shape chosen in clarification 5 — not an authored artifact
   the implementation might drift from. (Source: `@fastify/swagger` docs, OpenAPI spec generation.)
2. **The same schemas validate requests at runtime**, so contract and validation cannot diverge.
3. **FR-031 requires non-recoverable credential storage**, which means a deliberately CPU-expensive
   password hash. A conventional Node process has no per-request CPU ceiling.

**Alternatives rejected**:

- **Hono on Cloudflare Workers** — appealing, because it would unify hosting with Cloudflare Pages and
  Hono is runtime-portable. Rejected because edge runtimes impose CPU-time limits that fight directly
  with intentionally-slow password hashing (FR-031), and because pooled long-lived PostgreSQL
  connections do not fit the model. Reconsider if authentication is ever delegated (which would
  remove the hashing) — the client-side decisions here do not preclude it.
- **Express** — familiar, but has no schema-first story, so the contract would have to be authored
  separately and could drift, contradicting the clarification.
- **NestJS** — capable, but a large framework commitment for an API with roughly a dozen endpoints.

---

## D5 — Database: PostgreSQL on Neon *(sticky for PostgreSQL, moderately sticky for provider)*

**Decision**: Managed PostgreSQL hosted on Neon.

**Rationale**: PostgreSQL is fixed by the constitution. Neon is chosen for one specific capability
that maps onto two requirements at once: **database branching**. Neon publishes GitHub Actions
(`neondatabase/create-branch-action@v5`, `neondatabase/delete-branch-action@v3`) that create a branch
per pull request on open/reopen/synchronize and delete it on close.

This means:

- **FR-067** (preview environments MUST NOT be connected to real attendee data) is satisfied
  structurally — each PR gets its own database, not a shared one someone might point at production.
- **FR-038** (every migration verified against a clean database before reaching real data) is the
  same mechanism, not a second one.
- Bonus: `neondatabase/schema-diff-action@v1` posts the schema difference as a PR comment, which
  directly serves the constitution's requirement that migrations be *reviewed*.

(Source: Neon GitHub integration and branching-with-GitHub-Actions guides.)

**Alternatives rejected**: Supabase used purely as a Postgres host (branching story less direct, and
its main draw is the BaaS layer the owner explicitly rejected); Railway/Render Postgres (fine
databases, no per-PR branching, so preview isolation would need building by hand); self-managed
Postgres (operational burden with no upside at this stage).

Resolves the database half of Open Question 11.

---

## D6 — Data access and migrations: Drizzle ORM + drizzle-kit *(sticky)*

**Decision**: Drizzle ORM for queries, drizzle-kit for migration generation. Generated SQL migration
files are committed.

**Rationale**: `drizzle-kit generate` produces versioned SQL files into a configured `out` directory;
those files are ordinary reviewable SQL, and `drizzle-kit migrate` (or the runtime `migrate()` helper)
applies them in order. That is precisely FR-037 — versioned, committed, applied in a defined order —
and the artifacts are readable in a diff, which ad-hoc schema syncing is not.

**Explicit prohibition**: `drizzle-kit push` applies schema changes directly to a database without
producing a migration file. That is the "ad-hoc changes to a live database" the constitution
prohibits. It MUST NOT be used in any environment, including local development, so that local and
production schemas are reached by the same reviewed path.

(Source: Drizzle ORM migration docs — generate/migrate workflow and `drizzle.config.ts` shape.)

**Alternatives rejected**: Prisma (excellent DX, but its schema DSL and migration engine own more of
the model than a project claiming contract ownership wants, and its generated client is heavier);
Kysely + hand-written migrations (fine, more boilerplate, no schema-derived types);
raw `pg` + SQL files (maximum control, no type safety, rejected because FR-001 wants types enforced).

---

## D7 — API contract artifact: generated, committed, diff-checked *(reversible)*

**Decision**: `fastify.swagger()` output is written to `contracts/openapi.json` at build time. The file
is committed. CI regenerates it and fails if it differs from the committed copy.

**Rationale**: Implements clarification 5 (server-derived) plus FR-044b (changes visible in review).
The server remains the source of truth — the committed file is a snapshot, never an input. A
developer who changes a response shape must commit the regenerated contract, which puts the change in
the diff where a reviewer sees it.

**Known limitation, recorded as spec Open Question 19**: this makes contract changes *visible* but
does not classify them as breaking versus additive. A future addition could diff semantically and
fail only on breaking changes; not in this slice.

---

## D8 — Authentication: self-implemented, opaque server-side sessions *(sticky)*

**Decision**: Authentication is implemented by this project rather than delegated. Sign-in issues an
opaque, high-entropy session token stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The token
is a lookup key into an `auth_sessions` table. Passwords are hashed with **Argon2id**.

**Rationale**: The spec's own requirements select this design almost completely.

| Requirement | Why opaque server-side sessions |
|---|---|
| FR-027 — sign-out MUST invalidate server-side | A row is deleted. With a stateless JWT this needs a denylist, i.e. server state anyway |
| FR-028a — sliding idle expiry | `last_used_at` is updated per request; trivially server-side |
| FR-028b — expiry enforced server-side | The session is read from the database on every request by construction |
| FR-029 — independent per-device sessions | One row per device |
| FR-026 — tampered sessions refused | An opaque random token is unforgeable; nothing is client-parseable |

`HttpOnly` keeps the token out of JavaScript, which matters because FR-045 forbids feature code from
touching platform storage anyway.

**Argon2id** is chosen over bcrypt for memory-hardness; the CPU/memory cost is the point, and D4's
choice of a conventional Node runtime is what makes it affordable.

**Alternatives rejected**: JWT access tokens (revocation requires server state, defeating the only
reason to choose them); a delegated provider such as Auth0/Clerk/WorkOS (removes hashing and future
recovery flows — genuinely attractive — but adds a vendor to a stack whose stated rationale is
portability, and the identity model is an unresolved *client* question, so committing to a provider's
model now would pre-empt it).

Resolves Open Question 12. **Flagged for owner confirmation**: this is the most reversible-sounding
decision that is actually sticky, because it shapes the attendee table and every later recovery flow.

---

## D9 — Sign-in throttling: database-backed attempt counters *(reversible)*

**Decision**: Failed sign-in attempts are recorded in the database, keyed separately by normalised
identifier and by request source. Delay escalates with consecutive failures. No lockout.

**Rationale**: FR-031a requires throttling on both dimensions, and FR-031b forbids permanent lockout.
An in-process counter would be wrong the moment the API runs more than one instance, and would reset
on deploy. The database is already a hard dependency, so it costs nothing extra and is correct across
instances.

**Parameters** (initial values; tunable without schema change): escalating delay after 3 consecutive
failures for an identifier, growing to a ceiling that caps sustained guessing at roughly 10 attempts
per hour. Source limits are set an order of magnitude higher than identifier limits, because a
conference venue puts hundreds of legitimate attendees behind one public address — the edge case the
spec names explicitly.

---

## D10 — Abstraction layer shape: one injected registry *(reversible)*

**Decision**: A single `PlatformServices` registry object holds all six device capability
implementations and all repository implementations. It is provided once at the application root
through React context and consumed through small typed hooks.

**Rationale**: One provider rather than eleven nested ones. Tests substitute the whole registry in one
line, which is what FR-047 and User Story 5's independent test actually require. Typed hooks
(`useAttendeeRepository()`) mean feature code never sees the context object, so the shape can change
later without touching components.

**Alternatives rejected**: a context provider per service (deeply nested tree, eleven substitutions
per test); a module-level singleton (simplest, but substitution requires module mocking, which
couples tests to the bundler and makes FR-047 awkward to demonstrate).

Resolves Open Question 13.

---

## D11 — Testing: Vitest, Testing Library, Playwright *(reversible)*

**Decision**:

| Layer | Tool | Satisfies |
|---|---|---|
| Unit | Vitest | FR-005 unit |
| Component | Vitest + React Testing Library | FR-005 component |
| Integration (API + real database) | Vitest + `fastify.inject()` against a Neon branch | FR-005 integration, FR-069 |
| End-to-end browser | Playwright | FR-068 |
| Accessibility | `@axe-core/playwright`, run inside the Playwright suite | FR-035-equivalent, SC-005 |

**Rationale**: One test runner and one assertion style across unit, component, and integration keeps
the mental model small. `fastify.inject()` exercises the real routing, validation, and auth stack
without binding a port. Running axe inside Playwright means accessibility is checked against the
actually-rendered application at real viewport sizes, which is what SC-005 asks for — a static
checker could not see focus indicators or responsive layout.

---

## D12 — Styling and design tokens: Tailwind CSS v4 with CSS-first tokens *(reversible)*

**Decision**: Tailwind v4, with the approved palette, typography, spacing, and radii declared once as
CSS custom properties in a single theme file. A lint rule bans colour literals outside that file.

**Rationale**: FR-008 requires tokens in one place and no colour literals in components; SC-009
requires that count to be zero. Tailwind v4's CSS-first theme configuration gives exactly one file to
point at, and the lint rule makes SC-009 machine-checked rather than review-dependent. The prototype
already uses Tailwind v4, so the visual reference translates directly.

**Alternatives rejected**: CSS Modules with custom properties (equally valid, more hand-written
plumbing); a CSS-in-JS library (runtime cost, and the prototype's visual language does not need it).

---

## D13 — Icons: one icon set *(reversible)*

**Decision**: `lucide-react`, used for every interface icon.

**Rationale**: FR-010 requires a single consistent set and prohibits hand-inlined one-off SVG — which
is exactly what the prototype does. Lucide is already a prototype dependency, is tree-shakeable, and
its stroke-based style suits the editorial aesthetic.

---

## D14 — PWA: Vite PWA plugin with versioned precache *(reversible)*

**Decision**: `vite-plugin-pwa` (Workbox) generating the manifest and a precache manifest with
content-hashed asset names.

**Rationale**: Content-hashed precache entries give FR-055 (a new deployment supersedes stale assets)
without hand-written cache-versioning logic. The offline shell (FR-051) is a precached application
shell with a navigation fallback.

**Caching policy, stated explicitly because the constitution requires offline behaviour to be
bounded**: the application shell and static assets are precached; **API responses are never
precached**. Consequently, offline shows the shell plus the offline state (FR-052) and refuses
server-dependent actions (FR-053), rather than showing stale attendee data. This also gives FR-056
(no attendee data left on the device after sign-out) almost for free, since attendee data was never
written to a cache.

---

## D15 — Hosting: Cloudflare Pages for the client, Fly.io for the API *(reversible for API)*

**Decision**: Client on Cloudflare Pages (already decided during brainstorming). API on Fly.io,
deployed as a container.

**Rationale**: The API needs a conventional Node runtime with no hard CPU ceiling (D4, D8) and
persistent outbound connections to PostgreSQL. Fly.io runs containers close to the database region,
which keeps request latency dominated by application work rather than network hops.

**Alternatives rejected**: Cloudflare Workers (see D4 — CPU limits versus Argon2id); Render and
Railway (both entirely workable; Fly chosen for region control relative to the Neon region — reverse
this freely if you prefer either).

Resolves the hosting half of Open Question 11.

**Preview access control** (spec Open Question 15) is *not* resolved here. It remains open. What this
plan does provide is that preview environments are backed by ephemeral per-PR Neon branches (D5), so
a publicly-reachable preview URL exposes throwaway seeded data rather than real attendee data.

---

## D16 — Breakpoints *(reversible)*

**Decision**, as half-open intervals so exactly one layout matches any width (FR-019):

| Layout | Range |
|---|---|
| Mobile | `width < 768px` |
| Tablet | `768px ≤ width < 1280px` |
| Desktop | `width ≥ 1280px` |

Workspace content is constrained to a maximum readable measure and centred above roughly 1600px, per
the very-large-viewport edge case.

---

## D17 — Sign-in session idle window: 14 days *(reversible)*

**Decision**: A sign-in session expires after **14 days of inactivity**, sliding on each authenticated
request.

**Rationale**: FR-028a fixed the sliding behaviour and left the period to planning. Fourteen days
comfortably spans a multi-day conference plus the travel around it, so an attendee is never signed out
mid-event — the failure mode the option was chosen to avoid. It is short enough that a phone left in a
drawer stops being a live session within a fortnight.

**Recorded tension**: with no absolute ceiling (spec Open Question 18), a regularly-used session never
expires on its own. Shortening this value does not fix that; adding an absolute maximum would, and
that remains an open decision.

---

## D18 — Client asset budget: 200 KB gzipped for the shell *(reversible)*

**Decision**: The initial client JavaScript for the application shell is budgeted at **200 KB
gzipped**, enforced in the pipeline (FR-072).

**Rationale**: The shell is navigation, tokens, and an auth screen — no content, no data grids, no
charts. 200 KB is generous for that and still tight enough that the budget fails when someone adds a
heavyweight dependency, which is the entire purpose. Expect to raise it deliberately as destinations
gain content; a raise should be an explicit reviewed change, not a silent drift.

---

## Unknowns deliberately NOT resolved here

These are **client** decisions. Planning cannot resolve them, and this slice is structured so none of
them blocks it.

| Spec Open Question | Why it does not block |
|---|---|
| 1 — attendee identity model | Slice uses administrative provisioning, stated as an explicit interim assumption |
| 2 — event scoping of data | No content entities in this slice; `registrations` already relates attendee to event |
| 3, 4 — connection model, card exchange | Network content is out of scope here |
| 5 — retention, deletion, export | No deletion flows in this slice; recorded, not silently dropped |
| 6 — brand mark | Provisional placeholder icons, visibly marked |
| 7 — `requirements.md` divergence | Documentation reconciliation, not implementation |
| 8 — what "PS" means | Naming only |
| 9 — desktop/tablet never client-validated | The layouts are built to the written requirement; validation is a client review |

Also unresolved and outside planning's authority: **Open Question 20** (observability baseline) and
**Open Question 21** (reliability and availability targets), both deferred at the clarification quota.
D5's provider choice makes backups a provider feature rather than a build task, but no target is set.
