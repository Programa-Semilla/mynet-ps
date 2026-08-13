# Deviations — Conference Content Authoring (014)

What implementation changed, found, or decided that the spec, plan or data model did not say.
Written as it happened rather than at the end, so the reasoning is the reasoning that was
available at the time.

**Status: implementation in progress.** Phases 1–6 are substantially complete; Phase 7 is
outstanding. `tasks.md` carries the per-task state.

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
  it, which is the mechanism working rather than failing: v4.2.0 is the conversation that guard
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
