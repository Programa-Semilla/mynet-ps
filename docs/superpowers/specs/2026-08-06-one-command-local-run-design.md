# One-command local run

**Date**: 2026-08-06 | **Branch**: `spec/production-foundation` | **Constitution**: v2.0.0

## Problem

Running MyNet locally takes six steps in the right order — start a container, copy `.env`,
migrate, seed, start two servers, remember which port — and the ordering only reveals itself when
one of them is skipped. Switching branches silently invalidates the database, and the failure
arrives later as a missing column rather than as an error at the point of the switch. Two
instances cannot run at once, so comparing a branch against `develop` means stopping one.

## Goal

`pnpm start` — idempotent, safe to run on a fresh clone, after a checkout, or twice in a row —
ending in a copy-pasteable URL. Multiple directories run in parallel without collision. Nothing
about which branch or database you are looking at has to be held in your head.

## Decisions

| Decision | Choice |
|---|---|
| Implementation | Node `.mjs` modules under `scripts/`, no new dependencies |
| Database naming | Sanitised directory basename — `/mnt/D/repos/mynet-ps` → `mynet_ps` |
| Postgres | One shared `mynet-pg` container on **:55432**, one database per directory |
| Ports | Main working tree keeps 5173/3000; linked worktrees get a hashed offset |
| Schema drift | Detect and rebuild automatically |
| Configuration transport | Generated, gitignored `.env.local` |
| Branch legend | Branch + instance, live-updating, dev-server only |

Rejected: a `docker-compose.yml` (per-directory database naming fights compose's project model, and
the script would still be needed for drift, `.env.local`, and the servers); a bash script (the repo
is Node everywhere, and drift detection is real logic).

---

## 1. Command surface

```bash
pnpm start            # ensure everything, then run
pnpm start --reset    # force the rebuild path without waiting for drift detection
```

`pnpm dev`, `pnpm dev:api`, and `pnpm dev:web` are unchanged — the raw escape hatch.

Once both servers answer, the banner is the whole point of the feature:

```
  MyNet is running

  →  http://localhost:5173

     branch    spec/production-foundation
     instance  mynet-ps
     database  mynet_ps on localhost:55432
     api       http://localhost:3000

  Sign in as ada@example.com or grace@example.com
  password: correct-horse-battery-staple

  Ctrl-C to stop.
```

Printed only after both ports actually respond, never before — a URL that is not yet serving is
worse than no URL.

## 2. Modules

Each is independently testable and has one job. `scripts/local-up.mjs` is the only one that
sequences anything.

| Module | Responsibility | Depends on |
|---|---|---|
| `scripts/local/instance.mjs` | Absolute path → `{ databaseName, portOffset, webPort, apiPort }` | nothing (pure) |
| `scripts/local/schema.mjs` | Classify drift; migrate, rebuild, or seed | `apps/api` migration list, database |
| `scripts/local/env-file.mjs` | Render and write `.env.local`; create `.env` when absent | filesystem |
| `scripts/local/postgres.mjs` | Ensure container, ensure database, wait for readiness | docker |
| `scripts/local/servers.mjs` | Spawn both dev servers, wait for readiness, print the banner | child processes |
| `scripts/local-up.mjs` | Orchestrates the above in order; owns exit codes and signals | all |

`instance.mjs`, `schema.mjs` (classification only), and `env-file.mjs` (rendering only) are pure
functions over their inputs. That is where the unit tests go.

## 3. Instance identity

**Database name** is the directory basename, lowercased, with every character outside `[a-z0-9_]`
replaced by `_`: `mynet-ps` → `mynet_ps`.

**Ports.** The main working tree — `git rev-parse --git-common-dir` resolving inside this directory
— keeps `5173` and `3000`, so existing bookmarks and the committed `.env.example` stay correct. A
linked worktree derives its offset from the first four bytes of `sha256(absolutePath)`, modulo 200,
giving `5173 + offset` and `3000 + offset`. Naming the hash matters: the value has to be stable
across Node versions and machines, which `Math.random` seeding or `String.hashCode`-style
arithmetic would not guarantee. The same directory always resolves to the same ports.

Before binding, both ports are checked. An occupied port fails with the port named and
`MYNET_PORT_OFFSET` suggested as the override.

**Accepted limitation**: two separate clones whose directories share a basename resolve to the same
database name. `MYNET_DATABASE_NAME` overrides. This is not engineered around — worktrees, the
actual use case, have distinct names by construction.

## 4. Postgres

A single container named `mynet-pg`, image `postgres:17`, published on **55432** rather than 5432 so
it cannot collide with a system Postgres. Created on first run, started if stopped, reused
otherwise. The per-instance database is created if it does not exist; the container itself is never
recreated implicitly, because that would destroy every other instance's data.

Readiness is `pg_isready` polled to a deadline, not a fixed sleep.

**The script refuses to run if `DATABASE_URL` in the real environment resolves to a non-localhost
host.** FR-007 says local development must never require access to a store holding real attendee
data; this makes that structural rather than a matter of care.

## 5. Schema drift

Compare the migration files committed in `apps/api/migrations/` against drizzle's applied-migrations
table:

| State | Action |
|---|---|
| Identical | Nothing |
| Committed set is a strict superset, in order | Apply the new migrations |
| Diverged — applied migration absent from the branch, or a file's hash changed | `DROP SCHEMA public CASCADE`, migrate from zero, re-seed |

Divergence prints one line stating that the database was rebuilt and why. Seeding runs when the
attendee table is empty, or after any rebuild.

`drizzle-kit push` is not used here or anywhere. Migrations are the only path a schema change
travels.

## 6. Configuration transport

`.env.local` is generated, holds only derived values, and is already covered by `.gitignore`
(`.env.*` and `*.local`):

```
DATABASE_URL=postgresql://mynet:mynet@localhost:55432/mynet_ps
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000
```

`.env` keeps the secrets and is never rewritten. When it is **absent**, the script creates it from
`.env.example`, generating a real `AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY` with
`crypto.randomBytes(48)`. This is what makes a fresh clone genuinely one command.

**Load order is reverse precedence.** `process.loadEnvFile` does not overwrite an already-set
variable, so loading `.env.local` *first* is what makes it win:

```js
loadIfPresent('.env.local')   // derived, per-instance — wins
loadIfPresent('.env')         // secrets and defaults
// the real process environment beat both, unchanged
```

Verified empirically before adopting. Two loaders change: `apps/api/src/env.ts` and
`e2e/support/env.ts`. Vite already loads `.env.local` natively via its `envDir`. The real
environment still winning is what keeps CI pointed at its own ephemeral branch (FR-067).

`apps/web/vite.config.ts` currently hardcodes `server.port` and `preview.port` to 5173; both become
env-driven so the e2e suite follows the instance.

## 7. Branch legend

Dev-server only, in two pieces.

**Vite plugin** (`apply: 'serve'`). Resolves the real HEAD path with `git rev-parse --git-path HEAD`
— required because a linked worktree's `.git` is a file, not a directory — watches it, and parses
`ref: refs/heads/<name>`, falling back to a short SHA when detached. Initial values are exposed
through a virtual module; changes are pushed over Vite's existing websocket. Checking out another
branch updates the strip with no restart and no reload.

**Two client files, split deliberately.** `DevLegend.tsx` is a presentational component taking
branch, instance, port, and database as props — it imports nothing environment-specific, which is
what makes it testable in the ordinary component suite. `mount.ts` is the only file that touches
the virtual module and the websocket, and it is what `main.tsx` dynamically imports behind
`if (import.meta.env.DEV)`.

Without that split the component test would fail: it would pull in the virtual module, which does
not resolve under Vitest because the plugin is not loaded there.

Vite substitutes `false` for `import.meta.env.DEV` at build time, so Rollup drops the import and
neither file enters the bundle. The virtual module also resolves only while serving, so removing
the guard fails `pnpm build` loudly rather than shipping a dev badge to an attendee.

Content: branch on the first line; instance name, web port, and database on the second. Clicking
collapses it to a corner pill, remembered in `localStorage`.

**One production-code cost, accepted deliberately.** At mobile widths the strip would cover
`MobileNav`, which is `fixed bottom-0` — covering the primary navigation exactly while testing the
mobile layout. So `tokens.css` gains `--spacing-dev-legend: 0px` and `MobileNav` and `AppShell`
offset by it, mirroring the existing `pb-(--spacing-bottom-nav)`. The production value is always
`0px`, so nothing moves. Two token references in shipped code, in exchange for a legend that does
not obstruct the layout it is helping you test.

Colours come from existing theme tokens. The `mynet/no-colour-literals` rule applies here as
everywhere; no exemption is added.

## 8. Failure handling

Every case below stops before starting anything, and names the remedy.

| Situation | Behaviour |
|---|---|
| Docker missing or daemon down | Named, with the manual `docker run` fallback printed |
| `.env` absent | Created from `.env.example` with generated secrets |
| Port already bound | Port named, `MYNET_PORT_OFFSET` suggested |
| Postgres not ready before the deadline | Fails with the tail of the container log |
| Migration fails | drizzle's error surfaced, non-zero exit, servers not started |
| `DATABASE_URL` resolves off-localhost | Refuses to run |

`Ctrl-C` stops both servers and leaves the container running — restarting it is cheap, stopping it
would only slow the next start.

## 9. Testing

| Layer | Covers |
|---|---|
| Unit | Path → database name and port offset, including sanitisation and worktree detection |
| Unit | Drift classification: `none` \| `ahead` \| `diverged`, including an edited migration |
| Unit | `.env.local` rendering |
| Unit | HEAD parsing: branch, detached, and worktree-file cases |
| Component | Legend renders branch and instance; collapse toggles and persists |
| E2E | The legend is **absent** — that suite runs against `vite preview`, a real production build |

`unitProject.include` in `packages/config/vitest.base.ts` gains `scripts/**/*.test.mjs`; tests sit
beside the modules they cover.

**Not automatically tested**: the orchestration itself — spawning docker, spawning servers. It is
verified by running it. A mock of docker would prove only that the mock was called.

## 10. Documentation

README's Setup and Run sections collapse to `pnpm start`, with the manual sequence retained below as
the escape hatch.

`specs/001-production-foundation/quickstart.md` is corrected in the same change. Eight defects, all
confirmed against a full local run on 2026-08-06:

1. `pnpm exec playwright install chromium` is never mentioned, so its own Scenario 9 (clean-clone
   reproducibility) fails as written.
2. No instruction for obtaining Postgres — superseded by `pnpm start`, which now provides it.
3. Seed credentials are absent, though Scenarios 1, 2, and 7 require signing in.
4. `pnpm build` is documented as running the asset budget. It does not; `pnpm budget` is separate.
   The command list also omits `pnpm format:check`, which `pnpm verify` and CI both enforce.
5. `pnpm dev` must be stopped before `pnpm verify` or `pnpm test:e2e` — Playwright uses
   `--strictPort` with `reuseExistingServer: false`, and the harness starts its own API. This is a
   real observed failure, not a theoretical one.
6. `pnpm test:integration` and `pnpm test:e2e` truncate and re-seed the database.
7. Scenario 6 cannot be performed as written: the only idle-window control is
   `AUTH_SESSION_IDLE_DAYS`, parsed by `positiveInt`, so one day is the minimum. The integration
   tests rewind `expiresAt` directly instead.
8. `pnpm verify` is described as everything CI runs in the same order. CI additionally has a
   migration-idempotence gate and a preview deploy, and the ordering differs.

## Out of scope

- Stopping or removing the container. `docker stop mynet-pg` is adequate and discoverable.
- Installing Playwright browsers. `pnpm start` runs the app; it is not a test bootstrap.
- Any change to the pipeline. The pipeline remains the gate (Principle VII); this changes only how
  a developer reaches a running application.
- Production or preview deployment. `.env.local` is a local-only mechanism.
