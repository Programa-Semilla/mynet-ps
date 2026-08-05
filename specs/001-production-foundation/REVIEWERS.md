# Review Guide: Production Foundation Slice

**Generated**: 2026-08-04 | **Spec**: [spec.md](spec.md)

## Why This Change

MyNet has no production code. The repository holds an approved requirements document and a Figma
Make prototype — a 1,400-line single file with hardcoded colours, hand-inlined SVG, no TypeScript
config, no tests, no lockfile, and a mobile-only 390×844 frame. It validated the product direction
and validated nothing about how to build it.

There is a second, larger reason this change exists. The prototype demonstrated the product as a
**stateless front-end demo**, and `requirements.md` describes it that way. During this work the
project owner decided that framing was an artifact of prototyping, not a decision anyone made:
MyNet is the real product, with durable server-side data and real authentication. That decision was
ratified as **constitution v2.0.0 (MAJOR)** and is the reason this slice includes a database and an
API at all.

## What Changes

This adds the first production code as a **vertical walking skeleton**: an attendee signs in, the
browser calls a project-owned API, the API queries PostgreSQL scoped to that attendee's identity, and
a responsive shell renders who they are and which events they are registered for — across five
individually addressable destinations that deliberately carry no content yet.

Every layer is exercised end to end on day one. Later slices add content through seams that already
exist, rather than retrofitting authentication and data isolation into a product that grew without
them.

**Breaking changes**: none in the code sense — there is no prior code. But this PR carries a
**MAJOR constitution amendment** that invalidates the 1.x stateless-demo boundary, and it knowingly
diverges from `GroundZero/requirements.md` on five points: product name (MyNet, not EventLink),
delivery mode, persistence, authentication, and routing. Each divergence is a recorded owner
decision with a date, not an inference. Reviewing the constitution diff matters more than reviewing
any single artifact here.

## How It Works

A single pnpm workspace holds two deployables and shared packages:

- **`apps/web`** — React + TypeScript on Vite. Five addressable routes, three responsive layouts
  (bottom nav under 768px, reduced rail to 1279px, persistent rail above), design tokens in exactly
  one file, and an installable PWA shell.
- **`apps/api`** — Fastify on Node. Route JSON Schemas serve double duty: they validate requests at
  runtime *and* `@fastify/swagger` derives the OpenAPI contract from them, so contract and validation
  cannot drift apart.
- **`packages/platform`** and **`packages/data`** — the two abstraction layers Principle V requires.
  Six device capability interfaces and repository interfaces in domain terms, injected as one
  `PlatformServices` registry at the root.
- **PostgreSQL on Neon**, accessed through Drizzle, with generated SQL migrations committed for
  review.

Three implementation details carry most of the safety:

1. **Identity is bound at the request boundary, and no repository method accepts an attendee
   identifier.** A handler therefore *cannot express* "read another attendee's data". Cross-attendee
   isolation is structural rather than a rule someone has to remember.
2. **The credential hash lives in its own table**, so it never rides along in a general attendee
   query and cannot be accidentally serialised into a response.
3. **API responses are never precached.** Offline shows the shell and refuses server-dependent
   actions rather than serving stale attendee data — which also means sign-out leaves nothing behind.

**Neon database branching** is the single decision doing the most work: a branch per pull request
gives preview isolation and clean-database migration verification with one mechanism.

## When It Applies

**Applies when**:

- Any work touching authentication, sign-in sessions, or attendee identity
- Any work reading or writing attendee-owned data — the identity-scoping rule is absolute
- Any UI work — design tokens, focus behaviour, and the three layouts are established here
- Any schema change — migrations are versioned, committed, and reviewed from this point on
- Any change at all, since the eleven CI gates apply to everything after this lands

**Does not apply when**:

- Building destination content — sessions, attendee cards, threads, appointments. Deferred to the
  slices that own them; the seams exist so they plug in without restructuring.
- Building sign-up, password reset, or account recovery. Accounts are provisioned administratively,
  an **interim assumption** pending the client's answer on the identity model.
- Organizer administration or payments — out of *product* scope per Principle III, not merely
  deferred.
- Notification delivery or calendar integration — the interfaces exist, the delivery deliberately
  does not.

## Key Decisions

1. **MyNet is the real product, not a demo.** Alternatives: keep the stateless demo scope and add
   persistence later. Chosen because the owner said so explicitly, and because retrofitting identity
   scoping into a product that grew without it is the one mistake this slice cannot recover from.
   Cost: a MAJOR constitution amendment and a spec rewritten from scratch.

2. **`requirements.md` is authoritative for WHAT, not HOW.** Its "single-route", "no durable
   storage", "no authentication" statements describe the prototype's construction. This is the
   reinterpretation that lets the product stay authoritative while the architecture serves it —
   **the single most consequential decision in this PR.**

3. **Custom API over managed PostgreSQL, rejecting a BaaS.** Supabase/Firebase would be materially
   faster to a working product. Chosen for portability and contract ownership, with the operational
   cost accepted knowingly — including three ephemeral resources per PR (see Areas Needing
   Attention).

4. **Node + Fastify, rejecting Cloudflare Workers.** Workers would have unified hosting with the
   Pages client and Hono is runtime-portable. Rejected because Argon2id is *deliberately*
   CPU-expensive and edge runtimes cap CPU time — one requirement (FR-031) decided the runtime.

5. **Self-implemented authentication with opaque server-side sessions.** A delegated provider would
   remove password handling and future recovery flows. Rejected because the spec's own requirements
   select server-side sessions anyway — revocation on sign-out, sliding expiry, per-device
   independence — and because the identity model is an unresolved *client* question that a provider's
   model would pre-empt. **Flagged: this reads reversible and is not.**

6. **Contract derived from the server, then committed.** The alternative — an authored schema as
   source of truth — was recommended and *not* chosen. The owner chose server-derived. Committing the
   generated artifact recovers most of what was given up: breaking changes appear in the diff instead
   of silently becoming the new contract.

7. **Sliding idle expiry, 14 days, no absolute ceiling.** Spans a multi-day conference without
   signing anyone out mid-event. Accepted cost: a regularly-used session never expires on its own.

8. **Throttle on identifier *and* source, with escalating delay and no lockout.** Lockout was
   rejected specifically because email is the identifier — a lockout would let anyone who knows an
   attendee's address deny them access.

## Areas Needing Attention

**Where reasonable engineers would disagree:**

- **Slice size.** 119 tasks spanning a client shell, an API, a schema, an auth flow, and CI. Single-PR
  delivery was agreed when this was frontend-only, before the database and auth entered scope. The
  phase boundaries in `tasks.md` are natural split points. **This is the most likely thing to push
  back on, and pushing back would be reasonable.**

- **Three ephemeral resources per pull request** — Neon branch, API deployment, Pages preview — all
  wired together. Recorded in plan.md Complexity Tracking. A shared preview API cannot work (one
  instance, many PRs, each needing its own branch), and a client-only preview cannot sign in. This is
  real operational complexity that a BaaS would have absorbed.

- **Self-implemented auth (Decision 5).** Password hashing, session lifecycle, throttling, and every
  future recovery flow become ours to own and get right. The reasoning is sound; the ongoing cost is
  real. If you disagree with anything, disagree with this.

- **No absolute session ceiling.** Deliberate, recorded as Open Question 18, but a defensible
  objection for a product holding private messages on mobile devices.

- **Contract changes are visible, not classified.** Nothing distinguishes additive from breaking
  (Open Question 19). A reviewer must judge that by eye.

- **No observability baseline beyond error recording and a health endpoint.** Deferred at the
  clarification question limit (Open Question 20), not overlooked — but a deployed API with no
  metrics is harder to operate than the plan admits.

**Assumptions that could be wrong:**

- **Administrative account provisioning.** If the client answers "self sign-up", sign-up,
  verification, and recovery are new work — not rework, but the shape of the auth surface changes.
- **Email as a globally unique identifier.** Correct if one person holds one account across events.
  Wrong if the client intends per-event identities.
- **Desktop and tablet layouts.** The approved prototype is mobile-only. This slice creates the first
  desktop and tablet experience this product has ever had, and **the client has approved neither.**

**Two accepted deviations from spec-quality convention**, both documented in
`checklists/requirements.md`: the spec names a technology stack (because the constitution already
fixed it — but no functional requirement does), and two success criteria are measured by code
inspection (because Principle V compliance is precisely what a green build cannot demonstrate).

## Open Questions

Twenty-one, carried deliberately and never silently resolved. The ones that most affect review:

**Need a client decision** — attendee identity model (how someone *becomes* an attendee); event
scoping of data; the connection model behind Network contacts; what a digital-card exchange records;
data retention, deletion, and export obligations; the real brand mark (none exists — icons ship
visibly provisional); how to reconcile `requirements.md` with the constitution; what "PS" means; and
client validation of the desktop and tablet layouts.

**Need an owner decision** — whether this ships as one PR (16); preview access control, since
Cloudflare Pages previews are public by default (15).

**Accepted residual risks** — no absolute session ceiling (18); contract changes unclassified (19).

**Deferred at the clarification limit** — observability baseline (20); reliability and availability
targets (21).

**Known and unresolved** — server-side branch protection returns 403 on this private free-tier
repository, so merge blocking rests on hooks that `--no-verify` bypasses (17). Materially more
serious now that real attendee data is in scope.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **The constitution v2.0.0 diff is reviewed on its own** — it redefines principles, and the rest of this PR follows from it
- [ ] **The five knowing divergences from `requirements.md` are acceptable** — name, delivery mode, persistence, authentication, routing
- [ ] The identity-scoping rule holds: no repository method accepts a caller-supplied attendee identifier
- [ ] No credential or session material can reach a response, a log, or the client bundle
- [ ] Every open question is genuinely open, not an unresolved decision in disguise

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
