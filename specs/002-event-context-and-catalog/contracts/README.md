# API Contract

**Feature**: 002-event-context-and-catalog | **Constitution**: v2.1.0

The mechanism is unchanged from 001 and is not restated here — see
`specs/001-production-foundation/contracts/README.md`. In short: Fastify route schemas are the source
of truth, `contracts/openapi.json` is a committed **output**, editing it by hand achieves nothing, and
CI fails when the committed copy is stale or when the client's data access diverges from it.

What follows is what this feature adds to that contract, and the two rules its shape has to preserve.

---

## The two rules the shape must preserve

**No endpoint accepts an attendee identifier.** Unchanged from 001, and unchanged by this feature.
Identity comes from the sign-in session cookie. None of the endpoints below has a path parameter,
query parameter, header, or body field naming an attendee.

**Every endpoint that returns conference content names its event, and verifies it.** New in this
feature, and the deliberate departure from 001's "no identifier at all" doctrine. The identifier is
in the path; the verification is a `preHandler`; the query layer will not accept an unverified one.
Complexity Tracking in `plan.md` records why this trade was taken.

---

## Workspace

### `GET /workspace/active-event`

The attendee's active event, whether recorded or derived (FR-102).

- **Auth**: session cookie. No attendee identifier.
- **200** — the event, including `timezone`, so the client can compute day context without a second
  request. `dayNumber` and `totalDays` are **absent by design** and must stay absent (FR-121): they
  go stale the moment the clock moves, and the shipped interface note in
  `packages/data/src/interfaces/index.ts` records the same rule.
- **204** — the attendee is registered for no events (FR-105). An empty *body*, not an error, and not
  a fabricated event. The client renders the explicit empty state.
- **401** — no session, or expired.

### `PUT /workspace/active-event`

Records an explicit selection (FR-104).

- **Body**: `{ "eventId": "<uuid>" }`.
- **200** — the newly active event, echoed in full. The echo is what lets the client reconcile a
  concurrent switch (research D9) without a second request.
- **404** — the attendee is not registered for that event, **or** it does not exist. The two are
  indistinguishable (FR-148).
- **401** — no session, or expired.

Idempotent: selecting the already-active event succeeds and changes nothing observable.

---

## Conference programme

All of these carry `:eventId` and all of them are guarded. A route added here without the guard fails
the route audit (FR-149).

### `GET /events/:eventId/sessions`

The event's programme, chronological (FR-137).

- **200** — sessions in `starts_at` order, each with its track (name and colour **token**, never a
  colour value), its room, and its speakers. Speakers may be an empty array — FR-138's no-speaker
  case is an empty list, not a null, so a client cannot confuse "none" with "not loaded".
- **200 with `[]`** — the event has no programme (FR-139). A valid answer, not a failure; the client
  renders the empty state.
- **404** — not registered, or no such event. Indistinguishable (FR-148).
- **401** — no session, or expired.

Times are absolute instants (FR-124). No relative wording — "starts in 15 minutes" is computed at
display time or not at all.

### `GET /events/:eventId/tracks`

The event's tracks, for coding and legends.

- **200** — each with `name` and `colorToken`. **Never a colour value**: the palette lives in
  `apps/web/src/theme/tokens.css` and nowhere else (research D7).
- **404** / **401** — as above.

---

## What this feature deliberately does not add

- **No write path to the programme.** No create, update, or delete for sessions, tracks, rooms or
  speakers, at any privilege. Adding one would be organizer administration, which Principle III puts
  out of scope, and the constitution separately forbids a content import path without an amendment.
- **No `GET /events/:eventId`** on its own. `GET /events` already lists the attendee's events and
  `GET /workspace/active-event` returns the active one in full; a third way to read one event would
  be a third place to get the scoping wrong for no capability gained.
- **No save, note, or question endpoints** — 005 and 009.
- **No cache directives.** This feature caches nothing (spec Feature Declarations, offline row). When
  the offline staleness policy is decided, it belongs in this contract; asserting it now would be
  guessing at an open question.

---

## Contract obligations for this feature

- `contracts/openapi.json` is regenerated and committed in the same change (FR-044a/b from 001 still
  bind).
- The generated client types in `packages/data/src/generated/api.ts` are regenerated with it.
- `pnpm contract:check` must pass, which is what catches a route schema and its committed snapshot
  drifting apart.
- Every new route carries a `schema` block. A route registered without one is invisible to the
  generator and therefore absent from the contract — silently.
