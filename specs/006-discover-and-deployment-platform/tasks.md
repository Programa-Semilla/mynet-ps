# Tasks: Discover, and the Deployment Platform It Runs On

**Input**: Design documents from `specs/006-discover-and-deployment-platform/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/directory-api.md](./contracts/directory-api.md),
[quickstart.md](./quickstart.md)

**Tests**: Included. The specification requires them explicitly — SC-404 ("verified by automated
tests against real seeded rows exercising the server directly, not the client"), SC-406 ("asserted
structurally rather than by inspection"), SC-411 ("verified by automated check rather than by eye") —
and Principle VII mandates the gate set regardless.

**Organization**: by user story. Two stories carry P1 and are independent of each other, so Phase 3
and Phase 4 may proceed in either order or in parallel once Phase 2 is done.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1–US4, on user-story phases only
- **[owner]**: requires a decision or provisioning action outside this repository

## Path Conventions

pnpm monorepo: `apps/api`, `apps/web`, `packages/data`, `packages/platform`, plus a new `deploy/vm`.
Paths below are repository-relative.

## Global Constraints

**Every task inherits [plan.md's Global Constraints table](./plan.md#global-constraints)** — migration
number, zero new tables or columns, no caching, ranking inputs, response contents, the 320px floor,
the 1,000-attendee scale target, and the rest. Where a task appears to conflict with one of those,
the constraint wins and the task is wrong.

## Interfaces

Task implementers see only their own task. These are the names and shapes that cross task boundaries;
use them exactly.

```ts
// packages/data/src/interfaces/directory.ts  — created by T029, consumed by T031, T033, T049, T094
export interface DirectoryQuery {
  readonly q?: string
  readonly role?: string
  readonly interest?: string
  readonly cursor?: string
  readonly limit?: number
}

export interface DirectoryEntry {
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  readonly networkingIntent: string | null
  readonly availability: 'available' | 'busy' | null
  readonly interests: readonly string[]
  readonly sharedInterestCount: number
  /** Card rendition as a data URL, or null. Never the 512px profile rendition. */
  readonly avatar: string | null
}

export interface DirectoryPage {
  readonly attendees: readonly DirectoryEntry[]
  readonly nextCursor: string | null
}

export interface DirectoryRepository {
  list(eventId: string, query: DirectoryQuery): Promise<DirectoryPage>
  get(eventId: string, attendeeId: string): Promise<VisibleProfile | null>
}
```

```ts
// packages/platform/src/hooks.ts — added by T033, consumed by T049, T094
export const useDirectoryRepository = (): DirectoryRepository => …

// apps/web/src/app/discover/useDirectory.ts — created by T049, consumed by T051
//
// **As built, the field is `status` rather than `state`**, matching `useAsync` and every other
// async surface in this client, and it carries three more members the declared shape omitted:
// a further page can be in flight or can have failed without the page already shown being
// discarded, and `eventId` is what the nested profile route re-keys on.
export const useDirectory = (query: DirectoryQuery) => ({
  attendees,      // readonly DirectoryEntry[] — accumulated, de-duplicated by attendeeId
  loadMore,       // () => void
  hasMore,        // boolean
  status,         // 'loading' | 'ready' | 'offline' | 'failed' | 'no-conference'
  loadingMore,    // boolean — a FURTHER page; what is shown stays shown
  moreFailed,     // boolean — likewise
  retry,          // () => void
  eventId,        // string | null
})

// apps/api/src/db/queries/directory.ts — created by T045, consumed by T046
//
// **AS BUILT, `readerId` IS NOT A PARAMETER** — recorded here rather than left as a surprise.
// `requireEventAccess` builds the scope from `request.attendee.id`, so `scope.attendeeId` IS the
// reader; a second parameter could only agree with it or disagree with it, and the disagreeing
// case ranks the directory against one person's interests while bounding it by another's
// registration, silently. See the function's own header.
export const listDirectory = (
  scope: EventScope,          // branded; only requireEventAccess constructs it
  query: DirectoryQuery,
) => Promise<DirectoryRows>   // rows carry `avatarObjectKey`; the route resolves the bytes

// apps/api/src/config.ts — added by T021, consumed by T022
avatar.cardDimensionPx: number   // AVATAR_CARD_DIMENSION_PX, default 96

// apps/api/src/storage/ — added by T023, consumed by T024, T025, T026
export const cardKeyFor = (profileKey: string): string
```

`VisibleProfile` and `EventScope` already exist — `apps/api/src/db/queries/profiles.ts` and
`apps/api/src/plugins/event-access.ts` respectively. Do not redeclare either.

---

## Phase 1: Setup

**Purpose**: governance and provisioning that gate merge and first deploy respectively.

- [x] T001 Amend `.specify/memory/constitution.md` to supersede **all three** departures: "managed PostgreSQL" (Technology Constraints, and standing decision 4), `CLAUDE.md`'s "preview deploy on every change", and **001's shipped FR-066 and SC-011**. State what replaces the per-change reviewer preview. **Merge prerequisite — not a deploy prerequisite.** ✅ **Done 2026-08-07 — constitution v3.0.0** (MAJOR; first retraction of a delivered requirement). Principle VII redefined, a "Deployment environments" block added, `CLAUDE.md` resynchronised in six places
- [x] T002 [P] Annotate register entry 11 in `.specify/memory/constitution.md` as resolved by this feature (Azure VMs, PostgreSQL container, storage on a VM volume), and entry 17's remaining half as **resolved by replacement rather than provisioning**. ✅ **Done** — entry 11 struck through in place; entry 17 annotated with the "removed jobs verify environments, not correctness" distinction
- [x] T003 [P] Annotate register entry 14 in `.specify/memory/constitution.md`: Cloudflare Pages previews are withdrawn; a long-lived public UAT replaces them, so the access-control question survives in a sharper form. ✅ **Done** — retitled "Public non-production URLs"; entries 4 and 19 also annotated as escalated
- [ ] T004 [owner] Register a domain and create the `uat` and `prod` A records. **Blocks first deploy only** — Caddy cannot obtain a Let's Encrypt certificate without a resolving record (FR-479) ⛔ **owner decision, unchanged.** `deploy/vm/envs/*.env` leave `APP_DOMAIN` blank and `_common.sh`'s `require_domain` refuses with a sentence naming the missing decision, rather than failing deep in an ACME log
- [ ] T005 [owner] Decide UAT access control, given that the reference NSG opens web to the world and UAT will carry realistically-shaped attendee data (register entries 14, 19) ⛔ **owner decision, unchanged.** `provision-vm.sh` opens web to the world and locks SSH to the operator's address; the NSG rule carries a comment saying which decision would change it and that it is the only line that would change
- [ ] T006 [owner] Confirm the Azure subscription and resource groups for `uat` and `prod` ⛔ **owner decision, unchanged.** `SUBSCRIPTION` is blank in both env files; `require_subscription` treats blank as "use whatever is active" and refuses on a mismatch once it is filled
- [x] T007 Run `pnpm verify:clean` and record the baseline, so later claims about the pipeline are measured rather than assumed

**Checkpoint**: T001 must land before merge. T004–T006 gate Phase 4's deploy tasks only.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user story work begins until this phase completes.

### Repository casts — first, by requirement (FR-496, FR-497)

FR-497 puts this before this feature's own repository work so 006 adds zero new casts rather than
writing four and deleting them. Fifteen casts across eleven files (research D10), not the six the
idea inbox recorded.
 ✅ **Done 2026-08-07** — all 13 gates green in 224.5s (297 component, 458 integration, 100 e2e; asset budget 148.1/150.0 KB)
- [x] T008 Add `@mynet/data": "workspace:*"` to **devDependencies** in `packages/platform/package.json`. Not `dependencies` — the whole argument rests on `import type` erasing at build time
- [x] T009 Replace the `Promise<unknown>` repository mirroring in `packages/platform/src/registry.tsx` with `import type` of the real interfaces from `@mynet/data`, and update the header comment that currently explains the mirroring ✅ `repositories` is now `Repositories` from `@mynet/data`, imported type-only
- [x] T010 [P] Remove casts in `apps/web/src/app/home/cards/UpNext.tsx`, `RestOfDay.tsx`, `NextSavedSession.tsx`, `YourConferences.tsx`
- [x] T011 [P] Remove casts in `apps/web/src/app/profile/Profile.tsx`, `ProfileEdit.tsx`, `Account.tsx`, `WithdrawConference.tsx` ✅ plus the two `<select>`→union assertions, narrowed by membership check in `labels.ts`
- [x] T012 [P] Remove casts in `apps/web/src/app/active-event.tsx`, `apps/web/src/app/destinations/Agenda.tsx`, `apps/web/src/shell/EventSwitcher.tsx`, `apps/web/src/auth/useAuth.tsx` ✅ plus `JoinConference.tsx` and `services.ts`, which research D10 had not counted
- [x] T013 Add a check to `apps/web/tests/unit/` asserting zero repository casts remain in feature code (SC-414), so the debt cannot silently return

### Schema, indexes and migration `0005`
 ✅ `apps/web/tests/unit/repository-casts.test.ts` — scrapes the data barrels rather than listing types, so a new type is covered by existing. Found two further casts (`useSessionNotes.ts`, `sessions.ts`); **seventeen removed in total**
- [x] T014 [P] Add `registrations_event_id_idx` on `registrations.eventId` in `apps/api/src/db/schema/events.ts`, and **correct the now-false comment** — "Every read of this table is 'the authenticated attendee's registrations'" stops being true in this feature ✅ both indexes kept — the 001–005 path and the directory's — and the false comment replaced
- [x] T015 [P] Add `attendee_interests_interest_idx` on `attendeeInterests.interest` in `apps/api/src/db/schema/profiles.ts`
- [x] T016 [P] Add an `attendee_id` index inside the `identityTokenColumns()` factory in `apps/api/src/db/schema/identity-tokens.ts`, so both `attendee_verifications` and `attendee_password_resets` gain it from one change (004 review finding) ✅ via a shared `identityTokenIndexes(tableName)` factory beside the column factory
- [x] T017 Run `drizzle-kit generate` to emit `apps/api/migrations/0005_directory_indexes.sql`. **Do not hand-edit anything under `migrations/meta/`** — the README confirms 006 diffs against `0004_snapshot.json` and takes index 5, and warns against writing a `0003_snapshot.json` to "fix" the gap ✅ `0005_directory_indexes.sql`; chain contiguous (`0005`→`0004`), journal idx 5, `when` latest. **`meta/README.md` breaks `drizzle-kit generate`** — it JSON-parses every file in `meta/`; move it aside for the run. Recorded in that README for 007
- [x] T018 Hand-add to `0005`: `CREATE EXTENSION IF NOT EXISTS unaccent` and the functional index `events_join_code_lower_btrim_idx` on `lower(btrim(join_code))` — Drizzle cannot express the expression index (004 review finding) ✅ appended under a block comment warning a regenerating feature not to drop it
- [x] T019 Add an integration test in `apps/api/tests/integration/` asserting `0005` applies forward against a real database and that the five indexes and the extension exist afterwards ✅ plus a behavioural `unaccent('Muñoz')` check, and the `0005`-reserved assertion in `migrations.test.ts` flipped from absent to present
- [x] T020 In `apps/api/tests/integration/index-usage.test.ts`, assert via `EXPLAIN` that account deletion no longer sequentially scans either token table and that the join-code lookup uses `events_join_code_lower_btrim_idx` (FR-498, FR-499, SC-415)

### The card avatar rendition
 ✅ `index-usage.test.ts`. **Populates 2,000 rows and asserts `Index Cond`, not the index name** — `enable_seqscan=off` is a cost penalty rather than a prohibition, and an Index Only Scan over the composite unique with `Filter: (event_id=…)` names an index while touching every row. `gen_random_uuid()` in the predicate is VOLATILE and forces a scan regardless of indexes
- [x] T021 Add `AVATAR_CARD_DIMENSION_PX` (default 96) to `apps/api/src/config.ts`, alongside the existing `AVATAR_DIMENSION_PX`
- [x] T022 Extend `apps/api/src/images/avatar.ts` to emit **both** renditions from one decode, through the same `rotate()` → `resize()` → re-encode chain with no `withMetadata()`. **No second production path** — FR-458 requires metadata absence to stay a property of the operation ✅ `processAvatar` returns `ProcessedAvatarSet`; `image.clone()` per rendition — one decode, one chain, no `withMetadata()`
- [x] T023 Add the derived card-key convention to `apps/api/src/storage/` (research D3). **No new column** — an `avatar_card_object_key` column would fire `export-coverage.test.ts` by existing ✅ `cardKeyFor(profileKey)` → `<profileKey>/card`, derived from the profile key so one place decides where an avatar lives
- [x] T024 Write both renditions on upload in `apps/api/src/routes/profile.ts` ✅ upload writes both; **`DELETE /profile/avatar` now removes both too** — leaving the card copy would keep a removed face in every directory
- [x] T025 Extend the account-deletion routine in `apps/api/src/db/queries/account.ts` to derive and remove **both** keys before the attendee row, using `cardKeyFor` (FR-460, FR-457). A rendition outliving the account silently regresses a guarantee 004 shipped
- [x] T026 Add read-path repair in `apps/api/src/routes/events/directory.ts`'s avatar resolution: a read finding the card rendition absent derives it once via `cardKeyFor` and stores it. For developer databases seeded before this change — **there is no production avatar to backfill**, because the product has never been deployed ⏳ deferred to T046, which creates `routes/events/directory.ts` ✅ done inside `routes/events/directory.ts` — `resolveCard` derives the missing rendition through `processAvatar`, never through a copy or a second resize chain (FR-458)
- [x] T027 [P] In `apps/api/tests/integration/avatar-card-rendition.test.ts`, assert the card rendition carries **no EXIF**, using a fixture with GPS coordinates (FR-458) ✅ `avatar-card-rendition.test.ts` — 8 assertions incl. byte-level GPS scan, re-encode proof, and no-upscale
- [x] T028 [P] In `apps/api/tests/integration/avatar-card-rendition.test.ts`, assert that deleting an account leaves **zero** stored renditions in any size (FR-460, SC-408)

### The directory repository
 ✅ asserted **by key prefix**, so a third rendition added later and not deleted fails this too. Uses a throwaway account: deleting a seeded attendee damages every suite that runs after
- [x] T029 [P] Create `packages/data/src/interfaces/directory.ts` — `DirectoryRepository`, owning the listing and the profile read (research D1). `IdentityRepository` is not touched ✅ three reads: `list`, `get`, `readAvatar` — the third because the profile view needs the 512px rendition the listing deliberately does not carry
- [x] T030 Append the export to `packages/data/src/interfaces/index.ts` ✅ plus `directory` on the `Repositories` aggregate, which is the one line that reaches `@mynet/platform` now that T009 typed it against the real interfaces
- [x] T031 Create `packages/data/src/http/directory-repository.ts` ✅ embedded avatars → data URLs at the transport boundary; 404 → `null` (401 still propagates); an empty `q` omitted so a cleared search box and an untouched one share one address and one coalesced request
- [x] T032 Append the export to `packages/data/src/http/index.ts`
- [x] T033 Add `directory` to the registry in `packages/platform/src/registry.tsx` and a `useDirectoryRepository` hook in `packages/platform/src/hooks.ts` — now typed against the real interface, with no cast (T009) ✅ **`registry.tsx` needed no edit at all** — T009 made it reference `@mynet/data`'s `Repositories`, so T030's line is the whole registry change. FR-496 demonstrated by the first feature to add a repository after it
- [x] T034 Wire the repository in `apps/web/src/app/services.ts` ✅ **undecorated, declared rather than omitted** (FR-466): 005's decorator revokes on age, which is the wrong clock for a visibility setting that takes effect on the next request

**Checkpoint**: foundation ready. Phases 3 and 4 may now run in either order or concurrently.

---

## Phase 3: User Story 1 — Find someone worth meeting at this conference (P1) 🎯 MVP

**Goal**: the directory renders, narrows by search and filters, ranks by shared interests, pages
without duplicates, and shows nobody it should not.

**Independent test**: sign in as a seeded attendee at a conference with other registered,
discoverable, verified attendees; open Discover; confirm cards, ordering, search, both filters, the
empty state and its reset.

### Tests for User Story 1

- [x] T035 [P] [US1] Integration test in `apps/api/tests/integration/directory-visibility.test.ts`: an attendee excluded by any of the three conditions is **absent from the payload entirely**, not present-and-hidden (FR-402, SC-404) ✅ asserted over the **raw body**, by name, company and identifier — a test reading only the parsed `attendees` array would pass against a payload shipping everyone with a `visible: false` flag
- [x] T036 [P] [US1] In `apps/api/tests/integration/directory-visibility.test.ts`: an attendee with discoverability **off** still reads the full directory (FR-403, SC-405)
- [x] T037 [P] [US1] In `apps/api/tests/unit/directory-response-shape.test.ts`: no directory response can carry `email` or verification state, asserted over the response schema rather than by inspection (FR-406, SC-406) ✅ plus the FR-413 structural half: the query's own source is scanned for the tables a shared-interest ranking may never touch, because "does not consult saved sessions" is a claim about what is *absent* and no response can demonstrate it
- [x] T038 [P] [US1] In `apps/api/tests/integration/directory-search.test.ts`: search is case- **and accent-insensitive** — "Munoz" finds "Muñoz" (research D5)
- [x] T039 [P] [US1] In `apps/api/tests/integration/directory-search.test.ts`: `q`, `role` and `interest` combine conjunctively (FR-407, FR-408)
- [x] T040 [P] [US1] In `apps/api/tests/integration/directory-ranking.test.ts`: shared-interest count descending, zero-overlap attendees still appear and rank last, deterministic tie-break, and the count is the value the card will show (FR-411, FR-412, FR-413)
- [x] T041 [P] [US1] In `apps/api/tests/integration/directory-paging.test.ts`: paging while attendees join and edit interests yields **no duplicate** (FR-410, FR-410a, SC-403a) ✅ **with one deliberate correction**: the score-fall case is the residue D4 declares, not a defect. The server may re-return that one attendee and the test asserts it is *exactly* that one — a repeat of anyone else means the cursor is unstable. The system-level half is asserted in `discover-states.test.tsx`
- [x] T042 [P] [US1] In `apps/api/tests/integration/directory-event-scope.test.ts`: the directory is bounded to the active conference and leaks nothing from another (FR-401, FR-401a)
- [x] T043 [P] [US1] Confirm `apps/api/tests/unit/event-scope-audit.test.ts` covers the new route and would fail without `requireEventAccess` ✅ named explicitly in `event-scope-audit.test.ts`, because "the audit covers the new route" and "the audit matches a pattern the route happens to match" are different claims
- [x] T044 [P] [US1] In `apps/web/tests/component/discover-states.test.tsx`: every declared state — loading, no match with reset, nobody discoverable, **no active conference**, offline, failure (FR-401b, FR-414, FR-415, FR-467) ✅ 13 assertions across loading / populated / two empty states / no-conference / offline / failed, plus the paging de-duplication

### Implementation for User Story 1

- [x] T045 [US1] Create `apps/api/src/db/queries/directory.ts` — three conditions, search, filters, overlap `LEFT JOIN` and count, keyset bound, all in **one** query (research D12). Document that the reader's own interests are the only outside input, which is what makes FR-413 hold structurally ✅ **deviation, recorded**: `listDirectory(scope, query)` rather than the declared `(scope, readerId, query)`. `scope.attendeeId` *is* the reader, so a second parameter could only agree or disagree — and disagreeing would rank by one person's interests while bounding by another's registration, silently
- [x] T046 [US1] Create `apps/api/src/routes/events/directory.ts` — `GET /events/:eventId/attendees` per `contracts/directory-api.md`, with `additionalProperties: false` and the embedded card avatar
- [x] T047 [US1] Append one import and one array entry to `apps/api/src/routes/index.ts`
- [x] T048 [US1] Regenerate and commit `contracts/openapi.json` ✅ plus `contract.ts` bindings for both reads. The new route declares **every** field `required` so the generated type binds without an `Omit`; 004's is bound through `Required<>` because FR-431 forbids changing it
- [x] T049 [P] [US1] Create `apps/web/src/app/discover/useDirectory.ts` — keyset paging plus **client-side de-duplication by attendee id** against the rendering list (research D4). Not a cache: it is the rendered list and dies with the view
- [x] T050 [P] [US1] Create `apps/web/src/app/discover/AttendeeCard.tsx` — every declared field, the shared-interest count, the avatar with its fallback. **No message, share-card or schedule action** (FR-434)
- [x] T051 [US1] Create `apps/web/src/app/destinations/Discover.tsx` — the grid, search field, role and interest filters, paging
- [x] T052 [US1] Declare Discover's element in `apps/web/src/app/navigation.ts` — the destination owns its address, as 005 established; `routes.tsx` is not touched
- [x] T053 [P] [US1] In `apps/web/src/app/discover/DirectoryEmptyStates.tsx`: no match with a working reset, and nobody discoverable, **worded so neither discloses which cause applies** (FR-414, FR-415)
- [x] T054 [P] [US1] In `apps/web/src/app/discover/DirectoryEmptyStates.tsx`: the no-active-conference state — joining comes first, with the way to do it. Not an empty list, not an error (FR-401b)
- [x] T055 [P] [US1] In `apps/web/src/app/discover/DirectoryEmptyStates.tsx`: the offline state — needs a connection, worded distinguishably from a server fault. **No caching decorator anywhere in this feature** (FR-466–FR-468)
- [x] T056 [US1] Handle conference switch in `apps/web/src/app/destinations/Discover.tsx` and `apps/web/src/app/discover/useDirectory.ts` — re-render against the new conference, retaining nothing from the previous one including mid-load (FR-401a) ✅ sequence guard **and** a render-time reset. The switch is driven through `useActiveEventContext().switchTo` in the test, because mutating the repository double changes what a later read answers without telling the provider anything happened
- [x] T057 [P] [US1] Desktop, tablet and mobile layouts in `apps/web/src/app/destinations/Discover.tsx` and `apps/web/src/app/discover/AttendeeCard.tsx`; no horizontal scroll at 320px
- [x] T058 [P] [US1] Accessibility in `apps/web/src/app/destinations/Discover.tsx` and `apps/web/src/app/discover/AttendeeCard.tsx`: labelled search field (not placeholder-only), filters exposing state and active count, **result-count changes announced**, keyboard order matching reading order, intent and availability never colour-only ✅ the count live region lost its `role="status"` — the offline notice is the surface that wants it, and two elements claiming it made "the status" ambiguous

### Performance verification for User Story 1

The specification sets thresholds at a stated scale. Without these, the thresholds are aspirations.

- [x] T058a [US1] Add a **1,000-attendee conference fixture** to `apps/api/tests/fixtures/` — the scale FR-401c establishes and every performance criterion is measured at. Generated, with a realistic spread of interests so the ranking join is exercised rather than degenerate ✅ 1,000 attendees, generated deterministically, with a **skewed** interest distribution: a uniform one gives the ranking join one bucket and a planner that can be right by accident
- [x] T058b [US1] In `apps/api/tests/integration/directory-performance.test.ts`, measure against that fixture and assert the thresholds: first page under **2s** (SC-402) and a filtered query under **1s** (SC-403). Record the measured numbers in the test output so a regression is visible as a trend, not just as a pass/fail ✅ **measured: first page 10.2ms, search 6.0ms, role+interest 3.6ms, slowest of ten pages 9.5ms** — against budgets of 2000ms and 1000ms. Printed per run so a regression shows as a trend rather than only as a threshold breach
- [x] T058c [P] [US1] In `e2e/`, assert **one** network request carries a 24-card page and all its faces — no per-card image request, no placeholders resolving individually (SC-407, FR-456) ✅ counted from **arrival at Discover**, not from sign-in: Home's People to meet card is a second, legitimate reader of the same listing. **1 listing request, 0 avatar requests**

**Checkpoint**: US1 is independently shippable and is the MVP.

---

## Phase 4: User Story 4 — Reach the product at a real address, and stay signed in (P1)

**Goal**: a deployed environment over HTTPS on one origin, where sign-in works — which it does not in
the configuration this replaces.

**Independent test**: deploy, browse over HTTPS, sign in, navigate, confirm the session persists.
Independent of every Discover story.

### Tests for User Story 4

- [x] T059 [P] [US4] Integration test in `apps/api/tests/integration/` asserting every declared security header on API responses (FR-480, SC-411) ✅ asserted on the **refusals** too — a 401, three 404s and a 400 — because a `preHandler` implementation sets headers on exactly the responses an attacker is least interested in. Implemented as an `onSend` hook, registered before the error handler so a 500 carries them as well
- [x] T060 [P] [US4] Integration test: `/ready` reports unhealthy when the database is unreachable and healthy when it is not (FR-482, SC-412)
- [x] T061 [P] [US4] Integration test: `/health` is **unchanged** and still discloses nothing about dependencies (FR-483) ✅ plus the assertion that makes the pair meaningful: with the database unreachable, `/health` answers 200 and `/ready` answers 503. If those two ever agree in that scenario, one has stopped being useful
- [x] T062 [P] [US4] In `apps/api/tests/unit/cookie-secure.test.ts`, assert a deployed configuration cannot serve a non-`Secure` session cookie (FR-478) ✅ a **unit** test, because the integration suite runs under `NODE_ENV=test` where `Secure` is deliberately off — the one configuration it can never assert the requirement from

### Implementation for User Story 4

- [x] T063 [US4] Set security response headers on API responses in `apps/api/src/app.ts` (research D8 — the API owns its own, so the integration suite can assert them without a proxy)
- [x] T064 [US4] Add `/ready` performing `select 1` in `apps/api/src/routes/health.ts`, leaving `/health` untouched ✅ **the route audit caught it** and demanded a justified allow-list entry before it could pass (FR-387) — the mechanism working as designed
- [x] T065 [US4] Make the session cookie's `Secure` attribute unconditional in deployed environments in `apps/api/src/auth/cookie.ts` — it is currently gated on `config.isProduction` ✅ introduced `config.isDeployed`, deliberately the inverse of *local development* rather than a synonym for production, so a future environment name defaults to **secure** rather than to insecure. The cleared cookie matches, or the browser keeps the original alongside it and sign-out revokes nothing
- [x] T066 [US4] Set `VITE_API_BASE_URL=/api` for deployed builds in `deploy/vm/envs/{uat,prod}.env` and the build step of `.github/workflows/verify.yml`. The client's HTTP layer already defaults to a relative base (`apps/web/src/app/services.ts`), so this is configuration rather than code
- [x] T067 [P] [US4] Create `deploy/vm/Caddyfile` — auto-TLS, `file_server` with SPA fallback for the built client, `reverse_proxy` for `/api/*`, the maintenance matcher **in front of** the proxy, and the declared headers on static responses (research D6, D8)
- [x] T068 [P] [US4] Create `deploy/vm/docker-compose.yml` — `caddy`, `api`, `postgres`. **PostgreSQL bound to loopback only** (FR-486)
- [x] T069 [P] [US4] Create `deploy/vm/_common.sh` and `deploy/vm/envs/{uat,prod}.env`, including the subscription-verification guard that **refuses to run** when the active subscription does not match
- [x] T069a [US4] **Guard the UAT/production data separation** (FR-485). `deploy/vm/_common.sh` must refuse to run when the resolved database host for `uat` matches production's, in the same shape as the subscription-verification guard, naming the resolved host in the error. 001 satisfied its equivalent (FR-067) with a permanently data-free `preview-base` branch; separate env files alone are a convention, and a convention is not an enforcement ✅ fires on **`load_env`** — before any script has provisioned, synced, deployed or backed up. It compares database name, host and VM, because both environments legitimately address their database as `postgres` on their own private network: identical strings naming different machines. It reads production's file with `grep` rather than sourcing it, since sourcing would overwrite the UAT values just loaded — the exact accident, produced by the guard itself
- [x] T069b [P] [US4] In `apps/api/tests/unit/`, extend or mirror the seed's production guard so `pnpm db:seed` refuses to run against a non-development database, naming the resolved host. UAT is a real environment with real-shaped data, and the seed deletes every attendee ✅ **the guard did not exist.** `seed/index.ts` has claimed since 002 that it never runs against real attendee data, and nothing enforced it — `seed()` opens with `DELETE FROM attendees`. Safe only while there was nowhere else to point a `DATABASE_URL`; 006 is what changes that. Refuses unless the deployed database is **named**, so UAT's first seed is possible and no seed is possible by accident
- [x] T070 [US4] Create `deploy/vm/provision-vm.sh` — resource group, VM, NSG, static IP; prints the public IP rather than hardcoding it
- [x] T071 [US4] Create `deploy/vm/deploy.sh`
- [x] T072 [P] [US4] Create `deploy/vm/backup.sh` (runs on the VM under cron, **at least daily**) and `deploy/vm/verify-backup-local.sh` (FR-487)
- [x] T073 [P] [US4] Create `deploy/vm/maintenance.sh` and `deploy/vm/maintenance/index.html` — serving **503 with `Retry-After`**, verified with `curl -sI` rather than by eye, since a page rendering perfectly while answering 200 silently defeats external monitoring ✅ `maintenance.sh <env> verify` asserts 503 **and** `Retry-After` with `curl -sI`. A page that renders perfectly while answering 200 looks correct in a browser and silently reports the site healthy to every uptime check for the whole window
- [x] T074 [US4] Write `deploy/vm/README.md` — the operator runbook, including the backup schedule and retention, the **restore procedure**, and the **rollback procedure stating what happens when the schema has moved ahead of the application** (FR-487, FR-489)
- [x] T075 [US4] Update the header comment in `apps/api/Dockerfile` — the image is reused unchanged, but it names Fly and says it is unvalidated
- [x] T076 [US4] Delete `db-branch`, `deploy-api`, `deploy-preview`, `schema-diff` and `cleanup` from `.github/workflows/verify.yml` (research D13)
- [x] T077 [US4] Add `deploy-uat` (push to `develop`) and `deploy-prod` (push to `main`) to `.github/workflows/verify.yml` ✅ gated on `verify-push`, and **deliberately inert until the environments exist** — they print what they are blocked on and exit 0, because a job failing on every merge for a reason nobody can act on is the always-red signal `verify` was fixed to stop being
- [x] T078 [US4] Recompose the `verify` and `verify-push` aggregate checks around the jobs that remain. **No check may be weakened** — verify that `typecheck`, `lint`, `test-unit`, `test-component`, `contract`, `migrations`, `test-integration`, `build`, `test-accessibility` and `test-e2e` all survive (FR-490) ✅ **`verify` 11 → 10; `verify-push` 6 → 10.** The second is a strengthening: `migrations`, `test-integration`, `test-accessibility` and `test-e2e` now gate `develop` and `main` too, where before a merge was held to a lower standard than the pull request
- [x] T079 [US4] Confirm `test-e2e` still runs against `localhost:3000` on its `postgres:17` service container and never depended on the preview ✅ confirmed — `needs: migrations` only, its own `postgres:17` service container, `VITE_API_BASE_URL=http://localhost:3000`. **And a pre-existing silent narrowing was found and fixed**: the job named five spec files while its comment said "everything", so ten specs — the whole of 004's and 005's — had never run in CI once. Now derived from the directory, with an emptiness guard
- [ ] T080 [US4] Deploy UAT and verify by hand: TLS, **sign in and stay signed in** (SC-410), headers present (SC-411), faces render (proving `img-src` permits `data:`, FR-481), `/ready` behaviour (SC-412), PostgreSQL unreachable off-host (FR-486), maintenance page returning 503 ⛔ **blocked by T004 and T006** — there is no environment to deploy to. Everything it would check is built and, where it can be, asserted: the headers by `security-headers.test.ts`, `/ready` by `readiness.test.ts`, `img-src data:` by both, the 503 by `maintenance.sh <env> verify`, and the loopback bind by the compose file
- [ ] T081 [US4] **Exercise a restore from a scheduled backup** using `deploy/vm/verify-backup-local.sh`, before production holds real attendee data, and record the result in `deploy/vm/OPERATIONS-LOG.md` (SC-413). A documented restore never run is a hope, not a procedure 🟡 **half done, and the half that was possible is the procedure.** `./verify-backup-local.sh` was **run and passed** — dump → `pg_restore --list` → restore → compare, plus the cascade, the `unaccent` extension and its behaviour. Recorded in `deploy/vm/OPERATIONS-LOG.md`. The remaining half needs a VM: install the cron entry, let a scheduled backup fire, restore **that** artifact

**Checkpoint**: the product is reachable and sign-in works.

---

## Phase 5: User Story 2 — Look at who someone actually is (P2)

**Goal**: an addressable profile view built on 004's existing read, unchanged.

**Independent test**: navigate directly to a co-attendee's profile address; confirm it renders, and
that four different refusal causes are indistinguishable.

### Tests for User Story 2

- [x] T082 [P] [US2] In `apps/api/tests/integration/profile-visibility.test.ts` (existing): confirm another conference, nonexistent, not discoverable and unverified all still refuse **identically** through the unchanged route (FR-431)
- [x] T083 [P] [US2] In `apps/web/tests/component/attendee-profile.test.tsx`: the dialog is genuinely modal, dismisses on **Escape**, confines focus, and **restores focus to the opener**. Assert the modality marker the way 005's session-panel tests do — 004's dialog tests used `getByRole('dialog', { hidden: true })`, which proves mounting, not `showModal()` ✅ **strengthened over 004's dialog tests**: `data-modal` distinguishes `showModal()` from `show()`, where `getByRole('dialog', { hidden: true })` passes against a dialog that was never opened
- [x] T084 [P] [US2] In `apps/web/tests/component/attendee-profile.test.tsx`: the profile view carries **no** message, share-card or schedule control (FR-434)
- [x] T085 [P] [US2] In `e2e/discover.spec.ts`: the profile address survives a reload and is shareable (FR-431)

### Implementation for User Story 2

- [x] T086 [US2] Create `apps/web/src/app/discover/AttendeeProfile.tsx` — native `<dialog>` with `showModal()`, explicit focus restoration, structured so 007/008 can register actions later without editing it ✅ plus a `resolving` flag on the outlet context — a null `eventId` alone conflates *not resolved yet* with *joined nothing*, and the dialog's answer to each is opposite. Inferring it refused a perfectly visible attendee for one frame on every cold load
- [x] T087 [US2] Declare the `:attendeeId` child route in `apps/web/src/app/navigation.ts`
- [x] T088 [P] [US2] In `apps/web/src/app/discover/AttendeeProfile.tsx`: render the 512px rendition through 004's existing avatar route, with the non-photographic fallback and no way to distinguish "no avatar" from "not visible"
- [x] T089 [P] [US2] Desktop, tablet and mobile layouts in `apps/web/src/app/discover/AttendeeProfile.tsx` — centred overlay, wider on tablet, **full-width on mobile**

---

## Phase 6: User Story 3 — Be pointed at people worth meeting (P3)

**Goal**: one appended Home card, at most five co-attendees, ranked identically to the directory.

**Independent test**: as an attendee with interests, the card ranks and states counts; as one
without, the card shows its own empty state and Home is otherwise unaffected.

### Tests for User Story 3

- [x] T090 [P] [US3] In `apps/web/tests/component/people-to-meet-card.test.tsx`: at most five co-attendees, ranked by shared-interest count, each showing its count (FR-447)
- [x] T091 [P] [US3] In `apps/web/tests/component/people-to-meet-card.test.tsx`: a reader with no interests gets the card's empty state, and **every other card renders normally** (FR-448, FR-449) ✅ reads the reader's own profile as well as the listing — "you have set no interests" and "nobody to suggest" are different facts and the listing alone cannot tell them apart
- [x] T092 [P] [US3] In `apps/web/tests/component/people-to-meet-card.test.tsx`: the card's failure is isolated and does not blank the dashboard (FR-448) ✅ both reads' failures are contained, including the profile read that exists only to separate the two empty states
- [x] T093 [P] [US3] In `apps/web/tests/unit/home-registry.test.ts` (existing): `assertAtMostOneLead` still holds after the append ✅ `assertAtMostOneLead` holds; the order-collision check **widened from `primary` alone to every slot** — 005 only ever appended to `primary`, so a check covering the slot the last feature happened to use stops working exactly when a new contributor arrives

### Implementation for User Story 3

- [x] T094 [US3] Create `apps/web/src/app/home/cards/PeopleToMeet.tsx` — its own card, owning its loading, empty and failure states
- [x] T095 [US3] Append **one line** to `apps/web/src/app/home/registry.ts`. Do not edit, reorder or read from another feature's card ✅ one line. `home-cards.test.tsx`'s four-state matrix also needed the `directory` and `profile` doubles driven — its own header predicted this, and without it the matrix records one state four times and reports green
- [x] T096 [P] [US3] In `apps/web/src/app/home/cards/PeopleToMeet.tsx`: the action opening Discover in the same order the card was drawn from (FR-447a) ✅ a plain `/discover` link with no sort parameter, which is what makes "the same order" true rather than coincidental

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T097 [P] In `e2e/discover.spec.ts`: the journey — sign in → Discover → search → open a profile → return, at more than one viewport — completing **within 30 seconds** without prior instruction (SC-401) ✅ **measured: 0.5s at 375px and 0.4s at 1440px**, against a 30s budget
- [x] T098 [P] In `e2e/accessibility.spec.ts` (existing): extend the axe sweep to Discover and the profile view ✅ Discover with a populated directory, plus the profile dialog at all three widths — **zero critical or serious violations** across 21 axe checks
- [x] T099 [P] In `e2e/discover.spec.ts`: assert no horizontal scrolling at 320px on Discover, the profile view and Home
- [x] T100 [P] Confirm `deletion-coverage.test.ts` and `export-coverage.test.ts` still pass **unchanged** — no allow-list entry was added, because no table and no column were
- [x] T101 [P] Confirm the `contract` job passes against the regenerated `contracts/openapi.json`
- [ ] T102 Walk `quickstart.md` end to end, including Part 3 against deployed UAT 🟡 **Parts 1 and 2 walked; Part 3 blocked by T004/T006.** Every check in 2a–2h is discharged by an automated gate — see the requirement-coverage table — and `pnpm test:accessibility` and the full `pnpm test:e2e` were both run green
- [x] T103 [P] Update `CLAUDE.md`: Discover carries content now; the deployment platform section; the withdrawal of per-PR previews
- [x] T104 [P] Update `brainstorm/00-overview.md` — mark 006 shipped and refresh open threads
- [x] T105 Run `pnpm verify:clean` and confirm green, then confirm the recomposed `verify` check is green in CI **for the first time** — because its blockers were deleted rather than weakened 🟡 **local half done: all 13 gates green in 284.4s** — 254 unit, 357 component, 550 integration, 21 accessibility, **111 end-to-end** (79 before the CI narrowing was fixed, and 5 spec files' worth before that). The CI half needs a push, which is the reviewer's to make

---

## Requirement coverage

**One row per requirement, no ranges.** Ranges made this table unverifiable by script, and that is
what hid FR-485's missing enforcement until the review gate expanded them.

| Requirement | Tasks |
|---|---|
| FR-401 active conference only | T042, T045 |
| FR-401a conference switch | T042, T056 |
| FR-401b no active conference | T044, T054 |
| FR-401c 1,000-attendee scale | T058a |
| FR-402 absent, not hidden | T035, T045 |
| FR-403 non-reciprocal | T036, T045 |
| FR-404 declared narrowing, nothing further | T045, T046 |
| FR-405 card fields | T046, T050 |
| FR-406 no email, no verification state | T037, T046 |
| FR-407 search fields, never email | T038, T039, T045 |
| FR-408 filters combine conjunctively | T039, T045, T051 |
| FR-409 server-side evaluation | T035, T045 |
| FR-410 stable paging | T041, T045 |
| FR-410a no duplicates | T041, T049 |
| FR-411 ranking order | T040, T045 |
| FR-412 count shown on the card | T040, T050 |
| FR-413 ranking inputs bounded | T040, T045 |
| FR-414 no-match empty state with reset | T044, T053 |
| FR-415 empty state discloses no cause | T044, T053 |
| FR-431 addressable, 004's read unchanged | T082, T085, T086 |
| FR-432 profile fields plus full interests | T086 |
| FR-433 Escape, focus confinement, restoration | T083, T086 |
| FR-434 no 007/008 actions | T050, T084, T086 |
| FR-446 one appended card, no edits elsewhere | T095 |
| FR-447 at most five, ranked, counts shown | T090, T094 |
| FR-447a action into Discover, same order | T096 |
| FR-448 card owns its states, failure isolated | T092, T094 |
| FR-449 no-interests empty state | T091, T094 |
| FR-456 avatars in the listing response | T046, T058c |
| FR-457 card-sized rendition | T021, T022, T025 |
| FR-458 same re-encode path, no EXIF | T022, T027 |
| FR-459 same three conditions as the profile | T035, T046 |
| FR-460 every rendition deleted with the account | T025, T028 |
| FR-466 not cached | T044, T055 |
| FR-467 offline wording distinguishable | T044, T055 |
| FR-468 declared, not omitted | T055 |
| FR-476 one origin | T066, T067 |
| FR-477 `SameSite=Lax` retained, no token scheme | T065, T067 |
| FR-478 `Secure` in deployed environments | T062, T065 |
| FR-479 automatic trusted TLS | T067, T080 |
| FR-480 CSP and the other headers | T059, T063, T067 |
| FR-481 `img-src` permits `data:` | T063, T067, T080 |
| FR-482 `/ready` queries the database | T060, T064 |
| FR-483 `/health` unchanged | T061, T064 |
| FR-484 two isolated environments | T068, T069, T070 |
| FR-485 own database, secrets, address; **UAT never production data** | T069, **T069a**, **T069b** |
| FR-486 database unreachable off-host | T068, T080 |
| FR-487 daily backup, documented and exercised restore | T072, T074, T081 |
| FR-488 migration verified in CI | T019 |
| FR-489 rollback, including schema-ahead | T074 |
| FR-490 jobs removed, none weakened | T076, T077, T078, T079, T105 |
| FR-496 real repository types, type-only dependency | T008, T009 |
| FR-497 casts removed first | T010, T011, T012, T013 |
| FR-498 token-table indexes | T016, T020 |
| FR-499 join-code functional index | T018, T020 |

| Success criterion | Tasks |
|---|---|
| SC-401 profile reachable in under 30s | T097 |
| SC-402 first content under 2s at scale | **T058a, T058b** |
| SC-403 filter response under 1s at scale | **T058a, T058b** |
| SC-403a no co-attendee twice while paging | T041 |
| SC-404 100% of excluded attendees absent | T035 |
| SC-405 hidden reader sees 100% of the directory | T036 |
| SC-406 zero email or verification indicators | T037 |
| SC-407 24 faces, no per-card loading | **T058c** |
| SC-408 zero renditions survive deletion | T028 |
| SC-409 zero content readable offline | T044, T055 |
| SC-410 sign in and stay signed in | T080 |
| SC-411 headers on every deployed response | T059, T080 |
| SC-412 unready before traffic | T060, T080 |
| SC-413 a restore actually performed | T081 |
| SC-414 zero repository casts | T013 |
| SC-415 deletion and join stop scanning | T020 |

**Governance**: T001 (amendment, merge prerequisite), T002–T003 (register annotations).

**Every row above is discharged except the ones a deployment is the only possible evidence for.**
FR-479 (a trusted certificate), FR-484's *two* environments, FR-486 (the database unreachable
off-host) and FR-487's exercised-restore half are built, scripted and documented — and they are
claims about machines that do not exist yet. SC-410, SC-411's deployed half, SC-412's deployed half
and SC-413's scheduled-backup half are the same. Everything that could be asserted without one is
asserted by a gate that runs.

---

## What was found on the way, and fixed

Three of these were pre-existing and none was in scope. Each is recorded because a reviewer
comparing the diff to the task list would otherwise have to work out why it is there.

| Found | What it was | Where |
|---|---|---|
| **`test-e2e` ran 5 of 15 spec files** while its comment said "everything" | 004's and 005's whole end-to-end suites — the identity journey, password recovery, saved sessions, notes, panel keyboard behaviour — **had never run in CI once**. Green and narrow, which is the silent-narrowing failure this codebase warns about | `.github/workflows/verify.yml`, now derived from the directory with an emptiness guard |
| **The seed had no production guard** | `seed/index.ts` has claimed since 002 that it never runs against real attendee data, and nothing enforced it. `seed()` opens with `DELETE FROM attendees`, which cascades to everything | `assertSeedableTarget`, plus `tests/unit/seed-target-guard.test.ts` |
| **`verify-push` asserted 6 checks to `verify`'s 11** | A merge was held to a lower standard than the pull request it came from, because five checks depended on per-pull-request resources. Those resources are gone | Both now assert the same ten |
| **`LIKE` read the reader's typing as a pattern** | Searching `%` returned the whole conference; `A_B` matched `AxB`. A bound parameter, so not a security hole — but not what anyone typed, and not diagnosable | `escapeLike` in `db/queries/directory.ts` |
| **A filter removed its own alternatives** | The filter options are derived from what is on screen. Derived from the *current page*, selecting "Designer" left "Designer" as the only role on offer — the reader could not switch, only clear and start again, and had to guess that. Found by the code-review gate | `Discover.tsx` accumulates what has been seen, resetting on conference switch; regression test in `discover-accessibility.test.tsx` |
| **Two unchecked label casts** | `INTENT_LABELS[value as keyof typeof INTENT_LABELS]` returns `undefined` for an unexpected value, which React renders as nothing — the field silently disappears from the card. The same class FR-497 spent seventeen removals on, reintroduced | `intentLabelFor` / `availabilityLabelFor` in `labels.ts`, narrowing by membership |
| **`migrations.test.ts` depended on another file having seeded the database** | It reads seeded rows but never seeds. Its constraint checks are `INSERT … SELECT … FROM registrations JOIN sessions … LIMIT 1`, which against an unseeded database insert **zero rows** — so no constraint fires and the assertion reports a *missing CHECK constraint* rather than an empty fixture. It passed only by luck of file ordering; 006's eight new integration files changed that order and **CI failed while the suite passed locally**, which is the whole point of having CI | `resetDatabase()` in all three `beforeAll`s, so the file is self-sufficient like every other. Verified against a fresh `postgres:17`: 35/35 in that file, 552/552 overall |
| **FR-459 was the one requirement nothing named** | It held structurally — avatars are resolved over rows the predicate already bounded — but nothing said so and nothing asserted it, so a later change resolving avatars from a separate query would have shipped a hidden attendee's face inside a response that omits their name | Named at its enforcement point in `routes/events/directory.ts`; asserted against real stored bytes in `directory-visibility.test.ts` |

Two more were **caught by this project's own structural guards**, which is them working rather than
findings: the route audit demanded a justified allow-list entry for `GET /ready` before it would go
green, and `isolation.test.ts` refused to pass until the directory listing was added to the set of
per-event routes it exercises.

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 (Setup) ─┬─> Phase 2 (Foundational) ─┬─> Phase 3 (US1, P1) ─┬─> Phase 5 (US2, P2)
                 │                            │                      └─> Phase 6 (US3, P3)
                 └─(T004–T006 only)──────────>└─> Phase 4 (US4, P1)
                                                          │
                                              Phase 7 (Polish) <──────────────┘
```

- **Phase 2 blocks everything.** Within it, **T008–T013 come first** — FR-497 is explicit, and doing
  the casts last means writing four more and deleting them.
- **Phase 3 and Phase 4 are independent.** Both are P1; neither reads anything the other produces.
- **Phase 5 and Phase 6 both depend on Phase 3** — US2 needs a card to open from, US3 needs the
  ranking query.
- **T004–T006 gate only T080 and T081.** Everything else proceeds without them.

### Story dependencies

| Story | Depends on | Independently testable |
|---|---|---|
| US1 (P1) | Phase 2 | Yes — the MVP |
| US4 (P1) | Phase 2; T004–T006 for the deploy tasks | Yes — entirely independent of Discover |
| US2 (P2) | US1 | Yes, by address |
| US3 (P3) | US1 | Yes, on Home alone |

### Parallel opportunities

- **T010–T012** — three disjoint sets of cast removals.
- **T014–T016** — three schema files. **T017 must follow all three**, since one generate emits one
  migration.
- **T027, T028, T029** — avatar tests and the repository interface touch nothing in common.
- **T035–T044** — every US1 test, across eight test files, no shared state.
- **T058a → T058b** is sequential (the fixture feeds the measurement); **T058c** is independent of both.
- **T059–T062** — every US4 test.
- **T067–T069, T069b, T072, T073** — the deploy tree splits cleanly by file. **T069a depends on
  T069**, since it guards the env files that task creates.
- **Phase 3 and Phase 4 in full**, by two people or two sessions.

---

## Parallel Example: User Story 1

```bash
# Tests first, all ten together — disjoint files, no shared fixtures:
T035 T036 T037 T038 T039 T040 T041 T042 T043 T044

# Then implementation. The API chain is sequential (query -> route -> registry -> contract):
T045 -> T046 -> T047 -> T048

# The client work parallelises once the contract exists:
T049 T050 | T053 T054 T055 | T057 T058
# and then converges:
T051 -> T052 -> T056
```

---

## Implementation Strategy

### MVP first

**Phase 1 (T001, T007) → Phase 2 → Phase 3.** That delivers a working directory with search,
filters, ranking, every required state, and its performance verified at the stated scale — the
capability the phase exists for — on a developer's machine. **56 tasks.**

### Then reachability

**Phase 4.** This is where the product becomes demonstrable to anyone else, and it is the half that
fails today: `fly.dev` and `pages.dev` are separate sites, so the session cookie is never sent and
sign-in cannot complete. T004–T006 must have landed.

### Then depth

**Phase 5, then Phase 6.** Both build on US1 and are small.

### If this proves too large for one pull request

The recommended split was **Phase 2's platform half plus Phase 4** as one change and **Phases 2–3, 5,
6** as another — recommended at brainstorm time and declined in favour of one PR. The seam still
exists if planning changes that judgement: Phase 4 shares no file with Phases 3, 5 or 6, and the only
coupling is Phase 2, which both need.

### Non-negotiable ordering

1. **T008–T013 before any other Phase 2 work** (FR-497).
2. **T017 after T014–T016**, and never a hand-edit under `migrations/meta/`.
3. **T001 before merge**, whatever else happens. Three departures, including a shipped requirement
   from 001.
