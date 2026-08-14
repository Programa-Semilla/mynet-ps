# Deep Review Findings — Conference Content Authoring (014)

**Date:** 2026-08-12 (findings) · 2026-08-13 (all fixes landed)
**Branch:** `spec/014-conference-content-authoring` (never pushed; no upstream)
**Rounds:** 4 — reported, then fixed in four stages recorded as `deviations.md` D17, D18, D20 and D21
**Gate outcome:** **PASS** — 0 Critical, 0 Important, 0 Minor remaining
**Invocation:** manual, from `speckit-spex-gates-review-code`
**Scope:** the working tree, not `HEAD`. 13 modified and 19 untracked files were uncommitted.

## Summary

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| Critical | 3 | 3 | 0 |
| Important | 26 | 26 | 0 |
| Minor | 16 | 16 | 0 |
| Notable | 7 | – | 7 (design-level; captured to `brainstorm/idea-inbox.md`) |
| **Total** | **52** | **45** | **7 observations** |

### Where each fix is recorded

| Stage | Deviation | Covers |
|---|---|---|
| A | **D17** | C1, C2, C3 — the three Criticals, plus the two guards that had to change with them |
| B/C | **D18** | 21 Important, 12 Minor. `0011` regenerated a second time; `session_notify` added |
| C | **D20** | I11, I12 — FR-1001's update verb and FR-1014's refusal detail, both unreachable |
| D | **D21** | I15, I19, I20, I22, I24, S3, M14, M15, M16 — and two defects the fixes uncovered |

**Two findings turned out to be larger than their severity said.** M16 was filed as four test-side
gaps; the fourth was a live defect — the service worker's replacement `tag` collapsed two coalesced
acts into one notification, undoing FR-1028b below the layer any test was watching. And I23 ("nothing
binds routes to throttle actions") was recorded as Important on the strength of one wrong bucket; the
binding it asked for is what stops the tightest bound in the feature being collapsed by a one-word
diff.

**Every fix that changed a guard was mutation-tested** — the guard was made to fail by reinstating
the defect before being trusted, because a guard that cannot fail is what this project records as its
worst class of defect (010's precache assertion).

**Gates: all green.** typecheck, lint, format, 840 unit, 670 component, 1129 integration against a
real `postgres:17`, contract, production build, budget, brand audit, 162 e2e.

**Agents completed:** 5/5. **External tools:** CodeRabbit skipped (CLI not installed), Copilot skipped (CLI not installed).
**Raw findings before dedup:** 65 (61 from agents, 4 from the stage-1 compliance pass). Seven pairs merged.

### Stage 1 — spec compliance

**59/63 (93.7%)**, revised down from an initial 60/63 after the architecture agent found that FR-1001's
update verb is unreachable for three of its four entity types.

| Requirement | Status |
|---|---|
| FR-1001 | **Partial** — no update path for tracks, rooms or speakers (I11) |
| FR-1014 | **Unmet at product level** — no UI reaches it; the refusal cannot name the sessions (S2, I11, I12) |
| FR-1030 | **Partial** — marker absent from Home (S1) |
| FR-1039 | **Deviation** — conference PATCH rides the tracks/rooms/speakers bucket (S3) |
| all others | met |

### Gates run

`pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass. **796 unit** (84 files), **650 component**
(68 files), **1121 integration** (138 files, real `postgres:17`) pass. Not re-run: `contract:check`,
`build`, `budget`, `brand:audit`, `test:e2e` — `deviations.md` D16 records 13/13 gates and 162 e2e
tests via `verify:clean`, taken on trust here.

**Every finding below is one the green suite does not catch.**

### Agent table

| Agent | Found | Fixed | Remaining | Status |
|---|---|---|---|---|
| Correctness | 11 | 0 | 11 | completed |
| Architecture & Idioms | 21 | 0 | 21 | completed |
| Security | 6 | 0 | 6 | completed |
| Production Readiness | 10 | 0 | 10 | completed |
| Test Quality | 13 | 0 | 13 | completed |
| CodeRabbit (external) | – | – | – | skipped (CLI not installed) |
| Copilot (external) | – | – | – | skipped (CLI not installed) |
| Test Suite (regression) | – | – | – | not run (no fixes applied) |

**MVP: Architecture & Idioms (21 findings)** — and the four it found by checking whether cited
guards exist are the highest-value findings in the review.

### The one-line summary

**Three of this review's most serious findings are claims the code makes about itself that are
false** — a test file that does not exist, a function nothing calls that two guards and a
requirement are argued from, and a throttle comment asserting a bound the neighbouring route
does not have. CLAUDE.md names that class as 013's most transferable defect. It recurred here
five times.

---

## Critical

### C1 — `SessionForm` has no `key`, so editing one session writes another. `correctness`

**File:** `apps/admin/src/app/conferences/ProgrammeEditor.tsx:298-308`, `SessionForm.tsx:124-134`
**Confidence:** 85 · **Verified independently by reading.**

`<SessionForm>` renders whenever `editing !== undefined`. All seven fields are
`useState(session?.… ?? default)` — initialisers that run **only on mount**. The session list stays
mounted above the form (`:216-295`), so both triggers remain live while it is open: `setEditing(session)`
on a row's Edit button (`:255`) and `setEditing(null)` for "Add a session" (`:198`). Since `editing`
never returns to `undefined` between them, React reuses the instance and the fields keep the previous
session's values while `editing.id` is the new one.

**Failure:** Edit the keynote (09:00, Hall A), then click Edit on a workshop without closing.
The form still shows the keynote. `submitSession` posts those values to the workshop's id
(`:111-112`). The workshop is silently overwritten — and because its start time and room changed,
`materialChangeOf` returns `'time'`, `stampMaterialChange` fires, and `notifySavers` pushes
*"This session has moved to a new time"* to every attendee who saved it. The heading reads
"Edit session" in both cases. "Add a session" has the mirror defect: it pre-fills with whatever
was being edited and creates a duplicate.

**Fix:** `key={editing ? \`edit-${editing.id}\` : 'new'}`. 009 established the pattern by keying
`PanelNotes`/`PanelQuestions` on the session id (`SessionPanel.tsx:287,310`).

**Why nothing caught it:** `programme-editor.test.tsx` never opens the form twice.

---

### C2 — the push fan-out is awaited in the organizer's request, one recipient at a time. `production-readiness`

**File:** `apps/api/src/routes/admin/catalog.ts:1003-1045`, awaited at `:751` and `:793`
**Confidence:** 93

`notifySavers` walks recipients strictly sequentially with four round trips each —
`subscriptionsFor`, `dispatchToDevices` (per-delivery timeout 3,000ms, `config.ts:461`),
`discardSubscriptions`, `recordDelivery`. No concurrency limit, no recipient bound, nothing
backgrounds it.

**Failure:** duration is `recipients × (push RTT + 3 queries)`. A 1,000-saver keynote against a
*healthy* push service at ~200ms is **200–350 seconds**; against a hanging one, ~50 minutes.
`app.ts:84` sets `connectionTimeout: 10_000`, so the organizer's socket is destroyed after 10s and
they see a **network failure for a cancellation that succeeded** — and their retry gets the 404
`cancelSession` returns for an already-cancelled session (`admin-catalog.ts:663`). The detached
handler keeps running for minutes, holding one of ten pool connections (`db/client.ts:24`).
Separately, `dispatchPush` races a timeout but **abandons rather than cancels**: `web-push` accepts
a `timeout` option and `web-push-adapter.ts` never passes one, so each timed-out delivery leaves a
live socket to a third-party host with no timeout at all.

`session_cancel`'s 10/hour bounds the number of acts, not the cost of one.

**Fix:** reply first and run the fan-out detached from the response (still request-driven, so
`no-session-start-trigger.test.ts` stays satisfied); bounded concurrency in chunks; one
`WHERE attendee_id = ANY(...)` for subscriptions; batch `discardSubscriptions`/`recordDelivery`
once; pass `timeout: dispatchTimeoutMs` into `sendNotification`.

---

### C3 — two absence guards shell out to `git` and cannot run in CI. `test-quality`

**File:** `apps/web/tests/unit/no-admin-surface.test.ts:64`, `apps/web/tests/unit/marker-not-cached.test.ts:93`
**Confidence:** 85 · **Verified: no `fetch-depth` anywhere in `.github/workflows/verify.yml`; the branch has no upstream.**

Both run `execSync('git merge-base HEAD develop')`. Every `actions/checkout@v5` in `verify.yml` uses
the default depth-1 with no `fetch-depth`, so a PR checkout has no `develop` ref and `execSync`
throws. On the `push: [develop]` trigger `develop` resolves to `HEAD`, so the diff is empty and the
two non-vacuity assertions (`.toBeGreaterThan(3)`, `.toBeGreaterThan(5)`) fail instead. These are
the only two tests in the repository that shell out to git, so no precedent makes them work.

**The branch has never been pushed, so neither guard has ever executed in CI.** They pass locally
only because a local `develop` ref exists.

**Why it matters more than a red build:** these are the diff-aware FR-1003 re-assertion and the
"`substitution.test.ts` is unchanged" proof that no eighth device capability was added — 014's two
most feature-specific guards. The cheapest repair when `test-unit` goes red on an unrelated PR is
`try { … } catch { return [] }` or `it.skipIf`, which reproduces **exactly** the 010 defect this
project records as its worst: a guard that skipped on every CI run while appearing to pass.

**Fix:** add `fetch-depth: 0` to `test-unit`, resolve the base as
`git merge-base HEAD "${process.env.GITHUB_BASE_REF ? 'origin/' + GITHUB_BASE_REF : 'develop'}"`,
and assert the base is not `HEAD` so a wrong comparison reports itself.

---

## Important

Grouped by theme. `[2×]` marks findings two agents reported independently.

### False claims in comments — the recurring class

| # | Finding | Evidence |
|---|---|---|
| **I7** | **`tests/unit/profile-uneditable.test.ts` does not exist.** Cited by `admin-catalog.ts:355` and `CatalogForms.tsx:240` as FR-1006's guard — the first saying explicitly *"asserts it over the whole administrative surface rather than trusting this paragraph."* FR-1006 and FR-1042 are absence requirements with no absence guard. | **Verified: `find` returns nothing.** |
| **I8** | **`engagementCountsFor` has no caller.** The module header nominates it as FR-1025/FR-1042's enforcement point, and `notification-triggers.test.ts:92` justifies narrowing its scan by what it returns. The refusal path calls the module-private `countEngagement` instead, and this function's own header claims otherwise. | **Verified: only its definition and prose mentions.** |
| **I9** | **`stampMaterialChange` is exported and its header names the wrong caller** — *"Called by the route"*; the only callers are `updateSession:584` and `cancelSession:678`, in the same file. The export lets any future module holding a scope stamp `logistics_changed_at` with an arbitrary `actId`, setting markers and pointing the coalescing key at an unrelated audit entry, with no entry of its own. | `admin-catalog.ts:774-820` |
| **I3** | **The `session_cancel` throttle comment asserts a bound the next route does not have.** It reads *"cancelling a session: **the only authoring act that reaches attendees' phones**"* and sets 10/hour. `PATCH …/sessions/:id` also dispatches, at `session_write` = **120/hour**. An organizer can toggle a room back and forth 120 times an hour, each act pushing the session title to every saver's lock screen; coalescing does not help, because it bounds one act per attendee and there are 120 acts. | **Verified: `throttle.ts:625-715`.** |
| **I20** | **`sessions.test.ts` never passes `cancelled = true`.** The parameter exists with a comment saying it *"is what lets that asymmetry be asserted rather than described"*, and `cancelled-session.test.tsx:26` states as fact that the unit layer asserts it. Neither is true; the component layer alone covers FR-1022a. | **Verified: no fixture uses the third argument.** |

### Authorization and validation

| # | Finding | Evidence |
|---|---|---|
| **I2** | **`createConference` is the only write in `admin-catalog.ts` that never verifies scope membership.** Nineteen functions open with `assertVerifiedConferenceAuthority(unverified)`; this one calls no assert and its parameter is named `operator`. It is the highest-value write in the feature, because the `organizer_assignments` row it inserts is what `requireOperator` later reads to decide somebody is an administrator. The `WeakSet` exists because a private-field class was defeated five ways, each compiling cleanly. | **Verified: 19 asserts, none here.** |
| **I1** `[2×]` | **`timezone` is never validated as an IANA zone** on either conference write path — route schema is `string`, 1–80 chars, and the admin form is bare text. The seed validates it twice (`seed/events.ts:111-118` `Intl` probe, `:178-183` `pg_timezone_names`) and neither guard was carried across. Server: `AT TIME ZONE` raises, so **every** subsequent session write 500s and the conference can never be populated — and there is no conference-delete route at any tier. Client: `sessions.ts:35` throws `RangeError` during render, so every attendee who joins with the minted code gets an uncaught render error. A typo is enough. | correctness + security |
| **I4** `[2×]` | **`patchConference` never checks `endsOn >= startsOn`** where `createConference` does. With no sessions, the inverted range reaches the `UPDATE` and violates `events_ends_on_after_starts_on` as a **500**, for input that returns a clean 400 on create. With sessions, every row reports as orphaned, so the organizer is told to move forty sessions rather than that their dates are backwards. | correctness + architecture |

### Requirements not delivered to the reader

| # | Finding | Evidence |
|---|---|---|
| **I11** | **FR-1001's update verb is unreachable for tracks, rooms and speakers.** `updateTrack`, `updateRoom`, `updateSpeaker` and `patchConference` have no caller in `apps/admin/src`, and the admin harness marks all four `unexpected(...)` — calling them *fails a test*. A mistyped room name is uncorrectable: renaming is unreachable and FR-1017 refuses deletion while any session references it. FR-1014's orphan refusal, FR-1015's timezone freeze, `patchConference`'s whole two-refusal body, three of the six new error codes and half `detailedRefusal` are unreachable from the product. `timezoneEditable` — surfaced by the server specifically so a control could be disabled — is read by nothing. | **Verified by grep.** |
| **I12** | **The admin client never reads `error.details`.** FR-1014 requires the refusal to *name the sessions concerned*; `patchConference` runs an extra ordered query to build that list, the route declares `detailedRefusal` after a 45-line comment about Fastify stripping undeclared fields, and `classify`/`describe` reduce it to a fixed sentence with no names. A refused delete likewise drops the server's authoritative counts — which may differ from the stale programme read, FR-1019a's whole point. | **Verified: no `.details` in `apps/admin/src`.** |
| **I10** | **The audit entry omits the conference.** FR-1038 requires *"the principal, **the conference**, the act, the entity acted on and the instant"*. `recordCatalogAct` drops `scope.eventId`; there is no column. For six of eight actions the conference is recoverable only by joining the subject row back — and for `delete_catalog` and `delete_session` that row is gone, so those entries are permanently unattributable. FR-999 forbids a read path, so the gap is invisible until somebody needs the record. | `admin-catalog.ts:1195-1233` |
| **I5** `[2×]` | **`ProgrammeEditor.write()` uses `undefined` as its failure sentinel**, and `cancelSession`/`deleteSession`/every delete resolve to `undefined` on **success**. So: a successful delete never closes `CancelDialog` (`:335-337` tests `result !== undefined`, never true) and leaves the organizer on a stale confirmation whose button now 404s; a refused cancel **closes** the dialog (`:316-323` closes unconditionally), so `setRemovalFailure` renders for zero frames and the refusal is silently swallowed — reachable via the ordinary 429 and via the 404 for an already-cancelled session. Every `.catch(onFailure)` in `CatalogForms.tsx` is dead code, and the field-clearing `.then()` runs on a refused create, destroying what the organizer typed — 009's defect 2/3 on the organizer side. The comment at `:328-334` argues for the exact inverse pair. | correctness + architecture |
| **I6** `[2×]` | **`notificationclick` discards `data.eventId`**, which `payloadFor` deliberately sends and the `push` handler deliberately stores. The active conference is server-side per-attendee state. An attendee with conference B active, notified about a session in A, lands on `/agenda/<sessionA>`, which resolves against B's programme and renders *"That session is not available to you."* — while `markViewed` still fires and **clears the marker for the change they never saw**. A coalesced payload lands on `/agenda` showing the wrong conference with no markers. Multi-conference membership is a core product property, so this is the ordinary case, not an edge. FR-1029 and FR-1034b both unmet for it. | correctness + architecture |
| **I13** | **Reinstating a session leaves the "Changed" marker set.** `reinstateSession` deliberately does not clear `logistics_changed_at`, and its comment claims *"so no marker appears"*. But reinstatement is only reachable after cancellation, which stamps it — so every saver who has not opened the session carries a marker on a session that is once again exactly as it was. `SessionRow` suppresses `ChangedChip` while `cancelled` is true, so the marker is hidden during cancellation and **appears on reinstatement**: the precise opposite of the comment. The marker then means "something happened and we will not say what". | `admin-catalog.ts:683-721` |
| **S1** | **FR-1030's marker is absent from Home** (stage 1). No Home surface renders it: `RestOfDay` passes no `changed` and cannot know the saved set; `NextSavedSession` reads the flag and projects it away. Cancellation *is* visible on Home via `session.cancelled`; a **time or room change** produces no marker there and no clears-on-view behaviour. T076 is checked off claiming "the Agenda row and Home". | `NextSavedSession.tsx:47` |
| **S2** | **FR-1014's orphan check tests only `starts_at`** while `withinConferenceDays` tests both ends, under a comment claiming they *"agree by being the same expression"* (stage 1). A session crossing venue-local midnight into the final day survives a range shrink with its end outside the conference — the state FR-1012 forbids. | `admin-catalog.ts:883-890` |

### Duplication, indexes, and lock cost

| # | Finding | Evidence |
|---|---|---|
| **I16** | **`session_notes` has no index on `session_id`** — only the composite PK `(attendee_id, session_id)`. Three 014 paths filter by `session_id` alone (`readProgramme`'s per-session subquery, `countEngagement`, `hasEngagement`). PostgreSQL 17 has no btree skip scan, so each probe full-scans a table holding **every attendee's notes for every conference**, and a scalar subquery is not decorrelated — a 500-session programme read is 500 full scans. `ProgrammeEditor` re-reads the programme after every write. Its three siblings are all covered, including one added by this very migration. | **Verified against all four schema files.** |
| **I14** | **The four-table engagement aggregate is written three times** — `countEngagement`, `readProgramme`'s correlated version, and `hasEngagement`. Only the third is covered by `engagement-coverage.test.ts`, which derives `ENGAGEMENT_TABLES` from the schema. FR-1018a exists because *"an enumerated list is a list that ages"*; the guard was built for one of three expressions. A later `session_reactions` table gets a correctly-refusing delete and two under-reporting counts — so `CancelDialog` computes `engaged` from a count that says zero and offers "Delete it permanently" for a session the server refuses to delete. | `admin-catalog.ts:743-772`, `:1099-1125` |
| **I18** | **`deleteSession` runs both `hasEngagement` and `countEngagement` under `FOR UPDATE`** — eight subqueries where four would do, one of them the unindexed `session_notes` scan. The lock conflicts with attendees' saves by design, so every statement inside it is queue time for them; and the refusal path, which is the *common* path for a popular session, is the one that holds it longest. `countEngagement`'s four integers already answer the boolean. | `admin-catalog.ts:616-641` |
| **I17** `[2×]` | **One `try` wraps the whole recipient loop in `notifySavers`.** `subscriptionsFor`, `discardSubscriptions` and `recordDelivery` are ordinary database calls that can throw; if recipient #1 throws, recipients 2..N are silently abandoned with one log line and a 200 to the organizer. At a 1,000-saver keynote a single transient pool error means 999 attendees never learn their session was cancelled, and nothing records that they were owed one. `dispatch.ts` holds the per-**device** invariant in capitals; the boundary 014 introduced does not hold it per **recipient**. | production + architecture |
| **I15** | **The admin programme list renders raw UTC ISO instants** (`{session.startsAt} → {session.endsAt}`) while `SessionForm` renders the same values as venue-local wall time with the zone named. FR-1012's refusal is evaluated in venue-local time, so an organizer reading UTC cannot see why a session is "outside the conference's dates" — and every late-evening session shows the wrong day in a westward zone. The conversion helpers are private to `SessionForm`; the web app centralises the equivalent in `sessions.ts` precisely so it is decided once. | `ProgrammeEditor.tsx:237-239` |

### Tests that do not test what they are named for

| # | Finding | Evidence |
|---|---|---|
| **I19** | **No test anywhere observes `changedSinceViewed: true`.** The only two assertions are `false`. `POST …/viewed` is exercised once, for its status code. So the marker's entire read-side mechanism — `coalesce(logistics_changed_at > viewed_at, false)` — and `markSessionViewed`'s clearing effect are asserted only in the negative. An inverted comparison, a `coalesce` swallowing a correct result, or an `UPDATE` matching nothing all stay green. FR-1030 and US3 scenario 2 have no positive server-side assertion. | **Verified by grep.** |
| **I21** | **`dispatch-failure-isolation.test.ts` pins no isolation.** Every case seeds exactly one recipient with one device, and the throw is swallowed one layer below the code under test (`dispatchPush` catches and returns `'failed'`), so `notifySavers`' own catch is never reached by any test. It proves "the act survives when every delivery fails" — weaker than, and different from, what the assertion messages claim. The `'gone'` branch is never exercised on the authoring path. | `:66-89`, `:220-276` |
| **I22** | **`CancelDialog` has no test of any kind.** Its load-bearing rule — "Delete it permanently" renders **only** when engagement is zero, so an organizer never meets a control that answers 409 — is asserted nowhere. `e2e/authoring.spec.ts:186` writes the rule out as a *comment* and then only clicks "Cancel the session"; it never asserts the delete button is absent. The un-engaged branch is never rendered by any test. Inverting `engaged` or rendering the button unconditionally ships green. | **Verified: no test names `CancelDialog`.** |
| **I23** | **Nothing binds routes to throttle actions.** `throttle-thresholds.test.ts` asserts the *table* — that five keys exist and two are tighter. No test asserts which route charges which action, so `PATCH /admin/conferences/:eventId` rides `catalog_write` unnoticed (S3), and changing `/cancel` to `session_write` — collapsing the tightest bound in the feature into the loosest — is a one-word diff that reads as tidying. | `:206-295` |
| **I24** | **`error-classification.test.ts`'s mutual-difference assertion runs over a hand-maintained array.** The shape is right; the population is a copy. Nothing derives `CASES` from the `ErrorCode` union or from what the routes throw, so a fourteenth code classifies as `unknown`, renders "That could not be completed.", and every assertion still passes — because `new Set(outcomes).size === CASES.length` is a statement about the list. This is the defect 014 already hit once, from the other direction; the engagement predicate got a schema-derived guard for exactly this reason and the error map did not. | `:30-138` |

---

## Minor

| # | Finding | File |
|---|---|---|
| M1 | `logisticsChangedAt` stamped with Node's clock, `viewed_at` with PostgreSQL's, then compared in SQL — the two-clock defect `throttle.ts` was rewritten to eliminate. Node running behind suppresses the marker for a real cancellation; ahead makes it unclearable. | `admin-catalog.ts:793-796` |
| M2 | `toggle` never updates `changed`, so unsaving a marked session leaves the chip on a row the attendee disowned until the next `listSaved`. | `useSavedSessions.ts:134-160` |
| M3 | All three "add" handlers clear their fields on **resolution**, not success — `write` never rejects — so a refused create wipes what was typed. 009's defect again. | `CatalogForms.tsx:72-79,216-221,336-348` |
| M4 | `markViewed` fires on every panel open regardless of status or marker; it runs while loading, while failed, and for sessions not in this conference — clearing markers for changes never seen. | `SessionPanel.tsx:156-159` |
| M5 | `markViewed` purges the whole conference cache prefix on **every** panel open. Ten sessions browsed = ten full offline-cache purges, nine of them for sessions that never changed. 008's `slots` defect from the other side. | `services.ts:168-174` |
| M6 | `mintJoinCode` uses `byte % 31` with no rejection sampling — `256 mod 31 = 8`, so `A`–`H` are ~12.5% likelier. Harmless for a registration code; 015 is chartered to rotate and revoke these. | `admin-catalog.ts:1358-1365` |
| M7 | `readProgramme` spreads the whole session row into a response declared `additionalProperties: true`, shipping `logisticsChangedAt` and `lastChangeActId` — an `admin_audit_entries` primary key — to any admin session. FR-1038 forbids a read path over the trail. | `admin-catalog.ts:1080-1149` |
| M8 | No index on `last_change_act_id`, in a function whose header calls the lookup *"a single indexed read"*; the query also carries no event predicate, so it scans `sessions` product-wide on every material change. | `session-changes.ts:178-190` |
| M9 | `sessions_event_cancelled_idx` serves no query — `listSessions` only projects `cancelled_at`, the "Up next" filter is client-side, and `overlappingInRoom` wants `(event_id, room_id, starts_at)`. Unused write cost, justified by a query that does not exist. | `schema/catalog.ts:259-263` |
| M10 | The only fan-out log fires **inside** the loop, once per recipient, saying "fan-out complete" with no recipient context — and nothing at all logs when nobody was owed a notification. A dropped notification is indistinguishable from one nobody was owed. | `routes/admin/catalog.ts:1016-1043` |
| M11 | `schema/admin-audit.ts` says pseudonymisation clears both references *"in one statement"*; the implementation uses two, and `admin-audit.ts:221-240` explains at length why one would be a data-loss bug. Two comments on one mechanism asserting opposites. | `schema/admin-audit.ts:100-105` |
| M12 | The module header's *"EVERY FUNCTION TAKES [a transaction]"* is false for three exported functions (`readProgramme`, `overlappingInRoom`, `engagementCountsFor`). The guard covers the `appendAuditEntry` call sites, not this claim. | `admin-catalog.ts:58-71` |
| M13 | `validateTimes` returns `'not-found'` → 404 "That is no longer available" for a malformed timestamp, which is a 400. `'not-found'` also stands for "the insert returned no row" at four sites. | `admin-catalog.ts:1234-1239` |
| M14 | `CreateConferenceDialog` has three close paths resetting different state, and `AdminDialog` never unmounts — so reopening after a refusal announces a stale `role="alert"`, and after a success prefills the previous conference. | `CreateConferenceDialog.tsx:98-134` |
| M15 | `TRACK_TOKENS` is a third hand-maintained copy of the closed colour set, with `AdminTrack.colorToken` typed as bare `string`, while `contract.ts` already owns the mechanism (`Satisfies<>`) for binding it to the generated enum. | `CatalogForms.tsx:26-32` |
| M16 | Four test-side gaps: `dispatch-coalescing`'s FR-1034b case inspects no payload (duplicate of the test above it); `authoring-absences`' FR-1034a guard ends with a path filter that discards every offender outside three substrings; `guards-still-in-force` matches raw text including the prose it audits, so it is satisfiable by documentation; `service-worker.test.ts` never asserts the `tag` rule, under which two coalesced acts **replace** each other — the outcome FR-1028b forbids. | various |

---

## Notable observations

Design-level, not defects. Captured to `brainstorm/idea-inbox.md`.

| # | Observation |
|---|---|
| N1 | `createConference` reports three unrelated outcomes as the same 404 — join-code exhaustion, no live platform operator, and an impossible empty insert. A misconfiguration an operator must act on renders as "That is not available." |
| N2 | `materialChangeOf` treats a time or room edit on an **already-cancelled** session as material, pushing "moved to a new time" for something that is not happening — while `SessionRow` suppresses the in-app marker, so the push arrives with no counterpart. |
| N3 | A creating organizer's self-assignment names an uninvolved platform operator in `assigned_by`, so `organizer_assignments` shows a grant that never happened, and the compensating record is the trail FR-999 forbids reading. Separately: `requireOperator` admits anyone with *any* live assignment, so an organizer being wound down can outrun per-conference revocation by creating conferences. |
| N4 | Drizzle wraps all pending migrations in one transaction, so `0011`'s `ACCESS EXCLUSIVE` locks on `sessions` and `saved_sessions` are held until the last statement commits — including a CHECK validation scan and three non-concurrent index builds — while `deploy.sh` runs it under live traffic. `lock_timeout` bounds waiting, not holding. |
| N5 | `listConferences` selects every event in the product with no `LIMIT`, filtering an organizer's down in JavaScript — and 014 is what makes `events` grow at runtime. |
| N6 | FR-1034's coalescing is structurally unreachable: `stampMaterialChange` is only ever called with one session, so no recipient can carry two. SC-1012's stated verification method cannot be performed against any request the product offers. |
| N7 | Migration numbering now has a permanent skew (`idx: 10` / tag `0011` / `0010_snapshot.json`) to reserve a number for a feature that adds no schema. Third such collision; worth a policy rather than three deviations. |

---

## Gate outcome

**PASS, after four fix stages.** All 45 defects are closed; the seven Notables are design-level
observations and stay in `brainstorm/idea-inbox.md`. The flow-state gate can now be stamped: the
reason it was withheld — three open Criticals — no longer holds.

**The compliance table above is superseded.** FR-1001's update verb reaches tracks, rooms and
speakers through `InlineEdit` (D20); FR-1014's refusal names the sessions and the client renders them
(D20); FR-1030's marker is on Home (D18); and FR-1039's conference PATCH has its own throttle bucket
with a test binding every write route to its action (D21). Stage-1 compliance is **63/63**.

**One requirement was found unmet that the compliance pass had scored as met.** FR-1028b — *"two acts
an hour apart produce two notifications"* — was satisfied at the delivery layer and defeated in the
browser by a shared notification `tag`. It was reported as M16, a test-side gap, because the review
correctly noticed nothing asserted the tag and did not evaluate what the tag held. Writing the
assertion is what found it.

---

### Historical: why no fix loop ran at the time

Retained because it records a decision rather than a state. **The reasoning still stands** — the
findings it names as decisions rather than repairs were each taken deliberately, not applied
unattended.

**FAIL.** The skill's fix loop applies Critical and Important fixes autonomously, without approval.
It was **not** run, deliberately, for two reasons:

1. **Manual invocation is advisory.** The skill's own gate behaviour says: *"Manual context … PASS or
   FAIL: Advisory only. Report findings and let the user decide."* This review was invoked directly.
2. **A large share of these are decisions, not repairs.** I11 is building UI that does not exist.
   I10 needs a column and a migration, on a `0011` already applied locally. I13 is a product question
   about what a reinstated session should look like. M9 is dropping a shipped index. I3's fix changes
   what the notification platform is allowed to do. Applying those unattended, to a feature that is
   otherwise green, would convert a review into an unreviewed rewrite.

**The flow-state gate is deliberately not stamped.** `running: review-code` stands and
`review_code_passed` is unset, because the skill's Step 10 would record a pass while three Criticals
are open. That is a knowing deviation from a step marked mandatory, and it is recorded here rather
than done silently.

### Suggested order

*(Followed, with two departures. C1–C3 and the Important clusters went in the order below across D17,
D18 and D20. The compliance gaps at step 6 were **not** all "decisions about spec or code" in the
end: S1 and S2 were repairs, I11 and I12 were built, and only I13 was a product question — answered
by clearing the marker on reinstatement, since the comment claiming it produced none was describing
the opposite of what happened. Step 7's test findings were done last, as suggested, and two of them
turned out to be defects.)*

1. **C1** — one line, real data loss, ships a false notification. Fix first.
2. **C3** — one CI setting plus two base resolutions. Until it lands, two absence guards are decorative.
3. **I1, I2, I4** — small, self-contained, each closes a 500 or an unguarded write.
4. **C2, I16, I17, I18** — the fan-out and its lock and index costs. One coherent piece of work.
5. **I7, I8, I9, I3, I20, M11, M12** — the false-claim cluster. Cheap, and each one currently
   misleads the next reader.
6. **S1, S2, I11, I12, I13** — the compliance gaps. Each needs a decision about spec or code.
7. The test findings (I19, I21–I24, M16) alongside whichever fix they cover.
