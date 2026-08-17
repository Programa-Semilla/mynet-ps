# Tasks: 012 — Launch Readiness

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)
**Branch**: `spec/012-launch-readiness` | **Constitution**: v5.4.0
**Status**: **READY** — the gate re-ran 2026-08-16 on the rewrite (three review dimensions, adversarially verified): 0 Critical, 9 Important and 3 Minor confirmed findings, all fixed in place; the first run's 5-Critical verdict is resolved

**Read this before picking up a task.**

Roughly half this feature is **repair that precedes the walk**. Phase 0 was meant to size five
unknowns; it found six defects, two of which would each justify their own feature.

**Three things the first draft of this file got wrong, fixed below:** nothing deployed the repairs to
the environment the walk runs against; the walk's only output — the record — had no task, no format
and no home; and "Phases 5–8 are independent" was false, because the seam walks consume each other's
outputs.

**No migration. No schema. No new device capability.**

---

## Phase 1 — Setup: unblock the environment

*T007 destroys UAT data while the host's backups have never worked. T001 is insurance, not ceremony.*

- [X] T001 Take a verified `pg_dump` of UAT before anything destructive, or verify the existing `deploy/vm/backups/pre-014-manual-20260816T012211Z.dump` (a path on the **UAT host**, not in this repository) restores into a throwaway container; record the path in `deploy/vm/OPERATIONS-LOG.md`
- [X] T002 Extract the operator insert into an exported `ensureOperatorIdentities(db)` in `apps/api/src/db/seed/operators.ts`, using `.onConflictDoNothing({ target: operators.email })` and keeping the FR-918 cross-table address check
- [X] T003 Narrow the end-of-run self-check in `apps/api/src/db/seed/operators.ts` from a **table-wide** `count(*) WHERE password_hash IS NOT NULL` to the rows this call inserted — un-narrowed it throws on every database this command exists to serve (research R2)
- [X] T004 Add `apps/api/src/db/seed/operator-identities.ts` with a CLI wrapper; register `admin:seed-operators` in `apps/api/package.json` and the root `package.json`; do **not** call `assertSeedableTarget` — an additive command has nothing to guard (FR-1102)
- [X] T005 Add an integration test in `apps/api/tests/integration/operator-identities.test.ts` issuing a credential against a database **holding attendee rows** and asserting the attendee row count is unchanged. **Not a source-shape test** — SC-1210's subject is behavioural, and a source grep is the assertion class this project keeps finding blind (SC-1210)
- [ ] T006 [P] **Machine half DONE 2026-08-16** (see OPERATIONS-LOG): both emails sent from the live host to the owner's real inbox, Mailgun accepted both, no delivery warning. **Remaining: the owner opens the inbox and confirms both links resolve.** Send one verification email and one password-reset email from UAT to a real inbox; confirm both links resolve; record in `OPERATIONS-LOG.md`. **Mail has authenticated but never delivered a message from that host** — and verification gates discoverability, so if this fails Discover is empty for the entire walk
- [X] T007 *(executed non-destructively — the environment had moved: genuine accounts already gone, operator already credentialed; the re-seed's authorization no longer covered what it would destroy. FR-1100's substance verified true, additive command proven on the live host over the SSH tunnel, second operator bootstrapped, sign-in 204 at the admin host. See OPERATIONS-LOG 2026-08-16.)* Get T002–T004's command onto the host **first** — the deployed image predates it and UAT's PostgreSQL is loopback-only: either deploy this branch's build via `deploy/vm/deploy.sh`, or run `admin:seed-operators` from a local checkout over the runbook's SSH tunnel; record which in `OPERATIONS-LOG.md`. Then re-seed UAT (7 attendee rows, of which 4 are genuine and disposable), run `admin:seed-operators`, issue a credential, confirm sign-in at `admin.mynet-dev.programasemilla.com` (FR-1100, FR-1101, SC-1209)
- [X] T008 *(recorded — no re-seed was performed, and the entry says why; FR-1103's moment-not-guarantee sentence included)* Record the re-seed in `OPERATIONS-LOG.md` — what was destroyed, the date, and that decision 30 compliance is restored at a moment rather than guaranteed over time (FR-1103)

### Correcting the record (FR-1102a, FR-1102b)

*The claim is in four files. Repairing one and leaving three is the 016/FR-1052 failure this
requirement invokes.*

- [X] T009 [P] Rewrite the false claim in `apps/api/src/admin/bootstrap.ts`; correct its **FR-902 → FR-901** mis-citation; point the `no-such-operator` message at `admin:seed-operators`
- [X] T010 Rewrite the same false claim in `apps/api/src/db/seed/operators.ts` *(same file as T002/T003 — not parallel)*
- [X] T011 [P] Rewrite the same false claim in `deploy/vm/README.md`
- [X] T012 [P] Rewrite the same false claim in `specs/013-administrative-foundation/quickstart.md`
- [X] T013 [P] Correct the FR-902 citation in `apps/api/tests/integration/admin-bootstrap.test.ts` (lines ~112, ~118, ~129). **`apps/api/tests/unit/admin-forbidden-surfaces.test.ts`'s five FR-902 references are CORRECT and must not be touched**
- [X] T014 [P] Document the two undocumented re-seed consequences in `deploy/vm/README.md`: a re-seed **does** reset a chosen operator credential (FR-993 holds only for the bootstrap command), and it **destroys the administrative audit trail** and every organizer assignment (FR-1102b)

---

## Phase 2 — Foundational repairs

**Gates Phase 5.** Runs **concurrently with Phase 3** — the script derivation needs only the
repository.

### Safari (FR-1145) — Messages does not load in WebKit

- [X] T015 Diagnose why `GET /conversations` is issued and never answered in WebKit. Prime suspects: `apps/web/src/sw.ts`'s fetch interception, and the cross-origin credentialed read. Every other call in the same page load returns 200; `curl` answers in 6ms
- [X] T016 Fix it in `apps/web/src`. **Safari users cannot open Messages today**
- [X] T017 Give `apps/web/src/app/messages/Messages.tsx` a failure path — it has **no first-load effect**, so a stalled request leaves the destination at `Loading…` with no way out
- [X] T018 Add a **repeat-safe** spec `e2e/messages-terminal.spec.ts` asserting Messages reaches a terminal state — content **or** error. Repeat-safe means read-only against the seed, no fixture writes — which is what makes it admissible to the restricted engine projects; `messages-journey.spec.ts` is one of R5's four suites that break on a second pass and **cannot** carry this assertion. T019 includes it in all three engines: FR-1145 broke in WebKit, so its assertion must run there

### Three browser engines (FR-1144)

- [X] T019 Add `firefox` and `webkit` projects to `playwright.config.ts`, restricted to `responsive.spec.ts`, `first-viewport.spec.ts` and T018's `messages-terminal.spec.ts`. **Guard the `capturingScreenshots` ternary** — a project-level `testMatch` overrides the top-level one, silently defeating the `CAPTURE_SCREENSHOTS` switch
- [X] T020 In `playwright.config.ts` use `devices['Desktop Firefox']` and `devices['Desktop Safari']` — never a mobile descriptor, since `isMobile` is unsupported in Firefox and throws — and pin `deviceScaleFactor: 1` on WebKit against the sweep's ±1px assertions
- [X] T021 Change the **`test-e2e`** job's browser install line in `.github/workflows/verify.yml` (~line 656) to `chromium webkit firefox`; `test-accessibility`'s line (~553) stays chromium-only — its suites run one engine. **Add no job** — `verify` and `verify-push` hard-assert a count of 10

### Gate holes (FR-1146, FR-1147)

- [X] T022 Fix the `navigator.serviceWorker?.controller !== null` waits in `e2e/offline.spec.ts` and `e2e/agenda-offline.spec.ts` — `undefined !== null` is **true**, so the wait resolves instantly. Wrong on Chromium too
- [X] T023 Fix the IndexedDB helpers in `e2e/agenda-offline.spec.ts` that resolve silently on error *(same file as T022 — not parallel)*
- [X] T024 Add `e2e/admin-accessibility.spec.ts` to the **`test-accessibility`** job in `.github/workflows/verify.yml`, matching the existing `test:a11y` script. It must not move into `test-e2e` — that would take an accessibility gate out of the accessibility check
- [X] T025 Change `test-e2e`'s spec derivation in `.github/workflows/verify.yml` to recurse (`find e2e -name '*.spec.ts'`) with the accessibility exclusion re-anchored to **path** — excluding the whole `e2e/accessibility/` directory as well as the two root a11y specs. Route `e2e/accessibility/identity.spec.ts` into **`test-accessibility`** beside T024's addition, adding it to `test:a11y` in the root `package.json` — it is a pure axe suite (004's T128), and landing it in `test-e2e` would repeat exactly the mistake T024 names. Keep the emptiness guard
- [X] T026 Run the nine recovered tests and fix what they surface — they have never executed in CI

### Backups (FR-1148) — a governance breach, not a gap

- [X] T027 [P] Quote `MAIL_FROM` in `deploy/vm/backup.sh` — an RFC 5322 address has its `<`/`>` parsed as shell redirection, which is why `status` dies
- [X] T028 Fix `backups/` ownership on the UAT host (root-owned, script runs as `azureuser`) and set `BACKUP_DIR`
- [X] T029 Ship T027's repaired `backup.sh` to the host first — T027 edits the repository copy and nothing else carries it there — then install the backup cron on UAT and confirm a scheduled backup actually fires
- [X] T030 **Exercise a restore on the real host, into a scratch database or throwaway container — never the live database**, which would undo T007's re-seed. Record it in `OPERATIONS-LOG.md`. This is 011's undischarged T081, paid off here — walk scenarios 006/3d and 011/8 fail at step 1 without it

### The offline disclosure (FR-1140, FR-1140a, FR-1149)

*T031 comes FIRST. FR-1131 forbids fixing-then-recording.*

- [X] T031 **Record the decision before making the change**: closing SC-1207 narrows FR-215's field behaviour — an offline PWA cold start no longer resolves an identity. Weigh v3.0.0's and v5.0.0's precedent explicitly and state why this is MINOR rather than a retraction needing an amendment. Owner-signed, in `specs/012-launch-readiness/decisions.md` (FR-1131, FR-1140)
- [X] T032 Move `getCurrent` out of the cached `reads` map and into `passThrough` in `apps/web/src/app/services.ts`. **Declare it — never omit it**: an omitted method falls into the write branch, which is 008's `slots` defect
- [X] T033 Call `identity.forget()` on the signed-out transition in `apps/web/src/app/services.ts`, so an expired session cannot leave a second person's identity under the first person's prefix (FR-1149)
- [X] T034 Purge the `anonymous` prefix at sign-in in `apps/web/src/app/services.ts` — **research R3 rejected this as a fix for SC-1207** (sign-in needs a connection). It is included only for FR-1149's cross-prefix write, and the code comment must say so *(same file as T032/T033 — not parallel)*
- [X] T035 Restructure `e2e/agenda-offline.spec.ts:216-254` — it reloads across a document boundary and asserts the opposite of the new behaviour, so it **will fail**
- [X] T036 Verify the FIX-2 expiry test in `e2e/agenda-offline.spec.ts` still proves what it was written to prove — its `role=alert` now arrives from the auth-offline path, so it would keep passing for a different reason
- [X] T037 Correct the FR-1140a comments. **The one named in the spec is not the worst** — three load-bearing ones carry the false premise in other words, with no "anonymous" and no requirement number. One at `apps/web/src/app/services.ts:146-149` **argues for the defect**
- [X] T038 Add the SC-1207 e2e in `e2e/agenda-offline.spec.ts` with its seven traps handled — chiefly: await the service worker, or the offline reload serves no application and the test passes vacuously; and `clearCookies()`, the only thing distinguishing it from the test at `:216`
- [X] T039 [P] Add the source tripwire in `apps/web/tests/unit/` asserting `getCurrent` appears in no `reads` map, following the `messages-absences` idiom

### `listRegistered` completeness (FR-1141)

- [X] T040 **Name the accidental guard first** — `packages/data/src/contract.ts:69`'s `Satisfies<EventsResponse[number], Event>` already fails the build on a pagination envelope, and nothing records that it does. A refactor would remove the erasure's only protection with every test green
- [X] T041 [P] Add the `_EventsTakesNoQuery` compile-time binding in `packages/data/src/contract.ts`
- [X] T042 [P] Add `apps/api/tests/unit/registered-events-complete.test.ts` asserting `/events` declares no `querystring` and no pagination-shaped property. **The failure message is the deliverable** — it must name `erasingWithdrawnConferences` and say the client changes first
- [X] T043 [P] Add an integration case proving a conference that has **ended** is still listed, using the existing `moveEvent` helper — the break mode no regex can catch
- [X] T044 [P] Add comments at `apps/api/src/db/queries/events.ts` and `packages/data/src/interfaces/events.ts`, each **pointing at the test that enforces it** rather than standing alone

---

## Phase 3 — Derive the consolidated script (FR-1110 to FR-1114)

**Runs concurrently with Phase 2.** Depends only on the repository. Output: `quickstart.md`.

- [X] T045 Enumerate every by-hand scenario across all 13 `specs/*/quickstart.md`, cross-checked against each feature's `tasks.md` for outstanding status — FR-1111's "enumerating the task files" and SC-1202's "enumerating the specs" are the two halves of this one enumeration, not two sources. **Do not key on heading shape** — that is what hid 006. Phase 0 measured 122 scenarios, 74 outstanding walk units, 90 unaccounted
- [X] T046 Give 002's 8 and 004's 10 scenarios an explicit disposition — they have **no walk task at all**, so "not marked complete" cannot be evaluated against them — and give 011 scenario 9 one too: steps 5–7 are walkable, steps 1–4 depend on T057's outcome and are recorded as walked or blocked-by-decision accordingly (SC-1202)
- [X] T047 Retire the ~9 machine-covered scenarios, naming each and where its coverage now lives (014/5, 016/9, 010/1–4, 006 Parts 1 & 4, 002/8 as spent)
- [X] T048 **Rewrite the three scenarios carrying false expectations** — 001/5 step 2, 008/1 step 3, 010/5 step 2 — or the walker reports defects that are not defects
- [X] T049 Pick **one** width triple, record why, **and update `spec.md` US4 scenario 1 (which names 390/768/1280) to match** — SC-1204 names no widths and needs no edit. Thirteen places assert six inconsistent triples; the sweep uses a seventh; the spec named an eighth
- [X] T050 Write the seam steps from Phase 0's 16 candidates (SC-1211). **S2 is highest value**: delete one attendee who is simultaneously an organizer, a contact, a conversation participant, a question author, a place-holder and a report subject
- [X] T051 Fold the six repeated setup prerequisites into one place — chiefly "two browser profiles, not two tabs", where 007's version alone carries the push/incognito trap
- [X] T052 Add a step telling the walker how to distinguish a **throttle** from a defect (seam S15)
- [X] T053 Mark every Q&A step as describing a surface v5.0.0 retracted and 017 will rebuild — still walkable, still a defect if broken
- [X] T054 **Write `specs/012-launch-readiness/quickstart.md`** — the consolidated script itself, organised by journey, covering both products, stating per step what a pass looks like and requiring an **observation, not a verdict** (FR-1110, FR-1113, FR-1114, FR-1125)

### The walk record — the feature's evidentiary output

- [X] T055 Create `specs/012-launch-readiness/walk-record.md` with a per-step row schema — step id, features joined, observation, pass/fail, capture path — and `specs/012-launch-readiness/captures/`. **Four requirements and two success criteria constrain an artifact nothing produced** (FR-1125, FR-1126, SC-1203, SC-1208)
- [X] T056 Create `specs/012-launch-readiness/defect-register.md` — the count SC-1208 requires, one row per defect with the step that found it

---

## Phase 4 — Deploy, and plant

**Gates Phase 5.** The walk must run against the repaired product, not the pre-012 build.

- [X] T057 *(RESOLVED as the hand-deploy branch — decision D-012-4, owner 2026-08-16; FR-1120a amended, deploy-uat message updated, 011/9 steps 1–4 retired by decision.)* *(2026-08-16: the service-principal branch was ATTEMPTED and is blocked on tenant privilege — `az ad sp create-for-rbac` returns "Insufficient privileges" for this session's account. Everything else is in place: the `deploy-uat` job, its `environment: uat` scoping, and the JSON shape it parses. The owner (or an AAD admin) completes it with two commands: `az ad sp create-for-rbac --name mynet-uat-deploy-ci --role Contributor --scopes /subscriptions/d428f98f-a3c4-49c3-ae24-06ec3de08477/resourceGroups/rg-mynet-uat --json-auth` then `gh secret set AZURE_CREDENTIALS --env uat`. Choosing the hand-deploy branch instead amends FR-1120a and is equally the owner's act.)* Resolve how UAT receives a build: create the `AZURE_CREDENTIALS` service principal, **or** record an explicit decision that UAT is deployed by hand from `develop` via `deploy/vm/deploy.sh` and amend FR-1120a to say so. **CI has never deployed anything** — `deploy-uat` short-circuits on the unset secret
- [X] T058 *(done 2026-08-17: deploy.sh uat --migrate, commit 659fa94 — OPERATIONS-LOG entry, walk-record header filled.)* Deploy `develop` to UAT and record the commit SHA in `OPERATIONS-LOG.md` (FR-1120a)
- [X] T059 *(planter: the implementation session — not the walker; recorded in walk-record header.)* **Name who plants the seeded defects, and confirm they are not the walker.** If no second person exists, execute T060 instead and mark FR-1127 **unmet** in the Feature Declarations rather than letting it read as satisfied
- [X] T060 *(not needed — a non-walker planter exists; the fallback stays unused.)* *(fallback, only if T059 finds no second person)* Nominate who performs the 10% spot-check of passed steps before Phase 8, and record that FR-1127's floor was not available
- [X] T061 *(planted 2026-08-17: throwaway build = 659fa94 + seed-patch-012-walk-A.diff, deployed; patch out of git until T089/T090.)* Plant **three defects** — one layout, one copy, one refusal message — in a throwaway build deployed to UAT, recorded as *base commit + named seed patch*. **Not `develop`** (FR-1127). A seed any automated gate catches first was the wrong seed — replace it with one no gate can see (edge case 6)

---

## Phase 5 — Walk it

**Sequenced, not parallel.** Each phase consumes the previous one's output, and all five share one
UAT database with no reseed between them.

**The unit of execution is the script, not this list.** The walker executes every `quickstart.md`
step in order, recording each in `walk-record.md` (FR-1120); T062–T088 name the checkpoints and the
cross-feature seams, **not the boundary of the walk** — messaging, notes, Q&A, blocking, password
reset, export and the denied-permission outcome are walked where the script places them. **5c runs
on a phone the walker owns** — SC-1201 is unmet at a desk. If a real account appears mid-walk, the
walk continues and the occurrence is recorded (edge case 5).

### 5a — Operator (US3, establishes the actors)

- [ ] T062 [US3] Walk operator sign-in; confirm the two sessions are independent — **the host-only cookie half needs two real hosts** and `localhost` cannot prove it
- [ ] T063 [US3] Promote an organizer, so Phase 5b has one
- [ ] T064 [US3] Walk the tier boundary: a conference organizer must not reach the report queue
- [ ] T065 [US3] Confirm no administrative route suspends, removes, restricts or edits an attendee

### 5b — Organizer (US2, authors the content the attendee walk reads)

- [ ] T066 [US2] Confirm the promoted person's **attendee** experience is unchanged in every observable way (FR-970–FR-984)
- [ ] T067 [US2] Walk seam S8 — create a conference from zero, issue its join code, have a real attendee join. **Every 014 scenario authors into a seeded conference**; decision 47's create capability is exercised by nothing
- [ ] T068 [US2] Walk a room change and a start-time change on a saved session; confirm **one** coalesced notification, the per-row marker, and that **no view shows a count of changes**
- [ ] T069 [US2] Walk enrolment to capacity; confirm **full** and **closed** are different sentences
- [ ] T070 [US2] Walk cancellation; confirm "Up next" omits it and the rest-of-day timeline does not
- [ ] T071 [US2] Walk seam S13 — an administrative edit through a **real browser's CORS preflight**, which `fastify.inject()` cannot perform

### 5c — Attendee (US1, on the conference 5b authored)

- [ ] T072 [US1] Walk sign-up, verification and join-by-code against the deployed build, recording the commit
- [ ] T073 [US1] Walk all five destinations including every empty state
- [ ] T074 [US1] Walk the mutual card exchange in two profiles and **read the confirmation copy** — where 016's FR-1055 defect lived with two green tests requiring the wrong sentence. Then propose, accept and view a meeting — **SC-1201's own named endpoint**, which no other task reaches
- [ ] T075 [US1] Walk the offline behaviour including the retrieval stamp
- [ ] T076 [US1] File a report, so seam S5 has one to follow
- [ ] T077 [US1] Walk seam S5 — report → operator mail → admin queue → resolution → the reporter is still told nothing. **Never walked end to end**; three features own one link each

### 5d — Layouts and devices (US4, US5 — read-only, runs last)

- [ ] T078 [US4] Walk MyNet at the chosen widths with a **capture per step** stored under `captures/` (FR-1126)
- [ ] T079 [US4] Walk `apps/admin` at the chosen widths with captures — **never reviewed at any width** — and confirm it presents **three** distinct layouts (US4 scenario 3): v5.4.0 R3 carved the missing third out as a defect, and this is where its fix is seen
- [ ] T080 [US4] Confirm every modal in both products is centred with comparable space either side — the 008 defect class
- [ ] T081 [US4] Confirm the 768–1279 rail divergence **is present**; v5.4.0 R3 ratified it, so a finding that they should match is a decision under FR-1131
- [ ] T082 [US4] Walk seam S11 — one 390px top bar with the UAT marker, the brand mark, the switcher and the product name competing
- [ ] T083 [US4] Record each width walked on a real viewport versus emulated, **and why**, per FR-1121
- [ ] T084 [US5] Install on a **physical iPhone**, judge the icon against the in-app coral mark, record against register entry 28, retype the composer test with a real keyboard, capture the home screen (FR-1122)
- [ ] T085 [US5] Install on a **physical Android phone**; exercise `beforeinstallprompt` and the install banner; capture the home screen beside the in-app mark for the register entry 28 record (SC-1205). Then, with this phone's attendee holding a saved session in the 5b conference, have the 5b organizer walker change its room: confirm **real Web Push delivery** — every push walk to date has been desktop only — and **activate the notification, confirming it lands on the destination carrying the per-row marker** (SC-1206, US5 scenario 4)
- [ ] T086 [US5] Walk seam S12 — install MyNet, then navigate to `admin.<host>`; confirm the root-scoped worker does not intercept administrative navigation
- [ ] T087 [US4] Screen-reader pass over the five authentication screens and one destination per product, including seam S14 across the boundary (FR-1124)

### 5e — Destructive, last

- [ ] T088 [US1] Walk seam S2 — delete the attendee who is now simultaneously an organizer, a contact, a conversation participant, a question author, a place-holder and a report subject. **Must be last: it destroys the fixtures every prior phase built**

---

## Phase 6 — Reveal, fix, re-walk

- [ ] T089 Reveal the three seeded defects. **A miss voids the walk and it is re-done with fresh seeds — T059–T061 run again** (FR-1127, SC-1208). Borrowed from 001's still-open T093: *a gate that does not fail when broken is not a gate*
- [ ] T090 **Revert the seed patch** and confirm none of the three survives into `develop`
- [ ] T091 Fix every defect the walk found, recording each in `defect-register.md` against the step that found it (FR-1130, FR-1132)
- [ ] T092 Record every finding needing a **decision** rather than a repair, in `decisions.md`, without fixing it (FR-1131)
- [ ] T093 Re-deploy `develop` to UAT with the fixes and record the new commit
- [ ] T094 Re-walk every step whose defect was fixed (FR-1133)

---

## Phase 7 — Decisions and close

- [X] T095 *(decided 2026-08-16: Q&A stays live as shipped, reporting is the mechanism until 017 — D-012-2.)* Record the **Q&A at launch** decision in `specs/012-launch-readiness/decisions.md`. Hiding or gating it retracts delivered 009 requirements and needs an amendment; leaving it live does not (FR-1143, SC-1212)
- [X] T096 *(decided 2026-08-16: a Sentry-class SDK, recorded with its four consequences and NOT licensed to land without its own feature — D-012-3.)* Record the **client diagnostic channel** decision in the same file. `apps/web/src` has exactly two `console.*` calls, both for unrecoverable faults, and the client holds personal data (FR-1142, SC-1212)
- [X] T097 Add `scripts/walk-record-audit.mjs` — `brand-audit.mjs`'s precedent — run from `pnpm verify` as a step inside an existing job (FR-1147 forbids an eleventh), parsing T055's row schema and asserting every step in `quickstart.md` has a row in `walk-record.md`, and every layout and install row names a capture file **that exists on disk**. Without it the human gate has no machine-visible output (SC-1203, FR-1126)
- [ ] T098 Mark discharged walk tasks complete in each feature's own `tasks.md`, **feature-prefixed**: `006/T080`, `006/T081`, `006/T102`, `007/T148`, `008/T148`, `008/T149`, `009/T097`, `010/T066`–`010/T070`, `011/T082`, `011/T084`, `013/T158`, `013/T159`, `014/T105`, `014/T206`, `014/T207`, `016/T067`, `016/T068`. Annotate each as **"discharged by 012"** rather than silently ticking it. **`001/T093` stays open** — T089 borrows its principle for the human gate; nothing in 012 breaks each automated gate, so ticking it would mark work complete that nothing here does; annotate it in 001's `tasks.md` as *principle borrowed by 012/FR-1127, gate-breaking pass still open*. **`011/T073` and `011/T074` are conditional on T057's outcome**: tick them only if the service principal was created and the CI deploy walked; under the hand-deploy decision, record them per T046's 011/9 disposition instead
- [X] T099 Confirm the roadmap's 012 row annotation is present and correct (FR-1150 — already applied in `6568db4`)
- [ ] T100 Update `CLAUDE.md`: the validation backlog is discharged and 012's outstanding-walk paragraphs no longer describe the project
- [ ] T101 Run `pnpm verify` green, including three engines, the nine recovered tests, and T097's walk-record gate

---

## Dependencies

```
Phase 1 (T001–T014) ──> Phase 2 (T015–T044) ──┐
                                               ├──> Phase 4 (T057–T061) ──> Phase 5
Phase 3 (T045–T056) ──────────────────────────┘                                │
(needs only the repository; concurrent with 1 and 2)                            v
                                                    Phase 6 (T089–T094) ──> Phase 7
```

**Hard gates:**
- **T007** — no operator credential, no Phase 5a, 5b or 5d-admin.
- **T007, T029 and T030 run repository code on the host** — each states its own transport; Phase 4's T058 is the walk's deploy, not the first time repairs reach UAT.
- **T058** — the walk runs against the deployed repaired build, not the repository.
- **Phase 5 is strictly ordered**: 5a establishes the actors → 5b authors the content → 5c walks it → 5d looks at it → 5e destroys it.
- **T088 must be last.** It deletes the attendee every prior sub-phase built up.
- **T061 plants before 5a; T089/T090 reveal and revert after 5e.**

## Parallel opportunities

- **Phase 2 and Phase 3 run concurrently** — the script derivation touches only the repository
- **T006, T009, T011, T012, T013, T014** — different files. T002 shares `operators.ts` with T003/T010, and T005 tests what T002 and T004 build, so neither is parallel
- **T041, T042, T043, T044** — four guards, four files
- **T027** — the only backup task not touching the live host

**Not parallel, contrary to the first draft**: T002/T003/T010 share `operators.ts`; T022/T023/T035/T036/T038 share `agenda-offline.spec.ts`; T032/T033/T034/T037 share `services.ts`. **Phases 5a–5e are not parallel at all** — they share one UAT database with no reseed between them.

## Suggested MVP

**Phases 1, 2 and 3 are a shippable, independently valuable PR.** They fix a production defect
(Safari cannot open Messages), a governance breach (backups have never run), a privacy hole, two
assertions that could never fail, and nine tests that never ran — **none of which depends on the
walk happening**.

## Task count

| Phase | Tasks |
|---|---|
| 1 — Setup / unblock | 14 |
| 2 — Foundational repairs | 30 |
| 3 — Derive script + record | 12 |
| 4 — Deploy and plant | 5 |
| 5 — Walk (5a–5e) | 27 |
| 6 — Reveal, fix, re-walk | 6 |
| 7 — Decisions and close | 7 |
| **Total** | **101** |
