# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file is the **working brief**: what the product is, what has been decided, and how work is
done here. It is deliberately short. Depth lives elsewhere, and these are authoritative over it:

1. **`.specify/memory/constitution.md` (v3.0.0)** — governance and the authoritative decision
   register. Supersedes tool defaults, habit, and any conflicting statement in this file.
2. **`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`** — the decomposition of
   the remaining product into features, with dependency order, reserved migration numbers, and gate
   schedule. Read before starting any feature. It is a plan, not governance: it may be revised
   without an amendment, but a feature departing from it must say so in its spec.
3. **`specs/<feature>/`** — per-feature spec, plan, tasks, and review findings.
4. **`GroundZero/requirements.md`** — read for **WHAT**, not HOW (see the table below).
5. **`GroundZero/prototype/`** — approved interaction and visual reference only.
6. Existing source code — implementation reference, unless confirmed as production architecture.

When sources conflict on a **WHAT**, **do not resolve by assumption.** Record it as an open
question and settle it with the client.

## Repository layout

```
GroundZero/       # Initialization brief, requirements.md, approved prototype (reference only)
apps/api/         # Fastify + Drizzle over PostgreSQL; versioned migrations
apps/web/         # React + TypeScript PWA; shell, sign-in, five destinations
packages/data/    # Repository interfaces + HTTP implementations + generated contract types
packages/platform/# Device-capability + storage interfaces, web implementations, repository registry
packages/config/  # Shared TypeScript and Vitest bases
contracts/        # Generated, committed OpenAPI contract
deploy/vm/        # The whole deployment platform: Caddy + API + PostgreSQL, provisioning, backups
e2e/              # Playwright end-to-end tests
brainstorm/       # Design sessions and their decisions
specs/            # Feature specifications
docs/superpowers/ # Design documents and implementation plans
```

## Product

**MyNet** — a multi-event attendee engagement and professional networking platform. It **is** an
authenticated attendee workspace, not a marketing site and not a generic enterprise dashboard.

It answers three questions, in this order of prominence: What is happening next? Who should I meet?
Where are my conversations, notes, and appointments?

The core journey: inspect the next session → discover a relevant attendee → share a card or message
them → schedule a networking appointment.

The **attendee** is the only actor. Speakers and other attendees are data the attendee interacts
with, not users of the system. **Organizer administration is out of scope**, and seed data must not
become a route around that: no admin interface, no privileged role, no content import path.

### The five destinations

Each is individually addressable. Home is the entry view, built around the active event.

- **Home** — event switcher, greeting with day context, prominent "Up next" session card,
  rest-of-day timeline, recommended people to meet, appointment summary, unread-message indicator.
- **Agenda** — personal schedule in chronological order; time, track, room, speakers, saved state;
  add/remove; session detail panel with Overview, personal Notes, audience Q&A, Speaker info.
- **Discover** — information-rich attendee cards; search plus role/interest filters; company, role,
  interests, intent, availability; open profile, share card, start a message, schedule a meeting.
- **Messages** — conversation list plus focused thread. Content is private to its participants.
- **Network** — saved contacts, exchanged cards, appointments. Scheduling is a compact modal with
  selectable slots and a short topic field.

Saved sessions, notes, Q&A votes, conversations, cards and appointments are **durable,
per-attendee, server-side state**. The prototype's local-only behaviour is a prototype artifact.

### Domain terminology

- **Event** — a conference the attendee is registered for; name, location, day N of M; switchable.
- **Session** — a scheduled item with time, title, room, track, optional speaker.
- **Track** — a session category, visually coded (Design, Product, Tech, Keynote, Main Event).
- **Saved session** — a session added to the attendee's personal Agenda.
- **Attendee / profile** — a person with company, role, interests, networking **intent** (e.g.
  "Open to meetings") and **availability** (available / busy).
- **Digital business card** — shareable contact payload; sharing produces a confirmation state.
- **Appointment** — a confirmed time slot with another attendee plus a short topic.
- **Conversation / thread** — the message history with one attendee.
- **Q&A** — audience questions on a session, with upvotes.
- **Up next** — the attendee's next session, given first-viewport prominence.

## Current state

Shipped: the production foundation (001), event context and the session catalog (002), attendee
identity and profile (004), Agenda as a personal schedule (005), and **Discover with the
deployment platform it runs on** — feature 006, squash-merged to `develop` in
[#13](https://github.com/Programa-Semilla/mynet-ps/pull/13). **007 (Messages) is next**; see
`brainstorm/00-overview.md` for the queue.

**Nothing has been deployed yet, and that is not a gap in the code.** `deploy/vm/` is complete —
two Azure VMs, Caddy with automatic TLS, a loopback-only PostgreSQL container, backups and a
runbook — but two owner decisions gate the first deploy: **no domain is registered** (Caddy cannot
obtain a certificate without a resolving A record) and **no Azure subscription is named**. The
`deploy-uat` and `deploy-prod` jobs print what they are blocked on and exit 0 rather than failing
every merge.

An attendee creates their own account, joins a conference by code, and arrives at the conference
happening now — greeted by name, told which day it is in the venue's timezone. Home shows what is
next, what remains of the day, what is next from their saved sessions, and who is worth meeting.
Agenda carries the whole programme with an All/Saved filter and an addressable session detail
panel. Discover carries the attendee directory with an addressable profile view over it.

**Still carrying no product content**: Messages and Network. Audience Q&A arrives in 009, as a
third section on the panel 005 built.

**Migrations claimed so far run to `0005`.** The journal lists `0003` before `0004` while carrying a
later timestamp — `apps/api/migrations/meta/README.md` explains why both halves are load-bearing and
what a regenerating feature must not "fix". Anyone regenerating must move that README aside first,
because `drizzle-kit generate` JSON-parses every file in `meta/`.

## Architectural invariants

Established by shipped features. A later feature inherits these; changing one is a decision, not a
refactor.

**Server-side enforcement**

- **Event scope is a branded type only `requireEventAccess` can construct**, demanded by every
  per-event query. A route audit fails when a route declaring an event parameter lacks the guard,
  and a lint rule closes the brand's type-assertion escape hatch.
- **Two coverage tests fail a *future* feature's build.** `tests/unit/deletion-coverage.test.ts`
  fails when a table storing attendee data has neither a cascade from `attendees` nor a declared
  retention rule; `tests/unit/export-coverage.test.ts` fails when a collected column has no export
  coverage. Both derive expectations from the Drizzle schema, so **a new table or column fails by
  existing**. Allow-listing requires writing down why.
- **Verification gates exactly one thing: discoverability.** An unverified attendee uses the
  product fully and appears to nobody — so any profile that can be read already carries a verified
  address, and no feature may use verification state for anything else.
- **`sign_in_attempts` is deliberately not deleted with an account.** It has no foreign key by
  design; deleting a departing attendee's rows would let an attacker clear their own trail by
  registering and deleting. It expires on the two-hour sweep, which FR-382 forbids lengthening.
- **Throttling is per action.** Reset-request is configured so it **may delay but can never deny** —
  an identifier-keyed denial only ever harms the victim.

**Append-only extension points** — contribute a line and your own file; never edit a neighbour's.

- `apps/web/src/app/home/registry.ts` — Home cards.
- `apps/web/src/app/navigation.ts` — a destination declares its own element and nested addresses.
  `routes.tsx` names no address literally.
- Repository interfaces, API route registration, and the seed are split per domain.
- `Repositories` in `packages/platform` — adding a repository is one line; `registry.tsx` is
  untouched. Platform takes a **type-only** dependency on `@mynet/data` so the registry names real
  interfaces; `apps/web/tests/unit/repository-casts.test.ts` keeps the unchecked casts gone.

**Client behaviour**

- **Offline reads come from a caching decorator at the repository boundary** — no component knows
  it exists — keyed `(attendeeId, eventId, resource)` with a **24-hour lifetime**. Every cached
  surface states when it was retrieved. Writes are **refused, never queued**: no write queue, no
  optimistic update, no conflict merging.
- **Discover is deliberately not cached**, and the refusal is declared rather than omitted: age is
  the wrong clock for a discoverability setting that takes effect on the next request, and a cached
  directory is other people's personal data ageing on a device after they chose to be invisible.
- **`CatalogRepository` is read-only in perpetuity**, asserted by name-shape over its exports.
  Attendee state *about* conference content belongs in its own repository.
- **The detail panel is a native `<dialog>` with `showModal()`** — focus trap, background inertness
  and Escape come from the platform. Focus restoration to the opener is explicit, because
  `<dialog>` does not do it reliably.

**Directory (006)**

- **The directory is one query** — three visibility conditions, search, both filters, the
  shared-interest count, ordering and the keyset bound. They are not separable because the page is
  chosen *by* rank. Its only input from outside the conference is the reader's own interest set,
  which is what makes "ranking may read only what the card shows" structural.
- **Pagination's guarantee is asymmetric by design**: no duplicate ever, omissions permitted.
  Keyset cannot cover a score that *falls* below the cursor; the only server-side fix is a snapshot
  nothing may retain. `useDirectory` de-duplicates against the list it is rendering — not a cache.

**Deployment**

- **`deploy/vm/` is the whole platform**: Caddy with automatic Let's Encrypt TLS serving the built
  client and reverse-proxying `/api/*`, an API container, and a **loopback-only** PostgreSQL
  container. `deploy/vm/README.md` is the operator runbook; read section 6 before rolling back.
- **`/ready` is what a deployment gates on**; `/health` is deliberately unchanged. A container with
  an unreachable database answers `/health` perfectly and every attendee request with a failure.

## Standing decisions (project owner)

Decided explicitly. **Not open for re-inference.**

**2026-08-04**

1. **The product is MyNet.** Not EventLink.
2. **MyNet is the real product, not a demo.** The front-end-demo framing is withdrawn.
3. **`requirements.md` is authoritative for WHAT, not HOW.**
4. **Durable persistence is foundational** — a project-owned API over PostgreSQL. *Amended in
   v3.0.0*: originally "managed PostgreSQL"; see decision 17.
5. **Real authentication is foundational**, not a later addition.
6. **The five destinations are individually addressable.**

**2026-08-06**

7. **Event scoping is hybrid.** Conference content — sessions, tracks, speakers, the Discover
   directory, appointments — is per-event and swaps on switch. Relationships — contacts, exchanged
   cards, message threads — persist across events. **Every new table declares which rule applies and
   why; neither is a default.**
8. **Conference content is seeded; profiles are attendee-authored.** Each attendee authors their own
   profile and no one else's.
9. **Home is composed, not aggregated.** Independent cards, each owning its loading, empty and
   failure states. A failing card must not blank the dashboard; no card depends on another.
10. **Features run mostly sequentially**, in parallel only where they touch disjoint files.

**2026-08-07** (ratified in constitution v2.3.0)

11. **A person becomes an attendee by signing themselves up** — email, display name, password, plus
    an access code carried on the seeded event row. This does **not** breach the organizer
    exclusion, and the reasoning is not to be re-derived: *event invitation* and
    *organizer-provisioned* both need an issuer who is not an actor here, and *ticket holder* needs
    an undecided integration. Self sign-up is the only model leaving the attendee as sole actor.
    Password recovery is consequently in scope.
12. **Retention, deletion and export are self-serve and complete.** Hard deletion with cascade, no
    tombstone; machine-readable export covering every field collected; a retention clock for
    records no cascade can reach. Built to the strict standard so settling jurisdiction is not a
    precondition.
13. **Attendee avatars are uploaded.** Resizing and **EXIF stripping are mandatory** — phone
    photographs carry GPS coordinates. The prototype's Unsplash photographs are of real people and
    must not ship as seeded attendee faces.
14. **Transactional account mail is in scope** — verification and password reset, and nothing else —
    distinct from the excluded engagement notifications.
15. **Image bytes go through a `StorageService`** platform interface, never a storage SDK in feature
    code. A lint rule keeps vendors and the backing table inside `apps/api/src/storage/`.
16. **A profile is visible to co-attendees at the same event**, with one discoverability toggle.
    All-or-nothing by design; per-field permissions were considered and rejected.

**2026-08-07** (ratified in constitution v3.0.0) — these supersede earlier statements:

17. **The database is provisioned by this project, not a vendor.** Only *who operates it* changes;
    the engine, project-owned contract, reviewed migrations and repository-interface access are
    unchanged. **Backups become a governance obligation**: at least daily, automated, a written
    retention period, and a restore actually performed before production holds real attendee data.
18. **Production and UAT are two isolated Azure VMs**, each with its own host, database, secrets and
    address.
19. **Client and API share one origin.** Not a preference: it is what keeps `SameSite=Lax` a genuine
    CSRF defence and makes `connect-src 'self'` literally true. **The configuration it replaced
    could not sign anyone in** — `fly.dev` and `pages.dev` are separate registrable domains on the
    Public Suffix List, so the cookie was never sent.
20. **Per-change preview deployments are withdrawn**, and with them **001's shipped FR-066 and
    SC-011** — the first delivered requirement this project has retracted, which is why v3.0.0 is a
    major version. A change reaches UAT on merge to `develop`. **001's FR-067 survives**: no
    non-production environment may be connected to real attendee data, and that now binds UAT.

## How work is done here

### Branching and change flow

`main` and `develop` are protected. **Never commit or push directly to either.** Every change goes
through a pull request.

- Branch from `develop`, named `<type>/<short-description>` (`feat`, `fix`, `chore`, `docs`,
  `spec`, `refactor`).
- Open the PR against `develop`; merge with **squash** and delete the branch.
- Promoting `develop` → `main` is also a PR.

Activate the local guardrails once per clone: `git config core.hooksPath .githooks`.
`.githooks/pre-commit` and `pre-push` block direct commits and pushes to `main` and `develop`. They
are bypassable with `--no-verify`, and **server-side branch protection is not configured** — see
open questions.

### Constraints

- **Attendee data is personal data.** Every record is attributable to one identity; every read path
  is scoped by identity; authorization is server-side, never client-side filtering. Secrets never
  reach the client bundle. (Constitution Principle VIII.)
- **Deletion and export are per-feature duties.** Every feature storing attendee data declares how
  its records are covered, in the change that introduces them.
- **Data access goes through repository interfaces.** Components never call the network or know
  transport details. (Principle V.)
- **Every feature declares its own completeness** (Principle IX): offline behaviour, all three
  layouts, empty/loading/failure states, accessibility, checklist items discharged, identity
  scoping, event scoping, register position, reserved migration number — declared in the spec, or
  presumed unmet. **None may be deferred to a later polish pass.**
- **Out of product scope**: organizer administration, payment processing. **Engagement**
  notification delivery and calendar integration stay out until a recorded decision brings them in
  — their interfaces exist but must not be wired to real delivery, and **the notification bell must
  not be reproduced**.
- Loading and failure states are required wherever data crosses the network.
- Every interactive control has an accessible label, a visible focus state, and keyboard support.
  Modals need a clear close action and Escape handling.
- **Responsive**: desktop = persistent left rail, contextual top bar, multi-column dashboard;
  tablet = reduced rail, two-column cards, stacked detail; mobile = compact header, bottom
  navigation, single-column cards, full-width overlays, touch-sized controls. **No content or
  primary action may require horizontal scrolling.**
- **Required empty/error states**: no attendee search results (message + reset-filter action), no
  saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting
  slots (explanation + close), invalid empty message or meeting topic (**disabled confirmation**,
  never a post-submit error).
- **Visual direction**: editorial conference aesthetic — deep navy surfaces, warm coral accents,
  soft cream backgrounds, white content cards, subtle mint status cues. Confident contemporary
  typography, restrained rounded corners, purposeful shadows. Must not read as a generic enterprise
  dashboard; people, sessions and time are the strongest visual elements.
- **Whole-product validation checklist**, satisfied incrementally: production build, desktop and
  mobile rendering, navigation and event switching, search/filter, session save + notes + Q&A,
  message composition, card-sharing feedback, meeting scheduling, keyboard focus visibility and
  accessible labels. Each feature states which items it discharges.

### Reading `requirements.md`: WHAT binds, HOW does not

| **WHAT — binding** | **HOW — superseded** |
|---|---|
| Actors, capabilities, five destinations, workflows | "single-route, front-end product demo" |
| Domain terminology and visual direction | "without external services, authentication, or durable storage" |
| Accessibility and responsive obligations | "data live in focused in-file constants" |
| Required empty and error states | "No network request is required" |
| The core journey and success criteria | "Browser reloads reset state, which is acceptable" |
| Product exclusions (organizer admin, payments) | "Not included: persistent databases, real authentication" |

### Technology stack

- **Client**: React + TypeScript as an installable PWA — manifest, icons, offline shell, versioned
  caching, explicit online/offline states. Offline behaviour is specified **per feature**.
  Optimistic updates and conflict resolution each require a recorded decision.
- **Backend**: project-owned API over **PostgreSQL**; the contract belongs to this project, not a
  vendor. Chosen over a managed BaaS for portability and contract control; the operational cost is
  accepted.
- **Authentication**: real, server-side session establishment and validation. Self-owned versus
  delegated is undecided.
- **Abstraction layers, both mandatory.** Device capabilities — `NotificationService`,
  `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`,
  `ConnectivityService` — plus `StorageService`. Data access — repository interfaces in domain
  terms. Application code calls neither browser APIs nor the network directly.
- **Linux-based CI**, no Apple infrastructure: typecheck, lint, unit, component, contract,
  migration verification, integration against a real database, accessibility, e2e, production
  build. All ten correctness gates run, against per-job `postgres:17` service containers.
- **Add Capacitor only when** App Store distribution becomes mandatory, a required capability is
  inadequate on the web platform, or field testing shows PWA installation materially harms
  adoption. Then Codemagic/Bitrise, TestFlight, Play internal testing.
- **Test on at least one physical iPhone before production.**
- Ranked alternatives if the stack is revisited: React + Capacitor → React Native + Expo → Flutter
  → .NET MAUI (only for a strongly C#/.NET team). Xamarin and Unity are not recommended.

### Role of the prototype

`GroundZero/prototype/` is an **approved visual and interaction reference, not production code.**
It is a Figma Make export: one 1,400-line `App.tsx`, all state in root `useState`, hardcoded hex
colors, hand-inlined SVG icons, an unused shadcn scaffold, and a dependency list the app does not
use. Its architecture and code quality carry **no authority** and should not be preserved.

Use it for: interaction flows, screen composition, copy, sample data shape, visual language.

Two things it gets wrong that are **settled requirements, not open questions**: it implements
neither Escape handling nor visible focus states (Principle IV settles this — a defect to fix), and
it hardcodes a persona and date ("Good morning, Sarah", "Tuesday, March 18") that real auth and
real data replace.

## Open questions

**Do not silently resolve any of these.** The authoritative register is in the constitution; this
is a working summary. Each names what it blocks, because *when* to ask matters as much as what.

### Require a client decision

- **The connection model behind Network contacts.** The prototype derives contacts from the
  existence of a conversation. There is no connect or accept action, so no relationship to store.
  **Blocks Network entirely.**
- **Exchanged digital cards.** The prototype shows a transient confirmation and records nothing.
  What an exchange creates, and whether it is mutual, is undefined. **Blocks Network entirely.**
- **Audience-question attribution** — attributed or anonymous. Decides whether Q&A is a
  personal-data surface under Principle VIII. **Blocks Q&A (009).**
- **Desktop and tablet layouts are unvalidated.** The approved prototype is mobile-only — a fixed
  390×844 frame. Every desktop layout built before this is answered is unreviewed design, so the
  cost compounds with each feature.
- **Real brand mark and application icons.** None exist here. Long lead time; blocks release
  readiness rather than any single feature.
- **Notifications.** The prototype header shows a bell with an unread dot, but engagement
  notifications are out of scope. Does not cover transactional account mail, which is in scope.
- **Whether `requirements.md` is amended** or its divergence from the constitution simply recorded.
- **What "PS" denotes** in `mynet-ps`.

### Require an owner or planning decision

- **No domain is registered and no Azure subscription is named**, so nothing has been deployed.
  Caddy cannot obtain a certificate without a resolving A record. `deploy-uat` and `deploy-prod`
  exist and are wired, but **print what they are blocked on and exit 0** rather than failing every
  merge. `deploy/vm/OPERATIONS-LOG.md` records the restore that *has* been exercised — locally,
  against a throwaway container — and the half that cannot yet be. **Blocks production readiness.**
- **UAT access control.** UAT is publicly reachable, permanent, and carries realistically-shaped
  attendee data. The data-separation half is settled and binding (FR-067: the tooling must *refuse*
  to point UAT at production data, not merely be configured not to). Who may reach it is not.
- **Authentication ownership** — self-implemented versus a delegated provider.
- **The transactional email provider.** v2.3.0 settled that account mail is sent, not by whom.
  Brings one external dependency and one secret.
- **Nobody moderates uploaded avatar images.** Public self sign-up plus image upload, in a product
  with no administrative actor by construction — and the organizer exclusion forecloses the usual
  answer. Cheapest to settle before the first publicly reachable environment.
- **Server-side branch protection is unconfigured** — a configuration task, not a limitation. The
  protection endpoints return **404 (no rule set)**, and protection is free on public repositories.
  Enforcement is meanwhile client-side and bypassable, which is material now that real attendee
  data is in scope.
- **The repository is public**, and this went unrecorded until 2026-08-07. It changes the Principle
  VIII threat model: seed data, migrations, workflow config and the API contract are world-readable.

### Known unclaimed defects

`specs/004-attendee-identity-and-profile/review-findings.md` records 37 findings — 21 fixed, ten
Minor deliberately left open with stated reasons. **Two are real and unclaimed**: neither token
table has an index on `attendee_id` (Postgres does not create one for a foreign key, so every
account deletion cascade-scans both), and migration `0003` rewrites `events` under a volatile
default with no `lock_timeout`. Both need **deliberate** work, because the fix requires regenerating
the Drizzle snapshot — exactly what the migration README warns against doing casually.
