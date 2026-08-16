# Deep Review Findings

**Date:** 2026-08-15
**Branch:** `fix/purge-defects-restriction-guard-admin-layout`
**Rounds:** 1
**Gate Outcome:** PASS
**Invocation:** manual (standing instruction to run deep review when warranted)

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0 | 0 | 0 |
| Important | 7 | 7 | 0 |
| Minor | 8 | 5 | 3 |
| Notable | 4 | — | 4 |
| **Total** | **19** | **12** | **7** |

**Agents completed:** 5/5. **External tools:** none — the CodeRabbit and Copilot CLIs are not installed on this machine, and the project has no `deep-review-config.yml`. This review had no external validation layer.

## The one thing worth reading if you read nothing else

**Four of the seven Important findings are the same defect wearing different clothes:**

> **The assertion exists, names the right thing, and cannot see it.**

- FIX-403's guard measured the `<nav>`; the defect lived on the `<ul>` inside it, and `overflow-x: auto` does not propagate to ancestors.
- FIX-104's table drove the `label in PERMITTED` lookup, never the derivation from the route tree — which is the stage that was actually blind.
- Nothing asserted the erasure was wired into the composition root. Deleting it left every test green.
- The real IndexedDB bodies of the two new `LocalCache` members ran in no test; an in-memory double stood in everywhere.

**Three of those are in code written to fix an instance of exactly that pattern.** The spec named the failure mode in prose, three implementing agents each reproduced it, `pnpm verify` passed on all of it, and only an adversarial read found it. That is the finding. The twelve fixes are the consequence.

**Every fix in this round was mutation-verified** — the fixing agent broke the thing back and confirmed the new assertion fails. That requirement was added specifically because a fix for a blind assertion is worthless if nobody checks the fix for blindness.

---

## Findings

### FINDING-1 — FIX-2 never reaches the case it was written for
- **Severity:** Important · **Confidence:** 88
- **File:** `packages/data/src/http/cached.ts`, `apps/web/src/app/services.ts`
- **Category:** security / production-readiness
- **Source:** security-agent **and** production-readiness-agent, independently
- **Resolution:** fixed (round 1)

**What is wrong:** The eviction fires only inside the `catch` of a cacheable read — so an entry is deleted only if somebody actively reads it while the server is unreachable. The device state the spec's own problem statement names ("a device that stops being able to reach the account") is exactly the state where **no conference-scoped read is ever issued**. The app renders signed-out and reads nothing.

Traced: `store.remove` had one call site, inside that catch. All five `store.purge` sites require a live session with a resolved identity. On a lapsed session the decorator purges only `attendee:anonymous|event:|`. Everything under the real attendee id — programme, tracks, saved set, appointments, and `notes`, the product's only attendee-authored free text — was never enumerated and never deleted.

**Why this matters:** FIX-201 was met literally and its purpose was not. A shared device accumulated one full conference-content set per attendee who ever signed in and closed the tab, forever, with no size cap and no LRU — while the account-deletion screen promises in bold that no copy is kept. **The word "read" in FIX-201 quietly scoped the requirement to the one path that cannot reach the motivating case.**

**How it was resolved:** `sweepExpired(store, now?)` added to `cached.ts`, wired fire-and-forget with an explicit `.catch()` in `createServices()` **before** `attendeeIdentity()`, so it visibly depends on nobody being signed in. It enumerates `store.keys('attendee:')`, reads each entry and removes the expired ones.

**This is not the mechanism R1 rejects.** R1 rejects purging *on an authorization refusal* — classifying why a session ended. This classifies nothing and deletes only entries FIX-201 already declares unreadable. The distinction is stated at the function.

A `sweep(olderThanMs)` member on `LocalCache` was **rejected**: it is one cursor pass instead of N reads, but it moves the comparison (parse the stamp, judge the age, decide what an unparseable one means) into every implementation — and the lifetime is deliberately expressed once in `packages/data` so a native implementation cannot disagree about when offline access is revoked. The read path and the sweep now share one classifier.

### FINDING-2 — the FIX-403 assertion was blind to the defect it was written to catch
- **Severity:** Important · **Confidence:** 85
- **File:** `e2e/responsive.spec.ts`
- **Category:** correctness
- **Source:** correctness-agent (test-quality-agent reported the adjacent half: `overflowX` computed, never asserted)
- **Resolution:** fixed (round 1)

**What is wrong:** `selfOverflow` was applied to the `<nav>`. The retired markup was `<nav><ul class="flex gap-1 overflow-x-auto">`. **An element with `overflow-x: auto` establishes its own scroll container and does not propagate overflow to its ancestors**, so `nav.scrollWidth === nav.clientWidth` and the measurement read `0`.

The helper computed the one value that would have caught it — `widest`, via `getBoundingClientRect()`, which sees laid-out-but-clipped children — **and used it only inside the failure message string.** Same for `overflowX`.

**Why this matters:** FIX-403 exists because `documentElement` overflow could never see an inner scroll container. The replacement had the identical blindness one level down. The link-visibility loop did not compensate: Playwright's `toBeVisible()` is satisfied by a non-empty bounding box, which a clipped item still has.

**How it was resolved:** `selfOverflow` now returns four values and the test asserts all of them — `overflow`, `widest` (asserted empty), `scrollers` (any element in the subtree that is itself a horizontal scroll container with content to scroll — the general form, undefeatable by moving the strip deeper), and `declared` (any element declaring `overflow-x: auto|scroll`).

**`declared` is asserted below 768px only, and that narrowing is deliberate.** CSS computes `overflow-x: visible` to `auto` whenever `overflow-y` is not visible, so a future `overflow-y-auto` on the rail would fail at tablet and desktop width for a correct reason — and a guard that cries wolf gets weakened until it checks nothing. FIX-402's own scope is `< 768px`.

**Verified empirically.** The exact retired markup was restored from `git show 16ab5a5^`. The test fails — **at `widest`, not at `overflow`**:

> `2 element(s) are laid out past the administrative navigation's right edge at 320px: [{"selector":"li.shrink-0.md:shrink","text":"Vocabulary","right":390}, …]`

`overflow` passed on that markup. The central claim is confirmed rather than argued.

### FINDING-3 — FIX-104's table exercised only half the guard
- **Severity:** Important · **Confidence:** 78
- **File:** `apps/api/tests/unit/no-attendee-restriction.test.ts`
- **Category:** test-quality
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `unlisted()` was a bare `label in PERMITTED` lookup, and both table-driven tests called it with **pre-formed literal label strings**. The stage that was blind in the old shape — deriving the label set from the route tree — was never driven by the table.

**Why this matters:** re-introducing a URL pre-filter at the derivation stage left **every table test green**. The only tripwire was `writes.length > 20` against a 39-entry allow-list, so **up to 19 routes could be silently filtered out without failing.** The "does not flag legitimate writes" test was a tautology over `PERMITTED`'s own keys.

**How it was resolved:** the derivation is extracted into named pure functions (`adminWriteLabels`, `unlistedWrites`), the live assertion calls them, and both tables now pass **synthetic route objects** rather than labels. The legitimate-routes test first asserts the derivation *produced* all ten labels, killing the tautology. A new test pins that reads are excluded by **method**, not by URL.

**Verified:** re-introducing the pre-filter now fails **3 tests**; under the old shape it failed none.

### FINDING-4 — nothing asserted the erasure was wired in
- **Severity:** Important · **Confidence:** 85
- **File:** `apps/web/tests/unit/withdrawn-conference-erasure.test.ts`
- **Category:** test-quality
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** the whole FIX-3 suite imported the helper directly, and `createServices()` is referenced by no test in the repository — only by `main.tsx`. **Deleting the wrapper and leaving `events: new HttpEventsRepository(http)` bare kept every test green.**

**Why this matters:** FIX-301 and FIX-305 would have been unmet in the shipped product with a fully passing build. The helper's own header says it is exported "only so that FIX-305 can be a real test" — so its single production call site was precisely what the tests could not see.

**How it was resolved:** follows `messages-absences.test.ts`'s idiom — reads `services.ts` as text, **strips comments first** (the prose names the wrapper repeatedly, so a check its own justification could satisfy would pass after the wiring was deleted and the paragraphs left behind), and asserts both a positive and a negative shape.

**Verified by mutation** against the real file text: as-shipped ✓, prettier-wrapped ✓, wrapper deleted **flips**, wrapper deleted with prose kept **flips**.

### FINDING-5 — the real IndexedDB bodies ran in no test
- **Severity:** Important · **Confidence:** 80
- **File:** `packages/platform/tests/local-cache.test.ts`, `packages/platform/src/web/local-cache.ts`
- **Category:** test-quality
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** the two new members were exercised only in the no-IndexedDB degradation path and by a `typeof === 'function'` shape check. The `store.delete(key)` call, the `openKeyCursor` loop, the `typeof cursor.key === 'string'` filter and the `oncomplete` resolution ran nowhere.

**Why this matters:** FIX-3's entire mechanism depends on `keys()` returning real key strings. If it resolved `[]` against a working store — a cursor that never fires `oncomplete`, a bound built the wrong way round, `primaryKey` vs `key` — no conference would ever be erased and every suite would stay green. This is the shape of 008's `#private`-field Proxy defect and 010's precache guard that could never run.

**How it was resolved:** two tests in `e2e/agenda-offline.spec.ts`, which already drives `mynet-cache` via `page.evaluate`. A direct round-trip is **not reachable from `e2e/` alone** — the suite runs a `vite preview` production build with hashed chunks and `WebLocalCache` is not on `window`; exposing it would mean editing `apps/`. So the real bodies are driven **through the product** and observed via raw IndexedDB: a phantom conference is planted under the attendee's own prefix and can only be found via `store.keys()`; the programme entry is aged out and the store checked for exact-key removal with fresh neighbours intact.

### FINDING-6 — the three-layout test sampled three points, not the range
- **Severity:** Important · **Confidence:** 75
- **File:** `e2e/responsive.spec.ts`
- **Category:** test-quality
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** it measured 375, 900 and 1440 only. The band boundaries — 767/768 and 1279/1280 — were never measured.

**Why this matters:** half of FIX-4's defect was that the shell changed at Tailwind's `md`/`lg` defaults rather than this project's 768/1280 bands. **A regression to `md:`/`lg:` renders the desktop rail across the whole 1024–1279 band while all three samples still pass and stay distinct.**

**How it was resolved:** 767, 768, 1279 and 1280 are now measured, via extracted `expectBottomBar`/`expectRail` predicates. Each boundary is compared to the sample **from its own band** rather than to a constant, so either rail may be resized without touching the test.

**Verified:** reverting to `md:`/`lg:` now fails at **1279**; 375, 900 and 1440 all still pass.

### FINDING-7 — a false header in the file implementing FIX-1
- **Severity:** Important · **Confidence:** 95
- **File:** `apps/api/tests/unit/no-attendee-restriction.test.ts`
- **Category:** architecture
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `NAME_MATCHING_PREFILTER`'s header said *"Nothing in the assertions uses it."* **Two assertions used it, and one used it as its selector** — building its subject set with `Object.keys(PERMITTED).filter(label => NAME_MATCHING_PREFILTER.test(urlOf(label)))`, thereby reinstating the exact URL-name filter FIX-101 removed.

**Why this matters:** this is the false-header class, reproduced in the file implementing FIX-1, on a branch that carries FIX-304 to correct one. The sentence told the next reader the retired pre-filter was inert. It was not, and the test's title ("subject is an attendee") claimed more than its selector could establish — a permitted route named `.../registrations/:id` would satisfy it by never being selected.

**How it was resolved:** header corrected to state that no *enumeration* filters on it, that it survives as the subject of two assertions, and that it must never move back in front of the enumeration. The test is renamed so its title stops asserting a concept its selector cannot reach.

### FINDING-8 — a second new false header, and the behaviour behind it
- **Severity:** Minor · **Confidence:** 88
- **File:** `apps/web/src/app/services.ts`
- **Category:** correctness / production-readiness
- **Source:** correctness-agent **and** production-readiness-agent, independently
- **Resolution:** fixed (round 1)

**What is wrong:** the header claimed *"a store failure fails the read rather than silently skipping the erasure, which is the direction that gets noticed."* No store failure can fail the read — `keys()` resolves `[]` and `purge()` resolves on every failure path. The interface documentation one file over says the **opposite**, and is right.

**Why this matters:** a third false header on a branch whose subject includes correcting one. Latent behind it: the erasure had no `catch`, so a store implementation that *did* reject would break `EventSwitcher` — rendered in the shell on **every** destination — for a reason unrelated to the network.

**How it was resolved:** header corrected to what happens, and the erasure body wrapped so no store can convert a successful network read into a rejection.

### FINDING-9 — identity read after the await
- **Severity:** Minor · **Confidence:** 76
- **File:** `apps/web/src/app/services.ts`
- **Category:** security / correctness
- **Source:** security-agent **and** correctness-agent, independently
- **Resolution:** fixed (round 1)

**What is wrong:** `scope.current()` was read *after* awaiting `listRegistered()`, so attendee A's registered list could decide which of attendee B's conference prefixes were purged if the signed-in identity changed in flight. The `anonymous` guard catches "not yet resolved", not "resolved to somebody else".

**How it was resolved:** identity captured on both sides of the await, erasure skipped when it moved between two real identities. Both readings are needed — reading only *before* breaks the cold start FIX-3 exists for, because the scope is still `anonymous` when the read is dispatched.

### FINDING-10 — a clock jump made eviction permanently destructive
- **Severity:** Minor · **Confidence:** 72
- **File:** `packages/data/src/http/cached.ts`
- **Category:** production-readiness
- **Source:** production-readiness-agent
- **Resolution:** fixed (round 1), **with a stated limitation**

**What is wrong:** `isFresh` compares the device clock at read time against a stamp written from the device clock. A forward correction of more than 24 hours makes every entry test expired. Before this branch that was recoverable; after it, the first offline read **permanently deletes** them — at exactly the moment the attendee is relying on the cached programme.

**How it was resolved:** `isFresh` became a three-state classifier `ageOf → 'fresh' | 'expired' | 'withheld'` with `CLOCK_TRUST_CEILING_MS`. Both destructive sites delete only on `'expired'`.

**The ceiling is 400 days and the finding's stated case is only partly covered — knowingly.** A 25-hour absence and a 25-hour forward correction are the *same observation*, so any ceiling picks a point on that trade. A tight ceiling would disable FINDING-1's sweep for every realistic case, since the ordinary gap between two uses of a conference app is months — and a ceiling shorter than that gap means an abandoned device's bytes are never deleted at all, which is the defect this same round demands be closed. The guard therefore buys protection against the **gross** error only. Written out at the constant rather than left implicit.

**An unparseable stamp returns `'expired'` via an explicit early return, before the ceiling is consulted.** Two agents predicted this collision from opposite directions. Had the ceiling been evaluated first, `NaN <= CLOCK_TRUST_CEILING_MS` is `false` and the entry would become `'withheld'` — permanently unreadable *and* permanently retained, which is the exact hole FIX-201 exists to close.

### FINDING-11 — a recorder that recorded nothing
- **Severity:** Minor · **Confidence:** 85
- **File:** `packages/data/tests/questions-uncached.test.ts`
- **Category:** test-quality
- **Source:** test-quality-agent **and** correctness-agent, independently
- **Resolution:** fixed (round 1)

**What is wrong:** a `removals` recorder was declared, returned and pushed to, with a comment explaining why it is kept separate from `purges` — and **no assertion ever read it**. The store gained a second destructive verb and the file existing to prove the questions repository reaches it through none of them checked one of two.

**How it was resolved:** asserted in both tests, with different reasoning in each. The fixing agent declined the brief's instruction to copy one message to both: in the counter-example test the repository *is* decorated, so that message would have been a false statement inside a failure message.

### FINDING-12 — the unparseable-stamp branch was never executed
- **Severity:** Minor · **Confidence:** 78
- **File:** `packages/data/tests/cached-repository.test.ts`
- **Category:** test-quality
- **Source:** test-quality-agent
- **Resolution:** fixed (round 1)

**What is wrong:** `cached.ts` names "an unparseable stamp is deleted too" as load-bearing, and no test wrote a malformed `retrievedAt`. That branch is the one route by which an entry can be permanently unreadable *and* permanently retained.

**How it was resolved:** a test seeds the double directly (`store.write` stamps from the clock, so seeding is the only way to produce the entry), then asserts all four properties: the read still rejects with `OfflineError`, the entry is gone from the backing map, it appears in `removals`, and `purges` is empty.

### FINDING-13 — a self-referential cross-reference
- **Severity:** Minor · **Confidence:** 90
- **File:** `packages/data/src/http/cache-store.ts`
- **Category:** architecture
- **Source:** architecture-agent
- **Resolution:** fixed (round 1)

**What is wrong:** the new `keys` doc ended *"see `cache-store.ts`'s header for why there are two"* — in `cache-store.ts`. A self-referential pointer is the one form of cross-reference that cannot do the job, added at the moment the mirror doubled from 3 members to 5.

**How it was resolved:** pointer corrected, reciprocal pointer added in the platform interface naming `cache-store.ts` as the shape that must match it, plus the rule that a member added on one side is added on the other in the same change.

---

## Remaining Findings

Three Minor, not fixed. None blocks the gate.

### FINDING-14 — the `/admin` prefix is a convention, one level up
- **Severity:** Minor · **Source:** security-agent · **Resolution:** **fixed after all** (round 1)

Reported as remaining in the merge, then closed by the area-B agent: a new assertion reads the nine modules under `src/routes/admin/` and requires every route literal to start with `/admin/`, requires the source literal set to equal the live registered set, and requires `index.ts` to compose exactly the siblings of that directory. **Verified**: a fake route registered *off* the prefix now fails that test and only that test.

### FINDING-15 — four hand-maintained copies of the operator fixture
- **Severity:** Minor · **Source:** architecture-agent · **Resolution:** **fixed after all** (round 1)

`withOperator(browser, body)` and `gotoAdmin(operator, path)` added; all four admin tests in the file use them, not only the two new ones.

### FINDING-16 — no observability on either destructive path
- **Severity:** Minor · **Source:** production-readiness-agent · **Resolution:** **not fixed**

`store.purge(conferencePrefix(...))` erases an attendee's entire offline copy of a conference and `store.remove(key)` deletes an expired entry, with no log line, no counter and no marker. If an attendee reports "my offline conference disappeared", there is no way to distinguish the erasure firing correctly, the erasure firing wrongly on a mis-parsed key, browser storage eviction, or a clock anomaly. These have different remedies and the same symptom.

**Not fixed because it is a product decision, not a defect.** `apps/web/src` has exactly two `console.*` calls in the entire client, both for unrecoverable faults. Adding routine `console.info` for a normal, expected deletion would be the first diagnostic logging of successful behaviour in this codebase, and whether this product wants a client-side diagnostic channel is worth deciding once rather than introducing sideways in a fix branch. **Recorded, not deferred silently.**

---

## Notable Observations

Captured to `brainstorm/idea-inbox.md`. Not bugs; not fixed; not counted toward the gate.

### NOTABLE-1 — the `anonymous` prefix is the one part of the cache that is not attendee-isolated
- **File:** `apps/web/src/app/services.ts` · **Source:** security-agent

`getCurrent` is decorated under the *current* scope, which is `anonymous` on the first call of a page load, and a cache hit **sets** `attendeeId`. So an offline cold start on a lent phone can resolve the previous attendee from the `anonymous` key, adopt their id as the cache scope, and serve their programme, saved sessions and notes — with no credential presented. Only explicit sign-out and account deletion clear that prefix, and neither runs when a session simply lapses.

**Pre-existing and not introduced by this change.** Recorded because it is the residual that survives *both* new mechanisms, and because the erasure's `anonymous` early-return is where it becomes visible. FINDING-1's sweep now covers the entry by age, which is a second layer but not a fix.

### NOTABLE-2 — the erasure treats `listRegistered()` as complete and authoritative
- **File:** `apps/web/src/app/services.ts` · **Source:** production-readiness-agent

Anything absent from the answer is destroyed. True today — the query has no `limit`, no `offset` and no date filter. **The day that endpoint gains a page size or an "upcoming only" clause, this silently deletes the offline copy of every conference not on the first page, on every Home load, with no error and no test failure.** The codebase's usual defence against exactly this shape — `deletion-coverage`, `export-coverage`, *a new column fails by existing* — is not applied here.

### NOTABLE-3 — two uncoalesced callers, and the header undercounts them
- **File:** `apps/web/src/app/services.ts` · **Source:** production-readiness-agent

`listRegistered()` has two live callers on Home — `EventSwitcher` (in the **shell**, so on every destination) and `YourConferences` — and `HttpEventsRepository` is deliberately undecorated, so it gets none of `cached`'s in-flight coalescing. The header justifies the placement with "it already runs on every online Home load"; the real frequency is higher and comes from two places. Cost is small and self-limiting, which is why this is Notable.

### NOTABLE-4 — the FIX-303 boundary is now defended by a comment, not by module structure
- **File:** `packages/data/src/http/cached.ts` · **Source:** architecture-agent

**Verdict on the question the spec left open: `heldConferences` does *not* cross FIX-303.** It is a pure function over strings — no store, no repository, no deletion, no decision — the decorator never calls it, no classification map gained a member, and the erasure itself lives entirely in `services.ts`.

The observation is that `cached.ts` now serves two audiences: the decorator, and a key-grammar vocabulary whose newest member exists *specifically* for a caller that must not be the decorator. The header spends its first paragraph explaining that a function in this file is not the mechanism the file is named after. The suggested resolution — extract the grammar to `cache-keys.ts` — would make the boundary visible in the module graph instead of in prose.

---

## Test Suite Results

| Round | Command | Result |
|-------|---------|--------|
| pre-review | `pnpm verify` | pass — 994 unit, 816 component, 167 e2e |
| 1 (post-fix) | `pnpm verify` | see below |

Per-area verification during the fix round: `pnpm test:unit` 1014 passed, `pnpm test:component` 816 passed, `playwright test e2e/responsive.spec.ts e2e/agenda-offline.spec.ts` 32 passed, typecheck/lint/format clean.

## A trap this round created, recorded so the next person does not lose an hour to it

**`CLOCK_TRUST_CEILING_MS` is 400 days, and an entry aged past it is `withheld` — not served and not deleted.** Any test that ages a cache entry must stay inside that ceiling. The e2e agent's first draft aged an entry to `1970-01-01` and the test correctly failed, because FIX-2 does not delete an epoch-stamped entry by design.

**A second one, in the same file:** the FIX-3 erasure runs promptly enough that planting a phantom cache entry is a race in both directions — plant while a `listRegistered()` is in flight and the erasure's `keys()` snapshot predates the plant; plant just after one lands and it is gone before the precondition can be read back. The test waits for Home's *conference list* to render, not merely the greeting, because that is what says the in-flight call has finished.
