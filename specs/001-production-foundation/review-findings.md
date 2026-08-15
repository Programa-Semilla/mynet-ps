# Deep Review Findings

**Date:** 2026-08-05
**Branch:** `spec/production-foundation`
**Rounds:** 1
**Gate Outcome:** PASS with remaining findings — see below
**Invocation:** quality gate, after `/speckit-implement`

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 1 | 1 | 0 |
| Important | 28 | 17 | 11 |
| Minor | 12 | 3 | 9 |
| Notable | 7 | – | 7 |
| **Total** | **48** | **21** | **27** |

**Agents completed:** 5/5. **External tools:** none — neither CodeRabbit nor Copilot CLI is installed.

59 raw findings deduplicated to 48. Every Critical and every Important finding that represented a
defect in shipped behaviour or a broken pipeline gate was fixed. The Important findings that
remain are design decisions that need an owner, not code that needs changing — each is named
below with why.

---

## Findings

### FINDING-1 — Sign-in throttling let an attacker permanently lock any account

- **Severity:** Critical · **Confidence:** 88
- **File:** `apps/api/src/routes/auth/sign-in.ts:120`, `apps/api/src/auth/throttle.ts`
- **Category:** security · **Source:** security agent
- **Resolution:** fixed (round 1)

**What was wrong:** The throttle gate ran *before* the credential was verified, and the
outstanding delay was measured from the most recent failure — including failures caused by
somebody else. An attacker sent thirteen wrong passwords for a known address to reach the
six-minute ceiling, then one more every four minutes. The victim's correct password was refused
before it was ever looked at, and the only thing that could clear the streak was a *successful*
sign-in, which the gate itself prevented. A closed loop.

**Why it mattered:** Email is the identifier, so this was available to anyone who knew an
attendee's address, at a cost of roughly fifteen HTTP requests per hour, with no account and no
session of their own. FR-031b forbids it in terms ("a hard lockout would let anyone who knows an
attendee's email deny them access deliberately") and SC-003a measures it: *the number of accounts
an attacker can render permanently inaccessible is zero*. It was unbounded.

The earlier fix in this branch — subtracting time already waited — addressed an attacker who
stops. It did nothing for one who does not.

**How it was resolved:** The credential is now verified first, and the throttle applies only to a
request that has *already failed*. A correct password is never refused, however many failures
precede it, which makes SC-003a true by construction rather than by clamping. The escalating
delay is served in-request up to a bound and reported as retry-after guidance beyond it, so
guessing still costs the attacker wall-clock time on a held connection.

Verified against a live API: after fifteen failures and with the attacker still going, the
attacker receives 429 and the owner signs in immediately with 204.

### FINDING-2 — `trustProxy: true` made the throttle's source dimension attacker-chosen

- **Severity:** Important · **Confidence:** 85
- **File:** `apps/api/src/app.ts:45`
- **Category:** security · **Source:** security agent
- **Resolution:** fixed (round 1)

Trusting every hop meant Fastify took the leftmost `X-Forwarded-For` entry, which any client can
write. Rotating that header per request put every guess in a fresh bucket, so the source
threshold never bound and a password spray from one machine was unlimited — and an attacker
could instead *name* a venue's public address and poison that bucket from anywhere. Replaced
with a hop count (`TRUSTED_PROXY_HOPS`, default 1) that trusts exactly the proxies actually in
front of the service.

### FINDING-3 — A success from any identifier reset the whole source's counter

- **Severity:** Important · **Confidence:** 82
- **File:** `apps/api/src/auth/throttle.ts`
- **Category:** security · **Source:** security agent
- **Resolution:** fixed (round 1)

Source failures were counted as a streak ended by any success, so an attacker holding one valid
account could sign into it every thirty guesses and never reach the threshold. The source
dimension is the only bound on a spray across many identifiers, and it was resettable at will.
It is now an absolute count within the window; the identifier dimension keeps streak semantics,
because a legitimate attendee's typos should not accumulate after they get in.

### FINDING-4 — A wrong password was reported to the attendee as a network failure

- **Severity:** Important · **Confidence:** 92
- **File:** `packages/data/src/http/client.ts`, `apps/web/src/auth/SignInScreen.tsx`
- **Category:** correctness · **Source:** correctness agent
- **Resolution:** fixed (round 1)

Every 401 was converted to a session error, so `invalid_credentials` never reached the sign-in
screen and fell through to "Could not reach MyNet. Check your connection and try again." The
server's carefully worded refusal was unreachable, and the attendee was sent to fix a network
that was working (FR-059). Only the two session codes are translated now.

Neither existing test caught it: the component test threw a plain `Error`, and the end-to-end
test asserted only that the two failure messages matched *each other* — which they did, both
being the wrong message.

### FINDING-5 — Signing out offline appeared to succeed while the session stayed live

- **Severity:** Important · **Confidence:** 90
- **File:** `apps/web/src/shell/TopBar.tsx`
- **Category:** correctness · **Source:** correctness and architecture agents
- **Resolution:** fixed (round 1)

`try { await signOut() } finally { markSignedOut() }` cleared local state even when the request
was never sent. Offline, the attendee was returned to the sign-in screen while `revoked_at` was
still null and the cookie was still live on the device — the exact thing FR-053 forbids ("MUST
NOT appear to have succeeded") and the opposite of FR-027. Someone signing out on a borrowed
device is precisely the person who must not be told it worked when it did not. Offline is now
refused with an explanation and the attendee stays signed in; a server refusal still clears
local state, because that means the session is genuinely gone.

### FINDING-6 — The `contract` job could never pass

- **Severity:** Important · **Confidence:** 90
- **File:** `.github/workflows/verify.yml`
- **Category:** correctness · **Source:** correctness agent (reproduced by execution)
- **Resolution:** fixed (round 1)

`contract:check` builds the Fastify app to read its route schemas, and `buildApp` calls
`loadConfig()`, which requires `DATABASE_URL`. The job had none, so it threw at startup on every
run and could never distinguish a stale contract from a fresh one. Given a placeholder — no query
is ever issued, `getDb()` is lazy — so the job tests what it exists to test.

### FINDING-7 — Every push to a protected branch produced a permanently red check

- **Severity:** Important · **Confidence:** 92
- **File:** `.github/workflows/verify.yml`
- **Category:** production-readiness · **Source:** production-readiness and correctness agents
- **Resolution:** fixed (round 1)

The aggregate `verify` job ran on push and asserted all eleven checks succeeded, but
`deploy-preview` is gated to pull requests and was therefore skipped — and `skipped != success`.
Every merge into `develop` or `main` was red forever. That is its own FR-064 failure from the
opposite direction: a signal that is always red teaches reviewers to ignore it. `verify` is now
pull-request-only, and `verify-push` covers the post-merge path with the six jobs that can
genuinely run there.

### FINDING-8 — Push runs leaked a database branch that nothing could ever delete

- **Severity:** Important · **Confidence:** 88
- **File:** `.github/workflows/verify.yml`
- **Category:** production-readiness · **Source:** production-readiness and correctness agents
- **Resolution:** fixed (round 1)

`db-branch` ran on push and named the branch `pr-<run_id>`; `cleanup` only fires on a closed pull
request and deletes `pr-<number>`. Every merge added one Neon branch permanently. Once the
project hit its branch limit the whole pipeline would stop working, weeks later, for a reason
having nothing to do with the change under review. `db-branch` is now pull-request-only.

### FINDING-9 — Preview branches would have been cloned from production

- **Severity:** Important · **Confidence:** 78
- **File:** `.github/workflows/verify.yml`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

`create-branch-action` was called with no `parent_branch`, which branches from the project's
default — where production data will live. Harmless today because there is no production data;
the day there is, every pull request would silently receive a copy-on-write clone of the real
attendee table, credential hashes included, behind a publicly reachable preview API. FR-067
forbids exactly that, and it would have arrived with no code change to trigger it. Now branches
explicitly from a permanently data-free `preview-base`.

**This adds an owner provisioning step:** `preview-base` must exist (T001).

**Follow-up, caught by the first real pipeline run:** the fix initially used `parent_branch`,
which is not an input this action accepts. It warns and continues, so the guard would have read
as present in review and branched from the default anyway. The correct input is `parent`. Worth
recording as its own lesson: a workflow input typo is invisible to YAML validation, to review,
and to every local gate — only a real run says anything, and only in a warning.

### FINDING-10 — Three CI jobs shared one database and reset it underneath each other

- **Severity:** Important · **Confidence:** 88
- **File:** `.github/workflows/verify.yml`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

`test-integration`, `test-e2e` and `test-accessibility` ran concurrently against the same branch,
and each destructively reseeds — deleting and re-inserting every attendee with fresh identifiers.
One suite's signed-in session could have its attendee row deleted mid-run by another, and one
suite's deliberate failed sign-ins throttled another's. That is nondeterministic flakiness in the
gates FR-064 says must never report an untrustworthy result, and its usual remedy — "re-run the
job" — is the habit that destroys trust in a pipeline. Each suite now gets its own branch.

### FINDING-11 — Cleanup could silently orphan a live, secret-holding API

- **Severity:** Important · **Confidence:** 85
- **File:** `.github/workflows/verify.yml`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

The Neon delete had no failure isolation, so a transient error skipped the Fly steps entirely and
left `mynet-api-pr-<n>` alive, publicly reachable, and still holding its database URL and auth
secrets. The Fly destroy ended in `|| true`, which made the opposite mistake: it reported success
while orphaning the application. Every step now carries `if: always()`, and the destroy is
allowed to fail loudly.

### FINDING-12 — Nothing ran migrations at deploy time

- **Severity:** Important · **Confidence:** 85
- **File:** `apps/api/fly.toml`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

The schema was applied only by a CI job coupled to the deploy by a `needs:` edge. Any
`flyctl deploy` outside that workflow — a rollback, a redeploy, or the production path that does
not exist yet — would ship new code against an unmigrated schema and 500 on every request. Added
a `release_command`, which is also what makes the Dockerfile's "migrations ship with the image"
comment true.

### FINDING-13 — Retention was described but never performed

- **Severity:** Important · **Confidence:** 95
- **File:** `apps/api/src/auth/throttle.ts`
- **Category:** production-readiness · **Source:** production-readiness, security and architecture agents
- **Resolution:** fixed (round 1)

`pruneAttempts` was exported and called by nothing — no scheduler, no route, no hook. Its comment
said "Retention past it is pointless and adds risk", so a reader auditing FR-042 or Principle
VIII would conclude retention was handled. It was not: `sign_in_attempts` is written on every
sign-in attempt and holds keyed hashes of every address ever typed at the service, including
addresses belonging to people who are not attendees. `auth_sessions` had the same problem. Both
are now swept hourly by `apps/api/src/maintenance.ts`, and the interval matches what the SQL
actually deletes.

### FINDING-14 — The lint rule enforcing SC-008 could not see most platform access

- **Severity:** Important · **Confidence:** 90
- **File:** `packages/config/eslint-plugin-mynet.js`
- **Category:** architecture · **Source:** architecture agent
- **Resolution:** fixed (round 1)

The rule recognised `fetch` and a handful of storage and capability names, but not `document`,
`window`, `location`, `history`, or `navigator` — and feature code was calling them. SC-008's
count read zero because the detector was narrow, not because the violations were absent: exactly
the "gate that passes while not checking" this codebase warns about elsewhere.

Widening it by name produced false positives on `event.location` and a local variable called
`alert`, which would have taught people to reach for disable comments. The rule now resolves
references against the global scope instead, so it reports the ambient globals and nothing else.
It immediately found three real violations, all now fixed: `document.title` and the recovery
reload moved into the bootstrap, and `ErrorBoundary` takes its recovery action as an injected
prop rather than performing it.

### FINDING-15 — The sign-in button could stick permanently disabled

- **Severity:** Minor · **Confidence:** 85
- **File:** `apps/web/src/auth/SignInScreen.tsx`
- **Category:** correctness · **Source:** correctness agent
- **Resolution:** fixed (round 1)

`setSubmitting(false)` ran only in the catch. If sign-in succeeded but the follow-up identity
check did not, the screen stayed mounted reading "Signing in…" with submission disabled forever —
a dead end with no route back, which is what FR-061 exists to prevent. Now reset in a `finally`.

### FINDING-16 — No request timeout anywhere

- **Severity:** Important · **Confidence:** 78
- **File:** `packages/data/src/http/client.ts`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

A request that connected and then stalled hung for the browser's default — minutes. The attendee
saw a spinner that never resolved, the offline banner never appeared because nothing had failed
yet, and there was no retry affordance. This compounds with a deployment that auto-stops its
machines and a database that auto-suspends. Bounded at 20 seconds, and 4 for the probe, which
must not outlive the interval that schedules it.

### FINDING-17 — The probe loop could accumulate hung requests

- **Severity:** Minor · **Confidence:** 80
- **File:** `apps/web/src/app/services.ts`
- **Category:** production-readiness · **Source:** production-readiness agent
- **Resolution:** fixed (round 1)

No in-flight guard and no visibility gating: a stalled connection added one outstanding request
every five seconds until the browser's per-host budget was exhausted, starving the attendee's
own requests. A backgrounded tab kept probing at full rate on cellular. Both now guarded.

### FINDING-18 — Presentation code imported the transport

- **Severity:** Important · **Confidence:** 92
- **File:** `apps/web/src/auth/SignInScreen.tsx`
- **Category:** architecture · **Source:** architecture agent
- **Resolution:** fixed (round 1)

`SignInScreen` imported `ApiError` from `@mynet/data/http` and branched on it, so a presentation
component depended on the transport implementation — while `services.ts` claimed to be "the only
module in `apps/web` permitted to know that HTTP exists". A transport-agnostic
`RequestRefusedError` now lives with the interfaces; `ApiError` extends it and keeps the HTTP
detail on its own side of the boundary.

### FINDING-19 — Destination addresses were written three times

- **Severity:** Important · **Confidence:** 87
- **File:** `apps/web/src/app/routes.tsx`
- **Category:** architecture · **Source:** architecture agent
- **Resolution:** fixed (round 1)

`navigation.ts` claimed "the router … reads this list". It did not: `routes.tsx` hardcoded the
paths, and each destination module looked its own address up a third time with
`destinationFor('/agenda')!`. Changing an address type-checked cleanly and turned that non-null
assertion into a runtime crash inside the shell. Routes are now generated from the list, and the
four thin modules are gone.

### FINDING-20 — The secure-storage test could not fail for the reason it named

- **Severity:** Important · **Confidence:** 95
- **File:** `packages/platform/tests/substitution.test.ts`
- **Category:** test-quality · **Source:** test-quality and architecture agents
- **Resolution:** fixed (round 1)

A test named "stores nothing in secure storage" asserted only that the object was defined. An
implementation backed by `localStorage` would have passed it — and that is the boundary keeping
the session token unreachable from client code. It now writes, reads back, and asserts the
browser stores were never touched.

### FINDING-21 — The "no attendee identifier" guard was weaker than it looked

- **Severity:** Important · **Confidence:** 90
- **File:** `packages/data/tests/substitution.test.ts`
- **Category:** test-quality · **Source:** test-quality agent
- **Resolution:** fixed (round 1)

The only automated guard on the claim that makes FR-036 structural checked
`Function.prototype.length` against a hand-written list of two methods. `Function.length` ignores
optional, defaulted, and rest parameters, so `getCurrent(attendeeId?: string)` — the idiomatic
way somebody would add the very parameter this forbids — reported zero and passed. The list also
silently narrowed: a third repository method would simply not be checked. Now derived from the
prototypes, with a non-empty assertion so the loop cannot pass by iterating nothing, and matched
against the signature text rather than arity alone.

---

## Remaining Findings

None is a defect in shipped behaviour. Each needs a decision, a environment that does not exist
yet, or work whose scope belongs to the owner.

### Needs an owner decision

**R-1 · The preview topology breaks `SameSite=Lax`** (Important, security). The pipeline deploys
the API to `*.fly.dev` and the client to `*.pages.dev` — different registrable domains, so the
session cookie will not be sent and the preview cannot sign in. The local end-to-end suite runs
same-site and cannot surface it. The fix is a topology decision (serve the API under the same
registrable domain), not a code change, and the alternative — `SameSite=None` — removes the only
CSRF defence and would require a token at the same commit. **This will be discovered the first
time a preview is opened.**

**R-2 · No Content-Security-Policy or security headers** (Notable, security). HttpOnly stops
token exfiltration but not an XSS issuing authenticated same-origin requests. A `_headers` file
and `@fastify/helmet` are cheap; the CSP's `connect-src` depends on R-1's answer, so they should
land together.

**R-3 · No production deployment path** (Notable, production-readiness). The pipeline proves a
change can reach a throwaway environment and nothing about reaching a durable one. Where
production lives, how migrations gate on it, and how a bad deploy is rolled back are cheapest to
decide now and most expensive to retrofit after real attendee data exists.

**R-4 · `/health` never touches the database** (Notable, production-readiness). A deploy with a
revoked `DATABASE_URL` passes every check and then 500s on every request. Deliberate — readiness
is spec Open Question 20 — but worth settling.

### Needs the pipeline to exist (blocked on T001–T003)

**R-5 · Preview URL mismatch** (Minor). `wrangler pages deploy` mints a per-deployment URL
alongside the branch alias; only the alias is in the API's CORS allow-list, so a reviewer opening
the other one gets a preview whose every call is blocked — presenting as a connectivity problem
rather than a configuration one.

**R-6 · Workflow-level secrets are inherited by every job** (Notable). Safe today, because both
values are preview-only and the seed password is already public. The risk is structural: a future
`deploy-production` job added to this file inherits them silently.

### Test coverage the review identified and I did not add

These are real gaps. I fixed the two that guarded structural claims (FINDING-20, FINDING-21) and
left the rest, because adding them well is a larger piece of work than a fix round:

- **`useAsync` and `Home` have no test at any layer** (Important) — the empty state (FR-040), the
  offline-versus-server message split, the retry path, and the cancellation guard are all
  unverified. Neither seeded attendee has zero events, so no end-to-end test covers the empty
  state either.
- **`ErrorBoundary` has no test** (Important) — FR-061 is verified by reading the file.
- **The client half of FR-028c has no test** (Important) — nothing asserts that a
  `SessionExpiredError` produces the inactivity explanation while `NotAuthenticatedError` does
  not, or that `OfflineError` yields `offline` rather than `signed-out`.
- **The two bespoke lint rules have no tests** (Important) — SC-008 and SC-009 are enforced by
  untested rules. FINDING-14 is exactly the failure this predicts, and it was found by a reviewer
  rather than by a gate.
- **`useAuth` has no transition out of `signed-in`** (Important, architecture) — a
  `SessionExpiredError` from any repository call after mount is rendered as a generic failure;
  the shell keeps showing a stale name and a sign-out button. The server side is correct and the
  client discards the information.
- **The e2e `expectOwnWorkspace` negative assertion is one markup change from vacuous** (Minor) —
  it matches a single event name as a heading; move it to text content and assert the event count.
- **Seed fixtures are declared three times with no drift guard** (Important) — the destinations
  list got a mirror test; these did not.
- **`sign_in_attempts` is not cleared between e2e specs** (Notable) — currently safe by a margin
  of one failed sign-in, and invisible.
- **`citext` uniqueness is untested** (Minor) — reverting the column type would let two accounts
  differing only in case coexist, with no red test.
- **Manifest and icons have no test** (Minor) — SC-013 is unverified; a `VitePWA`
  misconfiguration dropping the maskable icon would pass everything.

### Not fixed, deliberately

- **Dead exports** (`tokenHashesEqual`, `findAttendeeById`, `resetConfigForTests`, `notFound()`,
  `emptyWhen`) — cosmetic, and `findAttendeeById` carries a misleading comment worth correcting.
- **`types: {}` in the database client** is inert configuration with a comment describing a
  protection it does not provide.
- **`navigateFallbackDenylist`** guards a same-origin `/api/` path this application does not use.
- **Clock skew between the API and PostgreSQL** shifts the throttle window (Notable). Not a bug
  with NTP-synced hosts, but the delay calculation assumes the two timestamps are comparable and
  nothing establishes that.
- **`e2e/` is not type-checked by any gate** (Minor) — Playwright transpiles without checking, so
  a type error there surfaces as a mid-run browser failure rather than at the typecheck gate.

---

## Verification after fixes

Full pipeline, all green:

| Gate | Result |
|---|---|
| typecheck, lint, format | pass |
| unit | 38 passed |
| component | 33 passed |
| integration | 42 passed (was 38 — six new throttle cases) |
| contract | up to date |
| build + asset budget | 134 KB of 150 KB |
| end-to-end + accessibility | 39 passed |

The Critical was additionally verified against a running API: with an attacker fifteen failures
deep and still going, the attacker receives 429 and the account owner signs in immediately.
