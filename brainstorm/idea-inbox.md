# Idea Inbox

Seeds for future brainstorming: ideas captured from code reviews, and the next phase from the
delivery queue in `brainstorm/00-overview.md`.

An entry is removed once a brainstorm document has been written from it.

### phase-002-event-context-and-home-composition

- **Source**: delivery roadmap
- **Date**: 2026-08-06
- **Reference**: `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`
- **Summary**: The next phase in the delivery queue, and the one everything else waits on. Makes
  the active event durable per-attendee state, establishes the per-event scoping predicate
  server-side, puts the event switcher at all three widths, derives "day N of M" from the event
  dates and the clock, and defines the Home card composition contract.

> Most of this phase's design time belongs to the card contract rather than to the switcher. Seven
> later phases build against it: what a card may assume about the active event, how it loads and
> fails without taking Home down with it, and what it is forbidden from doing. The phase also
> performs the interface, route, and seed splits into per-domain files that make the roadmap's
> three parallel pairs possible. None of it has a cheap correction once inherited.

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
