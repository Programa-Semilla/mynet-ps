# Research: Conference Content Authoring (014)

Phase 0 output. Eleven questions, each resolved with the alternatives that were rejected and why.
Three of them (R1, R2, R3) changed the shape of the plan.

---

## R1 — Where the catalog write path lives, and whether the read-only guard must be weakened

**Question**: `apps/api/src/db/queries/catalog.ts` states in its own header *"There is no write path
in this file, and there must not be one (FR-132, FR-134)"*, and
`apps/api/tests/unit/catalog-read-only.test.ts` asserts it. CLAUDE.md names both among the five
guards enforcing the reversed prohibition, each of which "must be amended deliberately, never
weakened until it stops checking anything". Authoring is a write path into the catalog. How much of
the guard has to go?

**Decision**: **None of its assertions.** The administrative write path is a **new file**,
`db/queries/admin-catalog.ts`, whose functions take an `OperatorScope` refined by conference
authority (R2) rather than an `EventScope`. `catalog.ts` keeps its `EventScope` signatures and stays
read-only, and `CatalogRepository` in `packages/data` gains no write method.

What changes is **two header comments**: `catalog.ts` must say that a write path now exists
elsewhere and why it is not here, and `catalog-read-only.test.ts` must say that its subject is the
attendee read path specifically. The test's assertions — exports are reads only, the repository
interface declares no write method — remain true and remain valuable.

**Rationale**: the guard turns out to have been asserting the right thing all along. Its two
subjects are the **attendee-scoped query module** and the **client-facing repository interface**,
and neither is where authoring belongs. An `EventScope` is minted by `requireEventAccess` from an
*attendee's* registration; an organizer authoring a conference they are assigned to has no
registration and should not need one. Widening `catalog.ts` would have forced exactly that
conflation.

This also preserves the architectural invariant CLAUDE.md states as **"`CatalogRepository` is
read-only in perpetuity, asserted by name-shape over its exports"** — literally, rather than by
reinterpreting "in perpetuity" to mean "until 014".

**Alternatives considered**:
- *Add write functions to `catalog.ts` behind a scope union.* Rejected: it makes one module serve
  two principals with two authority models, and the name-shape assertion would have to be narrowed
  to a list of permitted write names — the "weakened until it stops checking anything" failure mode
  the guard's own comment warns about.
- *Add write methods to `CatalogRepository`.* Rejected: the attendee client would carry an interface
  it may never call, and the absence FR-1003 asserts would become a matter of routing rather than of
  shape.

---

## R2 — The authority predicate: may this operator write to this conference?

**Question**: 013 shipped `requireOperator` (authenticated, either tier) and
`requirePlatformOperator` (platform tier, organizer refused with 404). Neither answers the question
every authoring route asks. Does 014 need a new guard, and if so what shape?

**Decision**: **Yes — a fifth guard**, `requireConferenceAuthority`, minting a
`ConferenceAuthorityScope` that carries the operator, the tier, and the conference id. It succeeds
for a **platform operator over any conference** and for a **conference organizer over a conference
they are assigned to**, and refuses everything else with the **same 404** every other administrative
refusal produces.

The scope is a **branded type in the shape the other four establish** (`EventScope`,
`ConversationScope`, `CardScope`, `VerifiedOperatorScope`), constructible only by the guard, and it
is what `admin-catalog.ts` demands. A handler that skipped the check cannot call the write layer —
it does not compile.

**Rationale**: this is the single largest piece of new construction in the feature, and it is
unavoidable. Conference authority is genuinely a third predicate: not attendee registration
(`EventScope`), not tier (`requirePlatformOperator`), but the join between an operator and a
conference. Expressing it as a scope rather than an early-return check is what makes 013's lesson
hold — **four functions in 013 carried emphatic headers describing call relationships that did not
exist**, and a type the write layer demands cannot drift that way.

**The 404 matters here for the same reason it does on the report queue.** A 403 would tell an
organizer that a conference exists and that somebody else runs it, which is an enumeration oracle
over the conference list.

**Alternatives considered**:
- *Check assignment inside each query function.* Rejected: five call sites, each able to forget, and
  the check would be invisible to the route audit.
- *Extend `VerifiedOperatorScope` with an `eventIds` array.* Rejected: the scope would then be
  minted before the conference is known, so the check would be a comparison the handler performs —
  which is the claim-the-client-presents shape Principle VIII forbids, moved server-side but not
  actually enforced by construction.

---

## R3 — Where the second notification dispatch may live

**Question**: `notification-triggers.test.ts` holds `DISPATCH_CALLERS = ['routes/conversations.ts']`
and fails any other module reaching for the push port. Adding a second trigger means editing it.
Where should the new caller be?

**Decision**: **`routes/admin/catalog.ts`**, named as the second entry in `DISPATCH_CALLERS`. The
dispatch runs **after** the act-and-audit transaction commits, never inside it.

**This is the finding that mattered.** The guard excludes `notifications/**` from its scan entirely
— `PLATFORM = (name) => name.startsWith('notifications/')` — because that directory *is* the
dispatcher. **A second trigger implemented as `notifications/session-change.ts` would therefore pass
the very test written to catch it**, silently, with a green suite. The obvious tidy placement is the
one that defeats the gate.

Two rules follow and are requirements rather than style:

- **Dispatch outside the transaction.** `dispatch.ts` bounds each delivery with a timeout because a
  hang is the common failure of an HTTP push service; holding an open transaction across a fan-out
  to N attendees would put that hang on a lock. FR-1037's one-transaction rule covers **the act and
  its audit entry**, not the notification.
- **A failed dispatch must not fail the act.** 007's precedent, stated for report mail: a failed
  dispatch fails neither the block nor the record. An organizer's cancellation must not be rolled
  back because a push service was down.

**Alternatives considered**:
- *`notifications/session-change.ts`.* Rejected on the reasoning above — it is invisible to the gate.
- *Dispatch from `db/queries/admin-catalog.ts`.* Rejected: the query layer would take a
  `PushService`, and a write path that can send is harder to reason about than a route that writes
  then sends.

---

## R4 — Computing who to notify, and what coalesces them

**Question**: FR-1034 requires **one notification per attendee per organizer act**, however many of
their saved sessions it changed. What identifies "the act"?

**Decision**: **the audit entry id.** It already exists, is unique per act, is generated inside the
act's transaction (FR-1037), and is meaningless outside it. The dispatch reads: the set of sessions
this act materially changed → the set of attendees who saved any of them, **excluding the acting
principal** (FR-1028a) → one payload each, carrying the count and the act id.

**Rationale**: nothing new is stored to make coalescing work. The alternative shapes all invent an
identifier — a batch id, a time bucket, a request id — and the audit entry is already all three by
construction. It also means the notification and the accountability record refer to the same thing,
which is the correct relationship: **an attendee was interrupted because a recorded act happened.**

**Order matters and is a requirement**: the audit entry commits, *then* the fan-out reads it. A
dispatch that ran first could notify about an act that then rolled back.

**Alternatives considered**:
- *A time window per attendee.* Rejected, and FR-1028b now forbids it: a window would suppress a
  cancellation because a room moved earlier, which is the exact failure the trigger exists to
  prevent.
- *One notification per changed session.* Rejected by the owner at specification. A reshuffle would
  buzz a phone a dozen times.

---

## R5 — Making the engagement predicate derive from the schema

**Question**: FR-1018a requires that any table holding attendee data and referencing a session
counts as engagement **by existing**, rather than by appearing in a list somebody maintains.

**Decision**: a new unit test, `engagement-coverage.test.ts`, in the shape of
`deletion-coverage.test.ts`. It walks the Drizzle schema, selects every table carrying a foreign key
to **both** `sessions` and `attendees`, and asserts each appears in the predicate's table list.
Adding such a table **fails the build** until it is either covered or allow-listed with a written
reason.

Today that selects exactly four: `saved_sessions`, `session_notes`, `session_questions`, and — one
hop away, through `session_questions` — `question_votes`. The one-hop case must be handled
explicitly rather than by transitive closure, because transitive closure over the whole schema would
sweep in tables that merely happen to be reachable.

**Rationale**: the project has built this mechanism twice and it has caught things both times. An
enumerated predicate ages silently, and its failure mode is the worst available: deletions resume
destroying attendee data with every existing test still green.

**Alternatives considered**:
- *Rely on the four cascades and a code comment.* Rejected — that is precisely the shape 013's
  review found four times over, where an emphatic header described a relationship nothing enforced.

---

## R6 — Closing the race between the engagement check and the delete

**Question**: FR-1019a requires that an attendee saving a session between the engagement check and
the delete does not lose their row. What actually closes it?

**Decision**: `SELECT … FROM sessions WHERE id = $1 FOR UPDATE` **inside the deleting transaction**,
before the engagement count, with the delete in the same transaction.

`FOR UPDATE` on the parent row **conflicts with the `FOR KEY SHARE` that a child insert takes** when
PostgreSQL validates the foreign key. So an attendee saving the session mid-delete blocks until the
transaction ends, then either succeeds against a session that survived or fails against one that is
gone — and in no interleaving is a committed row destroyed.

**This is 009's FR-714 mechanism exactly**, and it is cited rather than rediscovered. 009 used it so
that a vote arriving between "you can withdraw this" and the withdrawal blocks; the parent there is
a question and the child a vote, and here the parent is a session and the children are four tables.

**It is also the one property no layer above a real database can test**, which is why it belongs in
the integration suite against `postgres:17` and not in a unit test with a double.

**Alternatives considered**:
- *Check before the transaction.* Rejected — that is the race, not a fix for it.
- *Serializable isolation.* Rejected: a heavier tool for one statement, and it converts the race into
  a retry the organizer has to be told about.

---

## R7 — How the marker is stored, cleared, and kept from becoming an inbox

**Question**: FR-1030 requires a per-row marker that clears when the attendee views the session, and
FR-1031 forbids it becoming an aggregate, a list or a bell.

**Decision**: **two timestamps and a comparison. Nothing is stored per change.**

- `sessions.logistics_changed_at` — set by a material change (cancellation, start time, room).
- `saved_sessions.viewed_at` — set to the save instant on insert, and updated when the attendee opens
  the session.

The marker is `logistics_changed_at > viewed_at`. It is computed in the agenda read and travels on
the **existing payload**, so no repository member is added, no new cached read is declared, and the
`passThrough` trap 008 fell into cannot arise.

**Defaulting `viewed_at` at save time is load-bearing.** With a null default, an attendee saving a
session that changed last week would see a marker for a change that predates their interest. There
is no `created_at` on `saved_sessions` to compare against — the table is `(attendee_id, session_id)`
and nothing else — so the default *is* the save instant.

**Why this shape cannot become the forbidden centre**: there is no per-change record to list, and
no counter to sum. Producing a "3 changes" badge would require a new query somebody would have to
write deliberately, which is the difference between a rule and a hope. `authoring-absences.test.ts`
asserts it in both clients.

**Write amplification avoided**: the alternative — flagging every saver's row on change — is one
write per saver, so a keynote with a thousand savers is a thousand row updates inside an organizer's
request. Deriving costs nothing on write.

**Alternatives considered**:
- *A `session_changes` table with per-attendee delivery rows.* Rejected: it is the notification
  centre's data model, arriving before the surface. Once the rows exist, the surface is a small ask.
- *Client-side comparison against a cached copy.* Rejected: the cached copy is up to 24 hours old
  (entry 22), so the marker would be a function of cache age rather than of what happened.

---

## R8 — "Up next" skipping a cancelled session

**Question**: FR-1022a requires Home's "Up next" to skip a cancelled session while the rest-of-day
timeline still shows it. How many places change?

**Decision**: **one.** `apps/web/src/app/sessions.ts` exports `nextSession()`, and it is the shared
helper behind `UpNext.tsx`, `NextSavedSession.tsx` and `RestOfDay.tsx`. Teaching `nextSession()` to
skip cancelled sessions satisfies FR-1022a for both cards that answer *what is next*, while
`RestOfDay` renders the full list and is unaffected.

**Rationale**: the single-point change is available because 002 and 005 put the computation in a
module rather than in each card. Worth recording that the composition rule paid off here — Home's
card registry forbids a card editing a neighbour, and this change touches none of them.

---

## R9 — Validating a session against its conference's days

**Question**: FR-1012 requires a session to fall inside its conference's date range **in the
conference's timezone**. `events.starts_on`/`ends_on` are `date`, `sessions.starts_at`/`ends_at` are
`timestamptz`, and `events.timezone` is text on another row.

**Decision**: enforced in the **write path plus an integration test**, not as a check constraint. A
PostgreSQL `CHECK` cannot reference another table, so the rule is structurally unavailable at the
column level. The comparison is `(starts_at AT TIME ZONE e.timezone)::date BETWEEN e.starts_on AND
e.ends_on`, evaluated inside the same transaction as the write.

`sessions_ends_at_after_starts_at` already exists as a check constraint and covers FR-1013 at the
database level, so FR-1013 needs no new mechanism.

**FR-1014 is the same rule read backwards** — changing the conference's dates must not orphan an
existing session — and is the reason FR-1015 freezes the timezone once sessions exist. Without that
freeze, a timezone edit could push sessions outside the range without touching either.

**Note on 009's lesson**: the two layers must agree. 009 found `trim()` accepting `"\n\t \n"` at the
database while the route refused it, because PostgreSQL's `trim()` strips spaces only. Here the
weaker layer is the *application*, so the integration test must drive the constraint **with the
route bypassed** to prove the write path is not the only thing holding the rule.

---

## R10 — Throttle actions

**Question**: FR-1039 names five actions. What has to change?

**Decision**: `throttle-actions.test.ts` and `throttle-thresholds.test.ts` both enumerate the
product's actions and both must be edited. The five are `conference_create`, `session_write`,
`session_cancel`, `session_delete`, `catalog_write`.

**Two deserve real thresholds rather than a default**: `conference_create`, because it is the only
product-wide act an organizer holds and nothing else bounds how many conferences they may make
(v5.2.0 accepts this as bounded by trust); and `session_cancel`, because it is the only authoring
act that reaches attendees' phones — an unthrottled cancel loop is a push amplifier pointed at every
attendee who saved anything.

**Note**: 009 recorded that upvoting made `sign_in_attempts` the product's highest-volume write
path, since every throttled action writes a row whatever the outcome. Authoring is low-volume by
construction, so 014 does not worsen that; the entry stands unchanged.

---

## R11 — Which existing guards must be amended, and which must not

**Question**: CLAUDE.md names five code-level guards enforcing the reversed prohibition. Which does
014 touch?

**Decision**: **three amended, two untouched, one added.**

| Guard | 014's effect |
|---|---|
| `db/seed/catalog.ts` header — *"no write path and no import path at any privilege"* | **Amended.** The claim is now false and must state what is permitted and to whom |
| `catalog-read-only.test.ts` | **Header amended, assertions unchanged** (R1) |
| `notification-triggers.test.ts` | **Amended** — a second permitted caller, with the reason recorded (R3) |
| `join-grants-nothing.test.ts` | **Untouched.** Joining a conference still grants no write over its content; authoring comes from assignment, not registration |
| `qa-absences.test.ts` (no moderation route) | **Untouched.** 013 already handled moderation; 014 adds no Q&A route |
| `engagement-coverage.test.ts` | **New** (R5) |

**Each amendment must state what is now permitted and to whom, and none may be weakened until it
stops checking anything.** The failure mode 009 named for its own absence guards applies here: the
natural repair, when a guard fires on a correct implementation, is to loosen the pattern until it
matches nothing.

---

# Part II — Tranche 2 research (R12–R20)

**Added 2026-08-14.** R1–R11 above are tranche 1's and are unchanged. These nine resolve the unknowns
tranche 2's design turns on. **Six of the nine changed the shape of the work rather than confirming an
assumption**, and two overturned a premise the research was given — which is recorded here because a
premise that survives unexamined becomes an implementation defect.

## R12 — How is optional-session capacity enforced (FR-1068) without turning a popular session's enrolment stampede into pool exhaustion, given `max: 10` and `lock_timeout: 3s` on the application pool?

**Decision**: **(a) — `SELECT … FROM sessions WHERE id = $1 AND event_id = $2 FOR UPDATE` inside the enrolling transaction, with the count and the insert as two further statements in that same transaction, and nothing else inside it.** Neither (b) nor (c) can express a cardinality bound, and one of them is forbidden by a recorded invariant.

Exact mechanism, in order:

1. **Outside any transaction — an advisory pre-check** answering the three refusals that repeat under a stampede: already enrolled, enrolment closed (derived from `starts_at`, the offset and `now()` — FR-1071/FR-1072, no count needed), and obviously full. It is advisory only and decides nothing; it exists so that the *common* path under contention never takes the exclusive lock. This is `admin-catalog.ts:671–685`'s own recorded lesson applied prospectively — there the refusal path was the common one and it was the branch holding the lock longest.
2. **Open `getDb().transaction()`. Statement 1: the lock.** `FOR UPDATE`, not `FOR NO KEY UPDATE`, for the reason `admin-catalog.ts:660–662` already records, and because it is the identical mode the three organizer-side paths tranche 2 mandates take (FR-1061a, FR-1065, FR-1077b) and that shipped `deleteSession` already takes (`admin-catalog.ts:663–667`). One mode, one lock, four callers.
3. **Statement 2: `SELECT count(*) FROM session_enrolments WHERE session_id = $1`**, then the already-enrolled check, then the closed check re-derived. Order matters for FR-1069a: already-enrolled must resolve *before* full, or a double-tap on a full session reports `full` about a place the caller already holds.
4. **Statement 3: the insert**, with `ON CONFLICT (session_id, attendee_id) DO NOTHING … RETURNING id` for idempotency, following `recordCard` (`cards.ts:287–293`).
5. **Everything else stays outside the transaction**: the throttle, any audit write, the roster read, the response shaping. The critical section is three indexed statements and nothing that does I/O of its own.

**Two schema obligations that fall out and are not optional.** `session_enrolments` needs `index(session_id)` — PostgreSQL creates none for a foreign key, and an unindexed `count(*)` inside the lock is the sequential scan `agenda.ts:126–136` added `saved_sessions_session_id_idx` to avoid. And it needs a unique key on `(session_id, attendee_id)` — a composite primary key, as `saved_sessions` has (`agenda.ts:114`) — for step 4's `ON CONFLICT`.

**One trap to name in the plan so nobody collapses this to one statement.** A `WITH locked AS (SELECT … FOR UPDATE), held AS (SELECT count(*) …) INSERT … SELECT … WHERE held.n < locked.capacity` looks like the right shape and is wrong: in READ COMMITTED every part of one statement shares one snapshot, and `FOR UPDATE`'s post-wait re-check (EPQ) re-qualifies only the locked row in its own scan node — the sibling CTE's count is still the pre-lock snapshot. So two enrolments serialise on the lock and then both compute the same stale count. `cards.ts:248–250` already records the adjacent version of this rule ("a locking clause belongs to the query it locks, and burying it in a sub-select that the planner is free to stop early makes the lock a property of the plan rather than of the statement"). The count must be a separate statement issued after the lock is granted — which is literally what `deleteSession` does: lock at `admin-catalog.ts:663`, count at `:686`.

**Lock ordering.** An enrolling transaction locks exactly one session row, so no cycle is constructible and 016's deadlock shape cannot recur. That must be *stated*, in the shape `cards.ts:231–246` states it, and it must be stated as a constraint on future edits: any transaction that locks more than one session row sorts them by id first.

**The residual risk is recorded, not mitigated away.** A lock wait that exceeds `lock_timeout` surfaces as a 500 with a correlation id (`client.ts:71–90`), and it must **not** be classified as `full` or `closed` — that is `client.ts:78–82`'s argument verbatim, and FR-1069 makes it sharper here: telling somebody the session is full when the server never decided anything is a settled outcome the client will render. It stays a 500, and a `session_enrol` throttle action bounds the rate that produces it.

**Rationale**: **First, a correction to the assignment.** `apps/api/src/db/queries/throttle.ts` does not exist. The file is `apps/api/src/auth/throttle.ts` (1,312 lines), and `apps/api/src/db/queries/` contains no throttle module at all.

**How the throttle actually achieves its bound, and why that bound is the wrong kind.** `beginAttempt` runs a bare `getDb().insert(…).returning({ id })` (`throttle.ts:962–977`) — no transaction, so the statement autocommits and the row is visible to everyone the instant it returns. `id` is a `bigserial` (`sign-in-attempts.ts:245`), so the sequence defines a total order over arrivals. `countFailures` then counts rows with `lt(signInAttempts.id, before)` (`throttle.ts:1093`), i.e. **the strict prefix of that order**. Each request therefore (i) makes itself countable by everyone behind it *before* it judges itself, and (ii) judges itself against predecessors only, which is what keeps the allowance unshifted (`throttle.ts:1075–1092`). The property it buys is stated at `throttle.ts:936–940`: a hundred concurrent requests can no longer all read the same pre-burst count, because each one is a committed row by the time the next one looks. **No lock, no serialisation, one extra statement.**

**But the guarantee is "no free burst pass", not "exactly N", and the gap is exactly where capacity lives.** Sequence values are allocated non-transactionally at `nextval`, and each insert autocommits independently — so commit order need not follow id order. Request A can take id 5 and still be mid-INSERT when request B, holding id 6, finishes and runs its count; B counts `id < 6`, does not see A's uncommitted row, and undercounts. A then counts `id < 5` and never sees B. Both are admitted against the same predecessor set. For a throttle that is a microsecond-wide permissiveness on a control whose contract is "may delay" — irrelevant. For a seat it is over-admission, and FR-1068 states its requirement as an outcome verified "in every ordering".

**And (b) is disqualified a second time, by its own defining move.** Insert-then-judge means an over-admitted enrolment is a **committed row that must then be deleted**. FR-1068 forbids precisely that: "no interval in which both appear to have succeeded". The pattern's mechanism is the requirement's prohibition.

**Why (c) has nothing to enforce with.** 008 looks like the precedent — `INSERT … SELECT … WHERE EXISTS (…) ON CONFLICT DO NOTHING RETURNING id` (`appointments.ts:207–242`), a single lock-free conditional insert. Read what the code says makes it sound: "The partial unique index on `(proposer_id, slot_id)` is the last line of defence for the concurrent case, and it is what makes FR-625's subtraction sound rather than merely likely" (`appointments.ts:204–205`), backed by `appointments_live_claim_per_proposer_slot` (`appointments.ts` schema `:244–246`). **The `WHERE EXISTS` is not what makes 008 correct — the unique index is.** The `EXISTS` closes the ordinary window; the index closes the concurrent one. Capacity has no such index available. A unique index enforces a *key*, and "at most N rows sharing a value" is a *cardinality*; a PostgreSQL exclusion constraint expresses pairwise non-overlap, not cardinality either. 008 itself documents where its index stops reaching (`appointments.ts:495–503`: a clash the index "cannot catch because it is keyed on the proposer"), which is the same class of limit.

The only (c) variant that *would* work — a seat ordinal under `unique(session_id, seat_no)` — needs `max(seat_no)+1` to assign, converting the race into a 23505 retry loop whose "full" outcome is only knowable by re-reading after the failure, which is exactly the distinguishability FR-1069/FR-1069a demand and the retry cost lands hardest on the stampede.

**Why the pool argument does not defeat (a), and the arithmetic rather than the assertion.** `client.ts:30–35` names the exhaustion shape precisely, and it is not "a lock exists": it is `shareCard` holding "one of ten pooled connections across **five round trips** inside one transaction" while waiting with **no ceiling** — "ten stalled requests exhaust `max: 10` and the entire API stops answering". Both halves are absent here. The enrolling transaction holds its connection across **three** statements, all index lookups on a set bounded by capacity plus churn, against a loopback-only PostgreSQL container — low single-digit milliseconds. And the wait *is* ceilinged: `lock_timeout` 3s (`client.ts:92`), set on the pool by 016 for exactly this. At a ~2ms critical section, 3s tolerates on the order of a thousand queued predecessors on one session before anybody 500s, and a stampede that matters is a few hundred, resolved in well under a second. `max: 10` (`client.ts:108`) caps how many enrolments are inside the database at once; the rest queue client-side in postgres.js rather than parking a backend, and other routes queue behind the critical section only.

**The decisive argument for (a) is that the lock is already mandatory here on three other paths, so it is not new construction and it is not a new lock order.** FR-1061a requires the held-place count read "inside the updating transaction with the session row locked"; FR-1065 requires the same for a kind change; FR-1077b requires the deletion count "re-read inside the deleting transaction under the same lock FR-1019a takes". Shipped `deleteSession` already takes it (`admin-catalog.ts:653–693`), on 009's mechanism (`questions.ts:343–371`), and research R6 records that lineage (`research.md:178–191`). Those three protect the organizer against a concurrent enrolment for free — an enrolment insert takes `FOR KEY SHARE` on `sessions` as the foreign key's own check, which `FOR UPDATE` conflicts with (`admin-catalog.ts:660–662`). What they do **not** do is make two enrolments exclusive of each other, because `FOR KEY SHARE` does not conflict with itself. Enrolment therefore has to upgrade to the same `FOR UPDATE`. Choosing (a) adds a fourth caller to one existing lock; choosing anything else means capacity is defended by one mechanism on the attendee side and a different one on the organizer side, on the same row, for the same invariant.

**Finally, the denormalised-counter escape is closed by a recorded invariant, and this matters because it is the obvious performance answer.** `UPDATE sessions SET places_held = places_held + 1 WHERE id = $1 AND places_held < capacity RETURNING places_held` is atomic without any explicit lock, serialises on the row automatically, and names "full" by returning zero rows. It is forbidden: `questions.ts` schema `:168–176` — "THE VOTE COUNT IS NOT A COLUMN, AND MUST NOT BECOME ONE … a second source of truth for a number the rows already answer, and **the one that drifted would be the one displayed**". FR-1070 makes remaining places a *displayed* number, so the drift argument lands on its nose. `catalog.ts:200–202` and `require-operator.ts:93` cite the same rule twice more. Adopting it would be a decision against three recorded statements of the same invariant, not an optimisation.

**Alternatives considered**:

- **(b) The throttle's insert-then-count-strictly-earlier shape adapted to capacity.** Rejected on two independent grounds. Its bound is approximate: sequence ids are allocated at `nextval` but each insert autocommits separately (`throttle.ts:962–977`, `sign-in-attempts.ts:245`), so a request holding a lower id can still be uncommitted when a higher-id request runs its `lt(id, before)` count (`throttle.ts:1093`) — both undercount and both are admitted. That is harmless for a control whose contract is 'may delay but never deny' and fatal for a seat. Second and independently: the pattern writes the row *before* it judges, so an over-admitted enrolment is a committed row awaiting deletion — the exact 'interval in which both appear to have succeeded' FR-1068 forbids by name.
- **(c) A unique index or exclusion constraint.** Rejected: neither expresses a cardinality bound. A unique index enforces a key; `EXCLUDE` enforces pairwise non-overlap. 008's apparently lock-free conditional insert (`appointments.ts:207–242`) is correct *because of* `appointments_live_claim_per_proposer_slot` (`appointments.ts` schema `:244–246`), which its own comment calls 'the last line of defence for the concurrent case' (`appointments.ts:204–205`) — and no analogous index exists for 'at most N rows per session'. The variant that does work (a `seat_no` ordinal under `unique(session_id, seat_no)`) converts every contended enrolment into a 23505 retry loop and makes 'full' knowable only by a re-read after the constraint fires, which is the distinguishability FR-1069 and FR-1069a demand.
- **A denormalised `places_held` counter on `sessions`, updated with a guarded `UPDATE … WHERE places_held < capacity`.** The best-performing option: correct without an explicit lock, single statement, names 'full' by row count. Rejected because it contradicts an invariant recorded three times (`questions.ts` schema `:168–176`; `catalog.ts:200–202`; `require-operator.ts:93`) and the reason bites hardest exactly here — FR-1070 puts the count on screen, and 'the one that drifted would be the one displayed' is a description of this feature. Adopting it would be an owner-level reversal, not a planning choice.
- **A single-statement `WITH locked AS (… FOR UPDATE), held AS (SELECT count(*) …) INSERT … WHERE held.n < locked.capacity`.** Rejected as silently wrong. All parts of one statement share one READ COMMITTED snapshot; `FOR UPDATE`'s post-wait re-check re-qualifies only the locked row in its own scan node, so the sibling count stays pre-lock and two serialised enrolments compute the same stale figure. Recorded here specifically because it *looks* like the correct collapse of (a) into one round trip. `cards.ts:248–250` records the adjacent rule about locking clauses buried where the planner governs them.
- **`FOR NO KEY UPDATE` instead of `FOR UPDATE`.** Would work — it conflicts with itself and with the organizer paths' `FOR UPDATE`, and it is cheaper. Rejected for uniformity: `admin-catalog.ts:660–662` already chose `FOR UPDATE` on this exact row and wrote down why ('the weaker one would compile, return the same row, and close nothing'), and a feature with four callers of one lock in two different modes is a thing to get wrong later for no measurable gain.
- **SERIALIZABLE isolation for the enrolment transaction.** Rejected on research R6's own ground (`research.md:196–198`): a heavier tool that converts the race into a retry somebody has to be told about — and here the retry would have to be told apart from 'full', which is FR-1069's requirement working against it.
- **Check capacity before opening the transaction only.** Rejected: that is the race, not a fix for it — R6's wording (`research.md:194`), and FR-1061a says the same thing about the organizer half.

**This changes the shape of the work**: **Yes, in three ways.** (1) It converts what looks like a lock-free problem into a **fourth caller of one existing lock**. Tranche 2's spec already mandates `FOR UPDATE` on the session row for three organizer paths (FR-1061a, FR-1065, FR-1077b) beside shipped `deleteSession` — but those only protect the organizer, because an enrolment insert's implicit `FOR KEY SHARE` does not conflict with another enrolment's. Enrolment must take the *same* `FOR UPDATE` explicitly, which means the session row lock and its ordering rule should be planned and documented **once, in one place, for four callers**, not rediscovered per task. (2) It puts two schema obligations on the migration that would otherwise be found late: `index(session_id)` on `session_enrolments` (PostgreSQL creates none for the FK, and the count runs inside the lock) and a composite primary key `(session_id, attendee_id)`. (3) It adds work the spec does not currently name: an **advisory pre-check outside the transaction** so the repeating refusals under a stampede never take the exclusive lock, and a **`session_enrol` throttle action** — needed because the one failure mode this design cannot make distinguishable is a `lock_timeout`, which must surface as a 500 rather than as 'full', per `client.ts`'s own rule. Also worth carrying into the plan as a named trap: the single-statement CTE collapse of lock-plus-count is silently wrong, and it is the first thing an optimising reviewer will suggest.

**Evidence**: `apps/api/src/db/client.ts:92 — `APPLICATION_LOCK_TIMEOUT_MS = 3_000`, set as a startup parameter on the pool (`:118–122`), so every lock wait in this design has a 3s ceiling`; `apps/api/src/db/client.ts:93 — `statement_timeout` 10s, deliberately larger than `lock_timeout` so a blocked statement fails as `55P03` naming its cause rather than an anonymous `57014``; `apps/api/src/db/client.ts:108 — `max: 10``; `apps/api/src/db/client.ts:30–35 — the pool-exhaustion shape named precisely: one transaction holding a connection across *five* round trips while waiting with no ceiling; 'ten stalled requests exhaust `max: 10` and the entire API stops answering'`; `apps/api/src/db/client.ts:71–90 — a lock timeout surfaces as 500 `internal_error` and 'must never be folded into' a domain refusal; the outcome union has no member for 'we do not know'`; `apps/api/src/auth/throttle.ts:962–977 — `beginAttempt`: a bare `getDb().insert(…).returning({ id })`, no transaction, so it autocommits before the count runs (the assignment's path `apps/api/src/db/queries/throttle.ts` does not exist)`; `apps/api/src/auth/throttle.ts:1093 — `before === undefined ? undefined : lt(signInAttempts.id, before)`: the strictly-earlier bound`; `apps/api/src/auth/throttle.ts:1075–1092 — why the exclusion is by sequence and not by timestamp ('concurrent inserts routinely share a `now()`')`; `apps/api/src/auth/throttle.ts:936–940 — 'Writing first makes an in-flight request a committed row … No lock, no serialisation, one extra statement', and R5's explicit rejection of an advisory lock per key on two vCPUs`; `apps/api/src/db/schema/sign-in-attempts.ts:245 — `bigserial('id')`, the sequence the strict-prefix order rests on`; `apps/api/src/db/queries/appointments.ts:207–242 — 008's lock-free conditional insert, the apparent precedent`; `apps/api/src/db/queries/appointments.ts:204–205 — 'The partial unique index on `(proposer_id, slot_id)` is the last line of defence for the concurrent case': the index, not the `EXISTS`, is what makes it sound`; `apps/api/src/db/schema/appointments.ts:244–246 — `appointments_live_claim_per_proposer_slot`, partial over `pending`/`confirmed``; `apps/api/src/db/queries/appointments.ts:495–503 — a reachable double-book the unique index 'cannot catch because it is keyed on the proposer': where index-based enforcement stops`

## R13 — Where does an enrolment live on the client read path, given enrolling REPLACES saving? Does the enrolment set ride the existing `listSaved` payload (as tranche 1 carried the change marker), or does it need a new repository member? What does the All/Saved filter become? Which reads must be cached and which must be `passThrough`? Which files change, and is `substitution.test.ts` affected?

**Decision**: **Split the answer in two, because "enrolment" is two different reads with opposite cache rules.**

**(a) The commitment SET rides the existing `listSaved` payload — one read, still cached, one row per commitment with a kind discriminator.** `listSaved` already returns object rows (`SavedSession = { sessionId, changedSinceViewed }`, `packages/data/src/interfaces/agenda.ts:73-80`) over a wire envelope that was grown once for exactly this (`packages/data/src/http/agenda-repository.ts:36-49`). Tranche 2 grows it a second time to `{ sessionId, changedSinceViewed, commitment: 'saved' | 'place' }`. Server-side that is one query change: `listSavedSessions` is a single scope-filtered join (`apps/api/src/db/queries/agenda.ts:98-133`), and the enrolment rows union into it. **No second read member is added**, and that is not stylistic — FR-1064 (spec.md:719) forbids the saved-but-not-enrolled state, and a single list with a discriminator makes that state **unrepresentable on the client** rather than merely absent; two reads make it representable and put the union in three consumers.

**(b) The remaining-places FIGURE cannot ride it and must be a second member on the SAME repository, declared `passThrough`.** FR-1070b (spec.md:730) forbids presenting it from cache; `listSaved` is cached (`apps/web/src/app/services.ts:163-169`, `{ listSaved: 'saved' }`) and is served from disk on any non-refusal failure (`packages/data/src/http/cached.ts:317-326). Carrying places on that payload publishes a stale seat count on every offline read. It must also be on the **same** repository, not a new one: `cached` purges the conference prefix from **inside** its own Proxy (`cached.ts:256-271`), so `enrol`/`release` sitting on an undecorated repository (the `questions` shape, `services.ts:350`) would leave the cached `saved` entry claiming a place the attendee just released.

**Cache classification, explicitly:**
- `listSaved` (renamed) — **cached**, `reads: { listSaved: 'saved' }`, unchanged. FR-215's offline programme depends on it.
- the places/availability read — **`passThrough`**, mandatory rather than preferred. `cached` derives its key from `args[0]` alone (`cached.ts:286`, `cacheKey(attendeeId, eventId, resource)`), so a per-session read `(eventId, sessionId)` would key **every session onto one entry**. `passThrough` sidesteps the key entirely. Its handler must `.bind(target)` (`cached.ts:251-253`) because `HttpSavedSessionRepository` holds `#http` privately (`agenda-repository.ts:30`) — the exact 008 `slots` failure.
- `enrol` / `release` — **writes**, unnamed in both maps, purging the conference prefix. Correct rather than tolerated, on `markViewed`'s own argument (`services.ts:144-162`): the commitment set they purge is the one that just changed.

**The All/Saved filter becomes a two-option filter over the UNION of both commitments, with one renamed label.** `Filter` stays `'all' | <the other one>` (`apps/web/src/app/destinations/Agenda.tsx:76`); only the predicate widens (`Agenda.tsx:195-196`, `saved.ids.has` → the union set). FR-1066a (spec.md:723) requires the label, the empty state and the Home card heading to be renamed **in the specification, not at implementation**, so R13 does not name them — it records that "Saved" (`Agenda.tsx:356`), `SavedEmptyState` and the card title `'Next saved session'` (`NextSavedSession.tsx:87, 198-199`) are the four strings that become false.

**`packages/platform/tests/substitution.test.ts` is NOT affected.** It constructs doubles for `DeviceServices` only (`substitution.test.ts:180-188`) and holds no repository double; enrolment needs no browser API, so no eighth-capability question arises. Its diff-based guard in `marker-not-cached.test.ts:122-145` compares against **this branch's own** branch point (`apps/web/tests/support/branch-point.ts:61-119`), so a fresh tranche-2 branch off `develop` keeps it green with no edit.

**But `apps/web/tests/unit/marker-not-cached.test.ts` MUST be amended, deliberately, and it is the one guard tranche 2 cannot avoid touching.** Line 160 pins the interface to exactly `['listSaved','save','unsave','markViewed']`, and lines 164-170 pin the read set to exactly `['listSaved']` via `/^list|^get|^read/`. Two new writes and one live read all fail it. The amendment is legitimate — the guard's stated subject is R7's *marker* claim, not enrolment — but it must be re-scoped in writing (its "a second read would be the surface FR-1031 forbids" message is about change history, not seat counts), never edited to pass.

**Rationale**: **The payload has already been grown once for this exact reason, and the growth is documented as the intended mechanism.** `HttpSavedSessionRepository.listSaved` reads `{ sessions: SavedSession[] }` and its header records that 005 shaped the envelope as an object "so the response has somewhere to grow without becoming a breaking change", and that 014 was that growth (`packages/data/src/http/agenda-repository.ts:36-49`). The row is already an object with a second field (`packages/data/src/interfaces/agenda.ts:73-80`). Adding a third field is the same move a second time; adding a second read is a different move that R7 argued against (`specs/014-conference-content-authoring/research.md:200-212`).

**FR-1066 pushes hard toward one payload, and pays for itself in one consumer.** It requires "the Home card that composes the attendee's own programme… MUST read held places as well as saves" and forbids citing "Up next"/rest-of-day as discharging it (spec.md:722). `NextSavedSessionCard` already does `Promise.all([catalog.listSessions, savedSessions.listSaved])` and filters the programme by `savedIds` (`apps/web/src/app/home/cards/NextSavedSession.tsx:45-73`). If the union arrives on `listSaved`, that card satisfies FR-1066 with **no read change at all** — only its heading and id change under FR-1066a. If enrolment is a second read, this card, `useSavedSessions` and `Agenda` each grow a second `Promise.all` arm and a union, and the three can drift.

**FR-1064's absence claim is only structural if there is one list.** With `commitment: 'saved' | 'place'` on one row, a session appears once and its kind is a property of that appearance — "saved an optional session while holding no place" is not a value the type admits. With two sets, `saved.has(id) && !held.has(id)` is a perfectly typeable state, and FR-1064's "MUST be asserted as an absence rather than argued" (spec.md:719) then has to be asserted about client state rather than falling out of it.

**FR-1070b and the cache key are two independent reasons the places figure must not ride the payload, and either alone is decisive.** The requirement is explicit that a stale number "reads as a promise of a place" (spec.md:730). Independently, `cached` reads `args[0]` as the event id (`cached.ts:286`) — a `(eventId, sessionId)` read collides all sessions onto `attendee:…|event:…|places`, so the second session opened would be served the first's seat count. `passThrough` is the declared escape (`cached.ts:174-194`), and it exists because 008 learned that omission from `reads` silently enrols a read in the write branch.

**The "new repository" instinct is the trap here, and it is 009's shape applied where it does not fit.** `questions` is undecorated precisely so no purge mechanism exists (`services.ts:315-350`), and 009 withdrew FR-756a rather than give one repository a cross-feature purge duty (standing decision 29). Enrolment is the opposite case: the commitment set **is** cached, on the same repository, so `enrol`/`release` must be able to invalidate it — which only happens inside the decorated Proxy. A separate `EnrolmentRepository` would need either its own decoration and a cross-repository purge, or a stale saved list.

**One consequence of "enrolment replaces saving" reaches further than the read path and must be named.** FR-1077a states an enrolled attendee holds **no saved row** (spec.md:744). The change marker's clock is `saved_sessions.viewed_at`, and `markSessionViewed` updates `saved_sessions` alone (`apps/api/src/db/queries/agenda.ts:151-170`). So FR-1079b's widening of FR-1030 to holders (spec.md:750) requires the enrolment table to carry its **own** `viewed_at`, defaulted at enrolment instant for R7's stated reason, and `markSessionViewed` to stamp whichever row exists. Without that, an enrolled attendee is notified (FR-1079) and then sees no marker and cannot clear one.

**One signature change in the hook is worth flagging now rather than discovering at implementation.** `useSavedSessions.toggle` derives its write from the commitment set — `const saving = !ids.has(sessionId)` (`apps/web/src/app/agenda/useSavedSessions.ts:136`). With two kinds, membership no longer determines *which* write to call; FR-1063 says the control's identity comes from "the session's own kind, never by the reader, the surface or a preference" (spec.md:718). The kind lives on the catalog `Session`, not on the commitment row, so `toggle` must take the session (or its kind) rather than an id. `SaveAffordance` (`apps/web/src/app/SessionPresentation.tsx:95-143`) carries `{ saved, onToggle }` and becomes a commitment affordance carrying the kind, the refusal wording (FR-1069a's mutual-difference rule, spec.md:727) and, in the panel, the live places figure.

**Alternatives considered**:

- **A separate `EnrolmentRepository`, undecorated, on the 009 `questions` precedent.** Rejected: `cached` purges only from inside its own Proxy (`packages/data/src/http/cached.ts:256-271`), so `enrol`/`release` there would leave the cached `saved` entry — still cached at `apps/web/src/app/services.ts:163-169` — claiming a place the attendee released, for up to the 24-hour lifetime. 009 could be undecorated because *nothing* of its own was cached; here the sibling read is.
- **A second read `listEnrolled(eventId)` on the same repository, cached under its own resource.** Rejected on three counts: it creates two cached entries for one commitment set that can disagree, it makes FR-1064's forbidden state representable in client types rather than unrepresentable, and it forces the union into three consumers (`useSavedSessions`, `Agenda`, `NextSavedSession`) where FR-1066 currently costs one filter predicate. It also trips `marker-not-cached.test.ts:164-170` in the way that test's message is actually about.
- **Carrying `remainingPlaces` as a field on the `listSaved` row.** Rejected twice over: FR-1070b forbids a cached seat count (spec.md:730), and `listSaved` is served from disk on every offline read (`cached.ts:317-326`). It is also the wrong population — the figure is needed while *deciding*, i.e. for sessions the attendee has **not** committed to, which by definition are absent from this payload.
- **Making the whole commitment read `passThrough` so nothing about enrolment is ever cached.** Rejected: FR-215 makes the active conference's saved programme readable offline and `listSaved` is load-bearing for it; only the places *number* is forbidden from cache. Uncaching the set to protect the number would trade a shipped offline guarantee for a field that can simply be omitted, which is what FR-1070b itself prescribes ("where the figure cannot be read live it MUST be omitted").
- **A bulk `places(eventId)` read covering the whole programme, `passThrough`.** Genuinely viable — `passThrough` bypasses the key entirely so the `args[0]` collision does not arise, and it would let Agenda rows show counts. Not chosen as the default because FR-1070a forbids any surface aggregating remaining places across sessions (spec.md:729), and a payload holding every session's count is one `.reduce` away from that surface; the decision the panel needs is about one session. Recorded as reversible: if the client asks for counts on the programme list, this is the shape, and FR-1070a is the guard that has to be argued.
- **Reusing `saved_sessions` for enrolment with a kind column, so one table serves both.** Not evaluated here — it is R14/R15 territory (capacity, the FOR UPDATE race, FR-1068) — but noted because it would make the read path trivial and the write path harder. R13's answer holds either way: the client sees one list with a discriminator regardless of how many tables produce it.

**This changes the shape of the work**: **Yes, in three ways, and the third is the one nobody would have planned for.**

1. **"Enrolment is a new repository" is wrong, and it is the natural guess.** Every recent feature that added a domain added a repository (`questions`, `cards`, `appointments`). Enrolment must live on the **existing** `SavedSessionRepository` — renamed — because that repository is cached and only its own Proxy can purge the entry an enrolment invalidates. Planning tasks written as "add EnrolmentRepository, register it, wire it" produce a silent staleness bug that no unit or component test can see, exactly like 008's `slots`.

2. **Two members with opposite cache rules land on one repository for the first time in this product.** Until now a repository was cached (`savedSessions`, `catalog`, `appointments`) or not (`questions`, `cards`, `directory`), with `appointments`' single `passThrough: ['slots']` the only mixed case. This repository becomes: one cached read, one `passThrough` read, three writes. The composition-root block at `services.ts:163-169` — whose comment currently says *"`passThrough` is deliberately empty: nothing in this repository is a read that must bypass the cache"* — is falsified by this tranche and must be rewritten in the same change, which is FR-1049's rule applied to a comment nobody has listed yet.

3. **Tranche 2 must amend a tranche-1 guard, `apps/web/tests/unit/marker-not-cached.test.ts`.** It pins the repository's members to exactly four names and its reads to exactly one. That was the correct property for R7's marker and it is not the property tranche 2 owes. It needs a task of its own, with the re-scoping written down, or the first person to hit it will "fix" the assertion to pass — which is the failure mode this project records repeatedly (`brand-audit` upscale ceiling, the frozen capability count).

**Also worth pulling forward:** the enrolment table needs its own `viewed_at`, because FR-1079b widens the marker to holders and FR-1077a says holders have no `saved_sessions` row. That is a schema consequence of a *client read path* question, and it will otherwise be discovered when an enrolled attendee is notified of a room change and finds no marker to clear.

**Evidence**: `packages/data/src/interfaces/agenda.ts:73-80 — `SavedSession` is already an object row with a second field added by tranche 1`; `packages/data/src/interfaces/agenda.ts:96-107 — `listSaved` header: the marker travels on the existing read rather than on a method of its own`; `packages/data/src/http/agenda-repository.ts:36-49 — the `{ sessions: [...] }` envelope exists so the response can grow; 014 was the first growth`; `packages/data/src/http/agenda-repository.ts:30 — `readonly #http: HttpClient`, the private field a `passThrough` return must not lose`; `apps/api/src/db/queries/agenda.ts:98-133 — `listSavedSessions` is one scope-filtered join; the enrolment union lands here`; `apps/api/src/db/queries/agenda.ts:151-170 — `markSessionViewed` updates `saved_sessions` alone, so an enrolled attendee has no row to stamp`; `apps/api/src/routes/events/agenda.ts:120-142 — the `/agenda/saved` response schema pinning `['sessionId','changedSinceViewed']` with `additionalProperties: false``; `apps/web/src/app/services.ts:144-169 — `reads: { listSaved: 'saved' }`, `passThrough` deliberately empty, and the argument for why `markViewed`'s purge is correct`; `packages/data/src/http/cached.ts:286 — `const eventId = typeof args[0] === 'string' ? args[0] : ''`, the key derivation that collides a per-session read`; `packages/data/src/http/cached.ts:251-253 — `passThrough` must `.bind(target)` or the `#private` field throws`; `packages/data/src/http/cached.ts:256-271 — the write branch purges the conference prefix, and only from inside this Proxy`; `packages/data/src/http/cached.ts:317-326 — a cached read is served from disk on any non-refusal failure, which is what FR-1070b forbids for a seat count`; `apps/web/src/app/agenda/useSavedSessions.ts:35-69 — `SavedSessions` exposes `ids` and `changed` as Sets; the union lands in `ids``; `apps/web/src/app/agenda/useSavedSessions.ts:136 — `const saving = !ids.has(sessionId)`, the predicate FR-1063 invalidates`

## R14 — Where does the enrolment-closing derivation live so it cannot trip the no-time-driven-dispatch guard (FR-1071/FR-1071a/FR-1072/FR-1072a)?

**Decision**: **The lever is the SQL text, not the file. "Put it somewhere the guard does not scan" is not available — two of the three files that must compute it are already inside the guard's population, by accident.**

**(a) The population predicate is `array.push`, not "dispatchers."** `no-session-start-trigger.test.ts:70-72` selects the audited files with `/dispatchToDevices|dispatchPush|\.push\b/` over `apps/api/src/**/*.ts(x)` (`:47`, `:49-54`). `\.push\b` matches every `Array.prototype.push`. Fifteen files match today; only three of them can actually dispatch. **In the population already: `db/queries/catalog.ts` (`list.push`, catalog.ts:147), `db/queries/admin-catalog.ts` (admin-catalog.ts:1258, :1611), `db/queries/session-changes.ts` (:242), `db/queries/directory.ts`, `config.ts`, `plugins/ports.ts`, both seed modules, both mail/notification sink adapters.** **Outside it: `db/queries/agenda.ts` and `db/queries/appointments.ts`** — 008's `lapsed` precedent has therefore never been tested against this guard at all.

So the attendee programme read (`catalog.ts`, FR-1070) and every administrative check (`admin-catalog.ts` — FR-1061a capacity floor, FR-1077b's pre-delete count, FR-1073's roster) are inside the scanned set. Membership is uncontrollable: one `list.push(...)` added to `agenda.ts` for enrolment rows drags it in, and a pre-existing derivation there starts failing a guard nobody touched.

**(b) Write it as one exported SQL-text helper, in snake_case, and let consumers name only the helper.** Follow `isoInstant` (appointments.ts:27-29) literally — a function taking a table alias and returning SQL text used through `sql.raw`:

```ts
// db/queries/enrolment.ts
export const enrolmentOpen = (alias: string): string =>
  `(${alias}.starts_at - make_interval(hours => ${alias}.enrolment_close_offset_hours) > now())`
export const placesRemaining = (alias: string): string =>
  `greatest(${alias}.capacity - (SELECT count(*) FROM session_enrolments e WHERE e.session_id = ${alias}.id), 0)`
```

Three properties make it population-proof rather than population-dependent:
1. **snake_case `starts_at`, never `${sessions.startsAt}`.** The clock regex (`:137-139`) is **case-sensitive** and matches the literal camelCase identifier `startsAt`. `now() < s.starts_at` is invisible to it; `now() < ${sessions.startsAt}` is not — and the second is the established house style in the exact file that needs it (admin-catalog.ts:1024, :1029 interpolate `${sessions.startsAt}` into raw SQL, and admin-catalog.ts is in the population).
2. **In SQL, never in TypeScript.** Any TS derivation puts `Date.now()`/`new Date()` within 60 characters of `startsAt` on one line and trips the first alternative. Whether it trips is decided by where the author put a newline (`[^\n]{0,60}`), and Prettier does not reformat template literals or wrap for you (printWidth 100).
3. **Named once.** Consumers contain `sql.raw(enrolmentOpen('s'))` — no `now`, no `startsAt` — so `catalog.ts` and `admin-catalog.ts` stay clean whatever the population does. It is also FR-1071's own single-change-point shape (tranche 1's `nextSession()`).

**(c) The SQL shape.** `make_interval(hours => …)` is already this repo's idiom (`db/seed/conversations.ts:124` uses `now() - make_interval(mins => …)`). The comparison must be evaluated **inside** the writing statement, not read then acted on — folded into the enrolling `INSERT … SELECT … WHERE EXISTS (… AND <enrolmentOpen> AND count < capacity)` after a `SELECT … FOR UPDATE` on the session row inside the transaction (admin-catalog.ts:660-666's precedent, which FR-1061a/FR-1068 both require). FR-1071b falls out for free: the deadline appears only in the *insert* guard, never in the read of held places and never in the delete, so holders keep places and withdrawal stays open with no extra condition.

**(d) Which regexes a naive implementation trips** (verified by running each pattern against candidate lines):
- `now() < ${sessions.startsAt} - make_interval(...)` in `catalog.ts`/`admin-catalog.ts` → **TRIPS** `\bnow\b[^\n]{0,40}startsAt` (test at `:133`). This is the single most likely failure, because it is the house style in the file.
- `Date.now() < new Date(row.startsAt)…`, `const closesAt = new Date(row.startsAt).getTime() - h*3600000; const open = closesAt > Date.now()` → **TRIPS** the same test (both alternatives).
- `const now = new Date(); … now < startsAt` → **TRIPS**. A local variable literally named `now` is enough.
- **A SQL comment inside the template literal trips it, and the guard's own header says comments are stripped.** `codeOnly` (`:56-59`) strips only JS `/* */` and `//` lines; `-- Open while now() is before startsAt minus the offset.` survives and **TRIPS**. This codebase writes explanatory `--` comments inside SQL constantly (appointments.ts:110-111, :121-123, :495-504), so the sentence explaining the derivation is a live hazard. Write such comments in snake_case or as JSDoc above the literal.
- A waitlist helper named `enqueue`, or anything matching `/\bcron\b|schedule(Job|Delivery)/i` → **TRIPS** the scheduled test (`:92`), which is **case-insensitive** where the clock test is not.
- Clean: `(s.starts_at <= now()) AS lapsed`-shaped snake_case SQL; reversed operands (`${sessions.startsAt} … > now()`) — but that one is clean **only by operand order**, which is not a property anybody can be asked to preserve.

**(e) Two gaps in the guard tranche 2 must close rather than lean on.**
- **This guard does not enforce FR-1072.** The scheduled-work assertion is filtered to `dispatchers`, so a sweep that closes enrolment and dispatches nothing passes it green. `maintenance.ts` proves the hole: it matches the scheduler regex (`setInterval`, maintenance.ts:203) and is outside the population, so the guard never sees it. FR-1072's "no scheduled work of any kind" needs its own assertion (e.g. `RETENTION_SWEEPS` membership at maintenance.ts:59 plus no `setInterval` outside that module).
- **FR-1072a is not covered by name.** The clock regex looks for `startsAt`; once tranche 2 introduces a derived deadline, `if (Date.now() > closesAt)` inside a dispatching path is a reminder the guard cannot see. The regex must be extended with the deadline identifier in the same change — and `routes/admin/catalog.ts`, which owns the offset edit, is one of the two `DISPATCH_CALLERS` (notification-triggers.test.ts) and holds `notifySavers`/`fanOut`, so a deadline computed in that handler lands directly in the dispatching module.

**Rationale**: Every claim is from the shipped source. The guard's population predicate is `/dispatchToDevices|dispatchPush|\.push\b/` at no-session-start-trigger.test.ts:70-72 over `apps/api/src/` (`:47`); running that predicate over the tree returns 15 files, of which `db/queries/catalog.ts:147`, `db/queries/admin-catalog.ts:1258`, `db/queries/admin-catalog.ts:1611` and `db/queries/session-changes.ts:242` qualify solely on `Array.prototype.push` — so the two modules tranche 2 must edit for FR-1070 and FR-1061a/FR-1073/FR-1077b are already audited, and relocation is not a strategy. `db/queries/agenda.ts` and `db/queries/appointments.ts` contain no `.push` and are outside, which is why 008's `(s.starts_at <= now()) AS lapsed` (appointments.ts:371) has never been tested against this regex and cannot be cited as proof the shape is safe.

The clock assertion is `/startsAt[^\n]{0,60}(Date\.now|new Date\(\)\s*)|\bnow\b[^\n]{0,40}startsAt/` (no flags, so case-sensitive) at no-session-start-trigger.test.ts:137-139. The database column is `starts_at` (schema/catalog.ts:178) and the Drizzle field is `startsAt` (catalog.ts:107), so the regex sees the *source text*, not the SQL: snake_case is invisible to it and the repo's own raw-SQL interpolation style (`${sessions.startsAt}` at admin-catalog.ts:1024, :1029) is not. `codeOnly` (`:56-59`) strips `/* */` and `//` lines only, so SQL `--` comments inside template literals are matched — and prose combining "now" and "startsAt" is exactly what a good comment on this derivation says. Each candidate line above was run against the four live patterns rather than reasoned about.

Keeping the derivation in SQL is required independently of the guard: appointments.ts:96-98 records that the clock must be the database's `now()`, never the API process's (002's `resolveActiveEvent` provenance lesson), which FR-1072's "the server's own clock at the moment of the request" restates. `make_interval` is already in use (db/seed/conversations.ts:124), so the shape needs no new idiom. The one-exported-helper rule is `isoInstant`'s (appointments.ts:27-29) and gives FR-1071 the single change point it asks for, while making consumers structurally incapable of tripping the regex — which matters precisely because population membership is decided by an unrelated `.push` somebody adds later.

The scheduled-work assertion (`:88-105`) is filtered through `dispatchers`, and maintenance.ts:203's `setInterval` is outside that set, so the guard demonstrably does not enforce FR-1072 in general — it enforces "a dispatching file has no scheduler". FR-1072a is likewise only covered while the identifier is `startsAt`; a derived deadline is a new name the pattern does not know, and `routes/admin/catalog.ts` (DISPATCH_CALLERS, notification-triggers.test.ts) is where the offset is edited.

**Alternatives considered**:

- Put the derivation in a new file outside the guard's scanned population and rely on that. REJECTED: the population is `apps/api/src/**` filtered by `.push`, so 'outside' is an accident of whether the module happens to build an array (db/queries/agenda.ts is outside today with no `.push`; catalog.ts is inside solely because of catalog.ts:147). A later `list.push(...)` silently pulls the file in and a correct derivation starts failing a guard nobody edited — the same class of accident 014 recorded when the substitution guard froze the capability count at seven.
- Derive it in TypeScript from the session row already fetched (offset hours × 3_600_000 against Date.now()). REJECTED twice over: it trips the clock regex on every phrasing tested, with the outcome decided by where a newline falls; and it moves the clock off the database, which appointments.ts:96-98 records as the provenance rule (002's `resolveActiveEvent`) and FR-1072 restates as 'the server's own clock at the moment of the request'.
- Write it in the house raw-SQL style with Drizzle column interpolation — `now() < ${sessions.startsAt} - make_interval(...)` — matching admin-catalog.ts:1024. REJECTED: this is the exact string the clock regex's second alternative matches, in a file already inside the population. It is the most likely implementation and the one that fails.
- Keep it correct but reorder the operands (`${sessions.startsAt} - make_interval(...) > now()`), which is clean today. REJECTED: it is clean only because the regex requires `now` to precede `startsAt` within 40 characters. Correctness that depends on operand order survives no refactor and no reviewer, and is indistinguishable from a coincidence.
- Store `enrolment_closes_at` on the session and keep it in step on every start-time edit. REJECTED by FR-1071/FR-1071c outright, and it fails no-draft-state.test.ts's neighbourhood too — a stored open/closed flag would be lifecycle state on conference content (FR-1071a, decision 48), and `no-draft-state.test.ts:107-120` already forbids a `status|state|stage|phase` column on schema/catalog.ts.
- Weaken or narrow the clock regex so the derivation passes. REJECTED explicitly: the file's own header says a grep for a word can be renamed around and the mechanism is what is asserted; narrowing it here is the 'weakened until it stops checking anything' failure that 014 already had to correct three absence guards for (deviations.md D14). The correct move is the opposite — extend the pattern to cover the derived deadline identifier (FR-1072a) and add the missing FR-1072 assertion.
- Compute the closing state in the client from `startsAt` and the offset. REJECTED: the guard scans apps/api/src only (no-session-start-trigger.test.ts:47) so it would be invisible, and FR-1070b/FR-1072 forbid it — a device clock is not the server's, and a stale open state reads as a promise of a place.

**This changes the shape of the work**: Yes, in three ways. (1) It kills the assumption that placement solves this: `db/queries/catalog.ts` and `db/queries/admin-catalog.ts` are ALREADY inside the guard's audited population because of ordinary `array.push` calls, so the plan cannot contain a task of the form "put the derivation in a module the guard does not scan" — it must contain a naming constraint instead (snake_case `starts_at` on any line carrying `now()`, derivation in SQL only, one exported `isoInstant`-shaped helper). (2) It adds guard-maintenance tasks that would otherwise be missed: this guard does NOT enforce FR-1072 — its scheduler assertion is filtered to dispatchers, and maintenance.ts's own `setInterval` sits outside that set — so a non-dispatching enrolment sweep passes green and FR-1072 needs a new assertion of its own; and FR-1072a stops being covered the moment the deadline gets its own identifier, so the clock regex must be extended in the same change rather than relied on. (3) It adds a review-note task: the guard's header claims comments are stripped, but `codeOnly` strips JS comments only, so a `--` SQL comment explaining the derivation trips the very guard whose header promises it will not — which makes "explain the derivation where it lives" a trap unless the comment is written in snake_case or lifted into JSDoc.

**Evidence**: `apps/api/tests/unit/no-session-start-trigger.test.ts:47`; `apps/api/tests/unit/no-session-start-trigger.test.ts:49`; `apps/api/tests/unit/no-session-start-trigger.test.ts:56`; `apps/api/tests/unit/no-session-start-trigger.test.ts:70`; `apps/api/tests/unit/no-session-start-trigger.test.ts:88`; `apps/api/tests/unit/no-session-start-trigger.test.ts:92`; `apps/api/tests/unit/no-session-start-trigger.test.ts:107`; `apps/api/tests/unit/no-session-start-trigger.test.ts:111`; `apps/api/tests/unit/no-session-start-trigger.test.ts:115`; `apps/api/tests/unit/no-session-start-trigger.test.ts:133`; `apps/api/tests/unit/no-session-start-trigger.test.ts:137`; `apps/api/tests/unit/no-session-start-trigger.test.ts:157`; `apps/api/tests/unit/no-session-start-trigger.test.ts:173`; `apps/api/src/db/queries/appointments.ts:27`

## R15 — What exactly must the first NOT_ENGAGEMENT entry contain, and what else breaks? Specifically: the mechanism by which a new table referencing both `sessions` and `attendees` fails the build; the exact shape of a NOT_ENGAGEMENT entry and what its comment must say; whether the four-table equality pin also breaks and in what order the two failures surface; whether `hasEngagement` or `countEngagement` is the live predicate in the delete path; and whether excluding enrolment from engagement leaves deletion-coverage passing.

**Decision**: **Add one `NOT_ENGAGEMENT` entry; do NOT touch `ENGAGEMENT_TABLES`, and the four-table pin never fires.** The entry is `Record<string, string>` (`engagement-coverage.test.ts:69`): key = the PostgreSQL table name exactly as `getTableConfig(...).name` returns it (snake_case, e.g. `session_enrolments` — NOT the camelCase Drizzle variable), value = a reason string whose ONLY mechanical requirement is `reason.length > 80` (`:188`, raw `.length`, untrimmed) and whose key must name a live schema table (`:187`).

**Failure mechanism.** `readSchemaTables` (`:76-98`) reads every non-`index.ts` file **from disk** under `src/db/schema/`, dynamically imports it, keeps values passing `is(value, PgTable)`, and records `config.foreignKeys.map(k => getTableConfig(k.reference().foreignTable).name)`. The "direct" filter (`:117-120`) selects tables whose FK target set contains BOTH `sessions` and `attendees`; anything left after subtracting `ENGAGEMENT_TABLES` and the keys of `NOT_ENGAGEMENT` lands in `uncovered`, and `toEqual([])` (`:126-135`) fails. It is **FK-shape driven, not name driven**, and reading files rather than the barrel means a table in a new file with no `schema/index.ts` export is still caught. An enrolment table carrying `attendee_id → attendees` and `session_id → sessions` therefore fails by existing.

**Which tests fire, and in what order.** Declaration order, no `bail` configured (`packages/config/vitest.base.ts:121` sets only `fileParallelism: false`), so every failure reports in one run:
1. `:114` "covers every table that is attendee state about a session" — **fires first, and on the NOT_ENGAGEMENT route it is the ONLY one that ever fires.**
2. `:214` "counts the same tables the predicate does" — fires only if the table is added to `ENGAGEMENT_TABLES` without also appearing in `engagementCountsFor`.
3. `:246` "names exactly the four tables 014 shipped with" — reads `ENGAGEMENT_TABLES` **only**; `NOT_ENGAGEMENT` is invisible to it. **It does not break on the correct route.** It breaks only if somebody takes the route O2/FR-1077 forbids.

**`hasEngagement` is DEAD. CLAUDE.md and brainstorm #12 are correct, and it is worse than "no caller in the delete path" — it has no caller and no importer anywhere in the repository.** `grep "hasEngagement("` over `apps/`, `e2e/`, `packages/` returns zero hits; the only importers of `session-changes.js` take `materialChangeOf`/`MaterialChange` (`admin-catalog.ts:16`), `attendeesToNotify` (`routes/admin/catalog.ts:48`, two integration tests), and `ENGAGEMENT_TABLES` (the guard, `:9`). **The live predicate is the module-private `countEngagement`** (`admin-catalog.ts:830-848`), called at `:686` inside the `FOR UPDATE`, with the boolean **derived by summing four integers** at `:687`. `admin-catalog.ts:682-684` calls `hasEngagement` "the predicate of record" — a header asserting a call relationship that does not exist, the exact defect class 013's review found four of. Tranche 2 must either delete it or give it the caller its header claims; deleting is safe, because `ENGAGEMENT_TABLES` is the thing the guard reads and it survives independently.

**The consequence that changes tranche 2's shape: FR-1077b's held-places figure MUST NOT go into `engagementCountsFor` (`admin-catalog.ts:818-828`).** Because the delete boolean IS `saved + notes + questions + votes > 0`, adding a fifth count to that fragment silently makes every optional session with places held **undeletable** — a direct contradiction of FR-1077 and O2, arriving as a one-line "consistency" edit. **Nothing would catch it**: `engagement-coverage.test.ts:231-243` only requires each `ENGAGEMENT_TABLES` member to *appear* in the fragment and forbids nothing extra, and `no-attendee-state-disclosure.test.ts:341-350` only forbids attendee-identifying columns in it. The held-places count must travel as a **separate field beside** `EngagementCounts` (`admin-catalog.ts:152`), and FR-1077c's falsehood is rendered at `CancelDialog.tsx:118`, gated on `engaged = total(session) > 0` computed from exactly those four at `:47-50, :63`.

**Deletion-coverage still passes, and excluding enrolment from engagement is irrelevant to it.** `deletion-coverage.test.ts` imports only `RETENTION_SWEEPS` (`:9`); it has no knowledge of `ENGAGEMENT_TABLES` or `session-changes.ts`. Its question is "does erasure reach this row", which `engagement-coverage.test.ts:34-45` explicitly distinguishes from "is this attendee state about a session". An enrolment table with `.references(() => attendees.id, { onDelete: 'cascade' })` is classified automatically by `cascadesFromAttendees` (`:285`, consumed at `:323`) and needs **no allow-list entry at all** — that FK alone discharges FR-1081a's cascade half.

**Rationale**: Every claim is read out of the shipped files. The `NOT_ENGAGEMENT` shape and its >80-character floor are literal (`engagement-coverage.test.ts:69`, `:186-189`); the reason must be >80 raw characters and nothing checks its *content*, so FR-1078's four required clauses (whose data, why silent loss is acceptable, owner decision under v5.3.0 O2, not precedent, register entry 31 open) are **prose obligations with no guard** — the "requirement whose subject is prose" class 016's review named, arriving in the very entry that will be the template for the second one. The four-table pin at `:255-260` compares `[...ENGAGEMENT_TABLES].sort()` and reads nothing else, which is why the correct route leaves it untouched: the pin exists to catch *narrowing*, and adding a `NOT_ENGAGEMENT` key narrows nothing. `hasEngagement`'s deadness is established by absence of both call syntax and import (only four symbols are ever imported from `session-changes.js`, none of them it), and the live path is visible in `deleteSession`'s own body: `countEngagement` at `:686`, sum-derived boolean at `:687`, with the inline comment at `:671-685` recording that the review deliberately replaced the eight-subquery `hasEngagement`+`countEngagement` pair with one aggregate and left `hasEngagement` behind as "the predicate of record". That sum-as-boolean is precisely why a fifth count in the shared fragment is a silent FR-1077 violation, and both guards that read the fragment were written to catch *under*-reporting and attendee columns, not over-reporting. Deletion-coverage's independence is structural rather than incidental: it computes cascade reachability from `attendees` (`:240-255`, `:277-291`) and `engagement-coverage`'s header (`:34-45`) states in its own words that the two guards ask different questions and that this one deliberately does not compute closure.

**Alternatives considered**:

- Add the enrolment table to ENGAGEMENT_TABLES instead — REJECTED, and it is what constitution v5.3.0 O2 and FR-1077 forbid. It would break three tests (`:114` passes, `:214` fires unless engagementCountsFor is extended, `:246` fires unconditionally) and would make optional sessions with places held undeletable, which is the opposite of the ratified decision.
- Add the held-places count to `engagementCountsFor` to satisfy FR-1077b's confirmation figure — REJECTED as an active hazard. `deleteSession` derives its refusal boolean by summing that fragment's four integers (`admin-catalog.ts:687`), so a fifth count silently converts FR-1077's 'permitted' into a 409. No existing guard catches it: the coverage test checks presence, not absence, and the disclosure test checks for attendee columns only.
- Model enrolment as a nullable column or flag on `saved_sessions` rather than its own table — REJECTED on FR-1063 ('exactly one commitment control per session, determined by the session's own kind') and on the guard's own semantics: `saved_sessions` is already in ENGAGEMENT_TABLES, so enrolment rows would be counted as engagement by construction and could never be excluded, making O2 unimplementable. It would also silently pass `engagement-coverage` while breaking the requirement — the worst available outcome.
- Give `hasEngagement` the caller its header claims, restoring it as the delete predicate — REJECTED for tranche 2. The review that removed it (`admin-catalog.ts:671-685`) did so to halve the statements executed under `FOR UPDATE`, where the cost is queue time for attendees saving the session, and the refusal path is the common one. Deleting the dead function and correcting the two headers that name it is the cheaper repair; `ENGAGEMENT_TABLES` stays exported from `session-changes.ts` and the guard is unaffected.
- Rely on `deletion-coverage` to also cover FR-1081 (withdrawing from a conference releases places) — REJECTED because it cannot. It measures cascades from `attendees` only; nothing cascades from a registration, which the shipped withdrawal path already calls 'invisible in the schema' and handles by deleting saves and notes by hand. A missed by-hand release is invisible to every schema-derived guard and needs its own integration assertion.
- Treat export coverage as follow-on work — REJECTED. `export-coverage.test.ts:266-285` fails by existing on EVERY column of the new table, including FR-1080's `viewed_at`, until each is mapped in `EXPORTED_COLUMNS`. It is a third schema-derived guard tranche 2 must satisfy in the same change, and it is what discharges FR-1081a's export half.

**This changes the shape of the work**: **Yes, in two ways beyond the three-line entry.** (1) The spec's prose treats `hasEngagement` as the delete predicate (FR-1018/FR-1018a inherit that framing, and `tasks.md:212` says T047 called it), but it has **zero callers and zero importers** — the live predicate is `countEngagement`, and its delete boolean is a **sum of the four counts**. So FR-1077b's held-places figure cannot be plumbed through `engagementCountsFor`; doing so silently makes places-held sessions undeletable and **no existing guard catches it**. Tranche 2 needs a task for a separate held-places field beside `EngagementCounts`, and an assertion that the delete boolean is still derived from exactly the four. (2) FR-1075a's narrowing of FR-1025 lands on `countEngagement`/`engagementCountsFor` in `admin-catalog.ts`, not on the `session-changes.ts` function the spec's engagement language points at. Additionally, tranche 2 should carry an explicit task to resolve dead `hasEngagement` (delete it, and correct `admin-catalog.ts:682-684` and `agenda.ts:188`, both of which assert it is live) — otherwise this feature adds a `NOT_ENGAGEMENT` entry justified by a predicate nobody calls, and the fifth-table story becomes a claim about a function that does not run.

**Evidence**: `apps/api/tests/unit/engagement-coverage.test.ts:69 — `const NOT_ENGAGEMENT: Record<string, string> = {}`, the empty list tranche 2 writes its first entry into`; `apps/api/tests/unit/engagement-coverage.test.ts:62-68 — the header demanding each entry 'say whose data it is and why losing it silently is acceptable'`; `apps/api/tests/unit/engagement-coverage.test.ts:76-98 — `readSchemaTables`: reads files from disk, filters `is(value, PgTable)`, records FK target table names`; `apps/api/tests/unit/engagement-coverage.test.ts:117-135 — the direct filter (references `sessions` AND `attendees`), minus ENGAGEMENT_TABLES, minus NOT_ENGAGEMENT keys, asserted `toEqual([])``; `apps/api/tests/unit/engagement-coverage.test.ts:186-189 — NOT_ENGAGEMENT entries must name a live table and carry `reason.length > 80` (raw, untrimmed); nothing checks content`; `apps/api/tests/unit/engagement-coverage.test.ts:214-243 — the counts test: iterates ENGAGEMENT_TABLES only, requires presence in the fragment, forbids nothing extra`; `apps/api/tests/unit/engagement-coverage.test.ts:246-261 — the four-table equality pin, reading ENGAGEMENT_TABLES alone; NOT_ENGAGEMENT is invisible to it`; `apps/api/tests/unit/engagement-coverage.test.ts:34-45 — the header stating engagement coverage and deletion coverage ask different questions, and why closure is not computed`; `apps/api/src/db/queries/session-changes.ts:127-132 — `ENGAGEMENT_TABLES`, exported so the guard reads the real value`; `apps/api/src/db/queries/session-changes.ts:146-166 — `hasEngagement`, exported and never imported by any module`; `apps/api/src/db/queries/admin-catalog.ts:671-685 — the inline record of the review replacing hasEngagement+countEngagement with one aggregate, and calling hasEngagement 'the predicate of record'`; `apps/api/src/db/queries/admin-catalog.ts:686-689 — `countEngagement(id, tx)` is the live call; the boolean is `saved + notes + questions + votes > 0``; `apps/api/src/db/queries/admin-catalog.ts:818-828 — `engagementCountsFor`, the single shared fragment feeding both the delete refusal and the programme read`; `apps/api/src/db/queries/admin-catalog.ts:830-848 — `countEngagement`, module-private, not exported`

## R16 — How is the enrolment roster route addressed so the shipped disclosure guard admits it deliberately?

**Decision**: **The route is `GET /admin/conferences/:eventId/sessions/:id/enrolments`, carrying `preHandler: [requireOperator, requireConferenceAuthority]` — and the shipped guard must be WIDENED before it can be exempted, because as written it does not catch this route at all.**

**1. What the roster trips today: nothing in rule 4, and that is the finding.** `no-attendee-state-disclosure.test.ts:288` is a noun denylist — `/\b(notes?|saves?|saved|votes?|voters?|attendees|questions)\b/i` — and I ran the candidate paths against it. `…/sessions/:id/enrolments`, `…/roster`, `…/places` and `…/enrolment-roster` all return **false**; only `…/attendees` (and `…/saved`, `…/notes`) return true. So a roster route named `enrolments` ships green with no exemption, no decision, and no record. That is a pass by omission, indistinguishable from no coverage — the failure mode this same file names at `:105-108` ("a guard that silently audits nothing is the 010 defect in a different costume"). FR-1075 demands a *named* exemption; there is currently nothing to name it against.

**2. What the roster DOES trip, and only in one placement.** Rule 2 (`:172-197`) scans `.select({…})` projections for `/\battendeeId\b|\bdisplay_name\b|\bdisplayName\b|\bemail\b/` (`:187`) over `authoringFiles` — exactly two files, `db/queries/admin-catalog.ts` and `routes/admin/catalog.ts` (`:85-88`). A roster query projecting `attendees.displayName` **fails hard** if written there, and is **never scanned** if written in a new `db/queries/admin-enrolments.ts`: that file joins `administrativeFiles` through `:74`'s `/\badmin-[a-z-]+\.ts$/`, but `administrativeFiles` is only subject to rule 1 (message-schema import `:122-138`, note body `:140-150`), neither of which a roster touches. So both placements are wrong for the same reason — one fails, one is invisible.

**3. The minimal, legible restructure — widen, then exempt by name.**
- **(a)** Add `enrolments?|enrolled|roster|places?` to the rule-4 noun regex at `:288`, so the route is *caught*.
- **(b)** Add one named constant beside it, in the shape `operator-audit.test.ts` already uses twice — `PLATFORM_TIER_ONLY` (`:127`) and `NAMES_NO_CONFERENCE` (`:308`): `const ENROLMENT_DISCLOSURE = new Map<string, string>([['GET /admin/conferences/:eventId/sessions/:id/enrolments', '<written reason citing v5.3.0 O1 / FR-1073>']])`, keyed on the exact `METHOD url` label, and used as `.filter((label) => !ENROLMENT_DISCLOSURE.has(label))` **after** the `flatMap(methodsOf…)` at `:295` — not as a `.filter` on `route.url` before it, or every verb on that address is exempted with it.
- **(c)** Three anti-vacuity assertions, all with precedent in this repo: every listed label still exists in the route table (`operator-audit.test.ts:216-221`, `:389-393`); every listed reason exceeds a length floor (`:390-392`); and — the one that is new and is what makes the exemption honest — **every listed label must actually match the widened noun regex**, so an exemption for a path the detector never catches fails as stale. That is `MATCHER_CASES` (`operator-audit.test.ts:71-85`) applied to the exemption instead of to the matcher.
- **(d)** Rule 2 gains a **third file list**, not a widened `authoringFiles`: `const disclosureFiles = [join(apiSrc,'db','queries','admin-enrolments.ts')]`, asserted to project `displayName` **and nothing else** — no `attendeeId`, no `email`, no avatar column. An allowlisted projection over one named module, rather than an unscanned module. `authoringFiles` stays at two files and `admin-catalog.ts` keeps its absolute "no identity, ever" property.

**4. Why every other administrative read still fails.** The exemption is a `METHOD url` string, so `GET …/sessions/:id/notes`, `…/saved`, `…/votes`, `…/attendees` are all still caught by `:288` and match no key. The regex is widened, never relaxed — the four original nouns are untouched. Rule 2 still refuses any identity column in `admin-catalog.ts`. `admin-forbidden-surfaces.test.ts:187-199` independently refuses `/profile|attendees?\/[:{][^/]+$/`, so `/admin/attendees/:id/enrolments` — FR-1073a's forbidden cross-conference view of one attendee — fails there regardless of what this file says.

**5. Two shipped assertions the roster work will silently walk past, both needing an enrolment twin.** `:207-221` pins `savedSessions.attendeeId` in `admin-catalog.ts` to `toBe(1)` — a matching FR-1080 marker-clear on `enrolments.attendeeId` (organizer's own act must not mark their own row) would be **unguarded**, because the assertion is spelled with the table name. And rule 3's `.send(…)` scan at `:264-267` matches the identifiers `recipients|attendeesToNotify|savers|attendeeIds`; if the roster handler lands in `routes/admin/catalog.ts`, a reply variable named `attendeeIds` trips it falsely — another reason the roster belongs in its own route module.

**6. The guard that authorises "assigned organizer for THIS conference" is `requireConferenceAuthority` — tranche 1's fifth branded scope**, `apps/api/src/admin/require-conference-authority.ts:155`, minting the non-exported `VerifiedConferenceAuthority` / `ConferenceAuthorityScope` (`:87`, `:116`), re-checked at the query layer by `assertVerifiedConferenceAuthority` (`:232`). The organizer predicate is the live-assignment join at `:188-200` (`organizerAssignments.attendeeId` × `eventId`, `revokedAt IS NULL`); the platform tier takes the existence-only branch at `:169-180`, which is why FR-1073's "a platform operator holds the same read" needs no second guard. It is **not** `requireOperator` (`require-operator.ts:108`, who is calling) nor `requirePlatformOperator` (`:132`, which tier).

**Rationale**: **The path must name `:eventId`, and that is a hard constraint rather than a convention.** `requireConferenceAuthority` reads `(request.params ?? {}) as { eventId?: string }` and throws `notFound()` when it is absent (`require-conference-authority.ts:163-167`), and `operator-audit.test.ts:333-346` fails any route carrying the guard whose url lacks `/:eventId\b/` — its message says such a route "authorises over `undefined`" and disappears from `event-scope-audit`, which examines a route only if it declares an event parameter. So `/admin/sessions/:id/enrolments` is not an option.

**Nesting under `/admin/conferences/:eventId/sessions/:id/` is what the rest of the audit stack already expects.** `event-scope-audit.test.ts:320` bounds its own administrative exclusion by demanding that any `/admin` route naming a conference carries `requireConferenceAuthority` — satisfied by construction here. `operator-audit.test.ts:350-368` demands `requireOperator` appear before it by reference. And the route must **not** be added to `PLATFORM_TIER_ONLY` (`:127-135`): that table is a positive obligation listing the routes an organizer must be refused, and FR-1073 says the assigned organizer is the primary reader.

**FR-1073a's "only that conference's sessions" is delivered by the query, not by the path.** Every tranche-1 catalog query re-anchors on `scope.eventId` in its own `WHERE` — `admin-catalog.ts:435` and `:459` are the pattern — so the roster's join must carry `eq(sessions.eventId, scope.eventId)` rather than trusting `:id`. Without it, an assigned organizer reads any session's roster in the product by guessing a UUID under a conference they do run.

**Why "widen, then exempt" rather than "exempt":** FR-1075's own words are that the narrowing "MUST be expressed as a named exemption for enrolment alone rather than by relaxing the rule". A rule that never matched the thing being exempted has not been narrowed — it was always blind there. The shipped file's own header calls rule 4 "a path is a promise" (`:281`) and asserts it "at the route table rather than in source, because this one is about what the API *offers*". An offer the detector cannot see is the exact gap 016's review recorded as *"the check is brightest exactly where it is blindest"*. Widening the noun set first is what converts the roster from an accident into a decision, and it is one line.

**Why a third file list rather than adding the roster module to `authoringFiles`:** `authoringFiles`' comment (`:77-84`) already records the reasoning — auditing a module that legitimately names people "would either fail on correct code or force an exemption broad enough to cover the thing this file exists to catch". Adding `admin-enrolments.ts` to that list forces exactly that. A separate list with a *narrower* assertion (one permitted column) is strictly more coverage than today, where a new `admin-*` query module is scanned by rule 1 alone.

**Alternatives considered**:

- **Leave rule 4's regex alone and name `enrolments` in a comment.** Rejected: verified by running the regex — the route passes with no exemption at all, so the 'named exemption' would be decorative prose beside a check that never fired. Indistinguishable in six months from the guard simply not covering enrolment.
- **Exempt by path prefix, `!/^\/admin\/conferences\/[:{][^/]+\/sessions\//`.** Rejected: that prefix covers every session subresource, so a later `…/sessions/:id/notes` would be exempted by the same filter. The exemption must be keyed on the full `METHOD url` label, as `PLATFORM_TIER_ONLY` (operator-audit.test.ts:127) and `NAMES_NO_CONFERENCE` (:308) both are.
- **Put the roster query in `admin-catalog.ts` and exempt its one projection.** Rejected: rule 2's scan is per-projection but any exemption reachable from that file weakens the one module whose invariant is 'count(*) is the whole interface' (:193-196), and it would sit two hundred lines from the `savedSessions.attendeeId`-pinned-to-one assertion (:211) it contradicts in spirit.
- **Put it in a new `db/queries/admin-enrolments.ts` and rely on `administrativeFiles` picking it up via :74.** Rejected as insufficient rather than wrong: that list is only subject to rule 1 (message schema, note body), so the projection is never scanned. The module is the right home; it needs the new `disclosureFiles` list to be audited at all.
- **Name the route `…/sessions/:id/attendees`.** Rejected: it trips rule 4 (verified true), which is honest, but it reads as a directory rather than a roster and invites the 'route into anybody's profile' FR-1073a forbids. `enrolments` names the exception exactly — the exemption then says what it exempts.
- **Name it `/admin/attendees/:attendeeId/enrolments`.** Rejected on two counts: it fails `admin-forbidden-surfaces.test.ts:187-199` (`attendees?\/[:{][^/]+$` — a route reaching an attendee), and it is literally FR-1073a's forbidden 'cross-conference view of one attendee'.
- **Use `requirePlatformOperator` plus an assignment check inside the handler.** Rejected: it duplicates the join at require-conference-authority.ts:188-200, produces an unbranded value the query layer cannot verify with `assertVerifiedConferenceAuthority`, and `operator-audit.test.ts:378-390` would then have to allow-list a route that genuinely can name its conference.
- **Widen rule 4 to be an allowlist of permitted administrative addresses instead of a denylist of nouns.** Considered seriously — it is the stronger shape and matches `PLATFORM_TIER_ONLY`'s reasoning that a denylist defaults new routes to permitted. Rejected for this tranche as a larger change than FR-1075 asks for: it would require writing a reason for all ~28 shipped administrative addresses, and the noun-set widening plus a one-entry named exemption is the minimal legible change. Worth recording as the next reviewer's question.

**This changes the shape of the work**: **Yes, in three ways.** (1) The assignment assumed the guard would catch a roster route and need exempting; it does not — `enrolments` matches none of rule 4's seven nouns. So the task is **widen the detector, then exempt by name**, and a task that only writes an exemption produces a decorative constant beside a check that never fires. This must be sequenced: the widening lands first and the route must be seen to fail before the exemption is added. (2) Rule 2 needs a **third file list** (`disclosureFiles`) with an allowlisted single column, not a widened `authoringFiles` — the roster query lives in a new `db/queries/admin-enrolments.ts` that today would be scanned by nothing relevant. (3) Two shipped assertions acquire enrolment twins that nobody is currently obliged to write: the `savedSessions.attendeeId`-equals-one pin (`:211`) has no enrolment counterpart, so FR-1080's marker-clear on a held place would ship unguarded; and rule 3's `.send(…)` identifier scan means the roster handler must live outside `routes/admin/catalog.ts` or risk a false trip on a variable named `attendeeIds`.

**Evidence**: `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:288 — the rule-4 noun regex `/\b(notes?|saves?|saved|votes?|voters?|attendees|questions)\b/i`; `enrolments`, `roster` and `places` match none of it (verified by running it against the candidate paths)`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:281 — "A path is a promise, and `/admin/…/sessions/:id/attendees` is a readout whatever its handler currently does."`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:284-303 — rule 4 in full: url prefix filter (:286), noun filter (:288), the two shipped exemptions (:293, :294), label construction (:295)`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:105-108 — the anti-vacuity assertion and its own naming of the 010 defect`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:85-88 — `authoringFiles` is exactly `db/queries/admin-catalog.ts` and `routes/admin/catalog.ts``; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:77-84 — why `authoringFiles` is narrower than `administrativeFiles`, and why widening it forces an over-broad exemption`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:71-75 — `administrativeFiles`, including the `/\badmin-[a-z-]+\.ts$/` filter at :74 that a new `admin-enrolments.ts` would join`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:177,187 — the projection scan and the identity-column regex it applies`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:207-221 — `savedSessions.attendeeId` pinned to exactly one use, spelled with the table name so an enrolment marker-clear is unguarded`; `apps/api/tests/unit/no-attendee-state-disclosure.test.ts:264-267 — the `.send(…)` scan matching `recipients|attendeesToNotify|savers|attendeeIds``; `apps/api/src/admin/require-conference-authority.ts:13 — "the fifth branded scope: may this principal write to this conference?"`; `apps/api/src/admin/require-conference-authority.ts:155-203 — the guard; :163-167 reads `eventId` from params and throws `notFound()` without it; :169-180 the platform-tier branch; :188-200 the live-assignment join`; `apps/api/src/admin/require-conference-authority.ts:116,232 — the exported type and `assertVerifiedConferenceAuthority`, the query-layer re-check`; `apps/api/src/admin/require-operator.ts:108,132 — `requireOperator` (who is calling) and `requirePlatformOperator` (which tier); neither has a conference operand`

## R17 — Where does the taxonomy vocabulary live, and what does the "profile" string ban force? Specifically: what the vocabulary schema file should be called and where it goes; what the repository interface must be named to avoid the banned string; whether the taxonomy tables belong in profiles.ts or a new file and what each choice costs against the two guards; and exactly what must be added to no-draft-state.test.ts's file list and why.

**Decision**: **Schema.** A NEW file, `apps/api/src/db/schema/vocabulary.ts`, holding the three reference tables (sectors, subsectors, interest options) plus their `retired_at`. NOT `profiles.ts`. One append-only export line in `apps/api/src/db/schema/index.ts` (its header states that rule, index.ts:1-12).

**Attendee-side selections stay on the tables that already exist.** Sector/subsector/productive-activity are columns on `attendee_profiles` (profiles.ts:98-138); the interest selection stays `attendee_interests` (profiles.ts:152-190), gaining a nullable FK to the vocabulary row while keeping the `interest` text column for FR-1095's retained free text. **Do not create a new attendee-side table** — see the guard finding below.

**Query and route modules.** `apps/api/src/db/queries/admin-vocabulary.ts` and `apps/api/src/routes/admin/vocabulary.ts` — their own modules, NOT folded into `admin-catalog.ts`.

**Interfaces.** Two halves, in two places, deliberately:
- *Platform-tier authoring* goes INSIDE `packages/data/src/interfaces/administration.ts`, so profile-uneditable.test.ts:181-194 keeps covering it. Names: `AdminVocabularyRepository`, `AdminSector`, `AdminSubsector`, `AdminInterestOption`, `VocabularyValueInput`, `VocabularyDraft`. Banned outright: `ProfileTaxonomyRepository`, `AdminProfileVocabulary`, `ProfileVocabulary…`, any member named `…Profile…`, and any `paths['/admin/profile-taxonomy…']` binding — the guard tests the substring `/profile/i` over the whole comment-stripped file (profile-uneditable.test.ts:189-193), so a route-path string literal fails it exactly as an identifier does.
- *Attendee-side read* goes in a new `packages/data/src/interfaces/vocabulary.ts` exporting `VocabularyRepository`, registered in the `Repositories` aggregate (interfaces/index.ts:145+). Not a method on `ProfileRepository`, because Discover's interest filter (FR-1096) reads the same vocabulary and `DirectoryRepository` would otherwise reach through the profile interface. This file is unguarded and may say "profile" freely.

**The mechanical rule for administration.ts**, stated once so nobody rediscovers it: `codeOnly` strips block comments and **whole-line** `//` comments only (profile-uneditable.test.ts:68-71). A **trailing** `// …profile…` on a code line survives stripping and fails the guard. The word is permitted in `/** */` and in full-line comments, nowhere else.

**no-draft-state.test.ts — exactly what must change.** Three of its four assertions already auto-cover a new schema file; only one is file-listed:
1. **Line 108 — `const contentSchemas = schemaFiles.filter((path) => /catalog\.ts$|events\.ts$/.test(path))`. This is the file list, and `vocabulary.ts` is outside it.** This is the only assertion FR-1094b's "its reach MUST be extended in the same change" actually refers to. Preferred form: **do not widen `contentSchemas`** — add a sibling population and its own `it()`, `const referenceSchemas = schemaFiles.filter((path) => /vocabulary\.ts$/.test(path))` with the found-something sentinel this file already uses (line 109), banning `status|state|stage|phase|draft|published|approved|visible` on it, with a message citing FR-1094b rather than the conference-content message at line 117.
2. **Add the positive counterpart**, mirroring lines 176-189: assert `retiredAt` IS present and that no read filters vocabulary values out of the attendee's own held set. Retirement is the mechanism FR-1094 requires, so a guard that bans lifecycle-shaped columns without positively naming the one permitted state will be "fixed" by deleting `retired_at`.
3. **Update the header (lines 11-39) and the `describe` title (line 64)** — both name conference content as the subject, and FR-1094b makes the population larger. In this codebase the comment is the record.

Not needed: the draft/published column check (line 83) already runs over every schema file; the route check (123-134) builds the whole app; the migration check (146-166) reads the whole directory — but its **title says "migration 0011"** and goes stale the moment tranche 2's migration is generated (O4: claimed at generation), so rename it.

**Rationale**: **Why a new file, measured against both guards.**

*Against no-draft-state.* The draft/published column ban is schema-wide (`schemaFiles`, line 58, used at line 83), so a new file is covered by existing. Only the `status|state|stage|phase` ban is file-listed (line 108), and that list is named `contentSchemas` with a failure message reading "Conference content gained a status column" (line 117). Putting the vocabulary in `profiles.ts` forces adding `profiles\.ts$` to that list, which (a) applies a conference-content rule to `attendee_profiles` and `attendee_interests`, where the requirement has nothing to say — the "written too broadly and caught correct code" class `deviations.md` D14 records three times — and (b) makes the guard's own message false for the file that triggers it.

*Against profile-uneditable.* The tables themselves are invisible to it either way (it matches variable names, not files). The cost of `profiles.ts` is documentary and it is load-bearing: profiles.ts:30-34 declares, for "both tables in this file", `ON DELETE CASCADE` from `attendees` and export coverage of "every column of both tables". FR-1085a says the vocabulary has **neither**. A reference table landing in that file makes a shipped header false the day it lands. And FR-1093a requires the vocabulary "addressed and named as reference data, never as a profile surface" — declaring it inside `profiles.ts` names it as a profile surface at the schema layer, which is the layer the generated contract path names are ultimately derived from.

*The cost of the new file is small and enumerable*, and is exactly the shape FR-1085a asks for: both coverage guards discover tables by reading **files on disk rather than the barrel** (deletion-coverage.test.ts:258-271; export-coverage.test.ts:230-236), so each vocabulary table **fails by existing** until it gets an entry in `NOT_ATTENDEE_DATA` (deletion-coverage.test.ts:47) and `NOT_EXPORTED` (export-coverage.test.ts:43), each with a stated reason longer than 20 characters (deletion-coverage.test.ts:478-484; export-coverage.test.ts:322-327). That is "declared with that reason rather than allow-listed silently", enforced.

**Why the interface split, and why the admin half must stay in administration.ts.** The guard reads exactly one hard-coded path (profile-uneditable.test.ts:184) and its own message says why: "an absence asserted over `apps/admin` alone would be one refactor away from being false." A new `interfaces/admin-vocabulary.ts` would put the administrative vocabulary interface one file outside the only check on it — which is the failure mode the message describes, arriving by the route it did not anticipate. The file currently contains **zero** occurrences of "profile" in comment-stripped code; the single occurrence at administration.ts:357 is inside a block comment.

**Why the path string matters and not only the identifier.** Contract types are bound as `paths['/some/path'][…]` (contract.ts:1, contract.ts:40), and administration.ts already imports from `../contract.js` (administration.ts:30). The moment a vocabulary type is bound that way, the literal route path enters the guarded file. So FR-1093a's "a path is a promise" is mechanically enforced here, not merely advisory: `/admin/vocabulary/sectors` is importable, `/admin/profile-taxonomy/sectors` is not.

**Why the query module must be its own file.** `admin-catalog.ts` imports `speakers` (admin-catalog.ts:11) and matches `/\bspeakers?\b/i`, so it is subject to the speaker-to-attendee proximity check (profile-uneditable.test.ts:142-164, regex at 149: any PERSONAL_TABLES name within 120 characters of `speakers`, either direction, no word boundary). FR-1094 and FR-1094c require a holder-existence check against `attendee_interests`/`attendee_profiles` before a delete or a rename. In `admin-catalog.ts` that check would be one code-ordering accident away from tripping a guard about a completely unrelated hazard; I verified the file's comment-stripped code currently contains **zero** occurrences of any of the three names, so the near-miss is real and new. In `admin-vocabulary.ts` there is no `speakers` token and the filter never selects the file. The holder check itself is permitted — both write checks match only `.insert|update|delete(` (line 100) and `INSERT INTO|UPDATE|DELETE FROM` (line 116); a `SELECT` is not a write, the same narrowing D14 records — provided it returns existence rather than a count or a roster (FR-1099b).

**Alternatives considered**:

- Taxonomy tables inside profiles.ts. Rejected: forces `profiles\.ts$` into no-draft-state's `contentSchemas` (line 108), applying a conference-content rule to two personal tables and making the guard's own message (line 117) false; falsifies profiles.ts:30-34's cascade-and-export claim about 'both tables in this file', which FR-1085a says is untrue of reference data; and names the vocabulary as a profile surface at the schema layer, against FR-1093a.
- Widening `contentSchemas` at line 108 to include the vocabulary file rather than adding a sibling population. Rejected as second-best: it is the cheaper edit and it works, but it puts reference data into a constant literally named `contentSchemas` behind a message that says 'Conference content gained a status column', which is the naming-lie half of the defect 014 tranche 1 already produced with `appendAuditEntry`. Acceptable only if the constant is renamed and the message rewritten in the same change.
- A single `VocabularyRepository` serving both actors. Rejected: it would have to live in administration.ts to stay guarded, and the attendee product would then import from the administrative interface file — 013's deviation D2 keeps administrative repositories out of `Repositories` precisely so administrative code never enters MyNet's dependency graph (administration.ts:1-29).
- Putting the attendee-side vocabulary read on `ProfileRepository` (interfaces/profile.ts:64-112). Rejected: Discover's interest filter (FR-1096) needs the same list, and `DirectoryRepository` reaching through the profile interface puts 'read the vocabulary' beside `saveOwn` — the same one-autocomplete-away argument profile.ts:11-17 already makes about not putting 'read anyone' beside 'write mine'.
- A new attendee-side table for controlled interest selections, separate from `attendee_interests`. Rejected on a guard finding rather than on modelling: `PERSONAL_TABLES` (profile-uneditable.test.ts:74) and the raw-SQL alternation (line 116) are two hand-maintained name lists, NOT derived from the Drizzle schema the way deletion-coverage and export-coverage are. A new personal table is therefore NOT covered by existing and would pass the FR-1093 guard green until somebody remembered to edit both lists. Reusing `attendee_interests` needs no list edit at all.
- Naming the schema file `taxonomy.ts` rather than `vocabulary.ts`. Neutral against every guard; `vocabulary.ts` chosen only because the spec's own binding text (FR-1085, FR-1089, FR-1094b) says 'vocabulary' where 'taxonomy' appears mostly in prose, and the guard list must name a file, not a concept.

**This changes the shape of the work**: **Yes, in three ways.**

(1) **The FR-1093 guard is name-listed, not schema-derived — the opposite of what the two coverage guards do, and the opposite of what "the shipped guard MUST survive and MUST extend to these new fields" reads as costing.** `PERSONAL_TABLES` (profile-uneditable.test.ts:74) and the raw-SQL alternation (:116) are two independent hand-maintained lists. A new attendee-side table does NOT fail by existing; it passes green. This turns "keep interest selections on `attendee_interests`" from a modelling preference into a guard requirement, and if tranche 2 ever does add a personal table it is a two-list edit that no test will demand.

(2) **The "profile" ban covers exactly one file path.** Any refactor that moves the administrative vocabulary interface out of `administration.ts` silently disables the guard — the failure mode the guard's own message names, arriving by the one route it did not anticipate. Tranche 2 should either pin the interface there or generalize the guard to every administrative interface file; leaving it as-is is a decision, not a default.

(3) **FR-1094b's "extend its reach" is one line, not a rewrite** — assertion 2 of 5 in no-draft-state.test.ts, everything else auto-covers — but the cheap version of that edit reproduces the over-broad-guard defect D14 records three times. The task should be written as "add a sibling population with its own message", not "widen `contentSchemas`", or the review will re-derive it.

**Evidence**: `apps/api/tests/unit/profile-uneditable.test.ts:181-194 — the ban is scoped to exactly one hard-coded path, `packages/data/src/interfaces/administration.ts`, tested as `/profile/i.test(contract)` over the comment-stripped file`; `apps/api/tests/unit/profile-uneditable.test.ts:68-71 — `codeOnly` strips block comments and `^\s*//` line comments only; a trailing `//` comment is not stripped`; `apps/api/tests/unit/profile-uneditable.test.ts:74 — `PERSONAL_TABLES` is a hand-written list of three variable names, not derived from the schema`; `apps/api/tests/unit/profile-uneditable.test.ts:100 — the write check matches `\.(insert|update|delete)\(\s*<table>\b`; a SELECT is permitted`; `apps/api/tests/unit/profile-uneditable.test.ts:116 — a second hand-written alternation `(attendees|attendee_profiles|attendee_interests)` for raw SQL`; `apps/api/tests/unit/profile-uneditable.test.ts:142-164 (regex at :149) — speaker-to-attendee proximity check, 120 characters, either direction, no word boundary`; `apps/api/tests/unit/profile-uneditable.test.ts:77-83 — the audited surface is routes/admin/**, src/admin/**, and db/queries/*admin*`; `packages/data/src/interfaces/administration.ts:357 — the file's only occurrence of "profile", inside a block comment and therefore stripped`; `packages/data/src/interfaces/administration.ts:30 — `import type { TrackColorToken } from '../contract.js'``; `packages/data/src/contract.ts:1 and :40 — contract types are bound as `paths['/auth/me'][...]`, so a route path enters the importing file as a string literal`; `apps/api/src/db/queries/admin-catalog.ts:11 — imports `speakers`, so the file matches the proximity guard's file filter (51 occurrences of 'speaker' in the file)`; `apps/api/tests/unit/no-draft-state.test.ts:58 and :81-92 — the draft/published column ban runs over every file in db/schema`; `apps/api/tests/unit/no-draft-state.test.ts:107-121 (list at :108, sentinel at :109, message at :117) — the `status|state|stage|phase` ban is restricted to `/catalog\.ts$|events\.ts$/`; this is the file list a new schema file falls outside`; `apps/api/tests/unit/no-draft-state.test.ts:146-166 — the migration check reads the whole directory; only its title names 0011`

## R18 — R18 — What does moving interests from free text to controlled values do to Discover? Exactly what changes in `listDirectory` if interests become foreign keys to a vocabulary; whether in-flight cursors break and what the migration story is; whether existing free-text interests can be preserved alongside controlled ones (FR-1095b); and whether the filter-options design may now relax.

**Decision**: **The premise fails: interests MUST NOT become foreign keys, and the answer to "what changes in that query" is *nothing about interests*.**

Four parts.

**1. `attendee_interests` is unchanged — same `interest text` column, same composite primary key, same index, same length CHECK, no new column, no reference.** The vocabulary is a separate product-wide reference table of **labels**. Membership is enforced **at the write** in `writeOwnProfile`, not by referential integrity: every submitted value must be currently choosable **or** already held by that attendee (FR-1095b), which is a `SELECT interest FROM attendee_interests WHERE attendee_id = $1` union against the choosable set. `attendee_interests` therefore needs **no migration at all**; the migration is new tables (sectors, subsectors, interest labels) plus new `attendee_profiles` columns.

**2. The directory query's interest machinery takes zero edits.** The filter `EXISTS` (directory.ts:203-211), the displayed-interests lateral (268-272), the shared-count lateral (275-284), `ORDER BY shared.shared_count DESC, a.id ASC` (295), and both cursor functions (118-138) all compare **text to text** and keep working verbatim against a controlled vocabulary, because a chosen value is stored as its label. The route's `interest: { type: 'string', maxLength: 60 }` (routes/events/directory.ts:120) stays a string and **must not become a uuid**. The **only** tranche-2 edit to `directory.ts` is FR-1099d: add the productive-activity column to the `unaccent(lower(...))` concatenation (188-195) and to the projection/`DirectoryRow` (44-55, 249-259) — and *not* sector or subsector.

**3. No in-flight cursor breaks, and nothing can be made to.** `encodeCursor` carries `${sharedInterestCount}:${attendeeId}` and nothing else (118-119) — no interest values, no vocabulary version, no filter state — and `decodeCursor` validates only "non-negative integer" and "UUID shape" (123-138). Since no attendee row is rewritten by the migration, no score moves, so no cursor even loses accuracy. FR-1095a's "paging guarantee MUST be unchanged" is satisfied **structurally**: retirement writes to no attendee record (FR-1094), so a value retired mid-scroll cannot re-score a page.

**4. The interest filter's options may relax to the whole vocabulary; the role filter must not — and today they are one code block, so the relaxation is a split, not a swap.** `SeenOptions` drops its `interests` member (Discover.tsx:299-303), the render-time adjustment compares one length instead of two (126-131), `interestOptions` comes from a new vocabulary read, and the comment at 71-98 is FR-1096a's named subject. **The non-obvious half: the interest options must stop resetting on a conference switch.** The reset at 123-124 is argued at 95-97 from "a role that existed at the previous conference is not a value this reader has seen *here*"; the vocabulary is cross-event (FR-1085) and FR-1096 requires every value offered whether or not anybody here holds it, so re-keying interests on `eventId` would reintroduce the population-shaped list FR-1096's second bound forbids. Roles stay re-keyed.

**Rationale**: **Why the foreign key is not buildable, from three independent directions.**

*FR-1086 leaves nothing to point at.* The interest list ships **empty and authorable** — only the four sectors are seeded. So on day one every row in `attendee_interests` has a NULL reference, including the six seeded fixture interests (seed/attendees.ts:91,100). A column that is NULL for 100% of rows at introduction and can never be made `NOT NULL` is not a foreign key; it is a second nullable field beside the real one.

*FR-1095 forbids the backfill an FK requires.* "No administrative act may map it onto a vocabulary value." A data migration resolving free text to ids **is** that act, performed silently on every attendee at once — the exact write to an attendee's record FR-1093 forbids.

*FR-1095a's exact-match rule is satisfied by text and broken by ids.* The overlap join is `candidate.interest IN (SELECT reader.interest …)` (279-283). Under an id model, a reader holding retained free-text `"Fintech"` and a candidate holding the vocabulary entry `"Fintech"` score **0** against each other — their rank would change "because of how a value was authored", which is the clause's literal prohibition. Spec line 898 accepts that two *differently spelled* values rank apart; it does not license identically-spelled ones ranking apart.

**Three shipped guards pin the text column by name**, and each would have to be rewritten for an id model rather than merely extended: the composite primary key that makes double-adding an interest impossible *by construction* (schema/profiles.ts:161-168) could no longer see a duplicate held once as text and once as a reference; `attendee_interests_interest_idx` (schema/profiles.ts:170-181, migrations/0005:4) and its integration assertion that the filter actually reaches it (index-usage.test.ts:228-237) name the text column; and `attendee_interests.interest` is the export-coverage entry (export-columns.ts:70).

**A cross-constraint that falls out of the text model and must be honoured at authoring time.** `attendee_profiles.PROFILE_LIMITS.interest = 60` is a column CHECK (schema/profiles.ts:42, 185-188) and the route's `maxLength` (routes/profile.ts:131). A vocabulary label longer than 60 characters is therefore **unstorable in any profile** — so the vocabulary's own label length must be bounded by the same constant, in the same place, or an operator can author a value no attendee can select. The `interestCount: 12` bound is unaffected: `writeOwnProfile` already trims, de-duplicates and counts the **whole** set before writing (queries/profiles.ts:148-156), which is what the spec's edge case ("controlled and retained together") asks for.

**Two comments this row falsifies and must rewrite in the same change**, per FR-1088 and FR-1096a: `schema/profiles.ts:140-150` asserts as current fact that interests are *"a bounded list of short free-text values, not a controlled vocabulary"* because *"a fixed taxonomy would be an organizer-authored artifact, and Principle III puts that out of scope"* — a premise reversed by v4.0.0; and `Discover.tsx:71-98`, which becomes half true and must say which half still governs.

**Two guards fail by existing, which is the property to lean on.** Adding the productive-activity field trips `directory-response-shape.test.ts:132-145`, which asserts the card's field list is **exactly** those ten names, and the query file is read as source by the FR-413 table denylist (194-202) — so a vocabulary join added to `directory.ts` would be visible to review by construction. Note the third reader: `queries/cards.ts:485-489` resolves a held card's interests with the identical `array_agg(ai.interest)` lateral, so any representation change is three files, not one.

**One residual worth recording rather than rediscovering.** Offering the whole vocabulary makes an empty result set answer "nobody discoverable-and-verified here holds this", which the accumulate design could not be asked. It breaches no shipped rule — FR-404's prohibitions are on totals, withheld counts and hidden markers (asserted at directory-response-shape.test.ts:153-169), and the free-text search box is already a broader probe — but it *is* the disclosure the accumulate comment was arguing about, and FR-1096 should be read as accepting it knowingly.

**Alternatives considered**:

- `interest_id uuid NOT NULL REFERENCES interest_values(id)`, replacing the text column. Rejected on FR-1086 alone: the interest list is seeded empty, so there is nothing for any existing row to point at, and the migration would have to delete or rewrite every row in `attendee_interests` — which FR-1095 forbids twice (destroys retained values; performs the administrative mapping FR-1093 bars).
- Nullable `interest_id` beside the retained `interest` text — the hybrid. Rejected: two sources of truth for one displayed string, with the one that drifts being the one displayed (009's vote-count rule, 008's `lapsed` rule). The composite PK at schema/profiles.ts:168 can no longer express one-interest-per-attendee; the overlap join stops being exact equality and becomes a match over a coalesce, which is what FR-1095a forbids; and both the index and its integration assertion have to be duplicated for the second column.
- A text-valued foreign key — `interest REFERENCES interest_values(label) ON UPDATE CASCADE`. Rejected although it preserves exact matching: a foreign key cannot be satisfied by a retained free-text value that is not in the vocabulary, so it collapses into the nullable hybrid above; and `ON UPDATE CASCADE` would rewrite every holder's attendee row on a rename — precisely the act FR-1094c forbids by name and refuses in favour of retire-plus-create.
- A conference-scoped interest-options endpoint returning the values actually held at this conference. Rejected: FR-1096's second bound says an option list that shrinks to what exists is population data again — the exact disclosure the accumulate design was built to refuse, reintroduced under a new name.
- Keep accumulate-what-you-have-seen for interests too and decline FR-1096's relaxation. Rejected: it keeps the design's cost (Discover.tsx:85-98 — the control removes its own alternatives the moment it is used, and the reader has to guess that clearing is the way back) while its reason has gone, because a closed vocabulary the product publishes discloses nothing about who is at the conference.
- Add the vocabulary read as an event-scoped route under `/events/:eventId/…`. Rejected: it would make the option list a function of the conference, which FR-1096 forbids, and it would need an `EventScope` for reference data that names no attendee (FR-1085a). It carries no personal data, so `event-scope-audit` walking past a route that names no conference — the gap 007, 008 and 009 each had to close — is correct here rather than a hole.

**This changes the shape of the work**: **Yes, twice.**

**(a) The assignment's premise does not survive contact with the code.** There is no foreign key to design, because FR-1086 ships the interest list empty — so nothing exists to reference on day one and the mapping migration an FK needs is the act FR-1093/FR-1095 forbid. Tasks written as "migrate `attendee_interests` to reference the vocabulary" should be replaced by "enforce vocabulary membership at the write in `writeOwnProfile`, and leave the table alone". This shrinks the tranche: `attendee_interests` needs no migration, and `listDirectory`'s ranking, filter and cursor need no edit — the taxonomy row's only change to that file is FR-1099d's search column.

**(b) The filter-options relaxation is a client change with a hidden behavioural half, not a server one.** FR-1096 reads as "offer the whole vocabulary", but the shipped code holds roles and interests in one state object with one reset key, so honouring FR-1096 and FR-1096a together means **splitting** `seen` — and the split changes conference-switch behaviour for interests, which no requirement states in those words and which the current reset comment argues *against*. Plan a task for the split and its comment rewrite explicitly, or it will be written as "point the select at the vocabulary" and the stale `eventId` re-key will survive underneath it.

Two smaller shape consequences worth carrying into planning: the vocabulary label length must be bounded by `PROFILE_LIMITS.interest` at the authoring surface, or an operator can create a value no attendee can store; and the interest representation has **three** readers (directory, profile, cards), so any later pressure to change it is a three-file change, not one.

**Evidence**: `apps/api/src/db/queries/directory.ts:118-119 — encodeCursor carries only `${sharedInterestCount}:${attendeeId}`; no interest value, no vocabulary version, no filter state`; `apps/api/src/db/queries/directory.ts:123-138 — decodeCursor validates only non-negative integer and UUID shape, and refuses rather than restarting`; `apps/api/src/db/queries/directory.ts:203-211 — the interest filter is `filtered.interest = ${interest}`, exact text equality`; `apps/api/src/db/queries/directory.ts:268-272 — displayed interests: `array_agg(ai.interest ORDER BY ai.interest)``; `apps/api/src/db/queries/directory.ts:275-284 — the ranking join: `candidate.interest IN (SELECT reader.interest …)`, text-to-text`; `apps/api/src/db/queries/directory.ts:188-195 — the search predicate FR-1099d extends: display_name, company, role, headline under `unaccent(lower(...))``; `apps/api/src/db/queries/directory.ts:220-226 — the keyset bound, spelled out because the two columns sort in opposite directions`; `apps/api/src/db/schema/profiles.ts:140-150 — the comment FR-1088 orders rewritten: interests are "a bounded list of short free-text values, not a controlled vocabulary"`; `apps/api/src/db/schema/profiles.ts:161-168 — the composite primary key IS the one-interest-per-attendee rule, "idempotent by construction"`; `apps/api/src/db/schema/profiles.ts:170-181 — `attendee_interests_interest_idx`, the index that serves both the filter and the overlap join`; `apps/api/src/db/schema/profiles.ts:185-188 — the per-row length CHECK on `interest`, bounded by PROFILE_LIMITS.interest`; `apps/api/src/db/schema/profiles.ts:38-61 — PROFILE_LIMITS: interest 60, interestCount 12, and why the count is not a column CHECK`; `apps/api/src/db/queries/profiles.ts:148-156 — trim, de-duplicate, then bound the whole set: already FR-1095b's shape for the count rule`; `apps/api/src/db/queries/profiles.ts:181-188 — replace-in-place inside the transaction; the write path FR-1095b's held-value check belongs in`

## R19 — R19 — What does tranche 2's migration actually touch, and what is the lock strategy? Specifically: the next free migration number under O4's claim-at-generation rule; the exact regeneration procedure (README-must-move, idx-vs-tag-vs-snapshot naming); which statements take ACCESS EXCLUSIVE on which tables and for how long; whether drizzle wraps all pending migrations in ONE transaction and what that means for index builds; the concrete lock strategy for the plan; and whether making `sessions.room_id` nullable is a catalog-only change or a table rewrite.

**Decision**: **(a) The number is `0012`, not `0010`, and that is a departure the spec must state.**

On disk: `0000`–`0009` and `0011` (`apps/api/migrations/`). There is **no `0010_*.sql`**. The roadmap still reserves `0010` for 012 *(reserved, unclaimed)* and `0012` for 015 *(reserved)* (roadmap:208, 211) — and O4 voids both reservations (constitution:65-68, 2916-2921). So `0010` and `0012` are both "free".

Take **`0012`**. `0010` looks like the literal reading of "the next free number", and it is the wrong one here, because **tranche 2 and tranche 1 are NOT independent migrations.** Tranche 2 must redefine `admin_audit_entries_action_valid` to admit the vocabulary actions FR-1089a requires — the same named CHECK constraint `0011` drops at line 1 and re-adds at line 12. Numbering tranche 2 `0010` would put the newer, dependent migration *before* its dependency in filename order while the journal applied it after; anyone or anything that trusted the filename would drop the constraint, re-add the full list, then let `0011` drop it again and re-add tranche 1's shorter list — silently losing tranche 2's audit actions, with the failure appearing at the first vocabulary write. The `0003`/`0004` inversion is safe precisely because the README can say *"the two migrations are independent"* (README:23-24); that sentence is false here. A gap in the filename sequence is inert — `readMigrationFiles` reads `_journal.json` tags and never a filename sequence (migrator.cjs:45-48). An inversion over a dependent pair is a trap.

Extend the roadmap table in the same change (O4 makes this mandatory): add the 014-tranche-2 → `0012` row, and rewrite 012's and 015's rows from *reserved* to claim-at-generation.

---

**(b) The regeneration procedure, exactly.**

1. `mv apps/api/migrations/meta/README.md /tmp/meta-README.md`. **Move, do not relocate** (README:73-94) — `drizzle-kit` `JSON.parse`s every file in `meta/` and aborts with `SyntaxError: Unexpected token '#'`, naming no file.
2. `pnpm db:generate --name conference_authoring_tranche_2` (drizzle.config.ts, `out: './migrations'`).
3. It writes `0011_<name>.sql` (the prefix is the **journal index**, which is now 11 — README:52-54 records this happening at index 10), `meta/0011_snapshot.json`, and a journal entry `{ idx: 11, when: <now>, tag: "0011_<name>" }`.
4. **Rename the SQL file to `0012_conference_authoring_tranche_2.sql` and change the journal entry's `tag` to match. Leave `idx: 11` alone.** The migrator reads `${journalEntry.tag}.sql` and never touches `idx` (migrator.cjs:46-48); `idx` is array position and array position is what orders a fresh database (README:15-16, 55-59). This is not the rename the constitution forbids — that clause is about renaming a migration *another branch has already applied* (constitution:2919-2921); this file has reached no database.
5. **Leave `meta/0011_snapshot.json` named as generated.** Do not rename it to `0012_`. `drizzle-kit` picks the last snapshot by filename to diff against, and a hand-rename either breaks the chain or duplicates a `prevId` (README:60-63).
6. Result is a **fourth skew** to document: journal `idx: 11` ↔ tag `0012_…` ↔ snapshot `0011_snapshot.json`. Restore the README and add a section for it, in the shape of its existing one (README:45-71). The README is the artifact that carries this to the next generator.
7. Verify the generated `when` exceeds `1786601533140` (`_journal.json`:78). The migrator reads the single most recent applied row (`order by created_at desc limit 1`, dialect.cjs:58-61) and applies every entry whose `when` beats it; a lower `when` is **silently skipped** on every existing database (README:17-21).
8. Hand-add the leading `--` header block to the `.sql`, as `0003` does (0003:1-12) and with interleaved per-statement notes (0003:73, 76-77). Know that any future regeneration erases it (migrate.ts:39-42) — the same reason `lock_timeout` lives on the connection and not in SQL.

---

**(c) Yes — ONE transaction, over ALL pending migrations and ALL their statements.**

`dialect.cjs:62-73`: `await session.transaction(async (tx) => { for each pending migration { for each stmt { await tx.execute(...) } ; insert the journal row } })`. Three consequences:

- **`CREATE INDEX CONCURRENTLY` is unavailable.** PostgreSQL forbids it inside a transaction block. `drizzle-kit` emits it only when the schema declares `.concurrently()` (bin.cjs:25037) — no index in `apps/api/src/db/schema/` does, and none may be added here.
- **Every lock is held from the statement that takes it until COMMIT of the whole run.** Blast radius is total run duration, not per-statement duration. Splitting tranche 2 into two migration files buys nothing: the migrator wraps both in the same transaction.
- **Rollback is atomic**, including the `__drizzle_migrations` rows. This is what makes the 10s `lock_timeout` a *safe* abort rather than a half-applied schema.

Where it bites operationally: `deploy.sh:245` runs `node dist/db/migrate.js` **while the old API container is still serving** (deploy.sh:239-244), so an `ACCESS EXCLUSIVE` hold on `sessions` or `events` blocks live programme *reads* for the run's duration.

---

**(d) Statement-by-statement locks, for the tranche 2 schema.**

`events` (one row per conference):
- `ADD COLUMN "modality" text DEFAULT 'in-person' NOT NULL` → **ACCESS EXCLUSIVE**, catalog-only. A **constant** default takes PG 11's missing-value fast path: no rewrite. This is exactly FR-1048's back-fill, and exactly `0001`'s `timezone` shape (0001:21-22).
- `ALTER COLUMN "modality" DROP DEFAULT` → ACCESS EXCLUSIVE, catalog-only.
- `ADD COLUMN "format" text` (nullable) → ACCESS EXCLUSIVE, catalog-only.
- `ADD CONSTRAINT "events_modality_valid" CHECK (...)` → ACCESS EXCLUSIVE **plus a full scan** of `events`. `drizzle-kit` emits plain `ADD CONSTRAINT … CHECK (…)` with **no `NOT VALID`** (bin.cjs:23588-23596).

`sessions` (the largest conference-content table):
- `ALTER COLUMN "room_id" DROP NOT NULL` → **ACCESS EXCLUSIVE, catalog-only, no rewrite and no scan.** See (f).
- `ADD COLUMN "kind" text DEFAULT 'mandatory' NOT NULL` + `DROP DEFAULT` → catalog-only (constant default; FR-1060's back-fill).
- `ADD COLUMN "capacity" integer`, `"enrolment_closes_hours_before" integer`, `"access_link" text` → nullable, catalog-only.
- Each new `ADD CONSTRAINT … CHECK` (kind one-of, capacity ≥ 1 and null-when-mandatory per FR-1062a, offset ≥ 0, room-or-link per FR-1050) → ACCESS EXCLUSIVE + full scan of `sessions`.

`attendee_profiles`:
- `ADD COLUMN "sector_id" uuid`, `"subsector_id" uuid`, `"productive_activity" text` → catalog-only.
- `ADD CONSTRAINT … CHECK (length …)` for the activity → ACCESS EXCLUSIVE + scan.
- `ADD CONSTRAINT … FOREIGN KEY … REFERENCES vocabulary_sectors(id)` → **SHARE ROW EXCLUSIVE on both tables** (migrate.ts:24-25 states this correctly) + a validating scan of `attendee_profiles`, all-NULL and therefore trivial. It adds no new wait, because ACCESS EXCLUSIVE is already held from the ADD COLUMN.

`attendee_interests`:
- `ADD COLUMN "interest_value_id" uuid` + FK → catalog-only + SHARE ROW EXCLUSIVE on the new (uncontended) vocabulary table.
- **The primary key must not be touched.** See (e).

New tables (`session_enrolments`, `vocabulary_sectors`, `vocabulary_subsectors`, `vocabulary_interests`):
- `CREATE TABLE` → ACCESS EXCLUSIVE on a table nobody else can see. Free. Inline CHECK/UNIQUE come with it (0009:1-9 shows the shape).
- Their FKs are emitted as separate `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` statements (0009:57-59). `session_enrolments.session_id → sessions` is subsumed by the ACCESS EXCLUSIVE already held; `session_enrolments.attendee_id → attendees` takes **SHARE ROW EXCLUSIVE on `attendees`** — the migration's only lock on that table. It blocks attendee *writes* (sign-up, discoverability toggle) but not reads, for the rest of the transaction.
- `CREATE INDEX` on the new tables → SHARE on an empty table. Free.

`admin_audit_entries`:
- `DROP CONSTRAINT "admin_audit_entries_action_valid"` then `ADD CONSTRAINT … CHECK (action in (…))` → ACCESS EXCLUSIVE + **the largest scan in this migration**. It is the only table here that grows unboundedly, bounded solely by the 365-day retention sweep. `0011` already did exactly this (0011:1, 0011:12).

---

**(e) The lock strategy to state in the plan — five clauses.**

1. **Every added NOT NULL column takes a CONSTANT default and drops it in the same statement pair.** `'in-person'` and `'mandatory'` are constants, so PG 11's fast path applies and nothing is rewritten. Explicitly **not** `0003`'s `gen_random_uuid()::text` (0003:74), which is VOLATILE and rewrites `events` — the rewrite `migrate.ts`'s own header names as the thing the timeout exists for (migrate.ts:24-30). Note `0011:4` (`DEFAULT now()`) is also fast-path: `now()` is STABLE.
2. **No statement may scale with attendee-generated data**, and the one that would is named: `attendee_interests`' primary key is `(attendee_id, interest)` (profiles.ts:168) and PK columns cannot be nullable. Any interest model that makes `interest` nullable forces `DROP CONSTRAINT` + `ADD PRIMARY KEY`, which **builds a unique index over every interest row in the product under ACCESS EXCLUSIVE**. Keep `interest` NOT NULL and add a *nullable* `interest_value_id` beside it; retained free text is then `interest_value_id IS NULL` (FR-1095) and `attendee_interests_interest_idx` (profiles.ts:181) and FR-1095a's exact-match ranking are untouched. FR-1094c — a held value may not be renamed — is what makes carrying the label safe from divergence. With that constraint honoured, **the whole migration is catalog-only on existing tables plus a handful of small validating scans.**
3. **No `CONCURRENTLY` anywhere, and no separate index-build migration.** Both are impossible inside drizzle's single transaction, and unnecessary at these table sizes.
4. **One migration file.** Splitting gains nothing (see (c)).
5. **Leave `migrate.ts` alone.** 10s `lock_timeout`, `max: 1`, **no `statement_timeout` and no `idle_in_transaction_session_timeout`** (migrate.ts:62-75; argued at client.ts:63-67). Do not copy the application pool's settings across: the one-transaction shape means an idle-in-transaction timeout would abort a legitimate multi-statement run between statements. The migration's safety comes from being short enough that the *hold* does not matter; the timeout only bounds the *wait*.

Plus: add a migration-structure test in `migrations.test.ts`'s established shape — assertions over `pg_catalog` rather than by inserting rows (migrations.test.ts:28-31) — covering `sessions.room_id` `attnotnull = false`, each new CHECK, and the enrolment cascade from *both* `attendees` and `sessions`.

**Two rules cannot be CHECK constraints and the plan must say so rather than discover it.** FR-1050a (modality decides which of room/link a session must carry) needs `events.modality`, and a CHECK may not reference another table — it is a write-path rule only, with FR-1050's room-or-link rule as the one half expressible as a table CHECK. FR-1061a (capacity not below places held) is likewise cross-table and aggregate; the FR already prescribes the locked read inside the updating transaction.

---

**(f) `sessions.room_id` nullable is a fast, catalog-only change. Not a rewrite.**

`drizzle-kit` emits `ALTER TABLE "sessions" ALTER COLUMN "room_id" DROP NOT NULL;` (bin.cjs:24891-24900). `DROP NOT NULL` flips `pg_attribute.attnotnull`: ACCESS EXCLUSIVE briefly, O(1), **no table rewrite and no scan** — it is `SET NOT NULL` that scans, not `DROP`. `sessions_event_room_starts_at_idx` (catalog.ts:275) is **not rebuilt**; btree indexes carry NULLs fine.

Three riders:
- **Read the generated SQL before committing.** The one thing that would turn this into data loss is `drizzle-kit` choosing a drop-and-re-add of the column rather than an `ALTER COLUMN`; the convertor above shows it will not, but this project reviews generated SQL and this is the statement to review.
- **`overlappingInRoom` becomes accidentally correct and should be made deliberately so.** `eq(sessions.roomId, input.roomId)` (admin-catalog.ts:1354) never matches a NULL room, so a roomless session cannot clash — right answer, currently by SQL three-valued logic rather than by declaration.
- **FR-1049's comment obligation is real and located**: catalog.ts:166-167 asserts *"Speakers are the only optional part of a session's identity"* directly above the `roomId` definition, and profiles.ts:147-149 asserts interests are *"a bounded list of short free-text values, not a controlled vocabulary"* — FR-1088's target.

**Rationale**: Every claim above is read out of the shipped tree rather than inferred.

**One transaction** is not a property of drizzle's documentation but of the code this repo has installed: `drizzle-orm@0.45.2`'s `PgDialect.migrate` opens `session.transaction` and loops every pending migration and every statement inside it (dialect.cjs:62-73), gating on `select … order by created_at desc limit 1` (dialect.cjs:58-61) against `folderMillis`, which is the journal's `when` (migrator.cjs:55). That is simultaneously the mechanism the README's `when`-ordering section (README:17-21) depends on and the reason `CREATE INDEX CONCURRENTLY` is off the table.

**The number** turns on a fact the roadmap and README do not yet carry: `0011` drops and re-adds `admin_audit_entries_action_valid` (0011:1, 0011:12), and FR-1089a forces tranche 2 to redefine the same constraint. That makes the pair order-dependent, which is exactly the condition the README cites to justify the existing `0003`/`0004` inversion as safe (README:23-24). The safety argument therefore beats the literal reading of "next free number".

**The lock inventory** is derived from what `drizzle-kit@0.31.10` actually emits — `DROP NOT NULL` verbatim (bin.cjs:24891-24900), `ADD CONSTRAINT … CHECK` with no `NOT VALID` (bin.cjs:23588-23596), `CONCURRENTLY` only when the schema asks (bin.cjs:25037) — combined with the two shapes already committed here: the constant-default pattern at 0001:21-22 and the volatile-default rewrite at 0003:74 that `migrate.ts`'s header (migrate.ts:38-45) names as a recorded unclaimed defect it cannot fix.

**The `attendee_interests` finding** is the one that could have silently made this migration expensive: profiles.ts:168 puts the free-text `interest` inside the primary key, and PK columns cannot be nullable, so any model that stores a controlled interest *instead of* the text forces a unique-index rebuild over every interest row in the product — the only ACCESS EXCLUSIVE statement here that scales with attendee data. FR-1094c (no renaming a held value) is what makes the cheap alternative safe.

**The operational bite** is real rather than theoretical because `deploy.sh:239-245` applies migrations with the previous API container still answering traffic, so ACCESS EXCLUSIVE on `sessions`/`events` is a read outage for the run's duration — which is why "short enough that the hold does not matter" is the strategy, and the 10s `lock_timeout` (migrate.ts:62) only ever bounds the wait.

**Alternatives considered**:

- Claim `0010`, filling the gap the abolished reservation scheme left. Rejected: `0011` drops and re-adds `admin_audit_entries_action_valid` (0011:1, 0011:12) and FR-1089a forces tranche 2 to redefine it, so the two are order-dependent — unlike `0003`/`0004`, which the README justifies precisely on being independent (README:23-24). Numbering tranche 2 `0010` makes filename order contradict application order for a dependent pair; a filename-ordered apply drops tranche 2's audit actions and fails at the first vocabulary write. A gap is inert (nothing reads filename sequence — migrator.cjs:45-48); an inversion is a trap.
- Renumber the journal's `idx` to match the tag, so `idx`, tag and snapshot finally agree. Rejected: `idx` is array position and array position is what orders a fresh database (README:15-16, 55-59); renumbering puts a hole at position 10 and makes that ordering claim false. The migrator reads `${tag}.sql` and never `idx` (migrator.cjs:46).
- Rename `0010_snapshot.json` (and the new one) so snapshots match their SQL files. Rejected: `drizzle-kit` picks the last snapshot by filename to diff against; a hand-rename breaks the chain or duplicates a `prevId`, which it rejects as a collision (README:60-63, 33-35).
- Move the README out of `meta/` permanently so generation stops breaking. Rejected by the README itself (README:91-94): CLAUDE.md, the constitution and three specs cite this path, and the two minutes of moving it are cheaper than the broken references — and cheaper than rediscovering the error message.
- Split tranche 2 into two migrations — schema first, indexes second — so index builds hold locks for less time. Rejected: `session.transaction` wraps ALL pending migrations in one transaction (dialect.cjs:62-73), so both files apply under the same locks in the same transaction and nothing is released earlier.
- Use `CREATE INDEX CONCURRENTLY` for the new tables' indexes. Rejected twice over: PostgreSQL forbids it inside a transaction block and drizzle applies every migration inside one; and the indexes are on tables created empty in the same run, so there is nothing to build against.
- Emit the new CHECK constraints as `NOT VALID` and validate separately, to avoid the full-table scans. Rejected: `drizzle-kit` has no `NOT VALID` path at all (bin.cjs:23588-23596), so it would mean hand-editing generated SQL — erased by the next regeneration, which is `migrate.ts`'s own stated reason (migrate.ts:38-42) for keeping `lock_timeout` on the connection. The scans are on `events` (one row per conference), `sessions` (hundreds) and `admin_audit_entries` (retention-bounded), none of which justifies it.
- Give the migration connection the application pool's `statement_timeout` and `idle_in_transaction_session_timeout` for symmetry. Rejected: client.ts:63-67 argues the asymmetry deliberately — an `ALTER TABLE` may legitimately take minutes and its failure stops a deploy rather than a conference — and the one-transaction shape means an idle-in-transaction timeout would abort a legitimate run between statements, in Node continuations nothing is doing wrong.
- Make `attendee_interests.interest` nullable and store controlled interests by id alone. Rejected: `interest` is inside the primary key (profiles.ts:168) and PK columns cannot be nullable, so this forces `DROP CONSTRAINT` + `ADD PRIMARY KEY` — a unique-index build over every interest row in the product under ACCESS EXCLUSIVE, and the only statement in this migration that would scale with attendee data.
- Express FR-1050a (modality decides room-or-link) as a table CHECK on `sessions`, matching how `sessions_ends_at_after_starts_at` puts FR-1013 at the last line of defence (catalog.ts:256). Rejected: it needs `events.modality`, and a CHECK constraint may not reference another table. Only FR-1050's room-or-link half is expressible as a table CHECK.

**This changes the shape of the work**: Yes, in three ways.

**1. The migration number is `0012`, which departs from both the roadmap and the README's own forward-looking paragraph.** The roadmap reserves `0012` for 015 (roadmap:211) and the README tells 012 to take `0010` (README:65-71); O4 voids both, and the dependency between tranche 2's and tranche 1's shared CHECK constraint rules out filling `0010`. This adds three obligations to the plan: state the departure in the spec (CLAUDE.md's roadmap rule), extend the roadmap's table in the same change (O4), and add a fourth section to `apps/api/migrations/meta/README.md` recording the new `idx: 11` ↔ tag `0012_…` ↔ `0011_snapshot.json` skew. That is a task, not a note.

**2. `attendee_interests` constrains the taxonomy data model, not the other way round.** The free-text `interest` sits inside the primary key (profiles.ts:168), so any model that makes it nullable forces a primary-key rebuild — a unique-index build over every interest row in the product under ACCESS EXCLUSIVE, and the only statement in this migration that would scale with attendee data. The model must therefore keep `interest` NOT NULL and add a nullable `interest_value_id` beside it. R19 was expected to be a lock-strategy answer; it turns out to fix an FR-1088/FR-1095 modelling decision that would otherwise be made at implementation.

**3. FR-1050a cannot be a table constraint, and the plan should say so before somebody tries.** A CHECK may not reference another table, and FR-1050a's rule needs `events.modality`. Only FR-1050's room-or-link half is expressible as a CHECK. This matters because tranche 1's own precedent (catalog.ts:256) is that the route and the column both enforce, and 009's `btrim` defect is the recorded reason the two layers are asserted separately — here that second layer is unavailable for the modality rule, so the write path is the only enforcement and must be tested as such.

Everything else is confirmation: the migration is catalog-only on existing tables, the one-transaction shape is real, and `DROP NOT NULL` on `sessions.room_id` costs nothing.

**Evidence**: `apps/api/migrations/ — 0000–0009 and 0011 on disk; no 0010_*.sql`; `apps/api/migrations/meta/_journal.json:76-81 — idx 10, tag 0011_conference_authoring, when 1786601533140 (the value the new migration's `when` must exceed)`; `apps/api/migrations/meta/README.md:15-21 — array position orders a fresh database; `when` decides what an existing one receives`; `apps/api/migrations/meta/README.md:23-24 — the 0003/0004 inversion is safe only because the two migrations are independent`; `apps/api/migrations/meta/README.md:45-71 — the idx-vs-tag rule: rename only the tag, leave idx, leave the snapshot filename`; `apps/api/migrations/meta/README.md:73-94 — this file breaks `drizzle-kit generate`; move it, do not relocate it`; `node_modules/.pnpm/drizzle-orm@0.45.2_postgres@3.4.9/node_modules/drizzle-orm/pg-core/dialect.cjs:62-73 — session.transaction wraps ALL pending migrations and ALL statements`; `node_modules/.pnpm/drizzle-orm@0.45.2_postgres@3.4.9/node_modules/drizzle-orm/pg-core/dialect.cjs:58-61 — gate reads `order by created_at desc limit 1``; `node_modules/.pnpm/drizzle-orm@0.45.2_postgres@3.4.9/node_modules/drizzle-orm/migrator.cjs:45-48 — reads `${journalEntry.tag}.sql`; idx is never used`; `node_modules/.pnpm/drizzle-orm@0.45.2_postgres@3.4.9/node_modules/drizzle-orm/migrator.cjs:55 — folderMillis is the journal's `when``; `node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/bin.cjs:24891-24900 — emits `ALTER TABLE … ALTER COLUMN … DROP NOT NULL;``; `node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/bin.cjs:23588-23596 — emits `ADD CONSTRAINT … CHECK (…)` with no NOT VALID`; `node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/bin.cjs:25037 — CONCURRENTLY emitted only when the schema declares it`; `apps/api/src/db/migrate.ts:62 — MIGRATION_LOCK_TIMEOUT_MS = 10_000`

## R20 — What does adding a fifth administrative destination require, and what authorises it? Specifically: the exact append-only steps; how a platform-tier-only destination is expressed (does the shell support it already, or must it be built?); which guard authorises product-wide rather than per-conference authority; and what the conference EDITOR needs — does `patchConference` really have no caller in `apps/admin`?

**Decision**: **Tier-hiding is already built and needs nothing.** `AdminDestination` carries `platformOnly: boolean` (`apps/admin/src/app/shell/AdminShell.tsx:36-41`) and the rail filters on it against the live session (`AdminShell.tsx:91-93`). 013 built it for `/reports` and `/operators` (`AdminShell.tsx:58-59`). A vocabulary destination is one appended literal: `{ to: '/vocabulary', label: 'Vocabulary', platformOnly: true }`.

**The guard is `requirePlatformOperator`** (`apps/api/src/admin/require-operator.ts:132-146`), which mints `VerifiedPlatformScope` and refuses an organizer with the same `notFound()` every other administrative refusal uses. It is **not** `requireConferenceAuthority`: that guard reads `:eventId` from the path and throws 404 when there is none (`apps/api/src/admin/require-conference-authority.ts:163-167`), so it cannot express product-wide authority at all. The vocabulary routes must therefore live at `/admin/vocabulary/…` and **must not** be nested under `/admin/conferences/:eventId/…` — the nesting would falsely promise a conference owns the reference data (FR-1085) and would demand a guard whose whole predicate is per-conference.

**The full append-only step list (13 edits, 5 of them new files):**

*Client — `apps/admin`*
1. `src/app/shell/AdminShell.tsx:43-60` — append one entry to `ADMIN_DESTINATIONS`. This is the single declaration the rail reads.
2. `src/app/routes.tsx:60-81` — add one `<Route>` **before** the catch-all `*` at :80. This file **does** name addresses literally, unlike `apps/web/src/app/navigation.ts`; the header at :17-30 says the non-reuse is FR-920 rather than an oversight, so "append a destination" is genuinely two edits here, not one.
3. New screen under `src/app/vocabulary/`. It **must render an `h1`** — both e2e sweeps assert `getByRole('heading', { name: heading, level: 1 })` (`e2e/admin-accessibility.spec.ts:73-75`, `e2e/responsive.spec.ts:457-459`).
4. `src/app/services.ts:51-65` + `:84-89` — a fifth repository: one interface member, one construction line. Undecorated, like the other four (:38-45 gives the reason).
5. `apps/admin/tests/support/services.tsx:52-95` — a fifth key with every member `unexpected(...)`. **Skipping this is what leaves a method green and uncallable** (see the `patchConference` finding below).
6. `apps/admin/tests/component/tier-controls.test.tsx:53-74` — the platform/organizer assertions are hand-written per destination (`/reports/`, `/operators/` hardcoded). A fifth platform-only destination needs its own two cases; nothing derives them from `ADMIN_DESTINATIONS`.

*Contract — `packages/data`*
7. `src/interfaces/administration.ts` — the interface and its types, in the same block as `AdminCatalogRepository` (:274-345).
8. `src/index.ts:115-132` — append to the administrative type-export block. **Do not add to `Repositories`** (:110-114 states why).
9. New `src/http/admin-vocabulary-repository.ts`, exported from `src/http/index.ts:80`.

*Server — `apps/api`*
10. New `src/routes/admin/vocabulary.ts`, registered by **appending** one line to `src/routes/admin/index.ts:40-63` (appended rather than inserted: the generated contract lists paths in observation order, :36-39).
11. New `src/db/queries/admin-vocabulary.ts` — name it `admin-*` so `no-attendee-state-disclosure.test.ts:74-79` picks it into `administrativeFiles` automatically.
12. `apps/api/tests/unit/operator-audit.test.ts:127-135` — append every vocabulary route to `PLATFORM_TIER_ONLY`.
13. `src/db/schema/admin-audit.ts:216-248` — new `ADMIN_AUDIT_ACTIONS` values, plus a migration altering the check constraint (`apps/api/migrations/0009_administrative_foundation.sql:9` shows the shape; tranche 2's reserved `0012` carries it). Then regenerate `contracts/openapi.json`.

*e2e*
14. `e2e/support/destinations.ts:89-94` — append. **This step is invisible if forgotten** (see below).

**FR-1089's server-enforced-rather-than-hidden requirement is satisfied by the shipped arrangement, not by adding a route guard.** `routes.tsx:32-36` states that there is deliberately no client-side tier check: an organizer who types `/reports` renders the screen and the server answers 404. A route-level redirect would be "authorisation-shaped code in the one place FR-980 says authorisation must not live". The vocabulary destination inherits that exactly.

**The conference editor: `patchConference` has no caller in `apps/admin/src`. Verified.** Everything else exists and is unreachable:
- Route `PATCH /admin/conferences/:eventId` — `apps/api/src/routes/admin/catalog.ts:924-969`, `authoringGuards` (:316), throttled `conference_write` (:962), `detailedRefusal` on 409 (:953).
- Query `patchConference` — `apps/api/src/db/queries/admin-catalog.ts:958-1010+`: orphan refusal naming the sessions, timezone freeze, inverted-range check, unknown-timezone check.
- Interface `AdminCatalogRepository.patchConference` — `packages/data/src/interfaces/administration.ts:322`.
- HTTP `HttpAdminCatalogRepository.patchConference` — `packages/data/src/http/admin-catalog-repository.ts:139`.
- Client classification and copy for **all four** refusals — `apps/admin/src/app/errors.ts:59-68` and `:218-245`, with `detailOf` already reading `details.sessions` (:163-172).
- The payload the form needs is already on screen: `programme.conference.{name,location,startsOn,endsOn,timezone,joinCode,timezoneEditable}` (`packages/data/src/interfaces/administration.ts:225-235`, produced at `apps/api/src/db/queries/admin-catalog.ts:1296`), rendered **read-only** at `apps/admin/src/app/conferences/ProgrammeEditor.tsx:165-176`.

So the editor needs exactly two things client-side: a form component and a caller. Plus `apps/admin/tests/support/services.tsx:91`, which currently reads `patchConference: unexpected('catalog.patchConference')` — **calling it fails a test** until that line is replaced.

`timezoneEditable` — surfaced by the server specifically so a control could be disabled — is read by **nothing in either client**: only the server that computes it, the stub fixture (`services.tsx:109`) and one integration test (`apps/api/tests/integration/date-range-orphan.test.ts:177,188`).

**Rationale**: **Why the shell needs no work.** The tier filter is a single `.filter()` over a declared boolean (`AdminShell.tsx:91-93`), and the rail is deliberately one element with responsive classes rather than three components — its own comment (:98-103) says the alternative would force the tier filter to be applied three times. The mechanism is already load-bearing for the report queue under decision 35, and `tier-controls.test.tsx:61-74` is what keeps it honest.

**Why `requirePlatformOperator` and not a sixth guard.** 014's R2 built the fifth guard because authoring asks *may this principal write to this conference* — "a join between an operator and a conference, and neither existing guard has a second operand to join on" (`require-conference-authority.ts:33-47`). The vocabulary asks nothing of the sort: it is product-wide reference data with no second operand, which is precisely the question `requirePlatformOperator` already answers. Reaching for the fifth guard would be inventing an operand.

**Three gaps in the guards that a fifth destination walks straight through.** These are the reason this answer is longer than "append two lines":

1. **`ADMIN_DESTINATIONS` is duplicated in `e2e/support/destinations.ts:89-94` and NOTHING pins the two copies together.** The attendee list has `apps/web/tests/unit/navigation-mirror.test.ts:15-23`, whose own comment says duplication "is only safe if it cannot drift" and that the failure it prevents is "the end-to-end suite quietly continuing to verify four destinations while the product has five". That mirror exists for MyNet and **does not exist for the administrative site** — `grep -rl ADMIN_DESTINATIONS` returns only the shell, `routes.tsx`, the two specs and the e2e list. A fifth destination added to the shell and forgotten in e2e passes every gate while the accessibility sweep (three widths) and the horizontal-overflow sweep (thirteen widths) keep walking four pages.

2. **`authoring-throttle-binding.test.ts` reads one source file.** `SOURCE` is `src/routes/admin/catalog.ts` (:50-53) and `EXPECTED` (:67-110) is hand-maintained. A vocabulary route module is entirely outside its population, so **no test would require a vocabulary write to charge any throttle action at all** — the exact "every write route could charge any action with all three guards green" hole its own header describes (:17-31), reopened one directory over.

3. **`PLATFORM_TIER_ONLY` is a positive table that only catches *downgrades of listed routes*.** The assertion at `operator-audit.test.ts:197-209` filters routes carrying `requireOperator` and intersects with the list; a route absent from the list is never examined. Its header claims "a new route in this area fails until somebody decides which tier it belongs to" (:117-119), and that is true only for a route that carries `requireOperator` *and* is listed. Adding the entries is discipline, not enforcement.

**What is enforced for free, and is worth knowing before writing the routes:**
- `admin-audit-completeness.test.ts:33` scans the whole `src/routes/admin/` directory and derives expectations from the live route table — **a new administrative write fails by existing** unless it appends an audit entry (:16-30). FR-1089a's "audit + one transaction" therefore rides on a guard that is already pointed at the new module.
- `operator-audit.test.ts:177-195` fails any `/admin/*` route carrying neither operator guard, matched by **prefix** (:63) rather than by parameter name.
- `no-attendee-state-disclosure.test.ts:74-79` picks up `routes/admin/**` and `db/queries/admin-*.ts` automatically. Its rule-4 route-table assertion (:284-303) matches `notes|saves|saved|votes|voters|attendees|questions` in an admin URL — vocabulary paths (`sectors`, `subsectors`, `interests`) do not trip it, which is FR-1093a's "a path is a promise" satisfied by naming. (The same assertion **will** catch tranche 2's enrolment roster at `…/sessions/:id/attendees`, which is what FR-1075's named exemption is for — a different task, but the same file.)
- `NAMES_NO_CONFERENCE`'s cap of ≤1 (`operator-audit.test.ts:400-406`) is **not** threatened: it iterates the map, and the "no administrative write reaches conference content unguarded" assertion (:371-384) filters on `/(sessions|tracks|rooms|speakers)/`. A vocabulary write needs no entry there.
- `apps/web/tests/unit/no-admin-surface.test.ts:92-99` forbids `\btier\s*===|\btier\s*\?|['"]platform['"]\s*:` and the authoring verb names anywhere in `apps/web/src`. Tranche 2's attendee-side taxonomy reads are unaffected; a new admin repository method name added to that regex list is not required unless it reads like an authoring verb.

**Why the conference editor is the sharpest finding.** 014's own deep review raised it as **I11** (`specs/014-conference-content-authoring/review-findings.md:204`), verified by grep, naming exactly this consequence: "`updateTrack`, `updateRoom`, `updateSpeaker` and `patchConference` have no caller in `apps/admin/src`, and the admin harness marks all four `unexpected(...)` — calling them *fails a test*". D20 (`deviations.md:542-574`) then built the `InlineEdit` control for tracks, rooms and speakers and the `.details` plumbing, and **stopped there**. The line "I11 and I12 were built" at `review-findings.md:319` is true of three of the four methods. FR-1059 (`spec.md:709`) is the requirement that closes the fourth, and it reaches further than the finding: FR-1059b extends the create/patch body with modality and format, so the PATCH schema (`catalog.ts:938-948`), `ConferencePatch`, the interface signature (`administration.ts:322-331`) and the HTTP repository all move in the same change.

**Alternatives considered**:

- *Build a tier check into `routes.tsx` so `/vocabulary` redirects an organizer.* Rejected — and it is already rejected in writing at `apps/admin/src/app/routes.tsx:32-36`: it would be authorisation-shaped code in the one place FR-980 says authorisation must not live, and it would make the rail's absence look like the control rather than a courtesy. FR-1089's "server-enforced rather than a hidden control" is satisfied by `requirePlatformOperator`'s 404, exactly as the report queue is.
- *Import `ADMIN_DESTINATIONS` into the e2e suite instead of writing a mirror test.* Rejected for the reason `e2e/support/destinations.ts:1-8` gives for the attendee list: the module pulls React into the test runner's Node process. The attendee side pays for the duplication with `navigation-mirror.test.ts`; the administrative side should pay the same price rather than change the arrangement.
- *Nest the vocabulary under `/admin/conferences/:eventId/vocabulary` so `requireConferenceAuthority` covers it.* Rejected: FR-1085 makes the vocabulary cross-event because a profile describes the person rather than their presence at one conference, and `require-conference-authority.ts:163-167` refuses outright without an `:eventId`. Nesting would make the path assert something false about who owns the data — the mirror of the rule `operator-audit.test.ts:408-418` enforces against nesting admin routes under `/events/:eventId`.
- *Extend `AdminCatalogRepository` with vocabulary methods rather than adding a fifth repository.* Rejected: every method on that interface names its conference, and `administration.ts:271-273` states that the `eventId` "is not a convenience: it is the operand of the check". A method without one would be a method the server could not authorise under that repository's own guard, and the harness would then hold a repository whose members answer to two different tiers.
- *Reuse `requireOperator` and check the tier inside the vocabulary handler.* Rejected: `require-operator.ts:132-146` deliberately keeps the tier check in the guard so the refusal comes from the single `notFound()` factory, and `admin-scope-brand.test.ts` makes `VerifiedPlatformScope` a type-level refinement so a platform-only handler fails to **typecheck** without one. Checking in the handler discards both mechanisms.
- *Add the conference editor as a new nested address (`/conferences/:eventId/settings`) rather than a section of the programme screen.* Not rejected — genuinely open, and cheap either way. Worth noting that a nested address is **not** an `ADMIN_DESTINATIONS` entry: `e2e/admin-accessibility.spec.ts:168` records that the programme editor "is not in `ADMIN_DESTINATIONS` and cannot be: it is a nested address under a conference". A settings address inherits that, so it needs its own e2e coverage rather than a list entry.

**This changes the shape of the work**: Yes, three ways. (1) **The e2e `ADMIN_DESTINATIONS` list has no mirror test** — the attendee equivalent (`apps/web/tests/unit/navigation-mirror.test.ts`) exists precisely to stop the drift this list is exposed to. A fifth destination can be added to `AdminShell.tsx` and silently omitted from `e2e/support/destinations.ts`, and the accessibility sweep (3 widths) plus the horizontal-overflow sweep (13 widths) keep walking four pages while everything is green. Tranche 2 must add an admin mirror test as its own task, and it is cheap — the plan should not assume the two lists are already tied together. (2) **A new admin route module escapes `authoring-throttle-binding.test.ts` entirely**, because that guard reads a single source file with a hand-maintained table; a vocabulary write route would be bound to no throttle action by any test. Tranche 2 either widens that guard's source set or accepts an unbound write, and that is a decision rather than wiring. (3) **The conference editor is net-new UI, not an extension** — review finding I11 was closed for tracks, rooms and speakers only, so `patchConference` remains the one method whose entire server-side refusal vocabulary (four codes, the session-naming detail query, `timezoneEditable`) is built, tested and unreachable. FR-1059 additionally extends the PATCH body with modality/format, so this is one task spanning four layers rather than the "add two fields to an existing form" that Part II's wording suggests. Everything the prompt asked me to check about tier-hiding, by contrast, is a non-issue: the shell already supports it and needs no change.

**Evidence**: `apps/admin/src/app/shell/AdminShell.tsx:36-41`; `apps/admin/src/app/shell/AdminShell.tsx:43-60`; `apps/admin/src/app/shell/AdminShell.tsx:91-93`; `apps/admin/src/app/shell/AdminShell.tsx:98-103`; `apps/admin/src/app/routes.tsx:17-30`; `apps/admin/src/app/routes.tsx:32-36`; `apps/admin/src/app/routes.tsx:60-81`; `apps/admin/src/app/services.ts:51-65`; `apps/admin/src/app/services.ts:84-89`; `apps/admin/src/app/shell/AdminHome.tsx:32-42`; `apps/admin/src/app/conferences/ConferenceList.tsx:119-124`; `apps/admin/src/app/conferences/ProgrammeEditor.tsx:165-176`; `apps/admin/src/app/errors.ts:59-68`; `apps/admin/src/app/errors.ts:163-172`

