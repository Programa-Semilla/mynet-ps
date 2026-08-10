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

### throttle-clock-provenance

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: The throttle mixes two clocks — attempt rows are stamped by the database's `now()`,
  while the window and the served delay are computed from the API process's clock.

> Not a bug with NTP-synced hosts, but the delay calculation rests on the two timestamps being
> comparable and nothing in the code establishes that. Either stamp from the application clock at
> insert time, or move the whole computation into SQL.

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

### verification-proves-reachability-not-ownership

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/004-attendee-identity-and-profile
- **Summary**: Signing up with an address you do not own, then having the victim click the link, verifies the *attacker's* account — while FR-303's disclosure has told the victim the address is already taken, so they cannot register it themselves.

> FR-325a and SC-304a rest the whole defence of this on verification, and the code implements verification exactly as specified — the residual is in the threat model rather than the implementation. The mitigation is copy the product does not have: `MailService` takes only `to` and `link`, so nothing in the message can warn a recipient that clicking confirms an account they did not create, and there is no path for a non-owner to contest an address. Intersects register entry 19 (nobody moderates the product) and is cheapest to settle before the first publicly reachable preview.

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

### directory-listing-throttle

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: feat/006-discover-and-deployment-platform
- **Summary**: The directory listing carries no rate limit, so anyone who self-signs-up and enters a world-readable join code can harvest a whole conference at 100 rows per request.

> FR-404 deliberately concedes that a listing discloses the discoverable-and-verified set — but what it concedes to a human browsing is not what it concedes to a machine collecting 1,000 names, employers, roles, headlines, interests and faces in ten cheap keyset-paged requests. The join route already carries its own per-action counter, so the mechanism exists.

### backups-share-a-failure-domain

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: feat/006-discover-and-deployment-platform
- **Summary**: Every backup artifact stays on the same VM and disk as the live database, so the most likely event a daily backup is kept for destroys the database and all seven artifacts together.

> Standing decision 17 made backups a governance obligation precisely because no vendor is doing it. The schedule and the written retention period are discharged; the purpose is only partly. Closing it means an off-host copy after the verification gate and before pruning, with local pruning conditional on a confirmed remote copy.

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

### read-path-unthrottled

- **Source**: deep-review
- **Date**: 2026-08-08
- **Reference**: feat/007-messages-and-notification-delivery
- **Summary**: The poll interval is entirely client-controlled and the server bounds nothing. The throttle is wired to the two write routes only; the message-page read has no throttle, no cache header and no minimum interval.

> Spec open question 6 left "what the poll costs on a phone at a venue" open. The client-side half was answered — it stops when the tab is hidden and when no thread is open — and the server-side half was not. In a product with public self sign-up, one modified client can consume the box's read capacity, and a future feature could shorten the interval without anyone seeing the server-side cost. Either add a `read`-class throttle action configured `mayDeny: false` and keyed on the attendee, or record explicitly that read frequency is deliberately unbounded so the next feature inherits it as a choice.

### vapid-config-duplication

- **Source**: deep-review
- **Date**: 2026-08-08
- **Reference**: feat/007-messages-and-notification-delivery
- **Summary**: Two of the four server-side `push` config members exist only to police each other. `PUSH_VAPID_SUBJECT` is read by nothing, and the API's `PUSH_VAPID_PUBLIC_KEY` is a second copy of a value the client reads from its own `VITE_` variable.

> Not a defect while the sink adapter is the only implementation — reserving the VAPID triple is a reasonable hedge for register entry 20. Worth settling when the real adapter lands: confirm it reads all three, and decide whether the API should *serve* the public key to the client rather than having it duplicated across two environment variables that nothing checks agree. Two sources for one key is the drift this codebase refuses elsewhere.

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

### unverified-accounts-can-share-a-card

- **Source**: deep-review
- **Date**: 2026-08-10
- **Reference**: feat/008-network-and-appointments
- **Summary**: `shareCard` requires the **recipient** to be discoverable and verified, but places no verification requirement on the **sharer** — whose profile the row makes permanently readable.

> The project invariant is that "verification gates exactly one thing: discoverability, so any profile that can be read already carries a verified address". Card resolution deliberately omits the verification condition (FR-613), which is correct *if* a card could only have been created by a verified attendee — and nothing establishes that. An account created with an address its holder does not control can join by code, share its card, and install a live-resolving profile bearing a chosen name and face into a verified attendee's Network, irrevocably (FR-618). Note this would be a check on the **actor at write time**, so it does not conflict with FR-612/FR-613, which govern read-time resolution. Decide whether the invariant is meant to hold here.

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
