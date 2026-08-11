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

| Resource                                       | Note                                          |
| ---------------------------------------------- | --------------------------------------------- |
| `vm-mynet-uat` (`Standard_B2s`, Ubuntu 24.04)   | `provisioningState: Succeeded`, power: running |
| `vm-mynet-uat_OsDisk_…` (64 GB StandardSSD_LRS) | —                                             |
| `vm-mynet-uatPublicIP` → **20.9.29.146**        | Standard SKU, static                          |
| `vm-mynet-uatVNET`, `vm-mynet-uatVMNic`         | —                                             |
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

| Script             | Outcome                                                      |
| ------------------ | ------------------------------------------------------------ |
| `provision-vm.sh`  | **REFUSED**, naming "UAT resolves to production's DATABASE NAME" and printing both values |
| `deploy.sh`        | **REFUSED**, same message                                     |
| `maintenance.sh`   | **REFUSED**, same message                                     |

The file was then restored and verified byte-identical to the commit (`git diff` empty), and the
same scripts were re-run and proceeded.

**`backup.sh` is not in that table, and its absence is correct rather than a gap.** It was run and
printed its usage instead of refusing, which looked like a hole for about a minute. It is not one:
`backup.sh` runs **on the VM**, takes `run|install|status` rather than an environment, and reads
only the `.env` beside it. It has no committed env file to be pointed at the wrong one *with* —
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
