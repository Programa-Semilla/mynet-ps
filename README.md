# MyNet

A multi-event attendee engagement and professional networking platform. MyNet is an
**authenticated attendee workspace** — not a marketing site and not a generic enterprise
dashboard. It answers three questions, in this order of prominence:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

## What exists today

This repository currently contains the **production foundation slice**
([`specs/001-production-foundation/`](specs/001-production-foundation/)). That slice is
deliberately a walking skeleton with no product content:

**Built** — real sign-in over a project-owned API and managed PostgreSQL; sessions that survive a
browser restart and are revoked server-side on sign-out; every read scoped to the signed-in
identity and enforced by the server; five individually addressable destinations in a responsive,
accessible shell; an installable PWA whose offline behaviour is bounded and honest; both
abstraction layers; and a pipeline of eleven required checks.

**Not built** — conference sessions, attendee cards, message threads, appointments, search,
filters, notes, Q&A, card sharing, or meeting scheduling. The four destinations other than Home
render a heading and say so. There is no self-service sign-up or password reset; accounts are
provisioned administratively, which is an interim assumption pending an open client decision.
There is no brand mark — the icons are visibly provisional placeholders.

## Prerequisites

| Requirement | Notes                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| Node 22+    | Enforced by `engines` in the root `package.json`                                     |
| pnpm 9+     | The only supported package manager. `corepack enable` will provide it                |
| Docker      | `pnpm start` provisions PostgreSQL 17 with it. Supply your own instead if you prefer |

Local development never needs access to real attendee data, and is not permitted to (FR-007).

## Run it

```bash
git clone <this repository> && cd mynet-ps

# Guardrails: blocks direct commits and pushes to main and develop. Once per clone —
# core.hooksPath is local configuration and cannot be committed.
git config core.hooksPath .githooks

pnpm install
pnpm start
```

That is the whole thing. `pnpm start` creates `.env` if you do not have one, starts the shared
PostgreSQL container, creates this directory's own database, applies migrations, rebuilds the
database if you switched to a branch with a different migration history, seeds two attendees,
issues an administrative credential, starts all three servers, and prints the URLs once they
answer.

**Three servers, because administration is a separate product** (011): MyNet on 5173, the
administrative site on 5174, the API on 3000. Two ports locally stand in for the two hosts a
deployment uses — `admin.<host>` and `<host>` — which is a _different origin_ in exactly the way
that matters: its own storage, its own service-worker scope, and a cookie the browser will not
send to the other one.

**The administrative password is printed in the banner and stored nowhere.** The seed creates
operator identities with no credential on purpose — this repository is public, and a committed
administrative password is a published one — so `pnpm start` generates a fresh password per run
and hands it to the bootstrap. You will be asked to choose your own at first sign-in; after that,
re-runs stop printing one, because the bootstrap never resets a password an operator picked.
`pnpm start --reset-admin` issues a new one if you forget it, without rebuilding the database.

It is safe to run repeatedly. Every step checks its state before changing anything, so a second
run is never destructive. `pnpm start --reset` rebuilds the database from zero without waiting
for drift to be detected.

**Several instances at once.** The database name and all three ports come from the directory, so
each worktree gets its own — `git worktree add ../mynet-feature` then `pnpm start` there, and both
run side by side. The strip along the bottom of the page names the branch, instance, port and
database, so two tabs are never confused.

One caveat: every _clone_ is a main working tree, and every main working tree claims 5173/5174/3000.
Only linked worktrees are separated automatically. For a second clone, or if two directories ever
collide, `MYNET_PORT_OFFSET=10 pnpm start` moves one out of the way; `MYNET_DATABASE_NAME`
overrides the database.

**Seeded accounts.** Both use the password `correct-horse-battery-staple`:

| Email               | Registered for                             |
| ------------------- | ------------------------------------------ |
| `ada@example.com`   | Product & Design Summit, Frontend Horizons |
| `grace@example.com` | Product & Design Summit, Systems & Scale   |

They share one event and differ on the other. The shared one shows that the isolation boundary is
the _registration_ rather than the event; the differing one shows that the boundary holds.

Once per machine, before running the end-to-end suite — it downloads a browser into a shared
cache, so it is a no-op if you already have one:

```bash
pnpm exec playwright install chromium
```

<details>
<summary>Running the steps by hand</summary>

```bash
docker run --name mynet-pg -e POSTGRES_PASSWORD=mynet -e POSTGRES_USER=mynet \
  -p 55432:5432 -d postgres:17
cp .env.example .env         # then fill it in; see the comments in that file
pnpm db:migrate              # apply the committed migrations in order
pnpm db:seed                 # two attendees, plus operator identities with NO credential
pnpm dev                     # or dev:api / dev:web / dev:admin

# The administrative site needs a credential, which the seed deliberately does not create.
ADMIN_BOOTSTRAP_EMAIL=operator@mynet.invalid \
ADMIN_BOOTSTRAP_PASSWORD='<your choice, not committed>' \
pnpm admin:bootstrap
```

By hand you must also set `ADMIN_ORIGIN` in `.env` (`pnpm start` writes it to `.env.local` for
you). Without it the API allows no CORS origin for administrative routes, so the admin site loads
and every request it makes is refused **by the browser** while the server looks healthy.

`.env` and `.env.local` are read automatically by every command. There is no step where you have
to export them into your shell — if you find one, that is a defect in this document.

`.env.local` is generated by `pnpm start` and holds only the values this directory implies: the
database URL, all three ports, and the administrative origin. Your `.env` keeps the secrets and is never rewritten. Both are
gitignored. Load order is `.env.local`, then `.env`, then the real environment — and because
`process.loadEnvFile` will not overwrite an already-set variable, that order means the _first_
one loaded wins, with your shell beating both.

</details>

> **Never run `drizzle-kit push`**, in any environment including your own machine. It changes a
> database without producing a reviewable migration. If it appears in a `package.json` script,
> that is a defect.

## Verify

```bash
pnpm verify         # the checks the pipeline runs, in the pipeline's order
```

CI additionally verifies that migrations apply twice cleanly against a fresh database branch, and
deploys a preview. Neither is reproducible locally.

**Stop `pnpm start` first.** The end-to-end suite builds and serves both clients on the same ports
with `strictPort`, and starts its own API. With an instance running, `pnpm verify` fails at
`test:e2e` with `http://localhost:5173 is already used` (or 5174, for the administrative site) — a
confusing way to learn that the code was fine.

`pnpm test:integration` and `pnpm test:e2e` both truncate and re-seed the database they are
pointed at. That is your instance's database, not a scratch one.

Individually:

| Command                 | Covers                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`        | TypeScript across every package                                                                              |
| `pnpm lint`             | ESLint, including zero colour literals outside the token file and zero direct platform calls in feature code |
| `pnpm format:check`     | Prettier                                                                                                     |
| `pnpm test:unit`        | Single modules, no rendering and no I/O                                                                      |
| `pnpm test:component`   | Rendered components with dependencies substituted                                                            |
| `pnpm test:integration` | The API against a **real** database — no substitution of the data layer                                      |
| `pnpm test:e2e`         | Playwright against a production build, a real API, and a real database                                       |
| `pnpm contract:check`   | The committed OpenAPI contract, and the client types generated from it                                       |
| `pnpm build`            | Production build of both applications                                                                        |
| `pnpm budget`           | The client asset budget                                                                                      |

The end-to-end suite runs against `vite preview`, not the dev server, because the service worker
and the bundle only exist in a production build. It starts the API itself, and needs
`DATABASE_URL` — it will not skip if that is missing. A skipped check reporting success is the
failure the pipeline exists to prevent.

## Layout

```text
apps/
  web/          React + TypeScript client, installable as a PWA
    src/app/      root, router, destinations, composition root
    src/shell/    navigation rails, top bar, offline banner, not-found
    src/auth/     sign-in screen and client auth state
    src/theme/    tokens.css — the only file where a colour may be written
  api/          Fastify + TypeScript API
    src/routes/   route schemas — the contract's source of truth
    src/db/       Drizzle schema, queries, migrations, seed
    src/auth/     password hashing, session tokens, throttling
    migrations/   generated SQL, committed and reviewed

packages/
  platform/     six device capability interfaces + their web implementations
  data/         repository interfaces + the only code that constructs a request
  config/       shared TypeScript, ESLint, and Vitest configuration

contracts/      openapi.json — generated from the routes, committed, diff-checked
e2e/            Playwright specs, including accessibility
scripts/        asset budget, provisional icon generation
```

Two rules explain most of this shape:

- **Feature code reaches devices and data only through project-owned interfaces.** Components
  never call the network and never touch a browser API. A lint rule counts the violations and the
  required count is zero.
- **No repository method accepts an attendee identifier.** The server binds identity at the
  request boundary from the sign-in session, so the client has none to send and no parameter to
  send it in. That is what makes identity scoping structural rather than a rule to remember.

## Contributing

`main` and `develop` are protected. Branch from `develop` as `<type>/<short-description>`, open a
pull request against `develop`, and merge with squash.

Server-side branch protection is **not currently active** — see
[`.githooks/README.md`](.githooks/README.md) for what that means and how to enable it. The local
hooks are a guardrail against mistakes, not a security control.

## Where the decisions live

| Question                     | Answer                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| How work is done here        | `.specify/memory/constitution.md` — authoritative                     |
| What the product is          | `GroundZero/requirements.md`, read for **what**, not **how**          |
| What this slice does and why | `specs/001-production-foundation/`                                    |
| How it looks and behaves     | `GroundZero/prototype/` — approved reference, **not** production code |
| What is still undecided      | `CLAUDE.md` → "Open questions and known discrepancies"                |

Where sources conflict on a _what_, the discrepancy is recorded and settled with the client. It is
not resolved by assumption.
