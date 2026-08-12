# Quickstart: 011 Administrative Foundation

**Phase 1 output.** Runnable validation that the feature works end to end.

**Read this first.** Every feature from 007 onward has shipped with its quickstart **unwalked** —
007's T148, 008's T148/T149, 009's T097 and 010's scenarios 5–9 are all still outstanding. That is
not a coincidence, and 008 is why it matters: the first human to open a dialog found it rendering in
**the top-left corner**, having passed 135 e2e tests, five review agents and CodeRabbit. **Layout is
the part of this product no gate examines**, and this feature adds an entire product of it.

Scenarios **1–7** are machine-checkable and should be automated. Scenarios **8–11** need a person and
a browser, and are the ones that historically do not get walked.

---

## Prerequisites

```bash
pnpm install
pnpm start
```

That is the whole of it. `pnpm start` brings up the API, MyNet **and** the administrative site,
migrating and seeding first when the database needs it, and **prints the administrative credential
in the banner**:

```
  →  http://localhost:5173          MyNet
  →  http://localhost:5174          Administration

  Administration at the second origin — a separate product, a separate session.

     operator@mynet.invalid
     password: y23x-yp3y-npdm
```

**The password is generated per run and stored nowhere** — not in `.env`, not in `.env.local`, not
in the repository. That is the point: `db/seed/operators.ts` creates operator identities with **no
credential** (FR-990) precisely because this repository is public, and a committed administrative
password would be a published credential for the tier that reads the abuse-report queue. The
generated one is handed to the existing `pnpm admin:bootstrap`, which carries FR-993's guard.

Three consequences worth knowing before you start:

- **You will be asked to choose a new password at first sign-in.** That is FR-992 working, not a
  fault — the initial credential was set *for* the operator, so it is not theirs yet.
- **A re-run will not print a password once you have chosen your own.** The bootstrap updates only
  `WHERE credential_is_initial = true`, so it never resets a password an operator picked; the banner
  says so instead of printing one that would not work. `pnpm start --reset-admin` issues a fresh one
  without rebuilding the database — `--reset` would, and would take every attendee and note with it.
- **The integration suite shares this database.** After `pnpm test:integration`, run `pnpm db:seed`
  before poking at the administrative site, or the operators table holds test fixtures.

The two commands this replaces still work and are what a deployed environment uses:
`pnpm db:migrate`, `pnpm db:seed`, then `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` with
`pnpm admin:bootstrap`. Establishing the credential is **a separate command by design** (research
R10), because `pnpm db:seed` deletes every attendee and re-inserts committed passwords, and
administrative credentials must not sit behind the least-guarded entry point in the project.

MyNet at `http://localhost:5173`, admin at `http://localhost:5174`. **Two ports locally stand in for
two hosts in deployment** — same-site is not reproducible on `localhost`, so the *cookie
independence* property (scenario 3) is only fully verified against a deployed pair of hosts. Say so
rather than assume the local run proves it.

`ADMIN_ORIGIN` is written into `.env.local` for the same reason the port exists. `app.ts` allows
CORS on administrative routes from `config.adminOrigin ?? false`, so without it every request the
admin client makes is refused **by the browser** while the server looks perfectly healthy. Deployed
environments do not set it, because Caddy makes those requests same-origin.

---

## Scenario 1 — Sign in, and the second actor exists *(US1, FR-910–919)*

1. Open the admin site. Sign in with the bootstrap credential.
2. **Expect**: forced credential replacement before any surface is reachable (FR-992).
3. Replace it; land on administrative home naming you and your tier.

**Also verify**: with `ADMIN_BOOTSTRAP_PASSWORD` unset and a fresh operator row, sign-in is
**impossible** — not defaulted, not generated, not logged (FR-991). These are two distinct outcomes
and SC-912 requires both.

### SC-900 — sign-in to queue, measured *(T153)*

SC-900 asks that a platform operator reach the report queue **in under 30 seconds** from opening
the administrative address. That is a *human task* time, so it cannot be asserted by a test without
becoming a different claim — but the part a machine can measure is worth having, because it is the
part that could regress silently.

**Method.** Five runs, each in a fresh browser context on an already-replaced credential (the
steady-state path, not the first-ever sign-in). The clock starts at `goto(admin origin)` and stops
when the first report row is visible, and it covers: document load, sign-in request, `/admin/me`,
navigation to Reports, and the queue's own fetch. Driven exactly as `e2e/admin-accessibility.spec.ts`
drives the same path, at 1440×900, against a local API and a local database.

**Measured 2026-08-11**: samples 374, 381, 349, 365, 373 ms — **median 373 ms**, range 349–381 ms.

**What it means.** The machine-observable path is roughly **1%** of SC-900's budget. The other ~29.6
seconds are a person typing an address, an email and a password, and finding the queue — so SC-900
is met with an enormous margin locally, and what the number is actually good for is the next
reading: a median in the *seconds* would mean something had gone wrong (an unindexed query as the
queue grows, a blocking request added to the shell), and there would now be a baseline saying so.

**It is not a gate.** No test fails on this number. Deployed timings will be larger — TLS, a real
network, a database on the same VM but not the same process — and that comparison is the point of
recording the method rather than only the result.

## Scenario 2 — Refusals are indistinguishable *(FR-915, FR-918)*

Present, in turn: an unknown address; a known address with the wrong password; a valid **attendee**
who has never been promoted; a **deactivated** operator.

**Expect**: four identical refusals — same status, same wording, same shape, comparable timing.
If any differs, the sign-in route is an oracle for who holds administrative access.

## Scenario 3 — Two independent sessions *(US1, FR-911, FR-912, FR-919)*

1. Sign into MyNet as an attendee in the same browser.
2. Sign into the admin site.
3. Sign out of the admin site → **MyNet session survives**.
4. Sign back in, sign out of MyNet → **admin session survives**.

**Deployment-only**: confirm the admin cookie is **host-only** (no `Domain`) and never appears on
requests to the attendee host. `localhost:5174` vs `localhost:5173` share a host and cannot prove
this.

## Scenario 4 — The report queue, and the promise becomes true *(US2, FR-940–947)*

1. As attendee A, report a **conversation** with attendee B (007's dialog).
2. As attendee C, report a **question** (009's dialog).
3. As a platform operator, open the queue.

**Expect**: both reports, each showing reporter, subject, instant, **the stated reason**, and **the
reported content**.

4. Delete attendee B's account, then reopen the conversation report.
5. **Expect**: *content unavailable* rendered as a **first-class state** — not an error, not an
   empty report (FR-941). This is the **expected** case, not an edge one.
6. Record an outcome and a note → the report leaves the open queue.
7. **Expect**: attendee A is told nothing, anywhere in MyNet (FR-946).

## Scenario 5 — Removing an abusive question *(US3, FR-950–952)*

1. Publish a question as attendee A; upvote it as B and C; report it as D.
2. Remove it as a platform operator.
3. **Expect**: gone for A, B, C and D; votes gone with it; **no other question's count changed**.
4. **Expect**: A is not told who removed it or why.
5. **Expect**: the message report from scenario 4 offers **no** removal action (FR-953).

## Scenario 6 — The tier boundary is real *(US4, FR-905, FR-906, FR-925)*

1. Promote attendee E for conference 1 only.
2. Sign in as E.
3. **Expect**: conference 1 visible; conference 2 not; **no** report queue, **no** promotion control.
4. **Enter the platform-tier addresses directly** — `/admin/reports`, `/admin/operators/…`.
   **Expect**: refused. SC-904 requires this verified by address entry, *not* by absence of a control,
   because a hidden control is not an authorization boundary.
5. **Expect**: E's MyNet experience is byte-for-byte what it was before promotion (FR-904).

## Scenario 7 — Leaving takes the authority *(US5, FR-960–962)*

1. As E, withdraw from conference 1. **Expect**: assignment gone, other assignments untouched.
2. Promote E again, then have E **delete their account**. **Expect**: deletion proceeds with **no
   extra step, no blocking warning, no refusal** (SC-905) — decision 12 is absolute.
3. As a platform operator, view conferences. **Expect**: conference 1 shown **unassigned**, with all
   sessions, tracks, rooms and speakers intact.
4. Check the audit trail. **Expect**: the entries naming E are **pseudonymised** — operator, action
   and instant intact, E's identifier gone, **no placeholder and no "deleted attendee" row**
   (FR-997a, FR-997b).

**Also verify** the re-seed guard: with a live assignment present, run `pnpm db:seed`.
**Expect**: it fails naming **organizer assignments** — not a bare foreign-key error naming neither
table, which is the failure 008 met and this feature was predicted to meet (FR-937–939).

---

## Scenarios needing a person — the ones that historically do not get walked

## Scenario 8 — The admin site at three widths *(FR-922, register entry 4)*

Open the queue, the conference list and the promotion dialog at **1440px, 900px and 390px**.

**Expect**: no horizontal scrolling of any content or primary action at any width. Rail reduces at
tablet; queue and detail stack rather than sitting side by side; mobile is single-column with
touch-sized controls.

**Look at where things are, not just whether they work.** Every dialog here must be centred by the
base rule in `theme/tokens.css` — Tailwind's Preflight sets `margin: 0` and takes away the user
agent's `margin: auto`, which is how 004's and 008's dialogs shipped pinned to the top-left having
passed every behavioural gate. `e2e/responsive.spec.ts` measures the gap on either side; **that
assertion must cover the admin dialogs too**, or this feature repeats the defect in a new app.

## Scenario 9 — Keyboard and screen reader *(FR-922)*

Reach every control by keyboard alone. Confirm visible focus throughout, Escape dismissal on the
resolution, promotion and removal dialogs, and focus restored to the opener after each closes.

**Ordering matters and is easy to get wrong**: restore focus *after* closing, because an inert
element cannot take it.

## Scenario 10 — Session bounds *(FR-919a, FR-919b)*

With short values configured: leave a session idle past `ADMIN_SESSION_IDLE_MINUTES`; separately,
keep one **active** past `ADMIN_SESSION_ABSOLUTE_HOURS`.

**Expect**: both expire. The second is the one that matters — an idle window alone can be held open
indefinitely by a tab that keeps touching the server, and this session reads other people's private
messages.

**Expect**: expiry returns to sign-in **without disclosing what was being viewed**, and leaves any
attendee session in the same browser alone.

## Scenario 11 — MyNet is unchanged *(FR-970–973, SC-907, SC-908)*

Walk the five destinations as an ordinary attendee, and again as a promoted conference organizer.

**Expect**: no administrative control, no tier-dependent rendering, nothing different between the
two. The whole claim of standing decision 33 is that promotion changes nothing here, and this is the
only scenario that looks.

---

## Machine gates that must be green alongside this

```bash
pnpm verify        # typecheck, lint, unit, component, contract, integration, build, e2e
pnpm test:a11y     # NOT `test:accessibility` — that script does not exist
```

`pnpm test:a11y` now runs **both** `accessibility.spec.ts` and `admin-accessibility.spec.ts`. It
ran only the first until 011 added the second, which would have left the administrative scan
outside the named accessibility gate while still passing under `test:e2e`.

Specifically confirm these **fail loudly if the feature is wrong**, rather than passing by omission:

- `operator-audit.test.ts` — fails on an `/admin/*` route with neither guard
- `deletion-coverage.test.ts` — fails on the new tables until each states its rule
- `qa-absences.test.ts` — narrowed **by path**, not by weakening the pattern
- `no-report-read-surface.test.ts` — still fails on a read surface in `apps/web`
- `catalog-read-only.test.ts` and `join-grants-nothing.test.ts` — **still in force**, untouched
- the notification trigger audit — **not edited** (SC-910)
