# Deviations — Conference Content Authoring (014)

What implementation changed, found, or decided that the spec, plan or data model did not say.
Written as it happened rather than at the end, so the reasoning is the reasoning that was
available at the time.

**Status: implementation complete except the by-hand walk; `develop` merged 2026-08-14 (D22).** Phases 1–7 are done; T105 —
`quickstart.md` scenarios 6–9, which need a person and a phone — is outstanding and joins the
same unwalked scenarios from 007, 008, 009 and 013. `tasks.md` carries the per-task state.

---

## D1 — `admin_audit_entries` needed a second principal column, and `data-model.md` does not
mention it

**T002. The largest departure in the feature, and it was forced rather than chosen.**

`data-model.md` declares four columns and two indexes. Implementation added a fifth column,
`admin_audit_entries.actor_attendee_id`, and could not have proceeded without it.

013's six audited acts are **all platform-tier**: promotion, demotion, report resolution, question
removal, operator deactivation, content disclosure. So `operator_id` was always non-null and the
question never arose. 014's ordinary actor is a **conference organizer** — an attendee holding a
live `organizer_assignments` row, with **no `operators` row by design**, which is the asymmetry
`schema/operators.ts` records as what makes FR-904 achievable.

FR-1037 requires every authoring act to write an audit entry. Without this column that is
unimplementable for the tier that does most of the authoring. Three alternatives were rejected:

- **`operator_id = NULL` for organizer acts.** `appendAuditEntry`'s own header rules it out: *"an
  entry written with no operator would be an accountability record accounting for nobody."*
- **Give organizers an `operators` row.** Exactly the change `schema/operators.ts` names as
  collapsing two tiers into one table with a flag.
- **Reuse `subject_attendee_id`.** It means *whom the act was done to*; conflating actor with
  subject makes the pseudonymisation rule incoherent.

Two consequences travel with it and are implemented:

- **Pseudonymisation clears both references.** An organizer exercising erasure is an ordinary
  account deletion, and every act they performed names them. FR-997a's rule — the act survives,
  whom it was done to does not — applies to *who did it* by the same reasoning. Two statements
  rather than one widened `WHERE`, because a single `SET` would clear the subject on an entry where
  only the actor matched.
- **The retention sweep reads both.** An entry naming a living organizer is live accountability in
  exactly the sense one naming a subject is.

**No check constraint pins "exactly one of the two".** It would be right on every write and wrong
afterwards: `operator_id` is `ON DELETE SET NULL`, so an entry legitimately reaches a state with
neither populated. The invariant lives in `AuditEntryDraft`'s union type instead.

The action set grew from six to fourteen. `ADMIN_AUDIT_ACTIONS`, the check constraint and migration
`0011` all carry the eight new ones.

---

## D2 — `appendAuditEntry` now returns the entry id

**T013.** Research R4 makes the audit entry id the coalescing key, which requires the append to
return it. It previously returned `void`.

This creates no read path over the trail (FR-999 survives): the caller already knows what it just
wrote, and there is still no function in `db/queries/admin-audit.ts` that can read an entry back —
`audit-append-only.test.ts` continues to assert that by name-shape.

---

## D3 — `T021`'s conclusion: `join-grants-nothing` and `qa-absences` need no change

Research R11 predicted both would be untouched, and both are.

- **`join-grants-nothing.test.ts`** — joining a conference still grants no write over its content.
  Authoring authority comes from an `organizer_assignments` row, never from a registration, and
  `requireConferenceAuthority` reads the assignment rather than the registration.
- **`qa-absences.test.ts`** — 013 already built the one moderation route, and 014 adds no Q&A
  route. The composer is *closed* on a cancelled session, which is a client-side presentation
  decision recorded in the spec's Assumptions and adds no route to remove or edit a question.

Recorded here rather than left silent, because "the guard was checked and needs nothing" and "the
guard was forgotten" are indistinguishable in a diff.

---

## D4 — three existing guards were amended, and one narrowing is a decision

Research R11 predicted three amendments. All three happened, and one is larger than predicted.

- **`db/seed/catalog.ts`** — the header's *"no write path and no import path at any privilege"* is
  now false and states what is permitted and to whom. There is **still no import path**.
- **`catalog-read-only.test.ts`** — header only. **Not one assertion changed**, which is R1's
  finding and the most useful thing Phase 0 produced: its subjects are the *attendee* query module
  and `CatalogRepository`, and authoring is neither. FR-191 survives literally.
- **`notification-triggers.test.ts`** — a second `DISPATCH_CALLERS` entry, plus a **narrowing that
  is a decision**. Its forbidden-trigger patterns scanned each permitted caller's whole source,
  which was an exact proxy while the only caller was the message-send path. It is the wrong
  population for a catalog module: `routes/admin/catalog.ts` legitimately names *questions* —
  that is an engagement count (FR-1025) — so a whole-module scan would fail on a correct
  implementation, and the natural repair is deleting `question` from the pattern until it checks
  nothing. The population narrowed to **the body of every `notify…` helper**, which is what the
  requirement was always about: not "does this file mention appointments" but "can an appointment
  cause a push". Same shape as 009's narrowing of the event audit's conference-content predicate.

**Two further guards were amended that R11 did not anticipate**, both because 014's architecture is
different rather than worse:

- **`admin-audit-completeness.test.ts`** — a route's module is now its own source **plus the query
  modules it delegates to**. 013 wrote audit entries in route handlers; 014 writes them in the
  query layer, beside the act, so a route *cannot forget* — which is the failure 013's review
  found. Scanning route modules alone reported fifteen unaudited routes that are in fact audited
  more reliably. Its route→module mapping is also keyed on **method as well as URL**, because
  `GET /admin/conferences` and `POST /admin/conferences` now live in two modules.
- **`event-scope-audit.test.ts`** — its administrative-exclusion bound was a two-entry
  enumeration; 014 registers fourteen conference-naming routes. Enumerating them would be fourteen
  paragraphs of the same sentence, and a list nobody reads is a list somebody appends to. The rule
  became **"an administrative route naming a conference must carry `requireConferenceAuthority`"**,
  which is strictly stronger: it demands a guard rather than a paragraph. Its
  no-content-write assertion narrowed to the **attendee surface**, where the rule was always
  absolute; the administrative half became *guarded presence* in a new assertion.

- **`guards-still-in-force.test.ts`** — 013 required the trigger audit be **unedited**. 014 edits
  it, which is the mechanism working rather than failing: v5.2.0 is the conversation that guard
  demanded. It now checks that both admitted triggers are named and that the acts neither feature
  was granted — promotion, demotion, report resolution, reinstatement, a title or speaker change —
  are still absent.

---

## D5 — FR-1028a needed a second half nobody had written down

**T063.** Found by the test, not by reading.

`attendeesToNotify` excludes the acting principal, which satisfies the notification half. But
`sessions.logistics_changed_at` is a property of the **session**, not of a reader — so an organizer
who had saved the session they cancelled was deliberately not interrupted **and then told anyway**,
by a "Changed" marker on their own Agenda row that they cannot dismiss.

`stampMaterialChange` now marks the acting attendee's own `saved_sessions.viewed_at` in the same
transaction. The marker and the notification have to agree; being told twice, once uselessly, is
worse than either.

---

## D6 — no route in 014 changes several sessions in one request

**T061.** A finding rather than a gap, and it changes how FR-1034 is tested.

There is no bulk edit and no bulk cancel, and the two conference-level acts that *could* touch many
sessions at once are both **refused** while sessions exist (FR-1014's orphan check, FR-1015's
timezone freeze). So the coalesced case is a property of the **fan-out and the payload builder**
rather than of any request the product currently offers.

`dispatch-coalescing.test.ts` therefore exercises `attendeesToNotify` against the state a
multi-session act would leave — several sessions carrying one `last_change_act_id` — and
`coalesced-payload.test.ts` asserts the shape somebody's phone would show. `payloadFor` is exported
for that test and for nothing else, which is the note `THRESHOLDS` in `auth/throttle.ts` already
carries for the same reason.

Asserting it now is what makes 015's bulk edit, if it ever exists, correct on the day it ships
rather than the day somebody notices twelve notifications.

---

## D7 — `markViewed` is a repository member, and T077's wording needs reading carefully

**T075.** Research R7 says the marker "adds no repository member". That is true of **reads** and is
the claim that matters: the marker travels on `listSaved`, so no new cached read is declared and
008's `passThrough` trap cannot arise.

Clearing it is a **write**, and the spec's Feature Declarations say so explicitly — *"the one new
attendee-side write — marking a session viewed, which clears the marker — is a write and purges the
conference prefix, which is correct"*. So `SavedSessionRepository.markViewed` exists. T077's
assertion is written against the reads.

The purge is correct rather than tolerated: the programme it clears is the one that just changed.

---

## D8 — two API-layer defects found by running the suite

Neither is in any design document, and both would have shipped.

- **A `Date` bound inside a raw `execute` throws in postgres.js.** There is no column to tell it
  how to encode, so `withinConferenceDays` and `overlappingInRoom` bind ISO strings with an
  explicit `::timestamptz`. Same class as 010's `sql<Date>\`now()\``, which was an assertion to the
  type checker rather than a conversion.
- **Fastify strips what a response schema does not name.** The engagement counts on a refused
  delete and the orphaned session titles on a refused date change were being silently removed from
  their 409s: the route looked correct, the test read `undefined`, and the client would have
  rendered a bare refusal. Declared as `detailedRefusal`, the same shape `retryAfterSeconds` has
  carried on every throttled route since 010.

---

## D9 — the integration fixture had to clean up after itself, and 008 predicted why

Nothing cascades to `events` — `sessions`, `registrations`, `tracks`, `rooms` and `speakers` all
reference it with `NO ACTION`, which is 002's and 008's deliberate choice. A fixture conference left
behind at the end of a file **blocks the next file's `seed()`**, and `seed()` clears `attendees`
first — so the symptom is a later suite failing to find a seeded attendee, in a file with nothing to
do with authoring.

`clearAuthoringFixture` is called before every build **and** in each suite's `afterAll`. The
constitution predicted this exactly: *"The next feature with a non-cascading reference to seeded
content will meet this."*

`push_subscriptions` joined the same clear list: `anEndpoint` mints a fresh endpoint per call —
deliberately, so a re-registration test exercises a real second device — which made a delivery count
count every phone a previous test in the file had registered.

---

## D10 — six explained refusals shared two error codes, and the client rendered two sentences for all of them

**T094. The most consequential defect this feature produced, and the gate written to catch it found
it on the first run.**

`contracts/authoring.md` requires every explained refusal to render **differently from each other**,
and names the reason: 008 classified on the **class**, `ApiError extends RequestRefusedError`, every
non-2xx throws `ApiError`, and one deliberately-reasonless sentence was rendered for 400, 404, 409
and 429 alike — swallowing every message the routes had written to be read.

014 obeyed the resulting rule — *classify on `error.code`, never on the class* — and reproduced the
outcome anyway, from the other end. The authoring routes were written with **four distinct 409
explanations all carrying `refused`** and **two distinct 400 explanations all carrying
`validation_failed`**. `classify` read the code, correctly, and therefore returned two outcomes for
six situations: four rendered *"That could not be completed."* and two rendered *"Something went
wrong."*

The one that mattered most was `has-engagement` — *"cancel it instead, everything they wrote stays
where it is"* — which is the sentence that teaches decision 49's whole rule at the moment an
organizer meets it. It was unreachable.

**The rule needed its other half stated**: *classify on `error.code`* is worth nothing unless the
code says **which** refusal it is. The project already had the pattern — `question_has_votes`,
`own_question`, `conversation_closed` and `report_already_resolved` are each their own `ErrorCode`
for exactly this reason — and 014 had not followed it. Six codes added: `still_referenced`,
`session_has_engagement`, `would_orphan_sessions`, `timezone_frozen`, `outside_conference_days`,
`ends_before_start`.

**Found by the mutual-difference assertion, and by nothing else.** A test checking that each code
maps to *a* message would have passed: every one of them did map to a message. Two of them. That
property is why 013 wrote the assertion the way it did, and this is the first time it has caught
something.

**No contract regeneration followed**, which is worth noting because it looks like an omission: the
response schemas declare a refusal as `{ code, message }` and never enumerate the codes, so
`contracts/openapi.json` is byte-identical. The codes are a client-facing vocabulary the schema does
not constrain.

---

## D11 — T094's file path names the wrong client, and the test lives where the refusals are

**T094.** tasks.md says `apps/web/tests/unit/error-classification.test.ts`. Every refusal 014 adds
is produced by an **administrative** route and rendered by the **administrative** client; the
attendee half of this feature (the cancelled presentation, the marker, removing a cancelled saved
session) adds no new refusal code at all.

So the assertion was added to `apps/admin/tests/unit/error-classification.test.ts` — 013's file,
extended from nine cases to nineteen — rather than written into a new one. **Extending it is the
stronger choice rather than the convenient one**: the property that matters is that all nineteen
outcomes differ from **each other**, and a separate 014-only file could only have compared six
outcomes among themselves while remaining green against a collision with one of 013's.

---

## D12 — T077's "no repository member" is asserted as "no new READ"

**T077**, and the same reading D7 records for research R7. The task's wording is *"no repository
member is added"*; `markViewed` is one, deliberately, with the reasoning in
`SavedSessionRepository`'s own header and in the spec's Feature Declarations.

`marker-not-cached.test.ts` therefore asserts the accurate invariant — the repository gains exactly
one member, it is a write, and **the reads are unchanged at one** — plus the three things R7 rules
out entirely: no device capability, no new repository, and no `passThrough` on a write.

It also asserts `packages/platform/tests/substitution.test.ts` is **untouched since the branch
point**, which is the cheapest possible proof that no capability was added: that file constructs a
double for every one of them, so a new one would not compile against it.

---

## D13 — SC-1004 is timed against the attendee's product, not against the sink

**T078.** The task says the one-minute bound is *"measured against the sink adapter, so it needs no
real push service"*. The sink is an in-process object inside the API and **nothing exposes it over
HTTP** — deliberately: a route that read it would be a test-only endpoint living in production code,
which this project has consistently refused.

Adding one to time an assertion would be a worse trade than the assertion is worth, so
`e2e/authoring.spec.ts` measures the thing SC-1004 is actually about — within a minute of the
organizer acting, an attendee who looks sees the change — and the **dispatch** is asserted against
the sink where the sink lives, in `dispatch-coalescing`, `dispatch-no-savers`,
`dispatch-excludes-actor` and `dispatch-failure-isolation`.

---

## D14 — three absence guards were written too broadly and caught correct code

Each was corrected by narrowing to the population the requirement is actually about, and each
narrowing is recorded because "the guard was scoped deliberately" and "the guard was weakened until
it passed" are indistinguishable in a diff. This is the same class of correction 009 made to the
event audit's conference-content predicate and D4 records for `notification-triggers`.

- **`no-attendee-state-disclosure.test.ts` (T059)** flagged `admin-catalog.ts` and
  `admin-reports.ts` for naming `attendeeId` on an engagement table. Both are correct: the first
  filters `saved_sessions` by the **acting principal's own** id to clear their marker (FR-1028a, and
  D5's finding), the second filters reported questions by the **reported** attendee's id under
  v4.1.0's third Principle VIII exception. Both use it in a `WHERE`; a disclosure needs it in a
  `SELECT`. The rule now matches **projections**, and the one permitted `WHERE` is pinned to the
  `update(savedSessions)` statement that is allowed to have it.
- **`no-derived-relationships.test.ts` (T090)** flagged `routes/admin/reports.ts` for reaching the
  message schema — 013's report queue, again under its recorded exception. Scoped to 014's own
  authoring modules.
- **`no-draft-state.test.ts` (T092)** flagged `appointments.status` — 008's
  proposed/accepted/declined/cancelled, a **relationship between two attendees**, not a visibility
  gate on content. The generic-`status` rule now applies to **conference content only**, where
  `status: 'draft' | 'live'` is exactly how a lifecycle arrives without using the word "published".

**T059's guard was mutation-tested rather than trusted**: a projection naming
`savedSessions.attendeeId` was injected into `admin-catalog.ts`, the guard failed, and the injection
was reverted. T018 established that a gate that cannot fail is not a gate; this is the same check
applied to a gate written later.

---

## D15 — a component test's repository override was silently ignored, and only `tsc` saw it

**T058.** `cancelled-session.test.tsx` passed `overrides: { sessionQuestions: … }` where the
registry member is `questions`. The suite went **green**: the override matched no member, so the
panel used the default stub, and the Q&A assertions passed against a repository the test had not
configured.

Caught by `pnpm typecheck` — `Partial<Repositories>` has no `sessionQuestions` — and not by the test
run, which is the point worth recording. The harness is deliberately typed against the real registry
(`repository-casts.test.ts` exists to keep the unchecked casts gone), and that typing is what turned
a silently-vacuous assertion into a build failure. A test double reached through an untyped bag of
overrides would have shipped green.

---

## D16 — the local clean-verify runner could not pass the administrative end-to-end specs, and had
not been able to since 013

**T100. Found by running `pnpm verify` locally for the first time on this branch, and it is not
014's defect — it is 014's discovery.**

Twelve end-to-end tests failed, every one of them administrative and every one of them on the same
timeout waiting for `POST /admin/session`. Four were **untouched specs from 013**
(`admin-sessions`, `admin-moderation`, `admin-accessibility`), which is what made it clear the cause
was environmental rather than a regression.

`app.ts` allows CORS on administrative routes from `config.adminOrigin ?? false`. Unset means
`false`, so **the browser** refuses every request the admin client makes: nothing fails server-side,
the API answers `/ready` perfectly, and the specs wait for a response that never comes. It is the
same shape as decision 19's original failure — a cookie that was never sent — and it fails just as
silently.

CI has supplied `ADMIN_ORIGIN` since 013, with a comment explaining exactly this and adding *"it
passed locally only because `pnpm start` writes `ADMIN_ORIGIN` into `.env.local`"*. **That sentence
was false.** `.env.local` carries `WEB_ORIGIN` and has never carried this one, and
`scripts/verify-clean.mjs` — the runner whose whole purpose is to mirror the pipeline — allocated a
web port and an API port and did not know a second application existed.

Fixed rather than worked around, because a local runner that cannot reproduce CI is a gate nobody
can use before pushing: `verify-clean` now allocates an admin port in its own band, adds it to the
collision check, and sets **both** `MYNET_ADMIN_PORT` (what Vite serves on) and `ADMIN_ORIGIN` (what
the API allows). The CI comment is corrected in place rather than deleted — CLAUDE.md names that
class of stale claim as 013's most transferable defect, *four functions whose emphatic headers
described call relationships that did not exist*, and a comment asserting a behaviour the script
does not have is the same fault in a different file.

**The lesson survives its own correction and gets sharper**: a value the pipeline supplies by hand
is a value the local runner must supply too, or the two verify different things and the difference
is invisible until somebody runs both.

**A second environmental failure hid behind the first, and it is the reason `verify:clean` exists.**
With `ADMIN_ORIGIN` supplied, a re-run still failed twelve specs — now with *"neither the
bootstrapped nor the chosen administrative password was accepted"*, and this time an **attendee**
spec (`agenda-saved-scoping`) failed too. Cause: 375 accumulated rows in `sign_in_attempts`. That
table is **deliberately not cleared by the seed** — an attacker must not be able to wipe their own
trail by registering and deleting (FR-382) — and it expires on a two-hour sweep, so running the
suite repeatedly against one database inside that window throttles the addresses it signs in with.
Throttled is neither accepted nor cleanly rejected, which is why the symptom looked like a
credential fault.

Nothing to fix: the behaviour is correct and the runner that avoids it already exists. **T100 was
therefore satisfied with `pnpm verify:clean`** — which drops and recreates the database per run —
rather than with a repeated `pnpm verify`. **13/13 gates, 162 end-to-end tests, 754s.**

---

## D17 — the deep review's three Criticals, and the two guards that had to change with them

**Post-implementation deep review** (`review-findings.md`, 52 findings). Recorded here because two
of these fixes **edited existing guards**, and this file exists so that "the guard was updated
deliberately" and "the guard was weakened until it passed" are distinguishable in a diff.

**C1 — `SessionForm` was rendered without a `key`.** All seven fields initialise from
`useState(session?.… ?? default)`, which runs only on mount, and the session list stays rendered
above the form — so clicking Edit on a second session, or "Add a session", reused the instance and
kept the first session's values while `editing.id` was already the second's. Editing one session
wrote another, and because the start time and room had "changed", every attendee who saved the
overwritten session was told it had moved. **One line.** 009 fixed the same class the same way by
keying `PanelNotes` and `PanelQuestions` on the session id. `programme-editor.test.tsx` never
opened the form twice, which is why nothing caught it.

**C2 — the fan-out was awaited inside the organizer's request, one recipient at a time.** Four
round trips per recipient, so `recipients × push RTT`: a thousand savers against a *healthy* push
service is several minutes, against a 10s `connectionTimeout`. The organizer saw a network failure
for a cancellation that had succeeded, and their retry got the 404 `cancelSession` returns for an
already-cancelled session. Five changes, and the first is the only architectural one:

- **`notifications/background.ts`** — work that outlives the response, with a drain. **Not a job
  queue and it must not become one**: no persistence, no retry, no timer. A task exists because a
  request arrived, which is what keeps `no-session-start-trigger.test.ts` true — a scheduler here
  would be the exact mechanism that guard exists to keep out.
- **The drain is called from `server.ts`, not an `onClose` hook.** `buildApp` registers an
  `onClose` that closes the pool and every task needs it; two hooks at the same level leave the
  order to Fastify rather than to anything a reader can check, and backwards means the drain runs
  against a closed pool.
- `subscriptionsForMany` — one query instead of one per recipient.
- Bounded concurrency of 20, and the two subscription writes batched once at the end.
- `web-push` is now passed `timeout`. `dispatchPush` raced every delivery already, but losing a
  race discards the *promise*: the socket had no timeout at all, so every timed-out delivery leaked
  one, and this feature's fan-out is the first that could accumulate hundreds.

**C3 — two guards shelled out to `git merge-base HEAD develop` and could not run in CI.** No
`fetch-depth` anywhere in `verify.yml`, so a PR checkout has no `develop` ref and `execSync` throws;
on a push to `develop` the ref resolves to `HEAD` and the non-vacuity assertions fail instead. The
branch had never been pushed, so **neither guard had ever executed in CI** — they passed locally
because a local `develop` exists. Resolution moved to `tests/support/branch-point.ts`, shared by
both, which tries the PR base then `develop` then `origin/develop`, uses `HEAD~1` when the base
resolves to `HEAD`, and **throws** rather than degrading to an empty diff. That last point is the
requirement: a resolution failure that returned `[]` would make both absence guards pass forever,
which is 010's precache defect exactly.

**The two guards that changed, and why neither is weaker:**

- **`notification-triggers.test.ts`** — `DISPATCH_HELPER` now matches `fanOut` as well as
  `notify\w*`. The dispatch moved out of `notifySavers`, so the extracted region no longer contained
  `dispatchToDevices` and **the positive assertion failed** — the guard working, not failing. The
  region got *bigger*, so every forbidden-trigger pattern is scanned over more code than before.
  D4's rule is unchanged: the population is the body of every dispatching helper, never the whole
  module, because a whole-module scan fails on a correct implementation here.
- **`no-attendee-state-disclosure.test.ts`** — it read `const notifySavers … ): Promise<void>` to
  prove the fan-out answers with nothing. `notifySavers` now returns `void` and `fanOut` returns
  `Promise<void>`, and **both are audited** rather than the one. Auditing only the starter would
  have left the function that actually reads attendee identifiers unchecked.

**Five integration files gained `afterDispatch(app)`.** The fan-out no longer completes before the
response, so `expect(push.delivered())` straight after `inject` was a race. `afterDispatch` is the
same drain `server.ts` calls on SIGTERM — a test awaiting it exercises the production shutdown path
rather than a test-only hook, which is why no test-only endpoint was added. It resolves on settled
promises rather than sleeping, so a passing test cannot pass by being slow.

**Gates after this stage:** typecheck, lint, format, **796 unit**, **650 component**, **1121
integration** — all green.

---

## D18 — the deep review's Important fixes, and the throttle bucket that was wrong twice

**Post-review Stage B/C.** 21 of 26 Important findings and 12 Minors. The full list is in
`review-findings.md`; recorded here are the four that changed a guard, a threshold or a claim.

**`0011` was regenerated a second time, deliberately.** FR-1038 needs the conference on every audit
entry (`admin_audit_entries.subject_event_id`), `session_notes` needed an index on `session_id` —
its three siblings all had one — and `sessions_event_cancelled_idx` served no query and was replaced
by `(event_id, room_id, starts_at)`, which is what `overlappingInRoom` actually filters on.
Regenerating rather than claiming `0012` follows `0009`'s precedent: **`0011` has reached no deployed
database**, nothing is deployed, and `0012` is reserved by 015. The documented procedure was followed
exactly — README moved aside, journal entry removed, regenerate, tag renamed back to
`0011_conference_authoring` with `idx: 10` untouched. The diff against the old file is three lines
and a later `when`.

**`session_notify` was keyed wrongly twice, and the second one is a production fact rather than a
test artefact.** The finding was that a session edit dispatches exactly as a cancellation does while
being charged `session_write` at 120 an hour against `session_cancel`'s 10. The fix bounds the
**interruption** rather than the act, because materiality is only knowable after the write — and
exhausting it skips the push, leaving the act and the in-app marker untouched, which is FR-1032's
existing degradation.

- **Keyed on the principal alone** it was absurdly tight: ten logistics changes an hour is one room
  moved across ten sessions. It is now **(principal, session)**, which is the abuse shape — one
  session toggled repeatedly — and never touches an organizer editing forty different ones.
- **The source dimension at 60** starved. It aggregates every principal and every session behind one
  IP, so ~60 material changes into a suite run every later dispatch was **silently skipped**. A
  conference team behind one venue address would have hit the same thing, and the symptom is
  "notifications randomly stopped" with nothing reproducible. Now 600, as `session_write`'s is.

**Two guards were widened and both are stronger for it.** `no-notification-surface.test.ts` had to
admit `app/NotificationTarget.tsx`, so the allowance is paid for: the new file must **return null**
and must contain no `map(`/`<ul`/`<li`, which is a stronger statement than the old list made about
`NotificationPrompt`. `service-worker.test.ts` asserted that the source *contained* two substrings;
it now **extracts and evaluates** the target expression, and a mutation making the worker always take
the session branch fails it — which the substring version could not see.

**Two new guards, both mutation-tested before being trusted.** `profile-uneditable.test.ts` (cited by
two files, never existed) fails when a profile write is injected into an administrative module; the
engagement-count coverage assertion fails when a table is dropped from the aggregate.

---

## D19 — the integration suite has a cross-file isolation weakness, and it is NOT attributed

**Found while verifying the above, and stated as unresolved rather than fixed.**

Across roughly ten full runs, **exactly one file fails per run, all of its tests, always a different
file, and every one passes in isolation.** The failure is in `beforeAll`, reading a seeded attendee
or operator that is absent — `admin-remove-question`, `conference-authority`, `admin-report-silence`
and `delete-refusal` have each taken a turn. 138 files share one database, run sequentially
(`fileParallelism: false`), and several delete `attendees`/`operators` and re-seed.

`helpers.ts`'s own `assertSeededAttendee` already describes this exact situation — *"a neighbouring
file's `resetDatabase()` (or a partially-applied seed) can remove it … if it recurs, the suite
ordering is the thing to investigate, not this file"* — so the weakness predates this work. What
014's backgrounded fan-out adds is asynchrony that outlives a request, which makes a latent race
likelier to surface. Three places where it could race are now closed:

- `teardown(app)` drains before `app.close()`.
- `clearAuthoringFixture(app)` drains before deleting the rows a fan-out reads and writes.
- `buildAuthoringFixture(email, app)` threads the app through, because that reset is the one that
  runs at the *start* of each test and is therefore likeliest to race the previous one.

**Frequency dropped and the failure did not disappear**, and the residual does not fit the timing
hypothesis: a run against a fresh database failed on a 013 file that dispatches nothing, while an
immediately-repeated run against the same database passed.

**Whether this work caused the residual or merely exposed it is NOT established.** Attributing it
needs a baseline: the suite run several times at the branch point. That measurement has not been
made, and asserting either answer without it would be the kind of claim this file exists to prevent.

**The files observed failing, kept here so they can be checked again rather than rediscovered:**
`admin-remove-question.test.ts`, `conference-authority.test.ts`, `admin-report-silence.test.ts`,
`delete-refusal.test.ts`, `dispatch-excludes-actor.test.ts` — plus `authoring-audit-rollback.test.ts` and the four `dispatch-*.test.ts`
files, which failed only while the `session_notify` source bound was starving dispatches and have
been green since that was corrected. Each failure is the whole file, in `beforeAll`, reading a
seeded attendee or operator that is absent. **The baseline measurement is still owed.**

---

## D20 — FR-1001's update verb, and the refusal detail that never reached a reader

**Two requirements were satisfied server-side and unreachable from the product.** Both are now
delivered, and both needed a fix in a layer below the one the finding named.

**FR-1001's update verb had no surface.** `updateTrack`, `updateRoom` and `updateSpeaker` were
declared, routed and tested — and `apps/admin/tests/support/services.tsx` marked all three
`unexpected(...)`, so *calling one failed a test*. The cost was concrete: **a mistyped room name was
uncorrectable**, because renaming was unreachable and FR-1017 refuses deletion while any session
references the room. An `InlineEdit` control now serves all three, and
`tests/component/catalog-rename.test.tsx` drives each path to the repository rather than merely
finding a button — a control that opens an editor and saves nothing is the same gap one layer up.

**Writing that test immediately found a repeat of the sentinel defect.** `onRename` went through
`write`, which catches every error and resolves, so `.then(close)` fired on a refusal: the editor
closed over an edit the server had rejected, with the explanation appearing elsewhere and the
organizer's typing gone. It now reports acceptance, like `onCreate`. The same defect in three
places in one feature is the argument for the discriminated result rather than a sentinel.

**FR-1014's *"the refusal MUST name the sessions concerned"* was being discarded twice.**
`ApiError` kept only `code`, `message`, `status` and `retryAfterSeconds`, so the detail died at the
**transport** boundary; and `describe` mapped an outcome to a fixed sentence, so even had it
survived, nothing read it. Meanwhile the route declares both fields in its response schema — after a
45-line comment about Fastify stripping what a schema does not name — and `patchConference` runs an
extra ordered query solely to build the list.

`ApiErrorBody` now carries arbitrary detail and `ApiError` keeps it, **opaquely**: the transport
must not learn the shape of any one feature's refusal, so the client that understands `sessions` is
the one that renders it. `describe` takes the detail and **appends** to the fixed sentence rather
than replacing it — a message assembled wholly from server text would have no guarantee it was
written for a reader rather than a log, which is the property this client exists to keep. The
engagement counts on a refused deletion come from the **server** rather than the programme on
screen, because FR-1019a means a save can arrive between the render and the request.

---

## D21 — the deep review's last eleven findings, and the two defects found while closing them

**Post-review Stage D.** D17 fixed the three Criticals, D18 twenty-one Importants and twelve Minors,
D20 the two compliance gaps. Eleven findings remained; all are now closed. Recorded here are the
ones that changed a guard, a threshold or a payload — and the two defects that were **found by the
fixes rather than by the review**.

**`session_notify` was not the only throttle bucket that was wrong.** `PATCH /admin/conferences/:eventId`
was charged `catalog_write` — the bucket whose own comment says it is for *"writing tracks, rooms and
speakers"* — while being the only write that moves the conference's date range (FR-1014's refusal
names every session it would orphan) and the gate on FR-1015's timezone freeze. It now has
`conference_write`, at 30/180.

**The finding underneath it mattered more: nothing bound a WRITE route to its action.** Three
throttle guards existed and none could see this. `throttle-thresholds` asserts the table,
`throttle-actions` asserts which actions may deny, and `throttle-route-audit` binds routes to actions
for **GET routes only** — it was written for FR-803a, which is about polls. So every write route in
the feature could charge any action with all three green. `authoring-throttle-binding.test.ts` closes
it, and the change it exists to stop is not the one that happened: moving `/cancel` from
`session_cancel` to `session_write` collapses the tightest bound in the feature into the loosest and
is **a one-word diff that reads as tidying**. Mutation-tested by reinstating the wrong bucket.

**A defect the fix for M16 uncovered, which the review had classified as a test weakness.**
`service-worker.test.ts` never asserted the notification `tag`, and the value it held was
`agenda-${eventId}` for every coalesced payload — so **two coalesced acts at one conference replaced
each other on screen.** The delivery layer was correct throughout and `dispatch-coalescing.test.ts`
asserts two notifications are sent; the collapse happened in the browser, below where anything was
looking. FR-1028b names that exact failure as its own justification — *"a time-window rule would
suppress a cancellation because a room moved earlier"* — and a shared tag is a time-window rule whose
window never closes.

**The obvious fix was wrong and a guard caught it.** Tagging with `act.actId` groups one act
correctly and ships an `admin_audit_entries` primary key to every attendee's device — which is M7's
leak, from the other end, and `no-admin-surface.test.ts` failed on it immediately (FR-999, FR-1003).
The tag needs only to be *distinct per act*, so it is now an opaque `dispatchId` minted per fan-out,
used once and stored nowhere. **The single-session tag stays `session-<id>` deliberately**: two acts
on one session replacing each other is correct, because the later one is the current truth about it.

**Two guards were satisfiable by documentation, and both are the defect 009 already named.**
`guards-still-in-force.test.ts` — the audit *of the audits* — matched the **raw text** of each guard
it checks, and every one of those guards explains its own absences at length in a header. So
`qa-absences.test.ts` with every assertion deleted and its prose intact still contained "answered",
"pinned", "downvote", "voter" and "bell". It strips comments now, and a gutted-but-documented guard
fails it. Separately, `authoring-absences`' FR-1034a check ended with a filter that discarded every
offender outside three path substrings, applied *after* the exemptions — so a `count:` anywhere else
was thrown away rather than reported. It is an allow-list with reasons now, and **broadening it found
two files nothing had ever examined** (`auth/throttle.ts`, `db/seed/operators.ts`); both count
something else, and both say so.

**`error-classification.test.ts` had the right property over the wrong population.** The
mutual-difference assertion ran on a hand-maintained array, so a fourteenth server code would
classify as `unknown`, render "Something went wrong", and leave every assertion passing. The
population is derived from `apps/api/src/errors.ts` now — a new code fails the admin build until
somebody classifies it or records why an operator never meets it. Writing it surfaced a deliberate
many-to-one that had never been stated: `session_expired` and `not_authenticated` are one sentence
by FR-917, so a merge is permitted only when recorded with the requirement that asks for it.

**Three more, briefly.** The admin programme list rendered **raw UTC instants** while the form three
lines away rendered venue-local wall time with the zone named — and FR-1012 and FR-1014 are both
evaluated in venue-local time, so an organizer told a session fell outside the conference's dates was
reading a clock that could not show them why; `venue-time.ts` now holds the conversion for both.
`CancelDialog` had **no test of any kind**, and its load-bearing rule — "Delete it permanently"
renders only when engagement is zero — was asserted nowhere; the four engagement kinds are now cased
separately, because a single fixture setting all four would pass against a dialog that summed only
`saved`. And `TRACK_TOKENS` was a third hand-written copy of the closed colour set with
`AdminTrack.colorToken` typed `string`; it is `Record<TrackColorToken, string>` now, derived from the
generated contract, which fails in **both** directions. Fixing it exposed that the rename path — added
by D20 — rendered the colour token as **free text**, reachable around the picker FR-1004 exists to
require.

**Two e2e defects, and the second was a real gap rather than a selector.** D20's inline-edit control
made `getByText(TRACK)` ambiguous against "Edit Authoring Track". Behind it, the attendee journey
navigated away **while the join request was still in flight** — `click()` resolves when the event is
dispatched, not when the request finishes — so the join was cancelled and the failure surfaced eighty
lines later as "the conference switcher is not visible". Nothing in that journey asserted the join had
worked; it now waits for the redirect FR-315 produces.

**Gates after this stage:** typecheck, lint, format, **840 unit** (86 files), **670 component** (70
files), **1129 integration** (138 files, real `postgres:17`), contract, production build, budget
(97.2 KB of 150 KB), brand audit, and **162 e2e** — all green. `durability.spec.ts` failed once on a
full run and passed in isolation and on re-run: the assertion reads "Conferences unavailable", which
is the events read racing the API restart that test performs on purpose. Noted rather than fixed,
and it is a different shape from D19's residual.

---

## D22 — merging `develop` collided on five numbering tables, and broke one guard

**2026-08-14, after implementation was complete and the deep review had passed.** `develop` had
moved two commits: **016** (app fixes, mutual card exchange, the install icon) and a shell fix.
Both were authored in parallel with this feature from the same base, so almost nothing here was
code to integrate. It was five independent claims on the same numbers.

**Only three files conflicted, and all three were documentation.** Fifteen code files auto-merged
without a conflict, which is the part worth distrusting rather than the part worth trusting: an
auto-merge is a textual result, not a semantic one. Each was read, and the generated contract was
**regenerated rather than accepted** — a three-way merge of a generated artifact is a guess.

**The five collisions, and how each was resolved:**

| Table | This branch | `develop` | Resolution |
|---|---|---|---|
| Constitution version | 4.2.0 | 5.0.0, 5.1.0 | this rebases to **5.2.0** |
| Standing decisions | 40–44 | 40–44 | this rebases to **45–49** |
| Register entries | 27, 28 | 27, 28 | this rebases to **29, 30** |
| Brainstorm session | 10 | 10 | **both keep 10**; the duplicate is recorded |
| Migration number | `0011` | none added | no collision |

The rule applied throughout is the one this project already had: **merged first keeps the number.**
It was set when 009 and the brand mark were both drafted as 3.3.0, and again when 013 took the next
free feature number rather than the next in its own programme. The brainstorm number is the one
exception, and deliberately: a constitution amendment, a specification and a review-findings
document already cite `brainstorm/10-conference-content-authoring.md` by name, so renumbering the
file would break citations to buy tidiness.

**Substance survived the collision intact, which was not guaranteed.** 5.0.0 is a MAJOR that
retracts two shipped guarantees, and it explicitly declined two candidate notification triggers —
REQ-095 (a Q&A document is published) and REQ-112 (a session is about to start). Neither is this
feature's, and **REQ-112 is refused here too and by name**. 5.0.0 also restates the mechanism this
amendment used — *"'Notification delivery' already requires an amendment per trigger"* — so the two
branches were applying the same rule on the same day without either knowing it.

One sentence in 5.1.0 is now false: *"a received message remains the only thing that dispatches"*.
It is **left standing in its own sync report**, because a prior report records what was decided
when, and editing one to agree with a later decision destroys the only evidence that the two were
taken independently. `CLAUDE.md` — which states current truth rather than history — annotates it.

### The guard that broke, and why it was rewritten rather than patched

`marker-not-cached.test.ts` asserted `expect(members.length).toBe(7)` over `DeviceServices`, with
the seven names spelled out. **016 ratified an eighth** (`InstallService`, constitution 5.1.0), and
the test failed on merge — correctly reporting a real change, and blaming the wrong feature.

The tempting repair is to edit the literal to eight. It would have been green in one character and
wrong in principle: **a guard asserting a product-wide count fails whenever any feature legitimately
changes that count**, so its next maintainer is whoever merges next, forever, and the file records
nothing about who changed what. The property 014 actually owes is narrower and does not expire —
*the capability set is whatever it was at this branch's own base* — so that is what it asserts now.
A feature adding a capability must still edit this file to pass, which is the conversation the guard
exists to force.

**Resolving that base exposed a second defect, latent since the guard was written.** `branchPoint`
returned the **first** candidate ref that resolved, and its order put a local `develop` ahead of
`origin/develop`. This clone's local `develop` was two commits stale, so every diff-aware guard in
the gate was comparing against a two-feature-old base: one failed loudly, and
`changedSinceBranchPoint` silently *widened*, reporting another feature's files as this feature's.
It now keeps the **descendant-most** resolvable base. Every candidate is a merge base of the same
HEAD, so they lie on one ancestry line and the newest is by definition the closest true divergence
point — after which a stale ref can only make the answer older, never wrong.

### Two obligations arrived with the merge and are discharged here

- **5.0.0's C3 — every feature declares its administrative counterpart.** A Principle IX obligation
  and a Feature Declarations row that did not exist when this spec was written, so 014 would
  otherwise have been the one feature that never answered it. Declared: this feature's single
  attendee-facing capability is the marker, and its counterpart is **explicitly none**, because the
  marker is not something an attendee does — it is the product reporting what an organizer already
  did, and the organizer's side of it is this feature's other three user stories.
- **Comment accuracy.** Two headers said "seven device capabilities" and were quietly wrong the
  moment 016 landed, while every test in their files passed, because nothing counted anything. Both
  now name the list and assert *none* rather than *none of seven* — the property no amendment can
  falsify. This is 013's most transferable finding arriving from a third direction: a header is a
  claim that needs a guard like any other.

**Gates after the merge, on `verify:clean` — a database that had never existed, migrated from zero
and then migrated again:** install, typecheck, lint, format, **883 unit** (92 files), **745
component** (82 files), contract, both migration passes, **1145 integration** (141 files, real
`postgres:17`), build, budget and **164 e2e** — thirteen of thirteen, all green. The budget step
declines to judge a development bundle by design, so the production shell was measured separately:
**98.6 KB gzipped against a 150 KB budget**, up 1.4 KB from the pre-merge 97.2 KB.

**T105 is unaffected and still outstanding.** The merge changes nothing about what a person and a
phone still have to walk.

---

# Part II — Tranche 2 deviations (D23 onward)

**Added 2026-08-14.** Everything above is tranche 1's. These record where tranche 2's
implementation departed from the letter of a task or a research sketch — following D14's rule that
"scoped deliberately" and "weakened until it passed" are indistinguishable in a diff unless the
deliberation is written down.

## D23 — T113's index and primary-key order, corrected to what the reasons ask for

T113's letter says `session_enrolments` takes a composite PK `(sessionId, attendeeId)` **and** an
explicit `index(sessionId)`. Written literally, `session_id` would be covered twice (a PK's
leading column serves a single-column predicate) while `attendee_id` — the column the commitment
read and the deletion cascade probe on — would be covered by nothing, which is exactly the 004
token-table defect the task cites in its own justification. The table instead mirrors
`saved_sessions` exactly: **PK `(attendee_id, session_id)` plus `index(session_id)`**. Every
reason the task states is satisfied — the count inside the exclusive lock and the roster read use
the explicit index; the attendee-side read and the cascade use the PK; `ON CONFLICT` infers the PK
regardless of column order in the conflict target.

## D24 — T114 names `company`, which has existed since 004

The task reads "Add `sector`, `subsector`, `productiveActivity` and `company` to
`attendee_profiles`". `company` has been a column of that table since migration `0003`, and
FR-1090's own wording knows it ("the **optional company name it already holds**"). Three columns
were added; the fourth item was a task-authoring slip, recorded rather than silently absorbed.

## D25 — T123's file is wrong: `NOT_ENGAGEMENT` lives in the guard, not the query module

T123 says to add the enrolment entry "in `apps/api/src/db/queries/session-changes.ts`". The list
it describes — `Record<string, string>`, snake_case table-name keys, the >80-character reason —
exists in exactly one place, `apps/api/tests/unit/engagement-coverage.test.ts`, where research R15
verified it line by line. The entry went where the list is. Everything else the task demands (the
four required clauses: whose data, why silent loss is acceptable, the O2 citation, not-precedent,
register entry 31) is in the entry verbatim.

## D26 — `hasEngagement` deleted, per R15's "should carry an explicit task" note

No task number covers it, but research R15's "changes the shape" section asks for it explicitly:
the function named itself "the predicate of record" and had **zero callers and zero importers** —
013's four-times-found defect class, a header asserting a call relationship that does not exist.
Deleted; `ENGAGEMENT_TABLES` survives in `session-changes.ts` as the guard's source of truth; the
two comments that asserted the function was live (`admin-catalog.ts`'s delete note, the module's
own header) were rewritten in the same change, and a tombstone comment marks the site so the next
reader does not "restore" a second expression of one predicate.

## D27 — T138 is discharged structurally, not by a test

"Ensure a lock-wait timeout surfaces as a 500 and is never classified as full or closed." The
enrolment module catches no database errors, so a `55P03` propagates to the generic 500 with its
correlation id — the outcome union has no member for "we do not know", which is `client.ts`'s own
design for the application pool. A test inducing a real lock timeout would need to hold the
session-row lock for the full 3s `lock_timeout` inside the integration suite, serially, per run;
the property it would prove — "no catch block folds 55P03 into a domain code" — is visible in the
module and stated in its header and the route's. Recorded because a reviewer should find this
reasoning, not an omission.

## D28 — T191's server half was pulled forward into the foundational phase

Adding `events.modality NOT NULL` broke conference creation the moment migration `0012` applied —
`createConference` inserted no modality — so the input extension, the `modality_missing` refusal
(FR-1059b) and the shipped-test updates could not wait for US8's phase without leaving the
integration suite red across two user-story phases. The remainder of T191 (the client half, the
FR-1007 rewording) stayed with US8.

## D29 — the profile's sector and subsector are stored as LABELS, not foreign keys

Research R19's lock inventory sketched `sector_id`/`subsector_id` uuid columns referencing the
vocabulary. The shipped model stores the chosen **label** in nullable text columns, mirroring
`attendee_interests` exactly, because R18's later findings apply with equal force here: membership
is enforced at the write against the choosable-or-already-held union (FR-1095b), FR-1094c's
rename refusal is what makes a carried label safe from divergence, and a foreign key would make
"keep a retired value" (FR-1094a) a referential special case instead of the default. It also
avoids an import cycle R19's sketch would have forced (`vocabulary.ts` reads `PROFILE_LIMITS`
from `profiles.ts`, so `profiles.ts` must not import `vocabulary.ts`), and keeps the export a
projection instead of a join.

## D30 — the vocabulary's held-value refusals carry existence, never a number

T173's brief said the delete/rename refusals name "that attendees hold it (count only, never
who)". FR-1099b forbids the administrative product any per-value attendee count — a vocabulary
surface must not become a census — and research R17 requires the holder check to return
existence rather than a count or a roster. The refusals therefore say *that* attendees hold the
value and never *how many*; the tests assert no digit appears in those messages. An existence
answer satisfies both readings of the task; a count satisfies only one, and the one it fails is
the ratified bound. (Found and resolved by the vocabulary implementation; `contracts/tranche-2.md`
is not amended because its wording — "naming that attendees hold it" — already reads correctly.)

## D31 — six shipped integration fixtures typed free-text interests, and FR-1088 refuses that now

`PUT /profile` accepted arbitrary interest strings until this tranche; FR-1088 makes a NEW
interest choosable-only, with FR-1095b keeping every already-held value writable. Six integration
files whose fixtures typed fresh free text were adapted with an `ensureInterestOptions` helper
that authors the values at platform tier first — the honest fixture under the new rule, since a
retained value cannot be fabricated through the API by construction. `profile-persistence`'s
whole-profile draft gained the three taxonomy fields because the export-coverage guard demanded
the document carry them.

## D32 — how far the T196 rename reaches, and the three names that deliberately keep their old identity

T196 orders the repository renamed "from saved-sessions naming to commitment naming", and R13
names the trap: a reviewer-visible name asserting the set holds only saves is FR-1066a's defect
one layer down. The rename was carried through every load-bearing identity: the interface
(`SavedSessionRepository` → `CommitmentRepository`), the row (`SavedSession` → `Commitment`,
growing `commitment: 'saved' | 'place'`), the HTTP class (`HttpSavedSessionRepository` →
`HttpCommitmentRepository`), the registry key (`savedSessions` → `commitments`), the hook
(`useSavedSessionRepository` → `useCommitmentRepository`), the client hook and its file
(`useSavedSessions`/`useSavedSessions.ts` → `useCommitments`/`useCommitments.ts`), the empty
state (`SavedEmptyState` → `MyAgendaEmptyState`), and the row affordance (`SaveAffordance` →
`CommitmentAffordance`, `SaveControl` → `CommitmentControl`).

**Three names keep their old identity, each for a stated reason rather than by omission:**

- **`listSaved` (the method).** The caching decorator's `reads` map and the cache resource key
  (`saved`) are configured against the method name; renaming it would silently retire every
  device's cached commitment set and re-cache under a new resource — a migration bought for a
  name. Documented on the interface, per T196's own instruction.
- **`next-saved-session` (the Home card's registry id).** Four tests pin it, it is the
  registry's append-only key, and it is never rendered to an attendee — FR-1066a's subject is
  attendee-visible strings, which the title (renamed to "Next on your programme") is and the id
  is not. The card's file and component names follow the id and also stay.
- **`RenderedAgenda.saved` (the test harness key).** Test-internal, read at ~30 call sites, and
  the double it exposes carries the honest name (`commitmentsDouble`).

## D33 — the FR-1074 notice confirms on EVERY enrolment, not once per attendee

T147 permits a remembered notice only "if you find a recorded pattern for remembered notices";
none exists in this product — `NotificationPrompt` renders nothing once *the platform* records
an answer, which is browser state, not a per-attendee product preference. A remembered notice
would be new durable per-attendee state nobody specified, with a cross-device hole (told on the
phone, never told on the laptop). So the notice is a confirm step in front of every enrolment:
one extra activation for a repeat enroller, against a disclosure somebody was told about once,
months ago, on another device. Releasing a place asks nothing — the disclosure happens on
taking a place, and withdrawing reduces what is shared.

## D34 — two tranche-1 guards were re-scoped in writing, and one support helper corrected

- **`marker-not-cached.test.ts`** pinned the repository to exactly four members and one read;
  R13 finding 3 orders the amendment. Re-scoped to the property the guard always owned: the
  member set is pinned again exactly (at seven), `places` is asserted `passThrough`-not-cached
  (FR-1070b), and no member may match a change-history shape (`change|history|inbox`) — never
  weakened to "anything goes".
- **`no-admin-surface.test.ts`** gained one documented exemption: the pre-enrolment notice's
  copy names "the organizers of this conference" because FR-1074 requires exactly that
  disclosure, and a word-match heuristic for tier-branching flagged required copy. The
  categorical suite still scans the exempted file for every real branching pattern. It also now
  skips files the feature *deleted* (a rename's old path), which cannot carry a surface and
  cannot be read.
- **`branch-point.ts`'s `changedSinceBranchPoint`** diffed `base..HEAD` and was blind to
  uncommitted work, so the diff-aware guards judged a tree they were not looking at. It now
  diffs the working tree; in CI (clean tree) the two are identical.

## D35 — the attendee programme read changed more than the task's letter, because SC-1022 forced it

The brief for T193 named `kind` and `accessLink`. Delivering SC-1022 also required `room` to
become nullable on the attendee read: `sessions.room_id` is nullable since T111, and the read's
**inner** join on `rooms` would have silently dropped every virtual session from the programme —
a session that exists and cannot be seen. The join is now a left join, `room` is `Room | null`
on the wire and in `Session`, and every render site gained a null guard rendering **no room
line at all**. Two of those sites are other features' Home cards (`UpNext`, `RestOfDay`'s shared
row): the edit is a mechanical null guard forced by the type, recorded here so it is not read as
this feature redesigning cards it does not own. Capacity is deliberately NOT on the read
(FR-1070b), asserted by integration test.

## D36 — T202's end-to-end run found the CORS method list missing PATCH, and fixed one file beyond its brief

The e2e spec for quickstart scenarios 10–13 (`e2e/enrolment.spec.ts`) failed at the room-change
step with the admin client reporting "MyNet could not be reached": `CORS_METHODS` in
`apps/api/src/app.ts` was `['GET', 'POST', 'PUT', 'DELETE']`, and every administrative update
verb — the session edit, the conference editor, the inline track/room/speaker renames — is a
`PATCH`. In the local cross-origin topology (5174 → 3000) the browser's preflight refused all of
them, so **no administrative edit could land in dev or preview at all**, while every route-level
test stayed green — `fastify.inject()` performs no preflight, exactly as the PUT comment beside
that list has warned since 002. In the deployed topology the admin site's `/api/*` is
reverse-proxied same-origin (decision 37), so production was never affected; what was broken was
every local validation of the update verbs, which is the environment T105/T206's by-hand walks
would have used. `PATCH` is added with a comment naming its callers, and the spec now arms a
`waitForResponse` on the PATCH before clicking Save, so a recurrence names itself instead of
surfacing 55 seconds later as a missing marker.

Two smaller e2e repairs travelled with T202, both consequences of tranche 2 reaching tranche 1's
helpers: `authoring.spec.ts`'s `createConference` gained the now-required modality selection
(FR-1059b made the field mandatory with no safe default, so the old helper would stall waiting
for a join code), and the enrolment spec chooses its venue timezone at runtime — a fixed-offset
zone in which the venue clock reads ~05:00 — because the Home card it asserts composes the
attendee's programme for the venue's **today**, and a suite that only passed in some UTC hours
would be the order-dependent flake `attendees.ts` warns about, one clock removed.

## D37 — the post-implementation deep review's fix round, and a second deliberate hand-edit to migration 0012

The tranche-2 deep review (review-findings.md Part II) closed sixteen findings after both full
gates were already green; the changes that need a record here rather than there are two. First,
**migration `0012` was edited by hand a second time**, with its snapshot: the
`sessions_kind_fields` CHECK gained `IS NOT NULL` guards in its optional branch, because the
old expression evaluated to NULL — and therefore passed — for an optional session carrying
neither capacity nor offset. Safe under `0009`'s precedent: `0012` has been applied to no
database beyond this branch's local ones, all three representations (schema, SQL, snapshot)
were changed to byte-identical expressions, and `verify:clean` re-proves fresh-and-twice
application. Second, **`saveSession` abandoned its one-statement shape** — the shape its own
comment defended — for a locked transaction, because the snapshot-read guard it relied on is
exactly what a concurrent kind change slips past; the comment now records the race that forced
the change, so the one-statement version cannot be "restored" as a tidying.

## D38 — the durability redeploy specs gained a reload loop, for a defect of the harness's connection pool rather than of the product

`durability.spec.ts`'s two redeployment tests failed intermittently — twice in three full-suite
runs on this machine, never in isolation — with the workspace cards settled into their offline
failure state after a reload the test performed once. `redeployApi` does wait for `/ready`; what
it cannot control is the browser's keep-alive pool, which may hand the first post-restart fetch
a socket to the dead process. The rejection classifies as offline, the card renders "Try again"
and — by design — never retries itself. The product is behaving exactly as a real deploy window
demands; the spec's one-shot reload was the fragile half. Both tests now look again in a
`toPass` loop, which asserts the durability guarantee as stated — the data is there when the
attendee looks — rather than the stronger, false claim that a restart drops no in-flight
connection.
