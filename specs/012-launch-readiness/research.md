# Phase 0 Research — 012 Launch Readiness

**Date**: 2026-08-16
**Method**: five parallel research agents over disjoint areas. R5 did not analyse — it installed WebKit and Firefox and ran the sweep against a real build, a real API and a throwaway database. Findings marked *measured* are from that run.

---

## R1 — The scenario inventory

**Decision**: the inventory is **122 scenarios across 13 features**, **74 outstanding walk units**, and **90 unaccounted** under SC-1202's wording. The script is derived from the 74, and 002's and 004's 18 need an explicit disposition.

**Rationale**: both figures in the spec were confirmed exactly (122 total, 72 by task status) — and both were incomplete.

- **Five walk sections carry no number** and are invisible to any scenario count: 005 `## Responsive and accessibility`, 006 `## Part 1` and `## Part 4`, 008 `## Offline` and `## Layouts and accessibility`. 008's two are outstanding, so the walk backlog is **74**, not 72.
- **002 and 004 have no walk task at all.** Not open, not complete — absent. SC-1202 says "whose feature task is not marked complete"; 18 scenarios have no task that could ever be marked. Outstanding under the criterion's plain reading, invisible under its intended one.

**Three scenarios carry false expectations and will manufacture defects if walked verbatim**:

| Scenario | Expects | Reality |
|---|---|---|
| 001/5 step 2 | icons "visibly provisional" | replaced by 010's real mark |
| 008/1 step 3 | "A's own Network is **unchanged**" | C1 made exchange mutual — the opposite |
| 010/5 step 2 | the coral-on-navy board mark | 016 ships `new-logo.png`; entry 28 records the divergence |

**Two steps will fail before the walk begins.** 006/3d and 011/8 both walk backup-and-restore. `OPERATIONS-LOG.md` already records: *"No backup has ever been taken on this host, and `backup.sh` cannot run"* — `BACKUP_DIR` empty, no cron, `./backup.sh status` dying because an unquoted RFC 5322 `MAIL_FROM` has its `<`/`>` parsed as shell redirection, and `backups/` root-owned while the script runs as `azureuser`. **Standing decision 17 makes daily automated backups a governance obligation**, so this is a breach rather than a gap.

**One blocker has NOT lifted**: 011 scenario 9 needs `AZURE_CREDENTIALS`, unset pending a service principal. CI has never deployed anything. Steps 1–4 of that scenario stay blocked; steps 5–7 are walkable.

**Blockers that HAVE lifted**: 006's Part 3 (3a–3e) was blocked on *"there is no environment to deploy to"* — **011 built it**. 013's scenario 3 deployment half is newly walkable. 016's scenario 6 was blocked on v5.1.0, now ratified.

**"Three widths" is asserted in 13 places at six mutually inconsistent triples.** The automated sweep uses a seventh (375/900/1440); this spec named an eighth. **The script picks one and records why.**

**Twelve duplicate classes identified** (D1–D12). The sharpest is D10: the "two browser profiles, not two tabs" prerequisite is re-established from scratch six times, and 007's version contains a push/incognito trap the other five omit — which is FR-1110's justification made literal.

**Sixteen seam candidates** (S1–S16), the SC-1211 raw material. Highest value:

- **S2** — delete one attendee who is simultaneously an organizer, a contact, a conversation participant, a question author, a place-holder and a report subject. Every feature tests its own cascade against a fresh single-purpose attendee; **nobody has ever constructed one holding all six**, and the interacting parts are exactly the hand-written ones.
- **S6** — the offline cold start with no credential. **No scenario in any quickstart walks it**, which is why the disclosure survived.
- **S8** — create a conference from zero as an organizer and have a real attendee join it. Every 014 scenario authors into a *seeded* conference; decision 47's create capability is exercised end to end by nothing.
- **S13** — an administrative edit through a real browser's CORS preflight. `fastify.inject()` performs none, which is how `PATCH` went missing while every route test passed.
- **S15** — throttling meets the walk itself. A consolidated walk will trip `report_submit`, `card_share` and sign-in allowances in the ordinary course, and no scenario tells the walker how to distinguish a throttle from a defect.

**Retirement candidates**: ~9 retire outright (014/5, 016/9, 010/1–4, 006 Parts 1 & 4, 002/8). **Do not retire anything whose subject is position, size, colour, legibility or copy** — `e2e/responsive.spec.ts` is far stronger than expected (per-container `scrollWidth`, admin dialogs, three admin layouts, 200% zoom, the mark at every width) **and still cannot see either defect a human found.**

---

## R2 — Decoupling the operator credential

**Decision**: a **separate additive command** (`pnpm admin:seed-operators`) that inserts the committed `SEED_OPERATORS` if absent, clears nothing, and creates no credential.

**Rationale**: `operatorSeed.run` is the only code that inserts an operator row, and it is reachable only through `seed()`, whose first act is an unconditional reverse `clear` walk beginning with `attendeeSeed.clear`.

**Alternatives considered and rejected**:

- **`pnpm db:seed --only operators`** — *rejected.* It makes the coupling opt-out rather than removing it, and FR-1102 says removed. Worse, `operatorSeed.clear` deletes `admin_audit_entries`, `report_resolutions` and `organizer_assignments` — so the command that exists to avoid destroying attendee data destroys the **accountability record** instead, including entries FR-994 requires to commit with the acts they explain. It appears to work today only because those tables are empty on UAT. It also re-arms the `NO ACTION` hazard: the reverse-clear walk is what makes `DELETE FROM events` legal at all.
- **`bootstrap` creates the identity if absent** — *second choice, not wrong.* Costs the `no-such-operator` outcome, which two scripts read, and merges "bring a principal into existence" with "set its secret". Honest note: the guard it would rewrite is already weaker than it reads — anybody who can set `ADMIN_BOOTSTRAP_PASSWORD` has shell and database access, and the runbook already documents inserting an operator row by hand.
- **Make the seed additive** — *rejected*, foreclosed by the runbook: *"This cannot be made additive without redesigning the seed, and nothing asks for that."*

**The trap inside the recommendation**: `operatorSeed.run` ends with a **table-wide** self-check that no operator has a credential. Reused as-is it throws on any database where one already exists — which is every database this command serves. It must be narrowed to the rows the call inserted.

**Three things the record did not carry**:

- **A re-seed *does* reset a committed operator's chosen credential.** FR-993 is satisfied only in the narrow sense that the *bootstrap command* never resets.
- **A re-seed also destroys the administrative audit trail** and every organizer assignment.
- **`bootstrap.ts:82` cites FR-902** (the organizer rule). The operator rule is **FR-901**. The test file inherited the wrong number.

**The false claim is in four places, not one**: `bootstrap.ts:24-27`, `db/seed/operators.ts:29-32`, `deploy/vm/README.md:215-216`, `013/quickstart.md:55-58`. FR-1102a names only the first — repairing one and leaving three is exactly the 016/FR-1052 failure the requirement invokes.

---

## R3 — The `anonymous` prefix disclosure

**Decision**: **do not cache `getCurrent`**, declared in `passThrough` rather than by omission. **The offline cold start is lost, and that is an owner decision taken 2026-08-16.**

**Rationale**: the disclosure splits into four cases and only two are cache defects.

| Case | Offline today | Online today |
|---|---|---|
| Phone lent, session still valid | discloses | **discloses — identical** |
| Session revoked elsewhere | **discloses** | refuses and purges |
| Cookies cleared, IndexedDB kept | **discloses** | signed-out |
| Session idle-expired ≥14d | already expired | signed-out |

**Row 2 is the one that matters.** `cached.ts` already classifies that case as *"a genuine authorization bypass"*, and its existing fix works online and **cannot** work offline, because the revocation is a server fact and no server is present. Row 1 is not a cache defect — it is "they did not sign out", equally exposed online.

**The cost, accepted rather than hidden**: an installed PWA launch is a fresh document every time, so *"arrive at the venue with no signal, open MyNet, read the programme"* stops working. The degraded state is already built and already worded correctly. **This narrows the field reading of FR-215 and is recorded as a decision under FR-1131.**

**Alternatives rejected**: purge at sign-in (does not address the case — sign-in needs a connection, and SC-1207's scenario has nobody signing in); re-key once identity resolves (impossible — an offline start cannot look under an id it does not know); require a credential (the session cookie is `httpOnly` and unreachable from JavaScript, and on a lent phone it is physically present anyway); a session-presence marker cookie (closes row 3 only, leaves row 2 open); shorten the lifetime (bounds, closes nothing).

**The structural finding**: offline, the device owner and a stranger holding the device are **indistinguishable to the client**. The mechanism that makes the owner's cold start work *is* the mechanism that discloses.

**A second defect, folded into scope**: `identity.forget()` is called only from sign-out and account deletion. A session that merely **expires** leaves the scope resolved to the previous attendee — so a second person signing in in that same document has their identity written to the **first person's** cache prefix, where the first person's sign-out purge will never run.

**FR-1140a — the comment named in the spec is not the worst.** Three of the most load-bearing carry the false premise *in other words*, with no "anonymous" and no requirement number, so both greps miss them. One of them **argues for the defect** and is the sentence a later change would cite to revert the fix. `e2e/agenda-offline.spec.ts` will fail under the fix and must be restructured in the same change.

**Testing**: one e2e plus one source-level tripwire. Every cheaper layer fails for a stated reason — the subject is what survives a **document boundary**, and jsdom has neither half. Seven traps named, the primary being that without awaiting the service worker the offline reload serves no application at all and the test passes vacuously.

---

## R4 — `listRegistered` completeness

**Decision**: a compile-time binding in `contract.ts`, plus a route-schema unit test, plus one integration case. Reject the runtime heuristics.

**Rationale**: four distinct break modes, and **no single mechanism reaches all four**.

| | Break | Caught today |
|---|---|---|
| A | Response gains an envelope | **Yes, accidentally** |
| B | `limit`/`offset` with a server default | No |
| C | Hardcoded `.limit(N)` | No |
| D | "Upcoming only" date predicate | No |

**The finding that matters**: `contract.ts:69`'s `Satisfies<EventsResponse[number], Event>` indexes with `number`, which only typechecks while the response is an array — verified against the repo's own TypeScript (`error TS2537`). So break mode A **already fails the build**, and **nothing records that this line serves that purpose.** A refactor "tidying" it would remove the erasure's only existing protection with every test green.

**D is the most likely** — "only show conferences that haven't ended" is a plausible product request nobody would connect to a cache — and it is the one no regex can catch. Covered behaviourally instead, using the existing `moveEvent` helper.

**Rejected**: a client-side plausibility threshold (converts a silent over-delete into a silent under-delete, and **015 is registration management**, so any threshold tuned against self-serve withdrawal today is tuned against the wrong population tomorrow); a server-declared total (destroys the accidental guard above and institutionalises the shape it forbids).

---

## R5 — WebKit and Firefox — *measured*

**Decision**: declare all three projects; restrict WebKit and Firefox to the layout sweep. **Fix the Messages defect inside 012** (owner decision, 2026-08-16).

| | responsive + first-viewport (30) | time |
|---|---|---|
| chromium | **30/30** | 119.8s |
| firefox | **30/30** | 123.8s |
| webkit | **24/30** | 123.9s |

**Safari users cannot open Messages.** All six WebKit failures are one root cause: `GET /conversations` is issued and never answered. Every other API call in the same page load returns 200; `curl` answers the route in 6ms. The destination sits at `Loading…` forever with the shell rendered around it — and cannot recover, because `Messages.tsx` has **no first-load effect**; the initial read *is* `usePoll`'s first tick. Prime suspects: the hand-written service worker's fetch interception under WebKit, and the cross-origin credentialed read.

**Firefox costs nothing**: zero source changes, zero failures, 1.03× the time.

**The Chromium-specific-assumption survey came back empty.** Push, install detection, `grantPermissions`, clipboard, `devices[...]`, `Intl` — zero occurrences in `e2e/`. 007's notification tests were never e2e; they live in jsdom and are unaffected. Measured: scrollbar width 0 on all three, identical UA `dialog` `max-width`, `overflow-x: clip` / `:has()` / `:focus-visible` supported everywhere — so the ±2px centring tolerance and the zero-tolerance overflow assertions all held.

**The real cost is shared state, not engines.** `globalSetup` seeds once per invocation, so three projects means every spec runs three times against one database. Four suites break on the second pass (`enrolment`, `authoring`, `messages-journey`, `session-qa` — duplicate conference names with no unique constraint, non-timestamped message bodies, and a `question_ask` throttle that never settles successes). `responsive.spec.ts` and `first-viewport.spec.ts` are repeat-safe, verified by running them twice — which is why restricting the extra engines to the layout sweep sidesteps every breakage.

**`context.setOffline(true)` plus any navigation throws in WebKit.** Chromium and Firefox both serve the precached shell. This rules the offline suites out of WebKit regardless.

**Two latent false-greens, on Chromium too**: both offline helpers wait on `navigator.serviceWorker?.controller !== null` — on an engine without `serviceWorker`, `undefined !== null` is **true** and the wait resolves instantly; and the IndexedDB helpers resolve silently on error, so their assertions pass vacuously.

**Nine e2e tests have never run in CI.** The workflow derives its list with `ls e2e/*.spec.ts | grep -v 'accessibility\.spec\.ts$'`. The `$` anchor also excludes `admin-accessibility.spec.ts` (4 tests), and `ls e2e/*.spec.ts` does not glob subdirectories, so `e2e/accessibility/identity.spec.ts` (5 tests) is matched by neither job.

**Config traps**: a project-level `testMatch` **overrides** the top-level one, so the `CAPTURE_SCREENSHOTS` switch needs a guard or a capture run silently executes the sweep twice. Use `Desktop Firefox`/`Desktop Safari`, never a mobile descriptor (`isMobile` is unsupported in Firefox and throws at context creation). Pin `deviceScaleFactor: 1` on WebKit — the descriptor ships `2` and the sweep asserts to ±1px.

**CI**: one job, one build, one seed, +2 min per engine — `test-e2e` goes ~7.5 → ~11.5 min. **Do not add a separate job**: `verify` and `verify-push` hard-assert a job count of 10 and say in their own error text that it *"must not move again without an amendment."*
