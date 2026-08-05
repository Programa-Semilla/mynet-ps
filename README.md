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

| Requirement   | Notes                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Node 22+      | Enforced by `engines` in the root `package.json`                                                |
| pnpm 9+       | The only supported package manager. `corepack enable` will provide it                           |
| PostgreSQL 17 | A personal Neon branch or a local instance. **Never** an environment holding real attendee data |

Local development never needs access to real attendee data, and is not permitted to (FR-007).

## Setup

```bash
git clone <this repository> && cd mynet-ps

# Guardrails: blocks direct commits and pushes to main and develop. Once per clone —
# core.hooksPath is local configuration and cannot be committed.
git config core.hooksPath .githooks

pnpm install
cp .env.example .env        # then fill it in; see the comments in that file
```

If you do not already have PostgreSQL running:

```bash
docker run --name mynet-pg -e POSTGRES_PASSWORD=mynet -e POSTGRES_USER=mynet \
  -e POSTGRES_DB=mynet_dev -p 5432:5432 -d postgres:17
```

Then:

```bash
pnpm db:migrate             # apply the committed migrations in order
pnpm db:seed                # two attendees with different event registrations
```

Once, to run the end-to-end suite — it downloads a browser into a shared cache, so it is a
no-op if you already have one:

```bash
pnpm exec playwright install chromium
```

`.env` is read automatically by every command below. There is no step where you have to export
it into your shell — if you find one, that is a defect in this document.

**`db:seed` creates two attendees on purpose.** One attendee cannot demonstrate isolation, and
isolation is the central claim of this slice. Both use the password
`correct-horse-battery-staple`:

| Email               | Registered for                             |
| ------------------- | ------------------------------------------ |
| `ada@example.com`   | Product & Design Summit, Frontend Horizons |
| `grace@example.com` | Product & Design Summit, Systems & Scale   |

They share one event and differ on the other. The shared one shows that the isolation boundary is
the _registration_ rather than the event; the differing one shows that the boundary holds.

> **Never run `drizzle-kit push`**, in any environment including your own machine. It changes a
> database without producing a reviewable migration. If it appears in a `package.json` script,
> that is a defect.

## Run

```bash
pnpm dev            # API and client together
pnpm dev:api        # API alone, on :3000
pnpm dev:web        # client alone, on :5173
```

## Verify

```bash
pnpm verify         # everything the pipeline runs, in the same order
```

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
