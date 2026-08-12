# Operations log

Append-only. One entry per operational act that the constitution requires **evidence** of rather
than a procedure for — today that means restores (SC-413), and it will mean production incidents
when there is a production.

**Newest last.** Each entry states what was done, by whom, against what, and what was observed —
not what was expected. An entry recording an intention is worth nothing.

---

## 2026-08-07 — restore procedure exercised locally

**Act**: `deploy/vm/verify-backup-local.sh`, run from a developer machine.

**Against**: a throwaway `postgres:17` container. **Not** UAT and **not** production — neither
environment exists yet (no domain, no subscription; tasks T004 and T006 are owner decisions the
specification records as open).

**What was exercised**: the full cycle, using the same `pg_dump` and `pg_restore` invocations
`backup.sh` uses — dump → `pg_restore --list` → restore into a fresh database → compare.

**Observed**:

| Check                                        | Result |
| -------------------------------------------- | ------ |
| The dump is non-empty                        | PASS   |
| `pg_restore --list` parses the archive       | PASS   |
| `pg_restore` completes into a fresh database | PASS   |
| Every row of `people` survived (250)         | PASS   |
| Every row of `interests` survived (250)      | PASS   |
| The `ON DELETE CASCADE` survived             | PASS   |
| The `unaccent` extension survived            | PASS   |
| `unaccent('Muñoz')` still returns `Munoz`    | PASS   |

The last three are the ones worth having. A restore that reproduces rows but loses the cascade
leaves a database that looks correct and **silently stops deleting personal data** on account
deletion — the guarantee 004 shipped. A restore that loses `unaccent` leaves a directory search
that finds nobody at a Spanish-language conference, with no error anywhere.

**What this does NOT discharge.** SC-413 asks for a restore performed _before production holds
real attendee data_, and this is not that run — it is the procedure proved to work as written.
The remaining half is T081: run `./backup.sh install` on each VM, let a scheduled backup fire,
and restore **that artifact**. It cannot be done until the environments exist.

**Recorded by**: the 006 implementation.

---

## 2026-08-11 — UAT provisioned. The first infrastructure this project has ever had.

**Act**: `deploy/vm/provision-vm.sh uat`, run from a developer machine.

**Against**: subscription `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv), `centralus`.

**What exists now**, in resource group `rg-mynet-uat`:

| Resource                                        | Note                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `vm-mynet-uat` (`Standard_B2s`, Ubuntu 24.04)   | `provisioningState: Succeeded`, power: running               |
| `vm-mynet-uat_OsDisk_…` (64 GB StandardSSD_LRS) | —                                                            |
| `vm-mynet-uatPublicIP` → **20.9.29.146**        | Standard SKU, static                                         |
| `vm-mynet-uatVNET`, `vm-mynet-uatVMNic`         | —                                                            |
| `vm-mynet-uatNSG`                               | `allow-web` 80/443 from `*`; `allow-ssh` 22 from one address |

**Observed**: SSH reachable, `cloud-init status: running`, Docker 29.7.2 already installed.

### The size is NOT what research R8 chose, and the reason is worth keeping

R8 chose `Standard_B2als_v2` for longevity — the v1 B-series retires in 2028. The preflight
reported it **available** in `centralus` with `restrictions: []`, which is true, and provisioning
would still have failed: the quota for its family, `standardBasv2Family`, is **0 of 0**.

Checked in `eastus`, `eastus2`, `southcentralus` and `westus2` as well — **0 of 0 in every one**.
It is not a regional problem. A newer VM family starts at zero on a subscription until somebody
asks for it, while `standardBSFamily` ships with 10 vCPUs everywhere. Moving region would not have
fixed it and would have contradicted constitution v3.4.0 decision 32.

**This produced a real gap in the T008 preflight, found by running it rather than by reading it.**
The first version asked only whether the size was available. Availability and quota are different
questions in Azure, and asking only the first reports success and then watches `az vm create` fail
— with a resource group already created, and an error naming neither the family nor the limit,
which is exactly what FR-822 exists to prevent. The preflight now checks both, and reports every
insufficient limit rather than the first.

**A quota request for `standardBasv2Family` (limit 10, `centralus`) was filed**:
`quotaRequests/cb609661-21b3-464d-936f-1ae04c19a962`, state `InProgress` at the time of writing.
When it is granted the VM can be deallocated and resized to `Standard_B2als_v2`; until then
`envs/uat.env` names `Standard_B2s` and the preflight will refuse anything else.

### The host key was verified out-of-band (FR-834)

Fingerprints as reported by the VM itself through the Azure guest agent — a channel independent of
SSH — compared against what is offered over the network. **All three matched**:

```
256  SHA256:+O7yfLKE+iGOrUZ8kQbs20zdyF9VUoh5T3qnqdWlrsI  (ECDSA)
256  SHA256:X5VS2WoLN4tNoNTZHEWKgm9nLcIWWHjadROhd3pRkcg  (ED25519)
3072 SHA256:m36W0CrldGqoTWu6QxUxfyBnWp5nQ9tkpOumLHGR22Y  (RSA)
```

### What this does NOT discharge

Nothing is deployed. There is no DNS record, no certificate, no `.env` on the VM, no database and
no application — the machine is a bare Ubuntu host with Docker on it. The next step is an A record
for `mynet-dev.programasemilla.com` pointing at `20.9.29.146`, which is an owner action at the
registrar: the zone is served by GoDaddy (`ns25/ns26.domaincontrol.com`), not Azure DNS, so no
script in this repository can create it.

**Recorded by**: the 010 implementation, phase 5.

---

## 2026-08-11 — DNS cut over, and the FR-485 guards provoked rather than believed

**Act**: an `A` record for `mynet-dev.programasemilla.com` was created at GoDaddy by the owner,
then the data-separation guards were deliberately made to fire.

### DNS

Resolves to `20.9.29.146` from the authoritative nameserver (`ns25.domaincontrol.com`), from
`8.8.8.8`, from `1.1.1.1` and from this machine's own resolver. No propagation delay observed.

### The guard, provoked (FR-485, FR-881, SC-811)

`envs/uat.env` was edited to name production's database — `DATABASE_NAME=mynet_prod` — and every
script that takes an environment was run:

| Script            | Outcome                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `provision-vm.sh` | **REFUSED**, naming "UAT resolves to production's DATABASE NAME" and printing both values |
| `deploy.sh`       | **REFUSED**, same message                                                                 |
| `maintenance.sh`  | **REFUSED**, same message                                                                 |

The file was then restored and verified byte-identical to the commit (`git diff` empty), and the
same scripts were re-run and proceeded.

**`backup.sh` is not in that table, and its absence is correct rather than a gap.** It was run and
printed its usage instead of refusing, which looked like a hole for about a minute. It is not one:
`backup.sh` runs **on the VM**, takes `run|install|status` rather than an environment, and reads
only the `.env` beside it. It has no committed env file to be pointed at the wrong one _with_ —
the misconfiguration FR-485 defends against is not expressible there. The guard covers the three
scripts that resolve an environment from `envs/`, which is all of the ones that can.

**Observed, unprompted**: `az vm create` is idempotent. `provision-vm.sh uat` was re-run against
the existing VM while testing the above, and the machine kept its IP, size, uptime and `.env`.

### The seed's production guard (FR-882)

`tests/unit/seed-target-guard.test.ts` — 12 assertions, all passing. It keys on the **resolved
database name** (`mynet_uat` and `mynet_prod` are both in `DEPLOYED_DATABASES`) rather than on
`NODE_ENV`, which is stronger than the idea-inbox entry that raised it proposed: an SSH tunnel
makes a production database look local, and `NODE_ENV` is a statement about a process rather than
about what it is pointed at. Seeding UAT will therefore require `SEED_TARGET_DATABASE=mynet_uat`
as an explicit opt-in, which is phase 7's T044.

### The VM `.env`

Generated **on the host**, so no secret passed through an operator's terminal or shell history.
`chmod 600`. `POSTGRES_PASSWORD`, `AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY` are 48-byte
random values; a VAPID pair was generated in a throwaway `node:22-alpine` container so nothing was
installed on the host.

**`AUTH_PASSWORD_PEPPER` must never be regenerated** — every stored password hash becomes
unverifiable if it changes. The generator refuses to run when a `.env` already exists, for exactly
that reason.

**`MAIL_FROM` and `MAIL_SMTP_URL` are still blank, and the environment therefore cannot start
yet.** That is research R2 working as designed: `SinkMailService` throws under `NODE_ENV=production`
because it writes reset links to the log, and a reset link is the account.

**Recorded by**: the 010 implementation, phase 5.

---

## 2026-08-11 — first deploy. **MyNet is serving at a public address.**

**Act**: `deploy/vm/deploy.sh uat --migrate`, by hand, from a developer machine — deliberately
before any automation exists, so there is a known-good path to compare against when phase 11's CI
deploy misbehaves.

**Result**: `https://mynet-dev.programasemilla.com` serves the product over a Let's Encrypt
certificate obtained without anyone touching it. Migrations applied. Three containers healthy.

### It took four attempts, and every failure was a path nothing had ever executed

This is the point of doing the first deploy by hand. None of these three could have been found by
review, by lint, or by any test in the repository — each lives in code that had never once been
run, because nothing had ever been deployed.

| #   | Failure                                                                  | Cause                                                                                                                                                                                   | Fix                                                                                                                               |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scp: dest open ".../maintenance/index.html": No such file or directory` | `deploy.sh` enters maintenance at step 1b and rsyncs at step 3 — correct ordering, but on a **first** deploy the target directory does not exist yet                                    | `mkdir -p` before the `scp` in `maintenance.sh`                                                                                   |
| 2   | `ERROR: Unknown option: 'legacy'` building the API image                 | `apps/api/Dockerfile` ran `pnpm deploy --prod --legacy`; `--legacy` is a **pnpm 10** flag while `packageManager` pins **9.15.9**                                                        | dropped the flag; the Dockerfile's own header already warned it was "reviewed-but-untried"                                        |
| 3   | `TypeError: Invalid URL` in the migration runner                         | `POSTGRES_PASSWORD` was generated with `openssl rand -base64`, and `/` and `+` are not URL-safe. `docker-compose.yml` **substitutes** it into `DATABASE_URL`, and Compose cannot escape | regenerated with `tr '+/' '-_'`; the volume was destroyed and re-initialised, since `initdb` only runs on an empty data directory |

**The third is worth more than its fix.** The driver's error message contained the entire
connection string — password included — which is how a secret reaches a log at exactly the moment
somebody is pasting logs to ask for help. `.env.example` now states that the value must be
URL-safe, why Compose cannot escape it, and gives a generator that produces one.

### Verified from OUTSIDE the host, not from it (T037, FR-824–FR-826)

| Check                               | Observed                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Certificate (FR-825)                | `CN=mynet-dev.programasemilla.com`, issuer Let's Encrypt `YE1`, valid to 2026-11-09 |
| HTTP → HTTPS                        | `308` to `https://mynet-dev.programasemilla.com/`                                   |
| Client served                       | `200`, `text/html`, 854 bytes                                                       |
| API on the **same origin** (FR-824) | `GET /api/health` → `200`; `GET /api/ready` → `{"status":"ready"}`                  |
| Database off-host (FR-826)          | connection to `:5432` refused                                                       |
| Security headers (SC-411)           | every declared header present; `img-src` permits `data:`                            |

### The readiness gate, demonstrated rather than asserted (T038, FR-827)

The database container was **stopped**, and the two endpoints compared:

```
/api/health -> 200  {"status":"ok"}
/api/ready  -> 503  {"status":"unavailable","dependency":"database"}
```

That is the whole of FR-827 in four lines. A deployment gating on `/health` would have declared
success against a product that could not answer a single attendee request. `postgres` was
restarted and `/ready` returned `200`.

### What is NOT done

Nothing is seeded — no conference, no join code, no attendee — so the address serves an empty
product. Mail is configured and its credentials authenticate (`235 Authentication successful`
against `smtp.mailgun.org:465`, TLS verified, no message sent), but no account journey has been
walked. Backups are not installed on the host and the off-host container does not exist.

**Recorded by**: the 010 implementation, phase 5.

---

## 2026-08-11 — the mail failure paths, provoked on the live environment

**Act**: `MAIL_SMTP_URL`'s host was pointed at a domain that does not resolve — credential
untouched — the API was restarted, and the two actions that send mail were exercised against
`https://mynet-dev.programasemilla.com`. Then it was restored.

FR-846 and FR-847 say a dispatch failure must be logged rather than discarded, and must not fail
the action that triggered it. Both are the kind of claim that is easy to assert and easy to have
wrong, because the happy path never exercises them.

### Account creation with mail broken (T048, FR-846, FR-847)

| Check                    | Observed                                     |
| ------------------------ | -------------------------------------------- |
| `POST /api/auth/sign-up` | **204** — the account was created            |
| the attendee row         | present                                      |
| the failure              | **logged** (2 matching lines in the API log) |

### A report with mail broken (T067, FR-847, FR-862)

| Check                         | Observed     |
| ----------------------------- | ------------ |
| `POST /api/reports`           | **204**      |
| the block, in the same action | **applied**  |
| the report row                | **recorded** |

That is FR-847 exactly: _a report still blocks and is still recorded, and an account is still
created_. Safety does not depend on an external service answering.

### Restored

`MAIL_SMTP_URL` was put back and re-authenticated against `smtp.mailgun.org:465` — `235
Authentication successful`, no message sent. The probe account and **all** rows in
`attendee_blocks` were deleted so that a by-hand walkthrough is not confused by test data; that
delete was not surgical, and any block created before it is gone.

**Recorded by**: the 010 implementation, phases 7 and 10.

---

## 2026-08-11 — CI credentials, and a dedicated deploy key

**Act**: the `uat` GitHub environment was created and four of its five secrets stored.

| Secret                   | Source                                                           | Note                                              |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| `PUSH_VAPID_PRIVATE_KEY` | the VM's `.env`                                                  | piped straight from the host; never in a terminal |
| `SSH_KNOWN_HOSTS`        | `ssh-keyscan`, against fingerprints already verified out-of-band | FR-834                                            |
| `MAIL_SMTP_URL`          | the VM's `.env`                                                  | piped                                             |
| `DEPLOY_SSH_KEY`         | **a new key, generated on the VM**                               | see below                                         |
| `AZURE_CREDENTIALS`      | **NOT SET**                                                      | needs a service principal — see below             |

### The deploy key is its own key, and that was a deliberate refusal

`provision-vm.sh` runs `az vm create --generate-ssh-keys`, which reuses the operator's
**personal** `~/.ssh/id_rsa`. Storing that as `DEPLOY_SSH_KEY` would have been the quick path and
would have handed every workflow run an identity that almost certainly opens other doors.

So a dedicated `ed25519` pair was generated **on the host**, its public half appended to
`authorized_keys`, and only the private half piped into the secret:

```
256 SHA256:Agt37YNhgpMB1mxnGRaT/VBq/2OX1bs+tIt0PLI128s mynet-uat-ci-deploy (ED25519)
```

It reaches exactly one machine and is revoked by deleting one line. Verified working by
connecting with `IdentitiesOnly=yes` against that key alone.

### `AZURE_CREDENTIALS` is outstanding and may not be obtainable

The operator's account resolves as
`danny.perez.u_gmail.com#EXT#@appsprogramasemilla.onmicrosoft.com` — **a guest in the tenant**.
Guests usually cannot register applications, and the tenant's authorization policy is not readable
by a guest to confirm either way. Until this exists, `deploy-uat` prints what it is blocked on and
exits 0 rather than failing every merge.

If it turns out to be unobtainable, R1's just-in-time NSG design needs Azure control-plane access
**by construction**, so the design has to be revisited rather than worked around.

### The UAT marker, measured on the live site (T079, FR-828)

Chromium against `https://mynet-dev.programasemilla.com`, signed in, at four widths:

| Width    | Marker present | Horizontal overflow |
| -------- | -------------- | ------------------- |
| 320×568  | yes            | **0px**             |
| 390×844  | yes            | **0px**             |
| 768×1024 | yes            | **0px**             |
| 1440×900 | yes            | **0px**             |

320px is the width the requirement is really about — the header there already carries the product
name, the conference switcher, the profile control and sign-out. The marker adds no row and costs
no horizontal space. **The subjective half — whether it looks right — is still T082's and T084's,
and belongs to a person.**

**Recorded by**: the 010 implementation, phases 9 and 11.

## 2026-08-11 — restore procedure re-exercised, with the administrative schema's shapes added

**Act**: `deploy/vm/verify-backup-local.sh`, run from a developer machine, after extending it with
three checks for 011 (T156).

**Against**: a throwaway `postgres:17` container. Still **not** UAT and **not** production —
neither environment exists yet, and the two owner decisions blocking them are unchanged.

**Why it was re-run**: 011 adds administrative tables whose guarantees are structural rather than
row-shaped, and the existing script checked one cascade, one extension, and row counts. A restore
that reproduced every administrative row while losing either shape below would look completely
correct.

**Observed**:

| Check                                                           | Result |
| --------------------------------------------------------------- | ------ |
| The dump is non-empty                                           | PASS   |
| `pg_restore --list` parses the archive                          | PASS   |
| `pg_restore` completes into a fresh database                    | PASS   |
| Every row of `people` survived (250)                            | PASS   |
| Every row of `interests` survived (250)                         | PASS   |
| The `ON DELETE CASCADE` survived                                | PASS   |
| The `unaccent` extension survived                               | PASS   |
| `unaccent('Muñoz')` still returns `Munoz`                       | PASS   |
| **The `ON DELETE NO ACTION` survived** (new)                    | PASS   |
| **The partial unique index survived, predicate included** (new) | PASS   |
| **A second live assignment is still refused** (new)             | PASS   |

The three new ones model `organizer_assignments`: a reference that must **not** cascade (FR-937 —
a conference deletion must never silently strip authority) and a partial unique index that must
come back **with its `WHERE` clause** (without it the index is stricter than intended and rejects
the revoked rows kept as history). The third is the behavioural half — an index present but not
enforcing is still an index — and it is the same standard the `unaccent` check has always applied.

**What this does NOT discharge.** Unchanged from the entry above: SC-413 asks for a restore
performed before production holds real attendee data, and this is still the procedure proved to
work as written rather than that run. 011 adds nothing to that half and does not move it.

**Not exercised, and worth stating**: no restore has been performed against a database containing
real administrative rows, because none exists. The shapes are verified; the data path is not.

**Recorded by**: the 011 implementation.
---
