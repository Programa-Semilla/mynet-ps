# Guard amendments — 011 (T152, SC-908, FR-974–FR-976)

**Every existing test this feature touched, why, and what it still catches.** FR-976 says the five
named guards are amended *deliberately and narrowly* and **never weakened to the point of checking
nothing**, so the list is written down rather than left to a diff.

Verified 2026-08-11 against a real database: **57 unit files (555 tests), 58 component files (587
tests), 107 integration files (919 tests) and 144 end-to-end tests all pass.**

---

## The five named guards

| Guard | Status |
|---|---|
| `apps/api/src/db/seed/catalog.ts` | **byte-unchanged** |
| `apps/api/tests/unit/catalog-read-only.test.ts` | **byte-unchanged** (FR-974 — that is 012's) |
| `apps/api/tests/unit/join-grants-nothing.test.ts` | **byte-unchanged** (FR-975 — that is 013's) |
| `apps/api/tests/unit/qa-absences.test.ts` | **amended** — and strengthened first, see below |
| `apps/api/tests/unit/no-report-read-surface.test.ts` | **amended** — narrowed to `apps/web` + the attendee API |

`apps/api/tests/unit/notification-triggers.test.ts` is also **byte-unchanged** (FR-935, SC-910): the
trigger set stays at a received message, and this feature dispatches nothing at all.

---

## `qa-absences.test.ts` — **a hole was found and closed before the narrowing**

T103 asked for the guard to be narrowed by path to permit one moderation route. The expectation was
that it would catch `DELETE /admin/questions/:questionId` and demand a deliberate amendment.

**It did not.** The predicate matched *words in the URL* (`answer|pin|moderat|…`), and that route
contains none of them — so an administrative question-removal route passed the assertion while it
reported success. That is the failure this codebase warns about in three other places: **a gate
keyed on a name is defeated by choosing another name.**

So the amendment is in two parts:

1. **Strengthened.** Moderation is now matched by *shape* — a write to a path that **addresses** a
   question — which catches `DELETE /admin/questions/:id` and equally `/questions/:id/remove`,
   `…/takedown`, or anything else somebody reaches for. "What the path addresses" is 009's own
   narrowing technique, reused so `/questions/:id/vote` (the caller's own vote) is not caught.
2. **Narrowed.** The permitted set is **one exact label**, not a pattern — the narrowest amendment
   available. A second moderation route fails naming itself.

A third assertion was added: the moderation route must **require a `reportId`**, so an operator
cannot remove any question they can name. Without it the permitted label would licence general
moderation.

**Still caught:** answering, pinning, approving, `answered`/`pinned` columns, downvotes, reactions,
voter disclosure, de-duplication, polling, a Home card, a destination, a contact derived from a
question, the bell, a column on the attendee record.

---

## `no-report-read-surface.test.ts` — narrowed by **path**, never by weakening a pattern

FR-972 keeps FR-548 in force for MyNet. Two exclusions, both exact:
`apps/api/src/routes/admin/` and `apps/api/src/db/queries/admin-reports.ts`.

One assertion was **inverted rather than deleted**. It said *no administrative address of any kind
exists*; there are now twelve, deliberately. Deleting it would have lost the guarantee it was
protecting, so it now asserts that **an administrative address must live under `/admin` and nowhere
else** — because `operator-audit.test.ts`, the only guard covering administrative routes, matches
on that prefix. An administrative route outside it would be examined by nothing.

**Still caught:** any report read on the attendee API, any `SELECT` against `abuse_reports` outside
the export and the administrative queue module, `queries/reports.ts` remaining write-and-sweep only,
and `ReportRepository` having exactly one method which is a write.

---

## Guards amended because the attendee surface grew a second actor

Not among the five named, and each needed the same kind of written reason.

- **`event-scope-audit.test.ts`** — administrative routes are out of its scope, because
  `requireEventAccess` proves *an attendee is registered*, and a platform operator has no
  `attendees` row. The exclusion is **bounded**: a new assertion requires the set of administrative
  routes naming a conference to be *exactly* the two written down, with their reasons. Its
  bulk-import predicate lost the word `admin` and gained a **stricter** replacement asserting that
  no administrative route writes conference content (FR-974).

- **`isolation.test.ts`, `identity-isolation.test.ts`** — both drive every event-scoped route with
  an *attendee's* cookie and require 404. An administrative route answers **401** to an attendee —
  a different question, not a weaker refusal. The equivalent guarantee for the principal it applies
  to is `admin-tier-boundary.test.ts`.

- **`profile-ownership.test.ts`** — `DELETE /admin/conferences/:eventId/organizers/:attendeeId`
  names an attendee in a write, which is **exactly the power v4.0.0 admitted**. FR-335's purpose —
  no *attendee* may edit another — is intact, and the absence that matters is asserted positively
  by `admin-forbidden-surfaces.test.ts`: no administrative route reaches a profile at all.

- **`throttle-actions.test.ts`** — `admin_sign_in` is the third `mayDeny: false` action. The guard
  refused it until the argument was written into `THRESHOLDS`, which is the guard working.

- **`deletion-coverage.test.ts`** — gained **computed** transitive cascade reachability rather than
  an allow-list entry for `report_resolutions`. See `deviations.md` D3.

- **`export-coverage.test.ts` / `export.test.ts`** — one new exported section, and the fixture now
  populates it. The guard refused a declaration it could not see exercised, which is the guard
  working.

---

## One defect the guards found in this feature's own work

`db/seed/operators.ts` cleared assignments and operators, and the re-seed failed on
`report_resolutions.resolved_by` — a table the module does not seed and never touches. That is the
**identical shape** 008 recorded for `shared_cards`, one table further out, and the constitution
predicted it: *"the next feature with a non-cascading reference to seeded content will meet this."*

Fixed by clearing **all four** tables referencing `operators`, with the four references and their
delete rules written into the module. Neither `NO ACTION` may be relaxed to make it simpler: FR-944
requires a resolution to keep naming the operator who made it.

---

## One 007 test 011 amended, and it is a harness race rather than a guard

**`e2e/messages-journey.spec.ts` — "opening a thread and leaving without sending leaves no trace
(FR-503a)".** Not a guard, and 011 changes nothing it asserts. It was counting Grace's
conversations with a **one-shot `count()` taken as soon as the "Messages" heading appeared** — but
the heading renders immediately and the list renders when its request settles, so the read landed
before the list existed. It failed exactly that way in this feature's full run, with a screenshot
showing the conversation **visible on screen** while the count had already returned zero.

Two changes, both mechanical: wait for `Loading your conversations…` to clear before the first
read, and use the retrying `toHaveCount(before)` rather than a one-shot `count()` for the second.
**The claim is untouched** — a wrongly-created conversation still fails it, because the count
settles on `before + 1` and never reaches `before`.

**Why it surfaced now, stated rather than guessed**: the race is latent and pre-existing, and 011
changed the timing and the accumulated database state around it — the e2e suite seeds once per run,
and this feature both removed a mid-run re-seed the admin helper used to perform and added specs
that write reports and blocks before this file runs. The fix is in the assertion because that is
where the defect is; a test that reads a list before it loads is wrong whatever runs before it.
