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
(v4.2.0 accepts this as bounded by trust); and `session_cancel`, because it is the only authoring
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
