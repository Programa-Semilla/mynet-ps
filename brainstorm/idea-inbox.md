# Idea Inbox

Seeds for future brainstorming: ideas captured from code reviews, and the next phase from the
delivery queue in `brainstorm/00-overview.md`.

An entry is removed once a brainstorm document has been written from it.

### session-topology-and-csrf

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: The preview deploys client and API to different registrable domains, so a
  `SameSite=Lax` session cookie will not be sent and the preview cannot sign in. Choosing
  `SameSite=None` instead would remove the only CSRF defence.

> The topology decision and the CSRF defence are the same decision. Serving the API under the
> same registrable domain keeps `Lax` valid; anything else needs a synchroniser token at the same
> commit. Worth settling before the first preview is opened rather than after.

### security-response-headers

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: No Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS
  on either the client or the API.

> HttpOnly rules out token exfiltration via XSS but not an injected script issuing authenticated
> same-origin requests and reading every attendee's own data. CSP is the layer that would. The
> `connect-src` value depends on the API topology, so this and the topology decision belong
> together.

### production-deployment-path

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: The pipeline proves a change can reach a throwaway environment and nothing about
  reaching a durable one — no production job, no environment protection, no rollback path.

> Where production lives, how migrations gate on it, whether `main` deploys automatically or on a
> tag, and how a bad deploy is reversed are cheapest to decide while `fly.toml` and the Dockerfile
> are still under review, and most expensive to retrofit once real attendee data exists.

### readiness-versus-liveness

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: `/health` returns ok without touching any dependency, so a deploy with a revoked
  database URL passes every check and then fails every request.

> Deliberate for now — an unauthenticated endpoint should not perform reconnaissance, and
> readiness is spec Open Question 20. When that question is settled, a separate `/ready` running
> `select 1` is the shape; an interim measure is to connect once at boot so a broken deploy fails
> rather than starts.

### substitutability-proven-without-the-application

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: The device substitution tests never run any application code — they compare method
  names and then call the doubles directly.

> User Story 5's independent test says "substitute a double, confirm the application runs and the
> substitution takes effect". Same-method-names is not that. One component test mounting a real
> consumer through the registry with doubles installed would close the gap.


### platform-registry-structural-typing

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: The platform registry types every repository as `Promise<unknown>` to avoid depending on `@mynet/data`. Six unchecked casts now sit in production code, growing two or three per feature.

> It reopens on the client the contract drift that `packages/data/src/contract.ts` prevents on the server. A type-only import, or making `PlatformServices` generic over a repository map, would keep the packages independent without the casts.


### seed-production-guard

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: `pnpm db:seed` deletes every attendee and re-inserts two accounts with a committed password. The file states it never runs against real data; nothing enforces that, and the real environment beats any `.env`.

> A `nodeEnv !== 'production'` check plus an explicit opt-in, with the resolved database host in the error, costs nothing and removes a one-command path to deleting production attendee data. Pre-existing, surfaced by 002's review.


### audit-cannot-see-ref-schemas

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: The route audit's conference-identifier scan recurses through body, querystring and params, but a `$ref` to a shared schema defeats any structural scan.

> The moment `app.addSchema` is used for shared shapes — which the duplicated `eventIdParam` blocks already invite — the audit silently narrows. Resolving refs via `app.getSchemas()`, or failing any route whose schema uses `$ref`, keeps the gate honest.


### integration-test-isolation-coupling

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: Two integration files cache event ids and cookies in `beforeAll` while a third mutates event dates in `beforeEach`. This is correct only because `fileParallelism` is false and the seed regenerates every UUID.

> Either condition changing alone would break the cached files with confusing 404s rather than a message naming the cause. The coupling is implicit and worth making explicit before the suite grows.

### platform-registry-mirroring-cost

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: `PlatformServices.repositories` hand-mirrors each repository interface with `unknown` returns so `@mynet/platform` need not depend on `@mynet/data`. 004 added fifteen methods under that scheme and six `as` casts in feature code.

> 004 followed the established convention correctly, so this is not a defect. It is worth recording because the cost is now visible: a second declaration of every repository's method list that the compiler does not check against the first, and one call site re-declaring a result shape inline rather than importing it. The dependency being avoided is a *type-only* one, which `import type` erases entirely at build time — so a devDependency plus `import type` would delete every cast and leave the runtime graph unchanged. 006 through 009 each add a repository under the same rule.

### identity-repository-spans-two-subjects

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: `IdentityRepository` carries `joinConference` and `withdrawFromConference` while the read side of the same concept, `listRegistered`, lives on `EventsRepository` — so a component that lists-and-leaves holds both repositories.

> The placement is defensible while registration is a lifecycle event, and the interface's own framing ("becoming an attendee, recovering an account, and leaving") is coherent. Worth noting because the interface now spans two subjects — account credentials and event membership — and 006's directory plus 008's appointments will both want registration-shaped reads. If a third registration verb appears, consider a `RegistrationRepository`; the per-domain interface split makes that a new file plus one line.

### join-code-lookup-cannot-use-its-index

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: `joinConference` matches on `lower(btrim(e.join_code))`, but `events_join_code_unique` indexes the raw column, so the lookup cannot use it and sequentially scans `events`.

> Not a defect today: `events` is seeded conference content and will hold a handful of rows for the foreseeable future. Recorded because the normalisation choice is deliberate and permanent while the index that would serve it does not exist — if the events table ever grows (multi-tenant, historical conferences retained), this becomes an unindexed scan on an attacker-driven route. A functional expression index on `lower(btrim(join_code))` would make it a seek and would also align the uniqueness constraint with the comparison semantics the code actually uses.

### avatar-serving-has-no-revalidation-story

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: Avatar bytes are served as base64 inside JSON with no `cache-control`, no `ETag` and no conditional-request handling, and the client refetches on every mount into a `data:` URL the browser cannot cache.

> Harmless at one avatar per profile page. It becomes load-bearing in 006, which is the feature that consumes the co-attendee avatar route for a directory — N base64-inflated round trips per listing render, each a `stored_objects` read plus the full three-condition visibility query, with nothing the browser can revalidate. The base64-over-JSON decision itself is well argued and is not what is in question; the missing revalidation story is. Worth deciding while the only consumer is a single-avatar page: an `ETag` plus `cache-control: private, max-age=0, must-revalidate` keeps the visibility check server-side on every request while making the repeat cost a 304.

### dialog-component-tests-cannot-see-modality

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: Every component query for the deletion confirmation uses `getByRole('dialog', { hidden: true })`, which proves the component mounted the dialog but not that `showModal()` ran or that it is `open`.

> Informational rather than a defect: the real guarantees — visible dialog, Escape dismissal, focus restoration to the opener — are correctly proved in a browser by the e2e accessibility and journey specs, and `tests/setup.ts` documents at length why the jsdom shim must not be trusted for modality. Worth revisiting because 005's session-panel component tests asserted the shim's `data-modal` marker to distinguish `showModal` from `show`, and 004's dialog — the more consequential one, since it guards account deletion — does not.

### unbounded-directory-accumulation

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: feat/006-discover-and-deployment-platform
- **Summary**: The rendered directory list grows without a ceiling, each entry carrying an inline base64 avatar, with no virtualisation.

> At FR-401c's stated 1,000 attendees a reader who pages to the end holds megabytes of base64 plus a thousand decoded bitmaps and DOM subtrees, on a phone at a venue. The explicit "Show more" control makes this degrade gradually rather than at once. FR-466 forbids caching, not windowing, so trimming the retained list is available and the keyset cursor makes it recoverable.

### read-path-avatar-repair-yagni

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: feat/006-discover-and-deployment-platform
- **Summary**: The directory's read-path avatar repair decodes an image and writes to storage during a GET, for a case its own comment says does not exist.

> The comment states there is no production avatar to backfill because the product has never been deployed, and that the repair exists only for a developer whose database predates the change — who is equally served by re-running the seed. It is now concurrency-bounded, but it remains a request path that mutates storage, which contradicts the upload-time decision recorded beside it.

### session-write-per-request

- **Source**: deep-review
- **Date**: 2026-08-08
- **Reference**: feat/007-messages-and-notification-delivery
- **Summary**: `requireAttendee` issues an unconditional `UPDATE auth_sessions` on every authenticated request. 007's three-second thread poll turns that into roughly twenty row writes per minute per attendee with a thread open.

> Pre-existing 001/004 infrastructure that this feature made hot rather than a defect it introduced, which is why it was not fixed in 007's review loop. On a burstable Standard_B2s with a loopback PostgreSQL sharing two vCPUs, each write is also a dead tuple on a narrow hot table plus a WAL record. The shape that preserves the semantics is a refresh threshold — write only when the session is materially stale, several minutes inside the idle window — which drops the rate by two orders of magnitude and changes nothing an attendee can observe. Changing session-expiry behaviour is an owner decision.

### proposer-cannot-withdraw-a-proposal

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: A pending proposal consumes the proposer's own slot, and there is no product action that releases it. Propose to somebody who never opens the app and the slot is gone for that conference day, until the instant passes and it derives to `lapsed`.

> Consistent with the spec as written — FR-632 names only *confirmed* appointments as cancellable — so this is not a defect against requirements. It is a reachable dead end in the state machine, and the asymmetry it creates is the reverse of the one FR-633 argues for: a slot should return to whoever it was unavailable to, and here the only party it was ever unavailable to has no way to release it. The client makes it visible without making it actionable ("Waiting for X to answer", no control). Candidate shapes: a `withdraw` transition (pending → cancelled, proposer only), or a proposal expiry shorter than the slot instant. Both amend FR-632, so both need a decision rather than an implementation.

### card-read-surfaces-without-consumers

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: `CardRepository.getHeld` and `listShared`, and the routes behind them, have no product consumer. `GET /cards/held/:attendeeId` is the only route `requireHeldCard` guards — so a third branded scope, a third route audit and a WeakSet exist to protect one route nothing calls.

> Arguably the right call: the branded scope is what makes adding a card-named route later safe by default, and the argument for a third module rather than a widened second is sound. Worth making it a recorded decision rather than an accident of building the full interface before its surfaces. Two questions attach to it. Should `listShared` get a surface? FR-618 makes a card irrevocable, and an attendee currently cannot see what they have irrevocably given away — a "cards you have given" view is the natural counterpart to that honesty argument. And should `getHeld` exist at all if the contacts list is the only entry point?

### proposing-requires-no-relationship

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: Any co-attendee holding an attendee's identifier can propose a meeting — writing an attacker-chosen topic string plus their identity into a stranger's Network, and obtaining a durable live read of that stranger's display name — including after the target has turned discoverability off.

> This is what the spec asks for: its Assumptions say scheduling does not require holding a card, and User Story 3 is "From a contact or a profile". So it is a scope question rather than a defect, and the fix the review agents proposed (require a held card) would contradict the spec. The narrower options are worth weighing: require the invitee to be *discoverable* at propose time, as `shareCard` already does for its recipient — which preserves proposing from a Discover profile while closing the path for somebody who has chosen to be invisible; or accept it and record why. Bounded today by the `appointment_propose` throttle and by co-attendance.

### appointments-cache-holds-another-attendees-name

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: The cached appointments list is justified at the composition root as "the attendee's own commitments", but each row carries the counterpart's display name, which is written to device storage with a 24-hour age-based lifetime.

> The contacts list one member over refuses caching for precisely this reason, in the same file, in the same commit — "a cached contact is a second copy of somebody else's name, company, role and face ageing on this device". The avatar has since been removed from the payload, so what remains is a name rather than a face, and the trade may well be right. It was not consciously made: the declared justification does not mention the third-party field at all. Either state it explicitly or resolve the counterpart live and fall back to initials offline.

### unbounded-contacts-list

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: `GET /cards/held` has no limit, no cursor and no server-side cap, and embeds a base64 avatar per row. Response size is a pure function of how many people have shared a card with the reader.

> The spec justifies it as "bounded by deliberate human acts", which bounds the *rate* — each row needs another attendee's act, and `card_share` is throttled — but places no ceiling on the *total*, which accumulates across every conference forever and can never be deleted (FR-618, cross-event by design). Fine at the 10–50 contacts a realistic attendee accumulates in a year; at 500 it is roughly 1.5–2.5 MB on the wire and 500 image buffers held per concurrent request on a two-vCPU VM. It degrades with no warning and no back-pressure, and the failure mode is the Network landing view timing out rather than paging. Worth deciding the ceiling deliberately — even a documented `LIMIT` makes the tail a product decision rather than an outage.

### unpaginated-list-returned-per-write

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: spec/009-session-qa
- **Summary**: Every Q&A write returns the whole unpaginated question list, so the cost of the list is paid per *action* rather than per page view — at a 1,000-attendee keynote each upvote re-aggregates every vote on the session and ships every question body back.

> FR-732 makes the *read* deliberately unpaginated, and research R5 makes every write answer with the list so the reader's own action lands without a second round trip. Both are right on their own; together they multiply. The indexes all serve the query correctly — this is a shape question, not an indexing one. Worth revisiting with a server-side cap after the ORDER BY, or `bool_or` in place of the correlated EXISTS, if a real conference ever produces a long list.

### throttle-writes-dominate-sign-in-attempts

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: spec/009-session-qa
- **Summary**: Upvoting made `sign_in_attempts` — a table built for rare authentication events with a two-hour sweep — the product's highest-volume write path, since every vote writes an attempt row whatever the outcome.

> Nothing breaks at the specified scale, and the table stays bounded. But the sweep interval equals the retention margin, so peak residency is three hours rather than two, and the sweep's DELETE cannot use either index (both lead with `action`). If it is ever worth reducing: an index on `occurred_at`, or moving idempotent per-actor counters off a table whose row-per-attempt shape exists to reconstruct failure *streaks*.

### question-row-rerenders-whole-list

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: spec/009-session-qa
- **Summary**: `useSessionQuestions` returns a fresh object each render and it is passed whole into every row, so any vote re-renders every row and `React.memo` on a row could never hit.

> Invisible at test sizes; shows up as upvote lag on a mid-range phone at a keynote, which is exactly the scenario the feature is for. Passing only the two stable callbacks each row uses would make memoisation possible without touching FR-780's key-stability reasoning.

### withdrawal-confirmation-has-no-pending-state

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: spec/009-session-qa
- **Summary**: The withdrawal confirmation is the only one of seven `ConfirmDialog` call sites passing a literal `confirming={false}`; it closes before the request resolves, so the dialog's "Working…" state and double-activation guard are dead code on that path.

> Withdrawal is the one action with a documented server-side race (FR-714), so it is the call site where a pending state would matter most: the dialog closes, the request may then be refused because a vote arrived, and the explanation surfaces away from the control that produced it.

### create-conference-404s-three-unrelated-causes

- **Source**: deep-review
- **Date**: 2026-08-12
- **Reference**: spec/014-conference-content-authoring
- **Summary**: `createConference` reports join-code exhaustion, "no live platform operator exists for `assigned_by`", and an impossible empty insert as the same `refused('not-found')` → 404 "That is not available."

> Two of the three are real and neither is about the caller. An unseeded or fully-deactivated operator table is a misconfiguration somebody must act on, and a bounded retry loop that gives up is the case whose own header argues it should "fail loudly rather than spinning" — a 404 indistinguishable from an authorisation refusal is the quietest failure available.

### self-assignment-names-an-uninvolved-operator

- **Source**: deep-review
- **Date**: 2026-08-12
- **Reference**: spec/014-conference-content-authoring
- **Summary**: A creating organizer's self-assignment sets `assigned_by` to the first non-deactivated operator, who took no part in the grant — so `organizer_assignments` records a grant that never happened, and the compensating record is the audit trail FR-999 forbids reading. Separately, `requireOperator` admits anyone holding *any* live assignment.

> Two consequences worth deciding rather than inheriting. The column's own schema comment says it means "the platform operator who granted this (FR-933)", and it now means two different things depending on which write produced the row, with nothing distinguishing them. And because creating mints a fresh live assignment while revocation is per-conference and manual, an organizer being wound down can keep administrative access alive by creating conferences — v5.2.0's N3 accepted "bounded by trust" for how many, but does not appear to have weighed demotion resistance.

### roster-read-unaudited

- **Source**: deep-review
- **Date**: 2026-08-15
- **Reference**: spec/014-conference-content-authoring-tranche-2
- **Summary**: Reading the enrolment roster — the first administrative read of attendee personal data, the fourth Principle VIII exception — writes no audit entry, and the `admin_audit_entries_action_valid` CHECK carries no roster-read action, so the trail could not record it even if a later change wanted to.

> 013 set the precedent this diverges from: reading the report *queue* (no content) is unaudited, but reading one report — the disclosure moment — writes `disclose_report_content` in the same transaction. The roster read is the analogous disclosure moment for the fourth exception, and as shipped an authorized principal can enumerate every roster repeatedly with no record. The spec is silent on it, so this may be the design — the attendee consented before enrolling (FR-1074) — but the asymmetry with 013's precedent is undocumented, and it should be either an audit action or a recorded reason, decided rather than inherited.

### held-retired-sector-chooser-dead-end

- **Source**: deep-review
- **Date**: 2026-08-15
- **Reference**: spec/014-conference-content-authoring-tranche-2
- **Summary**: An attendee holding a retired sector cannot add a live subsector of it in `ProfileEdit` — `selectedSectorId` resolves only from choosable sectors, so the chooser filters to empty — although the server explicitly permits the write and `readChoosableVocabulary` keeps those subsectors on the wire specifically for this flow.

> Two server comments describe a client flow the client cannot reach: the subsectors are delivered and can never be shown, and the empty-state text ("No subsectors of X are defined yet") is misleading when X is retired-but-held. The fix needs the choosable payload to carry the held sector's id↔label mapping (or subsector rows to carry their parent's label), which is a wire-shape change — worth a small decision rather than a quiet patch.
