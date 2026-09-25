# CLAUDE.md

Runtime guidance for Claude Code in this repository. **This file holds no rules.** MyNet is built
with Spec Kit, and in Spec Kit the rules live in one place — the constitution — where
`/speckit-plan` turns them into its Constitution Check gate and `/speckit-analyze` treats any
conflict with them as CRITICAL. Restating a rule here would create a second copy that drifts, and
an agent reading both could not tell which one wins. This file therefore says **where things are,
how to run them, and how work flows**, and points to the document that decides. The constitution
(G.5) forbids this file from carrying plans, session tasks, progress updates or invented
requirements.

## Read before working

| You are about to… | Read |
|---|---|
| do anything | `.specify/memory/constitution.md` — principles I–X, product rules P.*, architecture A.*, workflow W.*, and the Constitution Check |
| rely on or question a past owner decision ("decision N") | `docs/governance/decisions.md` |
| meet something undecided, or wonder whether it is | `docs/governance/open-questions.md` — **never resolve an entry silently** |
| start a feature | the roadmap, `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`, then `specs/` for its neighbours |
| touch an area a previous feature built | `docs/record/architecture-invariants.md`, and that feature's `specs/<nnn>/review-findings.md` and `deviations.md` |
| understand why a rule exists | `docs/record/constitution-history.md` (Part 3 has the full reasoning) |
| check WHAT the client asked for | `GroundZero/requirements.md` (WHAT binds, HOW does not — constitution I.1) |
| check how something should look or flow | `GroundZero/prototype/` (reference only — constitution II) |
| deploy, roll back or restore | `deploy/vm/README.md` (read section 6 before any rollback) and `deploy/vm/OPERATIONS-LOG.md` |

`docs/record/delivery-log.md` is the frozen feature-by-feature history through 2026-08-15.

## Repository layout

```
GroundZero/        requirements.md and the approved prototype (reference only)
apps/api/          Fastify + Drizzle over PostgreSQL; migrations in migrations/
apps/web/          MyNet — the attendee PWA (React + TypeScript)
apps/admin/        the separate administrative site (admin.<host>); no PWA, no @mynet/platform
packages/data/     repository interfaces, HTTP implementations, generated contract types
packages/platform/ device-capability and storage interfaces, web implementations, repository registry
packages/config/   shared TypeScript and Vitest bases
contracts/         generated, committed OpenAPI contract
deploy/vm/         the whole deployment platform: Caddy + API + PostgreSQL, provisioning, backups
e2e/               Playwright (Chromium, WebKit, Firefox)
scripts/           local-up, verify-clean, brand pipelines and audits, walk-record audit
brainstorm/        design sessions; idea-inbox.md for parked ideas
specs/             one directory per feature: spec, plan, tasks, quickstart, review findings, deviations
docs/governance/   living records: decisions, open questions
docs/record/       frozen history
```

## Commands

- `pnpm start` — API, MyNet and the admin site together, and prints a generated operator
  credential. Safe to rerun.
- `pnpm verify` — the full local gate (typecheck, lint, format, unit, component, contract, build,
  brand audit, …). `pnpm verify:clean` runs it against a database that has never existed.
- `pnpm test:unit | test:component | test:integration | test:e2e | test:a11y` — individual layers.
  Integration and e2e need PostgreSQL.
- `pnpm db:generate` / `db:migrate` / `db:seed`. **Before `db:generate`, move
  `apps/api/migrations/meta/README.md` aside** — `drizzle-kit generate` JSON-parses every file in
  `meta/` — and read it first: the journal's ordering is deliberate and must not be "fixed".
- `pnpm contract:generate` / `contract:check` — regenerate or verify the OpenAPI contract and client
  types. Never hand-merge generated files.
- `pnpm brand:generate` / `brand:audit` — brand asset pipelines and their build-output audit.

## How work flows

- **Spec Kit, in order**: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, then a deep review recorded in
  `specs/<nnn>/review-findings.md`. The spec template's **Feature Declarations** section is
  mandatory, and the plan must answer the constitution's Constitution Check.
- **Constitution changes** use `/speckit-constitution` in a PR of their own or the PR of the feature
  they gate. The PR description is the Sync Impact Report — not the file.
- **Branches**: from `develop`, `<type>/<short-description>`, PR against `develop`, squash merge.
  Never commit to `main` or `develop`. Once per clone: `git config core.hooksPath .githooks`.
- **Shared numbers collide** because parallel branches cannot see each other: constitution version,
  decision number, open-question number, feature number, migration number and brainstorm session have
  all collided before. Check every branch in flight before claiming one. Migration `0010` is
  permanently unclaimed.
- **By-hand validation** (`quickstart.md`) needs a person and often a phone. Say plainly when it has
  not been walked; never report it as passed from green tests.

## Engineering know-how

Implementation facts that are not rules but that the next change will trip over. Reasoning for each
is in `docs/record/architecture-invariants.md` or the named feature's review findings.

- **Dialogs**: Tailwind Preflight's `margin: 0` pins a `showModal()` dialog to the top-left; the base
  rule in `apps/web/src/theme/tokens.css` re-centres it. React delivers a nested dialog's `cancel` to
  ancestor handlers — compare `event.target`. Restore focus to the opener *after* closing. jsdom has
  no top layer, so dialog stacking needs e2e.
- **Caching decorator** (`packages/data/src/http/cached.ts`): any method not named in `reads` is
  treated as a write and purges the conference prefix; a live read needs `passThrough`. Handlers bind
  to `target`, because HTTP repositories hold `#private` fields a Proxy cannot carry — which is why
  its test double is a class with a private field.
- **Hook state in handlers is stale**: a write resolves to whether the server accepted, and a late
  success clears a field only if it still holds what was posted.
- **Polling** goes through `usePoll`; the conversation list pauses via `useDisplayed` (size
  observer), not on viewport width. `IntersectionObserver` was rejected: its root is the viewport.
- **The message cursor carries microseconds**; the wire carries milliseconds.
- **PostgreSQL `trim()` strips spaces only** — use `btrim(x, E' \t\n\r')` to match JavaScript.
- **`fastify.inject()` performs no CORS preflight**: a missing method in `app.ts`'s list is found only
  by a real browser. Each method there names its callers.
- **Integration files run in size order**; a file that depends on the seed calls `resetDatabase()` in
  `beforeAll`.
- **The seed clears the whole Network domain**, because `shared_cards.event_id` is
  `ON DELETE NO ACTION`.
- **Web Push needs a service worker in dev**: `main.tsx` registers `apps/web/src/sw.ts` explicitly,
  and the worker carries the API denylist so the HTML shell is never served for an API request.
- **Layout assertions measure the element itself** (e.g. the admin nav's own `scrollWidth`), because
  document-level overflow cannot see an inner scroll container.

## Product in one paragraph

MyNet is a multi-event attendee engagement and networking platform: an authenticated attendee
workspace with five destinations — **Home** (what's next, who to meet), **Agenda** (programme, saved
and enrolled sessions, notes, Q&A), **Discover** (attendee directory), **Messages** (1:1 threads) and
**Network** (held cards and appointments). A separate administrative site serves platform operators
and conference organizers. Domain terms — event, session, track, saved session, profile, intent,
availability, digital business card, appointment, conversation, Q&A, "Up next" — are used in the
constitution's sense; `GroundZero/requirements.md` defines them for WHAT.
