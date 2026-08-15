# Phase 0 Research: Agenda and Saved Sessions

**Feature**: 005 | **Date**: 2026-08-07 | **Constitution**: v2.2.0

Ten decisions. Each records what was chosen, why, and what was rejected — so a later reader can
tell a decision from an accident.

---

## D1 — Where the cache lives

**Decision**: a **decorator over the repository implementations**, in `packages/data/src/http/`.
`cached(repo, store)` returns something satisfying the same interface. The registry wires the
decorated instance; nothing else changes.

**Rationale**: Principle V forbids components knowing transport or caching details, and the
constitution's Persistence constraint adds that caching is specified per feature. A decorator keeps
both true at once — the interface is the contract, the cache is an implementation of it, and a
component cannot tell the difference. It also means the offline path and the repeat-read path are
*the same code*, which is what makes `home-card-duplicate-reads` close as a side effect rather than
as separate work.

Critically for **FR-164**: cards still each call the repository. The decorator dedupes the in-flight
read and returns a *separate promise per caller*, so one caller's rejection does not cancel another,
and each card still renders its own failure state. That property is not incidental — it is what
keeps the composition contract intact, and SC-212 tests it.

**Alternatives considered**:

- **A query library (TanStack Query or similar)** — gives caching, dedupe and staleness for free.
  Rejected: it would put cache configuration in components, which is exactly the transport leak
  Principle V prohibits, and it adds a dependency the constitution's "derived from actual need"
  clause would make us justify against a decorator we can write in under a hundred lines.
- **Caching inside each repository implementation** — rejected: repeats the same logic per
  repository and makes the 24-hour rule three places instead of one.
- **A service worker / Cache Storage HTTP-level cache** — rejected: it caches *responses*, so
  repeated reads still re-parse and re-sort per caller. That is precisely the cost
  `home-card-duplicate-reads` records as unaddressed by transport-level coalescing.

---

## D2 — What the cache is stored in

**Decision**: **IndexedDB**, reached through a new `LocalCache` interface in `packages/platform`
with a web implementation. In-memory on top of it for the current session.

**Rationale**: FR-215 requires reads to survive with no connection, which means surviving a reload —
memory alone cannot. The constitution states plainly that **`SecureStorage` MUST NOT be used as a
general cache**, so that is ruled out by governance rather than by preference. Between the remaining
options IndexedDB is the only one that stores structured data without a serialize/parse round trip
at every read, and it is not size-constrained the way `localStorage` is at a few megabytes — a
500-session programme plus notes will exceed that on a large conference.

Putting it behind a platform interface is Principle V again: it is a browser capability, so
application code must not call it directly, and a native shell later would supply its own
implementation.

**Alternatives considered**:

- **`localStorage`** — rejected: synchronous (blocks the main thread on every read), string-only,
  and a few-megabyte ceiling.
- **In-memory only** — rejected: does not survive a reload, so does not satisfy FR-215.
- **`SecureStorage`** — rejected by the constitution explicitly.

---

## D3 — The focus trap

**Decision**: the native **`<dialog>` element with `showModal()`**, plus explicit focus restoration
to the opener.

**Rationale**: `showModal()` gives a real focus trap, inertness of the background, and Escape
dismissal from the platform rather than from hand-written key handling — and the register lists
Escape and focus as *settled requirements the prototype failed to meet*, so getting them from the
platform is the least likely route to failing them again. Top-layer rendering also removes the
z-index and scroll-lock problems a `div` overlay creates.

Two things `<dialog>` does **not** give and this feature must add: focus does not reliably return to
the opener on close in every engine, so FR-202's restoration is explicit; and `showModal()`'s Escape
fires `cancel`, which must be routed to the same close path as the button so the address updates
identically.

**Alternatives considered**:

- **A hand-written trap over a `div`** — rejected: re-implements what the platform now does
  correctly, and the prototype's failure here is the register's own example of this going wrong.
- **A headless UI dependency** — rejected: a dependency for one modal, against the "derived from
  actual need" constraint, when `<dialog>` is available in every target browser.

---

## D4 — Routing shape for the panel

**Decision**: a **nested child route** under Agenda, with the element supplied by the `Destination`
entry (FR-233). `/agenda` renders the programme; `/agenda/:sessionId` renders the programme **with**
the dialog open.

**Rationale**: nesting means the programme stays mounted behind the panel, so closing is a
navigation rather than a refetch, and Back closes the panel by the browser's own mechanism (FR-205)
without history manipulation. Supplying the element through the destination entry retires the
literal `destination.path === '/agenda'` branch that four later features would each have extended —
this feature needs the change anyway, which is why `destination-owns-its-element` was folded in
here rather than left in the inbox.

**Cold load** (FR-203) falls out: the programme route's own loading state runs, and the dialog opens
once the session resolves. The panel does not fetch a session independently — it selects from the
programme the cache already serves, which keeps one source of truth for session data.

**Alternatives considered**:

- **A sibling route rendering the panel alone** — rejected: the programme would unmount, so closing
  refetches and the background is blank behind the dialog on a cold load.
- **A search parameter (`/agenda?session=…`)** — rejected: reads as a filter rather than a location,
  and 009 adds a tab to this panel that will want its own addressable segment.

---

## D5 — Note autosave

**Decision**: debounce at **1200 ms** (inside FR-209's 500 ms–3 s band), then write. Status is a
four-state machine — `idle → saving → saved | failed` — driven by the *response*, never by the
keystroke.

**Rationale**: the requirement that makes this non-optimistic is that `saved` is only ever entered
from a resolved write. That is what keeps it outside the constitution's optimistic-update clause and
avoids incurring a separately recorded decision. 1200 ms is long enough that ordinary prose does not
write per word and short enough that FR-209's "survives an unexpected loss of the page" holds in
practice.

An in-flight write is **not cancelled when the panel closes** (FR-211, US3 scenario 6) — the request
outlives the component, which means the write must not be tied to component lifetime.

**Concurrency**: last confirmed write wins (FR-214). Responses that arrive out of order must not
resurrect older text, so each write carries a sequence number and a stale response is ignored for
*status* purposes. This is ordering hygiene, not conflict resolution — no merge is attempted, which
is what keeps FR-214's disclaimer honest.

**Alternatives considered**:

- **Save on blur only** — rejected: an attendee who types and then locks their phone never blurs.
- **Save per keystroke** — rejected: a write per character, and the status would flicker
  meaninglessly.

---

## D6 — Saved-session write shape

**Decision**: `PUT /events/:eventId/agenda/saved/:sessionId` to save,
`DELETE` the same path to unsave. Both **idempotent**.

**Rationale**: FR-187 requires saving twice not to create a second record. `PUT`/`DELETE` on a
resource whose address *is* the pairing gives idempotency from the method rather than from a
uniqueness constraint doing double duty as business logic — though the constraint exists too, as
defence in depth. A double-tap on a slow connection is then simply the same request twice.

The path nests under `:eventId` so `requireEventAccess` applies and the route audit sees it — which
is the property FR-230 turns into a build failure.

**Alternatives considered**:

- **`POST /saved` with a body** — rejected: not idempotent, so the double-tap case needs handling in
  the handler.
- **A single `PATCH` toggling state** — rejected: a toggle is not idempotent by construction, and a
  retried request would undo itself.

---

## D7 — Repairing the route audit

**Decision**: give the **`unit` Vitest project a dummy `DATABASE_URL`** via `env` in
`packages/config/vitest.base.ts`, with a comment stating why.

**Rationale**: `event-scope-audit.test.ts` calls `buildApp()`, which calls `loadConfig()`, which
requires `DATABASE_URL`. The audit walks the route table and **never opens a connection** — the
requirement is transitive, not real. A syntactically valid dummy URL satisfies the config validator
and the audit runs in the `unit` layer where it belongs: fast, no database, no dependence on the
`db-branch` job that is separately broken.

This is the correct half of the CI repair to own here. The other half — `NEON_API_KEY` being unset
— is a repository secret and cannot be fixed in code.

**Alternatives considered**:

- **Setting `DATABASE_URL` only in the CI workflow** — rejected: the test would still fail on a
  fresh clone locally, which is how it reaches CI broken in the first place.
- **Moving the audit to the integration layer** — rejected, and it would have been actively
  harmful: integration is skipped whenever `db-branch` fails, so the audit would run *less* often
  than it does now, and FR-230's build failure would become unreachable.
- **Making `loadConfig()` lazy about the database URL** — rejected: it would weaken a real
  production guarantee to suit a test.

---

## D8 — How the Home card gets saved sessions

**Decision**: this feature's card calls the saved-session repository and the catalog repository
**itself**, exactly as 002's cards call the catalog themselves. It reads nothing from `UpNext` and
shares no state with it.

**Rationale**: FR-226 and decision 9. The card's independence is what allows it to fail alone
(FR-164, SC-212). The duplicate-read cost that would normally follow is absorbed by D1's cache — the
same reads, served once — which is why adding a third reader to Home does not increase the number of
programme reads (SC-210).

The two next-session cards may legitimately disagree, and that is recorded as an open question
rather than engineered around.

**Alternatives considered**: covered in brainstorm #03 (extending `contract.ts`; editing `UpNext`;
dropping the card). All rejected there.

---

## D9 — Note length enforcement

**Decision**: **10,000 characters**, enforced by a database `CHECK`, by the route schema, and
surfaced in the editor as a remaining-characters indication that appears as the limit approaches.

**Rationale**: FR-213 requires the attendee learn of the limit *before* a rejected write, so the
client must show it. But client-side presentation is never enforcement under Principle VIII, so the
server rejects independently, and the column constrains independently of the route in case a second
write path ever appears.

**Alternatives considered**: unbounded text — rejected: an unbounded free-text column attributable
to an identity is both a storage and a personal-data hazard, and the spec review raised exactly this.

---

## D10 — Cache scoping and invalidation

**Decision**: cache keys are `(attendeeId, eventId, resource)`. Entries carry `retrievedAt`. An
entry older than **24 hours** is treated as absent. A `RequestRefusedError` (the existing
authorization refusal) **purges every entry for that `(attendeeId, eventId)`**. Sign-out purges
everything for the attendee.

**Rationale**: FR-220 (per-conference scoping) and FR-221. Keying by attendee as well as event
matters on a shared device — without it, signing out and in as someone else would read the previous
attendee's cached notes, which is a Principle VIII failure the cache would have introduced.

The 24-hour lifetime is the *only* mechanism that revokes access offline, where no server is present
to refuse. That is why the spec review escalated its absence from a governance gap to an
authorization hole, and why the value is now a requirement rather than an assumption.

**Alternatives considered**:

- **Keying by event alone** — rejected: leaks across attendees on a shared device.
- **No expiry** — rejected at spec review; see above.
- **Purging the whole cache on any refusal** — rejected: one conference's refusal should not discard
  another conference's readable content.

---

## Resolved from the spec's Technical Context

No `NEEDS CLARIFICATION` markers were carried into this plan. The spec's five Open Questions are
deliberately open and none blocks implementation:

| Open question | Why it does not block |
|---|---|
| Client validation of desktop/tablet | Layouts are built to Principle IV; validation is a review gate, not an input |
| Full retention obligation | 005 ships the narrow declared commitment; the rest blocks 004 |
| Whether 24 h is the right lifetime | A value is set (FR-221); only its correctness is open |
| Unsave from the panel as well as the row | Presentation detail, answered against the built screen |
| Relationship between the two next-session cards | Both are independent by decision 9; observation only |
