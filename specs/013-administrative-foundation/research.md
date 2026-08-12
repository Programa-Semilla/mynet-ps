# Research: 013 Administrative Foundation

**Phase 0 output.** Each entry is a decision, why it was taken, and what else was weighed. Nothing
here is a requirement — requirements are in `spec.md`. Where a decision contradicts an existing
comment or convention in the codebase, that is called out so the implementing change can correct it
rather than leave two statements standing.

---

## R1 — Where the administrative client lives

**Decision**: A new workspace app, `apps/admin`, alongside `apps/web`.

**Rationale**: FR-920 requires a separate application that reuses none of MyNet's five destinations,
Home card registry, or navigation contract. A second entry point inside `apps/web` would share the
Vite config, the PWA plugin, the service-worker registration in `main.tsx`, and the router — every
one of which FR-923 requires the admin site *not* to have. Separating at the app boundary makes the
absence structural rather than configured: there is no manifest to exclude and no worker to
un-register, because the app that has them is a different app.

It also keeps FR-970's absence testable by directory. An assertion that `apps/web/src` contains no
administrative route is meaningless if administrative routes live in the same tree behind a flag.

**Alternatives considered**:
- *Second entry in `apps/web`* — rejected above. The PWA plugin operates per Vite config, so
  `injectManifest` would have to learn about a second entry that must not be precached, which is
  exactly the class of configuration 010 found fails silently.
- *A route prefix inside MyNet* — rejected by FR-920 and by standing decision 33.

**Shares**: `packages/config` (TypeScript and Vitest bases), `packages/data` (contract types),
`packages/platform` (only if a capability is genuinely needed — see R9), and `theme/tokens.css` plus
the 010 brand assets per FR-921.

---

## R2 — Serving the administrative origin

**Decision**: A second Caddy site block for `admin.{$APP_DOMAIN}`, serving the built `apps/admin`
and reverse-proxying `/api/*` to the **same** `api:3000` container.

**Rationale**: `deploy/vm/Caddyfile` already parameterises the host as `{$APP_DOMAIN}` and terminates
TLS automatically, so a second block is configuration rather than infrastructure — one more
certificate, obtained the same way. One API process serves both origins, which keeps a single
database pool, a single migration path, and a single contract.

FR-910 is satisfied because each origin serves its own client *and* its own `/api/*`: an
administrative request never crosses an origin, so `connect-src 'self'` stays literally true on both
sites. This is the property standing decision 19 exists to protect, and it is satisfied twice rather
than bent once.

**Alternatives considered**:
- *A second API process* — rejected. It buys process isolation nobody asked for and costs a second
  deployment unit, a second pool against a loopback-only database, and a divergence risk in shared
  guards.
- *Admin client served by the API* — rejected. Caddy already serves static assets for MyNet; a
  second pattern for the same job is drift.

**Consequence for the runbook**: `deploy/vm/README.md` gains the admin host, and both `uat` and
`prod` need a second A record. **This lands on the same blocker the whole deployment does** — no
domain is registered — so it is written and unexercised, exactly as the rest of `deploy/vm/` is.

---

## R3 — Administrative session storage

**Decision**: A new `operator_sessions` table. **Not** `auth_sessions` with a subject discriminator.

**Rationale**: `auth_sessions.attendee_id` is `NOT NULL` with `ON DELETE CASCADE` to `attendees`. A
platform operator has no `attendees` row (FR-903), so reusing the table means making that column
nullable and adding a second nullable operator column plus a check constraint — which converts a
table with one clear invariant into one with a discriminated union. Every existing query against it
would then be correct only by accident of the discriminator.

The two also have genuinely different lifetimes now: FR-919a gives administrative sessions a shorter
idle window **and** an absolute cap, where `auth_sessions` has an idle window alone
(`AUTH_SESSION_IDLE_DAYS`, default 14). Two lifetime policies in one table is two behaviours behind
one name.

**Alternatives considered**:
- *Reuse `auth_sessions`* — rejected above.
- *Stateless signed tokens* — rejected. Revocation is required (FR-908 deactivation must end access
  *immediately*), and a stateless token cannot be revoked without a store, which is the table again.

**Note on the conference-organizer case**: an organizer authenticates with attendee credentials
(FR-914) but receives an **`operator_sessions` row**, not an `auth_sessions` row. The session is
administrative regardless of which credential opened it — that is what makes FR-912's independence
true, and it is why the table's subject column must accommodate both an operator and an attendee.

---

## R4 — Two credential sources without an enumeration oracle

**Decision**: One sign-in route. It resolves the address against **one** uniqueness domain (FR-918),
so at most one principal can match; the tier follows from which store held it. Every failure —
unknown address, wrong password, unpromoted attendee, deactivated operator, unreplaced initial
credential presented to a non-bootstrap route — returns the **same** refusal, with the same shape
and a comparable cost.

**Rationale**: FR-918 is what makes this tractable. Without product-wide address uniqueness the route
would have to try two stores and branch, and the branch is observable. With it, the lookup is a
single resolution and the two stores are an implementation detail of that resolution.

This inherits 004's existing discipline: the sign-in path already refuses indistinguishably across
unknown-address and wrong-password, and the same password verification must run on a miss so the
timing does not answer the question the response refuses to.

**Alternatives considered**:
- *Separate operator and organizer sign-in routes* — rejected. Two addresses is itself the oracle:
  which route accepts you discloses your tier before you authenticate.
- *A tier selector on the form* — rejected for the same reason, plus it asks the user to know
  something the system knows.

**Throttling**: `admin_sign_in` is a **new** throttle action (FR-916), configured `mayDeny: false`
on the constitution's standing reasoning — an identifier-keyed denial only ever harms the victim,
and here the victim is the person who can moderate.

---

## R5 — A fourth branded scope, and a fourth route audit

**Decision**: Yes to both. A branded `OperatorScope` constructed only by `requireOperator`, a
`PlatformScope` refinement for platform-tier-only routes, and a fourth route audit,
`operator-audit.test.ts`.

**Rationale**: This is the trap 007 and 008 each hit, and the reasoning is now three features deep.
`event-scope-audit` examines a route **only if it declares an event parameter and reports success
otherwise** — so `/admin/reports`, `/admin/operators` and `/admin/promotions` name no conference and
the existing audit walks straight past them. 007 met this with `ConversationScope` and a second
audit; 008 met it with `CardScope` and a third. 009 did **not** need one, because a question always
belongs to a session and therefore to exactly one event.

013 is not 009's case. Most administrative routes are genuinely conference-less, and the ones that
are not — an organizer acting on an assigned conference — need a predicate the event scope cannot
express: *this caller holds an assignment for this conference*, which is directional in the same way
`requireHeldCard` is.

**Two tiers means two predicates**, and conflating them is the failure mode worth naming: a single
`requireOperator` that returns a tier field invites `if (tier === 'platform')` scattered through
handlers. The branded refinement makes platform-only routes fail to typecheck without the stronger
guard, which is what FR-906 needs in order not to be a convention.

**Alternatives considered**:
- *Widen `event-scope-audit`* — rejected for the reason 008 recorded when it declined to widen
  `participation-audit`: a guard that covers three unrelated predicates stops being readable, and
  the failure mode of all three is silence.
- *No branded scope, just a Fastify preHandler* — rejected. The brand is what stops a handler
  reading `request.operator` without a guard having run; a preHandler alone is a convention that the
  next route can forget.

---

## R6 — Audit trail shape, and pseudonymisation mechanics

**Decision**: An `admin_audit_entries` table: acting operator, action, subject type, **nullable**
subject attendee id, nullable subject resource id, and the instant. Pseudonymisation is `UPDATE …
SET subject_attendee_id = NULL` inside the account-deletion transaction. Retention is a new
`RETENTION_SWEEPS` entry.

**Rationale**: FR-997a requires the attendee identifier cleared and the operator's act retained, and
FR-997b explicitly forbids a soft-delete flag or a sentinel row. A nullable column set to `NULL` is
neither: there is no row that means "deleted attendee", and nothing is reconstructible.

The subject id must be a **plain column, not a foreign key** — the same shape and the same reason as
`abuse_reports`' reported-message array. A real FK leaves only bad options: `CASCADE` destroys the
operator's accountability record, `RESTRICT` blocks a deletion the erasure right requires, and
`SET NULL` would work but couples the retention decision to a constraint rather than to a written
rule. 007 reached the identical conclusion for the identical reason, and this is now a pattern.

**Two rules govern one table and they must not be confused**: the deletion cascade does not reach
this table at all (by design), and pseudonymisation is an explicit statement in
`deleteAccount`, not a database behaviour. `deletion-coverage.test.ts` derives from the schema and
**will fail by existing** when this table appears; the allow-list entry must record the
pseudonymisation-plus-clock rule, not merely assert an exemption.

**Alternatives considered**:
- *Append a pseudonymisation row rather than updating* — rejected. FR-996's append-only rule governs
  *administrative* writes; the erasure obligation is a data-protection act, and a trail that records
  "attendee X was erased" defeats the erasure.
- *Hash the attendee id instead of clearing it* — rejected. A hash of a UUID from a known set is
  reversible by enumeration, so it would be a tombstone wearing a disguise.

---

## R7 — Question removal against 009's schema and guards

**Decision**: Hard delete of the `questions` row, relying on 009's existing cascade from `questions`
to `question_votes`. `qa-absences.test.ts` is amended to permit exactly one moderation route, in
`apps/admin`-facing API surface, and to continue forbidding answer, pin, edit and downvote.

**Rationale**: FR-951 requires every vote on a removed question to go with it, and 009 already built
that cascade for withdrawal — standing decision 28, *"a departing attendee's questions go, and
everybody's votes on them go too"*. The mechanism exists; only the actor is new. A soft delete would
contradict Principle VIII's no-tombstone rule and would leave a row that `listQuestions` must learn
to exclude, which is a second source of truth for visibility.

**The guard amendment is the delicate part.** `qa-absences.test.ts` strips comments before matching,
because every forbidden pattern also appears in the prose explaining the absence — 009 recorded that
the natural repair is to weaken the pattern until it checks nothing. The amendment must therefore
**narrow by path**, permitting a moderation route only under the administrative prefix, rather than
loosening the pattern that catches moderation routes generally.

**Race**: 009's withdrawal path takes `SELECT … FOR UPDATE` on the question row so a vote arriving
mid-withdrawal blocks. Removal must take the same lock for the same reason, and the edge case
"a question is removed while an attendee is voting on it" is exactly what it closes.

---

## R8 — Administrative session bounds

**Decision**: Two new configuration values —
`ADMIN_SESSION_IDLE_MINUTES` and `ADMIN_SESSION_ABSOLUTE_HOURS` — both required, both validated at
boot by the existing `config.ts` pattern. The absolute cap is stored as a column on the session row
at establishment (`absolute_expires_at`), not computed from `created_at` at read time.

**Rationale**: FR-919a demands both bounds be stated explicitly rather than inherited. Attendee
sessions today are idle-only at 14 days and have **no absolute cap at all**, so this is a new
mechanism rather than a re-tuning, and reusing `AUTH_SESSION_IDLE_DAYS` would silently apply
reasoning written for a person on their own phone at a venue.

Storing the cap rather than deriving it means a configuration change does not retroactively extend or
truncate live sessions — the value that applied when a session opened is the value that governs it.
This differs deliberately from 008's `lapsed`, which is derived precisely because it must track the
current slot grid.

**Session-write cost**: the idea inbox records `session-write-per-request` — `requireAttendee`
issues an unconditional `UPDATE` per request, and 007's poll made it hot. Administrative sessions are
few and unpolled, so the same shape is acceptable here; the entry is noted rather than closed, and
this feature must not be read as having addressed it.

---

## R9 — Admin client build, CSP, and keeping the service worker out

**Decision**: `apps/admin` uses Vite with **no** `vite-plugin-pwa`, no manifest, no icons beyond the
favicon, and no service-worker registration. Its Caddy block sets its own security headers.

**Rationale**: FR-923 is an absence, and R1 makes it structural. The one thing that needs active care
is that `apps/admin` must not import `main.tsx`'s registration path from `apps/web` — a shared
bootstrap module would re-introduce the worker by reuse. A unit assertion over `apps/admin/src` for
the absence of `serviceWorker` and `registerSW` is the cheap guard, in the shape 007 used to assert
`requestPermission` has exactly one caller.

**Platform capabilities**: the admin client needs **none** of the seven device capabilities. It has
no camera, no notifications, no contact sharing, no calendar, no connectivity banner (FR-923 removes
the offline story that would need one), and no visibility-driven polling. It therefore does **not**
take a `packages/platform` dependency, and `substitution.test.ts` is untouched. Recorded because the
opposite — adding an eighth capability quietly — is the failure mode Principle V's history warns
about.

**The two long-parked inbox entries land here.** `security-response-headers` (no CSP,
`X-Content-Type-Options`, `Referrer-Policy` or HSTS on either client) and `session-topology-and-csrf`
have been filed since 2026-08-05 as "cheapest to settle before the first environment is opened".
013 settles the topology half by decision (R2). The headers half is **not** in this feature's scope
and must not be silently absorbed: adding a CSP to the admin block alone would leave MyNet without
one and make the inbox entry read as closed.

---

## R10 — Seed and credential bootstrap

**Decision**: The seed inserts operator **identities** with a null credential. Two new environment
variables per operator-bootstrap (`ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`) are consumed
by a separate, explicitly-invoked step — not by `pnpm db:seed`. A null credential means sign-in is
impossible for that row.

**Rationale**: FR-990 forbids a committed credential and FR-991 forbids a default. Keeping the
bootstrap out of `db:seed` matters because of what `db:seed` already is: the inbox entry
`seed-production-guard` records that it *"deletes every attendee and re-inserts two accounts with a
committed password"*, and that *"the file states it never runs against real data; nothing enforces
that"*. Attaching administrative credential establishment to that command would put the product's
highest privilege behind its least-guarded entry point.

FR-993 — a re-seed must not reset an operator who has replaced their credential — follows naturally
once the two are separate commands, and must additionally be asserted, because the natural
implementation of a seed is idempotent upsert.

**Alternatives considered**:
- *Bootstrap inside `db:seed`* — rejected above.
- *Interactive prompt* — rejected. CI and unattended deploys cannot answer it, and the constitution
  requires a locally reproducible stack.

---

## Cross-cutting: what this feature must NOT quietly absorb

Recorded here because each is a live entry that a plausible implementation would appear to close:

| Entry / item | Why it looks closed, and is not |
|---|---|
| **Register 19** (avatar moderation) | An admin surface exists now. But FR-954 forbids the action, and the *standard* is undecided. |
| **Register 21** (the operator address) | Reports become readable in-product. But nobody is appointed, and FR-947 keeps the mail path. |
| **Register 4** (unvalidated desktop) | Three new layouts are delivered. This feature **escalates** it. |
| **`security-response-headers`** | The admin block will have headers. MyNet still will not. |
| **`session-write-per-request`** | Admin sessions are few. The attendee path is unchanged. |
| **`seed-production-guard`** | Bootstrap is separated from `db:seed`. `db:seed` itself is unguarded still. |
