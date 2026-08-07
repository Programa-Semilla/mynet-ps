# Deep Review Findings

**Date:** 2026-08-07
**Branch:** spec/002-event-context-and-catalog
**Rounds:** 2 (of a maximum 3)
**Gate Outcome:** PASS
**Invocation:** manual (`/speckit-spex-deep-review-run`)

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 1 | 1 | 0 |
| Important | 21 | 21 | 0 |
| Minor | 18 | 12 | 6 |
| Notable | 8 | – | 8 |
| **Total** | **48** | **34** | **14** |

**Agents completed:** 5/5 round 1, 3/3 round 2 (+ 0 external tools)
**Agents failed:** none
**External tools:** CodeRabbit and Copilot skipped — neither CLI is installed. Config absent, so both defaulted to enabled; detection found neither on PATH.

Six duplicate pairs were merged. The stale-conference leak was found independently by Correctness
and Production Readiness; the route audit's URL-only blind spot by Architecture and Test Quality;
the duplicate requests by Production Readiness and Architecture.

## The two findings that mattered most

### FINDING-1 — `EventScope` was forgeable (Critical)
- **Severity:** Critical · **Confidence:** 98 · **Category:** security
- **File:** apps/api/src/plugins/event-access.ts
- **Source:** security-agent (round 1 and round 2) · **Round found:** 1 · **Resolution:** fixed (round 2)

**What was wrong.** FR-147 requires that a conference-scoped read not be performable with an
unverified identifier, and the branded `EventScope` was the mechanism. It was a structural symbol
brand, and a spread copies it:

    listSessions({ ...scope, eventId: attackerSuppliedId })   // 0 type errors, 0 lint errors

Replacing it with a private-field class closed the spread and was **still not enough**. Five further
routes compiled clean and passed lint: `Object.assign` to forge, `Object.assign` to mutate a genuine
scope in place (`readonly` is erased at emit, so the property was writable), `structuredClone`,
`Object.create`, and `new (Object.getPrototypeOf(scope).constructor)(…)`.

**Why it mattered.** Each is a forgetting-shaped mistake, not a determined bypass — "the same scope,
different conference" is the natural thing to write. Any of them reads a conference the attendee is
not registered for, while the route still declares the guard and the route audit still passes.

**How it was resolved.** Three changes, verified with compiler and runtime probes: `Object.freeze`
in the constructor makes `readonly` real; a module-private `WeakSet` records every scope the guard
issues, and `assertVerifiedScope` checks membership at the **query layer** where data is actually
read; the lint rule now also bans aliasing the type and covers `.mts`/`.cts`/`.tsx`. A type can say
what a value looks like — only the set can say where it came from. Pinned by five unit tests.

### FINDING-2 — the previous attendee's conference survived a shared-device sign-in (Important)
- **Severity:** Important · **Confidence:** 85 · **Category:** correctness
- **File:** apps/web/src/app/active-event.tsx
- **Source:** correctness-agent (also reported by: production-readiness-agent) · **Resolution:** fixed (round 1)

The provider sits above the router and never unmounts. On sign-out it stopped fetching but did not
clear state, so after A signed out and B signed in, B saw **A's conference name and venue** in the
top bar and on the lead card for the whole of B's request — and the event-scoped cards fetched A's
programme, which the server correctly refused, putting failure regions on a healthy account.

Fixed by tagging state with the attendee it belongs to and **deriving it away during render**, so
the stale value cannot be observed even for one frame. Clearing it from an effect would have left
exactly one such frame, and is a cascading `setState` React's own lint rule rejects.

## Remaining findings (all Minor or Notable; none blocks the gate)

| ID | Severity | File | Summary |
|----|----------|------|---------|
| R-1 | Minor | apps/api/src/db/seed/catalog.ts | Two-pass `instantAt` is provably correct (brute-forced over 14 zones × 365 days); the comment's account of how a *nonexistent* wall time normalises is wrong — it moves forward in positive-offset zones and backward in negative ones, and can cross midnight. No seeded session is affected. |
| R-2 | Minor | apps/api/tests/integration/isolation.test.ts | The route-coverage probe builds a second app and closes it, which tears down the process-wide database pool the outer app shares. Survivable only because `getDb()` lazily recreates it and files run sequentially. |
| R-3 | Minor | apps/api/src/db/queries/catalog.ts | `listSessions` has no `LIMIT` or date filter; both Home cards discard all but one day. Fine at seeded scale, not at 500+ sessions. |
| R-4 | Minor | apps/api/src/db/schema/catalog.ts | `sessions.track_id`/`room_id` foreign keys have no covering index; only affects bulk re-seeds. |
| R-5 | Minor | apps/api/migrations/0001_event_context.sql | No explicit back-fill; a database migrated but not re-seeded keeps every conference at `'UTC'`. Mitigated — the schema comment now says so, and every path in this project runs `db:seed` after `db:migrate`. |
| R-6 | Minor | e2e/navigation.spec.ts | FR-118's component test asserts what the client *sent*, not what the server *recorded*; a repository double cannot express the server's resting state. |

## Notable Observations

### NOTABLE-1 — structural typing in the platform registry
- **File:** packages/platform/src/registry.tsx · **Category:** architecture
- Repositories are typed as `Promise<unknown>` to keep `@mynet/platform` independent of
  `@mynet/data`. The cost is now six unchecked casts in production code, growing by two or three
  per future feature — reopening on the client the drift that `contract.ts` prevents on the server.

### NOTABLE-2 — the composition contract's first real cost
- **File:** apps/web/src/app/home/cards/UpNext.tsx · **Category:** architecture
- FR-164 forbids a card depending on another's data, so Up next and Rest of day each fetch the whole
  programme. Coalescing at the transport now collapses the duplicate wire request, but the two cards
  still each parse and sort the full list, and can still disagree if one fails.

### NOTABLE-3 — the router special-cases Agenda
- **File:** apps/web/src/app/routes.tsx · **Category:** architecture
- `destination.path === '/agenda'` reintroduces a literal address beside the list that exists to
  avoid them. Four later features will each add a branch. Moving the element onto the destination
  entry would make it an append.

### NOTABLE-4 — the seed has no production guard
- **File:** apps/api/src/db/seed/index.ts · **Category:** security
- The file states it never runs against real data; nothing enforces it. `pnpm db:seed` with a
  production `DATABASE_URL` exported would delete every attendee. Pre-existing, not introduced here.

### NOTABLE-5 — the audit cannot see `$ref` schemas
- **File:** apps/api/tests/unit/event-scope-audit.test.ts · **Category:** security
- The scan now recurses and covers `body`/`querystring`/`params`, but a `$ref` to a shared schema
  defeats any structural scan. Worth resolving via `app.getSchemas()` when shared schemas arrive.

### NOTABLE-6 — provider context value is not memoised
- **File:** apps/web/src/app/active-event.tsx · **Category:** production-readiness
- Diverges from `AuthProvider` one file away. Impact is near zero today; grows as consumers do.

### NOTABLE-7 — integration test isolation is implicitly coupled
- **File:** apps/api/tests/integration/ · **Category:** test-quality
- Two files cache ids in `beforeAll` while a third mutates event dates in `beforeEach`. Correct only
  because `fileParallelism: false` and the seed regenerates every UUID. Either changing alone would
  fail confusingly rather than loudly.

### NOTABLE-8 — `GET /events/:eventId/tracks` has no consumer
- **File:** apps/api/src/routes/events/catalog.ts · **Category:** architecture
- A full vertical slice — route, query, repository method, interface member, contract binding —
  reachable only from test doubles. FR-136 is satisfied by the `colorToken` already on each session.
  Kept deliberately: 006 adds track filtering, and removing it would churn the committed contract.

## Post-Fix Spec Coverage

Mandatory: the fix loop removed code (`KNOWN_TRACK_TOKENS`, `menuRef`, the echo-reconciliation
branch, `SLOT_LAYOUT`).

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| FR-105 explicit empty state | active-event.tsx → `NoConferencesNotice` | ✓ |
| FR-110 switcher names conference **and location** | EventSwitcher.tsx | ✓ (added this round) |
| FR-114 single conference, no choice | EventSwitcher.tsx | ✓ |
| FR-116 Escape without changing selection | EventSwitcher.tsx | ✓ |
| FR-118 last switch wins | active-event.tsx sequence refs | ✓ |
| FR-136 token → classes, neutral fallback | track-colors.ts | ✓ |
| FR-140 next scoped to venue today | sessions.ts | ✓ (corrected this round) |
| FR-147 unverified read impossible | event-access.ts + `VERIFIED` | ✓ (hardened this round) |
| FR-149 audit covers identifier routes | event-scope-audit.test.ts | ✓ (widened this round) |
| FR-156 slot → width in one place | HomeShell.tsx `SLOT_COLUMN` | ✓ (corrected this round) |
| FR-157 at most one lead | registry.ts | ✓ |
| FR-161 cards visible when empty | HomeShell.tsx `CardPending` | ✓ |
| FR-163 containment is the shell's | HomeShell.tsx `CardBoundary` | ✓ |
| FR-170–173 four cards contributed | registry.ts (4 entries) | ✓ |

**All 61 functional requirements and 11 success criteria verified after the fix loop.** Four Home
cards registered; nine contract operations intact.

## Test Suite Results

Auto-detection found no `.scripts.test` in `package.json`, which would have skipped the post-fix
test step entirely. That would have been wrong: this project's gates exist under different names.
**Override used:** `typecheck + lint + format + unit + component + integration + contract + e2e`.

| Round | Command | Failures | Status |
|-------|---------|----------|--------|
| 1 | full gate set | 0 | passed |
| 2 | full gate set | 0 | passed |

Final: **145 unit, 113 component, 82 integration, 55 e2e**, plus typecheck, lint, format and
contract. Started at 107 / 90 / 82 / 55.

### Mutations verified caught

The gate is only as good as its ability to fail. Each of these was introduced deliberately and
watched failing, then reverted:

| Mutation | Before | After |
|----------|--------|-------|
| `EventScope` forged by spread | compiled clean | TS2345 |
| `EventScope` forged by `Object.assign` | compiled clean | refused at runtime |
| `venueDateOf` formats in UTC | 137/137 green | 3 failures |
| `GreetingDayContext` throws | 30/30 green in that file | 1 failure |
| guard removed from a catalog route | — | 2 failures (verified in T069) |
| `as EventScope` outside the guard | — | lint error (verified in T074) |
| `PUT` removed from the audit allowlist | — | flagged, proving body scanning works |
