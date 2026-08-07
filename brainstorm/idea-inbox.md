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
