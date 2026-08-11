# Tasks: UAT Deployment and Pre-Public Hardening

**Input**: Design documents from `/specs/010-uat-deployment-and-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: **Required, not optional.** FR-812 and FR-812a demand automated assertions for every
behavioural hardening requirement, FR-895 demands absence guards over the source, and SC-813
requires the existing suite to pass unchanged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Exact paths are given. For operational tasks the path is the script or document that carries the
  work, because an operational step with no artifact is a step nobody can review.

---

## Global Constraints

**Every task inherits these. They are copied from the spec and the constitution verbatim, not
summarised.**

- **No migration, no table, no column** (FR-890). If `pnpm db:generate` runs during this feature,
  something has gone wrong. `apps/api/migrations/meta/README.md` must be moved aside first
  regardless — `drizzle-kit generate` JSON-parses every file in `meta/`.
- **No existing assertion may be weakened, disabled or made non-blocking** (SC-813). A test that
  needs changing is evidence a behaviour moved — a finding, not an obstacle.
- **The `MailService` port keeps its shape**: two account methods and an operator report, no generic
  `send`. A provider integration is the classic moment somebody adds `send(to, subject, body)` and
  dissolves a guard that has held since 004.
- **No product route, screen, destination or Home card** (FR-891). The UAT marker is the single
  permitted visible addition and must not grow into any of them.
- **A received message remains the only notification trigger** (FR-892).
- **No production value is filled and no production resource is created** (FR-894).
- **Register entry 19 (avatar moderation) is not resolved by this feature.** v3.4.0 escalated it and
  explicitly declined to close it.

## Interfaces

**Names and signatures that cross task boundaries.** An implementer sees only their own task; this
is how they learn what their neighbours call things.

| Symbol | Introduced by | Consumed by |
|---|---|---|
| `READ_MAX_DELAY_MS: number` (5 000) | T019 in `apps/api/src/auth/throttle.ts` | T019's own threshold entries |
| `ThrottleAction` union gains `'directory_read' \| 'thread_read'` | T018 in `apps/api/src/db/schema/sign-in-attempts.ts` | T019, T020, T021, T015 |
| `THROTTLED_READ_ROUTES: readonly { action: ThrottleAction; method: string; path: string }[]` | T019 in `apps/api/src/auth/throttle.ts` | T015's audit, T020, T021 |
| `class SmtpMailService implements MailService` — constructor `({ smtpUrl, from, log })` | T028 in `apps/api/src/mail/smtp-adapter.ts` | T029 in `apps/api/src/plugins/ports.ts` |
| `config.mail.smtpUrl: string \| undefined` | T002 in `apps/api/src/config.ts` | T029's selection branch |
| `renderVerificationBody(link: string): string` — shared so both adapters say the same thing | T024 in `apps/api/src/mail/` | T031's SMTP adapter |
| `VITE_UAT_MARKER` build-time flag | T075 in the client build config | T076's shell render, T078's absence test |

---

## A note on story independence, stated rather than glossed

The template assumes user stories are independently deliverable. **Four of these seven are not, and
pretending otherwise would produce a task list that cannot be executed in its own order.**

- **US3's mail adapter must exist before US2's first deploy.** `SinkMailService` throws under
  production and the compose file sets `NODE_ENV: production`, so the API cannot boot without it
  (research R2). US3 is split: its *code* runs before US2, its *acceptance* after.
- **US4, US5, US6 and US7 all require the environment US2 creates.**

**US1 is the only genuinely independent story** — every item is a server-side rule with a local
assertion, and it delivers a safer product whether or not anything is deployed. It is also the story
that must land *before* a public URL exists. US1 is both the MVP and the gate.

---

## Phase 1: Setup

- [X] T001 Add an SMTP client dependency to `apps/api/package.json` and update `pnpm-lock.yaml` (research R3 — a general SMTP client, deliberately not a Mailgun SDK, so no vendor type enters the tree)
- [X] T002 [P] Add `smtpUrl: absent('MAIL_SMTP_URL')` to the `mail` block in `apps/api/src/config.ts`, closing the discrepancy where `deploy/vm/.env.example` documents a knob the code never reads (research R2)
- [X] T003 [P] Add `BACKUP_REMOTE_CONTAINER` and `BACKUP_REMOTE_CREDENTIAL` to `deploy/vm/.env.example` only — they are consumed by `backup.sh` and never by the API, so they do **not** belong in `apps/api/src/config.ts`; record that reasoning in the file's comment

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the configuration contract and the provisioning preflight. Getting these wrong is what
register entry 17 recorded.

- [X] T004 Populate `deploy/vm/envs/uat.env`: `SUBSCRIPTION=d428f98f-a3c4-49c3-ae24-06ec3de08477`, `APP_DOMAIN=mynet-dev.programasemilla.com`, `VM_SIZE=Standard_B2als_v2` — updating each blank value's explanatory comment rather than deleting it (FR-820, research R8)
- [X] T005 [P] Assert in `apps/api/tests/unit/deployment-config.test.ts` that `deploy/vm/envs/prod.env` leaves `APP_DOMAIN` blank, so FR-823 survives somebody being helpful
- [X] T006 [P] Update every row of `deploy/vm/.env.example` to state what a blank value costs, matching `contracts/configuration.md` (FR-837)
- [X] T007 Add a required-value preflight to `deploy/vm/_common.sh` that refuses and **names the missing value** (FR-836) — register entry 17's failure was invisible because an unrelated step failed first. Verify by blanking each required value in turn and confirming the refusal names *that* value rather than failing later at a point that names something else (SC-817)
- [X] T008 [P] Add the machine-size preflight to `deploy/vm/provision-vm.sh`, failing early with size, region and remedy when the SKU is unavailable or restricted (FR-822)

**Checkpoint**: configuration is complete and self-describing. No infrastructure exists.

---

## Phase 3: User Story 1 — Close the abuse surface before the door opens (P1) 🎯 MVP

**Goal**: six abuse paths closed, all of which worsen the moment a public URL exists.

**Independent test**: runs entirely locally. No environment required. Quickstart Scenario 1.

### Tests for User Story 1

- [X] T009 [P] [US1] Failing test: a burst of concurrent requests against one throttled action does not collectively exceed its allowance, in `apps/api/tests/integration/throttle-burst.test.ts` (FR-804, SC-810)
- [X] T010 [P] [US1] Failing test: repeated directory-listing requests are progressively delayed and **never denied**, in `apps/api/tests/integration/directory-throttle.test.ts` (FR-801, FR-802, SC-808)
- [X] T011 [P] [US1] Failing test: repeated message-page reads are delayed and never denied, in `apps/api/tests/integration/thread-read-throttle.test.ts` (FR-803)
- [X] T012 [P] [US1] Regression test: **`report_submit` is still throttled and still `mayDeny: true`** after the rework, in `apps/api/tests/unit/throttle-thresholds.test.ts` (FR-863) — T017 changes the mechanism every action shares, and this is the newest guard and the only action whose requests leave the product
- [X] T013 [P] [US1] Failing test: an unverified sharer is refused, and the refusal is **byte-identical** to sharing with a nonexistent attendee, in `apps/api/tests/integration/card-share-verification.test.ts` (FR-806, FR-808, SC-809)
- [X] T014 [P] [US1] Failing test: throttle window and served delay derive from a single clock, in `apps/api/tests/unit/throttle-clock.test.ts` (FR-811)
- [X] T015 [P] [US1] Failing test: every entry in `THROTTLED_READ_ROUTES` is reached by a route that calls its action, and every client-driven read route appears in the list, in `apps/api/tests/unit/throttle-route-audit.test.ts` (FR-803a)
- [X] T016 [P] [US1] Failing test: verification mail states what following the link does and offers a contest path, and discloses no display name or other address, in `apps/api/tests/unit/verification-copy.test.ts` (FR-809, FR-810, FR-812a)

### Implementation for User Story 1

- [X] T017 [US1] Change `apps/api/src/auth/throttle.ts` to record the attempt row **before** evaluating and settle its outcome afterwards, so in-flight requests are counted (research R5, FR-804, FR-805)
- [X] T018 [US1] Extend the `ThrottleAction` union in `apps/api/src/db/schema/sign-in-attempts.ts` with `directory_read` and `thread_read` — **a text column carrying a TS union, so no migration** (data-model.md)
- [X] T019 [US1] In `apps/api/src/auth/throttle.ts` add `READ_MAX_DELAY_MS = 5_000`, the `THROTTLED_READ_ROUTES` list, and both threshold entries with these values and a comment carrying the reasoning:
  - `directory_read` — identifier **120**, source **1 200**, `ceilingMs: READ_MAX_DELAY_MS`, `mayDeny: false`. A person paging a 1 000-attendee conference at 100 a page spends ~10 requests, plus a search or filter change per request; 120 an hour is a heavy human session and a tenth of what a harvester wants.
  - `thread_read` — identifier **1 500**, source **6 000**, `ceilingMs: READ_MAX_DELAY_MS`, `mayDeny: false`. The visible-only poll runs every three seconds, so an hour with a thread open is ~1 200 requests; the allowance must exceed legitimate use or every attendee is delayed.
  - **Both use `READ_MAX_DELAY_MS` rather than `IDENTIFIER_MAX_DELAY_MS`**, and that is the load-bearing choice: a six-minute delay on a read is a freeze, not a slowdown. Five seconds degrades a poll to a slower poll, which is the intended shape of a bound that may never deny.
- [X] T020 [P] [US1] Call the `directory_read` throttle from the directory listing route in `apps/api/src/routes/`, and add the route to `THROTTLED_READ_ROUTES`
- [X] T021 [P] [US1] Call the `thread_read` throttle from the message-page read route in `apps/api/src/routes/`, and add the route to `THROTTLED_READ_ROUTES`
- [X] T022 [US1] Make throttle timestamps single-clock in `apps/api/src/auth/throttle.ts` (FR-811)
- [X] T023 [P] [US1] Add the sharer-verification condition to the card-share route in `apps/api/src/routes/`, with a comment stating this governs **the actor at write time** and must never migrate into card resolution (FR-806, FR-807). **No backfill of existing cards** — none exist, and a card is irrevocable by requirement (FR-806a)
- [X] T024 [P] [US1] Extract `renderVerificationBody(link)` into `apps/api/src/mail/` and add the contest-path wording, calling it from `sink-adapter.ts` (FR-809, FR-810)
- [X] T025 [US1] Run the full suite and confirm **no existing assertion was adjusted** (SC-813)

**Checkpoint**: US1 is complete and shippable alone. Quickstart Scenario 1 passes.

---

## Phase 4: User Story 3a — Mail, the code half (P1, blocks the first deploy)

**Goal**: a real mail adapter, because without one the deployed API cannot boot (research R2).

**Independent test**: locally, with and without an SMTP URL. Quickstart Scenario 2.

- [X] T026 [P] [US3] Failing test: adapter selection is by configuration alone with no environment branch — URL present selects SMTP, absent selects the sink — in `apps/api/tests/unit/mail-selection.test.ts` (FR-841)
- [X] T027 [P] [US3] Failing test: `SinkMailService` refuses to construct under production, documenting the constraint that sequences this feature, in `apps/api/tests/unit/mail-sink-production.test.ts` (research R2)
- [X] T028 [US3] Implement `SmtpMailService` in `apps/api/src/mail/smtp-adapter.ts` against the existing port, delivering verification (FR-844), password-reset (FR-844) and operator abuse mail (FR-845) — **the port's shape does not change** (FR-840, FR-843)
- [X] T029 [US3] Select the adapter in `apps/api/src/plugins/ports.ts` on `config.mail.smtpUrl`, mirroring the existing push selection exactly (FR-841)
- [X] T030 [P] [US3] Extend the lint boundary that confines storage and push vendors so the SMTP client is confined to `apps/api/src/mail/` (FR-842)
- [X] T031 [P] [US3] Call `renderVerificationBody` from the SMTP adapter so both adapters say the same thing (FR-809, FR-812a)
- [X] T032 [P] [US3] Assert operator mail carries identifiers and a timestamp only — never message or question text, never the reporter's reason — in `apps/api/tests/unit/operator-mail-content.test.ts` (FR-848)

**Checkpoint**: the API can boot under production configuration. Nothing is deployed.

---

## Phase 5: User Story 2a — A reachable environment over a trusted certificate (P1)

**Independent test**: open the address on a machine that has never seen the project. Quickstart
Scenario 4.

⚠️ **T034 is the first irreversible step.** It creates billable infrastructure and a public DNS
record.

- [ ] T033 [US2] Create the DNS A record for `mynet-dev.programasemilla.com` and confirm it resolves **before** provisioning — certificate issuance is what fails otherwise, and FR-825 forbids falling back to plain HTTP
- [ ] T034 [US2] Run `deploy/vm/provision-vm.sh` for `uat`, confirming the SKU preflight passes and every call is pinned to the subscription by identifier (FR-820, FR-821)
- [ ] T035 [US2] Generate and install the VM `.env` from `deploy/vm/.env.example`, populating every required value from `contracts/configuration.md` including `ACME_EMAIL`, `POSTGRES_PASSWORD`, `AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY`
- [ ] T036 [US2] Run `deploy/vm/deploy.sh uat --migrate` **by hand** for the first deploy, deliberately before automation exists, so there is a known-good path to compare against when automation fails
- [ ] T037 [US2] Verify TLS, the HTTP redirect, same-origin API requests, and that the database is unreachable from off-host (FR-824, FR-825, FR-826, SC-801)
- [ ] T038 [US2] Verify the deployment gates on readiness by stopping the database container and confirming the gate refuses while `/health` alone would have passed (FR-827)
- [ ] T039 [P] [US2] Assert in `apps/api/tests/unit/deployment-config.test.ts` that **no credential, allowlist or other access restriction sits in front of UAT** — no basic-auth directive in `deploy/vm/Caddyfile`, no source restriction on ports 80/443 (FR-829). Adding basic auth "temporarily" is exactly the helpful change that would breach this silently
- [ ] T040 [P] [US2] Record the provisioning run in `deploy/vm/README.md` with every prerequisite an operator who did not build it would need (FR-830, SC-814)

**Checkpoint**: the product is reachable at a real address.

---

## Phase 6: User Story 7 — The tooling refuses to be pointed at the wrong database (P3)

**Independent test**: Quickstart Scenario 9, steps 5–6.

- [ ] T041 [US7] Point `deploy/vm/envs/uat.env`'s resolved database host at production's value, run each deployment script, confirm every one refuses naming the reason, then revert (FR-881, SC-811)
- [ ] T042 [P] [US7] Verify the seed's production guard still refuses — it keys on the resolved target rather than `NODE_ENV`, which is stronger than the inbox entry that raised it proposed, and T044 is about to use the seeding path against a deployed host (FR-882)
- [ ] T043 [P] [US7] Record both provoked refusals in `deploy/vm/OPERATIONS-LOG.md` — FR-881 asks for the observation, not the belief

---

## Phase 7: User Story 3b — Mail, the acceptance half (P1)

**Independent test**: Quickstart Scenario 5, end to end, under five minutes.

- [ ] T044 [US3] Seed the deployed environment so a conference with a join code, its sessions and its meeting slots exist — `deploy.sh --migrate` migrates and does not seed (FR-884)
- [ ] T045 [US3] Add the re-seed warning to `deploy/vm/README.md`, stating plainly that re-seeding UAT **destroys every account created against it**, including a reviewer's (FR-885, research R9)
- [ ] T046 [US3] Walk sign-up → verification mail → verify → join by code → visible in Discover from a second profile, against the deployed address (FR-844, SC-802)
- [ ] T047 [US3] Walk the password-reset journey against the deployed address (FR-844, SC-803)
- [ ] T048 [P] [US3] Confirm a broken SMTP URL leaves account creation succeeding and logs the failure honestly (FR-846, FR-847)
- [ ] T049 [P] [US3] Inspect the deployed data and confirm it holds only seeded content and accounts created against UAT (FR-880, SC-812); record in `deploy/vm/README.md` that seeded credentials are **committed and world-readable by intent** — the repository is public, UAT holds no real attendee data, and they must never be reused anywhere else (FR-883)

**Checkpoint**: the environment is usable by a person.

---

## Phase 8: User Story 4 — A backup that outlives its host, and a restore that has been performed (P1)

**Independent test**: destroy the database container, restore from off-host. Quickstart Scenario 8.

- [ ] T050 [US4] Extend `deploy/vm/provision-storage.sh` (or add a sibling) to create the storage account and private container in `rg-mynet-backups`, with soft-delete enabled and a **write-only** credential for the backup job (research R4, FR-873)
- [ ] T051 [US4] Add the off-host upload to `deploy/vm/backup.sh`, after the existing verification step and before pruning (FR-870)
- [ ] T052 [US4] Make local pruning conditional on a **confirmed** off-host copy, and report a failed copy rather than absorbing it (FR-871, FR-872)
- [ ] T053 [P] [US4] Confirm the backup schedule and written retention period in `deploy/vm/provision-schedule.sh` and `deploy/vm/README.md` are **otherwise unchanged** by T051 and T052 (FR-877)
- [ ] T054 [US4] Verify the failure path: make the target unreachable, run a backup, confirm pruning does **not** proceed (SC-806)
- [ ] T055 [US4] **Destroy the database container on the deployed host and restore it** from an off-host artifact, confirming the seeded conference and its attendees return (FR-874, SC-807)
- [ ] T056 [US4] Record the performed restore in `deploy/vm/OPERATIONS-LOG.md`: what, from which artifact, when, by whom (FR-875)
- [ ] T057 [US4] Verify the rollback path on the real host and confirm `deploy/vm/README.md` states what happens when the schema has moved ahead of the application (FR-838, FR-876, SC-819)

**Checkpoint**: the governance obligation is discharged early, against a real disk.

---

## Phase 9: User Story 5 — Notifications that deliver from the real environment (P2)

**Independent test**: Quickstart Scenario 7, steps 1–2.

- [ ] T058 [US5] Generate one VAPID pair for UAT and store the private half as a repository environment secret, injected into the VM `.env` by `deploy/vm/deploy.sh` (FR-850, FR-851)
- [ ] T059 [P] [US5] Give the public key a single source of truth rather than one value on the API and another in the client build with nothing checking they agree (FR-853) — the `vapid-config-duplication` inbox entry, pulled in because its own wording says to settle it when the real adapter lands
- [ ] T060 [P] [US5] Remove `PUSH_VAPID_SUBJECT` from `apps/api/src/config.ts` and `deploy/vm/.env.example` — it is read by nothing (FR-854)
- [ ] T061 [P] [US5] Verify that with **no** key pair configured the sink is used, the attendee is never asked for permission, and Messages, unread state and the poll are unaffected — re-run `push-denied-fallback.test.tsx` and confirm it passes unchanged (FR-855)
- [ ] T062 [US5] Document in `deploy/vm/README.md` that the pair is **rotated only on compromise**, because rotation silently stops delivery for every attendee until their browser re-registers and nothing tells them (FR-852)
- [ ] T063 [US5] Verify delivery against the deployed address from two browser profiles, including that activating the notification opens **that** conversation (SC-804)

---

## Phase 10: User Story 6 — A report that reaches a person (P2)

**Independent test**: Quickstart Scenario 7, steps 2–4.

- [ ] T064 [US6] Set `MAIL_OPERATOR_ADDRESS=apps@programasemilla.com` in the VM `.env` and confirm the boot-time "not provisioned" warning no longer fires (FR-860)
- [ ] T065 [US6] Submit a report against the deployed address and confirm the block applies in the same action, the report is recorded, and mail arrives (FR-845, FR-862, SC-805)
- [ ] T066 [US6] Inspect the delivered mail and confirm it carries identifiers and a timestamp only (FR-848)
- [ ] T067 [P] [US6] Break the SMTP URL, report again, and confirm the block still applies and the failed dispatch is **logged rather than dropped** (FR-847)

---

## Phase 11: User Story 2b — Continuous delivery, and the door closing behind it (P1)

**Goal**: a change reaches UAT on merge, as standing decision 20 requires — without leaving SSH open.

**Independent test**: Quickstart Scenario 9, steps 1–4.

⚠️ **T071 is the highest-risk task in the feature.** A leaked NSG rule is permanent public SSH
exposure that nothing else reports.

- [ ] T068 [US2] Create the `uat` environment secrets: `AZURE_CREDENTIALS` (scoped to the resource group plus network-write on the one NSG), `DEPLOY_SSH_KEY`, `MAIL_SMTP_URL` and `PUSH_VAPID_PRIVATE_KEY` (FR-832)
- [ ] T069 [US2] Verify the host fingerprint out-of-band and store it as `SSH_KNOWN_HOSTS`, rather than accepting it on first connection (FR-834) — `deploy/vm/deploy.sh` prints the commands
- [ ] T070 [US2] Add just-in-time NSG admission to the `deploy-uat` job in `.github/workflows/verify.yml`: discover the runner's egress address and add a port-22 rule scoped to that **single** address (FR-833, research R1)
- [ ] T071 [US2] Add teardown that runs on **every** exit path including cancellation, and a start-of-run assertion that no rule from a previous run survives — **teardown that runs is not teardown that worked**, and the assertion is the part that matters
- [ ] T072 [P] [US2] Ensure no secret value reaches deployment output or logs (FR-835)
- [ ] T073 [US2] Merge a trivial change to `develop` and confirm it reaches the address with nobody running a script; inspect the NSG during and after (FR-831, SC-816)
- [ ] T074 [US2] Cancel a deploy mid-run, start another, and confirm the second **fails loudly** on the stale rule rather than proceeding

---

## Phase 12: Polish & Cross-Cutting Concerns

- [ ] T075 Add the `VITE_UAT_MARKER` build-time flag to the client build configuration so the production bundle **does not contain** the marker rather than containing it behind a check (FR-828, research R6)
- [ ] T076 Render the marker as static text inside the existing shell header in `apps/web/src/app/shell/` — not a new full-width band, because mobile is where vertical space is scarcest (FR-828)
- [ ] T077 [P] Component test: the marker is not focusable, not dismissible, conveys its meaning in text rather than colour, and is exposed to assistive technology, in `apps/web/tests/unit/uat-marker.test.tsx`
- [ ] T078 [P] Test: the marker is absent from a production build, not merely hidden (FR-828, SC-818)
- [ ] T079 [P] Verify at mobile width that the marker pushes no primary action below the fold and introduces no horizontal scrolling — if it cannot, adjust the header and **declare that as a layout change** rather than shipping a marker that costs the first viewport (spec Open Question 5)
- [ ] T080 [P] Add the absence guards required by FR-895 in `apps/api/tests/unit/deployment-absences.test.ts`, covering FR-890 (no migration), FR-891 (no route, screen, destination or Home card), FR-892 (no second notification trigger), FR-893 (no administrative interface, privileged role or in-product report reader), FR-894 (no production value filled), plus FR-861 (report unreadable from inside the product) and FR-806a (no card backfill), following 007's and 009's pattern **including stripping comments before matching** — every phrase also appears in the prose explaining it
- [ ] T081 [P] Confirm `apps/api/tests/unit/deletion-coverage.test.ts` and `export-coverage.test.ts` pass unchanged — if either fails, a schema change was introduced and FR-890 is broken (data-model.md)
- [ ] T082 Verify SC-815 against the deployed environment: **nothing attendee-facing behaves differently** except that some requests are delayed, an unverified account cannot share a card, and UAT carries its marker. Walk one full core journey — inspect a session, discover an attendee, share a card, message, schedule — and confirm every other surface is as before
- [ ] T083 Update `deploy/vm/README.md` into a runbook an operator who did not build this can follow, and reconcile `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`, which still describes the unsplit 010 and has no 011
- [ ] T084 Walk `specs/010-uat-deployment-and-hardening/quickstart.md` end to end — **all nine scenarios**. 007, 008 and 009 each shipped with this outstanding, and the first defect a person found by looking had passed 135 e2e tests and five review agents

---

## Dependencies & Execution Order

### Phase dependencies

```
Setup (1) ─▶ Foundational (2) ─┬─▶ US1 hardening (3)         [independent, local]
                               └─▶ US3a mail code (4)
                                        │
                                        ▼
                                   US2a environment (5)  ⚠️ first irreversible step
                                        │
        ┌───────────────┬───────────────┼───────────────┬──────────────┐
        ▼               ▼               ▼               ▼              ▼
   US7 guard (6)   US3b accept (7)  US4 backup (8)  US5 push (9)  US6 report (10)
        └───────────────┴───────────────┼───────────────┴──────────────┘
                                        ▼
                            US2b continuous delivery (11)
                                        ▼
                                   Polish (12)
```

### User story dependencies

- **US1** — independent. Needs nothing, blocks nothing, deliverable alone. The MVP.
- **US3a** — independent code; **blocks US2a**, because the API cannot boot without it (R2).
- **US2a** — needs US3a. Blocks US4, US5, US6, US7 and US2b.
- **US7, US3b, US4, US5, US6** — each needs US2a; **mutually independent**, parallelisable.
- **US2b** — needs US2a, placed after the others deliberately so a by-hand deploy is proven before
  automation is trusted.

### Within Phase 3

`throttle.ts` is edited by T017, T019 and T022 — those are **sequential**. T018 (schema union) comes
before T019 (thresholds that reference it). T020 and T021 touch different routes and are parallel
with each other and with T023 and T024.

### Parallel opportunities

- **Phase 2**: T005, T006, T008 — three different files.
- **Phase 3 tests**: T009–T016 — eight independent files, all written before implementation.
- **Phases 6–10**: five stories gated only on the environment. Natural split is one operator on
  backups (US4, the longest) while another walks US3b, US5 and US6.
- **Phase 12**: T077–T081 are five independent files.

### Parallel example: Phase 3 tests

```
T009 throttle-burst.test.ts        T010 directory-throttle.test.ts
T011 thread-read-throttle.test.ts  T012 throttle-thresholds.test.ts
T013 card-share-verification.test.ts  T014 throttle-clock.test.ts
T015 throttle-route-audit.test.ts  T016 verification-copy.test.ts
```

---

## Implementation Strategy

### MVP: User Story 1 alone

Phases 1–3. Six abuse paths closed, reviewable as ordinary code with no infrastructure risk. **If
this feature had to stop at one point, this is it** — everything after is a deployment, and a
deployment that never happens still leaves a safer product behind.

### Incremental delivery

1. **Phases 1–3** → hardened product. Reviewable, revertible, no infrastructure.
2. **Phase 4** → the API can boot under production configuration.
3. **Phase 5** → a URL exists. First irreversible step.
4. **Phases 6–10** → the environment becomes usable, backed up and observable.
5. **Phase 11** → merges deploy themselves.
6. **Phase 12** → the marker, the guards, the runbook, and the walkthrough.

### The PR boundary worth considering

**Phases 1–4 are code; Phases 5–12 are largely operations.** A reviewer reading the first is doing
code review; a reviewer reading the second is checking that things were done and recorded. Those are
different activities. 009 records the lesson from splitting on a similar seam — the split survived
as a reading order rather than as two merges, because holding the first half open would have shipped
something incomplete. Worth taking deliberately at `speckit-spex-collab-phase-split` rather than by
default.
