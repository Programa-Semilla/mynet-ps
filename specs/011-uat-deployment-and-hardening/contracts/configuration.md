# Contract: Configuration and Secrets

**Feature**: 010 | **Satisfies**: FR-837 | **Date**: 2026-08-10

Every value the deployed environment needs, **including the ones that predate this feature**. The
inventory exists because it has already gone wrong: register entry 17 records two authentication
secrets that were never set in the workflow at all, and were "invisible only because `db-branch`
failed first."

Each row states **what a blank value costs**, because that is the column somebody reads at 2am.

## On the VM, in the `.env` beside the compose file

Never committed, excluded from every rsync.

| Value | Status | What a blank value costs |
|---|---|---|
| `APP_DOMAIN` | **set by this feature** — `mynet-dev.programasemilla.com` | Certificate issuance fails. FR-825 forbids falling back to plain HTTP, so the stack does not serve. |
| `ACME_EMAIL` | **must be set; blank today** | The certificate authority has no contact for expiry warnings. Issuance may still succeed, so this fails *quietly*, which is worse. |
| `DATABASE_HOST` | already `postgres` | — This is the value the FR-485 guard compares. Changing it is how UAT would come to point somewhere it must not. |
| `DATABASE_NAME` | **must be set** — `mynet_uat` | The API cannot connect. Loud and immediate. |
| `POSTGRES_USER` | already `mynet` | — |
| `POSTGRES_PASSWORD` | **must be generated** | The database container refuses to initialise. Loud. |
| `AUTH_PASSWORD_PEPPER` | **must be generated** | **Every stored password hash becomes unverifiable if this ever changes.** Generate once, never rotate without a password-reset campaign. This is one of the two register entry 17 remembers. |
| `AUTH_ATTEMPT_HASH_KEY` | **must be generated** | The throttle cannot key its counters, so rate limiting silently stops binding. The second of entry 17's two. |
| `AUTH_SESSION_IDLE_DAYS` | defaulted to 14 | — |
| `MAIL_FROM` | **must be set**, on the sending domain | Mail is sent from a placeholder address that fails sender verification, so nothing arrives. |
| `MAIL_SMTP_URL` | **must be set** (R3) | **The API does not start.** `SinkMailService` throws under production because it holds reset links. This is the constraint that sequences the whole feature — see R2. |
| `MAIL_OPERATOR_ADDRESS` | **set by this feature** — `apps@programasemilla.com` | A report still blocks and is still recorded; the dispatch is skipped and logged. Safety is unaffected; nobody is told. |
| `PUSH_VAPID_PUBLIC_KEY` | **set by this feature** | The sink records instead of delivering, the attendee is never asked for permission, and everything else is unaffected. A complete product, by FR-552. |
| `PUSH_VAPID_PRIVATE_KEY` | **set by this feature** | As above. Config refuses to start with exactly one of the pair, so a half-configured pair is caught. |
| `PUSH_VAPID_SUBJECT` | defaulted, **and read by nothing** | Nothing. FR-854 requires removing it — see the note below. |
| `AVATAR_DIMENSION_PX`, `AVATAR_CARD_DIMENSION_PX` | defaulted | — |
| `BACKUP_DIR`, `BACKUP_KEEP_LOCAL`, `BACKUP_MIN_FREE_MB` | defaulted | — |
| `BACKUP_REMOTE_*` | **new (R4)** — container and write-only credential | **Pruning must not proceed** (FR-871), so local artifacts accumulate until the disk check trips. Deliberate: filling a disk is recoverable, losing every backup is not. |

## Committed, in `deploy/vm/envs/uat.env`

Reviewable in a pull request rather than living in an operator's shell history. Nothing secret.

| Value | This feature |
|---|---|
| `SUBSCRIPTION` | `d428f98f-a3c4-49c3-ae24-06ec3de08477` — blank today; FR-821 requires pinning by identifier |
| `RESOURCE_GROUP`, `VM_NAME` | already `rg-mynet-uat`, `vm-mynet-uat` |
| `LOCATION` | already `centralus` |
| `VM_SIZE` | `Standard_B2als_v2`, changed from `Standard_B2s` (R8) |
| `APP_DOMAIN` | `mynet-dev.programasemilla.com` |
| `DATABASE_HOST`, `DATABASE_NAME` | already set — **`DATABASE_HOST` is what the FR-485 guard compares** |

**`envs/prod.env` is not touched.** `APP_DOMAIN` stays blank until `mynetcr.com` is registered —
constitution v3.4.0 forbids committing it, and a blank value is what keeps the deploy job's refusal
honest.

## Repository environment secrets (`uat`)

| Secret | Status | Notes |
|---|---|---|
| `AZURE_CREDENTIALS` | **must be created** | Service principal. Needs enough to manage the resource group **and** network-write on the one NSG, for R1's just-in-time rule. |
| `DEPLOY_SSH_KEY` | **must be created** | The deploy job reaches the VM over SSH; `az login` grants control-plane access, not shell. |
| `SSH_KNOWN_HOSTS` | **must be created** | FR-834: the host's identity is verified out-of-band before first use, not accepted on first connection. `deploy.sh` prints the commands. |
| `PUSH_VAPID_PRIVATE_KEY` | **must be created** | FR-850. Injected into the VM `.env` at deploy time. **Rotate only on compromise** (FR-852) — rotating silently stops delivery for every attendee until their browser re-registers, and nothing tells them. |
| `MAIL_SMTP_URL` | **must be created** | Carries the credential in the URL, so it is a secret in full. |

## Client build-time values

| Value | Notes |
|---|---|
| `VITE_API_BASE_URL` | Same-origin. This is what keeps `connect-src 'self'` literally true. |
| `VITE_PUSH_VAPID_PUBLIC_KEY` | **The FR-853 problem.** The public key is configured twice — here and as `PUSH_VAPID_PUBLIC_KEY` on the API — with nothing checking they agree. One source of truth is required; serving it from the API is the obvious shape. |
| **UAT marker flag** | **New (FR-828, R6).** Build-time, so the production bundle does not contain the marker at all rather than containing it behind a check. |

## Two cleanups this inventory makes unavoidable

Both come from the `vapid-config-duplication` idea-inbox entry, pulled into this feature because its
own wording says to settle it when the real adapter lands.

1. **`PUSH_VAPID_SUBJECT` is read by nothing.** FR-854 requires removing it. A configuration member
   that exists only to be documented is a member somebody will one day set and expect to matter.
2. **The public key has two sources.** FR-853 requires one. Two values that nothing checks agree is
   exactly the drift this codebase refuses everywhere else.

## The rule this contract enforces

**FR-836: a missing required value fails at the point that names it, not later at a point that names
something else.** That is the whole lesson of register entry 17 — the two missing auth secrets would
have failed one line further on, and were invisible only because an unrelated step failed first.
