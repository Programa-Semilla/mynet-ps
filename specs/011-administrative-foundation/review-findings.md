# Deep Review Findings — 011 Administrative Foundation

**Date:** 2026-08-11 · **Branch:** `spec/011-administrative-product`
**Rounds:** 1 · **Gate Outcome:** PASS with deferrals (see Remaining) · **Invocation:** manual

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 1 | 1 | 0 |
| Important | 21 | 11 | 10 |
| Minor | 25 | 3 | 22 |
| Notable | 2 | – | 2 |
| **Total** | **49** | **15** | **34** |

The Important count includes one **suite-level finding raised during the fix round** rather than by
an agent — see "Suite-level finding" below. It is unfixed.

**Agents completed:** 5/5. **External tools:** CodeRabbit and Copilot both skipped — CLI not
installed. That is worth stating rather than glossing: this review is five internal perspectives
with no external cross-check.

49 raw findings deduplicated to 48. Stage 1 (spec compliance, `review-code.md`) scored 100%.

### Convergence — the strongest signal here

| Finding | Independently found by |
|---|---|
| `pruneAdminSessions` is never called | **4 agents** (correctness, architecture, security, production-readiness) |
| `appendAuditEntry` takes no transaction | **3 agents** (correctness, architecture, security) |
| FR-918's uniqueness check is unwired | **3 agents** (architecture, security, test-quality) |
| `ADMIN_*` never reaches the container | **2 agents** (production-readiness, security) |
| `AdminDialog` duplicate DOM id | **2 agents** (correctness, architecture) |
| `assertVerifiedOperator` unused | **2 agents** (architecture, security) |

Every finding I verified independently before acting on it was accurate.

---

## The theme

**Comments in this codebase assert mechanisms that do not exist.** Not stale comments about
renamed variables — load-bearing claims about transactions, guards and sweeps, in a repository
where the comment *is* the design record and a reviewer is expected to trust it. Four of the six
converged findings are of this shape:

- `appendAuditEntry`: *"Callers pass their transaction when they have one, and every write path
  does"* — no caller does.
- `addressTakenByOtherPrincipal`: *"both insert paths check the other table inside their
  transaction"* — neither does; only tests call it.
- `pruneAdminSessions`: *"a second line against accumulation"* — nothing calls it, so it is no
  line at all.
- `pruneDeactivatedOperators`: *"checked against both referring tables"* — there are three.

Stage 1 could not see any of this. It verified that each requirement had an implementation and a
test; it could not see that the implementation's stated mechanism was absent, or that the test
exercised a helper no request reaches.

---

## Fixed (15)

### FINDING-1 — Critical — the feature could not be brought into service at all
- **File:** `deploy/vm/docker-compose.yml`
- **Source:** production-readiness (also: security) · **Resolution:** fixed

**What was wrong.** The `api` service's `environment:` block named none of the four `ADMIN_*`
values, and there is no `env_file:`. Compose reads the sibling `.env` for `${...}` interpolation
into the compose file — it does not inject it into containers.

**Why it matters.** `.env.example` documents all four and `README.md` gives the bootstrap command.
The operator fills them in, runs the command, and it exits 0 having done nothing: `loadConfig` sees
`undefined`, the bootstrap returns `not-configured`, and a seeded operator — whose `password_hash`
is null by design (FR-990) — remains unable to sign in **forever**. No report queue, no promotion,
no moderation, on UAT or production. The two session bounds fail more quietly: silently ignored,
code defaults applied, an operator believing a cap that is not in force.

Every gate passed because every test spawns a local API that inherits `ADMIN_*` from `.env.local`.
Nothing exercises the container's environment.

**Resolved.** All four added with the same `${VAR:-default}` shape as their neighbours.
`ADMIN_ORIGIN` deliberately left out — it must stay unset in deployed environments.

### FINDING-2 — Important — `/admin/*` CORS named the attendee origin
- **File:** `apps/api/src/app.ts:142`, `deploy/vm/Caddyfile` · **Source:** security

**What was wrong.** One global allow-list — `[webOrigin, adminOrigin]`, collapsing to `webOrigin`
alone in every deployed environment since `ADMIN_ORIGIN` is unset there. So the one origin
permitted to read `/admin/*` responses was the **attendee** origin, and the administrative origin
was not on the list at all.

**Why it matters.** `admin.<host>` is *same-site* with the apex — that is decision 37's whole point
— so `SameSite=Lax` still sends the administrative cookie on a cross-origin `fetch` from the
attendee document, and with `credentials: true` and the apex echoed back, the response was
readable. One XSS on a public, self-sign-up product with unmoderated attendee-uploaded avatars
reads the report queue: reported private message content, the third recorded Principle VIII
exception. Separately the apex Caddy block proxied `/api/*` unconditionally, so the administrative
API existed on the attendee host and `POST /api/admin/session` would plant the admin cookie there.

**Resolved.** CORS is now per route prefix via the delegator form: administrative routes permit
`adminOrigin` only, which is `false` in deployed environments (no `Access-Control-Allow-Origin`
at all). Same-origin requests are unaffected, so the deployed product works with an empty
allow-list. The apex Caddy block answers `/api/admin/*` with 404.

### FINDING-3 — Important — the reporter chose what the operator was shown
- **File:** `apps/api/src/db/queries/admin-reports.ts` · **Source:** security

**What was wrong.** `message_ids` and `question_ids` are written verbatim from the reporter's
request body; `POST /reports` validates only UUID shape. `findReport` then selected content by id
alone — no authorship condition.

**Why it matters.** A reporter could name Bob as the subject while listing message ids from their
conversation with **Carol**, and the platform tier would be shown Carol's private words under a
report about Bob, with Carol a party to nothing and the operator unable to tell. FR-942's bound was
client-supplied. The existing FR-942 test bounds disclosure *downward* (nothing adjacent); nothing
bounded it *sideways*.

**Resolved.** Content must have been authored by the reported attendee. Ids failing it land in the
existing `contentAvailable: false` state — no new state, no new shape. **Mutation-verified**:
removing the authorship clause reproduces the disclosure and fails the new test.

### FINDING-4 — Important — the admin cookie was never re-issued
- **File:** `apps/api/src/admin/session.ts`, `require-operator.ts` · **Source:** correctness

**What was wrong.** The cookie was issued once at sign-in with `maxAge = 30 min` and never again,
while `resolveAdminSession` advanced `idle_expires_at` on every request.

**Why it matters.** The server believed in a sliding window and the browser did not: it discarded
the cookie 30 minutes after sign-in however continuously the operator worked. So the idle window
did not slide where the operator experiences it, and the **8-hour absolute cap became unreachable**
— the bound that is the entire reason there are two.

**This is a correction to work done earlier in this same session.** The T050 test I wrote asserts
the *database columns* move and passes, because `app.inject` models no browser and no cookie
lifetime. I described it as the highest-value gap I had found and mutation-verified it; it verifies
the half that worked and misses the half that did not.

**Resolved.** `refreshAdminSessionCookie` is called from the shared guard, clamped to whatever
remains of the absolute cap so the browser copy can never outlive the server bound. Two new
integration assertions cover re-issue and clamping.

### FINDING-5 — Important — sign-out was refused during forced replacement
- **File:** `apps/api/src/admin/require-operator.ts` · **Source:** correctness

**What was wrong.** The FR-992 gate admitted only `/admin/session/credential`, and
`DELETE /admin/session` carries `requireOperator` — so sign-out answered 403 for exactly the
operators forced onto the replacement screen.

**Why it matters.** The "Sign out instead" control never reached `revokeAdminSession`: the session
row stayed live and the cookie stayed set while the client cleared its own state, so reloading
returned straight to the replacement screen still authenticated. FR-919 fails for the one state
every new operator passes through.

**Resolved.** Sign-out is admitted, matched on method as well as address. Safe because ending a
session discloses nothing and grants no capability — FR-992's concern is an initial credential
reaching a surface that *acts*. New integration test asserts both the 204 and that the token is
genuinely dead afterwards.

### FINDING-6 — Important — `operator_sessions` had no retention at all
- **File:** `apps/api/src/maintenance.ts`, `admin/session.ts` · **Source:** 4 agents

`pruneAdminSessions` was written, documented as "a second line against accumulation", and called
from nowhere. The cascades it deferred to reach almost nothing: an operator is never deleted in
normal operation, so their session rows had no clock whatsoever. **This reproduces the exact defect
`maintenance.ts` was created to fix** — its header records `pruneAttempts`/`pruneSessions` having
existed with nothing calling them. Registered in `RETENTION_SWEEPS` with a stated window; the false
comment corrected.

### FINDING-7 — Important — the operator sweep raised, silently, forever
- **File:** `apps/api/src/db/queries/operators.ts` · **Source:** correctness, test-quality

`pruneDeactivatedOperators` skipped operators named by `admin_audit_entries` and
`report_resolutions` — but not by `organizer_assignments`, whose `assigned_by` is `NOT NULL` and
`NO ACTION`. Any deactivated operator who had ever promoted anybody made the `DELETE` raise. Because
`maintenance.ts` logs a failing sweep and continues, the failure was silent and the row would never
be removed. Third `notExists` added; new integration test asserts the sweep *completes*, since the
defect was an exception rather than a wrong count. Nothing in the suite executed this function
before.

### FINDING-8 — Important — duplicate DOM id gave dialogs the wrong accessible name
- **File:** `apps/admin/src/app/shell/AdminDialog.tsx` · **Source:** correctness, architecture

`aria-labelledby="admin-dialog-title"` and `<h2 id="admin-dialog-title">` were literals, and
`ReportDetail` mounts both dialogs simultaneously. `aria-labelledby` resolves to the first match in
document order, so a screen-reader user confirming an irreversible question removal was told the
dialog was "Record a resolution". Now `useId()`. Invisible to component tests (one dialog at a
time) and to axe (the reference resolves to a valid node — the wrong one).

### FINDING-9 to FINDING-15 — test-integrity fixes

- **`admin-sign-in.test.ts` `beforeEach` was missing `report_resolutions` cleanup** — the only one
  of eight admin suites without it. `resolved_by` is `NO ACTION`, so a resolution left by a
  preceding file makes `delete(operators)` raise, naming neither of this suite's fixtures. **This
  is the failure I hit during verification earlier and misdiagnosed as contamination from my own
  partial test run.** The agent's explanation is correct and mine was not: whether the file passes
  depends on execution order, and Vitest orders by file size, so adding lines to any test can
  reorder it.
- **`e2e/admin-moderation.spec.ts` absence assertions could settle before the panel loaded** —
  `toBeHidden()` and `toHaveCount(0)` both pass instantly against zero elements, which is the
  panel's state while "Loading questions…" renders. The load-bearing SC-903 assertion would have
  passed even if the removal had done nothing. **Also my own work, written an hour after I fixed
  the identical race in `messages-journey.spec.ts`.** Positive loaded-state anchor added.
- **Stale comment in `admin-bootstrap.test.ts`** claiming `/admin/me` is reachable during forced
  replacement, directly above an assertion that it returns 403 — a leftover from the D8 fix.
- Plus the three new tests described above (provenance, cookie re-issue + clamp, sign-out) and the
  sweep test.

---

## Post-review pass — the deferred findings were taken to the owner and closed

**Dated 2026-08-11, after the review above.** The nine deferred Important findings were the
subject of an explicit decision round rather than being carried into the merge. Eight are now
fixed; one is accepted with its reasoning recorded. The four test-coverage gaps are closed too.

**The review's own framing of findings 1, 2, 3 and 5 was incomplete, and the correction is the
useful part of this pass.** They were listed as four separate deferrals. They are one defect:
**four functions whose emphatic headers describe call relationships that do not exist.**

| Function | The header claimed | The reality |
|---|---|---|
| `appendAuditEntry` | *"callers pass their transaction … and every write path does"* | **zero** of five did |
| `assertVerifiedOperator` | *"called at the query layer, not only at the route"* | called nowhere |
| `addressTakenByOtherPrincipal` | *"CALLED INSIDE THE CALLER'S TRANSACTION"* | called only by tests |
| `revoke*` / `pseudonymise*` | *"in the caller's transaction"* | dead; SQL inlined in `account.ts` |

In a codebase whose stated discipline is that the comment is the record, that is a systemic
finding rather than four local ones — and it made the fixes cheaper than the review estimated,
because **three of the four already had the executor parameter**. The work was wiring, not design.

Two further corrections to the review's reasoning:

- **`assertVerifiedOperator` was not a design decision.** `assertVerifiedScope` is called at the
  query layer in five modules and `assertVerifiedParticipation` in two. Wiring the fourth followed
  uniform precedent; the review presented it as a choice between a refactor and a deletion.
- **The helpers could not simply be deleted.** `audit-append-only.test.ts` asserts
  `pseudonymiseAuditEntriesFor` **exists** and holds the permitted-mutation list at exactly two
  names, so deleting it breaks a guard and moves a retention operation out of the module that owns
  it. They were **called** instead, which removes the duplication the finding was actually about.
  `account.ts`'s inline justification — *"this must commit with the withdrawal or not at all"* —
  was false: the helper takes a `tx` precisely so it can.

### What changed

| # | Finding | Outcome |
|---|---|---|
| 1 | `appendAuditEntry` not transactional | **Fixed.** All five write routes wrap query + entry in one transaction. Guarded twice: a source assertion in `admin-audit-completeness.test.ts` (mutation-verified) and a behavioural rollback test in `admin-audit-atomicity.test.ts`. |
| 2 | FR-918 unenforced | **Fixed.** Wired into `createAccount` *and* the operator seed. Refusal is the same 409 an attendee-held address gives, so sign-up is not an oracle for administrative accounts. |
| 3 | `assertVerifiedOperator` never called | **Fixed.** Ten administrative queries now take a branded scope and assert it. Removed an `as string` at the `listConferences` call site as a side effect. |
| 4 | Report queue unpaginated | **Accepted.** Reasoning in `deviations.md` D10. A bare `LIMIT` was explicitly rejected — silent truncation of a safety queue is worse than a slow one. |
| 5 | Dead duplicate helpers | **Fixed** by calling them, not deleting them — see above. |
| 6 | Two FKs without covering indexes | **Fixed.** `0009` regenerated (it had reached no database, so this was safe exactly once). Diff against the previous file is those two `CREATE INDEX` lines and nothing else. |
| 7 | `0009` sets no `lock_timeout` | **Fixed in the runner, not the SQL.** `migrate.ts` now connects with `lock_timeout` as a startup parameter — which survives regeneration and covers **every** migration, including `0003`'s recorded unclaimed defect. |
| 8 | No route-level `admin_sign_in` throttle test | **Fixed.** `admin-sign-in-throttle.test.ts`. Mutation-verified: deleting the `recordAttempt` call turns it red. |
| 9 | `admin-audit-completeness` vacuous fallback | **Fixed.** Route→module derivation is now by URL literal with **no fallback**; an unmatched route is itself a failure. |
| 10 | No horizontal-overflow test for admin | **Fixed.** `responsive.spec.ts` sweeps all four destinations at all thirteen `SCROLL_WIDTHS`. `ADMIN_DESTINATIONS` moved to `support/destinations.ts`, making the "declared once" claim true. |
| 11 | 011's sweeps have no behavioural test | **Fixed**, and it found something — see below. |

### What finding 11 turned up

Writing the audit sweep's first behavioural test exposed a discrepancy nothing else would have:
`maintenance.ts` declares the window as *"365 days after pseudonymisation"* and `admin-audit.ts`
says the clock "starts then". **The predicate measures `occurred_at`.** An entry written 400 days
ago and pseudonymised *yesterday*, because that is when the attendee exercised erasure, is swept on
the next hourly pass rather than a year later.

Not fixed, because the correct fix is a `pseudonymised_at` column and therefore a decision about
the retention rule rather than a review repair. Recorded in `deviations.md` D11, and
`retention-sweep.test.ts` pins the shipped behaviour with a message saying in so many words that it
encodes current rather than desired behaviour.

---

## Remaining — not fixed, with reasons

**Superseded above for findings 1–11.** What follows is the original record as written at the
review gate, kept because the reasoning for each deferral is what the decision round acted on.

### Deferred because the fix is a design decision (owner's call)

1. **`appendAuditEntry` is not transactional** (3 agents). A failing audit insert leaves the act
   committed and unrecorded — FR-994's stated guarantee. **Both fixes are substantial and
   opposite**: thread a transaction through all five write paths (changing four query signatures),
   or correct the comment and accept the failure mode. The second is a weakening of a written
   guarantee and needs a decision, not a patch.
2. **FR-918's uniqueness is unenforced** (3 agents). `addressTakenByOtherPrincipal` is called only
   by tests. Wiring it into `createAccount` changes **attendee sign-up** — a shipped 004 path — so
   an attendee could be refused an address because an operator holds it. That is what FR-918 asks
   for, but it is a behaviour change to another feature's route and deserves to be decided
   explicitly.
3. **`assertVerifiedOperator` is never called** (2 agents). The fourth branded scope has neither
   property the other three have at the query boundary. The fix is either threading scopes through
   every administrative query (a real refactor) or deleting the function and correcting a 60-line
   header claim. Design decision.
4. **The report queue is unpaginated.** Every row, open and resolved, on every load. Bounded only
   by the 90-day sweep and grown by attendees rather than operators. Adding a cursor changes the
   API contract and the client — arguably a spec change.
5. **`revokeAllAssignments`, `revokeAssignmentForEvent`, `pseudonymiseAuditEntriesFor` are dead
   duplicates** of SQL inlined in `account.ts`, with comments claiming call relationships that do
   not exist. Pick one — delete the helpers or call them — but that is a choice.

### Deferred because they need a migration decision

6. **Two foreign keys have no covering index** — `admin_audit_entries.operator_id` and
   `organizer_assignments.assigned_by`. This repeats the repo's known unclaimed defect. The hourly
   `pruneDeactivatedOperators` anti-join scans the fastest-growing new table. **The fix requires
   either regenerating `0009` (which the migration README warns against doing casually, and which
   is only safe because `0009` has not been applied anywhere) or shipping `0010`** — and 011
   reserves `0009` alone.
7. **`0009` sets no `lock_timeout`** before adding foreign keys referencing `attendees`, `events`
   and `abuse_reports`. Same migration decision; mitigated in practice because `deploy.sh` enters
   maintenance before migrating.

### Deferred because they are test-coverage gaps rather than defects

8. **No route-level throttle test for `admin_sign_in`** — deleting the `recordAttempt` call would
   leave every test green. The project has this pattern twice already
   (`message-send-throttle.test.ts`, `reset-throttle.test.ts`); 011 is the first delay-only action
   to ship without it.
9. **`admin-audit-completeness.test.ts`'s route→module fallback defeats its own derivation** — a
   route whose path segment matches no filename is checked against *every* module and passes
   vacuously. `DELETE /admin/questions/:questionId` is exactly that case. Three of six audit
   actions have no end-to-end assertion.
10. **No horizontal-overflow test for the administrative destinations** — the repo's
    `horizontalOverflow` helper covers every attendee surface and no admin one. Axe reports nothing
    for a page that scrolls sideways.
11. **The retention sweeps 011 added have no behavioural test** beyond the one added here.

### Minor and Notable (24)

Recorded in full in the agent transcripts. The substantive ones: `pruneAuditEntries` measures its
window from `occurred_at` while declaring "365 days after pseudonymisation" (so an entry
pseudonymised late is swept immediately); the seed deletes and recreates operators, which
contradicts FR-993's wording; a whitespace-only resolution note answers 404 rather than 400;
`qa-absences.test.ts`'s narrowed predicate is blind to a verb-suffixed moderation route despite its
header claiming otherwise; several comments name mechanisms that do not exist
(`requiresReport`, `ADMIN_DESTINATIONS` "declared once", the "nested dialog" note on a dialog that
is not nested); `notAuthenticatedAdmin` is byte-identical to the factory it says it deliberately
differs from.

**Notable (2, informational — not fixed by design):** `admin_sign_in`'s delay-only throttle clamps
the *source* dimension as well as the identifier, so the highest-privilege credential in the
product has no lockout and no operator-visible signal of an attack — a defensible flat reading of
FR-916, worth an explicit decision. And no administrative module emits any structured log, so on a
deployed VM "which operator disclosed report X" is answerable only by `psql` over the SSH tunnel.

---

## Suite-level finding — one cause behind four symptoms

**Severity: Important. Not fixed — root cause not established, and guessing would be worse than
leaving it visible.**

The integration suite is **114 files sharing one database, seeded once for the whole run, executed
in file-size order, with several files calling `resetDatabase()` mid-run**. That model produced
four separate-looking failures in this session alone:

1. **`admin-sign-in.test.ts` missing a `report_resolutions` cleanup** — the only one of eight admin
   suites without it, so whether it passed depended on which file ran before it (found by the
   test-quality agent; fixed).
2. **`messages-journey.spec.ts` reading a list before it loaded** (fixed).
3. **`admin-moderation.spec.ts` asserting absence before the panel rendered** — my own, written an
   hour after fixing (2) (fixed).
4. **`admin-report-silence.test.ts` finding `attendees` empty**, intermittently — roughly 2 runs in
   6 of full `pnpm verify`, never in `pnpm test:integration` standalone across four consecutive
   runs. **Not fixed.**

**The harness predicted this.** `helpers.ts`'s `resetDatabase` header records 007 hitting the same
class — *"the integration suite failed **intermittently** depending on how many had built up and in
what order files ran — five tests failing on one run and none on the next, from the same tree"* —
and closes with the warning that *"the invariant is not self-maintaining."*

### What is established about (4), and what is not

**Established:**
- The `attendees` table is empty at file 57 (`admin-report-silence`), which resolves its fixtures
  from the shared seed rather than creating them.
- File 56 (`push-fanout-concurrency`) calls `resetDatabase()` → `seed()` and **passes** in the
  failing runs, so the seed did not throw.
- **The changes made in this review are not the cause.** The only integration file modified with
  new fixtures (`retention-sweep.test.ts`) runs at position **68** — after the failure — and
  `pnpm test:integration` passed 963/963 four times consecutively, including with leftover state.

**Not established:** what empties the table between files 56 and 57. Candidates are a race between
one file's teardown and the next file's `beforeEach`, or an ordering perturbation exposed by the
file-size changes this review made (Vitest's default sequencer orders by size).

### What was done instead

`seededAttendeeId()` in `helpers.ts`, used by the failing suite. The symptom was
`TypeError: Cannot read properties of undefined (reading 'id')` — naming neither the table, the
attendee, nor the seed, and it cost roughly twenty minutes of misdirected investigation on first
encounter. It now fails with one sentence identifying the prerequisite and pointing at suite
ordering rather than at the behaviour under test.

**This changes the message, not the mechanism. The flake is still present.** A green run is
consistent with it simply not firing.

### Recommended (owner decision)

Give each integration file its own schema or database, or make the seed idempotent and re-assert it
per file. Both are larger than a review fix and change how every suite is written, which is why
this is recorded rather than applied.

## Test Suite Results

| Round | Command | Result |
|-------|---------|--------|
| 1 | `pnpm test:unit` | 60 files, 578 passed |
| 1 | `pnpm test:component` | 62 files, 608 passed |
| 1 | `pnpm test:integration` | 114 files, **963 passed** (was 958; +5 new) |
| 1 | `pnpm test:e2e` (admin-moderation) | passed with the new anchor |

No regressions. Three fixes are mutation-verified: report provenance, and (from the earlier
session) the absolute-cap assertion and the FR-920 isolation guard.

## Conclusion

**Gate: PASS on Critical, with nine Important findings deliberately deferred.**

The Critical defect and every Important finding with an unambiguous correct fix are resolved and
covered by tests. The nine deferred are documented above with the decision each requires; they are
recorded rather than quietly dropped, and none is a latent crash or an exploitable hole left open —
the two exploitable findings (CORS scope and report provenance) are both fixed.

**What this review demonstrated about the earlier one.** Stage 1 scored 100% compliance and the
method was sound — but it answered "does each requirement have an implementation and a test",
which cannot see a transaction that is not taken, a check that only its own test calls, or a bound
the attacker supplies. Two of my own contributions from earlier in this session were among the
findings. The convergence pattern is the most reusable result: where four independent agents flag
the same function, the finding was real every time.
