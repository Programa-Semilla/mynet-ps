# Implementation Plan: UAT Deployment and Pre-Public Hardening

**Branch**: `spec/010-uat-deployment-and-hardening` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-uat-deployment-and-hardening/spec.md`

## Summary

Harden six abuse paths that all worsen once a public URL exists, then stand up the first deployed
environment this project has ever had: `mynet-dev.programasemilla.com`, on an Azure VM in
`LinaSys-DevEnv`, with automatic TLS, a real transactional mail adapter, a signing key pair for
push, continuous delivery on merge to `develop`, an off-host backup with a restore actually
performed, and a seeded conference somebody can join.

**No schema, no migration, and nothing an attendee can see** except two refusals and a UAT-only
environment marker.

**Two research findings shape the order of the work**, and both invert what the obvious plan would
have been:

1. **The deployed API cannot boot without the mail adapter.** `SinkMailService` throws under
   production by design — it holds reset links, and a reset link is the account — and the compose
   file sets `NODE_ENV: production`. Mail is therefore a prerequisite of the environment starting,
   not an improvement to a running one.
2. **The deploy path cannot reach the host as it stands.** Provisioning locks SSH to one operator's
   address; hosted runners have no stable one. This is a design decision (R1), taken as just-in-time
   NSG admission with unconditional teardown, and it is the single riskiest thing in the feature.

## Technical Context

**Language/Version**: TypeScript on Node 22 (API and client), Bash for the deployment scripts

**Primary Dependencies**: Fastify + Drizzle over PostgreSQL 17; React + Vite as an installable PWA;
Caddy as the TLS-terminating reverse proxy; Docker Compose on a single VM. **This feature adds at
most one runtime dependency** — an SMTP client for the mail adapter (R3) — and deliberately adds no
vendor SDK.

**Storage**: PostgreSQL in a loopback-only container on the VM; a `StorageService`-backed volume for
avatar bytes; **new in this feature**, an Azure Storage container as the off-host backup target (R4).

**Testing**: Vitest across unit, component and integration projects with per-job `postgres:17`
service containers; Playwright for end-to-end and accessibility. All ten correctness gates already
run in CI and none may be weakened (SC-813).

**Target Platform**: One `Standard_B2als_v2` Linux VM in `centralus` (R8), subscription
`d428f98f-a3c4-49c3-ae24-06ec3de08477`. Clients are desktop, tablet and mobile browsers.

**Project Type**: Web application (pnpm workspace: API, client, shared packages) plus a deployment
platform under `deploy/vm/`.

**Performance Goals**: No new goal. Two vCPU shared between the API, the database and the proxy is
the operating envelope, and it is why the read bounds in FR-801/FR-803 exist at all. The performance
pass itself is 011's.

**Constraints**: Client and API on one origin (what keeps `SameSite=Lax` a real defence); database
unreachable from outside its host; every deployment gated on readiness rather than liveness; UAT
never connected to real attendee data, enforced by a mechanism rather than a convention.

**Scale/Scope**: One environment, one conference of seeded content, a handful of team and reviewer
accounts. The 1,000-attendee figure the directory query was designed against is a UAT non-event.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial evaluation — PASS, no violations.** Re-evaluated after Phase 1 — **still PASS**, with one
item that moved and is recorded below.

| Principle / constraint | Assessment |
|---|---|
| **I — decisions are recorded, never inferred** | The five decisions this feature implements were ratified in **v3.4.0** before this plan was written. Nothing here resolves a register entry by inference; entry 19 is explicitly left open despite being made more urgent. |
| **III — the attendee is the only actor; no organizer administration** | No administrative interface, no privileged role, no in-product report reader (FR-893). The operator acts entirely out-of-band, which is the arrangement v3.1.0 ratified. **The feature's user stories have an operator as protagonist**, which is new — and legitimate, because the rule governs the product rather than who runs it. |
| **IV — accessibility and the three layouts** | One visible addition (FR-828), declared as a layout change in all three rows after the spec review corrected them. Text not colour, not focusable, not dismissible. |
| **V — device-capability and repository abstractions** | Untouched. The mail adapter goes behind the existing `MailService` port, whose shape — two account methods and an operator report, no generic `send` — is preserved exactly. R3's SMTP choice means no vendor type reaches the port at all. |
| **VI — offline behaviour per feature** | Nothing added, nothing reclassified. FR-803's read bound must not alter what any repository caches or when it revokes. |
| **VII — every correctness gate runs; none may be weakened** | SC-813 makes this a success criterion. R5 flags the specific risk: the throttle change touches a shared mechanism, and a test needing adjustment is evidence the allowance changed, which FR-805 forbids. |
| **VIII — attendee data is personal data** | No new record. Two changes tighten authorization (FR-806's actor check, FR-801/803's identity-keyed bounds). **The off-host backup is a new copy of data in a new place** — FR-873 puts it under the same access terms as the database, and UAT holds seeded data only, so no real attendee data ever leaves the host. |
| **IX — every feature declares its own completeness** | 12/12 declaration rows filled in the spec. |
| **Deployment environments (v3.0.0, v3.4.0)** | This feature *is* the implementation of that block. One origin, automatic TLS, loopback database, readiness gate, separate registrable domains, subscription pinned by identifier, off-host backup, exercised restore. |
| **Branching and change flow** | One branch, one squash-merged PR into `develop`. |

**Moved after Phase 1, and worth naming**: the design adds an **Azure Storage account** (R4) and a
**just-in-time NSG rule** (R1). Neither is a product concern, so neither appears in the spec's
declarations — but both are infrastructure with a security posture, and both are now documented in
[`contracts/infrastructure.md`](./contracts/infrastructure.md) so a reviewer can see what access
exists and why. No principle requires this; it is recorded because a reviewer cannot audit what is
not written down.

**Complexity Tracking is omitted — there are no violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/010-uat-deployment-and-hardening/
├── plan.md                     # This file
├── spec.md                     # 73 FRs, 19 SCs, 5 open questions
├── research.md                 # Phase 0 — R1..R9
├── data-model.md               # Phase 1 — no entities; the configuration inventory instead
├── quickstart.md               # Phase 1 — validation scenarios
├── contracts/
│   ├── configuration.md        # Every value and secret the environment needs (FR-837)
│   └── infrastructure.md       # What exists in the subscription, and what may reach what
├── checklists/
│   └── requirements.md         # Spec quality checklist + review-gate record
└── tasks.md                    # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

Only the paths this feature touches. **Nothing under `apps/web/src/app/`'s five destinations is
touched**, and no file in `apps/api/src/routes/` gains a route.

```text
apps/api/src/
├── mail/
│   ├── service.ts              # UNCHANGED — the port keeps its shape
│   ├── sink-adapter.ts         # copy changes only (FR-809/FR-810 verification wording)
│   └── smtp-adapter.ts         # NEW — the real adapter (R3)
├── plugins/ports.ts            # mail selection mirrors the existing push selection
├── auth/throttle.ts            # record-before-evaluate (R5); two read actions (R7)
├── db/schema/sign-in-attempts.ts  # ThrottleAction union gains two members — NOT a migration
├── routes/                     # directory + message-page reads gain their throttle call
└── cards/ (or its route module) # FR-806 sharer-verification check

apps/web/src/
├── app/shell/                  # FR-828 marker inside the existing header
└── vite config / env typing    # the build-time flag that keeps it out of production

deploy/vm/
├── envs/uat.env                # SUBSCRIPTION, APP_DOMAIN, VM_SIZE
├── envs/prod.env               # UNCHANGED — stays blank (FR-823)
├── provision-vm.sh             # SKU preflight (FR-822)
├── provision-storage.sh        # the off-host backup target (R4)
├── backup.sh                   # off-host upload, prune conditional on it (FR-870/871)
├── deploy.sh                   # rollback path verified (FR-838)
└── README.md / OPERATIONS-LOG.md  # runbook, restore record, re-seed warning (R9)

.github/workflows/verify.yml
└── deploy-uat                  # JIT NSG admission + unconditional teardown (R1)
```

**Structure Decision**: the existing layout is kept unchanged. This feature adds exactly two source
files — an SMTP adapter and a provisioning script — and otherwise edits configuration, deployment
scripts and three existing modules. The absence of new structure is a consequence of FR-890 and
FR-891 rather than a coincidence.

## Implementation Phases

Ordered by dependency, not by priority. **The mail adapter is early because R2 makes it a
prerequisite of the environment booting**, and the hardening is early because FR-801–FR-812 must
land before a public URL exists.

| Phase | What | Gates on | Story |
|---|---|---|---|
| **1** | Throttle: record-before-evaluate; two read actions; clock provenance | — | US1 |
| **2** | Card-sharer verification; verification-mail copy and contest path | — | US1 |
| **3** | SMTP mail adapter behind the port; selection by configuration | — | US3 |
| **4** | Configuration inventory; UAT env values; SKU preflight | — | US2 |
| **5** | Provision: VM, DNS, TLS, storage account. **First deploy by hand** | 3, 4 | US2 |
| **6** | Seed the environment; provoke the FR-485 guard | 5 | US3, US7 |
| **7** | VAPID pair; config de-duplication; operator address | 5 | US5, US6 |
| **8** | Off-host backup; conditional prune; **restore performed**; rollback verified | 5 | US4 |
| **9** | Continuous delivery: JIT NSG admission, teardown, stale-rule assertion | 5 | US2 |
| **10** | FR-828 marker; absence guards; documentation and operations log | — | all |

**Phase 5 is the first irreversible step** — it creates billable infrastructure and a public DNS
record. Everything before it is ordinary reviewable code; everything after it depends on it
existing. A deliberate by-hand first deploy precedes Phase 9's automation, so that when automation
fails there is a known-good manual path to compare against.

## Risks

Three, in the order they are likely to bite.

1. **The JIT NSG rule leaks** (R1). A cancelled or crashed job leaves permanent SSH exposure, and
   nothing notices. Mitigated by unconditional teardown *and* a start-of-run assertion that no stale
   rule survives — the assertion is the part that matters, because teardown that runs is not
   teardown that worked.
2. **The throttle change alters an existing allowance** (R5). It touches the mechanism four
   features rely on. The existing tests are the net; **a test that needs adjusting is the finding**,
   not an obstacle.
3. **Certificate issuance fails at first deploy** because DNS has not propagated. Cheap to hit,
   cheap to fix, and loud by design — FR-825 forbids falling back to plain HTTP. Worth doing the DNS
   record well before Phase 5 rather than during it.

## Post-Design Constitution Re-Check

**PASS.** No new violation was introduced by Phase 1. The two infrastructure additions are recorded
in `contracts/infrastructure.md` as described above. The `MailService` port emerged from design
unchanged, which was the thing most at risk: a provider integration is the classic moment somebody
adds `send(to, subject, body)` and dissolves a guard that has held since 004.
