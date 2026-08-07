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

### interface-evolution-for-offline-data

- **Source**: deep-review
- **Date**: 2026-08-05
- **Reference**: spec/production-foundation
- **Summary**: API responses are never cached, which makes offline behaviour honest but means
  offline shows nothing but the shell.

> The moment a slice wants an agenda readable on a conference floor with no signal, this becomes a
> staleness decision rather than a caching one — what may be shown, how old it may be, and how the
> attendee is told. The constitution already requires a recorded decision for optimistic updates
> and conflict resolution; this is the same conversation arriving from the offline side.

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


### home-card-duplicate-reads

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: Up next and Rest of your day each fetch the whole programme, because FR-164 forbids a card depending on another card's data. Transport-level coalescing collapses the duplicate wire request but not the duplicate parse and sort.

> This is the composition contract's first real cost, and it grows with each conference-scoped card. Worth deciding before 005 adds saved state to the same dataset — a shared query layer would keep cards independent while collapsing the work, not just the request.


### destination-owns-its-element

- **Source**: deep-review
- **Date**: 2026-08-07
- **Reference**: spec/002-event-context-and-catalog
- **Summary**: The router special-cases Agenda with a literal `destination.path === '/agenda'`, beside the destination list that exists precisely to avoid literal addresses. Four later features will each add a branch.

> Moving an optional `element` onto the `Destination` entry would turn each of those into an append to a feature's own line, matching how Home cards, routes, seed modules and repository interfaces already work.


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
