# Deploying MyNet

The operator runbook for the two environments MyNet runs on. **Read section 6 before rolling
back**, and section 5 before production holds anything real.

Constitution **v3.0.0**, standing decisions 17–20. The engine, the project-owned API contract and
the reviewed migrations are unchanged from v2.3.0; what changed is **who operates the database** —
and with it, backups became this project's obligation rather than a vendor's.

---

## 1. What this is

Two isolated Azure VMs, `uat` and `prod`. Each runs one Docker Compose stack:

```
        <domain>                     admin.<domain>
            :80 :443                      :80 :443
                   \                     /
                    \   ┌───────────┐   /     auto-TLS, TWO certificates
                     ───│   caddy   │───       serves /srv/web + /srv/admin,
                        └─┬───────┬─┘          proxies /api/* under BOTH hosts
             /api/*  ─────┘       └───── everything else
                  │                          │
             ┌────▼────┐              /srv/web    → apps/web/dist
             │   api   │              /srv/admin  → apps/admin/dist
             └────┬────┘              (both rsynced by deploy.sh)
                  │
          ┌───────▼────────┐
          │   postgres     │  127.0.0.1:5432 — LOOPBACK ONLY (FR-486)
          └────────────────┘
```

**Two origins, one API, one database** (011, standing decision 37). `admin.<domain>` is the
administrative product. It is a _subdomain_ rather than a path or a separate domain because
`SameSite` is evaluated against the **registrable domain, not the origin** — so the admin host is
_same-site_ (decision 19's CSRF defence survives untouched) **and** _different-origin_ (its own
service-worker scope, storage and CSP). A path would put it under the attendee service worker's
root scope; a separate registrable domain would stop the session cookie being sent at all, which
is the v3.0.0 failure described below. The Caddyfile records the full argument.

**Client and API share one origin, and that is not a preference.** It is what keeps the session
cookie's `SameSite=Lax` a genuine CSRF defence and makes `connect-src 'self'` literally true. The
configuration this replaces — the client on `pages.dev`, the API on `fly.dev` — **could not sign
anyone in**: those are separate registrable domains on the Public Suffix List, so the cookie was
never sent.

|             | UAT                                                   | Production                         |
| ----------- | ----------------------------------------------------- | ---------------------------------- |
| Deployed on | merge to `develop`                                    | merge to `main`                    |
| Data        | realistically shaped, **never production's** (FR-485) | real                               |
| Config      | `envs/uat.env` + `.env` on the VM                     | `envs/prod.env` + `.env` on the VM |

---

## 2. First-time provisioning

**Blocked on two owner decisions**, both recorded as open in the specification:

- **no domain is registered** — Caddy cannot obtain a certificate without a resolving A record
  (FR-479), so nothing can serve HTTPS and nobody can sign in;
- **no Azure subscription is named** — `envs/*.env` leave `SUBSCRIPTION` blank.

Once both exist:

```bash
az login
./provision-vm.sh uat          # prints the VM's public IP
# point BOTH A records at it, then:
ssh azureuser@<ip>
cd ~/app/deploy/vm && cp .env.example .env && nano .env
```

**Two A records, both to the same VM** (011):

| Record           | Serves                      |
| ---------------- | --------------------------- |
| `<domain>`       | MyNet, the attendee product |
| `admin.<domain>` | the administrative product  |

Caddy obtains a **separate certificate for each host** and cannot obtain either until public DNS
resolves it. A missing `admin` record is the quiet failure here: MyNet comes up perfectly, every
check in section 4 passes, and only the administrative host is dead — so check it explicitly.

Then from your machine:

```bash
./deploy.sh uat --migrate
```

`deploy.sh` builds **both** clients and rsyncs them to two separate directories, `web/` and
`admin/`, which `docker-compose.yml` mounts at `/srv/web` and `/srv/admin`. They are two trees
rather than one with a subdirectory because the attendee service worker is registered at root
scope, and anything served beneath it would be intercepted by a precache built for a different
application.

**Every value in `.env` differs between environments**, including `AUTH_PASSWORD_PEPPER`. The
pepper is mixed into every stored password hash — sharing it would make a UAT disclosure a
production one.

### Giving a platform operator their first credential (011)

**The seed creates operator identities with a null `password_hash`, so sign-in is impossible
rather than defaulted** (FR-990, FR-991). This repository is public and the seed is committed,
reviewed data — it cannot carry an administrative password. Bootstrapping is therefore a separate,
deliberate act:

```bash
# On the VM, with ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD set in .env:
cd ~/app/deploy/vm
docker compose run --rm api node dist/admin/bootstrap.js
```

`node dist/…`, not `pnpm admin:bootstrap` — the runtime image carries the compiled output and
production dependencies only, with no source and no `tsx`. This is the same shape as the migration
step in `deploy.sh` (`docker compose run --rm api node dist/db/migrate.js`), and `run --rm` rather
than `exec` so it works whether or not the API container is currently up.

Three things about it are load-bearing and are asserted by `admin-bootstrap.test.ts`:

- **It is separate from `pnpm db:seed` on purpose.** Seeding deletes every attendee and re-inserts
  the committed fixtures; getting a credential must not require doing that.
- **The credential it sets is _initial_.** It reaches exactly one route — the forced replacement —
  and no administrative surface until it has been replaced (FR-992).
- **It never resets a credential the operator chose** (FR-993). Idempotent upsert is the natural
  wrong implementation, so leaving the two values in `.env` after the first bootstrap is safe; a
  later run is a no-op against an operator who has replaced theirs.

Unset both values once you are done. A blank pair makes the command do nothing at all, which is
the correct resting state.

### The last operator, and why nothing guards it

**If every platform operator is deactivated, or the last one loses their credential, there is no
way back in through the product.** Deactivation is performed by platform operators, so the tier
can empty itself, and no route refuses the last deactivation.

That is deliberate rather than an oversight. A guard would have to answer "who is allowed to be
last", which is a governance question nobody has decided, and the alternative — a permanently
undeletable operator — is a worse property for a product whose whole administrative tier is
supposed to be revocable.

**Recovery is by re-seed of the identities plus a fresh bootstrap:**

```bash
docker compose run --rm api node dist/db/seed/index.js   # ⚠️ deletes every attendee — see below
docker compose run --rm api node dist/admin/bootstrap.js
```

**In production this is not an acceptable recovery**, because `db:seed` deletes attendee data. On
a production host the repair is to insert an operator row by hand against the database and then
bootstrap it — which requires shell access to the VM, and that is the actual control protecting
this path. Record any such intervention in `OPERATIONS-LOG.md`; an operator created outside the
seed is an administrative act with no audit entry, because `admin_audit_entries` records acts
performed _through_ the product (FR-939 records the same reasoning for the re-seed).

---

## 3. Deploying

```bash
./deploy.sh <uat|prod> [--migrate] [--no-build] [--until "22:30 CET"] [--logs]
```

What it does, and why the order is what it is:

1. **Enters maintenance first.** From here every visitor gets a branded 503 rather than the bare
   protocol error a container recreate produces. The failure trap is armed _before_ this, so a
   deploy that fails at any step leaves the environment in maintenance **and says so**.
2. **Builds the client with `VITE_API_BASE_URL=/api`** — the only client-side configuration one
   origin needs.
3. **Syncs, with five load-bearing excludes.** `.env`, `backups`, `web`, the maintenance `ON`
   flag and the rendered `index.html` are each excluded for a reason written beside it in
   `deploy.sh`. Do not remove one without reading that comment.
4. **Waits for the API to report `/ready`**, not merely to start. A started container is not
   evidence: `restart: unless-stopped` keeps a crash-looping container reporting as running, and
   `/health` answers `ok` from a process that has never reached its database.
5. **Leaves maintenance only then.**

### Maintenance by hand

```bash
./maintenance.sh prod on --until "22:30 CET"
./maintenance.sh prod status
./maintenance.sh prod verify     # asserts 503 + Retry-After with curl, NOT by eye
./maintenance.sh prod off
```

`verify` exists because a maintenance page that renders perfectly while answering **200** looks
completely correct in a browser and silently defeats every uptime check for the whole window.

---

## 4. Checking an environment

```bash
curl -sI https://<domain>/                       # 200, and the security headers
curl -s  https://<domain>/api/health             # {"status":"ok"} — liveness
curl -s  https://<domain>/api/ready              # {"status":"ready"} — readiness
ssh azureuser@<ip> 'cd ~/app/deploy/vm && docker compose ps'

# 011 — the administrative host is a SEPARATE certificate and a separate artifact, so it
# fails independently and none of the checks above would notice.
curl -sI https://admin.<domain>/                 # 200, its own (stricter) headers
curl -s  https://admin.<domain>/api/health       # the SAME API, reached from the other origin
curl -sI https://admin.<domain>/ | grep -i x-robots-tag   # noindex — proves it is the admin block
```

**`img-src` differs between the two hosts and that is the quickest way to tell them apart.** MyNet
permits `data:` because the directory delivers avatar faces as data URLs; the admin host does not,
because no administrative tier may read a profile at all (FR-973).

**Then sign in, and navigate.** This is the check the whole platform half exists for (**SC-410**),
and it is the one that **fails today**: in the configuration this replaces, the client was on
`pages.dev` and the API on `fly.dev`, so the `SameSite=Lax` session cookie was never sent and
sign-in could not complete at all. If a session does not survive a navigation here, the origins have
been split — check that Caddy is proxying `/api/*` rather than the client being built against an
absolute API address.

`/health` and `/ready` answer different questions and must be read as such: `/health` says the
process is up; `/ready` says it can serve, because it queries the database. `/health` is
deliberately dependency-free because it is unauthenticated, and an unauthenticated endpoint that
reports on infrastructure is free reconnaissance.

**The database is not reachable off the machine and must never be.** To reach it:

```bash
ssh -L 15432:127.0.0.1:5432 azureuser@<ip>
psql postgresql://mynet:<password>@localhost:15432/<database>
```

---

## 5. Backups, retention, and the restore

> **The constitution names three parts. Two are automated; the third is an act, and it is the one
> that gets skipped.**

### The schedule

```bash
ssh azureuser@<ip> 'cd ~/app/deploy/vm && ./backup.sh install'
ssh azureuser@<ip> 'cd ~/app/deploy/vm && ./backup.sh status'
```

Daily at 02:30 host-local. `install` is idempotent: it drops every crontab line carrying the
`# mynet-backup` marker and appends exactly one.

### Retention

**Seven artifacts**, in `deploy/vm/backups` on the VM, set by `BACKUP_KEEP_LOCAL` in `.env` and
reported by `./backup.sh status` — because a number visible only in a file nobody opens is not
"written down".

Each run: takes the lock → refuses below the disk floor → dumps → **verifies the archive is
readable** → prunes. Pruning is last and gated on that verification. Reversing that turns a backup
script into a data-destruction script: a persistently failing dump would walk the retained set
7 → 6 → … → 0 while every run "succeeded" at taking a backup.

### Two limitations, stated rather than implied

> **1. Every artifact stays on this VM.** There is no off-host copy — not in `backup.sh`, not in
> `deploy.sh`, not in the cron entry. So the single most likely event a daily backup is kept for —
> loss or corruption of the disk, or an accidental `az vm delete` — destroys the database **and all
> seven artifacts together**. The schedule and the retention period are discharged; the _purpose_
> is only partly. Closing it means adding an off-host copy after the verification gate and before
> pruning, with local pruning conditional on a confirmed remote copy.
>
> **2. Nothing reports a failure.** `cmd_run` writes into `backup.log` and exits with a code; there
> is no monitoring to read either. `./backup.sh status` now reports the **last run's outcome** and
> **exits non-zero when the newest artifact is over ~36 hours old**, so it can be wired to
> something later without changing it — but until it is, an operator has to run it.

### The restore — and this is the part that is not optional

```bash
./verify-backup-local.sh
```

Runs the whole cycle — dump → verify → restore → compare — against a throwaway container, using
**the same `pg_dump` and `pg_restore` invocations `backup.sh` uses**. It checks the row counts,
and then three things that are easy to lose and silent when lost:

- **the `ON DELETE CASCADE`** — account deletion depends on it, so a restore that loses it leaves
  a database that looks correct and stops deleting personal data;
- **the `unaccent` extension** — directory search depends on it, so losing it leaves a search that
  finds nobody at a Spanish-language conference;
- **that `unaccent` still works**, not merely that its row is present.

**011 added three more to the same script** (T156), because the administrative schema has two
shapes that a row count cannot see and that fail exactly the way the cascade does — the rows come
back, the database looks correct, and a guarantee is gone. They are inverses of each other:

- **`ON DELETE NO ACTION` survived.** `organizer_assignments.event_id` is the one reference in
  this schema deliberately _not_ cascading (FR-937). Restored as a cascade, deleting a conference
  would strip its organizers' authority with no audit entry to explain it.
- **The partial unique index survived, predicate included.** One live assignment per attendee and
  conference, with revoked rows unconstrained so they accumulate as history. Restored without the
  `WHERE`, it becomes _stricter_ than intended and rejects the history; restored not at all, one
  attendee can hold two live assignments and nothing at read time notices.
- **And that the index still constrains** — a second live assignment is refused — which is the
  same standard the `unaccent` check applies: a definition that is present but not enforcing is
  still a definition.

Two things the script cannot check, for a human doing a real restore:

- **`operators.password_hash` may legitimately be null**, so "nobody can sign in" is not evidence
  the restore failed — it is the seeded state (FR-990). Re-running the bootstrap is safe but is
  not a repair; read the last-operator section above first.
- **Verify the administrative host itself**, with the `curl` checks in section 4. The attendee
  product coming back is not evidence that the admin one did: separate certificate, separate
  artifact, separate origin, and the database you just replaced is the only shared component.

To restore for real, into an environment:

```bash
./maintenance.sh prod on --until "…"
scp deploy/vm/backups/<artifact>.dump azureuser@<ip>:/tmp/
ssh azureuser@<ip> 'cd ~/app/deploy/vm && docker compose stop api'
ssh azureuser@<ip> 'cd ~/app/deploy/vm && docker compose exec -T postgres \
    pg_restore --username mynet --dbname <database> --clean --if-exists /backups/<artifact>.dump'
ssh azureuser@<ip> 'cd ~/app/deploy/vm && docker compose start api'
./maintenance.sh prod off
```

**Record every restore in `OPERATIONS-LOG.md`.** The requirement is not that a procedure exists; it
is that one has been performed, and the log is the evidence.

---

## 6. Rolling back — **including when the schema has moved ahead of the application**

Rolling back the application is a redeploy of an earlier commit:

```bash
git checkout <earlier-sha>
./deploy.sh prod --no-build      # or without --no-build to rebuild that commit's image
```

### The case that is not simple

> **Migrations are applied forward and are never reversed by this tooling. There is no
> `--down`, and there is not going to be one.**

If the failed deploy ran `--migrate`, the database is now at the **new** schema and you are about
to run the **old** application against it. What happens depends entirely on what the migration
did, and there are exactly two cases:

**A. The migration was additive** — a new index, a new nullable column, a new table, an extension.
The old application does not know the new object exists and does not reference it. **Roll the
application back and stop.** Nothing further is needed. Every migration this project has shipped
so far is in this category, including `0005`, which is five indexes and one extension.

**B. The migration was destructive or narrowing** — a dropped or renamed column, a tightened
constraint, a changed type. The old application will fail, usually partially and usually on one
surface. **Do not roll the application back into it.** Instead:

1. Stay in maintenance.
2. **Restore from the most recent backup taken before the deploy** (section 5). That is what the
   backup is for, and it is the only correct answer — a hand-written reverse migration authored
   under pressure against a live production database is how a recoverable incident becomes an
   unrecoverable one.
3. Roll the application back.
4. Leave maintenance.

**Which case you are in is decided when the migration is written, not when it fails.** A migration
that drops or narrows anything must be reviewed knowing that its rollback is a restore. Prefer the
expand-then-contract shape — add the new thing, ship the application that uses it, remove the old
thing in a _later_ release — which keeps every individual deploy in case A.

---

## 7. What is deliberately not here

- **No per-change preview deployment.** Constitution v3.0.0 withdraws 001's FR-066 and SC-011 —
  the first delivered requirement this project has retracted. A reviewer sees a change deployed on
  UAT _after_ approving it rather than before. The cost is real and is recorded rather than
  glossed; `plan.md`'s Complexity Tracking states it.
- **No managed database.** Standing decision 17. That is why section 5 exists.
- **No monitoring or alerting.** Nothing pages anybody. `./backup.sh status` and
  `docker compose ps` are the whole of the operational surface today, and an operator has to look.
  `backup.sh status` exits non-zero on a stale backup so it can be wired to something later.
- **No off-host backup copy.** See section 5. The artifacts share a failure domain with the data
  they protect, which is the one thing a backup is most supposed not to do.
- **The deploy jobs are not runnable yet even once the environments exist.** `deploy.sh` reaches
  the VM over SSH, and `az login` grants control-plane access rather than SSH — a deploy key, a
  pinned `known_hosts`, and an NSG rule admitting the runner are all still needed. The job prints
  this list rather than discovering it at cutover.
