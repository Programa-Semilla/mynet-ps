# Quickstart: validating Discover and the deployment platform

**Feature**: 006 | **Date**: 2026-08-07

Runnable validation for what this feature claims. Two halves, validated differently: the product half
runs locally against a real database; the platform half can only be proven by deploying.

Implementation detail belongs in `tasks.md`. This is the run guide.

---

## Prerequisites

```bash
git config core.hooksPath .githooks     # once per clone
pnpm install
```

A local PostgreSQL 17. The repository's gates use a `postgres:17` service container; locally, any
PostgreSQL 17 reachable at `DATABASE_URL` works.

```bash
export DATABASE_URL='postgresql://mynet:mynet@localhost:5432/mynet_dev'
export AUTH_PASSWORD_PEPPER='dev-only-pepper'
export AUTH_ATTEMPT_HASH_KEY='dev-only-attempt-key'
```

Both auth values are required at boot. They were missing from CI until PR #9 and the failure was
invisible because an earlier job failed first — worth knowing when a fresh environment refuses to
start.

---

## Part 1 — the whole pipeline, locally, on a clean database

```bash
pnpm verify:clean
```

This is the gate set CI runs. It must be green before anything below is meaningful. It includes
migration `0005` applying forward against a real database, which Principle VII requires before the
migration reaches any environment holding real data.

**Expected**: all correctness gates pass. Note what is *no longer here* — `db-branch`,
`schema-diff`, `deploy-api`, `deploy-preview` and `cleanup` are removed by this feature (research
D13), and their absence is the point rather than an omission.

---

## Part 2 — the directory

```bash
pnpm db:seed        # never against real data; see the seed's own guard discussion
pnpm dev            # API on :3000, client on :5173
```

Sign in as a seeded attendee registered for a conference that has other registered, discoverable,
verified attendees.

### 2a — the directory renders and narrows

1. Open **Discover**. Cards render with name, company, role, headline, interests, networking intent,
   availability and a face.
2. Confirm the order is **shared-interest count descending**, and that each card states its count.
3. Type part of a co-attendee's name into search. The list narrows.
4. Type an accented name without its accent — *"Munoz"* for *"Muñoz"*. **It still matches** (D5).
5. Apply a role filter and an interest filter together. Both apply (FR-408).
6. Filter to something matching nobody. The empty state appears **with a working reset**.
7. Reset. The full directory returns.

### 2b — visibility, which is the part worth being careful about

| Set up | Expect |
|---|---|
| A co-attendee turns discoverability **off** | They vanish from the directory. **Nothing indicates anyone was withheld** — no count, no gap, no message |
| Sign in as an attendee who has discoverability **off** | The directory renders **in full**. Hiding does not blind them (FR-403) |
| A co-attendee registered for a *different* conference | Never appears |
| An unverified co-attendee | Never appears |
| Switch the active conference | The directory swaps entirely; no attendee from the previous conference survives, including mid-load |
| An attendee who has joined **no** conference | Discover explains that joining comes first and offers the way to do it — not an empty list, not an error (FR-401b) |

**Check the wire, not just the screen.** Open the network panel and read the listing response: an
attendee excluded by any of the three conditions must be **absent from the payload entirely**, not
present-and-hidden (FR-402). This is the check the screen cannot make for you.

### 2c — avatars in one request

1. Load a directory page with two dozen faces.
2. **One** request carries the page and all its avatars (SC-407). There is no per-card image request,
   and no placeholders resolving individually.
3. Confirm the payload carries the **96px card** rendition, not the 512px one.
4. Open a profile. *That* uses the 512px rendition through 004's existing avatar route.

### 2d — paging without duplicates

1. Scroll to load several pages.
2. While paging, have another attendee join the conference or edit their interests.
3. **No co-attendee appears twice** (FR-410a, SC-403a). An attendee silently *missing* is permitted
   and is the declared asymmetry — forbidding that would need a snapshot FR-466 refuses.

### 2e — the profile view

1. Open a card. A profile view renders **at its own address** — copy the URL, reload, it still works.
2. Press **Escape**. It dismisses and **focus returns to the card that opened it**.
3. Request the address of someone at another conference, someone hidden, someone unverified, and a
   made-up identifier. **All four refuse identically.**
4. Confirm the view carries **no message, share-card or schedule action** (FR-434).

### 2f — Home

1. As an attendee with interests, Home shows a **"people to meet"** card with **at most five**
   co-attendees and their counts.
2. Follow it into Discover. The same order greets you.
3. As an attendee with **no** interests, the card shows its own empty state and **every other card on
   Home renders normally** (FR-448).
4. Break the card's request. The card fails alone; the dashboard does not blank.

### 2g — offline

1. Load Discover with a connection.
2. Go offline. Reload.
3. Discover says it **needs a connection**, worded differently from a server fault.
4. **No directory content, no profile, no face is readable.** Nothing was cached, and that is the
   decision rather than an omission (FR-466–FR-468).

### 2h — accessibility and layout

```bash
pnpm test:accessibility
pnpm test:e2e
```

By hand, at 320px, 768px and desktop:

- No horizontal scrolling, anywhere, at any width.
- Tab through search, filters and cards: every control has a visible focus state and an accessible
  label. The search field is **labelled**, not placeholder-only.
- After searching, the result-count change is **announced** — a screen-reader user should not have to
  discover it by exploration.
- Networking intent and availability are not conveyed by colour alone.
- The profile view traps focus while open and restores it on close.

---

## Part 3 — the platform

**This half cannot be validated locally.** It is the half that fails today: `fly.dev` and `pages.dev`
are separate registrable domains, so the `SameSite=Lax` session cookie is never sent and sign-in
cannot complete in a deployed environment at all.

### 3a — blocked until two owner decisions land

- **A domain name.** Caddy cannot obtain a Let's Encrypt certificate until an A record resolves to
  the VM (FR-479).
- **UAT's exposure.** The reference NSG opens web to the world. FR-485 forbids pointing UAT at
  production data, which bounds the harm but does not settle the exposure.

Neither blocks implementation. Both block the first deploy.

### 3b — provision and deploy, per environment

From `deploy/vm/`, on a machine with `az` logged in:

```bash
az account set --subscription <id>   # scripts verify and refuse if it does not match
./provision-vm.sh uat
# point the A record at the printed IP, wait for DNS
./deploy.sh uat
```

### 3c — what to check on a deployed environment

| Check | Expect |
|---|---|
| Browse to the address | HTTPS, publicly trusted certificate, obtained without manual steps (FR-479) |
| **Sign in, then navigate** | The session **persists**. This is SC-410, and it is what fails today |
| `curl -sI` the root | CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS all present (SC-411) |
| Faces render in Discover | Confirms `img-src` permits `data:` — FR-481's failure mode is every face blank |
| `curl /api/ready` | Healthy |
| Stop the database, `curl /api/ready` | **Unhealthy**, while `/health` is unchanged and still discloses nothing (SC-412) |
| Try to reach PostgreSQL from off-host | **Refused** (FR-486) |
| `./maintenance.sh <env> on` | The 503 page serves **while the app is stopped**, verified with `curl -sI` rather than by eye — a page that renders perfectly while answering 200 silently defeats external monitoring |

### 3d — backup and restore, before production holds real data

```bash
# on the VM, under cron
./backup.sh
# locally
./verify-backup-local.sh
```

**Restore must actually be exercised at least once** (FR-487, SC-413). A documented restore that has
never been run is a hope, not a procedure.

### 3e — rollback

Follow the runbook's rollback procedure and confirm it states what happens when the schema has moved
ahead of the application (FR-489). A rollback path that assumes the database can always follow the
code backwards is the one that fails when it is needed.

---

## Part 4 — the debt

```bash
pnpm typecheck
```

- **Zero** unchecked repository casts remain in feature code (SC-414). Before this feature there were
  fifteen, in eleven files; `@mynet/platform` now takes `@mynet/data` as a **devDependency** and
  `import type`s the real interfaces, so the runtime dependency graph is unchanged.
- Confirm `@mynet/data` appears under `devDependencies`, not `dependencies` — the whole argument
  rests on `import type` being erased at build time.

For the index work, compare query plans before and after `0005`:

- Account deletion no longer sequentially scans `attendee_verifications` or
  `attendee_password_resets`.
- The conference join-code lookup uses `events_join_code_lower_btrim_idx` instead of scanning
  `events`.
- The directory uses `registrations_event_id_idx` rather than the composite unique, which leads with
  the wrong column.

---

## Definition of done for this quickstart

Every check in Parts 1, 2 and 4 passes locally and in CI. Part 3 passes on a deployed UAT
environment. **The constitutional amendment has landed** — it is a merge prerequisite, and it must
cover all three departures, including 001's shipped FR-066 and SC-011.
