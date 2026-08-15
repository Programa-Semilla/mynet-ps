# Deep Review Findings

**Date:** 2026-08-07
**Branch:** `feat/006-discover-and-deployment-platform`
**Rounds:** 1
**Gate Outcome:** PASS
**Invocation:** manual

## Summary

| Severity  | Found  | Fixed  | Remaining |
| --------- | ------ | ------ | --------- |
| Critical  | 2      | 2      | 0         |
| Important | 21     | 21     | 0         |
| Minor     | 22     | 15     | 7         |
| Notable   | 4      | –      | 4         |
| **Total** | **49** | **38** | **11**    |

**Agents completed:** 5/5. **Failed:** none.
**External tools:** CodeRabbit skipped (CLI not installed); Copilot skipped (CLI not installed).

Raw findings: 49 across five agents. After merge and deduplication: 45 distinct (the
data-separation guard was reported independently by Architecture and Correctness; the
`loadMore` race by Correctness and Production Readiness; the `BACKUP_DIR`/mount mismatch by
Correctness and Production Readiness; the avatar-coverage gap by Test Quality and Production
Readiness).

**Test suite after the fix round:** all 13 gates green in 277.9s — 265 unit, 361 component, 552
integration, 21 accessibility, 111 end-to-end. No regressions.

---

## Findings

### FINDING-1 — `maintenance.sh on` aborted every default deploy

- **Severity:** Critical **Confidence:** 92
- **File:** `deploy/vm/maintenance.sh:70`
- **Category:** correctness **Source:** correctness-agent
- **Resolution:** fixed (round 1)

**What is wrong:** The `on` branch ended with
`[[ -n "$UNTIL_TEXT" ]] && echo "  Announced return: …"`. That AND-list was the last statement of
the last `case` branch, so with no `--until` the failing test became the **script's exit status**.
`deploy.sh` calls it under `set -e` at step [1b/6].

**Why this matters:** **Every deploy that did not pass `--until` aborted** — immediately after
raising the maintenance flag. The failure trap then fired and the environment was left behind a
503 with "DEPLOY FAILED" printed. This is the entire delivery path for US4. Verified empirically:
`bash -c 'set -euo pipefail; U=""; case on in on) echo x; [[ -n "$U" ]] && echo y;; esac'` exits 1.

**How it was resolved:** Converted to an `if` statement. `backup.sh` already documents this exact
trap on its own announcement line; this was the same trap in the sibling script, unguarded. The
shape is now pinned by a test (`deploy-guards.test.ts`) and by ShellCheck's SC2015 in CI.

---

### FINDING-2 — the documented rollback rolled nothing back

- **Severity:** Critical **Confidence:** 88
- **File:** `deploy/vm/README.md:207`, `deploy/vm/deploy.sh:183`
- **Category:** production-readiness **Source:** production-readiness-agent
- **Resolution:** fixed (round 1)

**What is wrong:** The runbook said to roll back with `git checkout <sha>` then
`./deploy.sh prod --no-build`. With `--no-build`, `deploy.sh` skips the client build (so it
rsyncs whatever `apps/web/dist` still holds — the *new* bundle) and runs `docker compose up -d`
without `--build`, so the API image is never rebuilt and Compose leaves the container untouched.
Separately, `docker image prune -f` ran unconditionally after every deploy, deleting the previous
`mynet-api:local` — so there was no earlier image to fall back to either.

**Why this matters:** This is the procedure an operator follows under incident pressure, and it
reported `== Done ==` while changing nothing. README section 6 case B — restore from backup, then
roll the application back — depends on this step working.

**How it was resolved:** The prune is now `--filter 'until=168h'`, so a week of images survives.
The README's rollback section is corrected to state that a rollback rebuilds from the checked-out
commit.

---

### FINDING-3 — `deploy/vm/.env` and every database backup reached the Docker build context

- **Severity:** Important **Confidence:** 85
- **File:** `.dockerignore:14-17`
- **Category:** security **Source:** security-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `.dockerignore` patterns use `filepath.Match` semantics in which `*` does not
cross `/`, so `.env` / `.env.*` matched only the context root. The API image is built **on the VM**
with `context: ../..` — the directory that also contains `deploy/vm/.env` (that environment's
`POSTGRES_PASSWORD`, `AUTH_PASSWORD_PEPPER`, `AUTH_ATTEMPT_HASH_KEY`) and `deploy/vm/backups`
(up to seven `pg_dump` archives: every attendee row and every Argon2id hash). Neither was excluded,
and the build stage is `COPY . .`.

**Why this matters:** Every deploy sent both to the daemon and baked them into a build-stage layer,
which `docker image prune -f` does not remove. The file's own header asserts the opposite property
("Secrets must never reach an image").

**How it was resolved:** Added `**/.env`, `**/.env.*`, `**/backups`, `deploy/vm/backups` and
`deploy/vm/web`, with `!**/.env.example`.

---

### FINDING-4 — the deploy rsynced the developer's own secrets onto the VM

- **Severity:** Important **Confidence:** 85
- **File:** `deploy/vm/deploy.sh:114-123`
- **Category:** security **Source:** security-agent
- **Resolution:** fixed (round 1)

**What is wrong:** The rsync excluded `deploy/vm/.env` only. The **repository root's** `.env` and
`.env.local` — which `apps/api/src/env.ts` loads, holding the developer's password pepper,
attempt-hash key and database URL — were copied verbatim to UAT and production on every deploy.
Both files exist in a normal working tree, so this was the behaviour rather than a hypothesis.

**Why this matters:** Every developer who deployed planted their local secrets in plaintext on a
publicly reachable host, in a directory that is also the Docker build context (FINDING-3). The
comment block claims "EVERY EXCLUDE HERE IS LOAD-BEARING" and enumerates five, so the omission
read as considered.

**How it was resolved:** Added depth-matching excludes with an `.env.example` include.

---

### FINDING-5 — the API healthcheck could never run

- **Severity:** Important **Confidence:** 92
- **File:** `deploy/vm/docker-compose.yml:76-84`
- **Category:** production-readiness **Source:** production-readiness-agent
- **Resolution:** fixed (round 1)

**What is wrong:** The healthcheck ran `wget -q -T 3 -O /dev/null http://127.0.0.1:3000/ready`,
and the runtime image is `node:22-slim`, which ships **neither `wget` nor `curl`**. Verified:
`docker run --rm node:22-slim command -v wget` finds nothing.

**Why this matters:** The API was reported permanently `unhealthy`, and `docker compose ps` is
half of this stack's entire operational surface — so the one container-level signal an operator
has was stuck at the wrong value, and every successful deploy ended by displaying it. A later
`condition: service_healthy` on caddy would have deadlocked the stack.

**How it was resolved:** Probe with `node -e "fetch(...)"`. Node 22 has a global `fetch`, so this
needs no package and no image change.

---

### FINDING-6 — `loadMore` could append the previous conference's attendees

- **Severity:** Important **Confidence:** 80
- **File:** `apps/web/src/app/discover/useDirectory.ts:139-174`
- **Category:** correctness **Source:** correctness-agent (also reported by: production-readiness-agent)
- **Resolution:** fixed (round 1)

**What is wrong:** The guard was `if (sequence < applied.current) return`, which rejects a response
older than the newest *applied* one but not one superseded by a newer *issued* one. Page 1 for
conference A resolves (`applied = 1`); the reader presses "Show more" (`issued = 2`, in flight);
the reader switches to B; the render-time reset clears the list and the effect issues 3. A's page 2
then resolves, evaluates `2 < 1` as false, and appends **A's attendees and A's cursor** onto the
list just cleared for B. The effect has a `cancelled` cleanup; `loadMore` had none.

**Why this matters:** FR-401a is explicit that nothing from the previous conference may be retained
"including in any in-flight or partially rendered page". This is other attendees' names, employers
and faces rendered under the wrong conference's heading — and pressing "Show more" again would
send A's cursor to B's endpoint.

**How it was resolved:** The sequence is claimed **at issue** rather than at apply (`newest`), and
both guards became `sequence !== newest.current`. `setLoadingMore(false)` is now unconditional, so
a superseded request cannot leave the control permanently disabled. Separately, the grid is gated
on `status === 'ready'` so a failed load for a new conference cannot render the old one's cards.

---

### FINDING-7 — the data-separation guard read files that reach no container

- **Severity:** Important **Confidence:** 82
- **File:** `deploy/vm/_common.sh:72-137`
- **Category:** architecture **Source:** architecture-agent (also reported by: correctness-agent)
- **Resolution:** fixed (round 1)

**What is wrong:** `require_data_separation` — described as "an ENFORCEMENT, not a convention" —
compared `DATABASE_HOST`/`DATABASE_NAME` from the two **committed** env files. What the running
stack actually uses comes from the **uncommitted `.env` on the VM**, which is excluded from rsync
and which the committed files do not influence. So the guard compared two inert files to each
other: exactly the convention it claims to replace.

**Why this matters:** A UAT VM whose `.env` carried production's database name — the "somebody
debugging a UAT problem against production's connection string" scenario the header names — passed
silently.

**How it was resolved:** Added `mynet::require_remote_data_separation`, which reads the VM's live
`.env` over the SSH connection the scripts already establish and refuses before anything is synced,
deployed or backed up. The committed check is retained as the cheap first line.

---

### FINDING-8 — the seed guard keyed on the shell, not the target

- **Severity:** Important **Confidence:** 85
- **File:** `apps/api/src/db/seed/index.ts:88-108`
- **Category:** security **Source:** security-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `assertSeedableTarget` returned immediately when `config.isDeployed` was false —
a statement about *the shell the script runs in* rather than *the database it is pointed at*.
`pnpm db:seed` sets no `NODE_ENV`, so it always resolved to `development` and the guard never fired
on an operator's own machine, which is the only machine from which the accident is reachable.

**Why this matters:** The accident is a **documented, supported workflow**: README section 4 tells
an operator to reach the loopback-only database with `ssh -L 15432:127.0.0.1:5432`. That presents
as `localhost:15432/mynet_prod`, so the host looks entirely local. `seed()` then runs
`DELETE FROM attendees`, cascading to every profile, interest, registration, note and token.

**How it was resolved:** The guard now keys on the resolved **database name** against a stated list
of deployed names, so a tunnelled connection refuses regardless of `NODE_ENV`. Three tests cover
the tunnelled cases.

---

### FINDING-9 — no gate had ever parsed the deploy scripts

- **Severity:** Important **Confidence:** 85
- **File:** `.github/workflows/verify.yml`, `deploy/vm/*.sh`
- **Category:** test-quality **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** Nothing in the repository executed, linted or `bash -n`-parsed any file under
`deploy/vm/`, yet the workflow runs `./deploy/vm/deploy.sh <env> --migrate` against real
environments. The TypeScript sibling of the same requirement (`assertSeedableTarget`) had ten
tests; the bash guard had none.

**Why this matters:** This is *why* FINDING-1 existed. A guard that has never been executed is
indistinguishable from a guard with a typo in its comparison.

**How it was resolved:** The `lint` job now runs `bash -n` **and** `shellcheck --severity=warning`
over every script in `deploy/` and `.githooks/`, with an emptiness guard. It found three real
warnings on its first run, all fixed. Added `apps/api/tests/unit/deploy-guards.test.ts`, which
drives the real `_common.sh` against temporary env fixtures (7 cases) and pins FINDING-1's shape.

---

### FINDING-10 — the smoke check the comments pointed at did not exist

- **Severity:** Important **Confidence:** 85
- **File:** `apps/api/tests/integration/security-headers.test.ts:143-159`
- **Category:** test-quality **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** Two comments deferred HSTS and the static document's headers to "a deployment
smoke check (T080)". Searching the repository found only those comments. So
`strict-transport-security` was asserted **absent** in the only environment tested and asserted
present **nowhere**, while SC-411 requires the declared headers to be "verified by automated check
rather than by eye".

**Why this matters:** A comment pointing at a non-existent check reads as coverage to the next
reviewer. The `if (config.isProduction)` branch could have been deleted with every test still
green.

**How it was resolved:** Implemented the check as the final step of `deploy.sh` — it curls the
served document after maintenance is lifted and names any missing header, including
`img-src … data:` specifically (FR-481). Both comments now point at it.

---

### FINDING-11 — the directory issued one storage statement per attendee

- **Severity:** Important **Confidence:** 88
- **File:** `apps/api/src/routes/events/directory.ts:190,243-274`
- **Category:** production-readiness **Source:** production-readiness-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `withAvatar` was mapped over every row inside `Promise.all`, each issuing its own
`storage.get`. That is 1 + N statements — 101 at the maximum page size — issued concurrently
against a pool of 10 connections. The repair path additionally ran `processAvatar` per row with no
concurrency bound: up to 100 simultaneous `sharp` pipelines from one GET.

**Why this matters:** SC-402 and SC-403 are stated at 1,000 attendees, and this is the part of the
response that scales with page size rather than with the query. On a Standard_B2s that also hosts
PostgreSQL, 100 concurrent image re-encodes is a CPU and memory event.

**How it was resolved:** Added `StorageService.getMany` (`WHERE key = ANY(...)`) — a fourth method
on a port whose header says there must never be one, so its justification is written there. The
page's faces are now two statements. The repair path is bounded to 4 concurrent derivations;
beyond that the fallback initials render, which is a handled state. FR-459 is unaffected: the keys
still come only from rows the predicate already bounded.

---

### FINDING-12 — a filter removed its own alternatives

- **Severity:** Important **Confidence:** 85
- **File:** `apps/web/src/app/destinations/Discover.tsx`
- **Category:** correctness **Source:** (found during the preceding review-code gate)
- **Resolution:** fixed (before this round)

**What is wrong:** The filter options were derived from the current page, so selecting "Designer"
left "Designer" as the only role on offer.

**Why this matters:** The reader could not switch filters, only clear and start again — and had to
guess that. **How it was resolved:** Options accumulate across loads, resetting on a conference
switch. Regression test added.

---

### FINDING-13 — remaining Important findings, fixed

| # | File | What was wrong | Source |
|---|---|---|---|
| 13 | `deploy/vm/provision-vm.sh:22-27` | The IP-discovery loop aborted on the **first** failing service under `pipefail`, so the other two were never tried and the "Re-run with MYIP=" message was unreachable — the opposite of what its comment promises | correctness |
| 14 | `useDirectory.ts:85-94` | `'no-conference'` was inferred from `eventId === null`, so a re-resolution of the active conference told an attendee **who is at a conference** to go and join one | architecture |
| 15 | `useDirectory.ts:179-182` | When the *active conference* had failed, "Try again" bumped a counter whose effect re-derived the same failure — a permanent no-op on the state's only control. Agenda handles the same condition correctly | architecture |
| 16 | `verify.yml` deploy jobs | No pnpm/Node setup (the script builds the client), no SSH key, no `known_hosts`, and an NSG rule that admits only the provisioning operator. The jobs would fail the moment they stopped being inert | architecture, production-readiness |
| 17 | `verify.yml` concurrency | The deploy jobs inherited `cancel-in-progress: true`, so a second merge could cancel a deploy **mid-maintenance-window**, leaving a 503 nothing removes | production-readiness |
| 18 | `docker-compose.yml` | No `stop_grace_period`, so Docker's 10s default preempted the application's own 15s drain — the bound `server.ts` says "makes the upper bound ours" was unreachable | production-readiness |
| 19 | `docker-compose.yml` | No memory limits on a 4 GB VM running PostgreSQL, the API and `sharp` (50 MP ≈ 200 MB decoded, natively allocated). The OOM killer would choose among three containers | production-readiness |
| 20 | `docker-compose.yml` | No log rotation. Unbounded logs share the 64 GB disk with `postgres_data` **and** the backups — so the disk fills, PostgreSQL stops writing, and `backup.sh` refuses below its floor, all at once | production-readiness |
| 21 | `backup.sh` | `flock` was checked only on `install`, so a host without it logged "another backup run holds the lock" — a cause that is not the cause — and silently took no backups. `BACKUP_DIR` was settable but the verify step hard-coded `/backups`, so any other value failed every run at exit 6 | correctness, production-readiness |
| 22 | `backup.sh` | A failing nightly run produced no signal an operator could encounter: all output went into a log before anything ran, and `status` reported the schedule and a listing, neither of which changes when backups stop | production-readiness |
| 23 | e2e / component | The avatar-**present** path was rendered by no test at any layer, which also made the e2e "one request" assertion unfalsifiable — with no avatar to fetch, `avatarReads` is empty whatever the client does | test-quality, production-readiness |
| 24 | `discover-conference-switch.test.tsx` | The switch test used `waitFor` alone, which polls past the delay — so it also passed against an on-arrival clear, the one implementation it exists to reject | test-quality |

All twelve are fixed; each carries a comment at the site stating what was wrong and why.

---

## Minor findings

**Fixed (15):** `longestSide` named the shortest edge; HSTS gated on `isProduction` while its
comment and the new `isDeployed` flag said otherwise; Caddy's security headers sat inside the
client handler so the **maintenance page and `/api/*` were served without them for every window**;
the `--until` substitution silently no-opped if its marker moved; `object-src` and `base-uri` were
named by FR-480 and asserted nowhere (`base-uri` does not fall back to `default-src`); the
two-readers test never compared the two sets; the SC-403 timing tests asserted nothing about the
result set, so a query matching nobody would be the fastest possible pass; the new accessibility
scans did not pin the conference and passed only because the file sorts first; retry controls were
asserted present but never pressed; `cloud-init` hard-coded `azureuser` while `ADMIN_USER` is
configurable; three ShellCheck warnings the new gate found.

**Remaining (7), all deliberate:**

1. **`/api/ready` is publicly reachable.** Both real callers reach the API directly, so it could be
   refused at the proxy. It reports one word about one dependency and no host, port or driver
   message. Left as an accepted, stated exposure rather than adding a matcher whose only effect is
   on an endpoint that discloses "database".
2. **Avatar rendering is duplicated at three sites** with hard-coded sizes that must stay in step
   with `AvatarFallback`'s own map. Real divergence risk; extracting a shared component touches
   `profile/Avatar.tsx` too, which is 004's code and outside this change.
3. **`verify-backup-local.sh` duplicates `backup.sh`'s `pg_dump` flags** by hand, coupled by a
   comment.
4. **The scale fixture has no avatars**, so SC-402/403 are measured against ~24 small JSON objects
   rather than the ~200 KB of base64 a production page carries. Now that `getMany` batches the
   read, the shape of the cost has changed; re-measuring with avatars is worth doing and is not a
   one-line change.
5. **`deploy.sh` rebuilds the client rather than consuming CI's `web-dist` artifact.** The
   misleading comment claiming otherwise is corrected; closing the provenance gap properly means
   downloading the artifact in the deploy job.
6. **No off-host backup copy** — see Notable-2.
7. **`docker compose exec` in `deploy.sh`'s readiness poll uses `wget` inside the caddy container**,
   which is correct (`caddy:2-alpine` has BusyBox wget) but relies on an image detail.

---

## Notable Observations

Captured to `brainstorm/idea-inbox.md`; these are not defects and trigger no fix.

### NOTABLE-1 — the directory listing has no throttle

- **File:** `apps/api/src/routes/events/directory.ts:46-49` **Source:** security-agent
- FR-404 deliberately accepts that a listing discloses the discoverable-and-verified set. But the
  join code is world-readable in a public repository, so anyone can self-sign-up, verify an address
  they own, join, and walk a whole conference at 100 rows per request with a cheap keyset cursor.
  What FR-404 concedes to a human browsing is not what it concedes to a machine harvesting 1,000
  names, employers and faces in ten requests. The mechanism exists — `join` already has its own
  counter.

### NOTABLE-2 — backups share a failure domain with the data they protect

- **File:** `deploy/vm/backup.sh` **Source:** production-readiness-agent
- Every artifact stays on the same VM and the same disk as the live database. The single most
  likely event a daily backup is kept for destroys the database and all seven artifacts together.
  The schedule and retention are discharged; the purpose is only partly. Now stated explicitly in
  README section 5 and in `docker-compose.yml`, where a comment previously claimed the artifacts
  were moved off the machine.

### NOTABLE-3 — the rendered directory list is unbounded

- **File:** `apps/web/src/app/discover/useDirectory.ts` **Source:** production-readiness-agent
- At 1,000 attendees a reader who pages to the end holds ~1,000 entries — megabytes of base64 plus
  1,000 decoded bitmaps and DOM subtrees — on a phone at a venue. The explicit "Show more" control
  makes this degrade gradually, and FR-466 forbids *caching*, not windowing, so trimming is
  available.

### NOTABLE-4 — the read-path avatar repair is code for a case its own comment refutes

- **File:** `apps/api/src/routes/events/directory.ts` **Source:** architecture-agent
- The comment states there is no production avatar to backfill because the product has never been
  deployed. Kept because research D2 and task T026 specify it, and it is now concurrency-bounded —
  but worth revisiting: a developer with a stale database is also served by re-running the seed.

---

## Post-Fix Spec Coverage

The fix round removed code (the per-row storage read, the header block in the client handler, the
`applied` ref), so the coverage check ran.

| Requirement group | Implementation | Status |
| --- | --- | --- |
| FR-401…FR-415 (the directory) | `db/queries/directory.ts`, `routes/events/directory.ts`, `Discover.tsx`, `useDirectory.ts` | ✓ |
| FR-431…FR-434 (the profile view) | `discover/AttendeeProfile.tsx`, 004's read unchanged | ✓ |
| FR-446…FR-449 (the Home card) | `home/cards/PeopleToMeet.tsx` + one registry line | ✓ |
| FR-456…FR-460 (avatars) | `images/avatar.ts`, `storage/service.ts`, `routes/profile.ts`, `queries/account.ts` | ✓ |
| FR-466…FR-468 (offline) | `services.ts` (undecorated), `DirectoryEmptyStates.tsx` | ✓ |
| FR-476…FR-490 (the platform) | `deploy/vm/**`, `plugins/security-headers.ts`, `routes/health.ts`, `auth/cookie.ts`, `verify.yml` | ✓ |
| FR-496…FR-499 (inherited debt) | `registry.tsx`, `repository-casts.test.ts`, migration `0005` | ✓ |

**All 55 functional requirements verified after the fix loop.** None was dropped. FR-459 — the one
requirement no code referenced before this review — is now named at its enforcement point and
asserted against real stored bytes.

---

## Test Suite Results

| Round | Command | Exit | Failures | Status |
| ----- | ---------------- | ---- | -------- | ------ |
| 1     | `pnpm verify:clean` | 0    | 0        | passed |

All 13 gates green in 277.9s: 265 unit, 361 component, 552 integration, 21 accessibility, 111
end-to-end. No test-originated findings.

---

## Found after the review, by CI

**`migrations.test.ts` had a latent order dependency that only CI could expose.**

The file reads seeded rows — `events`, and `INSERT … SELECT … FROM registrations JOIN sessions …`
— but never seeds. Against an unseeded database that `SELECT` returns nothing, so the `INSERT`
inserts **zero rows**, no constraint is violated, and the assertion reports `undefined` where it
expected a CHECK constraint name. A fixture problem, reported as a missing database constraint.

It passed only because some other file happened to run first and seed the shared database. 006
added eight integration files, the order changed, and five tests failed on GitHub Actions while the
whole suite passed locally — which is exactly what CI is for, and why Principle VII says completion
is claimed from the pipeline rather than from inspection.

Fixed by calling `resetDatabase()` in all three `beforeAll` blocks, so the file is self-sufficient
like every other integration file. Verified by reproducing CI's condition locally against a fresh
`postgres:17` container: 35/35 in that file, **552/552** across the suite.

---

## Remaining Findings

None at Critical or Important severity. The seven Minor items above are recorded with the reason
each was left, and the four Notable observations are captured for future brainstorming.
