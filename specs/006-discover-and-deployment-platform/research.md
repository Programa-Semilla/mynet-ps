# Phase 0 Research: Discover, and the Deployment Platform It Runs On

**Feature**: 006 | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

Every open question the specification carried is resolved here, plus the technical choices the
specification deliberately left to planning. Each entry states what was chosen, why, and what was
rejected — the house format established by 001–005.

**Two of the specification's open questions are NOT resolved here**, because they are owner
decisions rather than design ones: the domain name, and whether a publicly reachable UAT is
acceptable. Both block the first deployment, neither blocks implementation, and both are restated at
the end.

---

## D1 — The directory listing gets its own repository

**Decision**: a new `DirectoryRepository` — `packages/data/src/interfaces/directory.ts` and
`packages/data/src/http/directory-repository.ts` — owning the listing and the profile read.
`IdentityRepository` is not touched.

**Rationale**. The idea-inbox entry framed this as "if a third registration verb appears, consider a
`RegistrationRepository`", and Discover's listing looks like that third verb. It is not. The existing
two verbs — `joinConference` and `withdrawFromConference` — are *lifecycle* operations on the
reader's own membership. The directory read is not about membership at all; membership is merely its
filter. It is about **people**, which is a different subject and the one Discover is named for.

A `RegistrationRepository` would also mean moving `joinConference` and `withdrawFromConference` off
`IdentityRepository`, which touches 004's shipped code and its tests to solve a problem 006 does not
have. The per-domain interface split 002 established makes a new file plus one registry line the
cheap option, and that is what this takes.

**Rejected**: extending `IdentityRepository` — it already spans two subjects, and this would make it
three. **Rejected**: a `RegistrationRepository` extracted now — a refactor of shipped code, justified
by symmetry rather than by need. **Recorded**: if 008's appointments also want registration-shaped
reads, the extraction becomes worth doing, and this decision should be revisited then rather than
defended.

---

## D2 — Both avatar renditions are written at upload; the read path repairs anything missing

**Decision**: `PUT /profile/avatar` produces **two** renditions from the one uploaded image — the
existing 512px profile rendition and a new card-sized one — through the same
`images/avatar.ts` decode-resize-re-encode path. Any read that finds the card rendition absent
derives it once, stores it, and serves it.

**Rationale**. The obvious objection to upload-time generation is backfill, and **this product has
never been deployed**: register entry 11 and the API Dockerfile's own header (*"Nothing has deployed
this image, because the API hosting account does not exist yet"*) both say so. **There is no
production avatar to backfill.** The only databases holding avatars are development and test ones
built from a seed that regenerates.

The read-path repair is therefore not a backfill mechanism; it is a safety net for a developer whose
database predates the change, and it costs one derivation per avatar, once, ever.

Deriving *only* on read was rejected because it puts image processing on the hot path of the
directory listing — the single request that FR-456 exists to make cheap — and because it would need
its own cache to not repeat, which is a second mechanism where FR-466 already forbids caching.

**Critically, the card rendition MUST come from the same re-encode path**, not from a copy or a
client-side resize: FR-458 requires metadata absence to remain a property of the operation. A second
production path is a second place EXIF stripping could regress.

**Card dimension**: 96px square, alongside the existing 512px. At quality 82 that is roughly 3–5 KB,
so twenty-four of them base64-encoded is on the order of 150 KB — against roughly a megabyte for
twenty-four 512px renditions. Configurable the same way `AVATAR_DIMENSION_PX` already is.

---

## D3 — The card rendition's object key is derived, not stored

**Decision**: the card rendition is stored under a key **derived by convention** from the profile
rendition's key, in `apps/api/src/storage/`. No new column on `attendees`.

**Rationale, and this is the load-bearing one**. The alternative — an `avatar_card_object_key`
column — would be a **new column collecting attendee data**, and
`tests/unit/export-coverage.test.ts` fails when a column is collected without export coverage. It
derives its expectations from the Drizzle schema, so **a new column fails by existing**. Adding one
would mean either exporting a second copy of an image already exported, or writing an allow-list
entry justifying why not.

A derived key needs neither. It keeps the specification's "no new table and no new column" true,
which is what lets both structural guards stay green without an allow-list entry — and it means
account deletion reaches the card rendition by deriving its key, using the same routine that already
removes the profile one (FR-460).

`stored_objects` is deliberately opaque about what a key means — its header says
*"`storage/service.ts` decides what a key means"* — so a key convention is exactly where this
belongs. **Rejected**: a second column. **Rejected**: a `stored_objects` variant column, which would
teach the key-value store what its callers store in it, against its stated design.

---

## D4 — Keyset pagination, with client-side de-duplication

**Decision**: keyset pagination on `(shared_interest_count DESC, attendee_id)`. The client
accumulates loaded pages and **de-duplicates by attendee identifier** as it appends.

**Rationale**. FR-410a asks for a guarantee neither pagination style gives alone. Offset pagination
duplicates whenever a row is inserted before the current position. Keyset pagination is stable
against inserts, but not against a *score changing for an attendee already passed*: if a co-attendee
edits their interests and their score falls below the cursor, keyset will return them again.

The only server-side fix is a snapshot of the result set, and **FR-466 forbids exactly that**.

De-duplicating on the client closes it precisely. The client already holds the loaded pages in
memory in order to render them; checking a new page against the list being displayed is not a cache
and introduces no retention — it is the rendered list, which disappears when the view does. The
asymmetry FR-410a declares falls straight out: a duplicate is impossible, an omission is permitted,
and the reason is that forbidding omissions would require the snapshot.

**Rejected**: offset pagination — simpler, but duplicates under exactly the ordinary case of someone
joining the conference while you scroll. **Rejected**: server-side snapshotting.

---

## D5 — Substring search, case- and accent-insensitive, unindexed by choice

**Decision**: `unaccent(lower(...))` substring matching across display name, company, role and
headline. The `unaccent` extension is enabled in migration `0005`. **No trigram or full-text index
is added.**

**Rationale**. Accent-insensitivity is not a nicety here: the organisation is `Programa-Semilla` and
the product's conferences are Spanish-language, where searching "Munoz" must find "Muñoz". `unaccent`
is a standard contrib extension, available in the PostgreSQL image without provisioning, and enabled
with one line.

Not indexing is a deliberate, bounded choice. FR-401c sets the scale at 1,000 registered attendees
per conference. A scan of 1,000 rows already narrowed by the event-registration join is trivial, and
a GIN trigram index would be a second extension plus write amplification on every profile edit, to
optimise something that is not slow. **This is recorded as revisitable**: if a conference ever
approaches five figures, `pg_trgm` is the answer and this decision is where to start.

`unaccent` is not `IMMUTABLE`, which prevents indexing an expression that uses it — irrelevant here
precisely because nothing is indexed, and worth recording so a later attempt to add the index knows
what it will hit.

**Rejected**: `lower()` only — cheaper, and wrong for the product's actual users. **Rejected**:
full-text search — stemming and dictionary configuration are a language decision nobody has made,
and substring is what "search as you type over a name" actually means.

---

## D6 — Caddy serves the built client and reverse-proxies the API under one origin

**Decision**: Caddy is the single public listener. It serves the client's built static assets
directly with an SPA fallback, and reverse-proxies `/api/*` to the API container. `VITE_API_BASE_URL`
becomes `/api`.

**Rationale**. This is the same-origin topology the specification requires (FR-476), obtained without
inventing anything: the client's HTTP layer already defaults to a **relative** base
(`baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? ''`), so pointing it at `/api` is a configuration
change rather than a code change.

It differs from the mission-control reference in one way worth stating: there, Caddy proxies
*everything* to one application that serves its own static content. Here the client is a static build
with no server of its own, so Caddy is both file server and proxy. The maintenance-page matcher, the
auto-TLS block and the environment-variable substitution carry over unchanged.

**Consequence for the client**: no client Dockerfile is needed. The built `dist/` is produced by the
existing `build` job and mounted for Caddy. The API's existing Dockerfile is reused as-is — it is a
generic Node image, and nothing in it is Fly-specific despite the comment naming Fly.

**Rejected**: sibling subdomains — needs CORS and a CSP naming the API host. **Rejected**: a
Cloudflare Pages Function proxy — was the right answer while Pages was the target; the VM makes it
redundant.

---

## D7 — CORS stays, and now earns its place from local development

**Decision**: `@fastify/cors` remains, configured to `WEB_ORIGIN` as today.

**Rationale**. Under D6 no deployed request is cross-origin, so it would be easy to conclude CORS is
dead code. It is not: **local development is genuinely cross-origin** — the Vite dev server on
`:5173` calling the API on `:3000` — and that is the configuration every developer runs all day.

Keeping it also means a deployment that accidentally splits the origins fails closed with a
recognisable CORS error rather than silently working in some browsers.

**Rejected**: removing it — would break local development immediately, for no gain.

---

## D8 — Security headers are set by whoever serves the response

**Decision**: the **API** sets security headers on API responses; **Caddy** sets them on static
responses. Neither sets the other's.

**Rationale**. This is the split that makes both halves testable. Headers on API responses can be
asserted by the existing integration suite, which runs against the real Fastify app with no proxy in
front — so they are verified on every change, by machinery that already exists. Headers on the static
document cannot be, because nothing in CI serves the static build through Caddy; those are asserted
by a deployment smoke check instead (FR-411, SC-411).

Setting both in Caddy would leave the API's own headers untested and absent from any non-Caddy
deployment. Setting both in the API is impossible — the API never serves the HTML document that CSP
most needs to protect.

**`img-src 'self' data:` is required and is recorded in FR-481**, because D2/FR-456 deliver avatars
as data URLs. A later tightening that drops `data:` would blank every face in the directory, which is
exactly the kind of silent breakage worth writing down.

---

## D9 — Two Azure VMs on the mission-control pattern, PostgreSQL in the stack

**Decision**: `uat` and `prod`, each one `Standard_B2s` Azure VM running a Compose stack of Caddy +
API + PostgreSQL, provisioned and operated by env-aware scripts under `deploy/vm/`, modelled directly
on `/mnt/D/repos/mission-control/deploy/vm`.

**Rationale**. The pattern is proven in another project by the same owner, it is fixed-cost
(~$40/month per environment, with no per-request metering to reason about), and it gives isolation
per environment by construction — separate VM, database, secrets and address — which is what FR-484
and FR-485 require.

**PostgreSQL binds to loopback only** (FR-486), exactly as mission-control binds SQL Server to
`127.0.0.1:1433`. Backups follow the same shape: a script running under cron **on** the VM, reading
the `.env` beside it, with a separate local verification script.

**This is the departure the specification records**, and it is not being resolved here — the
constitution says "managed PostgreSQL" and the amendment is a merge prerequisite.

**Adapted rather than copied**: the reference stack is SQL Server and a .NET application serving its
own static content. Here it is PostgreSQL and a static client behind Caddy (D6). The env-file
convention, the subscription-verification guard that refuses to run when the active subscription does
not match, the maintenance-page mechanism, and the operator runbook all carry over as designed.

---

## D10 — `@mynet/platform` takes a type-only dependency on `@mynet/data`

**Decision**: add `@mynet/data` to `@mynet/platform`'s **devDependencies**, and replace the
structurally-mirrored `Promise<unknown>` repository declarations in `registry.tsx` with `import type`
of the real interfaces.

**Rationale**. The stated reason for the mirroring — *"so `@mynet/platform` does not depend on
`@mynet/data`. Both are leaves"* — is about the **runtime** dependency graph, and `import type` is
erased entirely at build time. A devDependency plus `import type` therefore preserves the property
the comment is protecting while deleting every cast it costs.

**The cost is larger than the idea-inbox entry recorded.** That entry counted six casts from 004; the
actual total across the codebase is **fifteen**, in eleven files — `active-event.tsx`, `useAuth.tsx`,
`UpNext.tsx`, `RestOfDay.tsx`, `NextSavedSession.tsx`, `YourConferences.tsx`, `Agenda.tsx`,
`EventSwitcher.tsx`, `Profile.tsx`, `ProfileEdit.tsx`, `Account.tsx`, `WithdrawConference.tsx`.

**This must be done before 006's own repository work** (FR-497). Discover adds a repository, a Home
card and two surfaces; done last, that is three or four more casts written and then deleted.

**Rejected**: making `PlatformServices` generic over a repository map — preserves package
independence without a dependency, but every consumer and every test would carry the type parameter,
which is a large change to avoid a devDependency nobody pays for at runtime.

---

## D11 — Migration `0005` is generated normally; the snapshot needs no surgery

**Decision**: run `drizzle-kit generate`, take what it produces as `0005`, and change nothing under
`migrations/meta/` by hand.

**Rationale**. The migration README answers this directly and its answer is that there is nothing to
do: *"`drizzle-kit generate` picks the last snapshot by filename, so 006 diffs against
`0004_snapshot.json` — the full current schema — and takes index 5, which is the number the roadmap
reserves for it. Nothing needs adjusting; just do not hand-write a `0003_snapshot.json` to 'fix' the
gap."*

**This is what makes the two deferred index findings safe to take now.** 004's review left them open
because the fix requires regenerating the snapshot, and the README warns against doing that casually.
Doing it in the feature that owns the next migration number, against a snapshot chain the README
confirms is contiguous, is the deliberate treatment rather than the incidental one.

### What `0005` contains

| Index | Table | Why |
|---|---|---|
| `registrations_event_id_idx` | `registrations` | **The directory's primary access path.** The table currently indexes `attendee_id` only, with a comment stating *"every read of this table is 'the authenticated attendee's registrations'"* — which 006 makes false. The composite unique on `(attendee_id, event_id)` leads with the wrong column to serve it |
| `attendee_interests_interest_idx` | `attendee_interests` | The interest filter, and the overlap join that computes the ranking |
| `attendee_verifications_attendee_id_idx` | `attendee_verifications` | 004 review finding: PostgreSQL creates no index for a foreign key, so account deletion cascade-scans the table |
| `attendee_password_resets_attendee_id_idx` | `attendee_password_resets` | The same finding, the other table. Both come from one `identityTokenColumns()` factory, so this is one change expressed twice |
| `events_join_code_lower_btrim_idx` | `events` | 004 review finding: the lookup matches `lower(btrim(join_code))` while the unique constraint indexes the raw column, so it cannot be used |
| — | — | `CREATE EXTENSION IF NOT EXISTS unaccent` (D5) |

**No new table and no new column.** The migration is indexes and one extension.

---

## D12 — The ranking is a left join and a count, computed in the listing query

**Decision**: one query produces the page — the three visibility conditions, the search and filter
predicates, the overlap count, the ordering, and the keyset bound. The overlap is a `LEFT JOIN` from
each candidate's interests to the reader's interest set, counted per candidate.

**Rationale**. Ranking, filtering and pagination are the same operation over the same rows;
separating them would mean either ranking a page (wrong — the page is chosen *by* rank) or fetching
everything to rank it (which FR-409 forbids and D4's pagination exists to avoid).

A `LEFT JOIN` rather than an inner one, because an attendee with **zero** shared interests must still
appear in the directory — they are simply last. The Home card takes the same query with a limit of
five (FR-447).

**The reader's own interests are the only input from outside the conference**, and they are the
reader's own data, so no cross-attendee read is introduced by the ranking. This is what makes FR-413
hold structurally: the query has no access to saved sessions, notes or messages, so a ranking derived
from them could not be written without adding a join that review would see.

---

## D13 — The vendor jobs are deleted, and `verify` is recomposed around what remains

**Decision**: remove `db-branch`, `deploy-api`, `deploy-preview`, `schema-diff` and `cleanup`. Add
`deploy-uat` (on push to `develop`) and `deploy-prod` (on push to `main`). Recompose the `verify`
aggregate from the checks that remain.

**Rationale**. These five jobs exist to serve per-PR ephemeral environments on Fly, Cloudflare Pages
and Neon, and D9 retires all three. `cleanup` goes with them because its work is destroying the
per-PR Fly app and Neon branch, which will no longer exist.

**Nothing that verifies correctness is removed**, and this is the point FR-490 makes and SC-411 must
hold to: `typecheck`, `lint`, `test-unit`, `test-component`, `contract`, `migrations`,
`test-integration`, `build`, `test-accessibility` and `test-e2e` all stay. `test-e2e` was checked
specifically and **does not depend on the preview** — it runs against `localhost:3000` with a
`postgres:17` service container (`needs: migrations`), exactly as PR #9 left it.

**The aggregate check goes green honestly for the first time.** Register entry 17 records that
`verify` stays red because four jobs await vendor secrets. Those four jobs are being deleted rather
than provisioned, so the red signal disappears because its cause does — which is the opposite of
weakening a check, and is what FR-490's "no check may be weakened" is guarding.

**What this costs, and the specification says so**: 001's FR-066 and SC-011 guarantee a reviewer a
preview of *that exact change*. `deploy-preview` is that guarantee's implementation, and deleting it
withdraws it. The constitutional amendment must supersede both explicitly.

---

## D14 — The directory is one endpoint; the profile read is 004's, unchanged

**Decision**: one new route, `GET /events/:eventId/attendees`, carrying search, filters, the keyset
cursor and the page size. The existing `GET /events/:eventId/attendees/:attendeeId` and its avatar
sibling are used as they are.

**Rationale**. 004 built the single-profile read *for* this feature and its header says so. Reusing
it unchanged means the profile view inherits the four-way indistinguishable refusal by construction,
which is what keeps FR-431 true and confines FR-404's narrowing to the listing alone.

The new route carries `:eventId` and therefore acquires `requireEventAccess` and the branded
`EventScope` automatically — and the route audit **fails the build** if it does not, which is how
FR-402's reader-side condition is enforced without anyone remembering to enforce it.

---

## Still open — owner decisions, restated

Neither blocks implementation. Both block the first deployment.

- **No domain name exists.** Caddy cannot obtain a Let's Encrypt certificate until an A record
  resolves to the VM, so this gates the first deploy of either environment (FR-479). mission-control
  uses `missioncontrol.lat`.
- **UAT will be publicly reachable.** The reference NSG opens web access to the world and restricts
  only SSH. FR-485 forbids pointing UAT at production data, which bounds the harm but does not
  address the exposure. Sharpens register entry 14; interacts with entry 19.
