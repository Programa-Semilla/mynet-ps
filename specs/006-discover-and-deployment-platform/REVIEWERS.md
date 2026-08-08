# Review Guide: Discover, and the Deployment Platform It Runs On

**Generated**: 2026-08-07 | **Spec**: [spec.md](spec.md) | **Constitution**: v3.0.0

> **Read this first — four things will look wrong if you review them against the wrong document.**
>
> 1. **This is two subsystems in one pull request, deliberately.** A split into two specs was
>    recommended during brainstorming and again after the scope grew, and was **declined by the owner
>    both times with the facts in hand**. Phase 3 (the directory) and Phase 4 (the platform) share no
>    files and each produces working software alone. If you think it should have been split, that
>    conversation has happened — see `brainstorm/05-discover-and-the-deployment-platform.md`.
> 2. **It required a constitutional amendment, and that amendment has landed** — constitution
>    **v3.0.0**, a MAJOR bump. Three departures were superseded. The third — 001's shipped
>    **FR-066** and **SC-011**, which guarantee a reviewer a preview of *that exact change* — is a
>    delivered, verified requirement now **withdrawn**, and it is the first time this project has
>    retracted one. **Review the amendment alongside the code**: what is given up is that you no
>    longer see the change you are reviewing, deployed, before approving it.
> 3. **The directory discloses something the single-profile read deliberately refuses.** That is
>    FR-404, it is bounded and stated, and it is not a defect. See *Areas Needing Attention*.
> 4. **Five CI jobs are deleted and the `verify` check goes green for the first time.** That is not a
>    weakened gate — it is the removal of jobs whose vendors no longer exist. Every correctness check
>    survives. See *Key Decisions* 6.

## Why This Change

004 built the read this feature consumes and said so in the code: `GET
/events/:eventId/attendees/:attendeeId` carries a header stating *"006 is what consumes this. It
arrives with a directory; this feature ships the read it needs and no listing — a list of
co-attendees is 006's to design."* Until that listing exists, Discover is an empty destination and
the product answers only one of its three questions. `requirements.md` asks "who should I meet?"
second, and nothing has answered it.

There is a sharper reason for the second half. **In the configuration on `develop` today, a deployed
MyNet cannot sign anyone in.** The API deploys to `mynet-api-pr-N.fly.dev` and the client to
`pr-N.<project>.pages.dev`. Both are on the Public Suffix List, so they are not merely different
hosts but different *sites* with no common registrable domain — and the session cookie is
`SameSite=Lax`. It is never sent. This has never been observed because the deploy secrets were never
provisioned, so the jobs have never run.

Discover is what makes that urgent rather than theoretical: it is the feature that puts a searchable
directory of real people's names, employers and faces behind that broken door.

## What Changes

Attendees can find each other. Discover gains a directory of co-attendees at the active conference —
cards with name, company, role, headline, interests, networking intent, availability and a face —
with server-side search, role and interest filters, and ranking by how many interests you share.
Opening a card gives an addressable profile view. Home gains one card suggesting the five people you
have most in common with.

The product also becomes deployable. Two isolated Azure VMs (`uat` and `prod`) replace Fly,
Cloudflare Pages and Neon, with Caddy terminating TLS and serving both the client and the API from
**one origin** — which is what makes the session cookie work and `connect-src 'self'` true.

**Breaking**: per-PR preview environments are withdrawn. Reviewers no longer get a deployed preview
of the change they are reviewing. This supersedes 001's FR-066 and SC-011 and is the single
unrecovered cost of the change.

**No new table and no new column.** Migration `0005` is five indexes and one extension.

## How It Works

**The directory is one query.** The three visibility conditions 004 established — reader registered,
target registered, target discoverable and verified — plus search, filters, the shared-interest
overlap count, the ordering and the keyset bound all evaluate together in
`apps/api/src/db/queries/directory.ts`. An attendee excluded by any condition is **absent from the
response entirely**, not withheld from display. The route names `:eventId`, so the existing route
audit fails the build if `requireEventAccess` is missing.

**Avatars ride along.** The listing embeds each card's avatar at a new 96px rendition rather than
costing one request per face. Both renditions come from the same `images/avatar.ts` decode-resize-
re-encode path, so EXIF stripping stays a property of the operation. The card rendition's storage key
is **derived** from the profile key rather than stored in a new column — see *Key Decisions* 3.

**Paging is keyset plus client-side de-duplication.** The server cannot guarantee no-duplicates
alone without snapshotting the result set, which the no-caching decision forbids. The client
de-duplicates against the list it is already rendering.

**Caddy is both file server and reverse proxy.** It serves the built client with an SPA fallback and
proxies `/api/*` to the API container; PostgreSQL runs in the same stack, bound to loopback only.
`VITE_API_BASE_URL` becomes `/api` — the client's HTTP layer already defaults to a relative base, so
that is configuration, not code.

**The repository casts go first.** `@mynet/platform` takes `@mynet/data` as a **devDependency** and
`import type`s the real interfaces, deleting fifteen unchecked casts across eleven files. Done first
by requirement (FR-497), so this feature adds none.

## When It Applies

**Applies when**

- A signed-in attendee has an active conference with co-attendees who are registered, discoverable
  and verified.
- The reader has a connection. Discover is **not** readable offline, by design.
- Any deployed environment — the platform half applies to `uat` and `prod` equally.

**Does not apply when**

- The reader has joined no conference. Discover explains that joining comes first (FR-401b).
- The reader is offline. Every surface refuses with wording distinguishable from a server fault.
- Messaging, card-sharing or scheduling is wanted — those belong to 007 and 008, and **no dead or
  disabled control for them ships**.
- Audience Q&A — 009.

## Key Decisions

1. **Discoverability is not reciprocal.** An attendee who hides still browses in full. Requiring
   reciprocity would turn a privacy setting into a feature gate, pressuring people to expose
   themselves. *Rejected: reciprocity; reciprocity for profile detail only.*

2. **Discover is not cached — declared, not defaulted.** 005's cache holds the reader's own
   relationship to conference content; a cached directory would hold *other people's* names and faces
   past a withdrawal of consent, on a device the server can no longer reach — and 004 chose hard
   deletion with no tombstone precisely so nothing lingers. *Rejected: 24h uniformity; caching only
   opened profiles.*

3. **The card avatar's key is derived, not stored.** An `avatar_card_object_key` column would be a
   new column collecting attendee data, and `export-coverage.test.ts` fails when a column is
   collected without export coverage — it reads the Drizzle schema, so **a new column fails by
   existing**. Deriving keeps "no new table, no new column" true and both structural guards green
   with no allow-list entry. *Rejected: a second column; a `stored_objects` variant column.*

4. **Ranking may use only what the card already shows.** This is a privacy rule, not a taste one:
   ranking by saved-session overlap would be a better recommender and would make the score a side
   channel for the agenda 005 made private. The query has no join to that data, so the rule holds
   structurally. *Rejected: intent-weighted ranking; separate orders for Home and Discover.*

5. **One origin via Caddy.** The topology decision and the CSRF defence are the same decision, and it
   is also what collapses CSP's only topology-dependent directive. *Rejected: sibling subdomains
   (needs CORS and a CSP naming the API host); `SameSite=None` plus a synchroniser token (weakest
   posture, most new code).*

6. **Five CI jobs are deleted rather than provisioned.** `db-branch`, `deploy-api`,
   `deploy-preview`, `schema-diff` and `cleanup` exist to serve vendors this change retires. Register
   entry 17 records `verify` staying red because those four await secrets; the red disappears because
   its cause does. **`test-e2e` was checked specifically** and runs against `localhost:3000` on a
   `postgres:17` service container — it never depended on the preview.

7. **PostgreSQL in the stack, not managed.** Owner decision, following a pattern proven in
   `mission-control`. Fixed cost, isolation by construction, no vendor. *Rejected by owner decision
   rather than by analysis: Azure Database for PostgreSQL Flexible Server would honour the
   constitution's wording with no amendment.*

## Areas Needing Attention

**1. The listing discloses set membership, and that cannot be fixed.** 004's single-profile read
collapses four causes into one identical 404 so FR-361 holds by construction. A listing cannot: if
you know someone is at this conference and they are not in the directory, you have learned they are
not registered, not discoverable, or not verified. FR-404 states this as a **bounded** narrowing —
the direct read keeps its indistinguishability, and the listing adds no *further* signal (no total,
no withheld count, no cause distinction). **Review that the bound holds**, not that the disclosure is
absent.

**2. UAT will be publicly reachable, carrying realistically-shaped attendee data.** The reference NSG
opens web access to the world. FR-485 forbids pointing it at production data and T069a/T069b add
enforcement rather than convention, but the exposure itself is an open owner decision (register
entries 14 and 19). **This is the item most worth pushing back on if you disagree.**

**3. Nobody moderates avatar images, and this is the feature that broadcasts them.** Register entry
19 was opened by 004; Discover converts an unmoderated upload from a private artifact into one shown
to every co-attendee. Escalated by this feature, not resolved by it.

**4. The pagination guarantee is deliberately asymmetric.** No duplicates ever; omissions permitted.
Forbidding omissions requires a snapshot that the no-caching decision refuses. If you think an
omission is unacceptable, the disagreement is really with decision 2.

**5. Desktop and tablet layouts remain client-unvalidated** (register entry 4). Discover is
card-dense at all three widths, so this feature compounds that cost more than any before it.

**6. `IdentityRepository` still spans two subjects.** This feature adds a `DirectoryRepository`
rather than extracting a `RegistrationRepository`, on the argument that the listing is about people
rather than membership. Reasonable engineers may disagree; research D1 records the reasoning and
notes 008 as the point to revisit.

**7. Two P1 user stories.** US1 and US4 are independent and jointly necessary. If you read the
template as requiring a single P1, the reasoning is stated above the stories.

## Open Questions

Two block the first deployment; neither blocks review or implementation. **Both are owner
decisions.**

- **No domain name exists.** Caddy cannot obtain a certificate until an A record resolves to the VM.
- **UAT access control is undecided** — see *Areas Needing Attention* 2.

Five design questions are carried in the spec for the plan to answer and are answered in
`research.md`: repository placement (D1), card rendition production (D2), pagination style (D4),
search semantics (D5), and header placement (D8).

## Review Checklist

- [x] **T001 has landed** — constitution v3.0.0 covers all three departures, including 001's
      FR-066/SC-011. Review it as part of this change rather than assuming it
- [ ] The three visibility conditions are in the query, not applied after fetching
- [ ] No response can carry `email` or verification state — check the schema *and* the projection
- [ ] FR-404's bound holds: no total, no withheld count, no cause distinction
- [ ] Nothing in this feature touches 005's caching decorator
- [ ] The ranking query has no join to saved sessions, notes, or messages
- [ ] Both avatar renditions come from the one re-encode path; no `withMetadata()` anywhere
- [ ] Account deletion removes **every** rendition — check the derived key
- [ ] `deletion-coverage.test.ts` and `export-coverage.test.ts` pass **unchanged**, with no new
      allow-list entry
- [ ] Migration `0005` is the only migration, and nothing under `migrations/meta/` was hand-edited
- [ ] Every correctness gate survives the CI rewrite; none was weakened to reach green
- [ ] `test-e2e` still runs against a service container
- [ ] Zero repository casts remain; `@mynet/data` is a **devDependency** of `@mynet/platform`
- [ ] No message, share-card or schedule control ships anywhere
- [ ] Home's registry gained exactly one appended line; no other card was touched
- [ ] No horizontal scrolling at 320px on Discover, the profile view, or Home
- [ ] The profile view traps focus, dismisses on Escape, and restores focus to its opener
- [ ] Performance is measured at 1,000 attendees, not asserted
