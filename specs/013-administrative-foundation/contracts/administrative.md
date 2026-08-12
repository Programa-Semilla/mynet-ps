# Phase 1 Contracts: Administrative Foundation

**Feature**: 011 · **Date**: 2026-08-11

The API contract in `contracts/openapi.json` is **generated and committed** by this project, so this
document states the intended shape and — more importantly — **the guard each route carries and why**.

---

## Every administrative route names no conference, and that is why a fourth audit exists

This is the trap 007 and 008 each hit, now met a third time. `event-scope-audit` examines a route
**only if it declares an event parameter, and reports success otherwise** — so every route below
would pass it while being guarded by nothing at all.

| Path | Method | Guard | Audited by |
|---|---|---|---|
| `/admin/session` | `POST` | none (sign-in) — throttled `admin_sign_in` | `operator-audit.test.ts` (**new**, allow-listed) |
| `/admin/session` | `DELETE` | `requireOperator` → `OperatorScope` | `operator-audit.test.ts` |
| `/admin/session/credential` | `PUT` | `requireOperator` (bootstrap-permitted) | `operator-audit.test.ts` |
| `/admin/me` | `GET` | `requireOperator` | `operator-audit.test.ts` |
| `/admin/conferences` | `GET` | `requireOperator` | `operator-audit.test.ts` |
| `/admin/conferences/:eventId/organizers` | `POST` | `requirePlatformOperator` → `PlatformScope` | `operator-audit.test.ts` |
| `/admin/conferences/:eventId/organizers/:attendeeId` | `DELETE` | `requirePlatformOperator` | `operator-audit.test.ts` |
| `/admin/reports` | `GET` | `requirePlatformOperator` | `operator-audit.test.ts` |
| `/admin/reports/:reportId` | `GET` | `requirePlatformOperator` | `operator-audit.test.ts` |
| `/admin/reports/:reportId/resolution` | `POST` | `requirePlatformOperator` | `operator-audit.test.ts` |
| `/admin/questions/:questionId` | `DELETE` | `requirePlatformOperator` | `operator-audit.test.ts` |
| `/admin/operators/:operatorId/deactivation` | `POST` | `requirePlatformOperator` | `operator-audit.test.ts` |

**`operator-audit.test.ts` fails a route under `/admin/*` that carries neither guard**, and it
maintains an explicit allow-list — currently one entry, `POST /admin/session` — because a sign-in
route by definition has no session. An allow-list entry is a written decision; an unguarded route is
an oversight, and the two must not look alike.

### Two guards, not one guard with a tier field

`requireOperator` constructs `OperatorScope`. `requirePlatformOperator` constructs `PlatformScope`,
a **branded refinement** — a platform-only handler that receives only `OperatorScope` fails to
typecheck.

The alternative — one guard returning `{ tier }` and handlers writing `if (tier === 'platform')` —
was rejected because it makes FR-906 a convention that every new route can forget, in a codebase
where three prior features each had to build a structural guard after discovering exactly that.

Note `/admin/conferences/:eventId/organizers` **declares an event parameter**, so
`event-scope-audit` *will* examine it and would demand `requireEventAccess`. It must not have one:
the caller is a platform operator who is not registered for that conference and would fail
`requireEventAccess` correctly. This route therefore needs an explicit entry in
`event-scope-audit`'s own allow-list, with the reason written down — and it is the one place in this
feature where two audits disagree about the same path.

---

## Refusals

The shapes differ deliberately, following 007's and 008's rule that **a refusal's follow-up question
must be about the reader.**

| Situation | Response | Why |
|---|---|---|
| Any administrative address, no session | `401`, no body detail | FR-917 — discloses nothing about what exists |
| Unknown address, wrong password, unpromoted attendee, deactivated operator | `401`, **identical** wording and shape | FR-915 — one uniqueness domain (FR-918) makes this a single lookup, so there is no branch to observe |
| Conference organizer on a platform-tier route | `404`, identical to a route that does not exist | A `403` would confirm the surface exists and that they are not on it |
| Organizer acting on an unassigned conference | `404` | Same reasoning |
| Initial credential not yet replaced | `403` **with an explanation**, and only from non-bootstrap routes | FR-992. The follow-up question is about the *reader* — they can fix it |
| Second resolution of an already-resolved report | `409` **with an explanation** | FR-945. Describes the reader's own conflict, which they can act on |
| Removing a question that no longer exists | `404` | Indistinguishable from never having existed |

**The client classifies on `error.code`, never on the class.** `ApiError extends
RequestRefusedError` and *every* non-2xx throws `ApiError`, so `instanceof` catches 401, 403, 404,
409 and 500 alike — which is precisely what swallowed 008's deliberately-written messages. A test
must require all seven outcomes above to be **different from each other**.

---

## What the report queue returns, and what it must not

`GET /admin/reports/:reportId` carries the **third recorded Principle VIII exception** (4.1.0, A8)
and is the only route in the product that does.

**Returns**: reporter identifier and display name, reported identifier and display name, the instant,
the reporter's stated reason, and the reported content — the specific messages the reporter
identified, or the reported question.

**Must not return**: the surrounding thread, the pair's other conversations, any other report's
subject, or anything about a third party. Scoping is enforced by the query, not by the client
choosing what to render.

**`contentAvailable: false` is a first-class field, not an error** (FR-941). Reported message ids are
stored as a plain array rather than a foreign key precisely because *"the reported messages will
frequently be gone before anyone looks at the report"*, so this is the **expected** case. A client
that renders it as a failure has misread the contract.

**Reading this route writes an audit entry** (FR-995) — `disclose_report_content`. It is the only
*read* in the product that does, because it is the only read the constitution needed an exception to
permit. `GET /admin/reports` (the list) does **not**, because it carries no content.

---

## What is deliberately absent from this contract

Each is a requirement to build nothing, asserted by a test that fails when the absence ends.

- **No route on `apps/web`'s API surface changes.** MyNet gains nothing (FR-970–FR-973).
- **No conference content write route** — no `POST`/`PATCH`/`DELETE` on events, sessions, tracks,
  rooms or speakers. FR-974; that is 012, and `catalog-read-only.test.ts` stays in force.
- **No join-code route** — create, rotate or revoke. FR-975; that is 013, and
  `join-grants-nothing.test.ts` stays in force.
- **No attendee suspension, removal or restriction route** (FR-955).
- **No message removal, edit or redaction route** (FR-953). The block at report time is the
  protective act.
- **No avatar moderation route** (FR-954). Register entry 19's standard is undecided, and building
  the action would decide it by inference.
- **No profile read or write route for any tier** (FR-973).
- **No audit-reading route in MyNet**, and none that returns disclosed content (FR-999).
- **No notification of any kind.** The trigger set stays at a received message; the existing
  source-level audit over `apps/api/src` is not edited (FR-935, SC-910).
- **No reporter-facing status, case identifier, or anything to poll** (FR-946).

---

## Contract generation

`contracts/openapi.json` is regenerated and committed as part of this feature. The `contract` CI gate
compares the committed artifact against the routes, so a route added without regenerating fails the
build — which is the mechanism that keeps this document honest rather than aspirational.
