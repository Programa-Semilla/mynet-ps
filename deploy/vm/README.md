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
                    :80 :443
                       │
                   ┌───▼────┐   auto-TLS (Let's Encrypt)
                   │ caddy  │   serves /srv/web, proxies /api/*
                   └─┬────┬─┘
        /api/*  ─────┘    └───── everything else
             │                        │
        ┌────▼────┐            (the built client,
        │   api   │             rsynced from CI)
        └────┬────┘
             │
     ┌───────▼────────┐
     │   postgres     │  127.0.0.1:5432 — LOOPBACK ONLY (FR-486)
     └────────────────┘
```

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

**UAT was provisioned on 2026-08-11 and is live.** What follows is the procedure that actually
produced it, corrected against what went wrong — see `OPERATIONS-LOG.md` for the run itself.
Production is not provisioned and this feature deliberately did not touch it (FR-894).

### Prerequisites — every one of them, because SC-814 asks for no step that exists only in a head

| You need                                  | Why                                                                    | If you do not have it                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `az` CLI, logged in                       | provisioning and the subscription guard                                | `az login`                                                                                                                       |
| Access to subscription `d428f98f-…`       | it is pinned by id in `envs/uat.env`                                   | you get a refusal naming the id; ask the subscription owner                                                                      |
| **Quota** for the VM family in the region | availability and quota are different questions                         | the preflight refuses and names the family and the limit                                                                         |
| An SSH key pair                           | `az vm create --generate-ssh-keys` reuses `~/.ssh/id_rsa` or makes one | nothing — it is created for you                                                                                                  |
| Control of the DNS zone                   | Caddy needs a resolving A record before it can get a certificate       | **this is the blocking one.** `programasemilla.com` is served by GoDaddy, not Azure DNS, so no script here can create the record |
| SMTP credentials                          | **the API will not boot without them**                                 | see the warning below                                                                                                            |
| `docker`, `rsync`, `python3` locally      | the image build, the sync, the cloud-init ASCII check                  | install them                                                                                                                     |

### The order, and it matters

```bash
az login
az account set --subscription d428f98f-a3c4-49c3-ae24-06ec3de08477

./provision-vm.sh uat          # preflights size AND quota, then prints the VM's public IP
```

**Now create the DNS A record** pointing at that IP, and wait until it resolves:

```bash
dig +short A mynet-dev.programasemilla.com     # must return the VM's IP before continuing
```

Then create the `.env` **on the VM**, so no secret passes through your terminal or shell history:

```bash
ssh azureuser@<ip>
cd ~/app/deploy/vm && cp .env.example .env && nano .env
chmod 600 .env
```

> ### ⚠️ Generate `POSTGRES_PASSWORD` with a URL-SAFE alphabet
>
> `docker-compose.yml` **substitutes** it into `DATABASE_URL`, and Compose does substitution, not
> escaping. A `/` from `openssl rand -base64` ends the userinfo and starts the path; `+`, `@`, `:`
> and `#` each break it differently. The driver then throws `ERR_INVALID_URL` **with the entire
> connection string, password included, in the error message**.
>
> ```bash
> openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'    # or: openssl rand -hex 32
> ```
>
> This is not hypothetical — it is what failed the third attempt at the first real deploy.

> ### ⚠️ `MAIL_SMTP_URL` is not optional. The API will not start without it.
>
> `SinkMailService` throws under `NODE_ENV=production` because it writes verification and reset
> links to the log, and **a reset link is the account**. The compose file sets production. So a
> deployment with no SMTP URL fails at boot rather than silently leaking credentials — which is
> the refusal working, not a defect to route around.
>
> Percent-encode the username: Mailgun's is `postmaster@your-domain`, and a raw `@` in the
> userinfo breaks the URL exactly as the password characters above do.

Finally, from your machine:

```bash
./deploy.sh uat --migrate
```

### Seeding — once, and read the warning first

```bash
ssh azureuser@<ip> 'cd ~/app/deploy/vm && \
  docker compose run --rm -T -e SEED_TARGET_DATABASE=mynet_uat api node dist/db/seed/index.js'
```

The `SEED_TARGET_DATABASE` opt-in is required and is not ceremony: the guard keys on the
**resolved database name**, not on `NODE_ENV`, because an SSH tunnel makes a production database
look local and `NODE_ENV` is a statement about a process rather than about what it is pointed at.

> ### ⚠️ RE-SEEDING DESTROYS EVERY ACCOUNT CREATED AGAINST THIS ENVIRONMENT
>
> Including a reviewer's, an hour before a review. The seed **clears whole domains** — attendees
> and everything cascading from them: profiles, registrations, saved sessions, notes, cards,
> conversations, appointments, questions.
>
> This cannot be made additive without redesigning the seed, and nothing asks for that. 008
> records why it clears the entire Network domain rather than only what it seeded: a surviving
> card refuses `DELETE FROM events` and breaks the re-seed with an error naming neither table.
>
> **Seed once, at provisioning. Treat a second run as a decision, not a refresh.**

> ### The seeded credentials are committed and world-readable, on purpose
>
> `ada@example.com` / `correct-horse-battery-staple`, and the others beside them, are in this
> repository — which is public. That is fine **here and nowhere else**: UAT holds no real attendee
> data by construction (constitution v3.4.0 decision 30), so there is nothing behind those logins
> worth having. They must never be reused in any environment where that stops being true.

### Every value in `.env` differs between environments

Including `AUTH_PASSWORD_PEPPER`, which is mixed into every stored password hash — sharing it
would make a UAT disclosure a production one. **Generate the pepper once and never rotate it**
without a password-reset campaign for every account: every existing hash becomes unverifiable.

### The VAPID pair: rotate only on compromise

One pair per environment. **Rotation is a silent delivery outage** for every attendee until their
browser re-registers, and nothing in the product can tell them it happened — they simply stop
receiving notifications and have no reason to suspect anything (FR-852).

The public half is compiled into the client bundle by `deploy.sh`, which reads it back out of the
VM's own `.env` so there is exactly one copy of the pair. Since 010 the client and the API read
the **same variable name**, `PUSH_VAPID_PUBLIC_KEY`; there is no second `VITE_`-prefixed copy to
keep in step.

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

## 4a. Web Push on iPhone — read this before reporting it broken

**iOS will not deliver Web Push to a browser tab, and will not deliver it to Chrome at all.**
Apple exposes push only to **Home Screen web apps**, from iOS 16.4 onwards, and every browser on
iOS is WebKit underneath — so a third-party browser cannot receive it however it is configured.

Someone testing on a phone will open the address in whatever browser they normally use, see no
notification, and conclude the feature is broken. It is not, and neither is their phone.

**The procedure that works:**

1. Open the address **in Safari** — not Chrome, not Firefox.
2. **Share → Add to Home Screen.**
3. Launch MyNet **from the Home Screen icon**, not from Safari.
4. The notification control now appears, and the permission prompt with it.

Step 2 produces a real installed web app rather than a bookmark because the manifest declares
`display: standalone`, which is the condition Apple requires. `vite.config.ts` sets it.

**The product already handles this correctly and silently.** In a browser that cannot deliver,
`PushManager` is absent from `window`, so `NotificationService.isSupported()` is false and the
attendee is never offered a prompt that could not lead anywhere — the same complete-outcome
behaviour FR-552 requires for somebody who declines. There is nothing to fix; there is only this
to know.

**Verified 2026-08-11**: delivery works on desktop Chrome against the deployed environment. The
iPhone half is 011's physical-device test.

---

## 4. Checking an environment

```bash
curl -sI https://<domain>/                       # 200, and the security headers
curl -s  https://<domain>/api/health             # {"status":"ok"} — liveness
curl -s  https://<domain>/api/ready              # {"status":"ready"} — readiness
ssh azureuser@<ip> 'cd ~/app/deploy/vm && docker compose ps'
```

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

> ### Status, 2026-08-11: **backups are NOT configured on UAT, by decision**
>
> The owner's call, and a defensible one: UAT carries seeded data only, and `db:seed` recreates it
> in seconds. Backing up a database whose entire contents are regenerable from this repository
> buys close to nothing.
>
> **What that does not change.** Standing decision 17 requires a restore **actually performed**
> before _production_ holds real attendee data. `OPERATIONS-LOG.md` still records only one
> restore, against a throwaway container in 2026-08-07. **That obligation carries to production
> and is not optional there.**
>
> The code is ready and unexercised: `backup.sh` copies each artifact off-host and refuses to
> prune unless the copy is confirmed. It needs `BACKUP_REMOTE_CONTAINER` and
> `BACKUP_REMOTE_CREDENTIAL`, and a storage account that does not yet exist.

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
