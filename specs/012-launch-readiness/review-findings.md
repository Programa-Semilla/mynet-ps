# Deep Review Findings — 012 Launch Readiness (machine-phase implementation)

**Date:** 2026-08-16
**Branch:** spec/012-launch-readiness (commits 600ca15..9414fef + fix round 1)
**Rounds:** 2
**Gate Outcome:** PASS
**Invocation:** quality-gate (autonomous, pre-authorized by the owner)
**Stage 1 spec compliance:** 100% of the reviewable scope — all 22 machine-phase FRs and 5 SCs
verified with evidence (tests, live-host proofs, mutation tests). The walk phases (4–6) and the
two owner decisions are deliberately unexecuted and out of scope.

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0 | 0 | 0 |
| Important | 8 | 8 | 0 |
| Minor | 14 | 13 | 1 (skipped with reason, recorded below) |
| Notable | 5 | — | 5 (captured to idea inbox) |
| **Total** | **27** | **21** | — |

**Agents completed:** 5/5 (correctness 3, architecture 8, security 2, production 4, test-quality 10). External tools: none (disabled for this run).
**Post-fix verification:** unit and component suites green; 14/14 offline+terminal e2e green; walk-record gate green (mutation-tested by the re-reviewer: n/a-without-observation, fail-without-capture, missing capture file and a deleted Status line each fail); operator integration 3/3; backup.sh parser behaviourally verified by both reviewer and re-reviewer (comment lines ignored, SAS values with = and & survive, EOF line captured) and redeployed to the host.

**Round 2:** the re-review confirmed nine of ten fixes and found one Important remainder — `e2e/messages-terminal.spec.ts`'s header still asserted the retracted disjunctive acceptance and cited the deleted constant (the false-header class). Rewritten; lint and typecheck clean. Gate: PASS.

### FINDING-1
- **Severity:** Minor
- **Confidence:** 85
- **File:** deploy/vm/backup.sh:50-61
- **Category:** bash-parsing
- **Source:** correctness-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The new literal .env parser silently drops the file's final line when it lacks a trailing newline: `while IFS='=' read -r key value; do ...; done <"$file"` — `read` returns non-zero at EOF even after populating key/value, so the loop body never runs for an unterminated last line. Required keys (POSTGRES_USER, DATABASE_NAME) still fail loudly via the `:?` checks, but the optional keys silently fall back to defaults: a final-line `BACKUP_KEEP_LOCAL=30` reverts to 7 (pruning 23 local artifacts the operator intended to keep, after the off-host copy succeeds), and a final-line BACKUP_REMOTE_* value surfaces only as a confusing exit-7 'no off-host target configured'. A related sub-case: whitespace around `=` (`BACKUP_DIR = /x`) leaves the trailing space in the key, matches no case arm, and the configured value is silently ignored.

**Why this matters:**
This is the standard read-loop EOF gotcha, and the consequence here is silent configuration loss in a script whose whole design principle is 'a persistent failure keeps data rather than losing it'. The old `set -a; . file` sourcing did not have this particular failure mode (a sourced file's last line executes without a trailing newline).

**How it was resolved:**
Merged with #15 (same defect, two agents). backup.sh reads with `|| [[ -n "$key" ]]` and trims key/value whitespace; verified behaviourally (EOF line and spaced key both parse). Redeployed to the UAT host.

### FINDING-2
- **Severity:** Minor
- **Confidence:** 80
- **File:** scripts/walk-record-audit.mjs:82-106
- **Category:** gate-under-enforcement
- **Source:** correctness-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The audit enforces less than the requirements it implements. (1) The capture check at line 90 runs only for D-rows whose verdict is `pass`, but FR-1126 says 'EVERY layout and install step MUST carry a capture' — a D-row recorded `fail` (exactly the case where the photographic evidence matters most, since FR-1133 requires the fixing commit to re-walk it) passes the gate with an empty capture cell. (2) `blocked` and `n/a` verdicts require no observation at all, even when the record declares itself `complete` — yet walk-record.md's own header (line 16-17) states n/a requires 'reason in the observation', and SC-1203 requires a reader who was not present to tell what happened per step. A record can therefore go `complete` with rows like `| D2 | ... | | blocked | |` and the gate stays green.

**Why this matters:**
This script is explicitly 'the machine-visible edge of the human gate' (SC-1203, FR-1125, FR-1126); the gaps are exactly the rows most likely to exist in a rushed walk — a failed layout step with no screenshot, or a step waved off as blocked with no reason — and the gate's own docblock claims it makes 'the walk is done' machine-checkable.

**How it was resolved:**
Merged into the walk-record-audit widening: capture now required for D-rows with verdict pass AND fail; observation required for every non-pending verdict including blocked/n-a.

### FINDING-3
- **Severity:** Minor
- **Confidence:** 70
- **File:** apps/web/src/app/messages/Messages.tsx:274-282
- **Category:** false-failure-state
- **Source:** correctness-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The first-load deadline is armed on `status === 'loading'` alone, but the read it waits for is `usePoll`'s first tick, which is gated on document visibility and list-pane display. If Messages mounts in a hidden document (e.g. the destination opened in a background tab), `useDocumentVisible` reads false at mount, no tick ever fires, no request is issued — and after 25 seconds the deadline sets `failed`, so on focusing the tab the attendee is shown 'conversations could not be loaded' for a load that was never attempted. It self-corrects only because the poll fires immediately on becoming visible, so the false statement stands for roughly one round trip.

**Why this matters:**
FR-1145's deadline exists to convert a stalled REQUEST into an honest failure; declaring failure when the poll was deliberately paused inverts that honesty — the one fact in hand ('the product did not answer', per the constant's own docblock) is not true in this path, because nothing was asked. The ordinary hidden-list-pane case is unaffected (the initial effect flush still fires one tick before `useDisplayed`'s measurement lands), which is why this is confined to the hidden-document case and rated Minor.

**How it was resolved:**
Merged into the deadline redesign: the race lives inside the tick, so a gated poll (hidden document, display:none pane) runs no tick and can never be declared failed by an unarmed timer.

### FINDING-4
- **Severity:** Important
- **Confidence:** 85
- **File:** deploy/vm/README.md:241-264
- **Category:** doc-accuracy
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The rewritten 'last operator' recovery prescribes `operator-identities.js` + `bootstrap.js` and claims it covers the section's two named scenarios ('every platform operator is deactivated, or the last one loses their credential'). Both commands are deliberate no-ops in exactly those scenarios: deactivation sets `deactivated_at` and keeps the row (operators.ts schema line 111), so the additive insert's `onConflictDoNothing({ target: operators.email })` skips it and admin sign-in still refuses via `isNull(deactivatedAt)` (admin/identity.ts:98, require-operator.ts:183); a lost *chosen* credential hits bootstrap's `credentialIsInitial = true` condition (bootstrap.ts:105) and returns `already-replaced`, changing nothing (FR-993). The pre-012 prescription worked only because `db:seed`'s clear removed those rows. Meanwhile bootstrap.ts:152's `already-replaced` message still says 'Recovery from a lost administrative password is a re-seed; see deploy/vm/README.md' — pointing at a README that now says re-seed is not the recovery. The runbook and the command it cites now contradict each other, and the runbook's path leaves the operator locked out.

**Why this matters:**
This README is the operator runbook and this codebase treats a header claiming something the code does not do as a first-class defect (013's false-header class). An operator following the prescribed recovery on production gets two silent no-ops, and the natural next reach is the destructive re-seed this same change exists to make unnecessary (FR-1102/FR-1102b).

**How it was resolved:**
README recovery section now distinguishes row-absent (additive pair works) from deactivated-all and lost-chosen-credential (each needs the named by-hand UPDATE first); bootstrap.ts already-replaced message corrected to match.

### FINDING-5
- **Severity:** Important
- **Confidence:** 85
- **File:** apps/web/tests/unit/withdrawn-conference-erasure.test.ts:78-82, 156-160
- **Category:** comment-accuracy
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
FR-1140a instances left uncorrected by the change that implements FR-1140a. Line 78 asserts as present fact 'The two event-less keys every session writes: identity, and the active conference' — since T032 no session writes the identity (`self`) key; `getCurrent` is passThrough and never keyed. The assertion message at 156-158 says '`getCurrent` and `getActive` take no event argument, so the decorator keys them with an empty event segment' — the decorator no longer keys `getCurrent` at all. `packages/data/tests/cached-repository.test.ts:708-710` carries the identical twin sentence. The change corrected exactly this sentence in `cached.ts`'s `heldConferences` header ('until 012's T032, `getCurrent` wrote the same shape too, and devices still carry those keys') but missed both test-file twins — which is the FR-1140a/FR-1052 failure mode the spec itself names: searching for the requirement finds comments only where the work was already done.

**Why this matters:**
This codebase treats comments as the record; a comment asserting the superseded caching of identity is 'the sentence a later change would cite to bring the cache back' (services.ts's own words). The fixtures themselves are still valid (legacy keys exist on devices) — only the present-tense claims are false.

**How it was resolved:**
Both test-file comment twins rewritten the way cached.ts was: the `self` key is a pre-012 legacy entry devices still carry; getCurrent is passThrough since T032. packages/data/tests/cached-repository.test.ts twin corrected too.

### FINDING-6
- **Severity:** Important
- **Confidence:** 80
- **File:** scripts/walk-record-audit.mjs:9-10, 87-108
- **Category:** guard-narrower-than-claim
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The script's header claims it checks 'that every layout and install row names a capture file that actually exists on disk'; walk-record.md's preamble says 'Every D-part row (layout/install) must name a capture file that exists in captures/'; FR-1126 says every layout and install step MUST carry a capture. The code enforces the capture only for `row.step.startsWith('D') && row.verdict === 'pass'` (line 90). A D-row recorded `fail` — the exact class FR-1126's own rationale values most ('layout is the one thing no verdict can convey and the one class of defect this walk exists to find') — passes the gate with no capture, and since the record's rule is to append a re-walk row rather than overwrite, the capture-less fail row stands permanently.

**Why this matters:**
Three prose statements (script header, record preamble, FR-1126) are unconditional; the enforcement is conditional. In this codebase a guard narrower than its own stated claim is a first-class finding — 'a header is a claim that needs a guard like any other' — and the divergence is invisible until the first failing layout step ships without evidence.

**How it was resolved:**
walk-record-audit now enforces what its header and the record preamble claim — see FINDING-2 resolution; header/prose consistent with code.

### FINDING-7
- **Severity:** Important
- **Confidence:** 72
- **File:** .github/workflows/verify.yml:565-577
- **Category:** duplication
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The accessibility spec list is now written twice — root package.json's `test:a11y` script and this job's run line — with a comment mandating manual mirroring ('this line MUST mirror the root test:a11y script … a change to one line is a change to both'). Nothing derives one from the other or asserts they match. This contradicts the project's own recorded 016 invariant — 'an inventory that is read twice must be DERIVED twice, never written twice … a new output fails by existing' — and the drift it invites is precisely the failure this same change fixes under FR-1147 (nine tests that ran in no job because two lists disagreed). A third copy exists by complement in test-e2e's find exclusions (lines ~727-728), so the inventory is effectively written three times.

**Why this matters:**
The change's own narrative is that this exact derivation silently narrowed twice; re-introducing a comment-enforced hand-mirrored list in the fix is the shape the codebase's invariants forbid. The concrete failure: a fourth a11y spec added to `test:a11y` but not to this line runs in no required check, and both lists stay green.

**How it was resolved:**
test-accessibility now runs `pnpm test:a11y` — the spec list has exactly one home (root package.json) and the job derives from it; the mirror-by-hand mandate is gone.

### FINDING-8
- **Severity:** Minor
- **Confidence:** 75
- **File:** packages/platform/src/web/notifications.ts:125-126, 214, 243
- **Category:** duplication
- **Source:** architecture-agent
- **Resolution:** skipped

**What is wrong:**
`subscriptionPossible()` was introduced as the named form of the permission invariant, but only `unsubscribe()` and `currentSubscription()` use it. `subscribe()` (line 243) and `show()` (line 214) keep inline `Notification.permission !== 'granted'` spellings of the same predicate — the header even points at the duplication ('subscribe() has always carried this exact gate'). Four sites, two spellings, one invariant.

**Why this matters:**
If the predicate ever needs to change (the file's own history is exactly this: a permission nuance surfacing per-engine), the copies diverge and the one that lags is the one that decides whether the push machinery is touched — the failure mode the guard exists for.

**How it was resolved:**
Deliberate: subscribe() re-reads permission AFTER requestPermission() and show() gates display, not subscription — folding either into the subscription-named helper would blur the invariant the name states. The two inline checks are each one line beside their reason.

### FINDING-9
- **Severity:** Minor
- **Confidence:** 75
- **File:** playwright.config.ts:110-114
- **Category:** comment-accuracy
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The projects header says '`messages-terminal.spec.ts` is 012's WebKit terminal-state suite (FR-1145) and may not exist yet on this branch — a `testMatch` entry with no file matches nothing'. The file exists in this same change (e2e/messages-terminal.spec.ts is added by this diff), so at HEAD the hedge is stale and reads as current uncertainty — a later reader auditing testMatch entries may conclude this one is possibly-dead configuration.

**Why this matters:**
A codebase whose discipline is that the comment is the record should not ship a hedge that was true only of an intermediate commit; 'may not exist' beside a file that does exist is exactly the drift FR-1140a-style corrections target.

**How it was resolved:**
The may-not-exist-yet sentence replaced: the file exists in the same change; comment now states why the spec is read-only and that it runs in all three engines.

### FINDING-10
- **Severity:** Minor
- **Confidence:** 70
- **File:** e2e/agenda-offline.spec.ts:29-42
- **Category:** duplication
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
`awaitServiceWorker` is duplicated verbatim in e2e/agenda-offline.spec.ts and e2e/offline.spec.ts, and this change fixed the identical FR-1146 defect in both copies with an identical 9-line explanatory comment, doubled. FR-1146's own wording ('both offline helpers wait on…') is evidence the duplication already cost a synchronized two-site fix once; a third spec needing the wait will copy it a third time. `e2e/support/` exists for shared helpers.

**Why this matters:**
Duplication that has already diverged-and-been-resynced once is the kind this codebase names as a hazard; the next engine-specific correction has to find both (or three) copies or the suites silently disagree about what 'worker ready' means.

**How it was resolved:**
awaitServiceWorker extracted to e2e/support/service-worker.ts; both suites import it; the FR-1146 explanation lives once.

### FINDING-12
- **Severity:** Minor
- **Confidence:** 75
- **File:** apps/api/src/db/seed/operators.ts:150-186
- **Category:** authz-race (TOCTOU)
- **Source:** security-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
ensureOperatorIdentities performs the FR-918 cross-table uniqueness check (addressTakenByOtherPrincipal) and the operator insert as two separate statements on the bare pool — no transaction, no lock. Before 012 this pattern only ran inside the destructive seed against an empty database; this change deliberately makes it runnable against a live deployed database where public attendee sign-up is open (that is FR-1102's whole point), and the operator addresses it inserts are committed to a public repository, so an attacker knows exactly which addresses to race. An attendee sign-up for operator@mynet.invalid committed between the check and the insert leaves one address naming two principals — the exact state FR-918 exists to make impossible and that FR-915's single-lookup admin sign-in depends on not existing.

**Why this matters:**
I traced the exploit ceiling: findAdminCandidate prefers an operator row with a passwordHash and the attendee half requires a live organizer assignment, so no direct privilege escalation follows — but the product's one application-enforced uniqueness rule (013's headline: 'the only uniqueness rule enforced by application code') is breakable by timing on a publicly reachable host, and every downstream consumer of FR-918 (sign-in resolution, bootstrap targeting, the sign-up 409 anti-oracle) is reasoned from it holding. The window is small and requires an operator to be running the command at that instant, hence Minor rather than Important.

**How it was resolved:**
ensureOperatorIdentities now wraps the FR-918 check and the insert in one db.transaction per operator — the helper's own stated precondition honoured; both callers (seed and CLI) verified.

### FINDING-14
- **Severity:** Important
- **Confidence:** 75
- **File:** apps/web/src/app/messages/Messages.tsx:261-282 (with apps/web/src/app/messages/usePoll.ts 214-217)
- **Category:** error-recovery
- **Source:** production-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The FR-1145 first-load deadline restores the screen after a never-settling request, but the poll it rides on stays permanently wedged. usePoll chains ticks via `run().finally(() => schedule(startedAt))`; a tick whose promise never settles (exactly the class the new FIRST_LOAD_DEADLINE_MS comment names: a service-worker routing fault, a transport whose abort never fires) means `.finally` never runs and no further tick is ever scheduled. The deadline flips the screen to 'failed' and the retry control works — but `retry` calls `read()` directly, bypassing usePoll, so after a successful retry the destination renders 'ready' while the 10-second refresh is dead, the failure counter is frozen, and the FR-1010 staleness notice can never appear. The same gap exists with no deadline at all when a *refresh* tick (status already 'ready') stalls: the list silently stops updating with no notice, until a document-visibility or listOnScreen change happens to re-run the poll effect.

**Why this matters:**
The change's own comment claims to close 'the rest of the class' of stalled requests, but it only closes the screen half. In the exact scenario the fix targets, the user sees an apparently recovered conversation list that silently never updates again — new messages do not appear and the product's own staleness guarantee (FR-1010) is disabled. Recovery requires backgrounding the tab or navigating in and out of a thread, which nothing tells the user to do.

**How it was resolved:**
The deadline is now a race INSIDE the tick (`bounded()` around repository.list()), so every tick settles, usePoll's finally-chain keeps scheduling, backoff and the FR-1010 staleness notice stay live, and a stalled refresh is bounded by the same clock. The screen-watching effect is deleted. All three component tests pass against the new mechanism (the late-response case arrives through the poll's next tick).

### FINDING-15
- **Severity:** Minor
- **Confidence:** 75
- **File:** apps/web/src/app/messages/Messages.tsx:274-282
- **Category:** graceful-degradation
- **Source:** production-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The deadline effect ignores whether the poll is enabled. On mobile, landing directly in a thread (the documented notification-activation flow lands on the conversation) leaves the list pane `display:none`, so `usePoll` is disabled via `listOnScreen` and no read is ever attempted — yet the deadline arms on the initial 'loading' status and after 25 s marks the hidden list 'failed'. When the user navigates back to the list, `listOnScreen` becomes true and the poll's immediate tick fires, but until it answers the user sees "could not be loaded" with a retry control for a load that was never attempted — a false failure flash proportional to their RTT.

**Why this matters:**
A failure state shown for a request that was deliberately never issued misreports the product's health on a primary mobile flow (open a push notification, read the thread for 25+ seconds, go back to the list). Before this change the same path honestly showed 'Loading…' until the first tick. The header's 'a poll that was never scheduled' rationale is about scheduling faults, not a poll paused on purpose by FR-1054.

**How it was resolved:**
Subsumed by the same redesign — no tick, no race, no false failure.

### FINDING-16
- **Severity:** Minor
- **Confidence:** 80
- **File:** deploy/vm/backup.sh:50-61
- **Category:** reliability
- **Source:** production-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The new `.env` parser (`while IFS='=' read -r key value; do ... done <"$file"`) drops the file's last line when it lacks a trailing newline: `read` returns non-zero at EOF, so the loop body never runs for that line and the variable is silently never assigned. It also leaves a trailing `\r` in values if the file ever acquires CRLF endings. The `.env` on the UAT host is hand-edited (OPERATIONS-LOG records the SAS being rewritten by hand after a sed corruption), and `.env.example` places `BACKUP_REMOTE_CREDENTIAL` as the last backup key — the most likely one to end the file. If it is dropped, every nightly cron run refuses at the off-host step and exits 7 logging "No off-host target configured", a cause-that-is-not-the-cause, indefinitely; if `POSTGRES_USER`/`DATABASE_NAME` were last, every run exits 2 and no backup is taken at all.

**Why this matters:**
This script's own comments (the flock-127 block) treat a misleading failure cause under unattended cron as a first-class defect, because the log is the only surface and nothing mails. The old `set -a; . file` sourcing did not have the missing-newline behaviour, so this is a regression in edge-case robustness introduced by the (otherwise correct) parse-as-data fix. Failure direction is safe — nothing is pruned — but the daily-backup governance obligation (decision 17, FR-1148) silently degrades to local-only or to no backups, discoverable only via `status`.

**How it was resolved:**
Duplicate of FINDING-1 (see it).

### FINDING-18
- **Severity:** Important
- **Confidence:** 85
- **File:** e2e/offline.spec.ts:271-285 (also 228-237)
- **Category:** vacuous-pass / FR-1146 incomplete
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
FR-1146 names the class 'the IndexedDB helpers resolve silently on error, so their assertions pass vacuously' and the fix landed only in agenda-offline.spec.ts. offline.spec.ts's sign-out residue scan still swallows every IndexedDB error: the open resolves null on error (line 275) and getAll resolves [] on error (line 282). The final assertion is a deletion proof — expect(residue).toEqual([]) — so an error-induced empty answer is exactly the direction that passes. A broken indexedDB.open or a failing getAll after sign-out would report 'no residue' forever while private content sat on the device. (The pre-sign-out cachedBefore guard at 228-241 protects only the open path, not the post-sign-out getAll path.)

**Why this matters:**
This is the precise defect shape FR-1146 was written to eliminate ('Both are wrong on Chromium too'), left standing in the one test whose subject is a privacy purge — the assertion direction (.toEqual([])) makes the silent-resolve a guaranteed wrong-reason pass on store failure.

**How it was resolved:**
offline.spec.ts residue scan and cachedBefore count now reject with reasons on open/count/getAll failure — an error can no longer masquerade as "no residue".

### FINDING-19
- **Severity:** Important
- **Confidence:** 75
- **File:** e2e/agenda-offline.spec.ts:715-735
- **Category:** racy-absence-assertions
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The SC-1207 test's disclosure checks are all instant-pass absence assertions (toHaveCount(0)) run immediately after the shell's navigation becomes visible, with no wait for the expected terminal state. On a regressed build (identity cached again), the disclosure renders only after async IndexedDB reads (cached getCurrent -> scope adoption -> programme read); the nav renders first in both builds. Playwright web-first assertions succeed on the first poll when the count is already 0, so the whole absence block can complete inside the window before a regressed build paints the previous attendee's name and titles — a pass for the wrong reason. Contrast the FIX-203 test in the same file (line 641), which deliberately waits for the failure alert 'so the deletion has demonstrably happened' before reading the store; this test omits that anchor.

**Why this matters:**
This is the only behavioural test of SC-1207 (no-cached-identity.test.ts is a source grep and says so), and the criterion it pins is the feature's headline privacy fix; a test that catches the regression only when the CPU is slow does not pin it.

**How it was resolved:**
The SC-1207 test now awaits the identity-offline alert (the positive marker of the correct build) before any absence assertion; a regressed build fails that wait deterministically. Verified green.

### FINDING-20
- **Severity:** Important
- **Confidence:** 85
- **File:** apps/web/src/app/services.ts:495-510, 535-546
- **Category:** coverage-gap
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
FR-1149's two behaviours have no automated test anywhere. (1) The new catch in the watching wrapper resets the scope to 'anonymous' on NotAuthenticatedError/SessionExpiredError — grep for FR-1149/T033/T034 across apps/web/tests and e2e finds nothing, and no test references SessionExpiredError or attendeePrefix('anonymous'). (2) The new sign-in-time purge of the anonymous prefix (T034) is equally untested. The classification is instanceof over two specific classes; a transport refactor that reshapes those errors (008's own error-classification history shows this happens) regresses the reset silently, reproducing exactly the cross-prefix write FR-1149 names: the second person's identity written under the first person's cache prefix, where the first person's sign-out purge never runs.

**Why this matters:**
Every sibling in-scope requirement (FR-1140, FR-1141, FR-1144-1147) received a dedicated guard in this change; FR-1149 is the one whose failure is invisible to every online behavioural test, which is precisely the profile this codebase keeps writing tripwires for.

**How it was resolved:**
attendeeIdentity and purgingOnSignOut exported for tests only (the FIX-305 precedent, justification in place); apps/web/tests/unit/identity-scope-guards.test.ts pins the un-resolve on both auth refusals, the keep-resolved on network/server failures, and the purge-before-delegate order. 5/5 green.

### FINDING-21
- **Severity:** Minor
- **Confidence:** 72
- **File:** e2e/messages-terminal.spec.ts:52-73
- **Category:** weak-assertion
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The FR-1145 pin accepts 'You are offline' and 'could not be loaded' as passing terminal states. But this suite always runs against the live localhost webServer the Playwright config starts, where the only legitimate outcomes are the two content arms — so the lenient arms admit exactly the regression shapes FR-1145 is about: a WebKit-specific transport stall or error would render the FIRST_LOAD_DEADLINE failure state at 25s and the test goes green while 'Safari users cannot open Messages' is true again. The property 'Messages actually loads content in WebKit' is currently guarded only incidentally, by responsive.spec.ts clicking a conversation link under the webkit project — coverage that could vanish in a restructure without anything naming FR-1145 failing.

**Why this matters:**
The file's own header claims it 'proves the symptom is gone in a real WebKit'; against a server that always answers, accepting the declared-failure state proves only that the failure state exists — the deadline mechanism, which the component test already pins.

**How it was resolved:**
messages-terminal now accepts only the two ready-states — against the always-up webServer, offline/failed banners would mean the engine failed to reach a live server, which is the defect class under test.

### FINDING-22
- **Severity:** Minor
- **Confidence:** 78
- **File:** apps/api/tests/integration/operator-identities.test.ts:63-88
- **Category:** weak-assertion
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The re-run test's comment claims it verifies the command 'must not have reset' a chosen credential, but the assertions check only that SEED_OPERATORS.length rows have a non-null passwordHash and that row counts are stable. A regression replacing onConflictDoNothing with an upsert that leaves the hash alone but flips credentialIsInitial back to true would pass every assertion — and that flip re-arms bootstrapOperatorCredential's WHERE credential_is_initial = true, making the next bootstrap run overwrite the operator's chosen password: the exact FR-993 catastrophe 013 guarded against, arriving through the new command instead.

**Why this matters:**
The test sets both passwordHash and credentialIsInitial in its arrange step and then asserts on neither value, so its own stated property ('must not have reset it') is only half-backed; the unasserted half is the one with the worst downstream consequence.

**How it was resolved:**
The re-run test compares the hash and credential_is_initial by VALUE; a hash-preserving upsert that re-arms the bootstrap now fails.

### FINDING-23
- **Severity:** Minor
- **Confidence:** 72
- **File:** apps/api/tests/integration/operator-identities.test.ts:43-61
- **Category:** coverage-gap
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
SC-1210 reads 'a platform operator credential can be ISSUED against a database holding attendee records, and the attendee row count is unchanged afterwards.' This file proves that for identity insertion (ensureOperatorIdentities) only. Credential issuance itself — bootstrapOperatorCredential — is exercised solely in admin-bootstrap.test.ts, which never counts or even references attendee rows, so the issuance half of SC-1210 has no attendee-invariance assertion anywhere. The bootstrap is a single-table update today, but the criterion asks for the whole sequence and only half is pinned.

**Why this matters:**
The header of this very file argues that source-shaped reasoning ('the command obviously touches nothing else') is the assertion class the project keeps finding blind — the same reasoning is currently the only cover for the bootstrap half of SC-1210.

**How it was resolved:**
A third test drives bootstrapOperatorCredential against the attendee-holding database and asserts the count unchanged — SC-1210's issuance verb now has an attendee-invariance assertion.

### FINDING-24
- **Severity:** Minor
- **Confidence:** 80
- **File:** scripts/walk-record-audit.mjs:72-106
- **Category:** weak-assertion
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The verdicts 'n/a' and 'blocked' escape both armed obligations: the observation requirement (line 82 fires only for pass/fail) and the D-row capture requirement (line 90 fires only for pass). walk-record.md's own header states 'n/a (with reason in the observation)', but the gate does not enforce it — a record can declare itself complete with every D-row marked n/a, no observation and no capture, and the audit stays green. That is a one-word bypass of the FR-1125/FR-1126 arming the script exists to make machine-checkable.

**Why this matters:**
The gate's whole design is that a complete record cannot be hollow; the two verdicts it does not inspect are the only ones a walker under time pressure would reach for, which is the edge case the spec itself names ('the walker runs out of time mid-journey').

**How it was resolved:**
Folded into FINDING-2's widening (n/a and blocked now demand an observation; D-row captures on pass and fail).

### FINDING-25
- **Severity:** Minor
- **Confidence:** 75
- **File:** scripts/walk-record-audit.mjs:108-122
- **Category:** silent-disarm
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:**
The completion obligations arm only when /^\*\*Status\*\*: `complete`/m matches, and there is no guard that the Status line exists or parses at all — unlike the step parser, which carries its own 'fix the parser, never the threshold' failure at line 35. Reword, unbold, or drop the Status line and 'complete' is never detected: pending rows never fail, the base-commit and seed-patch placeholders are never demanded, and the gate reports 'record in progress' green forever. The same applies to the two placeholder regexes at 114 and 119, which match specific italic phrasings.

**Why this matters:**
A gate whose arming condition can be edited away without any failure is the it.skipIf class this repository documents; the script guarded one of its two parsers against exactly this and not the other.

**How it was resolved:**
The Status line's existence is guarded: an unparseable header is a failure, not a silent disarm.

## Notable Observations

### NOTABLE-11
- **File:** apps/web/src/app/services.ts:146-155
- **Category:** abstraction
- **Source:** architecture-agent
- **Description:** After T032 the attendee repository is wrapped in `cached(...)` with an empty `reads` map and its only method (`getCurrent` — AttendeeRepository has exactly one member) declared `passThrough`: the decorator is now machinery that caches nothing, purges nothing, and records no freshness. 009 recorded the stronger form for exactly this situation: 'Not decorating removes the mechanism instead of configuring it: there is no reads map to omit from', and this same file warns elsewhere 'Do not add cached here to gain passThrough'. The spec's Feature Declarations row does name the declared-passThrough form, and `no-cached-identity.test.ts` anchors on it, so this is shipped as specified — recorded as a design observation, not a defect.
- **Rationale:** An undecorated `identity.watching(new HttpAttendeeRepository(http))` would make SC-1207's closure structural rather than configured: re-caching identity would require re-adding the whole decorator (a large, reviewable change) instead of moving one word from `passThrough` back into `reads` — the one-word revert the tripwire test exists to catch.

### NOTABLE-13
- **File:** deploy/vm/OPERATIONS-LOG.md:521-536
- **Category:** information-disclosure
- **Source:** security-agent
- **Description:** The new T028–T030 entry publishes, in a world-readable repository, the off-host backup storage account name (stmynetuatbackups), resource group, container name (backups), and the SAS's permission set and expiry date (sp=cw, expires 2027-08-16); the T006 addendum additionally records that a genuine UAT account exists for a named personal Gmail address. No secret is committed — the SAS itself and the bootstrap credential are correctly kept out of the file.
- **Rationale:** The repository being public is a recorded Principle VIII threat-model fact, and this entry narrows an attacker's reconnaissance for the one asset the backup design treats as the crown jewel (the off-host history): the exact account and container to target, and how long the current write credential lives. It is runbook-style operational logging and arguably deliberate, but the disclosure is a choice worth having been made knowingly — the same reasoning the log itself applies elsewhere.

### NOTABLE-17
- **File:** playwright.config.ts:106-163
- **Category:** ci-reliability
- **Source:** production-agent
- **Description:** The firefox/webkit projects triple responsive.spec.ts's throttled side effects against the one shared seeded database in `test-e2e`. Each pass runs `seedQuestionReport` (one `question_ask` as Grace, one `report_submit` as Alan) plus a card share and a message send. `report_submit` allows 5 free attempts per identifier per rolling hour, and one CI run now consumes 4 as Alan (3× responsive + 1× admin-moderation, all inside one hour); CI `retries: 1` means a single flaky retry of either test reaches the limit, and the next report-filing spec anyone adds crosses it. Excess attempts are delayed rather than denied at first, so the initial symptom would be slowdown and then intermittent `filed.ok()` failures in the webkit pass — the last project to run, presenting as WebKit flakiness. The config comment's evidence ("verified by running them twice") covers two passes; CI executes three plus the full chromium suite's own consumption.
- **Rationale:** Throttle counters are the one piece of cross-project shared state the repeat-safety analysis in the comment does not account for — it names duplicate names, message bodies and the question_ask throttle for the *excluded* suites, but the included sweep also spends per-identifier budgets that accumulate across engine passes within the 1-hour window. A gate that fails by throttle exhaustion in the third engine would be misdiagnosed as a WebKit product defect, the exact misattribution FR-1145's research just spent effort untangling.

### NOTABLE-26
- **File:** scripts/walk-record-audit.mjs:27-70
- **Category:** coverage-gap
- **Source:** test-quality-agent
- **Description:** The audit machine-checks only 012's own 44 steps against walk-record.md rows. Appendix A — the SC-1202 ledger of 136 enumerated walk units, each carrying one disposition — is not parsed at all: a unit deleted from the ledger, a 'walked -> <step>' naming a step that does not exist, or a 'retired -> <coverage>' naming no coverage would all stay green. SC-1202 ('no scenario is left unaccounted for') is the criterion most amenable to machine checking in this feature, and the audit stops one section short of it.
- **Rationale:** Design observation, not a bug: the ledger's shape (unit -> disposition) is as parseable as the row table the script already handles, and cross-checking 'walked' dispositions against the step inventory the script already builds is a few lines.

### NOTABLE-27
- **File:** apps/web/tests/unit/no-cached-identity.test.ts:47-56
- **Category:** guard-escape-form
- **Source:** test-quality-agent
- **Description:** The reads-map detector requires a string literal after the colon (/getCurrent\s*:\s*['"]/), so it catches the direct revert ({ getCurrent: 'self' }) and — via the third test — plain omission of passThrough. It does not catch a reads entry whose value is an identifier (getCurrent: SELF_RESOURCE, with const SELF_RESOURCE = 'self'), which type-checks, restores the disclosure, and passes all three assertions. The guard also only reads services.ts, so a second composition-root file wrapping HttpAttendeeRepository in cached() elsewhere would be invisible — mitigated today by services.ts being the sole composition root.
- **Rationale:** Design observation: the likely revert forms are covered; the identifier-valued form is the one a refactor extracting resource-name constants would produce accidentally rather than maliciously, which is the way this class of guard has been defeated before (016's FR-1052 lesson about checks brightest where blindest).

## Post-Fix Spec Coverage

No fix removed an implemented requirement: the fix round edited enforcement inward (gates widened,
tests strengthened, comments corrected) and deleted only the superseded deadline effect, whose
requirement (FR-1145's terminal state) is re-implemented by the tick-level race and re-verified by
the same three component tests plus the three-engine e2e. All in-scope requirements re-verified
after the fix loop.

## Test Suite Results

| Round | Command | Result |
|-------|---------|--------|
| 1 | vitest unit (full) | passed |
| 1 | vitest component (full) | passed |
| 1 | playwright agenda-offline + offline + messages-terminal (chromium) | 14/14 passed |
| 1 | vitest integration operator-identities | 3/3 passed |
| 1 | node scripts/walk-record-audit.mjs | green (44 steps, in-progress mode) |
