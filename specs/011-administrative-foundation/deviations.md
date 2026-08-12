# Implementation deviations — 011

Recorded during `/speckit-implement`. Each entry states what `tasks.md` asked for, why it was not
done as written, and what was done instead. **A deviation is a decision; an undocumented departure
is a defect.**

---

## D1 — There is no client-side audit repository (T036)

**Asked for**: *"Create `packages/data/src/interfaces/admin-audit.ts` repository interface and
register it in `packages/platform`'s `Repositories` (one line, per the append-only extension
point)."*

**Not done, because building it would contradict FR-999.** A repository interface exists to give a
client typed access to routes. The audit trail has **no read route and no client write path**:

- **FR-999** forbids any route exposing the audit trail, and
  `apps/api/tests/unit/admin-forbidden-surfaces.test.ts` fails the build if one appears.
- Audit entries are written **server-side, inside the transaction of the act they record**
  (`appendAuditEntry`, called by the routes themselves). A client cannot write one, and must not
  be able to: an audit entry a client could author is not an audit entry.

So the interface would declare no methods, and registering it would advertise a client capability
that must never exist. `tests/unit/audit-append-only.test.ts` asserts the *absence* of a read path
over the query module's exports, which is the guarantee T036 was reaching for.

**Done instead**: `apps/api/src/db/queries/admin-audit.ts` is the whole of the audit trail, with
append and the two retention operations and nothing else, guarded by name-shape.

---

## D2 — No administrative repository is registered in `Repositories` (T036, T066, T092, T127)

**Asked for**: each administrative repository to be *"registered in `packages/platform`'s
`Repositories` — one line, per the append-only extension point."*

**Not done, because `Repositories` is the ATTENDEE client's registry, and adding to it would
violate FR-970.**

`packages/platform`'s `PlatformServices.repositories` is the injected registry that `apps/web`
consumes through its hooks. Adding `adminSession`, `adminReports` or `adminConferences` to it would
put administrative repositories **inside MyNet's dependency graph and inside its bundle** — which
is exactly the "no administrative surface in the attendee product" that decision 33 makes testable
rather than asserted, and which `apps/web/tests/unit/admin-absences.test.ts` exists to catch.

It is also unreachable in the other direction: `apps/admin` takes **no dependency on
`@mynet/platform`** at all (research R9, FR-923, asserted by
`apps/admin/tests/unit/no-platform-dependency.test.ts`), so it has no registry to read them from.

**Done instead**, preserving both halves of the intent:

- The **interfaces and their HTTP implementations live in `packages/data`**, exactly as every other
  repository does — so Principle V's data-access half binds the administrative product in full, and
  no component calls the network or knows a URL.
- They are composed in **`apps/admin/src/app/services.ts`**, that product's own composition root,
  which is the same role `apps/web/src/app/services.ts` plays. Adding a repository there is the
  same one-line append the task describes, in the registry that actually serves this client.

The two products therefore share repository *interfaces* and share nothing else.

---

## D3 — `deletion-coverage.test.ts` gained computed transitive reachability (T025)

**Asked for**: allow-list entries for the new tables.

**Two of the three were written as asked** — `operators` and `admin_audit_entries` are declared
not-attendee-data with their reasoning. The third, `report_resolutions`, was not, and the guard is
better for it.

`report_resolutions` holds **no attendee column at all**. It cascades from `abuse_reports`, which
cascades from both the reporter and the reported attendee — so an attendee's erasure does reach it,
in two hops. The guard only understood one hop, and flagged it.

An allow-list entry would have been a *claim* that the chain exists, sitting beside entries that are
claims about tables holding no attendee data — two completely different kinds of statement looking
alike. Worse, it would not notice if somebody later weakened `report_resolutions.report_id` to
`ON DELETE NO ACTION`: the comment would still read correctly and the coverage would be gone.

**Done instead**: the guard now **computes** cascade reachability as a graph walk over cascade edges
only, so the chain is checked on every run against the schema. Both directions are pinned against
known cases, because a predicate that silently stops matching would make every table look classified.

---

## D4 — `PlatformScope` is a subclass, not a sibling class (T029)

Not a departure from `tasks.md`, which names only the two types — recorded because the first
implementation was wrong in a way worth keeping.

Written first as **two sibling classes**, each with its own `#verified` field. TypeScript's private
fields are nominal *per declaration*, so the two types were incompatible in **both** directions and
`requireOperator` could not hand its result to a handler expecting the weaker type. `pnpm typecheck`
rejected it immediately.

The dangerous near-miss is the other spelling: a subclass adding **no** new private field is
assignable in both directions, so a handler declaring `PlatformScope` would silently accept an
`OperatorScope` and the tier boundary would evaporate with every test still green.

**Done**: a subclass that adds `#platform`. Inherited `#verified` makes a platform scope satisfy
`OperatorScope`; the extra field stops the reverse. Both directions are asserted in
`tests/unit/admin-scope-brand.test.ts`, one with `@ts-expect-error` so it fails the **typecheck**
rather than the test run.

---

## D5 — `apps/admin` has no CI jobs of its own (T008)

**Asked for**: *"Add `apps/admin` jobs to `.github/workflows/verify.yml` for typecheck, lint, unit,
component and build."*

**Done as coverage through the existing five jobs instead**, with the reasoning written into the
workflow above the job list. Every one of those gates already addresses the whole workspace
(`pnpm -r typecheck`, `eslint .`, the two vitest projects, `pnpm build`), and `apps/admin` enters
each through the root scripts and `packages/config/vitest.base.ts`.

Five duplicate jobs would report the same failures twice and create a second place for the two
applications' gate coverage to drift apart. The cost is stated in the workflow: a `test-unit`
failure no longer says which product it came from without reading the output.

The build job **does** gain a step — `admin-dist` is uploaded as its own artifact, so that the
absence of `sw.js` and `manifest.webmanifest` from it is visible at a glance.

---

## D6 — Eighteen test files became ten, and two tasks were ticked without their assertions

**Asked for**: one integration test file per task, named in the task.

**Done as ten files instead.** Assertions that share a fixture were consolidated: the four
concurrency properties (FR-918's two directions, FR-945's double resolution, research R7's
mid-removal vote) are one `admin-concurrency.test.ts`, because each needs the same two-connection
harness and building it four times would be four chances to build it wrongly. Likewise
`admin-report-queue.test.ts` (T075–T077), `admin-report-silence.test.ts` (T080, T081),
`admin-promotion.test.ts` (T113, T114, T116, T118) and `admin-lifecycle.test.ts` (T132–T136).
`tasks.md` now names the covering file on every consolidated entry, because a task naming a file
that does not exist is indistinguishable from a task nobody did.

**Five source comments pointed at the file names that were never created** — `identity.ts`,
`admin-moderation.ts`, `me.ts`, `AdminShell.tsx` and `ReportDetail.tsx` each cited a phantom test
as the evidence for a claim they were making. Repointed at the real files.

### The part that is a finding rather than a deviation

**Two tasks were marked complete while the assertions they describe did not exist anywhere.**
Both were found by checking each open task's requirement against the source rather than against
the checkbox, and both are now written and passing:

- **T050 (FR-919a, FR-919b) — neither session bound was tested at all.** `admin-sign-in.test.ts`'s
  header claimed T050 and its body never covered it. This is the most consequential of the two:
  `absolute_expires_at` exists *only* to stop a session in constant use living forever, and
  advancing it in `resolveAdminSession`'s `set` clause — one word, beside the `idleExpiresAt` that
  **is** advanced there and correctly so — reads as a consistency fix and makes the eight-hour cap
  infinite. The new assertion was **mutation-tested**: injecting exactly that change fails it and
  nothing else in the file.
- **T113 (FR-934) — demotion's two halves were unasserted.** The existing test checked that the
  assignment row was revoked, which is neither half of the requirement. Access must end
  **immediately** on a session established *before* the demotion — `require-operator.ts` re-reads
  `organizer_assignments` per request for exactly this, and deleting that re-read would have broken
  no test — and the attendee account must be **untouched**, compared byte for byte across the
  three MyNet surfaces using the session held from before.

**The lesson is the one 010 already recorded in a different form**: a check that did not execute
has not passed, and a checkbox is not a check. Consolidation is fine; consolidation without
recording where the assertions went is how two of them went missing unnoticed.

---

## D7 — The administrative site was never wired into the deployment (found at T154)

**Not a departure from `tasks.md` — a gap `tasks.md` does not contain.** T042 asked for the Caddy
site block and got one; nothing asked for the other three pieces a second site needs, so nothing
produced them.

**The state before this**: `deploy/vm/Caddyfile` served `admin.{$APP_DOMAIN}` from `/srv/admin`,
and its comment said *"two builds, two artifacts, and `deploy.sh` places each"*. That sentence was
false in every clause:

- `docker-compose.yml` mounted `./web` at `/srv/web` and had **no `/srv/admin` mount at all**;
- `deploy.sh` built `@mynet/web` and **not `@mynet/admin`**;
- `deploy.sh` rsynced `apps/web/dist/` and **nothing else**;
- and the `--delete` exclude list covered `deploy/vm/web` but not `deploy/vm/admin`, so even a
  hand-placed artifact would have been erased a few seconds into the next deploy.

**How it would have presented.** MyNet deploys perfectly. Every check in `README.md` section 4
passes, because all of them address the apex host. `docker compose ps` is healthy, `/ready`
answers, the migration applies. The administrative host answers **404 for its document** — and
nothing in the pipeline looks at it. It is the failure mode `deploy.sh`'s own comment predicts for
the `web` exclude ("Caddy would serve 404 for the document while the API was perfectly healthy"),
one host over, and *less* likely to be noticed because no attendee-facing check touches it.

**Fixed**: the `/srv/admin` mount, the second build (with no VAPID key — `apps/admin` registers no
service worker), the second rsync into its own tree, and the matching `--delete` exclude. The
build was run and verified to produce `apps/admin/dist` carrying **no `sw.js` and no
`manifest.webmanifest`**, which is FR-923's absence visible in the artifact.

**Still not verifiable end to end**, and this is stated rather than implied: no domain is
registered and no Azure subscription is named, so neither certificate has ever been issued and no
deploy has ever run. What is fixed is that the pipeline now *has* the administrative half; that it
works can only be proved by the first real deploy.

---

## D8 — FR-992's forced replacement could not be reached, and four gates missed it (T053)

**The one failing e2e test was not a harness problem.** It was recorded as one — the previous
session's handoff attributed it to `signInAsOperator` and suspected a database mismatch — and
underneath it was a **product defect that made the administrative product's opening interaction a
dead end**.

### What was broken

An operator whose bootstrapped credential still stood could **never sign in**. Signing in
succeeded (204). The client then called `GET /admin/me`, which `requireOperator` answers with a
`credential_not_replaced` **403** — correctly, because FR-992 makes the replacement route the only
address that state may reach. `session.tsx` caught that, classified every failure as signed-out,
and rendered the sign-in form again. The operator was returned to the screen they had just used
correctly, forever.

The provider was reading `identity.credentialIsInitial` from a **successful** `/admin/me`. That
response is unreachable: the guard refuses before the handler runs whenever the flag is true. The
field exists on the route's payload and is dead code for the same reason.

### Why every gate passed

- **The component test substituted `session.me()` and had it resolve with
  `credentialIsInitial: true`** — a response the server cannot produce. The double asserted the
  fiction the code was written against. This is 008's caching-decorator lesson exactly: *the shape
  of the double is the assertion*, and a double that can do what the real thing cannot proves
  nothing.
- **The integration suite was right and untroubled.** `admin-bootstrap.test.ts` asserts the 403;
  `admin-sign-in.test.ts` asserts the 204. Both halves were correct and nothing joined them.
- **Contract, lint, typecheck**: a boolean that is never true is well-typed.
- **The e2e that would have caught it was the one failing test**, and it had been written off as
  harness flakiness.

Fixed by classifying the 403 in `refresh()` — `error.code`, never the class, because
`ApiError extends RequestRefusedError` and `instanceof` cannot tell this 403 from the 401 beside
it. The `must-replace-credential` state now carries no identity, because there is none to carry.
The component double now rejects with the 403 the server actually sends, and additionally asserts
the sign-in form is **absent** — the two outcomes are one `classify` branch apart.

### Three harness defects underneath it

Each independently capable of producing a false pass or a misleading failure:

1. **`startApi` could not tell its own server from a stranger's.** `stopApi` kills only the pid in
   `test-results/.api-pid`, and **Playwright wipes `test-results/` at the start of every run** — so
   after any interrupted run the handle was gone, a leaked detached API still held `:3000`, the new
   child died with `EADDRINUSE`, and `waitForHealth` was answered by the leaked server. **A whole
   suite could run against a process started from different code with a different environment, and
   report success.** The pid file moved out of the wiped directory, and the health poll now races
   the child's own exit.
2. **`attemptSignIn` inferred the outcome from the DOM and reported refusals as acceptances.** Two
   successive versions watched the submit button; the second waited for the in-flight label to
   reach count 0, which is *already* true if the assertion runs before React renders it. It now
   reads the `POST /admin/session` response, with the wait armed before the click.
3. **The helper ran `pnpm db:seed` inside a test, deleting every attendee mid-run.** It was doing
   so to satisfy FR-993, which is sound reasoning in the wrong place: the test it broke is the one
   proving the two sessions are independent — it signs Ada into MyNet, signs in as an operator,
   then checks Ada is still signed in. The helper deleted her account in between, and the failure
   read as *"signing out of administration signed the attendee out of MyNet"*, a decision-37
   violation that was never happening. Seeding and bootstrapping now happen once, in global setup.

**The lesson, and it is the same one three times**: every one of these is a check that appeared to
execute and did not test what it named. The suite was green on a product an operator could not sign
in to.

---

## D9 — The administrative rail failed AA, and the token file had named the mistake in advance

**Found by T147**, on its first run, at all three widths.

`AdminShell`'s active rail item was `bg-coral-500 text-text-inverse` — **3.27:1**, against a 4.5:1
requirement. `tokens.css` describes this exact error where it defines the accent:

> `accent` is the approved prototype coral. It is 4.65:1 against the navy surface, so it is correct
> for text on navy, for icons, indicators, and borders — but only 3.27:1 behind
> `--color-text-inverse`, so text on a coral-500 background fails. `accent-strong` is for exactly
> that case… **Reaching for `accent` where text sits on top is the mistake this split exists to
> make visible**, and `e2e/accessibility.spec.ts` is what catches it if the split is ignored.

Every part of that held except the last clause, and only because of *where* the check lives:
`apps/web/src` reaches for `bg-coral-500` **nowhere**, and MyNet's accessibility scan never visits
the administrative origin. The guard was real and the new product was outside it.

Fixed to `bg-coral-600` — 5.04:1 — with the reasoning written at the call site rather than left in
the stylesheet, since the stylesheet's version was already there and did not prevent it.

**Two things follow, and both are the point of the task rather than incidental to it:**

- **A shared stylesheet is not shared coverage.** The two products share every colour token, which
  is an argument that contrast *should* pass and no argument at all about what a second
  application actually renders. T147 exists because that gap is structural.
- **`pnpm test:a11y` ran one file.** It was `playwright test e2e/accessibility.spec.ts`, so a new
  scan would have been outside the named accessibility gate while passing under `test:e2e`. Both
  files are named now. This is 010's finding in a new place: a check that does not run has not
  passed, and the way it stops running is usually that somebody adds a thing the runner does not
  know about.

**T146 found nothing**, which is worth recording too: all four administrative dialogs were already
centred, because the base `dialog` rule lives in the shared `theme/tokens.css` and the second
application imports it. That is the first time the rule has been exercised on another origin, and
it now has a test rather than an expectation — verified by mutation, which reproduces 008's
top-left-corner defect on the admin dialogs exactly.

---

## D10 — The report queue ships unpaginated, and that is a decision

**Raised by**: the deep review (finding 4), and settled by the owner rather than by the review.

`listReports` returns every row, open and resolved, on every load of `GET /admin/reports`.

**Accepted, for three reasons that hold together and would not hold separately:**

- **The rows carry no content.** FR-995 and decision 38 keep bodies out of the list — that is why
  reading the list writes no audit entry — so a row is a reporter, a reported attendee, a kind and
  two timestamps. The payload is small per row and cannot grow by disclosure.
- **The population is bounded by a sweep, not by usage.** `abuse_reports` is swept at 90 days and
  `report_resolutions` cascades with it, so the queue is "reports in the last quarter" rather than
  "reports ever". A conference product's abuse volume over one quarter is worked through by a
  human, which is the actual constraint on how large this can usefully get.
- **A cursor is a contract change.** It alters `contracts/openapi.json` and the administrative
  client, and it introduces the one thing this queue must not have — a way to be *partially* read
  without the reader knowing. `review-findings.md` calls it "arguably a spec change", which is the
  right reading.

**Explicitly rejected: a bare `LIMIT`.** It is the cheapest option and the worst one. The queue
would silently truncate, and a safety queue that quietly stops showing the oldest unresolved report
is a failure that looks exactly like an empty queue. This repository already records that class of
mistake — a check that does not run has not passed — and a list that does not show everything has
not been read.

**What would reopen this**: a deployment where the queue is measurably slow, or any change that
puts content in the list. The second is the one to watch, because it converts a bounded metadata
read into an unbounded disclosure.

---

## D11 — The audit window is measured from `occurred_at`, not from pseudonymisation

**Found while writing the sweep's first behavioural test** (deep-review finding 11).

`maintenance.ts` declares this window as *"365 days after pseudonymisation"* and
`admin-audit.ts` says the clock "starts then". **Neither is true of the code.**
`pruneAuditEntries` measures `occurred_at`, so an entry written 400 days ago and pseudonymised
*yesterday* — because that is when the attendee exercised erasure — is swept on the next hourly
pass instead of a year later. The accountability record for a recent erasure disappears at once,
which is the opposite of what "pseudonymise-plus-clock" is for.

**Not fixed here, because the correct fix is a schema change.** It needs a `pseudonymised_at`
column set by `pseudonymiseAuditEntriesFor`, and the predicate moved onto it. `0009` was already
regenerated once in this pass (for the two missing foreign-key indexes); regenerating it a second
time to carry a column that nothing has yet asked for is a decision about the retention rule, not
a review fix.

**Recorded so it cannot be discovered by trusting the comment**:
`retention-sweep.test.ts` now asserts the behaviour that actually ships, and its message says in
so many words that it encodes current rather than desired behaviour, and what to do when it starts
failing.
